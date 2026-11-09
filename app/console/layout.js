"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiRequest } from "../lib/api";
import { supabase } from "../lib/supabase";

const NAV_ITEMS = [
  ["dashboard", "Overview", ["admin", "hr", "employee"]],
  ["profile", "My profile", ["admin", "hr", "employee"]],
  ["organization", "Organization", ["admin", "hr"]],
  ["employees", "Employees", ["admin", "hr"]],
  ["attendance", "Attendance", ["admin", "hr", "employee"]],
  ["leave", "Leave", ["admin", "hr", "employee"]],
  ["payroll", "Payroll", ["admin", "hr", "employee"]],
  ["announcements", "Announcements", ["admin", "hr", "employee"]],
  ["audit", "Audit trail", ["admin"]],
  ["assistant", "Assistant", ["admin", "hr", "employee"]],
];

export default function ConsoleLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [busy, setBusy] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifications, setNotifications] = useState(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  useEffect(() => {
    let active = true;
    if (!supabase) {
      setBusy(false);
      router.replace("/login");
      return () => { active = false; };
    }
    async function loadSession(session) {
      if (!session) {
        if (active) setBusy(false);
        if (active) setUser(null);
        router.replace("/login");
        return;
      }
      try {
        const profile = await apiRequest("/auth/me", { accessToken: session.access_token });
        if (!active) return;
        setUser(profile.user);
      } catch (error) {
        console.error("Could not validate the API session:", error);
        router.replace("/login?error=session");
        return;
      }

      try {
        const notificationData = await apiRequest("/notifications?limit=8");
        if (active) setNotifications(notificationData);
      } catch (error) {
        // Notifications are non-essential. A failure here must not sign a
        // valid user out after /auth/me has already succeeded.
        console.warn("Could not load notifications:", error);
        if (active) setNotifications({ notifications: [], unread: 0 });
      } finally {
        if (active) setBusy(false);
      }
    }
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      queueMicrotask(() => { void loadSession(session); });
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, [router]);

  async function logout() {
    try { await supabase?.auth.signOut(); } catch {}
    router.replace("/login");
  }

  async function markNotificationRead(id) {
    try {
      await apiRequest(`/notifications/${id}/read`, { method: "PATCH", body: {} });
      const notificationData = await apiRequest("/notifications?limit=8");
      setNotifications(notificationData);
    } catch {}
  }

  async function markAllNotificationsRead() {
    try {
      await apiRequest("/notifications/read-all", { method: "POST", body: {} });
      const notificationData = await apiRequest("/notifications?limit=8");
      setNotifications(notificationData);
    } catch {}
  }

  if (busy || !user) {
    return <main className="loading-screen"><span className="loading-mark" />Loading your workspace</main>;
  }

  const items = NAV_ITEMS.filter(([, , roles]) => roles.includes(user.role));
  const current = pathname.split("/")[2] || "dashboard";
  const title = NAV_ITEMS.find(([key]) => key === current)?.[1] || "Overview";

  return (
    <div className="console-frame">
      <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}>
        <Link href="/console/dashboard" className="brand-lockup" onClick={() => setMenuOpen(false)}>
          <span className="brand-symbol">H</span><span>HCM <b>lite</b></span>
        </Link>
        <div className="workspace-label">WORKSPACE</div>
        <nav aria-label="Main navigation" className="main-nav">
          {items.map(([key, label]) => (
            <Link key={key} href={`/console/${key}`} aria-current={current === key ? "page" : undefined} className={`nav-link ${current === key ? "nav-active" : ""}`} onClick={() => setMenuOpen(false)}>
              <span className={`nav-glyph glyph-${key}`} aria-hidden="true" />{label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="user-chip"><span className="avatar">{user.email.slice(0, 1).toUpperCase()}</span><span className="user-chip-copy"><strong>{user.email}</strong><small>{user.role === "hr" ? "Human resources" : user.role}</small></span></div>
          <button className="logout-button" onClick={logout}>Sign out <span aria-hidden="true">↗</span></button>
        </div>
      </aside>
      {menuOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
      <div className="main-column">
        <header className="topbar">
          <button className="menu-toggle" type="button" onClick={() => setMenuOpen(!menuOpen)} aria-label={menuOpen ? "Close navigation" : "Open navigation"} aria-expanded={menuOpen}>☰</button>
          <div className="breadcrumbs"><span>Workspace</span><b>/</b><strong>{title}</strong></div>
          <div className="topbar-right"><span className="status-dot" /> API connected <span className="topbar-date">{new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date())}</span><div className="notification-anchor"><button className="notification-toggle" aria-label={`Notifications, ${notifications?.unread ?? 0} unread`} aria-expanded={notificationsOpen} onClick={() => setNotificationsOpen(!notificationsOpen)}>♧{notifications?.unread > 0 && <i>{notifications.unread > 9 ? "9+" : notifications.unread}</i>}</button>{notificationsOpen && <div className="notification-popover"><header><strong>Notifications</strong>{notifications?.unread > 0 && <button onClick={markAllNotificationsRead}>Mark all read</button>}</header>{notifications?.notifications?.length ? notifications.notifications.map((item) => <Link key={item.id} href={item.link?.startsWith("/console") ? item.link : "/console/dashboard"} className={`notification-item ${item.read ? "" : "notification-unread"}`} onClick={() => { void markNotificationRead(item.id); setNotificationsOpen(false); }}><strong>{item.title}</strong><span>{item.body}</span><small>{new Date(item.createdAt).toLocaleString()}</small></Link>) : <p className="notification-empty">You’re all caught up.</p>}</div>}</div></div>
        </header>
        <main className="page-content">{children}</main>
      </div>
    </div>
  );
}
