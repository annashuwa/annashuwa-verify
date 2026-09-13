import { describe, it, expect } from 'vitest';
import { nairaToKobo, koboToNaira, formatNaira } from '../src/lib/money.js';
import { priceFor, profitFor } from '../src/services/pricing.js';
import { maskMiddle, maskNIN, maskPayload } from '../src/lib/mask.js';
import { hasPermission } from '../src/lib/rbac.js';

describe('money (integer kobo)', () => {
  it('converts without float errors', () => {
    expect(nairaToKobo(100)).toBe(10000);
    expect(nairaToKobo(0.1 + 0.2)).toBe(30);
    expect(koboToNaira(25000)).toBe(250);
  });
  it('formats naira', () => {
    expect(formatNaira(25450)).toContain('254.50');
  });
});

describe('pricing engine', () => {
  const svc: any = { priceKobo: 25000, resellerPriceKobo: 22000, apiPriceKobo: 20000, providerCostKobo: 15000 };
  it('picks role/channel price', () => {
    expect(priceFor(svc, 'customer', 'web')).toBe(25000);
    expect(priceFor(svc, 'reseller', 'web')).toBe(22000);
    expect(priceFor(svc, 'customer', 'api')).toBe(20000);
    expect(priceFor(svc, 'api_customer', 'web')).toBe(20000);
  });
  it('computes profit', () => {
    expect(profitFor(25000, 15000)).toBe(10000);
    expect(profitFor(10000, 15000)).toBe(0);
  });
});

describe('privacy masking', () => {
  it('masks NIN middle digits', () => {
    expect(maskNIN('12345678901')).toBe('123*****901');
  });
  it('masks payload sensitive keys', () => {
    const m = maskPayload({ nin: '12345678901', note: 'hello' });
    expect(m.nin).toContain('*');
    expect(m.note).toBe('hello');
  });
  it('maskMiddle short values', () => {
    expect(maskMiddle('ab')).toBe('**');
  });
});

describe('rbac', () => {
  it('grants admin everything, denies customer finance ops', () => {
    expect(hasPermission('admin', 'transactions.refund')).toBe(true);
    expect(hasPermission('customer', 'transactions.refund')).toBe(false);
    expect(hasPermission('finance', 'transactions.refund')).toBe(true);
    expect(hasPermission('support', 'transactions.refund')).toBe(false);
  });
});

describe('transaction status constants', () => {
  it('exposes a single shared lifecycle', async () => {
    const { TX_STATUS, TERMINAL_STATUSES, REFUNDABLE_STATUSES, isTerminal } = await import('../src/lib/txStatus.js');
    expect(TX_STATUS.SUCCESSFUL).toBe('successful');
    expect(TERMINAL_STATUSES.has('refunded')).toBe(true);
    expect(REFUNDABLE_STATUSES.has('failed')).toBe(true);
    expect(REFUNDABLE_STATUSES.has('processing')).toBe(false);
    expect(isTerminal('processing')).toBe(false);
  });
});

describe('vendor adapters (no credentials → never faked)', () => {
  it('reports not-configured with exact missing vars', async () => {
    delete process.env.NINJA_BASE_URL;
    delete process.env.NINJA_API_KEY;
    const { NinjaAdapter } = await import('../src/providers/ninja.js');
    const a = new NinjaAdapter();
    expect(a.isConfigured()).toBe(false);
    expect(a.requiresConfig()).toContain('NINJA_BASE_URL');
    expect(a.requiresConfig()).toContain('NINJA_API_KEY');
    expect(a.supports).toEqual([]);
    await expect(a.verify({ serviceSlug: 'nin-verification', op: 'nin.lookup', payload: { nin: '12345678901' }, timeoutMs: 8000 }))
      .rejects.toMatchObject({ code: 'PROVIDER_NOT_CONFIGURED' });
  });

  it('mock adapter declares all ops and stays configured', async () => {
    const { MockAdapter } = await import('../src/providers/mock.js');
    const m = new MockAdapter('mock-nin', 15000);
    expect(m.isConfigured()).toBe(true);
    expect(m.supports).toContain('nin.lookup');
    expect(m.supports).toContain('cac.lookup');
  });

  it('service slugs map to canonical ops', async () => {
    const { opForService } = await import('../src/providers/types.js');
    expect(opForService('nin-verification')).toBe('nin.lookup');
    expect(opForService('nin-phone-lookup')).toBe('nin.phone-lookup');
    expect(opForService('bvn-search')).toBe('bvn.phone-lookup');
    expect(opForService('nope')).toBeNull();
  });
});

describe('provider HTTP mapping', () => {
  async function withServer(handler: (req: any, res: any) => void, fn: (port: number) => Promise<void>) {
    const http = await import('node:http');
    const server = http.createServer(handler);
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    try {
      await fn((server.address() as any).port);
    } finally {
      server.close();
    }
  }
  it('maps 404 → INVALID_ID (non-retryable), 500/429 → retryable', async () => {
    const { providerHttp } = await import('../src/providers/http.js');
    await withServer((req, res) => {
      if (req.url === '/nf') {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'No record found' }));
      } else if (req.url === '/busy') {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end('{}');
      }
    }, async (port) => {
      await expect(providerHttp(`http://127.0.0.1:${port}/nf`, { timeoutMs: 5000, retries: 0, provider: 't', operation: 't' }))
        .rejects.toMatchObject({ code: 'INVALID_ID', retryable: false });
      await expect(providerHttp(`http://127.0.0.1:${port}/busy`, { timeoutMs: 5000, retries: 0, provider: 't', operation: 't' }))
        .rejects.toMatchObject({ code: 'PROVIDER_ERROR', retryable: true });
    });
  });
  it('maps hung upstream → ambiguous timeout', async () => {
    const { providerHttp } = await import('../src/providers/http.js');
    await withServer((_req, _res) => { /* never responds */ }, async (port) => {
      await expect(providerHttp(`http://127.0.0.1:${port}/hang`, { timeoutMs: 300, retries: 0, provider: 't', operation: 't' }))
        .rejects.toMatchObject({ code: 'PROVIDER_TIMEOUT', retryable: true, ambiguous: true });
    });
  }, 15000);
});
