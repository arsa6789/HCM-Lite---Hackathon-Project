"use client";

import { useState } from "react";
import { supabase, supabaseConfigured } from "../lib/supabase";

function authErrorMessage(error) {
  const code = error?.code ?? "";
  if (code === "invalid_credentials" || code === "user_not_found") return "Please check your email address and password.";
  if (code === "email_not_confirmed") return "Please confirm your email address before signing in.";
  if (["email_exists", "user_already_exists"].includes(code)) return "That email address is already registered.";
  if (code === "weak_password") return "Choose a stronger password with at least 8 characters.";
  if (error?.message?.includes("Supabase is not configured")) return error.message;
  if (error?.status === 0 || error?.name === "AuthRetryableFetchError") return "The sign-in service is unavailable. Please try again shortly.";
  return "Sign-in could not be completed. Please check your details and try again.";
}

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
      if (!supabaseConfigured || !supabase) {
        throw new Error("Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local.");
      }
      if (isLogin) {
        const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        onAuthenticated({ user: { id: data.user.id, email: data.user.email, role: "employee" } });
        return;
      }
      const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
      if (error) throw error;
      if (!data.session) {
        setMessage({ type: "success", text: "Account created. Check your email to confirm it, then sign in." });
        setMode("login");
        setPassword("");
        return;
      }
      onAuthenticated({ user: { id: data.user.id, email: data.user.email, role: "employee" } });
      setMessage({ type: "success", text: "Account created. Your workspace is ready." });
      setMode("login");
      setPassword("");
    } catch (error) {
      setMessage({ type: "error", text: authErrorMessage(error) });
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
