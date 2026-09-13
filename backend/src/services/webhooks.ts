import crypto from 'node:crypto';
import { ApiKey } from '../models/ops.js';
import { logger } from '../logger.js';

export function signWebhook(secret: string, timestamp: string, body: string): string {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

// Fire-and-forget delivery to API customers' endpoints. Never throws,
// never blocks the transaction response.
export function emitTxEvent(userId: string, event: string, tx: Record<string, any>): void {
  setImmediate(async () => {
    try {
      const keys = await ApiKey.find({ userId, status: 'active', webhookUrl: { $exists: true, $ne: '' } }).lean();
      for (const k of keys as any[]) {
        try {
          const payload = JSON.stringify({
            event,
            txId: tx.txId,
            status: tx.status,
            service: tx.serviceSlug,
            amountKobo: tx.amountKobo,
            channel: tx.channel,
            at: new Date().toISOString(),
          });
          const timestamp = String(Date.now());
          const sig = signWebhook(k.webhookSecret || k.prefix, timestamp, payload);
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 6000);
          await fetch(k.webhookUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-nv-signature': sig,
              'x-nv-timestamp': timestamp,
              'x-nv-key': k.prefix,
            },
            body: payload,
            signal: ctrl.signal,
          });
          clearTimeout(t);
        } catch (e) {
          logger.warn('webhook delivery failed', { key: (k as any).prefix });
        }
      }
    } catch (e) {
      logger.warn('webhook emit failed', { e: String(e) });
    }
  });
}
