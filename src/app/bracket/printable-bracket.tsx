"use client";

import { CSSProperties, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import {
  BracketEntry,
  BracketMatchup,
  DerivedBracket,
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
type PrintVariant = "blank" | "current";

function subscribeToClient() {
  return () => {};
}

function isPhonePrintSource() {
  const shortestScreenSide = Math.min(window.screen.width, window.screen.height);
  return (
    shortestScreenSide <= 600 &&
    window.matchMedia("(pointer: coarse)").matches
  );
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

function FilledRoundMatchup({
  matchup,
  style,
}: {
  matchup: BracketMatchup;
  style: CSSProperties;
}) {
  return (
    <div
      className={`${styles.blankMatchup} ${styles.filledMatchup}`}
      style={style}
    >
      {matchup.options.map((entry, index) => {
        const team = teamLabel(entry);
        return (
          <div key={`${matchup.id}-${index}`}>
            <strong>{team.seed}</strong>
            <span>{team.name}</span>
          </div>
        );
      })}
    </div>
  );
}

function RegionBracketPrint({
  region,
  matchups,
  bracket,
  variant,
  side,
  position,
}: {
  region: Region;
  matchups: BracketMatchup[];
  bracket: DerivedBracket | null;
  variant: PrintVariant;
  side: PrintSide;
  position: RegionPosition;
}) {
  const roundPositions = ROUND_POSITIONS[side];
  const currentRounds = bracket?.regions[region];
  const laterRounds = currentRounds
    ? [
        currentRounds.roundOf32,
        currentRounds.sweet16,
        currentRounds.elite8,
      ]
    : [];

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
          const currentMatchup =
            variant === "current" ? laterRounds[roundIndex]?.[index] : null;

          if (currentMatchup) {
            return (
              <FilledRoundMatchup
                matchup={currentMatchup}
                key={`${region}-${roundIndex}-${index}`}
                style={{
                  left: `${round.left}%`,
                  top: `${y}%`,
                  width: `${round.width}%`,
                }}
              />
            );
          }

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

function FinalsMatchup({
  matchup,
  className,
}: {
  matchup?: BracketMatchup;
  className: string;
}) {
  return (
    <div className={className}>
      {matchup
        ? matchup.options.map((entry, index) => {
            const team = teamLabel(entry);
            return (
              <span key={`${matchup.id}-${index}`}>
                <strong>{team.seed}</strong>
                {team.name}
              </span>
            );
          })
        : [0, 1].map((index) => <span key={index} />)}
    </div>
  );
}

function PrintableFinals({
  bracket,
  variant,
}: {
  bracket: DerivedBracket | null;
  variant: PrintVariant;
}) {
  const currentBracket = variant === "current" ? bracket : null;
  const champion = currentBracket?.champion
    ? teamLabel(currentBracket.champion)
    : null;

  return (
    <section className={styles.finals}>
      <FinalsMatchup
        matchup={currentBracket?.finalFour[0]}
        className={styles.finalFourMatchup}
      />
      <div className={styles.championshipArea}>
        <div className={styles.championSlot}>
          <strong>Champion</strong>
          <span>
            {champion ? `${champion.seed} ${champion.name}` : ""}
          </span>
        </div>
        <FinalsMatchup
          matchup={currentBracket?.championship}
          className={styles.championshipMatchup}
        />
      </div>
      <FinalsMatchup
        matchup={currentBracket?.finalFour[1]}
        className={styles.finalFourMatchup}
      />
    </section>
  );
}

export function PrintableBracket({
  model,
  bracket,
  variant,
  displayName,
  tiebreaker,
}: {
  model: TournamentModel;
  bracket: DerivedBracket | null;
  variant: PrintVariant;
  displayName?: string;
  tiebreaker?: string | number | null;
}) {
  const canUseDocument = useSyncExternalStore(
    subscribeToClient,
    () => true,
    () => false,
  );

  if (!canUseDocument) return null;

  const roundDates = model.roundDates;
  const printDevice = isPhonePrintSource() ? "phone" : "desktop";

  return createPortal(
    <div id="zmm-print-root" data-print-device={printDevice}>
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
            bracket={bracket}
            variant={variant}
            side="left"
            position="top"
          />
          <RegionBracketPrint
            region={model.regionLayout.topRight}
            matchups={model.firstRoundByRegion[model.regionLayout.topRight]}
            bracket={bracket}
            variant={variant}
            side="right"
            position="top"
          />
          <RegionBracketPrint
            region={model.regionLayout.bottomLeft}
            matchups={model.firstRoundByRegion[model.regionLayout.bottomLeft]}
            bracket={bracket}
            variant={variant}
            side="left"
            position="bottom"
          />
          <RegionBracketPrint
            region={model.regionLayout.bottomRight}
            matchups={model.firstRoundByRegion[model.regionLayout.bottomRight]}
            bracket={bracket}
            variant={variant}
            side="right"
            position="bottom"
          />

          <div className={styles.title}>
            <span>ZMM</span>
            <strong>March Madness</strong>
            <small>{model.seasonYear} Family Bracket</small>
          </div>

          <PrintableFinals bracket={bracket} variant={variant} />
        </div>

        <footer className={styles.footer}>
          <span>Name</span>
          <i>{variant === "current" ? displayName : ""}</i>
          <span>Total points</span>
          <i className={styles.pointsLine}>
            {variant === "current" ? tiebreaker : ""}
          </i>
        </footer>
      </article>
    </div>,
    document.body,
  );
}
