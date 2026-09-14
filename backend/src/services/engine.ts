import { Types } from 'mongoose';
import { Service } from '../models/catalog.js';
import { Transaction } from '../models/ops.js';
import { User } from '../models/core.js';
import { priceFor, profitFor } from './pricing.js';
import { debitWallet, creditWallet } from './wallet.js';
import { candidatesFor, adapterFor, recordProviderOutcome } from '../providers/registry.js';
import { ProviderError, ProviderResult, opForService } from '../providers/types.js';
import { TX_STATUS, REFUNDABLE_STATUSES } from '../lib/txStatus.js';
import { maskPayload } from '../lib/mask.js';
import { notify } from './notify.js';
import { randomToken } from '../lib/tokens.js';
import { Commission } from '../models/ops.js';
import { Setting } from '../models/ops.js';
import { Provider } from '../models/catalog.js';
import { emitTxEvent } from './webhooks.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

export interface ExecuteInput {
  userId: string;
  role: string;
  serviceSlug: string;
  payload: Record<string, any>;
  channel: 'web' | 'api';
  idempotencyKey?: string;
  ip?: string;
}

const TYPE_PATTERNS: Record<string, RegExp> = {
  phone: /^\+?[0-9]{10,14}$/,
  number: /^[+-]?[0-9]+(\.[0-9]+)?$/,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
};

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function validateFields(service: any, payload: Record<string, any>): string | null {
  for (const f of service.fields ?? []) {
    const v = payload[f.name];
    if (f.required && (v === undefined || v === null || String(v).trim() === '')) {
      return `${f.label} is required`;
    }
    if (v === undefined || v === null || String(v).trim() === '') continue;
    const s = String(v);
    if (f.minLength && s.length < f.minLength) return `${f.label} is too short`;
    if (f.maxLength && s.length > f.maxLength) return `${f.label} is too long`;
    if (f.pattern) {
      try {
        if (!new RegExp(f.pattern).test(s)) return `${f.label} is invalid`;
      } catch { /* ignore bad admin regex */ }
    }
    if (f.type === 'date') {
      if (!isValidDate(s)) return `${f.label} must be a valid date (YYYY-MM-DD)`;
    } else if (f.type && TYPE_PATTERNS[f.type]) {
      if (!TYPE_PATTERNS[f.type].test(s)) return `${f.label} is invalid`;
    }
  }
  return null;
}

export async function getReferralRate(): Promise<number> {
  const s: any = await Setting.findOne({ key: 'referral' }).lean();
  const pct = Number(s?.value?.percent ?? 5);
  return Number.isFinite(pct) ? Math.min(50, Math.max(0, pct)) : 5;
}

function isDuplicateKeyError(e: any): boolean {
  return e?.code === 11000 || /E11000|duplicate key/i.test(String(e?.message ?? ''));
}

/** Safety net: no provider call may hang the request past its budget. */
function withAttemptTimeout<T>(promise: Promise<T>, timeoutMs: number, providerName: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new ProviderError('PROVIDER_TIMEOUT', `${providerName} exceeded attempt budget of ${timeoutMs}ms`, true, true));
    }, Math.max(1000, timeoutMs));
    timer.unref?.();
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export async function executeVerification(input: ExecuteInput) {
  const { userId, role, serviceSlug, payload, channel, idempotencyKey, ip } = input;
  const service = await Service.findOne({ slug: serviceSlug });
  if (!service) {
    const e: any = new Error('Service not found');
    e.status = 404; e.code = 'SERVICE_NOT_FOUND';
    throw e;
  }
  if (service.status !== 'active') {
    const e: any = new Error(service.status === 'maintenance' ? 'Service under maintenance' : 'Service unavailable');
    e.status = 409; e.code = 'SERVICE_UNAVAILABLE';
    throw e;
  }
  if (channel === 'web' && !service.webEnabled) {
    const e: any = new Error('Service not available on web');
    e.status = 409; e.code = 'CHANNEL_DISABLED';
    throw e;
  }
  if (channel === 'api' && !service.apiEnabled) {
    const e: any = new Error('Service not available via API');
    e.status = 409; e.code = 'CHANNEL_DISABLED';
    throw e;
  }

  const fieldError = validateFields(service, payload);
  if (fieldError) {
    const e: any = new Error(fieldError);
    e.status = 400; e.code = 'VALIDATION_ERROR';
    throw e;
  }

  // Idempotency: same (user, service, key) returns the original transaction
  // without charging again.
  if (idempotencyKey) {
    const existing = await Transaction.findOne({ userId, serviceSlug, idempotencyKey });
    if (existing) return { transaction: existing, duplicate: true };
  }

  const priceKobo = priceFor(service, role, channel);
  const txId = `TX-${Date.now().toString(36).toUpperCase()}-${randomToken(4).toUpperCase()}`;

  let tx: any;
  try {
    tx = await Transaction.create({
      txId,
      userId: new Types.ObjectId(userId),
      serviceSlug,
      amountKobo: priceKobo,
      providerCostKobo: service.providerCostKobo,
      profitKobo: Math.max(0, priceKobo - service.providerCostKobo),
      status: TX_STATUS.PROCESSING,
      requestMasked: maskPayload(payload),
      // Only persist when provided: the driver serialises undefined as null,
      // which would break the partial unique index on idempotency.
      ...(idempotencyKey ? { idempotencyKey } : {}),
      channel,
      ip,
    });
  } catch (e: any) {
    // TOCTOU race: a concurrent request with the same key won the create.
    // Return the winner instead of charging twice.
    if (idempotencyKey && isDuplicateKeyError(e)) {
      const winner = await Transaction.findOne({ userId, serviceSlug, idempotencyKey });
      if (winner) {
        logger.info('idempotency replay after race', { txId: winner.txId, serviceSlug });
        return { transaction: winner, duplicate: true };
      }
    }
    throw e;
  }

  // Debit wallet AFTER tx creation so failures are recoverable/auditable.
  try {
    await debitWallet(userId, priceKobo, `${service.name} — ${txId}`, { txId, service: serviceSlug });
  } catch (e: any) {
    tx.status = TX_STATUS.CANCELLED;
    tx.errorCode = e.code || 'INSUFFICIENT_BALANCE';
    tx.errorMessage = e.message;
    await tx.save();
    throw e;
  }

  const op = opForService(serviceSlug);
  const candidates = await candidatesFor(serviceSlug);
  if (candidates.length === 0) {
    await autoRefund(tx, userId, 'NO_PROVIDER', 'No provider available for this service');
    return { transaction: await Transaction.findById(tx._id), duplicate: false };
  }

  let lastError: any = null;
  let sawAmbiguous = false;
  for (const p of candidates) {
    let adapter;
    try {
      adapter = adapterFor(p.code, p.adapter);
    } catch (err: any) {
      // Unknown/unregistered adapter: skip this candidate, keep failing over.
      lastError = err;
      await recordProviderOutcome(p.code, false, 0, err?.code || 'NO_ADAPTER');
      continue;
    }
    if (!adapter.isConfigured()) {
      // Vendor without credentials: route around it (never faked).
      lastError = new ProviderError('PROVIDER_NOT_CONFIGURED', `${p.code} is not configured`, false);
      await recordProviderOutcome(p.code, false, 0, 'PROVIDER_NOT_CONFIGURED');
      continue;
    }
    const timeoutMs = (p as any).timeoutMs && Number((p as any).timeoutMs) > 0
      ? Number((p as any).timeoutMs)
      : config.providerTimeoutMs;
    const t0 = Date.now();
    try {
      const result: ProviderResult = await withAttemptTimeout(
        adapter.verify({ serviceSlug, op, payload, timeoutMs }),
        timeoutMs,
        p.code
      );
      const latency = Date.now() - t0;
      await recordProviderOutcome(p.code, true, latency);
      // Consume provider balance so low-balance alerts stay truthful.
      // Guarded: the float is informational and must never go negative here.
      try {
        const upd: any = await Provider.updateOne(
          { code: p.code, balanceKobo: { $gte: result.costKobo } },
          { $inc: { balanceKobo: -result.costKobo } }
        );
        if (upd.matchedCount === 0) {
          logger.warn('provider float below reported cost', { code: p.code, costKobo: result.costKobo });
        }
      } catch { /* stats only */ }
      tx.status = TX_STATUS.SUCCESSFUL;
      tx.providerCode = p.code;
      tx.providerCostKobo = result.costKobo;
      tx.profitKobo = profitFor(priceKobo, result.costKobo);
      tx.result = result.data;
      tx.rawProvider = result.raw ?? undefined;
      tx.providerRef = result.providerRef;
      await tx.save();
      await notify(userId, 'transaction_success', `${service.name} successful`, `Transaction ${txId} completed successfully.`);
      await creditReferrer(userId, txId, tx.profitKobo);
      emitTxEvent(userId, 'transaction.successful', tx.toObject());
      return { transaction: await Transaction.findById(tx._id), duplicate: false };
    } catch (err: any) {
      lastError = err;
      const latency = Date.now() - t0;
      await recordProviderOutcome(p.code, false, latency, err?.code || err?.message);
      if (err?.code === 'PROVIDER_NOT_CONFIGURED') continue; // keep failing over
      if (err instanceof ProviderError && err.ambiguous) {
        // Ambiguous outcome (e.g. timeout with unknown result): never fail
        // over blindly in live mode — the vendor may have completed.
        sawAmbiguous = true;
        break;
      }
      if (err instanceof ProviderError && !err.retryable) break; // invalid ID: don't fail over
      // else try next provider
    }
  }

  // Live-mode ambiguous outcome: park as `processing` for the reconciler,
  // which polls the vendor by providerRef before finalizing or refunding.
  if (sawAmbiguous && config.providerMode === 'live' && config.reconcileAmbiguous) {
    tx.errorCode = lastError?.code || 'PROVIDER_TIMEOUT';
    tx.errorMessage = `${lastError?.message || 'Provider timed out'} — pending reconciliation`;
    await tx.save();
    await notify(userId, 'transaction_pending', `${service.name} pending`, `Transaction ${txId} is being reconciled with the provider.`);
    emitTxEvent(userId, 'transaction.pending', tx.toObject());
    return { transaction: await Transaction.findById(tx._id), duplicate: false };
  }

  const code = lastError?.code || 'PROVIDER_ERROR';
  const retryable = !(lastError instanceof ProviderError) || lastError.retryable;
  if (retryable) {
    await autoRefund(tx, userId, code, lastError?.message || 'Provider failed');
  } else {
    tx.status = TX_STATUS.FAILED;
    tx.errorCode = code;
    tx.errorMessage = lastError?.message || 'Verification failed';
    await tx.save();
    await notify(userId, 'transaction_failed', `${service.name} failed`, `Transaction ${txId} failed: ${tx.errorMessage}`);
    emitTxEvent(userId, 'transaction.failed', tx.toObject());
  }
  return { transaction: await Transaction.findById(tx._id), duplicate: false };
}

async function autoRefund(tx: any, userId: string, code: string, message: string) {
  tx.status = TX_STATUS.FAILED;
  tx.errorCode = code;
  tx.errorMessage = message;
  await tx.save();
  try {
    await creditWallet(userId, tx.amountKobo, `Refund — ${tx.txId}`, 'refund', { txId: tx.txId });
    tx.status = TX_STATUS.REFUNDED;
    tx.errorMessage = `${message} (auto-refunded)`;
    await tx.save();
    await notify(userId, 'refund', 'Refund processed', `Transaction ${tx.txId} was refunded ${tx.amountKobo / 100} NGN.`);
    emitTxEvent(userId, 'transaction.refunded', tx.toObject());
  } catch (e) {
    tx.status = TX_STATUS.REFUND_PENDING;
    await tx.save();
    await notify(userId, 'refund_pending', 'Refund pending', `Transaction ${tx.txId} will be refunded.`);
  }
}

async function creditReferrer(userId: string, txId: string, profitKobo: number) {
  try {
    const user = await User.findById(userId).lean();
    const refId = (user as any)?.referredBy;
    if (!refId || profitKobo <= 0) return;
    const pct = await getReferralRate();
    const amountKobo = Math.floor((profitKobo * pct) / 100);
    if (amountKobo <= 0) return;
    await Commission.create({ referrerId: refId, refereeId: userId, txId, amountKobo, status: 'approved' });
    await creditWallet(String(refId), amountKobo, `Referral commission — ${txId}`, 'commission', { txId });
  } catch { /* never break core flow */ }
}

export async function refundTransaction(txId: string, actorEmail: string, reason: string) {
  // Atomic compare-and-set: exactly one actor can move the tx out of a
  // refundable state, so concurrent refunds can never double-credit.
  const tx: any = await Transaction.findOneAndUpdate(
    { txId, status: { $in: [...REFUNDABLE_STATUSES] } },
    { $set: { status: TX_STATUS.REFUNDED, errorMessage: `Refunded by ${actorEmail}: ${reason}` } },
    { new: true }
  );
  if (!tx) {
    const existing: any = await Transaction.findOne({ txId });
    if (!existing) {
      const e: any = new Error('Transaction not found');
      e.status = 404; e.code = 'TX_NOT_FOUND';
      throw e;
    }
    const e: any = new Error(`Cannot refund transaction in status ${existing.status}`);
    e.status = 409; e.code = 'REFUND_NOT_ALLOWED';
    throw e;
  }
  // The customer was ALWAYS debited up-front (debit precedes the provider
  // call), so a refund must credit for both successful and failed states.
  try {
    await creditWallet(String(tx.userId), tx.amountKobo, `Manual refund by ${actorEmail}: ${reason} — ${txId}`, 'refund', { txId, reason });
  } catch (e) {
    await Transaction.updateOne({ txId }, { $set: { status: TX_STATUS.REFUND_PENDING } });
    await notify(String(tx.userId), 'refund_pending', 'Refund pending', `Transaction ${txId} will be refunded.`);
    const err: any = new Error('Refund could not be credited yet — marked refund_pending for reconciliation');
    err.status = 502; err.code = 'REFUND_DEFERRED';
    throw err;
  }
  await notify(String(tx.userId), 'refund', 'Refund processed', `Transaction ${txId} refunded: ${reason}`);
  emitTxEvent(String(tx.userId), 'transaction.refunded', tx.toObject());
  return tx;
}
