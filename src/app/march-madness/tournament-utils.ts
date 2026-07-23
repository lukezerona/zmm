import {
  BracketEntry,
  BracketMatchup,
  PickMap,
  Region,
  REGIONS,
  TournamentModel,
} from "../bracket/bracket-types";
import { deriveBracket } from "../bracket/bracket-utils";
import {
  LeaderboardEntry,
  PoolBracket,
  PoolProfile,
  TournamentGame,
} from "./tournament-types";

export const ROUND_POINTS: Record<number, number> = {
  1: 1,
  2: 2,
  3: 4,
  4: 8,
  5: 16,
  6: 32,
};

const FIRST_ROUND_SEED_PAIRS = [
  [1, 16],
  [8, 9],
  [5, 12],
  [4, 13],
  [6, 11],
  [3, 14],
  [7, 10],
  [2, 15],
] as const;

function winnerTeamId(game: TournamentGame) {
  if (!game.completed) return null;
  if (game.home_winner) return game.home_team_id;
  if (game.away_winner) return game.away_team_id;
  return null;
}

function matchupContainsGame(
  matchup: BracketMatchup,
  game: TournamentGame,
) {
  const [top, bottom] = matchup.options;
  if (!top || !bottom) return false;

  return (
    (top.teamIds.includes(game.home_team_id) &&
      bottom.teamIds.includes(game.away_team_id)) ||
    (top.teamIds.includes(game.away_team_id) &&
      bottom.teamIds.includes(game.home_team_id))
  );
}

function winningEntry(matchup: BracketMatchup, game: TournamentGame) {
  const winnerId = winnerTeamId(game);
  if (!winnerId) return null;
  return (
    matchup.options.find((entry) => entry?.teamIds.includes(winnerId)) ?? null
  );
}

function regionMatchups(
  model: TournamentModel,
  picks: PickMap,
  region: Region,
  roundNumber: number,
) {
  const rounds = deriveBracket(model, picks).regions[region];
  if (roundNumber === 1) return rounds.roundOf64;
  if (roundNumber === 2) return rounds.roundOf32;
  if (roundNumber === 3) return rounds.sweet16;
  return rounds.elite8;
}

export type ActualResult = {
  matchupId: string;
  winnerEntryId: string;
  winnerTeamId: string;
  roundNumber: number;
  game: TournamentGame;
};

export function buildActualResults(
  model: TournamentModel,
  games: TournamentGame[],
) {
  const actualPicks: PickMap = {};
  const results: ActualResult[] = [];

  for (const region of REGIONS) {
    for (let roundNumber = 1; roundNumber <= 4; roundNumber += 1) {
      const matchups = regionMatchups(
        model,
        actualPicks,
        region,
        roundNumber,
      );
      const roundGames = games.filter(
        (game) =>
          game.region === region && game.round_number === roundNumber,
      );

      for (const matchup of matchups) {
        const game = roundGames.find((candidate) =>
          matchupContainsGame(matchup, candidate),
        );
        if (!game) continue;

        const entry = winningEntry(matchup, game);
        const teamId = winnerTeamId(game);
        if (!entry || !teamId) continue;

        actualPicks[matchup.id] = entry.id;
        results.push({
          matchupId: matchup.id,
          winnerEntryId: entry.id,
          winnerTeamId: teamId,
          roundNumber,
          game,
        });
      }
    }
  }

  const regionalBracket = deriveBracket(model, actualPicks);
  const finalFourGames = games.filter((game) => game.round_number === 5);
  for (const matchup of regionalBracket.finalFour) {
    const game = finalFourGames.find((candidate) =>
      matchupContainsGame(matchup, candidate),
    );
    if (!game) continue;

    const entry = winningEntry(matchup, game);
    const teamId = winnerTeamId(game);
    if (!entry || !teamId) continue;

    actualPicks[matchup.id] = entry.id;
    results.push({
      matchupId: matchup.id,
      winnerEntryId: entry.id,
      winnerTeamId: teamId,
      roundNumber: 5,
      game,
    });
  }

  const finalBracket = deriveBracket(model, actualPicks);
  const championshipGame = games.find((game) => game.round_number === 6);
  if (championshipGame) {
    const entry = winningEntry(
      finalBracket.championship,
      championshipGame,
    );
    const teamId = winnerTeamId(championshipGame);
    if (entry && teamId) {
      actualPicks[finalBracket.championship.id] = entry.id;
      results.push({
        matchupId: finalBracket.championship.id,
        winnerEntryId: entry.id,
        winnerTeamId: teamId,
        roundNumber: 6,
        game: championshipGame,
      });
    }
  }

  return { actualPicks, results };
}

function allEntries(model: TournamentModel) {
  const entries = new Map<string, BracketEntry>();
  for (const region of REGIONS) {
    for (const matchup of model.firstRoundByRegion[region]) {
      for (const entry of matchup.options) {
        if (entry) entries.set(entry.id, entry);
      }
    }
  }
  return entries;
}

function allPlayerMatchups(model: TournamentModel, picks: PickMap) {
  const bracket = deriveBracket(model, picks);
  return [
    ...REGIONS.flatMap((region) => {
      const rounds = bracket.regions[region];
      return [
        ...rounds.roundOf64,
        ...rounds.roundOf32,
        ...rounds.sweet16,
        ...rounds.elite8,
      ];
    }),
    ...bracket.finalFour,
    bracket.championship,
  ];
}

function eliminatedTeams(games: TournamentGame[]) {
  const eliminated = new Set<string>();
  for (const game of games) {
    if (!game.completed) continue;
    if (game.home_winner) eliminated.add(game.away_team_id);
    if (game.away_winner) eliminated.add(game.home_team_id);
  }
  return eliminated;
}

function roundNumberForMatchup(matchup: BracketMatchup) {
  return matchup.roundNumber;
}

export function allocatePrizePayouts(
  rows: LeaderboardEntry[],
  championshipComplete: boolean,
  pot: number,
) {
  const shares = [0.6, 0.3, 0.1];
  const sorted = [...rows].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (
      championshipComplete &&
      a.tiebreakerDistance !== b.tiebreakerDistance
    ) {
      return (
        (a.tiebreakerDistance ?? Number.POSITIVE_INFINITY) -
        (b.tiebreakerDistance ?? Number.POSITIVE_INFINITY)
      );
    }
    return a.displayName.localeCompare(b.displayName);
  });

  let position = 0;
  while (position < sorted.length) {
    const leader = sorted[position];
    let groupEnd = position + 1;

    while (groupEnd < sorted.length) {
      const candidate = sorted[groupEnd];
      const sameScore = candidate.points === leader.points;
      const sameTiebreak =
        candidate.tiebreakerDistance === leader.tiebreakerDistance;
      if (!sameScore || (championshipComplete && !sameTiebreak)) break;
      groupEnd += 1;
    }

    const group = sorted.slice(position, groupEnd);
    const pooledShare = shares
      .slice(position, groupEnd)
      .reduce((total, share) => total + share, 0);

    for (const entry of group) {
      entry.rank = position + 1;
      entry.prize = (pot * pooledShare) / group.length;
    }
    position = groupEnd;
  }

  return sorted;
}

export function buildLeaderboard(
  model: TournamentModel,
  games: TournamentGame[],
  profiles: PoolProfile[],
  brackets: PoolBracket[],
  buyIn = 10,
) {
  const { results } = buildActualResults(model, games);
  const resultByMatchup = new Map(
    results.map((result) => [result.matchupId, result]),
  );
  const entries = allEntries(model);
  const eliminated = eliminatedTeams(games);
  const championship = games.find((game) => game.round_number === 6);
  const championshipComplete = Boolean(championship?.completed);
  const championshipTotal =
    championshipComplete &&
    championship &&
    championship.home_score !== null &&
    championship.away_score !== null
      ? championship.home_score + championship.away_score
      : null;

  const profileByUser = new Map(
    profiles.map((profile) => [profile.user_id, profile]),
  );

  const rows = brackets
    .map((bracket): LeaderboardEntry | null => {
      const profile = profileByUser.get(bracket.user_id);
      if (!profile) return null;

      let points = 0;
      let correctPicks = 0;
      for (const result of results) {
        if (bracket.picks[result.matchupId] !== result.winnerEntryId) continue;
        correctPicks += 1;
        points += ROUND_POINTS[result.roundNumber] ?? 0;
      }

      let possiblePointsRemaining = 0;
      for (const matchup of allPlayerMatchups(model, bracket.picks)) {
        if (resultByMatchup.has(matchup.id)) continue;
        const pickedId = bracket.picks[matchup.id];
        const pickedEntry = matchup.options.find(
          (entry) => entry?.id === pickedId,
        );
        if (
          pickedEntry &&
          pickedEntry.teamIds.some((teamId) => !eliminated.has(teamId))
        ) {
          possiblePointsRemaining +=
            ROUND_POINTS[roundNumberForMatchup(matchup)] ?? 0;
        }
      }

      const champion = entries.get(bracket.picks.championship);
      const tiebreakerDistance =
        championshipTotal !== null && bracket.tiebreaker_total !== null
          ? Math.abs(bracket.tiebreaker_total - championshipTotal)
          : null;

      return {
        userId: bracket.user_id,
        username: profile.username,
        displayName: profile.display_name,
        rank: 0,
        points,
        possiblePointsRemaining,
        champion: champion
          ? `#${champion.seed} ${champion.name}`
          : "No champion selected",
        championEliminated: champion
          ? champion.teamIds.every((teamId) => eliminated.has(teamId))
          : false,
        tiebreaker: bracket.tiebreaker_total,
        correctPicks,
        completedGames: results.length,
        correctPercentage:
          results.length === 0 ? 0 : (correctPicks / results.length) * 100,
        prize: 0,
        tiebreakerDistance,
      };
    })
    .filter((row): row is LeaderboardEntry => row !== null);

  return {
    rows: allocatePrizePayouts(
      rows,
      championshipComplete,
      rows.length * buyIn,
    ),
    championshipComplete,
    championshipTotal,
    pot: rows.length * buyIn,
  };
}

function seedPairIndex(game: TournamentGame) {
  return FIRST_ROUND_SEED_PAIRS.findIndex(
    ([topSeed, bottomSeed]) =>
      new Set([game.home_team_seed, game.away_team_seed]).has(topSeed) &&
      new Set([game.home_team_seed, game.away_team_seed]).has(bottomSeed),
  );
}

export function buildMasterGameIndex(
  model: TournamentModel,
  games: TournamentGame[],
) {
  const index = new Map<string, TournamentGame>();
  const teamPaths = new Map<string, { region: Region; leaf: number }>();

  for (const region of REGIONS) {
    for (const matchup of model.firstRoundByRegion[region]) {
      for (const entry of matchup.options) {
        for (const teamId of entry?.teamIds ?? []) {
          teamPaths.set(teamId, {
            region,
            leaf: matchup.matchupIndex,
          });
        }
      }
    }
  }

  for (const game of games) {
    if (game.round_number === 1 && game.region) {
      const matchupIndex = seedPairIndex(game);
      if (matchupIndex >= 0) {
        index.set(`${game.region}-r1-${matchupIndex}`, game);
      }
      continue;
    }

    if (
      game.round_number !== null &&
      game.round_number >= 2 &&
      game.round_number <= 4 &&
      game.region
    ) {
      const homePath = teamPaths.get(game.home_team_id);
      const awayPath = teamPaths.get(game.away_team_id);
      const leaf = Math.min(
        homePath?.leaf ?? Number.POSITIVE_INFINITY,
        awayPath?.leaf ?? Number.POSITIVE_INFINITY,
      );
      if (Number.isFinite(leaf)) {
        const matchupIndex = Math.floor(
          leaf / 2 ** (game.round_number - 1),
        );
        index.set(
          `${game.region}-r${game.round_number}-${matchupIndex}`,
          game,
        );
      }
      continue;
    }

    if (game.round_number === 5) {
      const regions = new Set(
        [game.home_team_id, game.away_team_id]
          .map((teamId) => teamPaths.get(teamId)?.region)
          .filter(Boolean),
      );
      if (regions.has("east") && regions.has("south")) {
        index.set("final-four-0", game);
      } else if (regions.has("west") && regions.has("midwest")) {
        index.set("final-four-1", game);
      }
      continue;
    }

    if (game.round_number === 6) {
      index.set("championship", game);
    }
  }

  return index;
}
