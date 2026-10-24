# HCM Lite — API Contract (v1)

Base: `http://localhost:4000/api`. Auth: `Authorization: Bearer <token>` or `hcm_token` httpOnly cookie. All routes require authentication unless marked public.

Errors: `{ "error": "message" }` — 400 validation, 401 auth, 403 role/scope/field denial, 404 missing, 409 conflict/duplicate, 429 rate limited, 503 AI disabled, 502 AI provider error.

Roles: `admin` (company level, sees salary amounts), `hr` (people ops, **write-only on salaries — never receives salary/amount fields in any response**), `employee` (self-service).

Day keys are `YYYY-MM-DD` strings. Months are `YYYY-MM`. Datetimes are ISO 8601.

## Auth (public except /me)
- `POST /auth/signup` `{email,password}` → 201 `{message, user:{id,email,role:"employee"}}`
- `POST /auth/login` `{email,password}` → `{message, token, user:{id,email,role}, scope:{type:"all"|"employees"|"self", userId}}`
- `POST /auth/logout` → `{message}`
- `GET /auth/me` → `{user:{id,email,role}, scope}`

## Users / Employees (M3)
- `GET /users?search&role&departmentId&employmentStatus&page&limit` → `{total,page,limit,scope,users:[DirectoryUser]}`
  - DirectoryUser: `{id,email,fullName,role,employeeCode,phone,departmentId,designationId,joinDate,employmentStatus}` + `salary:{basic,allowance,currency}` **admin only** + `address` (admin/hr).
- `POST /users` admin/hr (hr creates employees only) `{email,password,role?,fullName?,phone?,address?,employeeCode?,departmentId?,designationId?,joinDate?,employmentStatus?,salary?}` → 201 `{message,user}`
- `GET /users/:id` → 360: `{user:{...profile; salary only if admin or self}, attendanceSummary:{presentDays,lateDays,halfDays,absentDays,leaveDays,lateMinutes,workedMinutes,from,to}, leaveBalances:[Balance]}`
- `PATCH /users/:id` → `{message,user}` (role-appropriate fields; unknown fields → 403)
- `DELETE /users/:id` admin, never self → `{message}`
- `GET /users/csv/template` → text/csv (admin has salary columns, hr does not)
- `GET /users/csv/export` → text/csv (same column rule)
- `POST /users/csv/import` admin/hr `{csv:"...", dryRun:bool}` → `{created,skipped,rows:[{row,email,ok,errors:[{field,reason}],tempPassword?}]}` (tempPassword only when commit generates one; dryRun never writes)

## Organization (M2)
- `GET /org` → `{org: Organization|null}` — Organization: `{id,companyName,officeStart,officeEnd,graceMinutes,halfDayHours,weekendDays:[0..6],currency,hraPct,medicalPct,geofence:{enabled,lat,lng,radiusMeters},latePolicy:{deductionPerLatePct,latesEqualToAbsent},taxSlabs:[{upTo|null,ratePct}]}`
- `PUT /org` admin → `{org}`
- CRUD, admin writes / authenticated reads:
  - `/departments` `{name,description?}` ; `/designations` `{name,description?}`
  - `/leave-types` `{name,annualDays,paid}` ; `/holidays` `{name,date,recurring}`
  - list → `{items:[...]}` (each with `id`); create → 201 `{item}`; `PATCH /:id` → `{item}`; `DELETE /:id` → `{message}`; duplicate name → 409.

## Attendance (M4) — org must be configured (400 otherwise on writes)
- `POST /attendance/check-in` `{lat?,lng?,accuracyM?}` → 201 `{attendance}` (409 if exists today; 403 outside geofence; status present/late + minutesLate)
- `POST /attendance/check-out` → `{attendance}` (409 if already out; recomputes status incl. half_day)
- `GET /attendance?userId&from&to&status&page&limit` → `{total,page,limit,records:[AttendanceRecord]}` (employee forced self; hr limited to employees+self)
  - AttendanceRecord: `{id,userId,date,status,minutesLate,workedMinutes,checkInAt,checkOutAt,source,correction:{status,reason,newCheckInAt,newCheckOutAt,reviewNote,reviewedAt}|null}`
- `GET /attendance/board?date&departmentId` admin/hr → `{date,isWorkingDay,isHoliday,rows:[{user:DirectoryUser,record:AttendanceRecord|null}]}`
- `POST /attendance/:id/correction` self `{reason,newCheckInAt?,newCheckOutAt?}` → `{attendance}` (409 if a correction is already pending)
- `PATCH /attendance/:id/correction` admin/hr `{decision:"approved"|"rejected",reviewNote?}` → `{attendance}` (hr cannot review own record)

## Leave (M5) — org must be configured for apply/review
- `GET /leave/balances?userId&year` → `{balances:[Balance]}`; Balance: `{leaveTypeId,name,paid,annualDays,used,pending,remaining}` (employee self; hr employees+self; admin any)
- `POST /leave` `{leaveTypeId,fromDate,toDate,reason}` → 201 `{application}` (working days only; overlap → 409; insufficient balance → 400)
- `GET /leave?status&userId&from&to&page&limit` → `{total,page,limit,applications:[Application]}`
  - Application: `{id,userId,user:{id,email,fullName},leaveTypeId,leaveTypeName,paid,fromDate,toDate,days,reason,status,reviewNote,reviewedAt,createdAt}`
- `PATCH /leave/:id/review` admin/hr `{decision:"approved"|"rejected",reviewNote?}` → `{application}` (hr cannot review own; approval marks attendance `leave` for each working day)
- `PATCH /leave/:id/cancel` owner, pending only → `{application}`

## Payroll (M6) — org must be configured
- `POST /payroll/runs` admin/hr `{month:"YYYY-MM"}` → 201 `{run}` (draft built server-side; 409 if month exists)
  - Run: `{id,month,status:"draft"|"finalized",workingDays,lines:[Line],summary:{employeeCount,totalGross,totalDeductions,totalTax,totalNet},preparedBy,finalizedBy,createdAt}`
  - Line: `{userId,email,fullName,departmentId,presentDays,lateDays,halfDays,absentDays,paidLeaveDays,unpaidLeaveDays,basic,allowance,hra,medical,gross,perDay,absentDeduction,halfDayDeduction,unpaidLeaveDeduction,lateDeduction,extraUnpaidDeduction,totalDeductions,taxable,tax,net}`
  - **Amount fields (`basic…net`) are present for admin and for a user reading their own line only. For HR, every response strips all amount fields — lines carry counts only, and `summary` carries `{employeeCount,workingDays}` only.**
- `GET /payroll/runs` admin/hr → `{runs:[Run summary without lines]}`
- `GET /payroll/runs/:id` admin/hr → `{run}` (HR: amounts stripped)
- `POST /payroll/runs/:id/finalize` admin only → `{run}` (locks; notifies each employee)
- `DELETE /payroll/runs/:id` admin/hr, draft only → `{message}`
- `GET /payroll/mine?userId` → `{payslips:[{runId,month,status,line}]}` (employee forced self, finalized runs only; admin may pass userId; hr gets amounts stripped)
- `GET /payroll/runs/:id/payslips/:userId.pdf` → PDF (admin any; employee self; finalized runs only; hr 403)

## Dashboard (M7)
- `GET /dashboard/summary?from&to&departmentId` → role-shaped `{dashboard}`:
  - Common: `{role:"employee"|"org", range:{from,to,workingDays}, counts:{present,late,halfDay,absent,leave}, attendanceRate, lateRate, lateMinutes, workedHours, leave:{daysInRange,balances:[Balance]}, trend:[{date,rate,present,late,halfDay,absent}], headcount, pendingLeaves, departments:[{id,name,count}], topLateComers:[{userId,fullName,email,count}], leaveByType:[{name,approvedDays}], announcements:[{id,title,body,createdAt,pinned}]}` (employee gets personal values; org-view fields filled for admin/hr)
  - Admin extra: `payroll:{month,totalGross,totalDeductions,totalTax,totalNet,employeeCount}` (last finalized run). HR never receives payroll amounts.

## AI Assistant (M8)
- `GET /ai/status` → `{enabled:boolean, model:string}`
- `POST /ai/chat` (limit 20/hr/user) `{messages:[{role:"user"|"assistant",content:string}]}` (≤10 messages, content ≤2000 chars) → `{reply:string, draft:LeaveDraft|null, toolsUsed:[string]}`
  - LeaveDraft: `{type, start, end, reason, days, leaveTypeId}` — pre-filled form data; client submits via `POST /leave`; never auto-saved.
  - Tools (server-side, scope-checked): `get_org_policy, get_headcount, get_attendance_summary, get_late_employees, get_leave_summary, get_my_leave_balance, get_payroll_summary, search_employees, draft_leave_request`. 503 when `AI_API_KEY` unset.

## Comms (M9)
- `GET /announcements?page&limit` → `{total,announcements:[{id,title,body,audience:{type,role?,departmentId?},pinned,createdBy,createdAt}]}` (employee sees all+own role+own department)
- `POST /announcements` admin/hr `{title,body,audience,pinned?}` → 201 (fans out notifications)
- `PATCH /announcements/:id` → `{announcement}`; `DELETE /announcements/:id` admin (hr: own) → `{message}`
- `GET /notifications?page&limit` → `{total,unread,notifications:[{id,title,body,type,link,read,createdAt}]}`
- `PATCH /notifications/:id/read` → `{notification}`; `POST /notifications/read-all` → `{message}`
- `GET /audit?action&entity&actorId&from&to&page&limit` admin → `{total,entries:[{seq,at,actor:{id,role},action,entity,entityId,meta,ip,hash}]}`
- `GET /audit/verify` admin → `{valid,checked,brokenAt?}`

## Reference data used by clients
- `GET /departments` etc. provide name maps for tables. `GET /org` gives office hours/geofence state for the check-in card. `GET /leave-types` for the apply form. Role labels: admin→Admin, hr→HR, employee→Employee.
