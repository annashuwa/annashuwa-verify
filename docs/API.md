# API REFERENCE (v1 + web API)

Auth: session JWT `Authorization: Bearer <access>` (15m) + refresh rotation.
External API: `Authorization: Bearer <prefix>.<secret>`.
Idempotency: send `Idempotency-Key` header on POST verify endpoints.
Pagination: `?page=&limit=` (max 100). Errors: `{ success:false, message, code, requestId }`.

## Auth — `/api/auth`

| Method | Path | Notes |
|---|---|---|
| POST | `/register` | firstName,lastName,username,email,phone,password,confirmPassword,referralCode?,terms:true |
| POST | `/verify-email` | `{ token }` |
| POST | `/login` | `{ identifier (email\|username\|phone), password }` → access+refresh+user |
| POST | `/refresh` | `{ refreshToken }` → new access |
| POST | `/logout` | `{ refreshToken? , all? }` (auth) |
| POST | `/forgot-password` | always 200 (anti-enumeration) |
| POST | `/reset-password` | `{ token, password }`, revokes sessions |
| GET/PATCH | `/me` | profile (auth) |
| POST | `/change-password` | revokes sessions (auth) |
| POST | `/change-pin` | set/change 4–6 digit tx PIN (auth) |
| POST | `/2fa/setup` | stage TOTP secret → `{ secret, otpauthUrl }` (auth) |
| POST | `/2fa/enable` | `{ code }` activates 2FA (auth) |
| POST | `/2fa/disable` | `{ password }` deactivates (auth) |
| POST | `/2fa/verify` | `{ challengeId, code }` completes login (rate-limited) |
| GET | `/sessions` | active sessions (auth) |

## Catalog — `/api`

| Method | Path | Notes |
|---|---|---|
| GET | `/services?category=&q=` | active web services + role price (auth) |
| GET | `/services/:slug` | detail + price (auth) |
| GET/PATCH/POST | `/admin/services…` | CRUD + reprice + enable/disable (`services.*`) |

## Wallet / verification / transactions — `/api`

| Method | Path | Notes |
|---|---|---|
| GET | `/wallet`, `/wallet/ledger` | balance + statement (auth) |
| POST | `/wallet/fund/initiate` | `{ amountKobo ≥ ₦100 }` → reference |
| POST | `/wallet/fund/verify` | credits once; repeat = `Already credited` |
| POST | `/webhooks/payment` | idempotent gateway callback |
| POST | `/verify/:slug` | execute verification (auth, web pricing) |
| GET | `/transactions`, `/transactions/:txId` | history + receipt (auth) |
| GET | `/dashboard/summary` | wallet, spend, counts, recent (auth) |
| POST | `/admin/wallet/credit|debit` | manual, reason required (`wallet.*`, audited) |
| POST | `/admin/transactions/:txId/refund` | (`transactions.refund`, audited) |
| GET | `/admin/transactions` | filters (`transactions.read`) |

## Providers — `/api/admin/providers…`

CRUD, priority/status/balance config, per-provider `POST /:code/health`
(`providers.manage`). Failover order = priority, then success rate.

## Developer platform — `/api`

Session-auth: `GET/POST /api-keys`, `PATCH /api-keys/:id` (name, webhook
URL/secret, limits, IP allowlist), `POST /api-keys/:id/revoke|rotate`,
`GET /api-usage`. Outbound webhooks: signed `POST` (`x-nv-signature`
HMAC-SHA256, `x-nv-timestamp`) with `transaction.successful|failed|refunded`.
External versioned: `GET /v1/services`,
`POST /v1/verify/:slug` (API pricing, rate-limited, logged).

## Referrals / notifications / support / bulk — `/api`

`GET /referrals`, `GET /notifications` + read endpoints,
`GET/POST /support` + replies, `POST/GET /bulk` + `:jobId` + `:jobId/export`
(CSV, max 500 rows/job, async processing).

## Admin — `/api/admin`

`GET /overview` (users, revenue/profit, liability, series, providers),
`GET/PATCH /users…`, `GET /reports/summary` (sales vs funding vs refunds),
`GET /reports/export` (CSV), `GET /audit`, `GET/PUT /settings/:key`,
`GET /commissions`, `GET/POST /support…`, `GET /api-logs`.
