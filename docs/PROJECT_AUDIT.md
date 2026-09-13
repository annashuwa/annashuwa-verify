# PROJECT AUDIT — Initial Repository Inspection

Date: 2026-09-12
Workspace: `C:\Users\ANNASHUWA\Documents\Default Project`

## 1. Current architecture (before this build)

The workspace root is a shared folder containing **unrelated projects** — there was
**no existing Nigerian verification platform codebase** to preserve or migrate:

| Entry | What it is |
|---|---|
| `annashuwa-vtu/` | Separate VTU/airtime top-up app (Next.js + Expo + Prisma). Unrelated. |
| `annashuwa-printing-solution/` | Separate printing business project. Unrelated. |
| `dataintel/` | Separate Vite analytics app. Unrelated. |
| `school-management/` | Separate school app. Unrelated. |
| `neon-void/`, `Setup/` | Miscellaneous. Unrelated. |
| `*.log`, `README-Tareeq.md`, `FOODMARKET-E2E-PROMPTS.md`, `*.pine` | Stray files from other work. |

Conclusion: **greenfield build**. A new self-contained folder `naija-verify/` was
created so none of the existing projects were touched, renamed, or broken.

## 2. Existing features / routes / models / auth (verification domain)

None. Nothing to reuse, nothing to migrate, no credentials or provider contracts found.

## 3. Problems / bugs / security issues found in the (non-existent) target codebase

N/A — greenfield. The risks were therefore:

- Scope creep across 65 requirement sections → mitigated with a modular monolith.
- No MongoDB tooling (`mongosh`, Docker absent) → backend supports `MONGODB_URI`
  with a safe in-memory fallback for dev/test; a local MongoDB 7 instance was
  discovered on `127.0.0.1:27017` and used for tests/seed.
- Flaky npm network → dependencies installed with retries; lockfiles committed.

## 4. Bugs discovered DURING the build (all fixed)

1. **Idempotency unique-index collision (critical, fixed).**
   `Transaction.create()` with `idempotencyKey: undefined` was serialised as
   `null` by the MongoDB driver, colliding on the sparse unique index
   `(userId, idempotencyKey)` for every transaction without a key.
   Fix: only persist the field when provided + changed the index to
   `partialFilterExpression: { idempotencyKey: { $type: 'string' } }`.
   Caught by the integration suite (`API platform` test), verified fixed (19/19 pass).
2. **Duplicate Mongoose index warnings** (`users.email`, `users.referralCode`
   declared `unique` and indexed twice) — removed redundant declarations.
3. **Dashboard summary dead aggregate** — removed a placeholder `$match` stage.
4. **Admin `/api-logs` double import** — simplified to a single dynamic import.
5. **Backend `tsconfig` rootDir conflict** with `test/` — removed `rootDir`
   restriction; corrected `start` script to `node dist/src/index.js`.
6. **Tests hitting persistent local DB** — `beforeAll` now drops the test
   database for isolation.

## 5. Recommended architecture (implemented)

Modular monolith: `backend/` (Express + TypeScript + Mongoose, `/api/v1`
versioned external API), `frontend/` (React + TS + Tailwind, Vite),
`docs/`, Dockerfiles + compose. Details in `ARCHITECTURE.md`.
