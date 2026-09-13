# TESTING

Backend: `cd backend && npm test` (vitest). Frontend: `npm run typecheck`, `npm run build`.

## Coverage (26 tests, all passing)

- **Unit (8):** kobo conversion/rounding, role/channel pricing, profit floor,
  NIN/payload masking, RBAC grants/denies.
- **Integration (14):** bad-login rejection, profile, mock funding + double-credit
  guard, successful debit-exactly-once, idempotent duplicate (no double charge),
  provider-timeout auto-refund (net-zero), insufficient-balance 402, receipt/history,
  API key create → v1 verify → bad-key 401, concurrent verifications never
  overdraw (4×₦250 on ₦1000 → 4 succeed, 2 get 402, balance exactly 0),
  webhook replay credits exactly once, bulk job (1 ok / 1 invalid → completed),
  PIN set/change (+wrong/rejected, +bad format), 2FA setup/enable/challenge
  login/wrong-code/disable round-trip, signed outbound webhook delivery
  (HMAC verified against capture server), provider balance decrements on success,
  admin overview + reprice + customer-forbidden, manual credit → ledger.

## Manual E2E (also executed live against :4000)

Register → verify → login → dashboard → fund → NIN success → duplicate →
timeout-refund → receipt → API key → v1 → bad-key → admin overview/audit/reports.
Results: wallet math exact (500000+500000−25000=975000), timeout net-zero,
API price 20000, funding (600000) ≠ revenue (90000).

## Sandbox markers

NIN ending `01` succeeds, `99` forces timeout+refund, `00` forces invalid-ID failure.
Minimum funding ₦100. Rate limits: auth 60/15min, API 300/min, per-key 60/min default.

## Gaps / next

Add a Playwright suite for critical UI paths (login→fund→verify→receipt) in CI.
