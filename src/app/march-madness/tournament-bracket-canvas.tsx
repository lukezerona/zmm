"use client";

import { CircleCheck, CircleX, Radio, Trophy } from "lucide-react";
import {
  BracketEntry,
  BracketMatchup,
  DerivedBracket,
  PickMap,
  Region,
  TournamentModel,
} from "../bracket/bracket-types";
import { TournamentGame } from "./tournament-types";
import { buildMasterGameIndex } from "./tournament-utils";
import styles from "./march-madness.module.css";

const REGION_NAMES: Record<Region, string> = {
  east: "East",
  west: "West",
  south: "South",
  midwest: "Midwest",
};

const MASTER_BRACKET_REGION_ORDER: Region[] = [
  "east",
  "south",
  "west",
  "midwest",
];

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/New_York",
});

type MasterView = {
  type: "master";
  games: TournamentGame[];
};

type PlayerView = {
  type: "player";
  bracket: DerivedBracket;
  picks: PickMap;
  actualPicks: PickMap;
  tiebreaker: number | null;
};

type BracketView = MasterView | PlayerView;

type TournamentBracketCanvasProps = {
  model: TournamentModel;
  view: BracketView;
};

function gameStatus(game: TournamentGame) {
  if (game.completed) return "Final";
  if (game.status_state === "in") {
    return game.status_detail || game.clock || "Live";
  }
  return DATE_FORMATTER.format(new Date(game.starts_at));
}

function masterMatchups(region: Region, model: TournamentModel) {
  return {
    roundOf64: model.firstRoundByRegion[region],
    roundOf32: Array.from({ length: 4 }, (_, matchupIndex) => ({
      id: `${region}-r2-${matchupIndex}`,
      roundNumber: 2,
      matchupIndex,
      options: [null, null],
    })) as BracketMatchup[],
    sweet16: Array.from({ length: 2 }, (_, matchupIndex) => ({
      id: `${region}-r3-${matchupIndex}`,
      roundNumber: 3,
      matchupIndex,
      options: [null, null],
    })) as BracketMatchup[],
    elite8: [
      {
        id: `${region}-r4-0`,
        roundNumber: 4,
        matchupIndex: 0,
        options: [null, null],
      },
    ] as BracketMatchup[],
  };
}

export function buildMasterTeamOrder(model: TournamentModel) {
  const teamOrder = new Map<string, number>();

  MASTER_BRACKET_REGION_ORDER.forEach((region, regionIndex) => {
    model.firstRoundByRegion[region].forEach((matchup) => {
      for (const entry of matchup.options) {
        for (const teamId of entry?.teamIds ?? []) {
          teamOrder.set(
            teamId,
            regionIndex * model.firstRoundByRegion[region].length +
              matchup.matchupIndex,
          );
        }
      }
    });
  });

  return teamOrder;
}

export function MasterGameCard({
  matchupId,
  roundNumber,
  game,
  teamOrder,
  projectedOptions,
  predictedWinnerEntryId,
}: {
  matchupId: string;
  roundNumber: number;
  game?: TournamentGame;
  teamOrder: Map<string, number>;
  projectedOptions?: [BracketEntry | null, BracketEntry | null];
  predictedWinnerEntryId?: string;
}) {
  const live = Boolean(game && game.status_state === "in" && !game.completed);
  const upcoming = Boolean(game && !game.completed && !live);
  const entryForTeam = (teamId: string) =>
    projectedOptions?.find((entry) => entry?.teamIds.includes(teamId)) ?? null;
  const gameTeams = game
    ? [
        {
          id: game.away_team_id,
          entryId: entryForTeam(game.away_team_id)?.id ?? null,
          name: game.away_team_name,
          seed: game.away_team_seed,
          score: game.away_score,
          winner: game.away_winner,
          loser: game.completed && game.home_winner,
        },
        {
          id: game.home_team_id,
          entryId: entryForTeam(game.home_team_id)?.id ?? null,
          name: game.home_team_name,
          seed: game.home_team_seed,
          score: game.home_score,
          winner: game.home_winner,
          loser: game.completed && game.away_winner,
        },
      ]
    : [];
  const projectedTeams = projectedOptions?.map((entry, slotIndex) => {
    const gameTeam = entry
      ? gameTeams.find((team) => entry.teamIds.includes(team.id))
      : null;
    return {
      id: entry?.id ?? `tbd-${slotIndex}`,
      entryId: entry?.id ?? null,
      name: entry?.name ?? "TBD",
      seed: entry?.seed ?? null,
      score: gameTeam?.score ?? null,
      winner: false,
      loser: false,
    };
  });
  const teams =
    !game?.completed && projectedTeams?.some((team) => team.entryId)
      ? projectedTeams
      : gameTeams.length > 0
        ? gameTeams
        : [
            {
              id: "tbd-0",
              entryId: null,
              name: "TBD",
              seed: null,
              score: null,
              winner: false,
              loser: false,
            },
            {
              id: "tbd-1",
              entryId: null,
              name: "TBD",
              seed: null,
              score: null,
              winner: false,
              loser: false,
            },
          ];
  const displayedTeams =
    projectedTeams === teams
      ? teams
      : roundNumber === 1
        ? [...teams].sort(
            (a, b) =>
              (a.seed ?? Number.MAX_SAFE_INTEGER) -
              (b.seed ?? Number.MAX_SAFE_INTEGER),
          )
        : [...teams].sort(
            (a, b) =>
              (teamOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
              (teamOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER),
          );

  return (
    <article
      className={`${styles.gameCard} ${live ? styles.liveGame : ""}`}
      aria-label={`Round ${roundNumber}: ${displayedTeams[0].name} versus ${displayedTeams[1].name}`}
      data-matchup-id={matchupId}
    >
      <div className={styles.gameMeta}>
        {game && (
          <>
            <span className={live ? styles.liveBadge : ""}>
              {live && <Radio size={10} aria-hidden="true" />}
              {gameStatus(game)}
            </span>
            {(live || upcoming) && game.broadcast && <b>{game.broadcast}</b>}
          </>
        )}
      </div>
      {displayedTeams.map((team) => {
        const predictedWinner =
          !game?.completed &&
          Boolean(
            predictedWinnerEntryId &&
              team.entryId === predictedWinnerEntryId,
          );
        const predictedLoser =
          !game?.completed &&
          Boolean(
            predictedWinnerEntryId &&
              team.entryId &&
              team.entryId !== predictedWinnerEntryId,
          );

        return (
          <div
            className={`${styles.scoreRow} ${
              team.winner
                ? styles.gameWinner
                : team.loser
                  ? styles.gameLoser
                  : predictedWinner
                    ? styles.predictedWinner
                    : predictedLoser
                      ? styles.predictedLoser
                      : ""
            }`}
            key={team.id}
          >
            <span className={styles.seed}>{team.seed ?? "\u2014"}</span>
            <strong>{team.name}</strong>
            <b>{team.score ?? "\u2014"}</b>
          </div>
        );
      })}
    </article>
  );
}

function PlayerPickCard({
  matchup,
  pickedId,
  actualWinnerId,
}: {
  matchup: BracketMatchup;
  pickedId?: string;
  actualWinnerId?: string;
}) {
  return (
    <article className={styles.pickCard} data-matchup-id={matchup.id}>
      {matchup.options.map((entry, slotIndex) => {
        if (!entry) {
          return (
            <div
              className={`${styles.pickRow} ${styles.awaitingPick}`}
              key={`${matchup.id}-${slotIndex}`}
            >
              <span className={styles.seed}>\u2014</span>
              <strong>Awaiting pick</strong>
            </div>
          );
        }

        const selected = pickedId === entry.id;
        const correct = selected && actualWinnerId === pickedId;
        const incorrect =
          selected &&
          actualWinnerId !== undefined &&
          actualWinnerId !== pickedId;

        return (
          <div
            className={`${styles.pickRow} ${
              selected ? styles.selectedPick : ""
            } ${correct ? styles.correctPick : ""} ${
              incorrect ? styles.incorrectPick : ""
            }`}
            key={entry.id}
          >
            <span className={styles.seed}>#{entry.seed}</span>
            <strong>{entry.name}</strong>
            {correct && (
              <span
                className={styles.pickResultIcon}
                aria-label="Correct pick"
                title="Correct pick"
              >
                <CircleCheck size={15} aria-hidden="true" />
              </span>
            )}
            {incorrect && (
              <span
                className={styles.pickResultIcon}
                aria-label="Incorrect pick"
                title="Incorrect pick"
              >
                <CircleX size={15} aria-hidden="true" />
              </span>
            )}
          </div>
        );
      })}
    </article>
  );
}

function RegionBracket({
  region,
  side,
  model,
  view,
  gameIndex,
  teamOrder,
  showHeading = true,
}: {
  region: Region;
  side: "left" | "right";
  model: TournamentModel;
  view: BracketView;
  gameIndex: Map<string, TournamentGame>;
  teamOrder: Map<string, number>;
  showHeading?: boolean;
}) {
  const rounds =
    view.type === "master"
      ? masterMatchups(region, model)
      : view.bracket.regions[region];
  const columns = [
    {
      label: "Round of 64",
      date: model.roundDates.roundOf64,
      matchups: rounds.roundOf64,
    },
    {
      label: "Round of 32",
      date: model.roundDates.roundOf32,
      matchups: rounds.roundOf32,
    },
    {
      label: "Sweet 16",
      date: model.roundDates.sweet16,
      matchups: rounds.sweet16,
    },
    {
      label: "Elite 8",
      date: model.roundDates.elite8,
      matchups: rounds.elite8,
    },
  ];
  const displayedColumns = side === "left" ? columns : [...columns].reverse();

  return (
    <section
      className={`${styles.canvasRegion} ${
        side === "right" ? styles.canvasRegionRight : ""
      }`}
      aria-label={`${REGION_NAMES[region]} Region`}
    >
      <h3>{REGION_NAMES[region]} Region</h3>
      <div className={styles.canvasRegionRounds}>
        {displayedColumns.map((column) => (
          <div className={styles.canvasRound} key={column.label}>
            {showHeading && (
              <div className={styles.masterRoundHeading}>
                <strong>{column.label}</strong>
                <span>{column.date}</span>
              </div>
            )}
            <div className={styles.masterMatchups}>
              {column.matchups.map((matchup) =>
                view.type === "master" ? (
                  <MasterGameCard
                    key={matchup.id}
                    matchupId={matchup.id}
                    roundNumber={matchup.roundNumber}
                    game={gameIndex.get(matchup.id)}
                    teamOrder={teamOrder}
                  />
                ) : (
                  <PlayerPickCard
                    key={matchup.id}
                    matchup={matchup}
                    pickedId={view.picks[matchup.id]}
                    actualWinnerId={view.actualPicks[matchup.id]}
                  />
                ),
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function TournamentBracketCanvas({
  model,
  view,
}: TournamentBracketCanvasProps) {
  const { finalFourPairings, regionLayout } = model;
  const leftFinalFourLabel = finalFourPairings[0]
    .map((region) => REGION_NAMES[region])
    .join(" vs. ");
  const rightFinalFourLabel = finalFourPairings[1]
    .map((region) => REGION_NAMES[region])
    .join(" vs. ");
  const gameIndex =
    view.type === "master"
      ? buildMasterGameIndex(model, view.games)
      : new Map<string, TournamentGame>();
  const teamOrder = buildMasterTeamOrder(model);
  const finalFourMatchups: [BracketMatchup, BracketMatchup] =
    view.type === "master"
      ? [
          {
            id: "final-four-0",
            roundNumber: 5,
            matchupIndex: 0,
            options: [null, null],
          },
          {
            id: "final-four-1",
            roundNumber: 5,
            matchupIndex: 1,
            options: [null, null],
          },
        ]
      : [view.bracket.finalFour[0], view.bracket.finalFour[1]];
  const championship: BracketMatchup =
    view.type === "master"
      ? {
          id: "championship",
          roundNumber: 6,
          matchupIndex: 0,
          options: [null, null],
        }
      : view.bracket.championship;
  const championshipGame = gameIndex.get("championship");
  const champion =
    view.type === "master"
      ? championshipGame?.completed
        ? championshipGame.home_winner
          ? `${championshipGame.home_team_seed ? `#${championshipGame.home_team_seed} ` : ""}${championshipGame.home_team_name}`
          : `${championshipGame?.away_team_seed ? `#${championshipGame.away_team_seed} ` : ""}${championshipGame?.away_team_name}`
        : null
      : view.bracket.champion
        ? `#${view.bracket.champion.seed} ${view.bracket.champion.name}`
        : null;

  const renderFinalCard = (matchup: BracketMatchup) =>
    view.type === "master" ? (
      <MasterGameCard
        matchupId={matchup.id}
        roundNumber={matchup.roundNumber}
        game={gameIndex.get(matchup.id)}
        teamOrder={teamOrder}
      />
    ) : (
      <PlayerPickCard
        matchup={matchup}
        pickedId={view.picks[matchup.id]}
        actualWinnerId={view.actualPicks[matchup.id]}
      />
    );

  return (
    <div className={styles.bracketCanvasFrame}>
      <div className={styles.bracketCanvas}>
        <RegionBracket
          region={regionLayout.topLeft}
          side="left"
          model={model}
          view={view}
          gameIndex={gameIndex}
          teamOrder={teamOrder}
        />
        <RegionBracket
          region={regionLayout.topRight}
          side="right"
          model={model}
          view={view}
          gameIndex={gameIndex}
          teamOrder={teamOrder}
        />
        <RegionBracket
          region={regionLayout.bottomLeft}
          side="left"
          model={model}
          view={view}
          gameIndex={gameIndex}
          teamOrder={teamOrder}
          showHeading={false}
        />
        <RegionBracket
          region={regionLayout.bottomRight}
          side="right"
          model={model}
          view={view}
          gameIndex={gameIndex}
          teamOrder={teamOrder}
          showHeading={false}
        />

        <div className={styles.integratedFinals}>
          <div className={styles.finalFourSlot}>
            <div className={styles.masterRoundHeading}>
              <strong>{leftFinalFourLabel}</strong>
              <span>{model.roundDates.finalFour}</span>
            </div>
            {renderFinalCard(finalFourMatchups[0])}
          </div>

          <div className={styles.championshipSlot}>
            <div className={styles.masterRoundHeading}>
              <strong>National Championship</strong>
              <span>{model.roundDates.championship}</span>
            </div>
            {renderFinalCard(championship)}
            <div className={styles.masterChampion}>
              <Trophy size={22} aria-hidden="true" />
              <span>National Champion</span>
              <strong>{champion ?? "To be decided"}</strong>
            </div>
            {view.type === "player" && (
              <div className={styles.playerTiebreaker}>
                <span>Total points</span>
                <strong>{view.tiebreaker ?? "\u2014"}</strong>
              </div>
            )}
          </div>

          <div className={styles.finalFourSlot}>
            <div className={styles.masterRoundHeading}>
              <strong>{rightFinalFourLabel}</strong>
              <span>{model.roundDates.finalFour}</span>
            </div>
            {renderFinalCard(finalFourMatchups[1])}
          </div>
        </div>
      </div>
    </div>
  );
}
