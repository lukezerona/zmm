import { Crown, Medal, Trophy } from "lucide-react";
import { LeaderboardEntry } from "./tournament-types";
import styles from "./march-madness.module.css";

const MONEY_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function RankIcon({ rank }: { rank: number }) {
  if (rank === 1) return <Crown size={16} aria-label="First place" />;
  if (rank <= 3) return <Medal size={16} aria-label={`${rank} place`} />;
  return null;
}
export function Leaderboard({
  rows,
}: {
  rows: LeaderboardEntry[];
}) {
  return (
    <div className={styles.tableScroll}>
      <table className={styles.leaderboardTable}>
        <thead>
          <tr>
            <th>Place</th>
            <th>Display name</th>
            <th>Points</th>
            <th>Possible left</th>
            <th>Champion</th>
            <th>Tiebreaker</th>
            <th>Correct</th>
            <th>Money to win</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((entry) => (
            <tr key={entry.userId}>
              <td>
                <span
                  className={`${styles.rank} ${
                    entry.rank <= 3 ? styles.paidRank : ""
                  }`}
                >
                  <RankIcon rank={entry.rank} />
                  {entry.rank}
                </span>
              </td>
              <td>
                <strong>{entry.displayName}</strong>
                <span className={styles.username}>@{entry.username}</span>
              </td>
              <td className={styles.points}>{entry.points}</td>
              <td>{entry.possiblePointsRemaining}</td>
              <td>
                <span className={styles.championPick}>
                  <Trophy size={15} aria-hidden="true" />
                  {entry.champion}
                </span>
              </td>
              <td>{entry.tiebreaker ?? "—"}</td>
              <td>
                <strong>{entry.correctPercentage.toFixed(1)}%</strong>
                <span className={styles.correctCount}>
                  {entry.correctPicks}/{entry.completedGames}
                </span>
              </td>
              <td className={styles.prize}>
                {MONEY_FORMATTER.format(entry.prize)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
