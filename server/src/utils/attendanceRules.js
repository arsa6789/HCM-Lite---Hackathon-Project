import { ATTENDANCE_STATUS } from "../constants/statuses.js";

export function evaluateCheckIn({ nowMinutes, officeStartMinutes, graceMinutes }) {
  const minutesLate = Math.max(0, nowMinutes - (officeStartMinutes + graceMinutes));

  return {
    status: minutesLate > 0 ? ATTENDANCE_STATUS.LATE : ATTENDANCE_STATUS.PRESENT,
    minutesLate,
  };
}

export function evaluateCheckOut({ previousStatus, workedMinutes, halfDayHours }) {
  if (workedMinutes < halfDayHours * 60) {
    return { status: ATTENDANCE_STATUS.HALF_DAY };
  }

  return {
    status: previousStatus === ATTENDANCE_STATUS.LATE ? ATTENDANCE_STATUS.LATE : ATTENDANCE_STATUS.PRESENT,
  };
}
