import User from "../models/User.js";
import { ROLES } from "../constants/roles.js";
import { EMPLOYMENT_STATUS } from "../constants/statuses.js";
import { ApiError } from "../utils/apiError.js";
import { escapeRegex, normalizeEmail, parsePagination } from "../utils/validate.js";
import { scopeFilter } from "../access/scope.js";
import { serializeDirectoryUser, serializeProfile } from "../access/policies.js";
import { attendanceSummary } from "./attendanceService.js";
import { balancesFor } from "./leaveService.js";

const DIRECTORY_FIELDS = "email fullName role employeeCode phone address departmentId designationId joinDate employmentStatus salary";

export async function searchUsers(actor, query = {}) {
  const filter = { ...scopeFilter(actor) };

  if (query.search) {
    filter.$or = [
      { email: new RegExp(escapeRegex(query.search), "i") },
      { fullName: new RegExp(escapeRegex(query.search), "i") },
      { employeeCode: new RegExp(escapeRegex(query.search), "i") },
    ];
  }

  if (query.role) {
    if (actor.role === ROLES.HR && query.role !== ROLES.EMPLOYEE) {
      throw new ApiError(403, "HR can only list employee accounts.");
    }

    filter.role = query.role;
  }

  if (query.departmentId) {
    filter.departmentId = query.departmentId;
  }

  if (query.employmentStatus) {
    filter.employmentStatus = query.employmentStatus;
  }

  const { page, limit, skip } = parsePagination(query);
  const total = await User.countDocuments(filter);
  const users = await User.find(filter)
    .sort({ email: 1 })
    .skip(skip)
    .limit(limit)
    .select(DIRECTORY_FIELDS)
    .lean();

  return {
    total,
    page,
    limit,
    users: users.map((user) => serializeDirectoryUser(user, actor)),
  };
}

export async function getProfile360(actor, userId) {
  const user = await User.findById(userId).select(DIRECTORY_FIELDS).lean();

  if (!user) {
    throw new ApiError(404, "User not found.");
  }

  const isSelf = String(user._id) === actor.id;
  const privileged = actor.role === ROLES.ADMIN || actor.role === ROLES.HR;

  if (!isSelf && !privileged) {
    throw new ApiError(403, "You do not have access to this profile.");
  }

  if (actor.role === ROLES.HR && user.role !== ROLES.EMPLOYEE && !isSelf) {
    throw new ApiError(403, "You do not have access to this profile.");
  }

  const year = String(new Date().getFullYear());
  const { summary } = await attendanceSummary(actor, String(user._id), `${year}-01-01`, `${year}-12-31`);
  const balances = await balancesFor(actor, String(user._id), year);

  return { user: serializeProfile(user, actor), attendanceSummary: summary, leaveBalances: balances };
}

export async function headcountForAi(actor) {
  const filter = { ...scopeFilter(actor), employmentStatus: EMPLOYMENT_STATUS.ACTIVE };
  const total = await User.countDocuments(filter);
  const byRole = await User.aggregate([
    { $match: { ...scopeFilter(actor), employmentStatus: EMPLOYMENT_STATUS.ACTIVE } },
    { $group: { _id: "$role", count: { $sum: 1 } } },
  ]);

  return {
    total,
    byRole: byRole.map((row) => ({ role: row._id, count: row.count })),
  };
}

export async function searchEmployeesForAi(actor, { query, departmentId, limit } = {}) {
  const result = await searchUsers(actor, {
    search: query,
    departmentId,
    limit: Math.min(Number(limit ?? 10) || 10, 20),
    page: 1,
  });

  return result.users.map((user) => ({
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    employeeCode: user.employeeCode,
    departmentId: user.departmentId,
    employmentStatus: user.employmentStatus,
  }));
}
