# API Integration Test Report

**Date**: September 2026 · **Backend**: `npm test` (vitest) · **Frontend**: `tsc --noEmit` + `vite build`

## Result: 41/41 backend tests pass · frontend typecheck + build clean

| Suite | Tests | Status |
|---|---|---|
| auth (login, profile) | 2 | ✅ |
| wallet + verification E2E (fund idempotent, debit-once, dup-key, timeout refund, insufficient, receipt/history) | 6 | ✅ |
| API platform (key create, v1 verify, bad key) | 1 | ✅ |
| concurrency + webhooks (atomic debits, payment replay, bulk) | 3 | ✅ |
| pin + 2fa + webhooks (PIN, TOTP, signed delivery, provider balance) | 4 | ✅ |
| admin (overview, pricing, manual credit, balance NOT_SUPPORTED) | 3 | ✅ |
| **money safety (new)**: failed-tx refund credits wallet + no double refund; 10-way same-key concurrency → 1 tx / 1 debit; `nin-phone-lookup` E2E; live-mode unconfigured-vendor skip | 4 | ✅ |
| **reconciler (new)**: stale `processing` → refunded + restored; `refund_pending` → retried → refunded | 2 | ✅ |
| **provider webhooks (new)**: signed finalize + idempotent replay; bad signature 401; failure → refund | 2 | ✅ |
| unit: money, pricing, masking, RBAC | 8 | ✅ (pre-existing) |
| unit (new): txStatus constants, vendor not-configured behavior, op mapping, HTTP 404/500 mapping, ambiguous timeout | 6 | ✅ |

## Notable findings fixed during QA
1. **Concurrent idempotency race reproduced live** (8 distinct txs from 10 concurrent same-key requests when the unique index was absent) → fixed by scoped compound index + E11000 replay path; the test now enforces single-debit.
2. **Boot-time `syncIndexes` fragility** (fails on legacy duplicates, can drop the old guard) → resilient `ensureIndexes` with dedupe + post-reset re-sync in the test harness.
3. **Test-side `updatedAt` backdating** defeated by Mongoose auto-touch → driver-level update in tests.
4. **Admin health borrowed mock status for unconfigured vendors** → honesty gate (`configured:false` + `requires[]`).

## E2E smoke (live server, mock mode)
Register → login → fund → NIN verify (`successful`, profit ₦100) → replay (`duplicate:true`, same tx) → history → admin overview/providers → health: mocks `online`, vendors `configured:false`. Demo wallet consistent throughout.

## Remaining (external blockers, not code)
Live vendor credentials + endpoint confirmation for Ninja/Dojah/Prembly/VerifyMe/IdentifyOrg; live payment gateway (Paystack/Flutterwave); Redis for multi-replica limiters; httpOnly refresh cookie.

## E2E browser suite (Playwright, added during Admin UI rebuild)

**9/9 pass in ~30s** (`frontend/e2e/`): landing + docs, admin dashboard/customers/providers, verifications list + detail modal, analytics + finance charts, mobile drawer nav, register → verify → login, wrong-password error, fund → NIN verify → receipt, failed-verification state. Fixes made while greening the suite (spec + app, no business-logic changes): login helpers wait for real navigation (the login form's own heading caused false positives); `NIN` label matched exactly (the form's `aria-label` also contains it); table-scoped `View` buttons (sidebar "Overview" toggle contains substring "view"); detail-modal test self-seeds a verification via API; layouts hoisted above routes (`Outlet`) so shells mount once; general API limiter 300 → 600/min/IP (env `API_RATE_LIMIT_PER_MIN`) after the suite proved 300 locked out brisk legitimate use — auth (60/15min) and per-key v1 (60/min) limits unchanged.
