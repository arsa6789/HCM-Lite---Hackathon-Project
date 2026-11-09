# HCM Lite

HCM Lite is a role-aware people-operations workspace for employee profiles, attendance, leave, payroll preparation, announcements, and audit history. The app is a Next.js frontend with an Express API, Supabase Auth, and Supabase Postgres.

## Stack and security

- **Identity:** Supabase Auth email/password. Browser sessions use the public anon key.
- **API:** Express verifies each bearer token with Supabase Auth. The API reads role and employee profile data from the `users` collection; JWT metadata and client-supplied roles are never trusted.
- **Database:** Supabase Postgres table `public.hcm_records`, with JSONB payloads partitioned by collection. The backend compatibility adapter preserves existing HR model behavior.
- **Sensitive access:** Only the API uses `SUPABASE_SERVICE_ROLE_KEY`. It must remain server-side and must never use a `NEXT_PUBLIC_` variable. Row-level security is enabled and browser roles have no direct table access; API authorization and role/scope checks protect HR records.

The record adapter currently loads each collection into the API process before applying the existing filters. This preserves the app's current model behavior for a small/medium hackathon deployment; for large production datasets, convert the JSONB collections to normalized Postgres tables and push filters/aggregation into SQL.

## Supabase setup

1. Create a Supabase project.
2. In **SQL Editor**, run [`supabase/migrations/202611080001_hcm_records.sql`](supabase/migrations/202611080001_hcm_records.sql).
3. In **Project Settings → API**, copy the project URL and public anon key for the web app. Copy the service-role key for the API only.
4. In **Authentication → Providers**, enable Email. If email confirmations are enabled, users need to confirm before signing in; the signup form displays that flow.
5. In **Authentication → URL Configuration**, set the Site URL to the deployed app URL and add the app's `/login` redirect to the allow list. Signup explicitly redirects to the current origin's `/login`; keep `http://localhost:3000/login` allowed for local development and add the deployed preview URL when testing previews.
6. Add the local environment files below. Do not commit them.

### Web app: `.env.local` at repository root

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_KEY
NEXT_PUBLIC_API_URL=http://localhost:4000/api
```

### API: `server/.env`

```dotenv
NODE_ENV=development
PORT=4000
CORS_ORIGINS=http://localhost:3000
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_ONLY_SERVICE_ROLE_KEY
```

Optional AI settings can be added to `server/.env`: `AI_API_KEY`, `AI_BASE_URL`, and `AI_MODEL`.

## Run locally

Requires Node.js 20 or newer.

```bash
npm install
npm --prefix server install
npm run dev
```

The development script starts the Next.js app and Express API. Open `http://localhost:3000`; the API health check is `http://localhost:4000/health`. You can also run them separately using `npm run dev:web` and `npm run api`.

## Vercel development preview

The Express API preview is protected by Vercel Authentication. The Next.js preview proxies API calls through `app/api/backend/[...path]/route.js`, which forwards the Supabase bearer token and adds a Vercel protection-bypass secret server-side. Configure these variables on the **frontend Vercel project**, for the `development` Preview branch only:

- `NEXT_PUBLIC_API_URL=/api/backend`
- `HCM_API_ORIGIN=https://<the-development-API-preview-host>`
- `HCM_API_VERCEL_BYPASS_SECRET=<server-only Vercel automation bypass secret>` as a **Sensitive** variable. Never prefix it with `NEXT_PUBLIC_` or put it in the repository.

This keeps the browser-to-frontend request same-origin and does not expose the bypass secret to the browser. The Express API continues to validate Supabase access tokens and enforce the app's role checks.

## First admin account

Create an account using the app's signup form, confirm the email if required by the Supabase project, then copy its user UUID from **Authentication → Users**. Set that UUID as `SEED_ADMIN_UID` in `server/.env` and run:

```bash
npm run api:seed
```

The seed command grants the admin role by updating the server-side HCM profile, not Supabase user metadata or a client token. New accounts created through signup receive the employee role on their first authenticated API request.

## Checks

```bash
npm run api:test
npm run build
```

The backend test suite covers role scoping, salary redaction, request validation, payroll/attendance calculations, sanitization, audit hashing, CSV handling, and PDF generation. A live Supabase check requires project credentials and the SQL migration.

## Data migration note

This repository migration removes Firebase and MongoDB dependencies and changes the app to Supabase Auth/Postgres. It does not copy records from an existing Firebase/Firestore or MongoDB deployment. Export and transform any existing production HR data separately before switching users over; never expose service-role keys or legacy credentials.

## API

Base URL: `http://localhost:4000/api`. Protected routes require `Authorization: Bearer <Supabase access token>`. See [`docs/api-contract.md`](docs/api-contract.md) for the route contract.
