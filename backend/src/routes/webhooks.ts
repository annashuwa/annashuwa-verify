import { Router, Response } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { Transaction } from '../models/ops.js';
import { Provider } from '../models/catalog.js';
import { TX_STATUS } from '../lib/txStatus.js';
import { finalizeFromPoll, refundStale } from '../services/reconciler.js';
import { audit } from '../services/audit.js';
import { notify } from '../services/notify.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

const router = Router();

function secretFor(prov: any): string | null {
  const name = String(prov?.webhookSecretName ?? '').trim();
  // Allowlist: env var NAME only (never a secret value), strict charset.
  if (!/^[A-Z][A-Z0-9_]{2,63}$/.test(name)) return null;
  return process.env[name] || null;
}

function verifySignature(secret: string, timestamp: string, rawBody: string, signature: string): boolean {
  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(signature)));
  } catch {
    return false;
  }
}

const payloadSchema = z.object({
  providerRef: z.string().min(1).max(120),
  outcome: z.enum(['successful', 'failed']),
  result: z.record(z.any()).optional(),
  costKobo: z.number().int().min(0).optional(),
  errorCode: z.string().max(80).optional(),
  errorMessage: z.string().max(500).optional(),
});

// Inbound async-result webhook from verification providers:
//   POST /api/webhooks/provider/:code
//   headers: x-pv-timestamp (ms), x-pv-signature = HMAC_SHA256(secret, ts + "." + rawBody)
// Guarantees: signature verification, timestamp skew bound, idempotent replay
// (terminal txs return already-handled), state validation (only `processing`
// can be finalized), safe wallet finalize/refund, audit logging.
router.post('/webhooks/provider/:code', async (req, res: Response) => {
  const code = String(req.params.code);
  const prov: any = await Provider.findOne({ code }).lean();
  if (!prov) return res.status(404).json({ success: false, message: 'Unknown provider', code: 'NOT_FOUND' });

  const secret = secretFor(prov);
  if (!secret) {
    return res.status(503).json({ success: false, message: 'Provider webhook not configured', code: 'WEBHOOK_NOT_CONFIGURED' });
  }
  const ts = String(req.headers['x-pv-timestamp'] ?? '');
  const sig = String(req.headers['x-pv-signature'] ?? '');
  const skew = Math.abs(Date.now() - Number(ts));
  if (!ts || !sig || !Number.isFinite(Number(ts)) || skew > config.webhookMaxSkewMs) {
    await audit({ action: 'webhook.provider_rejected', entity: 'provider', entityId: code, after: { reason: 'bad timestamp/signature' }, ip: req.ip });
    return res.status(401).json({ success: false, message: 'Invalid webhook signature', code: 'INVALID_SIGNATURE' });
  }
  const rawBody: string = (req as any).rawBody ?? JSON.stringify(req.body ?? {});
  if (!verifySignature(secret, ts, rawBody, sig)) {
    await audit({ action: 'webhook.provider_rejected', entity: 'provider', entityId: code, after: { reason: 'signature mismatch' }, ip: req.ip });
    return res.status(401).json({ success: false, message: 'Invalid webhook signature', code: 'INVALID_SIGNATURE' });
  }

  const p = payloadSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ success: false, message: 'Validation failed', code: 'VALIDATION_ERROR' });

  const tx: any = await Transaction.findOne({ providerCode: code, providerRef: p.data.providerRef });
  if (!tx) {
    logger.warn('provider webhook for unknown ref', { code, ref: p.data.providerRef });
    return res.status(404).json({ success: false, message: 'Transaction not found', code: 'TX_NOT_FOUND' });
  }
  // Idempotent replay: terminal states are returned as-is, never re-applied.
  if (tx.status !== TX_STATUS.PROCESSING) {
    return res.json({ success: true, already: true, status: tx.status, txId: tx.txId });
  }

  if (p.data.outcome === 'successful') {
    const ok = await finalizeFromPoll(tx.toObject(), {
      data: {
        verified: true, provider: code, operation: tx.serviceSlug,
        providerReference: p.data.providerRef,
        message: 'Verification confirmed via provider webhook',
        ...(p.data.result ?? {}),
      },
      raw: { via: 'webhook' },
      providerRef: p.data.providerRef,
      costKobo: p.data.costKobo ?? tx.providerCostKobo,
      latencyMs: 0,
    });
    await audit({ action: 'webhook.provider_finalize', entity: 'transaction', entityId: tx.txId, after: { ok }, ip: req.ip });
    return res.json({ success: true, finalized: ok, txId: tx.txId });
  }

  const ok = await refundStale(tx.toObject(), p.data.errorMessage || p.data.errorCode || 'provider reported failure');
  await notify(String(tx.userId), 'transaction_failed', 'Verification failed', `Transaction ${tx.txId} failed per provider update.`);
  await audit({ action: 'webhook.provider_fail', entity: 'transaction', entityId: tx.txId, after: { ok }, ip: req.ip });
  return res.json({ success: true, refunded: ok, txId: tx.txId });
});

export default router;
