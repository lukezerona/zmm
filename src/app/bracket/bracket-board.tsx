"use client";

import { useRef, useState, type TouchEvent } from "react";
import { ChevronLeft, ChevronRight, Trophy } from "lucide-react";
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

const MOBILE_ROUNDS = [
  {
    id: "roundOf64",
    label: "Round 1",
    detail: "Round of 64",
    dateKey: "roundOf64",
  },
  {
    id: "roundOf32",
    label: "Round 2",
    detail: "Round of 32",
    dateKey: "roundOf32",
  },
  {
    id: "sweet16",
    label: "Sweet 16",
    detail: "Regional semifinals",
    dateKey: "sweet16",
  },
  {
    id: "elite8",
    label: "Elite 8",
    detail: "Regional finals",
    dateKey: "elite8",
  },
  {
    id: "finalFour",
    label: "Final Four",
    detail: "National semifinals",
    dateKey: "finalFour",
  },
  {
    id: "championship",
    label: "Championship",
    detail: "National championship",
    dateKey: "championship",
  },
] as const;

type MobileRound = (typeof MOBILE_ROUNDS)[number];
type RegionalRoundId = Exclude<
  MobileRound["id"],
  "finalFour" | "championship"
>;

const NEXT_REGIONAL_ROUND: Record<
  Exclude<RegionalRoundId, "elite8">,
  RegionalRoundId
> = {
  roundOf64: "roundOf32",
  roundOf32: "sweet16",
  sweet16: "elite8",
};

type MatchCardProps = {
  matchup: BracketMatchup;
  pickedId?: string;
  onPick: (matchupId: string, entryId: string) => void;
  compact?: boolean;
  readOnly?: boolean;
  showMissing?: boolean;
};

function MatchCard({
  matchup,
  pickedId,
  onPick,
  compact = false,
  readOnly = false,
  showMissing = false,
}: MatchCardProps) {
  const hasAvailablePick = matchup.options.some((entry) => entry !== null);
  const hasValidPick = matchup.options.some(
    (entry) => entry !== null && entry.id === pickedId,
  );
  const isMissing = showMissing && hasAvailablePick && !hasValidPick;

  return (
    <article
      className={`${styles.matchup} ${compact ? styles.compactMatchup : ""} ${
        isMissing ? styles.missingMatchup : ""
      }`}
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
  showMissing?: boolean;
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
  showMissing = false,
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
                  showMissing={showMissing}
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
  showMissing?: boolean;
};

function MobileBracketBoard({
  bracket,
  picks,
  onPick,
  model,
  tiebreaker,
  onTiebreakerChange,
  readOnly = false,
  showMissing = false,
}: BracketBoardProps) {
  const [activeRoundIndex, setActiveRoundIndex] = useState(0);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const activeRound = MOBILE_ROUNDS[activeRoundIndex];
  const orderedRegions = [
    model.regionLayout.topLeft,
    model.regionLayout.bottomLeft,
    model.regionLayout.topRight,
    model.regionLayout.bottomRight,
  ];

  function hasMissingPick(matchup: BracketMatchup) {
    const hasAvailableTeam = matchup.options.some(Boolean);
    const hasSelectedTeam = matchup.options.some(
      (entry) => entry?.id === picks[matchup.id],
    );
    return hasAvailableTeam && !hasSelectedTeam;
  }

  function roundHasMissingPick(round: MobileRound) {
    if (!showMissing) return false;
    if (round.id === "finalFour") {
      return bracket.finalFour.some(hasMissingPick);
    }
    if (round.id === "championship") {
      return hasMissingPick(bracket.championship) || tiebreaker === "";
    }
    return orderedRegions.some((region) =>
      bracket.regions[region][round.id].some(hasMissingPick),
    );
  }

  function moveRound(direction: -1 | 1) {
    setActiveRoundIndex((current) =>
      Math.min(
        MOBILE_ROUNDS.length - 1,
        Math.max(0, current + direction),
      ),
    );
  }

  function handleTouchStart(event: TouchEvent<HTMLElement>) {
    const touch = event.touches[0];
    touchStart.current = { x: touch.clientX, y: touch.clientY };
  }

  function handleTouchEnd(event: TouchEvent<HTMLElement>) {
    const start = touchStart.current;
    const touch = event.changedTouches[0];
    touchStart.current = null;
    if (!start || !touch) return;

    const horizontalDistance = touch.clientX - start.x;
    const verticalDistance = touch.clientY - start.y;
    const isHorizontalSwipe =
      Math.abs(horizontalDistance) >= 48 &&
      Math.abs(horizontalDistance) > Math.abs(verticalDistance) * 1.2;

    if (!isHorizontalSwipe) return;
    moveRound(horizontalDistance < 0 ? 1 : -1);
  }

  function regionalRound(roundId: RegionalRoundId) {
    if (roundId === "elite8") {
      return eliteEightRound();
    }

    const nextRoundId = NEXT_REGIONAL_ROUND[roundId];

    return (
      <div className={styles.mobileRegionList}>
        {orderedRegions.map((region) => {
          const matchups = bracket.regions[region][roundId];
          const nextMatchups = bracket.regions[region][nextRoundId];

          return (
            <section className={styles.mobileRegion} key={region}>
              <header>
                <h3>{REGION_NAMES[region]} Region</h3>
                <span>
                  {matchups.length} {matchups.length === 1 ? "game" : "games"}
                </span>
              </header>
              <div className={styles.mobileMatchupList}>
                {nextMatchups.map((nextMatchup, index) => (
                  <div
                    className={styles.mobileMatchupBranch}
                    key={nextMatchup.id}
                  >
                    <MatchCard
                      matchup={matchups[index * 2]}
                      pickedId={picks[matchups[index * 2].id]}
                      onPick={onPick}
                      readOnly={readOnly}
                      showMissing={showMissing}
                    />
                    {nextMatchupPreview(nextMatchup)}
                    <MatchCard
                      matchup={matchups[index * 2 + 1]}
                      pickedId={picks[matchups[index * 2 + 1].id]}
                      onPick={onPick}
                      readOnly={readOnly}
                      showMissing={showMissing}
                    />
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    );
  }

  function nextMatchupPreview(matchup: BracketMatchup) {
    return (
      <div className={styles.mobileNextMatchupPreview}>
        <MatchCard
          matchup={matchup}
          pickedId={picks[matchup.id]}
          onPick={onPick}
          readOnly={readOnly}
          showMissing={showMissing}
        />
      </div>
    );
  }

  function labeledMatchup(label: string, matchup: BracketMatchup) {
    return (
      <div className={styles.mobileLabeledMatchup}>
        <span>{label}</span>
        <MatchCard
          matchup={matchup}
          pickedId={picks[matchup.id]}
          onPick={onPick}
          readOnly={readOnly}
          showMissing={showMissing}
        />
      </div>
    );
  }

  function eliteEightRound() {
    return (
      <div className={styles.mobileRegionList}>
        {model.finalFourPairings.map((pairing, index) => {
          const firstMatchup = bracket.regions[pairing[0]].elite8[0];
          const secondMatchup = bracket.regions[pairing[1]].elite8[0];

          return (
            <section className={styles.mobileRegion} key={pairing.join("-")}>
              <header>
                <h3>
                  {pairing.map((region) => REGION_NAMES[region]).join(" vs. ")}
                </h3>
                <span>Regional finals</span>
              </header>
              <div className={styles.mobileMatchupList}>
                <div className={styles.mobileMatchupBranch}>
                  {labeledMatchup(
                    `${REGION_NAMES[pairing[0]]} Region`,
                    firstMatchup,
                  )}
                  {nextMatchupPreview(bracket.finalFour[index])}
                  {labeledMatchup(
                    `${REGION_NAMES[pairing[1]]} Region`,
                    secondMatchup,
                  )}
                </div>
              </div>
            </section>
          );
        })}
      </div>
    );
  }

  function finalFourRound() {
    return (
      <div className={styles.mobileRegionList}>
        <section className={styles.mobileRegion}>
          <header>
            <h3>National Semifinals</h3>
            <span>2 games</span>
          </header>
          <div className={styles.mobileMatchupList}>
            <div className={styles.mobileMatchupBranch}>
              {labeledMatchup(
                model.finalFourPairings[0]
                  .map((region) => REGION_NAMES[region])
                  .join(" vs. "),
                bracket.finalFour[0],
              )}
              {nextMatchupPreview(bracket.championship)}
              {labeledMatchup(
                model.finalFourPairings[1]
                  .map((region) => REGION_NAMES[region])
                  .join(" vs. "),
                bracket.finalFour[1],
              )}
            </div>
          </div>
        </section>
      </div>
    );
  }

  function championshipRound() {
    return (
      <div
        className={`${styles.championshipColumn} ${styles.mobileChampionship}`}
      >
        <MatchCard
          matchup={bracket.championship}
          pickedId={picks[bracket.championship.id]}
          onPick={onPick}
          compact
          readOnly={readOnly}
          showMissing={showMissing}
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
          <label
            className={`${styles.totalPoints} ${
              showMissing && tiebreaker === ""
                ? styles.missingTiebreaker
                : ""
            }`}
          >
            <span>Total points</span>
            <input
              type="number"
              min="0"
              max="400"
              inputMode="numeric"
              value={tiebreaker}
              onChange={(event) => onTiebreakerChange(event.target.value)}
              placeholder="142"
              disabled={readOnly}
              aria-invalid={
                showMissing && tiebreaker === "" ? true : undefined
              }
            />
          </label>
        </div>
      </div>
    );
  }

  return (
    <section
      className={styles.mobileBracketFrame}
      aria-label="Bracket organized by round"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={() => {
        touchStart.current = null;
      }}
    >
      <div className={styles.mobileRoundHeader}>
        <button
          type="button"
          onClick={() => moveRound(-1)}
          disabled={activeRoundIndex === 0}
          aria-label="Previous round"
        >
          <ChevronLeft aria-hidden="true" />
        </button>
        <div>
          <span>
            ROUND {activeRoundIndex + 1} OF {MOBILE_ROUNDS.length}
          </span>
          <h2>{activeRound.label}</h2>
          <p>
            {activeRound.detail} <i aria-hidden="true">•</i>{" "}
            {model.roundDates[activeRound.dateKey]}
          </p>
        </div>
        <button
          type="button"
          onClick={() => moveRound(1)}
          disabled={activeRoundIndex === MOBILE_ROUNDS.length - 1}
          aria-label="Next round"
        >
          <ChevronRight aria-hidden="true" />
        </button>
      </div>

      <div className={styles.mobileRoundSteps} aria-label="Choose a round">
        {MOBILE_ROUNDS.map((round, index) => {
          const hasMissing = roundHasMissingPick(round);
          return (
            <button
              type="button"
              key={round.id}
              className={[
                index === activeRoundIndex ? styles.activeRoundStep : "",
                hasMissing ? styles.missingRoundStep : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => setActiveRoundIndex(index)}
              aria-label={`Show ${round.label}${
                hasMissing ? ", missing picks" : ""
              }`}
              aria-current={index === activeRoundIndex ? "step" : undefined}
            />
          );
        })}
      </div>

      <p className={styles.mobileSwipeHint}>Swipe left or right to change rounds</p>

      <div className={styles.mobileRoundPanel} key={activeRound.id}>
        {activeRound.id === "finalFour"
          ? finalFourRound()
          : activeRound.id === "championship"
            ? championshipRound()
            : regionalRound(activeRound.id)}
      </div>

      <nav className={styles.mobileRoundFooter} aria-label="Round navigation">
        <button
          type="button"
          onClick={() => moveRound(-1)}
          disabled={activeRoundIndex === 0}
        >
          <ChevronLeft aria-hidden="true" />
          Previous
        </button>
        <button
          type="button"
          onClick={() => moveRound(1)}
          disabled={activeRoundIndex === MOBILE_ROUNDS.length - 1}
        >
          Next
          <ChevronRight aria-hidden="true" />
        </button>
      </nav>
    </section>
  );
}

export function BracketBoard({
  bracket,
  picks,
  onPick,
  model,
  tiebreaker,
  onTiebreakerChange,
  readOnly = false,
  showMissing = false,
}: BracketBoardProps) {
  const { finalFourPairings, regionLayout, roundDates } = model;
  const leftFinalFourLabel = finalFourPairings[0]
    .map((region) => REGION_NAMES[region])
    .join(" vs. ");
  const rightFinalFourLabel = finalFourPairings[1]
    .map((region) => REGION_NAMES[region])
    .join(" vs. ");

  return (
    <>
      <MobileBracketBoard
        bracket={bracket}
        picks={picks}
        onPick={onPick}
        model={model}
        tiebreaker={tiebreaker}
        onTiebreakerChange={onTiebreakerChange}
        readOnly={readOnly}
        showMissing={showMissing}
      />
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
            showMissing={showMissing}
          />
          <RegionBracket
            region={regionLayout.topRight}
            bracket={bracket}
            picks={picks}
            onPick={onPick}
            side="right"
            roundDates={roundDates}
            readOnly={readOnly}
            showMissing={showMissing}
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
            showMissing={showMissing}
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
            showMissing={showMissing}
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
                showMissing={showMissing}
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
                showMissing={showMissing}
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
                <label
                  className={`${styles.totalPoints} ${
                    showMissing && tiebreaker === ""
                      ? styles.missingTiebreaker
                      : ""
                  }`}
                >
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
                    aria-invalid={
                      showMissing && tiebreaker === "" ? true : undefined
                    }
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
                showMissing={showMissing}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
