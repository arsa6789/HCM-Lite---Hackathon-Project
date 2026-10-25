import crypto from "node:crypto";
import { getFirebaseAuth } from "../config/firestore.js";
import User from "../models/User.js";
import Department from "../models/Department.js";
import Designation from "../models/Designation.js";
import { ApiError } from "../utils/apiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  serializeUser,
  serializeDirectoryUser,
  serializeProfile,
  CREATE_FIELDS,
  UPDATE_FIELDS,
  assertFieldsAllowed,
  pickFields,
} from "../access/policies.js";
import { resolveScope } from "../access/scope.js";
import { ROLES } from "../constants/roles.js";
import { EMPLOYMENT_STATUS_VALUES } from "../constants/statuses.js";
import {
  assertEmail,
  assertPassword,
  assertRole,
  assertDocumentId,
  escapeRegex,
  normalizeEmail,
  parsePagination,
} from "../utils/validate.js";
import { sanitizeText } from "../utils/sanitize.js";
import { searchUsers, getProfile360 } from "../services/employeeService.js";
import { parseCsv, toCsv, rowsToObjects } from "../utils/csv.js";
import { audit } from "../utils/audit.js";
import { notifyUsers } from "../utils/notify.js";

const CSV_COLUMNS = ["email", "fullName", "phone", "address", "employeeCode", "department", "designation", "joinDate", "employmentStatus"];
const ADMIN_CSV_COLUMNS = [...CSV_COLUMNS, "basic", "allowance", "currency"];

function buildProfileUpdates(picked) {
  const updates = {};

  if (picked.email !== undefined) {
    const email = normalizeEmail(picked.email);
    assertEmail(email);
    updates.email = email;
  }

  for (const field of ["fullName", "phone", "address", "employeeCode"]) {
    if (picked[field] !== undefined) {
      updates[field] = sanitizeText(picked[field], field === "address" ? 250 : 120);
    }
  }

  if (picked.departmentId !== undefined) {
    if (picked.departmentId === null || picked.departmentId === "") {
      updates.departmentId = null;
    } else {
      assertDocumentId(picked.departmentId, "departmentId");
      updates.departmentId = picked.departmentId;
    }
  }

  if (picked.designationId !== undefined) {
    if (picked.designationId === null || picked.designationId === "") {
      updates.designationId = null;
    } else {
      assertDocumentId(picked.designationId, "designationId");
      updates.designationId = picked.designationId;
    }
  }

  if (picked.joinDate !== undefined) {
    if (picked.joinDate === null || picked.joinDate === "") {
      updates.joinDate = null;
    } else {
      const date = new Date(picked.joinDate);

      if (Number.isNaN(date.getTime())) {
        throw new ApiError(400, "joinDate must be a valid date.");
      }

      updates.joinDate = date;
    }
  }

  if (picked.employmentStatus !== undefined) {
    if (!EMPLOYMENT_STATUS_VALUES.includes(picked.employmentStatus)) {
      throw new ApiError(400, "Invalid employmentStatus.");
    }

    updates.employmentStatus = picked.employmentStatus;
  }

  if (picked.role !== undefined) {
    assertRole(picked.role);
    updates.role = picked.role;
  }

  return updates;
}

function normalizeSalaryInput(salary) {
  if (salary === null) {
    return { basic: 0, allowance: 0 };
  }

  if (typeof salary !== "object" || Array.isArray(salary)) {
    throw new ApiError(400, "salary must be an object.");
  }

  const denied = Object.keys(salary).filter((key) => !["basic", "allowance", "currency"].includes(key));

  if (denied.length > 0) {
    throw new ApiError(403, `You cannot set these salary fields: ${denied.join(", ")}.`);
  }

  const out = {};

  if (salary.basic !== undefined) {
    const basic = Number(salary.basic);

    if (!Number.isFinite(basic) || basic < 0) {
      throw new ApiError(400, "salary.basic must be a non-negative number.");
    }

    out.basic = basic;
  }

  if (salary.allowance !== undefined) {
    const allowance = Number(salary.allowance);

    if (!Number.isFinite(allowance) || allowance < 0) {
      throw new ApiError(400, "salary.allowance must be a non-negative number.");
    }

    out.allowance = allowance;
  }

  if (salary.currency !== undefined) {
    out.currency = sanitizeText(salary.currency, 8) || "PKR";
  }

  return out;
}

export const listUsers = asyncHandler(async (req, res) => {
  const result = await searchUsers(req.user, req.query);
  res.json({ ...result, scope: resolveScope(req.user) });
});

export const getUser = asyncHandler(async (req, res) => {
  assertDocumentId(req.params.id, "user id");
  const result = await getProfile360(req.user, req.params.id);
  res.json({ ...result, scope: resolveScope(req.user) });
});

export const createUser = asyncHandler(async (req, res) => {
  const payload = req.body ?? {};
  const allowed = CREATE_FIELDS[req.user.role] ?? [];

  assertFieldsAllowed(payload, allowed);

  const email = normalizeEmail(payload.email);
  const password = String(payload.password ?? "");

  assertEmail(email);
  assertPassword(password);

  const role = req.user.role === ROLES.ADMIN ? payload.role ?? ROLES.EMPLOYEE : ROLES.EMPLOYEE;

  assertRole(role);

  const updates = buildProfileUpdates(pickFields(payload, allowed));
  const salary = payload.salary !== undefined ? normalizeSalaryInput(payload.salary) : {};

  const existing = await User.exists({ email });

  if (existing) {
    throw new ApiError(409, "An account with this email already exists.");
  }

  let authUser;
  try {
    authUser = await getFirebaseAuth().createUser({ email, password, displayName: updates.fullName || undefined });
    await getFirebaseAuth().setCustomUserClaims(authUser.uid, { role });
    const user = await User.create({ _id: authUser.uid, email, role, ...updates, salary });

    await audit(req.user, "user.create", "user", String(user._id), { after: serializeProfile(user.toObject(), req.user) }, req);
    await notifyUsers([user._id], {
      title: "Welcome to HCM Lite",
      body: "Your account has been created.",
      type: "system",
    });

    return res.status(201).json({
      message: "User created.",
      user: serializeDirectoryUser(user.toObject(), req.user),
    });
  } catch (error) {
    if (authUser) await getFirebaseAuth().deleteUser(authUser.uid).catch(() => {});
    if (error.code === "auth/email-already-exists") throw new ApiError(409, "An account with this email already exists.");
    throw error;
  }
});

export const updateUser = asyncHandler(async (req, res) => {
  assertDocumentId(req.params.id, "user id");
  const payload = req.body ?? {};
  const target = req.targetUser;
  const isSelf = String(target._id) === req.user.id;
  const baseFields = UPDATE_FIELDS[req.user.role] ?? [];
  const allowed = baseFields;

  if (req.user.role === ROLES.HR && !isSelf && target.role !== ROLES.EMPLOYEE) {
    throw new ApiError(403, "HR can only update employee accounts.");
  }

  assertFieldsAllowed(payload, allowed);

  const picked = pickFields(payload, allowed);

  if (Object.keys(picked).length === 0) {
    throw new ApiError(400, "No fields to update.");
  }

  const user = await User.findById(target._id);

  if (!user) {
    throw new ApiError(404, "User not found.");
  }

  if (isSelf && picked.role !== undefined && picked.role !== ROLES.ADMIN) {
    throw new ApiError(400, "You cannot change your own admin role.");
  }

  const before = serializeProfile(user.toObject(), req.user);
  const updates = buildProfileUpdates(picked);

  if (updates.email !== undefined || updates.fullName !== undefined) {
    await getFirebaseAuth().updateUser(String(user._id), {
      ...(updates.email !== undefined ? { email: updates.email } : {}),
      ...(updates.fullName !== undefined ? { displayName: updates.fullName } : {}),
    });
  }

  if (updates.role !== undefined && updates.role !== user.role) {
    const authUser = await getFirebaseAuth().getUser(String(user._id));
    await getFirebaseAuth().setCustomUserClaims(String(user._id), { ...(authUser.customClaims ?? {}), role: updates.role });
  }

  if (picked.email !== undefined && updates.email !== user.email) {
    const existing = await User.exists({ email: updates.email, _id: { $ne: user._id } });

    if (existing) {
      throw new ApiError(409, "An account with this email already exists.");
    }
  }

  Object.assign(user, updates);

  if (picked.salary !== undefined) {
    const salaryUpdates = normalizeSalaryInput(picked.salary);
    Object.assign(user.salary, salaryUpdates);
  }

  await user.save();

  const after = serializeProfile(user.toObject(), req.user);
  await audit(req.user, "user.update", "user", String(user._id), { before, after }, req);

  res.json({
    message: "User updated.",
    user: after,
  });
});

export const deleteUser = asyncHandler(async (req, res) => {
  if (String(req.targetUser._id) === req.user.id) {
    throw new ApiError(400, "You cannot delete your own account.");
  }

  await User.deleteOne({ _id: req.targetUser._id });
  await getFirebaseAuth().deleteUser(String(req.targetUser._id));
  await audit(req.user, "user.delete", "user", String(req.targetUser._id), { before: serializeDirectoryUser(req.targetUser, req.user) }, req);

  res.json({ message: "User deleted." });
});

function csvRowFor(user, includeSalary) {
  const row = [
    user.email,
    user.fullName ?? "",
    user.phone ?? "",
    user.address ?? "",
    user.employeeCode ?? "",
    user.departmentName ?? "",
    user.designationName ?? "",
    user.joinDate ? new Date(user.joinDate).toISOString().slice(0, 10) : "",
    user.employmentStatus ?? "active",
  ];

  if (includeSalary) {
    row.push(user.salary?.basic ?? 0, user.salary?.allowance ?? 0, user.salary?.currency ?? "PKR");
  }

  return row;
}

export const csvTemplate = asyncHandler(async (req, res) => {
  const includeSalary = req.user.role === ROLES.ADMIN;
  const columns = includeSalary ? ADMIN_CSV_COLUMNS : CSV_COLUMNS;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="employees-template.csv"');
  res.send(toCsv([columns, ["jane@example.com", "Jane Ali", "+92 300 0000000", "12 Main St", "E-001", "", "", "2026-01-15", "active"]]));
});

export const csvExport = asyncHandler(async (req, res) => {
  const includeSalary = req.user.role === ROLES.ADMIN;
  const columns = includeSalary ? ADMIN_CSV_COLUMNS : CSV_COLUMNS;
  const users = await User.find({}).sort({ email: 1 })
    .populate("departmentId", "name")
    .populate("designationId", "name")
    .lean();

  const scoped = users.filter((user) => {
    if (req.user.role === ROLES.ADMIN) {
      return true;
    }

    if (req.user.role === ROLES.HR) {
      return user.role === ROLES.EMPLOYEE || String(user._id) === req.user.id;
    }

    return String(user._id) === req.user.id;
  });

  const rows = scoped.map((user) => csvRowFor({
    ...user,
    departmentName: user.departmentId?.name ?? "",
    designationName: user.designationId?.name ?? "",
  }, includeSalary));

  await audit(req.user, "user.csv_export", "user", null, { count: rows.length }, req);

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="employees.csv"');
  res.send(toCsv([columns, ...rows]));
});

async function resolveRowRefs(row) {
  const refs = {};

  if (row.department) {
    const department = await Department.findOne({ name: { $regex: new RegExp(`^${escapeRegex(row.department.trim())}$`, "i") } });

    if (!department) {
      throw new ApiError(400, `Unknown department "${row.department}".`);
    }

    refs.departmentId = department._id;
  }

  if (row.designation) {
    const designation = await Designation.findOne({ name: { $regex: new RegExp(`^${escapeRegex(row.designation.trim())}$`, "i") } });

    if (!designation) {
      throw new ApiError(400, `Unknown designation "${row.designation}".`);
    }

    refs.designationId = designation._id;
  }

  return refs;
}

export const csvImport = asyncHandler(async (req, res) => {
  const csv = String(req.body?.csv ?? "");
  const dryRun = req.body?.dryRun !== false;

  if (!csv.trim()) {
    throw new ApiError(400, "csv content is required.");
  }

  const isAdmin = req.user.role === ROLES.ADMIN;
  const allowedColumns = isAdmin ? ADMIN_CSV_COLUMNS : CSV_COLUMNS;
  const rows = rowsToObjects(parseCsv(csv));
  const results = [];
  let created = 0;
  let skipped = 0;

  for (const row of rows) {
    const outcome = { row: row.__row, email: row.email || "", ok: false, errors: [] };

    try {
      const email = normalizeEmail(row.email);

      if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
        outcome.errors.push({ field: "email", reason: "valid email is required" });
      }

      const unknownColumns = Object.keys(row).filter(
        (key) => key !== "__row" && !allowedColumns.includes(key)
      );

      if (unknownColumns.length > 0) {
        outcome.errors.push({ field: unknownColumns[0], reason: `unknown column "${unknownColumns[0]}"` });
      }

      if (row.employmentStatus && !EMPLOYMENT_STATUS_VALUES.includes(row.employmentStatus)) {
        outcome.errors.push({ field: "employmentStatus", reason: "must be active or inactive" });
      }

      if (row.joinDate && Number.isNaN(new Date(row.joinDate).getTime())) {
        outcome.errors.push({ field: "joinDate", reason: "invalid date" });
      }

      if (["basic", "allowance", "currency"].some((key) => row[key]) && !isAdmin) {
        outcome.errors.push({ field: "basic", reason: "HR cannot import salary columns" });
      }

      const refs = outcome.errors.length === 0 ? await resolveRowRefs(row) : {};

      if (email && (await User.exists({ email }))) {
        outcome.errors.push({ field: "email", reason: "an account with this email already exists" });
      }

      if (outcome.errors.length > 0) {
        skipped += 1;
        results.push(outcome);
        continue;
      }

      if (dryRun) {
        outcome.ok = true;
        results.push(outcome);
        continue;
      }

      const tempPassword = crypto.randomBytes(9).toString("base64url");
      const salary = isAdmin && (row.basic || row.allowance || row.currency)
        ? {
            basic: Number(row.basic) || 0,
            allowance: Number(row.allowance) || 0,
            currency: sanitizeText(row.currency, 8) || "PKR",
          }
        : {};

      let firebaseUser;
      let user;
      try {
        firebaseUser = await getFirebaseAuth().createUser({ email, password: tempPassword, displayName: sanitizeText(row.fullName, 120) || undefined });
        await getFirebaseAuth().setCustomUserClaims(firebaseUser.uid, { role: ROLES.EMPLOYEE });
        user = await User.create({
          _id: firebaseUser.uid,
          email,
          role: ROLES.EMPLOYEE,
          fullName: sanitizeText(row.fullName, 120),
          phone: sanitizeText(row.phone, 40),
          address: sanitizeText(row.address, 250),
          employeeCode: sanitizeText(row.employeeCode, 40) || undefined,
          ...refs,
          joinDate: row.joinDate ? new Date(row.joinDate) : undefined,
          employmentStatus: row.employmentStatus || "active",
          salary,
        });
      } catch (error) {
        if (firebaseUser) await getFirebaseAuth().deleteUser(firebaseUser.uid).catch(() => {});
        throw error;
      }

      created += 1;
      outcome.ok = true;
      outcome.tempPassword = tempPassword;
      results.push(outcome);

      await notifyUsers([user._id], {
        title: "Welcome to HCM Lite",
        body: "Your account has been created via CSV import.",
        type: "system",
      });
    } catch (error) {
      skipped += 1;
      outcome.errors.push({ field: "row", reason: error.message });
      results.push(outcome);
    }
  }

  if (!dryRun) {
    await audit(req.user, "user.csv_import", "user", null, { created, skipped, total: rows.length }, req);
  }

  res.json({ dryRun, created, skipped, rows: results });
});
