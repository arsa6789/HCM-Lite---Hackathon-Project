# HCM Lite — API Contract (v1)

Base: `http://localhost:4000/api`. Authenticate protected routes with `Authorization: Bearer <Firebase ID token>`. Obtain the token from Firebase Authentication (`currentUser.getIdToken()`). The Express API verifies the token with Firebase Admin and reads the caller's role from server-managed Firebase custom claims. Only health and Firebase auth handoff routes are public.

Errors: `{ "error": "message" }` — 400 validation, 401 auth, 403 role/scope/field denial, 404 missing, 409 conflict/duplicate, 429 rate limited, 503 AI disabled, 502 AI provider error.
Errors: `{ "error": "message" }` — 400 validation, 401 auth, 403 role/scope/field denial, 404 missing, 409 conflict/duplicate, 410 retired custom-auth route, 429 rate limited, 503 AI disabled, 502 AI provider error.

Roles: `admin` (company level, sees salary amounts), `hr` (people ops, **write-only on salaries — never receives salary/amount fields in any response**), `employee` (self-service).

Day keys are `YYYY-MM-DD` strings. Months are `YYYY-MM`. Datetimes are ISO 8601.

## Auth (Firebase Authentication)

## Users / Employees (M3)
  - DirectoryUser: `{id,email,fullName,role,employeeCode,phone,departmentId,designationId,joinDate,employmentStatus}` + `salary:{basic,allowance,currency}` **admin only** + `address` (admin/hr).

## Organization (M2)
  - `/departments` `{name,description?}` ; `/designations` `{name,description?}`
  - `/leave-types` `{name,annualDays,paid}` ; `/holidays` `{name,date,recurring}`
  - list → `{items:[...]}` (each with `id`); create → 201 `{item}`; `PATCH /:id` → `{item}`; `DELETE /:id` → `{message}`; duplicate name → 409.

## Attendance (M4) — org must be configured (400 otherwise on writes)
  - AttendanceRecord: `{id,userId,date,status,minutesLate,workedMinutes,checkInAt,checkOutAt,source,correction:{status,reason,newCheckInAt,newCheckOutAt,reviewNote,reviewedAt}|null}`

## Leave (M5) — org must be configured for apply/review
  - Application: `{id,userId,user:{id,email,fullName},leaveTypeId,leaveTypeName,paid,fromDate,toDate,days,reason,status,reviewNote,reviewedAt,createdAt}`

## Payroll (M6) — org must be configured
  - Run: `{id,month,status:"draft"|"finalized",workingDays,lines:[Line],summary:{employeeCount,totalGross,totalDeductions,totalTax,totalNet},preparedBy,finalizedBy,createdAt}`
  - Line: `{userId,email,fullName,departmentId,presentDays,lateDays,halfDays,absentDays,paidLeaveDays,unpaidLeaveDays,basic,allowance,hra,medical,gross,perDay,absentDeduction,halfDayDeduction,unpaidLeaveDeduction,lateDeduction,extraUnpaidDeduction,totalDeductions,taxable,tax,net}`
  - **Amount fields (`basic…net`) are present for admin and for a user reading their own line only. For HR, every response strips all amount fields — lines carry counts only, and `summary` carries `{employeeCount,workingDays}` only.**

## Dashboard (M7)
  - Common: `{role:"employee"|"org", range:{from,to,workingDays}, counts:{present,late,halfDay,absent,leave}, attendanceRate, lateRate, lateMinutes, workedHours, leave:{daysInRange,balances:[Balance]}, trend:[{date,rate,present,late,halfDay,absent}], headcount, pendingLeaves, departments:[{id,name,count}], topLateComers:[{userId,fullName,email,count}], leaveByType:[{name,approvedDays}], announcements:[{id,title,body,createdAt,pinned}]}` (employee gets personal values; org-view fields filled for admin/hr)
  - Admin extra: `payroll:{month,totalGross,totalDeductions,totalTax,totalNet,employeeCount}` (last finalized run). HR never receives payroll amounts.

## AI Assistant (M8)
  - LeaveDraft: `{type, start, end, reason, days, leaveTypeId}` — pre-filled form data; client submits via `POST /leave`; never auto-saved.
  - Tools (server-side, scope-checked): `get_org_policy, get_headcount, get_attendance_summary, get_late_employees, get_leave_summary, get_my_leave_balance, get_payroll_summary, search_employees, draft_leave_request`. 503 when `AI_API_KEY` unset.

## Comms (M9)

## Reference data used by clients
