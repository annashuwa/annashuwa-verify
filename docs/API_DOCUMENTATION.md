# API Documentation — NaijaVerify (implemented endpoints only)

Base URL: `http://localhost:4000` (dev). All responses are JSON: `{ success, data?, message?, code?, pagination? }`. Every error carries a stable `code` and `requestId`.

## Authentication

- Web sessions: `Authorization: Bearer <accessToken>` (15 min), refresh via `POST /api/auth/refresh`.
- External API: `Authorization: Bearer <prefix>.<secret>`, per-key rate limit (default 60/min), optional expiry + IP allowlist.

## Verifications

| Method & path | Auth | Notes |
|---|---|---|
| `POST /api/verify/:slug` | JWT | Header `Idempotency-Key` (recommended; web UI sends one per submit). Body = service fields (e.g. `{"nin":"…"}`). `201` created, `200` + `duplicate:true` on replay. |
| `POST /api/v1/verify/:slug` | API key | Same semantics, `channel: api`, API pricing, usage logged to `ApiLog`. |
| `GET /api/v1/services` | API key | Active + `apiEnabled` services with API prices. |

## Services / wallet / transactions

| Method & path | Auth | Notes |
|---|---|---|
| `GET /api/services[?category][?q]` | JWT | Public shape (no cost/provider internals). |
| `GET /api/services/:slug` | JWT | Same public shape + `terms`. |
| `GET /api/wallet` | JWT | `{ balanceKobo, pendingKobo }`. |
| `GET /api/wallet/ledger[?type][?page]` | JWT | Full ledger with before/after balances. |
| `POST /api/wallet/fund/initiate` | JWT | `{ amountKobo ≥ 10000 }` → `{ reference, … }`. |
| `POST /api/wallet/fund/verify` | JWT | `{ reference }` → credits once (idempotent). |
| `POST /api/webhooks/payment` | none | Gateway webhook, idempotent on `reference`. |
| `GET /api/transactions[?status][?service]` | JWT | Paginated history. |
| `GET /api/transactions/:txId` | JWT | Receipt incl. normalized `result`. |
| `GET /api/dashboard/summary` | JWT | Wallet + today spend + status counts + recent. |

## Bulk / referrals / support / notifications

`POST /api/bulk` (`{serviceSlug, rows[1..500]}` → `202 {jobId}`), `GET /api/bulk`, `GET /api/bulk/:jobId`, `GET /api/bulk/:jobId/export` (CSV) · `GET /api/referrals` · `GET/POST /api/support`, `POST /api/support/:ticketNo/reply` · `GET /api/notifications`, `POST /api/notifications/:id/read|read-all`.

## Auth

`POST /api/auth/register|verify-email|login|refresh|logout|forgot-password|reset-password|change-password|change-pin` · `GET/PATCH /api/auth/me` · `POST /api/auth/2fa/setup|enable|disable|verify` · `GET /api/auth/sessions`.

## Admin (RBAC-gated)

Overview, users CRUD/suspend/roles, manual wallet credit/debit, tx list + **refund** (`POST /api/admin/transactions/:txId/refund`), services CRUD/pricing, **providers CRUD + `POST /api/admin/providers/:code/health`** (returns `configured`, `requires[]` when inert) **+ `GET /api/admin/providers/:code/balance`** (live vendor float, or `NOT_SUPPORTED` — never fake), reports + CSV export, commissions, support reply, api-logs, audit, settings.

## Provider inbound webhooks (async vendors)

`POST /api/webhooks/provider/:code` — headers `x-pv-timestamp`, `x-pv-signature = HMAC_SHA256(secret, ts + "." + rawBody)`; body `{ providerRef, outcome: successful|failed, result?, costKobo?, errorCode?, errorMessage? }`. Only `processing` txs finalize; replays return `already:true`.

## Error codes (stable)

`VALIDATION_ERROR, UNAUTHENTICATED, INVALID_TOKEN, FORBIDDEN, INSUFFICIENT_BALANCE, SERVICE_NOT_FOUND, SERVICE_UNAVAILABLE, CHANNEL_DISABLED, NO_PROVIDER, INVALID_ID, PROVIDER_TIMEOUT, PROVIDER_ERROR, PROVIDER_RATE_LIMITED, PROVIDER_AUTH_FAILED, PROVIDER_LOW_BALANCE, PROVIDER_NOT_CONFIGURED, OPERATION_UNSUPPORTED, DUPLICATE-independent replay via duplicate:true, TX_NOT_FOUND, REFUND_NOT_ALLOWED, REFUND_DEFERRED, RECONCILED, INVALID_SIGNATURE, WEBHOOK_NOT_CONFIGURED, RATE_LIMITED, INTERNAL_ERROR`.
