"use client";

import { useMemo, useState } from "react";
import { Printer } from "lucide-react";
import { deriveBracket } from "../bracket/bracket-utils";
import { TournamentModel } from "../bracket/bracket-types";
import { PrintableBlankBracket } from "../bracket/printable-bracket";
import {
  LeaderboardEntry,
  PoolBracket,
  TournamentGame,
} from "./tournament-types";
import { TournamentBracketCanvas } from "./tournament-bracket-canvas";
import { buildActualResults } from "./tournament-utils";
import styles from "./march-madness.module.css";

const MASTER_VALUE = "master";

export function TournamentBracketViewer({
  model,
  games,
  brackets,
  currentUserId,
  leaderboardRows,
}: {
  model: TournamentModel;
  games: TournamentGame[];
  brackets: PoolBracket[];
  currentUserId: string;
  leaderboardRows: LeaderboardEntry[];
}) {
  const orderedBrackets = useMemo(() => {
    const rankByBracket = new Map(
      leaderboardRows.map((entry, index) => [entry.bracketId, index]),
    );

    return [...brackets].sort((a, b) => {
      const rankDifference =
        (rankByBracket.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
        (rankByBracket.get(b.id) ?? Number.MAX_SAFE_INTEGER);

      if (rankDifference !== 0) return rankDifference;

      return a.display_name.localeCompare(b.display_name);
    });
  }, [brackets, leaderboardRows]);
  const [selectedValue, setSelectedValue] = useState(MASTER_VALUE);
  const selectedBracket = orderedBrackets.find(
    (bracket) => bracket.id === selectedValue,
  );
  const playerBracket = selectedBracket
    ? deriveBracket(model, selectedBracket.picks)
    : null;
  const actualPicks = useMemo(
    () => buildActualResults(model, games).actualPicks,
    [games, model],
  );
  const selectedBracketName =
    selectedValue === MASTER_VALUE
      ? "Master tournament results"
      : `${selectedBracket?.display_name ?? "Unknown player"}${
          selectedBracket?.user_id === currentUserId ? " (You)" : ""
        }`;

  return (
    <div className={styles.bracketViewer}>
      <div className={styles.bracketViewerToolbar}>
        <div>
          <span>Viewing bracket</span>
          <strong>{selectedBracketName}</strong>
        </div>
        <div className={styles.bracketViewerControls}>
          <label>
            <span>Choose a bracket</span>
            <select
              value={selectedValue}
              onChange={(event) => setSelectedValue(event.target.value)}
            >
              <option value={MASTER_VALUE}>Master bracket</option>
              <optgroup label="Family brackets">
                {orderedBrackets.map((savedBracket) => {
                  return (
                    <option
                      value={savedBracket.id}
                      key={savedBracket.id}
                    >
                      {savedBracket.display_name}
                      {savedBracket.user_id === currentUserId ? " (You)" : ""}
                    </option>
                  );
                })}
              </optgroup>
            </select>
          </label>
          <button
            type="button"
            className={styles.printBracketButton}
            onClick={() => window.print()}
          >
            <Printer size={17} aria-hidden="true" />
            Print bracket
          </button>
        </div>
      </div>

      <PrintableBlankBracket model={model} />

      {selectedValue === MASTER_VALUE ? (
        <TournamentBracketCanvas
          model={model}
          view={{ type: "master", games }}
        />
      ) : selectedBracket && playerBracket ? (
        <TournamentBracketCanvas
          model={model}
          view={{
            type: "player",
            bracket: playerBracket,
            picks: selectedBracket.picks,
            actualPicks,
            tiebreaker: selectedBracket.tiebreaker_total,
          }}
        />
      ) : (
        <p className={styles.emptyState}>This bracket is not available.</p>
      )}
    </div>
  );
}
