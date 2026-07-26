import {
  BracketEntry,
  BracketMatchup,
  DerivedBracket,
  EspnGameRow,
  PickMap,
  Region,
  RegionRounds,
  REGIONS,
  TournamentModel,
  TournamentRegionPairingRow,
} from "./bracket-types";

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

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "America/New_York",
});

function roundDateLabel(games: EspnGameRow[], roundCode: string) {
  const dates = games
    .filter((game) => game.round_code === roundCode)
    .map((game) => ({
      timestamp: new Date(game.starts_at).getTime(),
      label: DATE_FORMATTER.format(new Date(game.starts_at)),
    }))
    .filter((date) => Number.isFinite(date.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp);

  if (dates.length === 0) return "Date TBD";

  const first = dates[0].label;
  const last = dates[dates.length - 1].label;
  return first === last ? first : `${first}\u2013${last}`;
}

function isRegion(value: string | null): value is Region {
  return REGIONS.some((region) => region === value);
}

function teamEntry(
  region: Region,
  teamId: string,
  name: string,
  seed: number,
): BracketEntry {
  return {
    id: `team:${teamId}`,
    name,
    seed,
    region,
    teamIds: [teamId],
    isPlayIn: false,
  };
}

function playInEntries(games: EspnGameRow[]) {
  const entries = new Map<string, BracketEntry>();

  for (const game of games) {
    if (
      game.round_code !== "PLAY_IN" ||
      !isRegion(game.region) ||
      game.home_team_seed === null ||
      game.away_team_seed === null ||
      game.home_team_seed !== game.away_team_seed
    ) {
      continue;
    }

    const names = [game.home_team_name, game.away_team_name].sort((a, b) =>
      a.localeCompare(b),
    );
    const seed = game.home_team_seed;
    entries.set(`${game.region}:${seed}`, {
      id: `play-in:${game.region}:${seed}`,
      name: names.join("/"),
      seed,
      region: game.region,
      teamIds: [game.home_team_id, game.away_team_id],
      isPlayIn: true,
    });
  }

  return entries;
}

function entryForTeam(
  region: Region,
  teamId: string,
  name: string,
  seed: number | null,
  playIns: Map<string, BracketEntry>,
) {
  if (seed === null) {
    throw new Error(`A ${region} team is missing its tournament seed.`);
  }

  return playIns.get(`${region}:${seed}`) ?? teamEntry(region, teamId, name, seed);
}

function seedSetMatches(
  homeSeed: number | null,
  awaySeed: number | null,
  expected: readonly [number, number],
) {
  return (
    homeSeed !== null &&
    awaySeed !== null &&
    new Set([homeSeed, awaySeed]).has(expected[0]) &&
    new Set([homeSeed, awaySeed]).has(expected[1])
  );
}

export function buildTournamentModel(
  games: EspnGameRow[],
  seasonYear: number,
  pairing: TournamentRegionPairingRow | null,
): TournamentModel {
  if (!pairing || pairing.season_year !== seasonYear) {
    throw new Error(
      `Final Four region pairings are not configured for ${seasonYear}.`,
    );
  }

  const configuredRegions = [
    pairing.left_top_region,
    pairing.left_bottom_region,
    pairing.right_top_region,
    pairing.right_bottom_region,
  ];
  if (
    configuredRegions.some((region) => !REGIONS.includes(region)) ||
    new Set(configuredRegions).size !== REGIONS.length
  ) {
    throw new Error(
      `Final Four region pairings are invalid for ${seasonYear}.`,
    );
  }

  const playIns = playInEntries(games);
  const firstRoundByRegion = {} as Record<Region, BracketMatchup[]>;

  for (const region of REGIONS) {
    const regionGames = games.filter(
      (game) => game.round_code === "ROUND_OF_64" && game.region === region,
    );

    firstRoundByRegion[region] = FIRST_ROUND_SEED_PAIRS.map(
      (seedPair, matchupIndex) => {
        const game = regionGames.find((candidate) =>
          seedSetMatches(
            candidate.home_team_seed,
            candidate.away_team_seed,
            seedPair,
          ),
        );

        if (!game) {
          throw new Error(
            `The ${region} region is missing its ${seedPair[0]} vs. ${seedPair[1]} matchup.`,
          );
        }

        const entries = [
          entryForTeam(
            region,
            game.home_team_id,
            game.home_team_name,
            game.home_team_seed,
            playIns,
          ),
          entryForTeam(
            region,
            game.away_team_id,
            game.away_team_name,
            game.away_team_seed,
            playIns,
          ),
        ].sort((a, b) => a.seed - b.seed) as [BracketEntry, BracketEntry];

        return {
          id: `${region}-r1-${matchupIndex}`,
          roundNumber: 1,
          matchupIndex,
          options: entries,
        };
      },
    );
  }

  return {
    seasonYear,
    firstRoundByRegion,
    regionLayout: {
      topLeft: pairing.left_top_region,
      topRight: pairing.right_top_region,
      bottomLeft: pairing.left_bottom_region,
      bottomRight: pairing.right_bottom_region,
    },
    finalFourPairings: [
      [pairing.left_top_region, pairing.left_bottom_region],
      [pairing.right_top_region, pairing.right_bottom_region],
    ],
    roundDates: {
      roundOf64: roundDateLabel(games, "ROUND_OF_64"),
      roundOf32: roundDateLabel(games, "ROUND_OF_32"),
      sweet16: roundDateLabel(games, "SWEET_16"),
      elite8: roundDateLabel(games, "ELITE_8"),
      finalFour: roundDateLabel(games, "FINAL_FOUR"),
      championship: roundDateLabel(games, "CHAMPIONSHIP"),
    },
  };
}

function selectedEntry(matchup: BracketMatchup, picks: PickMap) {
  const pickedId = picks[matchup.id];
  return matchup.options.find((entry) => entry?.id === pickedId) ?? null;
}

function nextRound(
  region: Region,
  roundNumber: number,
  previousRound: BracketMatchup[],
  picks: PickMap,
): BracketMatchup[] {
  const matchupCount = previousRound.length / 2;
  return Array.from({ length: matchupCount }, (_, matchupIndex) => ({
    id: `${region}-r${roundNumber}-${matchupIndex}`,
    roundNumber,
    matchupIndex,
    options: [
      selectedEntry(previousRound[matchupIndex * 2], picks),
      selectedEntry(previousRound[matchupIndex * 2 + 1], picks),
    ] as [BracketEntry | null, BracketEntry | null],
  }));
}

function regionRounds(
  model: TournamentModel,
  region: Region,
  picks: PickMap,
): RegionRounds {
  const roundOf64 = model.firstRoundByRegion[region];
  const roundOf32 = nextRound(region, 2, roundOf64, picks);
  const sweet16 = nextRound(region, 3, roundOf32, picks);
  const elite8 = nextRound(region, 4, sweet16, picks);
  return { roundOf64, roundOf32, sweet16, elite8 };
}

function regionalChampion(rounds: RegionRounds, picks: PickMap) {
  return selectedEntry(rounds.elite8[0], picks);
}

export function deriveBracket(
  model: TournamentModel,
  picks: PickMap,
): DerivedBracket {
  const regions = {} as Record<Region, RegionRounds>;
  for (const region of REGIONS) {
    regions[region] = regionRounds(model, region, picks);
  }

  const finalFour = [
    {
      id: "final-four-0",
      roundNumber: 5,
      matchupIndex: 0,
      options: [
        regionalChampion(regions[model.finalFourPairings[0][0]], picks),
        regionalChampion(regions[model.finalFourPairings[0][1]], picks),
      ] as [BracketEntry | null, BracketEntry | null],
    },
    {
      id: "final-four-1",
      roundNumber: 5,
      matchupIndex: 1,
      options: [
        regionalChampion(regions[model.finalFourPairings[1][0]], picks),
        regionalChampion(regions[model.finalFourPairings[1][1]], picks),
      ] as [BracketEntry | null, BracketEntry | null],
    },
  ];

  const championship = {
    id: "championship",
    roundNumber: 6,
    matchupIndex: 0,
    options: finalFour.map((matchup) => selectedEntry(matchup, picks)) as [
      BracketEntry | null,
      BracketEntry | null,
    ],
  };

  return {
    regions,
    finalFour,
    championship,
    champion: selectedEntry(championship, picks),
  };
}

function acceptValidPick(
  accepted: PickMap,
  candidate: PickMap,
  matchup: BracketMatchup,
) {
  const candidateId = candidate[matchup.id];
  if (
    matchup.options.some((entry) => entry?.id === candidateId)
  ) {
    accepted[matchup.id] = candidateId;
  }
}

export function sanitizePicks(model: TournamentModel, candidate: PickMap) {
  const accepted: PickMap = {};

  for (const region of REGIONS) {
    let matchups = model.firstRoundByRegion[region];
    for (let roundNumber = 1; roundNumber <= 4; roundNumber += 1) {
      if (roundNumber > 1) {
        matchups = nextRound(region, roundNumber, matchups, accepted);
      }
      for (const matchup of matchups) {
        acceptValidPick(accepted, candidate, matchup);
      }
    }
  }

  const regionalBracket = deriveBracket(model, accepted);
  for (const matchup of regionalBracket.finalFour) {
    acceptValidPick(accepted, candidate, matchup);
  }

  const finalBracket = deriveBracket(model, accepted);
  acceptValidPick(accepted, candidate, finalBracket.championship);

  return accepted;
}

export function pickCount(bracket: DerivedBracket | null, picks: PickMap) {
  if (!bracket) return 0;

  const regionalMatchups = REGIONS.flatMap((region) => {
    const rounds = bracket.regions[region];
    return [
      ...rounds.roundOf64,
      ...rounds.roundOf32,
      ...rounds.sweet16,
      ...rounds.elite8,
    ];
  });
  const matchups = [
    ...regionalMatchups,
    ...bracket.finalFour,
    bracket.championship,
  ];

  return matchups.filter((matchup) => {
    const pickedId = picks[matchup.id];
    return (
      typeof pickedId === "string" &&
      matchup.options.some(
        (entry) => entry !== null && entry.id === pickedId,
      )
    );
  }).length;
}
