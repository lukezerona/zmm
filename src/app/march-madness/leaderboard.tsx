import { BadgeCheck, CircleX, Crown, Medal, Trophy } from "lucide-react";
import { LeaderboardEntry } from "./tournament-types";
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
}: {
  rows: LeaderboardEntry[];
  currentUserId: string;
}) {
  return (
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
            <th scope="col" data-short="Poss.">Possible left</th>
            <th scope="col" data-short="Champ">Champion</th>
            <th scope="col" data-short="TB">Break</th>
            <th scope="col" data-short="Pick %">Correct</th>
            <th scope="col" data-short="$">Money</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((entry) => {
            const isCurrentPlayer = entry.ownerUserId === currentUserId;

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
                  <strong>
                    {entry.displayName}
                    {isCurrentPlayer && (
                      <span className={styles.youBadge}>You</span>
                    )}
                  </strong>
                  <span className={styles.username}>@{entry.username}</span>
                </td>
                <td className={styles.tablePoints}>{entry.points}</td>
                <td>{entry.possiblePointsRemaining}</td>
                <td>
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
                    {!entry.championWon && entry.championEliminated && (
                      <span className={styles.eliminatedLabel}>
                        <CircleX size={12} aria-hidden="true" />
                        Eliminated
                      </span>
                    )}
                  </div>
                </td>
                <td>{entry.tiebreaker ?? "—"}</td>
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
  );
}
