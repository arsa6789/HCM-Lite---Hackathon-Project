import Organization from "../models/Organization.js";
import Holiday from "../models/Holiday.js";
import { ApiError } from "../utils/apiError.js";
import { eachDayKey } from "../utils/dates.js";
import { getDay, parse } from "date-fns";

export async function getOrg() {
  return Organization.findOne().lean();
}

export async function requireOrg() {
  const org = await getOrg();

  if (!org) {
    throw new ApiError(400, "Organization is not configured. An admin must complete setup first.");
  }

  return org;
}

export async function getHolidayDays(fromKey, toKey) {
  const holidays = await Holiday.find().lean();
  const days = new Set();

  for (const holiday of holidays) {
    if (eachDayKey(fromKey, toKey).includes(holiday.date)) {
      days.add(holiday.date);
    } else if (holiday.recurring) {
      const monthDay = holiday.date.slice(5);
      for (const key of eachDayKey(fromKey, toKey)) {
        if (key.slice(5) === monthDay) {
          days.add(key);
        }
      }
    }
  }

  return days;
}

export async function isHoliday(dayKeyValue, holidayDays) {
  return holidayDays.has(dayKeyValue);
}

export function isWeekendKey(dayKeyValue, weekendDays) {
  const date = parse(dayKeyValue, "yyyy-MM-dd", new Date());
  return weekendDays.includes(getDay(date));
}

export async function workingDaysBetween(org, fromKey, toKey) {
  const holidayDays = await getHolidayDays(fromKey, toKey);

  return eachDayKey(fromKey, toKey).filter(
    (key) => !isWeekendKey(key, org.weekendDays) && !holidayDays.has(key)
  );
}

export async function policySummaryForAi() {
  const org = await getOrg();

  if (!org) {
    return { configured: false };
  }

  const holidays = await Holiday.find().sort({ date: 1 }).limit(50).lean();

  return {
    configured: true,
    companyName: org.companyName,
    officeStart: org.officeStart,
    officeEnd: org.officeEnd,
    graceMinutes: org.graceMinutes,
    halfDayHours: org.halfDayHours,
    weekendDays: org.weekendDays,
    geofence: org.geofence,
    latePolicy: org.latePolicy,
    taxSlabs: org.taxSlabs,
    hraPct: org.hraPct,
    medicalPct: org.medicalPct,
    holidays: holidays.map((holiday) => ({ name: holiday.name, date: holiday.date, recurring: holiday.recurring })),
  };
}
