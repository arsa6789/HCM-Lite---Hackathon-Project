# HCM Lite — Refined Hybrid Plan (Node/Express/Mongoose backend + Next.js 15 frontend)

## Locked rules (strictly enforced, never relaxed by later phases)

1. **HR is write-only on salaries.** HR may assign salary fields and prepare payroll drafts, but explicit serializers (`serializeProfile`, `serializeDirectoryUser`, `serializePayrollLine`) strip salary/payroll amounts from **every** HR read path (REST responses, CSV export, AI tool outputs). Admin sees amounts; employees see their own payslips only.
2. **AI assistant targets OpenRouter** (`AI_BASE_URL=https://openrouter.ai/api/v1`, key only in `server/.env` as `AI_API_KEY`, model via `AI_MODEL` — default a free tool-calling model) with a **≤3 round tool loop** where every tool executes the **identical service functions as REST**, passing the authenticated actor — no parallel authorization path. AI drafts are schema-validated server-side and submitted by users through normal REST endpoints.
3. **Audit logs append to an immutable SHA-256 hash chain** (`hash = sha256(prevHash + canonical entry)`) via a serialized write queue; append-only, no update/delete path; a verify endpoint recomputes the chain.

## Library strategy

- **Adopted production libraries:** `recharts` (dashboard charts), `pdf-lib` (payslip PDFs), `date-fns` (all date/working-day logic, server + frontend).
- **Hand-rolled utilities:** in-memory rate limiter, CSV parse/serialize, OpenRouter fetch client. Base stack unchanged: Next.js 15 + Tailwind, Express + Mongoose, bcrypt, cors, dotenv, jsonwebtoken, node:crypto. Installs: `npm i recharts date-fns` at root; `npm --prefix server i pdf-lib date-fns`.

## Phase 1 — Backend Foundation (`server/src`) ← starts immediately on approval

- `constants/statuses.js` — attendance `present|late|half_day|absent|leave`; leave `pending|approved|rejected|cancelled`; correction `pending|approved|rejected`; payroll `draft|finalized`; employment `active|inactive`.
- `utils/sanitize.js` — strip control chars/newlines (log + prompt-injection defense), clamp lengths, `sanitizeForLlm`.
- `utils/rateLimit.js` — in-memory sliding window `makeLimiter({windowMs, max, keyBy})`, 429 + Retry-After, lazy cleanup.
- `utils/csv.js` — RFC-4180 parse/serialize with column allowlists.
- `utils/pdf.js` — **pdf-lib** wrapper `buildPayslipPdf(line, run, org, employee)` → Buffer (A4, Helvetica, company header, earnings/deductions, net pay).
- `utils/dates.js` — **date-fns** helpers: `yyyy-MM-dd` day keys, minutes diff, working-day iteration (eachDayOfInterval + org weekendDays/holidays), HH:mm parse, haversine for geofence.
- `utils/audit.js` — hash-chain appender per locked rule 3, sanitized meta **including before/after JSON for update actions**, actor + IP capture.
- `config/env.js` — add `aiApiKey`/`aiBaseUrl`/`aiModel`; AI routes return 503 when key absent.

## Phase 2 — Models & access layer

- **User (extend)**: +`fullName, phone, address, employeeCode, departmentId, designationId, joinDate, employmentStatus, salary {basic, allowance, currency}` (all optional — existing data safe; password stays `select:false`). Brief: HR assigns salary structure as **(basic, allowance)**; employee self-edit covers **phone and address**.
- **Organization (singleton)**: companyName, officeStart/End, graceMinutes, weekendDays, halfDayHours (brief M2 says "under 5 h", M4 says "under 6 h" — keep configurable, default 6), geofence, latePolicy, progressive taxSlabs.
- **Department, Designation, LeaveType, Holiday, Attendance** (unique userId+date — second check-in → 409; corrections), **LeaveApplication, PayrollRun** (month, status, lines[], summary), **Announcement, Notification, AuditLog (with before/after JSON meta), AiLog** (per-call log of AI usage). Leave balances are computed on the fly (entitled − approved − pending); "unpaid remainder" is modeled as a `paid: false` LeaveType, since the brief allows days beyond quota to go unpaid.
- `scope.js` + `policies.js` extended per locked rule 1; unknown fields → 403.

## Phase 3 — Module services & routes (all behind `authenticate`; org must be configured before M4–M6 — empty-state rule)

- **M2 Org**: `GET/PUT /api/org` (admin, audit); CRUD departments/designations/leave-types/holidays (admin write, auth read).
- **M3 Employees**: `/api/users` filters + pagination; `GET /:id` = Employee 360; CSV import `dryRun:true|false` (dry-run = zero writes) + export/template (no salary columns for HR).
- **M4 Attendance**: check-in (working-day + geofence + grace→late), check-out (workedMinutes→half_day), board (hr/admin; employee self), correction request/review.
- **M5 Leave**: apply (working-day count via date-fns, overlap + balance validation), approve/reject (balance decrement, attendance→`leave`, notify, audit), cancel own pending, balances.
- **M6 Payroll**: draft builder from attendance aggregates + salary + latePolicy + taxSlabs, using the brief's exact formulas — Gross = basic + allowance + HRA (40% basic) + medical (10% basic); per-day = gross ÷ working days; absent deduction = absent × per-day; half-day = 0.5 × per-day each; late = 1.6% of gross each, beyond 3 lates = 1 extra unpaid day; progressive tax slabs; net = gross − deductions − tax; settings apply to new runs only. HR sees lines sans amounts; finalize admin-only (locks, notifies, audits); `GET /payroll/payslip/:runId/:userId.pdf` (self or in-scope, finalized only → pdf-lib).
- **M7 Dashboard**: `GET /dashboard/summary?from&to&department` — headcount, attendance rate = (present + late + 0.5×half_day)/workingDayRecords×100, late % = late/workingDayRecords×100, trends (recharts-ready), payroll totals admin-only.
- **M8 AI**: `POST /ai/chat` (20/hr/user) per locked rule 2. Brief tool names, exactly: `get_headcount, get_attendance_summary, get_late_employees, get_leave_summary, get_my_leave_balance, get_payroll_summary, search_employees`, plus `get_org_policy` and `draft_leave_request`. **15 s round-trip cap** per OpenRouter call with a friendly fallback message; tool arguments JSONSchema-validated; context sanitized (no raw JSON dumps); every call logged in `ai_log`; UI marks every answer with an **"AI-generated" label**; smart-leave draft uses the brief's `{type, start, end, reason}` shape; policy Q&A answers strictly from the Section-3 business rules embedded in the system prompt.
- **M9 Comms & Audit**: announcements CRUD + notification fan-out; notifications read/read-all; **audit log stores actor, action, entity and sanitized before/after JSON** for updates; `GET /api/audit` (admin only — HR cannot view it) + `/api/audit/verify`.
- Rate limits: login/signup 10/15min/IP, global 300/min, AI 20/hr/user; hand-set security headers (no helmet).

## Phase 4 — Frontend (light enterprise restyle)

- Roboto (Google Fonts link) + Open Sans fallback; white surfaces, slate text, indigo-600 accent, 1px borders, 150ms transitions; all banned patterns removed.
- `/` landing (sticky floating navbar, narrative sections), `/login`, `/console/*` shell (Topbar + role-filtered Sidebar + enterprise LoadingScreen, mobile 375px+).
- Pages: Dashboard (StatCards + recharts Line/Bar/Pie; brief KPIs: headcount, on-leave today, late today, absent today, pending approvals, attendance rate, late %, leave utilization per type, top 5 late comers, avg hours worked; admin-only payroll cost & avg salary; **latest announcements surfaced on every dashboard**; employee personal view: hours this week vs 40 h, late count this month, pending requests, balances, personal attendance %), Organization, Employees (DataTable + CSV wizard + 360 profile), Attendance (check-in/out + board + corrections + **attendance calendar view**), Leave, Payroll (finalize + PDF download), Announcements, Audit (chain-verify badge), Assistant (full page, standard loading, confirmable drafts, "AI-generated" label on every answer).
- Shared: Button, Input, Select, Modal, ConfirmDialog, Badge, StatCard, DataTable, Pagination, EmptyState, Toast, underline Tabs; `lib/api.js` + `apiDownload`.

## Phase 5 — Tests & verification

- `node --test`: serializer salary-strip matrix, attendance engine, leave engine, payroll math, rate limiter, sanitize, CSV round-trip, pdf-lib smoke, audit tamper detection; existing tests keep passing.
- `npm --prefix server test`, `npm run build`, `db:start` + `api:dev` + curl smoke (seed → org → accounts → check-in → leave approve → payroll finalize → payslip → audit verify; AI 503s gracefully without key).
- README rewrite (modules, env incl. `AI_API_KEY/AI_BASE_URL/AI_MODEL`, threat→mechanism map); `.env.example` updates. No git commits unless asked.

Execution begins with **Phase 1: Backend Foundation** immediately upon approval, then proceeds phase by phase.
