"use client";

import { useState } from "react";
import { apiRequest } from "../lib/api";

export default function AuthForm({ onAuthenticated, mode: externalMode, setMode: setExternalMode }) {
  const [localMode, setLocalMode] = useState("login");
  const mode = externalMode ?? localMode;
  const setMode = setExternalMode ?? setLocalMode;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const isLogin = mode === "login";

  function switchMode(nextMode) {
    setMode(nextMode);
    setMessage(null);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      if (isLogin) {
        const data = await apiRequest("/auth/login", { method: "POST", body: { email, password }, token: "" });
        onAuthenticated(data);
        return;
      }
      const data = await apiRequest("/auth/signup", { method: "POST", body: { email, password }, token: "" });
      setMessage({ type: "success", text: data.message });
      setMode("login");
      setPassword("");
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setLoading(false);
    }
  }

  return <section className="auth-form-panel">
    <div className="auth-form-heading"><span className="eyebrow">HCM LITE / ACCESS</span><h2>{isLogin ? "Sign in" : "Create account"}</h2><p>{isLogin ? "Use your work email to continue." : "New accounts start with employee access."}</p></div>
    <div className="auth-tabs" role="tablist" aria-label="Account access"><button type="button" role="tab" aria-selected={isLogin} onClick={() => switchMode("login")}>Sign in</button><button type="button" role="tab" aria-selected={!isLogin} onClick={() => switchMode("signup")}>Create account</button></div>
    <form onSubmit={handleSubmit} className="auth-fields">
      <label htmlFor="email">Work email<input id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" /></label>
      <label htmlFor="password">Password<input id="password" type="password" autoComplete={isLogin ? "current-password" : "new-password"} required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={isLogin ? "Your password" : "At least 8 characters"} /></label>
      <button type="submit" disabled={loading} className="button button-primary auth-submit">{loading ? "Please wait…" : isLogin ? "Continue to workspace" : "Create account"}<span>↗</span></button>
    </form>
    {message && <div role="alert" className={`notice ${message.type === "success" ? "notice-success" : "notice-error"}`}>{message.text}</div>}
    <p className="auth-security"><span className="security-mark">✓</span> Your access is protected by role-based permissions.</p>
  </section>;
}
