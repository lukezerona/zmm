"use client";

import Image from "next/image";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail, X } from "lucide-react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import styles from "./page.module.css";

export default function LoginPage() {
  const router = useRouter();
  const [revealed, setRevealed] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [forgotOpen, setForgotOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  useEffect(() => {
    const revealTimer = window.setTimeout(() => setRevealed(true), 1250);

    async function restoreSession() {
      if (!supabase) {
        setCheckingSession(false);
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (data.session) {
        router.replace("/bracket");
        return;
      }
      setCheckingSession(false);
    }

    void restoreSession();
    return () => window.clearTimeout(revealTimer);
  }, [router]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!supabase) {
      setError("We’re having trouble signing you in right now. Please come back and try again later.");
      return;
    }

    setLoading(true);
    const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (loginError) {
      setError(
        loginError.message === "Invalid login credentials"
          ? "That email or password doesn’t match our records."
          : "We’re having trouble signing you in right now. Please try again later.",
      );
      return;
    }

    router.push("/bracket");
    router.refresh();
  }

  async function handleReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!supabase) {
      setError("Password recovery is temporarily unavailable. Please try again later.");
      setForgotOpen(false);
      return;
    }

    setResetLoading(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setResetLoading(false);

    if (resetError) {
      setError("Password recovery is temporarily unavailable. Please try again later.");
      setForgotOpen(false);
      return;
    }

    setResetSent(true);
  }

  if (checkingSession && isSupabaseConfigured) {
    return (
      <main className={styles.sessionCheck} aria-label="Loading Zerona March Madness">
        <Image src="/zmm-logo.png" alt="Zerona March Madness" width={855} height={483} priority />
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.ambientOne} />
      <div className={styles.ambientTwo} />
      <section className={`${styles.shell} ${revealed ? styles.revealed : ""}`} aria-label={revealed ? "ZMM sign in" : "Zerona March Madness"}>
        <div className={styles.brandPanel}>
          <Image className={styles.logo} src="/zmm-logo.png" alt="ZMM — Zerona March Madness" width={855} height={483} priority />
        </div>

        <div className={styles.formPanel} aria-hidden={!revealed}>
          <div className={styles.formIntro}>
            <h2>Sign in</h2>
          </div>

          <form onSubmit={handleLogin} className={styles.form}>
            <label htmlFor="email">Email address</label>
            <div className={styles.inputWrap}>
              <Mail size={18} aria-hidden="true" />
              <input id="email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </div>

            <div className={styles.labelRow}>
              <label htmlFor="password">Password</label>
              <button type="button" className={styles.forgotButton} onClick={() => { setForgotOpen(true); setResetSent(false); setResetEmail(email); }}>
                Forgot password?
              </button>
            </div>
            <div className={styles.inputWrap}>
              <LockKeyhole size={18} aria-hidden="true" />
              <input id="password" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="Enter your password" value={password} onChange={(event) => setPassword(event.target.value)} required />
              <button type="button" className={styles.eyeButton} onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            {error && <p className={styles.error} role="alert">{error}</p>}

            <button className={styles.submitButton} type="submit" disabled={loading}>
              {loading ? <><LoaderCircle className={styles.spinner} size={19} /> Signing in…</> : "Sign in"}
            </button>
          </form>
        </div>
      </section>

      {forgotOpen && (
        <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setForgotOpen(false); }}>
          <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="reset-title">
            <button className={styles.closeButton} type="button" onClick={() => setForgotOpen(false)} aria-label="Close"><X size={20} /></button>
            {resetSent ? (
              <div className={styles.successState}>
                <CheckCircle2 size={42} />
                <h2 id="reset-title">Check your inbox</h2>
                <p>If an account exists for <strong>{resetEmail}</strong>, we’ll send a secure reset link.</p>
                <button type="button" onClick={() => setForgotOpen(false)}>Back to sign in</button>
              </div>
            ) : (
              <>
                <div className={styles.modalIcon}><Mail size={23} /></div>
                <h2 id="reset-title">Reset your password</h2>
                <p>Enter your email and we’ll send you a secure link to choose a new password.</p>
                <form onSubmit={handleReset} className={styles.resetForm}>
                  <label htmlFor="reset-email">Email address</label>
                  <input id="reset-email" type="email" autoComplete="email" placeholder="you@example.com" value={resetEmail} onChange={(event) => setResetEmail(event.target.value)} autoFocus required />
                  <button type="submit" disabled={resetLoading}>{resetLoading ? <><LoaderCircle className={styles.spinner} size={18} /> Sending…</> : "Send reset link"}</button>
                </form>
              </>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
