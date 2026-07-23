"use client";

import Image from "next/image";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  LoaderCircle,
  LogOut,
  Pencil,
  Save,
  Trophy,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { BracketBoard } from "./bracket-board";
import {
  buildTournamentModel,
  deriveBracket,
  pickCount,
  sanitizePicks,
} from "./bracket-utils";
import { EspnGameRow, PickMap, TournamentModel } from "./bracket-types";
import styles from "./bracket.module.css";

const SEASON_YEAR = 2026;
const TOTAL_PICKS = 63;

type Profile = {
  username: string;
  display_name: string;
};

type SavedBracket = {
  picks: unknown;
  tiebreaker_total: number | null;
};

function savedPickMap(value: unknown): PickMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

export default function BracketPage() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [displayNameDraft, setDisplayNameDraft] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [model, setModel] = useState<TournamentModel | null>(null);
  const [picks, setPicks] = useState<PickMap>({});
  const [tiebreaker, setTiebreaker] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadBracket() {
      const client = supabase;
      if (!client) {
        router.replace("/");
        return;
      }

      const { data: userData } = await client.auth.getUser();
      if (!userData.user) {
        router.replace("/");
        return;
      }

      const [profileResult, gamesResult, bracketResult] = await Promise.all([
        client
          .from("profiles")
          .select("username, display_name")
          .eq("user_id", userData.user.id)
          .maybeSingle(),
        client
          .from("espn_games")
          .select(
            "espn_event_id, region, round_code, starts_at, home_team_id, home_team_name, home_team_seed, away_team_id, away_team_name, away_team_seed",
          )
          .eq("season_year", SEASON_YEAR)
          .in("round_code", [
            "PLAY_IN",
            "ROUND_OF_64",
            "ROUND_OF_32",
            "SWEET_16",
            "ELITE_8",
            "FINAL_FOUR",
            "CHAMPIONSHIP",
          ]),
        client
          .from("brackets")
          .select("picks, tiebreaker_total")
          .eq("user_id", userData.user.id)
          .eq("season_year", SEASON_YEAR)
          .maybeSingle(),
      ]);

      if (!active) return;

      const profile = profileResult.data as Profile | null;
      if (profileResult.error || !profile) {
        router.replace("/accept-invite");
        return;
      }

      if (gamesResult.error || !gamesResult.data) {
        setError("The tournament field is temporarily unavailable. Please try again later.");
        setLoading(false);
        return;
      }

      if (bracketResult.error) {
        setError("We couldn’t open your saved bracket. Please try again later.");
        setLoading(false);
        return;
      }

      try {
        const tournament = buildTournamentModel(
          gamesResult.data as EspnGameRow[],
          SEASON_YEAR,
        );
        const saved = bracketResult.data as SavedBracket | null;

        setUserId(userData.user.id);
        setUsername(profile.username);
        setDisplayName(profile.display_name);
        setDisplayNameDraft(profile.display_name);
        setModel(tournament);
        setPicks(sanitizePicks(tournament, savedPickMap(saved?.picks)));
        setTiebreaker(
          saved?.tiebreaker_total === null || saved?.tiebreaker_total === undefined
            ? ""
            : String(saved.tiebreaker_total),
        );
        setLoading(false);
      } catch (loadError) {
        console.error("[bracket] Could not build tournament", loadError);
        setError("The tournament bracket is not complete yet. Please check back soon.");
        setLoading(false);
      }
    }

    void loadBracket();
    return () => {
      active = false;
    };
  }, [router]);

  const bracket = useMemo(
    () => (model ? deriveBracket(model, picks) : null),
    [model, picks],
  );
  const completedPicks = pickCount(picks);
  const isWarning = message.startsWith("Warning:");

  function chooseWinner(matchupId: string, entryId: string) {
    if (!model) return;

    setPicks((current) =>
      sanitizePicks(model, { ...current, [matchupId]: entryId }),
    );
    setDirty(true);
    setMessage("");
  }

  async function saveDisplayName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const client = supabase;
    const cleanName = displayNameDraft.trim();

    if (!client || !userId || cleanName.length < 1 || cleanName.length > 50) {
      setMessage("Display names must be between 1 and 50 characters.");
      return;
    }

    setSavingName(true);
    const { error: nameError } = await client
      .from("profiles")
      .update({ display_name: cleanName })
      .eq("user_id", userId);
    setSavingName(false);

    if (nameError) {
      setMessage("We couldn’t update your display name. Please try again.");
      return;
    }

    setDisplayName(cleanName);
    setDisplayNameDraft(cleanName);
    setEditingName(false);
    setMessage("Display name updated.");
  }

  async function saveBracket() {
    const client = supabase;
    if (!client || !userId) return;

    const total = tiebreaker === "" ? null : Number(tiebreaker);
    if (total !== null && (!Number.isInteger(total) || total < 0 || total > 400)) {
      setMessage("Enter a final-game total between 0 and 400.");
      return;
    }

    setSaving(true);
    setMessage("");
    const { error: saveError } = await client.from("brackets").upsert(
      {
        user_id: userId,
        season_year: SEASON_YEAR,
        picks,
        tiebreaker_total: total,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,season_year" },
    );
    setSaving(false);

    if (saveError) {
      console.error("[bracket] Save failed", saveError);
      setMessage("We couldn’t save your bracket. Please try again.");
      return;
    }

    setDirty(false);
    const remainingPicks = TOTAL_PICKS - completedPicks;
    if (remainingPicks === 0 && total !== null) {
      setMessage("Bracket saved—your champion and tiebreaker are set.");
      return;
    }

    const missing = [
      remainingPicks > 0
        ? `${remainingPicks} ${remainingPicks === 1 ? "pick is" : "picks are"} still missing`
        : "",
      total === null ? "a total-points tiebreaker is required" : "",
    ].filter(Boolean);
    setMessage(`Warning: Your bracket was saved, but ${missing.join(" and ")}.`);
  }

  async function signOut() {
    await supabase?.auth.signOut();
    router.replace("/");
    router.refresh();
  }

  if (loading) {
    return (
      <main className={styles.loading}>
        <LoaderCircle className={styles.spinner} size={28} />
        <span>Building the 2026 field…</span>
      </main>
    );
  }

  if (error || !model || !bracket) {
    return (
      <main className={styles.loading}>
        <Trophy size={34} />
        <strong>Bracket unavailable</strong>
        <span>{error || "Please check back soon."}</span>
        <button type="button" onClick={() => window.location.reload()}>
          Try again
        </button>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Image
          src="/zmm-logo.png"
          alt="Zerona March Madness"
          width={855}
          height={483}
          priority
        />
        <button type="button" onClick={signOut}>
          <LogOut size={17} /> Sign out
        </button>
      </header>

      <section className={styles.hero}>
        <div>
          <span className={styles.kicker}>{SEASON_YEAR} FAMILY TOURNAMENT</span>
          <h1>Build your bracket, <em>@{username}</em>.</h1>
        </div>

        <div className={styles.identityCard}>
          <span>BRACKET DISPLAY NAME</span>
          {editingName ? (
            <form onSubmit={saveDisplayName}>
              <input
                type="text"
                value={displayNameDraft}
                onChange={(event) => setDisplayNameDraft(event.target.value)}
                maxLength={50}
                aria-label="Display name"
                autoFocus
              />
              <button type="submit" disabled={savingName} aria-label="Save display name">
                {savingName ? <LoaderCircle className={styles.spinner} size={17} /> : <Check size={17} />}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDisplayNameDraft(displayName);
                  setEditingName(false);
                }}
                aria-label="Cancel display name change"
              >
                <X size={17} />
              </button>
            </form>
          ) : (
            <button
              type="button"
              className={styles.displayNameButton}
              onClick={() => setEditingName(true)}
            >
              <strong>{displayName}</strong>
              <Pencil size={15} aria-hidden="true" />
            </button>
          )}
          <small>Signed in as @{username}</small>
        </div>
      </section>

      <section className={styles.bracketToolbar} aria-label="Bracket progress">
        <div className={styles.progressCopy}>
          <span>{completedPicks} of {TOTAL_PICKS} picks complete</span>
          <div className={styles.progressTrack}>
            <i style={{ width: `${(completedPicks / TOTAL_PICKS) * 100}%` }} />
          </div>
        </div>
        <button type="button" onClick={saveBracket} disabled={saving || !dirty}>
          {saving ? <LoaderCircle className={styles.spinner} size={18} /> : <Save size={18} />}
          {saving ? "Saving…" : dirty ? "Save bracket" : "Saved"}
        </button>
      </section>

      {message && (
        <p
          className={`${styles.statusMessage} ${
            isWarning ? styles.warningMessage : ""
          }`}
          role={isWarning ? "alert" : "status"}
        >
          {message}
        </p>
      )}

      <section className={styles.bracketIntro}>
        <span>MAKE YOUR PICKS</span>
      </section>

      <BracketBoard
        bracket={bracket}
        picks={picks}
        onPick={chooseWinner}
        roundDates={model.roundDates}
        tiebreaker={tiebreaker}
        onTiebreakerChange={(value) => {
          setTiebreaker(value);
          setDirty(true);
          setMessage("");
        }}
      />

      {isWarning && (
        <p
          className={`${styles.statusMessage} ${styles.warningMessage} ${styles.bottomWarning}`}
          aria-hidden="true"
        >
          {message}
        </p>
      )}

      <footer className={styles.saveFooter}>
        <div>
          <strong>{completedPicks === TOTAL_PICKS ? "Your bracket is complete." : `${TOTAL_PICKS - completedPicks} picks remaining.`}</strong>
          {dirty && <span>You have unsaved changes.</span>}
        </div>
        <button type="button" onClick={saveBracket} disabled={saving || !dirty}>
          {saving ? <LoaderCircle className={styles.spinner} size={18} /> : <Save size={18} />}
          {saving ? "Saving…" : dirty ? "Save bracket" : "Saved"}
        </button>
      </footer>
    </main>
  );
}
