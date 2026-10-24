# HCM Lite — Auth & Access

JWT authentication with exactly three roles (`admin`, `hr`, `employee`) and a data-scope guard, split into a standalone API and a thin Next.js client.

Each account stores only four fields: `id`, `email`, `password` and `role`. No names, departments, salaries or other profile data.

```text
my-hackathon-app/
├── server/                  Express API (backend, runs on :4000)
│   ├── src/
│   │   ├── access/          scope resolution and field policies
│   │   ├── config/          env loading and Mongo connection
│   │   ├── constants/       the three roles
│   │   ├── controllers/     auth and user handlers
│   │   ├── middleware/      authenticate, role guard, record-scope guard, errors
│   │   ├── models/          User schema (email, password, role)
│   │   ├── routes/          /api/auth and /api/users
│   │   ├── scripts/         admin seed and local mongod runner
│   │   ├── utils/           password, tokens, cookies, validation
│   │   ├── app.js           Express app factory
│   │   └── server.js        bootstrap
│   └── test/                scope and policy tests
└── app/                     Next.js client (runs on :3000)
    ├── components/          AuthForm, Dashboard
    ├── lib/api.js           fetch wrapper and token storage
    └── page.js              session bootstrap
```

## Quick start

```bash
npm install
npm --prefix server install
cp server/.env.example server/.env
npm run db:start
npm run api:seed
npm run api
```

In a second terminal:

```bash
cp .env.example .env
npm run dev
```

Open http://localhost:3000 and log in with the seeded admin. New signups always receive the `employee` role, so use the admin account to create HR and other accounts.

`npm run db:start` launches a project-local `mongod` on `127.0.0.1:27017` with data in `server/.data/mongo`. Skip it when `MONGODB_URI` points at Atlas or another server.

## Environment

`server/.env`

| Variable | Default | Purpose |
|---|---|---|
| `MONGODB_URI` | required in development | local/testing connection string, `mongodb://127.0.0.1:27017/hcm_lite` |
| `MONGODB_URI_ONLINE` | required in production | online/production connection string |
| `JWT_SECRET` | required | signing secret, use 64 random bytes as hex |
| `PORT` | `4000` | API port |
| `NODE_ENV` | `development` | `production` selects `MONGODB_URI_ONLINE` |
| `JWT_EXPIRES_IN` | `7d` | token lifetime |
| `COOKIE_NAME` | `hcm_token` | httpOnly cookie name |
| `COOKIE_SECURE` | `false` | HTTPS-only cookie |
| `COOKIE_SAME_SITE` | `lax` | use `none` plus `COOKIE_SECURE=true` for cross-site frontends |
| `COOKIE_MAX_AGE_MS` | `604800000` | cookie lifetime |
| `CORS_ORIGINS` | `http://localhost:3000,http://localhost:3001` | comma-separated allowed origins |
| `SEED_ADMIN_EMAIL` | `admin@hcm.local` | seed account email |
| `SEED_ADMIN_PASSWORD` | empty | seed account password, 8+ characters |

`.env`

| Variable | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000/api` | API base URL used by the client |

Generate a secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Database selection

`server/src/config/db.js` chooses the connection string from `NODE_ENV`:

| `NODE_ENV` | URI used |
|---|---|
| `development` or unset | `MONGODB_URI` |
| `production` | `MONGODB_URI_ONLINE` |

Only the URI for the active environment is required at startup, so both can live in `server/.env` side by side. Both commands listen on port 4000, so run one at a time.

```bash
npm run api
npm run api:online
npm run api:seed
npm run api:seed:online
```

The startup log prints `Using the local MongoDB.` or `Using the online MongoDB.` without exposing credentials.

## Roles and data scope

Every request resolves the authenticated account into one of three scopes:

| Role | Scope | Filter applied |
|---|---|---|
| `admin` | every account | none |
| `hr` | every `employee` account | `{ role: "employee" }` |
| `employee` | own account | `{ _id: userId }` |

The record-scope guard runs before every `/:id` handler and answers 403 when the target is outside the caller's scope. Scope is merged into the query last, so `?role=` and pagination cannot widen it.

Field rules on top of the scope:

| Action | admin | hr | employee |
|---|---|---|---|
| List accounts | all | employees | denied |
| Read account | any | employees | self |
| Create account | any role | employee only | denied |
| Update account | email, password, role | employee email, own password | own password |
| Delete account | any except self | denied | denied |
| Change role | yes | no | no |

Invariants:

- The schema accepts only `admin`, `hr` and `employee`; anything else is rejected.
- Signup always creates an `employee`. Role assignment requires an admin.
- HR cannot read or modify admin or HR accounts, and cannot change employee roles or passwords. HR can change its own password.
- HR list requests that ask for a role other than `employee` are rejected instead of silently widened.
- An employee can change only their own password, not their email or role.
- An admin cannot demote or delete their own account.
- Disallowed fields in a request body produce 403 instead of being silently ignored.

## API

Base path: `/api`. The health probe answers on both `/health` and `/api/health`. Authenticate with `Authorization: Bearer <token>` or the `hcm_token` cookie.

| Method | Path | Access | Description |
|---|---|---|---|
| `GET` | `/api/health` | public | liveness probe |
| `POST` | `/api/auth/signup` | public | create an employee account |
| `POST` | `/api/auth/login` | public | return JWT, user and scope |
| `POST` | `/api/auth/logout` | public | clear the auth cookie |
| `GET` | `/api/auth/me` | authenticated | current user and scope |
| `GET` | `/api/users` | admin, hr | scoped list with `role`, `search`, `page`, `limit` |
| `POST` | `/api/users` | admin, hr | create an account |
| `GET` | `/api/users/:id` | authenticated | read one record inside scope |
| `PATCH` | `/api/users/:id` | authenticated | update fields allowed by role and scope |
| `DELETE` | `/api/users/:id` | admin | delete an account |

### Examples

```bash
curl -s http://localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@hcm.local","password":"Admin12345!"}'
```

```bash
TOKEN=<token-from-login>

curl -s http://localhost:4000/api/users \
  -H "Authorization: Bearer $TOKEN"
```

```bash
curl -s http://localhost:4000/api/users \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"email":"hr@hcm.local","password":"Hr12345678","role":"hr"}'
```

```bash
curl -s http://localhost:4000/api/users/<employee-id> \
  -X PATCH \
  -H "Authorization: Bearer $EMPLOYEE_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"password":"NewPassword123"}'
```

Responses use `{ "error": "..." }` for failures, with 400 for validation, 401 for missing or invalid tokens, 403 for role and scope denials, 404 for missing records and 409 for duplicate emails.

## Scripts

| Command | Effect |
|---|---|
| `npm run dev` | Next.js client on :3000 |
| `npm run clean` | delete the `.next` cache and build output |
| `npm run api` | API with `node --watch` on :4000 using the local database |
| `npm run api:online` | API with `node --watch` on :4000 using the online database |
| `npm run api:start` | local API without watch |
| `npm run api:start:online` | online API without watch |
| `npm run api:seed` | seed the admin into the local database |
| `npm run api:seed:online` | seed the admin into the online database |
| `npm run api:test` | run scope and policy tests |
| `npm run db:start` | start a local MongoDB in `server/.data/mongo` |
| `npm run db:stop` | stop the local MongoDB |
| `npm run db:status` | report whether the local MongoDB is running |
| `npm run build` | production build of the client |

## Local MongoDB

`npm run db:start` binds `mongod` to `127.0.0.1:27017` and stores data under `server/.data/mongo`, which is gitignored. The PID and log live in `server/.data`. No root access, systemd unit or global data directory is required.

If startup fails, check `server/.data/mongod.log`. To use the online database, set `MONGODB_URI_ONLINE` in `server/.env` and run the API with `NODE_ENV=production`.

## Notes

- Passwords are hashed with bcrypt at 12 rounds and the hash is `select: false`.
- The JWT carries only `sub` and `role`, and every request reloads the account so role changes take effect immediately.
- Tokens are returned in the login response and also set as an httpOnly cookie. The client stores the token in `localStorage` to send a Bearer header; remove that and rely on the cookie if you prefer.
- Rate limiting, refresh tokens, password reset and audit logging are not implemented.
- For production set `NODE_ENV=production`, `MONGODB_URI_ONLINE`, `COOKIE_SECURE=true` and `CORS_ORIGINS` to your deployed frontend origin.
- If the dev server reports `Could not find the module ... in the React Client Manifest`, stop every dev server, run `npm run clean`, then start `npm run dev` again. Do not run `next build` while `next dev` is using the same `.next` directory.
- If `mongodb+srv://` fails with `queryTxt ETIMEOUT`, use the standard `mongodb://` string from Atlas instead: list all replica-set hosts, then add `replicaSet`, `authSource=admin` and `tls=true`. That avoids the DNS TXT lookup.
