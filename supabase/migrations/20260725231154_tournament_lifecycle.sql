create or replace function public.get_tournament_lifecycle()
returns table (
  season_year smallint,
  configured_season_year smallint,
  phase text,
  field_ready boolean,
  entry_deadline timestamptz,
  championship_tipoff timestamptz,
  championship_complete boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with season_fields as (
    select
      games.season_year,
      count(*) filter (
        where games.round_code = 'ROUND_OF_64'
      ) >= 32 as field_ready,
      min(games.starts_at) filter (
        where games.round_code = 'ROUND_OF_64'
      ) as entry_deadline,
      max(games.starts_at) filter (
        where games.round_code = 'CHAMPIONSHIP'
      ) as championship_tipoff,
      coalesce(
        bool_or(games.completed) filter (
          where games.round_code = 'CHAMPIONSHIP'
        ),
        false
      ) as championship_complete
    from public.espn_games as games
    group by games.season_year
  ),
  latest_ready_field as (
    select fields.*
    from season_fields as fields
    where fields.field_ready
    order by fields.season_year desc
    limit 1
  ),
  configured_season as (
    select config.season_year
    from public.espn_sync_config as config
    where config.source = 'mens-college-basketball'
    limit 1
  ),
  selected_season as (
    select
      coalesce(
        ready.season_year,
        configured.season_year
      )::smallint as season_year,
      configured.season_year::smallint as configured_season_year,
      coalesce(ready.field_ready, false) as field_ready,
      ready.entry_deadline,
      ready.championship_tipoff,
      coalesce(ready.championship_complete, false) as championship_complete
    from configured_season as configured
    left join latest_ready_field as ready on true
  )
  select
    selected.season_year,
    selected.configured_season_year,
    case
      when not selected.field_ready then 'setup'
      when selected.championship_complete then 'final'
      when selected.entry_deadline <= now() then 'live'
      else 'picks_open'
    end as phase,
    selected.field_ready,
    selected.entry_deadline,
    selected.championship_tipoff,
    selected.championship_complete
  from selected_season as selected
  where (select auth.uid()) is not null;
$$;

revoke all on function public.get_tournament_lifecycle() from public;
revoke all on function public.get_tournament_lifecycle() from anon;
grant execute on function public.get_tournament_lifecycle() to authenticated;
grant execute on function public.get_tournament_lifecycle() to service_role;

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
      sync_job_id bigint;
      cleanup_job_id bigint;
    begin
      select coalesce(
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
      )
      into should_run
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
      into cleanup_job_id
      from cron.job
      where jobname = 'cleanup-espn-sync-cron-history';

      if cleanup_job_id is not null then
        perform cron.alter_job(job_id := cleanup_job_id, active := should_run);
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
