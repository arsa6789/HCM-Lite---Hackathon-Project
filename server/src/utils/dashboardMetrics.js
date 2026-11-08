import { ATTENDANCE_STATUS } from "../constants/statuses.js";

function round1(value) {
  return Math.round(value * 10) / 10;
}

export function summarizeAttendance(records = [], expectedSlots = 0) {
  const expected = Math.max(0, Math.floor(Number(expectedSlots) || 0));
  const counts = {
    present: records.filter((record) => record.status === ATTENDANCE_STATUS.PRESENT).length,
    late: records.filter((record) => record.status === ATTENDANCE_STATUS.LATE).length,
    halfDay: records.filter((record) => record.status === ATTENDANCE_STATUS.HALF_DAY).length,
    absent: 0,
    leave: records.filter((record) => record.status === ATTENDANCE_STATUS.LEAVE).length,
  };

  // Attendance records are only created when someone checks in or has approved
  // leave. Any remaining expected working-day slot is therefore an absence,
  // whether or not an explicit `absent` row exists.
  counts.absent = Math.max(0, expected - counts.present - counts.late - counts.halfDay - counts.leave);
  const scheduledSlots = Math.max(0, expected - counts.leave);
  const attendedSlots = counts.present + counts.late + 0.5 * counts.halfDay;

  return {
    counts,
    attendanceRate: scheduledSlots > 0 ? round1((attendedSlots / scheduledSlots) * 100) : 0,
    lateRate: scheduledSlots > 0 ? round1((counts.late / scheduledSlots) * 100) : 0,
  };
}
