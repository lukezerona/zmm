"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { LeaderboardEntry } from "./tournament-types";
import styles from "./printable-leaderboard.module.css";

const MONEY_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function subscribeToClient() {
  return () => {};
}

export function PrintableLeaderboard({
  rows,
  seasonYear,
  hidePrivatePicks,
  paymentStatusByBracket,
}: {
  rows: LeaderboardEntry[];
  seasonYear: number;
  hidePrivatePicks: boolean;
  paymentStatusByBracket?: ReadonlyMap<string, boolean>;
}) {
  const canUseDocument = useSyncExternalStore(
    subscribeToClient,
    () => true,
    () => false,
  );

  if (!canUseDocument) return null;

  const printedAt = new Intl.DateTimeFormat(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date());
  const hasPaymentDue =
    paymentStatusByBracket !== undefined &&
    rows.some(
      (entry) => paymentStatusByBracket.get(entry.bracketId) !== true,
    );

  return createPortal(
    <div id="zmm-leaderboard-print-root">
      <article className={styles.sheet}>
        <header className={styles.header}>
          <div className={styles.brand}>
            <strong>ZMM</strong>
            <span>Zerona March Madness</span>
          </div>
          <div className={styles.title}>
            <h1>{seasonYear} Leaderboard</h1>
            <span>{rows.length} participants</span>
          </div>
          <div className={styles.printedAt}>
            <span>Printed</span>
            <strong>{printedAt}</strong>
          </div>
        </header>

        <table className={styles.table}>
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
              <th scope="col">Place</th>
              <th scope="col">Participant</th>
              <th scope="col">Points</th>
              <th scope="col">Max possible points</th>
              <th scope="col">Champion</th>
              <th scope="col">Tiebreaker</th>
              <th scope="col">Correct picks</th>
              <th scope="col">Money</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((entry) => {
              const paymentDue =
                paymentStatusByBracket !== undefined &&
                paymentStatusByBracket.get(entry.bracketId) !== true;

              return (
                <tr key={entry.bracketId}>
                  <td className={styles.place}>{entry.rank}</td>
                  <td className={styles.participant}>
                    <strong>
                      {entry.displayName}
                      {paymentDue ? "*" : ""}
                    </strong>
                    <span>@{entry.username}</span>
                  </td>
                  <td className={styles.points}>{entry.points}</td>
                  <td>{entry.points + entry.possiblePointsRemaining}</td>
                  <td>
                    {hidePrivatePicks ? (
                      <span className={styles.hidden}>Hidden</span>
                    ) : (
                      <>
                        {entry.champion}
                        {entry.championWon
                          ? " (Champion)"
                          : entry.championEliminated
                            ? " (Eliminated)"
                            : ""}
                      </>
                    )}
                  </td>
                  <td>
                    {hidePrivatePicks
                      ? "Hidden"
                      : (entry.tiebreaker ?? "—")}
                  </td>
                  <td>
                    <strong>{entry.correctPercentage.toFixed(1)}%</strong>
                    <span className={styles.correctCount}>
                      {entry.correctPicks}/{entry.completedGames}
                    </span>
                  </td>
                  <td className={styles.money}>
                    {entry.prize > 0
                      ? MONEY_FORMATTER.format(entry.prize)
                      : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <footer className={styles.footer}>
          <span>
            $10 buy-in · First place 60% · Second place 30% · Third place
            10%
          </span>
          {hasPaymentDue && <span>* Payment due</span>}
          <span>zmm-eta.vercel.app</span>
        </footer>
      </article>
    </div>,
    document.body,
  );
}
