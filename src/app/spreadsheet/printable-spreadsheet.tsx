"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import {
  BracketEntry,
  PickMap,
} from "../bracket/bracket-types";
import {
  LeaderboardEntry,
  PoolBracket,
  TournamentGame,
} from "../march-madness/tournament-types";
import { PickColumn, PickGroup } from "./spreadsheet-order";
import styles from "./printable-spreadsheet.module.css";

const PICK_COLUMNS_PER_PAGE = 6;
const GAME_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/New_York",
});

type PrintableColumn = {
  groupLabel: string;
  groupDate: string;
  column: PickColumn;
};

type PickResult =
  | "correct"
  | "incorrect"
  | "projectedCorrect"
  | "projectedIncorrect"
  | "pending";

function subscribeToClient() {
  return () => {};
}

function chunk<T>(values: T[], size: number) {
  return Array.from(
    { length: Math.ceil(values.length / size) },
    (_, index) => values.slice(index * size, index * size + size),
  );
}

function groupSpans(columns: PrintableColumn[]) {
  return columns.reduce<
    { key: string; label: string; date: string; count: number }[]
  >((spans, item) => {
    const key = `${item.groupLabel}:${item.groupDate}`;
    const previous = spans.at(-1);
    if (previous?.key === key) {
      previous.count += 1;
    } else {
      spans.push({
        key,
        label: item.groupLabel,
        date: item.groupDate,
        count: 1,
      });
    }
    return spans;
  }, []);
}

function teamLabel(entry: BracketEntry | null | undefined) {
  return entry ? `#${entry.seed} ${entry.name}` : "—";
}

function teamScore(
  seed: number | null,
  name: string | null,
  score: number | null,
) {
  const team = `${seed ? `#${seed} ` : ""}${name || "TBD"}`;
  return score === null ? team : `${team}  ${score}`;
}

function gameStatus(game: TournamentGame | undefined) {
  if (!game) return "";
  if (game.completed) return "Final";
  if (game.status_state === "in") {
    return `${game.status_detail || game.clock || "Live"}${
      game.broadcast ? ` · ${game.broadcast}` : ""
    }`;
  }

  const startsAt = new Date(game.starts_at);
  const time = Number.isFinite(startsAt.getTime())
    ? GAME_TIME_FORMATTER.format(startsAt)
    : "";
  return `${time}${time && game.broadcast ? " · " : ""}${
    game.broadcast || ""
  }`;
}

function resultForPick(
  matchupId: string,
  pickedId: string | undefined,
  actualPicks: PickMap,
  displayedOutcomePicks: PickMap,
  rainManActive: boolean,
): PickResult {
  const actualWinner = actualPicks[matchupId];
  if (actualWinner) {
    return actualWinner === pickedId ? "correct" : "incorrect";
  }

  const projectedWinner = rainManActive
    ? displayedOutcomePicks[matchupId]
    : undefined;
  if (projectedWinner) {
    return projectedWinner === pickedId
      ? "projectedCorrect"
      : "projectedIncorrect";
  }
  return "pending";
}

function PickValue({
  entry,
  result,
}: {
  entry: BracketEntry | null;
  result: PickResult;
}) {
  if (!entry) return <span className={styles.emptyPick}>—</span>;

  const marker =
    result === "correct"
      ? "✓ "
      : result === "incorrect"
        ? "✕ "
        : result === "projectedCorrect" ||
            result === "projectedIncorrect"
          ? "◇ "
          : "";

  return (
    <span
      className={
        result === "incorrect"
          ? styles.incorrectPick
          : result === "projectedIncorrect"
            ? `${styles.incorrectPick} ${styles.projectedPick}`
            : result === "correct"
              ? styles.correctPick
              : result === "projectedCorrect"
                ? styles.projectedPick
                : undefined
      }
    >
      {marker}
      {teamLabel(entry)}
    </span>
  );
}

export function PrintableSpreadsheet({
  seasonYear,
  isArchive,
  groups,
  rows,
  bracketById,
  entries,
  gameByMatchup,
  actualPicks,
  displayedOutcomePicks,
  rainManActive,
  masterScore,
  masterTiebreaker,
}: {
  seasonYear: number;
  isArchive: boolean;
  groups: PickGroup[];
  rows: LeaderboardEntry[];
  bracketById: ReadonlyMap<string, PoolBracket>;
  entries: ReadonlyMap<string, BracketEntry>;
  gameByMatchup: ReadonlyMap<string, TournamentGame>;
  actualPicks: PickMap;
  displayedOutcomePicks: PickMap;
  rainManActive: boolean;
  masterScore: { points: number; pointsLeft: number };
  masterTiebreaker: string | number | null;
}) {
  const canUseDocument = useSyncExternalStore(
    subscribeToClient,
    () => true,
    () => false,
  );

  if (!canUseDocument) return null;

  const flattenedColumns = groups.flatMap((group) =>
    group.columns.map((column) => ({
      groupLabel: group.label,
      groupDate: group.date,
      column,
    })),
  );
  const pageGroups = chunk(flattenedColumns, PICK_COLUMNS_PER_PAGE);
  const printedAt = new Intl.DateTimeFormat(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date());

  return createPortal(
    <div id="zmm-spreadsheet-print-root">
      {pageGroups.map((pageColumns, pageIndex) => (
        <section
          className={styles.pageGroup}
          key={pageColumns.map((item) => item.column.id).join(":")}
        >
          <header className={styles.header}>
            <div className={styles.brand}>
              <strong>ZMM</strong>
              <span>Zerona March Madness</span>
            </div>
            <div className={styles.title}>
              <h1>{seasonYear} Family Spreadsheet</h1>
              <span>
                {isArchive ? "Tournament archive" : "Current tournament"} ·
                Picks {pageIndex * PICK_COLUMNS_PER_PAGE + 1}–
                {pageIndex * PICK_COLUMNS_PER_PAGE + pageColumns.length} of{" "}
                {flattenedColumns.length}
              </span>
            </div>
            <div className={styles.pageNumber}>
              <span>Section</span>
              <strong>
                {pageIndex + 1} of {pageGroups.length}
              </strong>
            </div>
          </header>

          <table className={styles.table}>
            <colgroup>
              <col className={styles.rankColumn} />
              <col className={styles.participantColumn} />
              <col className={styles.pointsColumn} />
              <col className={styles.pointsLeftColumn} />
              <col className={styles.tiebreakerColumn} />
              {pageColumns.map((item) => (
                <col className={styles.pickColumn} key={item.column.id} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th rowSpan={3} scope="col">
                  Rank
                </th>
                <th rowSpan={3} scope="col">
                  Participant
                </th>
                <th rowSpan={3} scope="col">
                  Points
                </th>
                <th rowSpan={3} scope="col">
                  Left
                </th>
                <th rowSpan={3} scope="col">
                  TB
                </th>
                {groupSpans(pageColumns).map((span) => (
                  <th
                    className={styles.roundHeader}
                    colSpan={span.count}
                    key={span.key}
                    scope="colgroup"
                  >
                    {span.label}
                    <span>{span.date}</span>
                  </th>
                ))}
              </tr>
              <tr>
                {pageColumns.map(({ column }) => {
                  const game = gameByMatchup.get(column.id);
                  return (
                    <th
                      className={styles.gameHeader}
                      key={column.id}
                      scope="col"
                    >
                      <strong>{column.label}</strong>
                      {game ? (
                        <>
                          <span>
                            {teamScore(
                              game.home_team_seed,
                              game.home_team_name,
                              game.home_score,
                            )}
                          </span>
                          <span>
                            {teamScore(
                              game.away_team_seed,
                              game.away_team_name,
                              game.away_score,
                            )}
                          </span>
                        </>
                      ) : (
                        <span>TBD</span>
                      )}
                    </th>
                  );
                })}
              </tr>
              <tr>
                {pageColumns.map(({ column }) => (
                  <th className={styles.statusHeader} key={column.id}>
                    {gameStatus(gameByMatchup.get(column.id))}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className={styles.masterRow}>
                <td>★</td>
                <th scope="row">
                  <strong>Master</strong>
                  <span>
                    {rainManActive ? "Rain Man scenario" : "Official results"}
                  </span>
                </th>
                <td>{masterScore.points}</td>
                <td>{masterScore.pointsLeft}</td>
                <td>
                  {masterTiebreaker === ""
                    ? "—"
                    : (masterTiebreaker ?? "—")}
                </td>
                {pageColumns.map(({ column }) => {
                  const entryId = displayedOutcomePicks[column.id];
                  return (
                    <td key={column.id}>
                      {teamLabel(entryId ? entries.get(entryId) : null)}
                    </td>
                  );
                })}
              </tr>
              {rows.map((row) => {
                const bracket = bracketById.get(row.bracketId);
                return (
                  <tr key={row.bracketId}>
                    <td className={styles.rank}>{row.rank}</td>
                    <th className={styles.participant} scope="row">
                      <strong>{row.displayName}</strong>
                      <span>@{row.username}</span>
                    </th>
                    <td className={styles.metric}>{row.points}</td>
                    <td className={styles.metric}>
                      {row.possiblePointsRemaining}
                    </td>
                    <td className={styles.metric}>
                      {row.tiebreaker ?? "—"}
                    </td>
                    {pageColumns.map(({ column }) => {
                      const pickedId = bracket?.picks[column.id];
                      const entry = pickedId ? entries.get(pickedId) : null;
                      return (
                        <td key={column.id}>
                          <PickValue
                            entry={entry ?? null}
                            result={resultForPick(
                              column.id,
                              pickedId,
                              actualPicks,
                              displayedOutcomePicks,
                              rainManActive,
                            )}
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>

          <footer className={styles.footer}>
            <span>✓ Correct · ✕ Incorrect · ◇ Rain Man projection</span>
            <span>Printed {printedAt}</span>
            <span>zmm-eta.vercel.app</span>
          </footer>
        </section>
      ))}
    </div>,
    document.body,
  );
}
