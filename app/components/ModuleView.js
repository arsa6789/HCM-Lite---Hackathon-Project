"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

const MODULES = {
  dashboard: ["Good work starts with a clear view.", "Your organization, at a glance."],
  organization: ["Organization", "Company policy and reference lists."],
  employees: ["People directory", "Profiles, departments and employee records."],
  attendance: ["Attendance", "Daily presence, working time and corrections."],
  leave: ["Leave management", "Requests, decisions and available balances."],
  payroll: ["Payroll", "Prepare, review and publish monthly payroll."],
  announcements: ["Announcements", "Company updates for your teams."],
  audit: ["Audit trail", "A verifiable record of administrative actions."],
  assistant: ["HCM assistant", "Answers grounded in your organization data."],
};

const COLORS = ["#1f7a68", "#d88a35", "#d7604d", "#64748b", "#71a896"];
const inputClass = "field-control";

function Button({ children, onClick, type = "button", variant = "primary", disabled = false }) {
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
  const [chat, setChat] = useState([]);
  const [message, setMessage] = useState("");
  const [draftMonth, setDraftMonth] = useState(new Date().toISOString().slice(0, 7));
  const [leaveDraft, setLeaveDraft] = useState({ leaveTypeId: "", fromDate: "", toDate: "", reason: "" });
  const [announcementDraft, setAnnouncementDraft] = useState({ title: "", body: "", audience: { type: "all" } });
  const [orgDraft, setOrgDraft] = useState({});
  const [csvText, setCsvText] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      let result;
      if (section === "dashboard") {
        result = (await apiRequest("/dashboard/summary")).dashboard;
      } else if (section === "organization") {
        const [org, departments, designations, leaveTypes, holidays] = await Promise.all([
          apiRequest("/org"), apiRequest("/departments"), apiRequest("/designations"), apiRequest("/leave-types"), apiRequest("/holidays"),
        ]);
        result = { ...org, departments: departments.items, designations: designations.items, leaveTypes: leaveTypes.items, holidays: holidays.items };
        setOrgDraft(org.org ?? {});
      } else if (section === "employees") {
        result = await apiRequest("/users?limit=100");
      } else if (section === "attendance") {
        const [records, board] = await Promise.all([
          apiRequest("/attendance?limit=100"),
          user?.role === "employee" ? Promise.resolve(null) : apiRequest("/attendance/board"),
        ]);
        result = { ...records, board };
      } else if (section === "leave") {
        const [applications, balances, types] = await Promise.all([
          apiRequest("/leave?limit=100"), apiRequest("/leave/balances"), apiRequest("/leave-types"),
        ]);
        result = { ...applications, balances: balances.balances, types: types.items };
      } else if (section === "payroll") {
        result = user?.role === "employee"
          ? await apiRequest("/payroll/mine")
          : await apiRequest("/payroll/runs");
      } else if (section === "announcements") {
        result = await apiRequest("/announcements?limit=100");
      } else if (section === "audit") {
        const [entries, verification] = await Promise.all([apiRequest("/audit?limit=100"), apiRequest("/audit/verify")]);
        result = { ...entries, verification };
      } else if (section === "assistant") {
        result = await apiRequest("/ai/status");
      } else {
        throw new Error("This section does not exist.");
      }
      setData(result);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [apiRequest, section, user?.role]);

  useEffect(() => { load(); }, [load]);

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
      const assistant = { role: "assistant", content: result.reply, draft: result.draft };
      setChat([...next, assistant]);
    } catch (chatError) {
      setError(chatError.message);
      setChat([...next, { role: "assistant", content: "I could not complete that request.", generated: true }]);
    } finally {
      setBusy(false);
    }
  }

  const [title, subtitle] = MODULES[section] ?? ["Not found", "Choose a section from the navigation."];

  return <>
    <div className="page-intro"><div><div className="eyebrow">{user?.role ?? "HCM"} workspace <span>•</span> {new Date().getFullYear()}</div><h1>{title}</h1><p>{subtitle}</p></div><div className="intro-actions">{section !== "assistant" && <Button variant="quiet" onClick={load} disabled={loading}>↻ <span>Refresh</span></Button>}</div></div>
    {notice && <div className="notice notice-success" role="status">{notice}<button onClick={() => setNotice("")} aria-label="Dismiss">×</button></div>}
    {error && <div className="notice notice-error" role="alert">{error}<button onClick={() => setError("")} aria-label="Dismiss">×</button></div>}
    {loading ? <div className="loading-block"><span className="loading-mark" />Loading {title.toLowerCase()}…</div> : !data ? <EmptyState text="No data could be loaded." /> : (
      <>
        {section === "dashboard" && <DashboardView data={data} user={user} />}
        {section === "organization" && <OrganizationView data={data} user={user} apiRequest={apiRequest} draft={orgDraft} setDraft={setOrgDraft} runAction={runAction} busy={busy} />}
        {section === "employees" && <EmployeesView data={data} user={user} apiRequest={apiRequest} apiDownload={apiDownload} runAction={runAction} busy={busy} csvText={csvText} setCsvText={setCsvText} />}
        {section === "attendance" && <AttendanceView data={data} user={user} apiRequest={apiRequest} runAction={runAction} busy={busy} />}
        {section === "leave" && <LeaveView data={data} user={user} apiRequest={apiRequest} runAction={runAction} busy={busy} draft={leaveDraft} setDraft={setLeaveDraft} />}
        {section === "payroll" && <PayrollView data={data} user={user} apiRequest={apiRequest} apiDownload={apiDownload} runAction={runAction} busy={busy} month={draftMonth} setMonth={setDraftMonth} />}
        {section === "announcements" && <AnnouncementsView data={data} user={user} apiRequest={apiRequest} runAction={runAction} busy={busy} draft={announcementDraft} setDraft={setAnnouncementDraft} />}
        {section === "audit" && <AuditView data={data} />}
        {section === "assistant" && <AssistantView data={data} user={user} chat={chat} message={message} setMessage={setMessage} sendMessage={sendMessage} busy={busy} apiRequest={apiRequest} runAction={runAction} />}
      </>
    )}
  </>;
}

function DashboardView({ data, user }) {
  const employee = data.role === "employee";
  const counts = data.counts ?? {};
  const trend = data.trend ?? [];
  const announcements = data.announcements ?? [];
  const attendanceData = [
    { name: "Present", value: counts.present ?? 0 }, { name: "Late", value: counts.late ?? 0 },
    { name: "Half day", value: counts.halfDay ?? 0 }, { name: "Leave", value: counts.leave ?? 0 },
  ];
  return <>
    <div className="range-strip"><span>Reporting period</span><strong>{data.range?.from} — {data.range?.to}</strong><span className="range-days">{data.range?.workingDays ?? 0} working days</span></div>
    <div className="stat-grid">
      {employee ? <>
        <Stat label="Attendance rate" value={`${data.attendanceRate ?? 0}%`} foot="For selected period" />
        <Stat label="Hours this week" value={`${data.hoursThisWeek ?? 0}h`} foot={`of ${data.weeklyTargetHours ?? 40}h target`} tone="amber" />
        <Stat label="Late this month" value={data.lateThisMonth ?? 0} foot="Recorded late arrivals" tone="coral" />
        <Stat label="Pending requests" value={data.pendingRequests ?? 0} foot="Awaiting review" tone="blue" />
      </> : <>
        <Stat label="Active people" value={data.headcount ?? 0} foot="Across visible organization" />
        <Stat label="Attendance rate" value={`${data.attendanceRate ?? 0}%`} foot="Present, late and half-day weighted" tone="blue" />
        <Stat label="Late rate" value={`${data.lateRate ?? 0}%`} foot={`${counts.late ?? 0} late records`} tone="amber" />
        <Stat label="Pending approvals" value={data.pendingLeaves ?? 0} foot="Leave requests" tone="coral" />
      </>}
    </div>
    <div className="dashboard-grid">
      <Panel title="Attendance trend" className="chart-panel"><div className="chart-area"><ResponsiveContainer width="100%" height="100%"><AreaChart data={trend}><defs><linearGradient id="attendanceFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#197b68" stopOpacity={0.25} /><stop offset="95%" stopColor="#197b68" stopOpacity={0} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7ebe8" /><XAxis dataKey="date" tickFormatter={(v) => v.slice(5)} tickLine={false} axisLine={false} /><YAxis domain={[0, 100]} tickLine={false} axisLine={false} /><Tooltip /><Area type="monotone" dataKey="rate" stroke="#197b68" strokeWidth={2.5} fill="url(#attendanceFill)" /></AreaChart></ResponsiveContainer></div></Panel>
      <Panel title="Attendance mix" className="chart-panel"><div className="chart-area chart-donut"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={attendanceData} dataKey="value" nameKey="name" innerRadius={62} outerRadius={92} paddingAngle={3}>{attendanceData.map((entry, index) => <Cell key={entry.name} fill={COLORS[index]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer><div className="donut-center"><strong>{data.attendanceRate ?? 0}%</strong><span>attendance</span></div></div><div className="legend-row">{attendanceData.map((item, i) => <span key={item.name}><i style={{ background: COLORS[i] }} />{item.name}</span>)}</div></Panel>
      {!employee && <Panel title="Department headcount" className="chart-panel"><div className="chart-area"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.departments ?? []} layout="vertical" margin={{ left: 8 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e7ebe8" /><XAxis type="number" hide /><YAxis type="category" dataKey="name" width={100} tickLine={false} axisLine={false} /><Tooltip /><Bar dataKey="count" fill="#d88a35" radius={[0, 4, 4, 0]} barSize={16} /></BarChart></ResponsiveContainer></div></Panel>}
      {!employee && <Panel title="Frequent late arrivals" className="late-panel"><Table rows={data.topLateComers ?? []} columns={[["fullName", "Employee"], ["email", "Email"], ["count", "Late days"]]} empty="No late arrivals in this period." /></Panel>}
      {employee && <Panel title="Your leave balances" className="leave-balance-panel"><div className="balance-list">{(data.leave?.balances ?? []).map((balance) => <div className="balance-row" key={balance.leaveTypeId}><div><strong>{balance.name}</strong><small>{balance.used} used · {balance.pending} pending</small></div><b>{balance.remaining}<small> / {balance.annualDays} days</small></b></div>)}</div></Panel>}
      <Panel title="Latest announcements" className="announcements-panel">{announcements.length ? <div className="announcement-list">{announcements.map((item) => <article key={item.id}><div className="announcement-date">{item.pinned ? "PINNED" : new Date(item.createdAt).toLocaleDateString()}</div><h3>{item.title}</h3><p>{item.body}</p></article>)}</div> : <EmptyState text="No announcements yet." />}</Panel>
      {user?.role === "admin" && data.payroll && <Panel title={`Payroll · ${data.payroll.month}`} className="payroll-summary"><div className="payroll-total">{data.payroll.totalNet?.toLocaleString()}<small> net pay · {data.payroll.employeeCount} employees</small></div></Panel>}
    </div>
  </>;
}

function OrganizationView({ data, user, apiRequest, draft, setDraft, runAction, busy }) {
  const isAdmin = user?.role === "admin";
  return <div className="two-column-layout"><Panel title="Company policy"><div className="form-grid"><label>Company name<input className={inputClass} value={draft.companyName ?? ""} disabled={!isAdmin} onChange={(e) => setDraft({ ...draft, companyName: e.target.value })} /></label><label>Office starts<input className={inputClass} type="time" value={draft.officeStart ?? "09:00"} disabled={!isAdmin} onChange={(e) => setDraft({ ...draft, officeStart: e.target.value })} /></label><label>Office ends<input className={inputClass} type="time" value={draft.officeEnd ?? "17:00"} disabled={!isAdmin} onChange={(e) => setDraft({ ...draft, officeEnd: e.target.value })} /></label><label>Grace period (minutes)<input className={inputClass} type="number" value={draft.graceMinutes ?? 15} disabled={!isAdmin} onChange={(e) => setDraft({ ...draft, graceMinutes: Number(e.target.value) })} /></label><label>Half-day threshold (hours)<input className={inputClass} type="number" value={draft.halfDayHours ?? 6} disabled={!isAdmin} onChange={(e) => setDraft({ ...draft, halfDayHours: Number(e.target.value) })} /></label><label>Currency<input className={inputClass} value={draft.currency ?? "PKR"} disabled={!isAdmin} onChange={(e) => setDraft({ ...draft, currency: e.target.value })} /></label><label>HRA (% of basic)<input className={inputClass} type="number" value={draft.hraPct ?? 40} disabled={!isAdmin} onChange={(e) => setDraft({ ...draft, hraPct: Number(e.target.value) })} /></label><label>Medical (% of basic)<input className={inputClass} type="number" value={draft.medicalPct ?? 10} disabled={!isAdmin} onChange={(e) => setDraft({ ...draft, medicalPct: Number(e.target.value) })} /></label><label>Late deduction (%)<input className={inputClass} type="number" step="0.1" value={draft.latePolicy?.deductionPerLatePct ?? 1.6} disabled={!isAdmin} onChange={(e) => setDraft({ ...draft, latePolicy: { ...draft.latePolicy, deductionPerLatePct: Number(e.target.value) } })} /></label><label>Lates equal one absence<input className={inputClass} type="number" value={draft.latePolicy?.latesEqualToAbsent ?? 3} disabled={!isAdmin} onChange={(e) => setDraft({ ...draft, latePolicy: { ...draft.latePolicy, latesEqualToAbsent: Number(e.target.value) } })} /></label><label className="toggle-row">Enable office geofence<input type="checkbox" checked={draft.geofence?.enabled ?? false} disabled={!isAdmin} onChange={(e) => setDraft({ ...draft, geofence: { ...draft.geofence, enabled: e.target.checked } })} /></label>{draft.geofence?.enabled && <><label>Office latitude<input className={inputClass} type="number" step="any" value={draft.geofence?.lat ?? ""} disabled={!isAdmin} onChange={(e) => setDraft({ ...draft, geofence: { ...draft.geofence, lat: Number(e.target.value) } })} /></label><label>Office longitude<input className={inputClass} type="number" step="any" value={draft.geofence?.lng ?? ""} disabled={!isAdmin} onChange={(e) => setDraft({ ...draft, geofence: { ...draft.geofence, lng: Number(e.target.value) } })} /></label><label>Radius (meters)<input className={inputClass} type="number" value={draft.geofence?.radiusMeters ?? 500} disabled={!isAdmin} onChange={(e) => setDraft({ ...draft, geofence: { ...draft.geofence, radiusMeters: Number(e.target.value) } })} /></label></>}</div>{isAdmin && <Button disabled={busy} onClick={() => runAction(() => apiRequest("/org", { method: "PUT", body: draft }), "Organization settings saved.")}>Save organization</Button>}</Panel><div className="stacked-panels"><CatalogEditor title="Departments" path="departments" items={data.departments} fields={[{ key: "name", label: "Name" }, { key: "description", label: "Description" }]} isAdmin={isAdmin} apiRequest={apiRequest} runAction={runAction} busy={busy} /><CatalogEditor title="Designations" path="designations" items={data.designations} fields={[{ key: "name", label: "Name" }, { key: "description", label: "Description" }]} isAdmin={isAdmin} apiRequest={apiRequest} runAction={runAction} busy={busy} /><CatalogEditor title="Leave types" path="leave-types" items={data.leaveTypes} fields={[{ key: "name", label: "Name" }, { key: "annualDays", label: "Annual days", type: "number" }, { key: "paid", label: "Paid", type: "checkbox" }]} isAdmin={isAdmin} apiRequest={apiRequest} runAction={runAction} busy={busy} /><CatalogEditor title="Holidays" path="holidays" items={data.holidays} fields={[{ key: "name", label: "Name" }, { key: "date", label: "Date", type: "date" }, { key: "recurring", label: "Recurring", type: "checkbox" }]} isAdmin={isAdmin} apiRequest={apiRequest} runAction={runAction} busy={busy} /></div></div>;
}

function CatalogEditor({ title, path, items = [], fields, isAdmin, apiRequest, runAction, busy }) {
  const [values, setValues] = useState({});
  return <Panel title={title}><Table rows={items} columns={fields.map(({ key, label }) => [key, label])} />{isAdmin && <form className="catalog-form" onSubmit={(event) => { event.preventDefault(); runAction(async () => { await apiRequest(`/${path}`, { method: "POST", body: values }); setValues({}); }, `${title.slice(0, -1)} created.`); }}><div className="catalog-fields">{fields.map((field) => <label key={field.key}>{field.type === "checkbox" ? <><input type="checkbox" checked={values[field.key] ?? false} onChange={(e) => setValues({ ...values, [field.key]: e.target.checked })} />{field.label}</> : <><span className="sr-only">{field.label}</span><input className={inputClass} aria-label={field.label} type={field.type ?? "text"} required={field.key === "name" || field.key === "date"} placeholder={field.label} value={values[field.key] ?? ""} onChange={(e) => setValues({ ...values, [field.key]: field.type === "number" ? Number(e.target.value) : e.target.value })} /></>}</label>)}</div><Button disabled={busy}>Add</Button></form>}</Panel>;
}

function EmployeesView({ data, user, apiRequest, apiDownload, runAction, busy, csvText, setCsvText }) {
  const [profile, setProfile] = useState(null);
  const [createDraft, setCreateDraft] = useState({ email: "", password: "", fullName: "", phone: "", employeeCode: "", role: "employee" });
  const isAdmin = user?.role === "admin";
  async function openProfile(id) {
    try { setProfile((await apiRequest(`/users/${id}`)).user); } catch (error) { runAction(() => Promise.reject(error)); }
  }
  return <><Panel title="Directory" action={<div className="button-row"><Button variant="quiet" onClick={() => runAction(() => apiDownload("/users/csv/export", "employees.csv"), "Export downloaded.")}>Export CSV</Button><Button variant="quiet" onClick={() => runAction(() => apiDownload("/users/csv/template", "employees-template.csv"), "Template downloaded.")}>Template</Button></div>}><div className="table-wrap"><table className="data-table"><thead><tr>{["Name", "Email", "Employee ID", "Phone", "Role", "Status", "Profile"].map((label) => <th key={label}>{label}</th>)}</tr></thead><tbody>{(data.users ?? []).map((record) => <tr key={record.id}><td>{record.fullName || "—"}</td><td>{record.email}</td><td>{record.employeeCode || "—"}</td><td>{record.phone || "—"}</td><td>{record.role}</td><td>{record.employmentStatus}</td><td><Button variant="quiet" onClick={() => openProfile(record.id)}>View</Button></td></tr>)}</tbody></table></div>{!data.users?.length && <EmptyState text="No employees found." />}</Panel>{profile && <Panel title={`Employee profile · ${profile.fullName || profile.email}`} action={<Button variant="quiet" onClick={() => setProfile(null)}>Close</Button>}><div className="profile-grid"><div><span>Email</span><strong>{profile.email}</strong></div><div><span>Employee ID</span><strong>{profile.employeeCode || "—"}</strong></div><div><span>Phone</span><strong>{profile.phone || "—"}</strong></div><div><span>Address</span><strong>{profile.address || "—"}</strong></div><div><span>Employment</span><strong>{profile.employmentStatus}</strong></div><div><span>Salary</span><strong>{profile.salary ? `${profile.salary.basic} + ${profile.salary.allowance} ${profile.salary.currency}` : "Restricted"}</strong></div></div><h3 className="subheading">Attendance summary</h3><div className="metric-strip">{Object.entries(profile.attendanceSummary ?? {}).filter(([key, value]) => key.endsWith("Days") || key.endsWith("Minutes")).map(([key, value]) => <div key={key}><span>{key.replace(/([A-Z])/g, " $1")}</span><strong>{value}</strong></div>)}</div><h3 className="subheading">Leave balances</h3><div className="balance-list">{(profile.leaveBalances ?? []).map((b) => <div className="balance-row" key={b.leaveTypeId}><strong>{b.name}</strong><b>{b.remaining}<small> / {b.annualDays} remaining</small></b></div>)}</div></Panel>}{user?.role !== "employee" && <Panel title="Create employee account"><form className="form-grid" onSubmit={(event) => { event.preventDefault(); runAction(async () => { await apiRequest("/users", { method: "POST", body: createDraft }); setCreateDraft({ email: "", password: "", fullName: "", phone: "", employeeCode: "", role: "employee" }); }, "Employee account created."); }}><label>Full name<input className={inputClass} required value={createDraft.fullName} onChange={(e) => setCreateDraft({ ...createDraft, fullName: e.target.value })} /></label><label>Work email<input className={inputClass} required type="email" value={createDraft.email} onChange={(e) => setCreateDraft({ ...createDraft, email: e.target.value })} /></label><label>Temporary password<input className={inputClass} required type="password" minLength={8} value={createDraft.password} onChange={(e) => setCreateDraft({ ...createDraft, password: e.target.value })} /></label><label>Phone<input className={inputClass} value={createDraft.phone} onChange={(e) => setCreateDraft({ ...createDraft, phone: e.target.value })} /></label><label>Employee ID<input className={inputClass} value={createDraft.employeeCode} onChange={(e) => setCreateDraft({ ...createDraft, employeeCode: e.target.value })} /></label>{isAdmin && <label>Role<select className={inputClass} value={createDraft.role} onChange={(e) => setCreateDraft({ ...createDraft, role: e.target.value })}><option value="employee">Employee</option><option value="hr">HR</option><option value="admin">Admin</option></select></label>}<Button disabled={busy}>Create account</Button></form></Panel>}<Panel title="CSV import"><p className="panel-copy">Paste CSV contents to validate or import employee records.</p><textarea className={`${inputClass} csv-area`} value={csvText} onChange={(e) => setCsvText(e.target.value)} placeholder="email,fullName,phone,..." /><div className="button-row"><Button disabled={busy || !csvText.trim()} onClick={() => runAction(async () => { const result = await apiRequest("/users/csv/import", { method: "POST", body: { csv: csvText, dryRun: true } }); if (result.skipped) throw new Error(`${result.skipped} row(s) need attention: ${result.rows.filter((row) => !row.ok).map((row) => `row ${row.row}: ${row.errors.map((item) => item.reason).join(", ")}`).join("; ")}`); }, "CSV validation passed. No records were written.")}>Validate only</Button><Button variant="danger" disabled={busy || !csvText.trim()} onClick={() => { if (confirm("Import these employees now?")) runAction(() => apiRequest("/users/csv/import", { method: "POST", body: { csv: csvText, dryRun: false } }), "Import completed."); }}>Import records</Button></div></Panel></>;
}

function AttendanceView({ data, user, apiRequest, runAction, busy }) {
  const employee = user?.role === "employee";
  const today = new Date().toISOString().slice(0, 10);
  return <><div className="stat-grid attendance-actions"><Stat label="Today" value={today} foot="Local work date" /><Stat label="Your access" value={employee ? "Personal" : "Organization"} foot={employee ? "Your records only" : "Visible employee records"} tone="blue" />{employee && <div className="action-tile"><Button disabled={busy} onClick={() => runAction(() => apiRequest("/attendance/check-in", { method: "POST", body: {} }), "Checked in.")}>Check in</Button><Button variant="quiet" disabled={busy} onClick={() => runAction(() => apiRequest("/attendance/check-out", { method: "POST", body: {} }), "Checked out.")}>Check out</Button></div>}</div>{data.board && <Panel title={`Daily board · ${data.board.date}`}><Table rows={data.board.rows.map((r) => ({ ...r.user, status: r.record?.status ?? "Not checked in", checkIn: r.record?.checkInAt ? new Date(r.record.checkInAt).toLocaleTimeString() : "—", worked: r.record?.workedMinutes ?? 0 }))} columns={[["fullName", "Employee"], ["email", "Email"], ["departmentName", "Department"], ["status", "Status"], ["checkIn", "Check-in"], ["worked", "Worked minutes"]]} empty="No employees for this date." /></Panel>}<Panel title="Attendance records"><Table rows={data.records} columns={[["date", "Date"], ["fullName", "Employee"], ["status", "Status"], ["minutesLate", "Late minutes"], ["workedMinutes", "Worked minutes"], ["checkInAt", "Check-in"], ["checkOutAt", "Check-out"]]} empty="No attendance records found." /></Panel></>;
}

function LeaveView({ data, user, apiRequest, runAction, busy, draft, setDraft }) {
  const privileged = user?.role === "admin" || user?.role === "hr";
  return <><div className="two-column-layout"><Panel title="Balances"><div className="balance-list">{(data.balances ?? []).map((b) => <div className="balance-row" key={b.leaveTypeId}><div><strong>{b.name}</strong><small>{b.used} used · {b.pending} pending</small></div><b>{b.remaining}<small> / {b.annualDays} days</small></b></div>)}</div></Panel><Panel title="Request leave"><form className="form-grid" onSubmit={(e) => { e.preventDefault(); runAction(async () => { await apiRequest("/leave", { method: "POST", body: draft }); setDraft({ leaveTypeId: "", fromDate: "", toDate: "", reason: "" }); }, "Leave request submitted."); }}><label>Leave type<select className={inputClass} required value={draft.leaveTypeId} onChange={(e) => setDraft({ ...draft, leaveTypeId: e.target.value })}><option value="">Choose type</option>{data.types?.map((t) => <option key={t.id} value={t.id}>{t.name} {t.paid ? "(paid)" : "(unpaid)"}</option>)}</select></label><label>From<input className={inputClass} required type="date" value={draft.fromDate} onChange={(e) => setDraft({ ...draft, fromDate: e.target.value })} /></label><label>To<input className={inputClass} required type="date" value={draft.toDate} onChange={(e) => setDraft({ ...draft, toDate: e.target.value })} /></label><label className="full-width">Reason<textarea className={inputClass} value={draft.reason} onChange={(e) => setDraft({ ...draft, reason: e.target.value })} /></label><Button disabled={busy}>Submit request</Button></form></Panel></div><Panel title="Requests"><div className="table-wrap"><table className="data-table"><thead><tr><th>Employee</th><th>Leave</th><th>Dates</th><th>Days</th><th>Status</th><th>Reason</th><th>Actions</th></tr></thead><tbody>{(data.applications ?? []).map((app) => <tr key={app.id}><td>{app.fullName || app.email}</td><td>{app.leaveTypeName}</td><td>{app.fromDate} – {app.toDate}</td><td>{app.days}</td><td><span className={`status-pill status-${app.status}`}>{app.status}</span></td><td>{app.reason}</td><td>{privileged && app.status === "pending" ? <div className="button-row"><Button variant="quiet" disabled={busy} onClick={() => runAction(() => apiRequest(`/leave/${app.id}/review`, { method: "PATCH", body: { decision: "approved" } }), "Request approved.")}>Approve</Button><Button variant="danger" disabled={busy} onClick={() => runAction(() => apiRequest(`/leave/${app.id}/review`, { method: "PATCH", body: { decision: "rejected" } }), "Request rejected.")}>Reject</Button></div> : !privileged && app.status === "pending" ? <Button variant="quiet" disabled={busy} onClick={() => runAction(() => apiRequest(`/leave/${app.id}/cancel`, { method: "PATCH", body: {} }), "Request cancelled.")}>Cancel</Button> : "—"}</td></tr>)}</tbody></table></div>{!data.applications?.length && <EmptyState text="No leave requests found." />}</Panel></>;
}

function PayrollView({ data, user, apiRequest, apiDownload, runAction, busy, month, setMonth }) {
  const employee = user?.role === "employee";
  if (employee) return <Panel title="Published payslips"><div className="payslip-list">{(data.payslips ?? []).map((item) => <article key={item.runId}><div><strong>{item.month}</strong><span className="status-pill status-finalized">Published</span></div><Button variant="quiet" onClick={() => apiDownload(`/payroll/runs/${item.runId}/payslips/${user.id}.pdf`, `payslip-${item.month}.pdf`)}>Download PDF</Button></article>)}</div>{!data.payslips?.length && <EmptyState text="No published payslips are available." />}</Panel>;
  const privileged = user?.role === "admin" || user?.role === "hr";
  return <><Panel title="Payroll runs" action={privileged && <form className="button-row" onSubmit={(e) => { e.preventDefault(); runAction(() => apiRequest("/payroll/runs", { method: "POST", body: { month } }), "Draft run prepared."); }}><input className={inputClass} type="month" value={month} onChange={(e) => setMonth(e.target.value)} /><Button disabled={busy}>Prepare draft</Button></form>}><Table rows={data.runs} columns={[["month", "Month"], ["status", "Status"], ["workingDays", "Working days"], ["employeeCount", "Employees"], ["summary", "Summary"]]} empty="No payroll runs yet." /></Panel>{(data.runs ?? []).map((run) => <Panel key={run.id} title={`${run.month} · ${run.status}`} action={run.status === "draft" && user?.role === "admin" && <Button disabled={busy} onClick={() => { if (confirm(`Finalize payroll for ${run.month}? This locks the run.`)) runAction(() => apiRequest(`/payroll/runs/${run.id}/finalize`, { method: "POST", body: {} }), "Payroll finalized."); }}>Finalize</Button>}><Button variant="quiet" onClick={() => runAction(() => apiRequest(`/payroll/runs/${run.id}`), "Payroll details fetched.")}>Load details</Button><p className="panel-copy">Draft values are calculated from attendance, leave, salary settings and tax policy. Amounts are only visible to administrators.</p></Panel>)}</>;
}

function AnnouncementsView({ data, user, apiRequest, runAction, busy, draft, setDraft }) {
  const canPost = user?.role === "admin" || user?.role === "hr";
  return <>{canPost && <Panel title="New announcement"><form className="form-grid" onSubmit={(e) => { e.preventDefault(); runAction(async () => { await apiRequest("/announcements", { method: "POST", body: draft }); setDraft({ title: "", body: "", audience: { type: "all" } }); }, "Announcement published."); }}><label>Title<input className={inputClass} required maxLength={150} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label><label>Audience<select className={inputClass} value={draft.audience.type} onChange={(e) => setDraft({ ...draft, audience: { type: e.target.value } })}><option value="all">Everyone</option><option value="role">Role-specific</option></select></label>{draft.audience.type === "role" && <label>Role<select className={inputClass} value={draft.audience.role ?? "employee"} onChange={(e) => setDraft({ ...draft, audience: { ...draft.audience, role: e.target.value } })}><option value="employee">Employee</option><option value="hr">HR</option><option value="admin">Admin</option></select></label>}<label className="full-width">Message<textarea className={inputClass} required maxLength={4000} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} /></label><Button disabled={busy}>Publish announcement</Button></form></Panel>}<Panel title="Recent announcements"><div className="announcement-list announcement-feed">{(data.announcements ?? []).map((item) => <article key={item.id}><div className="announcement-date">{item.pinned ? "PINNED" : new Date(item.createdAt).toLocaleDateString()} · {item.audience.type}</div><h3>{item.title}</h3><p>{item.body}</p></article>)}</div>{!data.announcements?.length && <EmptyState text="No announcements have been posted." />}</Panel></>;
}

function AuditView({ data }) {
  const valid = data.verification?.valid;
  return <><div className={`verification-banner ${valid ? "verified" : "broken"}`}><span>{valid ? "✓" : "!"}</span><div><strong>{valid ? "Hash chain verified" : "Hash chain verification failed"}</strong><small>{data.verification?.checked ?? 0} entries checked{data.verification?.brokenAt ? ` · broken at sequence ${data.verification.brokenAt}` : ""}</small></div></div><Panel title="Administrative events"><Table rows={data.entries?.map((item) => ({ ...item, actor: `${item.actor?.role ?? "system"} · ${item.actor?.id ?? "—"}`, meta: typeof item.meta === "string" ? item.meta : JSON.stringify(item.meta) }))} columns={[["seq", "#"], ["at", "Time"], ["actor", "Actor"], ["action", "Action"], ["entity", "Entity"], ["entityId", "Record"], ["meta", "Details"], ["hash", "SHA-256"]]} empty="No audit entries found." /></Panel></>;
}

function AssistantView({ data, user, chat, message, setMessage, sendMessage, busy, apiRequest, runAction }) {
  const [draftReason, setDraftReason] = useState("");
  return <div className="assistant-layout"><section className="assistant-thread" aria-label="AI conversation">{chat.length === 0 && <div className="assistant-welcome"><span className="assistant-spark">✳</span><h2>What would you like to know?</h2><p>Ask about attendance, leave balances, company policy, or your team's directory.</p><div className="suggestion-row">{["How does late arrival work?", "Summarize my leave balance", "Who has been late most often?"] .map((question) => <button key={question} onClick={() => setMessage(question)}>{question}</button>)}</div></div>}{chat.map((item, i) => <article className={`chat-message chat-${item.role}`} key={`${item.role}-${i}`}><div className="chat-avatar">{item.role === "user" ? user?.email?.slice(0, 1).toUpperCase() : "✳"}</div><div className="chat-bubble">{item.role === "assistant" && <span className="ai-label">AI-generated</span>}<p>{item.content}</p>{item.draft && <div className="draft-card"><strong>Leave request draft</strong><dl><dt>Type</dt><dd>{item.draft.type}</dd><dt>Dates</dt><dd>{item.draft.start} – {item.draft.end}</dd><dt>Working days</dt><dd>{item.draft.days}</dd></dl><label>Reason<input className={inputClass} value={draftReason || item.draft.reason} onChange={(e) => setDraftReason(e.target.value)} /></label><Button disabled={busy} onClick={() => runAction(() => apiRequest("/leave", { method: "POST", body: { leaveTypeId: item.draft.leaveTypeId, fromDate: item.draft.start, toDate: item.draft.end, reason: draftReason || item.draft.reason } }), "Leave request submitted.")}>Confirm and submit</Button></div>}</div></article>)}{busy && <div className="chat-pending"><span className="loading-mark" />Thinking…</div>}</section><form className="chat-composer" onSubmit={sendMessage}><textarea className={inputClass} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Ask a question about your workplace…" rows={2} maxLength={2000} /><div><span>{data.enabled ? `Connected · ${data.model}` : "AI assistant is not configured"}</span><Button disabled={busy || !data.enabled || !message.trim()}>Send ↗</Button></div></form><p className="assistant-disclaimer">AI-generated responses can be inaccurate. Verify important decisions against official records.</p></div>;
}
