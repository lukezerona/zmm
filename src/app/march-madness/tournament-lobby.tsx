"use client";

import Link from "next/link";
import {
  CheckCircle2,
  Clock3,
  History,
  LockKeyhole,
  PencilLine,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { TournamentLifecycle } from "@/lib/tournament-lifecycle";
import type {
  PoolBracket,
  PoolProfile,
  TournamentEntry,
} from "./tournament-types";
import styles from "./march-madness.module.css";

const TOTAL_PICKS = 63;

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

export function TournamentLobby({
  lifecycle,
  seasonYear,
  profile,
  entries,
  profiles,
  ownBrackets,
  userId,
}: {
  lifecycle: TournamentLifecycle;
  seasonYear: number;
  profile: PoolProfile;
  entries: TournamentEntry[];
  profiles: PoolProfile[];
  ownBrackets: PoolBracket[];
  userId: string;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!lifecycle.entryDeadline) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [lifecycle.entryDeadline]);

  const usernameByUserId = useMemo(
    () =>
      new Map(
        profiles.map((candidate) => [
          candidate.user_id,
          candidate.username,
        ]),
      ),
    [profiles],
  );
  const completedBrackets = ownBrackets.filter(
    (bracket) =>
      Object.values(bracket.picks).filter(Boolean).length === TOTAL_PICKS &&
      bracket.tiebreaker_total !== null,
  ).length;
  const entriesOpen = lifecycle.phase === "picks_open";
  const timeRemaining = lifecycle.entryDeadline
    ? countdownLabel(new Date(lifecycle.entryDeadline).getTime() - now)
    : "To be announced";

  return (
    <>
      <section className={styles.lobbyHero} id="top">
        <div>
          <span className={styles.lobbyEyebrow}>
            {entriesOpen ? "ENTRIES ARE OPEN" : "TOURNAMENT SETUP"}
          </span>
          <h1>
            Welcome, <em>@{profile.username}</em>.
          </h1>
          <p>
            See who has joined the {seasonYear} family pool. Everyone&apos;s
            picks stay private until the tournament begins.
          </p>
        </div>
        <div className={styles.lobbyActions}>
          {entriesOpen && (
            <Link className={styles.primaryLobbyAction} href="/bracket">
              <PencilLine size={18} aria-hidden="true" />
              Create or edit brackets
            </Link>
          )}
          <Link className={styles.secondaryLobbyAction} href="/history">
            <History size={18} aria-hidden="true" />
            Previous tournaments
          </Link>
        </div>
      </section>

      <section className={styles.summaryGrid} aria-label="Pool summary">
        <article>
          <Users size={19} />
          <span>Brackets joined</span>
          <strong>{entries.length}</strong>
        </article>
        <article>
          <PencilLine size={19} />
          <span>Your brackets</span>
          <strong>{ownBrackets.length}</strong>
        </article>
        <article>
          <CheckCircle2 size={19} />
          <span>Your completed</span>
          <strong>
            {completedBrackets}/{ownBrackets.length}
          </strong>
        </article>
        <article>
          <Clock3 size={19} />
          <span>{entriesOpen ? "Entries lock in" : "Entry deadline"}</span>
          <strong className={styles.countdownValue}>{timeRemaining}</strong>
        </article>
      </section>

      <section className={styles.lobbyWorkspace}>
        <div className={styles.rosterPanel}>
          <div className={styles.rosterHeading}>
            <div>
              <span>{seasonYear} FAMILY POOL</span>
              <h2>Who&apos;s joined</h2>
            </div>
            <strong>
              {entries.length} {entries.length === 1 ? "bracket" : "brackets"}
            </strong>
          </div>

          {entries.length > 0 ? (
            <ul className={styles.rosterGrid}>
              {entries.map((entry) => {
                const isCurrentUser = entry.owner_user_id === userId;
                return (
                  <li
                    className={isCurrentUser ? styles.currentRosterEntry : ""}
                    key={entry.bracket_id}
                  >
                    <div className={styles.rosterAvatar} aria-hidden="true">
                      {entry.display_name.slice(0, 1).toUpperCase()}
                    </div>
                    <div>
                      <strong>{entry.display_name}</strong>
                      <span>
                        @
                        {usernameByUserId.get(entry.owner_user_id) ??
                          "family"}
                      </span>
                    </div>
                    {isCurrentUser && <small>Your family</small>}
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className={styles.emptyRoster}>
              <Users size={28} aria-hidden="true" />
              <strong>No brackets have joined yet.</strong>
              <span>The first family bracket will appear here.</span>
            </div>
          )}
        </div>

        <aside className={styles.privacyPanel}>
          <LockKeyhole size={28} aria-hidden="true" />
          <span>PICKS STAY PRIVATE</span>
          <h2>No peeking before tipoff.</h2>
          <p>
            This lobby shares participant names only. Picks, champions, and
            tiebreakers remain protected in the database until entries lock.
          </p>
          <Link href="/history">
            <History size={16} aria-hidden="true" />
            Explore tournament history
          </Link>
        </aside>
      </section>
    </>
  );
}
