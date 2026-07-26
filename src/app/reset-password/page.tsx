"use client";

import Image from "next/image";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, LoaderCircle, LockKeyhole } from "lucide-react";
import { supabase } from "@/lib/supabase";
import styles from "./reset.module.css";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [complete, setComplete] = useState(false);
  const [message, setMessage] = useState(supabase ? "" : "Password recovery is temporarily unavailable. Please try again later.");

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setReady(Boolean(data.session));
      if (!data.session) setMessage("Open this page from the password reset link in your email.");
    });
  }, []);

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if (password.length < 6) { setMessage("Use at least 6 characters."); return; }
    if (password !== confirmPassword) { setMessage("The passwords don’t match."); return; }
    setLoading(true);
    const { error } = await supabase!.auth.updateUser({ password });
    setLoading(false);
    if (error) { setMessage("We couldn’t update your password right now. Please try again later."); return; }
    setComplete(true);
  }

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <Image src="/zmm-logo.png" alt="ZMM" width={855} height={483} priority />
        {complete ? (
          <div className={styles.complete}><CheckCircle2 size={44} /><h1>Password updated</h1><p>You’re all set. Return to ZMM and sign in with your new password.</p><button type="button" onClick={() => router.push("/")}>Return to sign in</button></div>
        ) : (
          <><div className={styles.icon}><LockKeyhole size={24} /></div><h1>Choose a new password</h1><p>Make it something memorable and at least 6 characters long.</p><form onSubmit={updatePassword}><label htmlFor="password">New password</label><input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required /><label htmlFor="confirm">Confirm password</label><input id="confirm" type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} minLength={6} required />{message && <span className={styles.message}>{message}</span>}<button type="submit" disabled={!ready || loading}>{loading ? <><LoaderCircle size={17} /> Updating…</> : "Update password"}</button></form></>
        )}
      </section>
    </main>
  );
}
