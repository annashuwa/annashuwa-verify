# PAYMENT INTEGRATION

`PaymentProvider` interface (`backend/src/services/payments.ts`):

```ts
interface PaymentProvider {
  initiate(userId: string, amountKobo: number): Promise<{ reference: string; amountKobo: number; accountHint?: string }>;
  verify(reference: string): Promise<{ paid: boolean; amountKobo: number }>;
}
```

Flow: `POST /wallet/fund/initiate` → `PaymentTx(pending)` → user pays →
`POST /wallet/fund/verify` **or** gateway `POST /webhooks/payment` →
`paymentProvider.verify()` → credit once (`credited` flag + unique ledger ref
make replays safe).

## Adding a real gateway (Paystack/Flutterwave/virtual accounts)

1. Implement the interface (create charge/resolve banks in `initiate`;
   server-side verify with secret key in `verify`).
2. Swap the exported `paymentProvider` (select via `PAYMENT_PROVIDER` env).
3. Verify webhook signatures with the gateway secret (see
   `verifyWebhookSignature` stub) and keep the idempotent processing block unchanged.
4. Never trust client-asserted amounts: always re-verify server-side.
