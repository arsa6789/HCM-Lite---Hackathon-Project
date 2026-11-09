# API contract

Base URL: `http://localhost:4000/api` locally. Protected routes require `Authorization: Bearer <Supabase access token>`. Obtain the access token from the Supabase JS client session. The API validates it with Supabase Auth and resolves the caller's role from the server-side HCM user profile. Role claims or user metadata supplied by the browser are not trusted.

## Auth

- `GET /auth/me` — protected; returns the authenticated profile and resolved access scope.
- `POST /auth/signup`, `POST /auth/login` — retired API endpoints; use Supabase Auth client methods `signUp` and `signInWithPassword`.
- `POST /auth/logout` — client-side sign-out is performed with `supabase.auth.signOut()`.

## Health

- `GET /health` or `GET /api/health` — public; reports API uptime and whether the server-side Supabase configuration is present.

## Protected modules

The protected API modules include users, organization settings, attendance, leave applications, payroll runs and payslips, announcements, notifications, audit events, dashboard summaries, and assistant status/actions. Routes retain the existing role checks and record-scope policies. See `server/src/routes/` for exact paths and methods.
