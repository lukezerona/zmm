"use client";

import Image from "next/image";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail, Trophy, X } from "lucide-react";
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
    const revealTimer = window.setTimeout(() => setRevealed(true), 700);

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
      setError("Supabase is not connected yet. Follow the setup guide in README.md, then try again.");
      return;
    }

    setLoading(true);
    const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (loginError) {
      setError(loginError.message === "Invalid login credentials" ? "That email or password doesn’t match our records." : loginError.message);
      return;
    }

    router.push("/bracket");
    router.refresh();
  }

  async function handleReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!supabase) {
      setError("Connect Supabase before sending a password reset email.");
      setForgotOpen(false);
      return;
    }

    setResetLoading(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setResetLoading(false);

    if (resetError) {
      setError(resetError.message);
      setForgotOpen(false);
      return;
    }

    setResetSent(true);
  }

  if (checkingSession && isSupabaseConfigured) {
    return (
      <main className={styles.sessionCheck}>
        <Image src="/zmm-logo.png" alt="Zerona March Madness" width={855} height={483} priority />
        <LoaderCircle className={styles.spinner} aria-hidden="true" />
        <p>Checking your bracket pass…</p>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.ambientOne} />
      <div className={styles.ambientTwo} />
      <section className={`${styles.shell} ${revealed ? styles.revealed : ""}`}>
        <div className={styles.brandPanel}>
          <span className={styles.seasonPill}>2026 FAMILY TOURNAMENT</span>
          <Image className={styles.logo} src="/zmm-logo.png" alt="ZMM — Zerona March Madness" width={855} height={483} priority />
          <div className={styles.brandCopy}>
            <h1>Welcome back to the madness.</h1>
            <p>Sign in, make your picks, and chase family bragging rights.</p>
          </div>
          <div className={styles.brandFooter}>
            <Trophy size={17} aria-hidden="true" />
            <span>One family. One bracket champion.</span>
          </div>
        </div>

        <div className={styles.formPanel}>
          <div className={styles.formIntro}>
            <span className={styles.eyebrow}>YOUR BRACKET AWAITS</span>
            <h2>Sign in to ZMM</h2>
            <p>Use the email and password connected to your family account.</p>
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
              {loading ? <><LoaderCircle className={styles.spinner} size={19} /> Checking your picks…</> : <>Enter the tournament <ArrowRight size={19} /></>}
            </button>
          </form>

          <p className={styles.helpText}>Need an account? Ask the ZMM commissioner to add you.</p>
          {!isSupabaseConfigured && <div className={styles.setupNote}><span>Setup mode</span> Add your Supabase keys to enable sign in.</div>}
        </div>
      </section>

      <p className={styles.copyright}>© 2026 Zerona March Madness · Built for the family</p>

      {forgotOpen && (
        <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setForgotOpen(false); }}>
          <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="reset-title">
            <button className={styles.closeButton} type="button" onClick={() => setForgotOpen(false)} aria-label="Close"><X size={20} /></button>
            {resetSent ? (
              <div className={styles.successState}>
                <CheckCircle2 size={42} />
                <h2 id="reset-title">Check your inbox</h2>
                <p>If an account exists for <strong>{resetEmail}</strong>, Supabase will send a secure reset link.</p>
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
