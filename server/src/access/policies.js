import { ApiError } from "../utils/apiError.js";
import { ROLES } from "../constants/roles.js";

export const CREATE_FIELDS = Object.freeze({
  [ROLES.ADMIN]: ["email", "password", "role", "fullName", "phone", "address", "employeeCode", "departmentId", "designationId", "joinDate", "employmentStatus", "salary"],
  [ROLES.HR]: ["email", "password", "fullName", "phone", "address", "employeeCode", "departmentId", "designationId", "joinDate", "employmentStatus", "salary"],
});

export const UPDATE_FIELDS = Object.freeze({
  [ROLES.ADMIN]: ["email", "role", "fullName", "phone", "address", "employeeCode", "departmentId", "designationId", "joinDate", "employmentStatus", "salary"],
  [ROLES.HR]: ["fullName", "phone", "address", "employeeCode", "departmentId", "designationId", "joinDate", "employmentStatus", "salary"],
  [ROLES.EMPLOYEE]: ["fullName", "phone", "address"],
});

export function pickFields(payload, fields) {
  return Object.fromEntries(
    fields.filter((field) => payload[field] !== undefined).map((field) => [field, payload[field]])
  );
}

export function assertFieldsAllowed(payload, allowed) {
  const denied = Object.keys(payload ?? {}).filter((field) => !allowed.includes(field));

  if (denied.length > 0) {
    throw new ApiError(403, `You cannot set these fields: ${denied.join(", ")}.`);
  }
}

export function serializeUser(user) {
  return {
    id: String(user._id ?? user.id),
    email: user.email,
    role: user.role,
  };
}

export const SALARY_KEYS = Object.freeze(["basic", "allowance", "currency"]);

export const PAYROLL_AMOUNT_KEYS = Object.freeze([
  "basic",
  "allowance",
  "hra",
  "medical",
  "gross",
  "perDay",
  "absentDeduction",
  "halfDayDeduction",
  "unpaidLeaveDeduction",
  "lateDeduction",
  "extraUnpaidDeduction",
  "totalDeductions",
  "taxable",
  "tax",
  "net",
]);

function serializeSalary(salary) {
  if (!salary || Number(salary.basic ?? 0) === 0 && Number(salary.allowance ?? 0) === 0 && !salary.currency) {
    return null;
  }

  return {
    basic: Number(salary.basic ?? 0),
    allowance: Number(salary.allowance ?? 0),
    currency: salary.currency ?? "PKR",
  };
}

function dayKeyOrNull(date) {
  if (!date) {
    return null;
  }

  const value = date instanceof Date ? date : new Date(date);

  if (Number.isNaN(value.getTime())) {
    return null;
  }

  return value.toISOString().slice(0, 10);
}

function baseDirectoryFields(user) {
  return {
    id: String(user._id ?? user.id),
    email: user.email,
    fullName: user.fullName ?? "",
    role: user.role,
    employeeCode: user.employeeCode ?? "",
    phone: user.phone ?? "",
    departmentId: user.departmentId ? String(user.departmentId) : null,
    designationId: user.designationId ? String(user.designationId) : null,
    joinDate: dayKeyOrNull(user.joinDate),
    employmentStatus: user.employmentStatus ?? "active",
  };
}

// Locked rule: HR is write-only on salaries — amount fields never enter an HR read path.
export function serializeDirectoryUser(user, viewer) {
  const out = baseDirectoryFields(user);

  if (viewer?.role === ROLES.ADMIN) {
    out.address = user.address ?? "";
    out.salary = serializeSalary(user.salary);
  } else if (viewer?.role === ROLES.HR) {
    out.address = user.address ?? "";
  }

  return out;
}

export function serializeProfile(user, viewer) {
  const out = {
    ...baseDirectoryFields(user),
    address: user.address ?? "",
  };

  if (viewer?.role === ROLES.ADMIN) {
    out.salary = serializeSalary(user.salary);
  }

  return out;
}

export function serializePayrollLine(line, viewer) {
  const out = {
    userId: String(line.userId),
    departmentId: line.departmentId ? String(line.departmentId) : null,
    presentDays: line.presentDays ?? 0,
    lateDays: line.lateDays ?? 0,
    halfDays: line.halfDays ?? 0,
    absentDays: line.absentDays ?? 0,
    paidLeaveDays: line.paidLeaveDays ?? 0,
    unpaidLeaveDays: line.unpaidLeaveDays ?? 0,
    currency: line.currency ?? "PKR",
  };

  if (viewer?.role === ROLES.ADMIN || (viewer?.role === ROLES.EMPLOYEE && viewer?.id === String(line.userId))) {
    for (const key of PAYROLL_AMOUNT_KEYS) {
      out[key] = line[key] ?? 0;
    }
  }

  return out;
}

export function serializePayrollRun(run, viewer) {
  const out = {
    id: String(run._id),
    month: run.month,
    status: run.status,
    workingDays: run.workingDays,
    preparedBy: run.preparedBy ? String(run.preparedBy) : null,
    finalizedBy: run.finalizedBy ? String(run.finalizedBy) : null,
    createdAt: run.createdAt ?? null,
  };

  if (viewer?.role === ROLES.ADMIN) {
    out.summary = run.summary ?? {};
  } else {
    const summary = run.summary ?? {};
    out.summary = { employeeCount: summary.employeeCount ?? 0, workingDays: summary.workingDays ?? 0 };
  }

  if (run.lines) {
    out.lines = run.lines.map((line) => serializePayrollLine(line, viewer));
  }

  return out;
}

export function serializeOrg(org) {
  if (!org) {
    return null;
  }

  return {
    id: String(org._id),
    companyName: org.companyName,
    officeStart: org.officeStart,
    officeEnd: org.officeEnd,
    graceMinutes: org.graceMinutes,
    halfDayHours: org.halfDayHours,
    weekendDays: org.weekendDays,
    currency: org.currency,
    hraPct: org.hraPct,
    medicalPct: org.medicalPct,
    geofence: org.geofence,
    latePolicy: org.latePolicy,
    taxSlabs: org.taxSlabs,
    updatedAt: org.updatedAt ?? null,
  };
}
