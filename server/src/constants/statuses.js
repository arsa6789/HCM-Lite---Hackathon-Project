export const ATTENDANCE_STATUS = Object.freeze({
  PRESENT: "present",
  LATE: "late",
  HALF_DAY: "half_day",
  ABSENT: "absent",
  LEAVE: "leave",
});

export const ATTENDANCE_STATUS_VALUES = Object.freeze(Object.values(ATTENDANCE_STATUS));

export const LEAVE_STATUS = Object.freeze({
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
  CANCELLED: "cancelled",
});

export const LEAVE_STATUS_VALUES = Object.freeze(Object.values(LEAVE_STATUS));

export const CORRECTION_STATUS = Object.freeze({
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
});

export const CORRECTION_STATUS_VALUES = Object.freeze(Object.values(CORRECTION_STATUS));

export const PAYROLL_STATUS = Object.freeze({
  DRAFT: "draft",
  FINALIZED: "finalized",
});

export const PAYROLL_STATUS_VALUES = Object.freeze(Object.values(PAYROLL_STATUS));

export const EMPLOYMENT_STATUS = Object.freeze({
  ACTIVE: "active",
  INACTIVE: "inactive",
});

export const EMPLOYMENT_STATUS_VALUES = Object.freeze(Object.values(EMPLOYMENT_STATUS));
