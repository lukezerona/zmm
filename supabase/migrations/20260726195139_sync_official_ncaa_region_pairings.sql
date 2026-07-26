alter table public.tournament_region_pairings
add column if not exists ncaa_season_year smallint,
add column if not exists pairing_source text not null default 'manual',
add column if not exists source_payload_hash text,
add column if not exists source_synced_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tournament_region_pairings_ncaa_season_year'
      and conrelid = 'public.tournament_region_pairings'::regclass
  ) then
    alter table public.tournament_region_pairings
    add constraint tournament_region_pairings_ncaa_season_year
    check (
      ncaa_season_year is null
      or ncaa_season_year between 1999 and 2099
    );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'tournament_region_pairings_source_not_blank'
      and conrelid = 'public.tournament_region_pairings'::regclass
  ) then
    alter table public.tournament_region_pairings
    add constraint tournament_region_pairings_source_not_blank
    check (btrim(pairing_source) <> '');
  end if;
end
$$;

do $$
declare
  pairing_job_id bigint;
  pairing_command text := $command$
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
      body := '{"mode":"pairings"}'::jsonb,
      timeout_milliseconds := 30000
    )
    from public.espn_sync_config as config
    where config.source = 'mens-college-basketball'
      and (
        config.enabled
        or config.lifecycle_override = 'picks_open'
      )
      and (now() at time zone 'America/New_York')::date
        between config.tournament_start - 10
            and config.tournament_start + 3
  $command$;
begin
  select jobid
  into pairing_job_id
  from cron.job
  where jobname = 'sync-ncaa-region-pairings-hourly';

  if pairing_job_id is null then
    pairing_job_id := cron.schedule(
      'sync-ncaa-region-pairings-hourly',
      '17 * * * *',
      pairing_command
    );
  else
    perform cron.alter_job(
      job_id := pairing_job_id,
      schedule := '17 * * * *',
      command := pairing_command
    );
  end if;

  perform cron.alter_job(
    job_id := pairing_job_id,
    active := false
  );
end
$$;

do $$
declare
  cleanup_job_id bigint;
  cleanup_command text := $command$
    delete from cron.job_run_details
    where end_time < now() - interval '2 days'
      and jobid in (
        select jobid
        from cron.job
        where jobname in (
          'sync-espn-games-every-15-seconds',
          'sync-ncaa-region-pairings-hourly',
          'cleanup-espn-sync-cron-history'
        )
      )
  $command$;
begin
  select jobid
  into cleanup_job_id
  from cron.job
  where jobname = 'cleanup-espn-sync-cron-history';

  if cleanup_job_id is not null then
    perform cron.alter_job(
      job_id := cleanup_job_id,
      command := cleanup_command
    );
  end if;
end
$$;

create or replace function public.finalize_tournament_sync(
  p_source text default 'mens-college-basketball'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  sync_job_id bigint;
  pairing_job_id bigint;
  cleanup_job_id bigint;
begin
  if coalesce((select auth.jwt() ->> 'role'), '') <> 'service_role' then
    raise exception 'Only the service role can finalize tournament synchronization.'
      using errcode = '42501';
  end if;

  update public.espn_sync_config
  set
    enabled = false,
    updated_at = now()
  where source = p_source;

  select jobid
  into sync_job_id
  from cron.job
  where jobname = 'sync-espn-games-every-15-seconds';

  if sync_job_id is not null then
    perform cron.alter_job(job_id := sync_job_id, active := false);
  end if;

  select jobid
  into pairing_job_id
  from cron.job
  where jobname = 'sync-ncaa-region-pairings-hourly';

  if pairing_job_id is not null then
    perform cron.alter_job(job_id := pairing_job_id, active := false);
  end if;

  select jobid
  into cleanup_job_id
  from cron.job
  where jobname = 'cleanup-espn-sync-cron-history';

  if cleanup_job_id is not null then
    perform cron.alter_job(job_id := cleanup_job_id, active := false);
  end if;
end;
$$;

revoke all on function public.finalize_tournament_sync(text) from public;
revoke all on function public.finalize_tournament_sync(text) from anon;
revoke all on function public.finalize_tournament_sync(text) from authenticated;
grant execute on function public.finalize_tournament_sync(text) to service_role;

do $$
declare
  manager_job_id bigint;
  manager_command text := $command$
    do $manager$
    declare
      should_run boolean;
      should_sync_pairings boolean;
      sync_job_id bigint;
      pairing_job_id bigint;
      cleanup_job_id bigint;
    begin
      select
        coalesce(
          bool_or(
            config.enabled
            and (now() at time zone 'America/New_York')::date
              between config.tournament_start and config.tournament_end
            and not exists (
              select 1
              from public.espn_games as games
              where games.season_year = config.season_year
                and games.round_code = 'CHAMPIONSHIP'
                and games.completed
            )
          ),
          false
        ),
        coalesce(
          bool_or(
            (
              config.enabled
              or config.lifecycle_override = 'picks_open'
            )
            and (now() at time zone 'America/New_York')::date
              between config.tournament_start - 10
                  and config.tournament_start + 3
          ),
          false
        )
      into should_run, should_sync_pairings
      from public.espn_sync_config as config
      where config.source = 'mens-college-basketball';

      select jobid
      into sync_job_id
      from cron.job
      where jobname = 'sync-espn-games-every-15-seconds';

      if sync_job_id is not null then
        perform cron.alter_job(job_id := sync_job_id, active := should_run);
      end if;

      select jobid
      into pairing_job_id
      from cron.job
      where jobname = 'sync-ncaa-region-pairings-hourly';

      if pairing_job_id is not null then
        perform cron.alter_job(
          job_id := pairing_job_id,
          active := should_sync_pairings
        );
      end if;

      select jobid
      into cleanup_job_id
      from cron.job
      where jobname = 'cleanup-espn-sync-cron-history';

      if cleanup_job_id is not null then
        perform cron.alter_job(
          job_id := cleanup_job_id,
          active := should_run or should_sync_pairings
        );
      end if;
    end
    $manager$;
  $command$;
begin
  select jobid
  into manager_job_id
  from cron.job
  where jobname = 'manage-espn-sync-season';

  if manager_job_id is null then
    perform cron.schedule(
      'manage-espn-sync-season',
      '5 * * * *',
      manager_command
    );
  else
    perform cron.alter_job(
      job_id := manager_job_id,
      schedule := '5 * * * *',
      command := manager_command,
      active := true
    );
  end if;
end
$$;
