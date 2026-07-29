"use client";

import { ChevronRight, Radio, RefreshCw, Trophy } from "lucide-react";
import { useMemo } from "react";
import { TournamentModel } from "../bracket/bracket-types";
import {
  buildMasterTeamOrder,
  MasterGameCard,
} from "./tournament-bracket-canvas";
import { LeaderboardEntry, TournamentGame } from "./tournament-types";
import styles from "./march-madness.module.css";

const DAY_KEY_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "America/New_York",
});

const DAY_LABEL_FORMATTER = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  timeZone: "America/New_York",
});

type LiveUpdateStatus =
  | "connecting"
  | "connected"
  | "updating"
  | "reconnecting"
  | "offline";

function gameDayKey(game: TournamentGame) {
  return DAY_KEY_FORMATTER.format(new Date(game.starts_at));
}

function gameTime(game: TournamentGame) {
  return new Date(game.starts_at).getTime();
}

function selectGameDay(games: TournamentGame[]) {
  const tournamentGames = games
    .filter(
      (game) => game.round_number !== null && game.round_number >= 1,
    )
    .sort((left, right) => gameTime(left) - gameTime(right));
  const liveGames = tournamentGames.filter(
    (game) => game.status_state === "in" && !game.completed,
  );
  const unfinishedGames = tournamentGames.filter(
    (game) => !game.completed && game.status_state !== "in",
  );
  const completedGames = tournamentGames.filter((game) => game.completed);
  const anchorGame =
    liveGames[0] ??
    unfinishedGames[0] ??
    completedGames[completedGames.length - 1];

  if (!anchorGame) {
    return {
      dayLabel: "Tournament schedule",
      live: [],
      upcoming: [],
      final: [],
    };
  }

  const activeDayKey = gameDayKey(anchorGame);
  const dayGames = tournamentGames.filter(
    (game) => gameDayKey(game) === activeDayKey,
  );

  return {
    dayLabel: DAY_LABEL_FORMATTER.format(new Date(anchorGame.starts_at)),
    live: dayGames.filter(
      (game) => game.status_state === "in" && !game.completed,
    ),
    upcoming: dayGames.filter(
      (game) => !game.completed && game.status_state !== "in",
    ),
    final: dayGames.filter((game) => game.completed),
  };
}

function StandingPreviewRow({
  entry,
  currentUserId,
  paymentStatusByBracket,
}: {
  entry: LeaderboardEntry;
  currentUserId: string;
  paymentStatusByBracket: ReadonlyMap<string, boolean>;
}) {
  const isCurrentUser = entry.ownerUserId === currentUserId;
  const paymentDue =
    paymentStatusByBracket.get(entry.bracketId) !== true;

  return (
    <article
      className={`${styles.mobileStandingPreviewRow} ${
        isCurrentUser ? styles.mobileStandingPreviewCurrent : ""
      }`}
    >
      <span className={styles.mobileStandingRank}>{entry.rank}</span>
      <div className={styles.mobileStandingIdentity}>
        <strong className={paymentDue ? styles.paymentDueName : ""}>
          {entry.displayName}
        </strong>
        <span>
          @{entry.username}
          {isCurrentUser ? " · You" : ""}
        </span>
      </div>
      <div className={styles.mobileStandingPoints}>
        <strong>{entry.points}</strong>
        <span>
          {entry.points + entry.possiblePointsRemaining} max possible points
        </span>
      </div>
    </article>
  );
}

function GameSection({
  title,
  games,
  teamOrder,
}: {
  title: string;
  games: TournamentGame[];
  teamOrder: Map<string, number>;
}) {
  if (games.length === 0) return null;

  return (
    <section className={styles.mobileGameSection}>
      <div className={styles.mobileGameSectionHeading}>
        <h3>{title}</h3>
        <span>
          {games.length} {games.length === 1 ? "game" : "games"}
        </span>
      </div>
      <div className={styles.mobileGameList}>
        {games.map((game) => (
          <MasterGameCard
            key={game.espn_event_id}
            matchupId={game.espn_event_id}
            roundNumber={game.round_number ?? 1}
            game={game}
            teamOrder={teamOrder}
          />
        ))}
      </div>
    </section>
  );
}

export function MobileTournamentOverview({
  model,
  games,
  leaderboardRows,
  currentUserId,
  paymentStatusByBracket,
  lastUpdated,
  liveStatusLabel,
  liveUpdateStatus,
  refreshing,
  onRefresh,
  onViewLeaderboard,
}: {
  model: TournamentModel;
  games: TournamentGame[];
  leaderboardRows: LeaderboardEntry[];
  currentUserId: string;
  paymentStatusByBracket: ReadonlyMap<string, boolean>;
  lastUpdated: Date | null;
  liveStatusLabel: string;
  liveUpdateStatus: LiveUpdateStatus;
  refreshing: boolean;
  onRefresh: () => void;
  onViewLeaderboard: () => void;
}) {
  const gameDay = useMemo(() => selectGameDay(games), [games]);
  const teamOrder = useMemo(() => buildMasterTeamOrder(model), [model]);
  const topRows = leaderboardRows.slice(0, 3);
  const pinnedUserRow = leaderboardRows.find(
    (entry) =>
      entry.ownerUserId === currentUserId &&
      !topRows.some((topEntry) => topEntry.bracketId === entry.bracketId),
  );
  const statusClass =
    liveUpdateStatus === "connected"
      ? styles.liveConnected
      : liveUpdateStatus === "updating"
        ? styles.liveUpdating
        : styles.liveReconnecting;
  const hasGames =
    gameDay.live.length + gameDay.upcoming.length + gameDay.final.length > 0;

  return (
    <div className={styles.mobileTournamentOverview}>
      <section className={styles.mobileGameDay}>
        <div className={styles.mobileOverviewHeading}>
          <div>
            <span>GAME DAY</span>
            <h1>{gameDay.dayLabel}</h1>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            aria-label="Refresh tournament data"
          >
            <RefreshCw
              className={refreshing ? styles.spinner : ""}
              size={18}
              aria-hidden="true"
            />
          </button>
        </div>

        <div className={styles.mobileLiveUpdateRow}>
          <span
            className={`${styles.liveStatus} ${statusClass}`}
            role="status"
            aria-live="polite"
          >
            <i aria-hidden="true" />
            {liveStatusLabel}
          </span>
          {lastUpdated && (
            <span>
              Updated{" "}
              {lastUpdated.toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
          )}
        </div>

        {!hasGames && (
          <div className={styles.mobileNoGames}>
            <Radio size={22} aria-hidden="true" />
            <strong>No games are available yet.</strong>
          </div>
        )}

        <GameSection
          title="Live now"
          games={gameDay.live}
          teamOrder={teamOrder}
        />
        <GameSection
          title="Up next"
          games={gameDay.upcoming}
          teamOrder={teamOrder}
        />
        <GameSection
          title="Final"
          games={gameDay.final}
          teamOrder={teamOrder}
        />
      </section>

      <section className={styles.mobileLeaderboardPreview}>
        <div className={styles.mobilePreviewHeading}>
          <div>
            <span>FAMILY STANDINGS</span>
            <h2>Leaderboard</h2>
          </div>
          <Trophy size={22} aria-hidden="true" />
        </div>

        <div className={styles.mobileStandingPreviewList}>
          {topRows.map((entry) => (
            <StandingPreviewRow
              key={entry.bracketId}
              entry={entry}
              currentUserId={currentUserId}
              paymentStatusByBracket={paymentStatusByBracket}
            />
          ))}
          {pinnedUserRow && (
            <>
              <div className={styles.mobileStandingDivider}>
                <span>Your best bracket</span>
              </div>
              <StandingPreviewRow
                entry={pinnedUserRow}
                currentUserId={currentUserId}
                paymentStatusByBracket={paymentStatusByBracket}
              />
            </>
          )}
        </div>

        <button
          type="button"
          className={styles.mobileViewLeaderboardButton}
          onClick={onViewLeaderboard}
        >
          View full leaderboard
          <ChevronRight size={17} aria-hidden="true" />
        </button>
      </section>
    </div>
  );
}
