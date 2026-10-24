"use client";

import { useState } from "react";
require('dotenv').config();

export default function Home() {
  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null); // { type: "success" | "error", text }
  const [token, setToken] = useState("");

  const isLogin = mode === "login";

  function switchMode(newMode) {
    setMode(newMode);
    setMessage(null);
    setToken("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    setToken("");

    try {
      const res = await fetch(`/api/${isLogin ? "login" : "signup"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: "error", text: data.error || "Something went wrong." });
        return;
      }

      setMessage({ type: "success", text: data.message });

      if (isLogin && data.token) {
        setToken(data.token);
      }

      if (!isLogin) {
        // After signup, send them to the login form
        setPassword("");
        setMode("login");
      }
    } catch (err) {
      setMessage({
        type: "error",
        text: "Network error. Check your connection and try again.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur-md">
        <div className="mb-6 text-center">
          <h1 className="text-3xl font-bold text-white">
            {isLogin ? "Welcome back" : "Create your account"}
          </h1>
          <p className="mt-2 text-sm text-slate-300">
            {isLogin
              ? "Log in to continue to your dashboard."
              : "Sign up in seconds and start building."}
          </p>
        </div>

        {/* Toggle */}
        <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl bg-slate-900/60 p-1">
          <button
            type="button"
            onClick={() => switchMode("login")}
            className={`rounded-lg py-2 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
              isLogin
                ? "bg-indigo-500 text-white shadow"
                : "text-slate-300 hover:text-white"
            }`}
          >
            Login
          </button>
          <button
            type="button"
            onClick={() => switchMode("signup")}
            className={`rounded-lg py-2 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
              !isLogin
                ? "bg-indigo-500 text-white shadow"
                : "text-slate-300 hover:text-white"
            }`}
          >
            Sign Up
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label
              htmlFor="email"
              className="mb-1 block text-sm font-medium text-slate-200"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-lg border border-white/10 bg-slate-900/60 px-4 py-2.5 text-white placeholder-slate-500 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/40"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1 block text-sm font-medium text-slate-200"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete={isLogin ? "current-password" : "new-password"}
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              className="w-full rounded-lg border border-white/10 bg-slate-900/60 px-4 py-2.5 text-white placeholder-slate-500 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/40"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-indigo-500 py-2.5 font-semibold text-white transition hover:bg-indigo-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Please wait..." : isLogin ? "Log In" : "Create Account"}
          </button>
        </form>

        {/* Messages */}
        {message && (
          <div
            role="alert"
            className={`mt-5 rounded-lg border px-4 py-3 text-sm ${
              message.type === "success"
                ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300"
                : "border-red-400/30 bg-red-500/10 text-red-300"
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Token display */}
        {token && (
          <div className="mt-4">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
              Your JWT token
            </p>
            <textarea
              readOnly
              value={token}
              rows={4}
              onFocus={(e) => e.target.select()}
              className="w-full resize-none rounded-lg border border-white/10 bg-slate-900/80 p-3 font-mono text-xs text-indigo-200 outline-none"
            />
            <p className="mt-1 text-xs text-slate-400">
              The same token is also stored in a secure httpOnly cookie.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
