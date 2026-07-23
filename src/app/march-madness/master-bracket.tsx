"use client";

import { Radio, Trophy } from "lucide-react";
import {
  BracketMatchup,
  Region,
  REGIONS,
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

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/New_York",
});

function gameStatus(game: TournamentGame) {
  if (game.completed) return "Final";
  if (game.status_state === "in") {
    return game.status_detail || game.clock || "Live";
  }
  return DATE_FORMATTER.format(new Date(game.starts_at));
}
function TeamScore({
  name,
  seed,
  score,
  winner,
}: {
  name: string;
  seed: number | null;
  score: number | null;
  winner: boolean;
}) {
  return (
    <div className={`${styles.scoreRow} ${winner ? styles.gameWinner : ""}`}>
      <span className={styles.seed}>{seed ?? "—"}</span>
      <strong>{name}</strong>
      <b>{score ?? "—"}</b>
    </div>
  );
}

function MasterGameCard({
  matchup,
  game,
}: {
  matchup: BracketMatchup;
  game?: TournamentGame;
}) {
  if (!game) {
    return (
      <article className={`${styles.gameCard} ${styles.awaitingGame}`}>
        <span>Awaiting matchup</span>
      </article>
    );
  }

  const live = game.status_state === "in" && !game.completed;
  const upcoming = !game.completed && !live;

  return (
    <article
      className={`${styles.gameCard} ${live ? styles.liveGame : ""}`}
      aria-label={`Round ${matchup.roundNumber}: ${game.away_team_name} versus ${game.home_team_name}`}
    >
      <div className={styles.gameMeta}>
        <span className={live ? styles.liveBadge : ""}>
          {live && <Radio size={10} aria-hidden="true" />}
          {gameStatus(game)}
        </span>
        {(live || upcoming) && game.broadcast && <b>{game.broadcast}</b>}
      </div>
      <TeamScore
        name={game.away_team_name}
        seed={game.away_team_seed}
        score={game.away_score}
        winner={game.away_winner}
      />
      <TeamScore
        name={game.home_team_name}
        seed={game.home_team_seed}
        score={game.home_score}
        winner={game.home_winner}
      />
    </article>
  );
}

function RegionMasterBracket({
  region,
  model,
  gameIndex,
  flow,
}: {
  region: Region;
  model: TournamentModel;
  gameIndex: Map<string, TournamentGame>;
  flow: "left" | "right";
}) {
  const firstRound = model.firstRoundByRegion[region];
  const columns = [
    {
      label: "Round of 64",
      date: model.roundDates.roundOf64,
      matchups: firstRound,
    },
    {
      label: "Round of 32",
      date: model.roundDates.roundOf32,
      matchups: Array.from({ length: 4 }, (_, matchupIndex) => ({
        id: `${region}-r2-${matchupIndex}`,
        roundNumber: 2,
        matchupIndex,
        options: [null, null],
      })) as BracketMatchup[],
    },
    {
      label: "Sweet 16",
      date: model.roundDates.sweet16,
      matchups: Array.from({ length: 2 }, (_, matchupIndex) => ({
        id: `${region}-r3-${matchupIndex}`,
        roundNumber: 3,
        matchupIndex,
        options: [null, null],
      })) as BracketMatchup[],
    },
    {
      label: "Elite 8",
      date: model.roundDates.elite8,
      matchups: [
        {
          id: `${region}-r4-0`,
          roundNumber: 4,
          matchupIndex: 0,
          options: [null, null],
        },
      ] as BracketMatchup[],
    },
  ];
  const displayed = flow === "right" ? columns : [...columns].reverse();

  return (
    <section className={styles.masterRegion}>
      <h3>{REGION_NAMES[region]} Region</h3>
      <div className={styles.masterRegionScroll}>
        <div className={styles.masterRegionGrid}>
          {displayed.map((column) => (
            <div className={styles.masterRound} key={column.label}>
              <div className={styles.masterRoundHeading}>
                <strong>{column.label}</strong>
                <span>{column.date}</span>
              </div>
              <div className={styles.masterMatchups}>
                {column.matchups.map((matchup) => (
                  <MasterGameCard
                    key={matchup.id}
                    matchup={matchup}
                    game={gameIndex.get(matchup.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function MasterBracket({
  model,
  games,
}: {
  model: TournamentModel;
  games: TournamentGame[];
}) {
  const gameIndex = buildMasterGameIndex(model, games);
  const finalFourMatchups: BracketMatchup[] = [
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
  ];
  const championship: BracketMatchup = {
    id: "championship",
    roundNumber: 6,
    matchupIndex: 0,
    options: [null, null],
  };
  const championGame = gameIndex.get("championship");
  const champion = championGame?.completed
    ? championGame.home_winner
      ? championGame.home_team_name
      : championGame.away_team_name
    : null;

  return (
    <>
      <div className={styles.masterRegions}>
        {REGIONS.map((region, index) => (
          <RegionMasterBracket
            key={region}
            region={region}
            model={model}
            gameIndex={gameIndex}
            flow={index % 2 === 0 ? "right" : "left"}
          />
        ))}
      </div>

      <section className={styles.masterFinals}>
        <h3>Final Four &amp; Championship</h3>
        <div className={styles.masterFinalsGrid}>
          <div>
            <div className={styles.masterRoundHeading}>
              <strong>East vs. South</strong>
              <span>{model.roundDates.finalFour}</span>
            </div>
            <MasterGameCard
              matchup={finalFourMatchups[0]}
              game={gameIndex.get("final-four-0")}
            />
          </div>
          <div className={styles.masterChampionship}>
            <div className={styles.masterRoundHeading}>
              <strong>National Championship</strong>
              <span>{model.roundDates.championship}</span>
            </div>
            <MasterGameCard
              matchup={championship}
              game={championGame}
            />
            <div className={styles.masterChampion}>
              <Trophy size={22} aria-hidden="true" />
              <span>National Champion</span>
              <strong>{champion ?? "To be decided"}</strong>
            </div>
          </div>
          <div>
            <div className={styles.masterRoundHeading}>
              <strong>West vs. Midwest</strong>
              <span>{model.roundDates.finalFour}</span>
            </div>
            <MasterGameCard
              matchup={finalFourMatchups[1]}
              game={gameIndex.get("final-four-1")}
            />
          </div>
        </div>
      </section>
    </>
  );
}
