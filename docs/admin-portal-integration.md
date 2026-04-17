# Admin Portal Integration

## Placement in the Monorepo

Use a new root application directory:

- `QuickShield/`: Expo rider app
- `Backend/`: NestJS API + Prisma ownership
- `ml-service/`: model-serving and scoring service
- `admin-portal/`: browser-based admin console

This is the correct split. The admin portal should not be embedded into the Expo app because:

- the admin UI is dense, desktop-oriented, and browser-native
- admin sessions and operator workflows differ from rider sessions
- it avoids shipping admin code and permissions into the rider app bundle

## Single Source of Truth

Only one Prisma schema should exist:

- [Backend/prisma/schema.prisma](/Users/ronitjain/Downloads/WEB/PROJECTS/QuickShield/Backend/prisma/schema.prisma:1)

Rules:

- `admin-portal/` does not define Prisma models
- `QuickShield/` does not define Prisma models
- all persistence changes flow through NestJS services backed by the backend schema

## Backend Ownership

NestJS must remain the only browser-facing API for the admin portal.

### Authentication and RBAC

Reuse the existing OTP and JWT primitives in `Backend/src/auth`, but create a separate admin auth surface:

- `POST /admin/auth/request-otp`
- `POST /admin/auth/verify-otp`
- `POST /admin/auth/refresh`
- `GET /admin/auth/me`

Do not reuse rider `User` authentication records for admins. Admins already have dedicated Prisma models.

Recommended Nest structure:

- `Backend/src/admin/auth/admin-auth.module.ts`
- `Backend/src/admin/auth/admin-auth.controller.ts`
- `Backend/src/admin/auth/admin-auth.service.ts`
- `Backend/src/admin/auth/admin-jwt.strategy.ts`
- `Backend/src/admin/auth/admin-jwt.guard.ts`
- `Backend/src/admin/auth/roles.guard.ts`
- `Backend/src/admin/auth/roles.decorator.ts`

JWT payload for admins should include:

- `sub`
- `role`
- `type: "admin"`

RBAC enforcement belongs only in NestJS guards and decorators. The frontend may hide actions, but it must not be the enforcement layer.

Recommended role mapping:

- `SUPERADMIN`: all endpoints
- `ADMIN`: dashboard, claims, fraud alerts, payouts
- `FRAUD_REVIEWER`: dashboard, claims read, fraud alert actions
- `CLAIMS_OFFICER`: claims and payouts actions
- `ANALYTICS_LEAD`: dashboard, zones, pricing-risk read

### Admin-only Controllers

Suggested backend modules and endpoint ownership:

#### Dashboard

- `GET /admin/dashboard/overview`
- `GET /admin/dashboard/activity`

Nest responsibilities:

- aggregate counts from `Claim`, `FraudAlert`, `Payout`, `ServiceZone`
- join recent `AdminActivityLog`
- call `ml-service` for model metadata or cluster summaries when needed

#### Claims

- `GET /admin/claims`
- `GET /admin/claims/:id`
- `PATCH /admin/claims/:id/status`
- `POST /admin/claims/:id/notes`

Nest responsibilities:

- maintain claim review status and notes
- preserve the existing parametric claim creation flow
- never let the admin portal create claims directly outside policy/disruption logic

#### Fraud Alerts

- `GET /admin/fraud-alerts`
- `GET /admin/fraud-alerts/:id`
- `PATCH /admin/fraud-alerts/:id`
- `POST /admin/fraud-alerts/:id/assign`

Nest responsibilities:

- manage `FraudAlert.status`, `reviewedByAdminId`, `resolution`
- optionally sync `Claim.isSuspicious` and review metadata

#### Payouts

- `GET /admin/payouts`
- `GET /admin/payouts/:id`
- `PATCH /admin/payouts/:id/status`
- `POST /admin/payouts/:id/export`

Nest responsibilities:

- own payout lifecycle and audit logging
- never let the frontend mutate payout state directly

#### Zones

- `GET /admin/zones`
- `GET /admin/zones/:code`
- `GET /admin/zones/:code/claims`
- `GET /admin/zones/:code/disruptions`

Nest responsibilities:

- aggregate `RiderProfile`, `Policy`, `DisruptionEvent`, `Claim`
- expose zone-level suspicious concentration and payout totals

#### Pricing and Risk

- `GET /admin/pricing-risk`
- `GET /admin/pricing-risk/model-info`
- `PATCH /admin/pricing-risk/:id`

Nest responsibilities:

- expose `PricingStrategy` and `InsurancePlan`
- expose current model version, features, and zone risk summaries
- keep premium calculation owned by existing `PremiumService`

### Audit Logging

Every admin action that changes state should insert `AdminActivityLog` rows with:

- `adminId`
- `action`
- `resourceType`
- `resourceId`
- `details`
- request metadata

## ML Service Ownership

The browser should not call `ml-service` directly.

Use this rule:

- `admin-portal` -> NestJS
- NestJS -> `ml-service`

Why:

- keeps service URLs and model internals private
- lets NestJS enforce RBAC
- lets NestJS combine database truth with model outputs

### Existing ML endpoints that remain valid

- `POST /predict/risk`
- `GET /health`
- `GET /model/info`

### Recommended new ML read models for admin analytics

Add model-centric endpoints only when NestJS cannot derive the result itself:

- `POST /admin/explain-risk`
  Purpose: explain a single risk score using the same model features as premium calculation
- `POST /admin/zone-risk-batch`
  Purpose: batch scoring for multiple zones without repeated per-zone calls
- `POST /admin/cluster-signals`
  Purpose: detect suspicious concentration candidates from supplied claim windows

These endpoints should be internal and consumed only by NestJS admin services.

### What stays in NestJS instead of ML

Do not move these into `ml-service`:

- RBAC
- admin auth
- claim review decisions
- payout approvals
- zone and policy CRUD
- audit logging
- query filtering and pagination

ML should stay focused on:

- risk prediction
- explanation metadata
- anomaly scoring primitives

## Preserving the Parametric Insurance Flow

The existing rider flow remains unchanged:

1. rider authenticates
2. rider connects platform and zone
3. premium is calculated through `PremiumService`
4. rider purchases a weekly policy
5. disruption events and rain claims are credited through the existing policy/rain pipeline

The admin portal is observational and supervisory around that flow. It must not replace:

- premium calculation
- policy purchase
- rider claim generation

It may only:

- review claims
- resolve fraud alerts
- manage payouts
- tune pricing strategies
- observe zone/model analytics

## Frontend Mapping

Provided AI admin files mapped into the repo:

- `AdminPortal-App.tsx` -> `admin-portal/src/App.tsx`
- `AdminPortal-Layout.tsx` -> `admin-portal/src/pages/Layout.tsx`
- `AdminPortal-Login.tsx` -> `admin-portal/src/pages/Login.tsx`
- `AdminPortal-Dashboard.tsx` -> `admin-portal/src/pages/Dashboard.tsx`
- `AdminPortal-FraudAlerts.tsx` -> `admin-portal/src/pages/FraudAlerts.tsx`

Additional placeholder routes were added for the missing referenced pages:

- `Claims`
- `Payouts`
- `Zones`
- `PricingRisk`
- `Settings`

This keeps the portal buildable while the corresponding Nest modules are implemented.
