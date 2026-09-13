# API Integration Audit — Connecting Real Nigerian Identity Providers

**Auditor role**: Senior Backend / API Integration Engineer
**Date**: September 2026
**Scope**: Full technical audit of the existing NaijaVerify platform to prepare safe, production-grade integration of real Nigerian identity verification providers (Ninja, Dojah, Prembly, VerifyMe and future vendors).
**Status**: AUDIT ONLY — no code modified. Awaiting approval before implementation.

---

## 1. Executive Summary

The NaijaVerify platform is a **mature, greenfield-built verification platform** with a real production-shaped core: wallet + ledger, atomic debits, transaction lifecycle, provider-failover engine, API-key developer portal, signed webhooks, RBAC, audit trails and an admin suite. It was deliberately built so that **real providers plug into an existing adapter seam** rather than requiring a rewrite.

However, **no real provider integration exists yet** — the provider layer is 100% mock. Beyond adding HTTP adapters, the audit identifies **five correctness holes that must be fixed before or during integration** to protect the wallet against duplicate charges and stuck funds:

1. An **idempotency TOCTOU race** that can produce a duplicate-key 500 instead of a safe replay response.
2. A **manual-refund bug**: refunding a `failed` transaction does **not** credit the wallet (only `successful` refunds credit), even though the customer was always debited up-front.
3. **No provider timeout / abort wrapper** at the HTTP layer and **no stale-`processing` reconciler** — a hung or crashed provider leaves customers charged with no result, and there is no process to resolve it.
4. **No per-operation capability model** — the adapter contract exposes a single `verify()` operation, so "NIN phone lookup", "BVN phone lookup" and "NIN demographic search" cannot be cleanly expressed as distinct capabilities that some providers have and others don't.
5. **Multi-document writes are not transactional** (wallet + ledger + tx + provider balance + commission + notification) — order-based safety today, which must become reconciliation-backed before real money.

Everything else required for safe provider integration — secrets kept server-side, hashed API keys, per-key rate limiting, webhook signing, RBAC-gated admin provider management, failover ordering — **already exists and is reusable as-is**.

---

## 2. What Already Exists (Complete & Reusable)

### 2.1 Backend architecture (complete)
`backend/src/` — Express 4 + TypeScript + Mongoose, layered cleanly:

| Layer | Files |
|---|---|
| Entry / app | `index.ts`, `app.ts`, `db.ts`, `logger.ts`, `config.ts` |
| Routes | `routes/auth.ts`, `routes/catalog.ts`, `routes/money.ts`, `routes/platform.ts`, `routes/ops.ts`, `routes/admin.ts` |
| Services | `services/engine.ts` (core), `wallet.ts`, `pricing.ts`, `payments.ts`, `notify.ts`, `audit.ts`, `webhooks.ts` |
| Providers | `providers/types.ts`, `registry.ts`, `mock.ts` |
| Models | `models/core.ts`, `catalog.ts`, `ops.ts` |
| Middleware | `middleware/common.ts` (auth, RBAC, limiter, error), `middleware/apiKey.ts` |
| Lib | `lib/tokens.ts`, `totp.ts`, `rbac.ts`, `money.ts`, `mask.ts` |
| Seed | `seed.ts` |

### 2.2 Frontend architecture (complete, no provider changes needed)
React 18 + TS + Vite, proxy `/api → :4000`. `lib/api.ts` stores **only JWTs** in localStorage (`nv_access` / `nv_refresh`) — no provider credentials ever touch the browser. Pages: public/customer/platform/admin. The frontend consumes the backend as sole source of truth; provider integration is entirely backend-side.

### 2.3 Provider seam (complete, already multi-provider capable)
- `providers/types.ts` — `ProviderAdapter { verify(req): Promise<ProviderResult>; healthCheck() }`, `ProviderError(code, message, retryable)`, `ProviderResult { ok, data, providerRef, costKobo, latencyMs }`.
- `providers/registry.ts` — `candidatesFor(serviceSlug)` selects `Provider` docs supporting a service, ordered by **priority then live success rate**; `recordProviderOutcome()` maintains per-provider success/fail/latency stats; `adapterFor(code, adapter)` is the vendor factory switch.
- `providers/mock.ts` — deterministic mock (see §9).
- Providers are **database records** (`models/catalog.ts` `Provider`), so vendor enablement/failover priority/supports are **editable at runtime via the admin API** — no code deploy per provider.

### 2.4 Core execution engine (complete)
`services/engine.ts` `executeVerification()`:
1. Service lookup + status/channel gating
2. Field validation (required, min/max length, regex) against the service definition
3. **Idempotency check** on `(userId, idempotencyKey)`
4. Price from `pricing.ts` (per role/channel)
5. `Transaction` created as `processing`
6. **Atomic wallet debit** (`findOneAndUpdate` with `balanceKobo: { $gte: amount }`)
7. Failover loop across candidates
8. Success → provider balance decrement, tx `successful`, notification, referrer commission, signed webhook
9. Exhaustion → **auto-refund** (retryable) or `failed` (non-retryable)
10. Manual refund (`refundTransaction`) for `successful`/`failed`

### 2.5 Wallet implementation (complete, atomic)
`services/wallet.ts` — single-document atomic debit via conditional `updateOne`; **concurrent verifications can never overdraw** (proven by an integration test). Ledger entries record `balanceAfterKobo` (auditable trail). Money as integer kobo. Storage of `funding/refund/commission/manual_credit/manual_debit/credit/reversal` ledger types already exists.

### 2.6 Transaction & status system (complete)
`models/ops.ts` — `created | pending | processing | successful | failed | refund_pending | refunded | reversed | cancelled`. Partial unique index already created on `(userId, idempotencyKey)`.

### 2.7 Pricing system (complete)
`services/pricing.ts` — per-channel (`web`/`api`) and per-role (`customer`/`reseller`/`api_customer`) prices stored per service; margin computed against `providerCostKobo`.

### 2.8 API / developer portal (complete)
`routes/platform.ts` + `middleware/apiKey.ts` — hashed API keys (`sha256`), prefix lookup, secret shown once, expiry, IP allowlist, per-key in-memory rate limit, usage stats, `PATCH` webhook config, revoke/rotate, versioned `/api/v1/*` with external key auth. **API keys never exposed to the frontend** beyond the one-time display at creation.

### 2.9 Admin dashboard backend (complete)
`routes/admin.ts`, `routes/catalog.ts` (admin sections) — overview aggregates, user mgmt, **provider CRUD + health check + priority/status**, service CRUD/pricing, transactions + refunds, reports (revenue strictly separated from funding liability), audit, commissions, support, api-logs, settings.

### 2.10 Authentication (complete)
`routes/auth.ts` + `lib/tokens.ts` + `lib/totp.ts` — JWT access/refresh with DB sessions, 5-strike lockout, TOTP 2FA, PIN, email verify flow, RBAC via `lib/rbac.ts`.

### 2.11 Environment configuration (partially complete)
`config.ts` reads all env; `.env` already contains **commented placeholders for real provider credentials** (`PROVIDER_NIN_API_URL/KEY`, `PROVIDER_BVN_*`, `PROVIDER_CAC_*`, `PAYSTACK_*`). The convention exists; no adapter consumes them yet.

---

## 3. What Is Partially Implemented

| Item | Status | Notes |
|---|---|---|
| Provider registry | Partial | Vendor factory is a **hardcoded `switch`** in `adapterFor()` (`registry.ts:8`) returning only `MockAdapter`. Must be edited per new vendor; not env/DRY driven; ignores `Provider.config`. |
| Provider health monitoring | Partial | Manual health endpoint works; **no periodic monitor** and no automatic circuit-breaker (provider only flips to `degraded` after one failure). |
| Timeout handling | Partial | Mock simulates timeouts; **no real HTTP timeout**, no `AbortController`, no overall execution budget. A hung upstream hangs the request and leaves `processing`. |
| Idempotency | Partial | Index + check exist; **TOCTOU race** (§6.1) and no duplicate-key catch returns a 500 instead of the original tx. Key not scoped by service. |
| NIN/BVN/CAC service definitions | Partial | 7 services exist (all mock-backed). **No NIN phone lookup, no NIN demographic search** slug yet; BVN phone search exists (`bvn-search`). |
| Refund handling | Partial | Auto-refund on retryable exhaustion works. **Manual refund of `failed` txs does not return money** (§6.2). `refund_pending` is never retried. |
| Bulk verification | Partial | Works, but per-row processing has **no idempotency keys** and no resume if the process dies mid-job. |
| Transactional safety | Partial | Single-doc ops are atomic; **multi-doc flows are not wrapped in Mongo sessions** and rely on ordering + unique indexes. |
| Rate limiting (API v1) | Partial | Per-key limiter is an **in-memory `Map`** (single instance, resets on restart). Fine for now; not multi-replica safe. |

---

## 4. What Is Missing (Gaps to Build)

1. **Real provider adapters** — `ninja.ts`, `dojah.ts`, `premblem.ts`, `verifyme.ts` (or `premby`/`verifyme`). Zero HTTP provider code exists.
2. **Shared provider HTTP client** — timeout/abort, bounded retries, vendor error → `ProviderError` mapping, response schema normalization, raw-body logging (masked).
3. **Dynamic registry registration** — adapters self-register; env-driven "mock vs live" toggle; per-provider `baseUrl`/credentials read from env (never DB).
4. **Capability / operation model** — `supports` already lists service slugs; needs an explicit **op → provider method** map (e.g. `nin.lookup`, `nin.phone-lookup`, `bvn.lookup`, `bvn.phone-lookup`, `nin.demographics`, `cac.lookup`) so a provider can advertise partial coverage.
5. **Async / reference-based results** — poll-by-`providerRef` support for providers that return a job ID (Prembly/PDF-based flows) — the interface is sync-only today.
6. **Reconciliation worker** — sweep `processing` txs older than N minutes: poll provider by `providerRef`, finalize success or refund; retry `refund_pending`; resolve `cancelled` after failed debits. **This is the single most important missing component.**
7. **Stale-request cleanup** — status transition guard (no double-finalize / double-refund).
8. **Customer-facing provider errors** without leaking internal provider details (today raw provider messages can surface).
9. **Test fixtures per vendor** — sandbox-mode replay for Ninja/Dojah/Prembly/VerifyMe so the whole wallet flow is testable without live credentials.

---

## 5. Existing Routes, Models & Logic That Can Be Reused (pointer table)

| Need | Reuse this | Location |
|---|---|---|
| Execute a verification (web channel) | `POST /api/verify/:slug` | `routes/money.ts:83` |
| Execute a verification (external API) | `POST /api/v1/verify/:slug` | `routes/platform.ts:135` |
| Provider CRUD / priority / status | `GET/POST /api/admin/providers*` | `routes/catalog.ts:88-147` |
| Health check trigger | `POST /api/admin/providers/:code/health` | `routes/catalog.ts:132` |
| Service CRUD + pricing | `GET/POST/PATCH /api/admin/services` | `routes/catalog.ts:60-85` |
| Manual refund | `POST /api/admin/transactions/:txId/refund` | `routes/money.ts:178` |
| Wallet + ledger | `GET /api/wallet`, `/api/wallet/ledger` | `routes/money.ts:17-32` |
| Wallet funding abstraction | `POST /api/wallet/fund/*` (independent of verification) | `routes/money.ts:35-80` |
| API keys (developer portal) | `/api/api-keys*`, `/api/v1/*` | `routes/platform.ts` |
| Webhooks | `services/webhooks.ts` signed delivery | `services/webhooks.ts` |
| Admin oversight | `/api/admin/overview`, `/api/admin/api-logs`, `/api/admin/audit` | `routes/admin.ts` |
| Models | `Service`, `Provider`, `Transaction`, `Wallet`, `Ledger`, `ApiKey`, `ApiLog`, `Notification`, `AuditLog`, `BulkJob`, `PaymentTx`, `Commission`, `Setting` | `models/catalog.ts`, `core.ts`, `ops.ts` |
| PII masking | `maskPayload` / `maskNIN` / `maskBVN` / `maskPhone` | `lib/mask.ts` |

---

## 6. Architectural Problems — Duplicate-Charge & Money-Safety Risks

### 6.1 CRITICAL — Idempotency TOCTOU race produces 500s on replay 🛑
`engine.ts:86-89` does a `findOne` then later `Transaction.create`. Two concurrent requests with the same idempotency key both pass the `findOne` (both see nothing), then the **second `create` hits the unique partial index → unhandled E11000 duplicate-key error → 500** to the client, instead of returning the original transaction. The client retrying a "failed" 500 can then create a **second, genuinely different charge**. Race is not protected; the response contract (200 + original tx) is not honored under concurrency.
**Fix**: wrap create in try/catch on `E11000`, then re-fetch and return the existing tx; also **scope the key by `serviceSlug`** in the index so one key can't be reused across services.

### 6.2 HIGH — Manual refund of `failed` transactions never credits the wallet 🛑
A customer is **always debited up-front** (`engine.ts:112`) before any provider call — including non-retryable `INVALID_ID` failures. `refundTransaction()` (`engine.ts:206-226`) **only credits the wallet when `tx.status === 'successful'`**; for `failed` it flips the status to `refunded` without returning money. So "refund" on a failed/invalid transaction is a **no-op credit** — the customer charged ₦250 gets "Refunded (invalid ID)" and nothing back. (This is separate from auto-refund, which correctly credits.)
**Fix**: refund must credit for **both** statuses (debit always preceded provider execution). Add integration test.

### 6.3 HIGH — No provider HTTP timeout; hung provider = charged + stuck 🔶
`engine.ts:128-157` calls `adapter.verify()` with no timeout/abort. A vendor that never responds leaves the request hanging, the wallet already debited, and the tx parked in `processing` forever. No global Express timeout either. The mock simulates timeouts but real HTTP is unbounded.
**Fix**: enforce a per-provider timeout (e.g. 8 s) via `AbortController`, a total failover budget (e.g. 3 attempts / ~15 s), and guarantee the failover loop always terminates to an outcome (auto-refund if all exhausted).

### 6.4 HIGH — No stale-`processing` reconciliation (funds can be lost or double-counted) 🔶
If the process crashes between provider success and `tx.save()`, or the provider response is lost on the wire, the transaction stays `processing`: wallet debited, vendor may have performed the check, customer has no result, no refund is ever issued. **There is no reaper.**
**Fix**: add `services/reconciler.ts` — sweep `processing` > N minutes; if tx has a `providerRef` and the adapter supports async status, query the vendor (idempotently) and finalize; otherwise auto-refund. Also retry `refund_pending`.

### 6.5 MEDIUM — Multi-document flows are not transactional
Debit + ledger (`wallet.ts`), tx create + debit, provider-balance decrement, commission, notification are separate writes. A ledger-write failure after a successful wallet `$inc` silently diverges wallet vs ledger. Today risk is low (single Mongo), but with real provider cost accounting the wallet↔ledger↔provider-balance must stay consistent.
**Fix (recommended)**: wrap wallet debit + ledger in a Mongo session transaction, and make the reconciler a compensating control. Keep the atomic conditional `$inc` (never a read-modify-write).

### 6.6 MEDIUM — Provider balance can go negative and is not rollback-safe
`engine.ts:137` `$inc` has no `$gte` guard, so a provider float can be driven negative. A crash between `verify()` success and tx save leaves the provider balance decremented with no compensating write.
**Fix**: guard balance decrement with `{ balanceKobo: { $gte: cost } }` and reconcile against the tx ledger.

### 6.7 MEDIUM — Bulk jobs can double-charge on retry; no resume
`routes/ops.ts:86-125` processes rows in-process with `setImmediate`, each row **without an idempotency key**. Crash/re-run patterns can charge rows twice. No resume: a dead job is dead.
**Fix**: per-row deterministic idempotency key (`BULK-{jobId}-{index}`), and make bulk processing a worker that survives restarts (or re-queues unprocessed rows).

### 6.8 LOW/MEDIUM — Service detail leaks margin and internal providers
`routes/catalog.ts:26-30` (`GET /api/services/:slug`) returns the **whole service doc**, including `providerCostKobo` (your cost/margin) and the internal `providers` array, to any authenticated customer. The list endpoint correctly strips these.
**Fix**: whitelist the fields exposed on the detail endpoint (same shape as the list endpoint).

---

## 7. Security Audit

| Area | Verdict | Notes |
|---|---|---|
| Provider credentials on frontend | ✅ SAFE | Never reach the browser; `lib/api.ts` only stores JWTs. `.env` placeholders exist; keep live secrets strictly server-side (env / secret manager). |
| API keys (developers) | ✅ SAFE | Stored as sha256; compared by prefix lookup; secret returned once. |
| Webhooks | ✅ SAFE | HMAC-SHA256 signed with `x-nv-signature`, timestamp + key header. |
| JWT refresh sessions | ✅ SAFE | Server-side sessions, revocable, rotation-safe. |
| **Refresh token in localStorage** | ⚠️ | XSS could exfiltrate refresh token. Recommend moving refresh into an httpOnly cookie for production hardening (out of current task scope but noted). |
| **Provider secrets written into `Provider.config`** | ⚠️ | `PATCH /api/admin/providers/:code` allows storing arbitrary `config` (including keys) in Mongo, and the admin GET returns it. Prefer env/secrets-only; if stored, mark never-return and restrict by role. |
| **Raw provider errors surfaced** | ⚠️ | Adapter messages can leak vendor internals; map vendor errors → stable public codes (`INVALID_ID`, `PROVIDER_TIMEOUT`, …) before responding. |
| Rate limiting | ⚠️ | Per-key limiter is in-memory; multi-replica deployments need Redis. Per-IP `apiLimiter` (300/min) exists. |
| 2FA challenge store | ⚠️ | In-memory `Map` — single fleet only. Not a correctness issue for one instance. |
| Body limits / helmet / CORS | ✅ SAFE | 256 kb JSON limit, helmet, CORS restricted to configured frontend origins. |

---

## 8. Recommended Provider Architecture

The existing seam is the right shape. Proposed evolution to natively support N providers and N operations without hard-coding any single vendor anywhere in the app:

```
                    ┌────────────────────────────────────────────────┐
                    │            Provider layer (backend)            │
                    │                                                │
 ┌──────────┐       │  ┌────────────┐   ┌─────────────────────────┐  │
 │  Engine   │──────▶│  │  Registry  │──▶│  ProviderAdapter (I/F)  │  │
 │ (core.ts) │       │  │ (dynamic,  │   │  verify()               │  │
 └──────────┘       │  │  env-aware)│   │  status()  [async ops]  │  │
                    │  └─────┬──────┘   │  healthCheck()           │  │
                    │        │          └────────────┬────────────┘  │
                    │  ┌─────▼───────────────────────┼─────────────┐ │
                    │  │  HTTP client (timeout/retry/abort, masked │ │
                    │  │  logging, error→ProviderError mapping)    │ │
                    │  └─────┬──────────┬──────────┬─────────┬─────┘ │
                    │        ▼          ▼          ▼         ▼       │
                    │   ninja.ts    dojah.ts  prembly.ts verifyme.ts│
                    │        ▲          ▲          ▲         ▲       │
                    └────────┼──────────┼──────────┼─────────┼───────┘
                             │   env: NINJA_*  DOJAH_*  PREMBLY_*  VERIFY_ME_*
                             └──────  (mock toggle = PROVIDER_MODE=mock|live)
```

### 8.1 Contracts (proposed)
```ts
// providers/types.ts (extended)
interface ProviderAdapter {
  name: string;
  supports: ProviderOp[];                 // e.g. ['nin.lookup','bvn.lookup', ...]
  verify(req: ProviderRequest): Promise<ProviderResult>;   // sync ops
  status?(providerRef: string): Promise<ProviderResult | 'pending'>; // async ops
  healthCheck(): Promise<{ online: boolean; latencyMs: number; detail?: string }>;
}

type ProviderOp =
  | 'nin.lookup' | 'nin.phone-lookup' | 'nin.demographics'
  | 'bvn.lookup' | 'bvn.phone-lookup'
  | 'cac.lookup' | 'tin.lookup' | 'jamb.lookup';
```
- A **service slug → op** mapping lives with the service (e.g. `nin-verification → nin.lookup`), and `Provider.supports` stores **ops** rather than raw slugs (or keeps slugs for compatibility and adds an internal op map). Adapters map their own endpoint names to these ops internally.
- It is valid for a vendor to advertise partial coverage (e.g. Ninja supports `nin.lookup` but not `bvn.lookup`). `candidatesFor(serviceSlug, op)` filters providers by op.

### 8.2 Dynamic registry (no hard-coded vendor anywhere else)
- `adapterFor()` switch is **replaced by a registration map**: `registerProvider('ninja', (cfg) => new NinjaAdapter(cfg))`, populated at boot from a small `providers/index.ts`.
- `Provider.adapter` remains the DB key (as today), so admin CRUD, priority, status and failover order keep working unchanged.
- Selections are still driven by `Service.providers` + priority + live success rate (existing logic reused).

### 8.3 Shared HTTP client (`providers/http.ts`)
- `request(opts, { timeoutMs, retries, headers })` with `AbortController`, bounded retry (e.g. 1 retry for 5xx/429/network), JSON in/out, **masked request/response logging** (`lib/mask.ts`), and vendor error → public `ProviderError(code, message, retryable)` mapping:
  - 4xx invalid input → `INVALID_ID` (retryable=false)
  - 429 / 5xx / timeout / network → retryable
  - provider wallet/depleted → `PROVIDER_LOW_BALANCE`
- Vendor adapters are thin: endpoint URL, auth header (Bearer/API key from env), request mapping, response normalization.

### 8.4 Credentials — env only (server-side)
Pattern per vendor in `.env` / `.env.example`:
```
PROVIDER_MODE=mock                      # mock | live ; switch without code changes
NINJA_BASE_URL=https://api.ninja.com/v1
NINJA_SECRET_KEY=sk_live_...
DOJAH_BASE_URL=https://api.dojah.io/api/v1
DOJAH_APP_ID=...
DOJAH_SECRET_KEY=sk_...
PREMBLY_BASE_URL=https://api.prembly.com/v1
PREMBLY_CLIENT_ID=...
PREMBLY_CLIENT_SECRET=...
VERIFYME_BASE_URL=https://api.verifyme.ng/v1
VERIFYME_API_KEY=...
PROVIDER_TIMEOUT_MS=8000
PROVIDER_MAX_RETRIES=1
```
`config.ts` exposes these; adapters read them at construction. Live keys are never logged, never returned in API responses, never written to Mongo.

### 8.5 Money-safety additions (built around existing primitives)
- **Idempotency**: fix §6.1; scope by `(userId, serviceSlug, idempotencyKey)`; on E11000 return the stored tx.
- **Timeouts**: per-provider timeout + total budget; failover always ends in a terminal state (§6.3).
- **Reconciler** (§6.4): 60 s interval sweep; finalize-via-`status()` for async providers; auto-refund otherwise; retry `refund_pending`; emits audit events.
- **Refund fix** (§6.2): credit for `failed` too; test.
- **Status guard**: transitions locked per status (no double-finalize/double-refund); use a `finalizeTx(txId, expectStatus)` single-statement update.
- **Provider balance**: guard with `$gte`; counts reconciled to tx ledger.

---

## 9. Existing Mock Behaviour (sandbox, keep as default)

`providers/mock.ts` stays as the **default `PROVIDER_MODE=mock`** so the full stack (wallet, failover, refunds, webhooks, admin) remains testable with zero credentials. Deterministic triggers by ID suffix:
- ending `00` → `INVALID_ID` (non-retryable, no failover, no refund today — see §6.2)
- ending `99` → `PROVIDER_TIMEOUT` (retryable → failover → auto-refund)
- ending `55` → `PROVIDER_ERROR` (retryable)
- containing `LOWBAL` → `PROVIDER_LOW_BALANCE`
- otherwise → success with plausible mock person data

---

## 10. Implementation Order (safest sequence)

> Principle: **harden money-safety first with the existing mock stack, then introduce one live adapter behind a toggle, then scale out vendors.** Each phase is independently testable and reversible.

**Phase 0 — Harden core (no provider code, all still mock)**
- Fix idempotency race + scope key by service (§6.1) — add concurrency test
- Fix manual-refund credit for `failed` (§6.2) — add test
- Add status transition guard / `finalizeTx`
- Add provider HTTP timeout budget util (used by adapters later)
- Add reconciler worker stub (`processing` sweep → auto-refund) (§6.4)
- Fix `GET /api/services/:slug` info leak (§6.8)

**Phase 1 — Provider infra + first live vendor (Ninja) sandboxed**
- `providers/http.ts` shared client (timeout/retry/error mapping)
- Dynamic registry + `PROVIDER_MODE` toggle
- `providers/ninja.ts` covering `nin.lookup`, `nin.phone-lookup`, `nin.demographics`
- Seed `Provider` doc `{ code:'ninja', adapter:'ninja', supports:[...], priority:10 }`, map to `nin-verification`, `nin-validation`
- Sandbox tests: success / invalid / timeout / 429 mapping + wallet refund path

**Phase 2 — More vendors + full operation matrix**
- `dojah.ts`, `premblem.ts`, `verifyme.ts`
- Add missing service slugs: `nin-phone-lookup`, `nin-demographics`, confirm `bvn-search`
- Per-vendor op coverage; failover across vendors for overlapping ops
- Mock↔live parity tests for every op

**Phase 3 — Production resilience**
- Redis-backed per-key rate limit + 2FA challenge store (multi-replica)
- Provider circuit breaker (consecutive-failure → offline, cooldown)
- Periodic provider health monitor
- Mongo session around wallet+ledger (§6.5); provider-balance `$gte` guard (§6.6)
- Bulk per-row idempotency + resume (§6.7)
- httpOnly refresh cookie hardening (optional, separate task)

**Phase 4 — QA matrix**
- Chaos tests: kill process mid-verification → reconciler resolves
- Concurrency: same idempotency key × 20 → one tx
- Double-click web verify without key → handled (documented debounce or server guard)
- All 26 existing tests still green; new per-vendor replay fixtures

---

## 11. Risks & Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Duplicate charge from idempotency race | High | Phase 0 fix + concurrency test |
| Refunded-but-not-credited (`failed`) | High | Phase 0 fix + test |
| Stuck `processing` funds | High | Reconciler (Phase 0 stub, Phase 1+ poll) |
| Vendor 429/5xx flapping failover load | Medium | Bounded retries, circuit breaker, jitter |
| Provider returns async job (no immediate result) | Medium | `status()` poll by `providerRef` |
| Vendor PII breach in logs | Medium | Masked logging via `lib/mask.ts` only |
| Margin/`providerCostKobo` leaked via API | Medium | Detail-endpoint whitelist |
| Secrets in DB via `Provider.config` | Medium | Env/secrets-only convention; never-return field |
| Multi-replica in-memory state (rate limit, 2FA) | Low→Med at scale | Redis in Phase 3 |
| Refresh token in localStorage | Low | httpOnly cookie (separate task) |

---

## 12. Exact Files That Will Need Modification

### Backend — modify
| File | Change |
|---|---|
| `backend/src/providers/types.ts` | Extend `ProviderAdapter` (ops, async `status`), op type |
| `backend/src/providers/registry.ts` | Dynamic registration map; op-aware `candidatesFor`; mock↔live toggle |
| `backend/src/services/engine.ts` | Idempotency race fix; refund-for-`failed` fix; timeout wrapping; finalize guard; reconciler trigger |
| `backend/src/config.ts` | Provider env keys, timeout/retry defaults |
| `backend/src/routes/catalog.ts` | Whitelist service-detail fields (remove cost/provider leak) |
| `backend/src/routes/platform.ts` | Pass through `PROVIDER_MODE` behavior (verify already generic) |
| `backend/src/routes/ops.ts` | Bulk per-row idempotency keys |
| `backend/src/models/ops.ts` | Index `(userId, serviceSlug, idempotencyKey)`; (optional) status-guard fields |
| `backend/src/models/catalog.ts` | (Optional) `Provider` fields: `baseUrl`, `timeoutMs`, op mapping, `maxFailures` |
| `backend/src/services/wallet.ts` | (Phase 3) Mongo session around debit+ledger |
| `backend/src/seed.ts` | Seed real-vendor `Provider` docs (adapter names) |
| `backend/.env` + `.env.example` | Live-provider credential vars (server-side only) |

### Backend — new
| File | Purpose |
|---|---|
| `backend/src/providers/http.ts` | Shared HTTP client: timeout, retry, abort, masked logging, error mapping |
| `backend/src/providers/ninja.ts` | Ninja adapter (`nin.lookup`, `nin.phone-lookup`, `nin.demographics`) |
| `backend/src/providers/dojah.ts` | Dojah adapter |
| `backend/src/providers/premblem.ts` | Prembly adapter (incl. async status if used) |
| `backend/src/providers/verifyme.ts` | VerifyMe adapter |
| `backend/src/services/reconciler.ts` | Stale-`processing` sweep, `refund_pending` retry, provider-status poll |

### Frontend
**No changes required.** Provider integration is entirely server-side; the UI already renders providers/services/pricing dynamically from the API. (Optional future: expose per-provider status in Admin → Providers, which already consumes `/api/admin/providers`.)

### Docs
| File | Change |
|---|---|
| `docs/PROVIDER_INTEGRATION.md` | Replace mock-only walkthrough with real-vendor steps + op matrix + toggle docs |
| `docs/API_INTEGRATION_AUDIT.md` | This document |

---

## 13. Verification Strategy (proposed)

- **Per-vendor replay fixtures**: sandbox mode records/replays canned vendor responses so wallet math is tested with zero live calls.
- **Concurrency test**: same idempotency key × 20 concurrent → exactly one debit. *(existing harness in `test/integration.test.ts` already covers "concurrent verifications never overdraw")*
- **Refund regression**: non-retryable failure → admin refund → wallet restored.
- **Kill-mid-flight test**: abort after debit, before save → reconciler resolves within interval.
- **Failover test**: `LOWBAL` primary + healthy secondary → secondary succeeds, no refund.
- **Existing gates**: `npm run test` (26 tests), `npm run typecheck`, `npm run build` all stay green at every phase.

---

**END OF AUDIT — no code has been modified. Awaiting approval to begin Phase 0.**