import { Provider } from '../models/catalog.js';
import { MockAdapter } from './mock.js';
import { NinjaAdapter } from './ninja.js';
import { DojahAdapter } from './dojah.js';
import { PremblyAdapter } from './prembly.js';
import { VerifyMeAdapter } from './verifyme.js';
import { IdentifyOrgAdapter } from './identifyorg.js';
import { ProviderAdapter, ProviderError, ProviderOp, opForService } from './types.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

type Factory = () => ProviderAdapter;
const factories = new Map<string, Factory>();

/** Register a vendor adapter factory. Called once at boot (see registerDefaults). */
export function registerProvider(adapterName: string, factory: Factory): void {
  factories.set(adapterName, factory);
}

export function registeredAdapters(): string[] {
  return [...factories.keys()];
}

// Mock costs by adapter name (dev/test doubles).
const MOCK_COSTS: Record<string, number> = {
  'mock-nin': 15000,
  'mock-bvn': 15000,
  'mock-cac': 20000,
  'mock-tin': 12000,
  'mock-jamb': 10000,
};

function mockFor(adapterName: string): ProviderAdapter {
  return new MockAdapter(adapterName || 'mock-generic', MOCK_COSTS[adapterName] ?? 15000);
}

export function registerDefaults(): void {
  registerProvider('ninja', () => new NinjaAdapter());
  registerProvider('dojah', () => new DojahAdapter());
  registerProvider('prembly', () => new PremblyAdapter());
  registerProvider('verifyme', () => new VerifyMeAdapter());
  registerProvider('identifyorg', () => new IdentifyOrgAdapter());
  // Explicit test doubles also work in live mode (operator's deliberate choice).
  for (const name of ['mock-nin', 'mock-bvn', 'mock-cac', 'mock-tin', 'mock-jamb', 'mock-generic']) {
    registerProvider(name, () => mockFor(name));
  }
}

/**
 * Build an adapter for a provider document.
 * - mock mode: everything runs on the deterministic MockAdapter (dev/test).
 * - live mode: registered vendor adapters; unconfigured/unknown vendors yield
 *   null so the engine can route around them (never faked).
 */
export function adapterFor(providerCode: string, adapterName: string): ProviderAdapter {
  void providerCode;
  if (config.providerMode === 'mock') return mockFor(adapterName);
  const factory = factories.get(adapterName);
  if (!factory) {
    throw new ProviderError('PROVIDER_NOT_CONFIGURED', `No adapter registered for "${adapterName}"`, false);
  }
  return factory();
}

/** Non-throwing variant for candidate filtering. */
export function tryAdapter(providerCode: string, adapterName: string): ProviderAdapter | null {
  try {
    return adapterFor(providerCode, adapterName);
  } catch {
    return null;
  }
}

/**
 * The REAL vendor adapter ignoring PROVIDER_MODE (no mock substitution).
 * Used by admin health/config checks so an unconfigured vendor can never
 * report a borrowed mock status as its own.
 */
export function liveAdapterFor(adapterName: string): ProviderAdapter | null {
  try {
    const factory = factories.get(adapterName);
    if (!factory) return null;
    const a = factory();
    // Explicit mock-* names are test doubles, not vendor adapters.
    if (a instanceof MockAdapter) return null;
    return a;
  } catch {
    return null;
  }
}

// Select providers for a service, ordered by priority then live success rate.
// Filters out: offline/maintenance status, unconfigured vendors (live mode),
// and vendors whose adapter does not declare the required operation.
export async function candidatesFor(serviceSlug: string) {
  const op: ProviderOp | null = opForService(serviceSlug);
  // `supports` may hold canonical ops (new) or legacy service slugs — match both.
  const providers = await Provider.find({
    $or: [{ supports: serviceSlug }, ...(op ? [{ supports: op }] : [])],
  }).sort({ priority: 1 }).lean();
  const usable = providers.filter((p: any) => {
    if (!['online', 'degraded', 'unknown'].includes(p.status)) return false;
    if (config.providerMode === 'live') {
      const adapter = tryAdapter(p.code, p.adapter);
      if (!adapter || !adapter.isConfigured()) return false;
      if (op) {
        const docSupports = p.supports as string[];
        const docSupportsOp = docSupports.includes(op) || docSupports.includes(serviceSlug);
        const adapterSupportsOp = adapter.supports.includes(op);
        if (!docSupportsOp || !adapterSupportsOp) return false;
      }
    }
    return true;
  });
  usable.sort((a: any, b: any) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    const ra = a.successCount + a.failCount === 0 ? 1 : a.successCount / (a.successCount + a.failCount);
    const rb = b.successCount + b.failCount === 0 ? 1 : b.successCount / (b.successCount + b.failCount);
    return rb - ra;
  });
  return usable;
}

export async function recordProviderOutcome(code: string, ok: boolean, latencyMs: number, err?: string) {
  try {
    const update: Record<string, any> = ok
      ? { $inc: { successCount: 1, totalResponseMs: latencyMs }, $set: { lastSuccessAt: new Date(), status: 'online' }, $unset: { lastError: '' } }
      : { $inc: { failCount: 1, totalResponseMs: latencyMs }, $set: { lastFailureAt: new Date(), lastError: err ?? 'error', status: 'degraded' } };
    await Provider.updateOne({ code }, update);
  } catch (e) {
    logger.warn('provider stats update failed', { code, e: String(e) });
  }
}
