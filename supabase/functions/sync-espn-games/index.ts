import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

const SOURCE = "mens-college-basketball";
const TOURNAMENT_PREFIX = "NCAA Men's Basketball Championship";
const ESPN_SCOREBOARD_URL =
  "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard";
const MAX_RANGE_DAYS = 45;

type SyncRequest = {
  mode?: "auto" | "date" | "range";
  date?: string;
  startDate?: string;
  endDate?: string;
};

type JsonRecord = Record<string, unknown>;

type RoundDetails = {
  code: string;
  number: number | null;
  region: "east" | "midwest" | "south" | "west" | null;
  isPlayIn: boolean;
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function asInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === "string" && /^\d+$/.test(value)) {
    return Number.parseInt(value, 10);
  }

  return null;
}

function easternDate(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}${values.month}${values.day}`;
}

function validateDate(value: string | undefined, field: string): string {
  if (!value || !/^\d{8}$/.test(value)) {
    throw new Error(`${field} must use YYYYMMDD format.`);
  }

  const year = Number.parseInt(value.slice(0, 4), 10);
  const month = Number.parseInt(value.slice(4, 6), 10);
  const day = Number.parseInt(value.slice(6, 8), 10);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error(`${field} is not a valid calendar date.`);
  }

  return value;
}

function dateToUtc(value: string): Date {
  return new Date(
    Date.UTC(
      Number.parseInt(value.slice(0, 4), 10),
      Number.parseInt(value.slice(4, 6), 10) - 1,
      Number.parseInt(value.slice(6, 8), 10),
    ),
  );
}

function requestScope(body: SyncRequest): string {
  const mode = body.mode ?? "auto";

  if (mode === "auto") {
    return easternDate();
  }

  if (mode === "date") {
    return validateDate(body.date, "date");
  }

  if (mode === "range") {
    const start = validateDate(body.startDate, "startDate");
    const end = validateDate(body.endDate, "endDate");
    const startDate = dateToUtc(start);
    const endDate = dateToUtc(end);
    const rangeDays = Math.floor(
      (endDate.getTime() - startDate.getTime()) / 86_400_000,
    );

    if (rangeDays < 0 || rangeDays > MAX_RANGE_DAYS) {
      throw new Error(`Date ranges must be between 0 and ${MAX_RANGE_DAYS} days.`);
    }

    return `${start}-${end}`;
  }

  throw new Error("mode must be auto, date, or range.");
}

function parseRound(headline: string): RoundDetails {
  const regionMatch = headline.match(/ - (East|Midwest|South|West) Region(?: -|$)/);
  const region = regionMatch
    ? (regionMatch[1].toLowerCase() as RoundDetails["region"])
    : null;

  if (/National Championship$/i.test(headline)) {
    return { code: "CHAMPIONSHIP", number: 6, region: null, isPlayIn: false };
  }
  if (/(Final Four|National Semifinal)$/i.test(headline)) {
    return { code: "FINAL_FOUR", number: 5, region: null, isPlayIn: false };
  }
  if (/(Elite 8|Regional Final)$/i.test(headline)) {
    return { code: "ELITE_8", number: 4, region, isPlayIn: false };
  }
  if (/(Sweet 16|Regional Semifinal)$/i.test(headline)) {
    return { code: "SWEET_16", number: 3, region, isPlayIn: false };
  }
  if (/(2nd Round|Round of 32)$/i.test(headline)) {
    return { code: "ROUND_OF_32", number: 2, region, isPlayIn: false };
  }
  if (/(1st Round|Round of 64)$/i.test(headline)) {
    return { code: "ROUND_OF_64", number: 1, region, isPlayIn: false };
  }
  if (/First (Four|Eight|Twelve|Sixteen|\d+)$/i.test(headline)) {
    return { code: "PLAY_IN", number: 0, region, isPlayIn: true };
  }
  if (/(Opening Round|Play[ -]?In)$/i.test(headline)) {
    return { code: "PLAY_IN", number: 0, region, isPlayIn: true };
  }

  return { code: "UNCLASSIFIED", number: null, region, isPlayIn: false };
}

function tournamentHeadline(competition: JsonRecord): string | null {
  const notes = asArray(competition.notes);

  for (const noteValue of notes) {
    const headline = asString(asRecord(noteValue).headline);
    if (headline?.startsWith(TOURNAMENT_PREFIX)) {
      return headline;
    }
  }

  return null;
}

function competitorBySide(competition: JsonRecord, side: "home" | "away") {
  return asArray(competition.competitors)
    .map(asRecord)
    .find((competitor) => competitor.homeAway === side) ?? null;
}

function normalizeCompetitor(competitor: JsonRecord) {
  const team = asRecord(competitor.team);
  const curatedRank = asRecord(competitor.curatedRank);

  return {
    id: asString(team.id),
    name: asString(team.shortDisplayName) ?? asString(team.displayName),
    abbreviation: asString(team.abbreviation),
    seed: asInteger(curatedRank.current),
    logoUrl: asString(team.logo),
    score: asInteger(competitor.score),
    winner: asBoolean(competitor.winner),
  };
}

async function sha256(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function normalizeEvent(eventValue: unknown, syncedAt: string) {
  const event = asRecord(eventValue);
  const competition = asRecord(asArray(event.competitions)[0]);
  const headline = tournamentHeadline(competition);

  if (!headline) {
    return null;
  }

  const round = parseRound(headline);
  const homeValue = competitorBySide(competition, "home");
  const awayValue = competitorBySide(competition, "away");
  const eventId = asString(event.id);
  const startsAt = asString(event.date);

  if (!homeValue || !awayValue || !eventId || !startsAt) {
    return null;
  }

  const home = normalizeCompetitor(homeValue);
  const away = normalizeCompetitor(awayValue);

  if (!home.id || !home.name || !away.id || !away.name) {
    return null;
  }

  const season = asRecord(event.season);
  const venue = asRecord(competition.venue);
  const address = asRecord(venue.address);
  const status = asRecord(competition.status);
  const statusType = asRecord(status.type);
  const broadcast = asArray(competition.broadcasts)
    .flatMap((value) => asArray(asRecord(value).names))
    .map(asString)
    .find((value): value is string => Boolean(value)) ?? null;

  const game = {
    espn_event_id: eventId,
    season_year: asInteger(season.year),
    season_slug: asString(season.slug),
    starts_at: startsAt,
    event_name: asString(event.name) ?? `${away.name} at ${home.name}`,
    tournament_headline: headline,
    region: round.region,
    round_code: round.code,
    round_number: round.number,
    is_play_in: round.isPlayIn,
    venue_name: asString(venue.fullName),
    venue_city: asString(address.city),
    venue_state: asString(address.state),
    broadcast,
    status_state: asString(statusType.state) ?? "unknown",
    status_description: asString(statusType.description),
    status_detail: asString(statusType.shortDetail),
    completed: asBoolean(statusType.completed),
    period: asInteger(status.period),
    clock: asString(status.displayClock),
    home_team_id: home.id,
    home_team_name: home.name,
    home_team_abbreviation: home.abbreviation,
    home_team_seed: home.seed,
    home_team_logo_url: home.logoUrl,
    home_score: home.score,
    home_winner: home.winner,
    away_team_id: away.id,
    away_team_name: away.name,
    away_team_abbreviation: away.abbreviation,
    away_team_seed: away.seed,
    away_team_logo_url: away.logoUrl,
    away_score: away.score,
    away_winner: away.winner,
  };

  if (!game.season_year) {
    return null;
  }

  return {
    ...game,
    source_hash: await sha256(game),
    source_updated_at: syncedAt,
    updated_at: syncedAt,
  };
}

async function parseBody(req: Request): Promise<SyncRequest> {
  if (!req.body) {
    return {};
  }

  const value: unknown = await req.json();
  return isRecord(value) ? value as SyncRequest : {};
}

const handler = {
  fetch: withSupabase({ auth: ["secret"] }, async (req, ctx) => {
    if (req.method !== "POST") {
      return Response.json(
        { error: "Method not allowed." },
        { status: 405, headers: { Allow: "POST" } },
      );
    }

    const startedAt = Date.now();
    const attemptedAt = new Date().toISOString();
    let scope: string | null = null;

    try {
      const body = await parseBody(req);
      scope = requestScope(body);
      const url = new URL(ESPN_SCOREBOARD_URL);
      url.searchParams.set("groups", "50");
      url.searchParams.set("limit", "200");
      url.searchParams.set("dates", scope);

      const response = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(25_000),
      });

      if (!response.ok) {
        throw new Error(`ESPN returned HTTP ${response.status}.`);
      }

      const payload: unknown = await response.json();
      const sourceEvents = asArray(asRecord(payload).events);
      const normalized = await Promise.all(
        sourceEvents.map((event) => normalizeEvent(event, attemptedAt)),
      );
      const games = normalized.filter((game) => game !== null);
      const skippedGameCount = sourceEvents.filter((event) => {
        const competition = asRecord(asArray(asRecord(event).competitions)[0]);
        return Boolean(tournamentHeadline(competition));
      }).length - games.length;

      const existingHashes = new Map<string, string>();
      if (games.length > 0) {
        const { data, error } = await ctx.supabaseAdmin
          .from("espn_games")
          .select("espn_event_id, source_hash")
          .in("espn_event_id", games.map((game) => game.espn_event_id));

        if (error) {
          throw new Error(`Could not read existing games: ${error.message}`);
        }

        for (const row of data ?? []) {
          existingHashes.set(row.espn_event_id, row.source_hash);
        }
      }

      const changedGames = games.filter(
        (game) => existingHashes.get(game.espn_event_id) !== game.source_hash,
      );

      if (changedGames.length > 0) {
        const { error } = await ctx.supabaseAdmin
          .from("espn_games")
          .upsert(changedGames, { onConflict: "espn_event_id" });

        if (error) {
          throw new Error(`Could not save ESPN games: ${error.message}`);
        }
      }

      const durationMs = Date.now() - startedAt;
      const { error: stateError } = await ctx.supabaseAdmin
        .from("espn_sync_state")
        .upsert({
          source: SOURCE,
          last_attempt_at: attemptedAt,
          last_success_at: new Date().toISOString(),
          last_error: null,
          last_request_scope: scope,
          source_event_count: sourceEvents.length,
          tournament_event_count: games.length,
          changed_game_count: changedGames.length,
          skipped_game_count: Math.max(0, skippedGameCount),
          duration_ms: durationMs,
        }, { onConflict: "source" });

      if (stateError) {
        throw new Error(`Could not save sync state: ${stateError.message}`);
      }

      return Response.json({
        scope,
        sourceEvents: sourceEvents.length,
        tournamentEvents: games.length,
        changedGames: changedGames.length,
        unchangedGames: games.length - changedGames.length,
        skippedGames: Math.max(0, skippedGameCount),
        durationMs,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown synchronization error.";

      await ctx.supabaseAdmin.from("espn_sync_state").upsert({
        source: SOURCE,
        last_attempt_at: attemptedAt,
        last_error: message,
        last_request_scope: scope,
        duration_ms: Date.now() - startedAt,
      }, { onConflict: "source" });

      return Response.json({ error: message }, { status: 500 });
    }
  }),
};

export default handler;
