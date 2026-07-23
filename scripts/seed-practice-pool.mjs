import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const DEV_PROJECT_REF = "jhxnabvgaxyuyskakdto";
const SEASON_YEAR = 2026;
const REGIONS = ["east", "west", "south", "midwest"];
const SEED_PAIRS = [
  [1, 16],
  [8, 9],
  [5, 12],
  [4, 13],
  [6, 11],
  [3, 14],
  [7, 10],
  [2, 15],
];

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;

if (!url || !secret) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required.",
  );
}

const projectRef = new URL(url).hostname.split(".")[0];
if (projectRef !== DEV_PROJECT_REF) {
  throw new Error(
    `Practice data is restricted to development project ${DEV_PROJECT_REF}.`,
  );
}

const supabase = createClient(url, secret, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function choose(options, random) {
  return options[Math.floor(random() * options.length)];
}

function playInEntries(games) {
  const entries = new Map();
  for (const game of games) {
    if (
      game.round_code !== "PLAY_IN" ||
      !REGIONS.includes(game.region) ||
      game.home_team_seed !== game.away_team_seed
    ) {
      continue;
    }
    entries.set(`${game.region}:${game.home_team_seed}`, {
      id: `play-in:${game.region}:${game.home_team_seed}`,
    });
  }
  return entries;
}

function firstRound(games, region, playIns) {
  const regionGames = games.filter(
    (game) =>
      game.round_code === "ROUND_OF_64" && game.region === region,
  );

  return SEED_PAIRS.map(([topSeed, bottomSeed], matchupIndex) => {
    const game = regionGames.find((candidate) => {
      const seeds = new Set([
        candidate.home_team_seed,
        candidate.away_team_seed,
      ]);
      return seeds.has(topSeed) && seeds.has(bottomSeed);
    });
    if (!game) {
      throw new Error(
        `Missing ${region} ${topSeed} vs. ${bottomSeed} first-round game.`,
      );
    }

    const entries = [
      {
        id:
          playIns.get(`${region}:${game.home_team_seed}`)?.id ??
          `team:${game.home_team_id}`,
        seed: game.home_team_seed,
      },
      {
        id:
          playIns.get(`${region}:${game.away_team_seed}`)?.id ??
          `team:${game.away_team_id}`,
        seed: game.away_team_seed,
      },
    ].sort((a, b) => a.seed - b.seed);

    return {
      id: `${region}-r1-${matchupIndex}`,
      entries,
    };
  });
}

function fillBracket(games, seed) {
  const random = seededRandom(seed);
  const playIns = playInEntries(games);
  const picks = {};
  const regionWinners = {};

  for (const region of REGIONS) {
    let matchups = firstRound(games, region, playIns);

    for (let round = 1; round <= 4; round += 1) {
      const winners = matchups.map((matchup) => {
        const winner = choose(matchup.entries, random);
        picks[matchup.id] = winner.id;
        return winner;
      });

      if (round === 4) {
        regionWinners[region] = winners[0];
      } else {
        matchups = Array.from(
          { length: winners.length / 2 },
          (_, matchupIndex) => ({
            id: `${region}-r${round + 1}-${matchupIndex}`,
            entries: [
              winners[matchupIndex * 2],
              winners[matchupIndex * 2 + 1],
            ],
          }),
        );
      }
    }
  }

  const semifinalists = [
    [regionWinners.east, regionWinners.south],
    [regionWinners.west, regionWinners.midwest],
  ];
  const finalists = semifinalists.map((entries, matchupIndex) => {
    const winner = choose(entries, random);
    picks[`final-four-${matchupIndex}`] = winner.id;
    return winner;
  });
  picks.championship = choose(finalists, random).id;

  return {
    picks,
    tiebreaker: 120 + Math.floor(random() * 46),
  };
}

async function findAuthUserByEmail(email) {
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 100,
    });
    if (error) throw error;
    const found = data.users.find((user) => user.email === email);
    if (found) return found;
    if (data.users.length < 100) return null;
    page += 1;
  }
}

async function createPracticeUser(email) {
  const existing = await findAuthUserByEmail(email);
  if (existing) return existing;

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    password: `Zmm-${randomBytes(24).toString("base64url")}`,
  });
  if (error || !data.user) throw error ?? new Error(`Could not create ${email}`);
  return data.user;
}

async function run() {
  const [{ data: games, error: gamesError }, { data: profiles, error: profilesError }] =
    await Promise.all([
      supabase
        .from("espn_games")
        .select(
          "round_code, region, home_team_id, home_team_seed, away_team_id, away_team_seed",
        )
        .eq("season_year", SEASON_YEAR)
        .in("round_code", ["PLAY_IN", "ROUND_OF_64"]),
      supabase
        .from("profiles")
        .select("user_id, username, display_name"),
    ]);

  if (gamesError) throw gamesError;
  if (profilesError) throw profilesError;

  const luke = profiles.find((profile) => profile.username === "luke");
  if (!luke) throw new Error("The development Luke profile was not found.");

  const oldTestProfile = profiles.find(
    (profile) => profile.username === "codex_bracket_260722",
  );
  const practicePeople = [
    {
      username: "alex",
      displayName: "Alex",
      email: "zmm-practice-alex@example.com",
      userId: oldTestProfile?.user_id,
      seed: 202602,
    },
    {
      username: "jordan",
      displayName: "Jordan",
      email: "zmm-practice-jordan@example.com",
      seed: 202603,
    },
    {
      username: "casey",
      displayName: "Casey",
      email: "zmm-practice-casey@example.com",
      seed: 202604,
    },
    {
      username: "riley",
      displayName: "Riley",
      email: "zmm-practice-riley@example.com",
      seed: 202605,
    },
  ];

  const entrants = [
    {
      userId: luke.user_id,
      username: luke.username,
      displayName: luke.display_name,
      seed: 202601,
    },
  ];

  for (const person of practicePeople) {
    const existingProfile = profiles.find(
      (profile) => profile.username === person.username,
    );
    const authUser = person.userId
      ? { id: person.userId }
      : existingProfile
        ? { id: existingProfile.user_id }
        : await createPracticeUser(person.email);
    entrants.push({ ...person, userId: authUser.id });
  }

  for (const entrant of entrants) {
    const { error: profileError } = await supabase.from("profiles").upsert(
      {
        user_id: entrant.userId,
        username: entrant.username,
        display_name: entrant.displayName,
      },
      { onConflict: "user_id" },
    );
    if (profileError) throw profileError;

    const bracket = fillBracket(games, entrant.seed);
    const { error: bracketError } = await supabase.from("brackets").upsert(
      {
        user_id: entrant.userId,
        season_year: SEASON_YEAR,
        picks: bracket.picks,
        tiebreaker_total: bracket.tiebreaker,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,season_year" },
    );
    if (bracketError) throw bracketError;
  }

  console.log(
    `Seeded ${entrants.length} complete ${SEASON_YEAR} brackets in development.`,
  );
}

await run();
