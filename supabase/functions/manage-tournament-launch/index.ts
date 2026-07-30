import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.110.2";
import {
  CommunicationConfig,
  FieldSummary,
  renderCommissionerReadyEmail,
  renderFamilyLaunchEmail,
  renderFieldChangedEmail,
  sendBrevoEmail,
} from "./email.ts";

const SOURCE = "mens-college-basketball";
const MAX_SEND_ATTEMPTS = 3;
const REGIONS = ["east", "south", "west", "midwest"] as const;
const SEED_PAIRS = [
  [1, 16],
  [8, 9],
  [5, 12],
  [4, 13],
  [6, 11],
  [3, 14],
  [7, 10],
  [2, 15],
] as const;

type RequestBody = {
  mode?: "check" | "status" | "preview" | "send";
  approvedBy?: string;
};

type FirstRoundGame = {
  espn_event_id: string;
  starts_at: string;
  region: string | null;
  status_state: string | null;
  completed: boolean;
  home_team_id: string;
  home_team_name: string;
  home_team_seed: number | null;
  away_team_id: string;
  away_team_name: string;
  away_team_seed: number | null;
};

type PairingRow = {
  left_top_region: string;
  left_bottom_region: string;
  right_top_region: string;
  right_bottom_region: string;
  pairing_source: string | null;
  source_payload_hash: string | null;
  source_synced_at: string | null;
};

type LaunchRow = {
  season_year: number;
  field_signature: string;
  field_ready_at: string;
  commissioner_notification_idempotency_key: string;
  commissioner_notified_at: string | null;
  commissioner_message_id: string | null;
  approved_by: string | null;
  approved_at: string | null;
  launch_started_at: string | null;
  launch_completed_at: string | null;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  field_changed_after_launch_at: string | null;
  field_change_idempotency_key: string;
  field_change_message_id: string | null;
  last_error: string | null;
};

type Recipient = {
  userId: string;
  username: string;
  email: string;
};

type FieldEvaluation = {
  ready: boolean;
  issues: string[];
  seasonYear: number;
  entryDeadline: Date | null;
  signature: string | null;
  summary: FieldSummary | null;
};

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRequestBody(value: unknown): RequestBody {
  return isRecord(value) ? value as RequestBody : {};
}

function truncate(value: string, length = 2_000): string {
  return value.length > length ? `${value.slice(0, length)}...` : value;
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

async function sha256(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function pairingLabels(pairing: PairingRow): string[] {
  return [
    `${titleCase(pairing.left_top_region)} vs. ${
      titleCase(pairing.left_bottom_region)
    }`,
    `${titleCase(pairing.right_top_region)} vs. ${
      titleCase(pairing.right_bottom_region)
    }`,
  ];
}

function previewSummary(evaluation: FieldEvaluation): FieldSummary {
  if (evaluation.summary) return evaluation.summary;

  return {
    seasonYear: evaluation.seasonYear,
    gameCount: 32,
    entryDeadline: evaluation.entryDeadline ??
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000),
    regions: REGIONS.map((region) => ({ region, games: 8 })),
    finalFourPairings: ["East vs. South", "West vs. Midwest"],
  };
}

async function loadCommunicationConfig(
  admin: SupabaseClient,
): Promise<CommunicationConfig> {
  const { data, error } = await admin
    .from("tournament_communications_config")
    .select(
      "commissioner_email, commissioner_name, commissioner_phone, venmo_handle, app_url",
    )
    .eq("source", SOURCE)
    .maybeSingle();
  if (error || !data) {
    throw new Error(
      `Tournament communication settings are unavailable: ${
        error?.message ?? "missing configuration"
      }`,
    );
  }
  return data as CommunicationConfig;
}

async function evaluateField(
  admin: SupabaseClient,
): Promise<FieldEvaluation> {
  const { data: config, error: configError } = await admin
    .from("espn_sync_config")
    .select("season_year, lifecycle_override, entry_deadline_override")
    .eq("source", SOURCE)
    .single();
  if (configError || !config) {
    throw new Error(
      `Tournament configuration is unavailable: ${
        configError?.message ?? "missing row"
      }`,
    );
  }
  const seasonYear = Number(config.season_year);
  const [gamesResult, pairingResult, unclassifiedResult] = await Promise.all([
    admin
      .from("espn_games")
      .select(
        "espn_event_id, starts_at, region, status_state, completed, home_team_id, home_team_name, home_team_seed, away_team_id, away_team_name, away_team_seed",
      )
      .eq("season_year", seasonYear)
      .eq("round_code", "ROUND_OF_64")
      .order("espn_event_id"),
    admin
      .from("tournament_region_pairings")
      .select(
        "left_top_region, left_bottom_region, right_top_region, right_bottom_region, pairing_source, source_payload_hash, source_synced_at",
      )
      .eq("season_year", seasonYear)
      .maybeSingle(),
    admin
      .from("espn_games")
      .select("espn_event_id", { count: "exact", head: true })
      .eq("season_year", seasonYear)
      .eq("round_code", "UNCLASSIFIED"),
  ]);
  if (gamesResult.error || pairingResult.error || unclassifiedResult.error) {
    throw new Error(
      `Tournament field validation could not read its source data: ${
        gamesResult.error?.message ??
        pairingResult.error?.message ??
        unclassifiedResult.error?.message
      }`,
    );
  }

  const games = (gamesResult.data ?? []) as FirstRoundGame[];
  const pairing = pairingResult.data as PairingRow | null;
  const issues: string[] = [];
  if (games.length !== 32) {
    issues.push(`Expected 32 first-round games; found ${games.length}.`);
  }
  if ((unclassifiedResult.count ?? 0) > 0) {
    issues.push(
      `${unclassifiedResult.count} tournament game(s) still have an unclassified round.`,
    );
  }
  if (games.some((game) => game.completed || game.status_state !== "pre")) {
    issues.push("At least one first-round game has already started.");
  }
  if (
    games.some((game) =>
      !game.starts_at ||
      !game.home_team_id ||
      !game.home_team_name?.trim() ||
      game.home_team_seed === null ||
      !game.away_team_id ||
      !game.away_team_name?.trim() ||
      game.away_team_seed === null
    )
  ) {
    issues.push("At least one first-round team, seed, or start time is missing.");
  }

  const regions = REGIONS.map((region) => ({
    region,
    games: games.filter((game) => game.region === region).length,
  }));
  for (const region of regions) {
    if (region.games !== 8) {
      issues.push(
        `${titleCase(region.region)} should have 8 first-round games; found ${region.games}.`,
      );
    }
    const regionGames = games.filter((game) => game.region === region.region);
    for (const [highSeed, lowSeed] of SEED_PAIRS) {
      const exists = regionGames.some((game) => {
        const seeds = new Set([game.home_team_seed, game.away_team_seed]);
        return seeds.has(highSeed) && seeds.has(lowSeed);
      });
      if (!exists) {
        issues.push(
          `${titleCase(region.region)} is missing its ${highSeed} vs. ${lowSeed} matchup.`,
        );
      }
    }
  }

  const configuredRegions = pairing
    ? [
      pairing.left_top_region,
      pairing.left_bottom_region,
      pairing.right_top_region,
      pairing.right_bottom_region,
    ]
    : [];
  if (
    !pairing ||
    pairing.pairing_source !== "ncaa_official_bracket" ||
    !pairing.source_payload_hash ||
    !pairing.source_synced_at ||
    configuredRegions.length !== 4 ||
    configuredRegions.some((region) => !REGIONS.includes(
      region as typeof REGIONS[number],
    )) ||
    new Set(configuredRegions).size !== 4
  ) {
    issues.push("Official NCAA Final Four region pairings are not ready.");
  }

  const naturalDeadline = games.length
    ? new Date(
      Math.min(...games.map((game) => new Date(game.starts_at).getTime())),
    )
    : null;
  const overrideDeadline = config.entry_deadline_override
    ? new Date(config.entry_deadline_override)
    : null;
  const entryDeadline = config.lifecycle_override === "picks_open" &&
      overrideDeadline
    ? overrideDeadline
    : naturalDeadline;
  if (!entryDeadline || !Number.isFinite(entryDeadline.getTime())) {
    issues.push("The bracket entry deadline is unavailable.");
  } else if (entryDeadline <= new Date()) {
    issues.push("The bracket entry deadline is not in the future.");
  }

  if (issues.length || !pairing || !entryDeadline) {
    return {
      ready: false,
      issues,
      seasonYear,
      entryDeadline,
      signature: null,
      summary: null,
    };
  }

  const signature = await sha256({
    seasonYear,
    games: games.map((game) => ({
      id: game.espn_event_id,
      startsAt: game.starts_at,
      region: game.region,
      home: [
        game.home_team_id,
        game.home_team_name,
        game.home_team_seed,
      ],
      away: [
        game.away_team_id,
        game.away_team_name,
        game.away_team_seed,
      ],
    })),
    pairingHash: pairing.source_payload_hash,
    configuredRegions,
    entryDeadline: entryDeadline.toISOString(),
  });
  return {
    ready: true,
    issues: [],
    seasonYear,
    entryDeadline,
    signature,
    summary: {
      seasonYear,
      gameCount: games.length,
      entryDeadline,
      regions,
      finalFourPairings: pairingLabels(pairing),
    },
  };
}

async function loadLaunch(
  admin: SupabaseClient,
  seasonYear: number,
): Promise<LaunchRow | null> {
  const { data, error } = await admin
    .from("tournament_launches")
    .select("*")
    .eq("season_year", seasonYear)
    .maybeSingle();
  if (error) throw new Error(`Launch status is unavailable: ${error.message}`);
  return data as LaunchRow | null;
}

async function loadRecipients(
  admin: SupabaseClient,
): Promise<Recipient[]> {
  const { data: profileData, error: profileError } = await admin
    .from("profiles")
    .select("user_id, username");
  if (profileError) {
    throw new Error(`Account usernames are unavailable: ${profileError.message}`);
  }
  const profiles = new Map(
    (profileData ?? []).map((profile) => [profile.user_id, profile.username]),
  );
  const recipients: Recipient[] = [];
  let page = 1;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 1_000,
    });
    if (error) throw new Error(`Account emails are unavailable: ${error.message}`);
    for (const user of data.users) {
      const username = profiles.get(user.id);
      if (username && user.email) {
        recipients.push({ userId: user.id, username, email: user.email });
      }
    }
    if (data.users.length < 1_000) break;
    page += 1;
  }
  return recipients.sort((left, right) =>
    left.username.localeCompare(right.username)
  );
}

function publicStatus(input: {
  evaluation: FieldEvaluation;
  launch: LaunchRow | null;
  recipientCount: number;
  familyPreview: ReturnType<typeof renderFamilyLaunchEmail> | null;
}) {
  const { evaluation, launch } = input;
  return {
    ready: evaluation.ready,
    issues: evaluation.issues,
    seasonYear: evaluation.seasonYear,
    entryDeadline: evaluation.entryDeadline?.toISOString() ?? null,
    fieldReadyAt: launch?.field_ready_at ?? null,
    commissionerNotifiedAt: launch?.commissioner_notified_at ?? null,
    approvedAt: launch?.approved_at ?? null,
    launchStartedAt: launch?.launch_started_at ?? null,
    launchCompletedAt: launch?.launch_completed_at ?? null,
    recipientCount: input.recipientCount,
    sentCount: launch?.sent_count ?? 0,
    failedCount: launch?.failed_count ?? 0,
    lastError: launch?.last_error ?? null,
    fieldChangedAfterLaunchAt: launch?.field_changed_after_launch_at ?? null,
    summary: evaluation.summary
      ? {
        gameCount: evaluation.summary.gameCount,
        regions: evaluation.summary.regions,
        finalFourPairings: evaluation.summary.finalFourPairings,
      }
      : null,
    familyPreview: input.familyPreview,
  };
}

const handler = {
  fetch: withSupabase({ auth: ["secret"] }, async (req, ctx) => {
    if (req.method !== "POST") {
      return Response.json(
        { error: "Method not allowed." },
        { status: 405, headers: { Allow: "POST" } },
      );
    }
    try {
      const body = req.body ? asRequestBody(await req.json()) : {};
      const mode = body.mode ?? "status";
      const config = await loadCommunicationConfig(ctx.supabaseAdmin);

      if (mode === "preview") {
        const sampleSummary: FieldSummary = {
          seasonYear: 2026,
          gameCount: 32,
          entryDeadline: new Date("2026-03-19T16:15:00.000Z"),
          regions: REGIONS.map((region) => ({ region, games: 8 })),
          finalFourPairings: ["East vs. South", "West vs. Midwest"],
        };
        return Response.json({
          commissioner: renderCommissionerReadyEmail(config, sampleSummary),
          family: renderFamilyLaunchEmail(config, sampleSummary),
        });
      }

      const evaluation = await evaluateField(ctx.supabaseAdmin);
      let launch = await loadLaunch(
        ctx.supabaseAdmin,
        evaluation.seasonYear,
      );

      if (mode === "check") {
        if (!evaluation.ready || !evaluation.signature || !evaluation.summary) {
          return Response.json(publicStatus({
            evaluation,
            launch,
            recipientCount: 0,
            familyPreview: null,
          }));
        }

        if (
          launch?.launch_completed_at &&
          launch.field_signature !== evaluation.signature
        ) {
          if (!launch.field_changed_after_launch_at) {
            const content = renderFieldChangedEmail(config, evaluation.summary);
            const messageId = await sendBrevoEmail({
              config,
              toEmail: config.commissioner_email,
              toName: config.commissioner_name,
              content,
              idempotencyKey: launch.field_change_idempotency_key,
              tags: ["field-change-alert"],
            });
            const changedAt = new Date().toISOString();
            const { error } = await ctx.supabaseAdmin
              .from("tournament_launches")
              .update({
                field_changed_after_launch_at: changedAt,
                field_change_message_id: messageId,
                last_error:
                  "The tournament field changed after the family announcement.",
                updated_at: changedAt,
              })
              .eq("season_year", evaluation.seasonYear);
            if (error) throw error;
            launch = await loadLaunch(
              ctx.supabaseAdmin,
              evaluation.seasonYear,
            );
          }
          return Response.json({
            ...publicStatus({
              evaluation: {
                ...evaluation,
                ready: false,
                issues: [
                  "The field changed after the family announcement. Manual review is required.",
                ],
              },
              launch,
              recipientCount: 0,
              familyPreview: null,
            }),
            status: "field_changed_after_launch",
          }, { status: 409 });
        }

        if (!launch || launch.field_signature !== evaluation.signature) {
          const now = new Date().toISOString();
          const { data, error } = await ctx.supabaseAdmin
            .from("tournament_launches")
            .upsert({
              season_year: evaluation.seasonYear,
              field_signature: evaluation.signature,
              field_ready_at: now,
              commissioner_notification_idempotency_key: crypto.randomUUID(),
              commissioner_notified_at: null,
              commissioner_message_id: null,
              approved_by: null,
              approved_at: null,
              launch_started_at: null,
              launch_completed_at: null,
              recipient_count: 0,
              sent_count: 0,
              failed_count: 0,
              field_changed_after_launch_at: null,
              field_change_idempotency_key: crypto.randomUUID(),
              field_change_message_id: null,
              last_error: null,
              updated_at: now,
            }, { onConflict: "season_year" })
            .select("*")
            .single();
          if (error || !data) {
            throw new Error(
              `Launch review could not be initialized: ${
                error?.message ?? "missing row"
              }`,
            );
          }
          launch = data as LaunchRow;
        }

        if (!launch.commissioner_notified_at) {
          const content = renderCommissionerReadyEmail(
            config,
            evaluation.summary,
          );
          const messageId = await sendBrevoEmail({
            config,
            toEmail: config.commissioner_email,
            toName: config.commissioner_name,
            content,
            idempotencyKey:
              launch.commissioner_notification_idempotency_key,
            tags: ["field-ready-review"],
          });
          const notifiedAt = new Date().toISOString();
          const { error } = await ctx.supabaseAdmin
            .from("tournament_launches")
            .update({
              commissioner_notified_at: notifiedAt,
              commissioner_message_id: messageId,
              last_error: null,
              updated_at: notifiedAt,
            })
            .eq("season_year", evaluation.seasonYear);
          if (error) throw error;
          launch = await loadLaunch(ctx.supabaseAdmin, evaluation.seasonYear);
        }
        return Response.json({
          status: "awaiting_commissioner",
          ...publicStatus({
            evaluation,
            launch,
            recipientCount: 0,
            familyPreview: null,
          }),
        });
      }

      const recipients = await loadRecipients(ctx.supabaseAdmin);
      const preview = renderFamilyLaunchEmail(
        config,
        previewSummary(evaluation),
      );

      if (mode === "status") {
        return Response.json(publicStatus({
          evaluation,
          launch,
          recipientCount: recipients.length,
          familyPreview: preview,
        }));
      }

      if (mode !== "send") {
        return Response.json({ error: "Invalid mode." }, { status: 400 });
      }
      if (
        !evaluation.ready ||
        !evaluation.signature ||
        !evaluation.summary ||
        !preview
      ) {
        return Response.json({
          error: "The tournament field is not ready for a family announcement.",
          issues: evaluation.issues,
        }, { status: 409 });
      }
      if (!launch || launch.field_signature !== evaluation.signature) {
        return Response.json({
          error:
            "The finalized field must be checked and emailed to the commissioner before approval.",
        }, { status: 409 });
      }
      if (!launch.commissioner_notified_at) {
        return Response.json({
          error: "The commissioner review email has not been delivered yet.",
        }, { status: 409 });
      }
      if (
        typeof body.approvedBy !== "string" ||
        !/^[0-9a-f-]{36}$/i.test(body.approvedBy)
      ) {
        return Response.json({ error: "Commissioner approval is required." }, {
          status: 400,
        });
      }

      const startedAt = launch.launch_started_at ?? new Date().toISOString();
      const approvedAt = launch.approved_at ?? new Date().toISOString();
      const { error: approvalError } = await ctx.supabaseAdmin
        .from("tournament_launches")
        .update({
          approved_by: body.approvedBy,
          approved_at: approvedAt,
          launch_started_at: startedAt,
          recipient_count: recipients.length,
          launch_completed_at: null,
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("season_year", evaluation.seasonYear);
      if (approvalError) throw approvalError;

      const failures: { userId: string; error: string }[] = [];
      let sentThisRun = 0;
      let skipped = 0;
      for (let offset = 0; offset < recipients.length; offset += 5) {
        const batch = recipients.slice(offset, offset + 5);
        await Promise.all(batch.map(async (recipient) => {
          const { data: existing, error: readError } = await ctx.supabaseAdmin
            .from("tournament_launch_deliveries")
            .select("idempotency_key, attempt_count, sent_at")
            .eq("season_year", evaluation.seasonYear)
            .eq("user_id", recipient.userId)
            .maybeSingle();
          if (readError) {
            failures.push({ userId: recipient.userId, error: readError.message });
            return;
          }
          if (existing?.sent_at) {
            skipped += 1;
            return;
          }
          if ((existing?.attempt_count ?? 0) >= MAX_SEND_ATTEMPTS) {
            failures.push({
              userId: recipient.userId,
              error: "Maximum delivery attempts reached.",
            });
            return;
          }

          const attemptedAt = new Date().toISOString();
          const attemptCount = (existing?.attempt_count ?? 0) + 1;
          const { data: delivery, error: writeError } = await ctx.supabaseAdmin
            .from("tournament_launch_deliveries")
            .upsert({
              season_year: evaluation.seasonYear,
              user_id: recipient.userId,
              recipient_email: recipient.email,
              attempt_count: attemptCount,
              attempted_at: attemptedAt,
              error_message: null,
              updated_at: attemptedAt,
            }, { onConflict: "season_year,user_id" })
            .select("idempotency_key")
            .single();
          if (writeError || !delivery) {
            failures.push({
              userId: recipient.userId,
              error: writeError?.message ?? "Unable to reserve delivery.",
            });
            return;
          }

          try {
            const messageId = await sendBrevoEmail({
              config,
              toEmail: recipient.email,
              toName: recipient.username,
              content: preview,
              idempotencyKey: delivery.idempotency_key,
              tags: ["tournament-launch", String(evaluation.seasonYear)],
            });
            const sentAt = new Date().toISOString();
            const { error } = await ctx.supabaseAdmin
              .from("tournament_launch_deliveries")
              .update({
                sent_at: sentAt,
                brevo_message_id: messageId,
                error_message: null,
                updated_at: sentAt,
              })
              .eq("season_year", evaluation.seasonYear)
              .eq("user_id", recipient.userId);
            if (error) throw error;
            sentThisRun += 1;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            await ctx.supabaseAdmin
              .from("tournament_launch_deliveries")
              .update({
                error_message: truncate(message),
                updated_at: new Date().toISOString(),
              })
              .eq("season_year", evaluation.seasonYear)
              .eq("user_id", recipient.userId);
            failures.push({ userId: recipient.userId, error: message });
          }
        }));
      }

      const { data: deliveries, error: deliveryCountError } = await ctx
        .supabaseAdmin
        .from("tournament_launch_deliveries")
        .select("sent_at")
        .eq("season_year", evaluation.seasonYear);
      if (deliveryCountError) throw deliveryCountError;
      const sentCount = (deliveries ?? []).filter((row) => row.sent_at).length;
      const failedCount = recipients.length - sentCount;
      const completedAt = failedCount === 0 ? new Date().toISOString() : null;
      const { error: finishError } = await ctx.supabaseAdmin
        .from("tournament_launches")
        .update({
          recipient_count: recipients.length,
          sent_count: sentCount,
          failed_count: failedCount,
          launch_completed_at: completedAt,
          last_error: failures.length
            ? `${failures.length} family announcement delivery attempt(s) failed.`
            : null,
          updated_at: new Date().toISOString(),
        })
        .eq("season_year", evaluation.seasonYear);
      if (finishError) throw finishError;
      launch = await loadLaunch(ctx.supabaseAdmin, evaluation.seasonYear);

      return Response.json({
        status: failedCount === 0 ? "complete" : "completed_with_errors",
        sentThisRun,
        skipped,
        ...publicStatus({
          evaluation,
          launch,
          recipientCount: recipients.length,
          familyPreview: preview,
        }),
        failures,
      }, { status: failures.length ? 207 : 200 });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[manage-tournament-launch]", { message });
      return Response.json({ error: message }, { status: 500 });
    }
  }),
};

Deno.serve(handler.fetch);
