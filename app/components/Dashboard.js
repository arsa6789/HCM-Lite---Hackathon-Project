"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "../lib/api";

const SCOPE_LABELS = {
  all: "All accounts",
  employees: "Employee accounts",
  self: "Own account",
};

const ROLE_LABELS = {
  admin: "Admin",
  hr: "HR",
  employee: "Employee",
};

const CAPABILITIES = {
  admin: [
    "Create accounts for any role",
    "Change emails, passwords and roles",
    "Read and delete any account except self",
  ],
  hr: [
    "Create employee accounts",
    "Read every employee account",
    "Update employee emails",
  ],
  employee: [
    "Read your own account",
    "Change your own password",
  ],
};

export default function Dashboard({ session, onLogout }) {
  const { user, scope } = session;
  const [records, setRecords] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError("");

      try {
        if (user.role === "employee") {
          const data = await apiRequest(`/users/${user.id}`);
          if (active) {
            setRecords([data.user]);
          }
        } else {
          const data = await apiRequest("/users?limit=100");
          if (active) {
            setRecords(data.users);
          }
        }
      } catch (requestError) {
        if (active) {
          setError(requestError.message);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      active = false;
    };
  }, [user.id, user.role]);

  return (
    <div className="w-full max-w-4xl space-y-6">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-md">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-indigo-300">
              Signed in
            </p>
            <h1 className="mt-1 text-2xl font-bold text-white">{user.email}</h1>
            <p className="text-sm text-slate-300">
              Role: <span className="font-medium text-white">{ROLE_LABELS[user.role] ?? user.role}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="rounded-lg border border-white/15 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-white/30 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
          >
            Log Out
          </button>
        </div>

        <dl className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl bg-slate-900/60 p-4">
            <dt className="text-xs uppercase tracking-wide text-slate-400">Role</dt>
            <dd className="mt-1 text-lg font-semibold text-white">
              {ROLE_LABELS[user.role] ?? user.role}
            </dd>
          </div>
          <div className="rounded-xl bg-slate-900/60 p-4">
            <dt className="text-xs uppercase tracking-wide text-slate-400">Data scope</dt>
            <dd className="mt-1 text-lg font-semibold text-white">
              {SCOPE_LABELS[scope?.type] ?? "Unknown"}
            </dd>
          </div>
          <div className="rounded-xl bg-slate-900/60 p-4">
            <dt className="text-xs uppercase tracking-wide text-slate-400">Account ID</dt>
            <dd className="mt-1 truncate font-mono text-xs text-slate-300" title={user.id}>
              {user.id}
            </dd>
          </div>
        </dl>

        <ul className="mt-6 space-y-2 text-sm text-slate-300">
          {(CAPABILITIES[user.role] ?? []).map((item) => (
            <li key={item} className="flex gap-2">
              <span className="text-indigo-400">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-white">Visible accounts</h2>
          <span className="rounded-full bg-indigo-500/15 px-3 py-1 text-xs font-medium text-indigo-200">
            {loading ? "Loading..." : `${records.length} account${records.length === 1 ? "" : "s"}`}
          </span>
        </div>

        {error && (
          <p className="mt-4 rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </p>
        )}

        {!error && !loading && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="py-2 pr-4 font-medium">Email</th>
                  <th className="py-2 pr-4 font-medium">Role</th>
                  <th className="py-2 font-medium">ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {records.map((record) => (
                  <tr key={record.id} className="text-slate-200">
                    <td className="py-2.5 pr-4 text-slate-300">{record.email}</td>
                    <td className="py-2.5 pr-4">{ROLE_LABELS[record.role] ?? record.role}</td>
                    <td className="py-2.5 font-mono text-xs text-slate-400">{record.id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && records.length === 0 && !error && (
          <p className="mt-4 text-sm text-slate-400">No accounts match this scope.</p>
        )}
      </div>
    </div>
  );
}
