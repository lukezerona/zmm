# ESPN game synchronization

This Edge Function imports NCAA Men's Basketball Championship games from the
ESPN site scoreboard endpoint. It is backend-only and does not change the ZMM
website UI.

## Request modes

- `{ "mode": "auto" }` imports the current Eastern Time date.
- `{ "mode": "date", "date": "20260319" }` imports one date.
- `{ "mode": "range", "startDate": "20260317", "endDate": "20260407" }`
  performs a backfill of up to 45 days.

The function requires a Supabase secret API key in the `apikey` request header.
It filters ESPN events to headlines beginning with
`NCAA Men's Basketball Championship`, normalizes known tournament round names,
and writes only new or changed game rows.

The importer does not assume a fixed tournament size. Known historical round
names are normalized, every opening/play-in format uses `round_code = PLAY_IN`
and `is_play_in = true`, and an unfamiliar future round is retained as
`UNCLASSIFIED` with its original ESPN headline. Seeds are not capped at 16.
This lets format changes arrive in the database without silently dropping games.

## Administrator email alerts

The function sends a ZMM-branded Brevo email to `luke.zerona@gmail.com` when:

- ESPN or Supabase causes the synchronization to fail;
- an NCAA tournament event is skipped because required fields are missing; or
- ESPN publishes a tournament round name that ZMM does not recognize.

The email includes the exact error, the stage where it happened, the likely
cause, the ESPN date scope, recommended manual checks, and a link to the Edge
Function logs. Identical alerts are limited to one every six hours. The database
stores the last alert signature and Brevo also receives an idempotency key, so a
15-second Cron failure cannot create a flood of duplicate messages.

Before deploying, create a **Brevo API key** (this is different from the SMTP
password used by Supabase Auth), then add it under **Supabase Dashboard → Edge
Functions → Secrets**:

- `BREVO_API_KEY` — required Brevo API key.
- `ZMM_ALERT_EMAIL_TO` — optional recipient override; defaults to
  `luke.zerona@gmail.com`.
- `ZMM_ALERT_FROM_EMAIL` — optional verified Brevo sender override; defaults to
  `luke.zerona@11697146.brevosend.com`.
- `ZMM_ALERT_FROM_NAME` — optional sender-name override; defaults to
  `ZMM Tournament Monitor`.

Secrets stay inside the Edge Function and must never use a `NEXT_PUBLIC_`
prefix. After the secrets are saved, invoke the protected function with
`{ "mode": "test-alert" }` to send one test message without creating a fake
sync error.

## Seasonal activation

Before a tournament, update `public.espn_sync_config` with the new season year
and date range, then set `enabled = true`. The lightweight
`manage-espn-sync-season` job checks the configuration hourly and automatically
activates the 15-second ESPN poller and Cron-history cleanup during the
configured window.

When ESPN marks the championship final, the Edge Function calls
`finalize_tournament_sync`. That disables the configuration and deactivates
both tournament jobs. The hourly manager remains active so a future configured
season can start without manually editing `cron.job`.
