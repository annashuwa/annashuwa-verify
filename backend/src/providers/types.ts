import { TX_STATUS, type TxStatus } from '../lib/txStatus.js';

// Canonical verification operations. A provider advertises the subset it
// supports; the engine only routes an operation to a provider that declares it.
export const PROVIDER_OPS = [
  'nin.lookup',
  'nin.phone-lookup',
  'nin.demographics',
  'bvn.lookup',
  'bvn.phone-lookup',
  'cac.lookup',
  'tin.lookup',
  'jamb.lookup',
] as const;

export type ProviderOp = (typeof PROVIDER_OPS)[number];

// Service slug → canonical operation. New services only need an entry here
// (plus their Service document) to become routable to capable providers.
export const SERVICE_OPS: Record<string, ProviderOp> = {
  'nin-verification': 'nin.lookup',
  'nin-validation': 'nin.lookup',
  'nin-phone-lookup': 'nin.phone-lookup',
  'nin-demographics': 'nin.demographics',
  'bvn-verification': 'bvn.lookup',
  'bvn-search': 'bvn.phone-lookup',
  'cac-verification': 'cac.lookup',
  'cac-advanced': 'cac.lookup',
  'tin-verification': 'tin.lookup',
  'jamb-verification': 'jamb.lookup',
};

export function opForService(serviceSlug: string): ProviderOp | null {
  return SERVICE_OPS[serviceSlug] ?? null;
}

export interface ProviderRequest {
  serviceSlug: string;
  op: ProviderOp | null;
  payload: Record<string, any>;
  /** Effective per-attempt timeout in ms (provider override → global default). */
  timeoutMs: number;
}

// Normalized verification result. Adapters MUST map vendor responses into this
// envelope; raw vendor payloads never reach the frontend.
export interface NormalizedResult {
  verified: boolean;
  provider: string;
  operation: string;
  providerReference: string;
  message: string;
  /** Verified identity fields (already suitable for customer display). */
  subject?: Record<string, any>;
  /** Extra non-sensitive vendor facts. */
  facts?: Record<string, any>;
}

export interface ProviderResult {
  ok: boolean;
  data: NormalizedResult;
  /** Minimized raw vendor payload kept for audit (no secrets, masked PII). */
  raw?: Record<string, any>;
  providerRef: string;
  costKobo: number;
  latencyMs: number;
}

export type ProviderOutcome = 'successful' | 'not_found' | 'unknown';

export class ProviderError extends Error {
  code: string;
  retryable: boolean;
  /** True when the vendor response was ambiguous (timeout with unknown
   *  outcome). The engine must NOT blindly fail over or refund — reconcile. */
  ambiguous: boolean;
  constructor(code: string, message: string, retryable = true, ambiguous = false) {
    super(message);
    this.code = code;
    this.retryable = retryable;
    this.ambiguous = ambiguous;
  }
}

export interface ProviderAdapter {
  name: string;
  /** Operations this adapter can perform (subset of PROVIDER_OPS). */
  supports: ProviderOp[];
  /** False when required credentials/config are absent — engine routes around it. */
  isConfigured(): boolean;
  /** Human-readable list of missing credentials/config (never the values). */
  requiresConfig(): string[];
  /** Synchronous verification. Must respect req.timeoutMs. */
  verify(req: ProviderRequest): Promise<ProviderResult>;
  /** Optional async reconciliation: poll a vendor job by providerRef. */
  status?(providerRef: string): Promise<{ outcome: ProviderOutcome; result?: ProviderResult }>;
  healthCheck(): Promise<{ online: boolean; latencyMs: number; detail?: string }>;
}

export interface ProviderHealth {
  online: boolean;
  latencyMs: number;
  detail?: string;
}

export { TX_STATUS };
export type { TxStatus };
