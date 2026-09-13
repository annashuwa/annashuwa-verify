import { Router, Response } from 'express';
import { z } from 'zod';
import { auth, AuthedRequest } from '../middleware/common.js';
import { Notification, SupportTicket, BulkJob, Commission, Setting, Transaction } from '../models/ops.js';
import { User } from '../models/core.js';
import { notify } from '../services/notify.js';
import { executeVerification } from '../services/engine.js';
import { randomToken } from '../lib/tokens.js';

const router = Router();

// ---- Notifications ----
router.get('/notifications', auth, async (req: AuthedRequest, res: Response) => {
  const items = await Notification.find({ userId: req.user!.id }).sort({ createdAt: -1 }).limit(50).lean();
  const unread = await Notification.countDocuments({ userId: req.user!.id, read: false });
  return res.json({ success: true, data: items, unread });
});

router.post('/notifications/:id/read', auth, async (req: AuthedRequest, res: Response) => {
  await Notification.updateOne({ _id: req.params.id, userId: req.user!.id }, { $set: { read: true } });
  return res.json({ success: true });
});

router.post('/notifications/read-all', auth, async (req: AuthedRequest, res: Response) => {
  await Notification.updateMany({ userId: req.user!.id }, { $set: { read: true } });
  return res.json({ success: true });
});

// ---- Referrals ----
router.get('/referrals', auth, async (req: AuthedRequest, res: Response) => {
  const me: any = await User.findById(req.user!.id).lean();
  const referred = await User.find({ referredBy: req.user!.id }).select('firstName lastName createdAt').lean();
  const commissions = await Commission.find({ referrerId: req.user!.id }).sort({ createdAt: -1 }).limit(50).lean();
  const earned = commissions.reduce((s, c: any) => s + c.amountKobo, 0);
  const setting: any = await Setting.findOne({ key: 'referral' }).lean();
  return res.json({
    success: true,
    data: {
      referralCode: me.referralCode,
      referralLink: `/register?ref=${me.referralCode}`,
      referredCount: referred.length,
      referred,
      commissions,
      earnedKobo: earned,
      ratePercent: (setting?.value as any)?.percent ?? 5,
    },
  });
});

// ---- Support ----
router.get('/support', auth, async (req: AuthedRequest, res: Response) => {
  const items = await SupportTicket.find({ userId: req.user!.id }).sort({ createdAt: -1 }).lean();
  return res.json({ success: true, data: items });
});

router.post('/support', auth, async (req: AuthedRequest, res: Response) => {
  const schema = z.object({
    subject: z.string().min(3).max(200),
    message: z.string().min(3).max(5000),
    priority: z.enum(['low', 'normal', 'high']).default('normal'),
    txId: z.string().optional(),
  });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ success: false, message: 'Validation failed', code: 'VALIDATION_ERROR' });
  const ticketNo = `SUP-${Date.now().toString(36).toUpperCase()}-${randomToken(2).toUpperCase()}`;
  const t = await SupportTicket.create({
    ticketNo, userId: req.user!.id, subject: p.data.subject, priority: p.data.priority,
    txId: p.data.txId, messages: [{ from: req.user!.email, body: p.data.message, at: new Date() }],
  });
  return res.status(201).json({ success: true, data: t });
});

router.post('/support/:ticketNo/reply', auth, async (req: AuthedRequest, res: Response) => {
  const { message } = req.body ?? {};
  if (!message || String(message).length < 1) return res.status(400).json({ success: false, message: 'Message required', code: 'VALIDATION_ERROR' });
  const t: any = await SupportTicket.findOne({ ticketNo: req.params.ticketNo, userId: req.user!.id });
  if (!t) return res.status(404).json({ success: false, message: 'Not found', code: 'NOT_FOUND' });
  if (['resolved', 'closed'].includes(t.status)) return res.status(409).json({ success: false, message: 'Ticket is closed', code: 'TICKET_CLOSED' });
  t.messages.push({ from: req.user!.email, body: String(message).slice(0, 5000), at: new Date() });
  t.status = 'pending';
  await t.save();
  return res.json({ success: true, data: t });
});

// ---- Bulk verification ----
router.post('/bulk', auth, async (req: AuthedRequest, res: Response) => {
  const schema = z.object({
    serviceSlug: z.string().min(2),
    rows: z.array(z.record(z.any())).min(1).max(500),
  });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ success: false, message: 'Provide serviceSlug and 1–500 rows', code: 'VALIDATION_ERROR' });
  const jobId = `BULK-${Date.now().toString(36).toUpperCase()}-${randomToken(2).toUpperCase()}`;
  const job: any = await BulkJob.create({
    jobId, userId: req.user!.id, serviceSlug: p.data.serviceSlug, status: 'processing',
    total: p.data.rows.length, done: 0, succeeded: 0, failed: 0,
    rows: p.data.rows.map((r) => ({ input: r, status: 'queued' })),
  });
  // Process asynchronously without blocking the request
  setImmediate(async () => {
    let ok = 0, fail = 0;
    for (let i = 0; i < job.rows.length; i++) {
      const row = job.rows[i];
      try {
        const { transaction } = await executeVerification({
          userId: String(req.user!.id), role: req.user!.role, serviceSlug: p.data.serviceSlug,
          payload: row.input, channel: 'web', ip: req.ip,
          // Deterministic per-row key: retries/resumes can never double-charge.
          idempotencyKey: `bulk-${jobId}-${i}`,
        });
        row.status = (transaction as any).status;
        row.result = (transaction as any).result ?? { status: (transaction as any).status };
        if ((transaction as any).status === 'successful') ok++; else fail++;
      } catch (e: any) {
        row.status = 'failed';
        row.error = e.message;
        fail++;
      }
      job.done += 1;
    }
    job.succeeded = ok;
    job.failed = fail;
    job.status = 'completed';
    await job.save();
    await notify(req.user!.id, 'bulk_complete', 'Bulk job completed', `Job ${jobId}: ${ok} succeeded, ${fail} failed.`);
  });
  return res.status(202).json({ success: true, message: 'Bulk job queued', data: { jobId, total: p.data.rows.length } });
});

router.get('/bulk', auth, async (req: AuthedRequest, res: Response) => {
  const jobs = await BulkJob.find({ userId: req.user!.id }).sort({ createdAt: -1 }).limit(20).lean();
  return res.json({ success: true, data: jobs });
});

router.get('/bulk/:jobId', auth, async (req: AuthedRequest, res: Response) => {
  const job = await BulkJob.findOne({ jobId: req.params.jobId, userId: req.user!.id }).lean();
  if (!job) return res.status(404).json({ success: false, message: 'Not found', code: 'NOT_FOUND' });
  return res.json({ success: true, data: job });
});

router.get('/bulk/:jobId/export', auth, async (req: AuthedRequest, res: Response) => {
  const job: any = await BulkJob.findOne({ jobId: req.params.jobId, userId: req.user!.id }).lean();
  if (!job) return res.status(404).json({ success: false, message: 'Not found', code: 'NOT_FOUND' });
  const header = 'input,status,error\n';
  const lines = job.rows.map((r: any) => `"${JSON.stringify(r.input).replace(/"/g, '""')}","${r.status}","${(r.error ?? '').replace(/"/g, '""')}"`);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${job.jobId}.csv"`);
  return res.send(header + lines.join('\n'));
});

export default router;
