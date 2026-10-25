"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import AuthForm from "../components/AuthForm";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState("login");
  const [sessionFailed, setSessionFailed] = useState(false);

  useEffect(() => {
    setSessionFailed(new URLSearchParams(window.location.search).get("error") === "session");
  }, []);

  function handleAuthenticated(data) {
    router.replace("/console/dashboard");
  }

  return <main className="auth-page"><header className="auth-nav"><Link href="/" className="brand-lockup"><span className="brand-symbol">H</span><span>HCM <b>lite</b></span></Link><Link href="/" className="text-link">Back to home <span>↗</span></Link></header><section className="auth-layout"><div className="auth-aside"><div className="eyebrow">YOUR PEOPLE WORKSPACE</div><h1>Good to have<br /><em>you back.</em></h1><p>Sign in to pick up where your team left off.</p><div className="auth-aside-note"><span>01</span><div><strong>One workspace</strong><small>People, time, leave and payroll.</small></div></div><div className="auth-aside-note"><span>02</span><div><strong>Clear by design</strong><small>Information shaped around your role.</small></div></div></div><div className="auth-form-side">{sessionFailed && <p className="notice notice-error" role="alert">Your account was accepted, but the backend could not validate the session. Check the API deployment and try again.</p>}<AuthForm onAuthenticated={handleAuthenticated} mode={mode} setMode={setMode} /></div></section><footer className="auth-footer"><span>HCM lite · Human capital, made clear.</span><span>Secure workspace access</span></footer></main>;
}
