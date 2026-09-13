import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app.js';
import { connectDb, disconnectDb, ensureIndexes } from '../src/db.js';
import { User } from '../src/models/core.js';
import { Service, Provider } from '../src/models/catalog.js';
import { Transaction } from '../src/models/ops.js';
import { getOrCreateWallet, creditWallet, debitWallet } from '../src/services/wallet.js';
import { reconcileOnce } from '../src/services/reconciler.js';
import { config } from '../src/config.js';
import { randomToken } from '../src/lib/tokens.js';

const app = createApp();
let access = '';
let userId = '';
let adminAccess = '';

async function registerLogin(email: string, password: string, role = 'customer') {
  const uname = 'u' + randomToken(3).replace(/[^a-z0-9]/gi, 'x').toLowerCase();
  await request(app).post('/api/auth/register').send({
    firstName: 'Test', lastName: 'User', username: uname, email, phone: '080' + Math.floor(10000000 + Math.random() * 89999999),
    password, confirmPassword: password, terms: true,
  }).expect(201);
  // verify email via token lookup
  const u: any = await User.findOne({ email });
  await request(app).post('/api/auth/verify-email').send({ token: u.emailVerifyToken }).expect(200);
  if (role !== 'customer') {
    u.role = role;
    await u.save();
  }
  const login = await request(app).post('/api/auth/login').send({ identifier: email, password }).expect(200);
  return { token: login.body.data.accessToken, id: String(u._id) };
}

beforeAll(async () => {
  process.env.USE_MEMORY_DB = 'true';
  await connectDb();
  const { default: mongoose } = await import('mongoose');
  await mongoose.connection.db!.dropDatabase();
  // Rebuild schema indexes AFTER the reset — the boot-time sync runs before
  // the drop, so without this the suite would run with no uniqueness guard.
  await ensureIndexes();
  await Service.findOneAndUpdate({ slug: 'nin-verification' }, {
    $set: {
      name: 'NIN Verification', slug: 'nin-verification', category: 'identity', description: 'test',
      fields: [{ name: 'nin', label: 'NIN', type: 'text', required: true, minLength: 11, maxLength: 11, pattern: '^[0-9]{11}$' }],
      priceKobo: 25000, resellerPriceKobo: 22000, apiPriceKobo: 20000, providerCostKobo: 15000,
      status: 'active', webEnabled: true, apiEnabled: true, providers: ['t-nin-1'],
    },
  }, { upsert: true });
  await Provider.findOneAndUpdate({ code: 't-nin-1' }, {
    $set: { code: 't-nin-1', name: 'Test NIN', adapter: 'mock-nin', status: 'online', priority: 10, supports: ['nin-verification'], balanceKobo: 1000000, lowBalanceKobo: 1000 },
  }, { upsert: true });

  const a = await registerLogin('admin-t@example.com', 'Admin123!', 'super_admin');
  adminAccess = a.token;
  const c = await registerLogin('cust-t@example.com', 'Customer123!');
  access = c.token;
  userId = c.id;
  await getOrCreateWallet(userId);
  await creditWallet(userId, 200000, 'test funding', 'funding', { test: true });
}, 90000);

afterAll(async () => {
  await disconnectDb();
});

describe('auth', () => {
  it('rejects bad credentials', async () => {
    await request(app).post('/api/auth/login').send({ identifier: 'cust-t@example.com', password: 'wrong' }).expect(401);
  });
  it('returns profile', async () => {
    const r = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${access}`).expect(200);
    expect(r.body.data.email).toBe('cust-t@example.com');
  });
});

describe('wallet + verification E2E', () => {
  it('funds via mock gateway and credits once (idempotent webhook)', async () => {
    const init = await request(app).post('/api/wallet/fund/initiate').set('Authorization', `Bearer ${access}`).send({ amountKobo: 100000 }).expect(201);
    const ref = init.body.data.reference;
    await request(app).post('/api/wallet/fund/verify').set('Authorization', `Bearer ${access}`).send({ reference: ref }).expect(200);
    const again = await request(app).post('/api/wallet/fund/verify').set('Authorization', `Bearer ${access}`).send({ reference: ref }).expect(200);
    expect(again.body.message).toMatch(/Already credited/);
    const w = await request(app).get('/api/wallet').set('Authorization', `Bearer ${access}`).expect(200);
    expect(w.body.data.balanceKobo).toBeGreaterThanOrEqual(300000);
  });

  it('successful NIN verification debits exactly once', async () => {
    const before = (await request(app).get('/api/wallet').set('Authorization', `Bearer ${access}`)).body.data.balanceKobo;
    const r = await request(app).post('/api/verify/nin-verification')
      .set('Authorization', `Bearer ${access}`)
      .set('Idempotency-Key', 'idem-success-1')
      .send({ nin: '12345678901' }).expect(201);
    expect(r.body.data.status).toBe('successful');
    const after = (await request(app).get('/api/wallet').set('Authorization', `Bearer ${access}`)).body.data.balanceKobo;
    expect(before - after).toBe(25000);
  });

  it('duplicate idempotency key does not double-charge', async () => {
    const before = (await request(app).get('/api/wallet').set('Authorization', `Bearer ${access}`)).body.data.balanceKobo;
    const r = await request(app).post('/api/verify/nin-verification')
      .set('Authorization', `Bearer ${access}`)
      .set('Idempotency-Key', 'idem-success-1')
      .send({ nin: '12345678901' }).expect(200);
    expect(r.body.duplicate).toBe(true);
    const after = (await request(app).get('/api/wallet').set('Authorization', `Bearer ${access}`)).body.data.balanceKobo;
    expect(after).toBe(before);
  });

  it('provider timeout auto-refunds (NIN ending 99)', async () => {
    const before = (await request(app).get('/api/wallet').set('Authorization', `Bearer ${access}`)).body.data.balanceKobo;
    const r = await request(app).post('/api/verify/nin-verification')
      .set('Authorization', `Bearer ${access}`)
      .send({ nin: '12345678999' }).expect(201);
    expect(['refunded', 'failed']).toContain(r.body.data.status);
    const after = (await request(app).get('/api/wallet').set('Authorization', `Bearer ${access}`)).body.data.balanceKobo;
    // auto-refund: net zero movement
    expect(after).toBe(before);
  });

  it('insufficient balance rejected without side effects', async () => {
    const poor = await registerLogin('poor-t@example.com', 'Customer123!');
    await getOrCreateWallet(poor.id);
    const r = await request(app).post('/api/verify/nin-verification')
      .set('Authorization', `Bearer ${poor.token}`)
      .send({ nin: '12345678901' }).expect(402);
    expect(r.body.code).toBe('INSUFFICIENT_BALANCE');
  });

  it('receipt + history available', async () => {
    const list = await request(app).get('/api/transactions').set('Authorization', `Bearer ${access}`).expect(200);
    expect(list.body.data.length).toBeGreaterThan(0);
    const txId = list.body.data[0].txId;
    await request(app).get(`/api/transactions/${txId}`).set('Authorization', `Bearer ${access}`).expect(200);
  });
});

describe('API platform', () => {
  it('creates key, calls v1 verify, rejects bad key', async () => {
    const created = await request(app).post('/api/api-keys').set('Authorization', `Bearer ${access}`).send({ name: 'test key' }).expect(201);
    const apiKey = created.body.data.apiKey;
    const ok = await request(app).post('/api/v1/verify/nin-verification')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({ nin: '22345678901' }).expect(201);
    expect(ok.body.data.status).toBe('successful');
    await request(app).post('/api/v1/verify/nin-verification')
      .set('Authorization', 'Bearer nv_live_dead.beef')
      .send({ nin: '22345678901' }).expect(401);
    const txs = await Transaction.countDocuments({ userId, channel: 'api' });
    expect(txs).toBeGreaterThanOrEqual(1);
  });
});

describe('concurrency + webhooks', () => {
  it('concurrent verifications never overdraw (atomic debits)', async () => {
    const u = await registerLogin('race-t@example.com', 'Customer123!');
    await getOrCreateWallet(u.id);
    await creditWallet(u.id, 100000, 'race funding', 'funding', { test: true });
    const attempts = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        request(app).post('/api/verify/nin-verification')
          .set('Authorization', `Bearer ${u.token}`)
          .send({ nin: `7710000001${i}` })
          .then((r) => r.status)
      )
    );
    const ok = attempts.filter((s) => s === 201).length;
    const rejected = attempts.filter((s) => s === 402).length;
    expect(ok).toBe(4); // 4 × ₦250 = ₦1000 exactly
    expect(rejected).toBe(2);
    const w = await request(app).get('/api/wallet').set('Authorization', `Bearer ${u.token}`);
    expect(w.body.data.balanceKobo).toBe(0);
  });

  it('webhook replay credits exactly once', async () => {
    const init = await request(app).post('/api/wallet/fund/initiate')
      .set('Authorization', `Bearer ${access}`).send({ amountKobo: 50000 }).expect(201);
    const ref = init.body.data.reference;
    const before = (await request(app).get('/api/wallet').set('Authorization', `Bearer ${access}`)).body.data.balanceKobo;
    await request(app).post('/api/webhooks/payment').send({ reference: ref }).expect(200);
    const replay = await request(app).post('/api/webhooks/payment').send({ reference: ref }).expect(200);
    expect(replay.body.message).toMatch(/Already processed/);
    const after = (await request(app).get('/api/wallet').set('Authorization', `Bearer ${access}`)).body.data.balanceKobo;
    expect(after - before).toBe(50000);
  });

  it('bulk job processes rows and completes', async () => {
    const r = await request(app).post('/api/bulk')
      .set('Authorization', `Bearer ${access}`)
      .send({ serviceSlug: 'nin-verification', rows: [{ nin: '52345678901' }, { nin: '52345678900' }] })
      .expect(202);
    // poll for completion (background processor)
    let job: any = null;
    for (let i = 0; i < 20; i++) {
      await new Promise((res) => setTimeout(res, 300));
      const g = await request(app).get(`/api/bulk/${r.body.data.jobId}`).set('Authorization', `Bearer ${access}`);
      if (g.body.data.status === 'completed') {
        job = g.body.data;
        break;
      }
    }
    expect(job).toBeTruthy();
    expect(job.total).toBe(2);
    expect(job.succeeded).toBe(1); // ...901 ok, ...900 invalid
    expect(job.failed).toBe(1);
  }, 30000);
});

describe('pin + 2fa + webhooks', () => {
  it('sets and changes transaction PIN', async () => {
    await request(app).post('/api/auth/change-pin')
      .set('Authorization', `Bearer ${access}`).send({ newPin: '1234' }).expect(200);
    await request(app).post('/api/auth/change-pin')
      .set('Authorization', `Bearer ${access}`).send({ currentPin: '0000', newPin: '5678' }).expect(401);
    await request(app).post('/api/auth/change-pin')
      .set('Authorization', `Bearer ${access}`).send({ currentPin: '1234', newPin: '5678' }).expect(200);
    await request(app).post('/api/auth/change-pin')
      .set('Authorization', `Bearer ${access}`).send({ currentPin: '5678', newPin: '12' }).expect(400);
  });

  it('2FA setup/enable/challenge-login/disable', async () => {
    const { currentCode } = await import('../src/lib/totp.js');
    const setup = await request(app).post('/api/auth/2fa/setup')
      .set('Authorization', `Bearer ${access}`).send({}).expect(200);
    expect(setup.body.data.secret).toBeTruthy();
    await request(app).post('/api/auth/2fa/enable')
      .set('Authorization', `Bearer ${access}`).send({ code: '000000' }).expect(401);
    await request(app).post('/api/auth/2fa/enable')
      .set('Authorization', `Bearer ${access}`).send({ code: currentCode(setup.body.data.secret) }).expect(200);
    // password login now returns a challenge instead of tokens
    const ch = await request(app).post('/api/auth/login')
      .send({ identifier: 'cust-t@example.com', password: 'Customer123!' }).expect(200);
    expect(ch.body.data.twoFactorRequired).toBe(true);
    await request(app).post('/api/auth/2fa/verify')
      .send({ challengeId: ch.body.data.challengeId, code: '000000' }).expect(401);
    const ok = await request(app).post('/api/auth/2fa/verify')
      .send({ challengeId: ch.body.data.challengeId, code: currentCode(setup.body.data.secret) }).expect(200);
    expect(ok.body.data.accessToken).toBeTruthy();
    // disable restores plain login
    await request(app).post('/api/auth/2fa/disable')
      .set('Authorization', `Bearer ${ok.body.data.accessToken}`).send({ password: 'Customer123!' }).expect(200);
    const plain = await request(app).post('/api/auth/login')
      .send({ identifier: 'cust-t@example.com', password: 'Customer123!' }).expect(200);
    expect(plain.body.data.accessToken).toBeTruthy();
  });

  it('delivers signed webhooks on transaction success', async () => {
    const http = await import('node:http');
    const { signWebhook } = await import('../src/services/webhooks.js');
    let captured: any = null;
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        captured = { body, sig: req.headers['x-nv-signature'], ts: req.headers['x-nv-timestamp'] };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{}');
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as any).port;
    try {
      const created = await request(app).post('/api/api-keys')
        .set('Authorization', `Bearer ${access}`).send({ name: 'webhook key' }).expect(201);
      await request(app).patch(`/api/api-keys/${created.body.data.id}`)
        .set('Authorization', `Bearer ${access}`)
        .send({ webhookUrl: `http://127.0.0.1:${port}/hook`, webhookSecret: 'whsec_test' })
        .expect(200);
      await request(app).post('/api/verify/nin-verification')
        .set('Authorization', `Bearer ${access}`)
        .send({ nin: '62345678901' }).expect(201);
      for (let i = 0; i < 25 && !captured; i++) await new Promise((r) => setTimeout(r, 200));
      expect(captured).toBeTruthy();
      const payload = JSON.parse(captured.body);
      expect(payload.event).toBe('transaction.successful');
      expect(signWebhook('whsec_test', String(captured.ts), captured.body)).toBe(String(captured.sig));
    } finally {
      server.close();
    }
  });

  it('provider balance decrements on success', async () => {
    const { Provider } = await import('../src/models/catalog.js');
    const before: any = await Provider.findOne({ code: 't-nin-1' }).lean();
    await request(app).post('/api/verify/nin-verification')
      .set('Authorization', `Bearer ${access}`)
      .send({ nin: '72345678901' }).expect(201);
    const after: any = await Provider.findOne({ code: 't-nin-1' }).lean();
    expect(after.balanceKobo).toBe(before.balanceKobo - 15000);
  });
});

describe('admin', () => {
  it('overview + price change + disable service', async () => {
    await request(app).get('/api/admin/overview').set('Authorization', `Bearer ${adminAccess}`).expect(200);
    const svc: any = await Service.findOne({ slug: 'nin-verification' });
    await request(app).patch(`/api/admin/services/${svc._id}`).set('Authorization', `Bearer ${adminAccess}`).send({ priceKobo: 30000 }).expect(200);
    const updated: any = await Service.findOne({ slug: 'nin-verification' });
    expect(updated.priceKobo).toBe(30000);
    // customer forbidden from admin route
    await request(app).get('/api/admin/overview').set('Authorization', `Bearer ${access}`).expect(403);
    // restore
    await request(app).patch(`/api/admin/services/${svc._id}`).set('Authorization', `Bearer ${adminAccess}`).send({ priceKobo: 25000 }).expect(200);
  });

  it('manual credit creates ledger + audit', async () => {
    await request(app).post('/api/admin/wallet/credit').set('Authorization', `Bearer ${adminAccess}`).send({ userId, amountKobo: 5000, reason: 'test credit' }).expect(200);
    const { Ledger } = await import('../src/models/core.js');
    const entry = await Ledger.findOne({ userId, type: 'manual_credit' });
    expect(entry).toBeTruthy();
  });

  it('provider balance reports NOT_SUPPORTED instead of fake data', async () => {
    await Provider.findOneAndUpdate({ code: 't-ninja-1' }, {
      $set: { code: 't-ninja-1', name: 'T Ninja', adapter: 'ninja', status: 'unknown', priority: 10, supports: ['t-ninja-only'], balanceKobo: 0, lowBalanceKobo: 0 },
    }, { upsert: true });
    const r = await request(app).get('/api/admin/providers/t-ninja-1/balance')
      .set('Authorization', `Bearer ${adminAccess}`).expect(200);
    expect(r.body.data.supported).toBe(false);
    expect(r.body.data.detail).toBe('NOT_SUPPORTED');
  });
});

describe('money safety (provider integration hardening)', () => {
  it('manual refund of a FAILED transaction credits the wallet', async () => {
    // invalid NIN (...00) => non-retryable failure; customer was debited upfront
    const before = (await request(app).get('/api/wallet').set('Authorization', `Bearer ${access}`)).body.data.balanceKobo;
    const r = await request(app).post('/api/verify/nin-verification')
      .set('Authorization', `Bearer ${access}`)
      .set('Idempotency-Key', `idem-fail-${Date.now()}`)
      .send({ nin: '12345678900' }).expect(201);
    expect(r.body.data.status).toBe('failed');
    const charged = (await request(app).get('/api/wallet').set('Authorization', `Bearer ${access}`)).body.data.balanceKobo;
    expect(before - charged).toBe(25000);
    // admin refund must return the money (regression: failed refunds credited nothing)
    const refund = await request(app).post(`/api/admin/transactions/${r.body.data.txId}/refund`)
      .set('Authorization', `Bearer ${adminAccess}`).send({ reason: 'qa' }).expect(200);
    expect(refund.body.data.status).toBe('refunded');
    const after = (await request(app).get('/api/wallet').set('Authorization', `Bearer ${access}`)).body.data.balanceKobo;
    expect(after).toBe(before);
    // second refund is rejected (no double refund)
    await request(app).post(`/api/admin/transactions/${r.body.data.txId}/refund`)
      .set('Authorization', `Bearer ${adminAccess}`).send({ reason: 'qa again' }).expect(409);
  });

  it('concurrent identical idempotency keys charge exactly once', async () => {
    const key = `idem-race-${Date.now()}`;
    const before = (await request(app).get('/api/wallet').set('Authorization', `Bearer ${access}`)).body.data.balanceKobo;
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        request(app).post('/api/verify/nin-verification')
          .set('Authorization', `Bearer ${access}`)
          .set('Idempotency-Key', key)
          .send({ nin: '32345678901' })
      )
    );
    const txIds = new Set(results.map((r) => r.body?.data?.txId).filter(Boolean));
    expect(txIds.size).toBe(1); // every response refers to the same transaction
    const after = (await request(app).get('/api/wallet').set('Authorization', `Bearer ${access}`)).body.data.balanceKobo;
    expect(before - after).toBe(25000); // exactly one debit
  });

  it('nin-phone-lookup service works end to end', async () => {
    await Service.findOneAndUpdate({ slug: 'nin-phone-lookup' }, {
      $set: {
        name: 'NIN Phone Lookup', slug: 'nin-phone-lookup', category: 'identity', description: 'test',
        fields: [{ name: 'phone', label: 'Phone number', type: 'phone', required: true, minLength: 10, maxLength: 14 }],
        priceKobo: 30000, resellerPriceKobo: 27000, apiPriceKobo: 25000, providerCostKobo: 18000,
        status: 'active', webEnabled: true, apiEnabled: true, providers: ['t-nin-1'],
      },
    }, { upsert: true });
    await Provider.findOneAndUpdate({ code: 't-nin-1' }, { $addToSet: { supports: 'nin.phone-lookup' } });
    const before = (await request(app).get('/api/wallet').set('Authorization', `Bearer ${access}`)).body.data.balanceKobo;
    const r = await request(app).post('/api/verify/nin-phone-lookup')
      .set('Authorization', `Bearer ${access}`)
      .set('Idempotency-Key', `idem-ph-${Date.now()}`)
      .send({ phone: '08031234567' }).expect(201);
    expect(r.body.data.status).toBe('successful');
    expect(r.body.data.result.operation).toBe('nin.phone-lookup');
    const after = (await request(app).get('/api/wallet').set('Authorization', `Bearer ${access}`)).body.data.balanceKobo;
    expect(before - after).toBe(30000);
  });

  it('live mode routes around unconfigured vendors (no fake results)', async () => {
    await Service.findOneAndUpdate({ slug: 't-ninja-only' }, {
      $set: {
        name: 'T Ninja Only', slug: 't-ninja-only', category: 'identity', description: 'test',
        fields: [{ name: 'nin', label: 'NIN', type: 'text', required: true, minLength: 11, maxLength: 11 }],
        priceKobo: 25000, resellerPriceKobo: 22000, apiPriceKobo: 20000, providerCostKobo: 15000,
        status: 'active', webEnabled: true, apiEnabled: true, providers: ['t-ninja-1'],
      },
    }, { upsert: true });
    await Provider.findOneAndUpdate({ code: 't-ninja-1' }, {
      $set: { code: 't-ninja-1', name: 'T Ninja', adapter: 'ninja', status: 'online', priority: 10, supports: ['t-ninja-only'], balanceKobo: 0, lowBalanceKobo: 0 },
    }, { upsert: true });
    const prev = config.providerMode;
    (config as any).providerMode = 'live';
    try {
      const before = (await request(app).get('/api/wallet').set('Authorization', `Bearer ${access}`)).body.data.balanceKobo;
      const r = await request(app).post('/api/verify/t-ninja-only')
        .set('Authorization', `Bearer ${access}`)
        .set('Idempotency-Key', `idem-skip-${Date.now()}`)
        .send({ nin: '42345678901' }).expect(201);
      expect(r.body.data.errorCode).toBe('NO_PROVIDER'); // skipped, not faked
      const after = (await request(app).get('/api/wallet').set('Authorization', `Bearer ${access}`)).body.data.balanceKobo;
      expect(after).toBe(before); // auto-refunded, net zero
    } finally {
      (config as any).providerMode = prev;
    }
  });
});

describe('reconciler', () => {
  it('refunds a stale processing transaction and restores the wallet', async () => {
    await debitWallet(userId, 25000, 'reconcile test debit', { txId: 'TX-RECON-1' });
    const mid = (await request(app).get('/api/wallet').set('Authorization', `Bearer ${access}`)).body.data.balanceKobo;
    const tx = await Transaction.create({
      txId: 'TX-RECON-1', userId, serviceSlug: 'nin-verification',
      amountKobo: 25000, providerCostKobo: 15000, profitKobo: 10000,
      status: 'processing', requestMasked: {}, channel: 'web',
    });
    // Backdate via the driver: Mongoose updateOne would auto-touch updatedAt.
    await Transaction.collection.updateOne({ txId: 'TX-RECON-1' }, { $set: { updatedAt: new Date(Date.now() - 10 * 60 * 1000) } });
    const stats = await reconcileOnce();
    expect(stats.refunded).toBeGreaterThanOrEqual(1);
    const done: any = await Transaction.findOne({ txId: 'TX-RECON-1' }).lean();
    expect(done.status).toBe('refunded');
    const after = (await request(app).get('/api/wallet').set('Authorization', `Bearer ${access}`)).body.data.balanceKobo;
    expect(after).toBe(mid + 25000);
    void tx;
  });

  it('retries refund_pending until credited', async () => {
    await Transaction.create({
      txId: 'TX-RECON-2', userId, serviceSlug: 'nin-verification',
      amountKobo: 5000, providerCostKobo: 1500, profitKobo: 3500,
      status: 'refund_pending', requestMasked: {}, channel: 'web',
    });
    await Transaction.collection.updateOne({ txId: 'TX-RECON-2' }, { $set: { updatedAt: new Date(Date.now() - 10 * 60 * 1000) } });
    const before = (await request(app).get('/api/wallet').set('Authorization', `Bearer ${access}`)).body.data.balanceKobo;
    await reconcileOnce();
    const done: any = await Transaction.findOne({ txId: 'TX-RECON-2' }).lean();
    expect(done.status).toBe('refunded');
    const after = (await request(app).get('/api/wallet').set('Authorization', `Bearer ${access}`)).body.data.balanceKobo;
    expect(after).toBe(before + 5000);
  });
});

describe('provider inbound webhooks', () => {
  const secret = 'whsec_test_provider';
  process.env.T_TEST_WH_SECRET = secret;
  async function signed(code: string, body: any, ts = String(Date.now())) {
    const { default: crypto } = await import('node:crypto');
    const raw = JSON.stringify(body);
    const sig = crypto.createHmac('sha256', secret).update(`${ts}.${raw}`).digest('hex');
    return { raw, ts, sig };
  }
  it('finalizes a processing tx on signed successful webhook (idempotent replay)', async () => {
    await Provider.findOneAndUpdate({ code: 't-webhook-1' }, {
      $set: { code: 't-webhook-1', name: 'T Webhook', adapter: 'mock-nin', status: 'online', priority: 10, supports: ['nin-verification'], balanceKobo: 1000000, lowBalanceKobo: 1000, webhookSecretName: 'T_TEST_WH_SECRET' },
    }, { upsert: true });
    await Transaction.create({
      txId: 'TX-WHOOK-1', userId, serviceSlug: 'nin-verification', providerCode: 't-webhook-1',
      providerRef: 'REF-WH-1', amountKobo: 25000, providerCostKobo: 15000, profitKobo: 10000,
      status: 'processing', requestMasked: {}, channel: 'web',
    });
    const body = { providerRef: 'REF-WH-1', outcome: 'successful', result: { verified: true }, costKobo: 15000 };
    const { ts, sig } = await signed('t-webhook-1', body);
    const first = await request(app).post('/api/webhooks/provider/t-webhook-1')
      .set('x-pv-timestamp', ts).set('x-pv-signature', sig).send(body).expect(200);
    expect(first.body.finalized).toBe(true);
    const done: any = await Transaction.findOne({ txId: 'TX-WHOOK-1' }).lean();
    expect(done.status).toBe('successful');
    // replay is idempotent
    const replay = await request(app).post('/api/webhooks/provider/t-webhook-1')
      .set('x-pv-timestamp', ts).set('x-pv-signature', sig).send(body).expect(200);
    expect(replay.body.already).toBe(true);
  });

  it('rejects tampered signatures and refunds on provider failure', async () => {
    await request(app).post('/api/webhooks/provider/t-webhook-1')
      .set('x-pv-timestamp', String(Date.now())).set('x-pv-signature', 'deadbeef').send({ providerRef: 'REF-WH-1', outcome: 'successful' }).expect(401);
    await debitWallet(userId, 5000, 'webhook fail test', { txId: 'TX-WHOOK-2' });
    await Transaction.create({
      txId: 'TX-WHOOK-2', userId, serviceSlug: 'nin-verification', providerCode: 't-webhook-1',
      providerRef: 'REF-WH-2', amountKobo: 5000, providerCostKobo: 1500, profitKobo: 3500,
      status: 'processing', requestMasked: {}, channel: 'web',
    });
    const before = (await request(app).get('/api/wallet').set('Authorization', `Bearer ${access}`)).body.data.balanceKobo;
    const body = { providerRef: 'REF-WH-2', outcome: 'failed', errorCode: 'INVALID_ID', errorMessage: 'No record' };
    const { ts, sig } = await signed('t-webhook-1', body);
    const r = await request(app).post('/api/webhooks/provider/t-webhook-1')
      .set('x-pv-timestamp', ts).set('x-pv-signature', sig).send(body).expect(200);
    expect(r.body.refunded).toBe(true);
    const after = (await request(app).get('/api/wallet').set('Authorization', `Bearer ${access}`)).body.data.balanceKobo;
    expect(after).toBe(before + 5000);
  });
});
