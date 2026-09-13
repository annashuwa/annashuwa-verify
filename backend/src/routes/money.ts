import { Router, Response } from 'express';
import { z } from 'zod';
import { auth, requirePerm, AuthedRequest } from '../middleware/common.js';
import { getOrCreateWallet, creditWallet, debitWallet } from '../services/wallet.js';
import { Ledger } from '../models/core.js';
import { Transaction, PaymentTx } from '../models/ops.js';
import { executeVerification, refundTransaction } from '../services/engine.js';
import { paymentProvider } from '../services/payments.js';
import { notify } from '../services/notify.js';
import { audit } from '../services/audit.js';
import { assertPositiveInt } from '../lib/money.js';
import { User } from '../models/core.js';

const router = Router();

// ---- Wallet ----
router.get('/wallet', auth, async (req: AuthedRequest, res: Response) => {
  const w: any = await getOrCreateWallet(req.user!.id);
  return res.json({ success: true, data: { balanceKobo: w.balanceKobo, pendingKobo: w.pendingKobo } });
});

router.get('/wallet/ledger', auth, async (req: AuthedRequest, res: Response) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)));
  const filter: Record<string, any> = { userId: req.user!.id };
  if (req.query.type) filter.type = req.query.type;
  const [items, total] = await Promise.all([
    Ledger.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Ledger.countDocuments(filter),
  ]);
  return res.json({ success: true, data: items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

// ---- Fund wallet (mock gateway abstraction) ----
router.post('/wallet/fund/initiate', auth, async (req: AuthedRequest, res: Response) => {
  const schema = z.object({ amountKobo: z.number().int().min(10000, 'Minimum funding is ₦100') });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ success: false, message: 'Validation failed', code: 'VALIDATION_ERROR' });
  assertPositiveInt(p.data.amountKobo, 'amountKobo');
  const intent = await paymentProvider.initiate(req.user!.id, p.data.amountKobo);
  await PaymentTx.create({ reference: intent.reference, userId: req.user!.id, amountKobo: p.data.amountKobo, status: 'pending', provider: paymentProvider.name });
  return res.status(201).json({ success: true, data: intent });
});

router.post('/wallet/fund/verify', auth, async (req: AuthedRequest, res: Response) => {
  const { reference } = req.body ?? {};
  if (!reference) return res.status(400).json({ success: false, message: 'Reference required', code: 'VALIDATION_ERROR' });
  const pay: any = await PaymentTx.findOne({ reference, userId: req.user!.id });
  if (!pay) return res.status(404).json({ success: false, message: 'Payment not found', code: 'NOT_FOUND' });
  if (pay.credited) return res.json({ success: true, message: 'Already credited', data: pay });
  const r = await paymentProvider.verify(reference);
  if (!r.paid) {
    pay.status = 'failed';
    await pay.save();
    return res.status(402).json({ success: false, message: 'Payment not confirmed', code: 'PAYMENT_UNCONFIRMED' });
  }
  pay.status = 'paid';
  pay.credited = true;
  await pay.save();
  await creditWallet(req.user!.id, pay.amountKobo, `Wallet funding — ${reference}`, 'funding', { reference });
  await notify(req.user!.id, 'wallet_funding', 'Wallet funded', `${pay.amountKobo / 100} NGN added to your wallet.`);
  return res.json({ success: true, message: 'Wallet credited', data: pay });
});

// Idempotent webhook (gateway -> platform). Mock accepts internal calls; real gateways verify signature.
router.post('/webhooks/payment', async (req, res) => {
  const { reference } = req.body ?? {};
  if (!reference) return res.status(400).json({ success: false, message: 'Reference required', code: 'VALIDATION_ERROR' });
  const pay: any = await PaymentTx.findOne({ reference });
  if (!pay) return res.status(404).json({ success: false, message: 'Unknown reference', code: 'NOT_FOUND' });
  if (pay.credited) return res.json({ success: true, message: 'Already processed', data: { reference } });
  const r = await paymentProvider.verify(reference);
  if (!r.paid) return res.json({ success: true, message: 'Not paid yet' });
  pay.status = 'paid';
  pay.credited = true;
  await pay.save();
  await creditWallet(String(pay.userId), pay.amountKobo, `Wallet funding — ${reference}`, 'funding', { reference, webhook: true });
  await notify(String(pay.userId), 'wallet_funding', 'Wallet funded', `${pay.amountKobo / 100} NGN added to your wallet.`);
  return res.json({ success: true, data: { reference, status: 'paid' } });
});

// ---- Verification execution (web channel) ----
router.post('/verify/:slug', auth, async (req: AuthedRequest, res: Response) => {
  try {
    const idem = (req.headers['idempotency-key'] as string) || (req.body?._idempotencyKey as string) || undefined;
    const { transaction, duplicate } = await executeVerification({
      userId: req.user!.id,
      role: req.user!.role,
      serviceSlug: req.params.slug,
      payload: req.body ?? {},
      channel: 'web',
      idempotencyKey: idem,
      ip: req.ip,
    });
    return res.status(duplicate ? 200 : 201).json({ success: true, duplicate, data: transaction });
  } catch (e: any) {
    const status = e.status || 500;
    return res.status(status).json({ success: false, message: e.message, code: e.code || 'EXECUTION_FAILED', requestId: (req as any).requestId });
  }
});

// ---- Transactions ----
router.get('/transactions', auth, async (req: AuthedRequest, res: Response) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)));
  const filter: Record<string, any> = { userId: req.user!.id };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.service) filter.serviceSlug = req.query.service;
  const [items, total] = await Promise.all([
    Transaction.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Transaction.countDocuments(filter),
  ]);
  return res.json({ success: true, data: items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

router.get('/transactions/:txId', auth, async (req: AuthedRequest, res: Response) => {
  const tx = await Transaction.findOne({ txId: req.params.txId, userId: req.user!.id }).lean();
  if (!tx) return res.status(404).json({ success: false, message: 'Not found', code: 'NOT_FOUND' });
  return res.json({ success: true, data: tx });
});

router.get('/dashboard/summary', auth, async (req: AuthedRequest, res: Response) => {
  const userId = req.user!.id;
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const [wallet, recent, todaySpend] = await Promise.all([
    getOrCreateWallet(userId),
    Transaction.find({ userId }).sort({ createdAt: -1 }).limit(5).lean(),
    Transaction.aggregate([
      { $match: { userId: (await import('mongoose')).Types.ObjectId.createFromHexString(userId), createdAt: { $gte: startOfDay } } },
      { $group: { _id: null, total: { $sum: '$amountKobo' } } },
    ]),
  ]);
  const byStatus = await Transaction.aggregate([
    { $match: { userId: (await import('mongoose')).Types.ObjectId.createFromHexString(userId) } },
    { $group: { _id: '$status', n: { $sum: 1 } } },
  ]);
  const statusCounts: Record<string, number> = {};
  for (const r of byStatus) statusCounts[r._id] = r.n;
  return res.json({
    success: true,
    data: {
      wallet: { balanceKobo: (wallet as any).balanceKobo },
      todaySpendKobo: todaySpend[0]?.total ?? 0,
      statusCounts,
      recent,
    },
  });
});

// ---- Admin finance ----
router.post('/admin/wallet/credit', auth, requirePerm('wallet.credit'), async (req: AuthedRequest, res: Response) => {
  const schema = z.object({ userId: z.string().min(1), amountKobo: z.number().int().min(1), reason: z.string().min(3).max(300) });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ success: false, message: 'Validation failed', code: 'VALIDATION_ERROR' });
  const target: any = await User.findById(p.data.userId);
  if (!target) return res.status(404).json({ success: false, message: 'User not found', code: 'NOT_FOUND' });
  await creditWallet(target._id, p.data.amountKobo, `Manual credit by ${req.user!.email}: ${p.data.reason}`, 'manual_credit', { by: req.user!.id });
  await audit({ actorId: req.user!.id, actorEmail: req.user!.email, action: 'wallet.manual_credit', entity: 'user', entityId: String(target._id), after: { amountKobo: p.data.amountKobo, reason: p.data.reason }, ip: req.ip });
  return res.json({ success: true, message: 'Wallet credited' });
});

router.post('/admin/wallet/debit', auth, requirePerm('wallet.debit'), async (req: AuthedRequest, res: Response) => {
  const schema = z.object({ userId: z.string().min(1), amountKobo: z.number().int().min(1), reason: z.string().min(3).max(300) });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ success: false, message: 'Validation failed', code: 'VALIDATION_ERROR' });
  const target: any = await User.findById(p.data.userId);
  if (!target) return res.status(404).json({ success: false, message: 'User not found', code: 'NOT_FOUND' });
  try {
    await debitWallet(target._id, p.data.amountKobo, `Manual debit by ${req.user!.email}: ${p.data.reason}`, { by: req.user!.id });
  } catch (e: any) {
    return res.status(e.status || 500).json({ success: false, message: e.message, code: e.code });
  }
  await audit({ actorId: req.user!.id, actorEmail: req.user!.email, action: 'wallet.manual_debit', entity: 'user', entityId: String(target._id), after: { amountKobo: p.data.amountKobo, reason: p.data.reason }, ip: req.ip });
  return res.json({ success: true, message: 'Wallet debited' });
});

router.post('/admin/transactions/:txId/refund', auth, requirePerm('transactions.refund'), async (req: AuthedRequest, res: Response) => {
  try {
    const tx = await refundTransaction(req.params.txId, req.user!.email, String(req.body?.reason ?? 'admin refund'));
    await audit({ actorId: req.user!.id, actorEmail: req.user!.email, action: 'transaction.refund', entity: 'transaction', entityId: req.params.txId, after: { reason: req.body?.reason }, ip: req.ip });
    return res.json({ success: true, data: tx });
  } catch (e: any) {
    return res.status(e.status || 500).json({ success: false, message: e.message, code: e.code });
  }
});

router.get('/admin/transactions', auth, requirePerm('transactions.read'), async (req, res) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)));
  const filter: Record<string, any> = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.service) filter.serviceSlug = req.query.service;
  if (req.query.userId) filter.userId = req.query.userId;
  if (req.query.txId) filter.txId = String(req.query.txId);
  const [items, total] = await Promise.all([
    Transaction.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Transaction.countDocuments(filter),
  ]);
  // Attach minimal customer identity (single batched lookup, no N+1).
  const userIds = [...new Set(items.map((t: any) => String(t.userId)))];
  const users = await User.find({ _id: { $in: userIds } }).select('firstName lastName email').lean();
  const byId: Record<string, any> = {};
  for (const u of users as any[]) byId[String(u._id)] = u;
  const data = items.map((t: any) => {
    const u = byId[String(t.userId)];
    return { ...t, user: u ? { id: String(u._id), name: `${u.firstName} ${u.lastName}`, email: u.email } : null };
  });
  return res.json({ success: true, data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

export default router;
