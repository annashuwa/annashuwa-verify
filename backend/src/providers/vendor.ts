import {
  ProviderAdapter, ProviderError, ProviderOp, ProviderRequest, ProviderResult,
  NormalizedResult, ProviderOutcome, PROVIDER_OPS,
} from './types.js';
import { providerHttp, vendorCost } from './http.js';
import { maskPayload } from '../lib/mask.js';
import { logger } from '../logger.js';

function env(name: string): string {
  return (process.env[name] ?? '').trim();
}

/**
 * Config-driven vendor adapter base.
 *
 * A vendor is callable ONLY for operations whose endpoint path is configured
 * via env. Nothing is invented: unset paths mean "unsupported / not
 * configured" and the engine routes around the vendor.
 *
 * Env contract per vendor prefix P (e.g. NINJA):
 *   P_BASE_URL            https://...            (required)
 *   P_API_KEY             secret                 (required, server-side only)
 *   P_AUTH_HEADER         "Authorization: Bearer {key}" (optional; {key} substituted)
 *   P_PATH_<OP>           e.g. P_PATH_NIN_LOOKUP=/v1/nin/verify (per operation)
 *   P_METHOD              GET|POST               (default POST)
 *   P_ID_QUERY_PARAM      query param for the ID on GET (default per-op, overridable)
 *   P_ID_BODY_FIELD       body field for the ID on POST (default per-op, overridable)
 *   P_PATH_STATUS         async status lookup path (optional)
 *   P_PATH_BALANCE        balance endpoint path (optional → NOT_SUPPORTED)
 *   P_PATH_HEALTH         health endpoint path (optional → assumed healthy)
 *   P_DEFAULT_COST_KOBO   fallback provider cost (default 15000)
 *
 * <OP> names: NIN_LOOKUP, NIN_PHONE, NIN_DEMOGRAPHICS, BVN_LOOKUP, BVN_PHONE,
 *             CAC, TIN, JAMB.
 */
const OP_ENV: Record<ProviderOp, string> = {
  'nin.lookup': 'NIN_LOOKUP',
  'nin.phone-lookup': 'NIN_PHONE',
  'nin.demographics': 'NIN_DEMOGRAPHICS',
  'bvn.lookup': 'BVN_LOOKUP',
  'bvn.phone-lookup': 'BVN_PHONE',
  'cac.lookup': 'CAC',
  'tin.lookup': 'TIN',
  'jamb.lookup': 'JAMB',
};

const OP_ID_PARAM: Record<ProviderOp, string> = {
  'nin.lookup': 'nin',
  'nin.phone-lookup': 'phone',
  'nin.demographics': 'nin',
  'bvn.lookup': 'bvn',
  'bvn.phone-lookup': 'phone',
  'cac.lookup': 'rcNumber',
  'tin.lookup': 'tin',
  'jamb.lookup': 'regNumber',
};

export abstract class VendorAdapter implements ProviderAdapter {
  abstract name: string;
  abstract providerName: string;
  protected abstract prefix: string;
  protected defaultCostKobo = 15000;

  protected baseUrl(): string {
    return env(`${this.prefix}_BASE_URL`);
  }
  protected apiKey(): string {
    return env(`${this.prefix}_API_KEY`);
  }
  protected pathFor(op: ProviderOp): string {
    return env(`${this.prefix}_PATH_${OP_ENV[op]}`);
  }

  get supports(): ProviderOp[] {
    return (Object.keys(OP_ENV) as ProviderOp[]).filter((op) => !!this.pathFor(op));
  }

  isConfigured(): boolean {
    return !!this.baseUrl() && !!this.apiKey() && this.supports.length > 0;
  }

  requiresConfig(): string[] {
    const missing: string[] = [];
    if (!this.baseUrl()) missing.push(`${this.prefix}_BASE_URL`);
    if (!this.apiKey()) missing.push(`${this.prefix}_API_KEY`);
    for (const op of Object.keys(OP_ENV) as ProviderOp[]) {
      if (!this.pathFor(op)) missing.push(`${this.prefix}_PATH_${OP_ENV[op]} (for ${op})`);
    }
    return missing;
  }

  protected authHeaders(): Record<string, string> {
    const key = this.apiKey();
    const template = env(`${this.prefix}_AUTH_HEADER`) || 'Authorization: Bearer {key}';
    const idx = template.indexOf(':');
    if (idx > 0) {
      return { [template.slice(0, idx).trim()]: template.slice(idx + 1).trim().replace('{key}', key) };
    }
    return { Authorization: `Bearer ${key}` };
  }

  protected idValue(op: ProviderOp, payload: Record<string, any>): string {
    const param = env(`${this.prefix}_ID_QUERY_PARAM`) || env(`${this.prefix}_ID_BODY_FIELD`) || OP_ID_PARAM[op];
    const v = payload[param] ?? payload.nin ?? payload.bvn ?? payload.phone ?? payload.rcNumber ?? payload.tin ?? payload.regNumber;
    return String(v ?? '').trim();
  }

  protected buildUrl(op: ProviderOp, payload: Record<string, any>): string {
    const base = this.baseUrl().replace(/\/+$/, '');
    const path = this.pathFor(op);
    const method = (env(`${this.prefix}_METHOD`) || 'POST').toUpperCase();
    if (method === 'GET') {
      const param = env(`${this.prefix}_ID_QUERY_PARAM`) || OP_ID_PARAM[op];
      return `${base}${path}?${encodeURIComponent(param)}=${encodeURIComponent(this.idValue(op, payload))}`;
    }
    return `${base}${path}`;
  }

  protected buildBody(op: ProviderOp, payload: Record<string, any>): unknown {
    const method = (env(`${this.prefix}_METHOD`) || 'POST').toUpperCase();
    if (method === 'GET') return undefined;
    const field = env(`${this.prefix}_ID_BODY_FIELD`) || OP_ID_PARAM[op];
    return { [field]: this.idValue(op, payload) };
  }

  async verify(req: ProviderRequest): Promise<ProviderResult> {
    if (!this.isConfigured()) {
      throw new ProviderError('PROVIDER_NOT_CONFIGURED', `${this.providerName} credentials/endpoints are not configured`, false);
    }
    const op = req.op;
    if (!op || !this.pathFor(op)) {
      throw new ProviderError('OPERATION_UNSUPPORTED', `${this.providerName} does not support ${req.serviceSlug}`, false);
    }
    const id = this.idValue(op, req.payload);
    if (!id) {
      throw new ProviderError('VALIDATION_ERROR', 'Identity value is required', false);
    }
    const url = this.buildUrl(op, req.payload);
    const body = this.buildBody(op, req.payload);
    const { data, latencyMs } = await providerHttp(url, {
      method: (env(`${this.prefix}_METHOD`) || 'POST').toUpperCase() === 'GET' ? 'GET' : 'POST',
      headers: this.authHeaders(),
      body,
      timeoutMs: req.timeoutMs,
      provider: this.name,
      operation: op,
    });
    return this.normalize(data, op, id, latencyMs);
  }

  /**
   * Best-effort normalization of vendor payloads into the canonical envelope.
   * Vendors override only when their contract is confirmed by official docs.
   */
  protected normalize(data: any, op: ProviderOp, id: string, latencyMs: number): ProviderResult {
    const d = (data?.data && typeof data.data === 'object' ? data.data : data) ?? {};
    const verified = definiteSuccess(data, d);
    if (verified === false) {
      const msg = String(data?.message ?? data?.detail ?? d?.message ?? 'No record found').slice(0, 300);
      throw new ProviderError('INVALID_ID', msg, false);
    }
    const providerRef = String(
      d?.reference ?? d?.transactionRef ?? d?.id ?? data?.reference ?? data?.id ?? `EXT-${Date.now().toString(36).toUpperCase()}`
    ).slice(0, 120);
    const subject = extractSubject(d);
    const normalized: NormalizedResult = {
      verified: true,
      provider: this.name,
      operation: op,
      providerReference: providerRef,
      message: String(data?.message ?? d?.message ?? 'Verification successful').slice(0, 300),
      ...(Object.keys(subject).length > 0 ? { subject } : {}),
      facts: { lookup: maskId(id) },
    };
    return {
      ok: true,
      data: normalized,
      raw: minimizeRaw(data),
      providerRef,
      costKobo: vendorCost(data ?? d, this.defaultCostKobo),
      latencyMs,
    };
  }

  async status(providerRef: string): Promise<{ outcome: ProviderOutcome; result?: ProviderResult }> {
    const path = env(`${this.prefix}_PATH_STATUS`);
    if (!this.isConfigured() || !path) return { outcome: 'unknown' };
    try {
      const url = `${this.baseUrl().replace(/\/+$/, '')}${path}?reference=${encodeURIComponent(providerRef)}`;
      const { data } = await providerHttp(url, {
        headers: this.authHeaders(),
        timeoutMs: 8000,
        provider: this.name,
        operation: 'status-poll',
      });
      const d = (data?.data && typeof data.data === 'object' ? data.data : data) ?? {};
      const v = definiteSuccess(data, d);
      if (v === true) {
        return {
          outcome: 'successful',
          result: {
            ok: true,
            data: {
              verified: true, provider: this.name, operation: 'status-poll',
              providerReference: providerRef,
              message: 'Verification confirmed on reconciliation',
              subject: extractSubject(d),
            },
            raw: minimizeRaw(data),
            providerRef,
            costKobo: vendorCost(data ?? d, this.defaultCostKobo),
            latencyMs: 0,
          },
        };
      }
      if (v === false) return { outcome: 'not_found' };
      return { outcome: 'unknown' };
    } catch (e) {
      logger.warn('provider status poll failed', { provider: this.name, e: String((e as any)?.message ?? e) });
      return { outcome: 'unknown' };
    }
  }

  async fetchBalance(): Promise<{ supported: boolean; balanceKobo?: number; detail?: string }> {
    const path = env(`${this.prefix}_PATH_BALANCE`);
    if (!this.isConfigured() || !path) return { supported: false, detail: 'NOT_SUPPORTED' };
    try {
      const url = `${this.baseUrl().replace(/\/+$/, '')}${path}`;
      const { data } = await providerHttp(url, {
        headers: this.authHeaders(),
        timeoutMs: 8000,
        provider: this.name,
        operation: 'balance',
      });
      const raw = (data as any)?.balance ?? (data as any)?.data?.balance ?? (data as any)?.amount;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) return { supported: false, detail: 'unparseable balance response' };
      return { supported: true, balanceKobo: Math.round(n * 100) };
    } catch (e) {
      return { supported: false, detail: String((e as any)?.message ?? e).slice(0, 200) };
    }
  }

  async healthCheck(): Promise<{ online: boolean; latencyMs: number; detail?: string }> {
    const t0 = Date.now();
    if (!this.isConfigured()) {
      return { online: false, latencyMs: Date.now() - t0, detail: `missing: ${this.requiresConfig().slice(0, 3).join(', ')}` };
    }
    const path = env(`${this.prefix}_PATH_HEALTH`);
    if (!path) {
      return { online: true, latencyMs: Date.now() - t0, detail: 'assumed (no dedicated health endpoint configured)' };
    }
    try {
      const url = `${this.baseUrl().replace(/\/+$/, '')}${path}`;
      const { status } = await providerHttp(url, {
        headers: this.authHeaders(),
        timeoutMs: 8000,
        provider: this.name,
        operation: 'health',
      });
      return { online: status < 500, latencyMs: Date.now() - t0 };
    } catch (e) {
      return { online: false, latencyMs: Date.now() - t0, detail: String((e as any)?.message ?? e).slice(0, 200) };
    }
  }
}

function definiteSuccess(root: any, d: any): boolean | null {
  const candidates = [root?.status, root?.success, root?.verified, d?.status, d?.success, d?.verified, root?.responseCode, d?.responseCode];
  for (const c of candidates) {
    const s = String(c ?? '').toLowerCase();
    if (['success', 'successful', 'true', 'verified', '00', '0', 'found', 'valid'].includes(s)) return true;
    if (['fail', 'failed', 'false', 'not_found', 'notfound', 'error', 'invalid'].includes(s)) return false;
  }
  // No explicit signal: if the payload carries identity fields, treat as success.
  return hasIdentityFields(d) ? true : null;
}

function hasIdentityFields(d: any): boolean {
  if (!d || typeof d !== 'object') return false;
  return ['firstName', 'firstname', 'first_name', 'fullName', 'fullname', 'full_name', 'surname', 'lastName', 'dob', 'dateOfBirth', 'phone', 'photo'].some(
    (k) => d[k] !== undefined && d[k] !== null && d[k] !== ''
  );
}

function extractSubject(d: any): Record<string, any> {
  if (!d || typeof d !== 'object') return {};
  const pick = (...keys: string[]) => {
    for (const k of keys) if (d[k] !== undefined && d[k] !== null && d[k] !== '') return d[k];
    return undefined;
  };
  const out: Record<string, any> = {};
  const first = pick('firstName', 'firstname', 'first_name');
  const last = pick('lastName', 'lastname', 'last_name', 'surname');
  const full = pick('fullName', 'fullname', 'full_name', 'name');
  if (first) out.firstName = maskValue(first);
  if (last) out.lastName = maskValue(last);
  if (full && !first && !last) out.fullName = maskValue(full);
  const dob = pick('dob', 'dateOfBirth', 'date_of_birth', 'birthdate');
  if (dob) out.dob = String(dob);
  const phone = pick('phone', 'phoneNumber', 'phone_number', 'mobile');
  if (phone) out.phone = maskValue(phone);
  const gender = pick('gender', 'sex');
  if (gender) out.gender = String(gender);
  return out;
}

function maskValue(v: unknown): string {
  const s = String(v ?? '');
  if (s.length <= 4) return '*'.repeat(s.length);
  return `${s.slice(0, 2)}****${s.slice(-2)}`;
}

function maskId(id: string): string {
  return maskValue(id);
}

function minimizeRaw(data: any): Record<string, any> {
  const masked = maskPayload(data && typeof data === 'object' ? data : { value: data });
  try {
    const s = JSON.stringify(masked);
    if (s.length > 4000) return { _truncated: true, keys: Object.keys(masked ?? {}) };
    return masked;
  } catch {
    return { _unserializable: true };
  }
}
