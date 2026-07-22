import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

const SOURCE = "mens-college-basketball";
const TOURNAMENT_PREFIX = "NCAA Men's Basketball Championship";
const ESPN_SCOREBOARD_URL =
  "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard";
const BREVO_EMAIL_URL = "https://api.brevo.com/v3/smtp/email";
const DEFAULT_ALERT_EMAIL = "luke.zerona@gmail.com";
const DEFAULT_ALERT_SENDER = "luke.zerona@11697146.brevosend.com";
const ALERT_REMINDER_MS = 6 * 60 * 60 * 1_000;
const MAX_RANGE_DAYS = 45;

type SyncRequest = {
  mode?: "auto" | "date" | "range" | "test-alert";
  date?: string;
  startDate?: string;
  endDate?: string;
};

type SyncStage =
  | "request"
  | "espn-request"
  | "espn-response"
  | "database-read"
  | "database-write"
  | "sync-state"
  | "validation"
  | "test";

type AlertContext = {
  severity: "error" | "warning" | "test";
  stage: SyncStage;
  message: string;
  cause: string;
  action: string;
  attemptedAt: string;
  scope: string | null;
};

type AlertResult = {
  status: "sent" | "suppressed" | "failed";
  detail?: string;
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

function env(name: string): string {
  return Deno.env.get(name)?.trim() ?? "";
}

function truncate(value: string, length = 2_000): string {
  return value.length > length ? `${value.slice(0, length)}...` : value;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function projectDashboardUrl(): string {
  try {
    const projectRef = new URL(env("SUPABASE_URL")).hostname.split(".")[0];
    return `https://supabase.com/dashboard/project/${projectRef}/functions/sync-espn-games/logs`;
  } catch {
    return "https://supabase.com/dashboard";
  }
}

function diagnoseError(stage: SyncStage, message: string) {
  if (/ESPN returned HTTP 429/i.test(message)) {
    return {
      cause: "ESPN temporarily rate-limited the scoreboard request.",
      action: "Wait a few minutes, then run the sync again. If it continues, reduce the polling frequency.",
    };
  }

  if (/ESPN returned HTTP 5\d\d/i.test(message)) {
    return {
      cause: "ESPN's scoreboard service returned a server error.",
      action: "Check the ESPN scoreboard URL and retry after ESPN recovers.",
    };
  }

  if (stage === "espn-request") {
    return {
      cause: "The Edge Function could not complete its request to ESPN. The request may have timed out or ESPN may be unreachable.",
      action: "Open the ESPN scoreboard URL, confirm it responds, and review the Edge Function logs before retrying.",
    };
  }

  if (stage === "espn-response" || stage === "validation") {
    return {
      cause: "ESPN returned tournament data that no longer matches the fields or round names ZMM expects.",
      action: "Inspect the affected ESPN event and update the tournament parser or bracket configuration before opening picks.",
    };
  }

  if (stage === "database-read" || stage === "database-write" || stage === "sync-state") {
    return {
      cause: "Supabase could not read or save the synchronized tournament data.",
      action: "Review the database and Edge Function logs, confirm the latest migrations exist, and retry the sync.",
    };
  }

  if (stage === "request") {
    return {
      cause: "The sync invocation contained an invalid request mode or date range.",
      action: "Correct the request body or Cron configuration and invoke the function again.",
    };
  }

  return {
    cause: "The synchronization failed for an unexpected reason.",
    action: "Review the Edge Function logs and the saved sync state, correct the problem, and run the sync again.",
  };
}

async function sendBrevoAlert(
  context: AlertContext,
  idempotencyKey: string,
): Promise<string> {
  const apiKey = env("BREVO_API_KEY");
  if (!apiKey) {
    throw new Error("BREVO_API_KEY is not configured in Supabase Edge Function secrets.");
  }

  const toEmail = env("ZMM_ALERT_EMAIL_TO") || DEFAULT_ALERT_EMAIL;
  const fromEmail = env("ZMM_ALERT_FROM_EMAIL") || DEFAULT_ALERT_SENDER;
  const fromName = env("ZMM_ALERT_FROM_NAME") || "ZMM Tournament Monitor";
  const severityLabel = context.severity === "error"
    ? "SYNC ERROR"
    : context.severity === "warning"
    ? "DATA WARNING"
    : "TEST ALERT";
  const subject = `[ZMM ${severityLabel}] ${context.message}`;
  const dashboardUrl = projectDashboardUrl();
  const errorText = truncate(context.message);
  const causeText = truncate(context.cause);
  const actionText = truncate(context.action);
  const scopeText = context.scope ?? "Not available";
  const textContent = [
    `ZMM ${severityLabel}`,
    "",
    `Error: ${errorText}`,
    `Likely cause: ${causeText}`,
    `What to do: ${actionText}`,
    `Stage: ${context.stage}`,
    `ESPN request scope: ${scopeText}`,
    `Detected at: ${context.attemptedAt}`,
    "",
    `Review logs: ${dashboardUrl}`,
  ].join("\n");
  const htmlContent = `<!doctype html>
<html>
  <body style="margin:0;background:#02070b;color:#f7fbfd;font-family:Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">ZMM needs manual review: ${escapeHtml(errorText)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#02070b;padding:30px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#061722;border:1px solid #16445f;border-top:5px solid #16a9eb;border-radius:18px;">
          <tr><td style="padding:34px;">
            <div style="color:#16a9eb;font-size:12px;font-weight:700;letter-spacing:2px;">${severityLabel}</div>
            <h1 style="margin:12px 0 8px;font-size:26px;color:#f7fbfd;">ZMM needs your attention</h1>
            <p style="margin:0 0 24px;color:#9ab0be;line-height:1.6;">The tournament sync found a problem that may require a manual correction.</p>
            <div style="margin:0 0 16px;padding:18px;background:#020d14;border:1px solid #1c4d68;border-radius:12px;">
              <div style="margin-bottom:7px;color:#16a9eb;font-size:11px;font-weight:700;letter-spacing:1.4px;">ERROR</div>
              <div style="color:#f7fbfd;font-size:15px;line-height:1.6;word-break:break-word;">${escapeHtml(errorText)}</div>
            </div>
            <div style="margin:0 0 16px;padding:18px;background:#020d14;border:1px solid #1c4d68;border-radius:12px;">
              <div style="margin-bottom:7px;color:#16a9eb;font-size:11px;font-weight:700;letter-spacing:1.4px;">LIKELY CAUSE</div>
              <div style="color:#c8d7df;font-size:15px;line-height:1.6;">${escapeHtml(causeText)}</div>
            </div>
            <div style="margin:0 0 24px;padding:18px;background:#020d14;border:1px solid #1c4d68;border-radius:12px;">
              <div style="margin-bottom:7px;color:#16a9eb;font-size:11px;font-weight:700;letter-spacing:1.4px;">WHAT TO CHECK</div>
              <div style="color:#c8d7df;font-size:15px;line-height:1.6;">${escapeHtml(actionText)}</div>
            </div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;color:#7893a4;font-size:12px;line-height:1.7;">
              <tr><td><strong style="color:#9ab0be;">Stage:</strong> ${escapeHtml(context.stage)}</td></tr>
              <tr><td><strong style="color:#9ab0be;">ESPN scope:</strong> ${escapeHtml(scopeText)}</td></tr>
              <tr><td><strong style="color:#9ab0be;">Detected:</strong> ${escapeHtml(context.attemptedAt)}</td></tr>
            </table>
            <div style="text-align:center;"><a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;padding:13px 22px;background:#16a9eb;color:#001018;text-decoration:none;font-weight:700;border-radius:9px;">Review Supabase logs</a></div>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  const response = await fetch(BREVO_EMAIL_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      sender: { email: fromEmail, name: fromName },
      to: [{ email: toEmail, name: "Luke Zerona" }],
      replyTo: { email: toEmail, name: "Luke Zerona" },
      subject: truncate(subject, 180),
      textContent,
      htmlContent,
      headers: { "Idempotency-Key": idempotencyKey },
      tags: ["zmm", "sync-alert"],
    }),
    signal: AbortSignal.timeout(15_000),
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`Brevo returned HTTP ${response.status}: ${truncate(responseText, 500)}`);
  }

  const responseBody = responseText ? asRecord(JSON.parse(responseText)) : {};
  return asString(responseBody.messageId) ?? "accepted";
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
    let stage: SyncStage = "request";

    async function deliverAlert(
      context: AlertContext,
      force = false,
    ): Promise<AlertResult> {
      const signature = await sha256({
        severity: context.severity,
        stage: context.stage,
        message: context.message,
        cause: context.cause,
      });
      const { data: alertState, error: alertStateError } = await ctx.supabaseAdmin
        .from("espn_sync_state")
        .select("last_alert_at, last_alert_signature")
        .eq("source", SOURCE)
        .maybeSingle();
      const lastAlertAt = alertState?.last_alert_at
        ? new Date(alertState.last_alert_at).getTime()
        : 0;
      const recentlySent = Date.now() - lastAlertAt < ALERT_REMINDER_MS;

      if (
        !force &&
        !alertStateError &&
        alertState?.last_alert_signature === signature &&
        recentlySent
      ) {
        return { status: "suppressed", detail: "The same alert was already sent within six hours." };
      }

      const reminderBucket = Math.floor(Date.now() / ALERT_REMINDER_MS);
      const idempotencyKey = force
        ? `zmm-test-${crypto.randomUUID()}`
        : `zmm-${signature.slice(0, 36)}-${reminderBucket}`;

      try {
        const messageId = await sendBrevoAlert(context, idempotencyKey);
        const { error: saveAlertError } = await ctx.supabaseAdmin
          .from("espn_sync_state")
          .upsert({
            source: SOURCE,
            last_attempt_at: attemptedAt,
            last_alert_at: new Date().toISOString(),
            last_alert_signature: signature,
            last_alert_delivery_error: null,
          }, { onConflict: "source" });

        if (saveAlertError) {
          console.error("[sync-alert] Email sent but alert state could not be saved", saveAlertError.message);
        }

        return { status: "sent", detail: messageId };
      } catch (alertError) {
        const detail = alertError instanceof Error
          ? truncate(alertError.message, 1_000)
          : "Unknown alert delivery error.";
        console.error("[sync-alert] Could not deliver alert email", detail);

        await ctx.supabaseAdmin
          .from("espn_sync_state")
          .upsert({
            source: SOURCE,
            last_attempt_at: attemptedAt,
            last_alert_delivery_error: detail,
          }, { onConflict: "source" });

        return { status: "failed", detail };
      }
    }

    try {
      const body = await parseBody(req);

      if (body.mode === "test-alert") {
        const alert = await deliverAlert({
          severity: "test",
          stage: "test",
          message: "The ZMM tournament monitor email is configured correctly.",
          cause: "This is a requested test. No synchronization error occurred.",
          action: "No action is required. Future sync errors and data warnings will be sent to this address.",
          attemptedAt,
          scope: null,
        }, true);

        return Response.json(
          { alert },
          { status: alert.status === "failed" ? 500 : 200 },
        );
      }

      scope = requestScope(body);
      stage = "espn-request";
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

      stage = "espn-response";
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
      const unclassifiedHeadlines = [...new Set(
        games
          .filter((game) => game.round_code === "UNCLASSIFIED")
          .map((game) => game.tournament_headline),
      )];

      const existingHashes = new Map<string, string>();
      if (games.length > 0) {
        stage = "database-read";
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
        stage = "database-write";
        const { error } = await ctx.supabaseAdmin
          .from("espn_games")
          .upsert(changedGames, { onConflict: "espn_event_id" });

        if (error) {
          throw new Error(`Could not save ESPN games: ${error.message}`);
        }
      }

      const durationMs = Date.now() - startedAt;
      stage = "sync-state";
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

      let alert: AlertResult | null = null;
      if (skippedGameCount > 0 || unclassifiedHeadlines.length > 0) {
        stage = "validation";
        const warningParts = [];
        if (skippedGameCount > 0) {
          warningParts.push(
            `${skippedGameCount} NCAA tournament event(s) were skipped because required game or team fields were missing.`,
          );
        }
        if (unclassifiedHeadlines.length > 0) {
          warningParts.push(
            `Unrecognized round headline(s): ${unclassifiedHeadlines.join(" | ")}`,
          );
        }

        alert = await deliverAlert({
          severity: "warning",
          stage,
          message: warningParts.join(" "),
          cause: "ESPN's tournament format or response fields may have changed, so ZMM kept the known games but could not safely classify everything.",
          action: "Compare ESPN with the official NCAA bracket, then update the parser or tournament configuration before letting the family submit brackets.",
          attemptedAt,
          scope,
        });
      }

      return Response.json({
        scope,
        sourceEvents: sourceEvents.length,
        tournamentEvents: games.length,
        changedGames: changedGames.length,
        unchangedGames: games.length - changedGames.length,
        skippedGames: Math.max(0, skippedGameCount),
        durationMs,
        alert,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown synchronization error.";
      const diagnosis = diagnoseError(stage, message);

      await ctx.supabaseAdmin.from("espn_sync_state").upsert({
        source: SOURCE,
        last_attempt_at: attemptedAt,
        last_error: message,
        last_request_scope: scope,
        duration_ms: Date.now() - startedAt,
      }, { onConflict: "source" });

      const alert = await deliverAlert({
        severity: "error",
        stage,
        message,
        cause: diagnosis.cause,
        action: diagnosis.action,
        attemptedAt,
        scope,
      });

      return Response.json({ error: message, alert }, { status: 500 });
    }
  }),
};

export default handler;
