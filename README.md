# NaijaVerify — Nigerian Identity Verification & API Platform

Modern, secure, mobile-first verification platform: wallet-funded NIN / BVN /
CAC / TIN / JAMB checks, provider failover, developer API with keys & logs,
referrals, and a full admin suite. Original branding and code — no third-party
assets copied.

## Monorepo

- `backend/` — Node 20, Express 4, TypeScript, Mongoose. REST + `/api/v1`.
- `frontend/` — React 18, TypeScript, Tailwind 4, Vite, react-router,
  Lucide icons, token-based design system (`docs/UI_REDESIGN_REPORT.md`).
- `docs/` — audit, architecture, API, database, security, deployment,
  provider/payment integration, testing, final report.

## Run it

```bash
# backend (:4000)
cd backend && cp .env.example .env && npm install && npm run seed && npm run dev
# frontend (:5173)
cd frontend && npm install && npm run dev
```

Login: admin `admin@example.com / Admin123!`, demo `demo@example.com / Demo123!`.

## Verify it

```bash
cd backend && npm run typecheck && npm test && npm run build
cd ../frontend && npm run typecheck && npm run build
```

Sandbox NINs: `...01` succeeds · `...99` timeout (auto-refund) · `...00` invalid.
See `docs/TESTING.md`, `docs/FINAL_IMPLEMENTATION_REPORT.md`.
