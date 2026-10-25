# HCM lite

HCM lite is a role-aware people operations app with a Next.js frontend and an Express API backed by Firebase Authentication and Cloud Firestore. Firebase Authentication persists browser sessions locally; all HCM records are accessed through the Firestore-backed API.

## Setup

Install dependencies:

```bash
npm install
npm --prefix server install
```

Create `server/.env` from `server/.env.example`. Set `FIREBASE_PROJECT_ID` to your Firebase project and configure server credentials with Application Default Credentials or `GOOGLE_APPLICATION_CREDENTIALS` pointing to a service-account JSON file. Never commit that file. Enable Cloud Firestore in the Firebase project.

Set the `NEXT_PUBLIC_FIREBASE_*` variables in root `.env.local` for the browser Firebase app. These are public client configuration values, not server credentials. Enable Email/Password under Firebase Authentication sign-in providers.

Start the frontend and API together:

```bash
npm run dev
```

Open http://localhost:3000. The API listens on http://localhost:4000. Stop both services with Ctrl+C. To run only one process, use `npm run dev:web` or `npm run api`.

### Vercel Deployment

Deploy the frontend as one Vercel project from the repository root. Deploy the API as a second Vercel project with **Root Directory** set to `server`. In the API project's Production and Preview environments, set server-only `FIREBASE_PROJECT_ID=hmc-lite`, `FIREBASE_SERVICE_ACCOUNT_JSON` or `FIREBASE_SERVICE_ACCOUNT_BASE64` (use a newly rotated service-account JSON), and `CORS_ORIGINS` to the exact frontend origin, e.g. `https://hcm-lite-project-new.vercel.app` (no trailing slash). Set the frontend's `NEXT_PUBLIC_API_URL` to the API deployment URL ending in `/api`. Never use `NEXT_PUBLIC_` for the service-account key, and do not commit service-account JSON files.

Seed an administrator role for an existing Firebase Authentication user:

Root `.env.local` contains the Firebase web app configuration as `NEXT_PUBLIC_FIREBASE_*` plus `NEXT_PUBLIC_API_URL` (the deployed API base ending in `/api`). Web config values are public client configuration, not server credentials. Enable Email/Password under Firebase Authentication sign-in providers.
```bash
npm run api:seed
```

Set `SEED_ADMIN_UID` in `server/.env` before running the command. The API trusts roles from Firebase custom claims; the seeded administrator should sign out and back in to refresh its ID token.

## Configuration

`server/.env`:

| Variable | Purpose |
|---|---|
| `FIREBASE_PROJECT_ID` | Firebase project containing Firestore |
| `FIREBASE_DATABASE_ID` | Optional named database; empty uses `(default)` |
| `GOOGLE_APPLICATION_CREDENTIALS` | Optional path to a service-account JSON; ADC/workload identity is preferred on hosted platforms |
| `PORT` | API port, default 4000 |
| `CORS_ORIGINS` | Allowed frontend origins |
| `SEED_ADMIN_UID` | Existing Firebase Auth UID to grant the admin role |
| `AI_API_KEY` / `AI_BASE_URL` / `AI_MODEL` | Optional OpenRouter assistant configuration |

Root `.env.local` contains the Firebase web app configuration as `NEXT_PUBLIC_FIREBASE_*`. Do not put service account credentials, JWT secrets, or AI keys in `NEXT_PUBLIC_*` variables.

## Data and access

The Firestore collections are `users`, `organizations`, `departments`, `designations`, `leaveTypes`, `holidays`, `attendance`, `leaveApplications`, `payrollRuns`, `announcements`, `notifications`, `auditLogs`, and `aiLogs`. References are stored as document ID strings. Organization settings use the fixed `organizations/singleton` document. Existing data is not migrated automatically; export and transform it before connecting a production deployment.

The API retains role checks for `admin`, `hr`, and `employee`. Salary serializers restrict amount reads to admin and the employee's own payslip. Firestore Admin SDK access bypasses client security rules, so all authorization must remain enforced in the API. Configure Firestore security rules to deny direct untrusted client access to backend collections unless a deliberate client workflow requires it.

The frontend does not store HR records in localStorage. It sends Firebase ID tokens to the API, which enforces roles and reads/writes Firestore. Firebase Auth browser persistence stores the login session on the device.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start Next.js and the Firebase-backed API together |
| `npm run dev:web` | Start only Next.js |
| `npm run api` | Start only the API in watch mode |
| `npm run api:seed` | Grant the admin role to the configured Firebase Auth UID |
| `npm run api:test` | Run backend tests |
| `npm run build` | Build the Next.js production app |

Run backend tests with `npm --prefix server test`. Firebase-backed integration tests require a configured Firestore emulator or valid Firebase server credentials. No MongoDB or JWT configuration is used by the backend.
