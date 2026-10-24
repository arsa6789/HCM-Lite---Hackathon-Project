import { ROLES } from "../constants/roles.js";

export const SCOPE_TYPES = Object.freeze({
  ALL: "all",
  EMPLOYEES: "employees",
  SELF: "self",
});

export function resolveScope(actor) {
  if (!actor) {
    return { type: SCOPE_TYPES.SELF, userId: null };
  }

  const userId = actor.id ? String(actor.id) : null;

  if (actor.role === ROLES.ADMIN) {
    return { type: SCOPE_TYPES.ALL, userId };
  }

  if (actor.role === ROLES.HR) {
    return { type: SCOPE_TYPES.EMPLOYEES, userId };
  }

  return { type: SCOPE_TYPES.SELF, userId };
}

export function canAccessRecord(actor, record) {
  const scope = resolveScope(actor);

  if (scope.type === SCOPE_TYPES.ALL) {
    return true;
  }

  if (!record) {
    return false;
  }

  if (scope.userId && String(record._id ?? record.id) === scope.userId) {
    return true;
  }

  if (scope.type === SCOPE_TYPES.EMPLOYEES) {
    return record.role === ROLES.EMPLOYEE;
  }

  return false;
}

export function scopeFilter(actor) {
  const scope = resolveScope(actor);

  if (scope.type === SCOPE_TYPES.ALL) {
    return {};
  }

  if (scope.type === SCOPE_TYPES.EMPLOYEES) {
    return { role: ROLES.EMPLOYEE };
  }

  return scope.userId ? { _id: scope.userId } : { _id: { $in: [] } };
}

export function isSelf(actor, record) {
  return Boolean(actor?.id && String(record?._id ?? record?.id) === actor.id);
}

export function isEmployeeRecord(record) {
  return record?.role === ROLES.EMPLOYEE;
}
