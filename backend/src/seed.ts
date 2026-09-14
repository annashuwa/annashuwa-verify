import bcrypt from 'bcryptjs';
import { connectDb, disconnectDb } from './db.js';
import { User } from './models/core.js';
import { getOrCreateWallet, creditWallet } from './services/wallet.js';
import { Service, Provider } from './models/catalog.js';
import { Setting } from './models/ops.js';
import { config } from './config.js';
import { logger } from './logger.js';
import { randomToken } from './lib/tokens.js';

const SERVICES = [
  {
    name: 'NIN Verification', slug: 'nin-verification', category: 'identity',
    description: 'Verify a National Identification Number against the national registry.',
    fields: [{ name: 'nin', label: 'NIN', type: 'text', required: true, minLength: 11, maxLength: 11, pattern: '^[0-9]{11}$' }],
    priceKobo: 25000, resellerPriceKobo: 22000, apiPriceKobo: 20000, providerCostKobo: 15000,
    providers: ['mock-nin-1', 'mock-nin-2'],
  },
  {
    name: 'NIN Validation', slug: 'nin-validation', category: 'identity',
    description: 'Validate NIN format and liveness without full demographic return.',
    fields: [{ name: 'nin', label: 'NIN', type: 'text', required: true, minLength: 11, maxLength: 11, pattern: '^[0-9]{11}$' }],
    priceKobo: 15000, resellerPriceKobo: 13000, apiPriceKobo: 12000, providerCostKobo: 8000,
    providers: ['mock-nin-1'],
  },
  {
    name: 'BVN Verification', slug: 'bvn-verification', category: 'identity',
    description: 'Verify a Bank Verification Number and retrieve holder details.',
    fields: [{ name: 'bvn', label: 'BVN', type: 'text', required: true, minLength: 11, maxLength: 11, pattern: '^[0-9]{11}$' }],
    priceKobo: 25000, resellerPriceKobo: 22000, apiPriceKobo: 20000, providerCostKobo: 15000,
    providers: ['mock-bvn-1'],
  },
  {
    name: 'BVN Search (Phone)', slug: 'bvn-search', category: 'identity',
    description: 'Search BVN records using a registered phone number.',
    fields: [{ name: 'phone', label: 'Phone number', type: 'phone', required: true, minLength: 10, maxLength: 14, pattern: '^\\+?[0-9]{10,14}$' }],
    priceKobo: 30000, resellerPriceKobo: 27000, apiPriceKobo: 25000, providerCostKobo: 18000,
    providers: ['mock-bvn-1'],
  },
  {
    name: 'CAC Verification', slug: 'cac-verification', category: 'business',
    description: 'Verify a business RC number with CAC records.',
    fields: [{ name: 'rcNumber', label: 'RC Number', type: 'text', required: true, minLength: 4, maxLength: 20 }],
    priceKobo: 50000, resellerPriceKobo: 45000, apiPriceKobo: 40000, providerCostKobo: 20000,
    providers: ['mock-cac-1'],
  },
  {
    name: 'TIN Verification', slug: 'tin-verification', category: 'business',
    description: 'Verify a Tax Identification Number.',
    fields: [{ name: 'tin', label: 'TIN', type: 'text', required: true, minLength: 8, maxLength: 20 }],
    priceKobo: 30000, resellerPriceKobo: 27000, apiPriceKobo: 25000, providerCostKobo: 12000,
    providers: ['mock-tin-1'],
  },
  {
    name: 'JAMB Verification', slug: 'jamb-verification', category: 'education',
    description: 'Verify a JAMB registration number.',
    fields: [{ name: 'regNumber', label: 'JAMB Reg Number', type: 'text', required: true, minLength: 6, maxLength: 20 }],
    priceKobo: 20000, resellerPriceKobo: 18000, apiPriceKobo: 15000, providerCostKobo: 10000,
    providers: ['mock-jamb-1'],
  },
  {
    name: 'NIN Phone Lookup', slug: 'nin-phone-lookup', category: 'identity',
    description: 'Retrieve the NIN linked to a registered phone number.',
    fields: [{ name: 'phone', label: 'Phone number', type: 'phone', required: true, minLength: 10, maxLength: 14, pattern: '^\\+?[0-9]{10,14}$' }],
    priceKobo: 30000, resellerPriceKobo: 27000, apiPriceKobo: 25000, providerCostKobo: 18000,
    providers: ['mock-nin-1'],
  },
  {
    name: 'NIN Demographic Search', slug: 'nin-demographics', category: 'identity',
    description: 'Search NIN records by name and date of birth.',
    fields: [
      { name: 'firstName', label: 'First name', type: 'text', required: true, minLength: 2, maxLength: 60 },
      { name: 'lastName', label: 'Last name', type: 'text', required: true, minLength: 2, maxLength: 60 },
      { name: 'dob', label: 'Date of birth', type: 'date', required: true },
    ],
    priceKobo: 30000, resellerPriceKobo: 27000, apiPriceKobo: 25000, providerCostKobo: 18000,
    providers: ['mock-nin-1'],
  },
];

const PROVIDERS = [
  { code: 'mock-nin-1', name: 'Mock NIN Primary', adapter: 'mock-nin', status: 'online', priority: 10, supports: ['nin.lookup', 'nin.phone-lookup', 'nin.demographics'], balanceKobo: 5000000, lowBalanceKobo: 500000 },
  { code: 'mock-nin-2', name: 'Mock NIN Failover', adapter: 'mock-nin', status: 'online', priority: 20, supports: ['nin.lookup'], balanceKobo: 3000000, lowBalanceKobo: 500000 },
  { code: 'mock-bvn-1', name: 'Mock BVN Provider', adapter: 'mock-bvn', status: 'online', priority: 10, supports: ['bvn.lookup', 'bvn.phone-lookup'], balanceKobo: 5000000, lowBalanceKobo: 500000 },
  { code: 'mock-cac-1', name: 'Mock CAC Provider', adapter: 'mock-cac', status: 'online', priority: 10, supports: ['cac.lookup'], balanceKobo: 2000000, lowBalanceKobo: 200000 },
  { code: 'mock-tin-1', name: 'Mock TIN Provider', adapter: 'mock-tin', status: 'online', priority: 10, supports: ['tin.lookup'], balanceKobo: 2000000, lowBalanceKobo: 200000 },
  { code: 'mock-jamb-1', name: 'Mock JAMB Provider', adapter: 'mock-jamb', status: 'online', priority: 10, supports: ['jamb.lookup'], balanceKobo: 2000000, lowBalanceKobo: 200000 },
  // Real vendors: registered but inert until credentials + endpoint paths are
  // mapped into env (see docs/PROVIDER_SETUP.md). In live mode the engine
  // routes around any vendor whose adapter reports isConfigured() === false.
  { code: 'ninja', name: 'Ninja', adapter: 'ninja', status: 'unknown', priority: 30, supports: ['nin.lookup', 'nin.phone-lookup', 'nin.demographics', 'bvn.lookup'], balanceKobo: 0, lowBalanceKobo: 0 },
  { code: 'dojah', name: 'Dojah', adapter: 'dojah', status: 'unknown', priority: 40, supports: ['nin.lookup', 'nin.phone-lookup', 'nin.demographics', 'bvn.lookup', 'bvn.phone-lookup', 'cac.lookup'], balanceKobo: 0, lowBalanceKobo: 0 },
  { code: 'prembly', name: 'Prembly', adapter: 'prembly', status: 'unknown', priority: 50, supports: ['nin.lookup', 'bvn.lookup', 'cac.lookup'], balanceKobo: 0, lowBalanceKobo: 0 },
  { code: 'verifyme', name: 'VerifyMe', adapter: 'verifyme', status: 'unknown', priority: 60, supports: ['nin.lookup', 'bvn.lookup', 'cac.lookup'], balanceKobo: 0, lowBalanceKobo: 0 },
  { code: 'identifyorg', name: 'IdentifyOrg', adapter: 'identifyorg', status: 'unknown', priority: 70, supports: ['nin.lookup', 'bvn.lookup'], balanceKobo: 0, lowBalanceKobo: 0 },
];

async function main() {
  await connectDb();
  for (const s of SERVICES) {
    await Service.findOneAndUpdate({ slug: (s as any).slug }, { $set: s }, { upsert: true });
  }
  for (const p of PROVIDERS) {
    await Provider.findOneAndUpdate({ code: (p as any).code }, { $set: p }, { upsert: true });
  }
  await Setting.findOneAndUpdate({ key: 'referral' }, { $set: { value: { percent: 5, minWithdrawalKobo: 100000 } } }, { upsert: true });

  let admin: any = await User.findOne({ email: config.seedAdminEmail.toLowerCase() });
  if (!admin) {
    admin = await User.create({
      firstName: 'Platform', lastName: 'Admin', username: 'admin',
      email: config.seedAdminEmail.toLowerCase(), phone: '08000000001',
      passwordHash: await bcrypt.hash(config.seedAdminPassword, 12),
      role: 'super_admin', status: 'active', emailVerified: true,
      referralCode: 'NV-ADMIN' + randomToken(2).toUpperCase(),
    });
    logger.info('seed admin created', { email: admin.email });
  } else {
    admin.role = 'super_admin'; admin.status = 'active'; admin.emailVerified = true;
    await admin.save();
  }
  await getOrCreateWallet(admin._id);

  // demo customer with funded wallet for E2E walkthroughs
  let demo: any = await User.findOne({ email: 'demo@example.com' });
  if (!demo) {
    demo = await User.create({
      firstName: 'Demo', lastName: 'Customer', username: 'demo',
      email: 'demo@example.com', phone: '08030000000',
      passwordHash: await bcrypt.hash('Demo123!', 12),
      role: 'customer', status: 'active', emailVerified: true,
      referralCode: 'NV-DEMO01',
    });
    await getOrCreateWallet(demo._id);
    await creditWallet(demo._id, 500000, 'Seed demo funding', 'funding', { seed: true });
    logger.info('demo customer created demo@example.com / Demo123!');
  }
  logger.info('seed complete');
  await disconnectDb();
}

main().catch(async (e) => {
  logger.error('seed failed', { error: String(e) });
  await disconnectDb();
  process.exit(1);
});
