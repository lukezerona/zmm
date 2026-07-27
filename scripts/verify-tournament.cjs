/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const ts = require("typescript");
const { createClient } = require("@supabase/supabase-js");

require.extensions[".ts"] = (module, filename) => {
  const source = require("node:fs").readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

const {
  buildTournamentModel,
  sanitizePicks,
} = require("../src/app/bracket/bracket-utils.ts");
const {
  allocatePrizePayouts,
  buildActualResults,
  buildLeaderboard,
  buildMasterGameIndex,
} = require("../src/app/march-madness/tournament-utils.ts");

const DEV_PROJECT_REF = "jhxnabvgaxyuyskakdto";
const SEASON_YEAR = 2026;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;

assert.ok(url && secret, "Development Supabase environment variables are required.");
assert.equal(
  new URL(url).hostname.split(".")[0],
  DEV_PROJECT_REF,
  "Tournament verification can only run against development.",
);

const supabase = createClient(url, secret, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function payoutRow(name, points, distance = null) {
  return {
    bracketId: name,
    ownerUserId: name,
    username: name,
    displayName: name,
    rank: 0,
    points,
    possiblePointsRemaining: 0,
    champion: "Test",
    championEliminated: false,
    championWon: false,
    tiebreaker: 140,
    correctPicks: 0,
    completedGames: 0,
    correctPercentage: 0,
    prize: 0,
    tiebreakerDistance: distance,
  };
}

function assertMoney(actual, expected) {
  assert.ok(
    Math.abs(actual - expected) < 0.000001,
    `Expected ${expected}, received ${actual}.`,
  );
}

function verifyPayoutRules() {
  const twoWayFirst = allocatePrizePayouts(
    [payoutRow("A", 10), payoutRow("B", 10), payoutRow("C", 8)],
    false,
    30,
  );
  assertMoney(twoWayFirst[0].prize, 13.5);
  assertMoney(twoWayFirst[1].prize, 13.5);
  assertMoney(twoWayFirst[2].prize, 3);

  const tiebreakSeparated = allocatePrizePayouts(
    [
      payoutRow("A", 10, 1),
      payoutRow("B", 10, 3),
      payoutRow("C", 8, 0),
    ],
    true,
    30,
  );
  assertMoney(tiebreakSeparated[0].prize, 18);
  assertMoney(tiebreakSeparated[1].prize, 9);
  assertMoney(tiebreakSeparated[2].prize, 3);

  const fiveWayTie = allocatePrizePayouts(
    Array.from({ length: 5 }, (_, index) =>
      payoutRow(String(index), 10, 2),
    ),
    true,
    50,
  );
  for (const row of fiveWayTie) assertMoney(row.prize, 10);
}

async function verifyDevelopmentPool() {
  const [profilesResult, bracketsResult, gamesResult, pairingResult] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("user_id, username"),
      supabase
        .from("brackets")
        .select(
          "id, user_id, season_year, display_name, is_primary, picks, tiebreaker_total, updated_at",
        )
        .eq("season_year", SEASON_YEAR),
      supabase
        .from("espn_games")
        .select(
          "espn_event_id, region, round_code, round_number, starts_at, broadcast, status_state, status_description, status_detail, completed, period, clock, home_team_id, home_team_name, home_team_seed, home_score, home_winner, away_team_id, away_team_name, away_team_seed, away_score, away_winner",
        )
        .eq("season_year", SEASON_YEAR),
      supabase
        .from("tournament_region_pairings")
        .select(
          "season_year, left_top_region, left_bottom_region, right_top_region, right_bottom_region",
        )
        .eq("season_year", SEASON_YEAR)
        .single(),
    ]);

  assert.ifError(profilesResult.error);
  assert.ifError(bracketsResult.error);
  assert.ifError(gamesResult.error);
  assert.ifError(pairingResult.error);

  const model = buildTournamentModel(
    gamesResult.data,
    SEASON_YEAR,
    pairingResult.data,
  );
  const brackets = bracketsResult.data.map((bracket) => ({
    ...bracket,
    picks: sanitizePicks(model, bracket.picks),
  }));
  const leaderboard = buildLeaderboard(
    model,
    gamesResult.data,
    profilesResult.data,
    brackets,
  );
  const actualResults = buildActualResults(model, gamesResult.data);
  const masterGames = buildMasterGameIndex(model, gamesResult.data);

  assert.ok(brackets.length > 0);
  for (const bracket of brackets) {
    assert.equal(Object.keys(bracket.picks).length, 63);
  }
  assert.equal(leaderboard.rows.length, brackets.length);
  assert.equal(masterGames.size, 63);
  assert.equal(
    leaderboard.rows.find((row) => row.username === "alex")
      ?.championEliminated,
    true,
  );
  assert.ok(actualResults.actualPicks.championship);
  const winnerBracket = brackets[0];
  const winnerProfile = profilesResult.data.find(
    (profile) => profile.user_id === winnerBracket.user_id,
  );
  assert.ok(winnerProfile);
  const winnerLeaderboard = buildLeaderboard(
    model,
    gamesResult.data,
    [winnerProfile],
    [
      {
        ...winnerBracket,
        picks: {
          ...winnerBracket.picks,
          championship: actualResults.actualPicks.championship,
        },
      },
    ],
  );
  assert.equal(winnerLeaderboard.rows[0].championWon, true);
  assert.equal(winnerLeaderboard.rows[0].championEliminated, false);
  const expectedPot = brackets.length * 10;
  assert.equal(leaderboard.pot, expectedPot);
  assert.equal(leaderboard.championshipComplete, true);
  assert.equal(leaderboard.championshipTotal, 132);
  assertMoney(
    leaderboard.rows.reduce((total, row) => total + row.prize, 0),
    expectedPot,
  );
  for (const row of leaderboard.rows) {
    assert.equal(row.completedGames, 63);
    assert.equal(row.possiblePointsRemaining, 0);
  }
}

verifyPayoutRules();
verifyDevelopmentPool()
  .then(() => console.log("Tournament scoring and practice data verified."))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
