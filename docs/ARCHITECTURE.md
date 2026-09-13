# ARCHITECTURE

## Overview

Modular monolith. One deployable backend, one SPA frontend, one MongoDB.

```
naija-verify/
  backend/src/
    index.ts            # boot: connect DB, listen
    app.ts              # express factory (used by server AND tests)
    config.ts           # env-based config
    db.ts               # mongoose connect (+ in-memory fallback, non-prod)
    logger.ts           # structured JSON logs, secret sanitiser
    lib/                # money (kobo), mask, rbac, tokens
    models/             # core.ts (User/Session/Wallet/Ledger)
                        # catalog.ts (Service/Provider)
                        # ops.ts (Transaction/ApiKey/ApiLog/Notification/Audit/Support/Bulk/Payment/Commission/Setting)
    providers/          # types.ts (Adapter interface + ProviderError)
                        # mock.ts (deterministic MockAdapter)
                        # registry.ts (adapter factory, candidate selection, stats)
    services/           # engine.ts (generic verification execution engine)
                        # wallet.ts (atomic ledger wallet), pricing.ts
                        # payments.ts (PaymentProvider abstraction + mock)
                        # notify.ts, audit.ts
    middleware/         # common.ts (requestId/auth/RBAC/rate-limit/errors), apiKey.ts
    routes/             # auth, catalog, money, platform, ops, admin
    seed.ts             # services, providers, settings, admin + demo user
  frontend/src/
    lib/api.ts          # fetch client + silent refresh
    components/ui.tsx   # layout, sidebar/drawer, form primitives
    pages/              # public, customer, platform, admin
  docs/                 # this documentation set
```

## Key design decisions

1. **Money in integer kobo everywhere.** No floats. Atomic `$inc` with a
   `balance >= amount` guard for debits (no negative balances, safe concurrency).
2. **Ledger, not balance edits.** Every movement writes a `Ledger` row with a
   unique reference and balance-after snapshot.
3. **Generic execution engine** (`services/engine.ts`): validate → idempotency
   check → price → create tx → atomic debit → provider failover → settle/refund
   → commission → notify. No per-service hardcoded flows.
4. **Provider adapters.** `ProviderAdapter` interface; `adapterFor()` factory
   instantiates real adapters when credentials exist, mocks otherwise.
   Failover only retries *retryable* errors (`ProviderError.retryable`);
   `INVALID_ID` never fails over.
5. **Pricing server-side.** `priceFor(service, role, channel)`; frontend only displays.
6. **API keys:** `prefix.secret`, SHA-256 hash stored, one-time display,
   rotation, expiry, IP allowlist, per-key per-minute limits, request logs.
7. **Refunds:** technical provider failures auto-refund; invalid IDs do not
   (service consumed); admin manual refunds audited.
8. **Reports separate funding from revenue.** Wallet funding = liability.
