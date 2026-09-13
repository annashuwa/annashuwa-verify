# DEPLOYMENT

## Prerequisites

Node 20+, MongoDB 7 (or Atlas), reverse proxy with TLS.

## Quick start (local)

```bash
cd backend && cp .env.example .env   # edit secrets
npm install && npm run seed          # services, providers, admin, demo user
npm run dev                          # :4000
cd ../frontend && npm install && npm run dev   # :5173 (proxies /api → :4000)
```

Seed accounts: admin `admin@example.com / Admin123!` (override via
`SEED_ADMIN_*`), demo `demo@example.com / Demo123!` (₦5,000 funded).

## Production

```bash
cd backend && npm ci && npm run build && npm start
cd frontend && npm ci && npm run build   # serve dist/ via nginx/cdn
```

Or `docker compose up --build` (mongo + backend + frontend-nginx).
Set `NODE_ENV=production`, strong JWT secrets, `USE_MEMORY_DB=false`,
`FRONTEND_URL` to the real origin, and real provider/payment env vars.

## Env vars (see backend/.env.example)

`PORT, FRONTEND_URL, MONGODB_URI, USE_MEMORY_DB, JWT_ACCESS_SECRET,
JWT_REFRESH_SECRET, JWT_ACCESS_TTL, JWT_REFRESH_TTL_DAYS, MOCK_MODE,
MOCK_DEFAULT_LATENCY_MS, PAYMENT_PROVIDER, SEED_ADMIN_EMAIL,
SEED_ADMIN_PASSWORD`, plus `PROVIDER_*` / gateway keys when connecting real vendors.
