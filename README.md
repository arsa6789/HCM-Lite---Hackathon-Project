# HCM lite

HCM lite is a role-aware people operations workspace built with Next.js 15, React 19, Tailwind CSS, Express, and MongoDB/Mongoose. It includes employee profiles, attendance and corrections, leave, payroll, dashboards, announcements, notifications, an audit hash chain, and an optional OpenRouter assistant.

## Run locally

Prerequisites: Node.js 20+, npm, and MongoDB (`mongod`) for local development.

```bash
npm install
npm --prefix server install
cp server/.env.example server/.env
cp .env.example .env
```

Set `JWT_SECRET` and `SEED_ADMIN_PASSWORD` in `server/.env` before seeding. Start the local database and API:

```bash
npm run db:start
npm run api:seed
npm run api
```

In another terminal:

```bash
npm run dev
```

Open `http://localhost:3000`. Seeded admin credentials are the values configured in `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`. Public signup always creates an employee; admins create HR and admin accounts from the employee directory.

When using hosted MongoDB, set the appropriate URI in `server/.env` and use `npm run api:online`. The project-local MongoDB helper binds to `127.0.0.1:27017` and stores data under `server/.data/mongo`.

## Configuration

`server/.env`:

| Variable | Purpose |
|---|---|
| `MONGODB_URI` | Local/development Mongo connection string |
| `MONGODB_URI_ONLINE` | Production/online Mongo connection string |
| `JWT_SECRET` | Signing secret; use a cryptographically random value |
| `JWT_EXPIRES_IN` | Token lifetime, default `7d` |
| `PORT` | API port, default `4000` |
| `CORS_ORIGINS` | Comma-separated trusted frontend origins |
| `COOKIE_SECURE` | Set `true` when serving over HTTPS |
| `SEED_ADMIN_EMAIL` | Admin account created by the seed script |
| `SEED_ADMIN_PASSWORD` | Seed password, minimum 8 characters |
| `AI_API_KEY` | Optional OpenRouter API key; keep it only in `server/.env` |
| `AI_BASE_URL` | OpenRouter-compatible base URL, default `https://openrouter.ai/api/v1` |
| `AI_MODEL` | Tool-calling model, default `meta-llama/llama-3.3-70b-instruct:free` |

`.env`:

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_API_URL` | API base URL used by the browser, default `http://localhost:4000/api` |

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
