import { Router, Response } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import { auth, requirePerm, AuthedRequest } from '../middleware/common.js';
import { User, Wallet, Ledger, Session } from '../models/core.js';
import { Transaction, AuditLog, SupportTicket, Commission, Setting, PaymentTx } from '../models/ops.js';
import { Provider, Service } from '../models/catalog.js';
import { audit } from '../services/audit.js';
import { ROLES, ROLE_PERMISSIONS } from '../lib/rbac.js';

const router = Router();

// ---- Overview ----
router.get('/admin/overview', auth, requirePerm('reports.read'), async (_req, res) => {
  const startDay = new Date(); startDay.setHours(0, 0, 0, 0);
  const startMonth = new Date(); startMonth.setDate(1); startMonth.setHours(0, 0, 0, 0);
  const [
    totalUsers, activeUsers, txTotal, txSuccess, txFailed, txPending,
    dayAgg, monthAgg, providerBalances, walletLiability,
  ] = await Promise.all([
    User.countDocuments({}),
    User.countDocuments({ status: 'active' }),
    Transaction.countDocuments({}),
    Transaction.countDocuments({ status: 'successful' }),
    Transaction.countDocuments({ status: { $in: ['failed', 'refund_pending'] } }),
    Transaction.countDocuments({ status: { $in: ['created', 'pending', 'processing'] } }),
    Transaction.aggregate([
      { $match: { createdAt: { $gte: startDay }, status: 'successful' } },
      { $group: { _id: null, revenue: { $sum: '$amountKobo' }, cost: { $sum: '$providerCostKobo' }, profit: { $sum: '$profitKobo' } } },
    ]),
    Transaction.aggregate([
      { $match: { createdAt: { $gte: startMonth }, status: 'successful' } },
      { $group: { _id: null, revenue: { $sum: '$amountKobo' }, cost: { $sum: '$providerCostKobo' }, profit: { $sum: '$profitKobo' } } },
    ]),
    Provider.find({}).select('code name balanceKobo lowBalanceKobo status').lean(),
    Wallet.aggregate([{ $group: { _id: null, total: { $sum: '$balanceKobo' } } }]),
  ]);
  const byService = await Transaction.aggregate([
    { $match: { status: 'successful' } },
    { $group: { _id: '$serviceSlug', count: { $sum: 1 }, revenue: { $sum: '$amountKobo' } } },
    { $sort: { count: -1 } },
    { $limit: 10 },
  ]);
  const revenueSeries = await Transaction.aggregate([
    { $match: { createdAt: { $gte: new Date(Date.now() - 14 * 86400 * 1000) }, status: 'successful' } },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, revenue: { $sum: '$amountKobo' }, profit: { $sum: '$profitKobo' }, count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
  return res.json({
    success: true,
    data: {
      users: { total: totalUsers, active: activeUsers },
      transactions: { total: txTotal, successful: txSuccess, failed: txFailed, pending: txPending },
      today: dayAgg[0] ?? { revenue: 0, cost: 0, profit: 0 },
      month: monthAgg[0] ?? { revenue: 0, cost: 0, profit: 0 },
      providerBalances,
      walletLiabilityKobo: walletLiability[0]?.total ?? 0,
      byService,
      revenueSeries,
    },
  });
});

// ---- Users ----
router.get('/admin/users', auth, requirePerm('users.read'), async (req, res) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)));
  const filter: Record<string, any> = {};
  if (req.query.q) {
    const q = String(req.query.q);
    filter.$or = [{ email: { $regex: q, $options: 'i' } }, { username: { $regex: q, $options: 'i' } }, { phone: { $regex: q, $options: 'i' } }];
  }
  if (req.query.role) filter.role = req.query.role;
  if (req.query.status) filter.status = req.query.status;
  const [items, total] = await Promise.all([
    User.find(filter).select('-passwordHash -pinHash').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    User.countDocuments(filter),
  ]);
  // Optional per-customer aggregates (?stats=1): wallet + verification counts
  // + lifetime spend. Batched aggregations — no N+1.
  let data: any[] = items;
  if (String(req.query.stats ?? '') === '1' && items.length > 0) {
    const ids = items.map((u: any) => u._id);
    const [wallets, txAgg] = await Promise.all([
      Wallet.find({ userId: { $in: ids } }).select('userId balanceKobo').lean(),
      Transaction.aggregate([
        { $match: { userId: { $in: ids } } },
        {
          $group: {
            _id: '$userId',
            txCount: { $sum: 1 },
            spentKobo: { $sum: { $cond: [{ $eq: ['$status', 'successful'] }, '$amountKobo', 0] } },
          },
        },
      ]),
    ]);
    const wBy: Record<string, number> = {};
    for (const w of wallets as any[]) wBy[String(w.userId)] = w.balanceKobo;
    const tBy: Record<string, any> = {};
    for (const r of txAgg as any[]) tBy[String(r._id)] = r;
    data = items.map((u: any) => ({
      ...u,
      walletBalanceKobo: wBy[String(u._id)] ?? 0,
      txCount: tBy[String(u._id)]?.txCount ?? 0,
      totalSpentKobo: tBy[String(u._id)]?.spentKobo ?? 0,
    }));
  }
  return res.json({ success: true, data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

router.get('/admin/users/:id', auth, requirePerm('users.read'), async (req, res) => {
  const u: any = await User.findById(req.params.id).select('-passwordHash -pinHash').lean();
  if (!u) return res.status(404).json({ success: false, message: 'Not found', code: 'NOT_FOUND' });
  const [wallet, txs, statusAgg, fundingAgg, lastSession] = await Promise.all([
    Wallet.findOne({ userId: u._id }).lean(),
    Transaction.find({ userId: u._id }).sort({ createdAt: -1 }).limit(20).lean(),
    Transaction.aggregate([
      { $match: { userId: u._id } },
      {
        $group: {
          _id: '$status',
          n: { $sum: 1 },
          spent: { $sum: { $cond: [{ $eq: ['$status', 'successful'] }, '$amountKobo', 0] } },
        },
      },
    ]),
    PaymentTx.aggregate([
      { $match: { userId: u._id, status: 'paid' } },
      { $group: { _id: null, total: { $sum: '$amountKobo' }, count: { $sum: 1 } } },
    ]),
    Session.findOne({ userId: u._id }).sort({ createdAt: -1 }).select('createdAt ip').lean(),
  ]);
  const byStatus: Record<string, { n: number; spent: number }> = {};
  let txTotal = 0;
  let totalSpentKobo = 0;
  for (const r of statusAgg as any[]) {
    byStatus[r._id] = { n: r.n, spent: r.spent };
    txTotal += r.n;
    totalSpentKobo += r.spent;
  }
  const stats = {
    txTotal,
    successful: byStatus.successful?.n ?? 0,
    failed: byStatus.failed?.n ?? 0,
    refunded: byStatus.refunded?.n ?? 0,
    pending: (byStatus.processing?.n ?? 0) + (byStatus.pending?.n ?? 0) + (byStatus.created?.n ?? 0),
    totalSpentKobo,
    totalFundedKobo: (fundingAgg as any[])[0]?.total ?? 0,
    fundingCount: (fundingAgg as any[])[0]?.count ?? 0,
    lastLoginAt: (lastSession as any)?.createdAt ?? null,
    lastLoginIp: (lastSession as any)?.ip ?? null,
  };
  return res.json({ success: true, data: { user: u, wallet, transactions: txs, stats } });
});

router.patch('/admin/users/:id', auth, requirePerm('users.update'), async (req: AuthedRequest, res: Response) => {
  const schema = z.object({ firstName: z.string().min(1).max(60).optional(), lastName: z.string().min(1).max(60).optional(), role: z.enum(ROLES as any).optional(), status: z.enum(['active', 'suspended', 'pending']).optional() });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ success: false, message: 'Validation failed', code: 'VALIDATION_ERROR' });
  const u: any = await User.findById(req.params.id);
  if (!u) return res.status(404).json({ success: false, message: 'Not found', code: 'NOT_FOUND' });
  if (u.role === 'super_admin' && req.user!.role !== 'super_admin') {
    return res.status(403).json({ success: false, message: 'Only super admins can modify super admins', code: 'FORBIDDEN' });
  }
  const before = { role: u.role, status: u.status };
  Object.assign(u, p.data);
  await u.save();
  await audit({ actorId: req.user!.id, actorEmail: req.user!.email, action: 'user.update', entity: 'user', entityId: String(u._id), before, after: p.data, ip: req.ip });
  return res.json({ success: true, data: { id: u._id, role: u.role, status: u.status } });
});

// ---- Reports (revenue vs funding strictly separated) ----
router.get('/admin/reports/summary', auth, requirePerm('reports.read'), async (req, res) => {
  const { from, to } = req.query as Record<string, string>;
  const match: Record<string, any> = { status: 'successful' };
  if (from || to) {
    match.createdAt = {};
    if (from) match.createdAt.$gte = new Date(from);
    if (to) match.createdAt.$lte = new Date(to);
  }
  const [sales, funding, refunds] = await Promise.all([
    Transaction.aggregate([
      { $match: match },
      { $group: { _id: null, revenue: { $sum: '$amountKobo' }, providerCost: { $sum: '$providerCostKobo' }, profit: { $sum: '$profitKobo' }, count: { $sum: 1 } } },
    ]),
    PaymentTx.aggregate([
      { $match: { status: 'paid', ...(from || to ? { createdAt: match.createdAt } : {}) } },
      { $group: { _id: null, total: { $sum: '$amountKobo' }, count: { $sum: 1 } } },
    ]),
    Transaction.aggregate([
      { $match: { status: 'refunded', ...(from || to ? { createdAt: match.createdAt } : {}) } },
      { $group: { _id: null, total: { $sum: '$amountKobo' }, count: { $sum: 1 } } },
    ]),
  ]);
  return res.json({
    success: true,
    data: {
      sales: sales[0] ?? { revenue: 0, providerCost: 0, profit: 0, count: 0 },
      walletFunding: funding[0] ?? { total: 0, count: 0 },
      refunds: refunds[0] ?? { total: 0, count: 0 },
      note: 'Wallet funding is a liability movement, NOT revenue. Revenue = successful verification sales only.',
    },
  });
});

router.get('/admin/reports/export', auth, requirePerm('reports.read'), async (req, res) => {
  const { from, to, status } = req.query as Record<string, string>;
  const filter: Record<string, any> = {};
  if (status) filter.status = status;
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(to);
  }
  const txs = await Transaction.find(filter).sort({ createdAt: -1 }).limit(5000).lean();
  const header = 'txId,userId,service,status,amountKobo,costKobo,profitKobo,provider,createdAt\n';
  const lines = txs.map((t: any) => [t.txId, t.userId, t.serviceSlug, t.status, t.amountKobo, t.providerCostKobo, t.profitKobo, t.providerCode ?? '', t.createdAt?.toISOString()].join(','));
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="transactions-report.csv"');
  return res.send(header + lines.join('\n'));
});

// ---- Audit ----
router.get('/admin/audit', auth, requirePerm('audit.read'), async (req, res) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 30)));
  const [items, total] = await Promise.all([
    AuditLog.find({}).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    AuditLog.countDocuments({}),
  ]);
  return res.json({ success: true, data: items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

// ---- Settings ----
router.get('/admin/settings', auth, requirePerm('settings.manage'), async (_req, res) => {
  const all = await Setting.find({}).lean();
  return res.json({ success: true, data: all });
});

router.put('/admin/settings/:key', auth, requirePerm('settings.manage'), async (req: AuthedRequest, res: Response) => {
  const s = await Setting.findOneAndUpdate({ key: req.params.key }, { $set: { value: req.body?.value ?? {} } }, { upsert: true, new: true });
  await audit({ actorId: req.user!.id, actorEmail: req.user!.email, action: 'settings.update', entity: 'setting', entityId: req.params.key, after: s.value as any, ip: req.ip });
  return res.json({ success: true, data: s });
});

// ---- Service performance (per-service totals for Services/Pricing/Analytics) ----
router.get('/admin/services/performance', auth, requirePerm('reports.read'), async (_req, res) => {
  const rows: any[] = await Transaction.aggregate([
    {
      $group: {
        _id: { service: '$serviceSlug', status: '$status' },
        n: { $sum: 1 },
        revenue: { $sum: '$amountKobo' },
        cost: { $sum: '$providerCostKobo' },
        profit: { $sum: '$profitKobo' },
      },
    },
  ]);
  const byService: Record<string, any> = {};
  for (const r of rows) {
    const slug = r._id.service;
    byService[slug] = byService[slug] ?? { serviceSlug: slug, total: 0, successful: 0, failed: 0, refunded: 0, pending: 0, revenue: 0, cost: 0, profit: 0 };
    const s = byService[slug];
    s.total += r.n;
    s.revenue += r.revenue;
    s.cost += r.cost;
    s.profit += r.profit;
    if (r._id.status === 'successful') s.successful += r.n;
    else if (r._id.status === 'failed') s.failed += r.n;
    else if (r._id.status === 'refunded') s.refunded += r.n;
    else s.pending += r.n;
  }
  const data = Object.values(byService).map((s: any) => ({
    ...s,
    successRate: s.total === 0 ? null : Math.round((s.successful / s.total) * 1000) / 10,
  }));
  return res.json({ success: true, data });
});

// ---- Roles & permissions matrix (static platform config, read-only) ----
router.get('/admin/roles', auth, requirePerm('users.read'), async (_req, res) => {
  return res.json({ success: true, data: { roles: ROLES, permissions: ROLE_PERMISSIONS } });
});

// ---- Commissions ----
router.get('/admin/commissions', auth, requirePerm('reports.read'), async (req, res) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)));
  const [items, total] = await Promise.all([
    Commission.find({}).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Commission.countDocuments({}),
  ]);
  return res.json({ success: true, data: items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

// ---- Support (admin) ----
router.get('/admin/support', auth, requirePerm('support.manage'), async (req, res) => {
  const filter: Record<string, any> = {};
  if (req.query.status) filter.status = req.query.status;
  const items = await SupportTicket.find(filter).sort({ createdAt: -1 }).limit(100).lean();
  return res.json({ success: true, data: items });
});

router.post('/admin/support/:ticketNo/reply', auth, requirePerm('support.manage'), async (req: AuthedRequest, res: Response) => {
  const t: any = await SupportTicket.findOne({ ticketNo: req.params.ticketNo });
  if (!t) return res.status(404).json({ success: false, message: 'Not found', code: 'NOT_FOUND' });
  t.messages.push({ from: `staff:${req.user!.email}`, body: String(req.body?.message ?? '').slice(0, 5000), at: new Date() });
  t.status = req.body?.resolve ? 'resolved' : 'pending';
  await t.save();
  await audit({ actorId: req.user!.id, actorEmail: req.user!.email, action: 'support.reply', entity: 'ticket', entityId: t.ticketNo, ip: req.ip });
  return res.json({ success: true, data: t });
});

// ---- API customers overview ----
router.get('/admin/api-logs', auth, requirePerm('api.manage'), async (req, res) => {
  const filter: Record<string, any> = {};
  if (req.query.keyPrefix) filter.keyPrefix = req.query.keyPrefix;
  const logs = await (await import('../models/ops.js')).ApiLog.find(filter).sort({ createdAt: -1 }).limit(100).lean();
  return res.json({ success: true, data: logs });
});

export default router;
