import { Router, Response } from 'express';
import { z } from 'zod';
import { Service, Provider } from '../models/catalog.js';
import { auth, requirePerm, AuthedRequest } from '../middleware/common.js';
import { priceFor } from '../services/pricing.js';
import { audit } from '../services/audit.js';
import { adapterFor, liveAdapterFor } from '../providers/registry.js';

const router = Router();

// Public/customer service list (only active + webEnabled), backend is pricing source of truth
router.get('/services', auth, async (req: AuthedRequest, res: Response) => {
  const { category, q } = req.query as Record<string, string>;
  const filter: Record<string, any> = { status: 'active', webEnabled: true };
  if (category) filter.category = category;
  if (q) filter.name = { $regex: q, $options: 'i' };
  const services = await Service.find(filter).sort({ category: 1, name: 1 }).lean();
  const data = services.map((s: any) => ({
    name: s.name, slug: s.slug, category: s.category, description: s.description,
    fields: s.fields, status: s.status,
    priceKobo: priceFor(s, req.user!.role, 'web'),
  }));
  return res.json({ success: true, data });
});

router.get('/services/:slug', auth, async (req: AuthedRequest, res: Response) => {
  const s: any = await Service.findOne({ slug: req.params.slug }).lean();
  if (!s) return res.status(404).json({ success: false, message: 'Service not found', code: 'SERVICE_NOT_FOUND' });
  // Public shape: never leak providerCostKobo (margin) or internal providers.
  return res.json({
    success: true,
    data: {
      name: s.name, slug: s.slug, category: s.category, description: s.description,
      fields: s.fields, status: s.status, terms: s.terms,
      priceKobo: priceFor(s, req.user!.role, 'web'),
    },
  });
});

// Admin CRUD
const serviceSchema = z.object({
  name: z.string().min(2).max(120),
  slug: z.string().min(2).max(80).regex(/^[a-z0-9-]+$/),
  category: z.enum(['identity', 'business', 'education', 'other']),
  description: z.string().max(2000).default(''),
  fields: z.array(z.object({
    name: z.string().min(1).max(40),
    label: z.string().min(1).max(80),
    type: z.enum(['text', 'number', 'phone', 'date', 'select']).default('text'),
    required: z.boolean().default(true),
    pattern: z.string().max(200).optional(),
    minLength: z.number().int().min(0).max(500).optional(),
    maxLength: z.number().int().min(1).max(500).optional(),
    options: z.array(z.string()).optional(),
  })).default([]),
  priceKobo: z.number().int().min(0),
  resellerPriceKobo: z.number().int().min(0),
  apiPriceKobo: z.number().int().min(0),
  providerCostKobo: z.number().int().min(0),
  status: z.enum(['active', 'inactive', 'maintenance']).default('active'),
  webEnabled: z.boolean().default(true),
  apiEnabled: z.boolean().default(true),
  minRole: z.string().default('customer'),
  providers: z.array(z.string()).default([]),
  terms: z.string().max(5000).optional(),
});

router.get('/admin/services', auth, requirePerm('services.update'), async (_req, res) => {
  const all = await Service.find({}).sort({ updatedAt: -1 }).lean();
  return res.json({ success: true, data: all });
});

router.post('/admin/services', auth, requirePerm('services.create'), async (req: AuthedRequest, res: Response) => {
  const p = serviceSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ success: false, message: 'Validation failed', code: 'VALIDATION_ERROR', errors: p.error.flatten() });
  const exists = await Service.findOne({ slug: p.data.slug });
  if (exists) return res.status(409).json({ success: false, message: 'Slug already exists', code: 'ALREADY_EXISTS' });
  const s = await Service.create(p.data);
  await audit({ actorId: req.user!.id, actorEmail: req.user!.email, action: 'service.create', entity: 'service', entityId: String(s._id), after: p.data, ip: req.ip });
  return res.status(201).json({ success: true, data: s });
});

router.patch('/admin/services/:id', auth, requirePerm('services.update'), async (req: AuthedRequest, res: Response) => {
  const s: any = await Service.findById(req.params.id);
  if (!s) return res.status(404).json({ success: false, message: 'Not found', code: 'NOT_FOUND' });
  const before = s.toObject();
  const partial = serviceSchema.partial().safeParse(req.body);
  if (!partial.success) return res.status(400).json({ success: false, message: 'Validation failed', code: 'VALIDATION_ERROR' });
  Object.assign(s, partial.data);
  await s.save();
  await audit({ actorId: req.user!.id, actorEmail: req.user!.email, action: 'service.update', entity: 'service', entityId: String(s._id), before: { priceKobo: before.priceKobo, status: before.status }, after: { priceKobo: s.priceKobo, status: s.status }, ip: req.ip });
  return res.json({ success: true, data: s });
});

// Providers (admin)
router.get('/admin/providers', auth, requirePerm('providers.manage'), async (_req, res) => {
  const providers = await Provider.find({}).sort({ priority: 1 }).lean();
  const data = providers.map((p: any) => {
    const total = p.successCount + p.failCount;
    // Honest configured flag: real vendors without credentials report their
    // missing vars; explicit mock-* doubles are always operable.
    const real = liveAdapterFor(p.adapter);
    const configured = real ? real.isConfigured() : String(p.adapter || '').startsWith('mock-');
    return {
      ...p,
      successRate: total === 0 ? null : Math.round((p.successCount / total) * 1000) / 10,
      avgResponseMs: total === 0 ? null : Math.round(p.totalResponseMs / total),
      lowBalance: p.balanceKobo <= p.lowBalanceKobo,
      configured,
      requires: real && !real.isConfigured() ? real.requiresConfig() : [],
    };
  });
  return res.json({ success: true, data });
});

router.post('/admin/providers', auth, requirePerm('providers.manage'), async (req: AuthedRequest, res: Response) => {
  const schema = z.object({
    code: z.string().min(2).max(40), name: z.string().min(2).max(120),
    adapter: z.string().min(2).max(60), status: z.enum(['online', 'degraded', 'offline', 'unknown']).default('unknown'),
    priority: z.number().int().min(1).max(1000).default(100),
    supports: z.array(z.string()).default([]),
    balanceKobo: z.number().int().min(0).default(0),
    lowBalanceKobo: z.number().int().min(0).default(0),
    config: z.record(z.any()).default({}),
  });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ success: false, message: 'Validation failed', code: 'VALIDATION_ERROR' });
  const exists = await Provider.findOne({ code: p.data.code });
  if (exists) return res.status(409).json({ success: false, message: 'Provider code exists', code: 'ALREADY_EXISTS' });
  const created = await Provider.create(p.data);
  await audit({ actorId: req.user!.id, actorEmail: req.user!.email, action: 'provider.create', entity: 'provider', entityId: p.data.code, after: p.data, ip: req.ip });
  return res.status(201).json({ success: true, data: created });
});

router.patch('/admin/providers/:code', auth, requirePerm('providers.manage'), async (req: AuthedRequest, res: Response) => {
  const p: any = await Provider.findOne({ code: req.params.code });
  if (!p) return res.status(404).json({ success: false, message: 'Not found', code: 'NOT_FOUND' });
  const before = p.toObject();
  const allowed = ['name', 'adapter', 'status', 'priority', 'supports', 'balanceKobo', 'lowBalanceKobo', 'config'];
  for (const k of allowed) if (req.body[k] !== undefined) p[k] = req.body[k];
  await p.save();
  await audit({ actorId: req.user!.id, actorEmail: req.user!.email, action: 'provider.update', entity: 'provider', entityId: p.code, before: { priority: before.priority, status: before.status }, after: { priority: p.priority, status: p.status }, ip: req.ip });
  return res.json({ success: true, data: p });
});

router.post('/admin/providers/:code/health', auth, requirePerm('providers.manage'), async (req: AuthedRequest, res: Response) => {  const p: any = await Provider.findOne({ code: req.params.code });
  if (!p) return res.status(404).json({ success: false, message: 'Not found', code: 'NOT_FOUND' });
  // Honesty gate: a real vendor without credentials can never report
  // healthy — even in mock mode where execution falls back to test doubles.
  // (Explicit mock-* adapters and unknown names fall through to the
  // mode-aware check below.)
  const real = liveAdapterFor(p.adapter);
  if (real && !real.isConfigured()) {
    p.status = 'unknown';
    p.lastError = `not configured: ${(real?.requiresConfig() ?? ['unknown adapter']).slice(0, 3).join(', ')}`;
    await p.save();
    return res.json({ success: true, data: { code: p.code, online: false, status: 'unknown', configured: false, requires: real?.requiresConfig() ?? ['unknown adapter'] } });
  }
  try {
    const adapter = adapterFor(p.code, p.adapter);
    const h = await adapter.healthCheck();
    p.status = h.online ? 'online' : 'offline';
    await p.save();
    return res.json({ success: true, data: { code: p.code, ...h, status: p.status, configured: true } });
  } catch (e: any) {
    p.status = 'offline';
    p.lastError = e.message;
    await p.save();
    return res.json({ success: true, data: { code: p.code, online: false, status: 'offline', configured: true } });
  }
});

// Live vendor float (admin only). Vendors without a balance endpoint report
// NOT_SUPPORTED rather than fake data. Never exposes credentials.
router.get('/admin/providers/:code/balance', auth, requirePerm('providers.manage'), async (req: AuthedRequest, res: Response) => {
  const p: any = await Provider.findOne({ code: req.params.code });
  if (!p) return res.status(404).json({ success: false, message: 'Not found', code: 'NOT_FOUND' });
  const real = liveAdapterFor(p.adapter);
  if (!real || !real.isConfigured()) {
    return res.json({ success: true, data: { code: p.code, supported: false, detail: 'NOT_SUPPORTED', configured: false } });
  }
  const fetchBalance = (real as any).fetchBalance?.bind(real);
  if (typeof fetchBalance !== 'function') {
    return res.json({ success: true, data: { code: p.code, supported: false, detail: 'NOT_SUPPORTED' } });
  }
  const result = await fetchBalance();
  if (result.supported && Number.isFinite(result.balanceKobo)) {
    p.balanceKobo = result.balanceKobo;
    await p.save();
    await audit({ actorId: req.user!.id, actorEmail: req.user!.email, action: 'provider.balance', entity: 'provider', entityId: p.code, after: { balanceKobo: result.balanceKobo }, ip: req.ip });
  }
  return res.json({ success: true, data: { code: p.code, ...result } });
});

export default router;
