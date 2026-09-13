import 'dotenv/config';

function req(name: string, fallback = ''): string {
  const v = process.env[name] ?? fallback;
  return v;
}

export const config = {
  env: req('NODE_ENV', 'development'),
  port: Number(req('PORT', '4000')),
  frontendUrl: req('FRONTEND_URL', 'http://localhost:5173'),
  mongoUri: req('MONGODB_URI', 'mongodb://127.0.0.1:27017/naija_verify'),
  useMemoryDb: req('USE_MEMORY_DB', 'true') === 'true',
  jwtAccessSecret: req('JWT_ACCESS_SECRET', 'dev-access-secret-please-change-32c'),
  jwtRefreshSecret: req('JWT_REFRESH_SECRET', 'dev-refresh-secret-please-change-32c'),
  jwtAccessTtl: req('JWT_ACCESS_TTL', '15m'),
  jwtRefreshTtlDays: Number(req('JWT_REFRESH_TTL_DAYS', '7')),
  apiRateLimitPerMin: Number(req('API_RATE_LIMIT_PER_MIN', '600')),
  mockMode: req('MOCK_MODE', 'mixed'),
  mockLatencyMs: Number(req('MOCK_DEFAULT_LATENCY_MS', '120')),
  paymentProvider: req('PAYMENT_PROVIDER', 'mock'),
  // Provider layer: 'mock' runs deterministic test doubles for every vendor;
  // 'live' uses real adapters and skips vendors without credentials.
  providerMode: req('PROVIDER_MODE', 'mock'),
  providerTimeoutMs: Number(req('PROVIDER_TIMEOUT_MS', '8000')),
  providerMaxRetries: Number(req('PROVIDER_MAX_RETRIES', '1')),
  providerRetryDelayMs: Number(req('PROVIDER_RETRY_DELAY_MS', '750')),
  // Reconciliation of stale transactions (processing / refund_pending).
  reconcileIntervalMs: Number(req('RECONCILE_INTERVAL_MS', '60000')),
  reconcileStaleAfterMs: Number(req('RECONCILE_STALE_AFTER_MS', '120000')),
  reconcileMaxAttempts: Number(req('RECONCILE_MAX_ATTEMPTS', '10')),
  // In live mode, ambiguous provider timeouts stay `processing` for the
  // reconciler instead of auto-refunding (the vendor may have completed).
  reconcileAmbiguous: req('RECONCILE_AMBIGUOUS', 'true') === 'true',
  // Inbound provider webhook verification.
  webhookMaxSkewMs: Number(req('WEBHOOK_MAX_SKEW_MS', '300000')),
  seedAdminEmail: req('SEED_ADMIN_EMAIL', 'admin@example.com'),
  seedAdminPassword: req('SEED_ADMIN_PASSWORD', 'Admin123!'),
  isProd: (process.env.NODE_ENV ?? '') === 'production',
};
