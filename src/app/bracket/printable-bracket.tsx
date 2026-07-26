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
    { count: 8, left: 0, width: 24 },
    { count: 4, left: 29, width: 18 },
    { count: 2, left: 53, width: 16 },
    { count: 1, left: 75, width: 14 },
  ],
  right: [
    { count: 8, left: 76, width: 24 },
    { count: 4, left: 53, width: 18 },
    { count: 2, left: 31, width: 16 },
    { count: 1, left: 11, width: 14 },
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
              className={styles.blankMatchup}
              key={`${region}-${roundIndex}-${index}`}
              style={{
                left: `${round.left}%`,
                top: `${y}%`,
                width: `${round.width}%`,
              }}
            >
              <span />
              <span />
            </div>
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
    <section className={styles.finals}>
      <div className={styles.finalFourMatchup}>
        <span />
        <span />
      </div>
      <div className={styles.championshipArea}>
        <div className={styles.championshipMatchup}>
          <span />
          <span />
        </div>
        <div className={styles.championSlot}>
          <strong>Champion</strong>
          <span />
        </div>
      </div>
      <div className={styles.finalFourMatchup}>
        <span />
        <span />
      </div>
    </section>
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
