"use client";

import { CSSProperties, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import {
  BracketEntry,
  BracketMatchup,
  Region,
  TournamentModel,
} from "./bracket-types";
import styles from "./printable-bracket.module.css";

const REGION_LABELS: Record<Region, string> = {
  east: "East",
  west: "West",
  south: "South",
  midwest: "Midwest",
};

const ROUND_HEADERS = [
  ["First Round", "roundOf64"],
  ["Second Round", "roundOf32"],
  ["Sweet 16", "sweet16"],
  ["Elite 8", "elite8"],
  ["Final Four", "finalFour"],
  ["Championship", "championship"],
  ["Final Four", "finalFour"],
  ["Elite 8", "elite8"],
  ["Sweet 16", "sweet16"],
  ["Second Round", "roundOf32"],
  ["First Round", "roundOf64"],
] as const;

const ROUND_POSITIONS = {
  left: [
    { count: 8, left: 0, width: 26 },
    { count: 4, left: 32, width: 22 },
    { count: 2, left: 60, width: 20 },
    { count: 1, left: 84, width: 16 },
  ],
  right: [
    { count: 8, left: 74, width: 26 },
    { count: 4, left: 46, width: 22 },
    { count: 2, left: 20, width: 20 },
    { count: 1, left: 0, width: 16 },
  ],
} as const;

const CONNECTOR_COLUMNS = {
  left: [
    { from: 26, bend: 29, to: 32 },
    { from: 54, bend: 57, to: 60 },
    { from: 80, bend: 82, to: 84 },
  ],
  right: [
    { from: 74, bend: 71, to: 68 },
    { from: 46, bend: 43, to: 40 },
    { from: 20, bend: 18, to: 16 },
  ],
} as const;

type PrintSide = "left" | "right";
type RegionPosition = "top" | "bottom";

function subscribeToClient() {
  return () => {};
}

function centerFor(index: number, count: number) {
  return ((index + 0.5) / count) * 100;
}

function teamLabel(team: BracketEntry | null) {
  if (!team) return { seed: "", name: "TBD" };
  return { seed: `(${team.seed})`, name: team.name };
}

function RegionConnections({ side }: { side: PrintSide }) {
  const paths = CONNECTOR_COLUMNS[side].flatMap((column, roundIndex) => {
    const childCount = 8 / 2 ** roundIndex;
    const parentCount = childCount / 2;

    return Array.from({ length: childCount }, (_, childIndex) => {
      const parentIndex = Math.floor(childIndex / 2);
      const childY = centerFor(childIndex, childCount);
      const parentY = centerFor(parentIndex, parentCount);

      return `M ${column.from} ${childY} H ${column.bend} V ${parentY} H ${column.to}`;
    });
  });

  return (
    <svg
      className={styles.regionLines}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {paths.map((path, index) => (
        <path key={`${side}-${index}`} d={path} vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}

function FirstRoundMatchup({
  matchup,
  style,
}: {
  matchup: BracketMatchup;
  style: CSSProperties;
}) {
  const topTeam = teamLabel(matchup.options[0]);
  const bottomTeam = teamLabel(matchup.options[1]);

  return (
    <div className={styles.firstRoundMatchup} style={style}>
      {[topTeam, bottomTeam].map((team, index) => (
        <div className={styles.firstRoundTeam} key={`${matchup.id}-${index}`}>
          <strong>{team.seed}</strong>
          <span>{team.name}</span>
        </div>
      ))}
    </div>
  );
}

function RegionBracketPrint({
  region,
  matchups,
  side,
  position,
}: {
  region: Region;
  matchups: BracketMatchup[];
  side: PrintSide;
  position: RegionPosition;
}) {
  const roundPositions = ROUND_POSITIONS[side];

  return (
    <section
      className={`${styles.region} ${
        side === "right" ? styles.regionRight : ""
      }`}
    >
      <RegionConnections side={side} />

      {matchups.map((matchup, index) => {
        const round = roundPositions[0];
        const y = centerFor(index, round.count);
        return (
          <FirstRoundMatchup
            matchup={matchup}
            key={matchup.id}
            style={{
              left: `${round.left}%`,
              top: `${y}%`,
              width: `${round.width}%`,
            }}
          />
        );
      })}

      {roundPositions.slice(1).flatMap((round, roundIndex) =>
        Array.from({ length: round.count }, (_, index) => {
          const y = centerFor(index, round.count);
          return (
            <div
              className={styles.emptySlot}
              key={`${region}-${roundIndex}-${index}`}
              style={{
                left: `${round.left}%`,
                top: `${y}%`,
                width: `${round.width}%`,
              }}
            />
          );
        }),
      )}

      <div
        className={`${styles.regionName} ${
          position === "top" ? styles.regionNameBottom : styles.regionNameTop
        }`}
      >
        {REGION_LABELS[region]}
      </div>
    </section>
  );
}

function BlankFinals() {
  return (
    <>
      <svg
        className={styles.finalsLines}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path d="M 39.6 23 H 38.8 V 47.5 H 39.5" vectorEffect="non-scaling-stroke" />
        <path d="M 39.6 77 H 38.8 V 52.5 H 39.5" vectorEffect="non-scaling-stroke" />
        <path d="M 60.4 23 H 61.2 V 47.5 H 60.5" vectorEffect="non-scaling-stroke" />
        <path d="M 60.4 77 H 61.2 V 52.5 H 60.5" vectorEffect="non-scaling-stroke" />
        <path d="M 45.5 50 H 46.2 V 48.3 H 47" vectorEffect="non-scaling-stroke" />
        <path d="M 54.5 50 H 53.8 V 51.7 H 53" vectorEffect="non-scaling-stroke" />
      </svg>

      <div className={`${styles.finalCard} ${styles.leftFinalCard}`}>
        <span />
        <span />
      </div>
      <div className={`${styles.finalCard} ${styles.championshipCard}`}>
        <span />
        <span />
        <strong>Champion</strong>
      </div>
      <div className={`${styles.finalCard} ${styles.rightFinalCard}`}>
        <span />
        <span />
      </div>
    </>
  );
}

export function PrintableBlankBracket({ model }: { model: TournamentModel }) {
  const canUseDocument = useSyncExternalStore(
    subscribeToClient,
    () => true,
    () => false,
  );

  if (!canUseDocument) return null;

  const roundDates = model.roundDates;

  return createPortal(
    <div id="zmm-print-root">
      <article className={styles.sheet}>
        <header className={styles.roundHeaders}>
          {ROUND_HEADERS.map(([label, dateKey], index) => (
            <div key={`${label}-${index}`}>
              <strong>{label}</strong>
              <span>{roundDates[dateKey]}</span>
            </div>
          ))}
        </header>

        <div className={styles.board}>
          <RegionBracketPrint
            region={model.regionLayout.topLeft}
            matchups={model.firstRoundByRegion[model.regionLayout.topLeft]}
            side="left"
            position="top"
          />
          <RegionBracketPrint
            region={model.regionLayout.topRight}
            matchups={model.firstRoundByRegion[model.regionLayout.topRight]}
            side="right"
            position="top"
          />
          <RegionBracketPrint
            region={model.regionLayout.bottomLeft}
            matchups={model.firstRoundByRegion[model.regionLayout.bottomLeft]}
            side="left"
            position="bottom"
          />
          <RegionBracketPrint
            region={model.regionLayout.bottomRight}
            matchups={model.firstRoundByRegion[model.regionLayout.bottomRight]}
            side="right"
            position="bottom"
          />

          <div className={styles.title}>
            <span>ZMM</span>
            <strong>March Madness</strong>
            <small>{model.seasonYear} Family Bracket</small>
          </div>

          <BlankFinals />
        </div>

        <footer className={styles.footer}>
          <span>Name</span>
          <i />
          <span>Total points</span>
          <i className={styles.pointsLine} />
        </footer>
      </article>
    </div>,
    document.body,
  );
}
