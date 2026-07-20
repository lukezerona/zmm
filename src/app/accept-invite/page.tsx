"use client";

import Image from "next/image";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  LoaderCircle,
  LockKeyhole,
  UserRound,
} from "lucide-react";
import { RETURN_TO_SIGN_IN_SESSION_KEY } from "@/lib/auth-navigation";
import { supabase } from "@/lib/supabase";
import styles from "./invite.module.css";

const usernamePattern = /^[a-z0-9][a-z0-9_.-]{2,23}$/;

export default function AcceptInvitePage() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [complete, setComplete] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadInvitation() {
      if (!supabase) {
        setMessage("Account setup is temporarily unavailable. Please try again later.");
        setChecking(false);
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        setMessage("This invitation is invalid or has expired. Ask for a new invitation and try again.");
        setChecking(false);
        return;
      }

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("user_id", data.session.user.id)
        .maybeSingle();

      if (error) {
        setMessage("Account setup is temporarily unavailable. Please try again later.");
        setChecking(false);
        return;
      }

      if (profile) {
        router.replace("/bracket");
        return;
      }

      setUserId(data.session.user.id);
      setChecking(false);
    }

    void loadInvitation();
  }, [router]);

  function returnToSignIn() {
    window.sessionStorage.setItem(RETURN_TO_SIGN_IN_SESSION_KEY, "true");
    router.replace("/");
  }

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!supabase || !userId) {
      setMessage("Open this page from the invitation link in your email.");
      return;
    }

    const normalizedUsername = username.trim().toLowerCase();
    const cleanDisplayName = displayName.trim();

    if (!usernamePattern.test(normalizedUsername)) {
      setMessage("Use 3–24 letters, numbers, periods, dashes, or underscores for your username.");
      return;
    }
    if (!cleanDisplayName || cleanDisplayName.length > 50) {
      setMessage("Enter a display name between 1 and 50 characters.");
      return;
    }
    if (password.length < 8) {
      setMessage("Use a password with at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setMessage("The passwords don’t match.");
      return;
    }

    setLoading(true);

    const { error: passwordError } = await supabase.auth.updateUser({
      password,
    });

    if (passwordError) {
      setLoading(false);
      setMessage("We couldn’t save your password. Please try again.");
      return;
    }

    const { error: profileError } = await supabase.from("profiles").insert({
      user_id: userId,
      username: normalizedUsername,
      display_name: cleanDisplayName,
    });

    setLoading(false);

    if (profileError) {
      setMessage(
        profileError.code === "23505"
          ? "That username is already taken. Choose another one."
          : "We couldn’t finish setting up your account. Please try again.",
      );
      return;
    }

    setComplete(true);
  }

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        {!checking && userId && !complete && (
          <button
            type="button"
            className={styles.backButton}
            onClick={returnToSignIn}
          >
            <ArrowLeft size={17} aria-hidden="true" />
            Back to sign in
          </button>
        )}

        <Image
          src="/zmm-logo.png"
          alt="Zerona March Madness"
          width={855}
          height={483}
          priority
        />

        {checking ? (
          <div className={styles.checking}>
            <LoaderCircle size={26} />
            <p>Opening your invitation…</p>
          </div>
        ) : !userId ? (
          <div className={styles.invalid}>
            <LockKeyhole size={42} />
            <h1>Invitation unavailable</h1>
            <p>{message}</p>
            <button type="button" onClick={returnToSignIn}>
              Return to sign in
            </button>
          </div>
        ) : complete ? (
          <div className={styles.complete}>
            <CheckCircle2 size={46} />
            <h1>You’re on the roster</h1>
            <p>Your ZMM account is ready. Sign in next time with the username <strong>{username.trim().toLowerCase()}</strong>.</p>
            <button type="button" onClick={() => router.replace("/bracket")}>
              Start your bracket
            </button>
          </div>
        ) : (
          <>
            <div className={styles.icon}><UserRound size={24} /></div>
            <h1>Set up your account</h1>
            <p>Choose the name you’ll use to sign in and the name your family will see.</p>

            <form onSubmit={createAccount}>
              <label htmlFor="username">Username</label>
              <div className={styles.inputWrap}>
                <UserRound size={17} aria-hidden="true" />
                <input
                  id="username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="charlie"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  maxLength={24}
                  required
                />
              </div>
              <span className={styles.hint}>3–24 characters. Usernames are not case-sensitive.</span>

              <label htmlFor="display-name">Display name</label>
              <input
                id="display-name"
                name="displayName"
                type="text"
                autoComplete="name"
                placeholder="Charlie"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                maxLength={50}
                required
              />

              <label htmlFor="password">Password</label>
              <div className={styles.inputWrap}>
                <LockKeyhole size={17} aria-hidden="true" />
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  minLength={8}
                  required
                />
              </div>

              <label htmlFor="confirm-password">Confirm password</label>
              <input
                id="confirm-password"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                minLength={8}
                required
              />

              {message && <span className={styles.message} role="alert">{message}</span>}

              <button type="submit" disabled={loading}>
                {loading ? <><LoaderCircle className={styles.spinner} size={18} /> Creating account…</> : "Create my account"}
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
