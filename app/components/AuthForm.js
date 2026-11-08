"use client";

import { useEffect, useState } from "react";
import { supabase, supabaseConfigured } from "../lib/supabase";

function authErrorMessage(error) {
  const code = error?.code ?? "";
  if (code === "invalid_credentials" || code === "user_not_found") return "Please check your email address and password.";
  if (code === "email_not_confirmed") return "Please confirm your email address before signing in.";
  if (["email_exists", "user_already_exists"].includes(code)) return "That email address is already registered.";
  if (code === "weak_password") return "Choose a stronger password with at least 8 characters.";
  if (/redirect.*(?:not allowed|not whitelisted)/i.test(error?.message ?? "")) return "Password recovery is not configured for this site. Add this site's /login URL under Supabase Authentication → URL Configuration.";
  if (error?.message?.includes("Supabase is not configured")) return error.message;
  if (error?.status === 0 || error?.name === "AuthRetryableFetchError") return "The sign-in service is unavailable. Please try again shortly.";
  return "The request could not be completed. Please check your details and try again.";
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
  const isSignup = mode === "signup";
  const isForgot = mode === "forgot";
  const isRecovery = mode === "recovery";

  useEffect(() => {
    const requestedMode = new URLSearchParams(window.location.search).get("mode");
    if (requestedMode === "recovery") setMode("recovery");
    if (!supabase) return undefined;
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setMessage({ type: "success", text: "Choose a new password for your account." });
        setMode("recovery");
      }
    });
    return () => data.subscription.unsubscribe();
  }, [setMode]);

  function switchMode(nextMode) {
    setMode(nextMode);
    setMessage(null);
    setPassword("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      if (!supabaseConfigured || !supabase) {
        throw new Error("Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local.");
      }
      if (isForgot) {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/login?mode=recovery`,
        });
        if (error) throw error;
        setMessage({ type: "success", text: "If an account exists for that email, a password reset link is on its way." });
        return;
      }
      if (isRecovery) {
        const { data, error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        setMessage({ type: "success", text: "Password updated. Opening your workspace…" });
        onAuthenticated({ user: { id: data.user.id, email: data.user.email, role: "employee" } });
        return;
      }
      if (isLogin) {
        const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        onAuthenticated({ user: { id: data.user.id, email: data.user.email, role: "employee" } });
        return;
      }
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: `${window.location.origin}/login` },
      });
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

  const heading = isLogin ? "Sign in" : isSignup ? "Create account" : isForgot ? "Reset your password" : "Choose a new password";
  const description = isLogin
    ? "Use your work email to continue."
    : isSignup
      ? "New accounts start with employee access."
      : isForgot
        ? "We’ll email a secure link if an account matches."
        : "Choose a strong password you have not used before.";

  return <section className="auth-form-panel">
    <div className="auth-form-heading"><span className="eyebrow">HCM LITE / ACCESS</span><h2>{heading}</h2><p>{description}</p></div>
    {(isLogin || isSignup) ? <div className="auth-tabs" role="tablist" aria-label="Account access"><button type="button" role="tab" aria-selected={isLogin} onClick={() => switchMode("login")}>Sign in</button><button type="button" role="tab" aria-selected={isSignup} onClick={() => switchMode("signup")}>Create account</button></div> : <button type="button" className="text-link auth-back-link" onClick={() => switchMode("login")}>← Back to sign in</button>}
    <form onSubmit={handleSubmit} className="auth-fields">
      <label htmlFor="email">Work email<input id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" disabled={isRecovery} /></label>
      {!isForgot && <label htmlFor="password">{isRecovery ? "New password" : "Password"}<input id="password" type="password" autoComplete={isLogin ? "current-password" : "new-password"} required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={isLogin ? "Your password" : "At least 8 characters"} /></label>}
      <button type="submit" disabled={loading} className="button button-primary auth-submit">{loading ? "Please wait…" : isLogin ? "Continue to workspace" : isSignup ? "Create account" : isForgot ? "Send reset link" : "Update password"}<span>↗</span></button>
    </form>
    {isLogin && <button type="button" className="text-link auth-forgot-link" onClick={() => switchMode("forgot")}>Forgot password?</button>}
    {message && <div role={message.type === "error" ? "alert" : "status"} className={`notice ${message.type === "success" ? "notice-success" : "notice-error"}`}>{message.text}</div>}
    <p className="auth-security"><span className="security-mark">✓</span> Your access is protected by role-based permissions.</p>
  </section>;
}
