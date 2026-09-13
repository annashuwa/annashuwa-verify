import { Router, Response } from 'express';
import { z } from 'zod';
import { auth, AuthedRequest } from '../middleware/common.js';
import { apiKeyAuth } from '../middleware/apiKey.js';
import { ApiKey, ApiLog, Transaction } from '../models/ops.js';
import { Service } from '../models/catalog.js';
import { newApiKey, sha256 } from '../lib/tokens.js';
import { executeVerification } from '../services/engine.js';
import { priceFor } from '../services/pricing.js';
import { audit } from '../services/audit.js';

const router = Router();

// ---- Customer API key management (session auth) ----
router.get('/api-keys', auth, async (req: AuthedRequest, res: Response) => {
  const keys = await ApiKey.find({ userId: req.user!.id }).select('-secretHash').sort({ createdAt: -1 }).lean();
  return res.json({ success: true, data: keys });
});

router.post('/api-keys', auth, async (req: AuthedRequest, res: Response) => {
  const schema = z.object({ name: z.string().min(2).max(80), expiresAt: z.string().optional(), ipAllowlist: z.array(z.string()).default([]), rateLimitPerMin: z.number().int().min(1).max(1000).default(60) });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ success: false, message: 'Validation failed', code: 'VALIDATION_ERROR' });
  const { prefix, secret, display } = newApiKey();
  const key = await ApiKey.create({
    userId: req.user!.id,
    name: p.data.name,
    prefix,
    secretHash: sha256(secret),
    permissions: ['verify'],
    expiresAt: p.data.expiresAt ? new Date(p.data.expiresAt) : undefined,
    ipAllowlist: p.data.ipAllowlist,
    rateLimitPerMin: p.data.rateLimitPerMin,
  });
  await audit({ actorId: req.user!.id, actorEmail: req.user!.email, action: 'api.key_create', entity: 'api_key', entityId: prefix, ip: req.ip });
  // Secret shown ONCE
  return res.status(201).json({ success: true, message: 'Store this secret now — it will never be shown again.', data: { prefix, apiKey: display, id: key._id } });
});

router.patch('/api-keys/:id', auth, async (req: AuthedRequest, res: Response) => {
  const schema = z.object({
    name: z.string().min(2).max(80).optional(),
    webhookUrl: z.string().max(500).nullable().optional(),
    webhookSecret: z.string().max(200).nullable().optional(),
    rateLimitPerMin: z.number().int().min(1).max(1000).optional(),
    ipAllowlist: z.array(z.string()).optional(),
  });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ success: false, message: 'Validation failed', code: 'VALIDATION_ERROR' });
  const key: any = await ApiKey.findOne({ _id: req.params.id, userId: req.user!.id });
  if (!key) return res.status(404).json({ success: false, message: 'Not found', code: 'NOT_FOUND' });
  if (p.data.webhookUrl !== undefined && p.data.webhookUrl) {
    try {
      const u = new URL(p.data.webhookUrl);
      if (!['http:', 'https:'].includes(u.protocol)) throw new Error('bad protocol');
      if (u.hostname === 'localhost' && process.env.NODE_ENV === 'production') {
        return res.status(400).json({ success: false, message: 'Localhost webhooks not allowed in production', code: 'VALIDATION_ERROR' });
      }
    } catch {
      return res.status(400).json({ success: false, message: 'Invalid webhook URL', code: 'VALIDATION_ERROR' });
    }
  }
  for (const [k, v] of Object.entries(p.data)) {
    if (v !== undefined) key[k] = v;
  }
  await key.save();
  await audit({ actorId: req.user!.id, actorEmail: req.user!.email, action: 'api.key_update', entity: 'api_key', entityId: key.prefix, ip: req.ip });
  const { secretHash: _s, ...safe } = key.toObject();
  return res.json({ success: true, data: safe });
});

router.post('/api-keys/:id/revoke', auth, async (req: AuthedRequest, res: Response) => {
  const key: any = await ApiKey.findOne({ _id: req.params.id, userId: req.user!.id });
  if (!key) return res.status(404).json({ success: false, message: 'Not found', code: 'NOT_FOUND' });
  key.status = 'revoked';
  await key.save();
  await audit({ actorId: req.user!.id, actorEmail: req.user!.email, action: 'api.key_revoke', entity: 'api_key', entityId: key.prefix, ip: req.ip });
  return res.json({ success: true, message: 'API key revoked' });
});

router.post('/api-keys/:id/rotate', auth, async (req: AuthedRequest, res: Response) => {
  const key: any = await ApiKey.findOne({ _id: req.params.id, userId: req.user!.id });
  if (!key) return res.status(404).json({ success: false, message: 'Not found', code: 'NOT_FOUND' });
  key.status = 'revoked';
  await key.save();
  const { prefix, secret, display } = newApiKey();
  const next = await ApiKey.create({
    userId: req.user!.id, name: `${key.name} (rotated)`, prefix, secretHash: sha256(secret),
    permissions: key.permissions, ipAllowlist: key.ipAllowlist, rateLimitPerMin: key.rateLimitPerMin,
  });
  await audit({ actorId: req.user!.id, actorEmail: req.user!.email, action: 'api.key_rotate', entity: 'api_key', entityId: prefix, ip: req.ip });
  return res.status(201).json({ success: true, data: { prefix, apiKey: display, id: next._id } });
});

router.get('/api-usage', auth, async (req: AuthedRequest, res: Response) => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const [today, success, failed] = await Promise.all([
    Transaction.countDocuments({ userId: req.user!.id, channel: 'api', createdAt: { $gte: start } }),
    Transaction.countDocuments({ userId: req.user!.id, channel: 'api', status: 'successful' }),
    Transaction.countDocuments({ userId: req.user!.id, channel: 'api', status: { $in: ['failed', 'refunded'] } }),
  ]);
  const logs = await ApiLog.find({ userId: req.user!.id }).sort({ createdAt: -1 }).limit(50).lean();
  return res.json({ success: true, data: { today, success, failed, logs } });
});

// ---- External versioned API (API-key auth) ----
const v1 = Router();

v1.get('/services', apiKeyAuth, async (req: AuthedRequest, res: Response) => {
  const services = await Service.find({ status: 'active', apiEnabled: true }).lean();
  const data = services.map((s: any) => ({
    slug: s.slug, name: s.name, category: s.category, description: s.description,
    fields: s.fields, priceKobo: priceFor(s, req.user!.role, 'api'),
  }));
  return res.json({ success: true, data });
});

// Simple per-key in-memory rate limiter (per-minute). Production: use Redis.
const buckets = new Map<string, { count: number; reset: number }>();
async function v1RateLimit(req: AuthedRequest, res: Response, next: Function) {
  const key: any = (req as any).apiKey;
  const limit = key?.rateLimitPerMin ?? 60;
  const now = Date.now();
  const b = buckets.get(key.prefix);
  if (!b || b.reset < now) {
    buckets.set(key.prefix, { count: 1, reset: now + 60000 });
    return next();
  }
  b.count += 1;
  if (b.count > limit) return res.status(429).json({ success: false, message: 'Rate limit exceeded', code: 'RATE_LIMITED' });
  return next();
}

v1.post('/verify/:slug', apiKeyAuth, async (req: AuthedRequest, res: Response) => {
  const t0 = (req as any).apiStart ?? Date.now();
  const finish = async (status: number) => {
    try {
      await ApiLog.create({ userId: req.user!.id, keyPrefix: (req as any).apiKey.prefix, method: 'POST', path: `/api/v1/verify/${req.params.slug}`, status, latencyMs: Date.now() - t0, ip: req.ip });
    } catch { /* ignore */ }
  };
  // rate limit inline (needs key loaded)
  const key: any = (req as any).apiKey;
  const limit = key?.rateLimitPerMin ?? 60;
  const now = Date.now();
  const b = buckets.get(key.prefix);
  if (!b || b.reset < now) buckets.set(key.prefix, { count: 1, reset: now + 60000 });
  else {
    b.count += 1;
    if (b.count > limit) {
      await finish(429);
      return res.status(429).json({ success: false, message: 'Rate limit exceeded', code: 'RATE_LIMITED' });
    }
  }
  try {
    const idem = (req.headers['idempotency-key'] as string) || undefined;
    const { transaction, duplicate } = await executeVerification({
      userId: req.user!.id,
      role: req.user!.role,
      serviceSlug: req.params.slug,
      payload: req.body ?? {},
      channel: 'api',
      idempotencyKey: idem,
      ip: req.ip,
    });
    await finish(duplicate ? 200 : 201);
    return res.status(duplicate ? 200 : 201).json({ success: true, duplicate, data: transaction });
  } catch (e: any) {
    const status = e.status || 500;
    await finish(status);
    return res.status(status).json({ success: false, message: e.message, code: e.code || 'EXECUTION_FAILED' });
  }
});
void v1RateLimit;

router.use('/v1', v1);

export default router;
