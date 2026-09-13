import { ProviderAdapter, ProviderError, ProviderOp, ProviderRequest, ProviderResult, PROVIDER_OPS } from './types.js';
import { config } from '../config.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

// Deterministic mock: behaviour driven by the last digits / markers of the identity value.
// - value ending in "00" => invalid input (non-retryable, no failover)
// - value ending in "99" => timeout (retryable+ambiguous -> reconcile, no blind failover)
// - value ending in "55" => provider error (retryable)
// - "LOWBAL" in any value => insufficient provider balance
// otherwise => success with plausible mock data.
// DEVELOPMENT/TEST ONLY — never exposed as production functionality.
function classify(value: string): 'ok' | 'invalid' | 'timeout' | 'error' | 'lowbal' {
  const v = String(value ?? '');
  if (/lowbal/i.test(v)) return 'lowbal';
  if (v.endsWith('00')) return 'invalid';
  if (v.endsWith('99')) return 'timeout';
  if (v.endsWith('55')) return 'error';
  return 'ok';
}

function firstIdentity(payload: Record<string, any>): string {
  return String(
    payload.nin ?? payload.bvn ?? payload.rcNumber ?? payload.rc_number ?? payload.tin ??
    payload.regNumber ?? payload.phone ?? payload.phoneNumber ?? payload.firstName ?? payload.id ?? 'TEST1234'
  );
}

function mockPerson(id: string, extra: Record<string, any> = {}) {
  return {
    firstName: 'Adaeze',
    lastName: 'Okafor',
    middleName: 'Chioma',
    dob: '1992-04-17',
    phone: '0803***4521',
    gender: 'female',
    photo: null,
    idNumber: id.slice(0, 3) + '****' + id.slice(-3),
    ...extra,
  };
}

export class MockAdapter implements ProviderAdapter {
  name: string;
  costKobo: number;
  supports: ProviderOp[] = [...PROVIDER_OPS];
  constructor(name: string, costKobo = 15000) {
    this.name = name;
    this.costKobo = costKobo;
  }

  isConfigured(): boolean {
    return true; // mock is always available in mock mode
  }
  requiresConfig(): string[] {
    return [];
  }

  async verify(req: ProviderRequest): Promise<ProviderResult> {
    const t0 = Date.now();
    // Respect the attempt timeout: a hung mock must behave like a hung vendor.
    const latency = Math.min(config.mockLatencyMs, Math.max(0, req.timeoutMs - 50));
    await sleep(latency);
    const id = firstIdentity(req.payload);
    const kind = config.mockMode === 'success' ? 'ok' : classify(id);

    if (kind === 'invalid') {
      throw new ProviderError('INVALID_ID', `No record found for ${req.serviceSlug}`, false);
    }
    if (kind === 'timeout') {
      await sleep(150);
      throw new ProviderError('PROVIDER_TIMEOUT', 'Provider timed out', true, true);
    }
    if (kind === 'error') {
      throw new ProviderError('PROVIDER_ERROR', 'Upstream provider error', true);
    }
    if (kind === 'lowbal') {
      throw new ProviderError('PROVIDER_LOW_BALANCE', 'Provider wallet low', true);
    }
    const op = req.op ?? req.serviceSlug;
    const providerRef = `MOCK-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1e6)}`;
    return {
      ok: true,
      providerRef,
      costKobo: this.costKobo,
      latencyMs: Date.now() - t0,
      data: {
        verified: true,
        provider: this.name,
        operation: op,
        providerReference: providerRef,
        message: 'Verification successful',
        subject: mockPerson(id),
      },
    };
  }

  async healthCheck() {
    const t0 = Date.now();
    await sleep(20);
    return { online: true, latencyMs: Date.now() - t0, detail: 'mock adapter' };
  }
}
