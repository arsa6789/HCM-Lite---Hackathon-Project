"use client";

import { useState } from "react";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { authPersistenceReady, firebaseAuth, firebaseConfigured } from "../lib/firebase";

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
      if (!firebaseConfigured || !firebaseAuth) {
        throw new Error("Firebase is not configured. Add the NEXT_PUBLIC_FIREBASE_* settings to .env.local.");
      }
      await authPersistenceReady;
      if (isLogin) {
        const credential = await signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
        onAuthenticated({ user: { id: credential.user.uid, email: credential.user.email, role: "employee" } });
        return;
      }
      const credential = await createUserWithEmailAndPassword(firebaseAuth, email.trim(), password);
      onAuthenticated({ user: { id: credential.user.uid, email: credential.user.email, role: "employee" } });
      setMessage({ type: "success", text: "Account created. Your workspace is ready." });
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
