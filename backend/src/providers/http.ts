import { ProviderError } from './types.js';
import { maskPayload } from '../lib/mask.js';
import { logger } from '../logger.js';

export interface HttpOptions {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: unknown;
  /** Per-attempt timeout in ms. */
  timeoutMs: number;
  /** Bounded retries for safe failures only (network/5xx/429). No retry on 4xx. */
  retries?: number;
  retryDelayMs?: number;
  provider: string;
  operation: string;
}

export interface HttpResult<T = any> {
  status: number;
  data: T;
  latencyMs: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

function safeJson(text: string): any {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { _raw: text.slice(0, 2000) };
  }
}

/**
 * Provider HTTP call with hard timeout, bounded retry and masked logging.
 * Maps vendor failures to stable ProviderError codes. Never throws raw errors.
 */
export async function providerHttp<T = any>(url: string, opts: HttpOptions): Promise<HttpResult<T>> {
  const { method = 'GET', headers = {}, body, timeoutMs, retries = 1, retryDelayMs = 750, provider, operation } = opts;
  const t0 = Date.now();
  let lastErr: any = null;

  for (let attempt = 0; attempt <= Math.max(0, retries); attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), Math.max(1000, timeoutMs));
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      const text = await res.text();
      const data = safeJson(text) as T;
      const latencyMs = Date.now() - t0;
      logger.info('provider http', {
        provider, operation, method, status: res.status, latencyMs, attempt,
        // masked: never log full identity values or secrets
        request: maskPayload((body as Record<string, any>) ?? {}),
      });
      if (res.status === 429) {
        lastErr = new ProviderError('PROVIDER_RATE_LIMITED', `${provider} rate limited (HTTP 429)`, true);
      } else if (res.status >= 500) {
        lastErr = new ProviderError('PROVIDER_ERROR', `${provider} upstream error (HTTP ${res.status})`, true);
      } else if (res.status === 401 || res.status === 403) {
        throw new ProviderError('PROVIDER_AUTH_FAILED', `${provider} rejected credentials (HTTP ${res.status})`, false);
      } else if (res.status === 404) {
        const msg = messageOf(data);
        throw new ProviderError('INVALID_ID', msg || 'No record found', false);
      } else if (res.status >= 400) {
        const msg = messageOf(data);
        // 400/409/422: treat "not found"-shaped errors as invalid input (no failover),
        // everything else as retryable so failover can try the backup provider.
        const notFound = /not.?found|no.?record|does.?not.?exist|invalid (nin|bvn|rc|tin)/i.test(msg);
        if (notFound) throw new ProviderError('INVALID_ID', msg || 'No record found', false);
        throw new ProviderError('PROVIDER_ERROR', msg || `${provider} rejected the request (HTTP ${res.status})`, true);
      } else {
        return { status: res.status, data, latencyMs };
      }
    } catch (e: any) {
      clearTimeout(timer);
      if (e instanceof ProviderError && !e.retryable) throw e;
      if (e?.name === 'AbortError') {
        // A timeout is AMBIGUOUS: the vendor may have processed the request
        // while the response was lost. Never fail over blindly or auto-refund.
        throw new ProviderError('PROVIDER_TIMEOUT', `${provider} timed out after ${timeoutMs}ms`, true, true);
      }
      lastErr = e instanceof ProviderError ? e : new ProviderError('PROVIDER_CONNECTION_FAILED', `${provider} unreachable: ${e?.message || e}`, true);
    }
    if (attempt < retries) await sleep(retryDelayMs * (attempt + 1));
  }
  throw lastErr ?? new ProviderError('PROVIDER_ERROR', `${provider} request failed`, true);
}

function messageOf(data: any): string {
  if (!data || typeof data !== 'object') return '';
  return String(
    data.message ?? data.detail ?? data.error?.message ?? data.error ?? data.responseMessage ?? ''
  ).slice(0, 300);
}

/** Extract a cost (kobo) the vendor reports, falling back to configured cost. */
export function vendorCost(data: any, fallbackKobo: number): number {
  const raw = data?.cost ?? data?.price ?? data?.amount ?? data?.fee;
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) {
    // Vendors quote in naira (major units) — convert defensively.
    return n < 100000 ? Math.round(n * 100) : Math.round(n);
  }
  return fallbackKobo;
}
