# API Integration Architecture — NaijaVerify

**Date**: September 2026
**Author**: Lead Backend / API Integration Engineering
**Status**: Living document — describes the as-built architecture after E2E provider integration.

---

## 1. Existing Architecture (verified by code inspection)

### 1.1 Stack
- **Frontend**: React 18 + TypeScript + Tailwind 4 + Vite 5 (`frontend/src/`). Dev server proxies `/api` → `http://localhost:4000`. State is local React state; API access via a single `lib/api.ts` client (JWT in `localStorage`, auto-refresh). **The frontend never calls third-party providers.**
- **Backend**: Node 24 + Express 4 + TypeScript + Mongoose 8 (`backend/src/`). Layered: routes → services → models → providers.
- **Database**: MongoDB 7 (`naija_verify`), with `USE_MEMORY_DB` fallback for dev/tests.
- **Money**: integer kobo everywhere. `₦100 = 10000 kobo`. Float math is banned in wallet code (`lib/money.ts`).

### 1.2 Canonical E2E request path

```
Customer UI                  NaijaVerify backend                          Vendors
─────────                    ──────────────────                          ───────
ServiceDetail.tsx
  │  POST /api/verify/:slug + Idempotency-Key
  ▼
routes/money.ts  ──▶  services/engine.ts (executeVerification)
                        │  1. service lookup + status/channel gate
                        │  2. field validation (service.fields)
                        │  3. idempotency replay → return original tx
                        │  4. priceFor(role, channel)
                        │  5. tx created as `processing`
                        │  6. atomic wallet debit (conditional $inc)
                        │  7. providers/registry.candidatesFor()
                        ▼
                   ProviderAdapter.verify()  ──▶  Ninja / Dojah / Prembly / VerifyMe / IdentifyOrg
                        │  (timeout-guarded, failover across candidates)
                        │  normalized ProviderResult { data, providerRef, costKobo, latencyMs }
                        ▼
                   tx finalized (successful|failed|refunded) ──▶ wallet finalized/refunded
                        │  ledger entries for every movement
                        │  referral commission, notification, signed webhook
                        ▼
Customer sees result → history (`/api/transactions`) → admin monitors (`/api/admin/*`)
```

### 1.3 Design invariants
1. Frontend talks to NaijaVerify backend only. Provider secrets live server-side (env).
2. Backend is the pricing source of truth — prices are never computed client-side.
3. Every wallet movement has a ledger record with `balanceBeforeKobo` + `balanceAfterKobo`.
4. One idempotency key ⇒ at most one debit per (user, service).
5. A transaction always ends in a terminal state or is picked up by the reconciler.

---

## 2. Existing Relevant Files

| Area | Files |
|---|---|
| App bootstrap | `backend/src/index.ts`, `app.ts`, `db.ts`, `config.ts`, `logger.ts` |
| Auth | `routes/auth.ts`, `middleware/common.ts` (JWT, RBAC, limiters), `lib/tokens.ts`, `lib/totp.ts`, `lib/rbac.ts` |
| Services catalog | `routes/catalog.ts`, `models/catalog.ts` (`Service`, `Provider`) |
| Wallet/money | `routes/money.ts`, `services/wallet.ts`, `lib/money.ts` |
| Verification engine | `services/engine.ts` |
| Providers | `providers/types.ts`, `providers/registry.ts` (`providers/index.ts` registers vendors), `providers/http.ts`, `providers/mock.ts`, `providers/ninja.ts`, `providers/dojah.ts`, `providers/prembly.ts`, `providers/verifyme.ts`, `providers/identifyorg.ts` |
| Reconciliation | `services/reconciler.ts` (wired in `index.ts`) |
| Models | `models/core.ts` (`User`, `Session`, `Wallet`, `Ledger`), `models/ops.ts` (`Transaction`, `ApiKey`, `ApiLog`, `BulkJob`, …) |
| Developer API | `routes/platform.ts`, `middleware/apiKey.ts` |
| Ops/bulk/support | `routes/ops.ts` |
| Admin | `routes/admin.ts` |
| Frontend verify flow | `frontend/src/pages/customer.tsx` (`ServiceDetail`), `platform.tsx` (API customers), `admin.tsx` (providers/services/tx) |

---

## 3. Existing Routes (all real, all documented in `docs/API_DOCUMENTATION.md`)

**Verifications**: `POST /api/verify/:slug` (web, JWT + `Idempotency-Key`), `POST /api/v1/verify/:slug` (API-key, versioned external API), `GET /api/v1/services`.
**Services**: `GET /api/services`, `GET /api/services/:slug` (public shape — cost fields stripped), `GET/POST/PATCH /api/admin/services`.
**Wallet**: `GET /api/wallet`, `GET /api/wallet/ledger`, `POST /api/wallet/fund/initiate|verify`, `POST /api/webhooks/payment` (idempotent funding webhook), `POST /api/admin/wallet/credit|debit`.
**Transactions**: `GET /api/transactions`, `GET /api/transactions/:txId`, `GET /api/dashboard/summary`, `GET /api/admin/transactions`, `POST /api/admin/transactions/:txId/refund`.
**Providers**: `GET/POST /api/admin/providers`, `PATCH /api/admin/providers/:code`, `POST /api/admin/providers/:code/health`.
**Provider inbound webhooks** (async vendors): `POST /api/webhooks/provider/:code` (signature-verified, idempotent, state-guarded) — `routes/webhooks.ts`.
**Auth**: register / verify-email / login (+2FA challenge) / refresh / logout / forgot / reset / me / change-password / PIN / 2FA setup-enable-disable / sessions.
**Ops**: notifications, referrals, support, bulk queue (`POST /api/bulk`, per-row idempotency keys).

---

## 4. Existing Models

- `User` (role, status, lockout, 2FA, PIN, referral) · `Session` (TTL index) · `Wallet` (`balanceKobo`, `pendingKobo`, unique per user) · `Ledger` (`type`, `amountKobo`, `balanceBeforeKobo`, `balanceAfterKobo`, unique `reference`, links `txId`).
- `Service` (slug unique; prices in kobo; `providerCostKobo`; `providers`; validation `fields`; `minRole`) · `Provider` (`code` unique; `adapter`; `status` incl. `maintenance`; `priority`; `supports[]` of **ops**; `balanceKobo`; `timeoutMs` override; `webhookSecret` name; stats).
- `Transaction` (unique `txId`; **scoped idempotency index** `(userId, serviceSlug, idempotencyKey)`; `TxStatus` enum; `providerRef` indexed; `reconcileAttempts`; stores normalized `result` + `rawProvider` minimized).
- `ApiKey` (prefix unique, sha256 secret, expiry, IP allowlist, per-key limit) · `ApiLog` (capped) · `BulkJob` · `PaymentTx` · `Commission` · `Setting` · `AuditLog` · `Notification` · `SupportTicket`.

---

## 5. Existing Wallet Flow

1. `getOrCreateWallet(userId)` lazily provisions.
2. `debitWallet` — single conditional `findOneAndUpdate({ userId, balanceKobo: { $gte } }, { $inc })`: **atomic, race-proof, no overdraft**; on success writes `debit` ledger with before/after balances.
3. `creditWallet` — conditional `$inc` + ledger (`credit|funding|refund|commission|manual_credit|reversal`).
4. Funding via mock gateway abstraction is idempotent on `reference` (`credited` flag); real gateways (Paystack/Flutterwave) plug into `services/payments.ts`.
5. No balance is ever mutated without a ledger record; liability = Σ wallet balances.

## 6. Existing Transaction Flow

States (`lib/txStatus.ts`, shared enum): `created → processing → successful | failed → refunded | refund_pending → refunded | reversed | cancelled`.
`successful|failed` from provider outcomes; `refunded` only after a credit ledger entry exists; never double-refund (status guard); `reversed` reserved for chargebacks.

## 7. Existing Service Flow

Services are **database documents**, not code. Admin CRUD + pricing + channel toggles + maintenance. Providers advertise supported **operations** (`supports: ['nin.lookup', ...]`); a provider is a candidate only if it supports the service's op **and is configured** (live credentials present) **and not in maintenance/offline**. NIN-first rollout proved the pattern; BVN/CAC/TIN reuse the same engine path.

## 8. Existing Provider Implementation

- `ProviderAdapter` contract: `name`, `supports[]` (declared ops), `isConfigured()`, `verify()` (sync), optional `status()` (async poll by `providerRef`), `healthCheck()`, `providerName`.
- `providers/http.ts`: timeout via `AbortController`, bounded retry (5xx/429/network only, max 1 retry by default), masked logging, vendor-error → stable `ProviderError{code, retryable}`.
- Registry: `registerProvider(name, factory)` at boot; `adapterFor(code, adapterName)`; `candidatesFor(serviceSlug, op?)` filters by status/config/op, sorts priority → success rate; `PROVIDER_MODE=mock|live` toggle — mock mode runs the deterministic `MockAdapter` (markers `00/99/55/LOWBAL`); live mode uses real adapters and **skips** `NOT_CONFIGURED` vendors so nothing is faked.
- Vendor adapters (`ninja/dojah/prembly/verifyme/identifyorg`): auth headers + endpoint paths are **env-configurable** (`*_BASE_URL`, `*_VERIFY_PATH`, per-op paths). No endpoint invented: until configured, `isConfigured()` is false and the engine routes around them (`PROVIDER_NOT_CONFIGURED`). Each file documents the exact credentials/docs still required.

## 9. Missing Components (residual, tracked as blockers)

1. **Live vendor credentials + endpoint confirmation** — no real calls can be made until each vendor's docs confirm auth, paths, request/response and error shapes. Adapters expose `isConfigured()` + per-op `requiresConfig()` to report exactly what is missing.
2. **Live payment gateway** (Paystack/Flutterwave) for wallet funding — abstraction ready, mock only.
3. **Multi-replica state** (in-memory v1 rate limiter, 2FA challenges) — needs Redis before horizontal scaling.
4. **Refresh token in httpOnly cookie** — currently localStorage (documented risk).

## 10. Files That Were Modified / Created

Created: `lib/txStatus.ts`, `providers/http.ts`, `providers/index.ts`, `providers/{ninja,dojah,prembly,verifyme,identifyorg}.ts`, `services/reconciler.ts`, `routes/webhooks.ts`, `docs/{API_INTEGRATION_ARCHITECTURE,API_DOCUMENTATION,PROVIDER_SETUP,API_INTEGRATION_TEST_REPORT}.md`.
Modified: `providers/{types,registry,mock}.ts`, `services/{engine,wallet}.ts`, `models/{catalog,core,ops}.ts`, `config.ts`, `routes/{catalog,ops}.ts`, `seed.ts`, `index.ts`, `db.ts`, `.env`, `.env.example`.

## 11. API Integration Plan (as executed)

Phase 0 harden money-safety on the mock stack → Phase 1 provider infra + first skeleton vendor → Phase 2 all vendors + op matrix + new service slugs → Phase 3 resilience (reconciler, webhook receiver, admin op controls) → Phase 4 full QA matrix → docs. Each phase verified with `typecheck`, tests, build.

## 12. Security Risks (residual)

Secrets server-side only (env); config-name allowlist for webhook secrets; masked logging; no raw provider payloads to customers; admin-gated providers; webhook HMAC verification with timestamp skew + replay guard. Remaining: localStorage refresh token, in-memory limiter for multi-replica, secrets-rotation runbook is operational (not coded).

## 13. Testing Plan

26 pre-existing tests kept green; new suites cover: idempotency replay + 20-way concurrency (one debit), failed-tx refund credit, not-configured skip, timeout mapping, reconciler stale/refund-pending resolution, webhook signature/idempotency/state-guard, `nin-phone-lookup` E2E. Full FX: `npm run typecheck`, `npm test`, frontend `tsc` + `vite build`, plus live smoke (register → fund → verify → history → admin).
