"use client";

import {
  ChevronLeft,
  ChevronRight,
  Trophy,
} from "lucide-react";
import { useMemo, useRef, useState, type TouchEvent } from "react";
import {
  BracketMatchup,
  Region,
  RegionRounds,
  TournamentModel,
} from "../bracket/bracket-types";
import {
  BracketView,
  buildMasterTeamOrder,
  MasterGameCard,
  masterMatchups,
  PlayerPickCard,
} from "./tournament-bracket-canvas";
import { buildMasterGameIndex } from "./tournament-utils";
import styles from "./march-madness.module.css";

const REGION_NAMES: Record<Region, string> = {
  east: "East",
  west: "West",
  south: "South",
  midwest: "Midwest",
};

const MOBILE_TOURNAMENT_ROUNDS = [
  {
    id: "roundOf64",
    label: "Round of 64",
    dateKey: "roundOf64",
  },
  {
    id: "roundOf32",
    label: "Round of 32",
    dateKey: "roundOf32",
  },
  {
    id: "sweet16",
    label: "Sweet 16",
    dateKey: "sweet16",
  },
  {
    id: "elite8",
    label: "Elite 8",
    dateKey: "elite8",
  },
  {
    id: "finalFour",
    label: "Final Four",
    dateKey: "finalFour",
  },
  {
    id: "championship",
    label: "Championship",
    dateKey: "championship",
  },
] as const;

type MobileTournamentRound = (typeof MOBILE_TOURNAMENT_ROUNDS)[number];
type RegionalRoundId = keyof RegionRounds;
type RoundTransition = {
  fromIndex: number;
  toIndex: number;
  direction: -1 | 1;
};

function emptyFinalMatchup(id: string, roundNumber: number): BracketMatchup {
  return {
    id,
    roundNumber,
    matchupIndex: id === "final-four-1" ? 1 : 0,
    options: [null, null],
  };
}

export function MobileTournamentBracket({
  model,
  view,
}: {
  model: TournamentModel;
  view: BracketView;
}) {
  const [activeRoundIndex, setActiveRoundIndex] = useState(0);
  const [transition, setTransition] = useState<RoundTransition | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const orderedRegions = useMemo(
    () => [
      model.regionLayout.topLeft,
      model.regionLayout.bottomLeft,
      model.regionLayout.topRight,
      model.regionLayout.bottomRight,
    ],
    [model],
  );
  const teamOrder = useMemo(() => buildMasterTeamOrder(model), [model]);
  const gameIndex = useMemo(
    () =>
      view.type === "master"
        ? buildMasterGameIndex(model, view.games)
        : new Map(),
    [model, view],
  );
  const activeRound = MOBILE_TOURNAMENT_ROUNDS[activeRoundIndex];

  function showRound(targetIndex: number) {
    const nextIndex = Math.max(
      0,
      Math.min(MOBILE_TOURNAMENT_ROUNDS.length - 1, targetIndex),
    );
    if (nextIndex === activeRoundIndex || transition) return;

    setTransition({
      fromIndex: activeRoundIndex,
      toIndex: nextIndex,
      direction: nextIndex > activeRoundIndex ? 1 : -1,
    });
  }

  function moveRound(direction: -1 | 1) {
    showRound(activeRoundIndex + direction);
  }

  function handleTouchStart(event: TouchEvent<HTMLElement>) {
    const touch = event.touches[0];
    touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  }

  function handleTouchEnd(event: TouchEvent<HTMLElement>) {
    const start = touchStart.current;
    const touch = event.changedTouches[0];
    touchStart.current = null;
    if (!start || !touch) return;

    const horizontalDistance = touch.clientX - start.x;
    const verticalDistance = touch.clientY - start.y;
    if (
      Math.abs(horizontalDistance) < 48 ||
      Math.abs(horizontalDistance) <= Math.abs(verticalDistance) * 1.2
    ) {
      return;
    }

    moveRound(horizontalDistance < 0 ? 1 : -1);
  }

  function renderMatchup(matchup: BracketMatchup) {
    return view.type === "master" ? (
      <MasterGameCard
        key={matchup.id}
        matchupId={matchup.id}
        roundNumber={matchup.roundNumber}
        game={gameIndex.get(matchup.id)}
        teamOrder={teamOrder}
        projectedOptions={
          view.fieldOnly && matchup.roundNumber === 1
            ? matchup.options
            : undefined
        }
      />
    ) : (
      <PlayerPickCard
        key={matchup.id}
        matchup={matchup}
        pickedId={view.picks[matchup.id]}
        actualWinnerId={view.actualPicks[matchup.id]}
      />
    );
  }

  function regionalRound(roundId: RegionalRoundId) {
    return (
      <div className={styles.mobileTournamentRegionList}>
        {orderedRegions.map((region) => {
          const matchups =
            view.type === "master"
              ? masterMatchups(region, model)[roundId]
              : view.bracket.regions[region][roundId];

          return (
            <section
              className={styles.mobileTournamentRegion}
              key={`${region}-${roundId}`}
            >
              <header>
                <h3>{REGION_NAMES[region]} Region</h3>
                <span>
                  {matchups.length} {matchups.length === 1 ? "game" : "games"}
                </span>
              </header>
              <div className={styles.mobileTournamentMatchupList}>
                {matchups.map(renderMatchup)}
              </div>
            </section>
          );
        })}
      </div>
    );
  }

  function finalFourRound() {
    const matchups =
      view.type === "master"
        ? [
            emptyFinalMatchup("final-four-0", 5),
            emptyFinalMatchup("final-four-1", 5),
          ]
        : view.bracket.finalFour;

    return (
      <div className={styles.mobileTournamentRegionList}>
        {matchups.map((matchup, index) => (
          <section
            className={styles.mobileTournamentRegion}
            key={matchup.id}
          >
            <header>
              <h3>
                {model.finalFourPairings[index]
                  .map((region) => REGION_NAMES[region])
                  .join(" vs. ")}
              </h3>
              <span>National semifinal</span>
            </header>
            <div className={styles.mobileTournamentMatchupList}>
              {renderMatchup(matchup)}
            </div>
          </section>
        ))}
      </div>
    );
  }

  function championshipRound() {
    const matchup =
      view.type === "master"
        ? emptyFinalMatchup("championship", 6)
        : view.bracket.championship;
    const championshipGame =
      view.type === "master" ? gameIndex.get("championship") : undefined;
    const champion =
      view.type === "master"
        ? championshipGame?.completed
          ? championshipGame.home_winner
            ? `${championshipGame.home_team_seed ? `#${championshipGame.home_team_seed} ` : ""}${championshipGame.home_team_name}`
            : `${championshipGame.away_team_seed ? `#${championshipGame.away_team_seed} ` : ""}${championshipGame.away_team_name}`
          : null
        : view.bracket.champion
          ? `#${view.bracket.champion.seed} ${view.bracket.champion.name}`
          : null;

    return (
      <section className={styles.mobileTournamentChampionship}>
        <div className={styles.mobileTournamentMatchupList}>
          {renderMatchup(matchup)}
        </div>
        <div className={styles.mobileTournamentChampion}>
          <Trophy size={25} aria-hidden="true" />
          <span>National Champion</span>
          <strong>{champion ?? "To be decided"}</strong>
        </div>
        {view.type === "player" && (
          <div className={styles.mobileTournamentTiebreaker}>
            <span>Total points</span>
            <strong>{view.tiebreaker ?? "—"}</strong>
          </div>
        )}
      </section>
    );
  }

  function renderRound(round: MobileTournamentRound) {
    if (round.id === "finalFour") return finalFourRound();
    if (round.id === "championship") return championshipRound();
    return regionalRound(round.id);
  }

  function finishTransition() {
    if (!transition) return;
    setActiveRoundIndex(transition.toIndex);
    setTransition(null);
  }

  return (
    <section
      className={styles.mobileTournamentBracket}
      aria-label="Bracket organized by round"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={() => {
        touchStart.current = null;
      }}
    >
      <header className={styles.mobileTournamentRoundHeader}>
        <button
          type="button"
          onClick={() => moveRound(-1)}
          disabled={activeRoundIndex === 0 || Boolean(transition)}
          aria-label="Previous round"
        >
          <ChevronLeft aria-hidden="true" />
        </button>
        <div>
          <span>
            ROUND {activeRoundIndex + 1} OF {MOBILE_TOURNAMENT_ROUNDS.length}
          </span>
          <h2>{activeRound.label}</h2>
          <p>{model.roundDates[activeRound.dateKey]}</p>
        </div>
        <button
          type="button"
          onClick={() => moveRound(1)}
          disabled={
            activeRoundIndex === MOBILE_TOURNAMENT_ROUNDS.length - 1 ||
            Boolean(transition)
          }
          aria-label="Next round"
        >
          <ChevronRight aria-hidden="true" />
        </button>
      </header>

      <div className={styles.mobileTournamentRoundSteps}>
        {MOBILE_TOURNAMENT_ROUNDS.map((round, index) => (
          <button
            type="button"
            key={round.id}
            className={
              index === activeRoundIndex
                ? styles.mobileTournamentRoundStepActive
                : ""
            }
            onClick={() => showRound(index)}
            disabled={Boolean(transition)}
            aria-label={`Show ${round.label}`}
            aria-current={index === activeRoundIndex ? "step" : undefined}
          />
        ))}
      </div>

      <p className={styles.mobileTournamentSwipeHint}>
        Swipe left or right to change rounds
      </p>

      <div
        className={styles.mobileTournamentRoundViewport}
        aria-live="polite"
      >
        {transition ? (
          <>
            <div
              className={`${styles.mobileTournamentRoundPanel} ${
                transition.direction === 1
                  ? styles.mobileTournamentExitLeft
                  : styles.mobileTournamentExitRight
              }`}
              aria-hidden="true"
            >
              {renderRound(
                MOBILE_TOURNAMENT_ROUNDS[transition.fromIndex],
              )}
            </div>
            <div
              className={`${styles.mobileTournamentRoundPanel} ${
                transition.direction === 1
                  ? styles.mobileTournamentEnterRight
                  : styles.mobileTournamentEnterLeft
              }`}
              onAnimationEnd={(event) => {
                if (event.target === event.currentTarget) finishTransition();
              }}
            >
              {renderRound(MOBILE_TOURNAMENT_ROUNDS[transition.toIndex])}
            </div>
          </>
        ) : (
          <div className={styles.mobileTournamentRoundPanel}>
            {renderRound(activeRound)}
          </div>
        )}
      </div>

      <footer className={styles.mobileTournamentRoundFooter}>
        <button
          type="button"
          onClick={() => moveRound(-1)}
          disabled={activeRoundIndex === 0 || Boolean(transition)}
        >
          <ChevronLeft size={18} aria-hidden="true" />
          Previous
        </button>
        <button
          type="button"
          onClick={() => moveRound(1)}
          disabled={
            activeRoundIndex === MOBILE_TOURNAMENT_ROUNDS.length - 1 ||
            Boolean(transition)
          }
        >
          Next
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </footer>
    </section>
  );
}
