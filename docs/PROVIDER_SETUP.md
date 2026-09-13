# Provider Setup — NaijaVerify

How to activate real verification vendors (Ninja, Dojah, Prembly, VerifyMe, IdentifyOrg). No code deploy is required — everything is env config + admin records.

## 1. Modes

| `PROVIDER_MODE` | Behaviour |
|---|---|
| `mock` (default) | Deterministic test doubles for every vendor. Full E2E works with zero credentials. Test IDs: ending `00` → invalid, `99` → timeout, `55` → error, containing `LOWBAL` → low balance. |
| `live` | Real adapters. Vendors without credentials are **skipped** (`PROVIDER_NOT_CONFIGURED`); requests needing them auto-refund with `NO_PROVIDER`. Nothing is ever faked. |

## 2. Per-vendor variables

For vendor prefix `P` in `NINJA, DOJAH, PREMBLY, VERIFYME, IDENTIFYORG`:

```
P_BASE_URL=https://<official base url>      # required
P_API_KEY=<official secret>                 # required, server-side only
P_AUTH_HEADER=Authorization: Bearer {key}   # optional; {key} is substituted.
                                            # Dojah v1 example: "AppId: {key}"
P_METHOD=POST                               # GET|POST, default POST
P_ID_QUERY_PARAM=nin                        # GET id param (default per-op)
P_ID_BODY_FIELD=nin                         # POST id field (default per-op)
P_PATH_NIN_LOOKUP=/...                      # per-operation endpoint paths
P_PATH_NIN_PHONE=/...
P_PATH_NIN_DEMOGRAPHICS=/...
P_PATH_BVN_LOOKUP=/...
P_PATH_BVN_PHONE=/...
P_PATH_CAC=/...
P_PATH_TIN=/...
P_PATH_JAMB=/...
P_PATH_STATUS=/...                          # optional async status lookup
P_PATH_BALANCE=/...                         # optional → else NOT_SUPPORTED
P_PATH_HEALTH=/...                          # optional → else status assumed
P_DEFAULT_COST_KOBO=15000
```

A vendor activates when `BASE_URL` + `API_KEY` + **at least one** `PATH_*` is set. Capability = configured paths: an op is routable only if its path exists. Map paths from the vendor's **official** documentation — never guess.

Inbound async webhooks: set e.g. `NINJA_WEBHOOK_SECRET=<secret>` in env, then store the **name** `NINJA_WEBHOOK_SECRET` in the Provider doc's `webhookSecretName` field. The secret value never touches the DB.

## 3. Activation checklist (per vendor)

1. Copy official auth scheme, base URL, endpoint paths, request/response + error shapes from vendor docs into env.
2. Restart backend. Confirm `POST /api/admin/providers/:code/health` returns `configured: true`.
3. Sandbox-test each op: success, invalid ID (`INVALID_ID`, no failover, customer charged per pricing), timeout (reconciles, no blind failover).
4. Set `priority` (lower = tried first), `timeoutMs` override if needed, `supports` ops.
5. Set `status: online`. Keep `PROVIDER_MODE=mock` until at least one vendor is green, then switch to `live`.
6. Monitor `/api/admin/overview` (provider balances, success rates) and `/api/admin/api-logs`.

## 4. Priority / failover

Candidates per service: `status ∈ {online, degraded, unknown}` (never `offline`/`maintenance`), supports the op, configured → ordered by `priority`, then live success rate. Retryable vendor errors fail over; `INVALID_ID` stops failover; ambiguous timeouts in live mode park the tx as `processing` for the reconciler.

## 5. Pricing

`providerCostKobo` on the Service is the default cost; adapters override it when the vendor reports a real cost. Customer price tiers (`price/reseller/api`) are admin-editable; profit = price − cost, recorded per transaction.

## 6. What each vendor still needs

Until docs are mapped, every adapter reports its missing vars via `requiresConfig()` (also visible in the admin health response). Current state for all five vendors: **all vars missing → inert by design**.
