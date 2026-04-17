# QuickShield Admin Portal

Separate browser-based control plane for claims operations, fraud review, pricing oversight, and zone risk monitoring.

## Why separate from `QuickShield/`

- `QuickShield/` is an Expo rider app and should stay rider-facing.
- Admin operations need a standard web runtime, long-lived sessions, and dense desktop UI.
- Both apps share the same NestJS backend and the same Prisma schema in `Backend/prisma/schema.prisma`.

## Run

```bash
cd admin-portal
npm install
npm run dev
```

Set `VITE_API_URL` to the Nest backend base URL.

## Backend contract

The portal is intended to talk only to NestJS:

- `POST /admin/auth/request-otp`
- `POST /admin/auth/verify-otp`
- `GET /admin/dashboard/overview`
- `GET /admin/dashboard/activity`
- `GET /admin/claims`
- `GET /admin/fraud-alerts`
- `PATCH /admin/fraud-alerts/:id`
- `GET /admin/payouts`
- `PATCH /admin/payouts/:id`
- `GET /admin/zones`
- `GET /admin/pricing-risk`
- `PATCH /admin/pricing-risk/:id`

The browser should not call `ml-service` directly. Nest should aggregate ML and Prisma data first.
