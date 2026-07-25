import {
  Region,
  REGIONS,
  TournamentModel,
} from "../bracket/bracket-types";
import { TournamentGame } from "../march-madness/tournament-types";
import {
  buildMasterGameIndex,
  ROUND_POINTS,
} from "../march-madness/tournament-utils";

const REGION_LABELS: Record<Region, string> = {
  east: "East",
  west: "West",
  south: "South",
  midwest: "Midwest",
};

const FIRST_ROUND_LABELS = [
  "1 / 16",
  "8 / 9",
  "5 / 12",
  "4 / 13",
  "6 / 11",
  "3 / 14",
  "7 / 10",
  "2 / 15",
];

const EASTERN_GAME_DAY = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "America/New_York",
});

export type PickColumn = {
  id: string;
  label: string;
  roundNumber: number;
};

export type PickGroup = {
  label: string;
  date: string;
  roundNumber: number;
  columns: PickColumn[];
};

function regionColumns(roundNumber: number, count: number): PickColumn[] {
  return REGIONS.flatMap((region) =>
    Array.from({ length: count }, (_, index) => ({
      id: `${region}-r${roundNumber}-${index}`,
      label:
        roundNumber === 1
          ? `${REGION_LABELS[region]} ${FIRST_ROUND_LABELS[index]}`
          : `${REGION_LABELS[region]} ${index + 1}`,
      roundNumber,
    })),
  );
}

function bracketOrderGroups(model: TournamentModel): PickGroup[] {
  return [
    {
      label: `Round of 64 · ${ROUND_POINTS[1]} pt`,
      date: model.roundDates.roundOf64,
      roundNumber: 1,
      columns: regionColumns(1, 8),
    },
    {
      label: `Round of 32 · ${ROUND_POINTS[2]} pts`,
      date: model.roundDates.roundOf32,
      roundNumber: 2,
      columns: regionColumns(2, 4),
    },
    {
      label: `Sweet 16 · ${ROUND_POINTS[3]} pts`,
      date: model.roundDates.sweet16,
      roundNumber: 3,
      columns: regionColumns(3, 2),
    },
    {
      label: `Elite 8 · ${ROUND_POINTS[4]} pts`,
      date: model.roundDates.elite8,
      roundNumber: 4,
      columns: regionColumns(4, 1),
    },
    {
      label: `Final Four · ${ROUND_POINTS[5]} pts`,
      date: model.roundDates.finalFour,
      roundNumber: 5,
      columns: [
        { id: "final-four-0", label: "East / South", roundNumber: 5 },
        { id: "final-four-1", label: "West / Midwest", roundNumber: 5 },
      ],
    },
    {
      label: `Championship · ${ROUND_POINTS[6]} pts`,
      date: model.roundDates.championship,
      roundNumber: 6,
      columns: [
        { id: "championship", label: "National champion", roundNumber: 6 },
      ],
    },
  ];
}

function gameHasStarted(game: TournamentGame) {
  return (
    game.completed ||
    game.status_state === "in" ||
    game.status_state === "post"
  );
}

function gameTimestamp(game: TournamentGame | undefined) {
  if (!game) return Number.POSITIVE_INFINITY;
  const timestamp = new Date(game.starts_at).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY;
}

function gameDay(game: TournamentGame | undefined) {
  if (!game) return "";
  const date = new Date(game.starts_at);
  if (!Number.isFinite(date.getTime())) return "";

  const parts = Object.fromEntries(
    EASTERN_GAME_DAY.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function orderByScheduledTime(
  columns: PickColumn[],
  gameByMatchup: Map<string, TournamentGame>,
) {
  const bracketIndex = new Map(
    columns.map((column, index) => [column.id, index]),
  );

  return [...columns].sort((left, right) => {
    const timeDifference =
      gameTimestamp(gameByMatchup.get(left.id)) -
      gameTimestamp(gameByMatchup.get(right.id));
    if (timeDifference !== 0) return timeDifference;
    return (bracketIndex.get(left.id) ?? 0) - (bracketIndex.get(right.id) ?? 0);
  });
}

function orderActiveRound(
  columns: PickColumn[],
  gameByMatchup: Map<string, TournamentGame>,
) {
  const bracketIndex = new Map(
    columns.map((column, index) => [column.id, index]),
  );
  const activeDay = columns
    .map((column) => gameByMatchup.get(column.id))
    .filter((game): game is TournamentGame => Boolean(game))
    .filter(gameHasStarted)
    .map(gameDay)
    .filter(Boolean)
    .sort()
    .at(-1);

  if (!activeDay) return orderByScheduledTime(columns, gameByMatchup);
  const queueDay = activeDay;

  function queueSection(game: TournamentGame | undefined) {
    const day = gameDay(game);
    if (!game || !day) return 4;
    if (day === queueDay) return game.completed ? 1 : 0;
    if (day > queueDay) return 2;
    return 3;
  }

  return [...columns].sort((left, right) => {
    const leftGame = gameByMatchup.get(left.id);
    const rightGame = gameByMatchup.get(right.id);
    const sectionDifference =
      queueSection(leftGame) - queueSection(rightGame);
    if (sectionDifference !== 0) return sectionDifference;

    const timeDifference =
      gameTimestamp(leftGame) - gameTimestamp(rightGame);
    if (timeDifference !== 0) return timeDifference;
    return (bracketIndex.get(left.id) ?? 0) - (bracketIndex.get(right.id) ?? 0);
  });
}

export function buildSpreadsheetPickGroups(
  model: TournamentModel,
  games: TournamentGame[],
) {
  const groups = bracketOrderGroups(model);
  const gameByMatchup = buildMasterGameIndex(model, games);
  const latestStartedRound = games.reduce((latest, game) => {
    if (
      game.round_number === null ||
      game.round_number < 1 ||
      game.round_number > 6 ||
      !gameHasStarted(game)
    ) {
      return latest;
    }
    return Math.max(latest, game.round_number);
  }, 0);

  if (latestStartedRound === 0) {
    return groups.map((group) =>
      group.roundNumber === 1
        ? {
            ...group,
            columns: orderByScheduledTime(group.columns, gameByMatchup),
          }
        : group,
    );
  }

  const activeGroup = groups[latestStartedRound - 1];
  const orderedActiveGroup = {
    ...activeGroup,
    columns: orderActiveRound(activeGroup.columns, gameByMatchup),
  };
  const futureGroups = groups.slice(latestStartedRound);
  const completedEarlierGroups = groups
    .slice(0, latestStartedRound - 1)
    .reverse();

  return [
    orderedActiveGroup,
    ...futureGroups,
    ...completedEarlierGroups,
  ];
}
