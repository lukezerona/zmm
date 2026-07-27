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
const PICK_OVERRIDES_BY_USERNAME = {
  morgan: {
    "midwest-r1-0": "team:130",
    "midwest-r2-0": "team:130",
    "midwest-r3-0": "team:130",
    "midwest-r4-0": "team:130",
    "final-four-1": "team:130",
    championship: "team:130",
  },
};

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
        .select("user_id, username"),
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
    {
      username: "morgan",
      displayName: "Morgan",
      email: "zmm-practice-morgan@example.com",
      seed: 202606,
    },
    {
      username: "taylor",
      displayName: "Taylor",
      email: "zmm-practice-taylor@example.com",
      seed: 202607,
    },
    {
      username: "jamie",
      displayName: "Jamie",
      email: "zmm-practice-jamie@example.com",
      seed: 202608,
    },
    {
      username: "cameron",
      displayName: "Cameron",
      email: "zmm-practice-cameron@example.com",
      seed: 202609,
    },
    {
      username: "avery",
      displayName: "Avery",
      email: "zmm-practice-avery@example.com",
      seed: 202610,
    },
    {
      username: "parker",
      displayName: "Parker",
      email: "zmm-practice-parker@example.com",
      seed: 202611,
    },
    {
      username: "quinn",
      displayName: "Quinn",
      email: "zmm-practice-quinn@example.com",
      seed: 202612,
    },
    {
      username: "reese",
      displayName: "Reese",
      email: "zmm-practice-reese@example.com",
      seed: 202613,
    },
    {
      username: "drew",
      displayName: "Drew",
      email: "zmm-practice-drew@example.com",
      seed: 202614,
    },
    {
      username: "hayden",
      displayName: "Hayden",
      email: "zmm-practice-hayden@example.com",
      seed: 202615,
    },
    {
      username: "emerson",
      displayName: "Emerson",
      email: "zmm-practice-emerson@example.com",
      seed: 202616,
    },
    {
      username: "finley",
      displayName: "Finley",
      email: "zmm-practice-finley@example.com",
      seed: 202617,
    },
    {
      username: "skyler",
      displayName: "Skyler",
      email: "zmm-practice-skyler@example.com",
      seed: 202618,
    },
    {
      username: "dakota",
      displayName: "Dakota",
      email: "zmm-practice-dakota@example.com",
      seed: 202619,
    },
    {
      username: "rowan",
      displayName: "Rowan",
      email: "zmm-practice-rowan@example.com",
      seed: 202620,
    },
    {
      username: "peyton",
      displayName: "Peyton",
      email: "zmm-practice-peyton@example.com",
      seed: 202621,
    },
    {
      username: "kendall",
      displayName: "Kendall",
      email: "zmm-practice-kendall@example.com",
      seed: 202622,
    },
    {
      username: "charlie",
      displayName: "Charlie",
      email: "zmm-practice-charlie@example.com",
      seed: 202623,
    },
    {
      username: "sydney",
      displayName: "Sydney",
      email: "zmm-practice-sydney@example.com",
      seed: 202624,
    },
    {
      username: "logan",
      displayName: "Logan",
      email: "zmm-practice-logan@example.com",
      seed: 202625,
    },
    {
      username: "bailey",
      displayName: "Bailey",
      email: "zmm-practice-bailey@example.com",
      seed: 202626,
    },
    {
      username: "sam",
      displayName: "Sam",
      email: "zmm-practice-sam@example.com",
      seed: 202627,
    },
    {
      username: "jesse",
      displayName: "Jesse",
      email: "zmm-practice-jesse@example.com",
      seed: 202628,
    },
    {
      username: "devin",
      displayName: "Devin",
      email: "zmm-practice-devin@example.com",
      seed: 202629,
    },
    {
      username: "robin",
      displayName: "Robin",
      email: "zmm-practice-robin@example.com",
      seed: 202630,
    },
  ];

  const entrants = [
    {
      userId: luke.user_id,
      username: luke.username,
      displayName: "Luke",
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
      },
      { onConflict: "user_id" },
    );
    if (profileError) throw profileError;

    const bracket = fillBracket(games, entrant.seed);
    Object.assign(
      bracket.picks,
      PICK_OVERRIDES_BY_USERNAME[entrant.username] ?? {},
    );
    const { data: existingBracket, error: existingBracketError } =
      await supabase
        .from("brackets")
        .select("id")
        .eq("user_id", entrant.userId)
        .eq("season_year", SEASON_YEAR)
        .eq("is_primary", true)
        .maybeSingle();
    if (existingBracketError) throw existingBracketError;

    const bracketPayload = {
      user_id: entrant.userId,
      season_year: SEASON_YEAR,
      display_name: entrant.displayName,
      picks: bracket.picks,
      tiebreaker_total: bracket.tiebreaker,
      updated_at: new Date().toISOString(),
    };
    const { error: bracketError } = existingBracket
      ? await supabase
          .from("brackets")
          .update(bracketPayload)
          .eq("id", existingBracket.id)
      : await supabase.from("brackets").insert(bracketPayload);
    if (bracketError) throw bracketError;
  }

  console.log(
    `Seeded ${entrants.length} complete ${SEASON_YEAR} brackets in development.`,
  );
}

await run();
