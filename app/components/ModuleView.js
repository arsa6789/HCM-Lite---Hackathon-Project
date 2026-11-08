"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

const MODULES = {
  dashboard: ["Good work starts with a clear view.", "Your organization, at a glance."],
  profile: ["My profile", "Your personal details and contact information."],
  organization: ["Organization", "Company policy and reference lists."],
  employees: ["People directory", "Profiles, departments and employee records."],
  attendance: ["Attendance", "Daily presence, working time and corrections."],
  leave: ["Leave management", "Requests, decisions and available balances."],
  payroll: ["Payroll", "Prepare, review and publish monthly payroll."],
  announcements: ["Announcements", "Company updates for your teams."],
  audit: ["Audit trail", "A verifiable record of administrative actions."],
  assistant: ["HCM assistant", "Answers grounded in your organization data."],
};

const COLORS = ["#1f7a68", "#d88a35", "#d7604d", "#64748b", "#b55b4d"];
const inputClass = "field-control";
const SECTION_ROLES = {
  dashboard: ["admin", "hr", "employee"], profile: ["admin", "hr", "employee"],
  organization: ["admin", "hr"], employees: ["admin", "hr"], attendance: ["admin", "hr", "employee"],
  leave: ["admin", "hr", "employee"], payroll: ["admin", "hr", "employee"],
  announcements: ["admin", "hr", "employee"], audit: ["admin"], assistant: ["admin", "hr", "employee"],
};

function localDayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function defaultDashboardFilters() {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 29);
  return {
    from: localDayKey(from),
    to: localDayKey(to),
    departmentId: "",
  };
}
function Button({ children, onClick, type = "submit", variant = "primary", disabled = false }) {
  return <button type={type} onClick={onClick} disabled={disabled} className={`button button-${variant}`}>{children}</button>;
}

function Panel({ title, action, children, className = "" }) {
  return <section className={`panel ${className}`}><header className="panel-heading"><h2>{title}</h2>{action}</header>{children}</section>;
}

function EmptyState({ text = "Nothing here yet." }) {
  return <div className="empty-state"><span className="empty-mark" />{text}</div>;
}

function Table({ rows, columns, empty }) {
  if (!rows?.length) return <EmptyState text={empty} />;
  return <div className="table-wrap"><table className="data-table"><thead><tr>{columns.map(([key, label]) => <th key={key}>{label}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={row.id ?? row._id ?? i}>{columns.map(([key]) => <td key={key}>{formatValue(row[key])}</td>)}</tr>)}</tbody></table></div>;
}

function formatValue(value) {
  if (value == null || value === "") return <span className="muted">—</span>;
  if (typeof value === "object") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function Stat({ label, value, foot, tone = "green" }) {
  return <div className={`stat-tile stat-${tone}`}><span>{label}</span><strong>{value ?? "—"}</strong>{foot && <small>{foot}</small>}</div>;
}

export default function ModuleView({ section, user, apiRequest, apiDownload }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(localDayKey().slice(0, 7));
  const [chat, setChat] = useState([]);
  const [message, setMessage] = useState("");
  const [draftMonth, setDraftMonth] = useState(localDayKey().slice(0, 7));
  const [leaveDraft, setLeaveDraft] = useState({ leaveTypeId: "", fromDate: "", toDate: "", reason: "" });
  const [announcementDraft, setAnnouncementDraft] = useState({ title: "", body: "", audience: { type: "all" } });
  const [orgDraft, setOrgDraft] = useState({});
  const [csvText, setCsvText] = useState("");
  const [csvResult, setCsvResult] = useState(null);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [employeePage, setEmployeePage] = useState(1);
  const [attendancePage, setAttendancePage] = useState(1);
  const [leavePage, setLeavePage] = useState(1);
  const [announcementPage, setAnnouncementPage] = useState(1);
  const [auditPage, setAuditPage] = useState(1);
  const [dashboardFilters, setDashboardFilters] = useState(defaultDashboardFilters);
  const loadRequestId = useRef(0);
  const sectionIdentity = useRef({ section, userId: user?.id });

  const load = useCallback(async () => {
    if (!user) return;
    const requestId = ++loadRequestId.current;
    if (!SECTION_ROLES[section]?.includes(user.role)) {
      setData({ unavailable: true });
      setError("");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      let result;
      if (section === "dashboard") {
        const params = new URLSearchParams({ from: dashboardFilters.from, to: dashboardFilters.to });
        if (dashboardFilters.departmentId) params.set("departmentId", dashboardFilters.departmentId);
        result = (await apiRequest(`/dashboard/summary?${params.toString()}`)).dashboard;
      } else if (section === "profile") {
        result = await apiRequest(`/users/${user.id}`);
      } else if (section === "organization") {
        const [org, departments, designations, leaveTypes, holidays] = await Promise.all([
          apiRequest("/org"), apiRequest("/departments"), apiRequest("/designations"), apiRequest("/leave-types"), apiRequest("/holidays"),
        ]);
        result = { ...org, departments: departments.items, designations: designations.items, leaveTypes: leaveTypes.items, holidays: holidays.items };
        setOrgDraft(org.org ?? {});
      } else if (section === "employees") {
        const params = new URLSearchParams({ limit: "25", page: String(employeePage) });
        if (employeeSearch.trim()) params.set("search", employeeSearch.trim());
        const [directory, departments, designations] = await Promise.all([
          apiRequest(`/users?${params}`),
          user.role === "employee" ? Promise.resolve({ items: [] }) : apiRequest("/departments"),
          user.role === "employee" ? Promise.resolve({ items: [] }) : apiRequest("/designations"),
        ]);
        result = { ...directory, departments: departments.items ?? [], designations: designations.items ?? [] };
      } else if (section === "attendance") {
        const [year, month] = calendarMonth.split("-").map(Number);
        const from = `${calendarMonth}-01`;
        const to = `${calendarMonth}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`;
        const params = new URLSearchParams({ from, to, limit: "50", page: String(attendancePage) });
        const [records, board, organization] = await Promise.all([
          apiRequest(`/attendance?${params}`),
          user.role === "employee" ? Promise.resolve(null) : apiRequest("/attendance/board"),
          apiRequest("/org"),
        ]);
        result = { ...records, board, geofenceEnabled: Boolean(organization.org?.geofence?.enabled) };
      } else if (section === "leave") {
        const params = new URLSearchParams({ limit: "50", page: String(leavePage) });
        const [applications, balances, types] = await Promise.all([
          apiRequest(`/leave?${params}`), apiRequest("/leave/balances"), apiRequest("/leave-types"),
        ]);
        result = { ...applications, balances: balances.balances, types: types.items };
      } else if (section === "payroll") {
        result = user.role === "employee"
          ? await apiRequest("/payroll/mine")
          : await apiRequest("/payroll/runs");
      } else if (section === "announcements") {
        const params = new URLSearchParams({ limit: "25", page: String(announcementPage) });
        result = await apiRequest(`/announcements?${params}`);
      } else if (section === "audit") {
        const params = new URLSearchParams({ limit: "50", page: String(auditPage) });
        const entries = await apiRequest(`/audit?${params}`);
        result = { ...entries, verification: null };
      } else if (section === "assistant") {
        result = await apiRequest("/ai/status");
      } else {
        throw new Error("This section does not exist.");
      }
      if (requestId === loadRequestId.current) setData(result);
    } catch (loadError) {
      if (requestId === loadRequestId.current) setError(loadError.message);
    } finally {
      if (requestId === loadRequestId.current) setLoading(false);
    }
  }, [apiRequest, calendarMonth, dashboardFilters.departmentId, dashboardFilters.from, dashboardFilters.to, employeePage, employeeSearch, attendancePage, leavePage, announcementPage, auditPage, section, user?.id, user?.role]);

  useEffect(() => {
    const previous = sectionIdentity.current;
    if (previous.section !== section || previous.userId !== user?.id) {
      setData(null);
      setError("");
      sectionIdentity.current = { section, userId: user?.id };
    }
  }, [section, user?.id]);

  useEffect(() => {
    load();
    return () => { loadRequestId.current += 1; };
  }, [load]);

  async function runAction(action, success = "Saved.") {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      setNotice(success);
      await load();
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setBusy(false);
    }
  }

  async function sendMessage(event) {
    event.preventDefault();
    const content = message.trim();
    if (!content || busy) return;
    const next = [...chat, { role: "user", content }];
    setChat(next);
    setMessage("");
    setBusy(true);
    setError("");
    try {
      const result = await apiRequest("/ai/chat", { method: "POST", body: { messages: next.slice(-10) } });
      setChat([...next, { role: "assistant", content: result.reply, draft: result.draft }]);
    } catch (chatError) {
      setMessage(content);
      setChat([...next, { role: "assistant", content: chatError.message || "I could not complete that request. Your question is back in the composer so you can retry.", failed: true }]);
    } finally {
      setBusy(false);
    }
  }

  const [title, subtitle] = MODULES[section] ?? ["Not found", "Choose a section from the navigation."];
  if (data?.unavailable) return <div className="empty-state" role="status">This section is not available for your account role. Use the navigation to open an available section.</div>;

  return <>
    <div className="page-intro"><div><div className="eyebrow">{user?.role ?? "HCM"} workspace <span>•</span> {new Date().getFullYear()}</div><h1>{title}</h1><p>{subtitle}</p></div><div className="intro-actions">{section !== "assistant" && <Button variant="quiet" onClick={load} disabled={loading}>↻ <span>{loading ? "Refreshing…" : "Refresh"}</span></Button>}</div></div>
    {notice && <div className="notice notice-success" role="status">{notice}<button onClick={() => setNotice("")} aria-label="Dismiss">×</button></div>}
    {error && <div className="notice notice-error" role="alert">{error}<button onClick={() => setError("")} aria-label="Dismiss">×</button></div>}
    {loading && !data ? <div className="loading-block"><span className="loading-mark" />Loading {title.toLowerCase()}…</div> : !data ? <EmptyState text="No data could be loaded." /> : (
      <>
        {loading && <p className="muted" role="status">Refreshing this section…</p>}
        {section === "dashboard" && <DashboardView data={data} user={user} filters={dashboardFilters} onApplyFilters={setDashboardFilters} />}
        {section === "profile" && <PersonalProfileView data={data} user={user} apiRequest={apiRequest} runAction={runAction} busy={busy} />}
        {section === "organization" && <OrganizationView data={data} user={user} apiRequest={apiRequest} draft={orgDraft} setDraft={setOrgDraft} runAction={runAction} busy={busy} />}
        {section === "employees" && <><div className="directory-toolbar"><label>Search employees<input className={inputClass} value={employeeSearch} onChange={(event) => { setEmployeeSearch(event.target.value); setEmployeePage(1); }} placeholder="Name, email, employee ID" /></label><span>{data.total ?? 0} employees</span></div><EmployeesView data={data} user={user} apiRequest={apiRequest} apiDownload={apiDownload} runAction={runAction} busy={busy} csvText={csvText} setCsvText={setCsvText} csvResult={csvResult} setCsvResult={setCsvResult} /><div className="pagination-controls"><Button type="button" variant="quiet" disabled={employeePage <= 1 || loading} onClick={() => setEmployeePage((page) => Math.max(1, page - 1))}>Previous</Button><span>Page {data.page ?? employeePage} of {Math.max(1, Math.ceil((data.total ?? 0) / (data.limit ?? 25)))}</span><Button type="button" variant="quiet" disabled={loading || employeePage >= Math.ceil((data.total ?? 0) / (data.limit ?? 25))} onClick={() => setEmployeePage((page) => page + 1)}>Next</Button></div><SalaryAssignment users={data.users ?? []} user={user} apiRequest={apiRequest} runAction={runAction} busy={busy} /></>}
        {section === "attendance" && <><AttendanceCalendar records={data.records ?? []} month={calendarMonth} setMonth={(nextMonth) => { setCalendarMonth(nextMonth); setAttendancePage(1); }} /><AttendanceView data={data} user={user} apiRequest={apiRequest} runAction={runAction} busy={busy} page={attendancePage} setPage={setAttendancePage} loading={loading} isCurrentMonth={calendarMonth === localDayKey().slice(0, 7)} /></>}
        {section === "leave" && <LeaveView data={data} user={user} apiRequest={apiRequest} runAction={runAction} busy={busy} draft={leaveDraft} setDraft={setLeaveDraft} page={leavePage} setPage={setLeavePage} loading={loading} />}
        {section === "payroll" && <PayrollView data={data} user={user} apiRequest={apiRequest} apiDownload={apiDownload} runAction={runAction} busy={busy} month={draftMonth} setMonth={setDraftMonth} />}
        {section === "announcements" && <AnnouncementsView data={data} user={user} apiRequest={apiRequest} runAction={runAction} busy={busy} draft={announcementDraft} setDraft={setAnnouncementDraft} page={announcementPage} setPage={setAnnouncementPage} loading={loading} />}
        {section === "audit" && <AuditView data={data} apiRequest={apiRequest} page={auditPage} setPage={setAuditPage} loading={loading} />}
        {section === "assistant" && <AssistantView data={data} user={user} chat={chat} message={message} setMessage={setMessage} sendMessage={sendMessage} busy={busy} apiRequest={apiRequest} runAction={runAction} onClear={() => setChat([])} />}
      </>
    )}
  </>;
}
function DashboardView({ data, user, filters, onApplyFilters }) {
  const employee = data.role === "employee";
  const counts = data.counts ?? {};
  const trend = data.trend ?? [];
  const announcements = data.announcements ?? [];
  const todayKey = localDayKey();
  const [draft, setDraft] = useState(filters);
  const [filterError, setFilterError] = useState("");

  useEffect(() => {
    setDraft(filters);
    setFilterError("");
  }, [filters.from, filters.to, filters.departmentId]);

  const attendanceData = [
    { name: "Present", value: counts.present ?? 0 },
    { name: "Late", value: counts.late ?? 0 },
    { name: "Half day", value: counts.halfDay ?? 0 },
    { name: "Leave", value: counts.leave ?? 0 },
    { name: "Absent", value: counts.absent ?? 0 },
  ];
  const hasAttendance = attendanceData.some((item) => item.value > 0);
  const hasTrend = trend.some((item) => item.rate !== null && item.rate !== undefined);
  const departments = (data.departments ?? []).filter((department) => department.id !== "unassigned");
  const departmentData = (data.departments ?? []).filter((department) => department.count > 0);

  function submitFilters(event) {
    event.preventDefault();
    if (!draft.from || !draft.to || draft.from > draft.to) {
      setFilterError("Choose a valid start and end date.");
      return;
    }
    if (draft.to > todayKey) {
      setFilterError("The reporting period cannot include future dates.");
      return;
    }
    setFilterError("");
    onApplyFilters({ ...draft });
  }

  function resetFilters() {
    const next = defaultDashboardFilters();
    setDraft(next);
    setFilterError("");
    onApplyFilters(next);
  }

  return <>
    <form className="dashboard-filters" onSubmit={submitFilters}>
      <label>From date<input className={inputClass} type="date" max={todayKey} value={draft.from} onChange={(event) => setDraft({ ...draft, from: event.target.value })} /></label>
      <label>To date<input className={inputClass} type="date" min={draft.from} max={todayKey} value={draft.to} onChange={(event) => setDraft({ ...draft, to: event.target.value })} /></label>
      {!employee && <label>Department<select className={inputClass} value={draft.departmentId} onChange={(event) => setDraft({ ...draft, departmentId: event.target.value })}><option value="">All visible departments</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>}
      <div className="dashboard-filter-actions"><Button type="submit">Apply filters</Button><Button type="button" variant="quiet" onClick={resetFilters}>Reset</Button></div>
      {filterError && <p className="dashboard-filter-error" role="alert">{filterError}</p>}
    </form>
    <div className="range-strip"><span>Reporting period</span><strong>{data.range?.from} — {data.range?.to}</strong><span className="range-days">{data.range?.workingDays ?? 0} working days</span></div>
    {user?.role === "admin" && (!data.organizationConfigured || ((data.headcount ?? 0) === 0 && !filters.departmentId)) && <section className="dashboard-setup">
      <div><span className="eyebrow">WORKSPACE SETUP</span><h2>{data.organizationConfigured ? "Add your first employee" : "Set up your organization"}</h2><p>{data.organizationConfigured ? "Your dashboard will populate as you add active employees and begin recording attendance." : "Configure your work policy and reference lists first. Then add employees and start recording attendance. Dashboard figures use saved records; no demo data is being shown."}</p></div>
      <div className="dashboard-setup-actions"><Link href="/console/organization" className="button button-primary">Configure organization</Link><Link href="/console/employees" className="button button-quiet">Add employees</Link></div>
    </section>}
    {!data.organizationConfigured && user?.role !== "admin" && <section className="dashboard-setup dashboard-setup-info"><div><span className="eyebrow">WORKSPACE SETUP</span><h2>Organization setup is not complete</h2><p>Ask an administrator to configure the organization before attendance and leave metrics can be calculated.</p></div></section>}
    <div className="stat-grid">
      {employee ? <>
        <Stat label="Attendance rate" value={`${data.attendanceRate ?? 0}%`} foot="For selected period; approved leave excluded" />
        <Stat label="Hours this week" value={`${data.hoursThisWeek ?? 0}h`} foot={`of ${data.weeklyTargetHours ?? 40}h target`} tone="amber" />
        <Stat label="Late this month" value={data.lateThisMonth ?? 0} foot="Recorded late arrivals" tone="coral" />
        <Stat label="Pending requests" value={data.pendingRequests ?? 0} foot="Awaiting review" tone="blue" />
      </> : <>
        <Stat label="Active people" value={data.headcount ?? 0} foot="Across visible organization" />
        <Stat label="Attendance rate" value={`${data.attendanceRate ?? 0}%`} foot="Present, late and half-day weighted; leave excluded" tone="blue" />
        <Stat label="Late rate" value={`${data.lateRate ?? 0}%`} foot={`${counts.late ?? 0} late records`} tone="amber" />
        <Stat label="Pending approvals" value={data.pendingLeaves ?? 0} foot="Leave requests" tone="coral" />
      </>}
    </div>
    {!employee && <div className="stat-grid compact-stats"><Stat label="On leave today" value={data.today?.leave ?? 0} foot={data.today?.isWorkingDay ? "Current workday" : "Non-working day"} tone="blue" /><Stat label="Absent today" value={data.today?.absent ?? 0} foot="Includes missed check-ins" tone="coral" /><Stat label="Late today" value={data.today?.late ?? 0} foot="After grace period" tone="amber" /><Stat label="Average hours" value={`${data.averageHoursWorked ?? 0}h`} foot="Per scheduled day, excluding leave" /></div>}
    <div className="dashboard-grid">
      <Panel title="Attendance trend" className="chart-panel">{hasTrend ? <div className="chart-area"><ResponsiveContainer width="100%" height="100%"><AreaChart data={trend}><defs><linearGradient id="attendanceFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#197b68" stopOpacity={0.25} /><stop offset="95%" stopColor="#197b68" stopOpacity={0} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7ebe8" /><XAxis dataKey="date" tickFormatter={(value) => value.slice(5)} tickLine={false} axisLine={false} /><YAxis domain={[0, 100]} tickLine={false} axisLine={false} /><Tooltip /><Area type="monotone" dataKey="rate" stroke="#197b68" strokeWidth={2.5} fill="url(#attendanceFill)" connectNulls={false} /></AreaChart></ResponsiveContainer></div> : <EmptyState text={data.organizationConfigured ? "No working-day attendance in this reporting period." : "Configure the organization to define working days and calculate attendance."} />}</Panel>
      <Panel title="Attendance mix" className="chart-panel">{hasAttendance ? <><div className="chart-area chart-donut"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={attendanceData} dataKey="value" nameKey="name" innerRadius={62} outerRadius={92} paddingAngle={3}>{attendanceData.map((entry, index) => <Cell key={entry.name} fill={COLORS[index]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer><div className="donut-center"><strong>{data.attendanceRate ?? 0}%</strong><span>attendance</span></div></div><div className="legend-row">{attendanceData.map((item, index) => <span key={item.name}><i style={{ background: COLORS[index] }} />{item.name}</span>)}</div></> : <EmptyState text="Attendance mix will appear after working days are configured and records exist." />}</Panel>
      {!employee && <Panel title="Department headcount" className="chart-panel">{departmentData.length ? <div className="chart-area"><ResponsiveContainer width="100%" height="100%"><BarChart data={departmentData} layout="vertical" margin={{ left: 8 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e7ebe8" /><XAxis type="number" hide /><YAxis type="category" dataKey="name" width={100} tickLine={false} axisLine={false} /><Tooltip /><Bar dataKey="count" fill="#d88a35" radius={[0, 4, 4, 0]} barSize={16} /></BarChart></ResponsiveContainer></div> : <EmptyState text="No department headcount to display yet." />}</Panel>}
      {!employee && <Panel title="Frequent late arrivals" className="late-panel"><Table rows={data.topLateComers ?? []} columns={[["fullName", "Employee"], ["email", "Email"], ["count", "Late days"]]} empty="No late arrivals in this period." /></Panel>}
      {!employee && <Panel title="Leave utilization (year to date)" className="leave-balance-panel"><Table rows={data.leaveUtilization ?? []} columns={[["name", "Leave type"], ["approvedDays", "Approved YTD"], ["annualDays", "Annual quota"], ["utilizationRate", "Utilization %"]]} empty="No leave types configured." /></Panel>}
      {employee && <Panel title="Your leave balances" className="leave-balance-panel"><div className="balance-list">{(data.leave?.balances ?? []).map((balance) => <div className="balance-row" key={balance.leaveTypeId}><div><strong>{balance.name}</strong><small>{balance.used} used · {balance.pending} pending</small></div><b>{balance.remaining}<small> / {balance.annualDays} days</small></b></div>)}</div>{!data.leave?.balances?.length && <EmptyState text="No leave types configured." />}</Panel>}
      <Panel title="Latest announcements" className="announcements-panel">{announcements.length ? <div className="announcement-list">{announcements.map((item) => <article key={item.id}><div className="announcement-date">{item.pinned ? "PINNED" : new Date(item.createdAt).toLocaleDateString()}</div><h3>{item.title}</h3><p>{item.body}</p></article>)}</div> : <EmptyState text="No announcements yet." />}</Panel>
      {user?.role === "admin" && <Panel title="Compensation overview" className="payroll-summary"><div className="compensation-metrics"><div><span>{data.payroll ? `Organization-wide payroll · ${data.payroll.month}` : "Organization-wide finalized payroll"}</span><strong>{data.payroll?.totalGross?.toLocaleString() ?? "—"}</strong><small>Gross pay · all departments</small></div><div><span>Average monthly salary</span><strong>{data.averageSalary?.toLocaleString() ?? "—"}</strong><small>{filters.departmentId ? `${departments.find((department) => department.id === filters.departmentId)?.name ?? "Selected department"} employees` : "All active employees"}</small></div><div><span>Organization-wide net pay</span><strong>{data.payroll?.totalNet?.toLocaleString() ?? "—"}</strong><small>{data.payroll?.employeeCount ?? 0} employees · latest finalized run</small></div></div></Panel>}
    </div>
  </>;
}

function PersonalProfileView({ data, user, apiRequest, runAction, busy }) {
  const profile = data.user ?? {};
  const [values, setValues] = useState({ phone: profile.phone ?? "", address: profile.address ?? "" });
  useEffect(() => {
    setValues({ phone: profile.phone ?? "", address: profile.address ?? "" });
  }, [profile.phone, profile.address]);
  return <div className="two-column-layout"><Panel title="Personal details"><form className="form-grid" onSubmit={(event) => { event.preventDefault(); runAction(() => apiRequest(`/users/${user.id}`, { method: "PATCH", body: values }), "Profile updated."); }}><label>Full name<input className={inputClass} value={profile.fullName ?? ""} disabled /></label><label>Work email<input className={inputClass} value={profile.email ?? ""} disabled /></label><label>Phone<input className={inputClass} value={values.phone} maxLength={40} onChange={(event) => setValues({ ...values, phone: event.target.value })} /></label><label>Employee code<input className={inputClass} value={profile.employeeCode ?? ""} disabled /></label><label className="full-width">Address<textarea className={inputClass} value={values.address} maxLength={250} onChange={(event) => setValues({ ...values, address: event.target.value })} /></label><Button disabled={busy}>Save contact details</Button></form></Panel><Panel title="Employment"><div className="profile-grid"><div><span>Role</span><strong>{user.role}</strong></div><div><span>Status</span><strong>{profile.employmentStatus ?? "—"}</strong></div><div><span>Joined</span><strong>{profile.joinDate ?? "—"}</strong></div><div><span>Department</span><strong>{profile.departmentName ?? profile.departmentId ?? "Unassigned"}</strong></div><div><span>Designation</span><strong>{profile.designationName ?? profile.designationId ?? "Unassigned"}</strong></div></div></Panel><Panel title="Attendance overview"><div className="metric-strip">{Object.entries(data.attendanceSummary ?? {}).filter(([key]) => key.endsWith("Days") || key.endsWith("Minutes")).map(([key, value]) => <div key={key}><span>{key.replace(/([A-Z])/g, " $1")}</span><strong>{value}</strong></div>)}</div></Panel><Panel title="Leave balances"><div className="balance-list">{(data.leaveBalances ?? []).map((balance) => <div className="balance-row" key={balance.leaveTypeId}><div><strong>{balance.name}</strong><small>{balance.used} used · {balance.pending} pending</small></div><b>{balance.remaining}<small> / {balance.annualDays} days</small></b></div>)}</div>{!data.leaveBalances?.length && <EmptyState text="No leave types configured." />}</Panel></div>;
}

function OrganizationView({ data, user, apiRequest, draft, setDraft, runAction, busy }) {
  const isAdmin = user?.role === "admin";
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const [taxSlabsText, setTaxSlabsText] = useState(JSON.stringify(draft.taxSlabs ?? [], null, 2));
  const [taxError, setTaxError] = useState("");

  useEffect(() => { setTaxSlabsText(JSON.stringify(draft.taxSlabs ?? [], null, 2)); }, [draft.taxSlabs]);

  function submitPolicy(event) {
    event.preventDefault();
    let taxSlabs;
    try {
      taxSlabs = JSON.parse(taxSlabsText);
      if (!Array.isArray(taxSlabs)) throw new Error("Tax slabs must be a JSON array.");
    } catch (error) {
      setTaxError(error.message || "Enter valid JSON for tax slabs.");
      return;
    }
    setTaxError("");
    const payload = {
      companyName: String(draft.companyName ?? "").trim(),
      officeStart: draft.officeStart,
      officeEnd: draft.officeEnd,
      graceMinutes: Number(draft.graceMinutes),
      halfDayHours: Number(draft.halfDayHours),
      weekendDays: draft.weekendDays ?? [],
      currency: String(draft.currency ?? "PKR").trim().toUpperCase(),
      hraPct: Number(draft.hraPct),
      medicalPct: Number(draft.medicalPct),
      geofence: {
        enabled: Boolean(draft.geofence?.enabled),
        lat: draft.geofence?.lat === "" ? null : Number(draft.geofence?.lat),
        lng: draft.geofence?.lng === "" ? null : Number(draft.geofence?.lng),
        radiusMeters: Number(draft.geofence?.radiusMeters ?? 500),
      },
      latePolicy: {
        deductionPerLatePct: Number(draft.latePolicy?.deductionPerLatePct),
        latesEqualToAbsent: Number(draft.latePolicy?.latesEqualToAbsent),
      },
      taxSlabs,
    };
    if (!payload.companyName || payload.weekendDays.length === 7) {
      setTaxError(!payload.companyName ? "Enter a company name." : "Select at least one working day.");
      return;
    }
    runAction(() => apiRequest("/org", { method: "PUT", body: payload }), "Organization settings saved.");
  }

  return <div className="two-column-layout">
    <Panel title="Company policy">
      {!isAdmin && <p className="panel-copy">Read-only organization settings. Ask an administrator to make changes.</p>}
      <form className="form-grid" onSubmit={submitPolicy}>
        <label>Company name<input className={inputClass} maxLength={120} required value={draft.companyName ?? ""} disabled={!isAdmin} onChange={(e) => setDraft({ ...draft, companyName: e.target.value })} /></label>
        <label>Office starts<input className={inputClass} type="time" required value={draft.officeStart ?? "09:00"} disabled={!isAdmin} onChange={(e) => setDraft({ ...draft, officeStart: e.target.value })} /></label>
        <label>Office ends<input className={inputClass} type="time" required value={draft.officeEnd ?? "17:00"} disabled={!isAdmin} onChange={(e) => setDraft({ ...draft, officeEnd: e.target.value })} /></label>
        <label>Grace period (minutes)<input className={inputClass} type="number" min="0" max="240" value={draft.graceMinutes ?? 15} disabled={!isAdmin} onChange={(e) => setDraft({ ...draft, graceMinutes: Number(e.target.value) })} /></label>
        <label>Half-day threshold (hours)<input className={inputClass} type="number" min="0.5" max="12" step="0.5" value={draft.halfDayHours ?? 6} disabled={!isAdmin} onChange={(e) => setDraft({ ...draft, halfDayHours: Number(e.target.value) })} /></label>
        <label>Currency<input className={inputClass} maxLength={3} pattern="[A-Za-z]{3}" title="Use a 3-letter currency code, such as PKR or USD" value={draft.currency ?? "PKR"} disabled={!isAdmin} onChange={(e) => setDraft({ ...draft, currency: e.target.value.toUpperCase() })} /></label>
        <label>HRA (% of basic)<input className={inputClass} type="number" min="0" max="100" step="0.1" value={draft.hraPct ?? 40} disabled={!isAdmin} onChange={(e) => setDraft({ ...draft, hraPct: Number(e.target.value) })} /></label>
        <label>Medical (% of basic)<input className={inputClass} type="number" min="0" max="100" step="0.1" value={draft.medicalPct ?? 10} disabled={!isAdmin} onChange={(e) => setDraft({ ...draft, medicalPct: Number(e.target.value) })} /></label>
        <label>Late deduction (% per late)<input className={inputClass} type="number" min="0" max="100" step="0.1" value={draft.latePolicy?.deductionPerLatePct ?? 1.6} disabled={!isAdmin} onChange={(e) => setDraft({ ...draft, latePolicy: { ...draft.latePolicy, deductionPerLatePct: Number(e.target.value) } })} /></label>
        <label>Lates equal one absence<input className={inputClass} type="number" min="1" max="31" value={draft.latePolicy?.latesEqualToAbsent ?? 3} disabled={!isAdmin} onChange={(e) => setDraft({ ...draft, latePolicy: { ...draft.latePolicy, latesEqualToAbsent: Number(e.target.value) } })} /></label>
        <fieldset className="weekend-field"><legend>Non-working days</legend>{weekdays.map((day, index) => <label key={day}><input type="checkbox" disabled={!isAdmin} checked={(draft.weekendDays ?? [0, 6]).includes(index)} onChange={(e) => setDraft({ ...draft, weekendDays: e.target.checked ? [...new Set([...(draft.weekendDays ?? [0, 6]), index])].sort() : (draft.weekendDays ?? [0, 6]).filter((value) => value !== index) })} />{day}</label>)}</fieldset>
        <label className="full-width">Progressive tax slabs <small>JSON array; each item uses upTo and ratePct. The last slab may use upTo: null.</small><textarea className={`${inputClass} tax-slabs-area`} disabled={!isAdmin} value={taxSlabsText} onChange={(e) => { setTaxSlabsText(e.target.value); setTaxError(""); }} /></label>
        <label className="toggle-row">Require office geofence<input type="checkbox" checked={draft.geofence?.enabled ?? false} disabled={!isAdmin} onChange={(e) => setDraft({ ...draft, geofence: { ...draft.geofence, enabled: e.target.checked } })} /></label>
        {draft.geofence?.enabled && <><label>Office latitude<input className={inputClass} type="number" min="-90" max="90" step="any" required value={draft.geofence?.lat ?? ""} disabled={!isAdmin} onChange={(e) => setDraft({ ...draft, geofence: { ...draft.geofence, lat: e.target.value === "" ? "" : Number(e.target.value) } })} /></label><label>Office longitude<input className={inputClass} type="number" min="-180" max="180" step="any" required value={draft.geofence?.lng ?? ""} disabled={!isAdmin} onChange={(e) => setDraft({ ...draft, geofence: { ...draft.geofence, lng: e.target.value === "" ? "" : Number(e.target.value) } })} /></label><label>Radius (meters)<input className={inputClass} type="number" min="25" max="50000" required value={draft.geofence?.radiusMeters ?? 500} disabled={!isAdmin} onChange={(e) => setDraft({ ...draft, geofence: { ...draft.geofence, radiusMeters: Number(e.target.value) } })} /></label></>}
        {taxError && <p className="dashboard-filter-error full-width" role="alert">{taxError}</p>}
        {isAdmin && <Button type="submit" disabled={busy}>Save organization settings</Button>}
      </form>
    </Panel>
    <div className="stacked-panels">
      <CatalogEditor title="Departments" path="departments" items={data.departments} fields={[{ key: "name", label: "Name" }, { key: "description", label: "Description" }]} isAdmin={isAdmin} apiRequest={apiRequest} runAction={runAction} busy={busy} />
      <CatalogEditor title="Designations" path="designations" items={data.designations} fields={[{ key: "name", label: "Name" }, { key: "description", label: "Description" }]} isAdmin={isAdmin} apiRequest={apiRequest} runAction={runAction} busy={busy} />
      <CatalogEditor title="Leave types" path="leave-types" items={data.leaveTypes} fields={[{ key: "name", label: "Name" }, { key: "annualDays", label: "Annual days", type: "number" }, { key: "paid", label: "Paid", type: "checkbox" }]} isAdmin={isAdmin} apiRequest={apiRequest} runAction={runAction} busy={busy} />
      <CatalogEditor title="Holidays" path="holidays" items={data.holidays} fields={[{ key: "name", label: "Name" }, { key: "date", label: "Date", type: "date" }, { key: "recurring", label: "Recurring", type: "checkbox" }]} isAdmin={isAdmin} apiRequest={apiRequest} runAction={runAction} busy={busy} />
    </div>
  </div>;
}

function CatalogEditor({ title, path, items = [], fields, isAdmin, apiRequest, runAction, busy }) {
  const [values, setValues] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [formError, setFormError] = useState("");
  const payloadFor = (source) => Object.fromEntries(fields.map((field) => [field.key, source[field.key] ?? (field.type === "checkbox" ? false : "")]));

  function fieldControl(field, source, onChange) {
    if (field.type === "checkbox") {
      return <label key={field.key} className="toggle-row"><input type="checkbox" checked={Boolean(source[field.key])} onChange={(event) => onChange({ ...source, [field.key]: event.target.checked })} />{field.label}</label>;
    }
    return <label key={field.key}><span className="sr-only">{field.label}</span><input className={inputClass} aria-label={field.label} type={field.type ?? "text"} min={field.type === "number" ? "0" : undefined} required={field.key === "name" || field.key === "date"} placeholder={field.label} value={source[field.key] ?? ""} onChange={(event) => onChange({ ...source, [field.key]: field.type === "number" && event.target.value !== "" ? Number(event.target.value) : event.target.value })} /></label>;
  }

  return <Panel title={title}>
    <div className="table-wrap"><table className="data-table"><thead><tr>{fields.map((field) => <th key={field.key}>{field.label}</th>)}{isAdmin && <th>Actions</th>}</tr></thead><tbody>{items.map((item) => <tr key={item.id}>{fields.map((field) => <td key={field.key}>{editingId === item.id ? fieldControl(field, editValues, setEditValues) : formatValue(item[field.key])}</td>)}{isAdmin && <td><div className="button-row">{editingId === item.id ? <><Button type="button" variant="quiet" disabled={busy} onClick={() => runAction(async () => { await apiRequest(`/${path}/${item.id}`, { method: "PATCH", body: payloadFor(editValues) }); setEditingId(null); }, "Reference record updated.")}>Save</Button><Button type="button" variant="quiet" onClick={() => { setEditingId(null); setFormError(""); }}>Cancel</Button></> : <><Button type="button" variant="quiet" onClick={() => { setEditingId(item.id); setEditValues(payloadFor(item)); setFormError(""); }}>Edit</Button><Button type="button" variant="danger" disabled={busy} onClick={() => { if (confirm(`Delete ${item.name}?`)) runAction(() => apiRequest(`/${path}/${item.id}`, { method: "DELETE" }), "Reference record deleted."); }}>Delete</Button></>}</div></td>}</tr>)}</tbody></table></div>
    {!items.length && <EmptyState text={`No ${title.toLowerCase()} configured yet.`} />}
    {formError && <p className="dashboard-filter-error" role="alert">{formError}</p>}
    {isAdmin && <form className="catalog-form" onSubmit={(event) => { event.preventDefault(); setFormError(""); runAction(async () => { await apiRequest(`/${path}`, { method: "POST", body: payloadFor(values) }); setValues({}); }, "Reference record created."); }}><div className="catalog-fields">{fields.map((field) => fieldControl(field, values, setValues))}</div><Button disabled={busy}>Add {title.toLowerCase().replace(/s$/, "")}</Button></form>}
  </Panel>;
}

function EmployeesView({ data, user, apiRequest, apiDownload, runAction, busy, csvText, setCsvText, csvResult, setCsvResult }) {
  const [profile, setProfile] = useState(null);
  const [profileDraft, setProfileDraft] = useState(null);
  const [createDraft, setCreateDraft] = useState({ email: "", password: "", fullName: "", phone: "", employeeCode: "", role: "employee", departmentId: "", designationId: "", joinDate: "", employmentStatus: "active", salary: { basic: "", allowance: "", currency: "PKR" } });
  const isAdmin = user?.role === "admin";

  async function openProfile(id) {
    try {
      const result = await apiRequest(`/users/${id}`);
      setProfile({ ...result.user, attendanceSummary: result.attendanceSummary, leaveBalances: result.leaveBalances });
      setProfileDraft({ fullName: result.user.fullName ?? "", phone: result.user.phone ?? "", address: result.user.address ?? "", employeeCode: result.user.employeeCode ?? "", departmentId: result.user.departmentId ?? "", designationId: result.user.designationId ?? "", joinDate: result.user.joinDate ?? "", employmentStatus: result.user.employmentStatus ?? "active" });
    } catch (error) {
      runAction(() => Promise.reject(error));
    }
  }

  function updateCreate(key, value) {
    setCreateDraft((current) => ({ ...current, [key]: value }));
  }

  return <>
    <Panel title="Directory" action={user?.role !== "employee" && <div className="button-row"><Button type="button" variant="quiet" onClick={() => runAction(() => apiDownload("/users/csv/export", "employees.csv"), "Employee export downloaded.")}>Export CSV</Button><Button type="button" variant="quiet" onClick={() => runAction(() => apiDownload("/users/csv/template", "employees-template.csv"), "CSV template downloaded.")}>Download template</Button></div>}>
      <div className="table-wrap"><table className="data-table"><thead><tr>{["Name", "Email", "Employee ID", "Department", "Designation", "Phone", "Role", "Status", "Profile"].map((label) => <th key={label}>{label}</th>)}</tr></thead><tbody>{(data.users ?? []).map((record) => <tr key={record.id}><td>{record.fullName || "—"}</td><td>{record.email}</td><td>{record.employeeCode || "—"}</td><td>{(data.departments ?? []).find((item) => String(item.id) === String(record.departmentId))?.name ?? "Unassigned"}</td><td>{(data.designations ?? []).find((item) => String(item.id) === String(record.designationId))?.name ?? "Unassigned"}</td><td>{record.phone || "—"}</td><td>{record.role}</td><td>{record.employmentStatus}</td><td><Button type="button" variant="quiet" onClick={() => openProfile(record.id)}>View</Button></td></tr>)}</tbody></table></div>
      {!data.users?.length && <EmptyState text="No employees match this search. Try another name, email, or employee ID." />}
    </Panel>
    {profile && profileDraft && <Panel title={`Employee profile · ${profile.fullName || profile.email}`} action={<Button type="button" variant="quiet" onClick={() => { setProfile(null); setProfileDraft(null); }}>Close</Button>}>
      <div className="profile-grid"><div><span>Email</span><strong>{profile.email}</strong></div><div><span>Employee ID</span><strong>{profile.employeeCode || "—"}</strong></div><div><span>Employment</span><strong>{profile.employmentStatus}</strong></div>{user?.role === "admin" && <div><span>Salary</span><strong>{profile.salary ? `${profile.salary.basic} + ${profile.salary.allowance} ${profile.salary.currency}` : "Not assigned"}</strong></div>}</div>
      <form className="form-grid" onSubmit={(event) => { event.preventDefault(); runAction(async () => { await apiRequest(`/users/${profile.id}`, { method: "PATCH", body: user?.role === "employee" ? { fullName: profileDraft.fullName, phone: profileDraft.phone, address: profileDraft.address } : { ...profileDraft, departmentId: profileDraft.departmentId || null, designationId: profileDraft.designationId || null, joinDate: profileDraft.joinDate || null } }); setProfile((current) => ({ ...current, ...profileDraft })); }, "Employee profile updated."); }}>
        <label>Full name<input className={inputClass} maxLength={120} required value={profileDraft.fullName} onChange={(e) => setProfileDraft({ ...profileDraft, fullName: e.target.value })} /></label>
        <label>Phone<input className={inputClass} maxLength={40} value={profileDraft.phone} onChange={(e) => setProfileDraft({ ...profileDraft, phone: e.target.value })} /></label>
        {(user?.role === "admin" || user?.role === "hr") && <><label>Employee ID<input className={inputClass} maxLength={40} value={profileDraft.employeeCode} onChange={(e) => setProfileDraft({ ...profileDraft, employeeCode: e.target.value })} /></label><label>Department<select className={inputClass} value={profileDraft.departmentId} onChange={(e) => setProfileDraft({ ...profileDraft, departmentId: e.target.value })}><option value="">Unassigned</option>{(data.departments ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Designation<select className={inputClass} value={profileDraft.designationId} onChange={(e) => setProfileDraft({ ...profileDraft, designationId: e.target.value })}><option value="">Unassigned</option>{(data.designations ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Start date<input className={inputClass} type="date" value={profileDraft.joinDate || ""} onChange={(e) => setProfileDraft({ ...profileDraft, joinDate: e.target.value })} /></label>
        <label>Employment status<select className={inputClass} value={profileDraft.employmentStatus} onChange={(e) => setProfileDraft({ ...profileDraft, employmentStatus: e.target.value })}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
        </>}
        <label className="full-width">Address<textarea className={inputClass} maxLength={250} value={profileDraft.address} onChange={(e) => setProfileDraft({ ...profileDraft, address: e.target.value })} /></label>
        <Button disabled={busy}>Save profile changes</Button>
      </form>
      <h3 className="subheading">Attendance summary</h3><div className="metric-strip">{Object.entries(profile.attendanceSummary ?? {}).filter(([key]) => key.endsWith("Days") || key.endsWith("Minutes")).map(([key, value]) => <div key={key}><span>{key.replace(/([A-Z])/g, " $1")}</span><strong>{value}</strong></div>)}</div>
      <h3 className="subheading">Leave balances</h3><div className="balance-list">{(profile.leaveBalances ?? []).map((balance) => <div className="balance-row" key={balance.leaveTypeId}><strong>{balance.name}</strong><b>{balance.remaining}<small> / {balance.annualDays} days remaining</small></b></div>)}</div>
    </Panel>}
    {user?.role !== "employee" && <Panel title="Create employee account"><p className="panel-copy">Use a temporary password for the first sign-in. Assign role, department and salary only according to your access.</p><form className="form-grid" onSubmit={(event) => { event.preventDefault(); runAction(async () => { const payload = { ...createDraft }; if (payload.salary.basic !== "" || payload.salary.allowance !== "") payload.salary = { basic: Number(payload.salary.basic || 0), allowance: Number(payload.salary.allowance || 0), currency: payload.salary.currency }; else delete payload.salary; await apiRequest("/users", { method: "POST", body: payload }); setCreateDraft({ email: "", password: "", fullName: "", phone: "", employeeCode: "", role: "employee", departmentId: "", designationId: "", joinDate: "", employmentStatus: "active", salary: { basic: "", allowance: "", currency: "PKR" } }); }, "Employee account created."); }}>
      <label>Full name<input className={inputClass} required maxLength={120} value={createDraft.fullName} onChange={(e) => updateCreate("fullName", e.target.value)} /></label><label>Work email<input className={inputClass} required type="email" value={createDraft.email} onChange={(e) => updateCreate("email", e.target.value)} /></label><label>Temporary password<input className={inputClass} required type="password" minLength={8} value={createDraft.password} onChange={(e) => updateCreate("password", e.target.value)} /></label><label>Phone<input className={inputClass} maxLength={40} value={createDraft.phone} onChange={(e) => updateCreate("phone", e.target.value)} /></label><label>Employee ID<input className={inputClass} maxLength={40} value={createDraft.employeeCode} onChange={(e) => updateCreate("employeeCode", e.target.value)} /></label>
      {isAdmin && <label>Role<select className={inputClass} value={createDraft.role} onChange={(e) => updateCreate("role", e.target.value)}><option value="employee">Employee</option><option value="hr">HR</option><option value="admin">Admin</option></select></label>}
      <label>Department<select className={inputClass} value={createDraft.departmentId} onChange={(e) => updateCreate("departmentId", e.target.value)}><option value="">Unassigned</option>{(data.departments ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Designation<select className={inputClass} value={createDraft.designationId} onChange={(e) => updateCreate("designationId", e.target.value)}><option value="">Unassigned</option>{(data.designations ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Start date<input className={inputClass} type="date" value={createDraft.joinDate} onChange={(e) => updateCreate("joinDate", e.target.value)} /></label><label>Employment status<select className={inputClass} value={createDraft.employmentStatus} onChange={(e) => updateCreate("employmentStatus", e.target.value)}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
      <label>Basic salary<input className={inputClass} type="number" min="0" step="0.01" value={createDraft.salary.basic} onChange={(e) => setCreateDraft({ ...createDraft, salary: { ...createDraft.salary, basic: e.target.value } })} /></label><label>Allowance<input className={inputClass} type="number" min="0" step="0.01" value={createDraft.salary.allowance} onChange={(e) => setCreateDraft({ ...createDraft, salary: { ...createDraft.salary, allowance: e.target.value } })} /></label><label>Currency<input className={inputClass} maxLength={3} value={createDraft.salary.currency} onChange={(e) => setCreateDraft({ ...createDraft, salary: { ...createDraft.salary, currency: e.target.value.toUpperCase() } })} /></label><Button disabled={busy}>Create employee</Button>
    </form></Panel>}
    {user?.role !== "employee" && <Panel title="CSV import"><p className="panel-copy">Paste CSV, validate first, then import. Review every row before creating accounts. Newly generated temporary passwords are shown below once.</p><textarea className={`${inputClass} csv-area`} value={csvText} onChange={(e) => { setCsvText(e.target.value); setCsvResult(null); }} placeholder="email,fullName,phone,address,employeeCode,department,designation,joinDate,employmentStatus" /><div className="button-row"><Button type="button" disabled={busy || !csvText.trim()} onClick={() => runAction(async () => { setCsvResult(await apiRequest("/users/csv/import", { method: "POST", body: { csv: csvText, dryRun: true } })); }, "Validation finished. Review the row results below.")}>Validate CSV</Button><Button type="button" variant="danger" disabled={busy || !csvText.trim()} onClick={() => { if (confirm("Create accounts for the valid CSV rows now?")) runAction(async () => { const check = await apiRequest("/users/csv/import", { method: "POST", body: { csv: csvText, dryRun: true } }); setCsvResult(check); if (check.skipped) throw new Error("Import stopped. Fix the rows shown below, then validate again."); const result = await apiRequest("/users/csv/import", { method: "POST", body: { csv: csvText, dryRun: false } }); setCsvResult(result); setCsvText(""); }, "CSV import finished. Save any temporary passwords shown below."); }}>Import valid rows</Button></div>
      {csvResult && <div className="table-wrap"><p className="panel-copy">{csvResult.dryRun ? `Validation: ${(csvResult.rows ?? []).filter((row) => row.ok).length} valid, ${csvResult.skipped ?? 0} need attention. No accounts were created.` : `Import: ${csvResult.created ?? 0} created, ${csvResult.skipped ?? 0} skipped.`}</p><table className="data-table"><thead><tr><th>Row</th><th>Email</th><th>Result</th><th>Details</th></tr></thead><tbody>{(csvResult.rows ?? []).map((row) => <tr key={row.row}><td>{row.row}</td><td>{row.email || "—"}</td><td>{row.ok ? (row.tempPassword ? "Created" : "Valid") : "Needs attention"}</td><td>{row.tempPassword ? <><strong>Temporary password:</strong> <code>{row.tempPassword}</code></> : row.errors?.map((item) => `${item.field}: ${item.reason}`).join("; ") || "Ready"}</td></tr>)}</tbody></table></div>}
    </Panel>}
  </>;
}

function SalaryAssignment({ users, user, apiRequest, runAction, busy }) {
  const [targetId, setTargetId] = useState("");
  const [salary, setSalary] = useState({ basic: "", allowance: "", currency: "PKR" });
  const [search, setSearch] = useState("");
  const [matches, setMatches] = useState(users.filter((item) => item.role === "employee"));
  const [searching, setSearching] = useState(false);
  const canAssign = ["admin", "hr"].includes(user?.role);

  useEffect(() => {
    let active = true;
    if (!search.trim()) {
      setMatches(users.filter((item) => item.role === "employee"));
      return () => { active = false; };
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const params = new URLSearchParams({ search: search.trim(), limit: "20", page: "1" });
        const result = await apiRequest(`/users?${params}`);
        if (active) setMatches((result.users ?? []).filter((item) => item.role === "employee"));
      } catch {
        if (active) setMatches(users.filter((item) => item.role === "employee"));
      } finally {
        if (active) setSearching(false);
      }
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [search, users, apiRequest]);

  if (!canAssign) return null;
  return <Panel title="Assign salary structure"><p className="panel-copy">Salary amounts are write-only for HR. Existing amounts are never displayed in this form. Search to find employees outside the current directory page.</p><form className="form-grid" onSubmit={(event) => { event.preventDefault(); runAction(async () => { await apiRequest(`/users/${targetId}`, { method: "PATCH", body: { salary: { basic: Number(salary.basic), allowance: Number(salary.allowance), currency: salary.currency.trim().toUpperCase() } } }); setSalary({ basic: "", allowance: "", currency: "PKR" }); setTargetId(""); }, "Salary structure assigned."); }}><label>Find employee<input className={inputClass} value={search} onChange={(event) => { setSearch(event.target.value); setTargetId(""); }} placeholder="Search name or work email" /></label><label>Employee<select className={inputClass} required value={targetId} onChange={(event) => setTargetId(event.target.value)}><option value="">{searching ? "Searching…" : "Choose employee"}</option>{matches.map((item) => <option key={item.id} value={item.id}>{item.fullName || item.email} · {item.email}</option>)}</select></label><label>Basic salary<input className={inputClass} type="number" min="0" step="0.01" required value={salary.basic} onChange={(event) => setSalary({ ...salary, basic: event.target.value })} /></label><label>Allowance<input className={inputClass} type="number" min="0" step="0.01" required value={salary.allowance} onChange={(event) => setSalary({ ...salary, allowance: event.target.value })} /></label><label>Currency<input className={inputClass} maxLength={3} pattern="[A-Za-z]{3}" required value={salary.currency} onChange={(event) => setSalary({ ...salary, currency: event.target.value.toUpperCase() })} /></label><Button disabled={busy || !targetId}>Assign salary</Button></form></Panel>;
}

function AttendanceCalendar({ records, month, setMonth }) {
  const [year, monthNumber] = month.split("-").map(Number);
  const firstDay = new Date(year, monthNumber - 1, 1).getDay();
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  const byDate = new Map(records.map((record) => [record.date, record]));
  const cells = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, index) => index + 1)];
  while (cells.length % 7) cells.push(null);
  const monthTitle = new Date(year, monthNumber - 1, 1).toLocaleDateString("en", { month: "long", year: "numeric" });
  const currentMonth = localDayKey().slice(0, 7);
  function shiftMonth(offset) {
    const next = new Date(year, monthNumber - 1 + offset, 1);
    const nextKey = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
    if (nextKey <= currentMonth) setMonth(nextKey);
  }
  return <Panel title="Attendance calendar" action={<div className="calendar-controls"><button type="button" aria-label="Previous month" onClick={() => shiftMonth(-1)}>←</button><strong>{monthTitle}</strong><button type="button" aria-label="Next month" disabled={month >= currentMonth} onClick={() => shiftMonth(1)}>→</button></div>}><div className="calendar-grid calendar-weekdays">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span key={day}>{day}</span>)}</div><div className="calendar-grid">{cells.map((day, index) => {
    if (!day) return <span className="calendar-day calendar-blank" key={`blank-${index}`} />;
    const key = `${month}-${String(day).padStart(2, "0")}`;
    const record = byDate.get(key);
    return <div key={key} className={`calendar-day ${record ? `calendar-${record.status}` : ""}`} title={record ? `${record.status}${record.minutesLate ? ` · ${record.minutesLate} min late` : ""}` : "No attendance record"}><span>{day}</span>{record && <i>{record.status.replace("_", " ")}</i>}</div>;
  })}</div><div className="calendar-legend"><span><i className="calendar-dot dot-present" />Present</span><span><i className="calendar-dot dot-late" />Late</span><span><i className="calendar-dot dot-half" />Half-day</span><span><i className="calendar-dot dot-leave" />Leave</span></div></Panel>;
}

function AttendanceView({ data, user, apiRequest, runAction, busy, page, setPage, loading, isCurrentMonth }) {
  const employee = user?.role === "employee";
  const today = localDayKey();
  const [correction, setCorrection] = useState({ attendanceId: "", reason: "", newCheckInAt: "", newCheckOutAt: "" });
  const [locationMessage, setLocationMessage] = useState("");
  const personalToday = data.records?.find((record) => record.date === today);
  const totalPages = Math.max(1, Math.ceil((data.total ?? 0) / (data.limit ?? 50)));

  async function checkInWithoutLocation() {
    setLocationMessage("");
    await runAction(() => apiRequest("/attendance/check-in", { method: "POST", body: {} }), "Checked in without GPS location.");
  }

  async function checkInWithLocation() {
    setLocationMessage("");
    if (!navigator.geolocation) {
      if (!data.geofenceEnabled) setLocationMessage("GPS is not available. You can check in without location.");
      else await runAction(() => Promise.reject(new Error("GPS is required by your organization for check-in.")));
      return;
    }
    try {
      const position = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }));
      await runAction(() => apiRequest("/attendance/check-in", { method: "POST", body: { lat: position.coords.latitude, lng: position.coords.longitude, accuracyM: position.coords.accuracy } }), "Checked in.");
    } catch (locationError) {
      if (locationError.code && !data.geofenceEnabled) {
        setLocationMessage("Location was unavailable or declined. You can still check in without GPS.");
      } else if (locationError.code) {
        await runAction(() => Promise.reject(new Error("Location permission is required for check-in.")));
      } else {
        await runAction(() => Promise.reject(locationError));
      }
    }
  }

  return <>
    <div className="stat-grid attendance-actions"><Stat label="Today" value={today} foot="Your local work date" /><Stat label="Your access" value={employee ? "Personal" : "Organization"} foot={employee ? "Your records only" : "Visible employee records"} tone="blue" />{employee && <div className="action-tile">{!isCurrentMonth && <p className="panel-copy full-width">Select the current month to check in or out. You can still review past records and request corrections.</p>}<Button type="button" disabled={!isCurrentMonth || busy || Boolean(personalToday)} onClick={checkInWithLocation}>Check in</Button><Button type="button" variant="quiet" disabled={!isCurrentMonth || busy || !personalToday?.checkInAt || Boolean(personalToday?.checkOutAt)} onClick={() => runAction(() => apiRequest("/attendance/check-out", { method: "POST", body: {} }), "Checked out.")}>Check out</Button>{locationMessage && <div className="full-width"><p className="panel-copy" role="status">{locationMessage}</p><Button type="button" variant="quiet" disabled={busy || !isCurrentMonth} onClick={checkInWithoutLocation}>Check in without GPS</Button></div>}</div>}</div>
    {employee && <Panel title="Request an attendance correction"><p className="panel-copy">Choose a record and explain what needs correcting. A manager must review the request.</p><form className="form-grid" onSubmit={(event) => { event.preventDefault(); if (!correction.newCheckInAt && !correction.newCheckOutAt) return; runAction(async () => { await apiRequest(`/attendance/${correction.attendanceId}/correction`, { method: "POST", body: { reason: correction.reason, newCheckInAt: correction.newCheckInAt || undefined, newCheckOutAt: correction.newCheckOutAt || undefined } }); setCorrection({ attendanceId: "", reason: "", newCheckInAt: "", newCheckOutAt: "" }); }, "Correction request submitted."); }}><label>Attendance date<select className={inputClass} required value={correction.attendanceId} onChange={(e) => setCorrection({ ...correction, attendanceId: e.target.value })}><option value="">Choose record</option>{(data.records ?? []).filter((record) => record.correction?.status !== "pending").map((record) => <option key={record.id} value={record.id}>{record.date} · {record.status}</option>)}</select></label><label>Reason<input className={inputClass} required minLength={3} maxLength={500} value={correction.reason} onChange={(e) => setCorrection({ ...correction, reason: e.target.value })} /></label><label>Correct check-in<input className={inputClass} type="datetime-local" value={correction.newCheckInAt} onChange={(e) => setCorrection({ ...correction, newCheckInAt: e.target.value })} /></label><label>Correct check-out<input className={inputClass} type="datetime-local" value={correction.newCheckOutAt} onChange={(e) => setCorrection({ ...correction, newCheckOutAt: e.target.value })} /></label><Button disabled={busy || !correction.attendanceId || (!correction.newCheckInAt && !correction.newCheckOutAt)}>Send correction request</Button></form></Panel>}
    {data.board && <Panel title={`Daily board · ${data.board.date}`}><p className="panel-copy">{data.board.isWorkingDay ? "Scheduled workday" : data.board.isHoliday ? "Holiday" : "Non-working day"}; includes active employees visible to your role.</p><Table rows={data.board.rows.map((row) => ({ ...row.user, status: row.record?.status ?? "Not checked in", checkIn: row.record?.checkInAt ? new Date(row.record.checkInAt).toLocaleTimeString() : "—", worked: row.record?.workedMinutes ?? 0 }))} columns={[["fullName", "Employee"], ["email", "Email"], ["departmentName", "Department"], ["status", "Status"], ["checkIn", "Check-in"], ["worked", "Worked minutes"]]} empty="No employees for this date." /></Panel>}
    <Panel title="Attendance records"><div className="table-wrap"><table className="data-table"><thead><tr><th>Date</th><th>Employee</th><th>Status</th><th>Late minutes</th><th>Worked</th><th>Check-in / out</th><th>Correction</th></tr></thead><tbody>{(data.records ?? []).map((record) => <tr key={record.id}><td>{record.date}</td><td>{record.fullName || record.email || user?.email}</td><td><span className={`status-pill status-${record.status}`}>{record.status.replaceAll("_", " ")}</span></td><td>{record.minutesLate ?? 0}</td><td>{record.workedMinutes ?? 0}m</td><td>{record.checkInAt ? new Date(record.checkInAt).toLocaleTimeString() : "—"} / {record.checkOutAt ? new Date(record.checkOutAt).toLocaleTimeString() : "—"}</td><td>{record.correction?.status ? <div><span className={`status-pill status-${record.correction.status}`}>{record.correction.status}</span>{record.correction.status === "pending" && !employee && <div className="button-row correction-actions"><Button type="button" variant="quiet" disabled={busy} onClick={() => runAction(() => apiRequest(`/attendance/${record.id}/correction`, { method: "PATCH", body: { decision: "approved" } }), "Correction approved.")}>Approve</Button><Button type="button" variant="danger" disabled={busy} onClick={() => runAction(() => apiRequest(`/attendance/${record.id}/correction`, { method: "PATCH", body: { decision: "rejected" } }), "Correction rejected.")}>Reject</Button></div>}</div> : "—"}</td></tr>)}</tbody></table></div>{!data.records?.length && <EmptyState text="No attendance records found for this month." />}<div className="pagination-controls"><Button type="button" variant="quiet" disabled={page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</Button><span>Page {data.page ?? page} of {totalPages} · {data.total ?? 0} records</span><Button type="button" variant="quiet" disabled={loading || page >= totalPages} onClick={() => setPage((current) => current + 1)}>Next</Button></div></Panel>
  </>;
}

function LeaveView({ data, user, apiRequest, runAction, busy, draft, setDraft, page, setPage, loading }) {
  const privileged = user?.role === "admin" || user?.role === "hr";
  const totalPages = Math.max(1, Math.ceil((data.total ?? 0) / (data.limit ?? 50)));
  const hasTypes = (data.types ?? []).length > 0;
  return <>
    <div className="two-column-layout"><Panel title="Leave balances"><div className="balance-list">{(data.balances ?? []).map((balance) => <div className="balance-row" key={balance.leaveTypeId}><div><strong>{balance.name}</strong><small>{balance.used} used · {balance.pending} pending</small></div><b>{balance.remaining}<small> / {balance.annualDays} days</small></b></div>)}</div>{!data.balances?.length && <EmptyState text="Leave balances will appear after your organization configures leave types." />}</Panel>
      <Panel title="Request leave"><p className="panel-copy">Select the dates and type. Requests are checked against working days, holidays, available balance and overlaps.</p>{!hasTypes ? <EmptyState text="No leave types are configured yet. Ask an administrator to add one." /> : <form className="form-grid" onSubmit={(event) => { event.preventDefault(); runAction(async () => { await apiRequest("/leave", { method: "POST", body: draft }); setDraft({ leaveTypeId: "", fromDate: "", toDate: "", reason: "" }); }, "Leave request submitted."); }}><label>Leave type<select className={inputClass} required value={draft.leaveTypeId} onChange={(e) => setDraft({ ...draft, leaveTypeId: e.target.value })}><option value="">Choose type</option>{data.types.map((type) => <option key={type.id} value={type.id}>{type.name} · {type.paid ? "Paid" : "Unpaid"}</option>)}</select></label><label>From<input className={inputClass} required type="date" value={draft.fromDate} onChange={(e) => setDraft({ ...draft, fromDate: e.target.value, toDate: draft.toDate && draft.toDate < e.target.value ? e.target.value : draft.toDate })} /></label><label>To<input className={inputClass} required type="date" min={draft.fromDate || undefined} value={draft.toDate} onChange={(e) => setDraft({ ...draft, toDate: e.target.value })} /></label><label className="full-width">Reason<textarea className={inputClass} required maxLength={500} value={draft.reason} onChange={(e) => setDraft({ ...draft, reason: e.target.value })} /></label><Button disabled={busy || !draft.fromDate || !draft.toDate || !draft.leaveTypeId}>Submit request</Button></form>}</Panel></div>
    <Panel title="Leave requests"><div className="table-wrap"><table className="data-table"><thead><tr><th>Employee</th><th>Leave</th><th>Dates</th><th>Days</th><th>Status</th><th>Reason</th><th>Actions</th></tr></thead><tbody>{(data.applications ?? []).map((application) => { const applicationUserId = application.userId?.id ?? application.userId?._id ?? application.user?.id ?? application.user?._id ?? application.userId ?? ""; const isOwner = String(applicationUserId) === String(user?.id ?? ""); const canReview = privileged && application.status === "pending" && (user?.role === "admin" || !isOwner); const canCancel = isOwner && application.status === "pending"; return <tr key={application.id}><td>{application.fullName || application.email || (isOwner ? "You" : "—")}</td><td>{application.leaveTypeName}</td><td>{application.fromDate} – {application.toDate}</td><td>{application.days}</td><td><span className={`status-pill status-${application.status}`}>{application.status}</span></td><td>{application.reason || "—"}</td><td>{canReview ? <div className="button-row"><Button type="button" variant="quiet" disabled={busy} onClick={() => runAction(() => apiRequest(`/leave/${application.id}/review`, { method: "PATCH", body: { decision: "approved" } }), "Request approved.")}>Approve</Button><Button type="button" variant="danger" disabled={busy} onClick={() => runAction(() => apiRequest(`/leave/${application.id}/review`, { method: "PATCH", body: { decision: "rejected" } }), "Request rejected.")}>Reject</Button></div> : canCancel ? <Button type="button" variant="quiet" disabled={busy} onClick={() => runAction(() => apiRequest(`/leave/${application.id}/cancel`, { method: "PATCH", body: {} }), "Request cancelled.")}>Cancel</Button> : "—"}</td></tr>; })}</tbody></table></div>{!data.applications?.length && <EmptyState text="No requests on this page. Submit a request or check another page." />}<div className="pagination-controls"><Button type="button" variant="quiet" disabled={page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</Button><span>Page {data.page ?? page} of {totalPages} · {data.total ?? 0} requests</span><Button type="button" variant="quiet" disabled={loading || page >= totalPages} onClick={() => setPage((current) => current + 1)}>Next</Button></div></Panel>
  </>;
}

function PayrollView({ data, user, apiRequest, apiDownload, runAction, busy, month, setMonth }) {
  const employee = user?.role === "employee";
  const [runDetails, setRunDetails] = useState(null);
  const currentMonth = localDayKey().slice(0, 7);
  if (employee) return <Panel title="Published payslips"><p className="panel-copy">Only finalized payslips appear here. Your salary details are visible only to you and authorized administrators.</p><div className="payslip-list">{(data.payslips ?? []).map((item) => <article key={item.runId}><div><strong>{item.month}</strong><span className="status-pill status-finalized">Published</span><span className="payslip-net">{item.line?.net?.toLocaleString?.() ?? "—"} {item.line?.currency ?? ""}</span></div><Button type="button" variant="quiet" disabled={busy} onClick={() => runAction(() => apiDownload(`/payroll/runs/${item.runId}/payslips/${user.id}.pdf`, `payslip-${item.month}.pdf`), "Payslip downloaded.")}>Download PDF</Button></article>)}</div>{!data.payslips?.length && <EmptyState text="No published payslips yet. They will appear after an administrator finalizes a payroll run." />}</Panel>;
  const privileged = user?.role === "admin" || user?.role === "hr";
  return <>
    <Panel title="Payroll runs" action={privileged && <form className="button-row" onSubmit={(event) => { event.preventDefault(); if (month > currentMonth) return; runAction(() => apiRequest("/payroll/runs", { method: "POST", body: { month } }), "Draft payroll run prepared."); }}><label className="sr-only" htmlFor="payroll-month">Payroll month</label><input id="payroll-month" className={inputClass} type="month" max={currentMonth} required value={month} onChange={(event) => setMonth(event.target.value)} /><Button disabled={busy || !month || month > currentMonth}>Prepare draft</Button></form>}>
      <p className="panel-copy">HR can prepare and review draft attendance totals but cannot see salary or payroll amounts. Only an administrator can publish a run.</p>
      <Table rows={(data.runs ?? []).map((run) => ({ ...run, summary: `${run.employeeCount ?? run.summary?.employeeCount ?? 0} employees · ${run.workingDays ?? 0} working days` }))} columns={[["month", "Month"], ["status", "Status"], ["workingDays", "Working days"], ["employeeCount", "Employees"], ["summary", "Run summary"]]} empty="No payroll runs yet. Choose a past or current month to prepare the first draft." />
    </Panel>
    {(data.runs ?? []).map((run) => <Panel key={run.id} title={`${run.month} · ${run.status}`} action={run.status === "draft" && user?.role === "admin" && <Button type="button" disabled={busy} onClick={() => { if (confirm(`Finalize payroll for ${run.month}? This locks the run and publishes payslips.`)) runAction(() => apiRequest(`/payroll/runs/${run.id}/finalize`, { method: "POST", body: {} }), "Payroll finalized and payslips published."); }}>Finalize and publish</Button>}>
      <div className="button-row"><Button type="button" variant="quiet" disabled={busy} onClick={() => runAction(async () => { setRunDetails(await apiRequest(`/payroll/runs/${run.id}`)); }, "Payroll lines loaded.")}>View run details</Button>{run.status === "draft" && <Button type="button" variant="danger" disabled={busy} onClick={() => { if (confirm(`Delete draft payroll for ${run.month}?`)) runAction(() => apiRequest(`/payroll/runs/${run.id}`, { method: "DELETE" }), "Draft deleted."); }}>Delete draft</Button>}</div>
      {runDetails?.id === run.id && <div className="table-wrap payroll-lines"><table className="data-table"><thead><tr><th>User ID</th><th>Present</th><th>Late</th><th>Half day</th><th>Absent</th>{user?.role === "admin" && <><th>Gross</th><th>Deductions</th><th>Tax</th><th>Net</th></>}</tr></thead><tbody>{runDetails.lines?.map((line) => <tr key={line.userId}><td>{line.userId}</td><td>{line.presentDays}</td><td>{line.lateDays}</td><td>{line.halfDays}</td><td>{line.absentDays}</td>{user?.role === "admin" && <><td>{line.gross} {line.currency}</td><td>{line.totalDeductions} {line.currency}</td><td>{line.tax} {line.currency}</td><td>{line.net} {line.currency}</td></>}</tr>)}</tbody></table></div>}
    </Panel>)}
  </>;
}

function AnnouncementsView({ data, user, apiRequest, runAction, busy, draft, setDraft, page, setPage, loading }) {
  const canPost = user?.role === "admin" || user?.role === "hr";
  const [editing, setEditing] = useState(null);
  const [editValues, setEditValues] = useState({});
  const totalPages = Math.max(1, Math.ceil((data.total ?? 0) / (data.limit ?? 25)));
  return <>
    {canPost && <Panel title="New announcement"><form className="form-grid" onSubmit={(event) => { event.preventDefault(); runAction(async () => { await apiRequest("/announcements", { method: "POST", body: { ...draft, title: draft.title.trim(), body: draft.body.trim() } }); setDraft({ title: "", body: "", audience: { type: "all" } }); }, "Announcement published."); }}><label>Title<input className={inputClass} required maxLength={150} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label><label>Audience<select className={inputClass} value={draft.audience.type} onChange={(e) => setDraft({ ...draft, audience: e.target.value === "all" ? { type: "all" } : { type: "role", role: "employee" } })}><option value="all">Everyone</option><option value="role">One role</option></select></label>{draft.audience.type === "role" && <label>Role<select className={inputClass} value={draft.audience.role ?? "employee"} onChange={(e) => setDraft({ ...draft, audience: { ...draft.audience, role: e.target.value } })}><option value="employee">Employees</option><option value="hr">HR</option><option value="admin">Admins</option></select></label>}<label className="full-width">Message<textarea className={inputClass} required maxLength={4000} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} /></label><label className="toggle-row"><input type="checkbox" checked={draft.pinned ?? false} onChange={(e) => setDraft({ ...draft, pinned: e.target.checked })} />Pin announcement</label><Button disabled={busy || !draft.title.trim() || !draft.body.trim()}>Publish announcement</Button></form></Panel>}
    <Panel title="Recent announcements"><div className="announcement-list announcement-feed">{(data.announcements ?? []).map((item) => { const canManage = user?.role === "admin" || String(item.createdBy ?? "") === String(user?.id ?? ""); return <article key={item.id}><div className="announcement-date">{item.pinned ? "PINNED" : new Date(item.createdAt).toLocaleDateString()} · {item.audience?.type === "role" ? `For ${item.audience.role}` : "Everyone"}</div>{editing === item.id ? <><label>Title<input className={inputClass} required maxLength={150} value={editValues.title ?? item.title} onChange={(e) => setEditValues({ ...editValues, title: e.target.value })} /></label><label>Message<textarea className={inputClass} required maxLength={4000} value={editValues.body ?? item.body} onChange={(e) => setEditValues({ ...editValues, body: e.target.value })} /></label><div className="button-row"><Button type="button" disabled={busy} onClick={() => runAction(async () => { await apiRequest(`/announcements/${item.id}`, { method: "PATCH", body: { title: String(editValues.title ?? item.title).trim(), body: String(editValues.body ?? item.body).trim() } }); setEditing(null); setEditValues({}); }, "Announcement updated.")}>Save</Button><Button type="button" variant="quiet" onClick={() => setEditing(null)}>Cancel</Button></div></> : <><h3>{item.title}</h3><p>{item.body}</p>{canManage && <div className="button-row announcement-actions"><Button type="button" variant="quiet" onClick={() => { setEditing(item.id); setEditValues({ title: item.title, body: item.body }); }}>Edit</Button><Button type="button" variant="danger" disabled={busy} onClick={() => { if (confirm("Delete this announcement?")) runAction(() => apiRequest(`/announcements/${item.id}`, { method: "DELETE" }), "Announcement deleted."); }}>Delete</Button></div>}</>}</article>; })}</div>{!data.announcements?.length && <EmptyState text="No announcements on this page. Admins and HR can publish updates for everyone or a specific role." />}<div className="pagination-controls"><Button type="button" variant="quiet" disabled={page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</Button><span>Page {data.page ?? page} of {totalPages} · {data.total ?? data.announcements?.length ?? 0} announcements</span><Button type="button" variant="quiet" disabled={loading || page >= totalPages} onClick={() => setPage((current) => current + 1)}>Next</Button></div></Panel>
  </>;
}

function AuditView({ data, apiRequest, page, setPage, loading }) {
  const [verification, setVerification] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [verificationError, setVerificationError] = useState("");
  const totalPages = Math.max(1, Math.ceil((data.total ?? 0) / (data.limit ?? 50)));
  useEffect(() => { setVerification(null); setVerificationError(""); }, [page]);
  async function verifyChain() {
    setVerifying(true);
    setVerificationError("");
    try { setVerification(await apiRequest("/audit/verify")); }
    catch (error) { setVerificationError(error.message || "Could not verify the audit chain."); }
    finally { setVerifying(false); }
  }
  const valid = verification?.valid;
  return <><div className={`verification-banner ${verification ? (valid ? "verified" : "broken") : ""}`}><span>{verification ? (valid ? "✓" : "!") : "?"}</span><div><strong>{verification ? (valid ? "Hash chain verified" : "Hash chain verification failed") : "Audit integrity not checked yet"}</strong><small>{verification ? `${verification.checked ?? 0} entries checked${verification.brokenAt ? ` · broken at sequence ${verification.brokenAt}` : ""}` : "Verification checks the complete chain and may take a moment."}</small></div><Button type="button" variant="quiet" disabled={verifying} onClick={verifyChain}>{verifying ? "Verifying…" : "Verify integrity"}</Button></div>{verificationError && <p className="dashboard-filter-error" role="alert">{verificationError}</p>}<Panel title="Administrative events"><p className="panel-copy">Sensitive changes are recorded here. Details are paginated; use Verify integrity to check the full hash chain.</p><Table rows={data.entries?.map((item) => ({ ...item, actor: `${item.actor?.role ?? "system"} · ${item.actor?.id ?? "—"}`, meta: typeof item.meta === "string" ? item.meta : JSON.stringify(item.meta) }))} columns={[["seq", "#"], ["at", "Time"], ["actor", "Actor"], ["action", "Action"], ["entity", "Entity"], ["entityId", "Record"], ["meta", "Details"], ["hash", "SHA-256"]]} empty="No audit entries found." /><div className="pagination-controls"><Button type="button" variant="quiet" disabled={page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</Button><span>Page {data.page ?? page} of {totalPages} · {data.total ?? data.entries?.length ?? 0} entries</span><Button type="button" variant="quiet" disabled={loading || page >= totalPages} onClick={() => setPage((current) => current + 1)}>Next</Button></div></Panel></>;
}

function AssistantView({ data, user, chat, message, setMessage, sendMessage, busy, apiRequest, runAction, onClear }) {
  const [draftReasons, setDraftReasons] = useState({});
  const siteMode = data.mode === "site" || data.provider === "site";
  const suggestions = ["How do I request leave?", "What can I do in my role?", "How does attendance check-in work?", "Explain the late policy"];
  return <div className="assistant-layout">
    <section className="assistant-thread" aria-label="HCM assistant conversation">
      {chat.length === 0 && <div className="assistant-welcome"><span className="assistant-spark">✳</span><h2>Ask about HCM Lite</h2><p>Get help with the dashboard, people, attendance, leave, payroll, announcements, and your access. Answers respect your role.</p><div className="suggestion-row">{suggestions.map((question) => <button type="button" key={question} onClick={() => setMessage(question)}>{question}</button>)}</div></div>}
      {chat.map((item, index) => <article className={`chat-message chat-${item.role}`} key={`${item.role}-${index}`}><div className="chat-avatar">{item.role === "user" ? user?.email?.slice(0, 1).toUpperCase() : "✳"}</div><div className="chat-bubble">{item.role === "assistant" && <span className="ai-label">{item.failed ? "Needs retry" : "HCM assistant"}</span>}<p>{item.content}</p>{item.draft && <div className="draft-card"><strong>Leave request draft · not submitted</strong><dl><dt>Type</dt><dd>{item.draft.type}</dd><dt>Dates</dt><dd>{item.draft.start} – {item.draft.end}</dd><dt>Working days</dt><dd>{item.draft.days}</dd></dl><label>Reason<input className={inputClass} value={draftReasons[index] ?? item.draft.reason ?? ""} maxLength={500} onChange={(event) => setDraftReasons({ ...draftReasons, [index]: event.target.value })} /></label><Button type="button" disabled={busy} onClick={() => runAction(async () => { await apiRequest("/leave", { method: "POST", body: { leaveTypeId: item.draft.leaveTypeId, fromDate: item.draft.start, toDate: item.draft.end, reason: draftReasons[index] ?? item.draft.reason ?? "" } }); setChat((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, draft: null, submitted: true, content: `${entry.content}\n\nYour leave request was submitted.` } : entry)); }, "Leave request submitted.")}>Confirm and submit request</Button></div>}{item.submitted && <small className="muted">Submitted successfully.</small>}</div></article>)}
      {busy && <div className="chat-pending"><span className="loading-mark" />Thinking…</div>}
    </section>
    <form className="chat-composer" onSubmit={sendMessage}><textarea className={inputClass} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Ask a question about your workspace…" rows={2} maxLength={2000} /><div><span>{siteMode ? "Site assistant active · role-scoped answers" : data.enabled ? `AI connected · ${data.model}` : "Assistant unavailable"}</span><div className="button-row"><Button type="button" variant="quiet" disabled={busy || !chat.length} onClick={onClear}>Clear chat</Button><Button disabled={busy || !data.enabled || !message.trim()}>Send</Button></div></div></form>
    <p className="assistant-disclaimer">The assistant can explain the site and summarize accessible records. Verify important HR decisions against official records. It never submits changes unless you confirm them.</p>
  </div>;
}
