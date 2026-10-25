# HCM lite

HCM lite is a role-aware people operations workspace built with Next.js 15 and React 19. Temporary local-only mode uses Firebase Authentication for email/password sign-in and browser `localStorage` for demo records. The MongoDB-backed Express API remains in `server/`, but is not started by the frontend and the frontend does not call it in this mode.

## Run locally

Prerequisites: Node.js 20+, npm, a Firebase project, and Email/Password enabled under Firebase Authentication providers.

```bash
npm install
```

Set the `NEXT_PUBLIC_FIREBASE_*` values in `.env.local` using the Firebase web app configuration, then run:

```bash
npm run dev
```

Open `http://localhost:3000`. Firebase Authentication persists sessions in browser local storage. New accounts receive employee access. Demo records are stored in the current browser profile only; clearing site data or switching browsers removes or hides them. Do not use this mode for sensitive or production HR data: browser storage and role fields are not a trusted authorization boundary, and data is not shared between users/devices.

## Configuration

`.env.local`:

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase web app API key (public client configuration) |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase Authentication domain |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase project ID |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Firebase storage bucket |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Firebase sender ID |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase web app ID |
| `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` | Optional Analytics measurement ID; unused by this app |

For Vercel, add the same `NEXT_PUBLIC_FIREBASE_*` values in Project Settings → Environment Variables. The Firebase web API key is not a server credential. Configure Firebase Authentication's authorized domains for the deployed site.

The Express API can still be started manually with `npm run api`; it continues to require MongoDB and its separate `server/.env`. It is intentionally not part of `npm run dev` in temporary local-only mode.

`.env`:

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_API_URL` | Legacy API URL; unused by the current local-only frontend |

The AI endpoints return a disabled status and chat requests return 503 when `AI_API_KEY` is empty. No key belongs in a `NEXT_PUBLIC_*` variable.

## Roles and sensitive data

- `admin`: company-wide access; the only role that can read salary amounts, review the audit chain, and finalize payroll.
- `hr`: employee operations and payroll draft preparation; can write salary data but never receives salary/payroll amounts in API serializers, exports, or AI tool results.
- `employee`: self-service access to their profile, attendance, leave, and finalized personal payslips.

Authentication accepts a Bearer token or the `hcm_token` httpOnly cookie. The server reloads the account for every authenticated request so role updates take effect immediately. Unknown request fields are rejected instead of silently ignored.

## Modules

- Organization settings and admin-managed departments, designations, leave types, and holidays.
- Employee directory, profile 360, and CSV template/import/export with dry-run validation.
- Attendance check-in/out, geofencing, working-day rules, corrections, and daily board.
- Leave balances, requests, manager decisions, and cancellation of pending requests.
- Payroll draft runs, configurable deductions/tax, admin finalization, personal payslips, and PDF downloads.
- Role-shaped dashboards, trends, announcements and notifications.
- Optional AI assistant with scoped tools, validated tool arguments, a maximum three-round tool loop, and confirm-before-submit leave drafts.
- Admin-only audit entries with a serialized SHA-256 hash chain and verification endpoint.

## Security mechanisms

| Risk | Mechanism |
|---|---|
| Password disclosure | bcrypt hashing; password field excluded by default |
| Role/scope escalation | Server-side authentication, role guards, scoped service queries, rejected unknown fields |
| Salary exposure to HR | Explicit serializers omit all salary and payroll amounts from HR responses |
| Repeated login/AI requests | IP-based login/signup limits, global API limit, per-user AI limit |
| Browser content framing/sniffing | Explicit `X-Frame-Options`, `X-Content-Type-Options`, and `Referrer-Policy` headers |
| AI prompt/tool misuse | Sanitized context, constrained tools, server-validated arguments, authenticated actor passed to services |
| Audit tampering detection | Append sequence, previous hash, canonical SHA-256 hash, verify endpoint |

The audit queue serializes appends within one server process. Deploy a single API writer or add a distributed sequencing mechanism before running multiple API instances. Hash verification detects edits but does not prevent a privileged database operator from rewriting the entire chain.

## API and commands

The API contract and role-shaped responses are described in [docs/api-contract.md](docs/api-contract.md). The API is rooted at `/api`; liveness is available at `/health` and `/api/health`.

| Command | Purpose |
|---|---|
| `npm run dev` | Next.js development server on port 3000 |
| `npm run build` | Next.js production build |
| `npm run api` | Local API with Node watch mode |
| `npm run api:online` | API with production Mongo selection |
| `npm run api:seed` | Seed local admin account |
| `npm run api:test` | Run backend unit/regression tests |
| `npm run db:start` / `npm run db:stop` | Start/stop project-local MongoDB |

## Verification

```bash
npm --prefix server test
npm run build
```

Business rules and utilities have unit coverage. End-to-end API workflows require a reachable MongoDB instance and configured seed credentials. Do not run `next build` and `next dev` simultaneously against the same `.next` directory; use `npm run clean` if the development manifest becomes stale.
