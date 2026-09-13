# DATABASE

MongoDB 7 via Mongoose. All money = integer kobo.

## Collections

| Collection | Purpose | Key indexes |
|---|---|---|
| `users` | accounts, roles, referral codes, lockout | unique email/username/phone/referralCode |
| `sessions` | hashed refresh tokens, device tracking | userId, TTL on expiresAt |
| `wallets` | one per user, balanceKobo/pendingKobo | unique userId |
| `ledgers` | every money movement, unique ref | (userId, createdAt), unique reference |
| `transactions` | verification lifecycle + masked I/O | unique txId; partial unique (userId, idempotencyKey) |
| `services` | catalogue + tiered prices + field schemas | unique slug; category+status |
| `providers` | adapters, priority, health counters | unique code; supports |
| `apikeys` | prefix + secretHash, allowlists | unique prefix; userId |
| `apilogs` | capped (50MB/100k) request log | createdAt |
| `notifications` | in-app inbox | (userId, createdAt) |
| `auditlogs` | admin/security trail | createdAt |
| `supporttickets` | tickets + replies | unique ticketNo |
| `bulkjobs` | CSV jobs + row results | unique jobId |
| `paymenttxes` | funding intents, idempotent credit | unique reference |
| `commissions` | referral payouts | referrerId |
| `settings` | platform config (referral %) | unique key |

## Integrity rules

- Debits: `findOneAndUpdate({ balanceKobo: { $gte: amount } }, { $inc })` — atomic, never negative.
- Credits/ledger: unique `reference` prevents double-credit (webhook replay safe).
- Idempotency: partial unique index only on string keys; engine omits the field when absent.
- Statuses: `created→pending→processing→successful|failed→refunded|reversed`; `cancelled` for unpaid.
- PII: only masked payloads stored (`requestMasked`); raw NIN/BVN never persisted.
