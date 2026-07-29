"use client";

import { useMemo, useState } from "react";
import { Printer } from "lucide-react";
import { deriveBracket } from "../bracket/bracket-utils";
import { TournamentModel } from "../bracket/bracket-types";
import {
  PrintBracketDialog,
  PrintBracketMode,
} from "../bracket/print-bracket-dialog";
import { PrintableBracket } from "../bracket/printable-bracket";
import {
  LeaderboardEntry,
  PoolBracket,
  TournamentGame,
} from "./tournament-types";
import {
  BracketView,
  TournamentBracketCanvas,
} from "./tournament-bracket-canvas";
import { MobileTournamentBracket } from "./mobile-tournament-bracket";
import { buildActualResults } from "./tournament-utils";
import { useMobileTournamentViewport } from "./use-mobile-tournament-viewport";
import styles from "./march-madness.module.css";

const MASTER_VALUE = "master";

export function TournamentBracketViewer({
  model,
  games,
  brackets,
  currentUserId,
  leaderboardRows,
  masterOnly = false,
}: {
  model: TournamentModel;
  games: TournamentGame[];
  brackets: PoolBracket[];
  currentUserId: string;
  leaderboardRows: LeaderboardEntry[];
  masterOnly?: boolean;
}) {
  const isMobileTournamentViewport = useMobileTournamentViewport();
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
  const [showPrintOptions, setShowPrintOptions] = useState(false);
  const [printMode, setPrintMode] = useState<PrintBracketMode>("blank");
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
  const masterPrintableBracket = useMemo(
    () => deriveBracket(model, actualPicks),
    [actualPicks, model],
  );
  const selectedBracketName =
    selectedValue === MASTER_VALUE
      ? "Master tournament results"
      : `${selectedBracket?.display_name ?? "Unknown player"}${
          selectedBracket?.user_id === currentUserId ? " (You)" : ""
        }`;
  const printableBracket =
    selectedValue === MASTER_VALUE
      ? masterPrintableBracket
      : playerBracket;
  const incorrectPickMatchups = useMemo(() => {
    if (!selectedBracket) return new Set<string>();

    return new Set(
      Object.entries(actualPicks)
        .filter(
          ([matchupId, actualWinnerId]) =>
            selectedBracket.picks[matchupId] !== undefined &&
            selectedBracket.picks[matchupId] !== actualWinnerId,
        )
        .map(([matchupId]) => matchupId),
    );
  }, [actualPicks, selectedBracket]);
  const displayedView: BracketView | null =
    selectedValue === MASTER_VALUE
      ? { type: "master", games, fieldOnly: masterOnly }
      : selectedBracket && playerBracket
        ? {
            type: "player",
            bracket: playerBracket,
            picks: selectedBracket.picks,
            actualPicks,
            tiebreaker: selectedBracket.tiebreaker_total,
          }
        : null;

  function printBracket(mode: PrintBracketMode) {
    setPrintMode(mode);
    setShowPrintOptions(false);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => window.print());
    });
  }

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
              disabled={masterOnly}
              title={
                masterOnly
                  ? "Family brackets become available after entries lock."
                  : undefined
              }
            >
              <option value={MASTER_VALUE}>Master bracket</option>
              {!masterOnly && (
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
              )}
            </select>
          </label>
          <button
            type="button"
            className={styles.printBracketButton}
            onClick={() => setShowPrintOptions(true)}
          >
            <Printer size={17} aria-hidden="true" />
            Print bracket
          </button>
        </div>
      </div>

      <PrintableBracket
        model={model}
        bracket={printableBracket}
        variant={printMode}
        displayName={selectedBracketName}
        tiebreaker={selectedBracket?.tiebreaker_total}
        incorrectPickMatchups={incorrectPickMatchups}
      />

      <PrintBracketDialog
        open={showPrintOptions}
        onClose={() => setShowPrintOptions(false)}
        onSelect={printBracket}
      />

      {displayedView ? (
        isMobileTournamentViewport ? (
          <MobileTournamentBracket model={model} view={displayedView} />
        ) : (
          <TournamentBracketCanvas model={model} view={displayedView} />
        )
      ) : (
        <p className={styles.emptyState}>This bracket is not available.</p>
      )}
    </div>
  );
}
