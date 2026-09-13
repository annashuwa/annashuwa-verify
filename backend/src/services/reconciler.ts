import { Transaction } from '../models/ops.js';
import { Service, Provider } from '../models/catalog.js';
import { creditWallet } from './wallet.js';
import { profitFor } from './pricing.js';
import { tryAdapter, recordProviderOutcome } from '../providers/registry.js';
import { TX_STATUS } from '../lib/txStatus.js';
import { notify } from './notify.js';
import { audit } from './audit.js';
import { emitTxEvent } from './webhooks.js';
import { getReferralRate } from './engine.js';
import { Commission } from '../models/ops.js';
import { User } from '../models/core.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

export interface ReconcileStats {
  scanned: number;
  finalized: number;
  refunded: number;
  deferred: number;
}

/**
 * Reconciliation worker: resolves transactions the request path could not
 * finish deterministically (`processing` after an ambiguous provider outcome,
 * `refund_pending` after a failed credit).
 *
 * Rules:
 * - Never invent an outcome. If the vendor supports status lookup, poll by
 *   providerRef and finalize what the vendor reports.
 * - If the vendor cannot confirm and the tx is older than the stale window,
 *   refund (the vendor never proved it delivered).
 * - All mutations are compare-and-set on (status + reconcileAttempts) so
 *   concurrent workers can never double-finalize or double-refund.
 */
export async function reconcileOnce(now = Date.now()): Promise<ReconcileStats> {
  const stats: ReconcileStats = { scanned: 0, finalized: 0, refunded: 0, deferred: 0 };
  const staleBefore = new Date(now - config.reconcileStaleAfterMs);

  const stale = await Transaction.find({
    status: { $in: [TX_STATUS.PROCESSING, TX_STATUS.REFUND_PENDING] },
    updatedAt: { $lt: staleBefore },
    reconcileAttempts: { $lt: config.reconcileMaxAttempts },
  })
    .sort({ updatedAt: 1 })
    .limit(50)
    .lean();

  for (const row of stale) {
    stats.scanned += 1;
    try {
      if (row.status === TX_STATUS.REFUND_PENDING) {
        const done = await retryRefund(row);
        if (done) stats.refunded += 1;
        else stats.deferred += 1;
      } else {
        const outcome = await reconcileProcessing(row);
        if (outcome === 'finalized') stats.finalized += 1;
        else if (outcome === 'refunded') stats.refunded += 1;
        else stats.deferred += 1;
      }
    } catch (e) {
      stats.deferred += 1;
      logger.warn('reconcile item failed', { txId: (row as any).txId, e: String((e as any)?.message ?? e) });
    }
  }
  return stats;
}

async function retryRefund(row: any): Promise<boolean> {
  // CAS: only one worker may move it out of refund_pending.
  const tx: any = await Transaction.findOneAndUpdate(
    { txId: row.txId, status: TX_STATUS.REFUND_PENDING, reconcileAttempts: row.reconcileAttempts },
    { $set: { status: TX_STATUS.REFUNDED }, $inc: { reconcileAttempts: 1 } },
    { new: true }
  );
  if (!tx) return false; // lost the race — another worker owns it
  try {
    await creditWallet(String(tx.userId), tx.amountKobo, `Reconciled refund — ${tx.txId}`, 'refund', { txId: tx.txId, reconciled: true });
  } catch (e) {
    await Transaction.updateOne({ txId: tx.txId }, { $set: { status: TX_STATUS.REFUND_PENDING } });
    await audit({ action: 'reconcile.refund_failed', entity: 'transaction', entityId: tx.txId, after: { error: String((e as any)?.message ?? e) } });
    return false;
  }
  await notify(String(tx.userId), 'refund', 'Refund processed', `Transaction ${tx.txId} was refunded ${tx.amountKobo / 100} NGN.`);
  emitTxEvent(String(tx.userId), 'transaction.refunded', tx.toObject());
  await audit({ action: 'reconcile.refund', entity: 'transaction', entityId: tx.txId });
  return true;
}

async function reconcileProcessing(row: any): Promise<'finalized' | 'refunded' | 'deferred'> {
  // 1. Ask the vendor, when possible.
  if (row.providerCode && row.providerRef) {
    const prov: any = await Provider.findOne({ code: row.providerCode }).lean();
    if (prov) {
      const adapter = tryAdapter(prov.code, prov.adapter);
      if (adapter?.status) {
        try {
          const polled = await adapter.status(row.providerRef);
          if (polled.outcome === 'successful' && polled.result) {
            const ok = await finalizeFromPoll(row, polled.result);
            if (ok) return 'finalized';
            return 'deferred';
          }
          if (polled.outcome === 'not_found') {
            const ok = await refundStale(row, 'vendor reports no such transaction');
            return ok ? 'refunded' : 'deferred';
          }
        } catch (e) {
          logger.warn('reconcile poll failed', { txId: row.txId, e: String((e as any)?.message ?? e) });
        }
        // 'unknown' → fall through to age-based handling below.
      }
    }
  }

  // 2. No vendor confirmation. Refund only once the tx is safely past the
  //    stale window (query already guarantees updatedAt < staleBefore), so a
  //    still-running request can never be refunded underneath.
  const ok = await refundStale(row, 'no provider confirmation within reconciliation window');
  return ok ? 'refunded' : 'deferred';
}

export async function finalizeFromPoll(row: any, result: any): Promise<boolean> {
  const svc: any = await Service.findOne({ slug: row.serviceSlug }).lean();
  const priceKobo = row.amountKobo;
  const costKobo = Number(result.costKobo) || Number(svc?.providerCostKobo ?? 0);
  const tx: any = await Transaction.findOneAndUpdate(
    { txId: row.txId, status: TX_STATUS.PROCESSING, reconcileAttempts: row.reconcileAttempts },
    {
      $set: {
        status: TX_STATUS.SUCCESSFUL,
        providerCostKobo: costKobo,
        profitKobo: profitFor(priceKobo, costKobo),
        result: result.data,
        rawProvider: result.raw ?? undefined,
        providerRef: result.providerRef ?? row.providerRef,
        errorCode: undefined,
        errorMessage: undefined,
      },
      $inc: { reconcileAttempts: 1 },
    },
    { new: true }
  );
  if (!tx) return false;
  await recordProviderOutcome(tx.providerCode, true, Number(result.latencyMs) || 0);
  await creditReferrerOnce(String(tx.userId), tx.txId, tx.profitKobo);
  await notify(String(tx.userId), 'transaction_success', 'Verification confirmed', `Transaction ${tx.txId} was confirmed with the provider.`);
  emitTxEvent(String(tx.userId), 'transaction.successful', tx.toObject());
  await audit({ action: 'reconcile.finalize', entity: 'transaction', entityId: tx.txId });
  return true;
}

export async function refundStale(row: any, reason: string): Promise<boolean> {
  const tx: any = await Transaction.findOneAndUpdate(
    { txId: row.txId, status: TX_STATUS.PROCESSING, reconcileAttempts: row.reconcileAttempts },
    { $set: { status: TX_STATUS.FAILED, errorCode: 'RECONCILED', errorMessage: reason } },
    { new: true }
  );
  if (!tx) return false;
  try {
    await creditWallet(String(tx.userId), tx.amountKobo, `Reconciled refund — ${tx.txId}`, 'refund', { txId: tx.txId, reconciled: true });
  } catch (e) {
    await Transaction.updateOne({ txId: tx.txId }, { $set: { status: TX_STATUS.REFUND_PENDING } });
    await audit({ action: 'reconcile.refund_failed', entity: 'transaction', entityId: tx.txId });
    return false;
  }
  await Transaction.updateOne({ txId: tx.txId }, { $set: { status: TX_STATUS.REFUNDED } });
  await recordProviderOutcome(tx.providerCode, false, 0, 'RECONCILED');
  await notify(String(tx.userId), 'refund', 'Refund processed', `Transaction ${tx.txId} was refunded ${tx.amountKobo / 100} NGN.`);
  emitTxEvent(String(tx.userId), 'transaction.refunded', tx.toObject());
  await audit({ action: 'reconcile.refund', entity: 'transaction', entityId: tx.txId, after: { reason } });
  return true;
}

async function creditReferrerOnce(userId: string, txId: string, profitKobo: number): Promise<void> {
  try {
    const user = await User.findById(userId).lean();
    const refId = (user as any)?.referredBy;
    if (!refId || profitKobo <= 0) return;
    const pct = await getReferralRate();
    const amountKobo = Math.floor((profitKobo * pct) / 100);
    if (amountKobo <= 0) return;
    await Commission.create({ referrerId: refId, refereeId: userId, txId, amountKobo, status: 'approved' });
    await creditWallet(String(refId), amountKobo, `Referral commission — ${txId}`, 'commission', { txId });
  } catch { /* never break reconciliation */ }
}

export async function startReconciler(): Promise<() => void> {
  const tick = async () => {
    try {
      const stats = await reconcileOnce();
      if (stats.scanned > 0) logger.info('reconcile tick', stats);
    } catch (e) {
      logger.warn('reconcile tick failed', { e: String((e as any)?.message ?? e) });
    }
  };
  const timer = setInterval(tick, config.reconcileIntervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
