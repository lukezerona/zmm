"use client";

import { Trophy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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

type ConnectorDiagram = {
  width: number;
  height: number;
  lines: {
    id: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  }[];
};

const CONNECTOR_PAIRS = [
  {
    id: "east-final-four",
    eliteEightId: "east-r4-0",
    finalFourId: "final-four-0",
    side: "left",
    position: "upper",
  },
  {
    id: "south-final-four",
    eliteEightId: "south-r4-0",
    finalFourId: "final-four-0",
    side: "right",
    position: "upper",
  },
  {
    id: "west-final-four",
    eliteEightId: "west-r4-0",
    finalFourId: "final-four-1",
    side: "left",
    position: "lower",
  },
  {
    id: "midwest-final-four",
    eliteEightId: "midwest-r4-0",
    finalFourId: "final-four-1",
    side: "right",
    position: "lower",
  },
] as const;

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
  readOnly?: boolean;
};

function RegionBracket({
  region,
  bracket,
  picks,
  onPick,
  side,
  roundDates,
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
            <div className={styles.roundHeading}>
              <h3>{column.label}</h3>
              <span>{column.date}</span>
            </div>
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
  roundDates: TournamentModel["roundDates"];
  tiebreaker: string;
  onTiebreakerChange: (value: string) => void;
  readOnly?: boolean;
};

export function BracketBoard({
  bracket,
  picks,
  onPick,
  roundDates,
  tiebreaker,
  onTiebreakerChange,
  readOnly = false,
}: BracketBoardProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [connectorDiagram, setConnectorDiagram] =
    useState<ConnectorDiagram | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const updateConnectors = () => {
      if (window.matchMedia("(max-width: 760px)").matches) {
        setConnectorDiagram(null);
        return;
      }

      const canvasBounds = canvas.getBoundingClientRect();
      const lines = CONNECTOR_PAIRS.flatMap((pair) => {
        const eliteEight = canvas.querySelector<HTMLElement>(
          `[data-matchup-id="${pair.eliteEightId}"]`,
        );
        const finalFour = canvas.querySelector<HTMLElement>(
          `[data-matchup-id="${pair.finalFourId}"]`,
        );
        if (!eliteEight || !finalFour) return [];

        const eliteEightBounds = eliteEight.getBoundingClientRect();
        const finalFourBounds = finalFour.getBoundingClientRect();
        const connectsFromAbove = pair.position === "upper";
        const finalFourAnchor = pair.side === "left" ? 0.28 : 0.72;

        return [
          {
            id: pair.id,
            x1:
              eliteEightBounds.left +
              eliteEightBounds.width / 2 -
              canvasBounds.left,
            y1:
              (connectsFromAbove
                ? eliteEightBounds.bottom
                : eliteEightBounds.top) - canvasBounds.top,
            x2:
              finalFourBounds.left +
              finalFourBounds.width * finalFourAnchor -
              canvasBounds.left,
            y2:
              (connectsFromAbove
                ? finalFourBounds.top
                : finalFourBounds.bottom) - canvasBounds.top,
          },
        ];
      });

      setConnectorDiagram({
        width: canvasBounds.width,
        height: canvasBounds.height,
        lines,
      });
    };

    updateConnectors();
    const resizeObserver = new ResizeObserver(updateConnectors);
    resizeObserver.observe(canvas);
    window.addEventListener("resize", updateConnectors);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateConnectors);
    };
  }, [bracket]);

  return (
    <div className={styles.bracketCanvasFrame}>
      <div className={styles.bracketCanvas} ref={canvasRef}>
        {connectorDiagram && connectorDiagram.lines.length > 0 && (
          <svg
            className={styles.finalFourConnectors}
            viewBox={`0 0 ${connectorDiagram.width} ${connectorDiagram.height}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {connectorDiagram.lines.map((line) => {
              const midpointY = (line.y1 + line.y2) / 2;

              return (
                <polyline
                  key={line.id}
                  points={`${line.x1},${line.y1} ${line.x1},${midpointY} ${line.x2},${midpointY} ${line.x2},${line.y2}`}
                />
              );
            })}
          </svg>
        )}

        <RegionBracket
          region="east"
          bracket={bracket}
          picks={picks}
          onPick={onPick}
          side="left"
          roundDates={roundDates}
          readOnly={readOnly}
        />
        <RegionBracket
          region="south"
          bracket={bracket}
          picks={picks}
          onPick={onPick}
          side="right"
          roundDates={roundDates}
          readOnly={readOnly}
        />
        <RegionBracket
          region="west"
          bracket={bracket}
          picks={picks}
          onPick={onPick}
          side="left"
          roundDates={roundDates}
          readOnly={readOnly}
        />
        <RegionBracket
          region="midwest"
          bracket={bracket}
          picks={picks}
          onPick={onPick}
          side="right"
          roundDates={roundDates}
          readOnly={readOnly}
        />

        <div className={styles.integratedFinals}>
          <div className={styles.finalFourSlot}>
            <div className={styles.roundHeading}>
              <h3>East vs. South</h3>
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
              <h3>West vs. Midwest</h3>
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
