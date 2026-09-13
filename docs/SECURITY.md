# SECURITY

## Implemented

- **Passwords:** bcrypt (cost 12). **Tx PIN:** bcrypt-hashed 4–6 digit PIN.
- **2FA:** TOTP (RFC 6238, SHA-1/30s/±1 window, dependency-free) with
  challenge-based login (`/2fa/verify`, 5-min challenges), timing-safe compare.
- **Tokens:** short-lived access JWT (15m) + rotating refresh JWTs (7d) stored
  **hashed** in `sessions` with revocation (logout, password change, lockout).
- **Brute force:** 5-strike lockout (15 min), auth rate limiter (60/15min),
  global API limiter (300/min), per-key limits, request size cap (256kb).
- **RBAC:** 8 roles, 20 granular permissions; backend-enforced per route
  (`requirePerm`); frontend nav is cosmetic only. Super-admin guard for
  super-admin edits.
- **API keys:** random `prefix.secret`, SHA-256 stored, one-time display,
  rotation, expiry, IP allowlist.
- **Input:** zod validation on all mutating routes, field patterns/lengths on
  services, pagination caps, multer-free (no arbitrary file uploads; bulk via JSON).
- **Headers/CORS:** helmet, allowlisted `FRONTEND_URL` origins, credentials mode.
- **Injection/XSS:** Mongoose (no string queries), no `$where`, masked logs via
  `sanitize()`, no stack traces in production, request IDs for tracing.
- **Secrets:** `.env` never committed (`.env.example` documents everything);
  provider/payment credentials only via env.
- **Money safety:** atomic debits, idempotent credits/webhooks/idempotency keys,
  kobo integers.
- **Privacy:** masked storage/display of NIN/BVN/phone; audit trails on all
  admin money/config actions; retention/deletion possible per-collection.

## Operator responsibilities

- Set strong `JWT_*_SECRET` (≥32 chars), `NODE_ENV=production`, real `MONGODB_URI`.
- Terminate TLS at reverse proxy; set `trust proxy` accordingly.
- Rotate `SEED_ADMIN_*` after first login; enable 2FA when added (architecture ready).
- Back up MongoDB; monitor provider `lowBalanceKobo` alerts and failed-tx dashboards.
- No claim of NDPR/legal compliance: review retention windows and consent copy
  with counsel before handling real citizen data.
