# PROVIDER INTEGRATION

> Supersedes the mock-only revision. Full architecture: `docs/API_INTEGRATION_ARCHITECTURE.md`. Setup: `docs/PROVIDER_SETUP.md`.

## Adapter contract (`backend/src/providers/types.ts`)

```ts
interface ProviderAdapter {
  name: string;
  supports: ProviderOp[];          // canonical ops, e.g. 'nin.lookup'
  isConfigured(): boolean;         // false → engine routes around it
  requiresConfig(): string[];      // missing env names (never values)
  verify(req): Promise<ProviderResult>;  // sync op, honors req.timeoutMs
  status?(providerRef): Promise<...>;    // async vendors: poll by reference
  healthCheck(): Promise<{ online: boolean; latencyMs: number; detail?: string }>;
}
// Success: normalized { data, providerRef, costKobo, latencyMs }
// Failure: throw ProviderError(code, message, retryable, ambiguous?)
```

`retryable=false` (e.g. `INVALID_ID`, `OPERATION_UNSUPPORTED`) → recorded, **no failover**, no refund.
`retryable=true` (5xx/429/network) → next candidate; all exhausted → auto-refund.
`ambiguous=true` (timeout with unknown outcome) → in live mode the tx parks as `processing` for the reconciler; **never blind failover, never auto-refund**.

## Capabilities

Canonical ops (`PROVIDER_OPS`): `nin.lookup`, `nin.phone-lookup`, `nin.demographics`, `bvn.lookup`, `bvn.phone-lookup`, `cac.lookup`, `tin.lookup`, `jamb.lookup`. Service slugs map via `SERVICE_OPS`. In live mode a vendor adapter's `supports` is **derived from configured endpoint paths** — unset path = honestly unsupported.

## Adding a real provider (no business-logic rewrite)

1. Map the vendor's official auth, base URL and per-op paths into `{PREFIX}_*` env (see `docs/PROVIDER_SETUP.md`).
2. Restart backend; the adapter self-registers via `registerDefaults()`.
3. Confirm `POST /api/admin/providers/:code/health` → `configured: true`.
4. Set priority/timeout/supports on the Provider doc; set `status: online`.
5. Sandbox-test success/invalid/timeout per op.

## Mock behaviour (sandbox, `PROVIDER_MODE=mock`)

`MockAdapter` is deterministic: identity ending `00` → invalid, `99` → timeout, `55` → error, containing `LOWBAL` → low balance; else success with normalized mock data. `MOCK_MODE=success` forces success. Health checks and stats (`successCount/failCount/totalResponseMs`, `successRate`, `avgResponseMs`, low-balance flag) are visible in Admin → Providers. Unconfigured real vendors report `configured: false` with their exact missing vars — never a borrowed mock status.
