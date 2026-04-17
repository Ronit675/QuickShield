# QuickShield

QuickShield is a multi-service prototype for parametric income protection aimed at gig-delivery riders. The repository contains a rider mobile app, a browser-based admin portal, a NestJS backend with Prisma/PostgreSQL, and a FastAPI ML service used during premium calculation.

This root README is the final submission overview. Component-level setup and implementation notes are documented in:

- [QuickShield/README.md](QuickShield/README.md)
- [admin-portal/README.md](admin-portal/README.md)
- [ml-service/README.md](ml-service/README.md)

## Submission Summary

The current codebase implements the core prototype layers:

- `QuickShield/`: Expo Router rider app with onboarding, authentication, policy purchase, profile, settings, and disruption-tracking flows
- `admin-portal/`: separate React + Vite operations console for dashboarding, claims review, fraud monitoring, payouts, zones, pricing risk, and settings
- `Backend/`: NestJS API with Prisma as the single source of truth for rider, policy, claim, fraud, payout, and admin data
- `ml-service/`: FastAPI model-serving service that predicts the risk components used by the backend premium engine
- `docs/`: supporting integration notes, including admin portal architecture and backend ownership boundaries

## Architecture

```text
Rider Mobile App (Expo)
        |
        | REST
        v
Backend API (NestJS + Prisma + PostgreSQL) <---- Admin Portal (React + Vite)
        |
        | internal service call
        v
ML Risk Service (FastAPI + scikit-learn)
```

Key architectural decisions in the current repo:

- Prisma schema ownership stays in `Backend/prisma/schema.prisma`
- both frontend clients talk to NestJS, not directly to the database
- the admin portal does not call the ML service directly; NestJS mediates that integration
- the ML service can fail without crashing premium calculation because the backend falls back to static values

## What Is Implemented

Based on the repository contents, the prototype currently includes:

- rider authentication flows for Google sign-in and phone OTP
- rider onboarding for platform and service-zone selection
- premium recommendation and weekly policy purchase flow
- rider policy history, profile, settings, and app-state monitoring surfaces
- mock weather and rain-disruption tracking in the rider experience
- backend modules for auth, profile, premium, policy, claims, triggers, ML integration, and admin operations
- Prisma models for `User`, `RiderProfile`, `Policy`, `Claim`, `DisruptionEvent`, `Admin`, `FraudAlert`, `Payout`, and related audit entities
- admin-facing endpoints and frontend pages for dashboard, claims, fraud alerts, payouts, zones, pricing risk, and settings
- ML model training and inference for the three pricing components `F`, `Z`, and `A`

## Dependencies Used

This project is a monorepo with service-specific dependency stacks.

### Rider App (`QuickShield/`)

- `expo`, `react`, `react-native`, `expo-router` for mobile app runtime and navigation
- `axios` for API communication
- `@react-native-async-storage/async-storage` for local persistence
- `@react-native-google-signin/google-signin` and `expo-auth-session` for authentication flows
- `react-native-chart-kit`, `react-native-svg`, and `victory-native` for charts and visualizations
- `@expo/vector-icons` for iconography

### Admin Portal (`admin-portal/`)

- `react`, `react-dom` for UI rendering
- `vite` and `@vitejs/plugin-react` for development/build tooling
- `typescript` for static typing
- `axios` for backend API requests

### Backend API (`Backend/`)

- `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express` as the backend framework
- `@prisma/client` and `prisma` for ORM and schema migrations
- `passport`, `@nestjs/passport`, `passport-jwt`, and `jsonwebtoken` for JWT auth guards/strategies
- `google-auth-library` for Google token verification/sign-in integration
- `class-validator` and `class-transformer` for DTO validation and transformation
- `rxjs` for NestJS reactive primitives

### ML Service (`ml-service/`)

- `fastapi` and `uvicorn` for model-serving APIs
- `scikit-learn` for model training and inference
- `pandas` and `numpy` for feature/data processing
- `joblib` for model serialization/loading
- `pydantic` for request/response schema validation

### Dev Tooling (Across Services)

- `eslint` and `@typescript-eslint/*` for linting
- `typescript` for type-checking in TS-based services
- `prisma` CLI for database codegen and migrations

## Known Prototype Limitations

This is still a prototype and some flows remain partially mocked or simplified:

- platform earnings/import flows are not connected to live delivery-platform APIs
- weather/disruption handling is still prototype-grade and includes mock data paths
- ML training uses synthetic data rather than production insurance history
- deployment and infra automation are not included in this repository
- environment examples are not consistently checked in for every subproject, so some `.env` files must be created manually from the README requirements

## Repository Map

```text
QuickShield/
├── README.md
├── Backend/         # NestJS API, Prisma schema, admin/rider business logic
├── QuickShield/     # Expo Router mobile app
├── admin-portal/    # React + Vite admin console
├── ml-service/      # FastAPI ML scoring service
└── docs/            # integration and design notes
```

## Recommended Local Startup Order

### 1. Start the backend

```bash
cd Backend
npm install
npx prisma generate
npm run dev
```

The backend expects environment variables such as:

- `DATABASE_URL`
- `JWT_SECRET`
- `GOOGLE_WEB_CLIENT_ID`
- `ML_SERVICE_URL`

### 2. Start the ML service

```bash
cd ml-service
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python train.py
uvicorn main:app --reload --port 5001
```

### 3. Start the rider app

```bash
cd QuickShield
npm install
npx expo start
```

Expected app configuration:

- `EXPO_PUBLIC_API_URL`
- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`

### 4. Start the admin portal

```bash
cd admin-portal
npm install
npm run dev
```

Expected admin configuration:

- `VITE_API_URL`
- optional `VITE_API_TIMEOUT`
- optional `VITE_SESSION_TIMEOUT_MINUTES`
- optional `VITE_OTP_EXPIRY_MINUTES`
- optional `VITE_ENABLE_ANALYTICS`

## Validation Commands

Useful checks from the current repo:

```bash
cd QuickShield && npm run lint
cd admin-portal && npm run lint
cd admin-portal && npm run type-check
cd ml-service && python3 -m py_compile main.py train.py
```

The backend currently exposes `npm run dev`, but no dedicated lint or test script is defined in `Backend/package.json`.

## Backend Ownership and Data Model

The backend is the system boundary for both user-facing clients.

- rider app -> NestJS only
- admin portal -> NestJS only
- NestJS -> Prisma/PostgreSQL
- NestJS -> ML service

This separation matters because it keeps:

- RBAC and admin authorization inside NestJS
- database writes centralized in one service
- ML internals hidden from browser clients
- pricing and claims logic anchored to a single backend contract

## Admin Portal Positioning

The admin portal is intentionally separated from the Expo rider app.

- the rider app is mobile-first and customer-facing
- the admin portal is desktop-oriented and operational
- admin workflows need longer sessions, denser tables, review actions, and internal controls

This split is reflected in both the codebase and the documentation under [docs/admin-portal-integration.md](docs/admin-portal-integration.md).

## Component References

Use the subproject READMEs for implementation detail:

- [QuickShield/README.md](QuickShield/README.md): mobile app prerequisites, scripts, and current rider scope
- [admin-portal/README.md](admin-portal/README.md): admin portal runtime, purpose, and backend contract
- [ml-service/README.md](ml-service/README.md): ML setup, training, endpoints, and prediction schema

## Final Notes

QuickShield is best understood as a working end-to-end prototype rather than a production-ready insurance platform. The repository demonstrates the intended product architecture, core user/admin flows, and ML-assisted pricing path, while still leaving live integrations, real trigger pipelines, and production hardening for future work.
