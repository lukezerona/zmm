"use client";

import Image from "next/image";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Clock3,
  Copy,
  LoaderCircle,
  LogOut,
  Pencil,
  Plus,
  Printer,
  Save,
  Trash2,
  Trophy,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  CREATION_TEST_SEASON_YEAR,
  getTournamentLifecycle,
} from "@/lib/tournament-lifecycle";
import { getTournamentStartingPath } from "@/lib/tournament-preference";
import { BracketBoard } from "./bracket-board";
import { PrintableBlankBracket } from "./printable-bracket";
import {
  buildTournamentModel,
  deriveBracket,
  pickCount,
  sanitizePicks,
} from "./bracket-utils";
import {
  EspnGameRow,
  PickMap,
  TournamentModel,
  TournamentRegionPairingRow,
} from "./bracket-types";
import styles from "./bracket.module.css";

const TOTAL_PICKS = 63;

type Profile = {
  username: string;
};

type SavedBracket = {
  id: string;
  user_id: string;
  season_year: number;
  display_name: string;
  is_primary: boolean;
  picks: unknown;
  tiebreaker_total: number | null;
  created_at: string;
  updated_at: string;
};

function savedPickMap(value: unknown): PickMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function countdownLabel(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1_000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

export default function BracketPage() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [displayNameDraft, setDisplayNameDraft] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [savedBrackets, setSavedBrackets] = useState<SavedBracket[]>([]);
  const [activeBracketId, setActiveBracketId] = useState("");
  const [showAddBracket, setShowAddBracket] = useState(false);
  const [newBracketName, setNewBracketName] = useState("");
  const [creatingBracketMode, setCreatingBracketMode] = useState<
    "blank" | "copy" | null
  >(null);
  const [deletingBracket, setDeletingBracket] = useState(false);
  const [seasonYear, setSeasonYear] = useState(
    CREATION_TEST_SEASON_YEAR,
  );
  const [entryDeadline, setEntryDeadline] = useState<string | null>(null);
  const [millisecondsUntilLock, setMillisecondsUntilLock] = useState<
    number | null
  >(null);
  const [model, setModel] = useState<TournamentModel | null>(null);
  const [picks, setPicks] = useState<PickMap>({});
  const [tiebreaker, setTiebreaker] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSucceeded, setSaveSucceeded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [locked, setLocked] = useState(false);
  const [showMissingPicks, setShowMissingPicks] = useState(false);
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

      let lifecycle;
      try {
        lifecycle = await getTournamentLifecycle(client);
      } catch (lifecycleError) {
        console.error(
          "[bracket] Could not load tournament lifecycle",
          lifecycleError,
        );
        setError("The tournament schedule is temporarily unavailable.");
        setLoading(false);
        return;
      }

      if (lifecycle.phase === "live" || lifecycle.phase === "final") {
        router.replace(getTournamentStartingPath());
        return;
      }

      if (
        lifecycle.phase !== "picks_open" ||
        !lifecycle.fieldReady ||
        lifecycle.seasonYear === null
      ) {
        setError(
          "The tournament bracket has not been announced yet. Please check back soon.",
        );
        setLoading(false);
        return;
      }

      const activeSeasonYear =
        lifecycle.seasonYear ?? CREATION_TEST_SEASON_YEAR;

      const [profileResult, gamesResult, bracketResult, pairingResult] =
        await Promise.all([
          client
            .from("profiles")
            .select("username")
            .eq("user_id", userData.user.id)
            .maybeSingle(),
          client
            .from("espn_games")
            .select(
              "espn_event_id, region, round_code, starts_at, home_team_id, home_team_name, home_team_seed, away_team_id, away_team_name, away_team_seed",
            )
            .eq("season_year", activeSeasonYear)
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
            .select(
              "id, user_id, season_year, display_name, is_primary, picks, tiebreaker_total, created_at, updated_at",
            )
            .eq("user_id", userData.user.id)
            .eq("season_year", activeSeasonYear)
            .order("is_primary", { ascending: false })
            .order("created_at", { ascending: true }),
          client
            .from("tournament_region_pairings")
            .select(
              "season_year, left_top_region, left_bottom_region, right_top_region, right_bottom_region",
            )
            .eq("season_year", activeSeasonYear)
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

      if (pairingResult.error || !pairingResult.data) {
        setError(
          "The tournament region pairings are not configured yet. Please check back soon.",
        );
        setLoading(false);
        return;
      }

      try {
        const tournament = buildTournamentModel(
          gamesResult.data as EspnGameRow[],
          activeSeasonYear,
          pairingResult.data as TournamentRegionPairingRow,
        );
        let entries = (bracketResult.data ?? []) as SavedBracket[];
        if (entries.length === 0) {
          const { data: firstBracket, error: firstBracketError } = await client
            .from("brackets")
            .insert({
              user_id: userData.user.id,
              season_year: activeSeasonYear,
              display_name: profile.username,
              picks: {},
              tiebreaker_total: null,
            })
            .select(
              "id, user_id, season_year, display_name, is_primary, picks, tiebreaker_total, created_at, updated_at",
            )
            .single();

          if (firstBracketError || !firstBracket) {
            throw new Error(
              firstBracketError?.message ?? "Could not create the first bracket",
            );
          }
          entries = [firstBracket as SavedBracket];
        }
        const saved = entries[0];
        const deadlineTimestamp = lifecycle.entryDeadline
          ? new Date(lifecycle.entryDeadline).getTime()
          : Number.NaN;
        const firstRoundStarted =
          Number.isFinite(deadlineTimestamp) &&
          deadlineTimestamp <= Date.now();

        setUserId(userData.user.id);
        setUsername(profile.username);
        setSavedBrackets(entries);
        setActiveBracketId(saved.id);
        setDisplayName(saved.display_name);
        setDisplayNameDraft(saved.display_name);
        setSeasonYear(activeSeasonYear);
        setEntryDeadline(lifecycle.entryDeadline);
        setModel(tournament);
        setPicks(sanitizePicks(tournament, savedPickMap(saved?.picks)));
        setTiebreaker(
          saved?.tiebreaker_total === null || saved?.tiebreaker_total === undefined
            ? ""
            : String(saved.tiebreaker_total),
        );
        setLocked(firstRoundStarted);
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

  useEffect(() => {
    if (!entryDeadline) return;

    const deadlineTimestamp = new Date(entryDeadline).getTime();
    if (!Number.isFinite(deadlineTimestamp)) return;

    let redirectTimer: number | null = null;
    const updateCountdown = () => {
      const remaining = Math.max(0, deadlineTimestamp - Date.now());
      setMillisecondsUntilLock(remaining);

      if (remaining > 0 || redirectTimer !== null) return;

      setLocked(true);
      setDirty(false);
      setSaveSucceeded(false);
      setMessage(
        "Entries are locked because the Round of 64 has started. Opening Tournament Central…",
      );
      redirectTimer = window.setTimeout(() => {
        router.replace(getTournamentStartingPath());
      }, 2_000);
    };

    updateCountdown();
    const timer = window.setInterval(updateCountdown, 1_000);
    return () => {
      window.clearInterval(timer);
      if (redirectTimer !== null) window.clearTimeout(redirectTimer);
    };
  }, [entryDeadline, router]);

  const bracket = useMemo(
    () => (model ? deriveBracket(model, picks) : null),
    [model, picks],
  );
  const completedPicks = pickCount(bracket, picks);
  const isWarning = message.startsWith("Warning:");
  const activeBracket = savedBrackets.find(
    (savedBracket) => savedBracket.id === activeBracketId,
  );

  function openSavedBracket(savedBracket: SavedBracket) {
    if (!model) return;
    setActiveBracketId(savedBracket.id);
    setDisplayName(savedBracket.display_name);
    setDisplayNameDraft(savedBracket.display_name);
    setPicks(sanitizePicks(model, savedPickMap(savedBracket.picks)));
    setTiebreaker(
      savedBracket.tiebreaker_total === null
        ? ""
        : String(savedBracket.tiebreaker_total),
    );
    setEditingName(false);
    setShowAddBracket(false);
    setShowMissingPicks(false);
    setDirty(false);
    setSaveSucceeded(false);
    setMessage("");
  }

  function selectBracket(bracketId: string) {
    const nextBracket = savedBrackets.find(
      (savedBracket) => savedBracket.id === bracketId,
    );
    if (!nextBracket || nextBracket.id === activeBracketId) return;
    if (
      dirty &&
      !window.confirm(
        "This bracket has unsaved changes. Switch brackets and discard them?",
      )
    ) {
      return;
    }
    openSavedBracket(nextBracket);
  }

  function chooseWinner(matchupId: string, entryId: string) {
    if (!model || locked) return;

    setPicks((current) =>
      sanitizePicks(model, { ...current, [matchupId]: entryId }),
    );
    setDirty(true);
    setSaveSucceeded(false);
    setMessage("");
  }

  function clearWinner(matchupId: string) {
    if (!model || locked) return;

    setPicks((current) => {
      const nextPicks = { ...current };
      delete nextPicks[matchupId];
      return sanitizePicks(model, nextPicks);
    });
    setDirty(true);
    setSaveSucceeded(false);
    setMessage("");
  }

  async function saveDisplayName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const client = supabase;
    const cleanName = displayNameDraft.trim();

    if (
      !client ||
      !userId ||
      !activeBracketId ||
      cleanName.length < 1 ||
      cleanName.length > 50
    ) {
      setMessage("Display names must be between 1 and 50 characters.");
      return;
    }

    setSavingName(true);
    const { data: renamedBracket, error: nameError } = await client
      .from("brackets")
      .update({ display_name: cleanName })
      .eq("id", activeBracketId)
      .eq("user_id", userId)
      .select("id")
      .maybeSingle();
    setSavingName(false);

    if (nameError || !renamedBracket) {
      setMessage(
        nameError?.code === "23505"
          ? "You already have a bracket with that display name."
          : "We couldn’t update this bracket’s display name. Please try again.",
      );
      return;
    }

    setSavedBrackets((current) =>
      current.map((savedBracket) =>
        savedBracket.id === activeBracketId
          ? { ...savedBracket, display_name: cleanName }
          : savedBracket,
      ),
    );
    setDisplayName(cleanName);
    setDisplayNameDraft(cleanName);
    setEditingName(false);
    setMessage("Display name updated.");
  }

  async function addBracket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const client = supabase;
    const cleanName = newBracketName.trim();
    const submitter = (event.nativeEvent as SubmitEvent)
      .submitter as HTMLButtonElement | null;
    const creationMode = submitter?.value === "copy" ? "copy" : "blank";
    const copyCurrent = creationMode === "copy";

    if (
      !client ||
      !userId ||
      cleanName.length < 1 ||
      cleanName.length > 50
    ) {
      setMessage("Display names must be between 1 and 50 characters.");
      return;
    }
    const copiedTiebreaker =
      copyCurrent && tiebreaker !== "" ? Number(tiebreaker) : null;
    if (
      copiedTiebreaker !== null &&
      (!Number.isInteger(copiedTiebreaker) ||
        copiedTiebreaker < 0 ||
        copiedTiebreaker > 400)
    ) {
      setMessage(
        "Enter a final-game total between 0 and 400 before copying this bracket.",
      );
      return;
    }
    if (
      !copyCurrent &&
      dirty &&
      !window.confirm(
        "This bracket has unsaved changes. Create a new bracket and discard them?",
      )
    ) {
      return;
    }

    setCreatingBracketMode(creationMode);
    const { data: createdBracket, error: createError } = await client
      .from("brackets")
      .insert({
        user_id: userId,
        season_year: seasonYear,
        display_name: cleanName,
        picks: copyCurrent ? picks : {},
        tiebreaker_total: copiedTiebreaker,
      })
      .select(
        "id, user_id, season_year, display_name, is_primary, picks, tiebreaker_total, created_at, updated_at",
      )
      .single();
    setCreatingBracketMode(null);

    if (createError || !createdBracket) {
      setMessage(
        createError?.code === "23505"
          ? "You already have a bracket with that display name."
          : "We couldn’t create another bracket. Please try again.",
      );
      return;
    }

    const savedBracket = createdBracket as SavedBracket;
    setSavedBrackets((current) => [...current, savedBracket]);
    setNewBracketName("");
    openSavedBracket(savedBracket);
    setMessage(
      copyCurrent
        ? `Current bracket copied for ${savedBracket.display_name}.`
        : `Blank bracket created for ${savedBracket.display_name}.`,
    );
  }

  async function deleteBracket() {
    const client = supabase;
    if (
      !client ||
      !activeBracket ||
      activeBracket.is_primary ||
      savedBrackets.length <= 1
    ) {
      return;
    }
    if (
      !window.confirm(
        `Delete ${activeBracket.display_name}’s bracket? This cannot be undone.`,
      )
    ) {
      return;
    }

    setDeletingBracket(true);
    const { data: deletedBracket, error: deleteError } = await client
      .from("brackets")
      .delete()
      .eq("id", activeBracket.id)
      .eq("user_id", userId)
      .select("id")
      .maybeSingle();
    setDeletingBracket(false);

    if (deleteError || !deletedBracket) {
      setMessage("We couldn’t delete this bracket. Please try again.");
      return;
    }

    const remaining = savedBrackets.filter(
      (savedBracket) => savedBracket.id !== activeBracket.id,
    );
    const nextBracket =
      remaining.find((savedBracket) => savedBracket.is_primary) ?? remaining[0];
    setSavedBrackets(remaining);
    openSavedBracket(nextBracket);
    setMessage("Extra bracket deleted.");
  }

  async function saveBracket() {
    const client = supabase;
    if (!client || !userId || !activeBracketId) return;
    if (locked) {
      setMessage(
        "Entries are locked because the Round of 64 has started. Your saved picks cannot be changed.",
      );
      return;
    }

    const total = tiebreaker === "" ? null : Number(tiebreaker);
    if (total !== null && (!Number.isInteger(total) || total < 0 || total > 400)) {
      setShowMissingPicks(true);
      setMessage("Enter a final-game total between 0 and 400.");
      return;
    }

    const remainingPicks = TOTAL_PICKS - completedPicks;
    setShowMissingPicks(remainingPicks > 0 || total === null);
    setSaving(true);
    setSaveSucceeded(false);
    setMessage("");
    const savedAt = new Date().toISOString();
    const { data: updatedBracket, error: saveError } = await client
      .from("brackets")
      .update({
        picks,
        tiebreaker_total: total,
        updated_at: savedAt,
      })
      .eq("id", activeBracketId)
      .eq("user_id", userId)
      .select("id")
      .maybeSingle();
    setSaving(false);

    if (saveError || !updatedBracket) {
      console.error("[bracket] Save failed", saveError);
      if (
        entryDeadline &&
        new Date(entryDeadline).getTime() <= Date.now()
      ) {
        setLocked(true);
        setDirty(false);
        setSaveSucceeded(false);
        setMessage(
          "Entries are locked because the Round of 64 has started. Your saved picks were not changed.",
        );
        return;
      }
      setMessage("We couldn’t save your bracket. Please try again.");
      return;
    }

    setSavedBrackets((current) =>
      current.map((savedBracket) =>
        savedBracket.id === activeBracketId
          ? {
              ...savedBracket,
              picks,
              tiebreaker_total: total,
              updated_at: savedAt,
            }
          : savedBracket,
      ),
    );
    setDirty(false);
    setSaveSucceeded(true);
    if (remainingPicks === 0 && total !== null) {
      setShowMissingPicks(false);
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
        <span>Building the {seasonYear} field…</span>
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
          <span className={styles.kicker}>{seasonYear} FAMILY TOURNAMENT</span>
        </div>

        <div className={styles.identityCard}>
          <div className={styles.bracketSelector}>
            <label htmlFor="family-bracket">FAMILY BRACKET</label>
            {editingName ? (
              <form
                className={styles.renameBracketForm}
                onSubmit={saveDisplayName}
              >
                <input
                  id="family-bracket"
                  type="text"
                  value={displayNameDraft}
                  onChange={(event) =>
                    setDisplayNameDraft(event.target.value)
                  }
                  maxLength={50}
                  aria-label="Family bracket name"
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={savingName}
                  aria-label="Save bracket name"
                >
                  {savingName ? (
                    <LoaderCircle className={styles.spinner} size={17} />
                  ) : (
                    <Check size={17} />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDisplayNameDraft(displayName);
                    setEditingName(false);
                  }}
                  aria-label="Cancel bracket name change"
                >
                  <X size={17} />
                </button>
              </form>
            ) : (
              <div className={styles.bracketSelectorRow}>
                <select
                  id="family-bracket"
                  value={activeBracketId}
                  onChange={(event) => selectBracket(event.target.value)}
                  aria-label="Choose a family bracket"
                >
                  {savedBrackets.map((savedBracket) => (
                    <option value={savedBracket.id} key={savedBracket.id}>
                      {savedBracket.display_name}
                      {savedBracket.is_primary ? " (Primary)" : ""}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className={styles.bracketIconButton}
                  onClick={() => {
                    setShowAddBracket(false);
                    setEditingName(true);
                  }}
                  disabled={locked}
                  aria-label={`Rename ${displayName} bracket`}
                  title="Rename this bracket"
                >
                  <Pencil size={15} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={styles.bracketIconButton}
                  onClick={() => {
                    setShowAddBracket((visible) => !visible);
                    setNewBracketName("");
                  }}
                  disabled={locked}
                  aria-label="Add another family bracket"
                  title="Add another family bracket"
                >
                  <Plus size={17} aria-hidden="true" />
                </button>
                {!activeBracket?.is_primary && savedBrackets.length > 1 && (
                  <button
                    type="button"
                    className={`${styles.bracketIconButton} ${styles.deleteBracketButton}`}
                    onClick={() => void deleteBracket()}
                    disabled={locked || deletingBracket}
                    aria-label={`Delete ${displayName} bracket`}
                    title="Delete this extra bracket"
                  >
                    {deletingBracket ? (
                      <LoaderCircle className={styles.spinner} size={17} />
                    ) : (
                      <Trash2 size={17} aria-hidden="true" />
                    )}
                  </button>
                )}
              </div>
            )}
          </div>

          {showAddBracket && (
            <form className={styles.addBracketForm} onSubmit={addBracket}>
              <input
                type="text"
                value={newBracketName}
                onChange={(event) => setNewBracketName(event.target.value)}
                maxLength={50}
                placeholder="Family member display name"
                aria-label="New bracket display name"
                autoFocus
                required
              />
              <button
                type="submit"
                name="creationMode"
                value="blank"
                disabled={creatingBracketMode !== null}
              >
                {creatingBracketMode === "blank" ? (
                  <LoaderCircle className={styles.spinner} size={17} />
                ) : (
                  <Plus size={17} />
                )}
                Create blank
              </button>
              <button
                type="submit"
                name="creationMode"
                value="copy"
                disabled={creatingBracketMode !== null}
                title={`Copy ${displayName}'s current picks and tiebreaker`}
              >
                {creatingBracketMode === "copy" ? (
                  <LoaderCircle className={styles.spinner} size={17} />
                ) : (
                  <Copy size={17} />
                )}
                Copy current
              </button>
            </form>
          )}

          <small className={styles.signedInAs}>
            Signed in as @{username}
          </small>
        </div>

        <div
          className={styles.mobileProgressCard}
          aria-label="Bracket progress"
        >
          <div className={styles.progressCopy}>
            <span>{completedPicks} of {TOTAL_PICKS} picks complete</span>
            <div className={styles.progressTrack}>
              <i
                style={{
                  width: `${(completedPicks / TOTAL_PICKS) * 100}%`,
                }}
              />
            </div>
            {millisecondsUntilLock !== null && !locked && (
              <time
                className={styles.entryCountdown}
                dateTime={entryDeadline ?? undefined}
              >
                <Clock3 size={14} aria-hidden="true" />
                Entries lock in {countdownLabel(millisecondsUntilLock)}
              </time>
            )}
          </div>
          <div className={styles.toolbarActions}>
            <button
              type="button"
              className={styles.printButton}
              onClick={() => window.print()}
              aria-label="Print bracket"
            >
              <Printer size={16} aria-hidden="true" />
              Print
            </button>
            <button
              type="button"
              className={
                saveSucceeded ? styles.saveSuccessButton : undefined
              }
              onClick={saveBracket}
              disabled={locked || saving || !dirty}
              aria-label={
                locked
                  ? "Entries locked"
                  : saving
                    ? "Saving bracket"
                    : saveSucceeded
                      ? "Bracket saved"
                      : "Save bracket"
              }
            >
              {saving ? (
                <LoaderCircle className={styles.spinner} size={16} />
              ) : saveSucceeded ? (
                <Check size={18} strokeWidth={3} aria-hidden="true" />
              ) : (
                <Save size={16} aria-hidden="true" />
              )}
              {locked
                ? "Locked"
                : saving
                  ? "Saving"
                  : saveSucceeded
                    ? null
                    : "Save"}
            </button>
          </div>
        </div>
      </section>

      <section className={styles.bracketToolbar} aria-label="Bracket progress">
        <div className={styles.progressCopy}>
          <span>{completedPicks} of {TOTAL_PICKS} picks complete</span>
          <div className={styles.progressTrack}>
            <i style={{ width: `${(completedPicks / TOTAL_PICKS) * 100}%` }} />
          </div>
          {millisecondsUntilLock !== null && !locked && (
            <time
              className={styles.entryCountdown}
              dateTime={entryDeadline ?? undefined}
            >
              <Clock3 size={14} aria-hidden="true" />
              Entries lock in {countdownLabel(millisecondsUntilLock)}
            </time>
          )}
        </div>
        <div className={styles.toolbarActions}>
          <button
            type="button"
            className={styles.printButton}
            onClick={() => window.print()}
          >
            <Printer size={18} aria-hidden="true" />
            Print bracket
          </button>
          <button
            type="button"
            className={
              saveSucceeded ? styles.saveSuccessButton : undefined
            }
            onClick={saveBracket}
            disabled={locked || saving || !dirty}
            aria-label={
              locked
                ? "Entries locked"
                : saving
                  ? "Saving bracket"
                  : saveSucceeded
                    ? "Bracket saved"
                    : "Save bracket"
            }
          >
            {saving ? (
              <LoaderCircle className={styles.spinner} size={18} />
            ) : saveSucceeded ? (
              <Check size={20} strokeWidth={3} aria-hidden="true" />
            ) : (
              <Save size={18} aria-hidden="true" />
            )}
            {locked
              ? "Entries locked"
              : saving
                ? "Saving…"
                : saveSucceeded
                  ? null
                  : "Save bracket"}
          </button>
        </div>
      </section>

      {locked && (
        <p
          className={`${styles.statusMessage} ${styles.warningMessage}`}
          role="status"
        >
          Entries are locked. The Round of 64 has started, so this bracket is
          now read-only and its saved picks cannot be overwritten.
        </p>
      )}

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
        onClearPick={clearWinner}
        model={model}
        tiebreaker={tiebreaker}
        onTiebreakerChange={(value) => {
          if (locked) return;
          setTiebreaker(value);
          setDirty(true);
          setSaveSucceeded(false);
          setMessage("");
        }}
        readOnly={locked}
        showMissing={showMissingPicks}
      />

      <PrintableBlankBracket model={model} />

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
        <button
          type="button"
          className={
            saveSucceeded ? styles.saveSuccessButton : undefined
          }
          onClick={saveBracket}
          disabled={locked || saving || !dirty}
          aria-label={
            locked
              ? "Entries locked"
              : saving
                ? "Saving bracket"
                : saveSucceeded
                  ? "Bracket saved"
                  : "Save bracket"
          }
        >
          {saving ? (
            <LoaderCircle className={styles.spinner} size={18} />
          ) : saveSucceeded ? (
            <Check size={20} strokeWidth={3} aria-hidden="true" />
          ) : (
            <Save size={18} aria-hidden="true" />
          )}
          {locked
            ? "Entries locked"
            : saving
              ? "Saving…"
              : saveSucceeded
                ? null
                : "Save bracket"}
        </button>
      </footer>
    </main>
  );
}
