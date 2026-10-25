import { firebaseAuth } from "./firebase";

const PREFIX = "hcm_demo_v1:";
const nowDay = () => new Date().toISOString().slice(0, 10);
const read = (key, fallback) => {
  if (typeof window === "undefined") return fallback;
  try { return JSON.parse(localStorage.getItem(`${PREFIX}${key}`) || "null") ?? fallback; } catch { return fallback; }
};
const write = (key, value) => {
  if (typeof window !== "undefined") localStorage.setItem(`${PREFIX}${key}`, JSON.stringify(value));
  return value;
};
const current = () => firebaseAuth?.currentUser;
const defaults = {
  organization: { org: { id: "local-org", companyName: "My Company", officeStart: "09:00", officeEnd: "17:00", graceMinutes: 15, halfDayHours: 6, weekendDays: [0, 6], currency: "PKR", hraPct: 40, medicalPct: 10, geofence: { enabled: false }, latePolicy: { deductionPerLatePct: 1.6, latesEqualToAbsent: 3 }, taxSlabs: [] } },
  departments: { items: [] }, designations: { items: [] }, leaveTypes: { items: [{ id: "annual", name: "Annual leave", annualDays: 20, paid: true }, { id: "unpaid", name: "Unpaid leave", annualDays: 365, paid: false }] }, holidays: { items: [] },
  attendance: [], leave: [], payroll: [], announcements: [], notifications: [], audit: [], aiEnabled: false,
};
function ensureDefaults() { for (const [key, value] of Object.entries(defaults)) if (read(key, null) === null) write(key, value); }
function userRecord() {
  const authUser = current();
  if (!authUser) throw new Error("Sign in to continue.");
  const users = read("users", {});
  if (!users[authUser.uid]) users[authUser.uid] = { id: authUser.uid, email: authUser.email || "", fullName: authUser.displayName || "", role: "employee", employmentStatus: "active", salary: null };
  write("users", users);
  return users[authUser.uid];
}
function collectionFor(path) {
  if (path.startsWith("/departments")) return "departments";
  if (path.startsWith("/designations")) return "designations";
  if (path.startsWith("/leave-types")) return "leaveTypes";
  if (path.startsWith("/holidays")) return "holidays";
  return null;
}
function pageResult(items, key) { return { total: items.length, page: 1, limit: items.length, [key]: items }; }

async function localRequest(path, { method = "GET", body } = {}) {
  ensureDefaults();
  if (path === "/auth/me") return { user: userRecord(), scope: { type: "self", userId: current().uid } };
  const user = userRecord();
  const [pathname, queryString = ""] = path.split("?");
  const query = new URLSearchParams(queryString);
  const records = read("users", {});
  const attendance = read("attendance", []);
  const leaves = read("leave", []);
  const currentAttendance = attendance.filter((item) => item.userId === user.id);
  const currentLeaves = leaves.filter((item) => item.userId === user.id);

  if (pathname === "/dashboard/summary") {
    const days = currentAttendance;
    return { dashboard: { role: "employee", range: { from: nowDay(), to: nowDay(), workingDays: 1 }, counts: { present: days.filter((d) => d.status === "present").length, late: days.filter((d) => d.status === "late").length, halfDay: days.filter((d) => d.status === "half_day").length, absent: 0, leave: 0 }, attendanceRate: days.length ? 100 : 0, lateMinutes: 0, workedHours: 0, hoursThisWeek: 0, weeklyTargetHours: 40, lateThisMonth: 0, pendingRequests: currentLeaves.filter((item) => item.status === "pending").length, leave: { balances: [] }, trend: days.map((item) => ({ date: item.date, rate: 100, present: item.status === "present" ? 1 : 0, late: item.status === "late" ? 1 : 0, halfDay: item.status === "half_day" ? 1 : 0, absent: 0 })), announcements: read("announcements", []).slice(0, 5) } };
  }
  if (pathname === "/users" && method === "GET") {
    const users = Object.values(records).filter((entry) => entry.id === user.id).map(({ id, email, fullName, role, employeeCode, phone, departmentId, designationId, joinDate, employmentStatus }) => ({ id, email, fullName, role, employeeCode, phone, departmentId, designationId, joinDate, employmentStatus }));
    return pageResult(users, "users");
  }
  if (pathname.startsWith("/users/") && method === "GET") return { user: records[user.id], attendanceSummary: { presentDays: 0, lateDays: 0, halfDays: 0, absentDays: 0, leaveDays: 0, lateMinutes: 0, workedMinutes: 0 }, leaveBalances: [] };
  if (pathname.startsWith("/users/") && method === "PATCH") {
    const targetId = pathname.split("/")[2];
    if (targetId !== user.id) throw new Error("You can only update your own contact details.");
    const denied = Object.keys(body ?? {}).filter((key) => !["phone", "address"].includes(key));
    if (denied.length) throw new Error("Only phone and address can be changed in local-only mode.");
    records[user.id] = { ...records[user.id], ...body };
    write("users", records);
    return { user: records[user.id] };
  }
  if (pathname === "/org" && method === "GET") return read("organization", defaults.organization);
  if (pathname === "/org" && method === "PUT") throw new Error("Organization changes require an authorized server and are disabled in local-only mode.");
  const collection = collectionFor(pathname);
  if (collection) {
    const result = read(collection, defaults[collection]);
    const idIndex = pathname.split("/").filter(Boolean)[1];
    if (method === "GET") return collection === "announcements" ? pageResult(result, "announcements") : result;
    if (user.role !== "admin") throw new Error("This local account does not have administrator privileges.");
    const items = result.items ?? result;
    if (method === "POST") { const item = { ...body, id: crypto.randomUUID() }; write(collection, { items: [...items, item] }); return { item }; }
    if (method === "PATCH") { const updated = items.map((item) => item.id === idIndex ? { ...item, ...body } : item); write(collection, { items: updated }); return { item: updated.find((item) => item.id === idIndex) }; }
    if (method === "DELETE") { write(collection, { items: items.filter((item) => item.id !== idIndex) }); return { message: "Deleted." }; }
  }
  if (pathname === "/attendance" && method === "GET") return pageResult(currentAttendance.sort((a, b) => b.date.localeCompare(a.date)), "records");
  if (pathname === "/attendance/board") return { date: nowDay(), isWorkingDay: true, isHoliday: false, rows: [{ user, record: currentAttendance.find((item) => item.date === nowDay()) ?? null }] };
  if (pathname === "/attendance/check-in" && method === "POST") { if (currentAttendance.some((item) => item.date === nowDay())) throw new Error("You already checked in today."); const item = { id: crypto.randomUUID(), userId: user.id, date: nowDay(), status: "present", checkInAt: new Date().toISOString(), workedMinutes: 0 }; write("attendance", [...attendance, item]); return { attendance: item }; }
  if (pathname === "/attendance/check-out" && method === "POST") { const item = currentAttendance.find((entry) => entry.date === nowDay()); if (!item) throw new Error("Check in first."); item.checkOutAt = new Date().toISOString(); item.workedMinutes = 480; write("attendance", attendance); return { attendance: item }; }
  if (pathname.startsWith("/attendance/") && pathname.endsWith("/correction") && method === "POST") { const id = pathname.split("/")[2]; const item = attendance.find((entry) => entry.id === id && entry.userId === user.id); if (!item) throw new Error("Attendance record not found."); item.correction = { status: "pending", reason: body?.reason ?? "" }; write("attendance", attendance); return { attendance: item }; }
  if (pathname === "/leave-types") return read("leaveTypes", defaults.leaveTypes);
  if (pathname === "/leave/balances") return { balances: read("leaveTypes", defaults.leaveTypes).items.map((type) => ({ leaveTypeId: type.id, name: type.name, paid: type.paid, annualDays: type.annualDays, used: 0, pending: currentLeaves.filter((item) => item.leaveTypeId === type.id && item.status === "pending").length, remaining: type.annualDays })) };
  if (pathname === "/leave" && method === "GET") return pageResult(currentLeaves, "applications");
  if (pathname === "/leave" && method === "POST") { const type = read("leaveTypes", defaults.leaveTypes).items.find((item) => item.id === body.leaveTypeId); const item = { ...body, id: crypto.randomUUID(), userId: user.id, email: user.email, fullName: user.fullName, leaveTypeName: type?.name, paid: type?.paid, status: "pending", days: 1, createdAt: new Date().toISOString() }; write("leave", [...leaves, item]); return { application: item }; }
  if (pathname === "/payroll/mine") return { payslips: [] };
  if (pathname === "/payroll/runs") return { runs: read("payroll", []) };
  if (pathname === "/users" && method === "POST") {
    const userId = crypto.randomUUID();
    const newUser = { ...body, id: userId, role: body.role ?? "employee", employmentStatus: body.employmentStatus ?? "active", salary: null };
    write("users", { ...records, [userId]: newUser });
    return { user: newUser };
  }
  if (pathname === "/announcements" && method === "GET") return pageResult(read("announcements", []), "announcements");
  if (pathname === "/announcements" && method === "POST") {
    if (user.role !== "admin" && user.role !== "hr") throw new Error("Only administrators can post announcements in local-only mode.");
    const item = { ...body, id: crypto.randomUUID(), createdBy: user.id, createdAt: new Date().toISOString() };
    write("announcements", [item, ...read("announcements", [])]);
    return { announcement: item };
  }
  if (pathname.startsWith("/announcements/") && method === "PATCH") {
    const id = pathname.split("/")[2];
    const items = read("announcements", []).map((item) => item.id === id ? { ...item, ...body } : item);
    write("announcements", items);
    return { announcement: items.find((item) => item.id === id) };
  }
  if (pathname.startsWith("/announcements/") && method === "DELETE") {
    write("announcements", read("announcements", []).filter((item) => item.id !== pathname.split("/")[2]));
    return { message: "Deleted." };
  }
  if (pathname.startsWith("/leave/") && pathname.endsWith("/review") && method === "PATCH") {
    const id = pathname.split("/")[2];
    const items = leaves.map((item) => item.id === id ? { ...item, status: body.decision } : item);
    write("leave", items);
    return { application: items.find((item) => item.id === id) };
  }
  if (pathname.startsWith("/leave/") && pathname.endsWith("/cancel") && method === "PATCH") {
    const id = pathname.split("/")[2];
    const items = leaves.map((item) => item.id === id && item.userId === user.id ? { ...item, status: "cancelled" } : item);
    write("leave", items);
    return { application: items.find((item) => item.id === id) };
  }
  if (pathname === "/notifications") return { total: 0, unread: 0, notifications: [] };
  if (pathname === "/audit") return { ...pageResult(read("audit", []), "entries"), entries: read("audit", []) };
  if (pathname === "/audit/verify") return { valid: true, checked: 0 };
  if (pathname === "/ai/status") return { enabled: false, model: "" };
  if (pathname === "/ai/chat") throw new Error("AI assistant is unavailable in local-only mode.");
  throw new Error(`This action is not available in local-only mode: ${method} ${pathname}`);
}

export function getToken() { return typeof window === "undefined" ? "" : localStorage.getItem(`${PREFIX}uid`) ?? ""; }
export function setToken(uid) { if (typeof window !== "undefined") localStorage.setItem(`${PREFIX}uid`, uid); }
export function clearToken() { if (typeof window !== "undefined") localStorage.removeItem(`${PREFIX}uid`); }
export async function apiRequest(path, options = {}) { return localRequest(path, options); }
export async function apiDownload(path, filename) {
  let text = "";
  if (path.includes("csv")) text = "email,fullName,phone,employeeCode\n";
  else throw new Error("PDF generation is disabled in local-only mode.");
  const blob = new Blob([text], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
}
