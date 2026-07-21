-- Prerequisites:
--   1. Deploy the sync-espn-games Edge Function.
--   2. Store the project URL in Vault as espn_sync_project_url.
--   3. Store a Supabase secret API key in Vault as espn_sync_secret_key.
--
-- This installs the jobs in an inactive state. Enable the polling job only
-- during the configured tournament window.

do $$
begin
  if not exists (
    select 1 from vault.decrypted_secrets where name = 'espn_sync_project_url'
  ) then
    raise exception 'Missing Vault secret: espn_sync_project_url';
  end if;

  if not exists (
    select 1 from vault.decrypted_secrets where name = 'espn_sync_secret_key'
  ) then
    raise exception 'Missing Vault secret: espn_sync_secret_key';
  end if;
end
$$;

select cron.schedule(
  'sync-espn-games-every-15-seconds',
  '15 seconds',
  $$
  select net.http_post(
    url := (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'espn_sync_project_url'
    ) || '/functions/v1/sync-espn-games',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'espn_sync_secret_key'
      )
    ),
    body := '{"mode":"auto"}'::jsonb,
    timeout_milliseconds := 30000
  )
  from public.espn_sync_config
  where source = 'mens-college-basketball'
    and enabled
    and (now() at time zone 'America/New_York')::date
      between tournament_start and tournament_end
  $$
);

select cron.alter_job(
  job_id := (
    select jobid
    from cron.job
    where jobname = 'sync-espn-games-every-15-seconds'
  ),
  active := false
);

select cron.schedule(
  'cleanup-espn-sync-cron-history',
  '15 5 * * *',
  $$
  delete from cron.job_run_details
  where end_time < now() - interval '2 days'
    and jobid in (
      select jobid
      from cron.job
      where jobname in (
        'sync-espn-games-every-15-seconds',
        'cleanup-espn-sync-cron-history'
      )
    )
  $$
);

select cron.alter_job(
  job_id := (
    select jobid
    from cron.job
    where jobname = 'cleanup-espn-sync-cron-history'
  ),
  active := false
);
