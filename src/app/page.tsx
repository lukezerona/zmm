"use client";

import Image from "next/image";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Eye, EyeOff, LoaderCircle, LockKeyhole, UserRound, X } from "lucide-react";
import { RETURN_TO_SIGN_IN_SESSION_KEY } from "@/lib/auth-navigation";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import styles from "./page.module.css";

type LoginResponse = {
  accessToken?: string;
  refreshToken?: string;
};

export default function LoginPage() {
  const router = useRouter();
  const [revealed, setRevealed] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [forgotOpen, setForgotOpen] = useState(false);
  const [resetUsername, setResetUsername] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  async function destinationForUser(userId: string) {
    if (!supabase) return "/";

    const { data, error: profileError } = await supabase
      .from("profiles")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (profileError) throw profileError;
    return data ? "/march-madness" : "/accept-invite";
  }

  useEffect(() => {
    const revealTimer = window.setTimeout(() => setRevealed(true), 1250);

    async function restoreSession() {
      if (!supabase) {
        setCheckingSession(false);
        return;
      }

      const { data } = await supabase.auth.getSession();
      const returningToSignIn =
        window.sessionStorage.getItem(RETURN_TO_SIGN_IN_SESSION_KEY) === "true";

      if (data.session && returningToSignIn) {
        setCheckingSession(false);
        return;
      }

      window.sessionStorage.removeItem(RETURN_TO_SIGN_IN_SESSION_KEY);

      if (data.session) {
        try {
          router.replace(await destinationForUser(data.session.user.id));
          return;
        } catch {
          setError("We’re having trouble opening your account right now. Please try again later.");
        }
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
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        setError(
          response.status === 401
            ? "That username or password doesn’t match our records."
            : "We’re having trouble signing you in right now. Please try again later.",
        );
        return;
      }

      const result = (await response.json()) as LoginResponse;
      if (!result.accessToken || !result.refreshToken) {
        setError("We’re having trouble signing you in right now. Please try again later.");
        return;
      }

      const { data, error: sessionError } = await supabase.auth.setSession({
        access_token: result.accessToken,
        refresh_token: result.refreshToken,
      });

      if (sessionError || !data.user) {
        setError("We’re having trouble signing you in right now. Please try again later.");
        return;
      }

      window.sessionStorage.removeItem(RETURN_TO_SIGN_IN_SESSION_KEY);
      router.push(await destinationForUser(data.user.id));
      router.refresh();
    } catch {
      setError("We’re having trouble signing you in right now. Please try again later.");
    } finally {
      setLoading(false);
    }
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
    try {
      const response = await fetch("/api/auth/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: resetUsername }),
      });

      if (!response.ok) {
        setError("Password recovery is temporarily unavailable. Please try again later.");
        setForgotOpen(false);
        return;
      }

      setResetSent(true);
    } catch {
      setError("Password recovery is temporarily unavailable. Please try again later.");
      setForgotOpen(false);
    } finally {
      setResetLoading(false);
    }
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
            <label htmlFor="username">Username</label>
            <div className={styles.inputWrap}>
              <UserRound size={18} aria-hidden="true" />
              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="Enter your username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                required
              />
            </div>

            <div className={styles.labelRow}>
              <label htmlFor="password">Password</label>
              <button type="button" className={styles.forgotButton} onClick={() => { setForgotOpen(true); setResetSent(false); setResetUsername(username); }}>
                Forgot password?
              </button>
            </div>
            <div className={styles.inputWrap}>
              <LockKeyhole size={18} aria-hidden="true" />
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
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
                <p>If an account exists for <strong>{resetUsername}</strong>, we’ll send a secure reset link.</p>
                <button type="button" onClick={() => setForgotOpen(false)}>Back to sign in</button>
              </div>
            ) : (
              <>
                <div className={styles.modalIcon}><UserRound size={23} /></div>
                <h2 id="reset-title">Reset your password</h2>
                <p>Enter your username and we’ll send a secure link to the email on that account.</p>
                <form onSubmit={handleReset} className={styles.resetForm}>
                  <label htmlFor="reset-username">Username</label>
                  <input
                    id="reset-username"
                    name="username"
                    type="text"
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="Enter your username"
                    value={resetUsername}
                    onChange={(event) => setResetUsername(event.target.value)}
                    autoFocus
                    required
                  />
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
