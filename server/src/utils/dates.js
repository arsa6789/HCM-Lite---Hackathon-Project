import { eachDayOfInterval, format, getDay, isValid, parse } from "date-fns";

const DAY_KEY_FORMAT = "yyyy-MM-dd";
const MONTH_KEY_FORMAT = "yyyy-MM";

export function dayKey(date) {
  return format(date, DAY_KEY_FORMAT);
}

export function parseDayKey(key) {
  return parse(String(key ?? ""), DAY_KEY_FORMAT, new Date());
}

export function isValidDayKey(key) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(key ?? "")) && isValid(parseDayKey(key));
}

export function monthKey(date) {
  return format(date, MONTH_KEY_FORMAT);
}

export function monthRange(month) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(month ?? ""));

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;

  if (monthIndex < 0 || monthIndex > 11) {
    return null;
  }

  const from = new Date(year, monthIndex, 1);
  const to = new Date(year, monthIndex + 1, 0);

  return { fromKey: format(from, DAY_KEY_FORMAT), toKey: format(to, DAY_KEY_FORMAT) };
}

export function hhmmToMinutes(value) {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(value ?? "").trim());

  if (!match) {
    return null;
  }

  return Number(match[1]) * 60 + Number(match[2]);
}

export function minutesToHHmm(minutes) {
  const total = Math.max(0, Math.round(Number(minutes ?? 0)));
  const hours = Math.floor(total / 60) % 24;
  const mins = total % 60;

  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

export function minutesBetween(fromDate, toDate) {
  return Math.round((toDate.getTime() - fromDate.getTime()) / 60000);
}

export function isWeekend(date, weekendDays) {
  return weekendDays.includes(getDay(date));
}

export function eachDayKey(fromKey, toKey) {
  const from = parseDayKey(fromKey);
  const to = parseDayKey(toKey);

  if (!isValid(from) || !isValid(to) || from > to) {
    return [];
  }

  return eachDayOfInterval({ start: from, end: to }).map((date) => format(date, DAY_KEY_FORMAT));
}

export function countDaysWith(fromKey, toKey, predicate) {
  return eachDayKey(fromKey, toKey).filter(predicate).length;
}

const EARTH_RADIUS_METERS = 6371000;

export function haversineMeters(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

  return Math.round(EARTH_RADIUS_METERS * 2 * Math.asin(Math.sqrt(a)));
}
