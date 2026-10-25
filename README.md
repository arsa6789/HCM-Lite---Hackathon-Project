# HCM lite

**People operations, made clear.** HCM lite is a role-aware workspace for employee records, attendance, leave, payroll preparation, announcements, and administrative audit. It pairs a Next.js web application with an Express API. Firebase Authentication manages identity; Cloud Firestore stores application records.

> **Production data warning:** HR and payroll data is sensitive. Use the Firestore-backed API for shared records. Never put Firebase Admin service-account credentials in the browser, a `NEXT_PUBLIC_*` variable, or Git. Service-account keys previously shared in chat must be revoked and replaced.

## Contents

- [What’s Included](#whats-included)
- [Architecture](#architecture)
- [Repository Layout](#repository-layout)
- [Requirements](#requirements)
- [Local Setup](#local-setup)
- [Environment Variables](#environment-variables)
- [Deployment on Vercel](#deployment-on-vercel)
- [Authentication, Roles, and Data Safety](#authentication-roles-and-data-safety)
- [API Overview](#api-overview)
- [Tests and Commands](#tests-and-commands)

## What’s Included

- Employee directory with profile details, CSV template/import/export, and employee profile summaries
- Organization settings and reference catalogs for departments, designations, leave types, and holidays
- Attendance check-in/out, daily board, correction requests, and review
- Leave balances, requests, approvals, and notifications
- Payroll drafts, admin finalization, employee payslip access, and PDF generation
- Role-shaped dashboards with attendance trends and announcements
- Announcement management, notification inbox, and a verifiable audit hash chain
- Optional OpenRouter assistant with scoped tools and confirmable leave drafts
- Firebase Authentication with browser-local session persistence

## Architecture

| Area | Technology and responsibility |
|---|---|
| Web | Next.js 15, React 19, Tailwind CSS, Recharts; landing, sign-in, console, dashboards, and module workflows |
| Identity | Firebase Authentication email/password; browser obtains Firebase ID tokens |
| API | Express; verifies Firebase ID tokens, applies role/scope rules, validates requests, and exposes `/api/*` |
| Database | Cloud Firestore through Firebase Admin; document IDs are strings, user IDs match Firebase UIDs |
| Supporting services | `date-fns` for date logic, `pdf-lib` for payslips, optional OpenRouter for AI tools |

The browser sends an ID token in `Authorization: Bearer <token>`. The API verifies it with Firebase Admin. Roles are taken from server-managed Firebase custom claims, never trusted from client input. The API creates/updates Firestore records; the browser does not store HR records in localStorage.

## Repository Layout

This lists the project’s first-party source, documentation, tests, and configuration. Dependency trees, build output, local environment files, local database artifacts, Git internals, and credential files are intentionally excluded.

```text
my-hackathon-app/
├── app/
│   ├── components/
│   │   ├── AuthForm.js             # Firebase email/password sign-in and sign-up
│   │   ├── Dashboard.js            # Earlier account view component
│   │   └── ModuleView.js           # Data-backed console modules and workflows
│   ├── console/
│   │   ├── [section]/page.js       # Dynamic console section route
│   │   ├── layout.js               # Authenticated shell, role navigation, notifications
│   │   └── page.js                 # Console entry redirect
│   ├── lib/
│   │   ├── api.js                  # ID-token API client and authenticated downloads
│   │   └── firebase.js             # Firebase browser app and Auth initialization
│   ├── login/page.js               # Sign-in / account creation page
│   ├── globals.css                 # Design system and responsive styles
│   ├── layout.js                   # Root layout and metadata
│   └── page.js                     # Public product landing page
├── docs/
│   └── api-contract.md             # API routes, request/response shapes, access rules
├── scripts/
│   └── dev.mjs                     # Starts web and API together for local development
├── server/
│   ├── src/
│   │   ├── access/
│   │   │   ├── policies.js         # Field allowlists and role-safe serializers
│   │   │   └── scope.js            # User record scope rules
│   │   ├── config/
│   │   │   ├── env.js              # Backend environment validation
│   │   │   └── firestore.js        # Firebase Admin, Auth, and Firestore clients
│   │   ├── constants/
│   │   │   ├── roles.js            # Role names and values
│   │   │   └── statuses.js         # Attendance, leave, payroll, employment statuses
│   │   ├── controllers/
│   │   │   ├── ai.controller.js
│   │   │   ├── attendance.controller.js
│   │   │   ├── audit.controller.js
│   │   │   ├── auth.controller.js
│   │   │   ├── catalog.controller.js
│   │   │   ├── comms.controller.js
│   │   │   ├── dashboard.controller.js
│   │   │   ├── leave.controller.js
│   │   │   ├── org.controller.js
│   │   │   ├── payroll.controller.js
│   │   │   └── user.controller.js
│   │   ├── middleware/
│   │   │   ├── authenticate.js     # Firebase ID-token verification
│   │   │   ├── authorizeRoles.js   # Role-based route guard
│   │   │   ├── enforceRecordScope.js
│   │   │   ├── errorHandler.js
│   │   │   └── notFound.js
│   │   ├── models/
│   │   │   ├── AiLog.js
│   │   │   ├── Announcement.js
│   │   │   ├── Attendance.js
│   │   │   ├── AuditLog.js
│   │   │   ├── Department.js
│   │   │   ├── Designation.js
│   │   │   ├── firestoreModel.js   # Firestore document/query compatibility layer
│   │   │   ├── Holiday.js
│   │   │   ├── LeaveApplication.js
│   │   │   ├── LeaveType.js
│   │   │   ├── Notification.js
│   │   │   ├── Organization.js
│   │   │   ├── PayrollRun.js
│   │   │   └── User.js
│   │   ├── routes/
│   │   │   ├── ai.routes.js
│   │   │   ├── attendance.routes.js
│   │   │   ├── audit.routes.js
│   │   │   ├── auth.routes.js
│   │   │   ├── catalog.routes.js
│   │   │   ├── comms.routes.js
│   │   │   ├── dashboard.routes.js
│   │   │   ├── index.js
│   │   │   ├── leave.routes.js
│   │   │   ├── org.routes.js
│   │   │   ├── payroll.routes.js
│   │   │   └── user.routes.js
│   │   ├── scripts/
│   │   │   └── seed.js             # Grants admin claim to an existing Firebase UID
│   │   ├── services/
│   │   │   ├── ai/
│   │   │   │   ├── client.js       # OpenRouter client and timeout
│   │   │   │   ├── executor.js     # Scoped AI tool definitions and execution
│   │   │   │   └── prompt.js       # System prompt and business rules
│   │   │   ├── attendanceService.js
│   │   │   ├── dashboardService.js
│   │   │   ├── employeeService.js
│   │   │   ├── leaveService.js
│   │   │   ├── orgService.js
│   │   │   └── payrollService.js
│   │   ├── utils/
│   │   │   ├── apiError.js
│   │   │   ├── asyncHandler.js
│   │   │   ├── attendanceRules.js
│   │   │   ├── audit.js            # Append-only SHA-256 audit chain
│   │   │   ├── csv.js
│   │   │   ├── dates.js
│   │   │   ├── notify.js
│   │   │   ├── payrollEngine.js
│   │   │   ├── pdf.js
│   │   │   ├── rateLimit.js
│   │   │   ├── sanitize.js
│   │   │   └── validate.js
│   │   ├── app.js                  # Express app factory and middleware
│   │   └── server.js               # Local listener and Vercel Express entrypoint
│   ├── test/
│   │   ├── phase3.test.js          # Payroll absence and AI tool validation tests
│   │   ├── scope.test.js           # Role scope and field-policy tests
│   │   └── utilities.test.js       # Salary, calculations, utilities, audit, PDF tests
│   ├── .env.example                # Safe backend environment template
│   ├── package.json                # API dependencies and scripts
│   └── package-lock.json
├── .env.example                    # Safe frontend environment template
├── .gitignore                      # Excludes local env and credentials
├── docs/api-contract.md            # Detailed API reference
├── jsconfig.json
├── next.config.mjs
├── package.json                    # Web dependencies and root scripts
├── package-lock.json
├── postcss.config.mjs
├── README.md                       # Product, setup, API, and deployment guide
├── tailwind.config.js
└── tasks.md                        # Product requirements and implementation plan
```

## Requirements

- Node.js 20 or newer
- npm
- A Firebase project with **Authentication → Email/Password** enabled
- Cloud Firestore enabled in that Firebase project
- Firebase Admin credentials for local/API hosting: Application Default Credentials, a service-account JSON file, or a hosting platform identity

The Firebase web configuration is public client configuration. It does **not** grant the API server access to Firestore. The Admin SDK must use server credentials.

## Local Setup

1. Install both workspaces:

   ```bash
   npm install
   npm --prefix server install
   ```

2. Create the local environment files from their templates:

   ```bash
   cp .env.example .env.local
   cp server/.env.example server/.env
   ```

3. Fill `.env.local` with the Firebase web app values and local API URL:

   ```dotenv
   NEXT_PUBLIC_FIREBASE_API_KEY=your_web_api_key
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   NEXT_PUBLIC_FIREBASE_APP_ID=your_web_app_id
   NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=your_measurement_id
   NEXT_PUBLIC_API_URL=http://localhost:4000/api
   ```

4. In `server/.env`, set at least `FIREBASE_PROJECT_ID`. Configure one server credential option:
   - Recommended locally: `gcloud auth application-default login`
   - Or set `GOOGLE_APPLICATION_CREDENTIALS=./service-account.json` to a local, ignored service-account file under `server/`
   - Or point `FIRESTORE_EMULATOR_HOST` to a running emulator

   Never paste a service-account JSON into this README, `.env.local`, chat, or Git. For Vercel, use a server-only secret environment variable as described below.

5. Start the Next.js app and API:

   ```bash
   npm run dev
   ```

   The web app is at `http://localhost:3000`; the API is at `http://localhost:4000`. The root process stops both when you press Ctrl+C. To start just one process, use `npm run dev:web` or `npm run api`.

6. Create an account through the sign-up form. New users receive employee access by default. To grant an existing Firebase user admin access, set `SEED_ADMIN_UID` in `server/.env` to that Firebase Auth UID and run:

   ```bash
   npm run api:seed
   ```

   Admin seeding requires Firebase Admin credentials. Sign out and back in after seeding so Firebase issues a token with the updated custom claim.

## Environment Variables

### Frontend (`.env.local`)

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase browser app configuration |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase Auth domain |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase project used by browser Auth |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Firebase web configuration |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Firebase web configuration |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase web app ID |
| `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` | Optional Analytics identifier |
| `NEXT_PUBLIC_API_URL` | API base URL; include `/api` |

`NEXT_PUBLIC_*` variables are bundled into browser code. Never put private keys or server secrets in them.

### Backend (`server/.env` or deployment environment)

| Variable | Purpose |
|---|---|
| `FIREBASE_PROJECT_ID` | Required Firebase project ID |
| `FIREBASE_DATABASE_ID` | Optional named Firestore database; blank uses the default database |
| `GOOGLE_APPLICATION_CREDENTIALS` | Optional path to a local service-account JSON file |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Optional server-only JSON credential for deployment environments such as Vercel |
| `FIREBASE_SERVICE_ACCOUNT_BASE64` | Optional server-only base64 JSON credential alternative |
| `FIRESTORE_EMULATOR_HOST` | Optional emulator host, such as `127.0.0.1:8080` |
| `PORT` | Local API port; defaults to `4000` |
| `CORS_ORIGINS` | Comma-separated exact allowed browser origins, with no trailing slash |
| `SEED_ADMIN_UID` | Existing Firebase Auth UID granted the admin role by the seed script |
| `AI_API_KEY` | Optional OpenRouter key; keep server-only |
| `AI_BASE_URL` | OpenRouter-compatible API base URL |
| `AI_MODEL` | OpenRouter model identifier |

See [`server/.env.example`](server/.env.example) for a safe template. Do not commit `.env`, `.env.local`, service-account files, or deployment secrets.

## Deployment on Vercel

Deploy the web app and API as **two Vercel projects** from the same repository:

### Web project

- Root Directory: repository root
- Framework: Next.js
- Set all `NEXT_PUBLIC_FIREBASE_*` values for the Firebase web app
- Set `NEXT_PUBLIC_API_URL` to the API deployment URL ending in `/api`

### API project

- Root Directory: `server`
- Runtime entrypoint: `src/server.js` (exports the Express app for Vercel; local listener only starts when run directly)
- Set server-only `FIREBASE_PROJECT_ID`
- Set `FIREBASE_SERVICE_ACCOUNT_JSON` to the fresh service-account JSON, or `FIREBASE_SERVICE_ACCOUNT_BASE64` if multiline environment values are inconvenient
- Set `CORS_ORIGINS` to the exact web origin, for example `https://your-web-project.vercel.app` (no trailing slash). Add any custom domain origins too.
- Set optional AI variables if the assistant is enabled
- Add variables for both Production and Preview environments as needed

Redeploy both projects after changing environment variables. Verify the API first at `/health`, then test an authenticated API request from the web app. The health response includes `firebaseConfigured`; it must be `true` in the API deployment. If the API returns HTTP 500, inspect the API project's Vercel Runtime Logs; a browser CORS message can be a secondary symptom of a crashed function.

If Firefox reports both `Access-Control-Allow-Origin missing` and HTTP 500, fix the API project environment before changing frontend fetch code. In this repository's current deployment, add the web project's exact URL (for example `https://hcm-lite-project-new.vercel.app`) to `CORS_ORIGINS`, set `FIREBASE_PROJECT_ID`, and add a valid server-only Firebase service-account variable. Do not put the service-account value in a `NEXT_PUBLIC_*` variable.

## Authentication, Roles, and Data Safety

- Firebase Authentication owns passwords and client sessions. The API accepts Firebase ID tokens as `Authorization: Bearer <token>`.
- The API verifies tokens with Firebase Admin and reads roles from server-managed custom claims. Client-supplied roles are not trusted.
- `admin` has organization-level access; `hr` manages employee workflows but never receives salary/payroll amounts; `employee` is limited to self-service access.
- Salary serializers strip amounts from HR reads, including profiles, directory/CSV output, payroll responses, and AI tool output.
- Firestore Admin SDK bypasses Firestore Security Rules. Keep sensitive records inaccessible to direct browser clients and enforce authorization in the API.
- Firebase Admin credentials are private. Rotate any credential that has been pasted into chat, committed, or otherwise exposed.

## API Overview

Base URL: `http://localhost:4000/api` locally. Protected requests require a Firebase ID token. The complete request/response contract is in [`docs/api-contract.md`](docs/api-contract.md).

| Route group | Purpose |
|---|---|
| `/auth` | Verify current Firebase user and return role/scope; custom login/signup endpoints are retired |
| `/users` | Employee directory, profiles, role-aware edits, CSV import/export |
| `/org`, `/departments`, `/designations`, `/leave-types`, `/holidays` | Organization policy and catalogs |
| `/attendance` | Check-in/out, board, correction requests/reviews |
| `/leave` | Leave applications, balances, review, cancellation |
| `/payroll` | Draft runs, finalization, employee payslips, PDF download |
| `/dashboard` | Role-shaped organization or personal metrics |
| `/announcements`, `/notifications` | Targeted updates and inbox actions |
| `/audit` | Admin-only audit listing and hash-chain verification |
| `/ai` | Optional assistant status and scoped tool-calling chat |
| `/health` | Public service health check |

## Tests and Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start web and API together for local development |
| `npm run dev:web` | Start only Next.js |
| `npm run api` | Start only the API in watch mode |
| `npm run api:start` | Start the API without watch mode |
| `npm run api:seed` | Grant admin role to `SEED_ADMIN_UID` |
| `npm run api:test` | Run backend tests |
| `npm run build` | Build the web app for production |
| `npm run clean` | Remove generated Next.js build output |

Run the full backend suite with `npm --prefix server test`. Current automated coverage includes role scope and salary redaction, AI argument validation, payroll/attendance calculations, rate limiting, sanitization, CSV parsing, date helpers, audit hashing, and PDF generation. A live Firestore integration check requires valid Firebase Admin credentials or a configured emulator.
