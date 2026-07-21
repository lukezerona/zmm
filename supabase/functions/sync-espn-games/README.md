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
names are normalized, opening/play-in games are marked with `is_play_in`, and
an unfamiliar future round is retained as `UNCLASSIFIED` with its original ESPN
headline. Seeds are not capped at 16. This lets format changes arrive in the
database without silently dropping games.

## Seasonal activation

The polling job is installed inactive. Before a tournament:

1. Update `public.espn_sync_config` with the new season year and date range.
2. Set `enabled = true`.
3. Activate `sync-espn-games-every-15-seconds` and
   `cleanup-espn-sync-cron-history` with `cron.alter_job`.

After the championship, set `enabled = false` and deactivate both jobs. This
prevents unnecessary Edge Function invocations and keeps Cron history small.
