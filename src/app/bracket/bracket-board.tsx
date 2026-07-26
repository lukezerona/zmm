"use client";

import { Trophy } from "lucide-react";
import {
  BracketMatchup,
  DerivedBracket,
  PickMap,
  Region,
  TournamentModel,
} from "./bracket-types";
import styles from "./bracket.module.css";

const REGION_NAMES: Record<Region, string> = {
  east: "East",
  west: "West",
  south: "South",
  midwest: "Midwest",
};

type MatchCardProps = {
  matchup: BracketMatchup;
  pickedId?: string;
  onPick: (matchupId: string, entryId: string) => void;
  compact?: boolean;
  readOnly?: boolean;
};

function MatchCard({
  matchup,
  pickedId,
  onPick,
  compact = false,
  readOnly = false,
}: MatchCardProps) {
  return (
    <article
      className={`${styles.matchup} ${compact ? styles.compactMatchup : ""}`}
      data-matchup-id={matchup.id}
    >
      <span className={styles.srOnly}>
        Round {matchup.roundNumber}, matchup {matchup.matchupIndex + 1}
      </span>
      {matchup.options.map((entry, slotIndex) =>
        entry ? (
          <button
            key={entry.id}
            type="button"
            className={`${styles.teamButton} ${
              pickedId === entry.id ? styles.selectedTeam : ""
            }`}
            onClick={() => onPick(matchup.id, entry.id)}
            aria-pressed={pickedId === entry.id}
            disabled={readOnly}
            title={entry.isPlayIn ? `Play-in slot: ${entry.name}` : entry.name}
          >
            <strong>#{entry.seed}</strong>
            <span>{entry.name}</span>
          </button>
        ) : (
          <div className={styles.awaitingTeam} key={`${matchup.id}-${slotIndex}`}>
            <strong>—</strong>
            <span>Awaiting pick</span>
          </div>
        ),
      )}
    </article>
  );
}

type RegionBracketProps = {
  region: Region;
  bracket: DerivedBracket;
  picks: PickMap;
  onPick: (matchupId: string, entryId: string) => void;
  side: "left" | "right";
  roundDates: TournamentModel["roundDates"];
  showHeading?: boolean;
  readOnly?: boolean;
};

function RegionBracket({
  region,
  bracket,
  picks,
  onPick,
  side,
  roundDates,
  showHeading = true,
  readOnly = false,
}: RegionBracketProps) {
  const rounds = bracket.regions[region];
  const columns = [
    {
      label: "Round of 64",
      date: roundDates.roundOf64,
      matchups: rounds.roundOf64,
    },
    {
      label: "Round of 32",
      date: roundDates.roundOf32,
      matchups: rounds.roundOf32,
    },
    {
      label: "Sweet 16",
      date: roundDates.sweet16,
      matchups: rounds.sweet16,
    },
    {
      label: "Elite 8",
      date: roundDates.elite8,
      matchups: rounds.elite8,
    },
  ];
  const displayedColumns = side === "left" ? columns : [...columns].reverse();

  return (
    <section
      className={`${styles.canvasRegion} ${
        side === "right" ? styles.canvasRegionRight : ""
      }`}
      aria-labelledby={`${region}-title`}
    >
      <h2 id={`${region}-title`}>{REGION_NAMES[region]} Region</h2>
      <div className={styles.canvasRegionRounds}>
        {displayedColumns.map((column) => (
          <div className={styles.roundColumn} key={column.label}>
            {showHeading && (
              <div className={styles.roundHeading}>
                <h3>{column.label}</h3>
                <span>{column.date}</span>
              </div>
            )}
            <div
              className={styles.matchupStack}
              data-count={column.matchups.length}
            >
              {column.matchups.map((matchup) => (
                <MatchCard
                  key={matchup.id}
                  matchup={matchup}
                  pickedId={picks[matchup.id]}
                  onPick={onPick}
                  readOnly={readOnly}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

type BracketBoardProps = {
  bracket: DerivedBracket;
  picks: PickMap;
  onPick: (matchupId: string, entryId: string) => void;
  model: TournamentModel;
  tiebreaker: string;
  onTiebreakerChange: (value: string) => void;
  readOnly?: boolean;
};

export function BracketBoard({
  bracket,
  picks,
  onPick,
  model,
  tiebreaker,
  onTiebreakerChange,
  readOnly = false,
}: BracketBoardProps) {
  const { finalFourPairings, regionLayout, roundDates } = model;
  const leftFinalFourLabel = finalFourPairings[0]
    .map((region) => REGION_NAMES[region])
    .join(" vs. ");
  const rightFinalFourLabel = finalFourPairings[1]
    .map((region) => REGION_NAMES[region])
    .join(" vs. ");

  return (
    <div className={styles.bracketCanvasFrame}>
      <div className={styles.bracketCanvas}>

        <RegionBracket
          region={regionLayout.topLeft}
          bracket={bracket}
          picks={picks}
          onPick={onPick}
          side="left"
          roundDates={roundDates}
          readOnly={readOnly}
        />
        <RegionBracket
          region={regionLayout.topRight}
          bracket={bracket}
          picks={picks}
          onPick={onPick}
          side="right"
          roundDates={roundDates}
          readOnly={readOnly}
        />
        <RegionBracket
          region={regionLayout.bottomLeft}
          bracket={bracket}
          picks={picks}
          onPick={onPick}
          side="left"
          roundDates={roundDates}
          showHeading={false}
          readOnly={readOnly}
        />
        <RegionBracket
          region={regionLayout.bottomRight}
          bracket={bracket}
          picks={picks}
          onPick={onPick}
          side="right"
          roundDates={roundDates}
          showHeading={false}
          readOnly={readOnly}
        />

        <div className={styles.integratedFinals}>
          <div className={styles.finalFourSlot}>
            <div className={styles.roundHeading}>
              <h3>{leftFinalFourLabel}</h3>
              <span>{roundDates.finalFour}</span>
            </div>
            <MatchCard
              matchup={bracket.finalFour[0]}
              pickedId={picks[bracket.finalFour[0].id]}
              onPick={onPick}
              compact
              readOnly={readOnly}
            />
          </div>

          <div className={styles.championshipColumn}>
            <div className={styles.roundHeading}>
              <h3>National Championship</h3>
              <span>{roundDates.championship}</span>
            </div>
            <MatchCard
              matchup={bracket.championship}
              pickedId={picks[bracket.championship.id]}
              onPick={onPick}
              compact
              readOnly={readOnly}
            />
            <div className={styles.championResultRow}>
              <div className={styles.championCard} aria-live="polite">
                <Trophy size={26} aria-hidden="true" />
                <span>National Champion</span>
                <strong>
                  {bracket.champion
                    ? `#${bracket.champion.seed} ${bracket.champion.name}`
                    : "Make your final pick"}
                </strong>
              </div>
              <label className={styles.totalPoints}>
                <span>Total points</span>
                <input
                  type="number"
                  min="0"
                  max="400"
                  inputMode="numeric"
                  value={tiebreaker}
                  onChange={(event) =>
                    onTiebreakerChange(event.target.value)
                  }
                  placeholder="142"
                  disabled={readOnly}
                />
              </label>
            </div>
          </div>

          <div className={styles.finalFourSlot}>
            <div className={styles.roundHeading}>
              <h3>{rightFinalFourLabel}</h3>
              <span>{roundDates.finalFour}</span>
            </div>
            <MatchCard
              matchup={bracket.finalFour[1]}
              pickedId={picks[bracket.finalFour[1].id]}
              onPick={onPick}
              compact
              readOnly={readOnly}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
