import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

const BREVO_EMAIL_URL = "https://api.brevo.com/v3/smtp/email";
const DEFAULT_APP_URL = "https://zmm-eta.vercel.app";
const DEFAULT_LOGO_URL = `${DEFAULT_APP_URL}/zmm-logo.png`;
const DEFAULT_SENDER = "luke.zerona@11697146.brevosend.com";
const DEFAULT_REPLY_TO = "luke.zerona@gmail.com";
const SOURCE = "mens-college-basketball";
const TIME_ZONE = "America/New_York";
const REQUIRED_PICKS = 63;
const MAX_SEND_ATTEMPTS = 3;

type ReminderStage = "early" | "tomorrow" | "final";
type RequestBody = {
  mode?: "run" | "preview";
  stage?: ReminderStage;
};
type JsonRecord = Record<string, unknown>;
type BracketRow = {
  id: string;
  user_id: string;
  display_name: string;
  picks: JsonRecord | null;
  tiebreaker_total: number | string | null;
};
type IncompleteBracket = {
  id: string;
  name: string;
  completedPicks: number;
  needsTiebreaker: boolean;
};
type ReminderSchedule = {
  stage: ReminderStage;
  scheduledFor: Date;
};
type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};
type EmailContent = {
  subject: string;
  textContent: string;
  htmlContent: string;
};

function env(name: string): string {
  return Deno.env.get(name)?.trim() ?? "";
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function truncate(value: string, length = 2_000): string {
  return value.length > length ? `${value.slice(0, length)}...` : value;
}

function completedPickCount(picks: JsonRecord | null): number {
  if (!picks) return 0;
  return Object.values(picks).filter((pick) =>
    typeof pick === "string" && pick.trim().length > 0
  ).length;
}

function hasValidTiebreaker(value: number | string | null): boolean {
  if (value === null || value === "") return false;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isInteger(number) && number >= 0;
}

function zonedParts(date: Date): ZonedParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
  };
}

function easternWallTimeToUtc(parts: ZonedParts): Date {
  const desiredWallTime = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
  );
  let candidate = new Date(desiredWallTime);

  for (let pass = 0; pass < 3; pass += 1) {
    const actual = zonedParts(candidate);
    const actualWallTime = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
    );
    candidate = new Date(candidate.getTime() + desiredWallTime - actualWallTime);
  }

  return candidate;
}

function addCalendarDays(parts: ZonedParts, days: number): ZonedParts {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: parts.hour,
    minute: parts.minute,
  };
}

function reminderSchedule(deadline: Date): ReminderSchedule[] {
  const deadlineDate = zonedParts(deadline);
  const early = addCalendarDays(deadlineDate, -2);
  const tomorrow = addCalendarDays(deadlineDate, -1);
  const finalMorning = easternWallTimeToUtc({
    ...deadlineDate,
    hour: 9,
    minute: 0,
  });
  const threeHoursBeforeLock = new Date(deadline.getTime() - 3 * 60 * 60 * 1_000);

  return [
    {
      stage: "early",
      scheduledFor: easternWallTimeToUtc({ ...early, hour: 19, minute: 0 }),
    },
    {
      stage: "tomorrow",
      scheduledFor: easternWallTimeToUtc({
        ...tomorrow,
        hour: 19,
        minute: 0,
      }),
    },
    {
      stage: "final",
      scheduledFor: new Date(
        Math.min(finalMorning.getTime(), threeHoursBeforeLock.getTime()),
      ),
    },
  ].sort((left, right) =>
    left.scheduledFor.getTime() - right.scheduledFor.getTime()
  );
}

function dueReminder(
  deadline: Date,
  now: Date,
): ReminderSchedule | null {
  if (now >= deadline) return null;
  return reminderSchedule(deadline)
    .filter((reminder) => reminder.scheduledFor <= now)
    .at(-1) ?? null;
}

function formatDeadline(deadline: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(deadline);
}

function contentForStage(stage: ReminderStage) {
  if (stage === "early") {
    return {
      subject: "Your ZMM brackets still need picks",
      eyebrow: "BRACKET CHECK",
      heading: "You're not finished yet",
      message:
        "A few picks are still waiting. Finish every bracket below before entries lock.",
    };
  }
  if (stage === "tomorrow") {
    return {
      subject: "ZMM brackets lock tomorrow",
      eyebrow: "LOCKS TOMORROW",
      heading: "Your brackets still need attention",
      message:
        "Entries lock tomorrow. Complete every pick and total-points tiebreaker below while there is still time.",
    };
  }
  return {
    subject: "Final reminder: ZMM brackets lock today",
    eyebrow: "FINAL REMINDER",
    heading: "Brackets lock today",
    message:
      "This is the last reminder. Finish every pick and total-points tiebreaker below before the deadline.",
  };
}

function renderReminderEmail(input: {
  stage: ReminderStage;
  username: string;
  deadline: Date;
  brackets: IncompleteBracket[];
}): EmailContent {
  const copy = contentForStage(input.stage);
  const appUrl = env("ZMM_APP_URL") || DEFAULT_APP_URL;
  const bracketUrl = `${appUrl.replace(/\/$/, "")}/bracket`;
  const logoUrl = env("ZMM_LOGO_URL") || DEFAULT_LOGO_URL;
  const deadlineText = formatDeadline(input.deadline);
  const bracketLines = input.brackets.map((bracket) => {
    const missing = REQUIRED_PICKS - bracket.completedPicks;
    const pickText = `${bracket.completedPicks} of ${REQUIRED_PICKS} picks`;
    const tiebreakerText = bracket.needsTiebreaker
      ? "total points missing"
      : "total points complete";
    return `${bracket.name}: ${pickText} (${missing} left), ${tiebreakerText}`;
  });
  const rows = input.brackets.map((bracket) => {
    const pickColor = bracket.completedPicks === REQUIRED_PICKS
      ? "#56e6a5"
      : "#f7fbfd";
    const tiebreaker = bracket.needsTiebreaker
      ? '<span style="color:#ffb45b;">Total points missing</span>'
      : '<span style="color:#56e6a5;">Total points complete</span>';
    return `
      <tr>
        <td style="padding:15px 16px;border-bottom:1px solid #16384d;">
          <div style="font-size:16px;font-weight:700;color:#f7fbfd;">${escapeHtml(bracket.name)}</div>
          <div style="margin-top:5px;font-size:14px;line-height:1.5;color:#91a9b8;">
            <span style="color:${pickColor};">${bracket.completedPicks} of ${REQUIRED_PICKS} picks</span>
            &nbsp;&bull;&nbsp; ${tiebreaker}
          </div>
        </td>
      </tr>`;
  }).join("");

  const textContent = [
    `Hi @${input.username},`,
    "",
    copy.heading,
    copy.message,
    "",
    ...bracketLines,
    "",
    `Entries lock ${deadlineText}.`,
    `Finish your brackets: ${bracketUrl}`,
    "",
    "Zerona March Madness",
  ].join("\n");

  const htmlContent = `<!doctype html>
<html>
  <body style="margin:0;background:#02070b;color:#f7fbfd;font-family:Arial,Helvetica,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(copy.message)} Entries lock ${escapeHtml(deadlineText)}.</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#02070b;padding:30px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#061722;border:1px solid #16445f;border-top:5px solid #16a9eb;border-radius:18px;">
          <tr><td style="padding:34px;">
            <div style="text-align:center;margin-bottom:24px;">
              <img src="${escapeHtml(logoUrl)}" width="190" alt="ZMM — Zerona March Madness" style="display:inline-block;width:190px;max-width:70%;height:auto;border:0;">
            </div>
            <div style="color:#16a9eb;font-size:12px;font-weight:700;letter-spacing:2px;text-align:center;">${copy.eyebrow}</div>
            <h1 style="margin:12px 0 8px;font-size:28px;line-height:1.2;color:#f7fbfd;text-align:center;">${escapeHtml(copy.heading)}</h1>
            <p style="margin:0 0 8px;color:#c8d7df;font-size:16px;line-height:1.6;text-align:center;">Hi @${escapeHtml(input.username)},</p>
            <p style="margin:0 auto 24px;max-width:500px;color:#9ab0be;font-size:16px;line-height:1.6;text-align:center;">${escapeHtml(copy.message)}</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="overflow:hidden;background:#020d14;border:1px solid #1c4d68;border-radius:12px;">
              ${rows}
            </table>
            <div style="margin:22px 0 24px;padding:15px 16px;background:#092334;border:1px solid #1c5b7d;border-radius:10px;color:#d7e7ef;font-size:15px;line-height:1.5;text-align:center;">
              Entries lock <strong style="color:#ffffff;">${escapeHtml(deadlineText)}</strong>
            </div>
            <div style="text-align:center;">
              <a href="${escapeHtml(bracketUrl)}" style="display:inline-block;padding:14px 24px;background:#16a9eb;color:#001018;text-decoration:none;font-size:16px;font-weight:700;border-radius:9px;">Finish your brackets</a>
            </div>
            <p style="margin:26px 0 0;color:#5f7d8e;font-size:12px;line-height:1.6;text-align:center;">This reminder was sent because at least one bracket on your ZMM account is incomplete.</p>
          </td></tr>
        </table>
        <div style="padding:18px 12px;color:#456273;font-size:11px;text-align:center;">Zerona March Madness &bull; Bragging rights start here.</div>
      </td></tr>
    </table>
  </body>
</html>`;

  return { subject: copy.subject, textContent, htmlContent };
}

async function parseBody(req: Request): Promise<RequestBody> {
  if (!req.body) return {};
  const value: unknown = await req.json();
  return isRecord(value) ? value as RequestBody : {};
}

async function sendBrevoEmail(input: {
  email: string;
  username: string;
  content: EmailContent;
  idempotencyKey: string;
  stage: ReminderStage;
}): Promise<string | null> {
  const apiKey = env("BREVO_API_KEY");
  if (!apiKey) {
    throw new Error("BREVO_API_KEY is not configured.");
  }
  const fromEmail = env("ZMM_ALERT_FROM_EMAIL") || DEFAULT_SENDER;
  const replyTo = env("ZMM_REMINDER_REPLY_TO") ||
    env("ZMM_ALERT_EMAIL_TO") ||
    DEFAULT_REPLY_TO;
  const response = await fetch(BREVO_EMAIL_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      sender: { email: fromEmail, name: "Zerona March Madness" },
      to: [{ email: input.email, name: input.username }],
      replyTo: { email: replyTo, name: "Zerona March Madness" },
      subject: input.content.subject,
      textContent: input.content.textContent,
      htmlContent: input.content.htmlContent,
      headers: { "Idempotency-Key": input.idempotencyKey },
      tags: ["zmm", "bracket-reminder", input.stage],
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(
      `Brevo returned HTTP ${response.status}: ${truncate(responseText, 500)}`,
    );
  }
  if (!responseText) return null;
  const responseBody: unknown = JSON.parse(responseText);
  return isRecord(responseBody) && typeof responseBody.messageId === "string"
    ? responseBody.messageId
    : null;
}

const handler = {
  fetch: withSupabase({ auth: ["secret"] }, async (req, ctx) => {
    if (req.method !== "POST") {
      return Response.json(
        { error: "Method not allowed." },
        { status: 405, headers: { Allow: "POST" } },
      );
    }

    const body = await parseBody(req);
    if (body.mode === "preview") {
      const stage = body.stage ?? "early";
      if (!["early", "tomorrow", "final"].includes(stage)) {
        return Response.json({ error: "Invalid reminder stage." }, {
          status: 400,
        });
      }
      const previewDeadline = easternWallTimeToUtc({
        year: 2026,
        month: 3,
        day: 19,
        hour: 12,
        minute: 0,
      });
      const preview = renderReminderEmail({
        stage,
        username: "zeronafamily",
        deadline: previewDeadline,
        brackets: [
          {
            id: "preview-1",
            name: "Luke",
            completedPicks: 54,
            needsTiebreaker: true,
          },
          {
            id: "preview-2",
            name: "Morgan",
            completedPicks: 63,
            needsTiebreaker: true,
          },
        ],
      });
      return Response.json({ stage, ...preview });
    }

    const now = new Date();
    const { data: config, error: configError } = await ctx.supabaseAdmin
      .from("espn_sync_config")
      .select("season_year, lifecycle_override, entry_deadline_override")
      .eq("source", SOURCE)
      .single();
    if (configError || !config) {
      return Response.json(
        { error: `Unable to load tournament configuration: ${configError?.message ?? "missing row"}` },
        { status: 500 },
      );
    }

    const { data: firstRoundGames, error: gamesError } = await ctx.supabaseAdmin
      .from("espn_games")
      .select("starts_at")
      .eq("season_year", config.season_year)
      .eq("round_code", "ROUND_OF_64")
      .not("starts_at", "is", null)
      .order("starts_at", { ascending: true });
    if (gamesError) {
      return Response.json(
        { error: `Unable to load first-round games: ${gamesError.message}` },
        { status: 500 },
      );
    }

    const naturalDeadline = firstRoundGames?.[0]?.starts_at
      ? new Date(firstRoundGames[0].starts_at)
      : null;
    const overrideDeadline = config.entry_deadline_override
      ? new Date(config.entry_deadline_override)
      : null;
    const deadline = config.lifecycle_override === "picks_open"
      ? overrideDeadline
      : naturalDeadline;
    const fieldReady = (firstRoundGames?.length ?? 0) >= 32;
    const picksOpen = Boolean(
      deadline &&
        deadline > now &&
        (
          config.lifecycle_override === "picks_open" ||
          (config.lifecycle_override === null && fieldReady)
        ),
    );
    if (!picksOpen || !deadline) {
      return Response.json({
        status: "skipped",
        reason: "Bracket entry is not currently open.",
        seasonYear: config.season_year,
      });
    }

    const reminder = dueReminder(deadline, now);
    if (!reminder) {
      return Response.json({
        status: "skipped",
        reason: "No reminder is due.",
        seasonYear: config.season_year,
        deadline: deadline.toISOString(),
        schedule: reminderSchedule(deadline).map((item) => ({
          stage: item.stage,
          scheduledFor: item.scheduledFor.toISOString(),
        })),
      });
    }

    const { data: bracketData, error: bracketsError } = await ctx.supabaseAdmin
      .from("brackets")
      .select("id, user_id, display_name, picks, tiebreaker_total")
      .eq("season_year", config.season_year);
    if (bracketsError) {
      return Response.json(
        { error: `Unable to load brackets: ${bracketsError.message}` },
        { status: 500 },
      );
    }

    const grouped = new Map<string, IncompleteBracket[]>();
    for (const bracket of (bracketData ?? []) as BracketRow[]) {
      const completedPicks = completedPickCount(bracket.picks);
      const needsTiebreaker = !hasValidTiebreaker(bracket.tiebreaker_total);
      if (completedPicks >= REQUIRED_PICKS && !needsTiebreaker) continue;
      const existing = grouped.get(bracket.user_id) ?? [];
      existing.push({
        id: bracket.id,
        name: bracket.display_name,
        completedPicks,
        needsTiebreaker,
      });
      grouped.set(bracket.user_id, existing);
    }

    if (grouped.size === 0) {
      return Response.json({
        status: "complete",
        stage: reminder.stage,
        accountsNeedingReminder: 0,
        sent: 0,
        failed: 0,
      });
    }

    const userIds = [...grouped.keys()];
    const { data: profileData, error: profilesError } = await ctx.supabaseAdmin
      .from("profiles")
      .select("user_id, username")
      .in("user_id", userIds);
    if (profilesError) {
      return Response.json(
        { error: `Unable to load account usernames: ${profilesError.message}` },
        { status: 500 },
      );
    }
    const usernames = new Map(
      (profileData ?? []).map((profile) => [profile.user_id, profile.username]),
    );

    const emails = new Map<string, string>();
    let page = 1;
    while (true) {
      const { data, error } = await ctx.supabaseAdmin.auth.admin.listUsers({
        page,
        perPage: 1_000,
      });
      if (error) {
        return Response.json(
          { error: `Unable to load account emails: ${error.message}` },
          { status: 500 },
        );
      }
      for (const user of data.users) {
        if (user.email && grouped.has(user.id)) emails.set(user.id, user.email);
      }
      if (data.users.length < 1_000) break;
      page += 1;
    }

    let sent = 0;
    let skipped = 0;
    const failures: { userId: string; error: string }[] = [];
    for (const [userId, brackets] of grouped) {
      const recipientEmail = emails.get(userId);
      if (!recipientEmail) {
        failures.push({ userId, error: "Account has no email address." });
        continue;
      }

      const { data: existing, error: deliveryReadError } = await ctx
        .supabaseAdmin
        .from("bracket_reminder_deliveries")
        .select("id, sent_at, attempt_count")
        .eq("season_year", config.season_year)
        .eq("user_id", userId)
        .eq("reminder_stage", reminder.stage)
        .maybeSingle();
      if (deliveryReadError) {
        failures.push({ userId, error: deliveryReadError.message });
        continue;
      }
      if (existing?.sent_at || (existing?.attempt_count ?? 0) >= MAX_SEND_ATTEMPTS) {
        skipped += 1;
        continue;
      }

      const username = usernames.get(userId) ?? "family";
      const attemptCount = (existing?.attempt_count ?? 0) + 1;
      const deliveryRecord = {
        season_year: config.season_year,
        user_id: userId,
        reminder_stage: reminder.stage,
        recipient_email: recipientEmail,
        bracket_ids: brackets.map((bracket) => bracket.id),
        bracket_names: brackets.map((bracket) => bracket.name),
        scheduled_for: reminder.scheduledFor.toISOString(),
        attempted_at: now.toISOString(),
        attempt_count: attemptCount,
        error_message: null,
        updated_at: now.toISOString(),
      };
      const { data: delivery, error: deliveryWriteError } = existing
        ? await ctx.supabaseAdmin
          .from("bracket_reminder_deliveries")
          .update(deliveryRecord)
          .eq("id", existing.id)
          .select("id")
          .single()
        : await ctx.supabaseAdmin
          .from("bracket_reminder_deliveries")
          .insert(deliveryRecord)
          .select("id")
          .single();
      if (deliveryWriteError || !delivery) {
        failures.push({
          userId,
          error: deliveryWriteError?.message ?? "Unable to reserve delivery.",
        });
        continue;
      }

      try {
        const content = renderReminderEmail({
          stage: reminder.stage,
          username,
          deadline,
          brackets,
        });
        const messageId = await sendBrevoEmail({
          email: recipientEmail,
          username,
          content,
          idempotencyKey:
            `zmm-bracket-reminder-${config.season_year}-${userId}-${reminder.stage}`,
          stage: reminder.stage,
        });
        const { error: successError } = await ctx.supabaseAdmin
          .from("bracket_reminder_deliveries")
          .update({
            sent_at: new Date().toISOString(),
            brevo_message_id: messageId,
            error_message: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", delivery.id);
        if (successError) throw successError;
        sent += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await ctx.supabaseAdmin
          .from("bracket_reminder_deliveries")
          .update({
            error_message: truncate(message, 2_000),
            updated_at: new Date().toISOString(),
          })
          .eq("id", delivery.id);
        failures.push({ userId, error: message });
      }
    }

    return Response.json({
      status: failures.length ? "completed_with_errors" : "complete",
      seasonYear: config.season_year,
      stage: reminder.stage,
      deadline: deadline.toISOString(),
      accountsNeedingReminder: grouped.size,
      sent,
      skipped,
      failed: failures.length,
      failures,
    }, { status: failures.length ? 207 : 200 });
  }),
};

Deno.serve(handler.fetch);
