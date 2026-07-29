"use client";

import {
  BadgeCheck,
  CircleX,
  Crown,
  Medal,
  Printer,
  Trophy,
} from "lucide-react";
import { PrintableLeaderboard } from "./printable-leaderboard";
import { LeaderboardEntry } from "./tournament-types";
import { useMobileTournamentViewport } from "./use-mobile-tournament-viewport";
import styles from "./march-madness.module.css";

const MONEY_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function RankIcon({ rank }: { rank: number }) {
  if (rank === 1) return <Crown size={15} aria-hidden="true" />;
  if (rank <= 3) return <Medal size={15} aria-hidden="true" />;
  return null;
}

export function Leaderboard({
  rows,
  currentUserId,
  seasonYear,
  hidePrivatePicks = false,
  paymentStatusByBracket,
}: {
  rows: LeaderboardEntry[];
  currentUserId: string;
  seasonYear: number;
  hidePrivatePicks?: boolean;
  paymentStatusByBracket?: ReadonlyMap<string, boolean>;
}) {
  const isMobileTournamentViewport = useMobileTournamentViewport();
  const hasPaymentDue =
    paymentStatusByBracket !== undefined &&
    rows.some(
      (entry) => paymentStatusByBracket.get(entry.bracketId) !== true,
    );

  function printLeaderboard() {
    const printClass = "zmm-printing-leaderboard";
    let cleanupTimer = 0;
    const cleanup = () => {
      window.clearTimeout(cleanupTimer);
      document.body.classList.remove(printClass);
      window.removeEventListener("afterprint", cleanup);
    };

    document.body.classList.add(printClass);
    window.addEventListener("afterprint", cleanup, { once: true });
    cleanupTimer = window.setTimeout(cleanup, 60_000);
    window.requestAnimationFrame(() => window.print());
  }

  return (
    <div className={styles.leaderboardBlock}>
      <div className={styles.leaderboardPrintBar}>
        <button type="button" onClick={printLeaderboard}>
          <Printer size={15} aria-hidden="true" />
          Print leaderboard
        </button>
      </div>
      {hasPaymentDue && (
        <div
          className={styles.paymentLegend}
          aria-label="Yellow participant names indicate payment due"
        >
          <span aria-hidden="true" />
          Payment due
        </div>
      )}
      {!isMobileTournamentViewport && (
      <div className={styles.leaderboardTableViewport}>
      <table className={styles.compactLeaderboardTable}>
        <colgroup>
          <col className={styles.placeColumn} />
          <col className={styles.nameColumn} />
          <col className={styles.pointsColumn} />
          <col className={styles.possibleColumn} />
          <col className={styles.championColumn} />
          <col className={styles.tiebreakerColumn} />
          <col className={styles.correctColumn} />
          <col className={styles.moneyColumn} />
        </colgroup>
        <thead>
          <tr>
            <th scope="col" data-short="Place">Place</th>
            <th scope="col" data-short="Name">Name</th>
            <th scope="col" data-short="Pts">Points</th>
            <th scope="col" data-short="Max">Max points</th>
            <th scope="col" data-short="Champ">Champion</th>
            <th scope="col" data-short="TB">Break</th>
            <th scope="col" data-short="Pick %">Correct</th>
            <th scope="col" data-short="$">Money</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((entry) => {
            const isCurrentPlayer = entry.ownerUserId === currentUserId;
            const paymentDue =
              paymentStatusByBracket !== undefined &&
              paymentStatusByBracket.get(entry.bracketId) !== true;

            return (
              <tr
                key={entry.bracketId}
                className={isCurrentPlayer ? styles.currentPlayerRow : ""}
              >
                <td>
                  <span
                    className={`${styles.rank} ${
                      entry.rank <= 3 ? styles.paidRank : ""
                    }`}
                    aria-label={`Place ${entry.rank}`}
                  >
                    <RankIcon rank={entry.rank} />
                    {entry.rank}
                  </span>
                </td>
                <td className={styles.playerTableIdentity}>
                  <strong className={paymentDue ? styles.paymentDueName : ""}>
                    {entry.displayName}
                    {isCurrentPlayer && (
                      <span className={styles.youBadge}>You</span>
                    )}
                  </strong>
                  <span className={styles.username}>@{entry.username}</span>
                </td>
                <td className={styles.tablePoints}>{entry.points}</td>
                <td>{entry.points + entry.possiblePointsRemaining}</td>
                <td>
                  {hidePrivatePicks ? (
                    <span
                      className={styles.privatePickPlaceholder}
                      title="Hidden until entries lock"
                    >
                      Hidden
                    </span>
                  ) : (
                    <div className={styles.tableChampionCell}>
                      <span
                        className={`${styles.championPick} ${
                          entry.championWon
                            ? styles.winningChampionPick
                            : entry.championEliminated
                              ? styles.eliminatedChampionPick
                              : ""
                        }`}
                      >
                        <Trophy size={14} aria-hidden="true" />
                        {entry.champion}
                      </span>
                      {entry.championWon && (
                        <span className={styles.championWonLabel}>
                          <BadgeCheck size={12} aria-hidden="true" />
                          Champion
                        </span>
                      )}
                      {!entry.championWon &&
                        entry.championEliminated && (
                          <span className={styles.eliminatedLabel}>
                            <CircleX size={12} aria-hidden="true" />
                            Eliminated
                          </span>
                        )}
                    </div>
                  )}
                </td>
                <td>
                  {hidePrivatePicks ? (
                    <span
                      className={styles.privatePickPlaceholder}
                      title="Hidden until entries lock"
                    >
                      Hidden
                    </span>
                  ) : (
                    (entry.tiebreaker ?? "—")
                  )}
                </td>
                <td>
                  <strong>{entry.correctPercentage.toFixed(1)}%</strong>
                  <span className={styles.correctCount}>
                    {entry.correctPicks}/{entry.completedGames}
                  </span>
                </td>
                <td className={styles.prize}>
                  {entry.prize > 0
                    ? MONEY_FORMATTER.format(entry.prize)
                    : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      )}
      {isMobileTournamentViewport && (
      <ol className={styles.mobileLeaderboardList}>
        {rows.map((entry) => {
          const isCurrentPlayer = entry.ownerUserId === currentUserId;
          const paymentDue =
            paymentStatusByBracket !== undefined &&
            paymentStatusByBracket.get(entry.bracketId) !== true;

          return (
            <li
              key={entry.bracketId}
              className={`${styles.leaderboardEntry} ${
                isCurrentPlayer ? styles.currentPlayerEntry : ""
              }`}
            >
              <div className={styles.leaderboardEntryHeading}>
                <span
                  className={`${styles.rank} ${
                    entry.rank <= 3 ? styles.paidRank : ""
                  }`}
                  aria-label={`Place ${entry.rank}`}
                >
                  <RankIcon rank={entry.rank} />
                  {entry.rank}
                </span>
                <div className={styles.playerIdentity}>
                  <strong
                    className={paymentDue ? styles.paymentDueName : ""}
                  >
                    {entry.displayName}
                    {isCurrentPlayer && (
                      <span className={styles.youBadge}>You</span>
                    )}
                  </strong>
                  <span className={styles.username}>@{entry.username}</span>
                </div>
                <div className={styles.pointsSummary}>
                  <span>Points</span>
                  <strong>{entry.points}</strong>
                </div>
              </div>

              <div className={styles.compactChampion}>
                <span>Champion</span>
                {hidePrivatePicks ? (
                  <span className={styles.privatePickPlaceholder}>
                    Hidden until entries lock
                  </span>
                ) : (
                  <div className={styles.championCell}>
                    <span
                      className={`${styles.championPick} ${
                        entry.championWon
                          ? styles.winningChampionPick
                          : entry.championEliminated
                            ? styles.eliminatedChampionPick
                            : ""
                      }`}
                    >
                      <Trophy size={14} aria-hidden="true" />
                      {entry.champion}
                    </span>
                    {entry.championWon && (
                      <span className={styles.championWonLabel}>
                        <BadgeCheck size={12} aria-hidden="true" />
                        Champion
                      </span>
                    )}
                    {!entry.championWon && entry.championEliminated && (
                      <span className={styles.eliminatedLabel}>
                        <CircleX size={12} aria-hidden="true" />
                        Eliminated
                      </span>
                    )}
                  </div>
                )}
              </div>

              <dl className={styles.leaderboardMetrics}>
                <div>
                  <dt>Max points</dt>
                  <dd>{entry.points + entry.possiblePointsRemaining}</dd>
                </div>
                <div>
                  <dt>Tiebreak</dt>
                  <dd>
                    {hidePrivatePicks ? "Hidden" : (entry.tiebreaker ?? "—")}
                  </dd>
                </div>
                <div>
                  <dt>Correct</dt>
                  <dd>{entry.correctPercentage.toFixed(1)}%</dd>
                </div>
                <div>
                  <dt>Money</dt>
                  <dd className={styles.prize}>
                    {entry.prize > 0
                      ? MONEY_FORMATTER.format(entry.prize)
                      : "—"}
                  </dd>
                </div>
              </dl>
            </li>
          );
        })}
      </ol>
      )}
      <PrintableLeaderboard
        rows={rows}
        seasonYear={seasonYear}
        hidePrivatePicks={hidePrivatePicks}
        paymentStatusByBracket={paymentStatusByBracket}
      />
    </div>
  );
}
