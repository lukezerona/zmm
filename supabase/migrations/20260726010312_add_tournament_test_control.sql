create schema if not exists private;

revoke all on schema private from public, anon, authenticated;

alter table public.espn_sync_config
add column if not exists lifecycle_override text,
add column if not exists entry_deadline_override timestamptz;

alter table public.espn_sync_config
drop constraint if exists espn_sync_config_lifecycle_override;

alter table public.espn_sync_config
add constraint espn_sync_config_lifecycle_override
check (
  lifecycle_override is null
  or lifecycle_override in ('setup', 'picks_open', 'live', 'final')
);

alter table public.espn_sync_config
drop constraint if exists espn_sync_config_picks_open_deadline;

alter table public.espn_sync_config
add constraint espn_sync_config_picks_open_deadline
check (
  lifecycle_override <> 'picks_open'
  or entry_deadline_override is not null
);

create or replace function private.bracket_access_state(
  p_season_year smallint
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with configured as (
    select
      config.season_year,
      config.lifecycle_override,
      config.entry_deadline_override
    from public.espn_sync_config as config
    where config.source = 'mens-college-basketball'
      and (select auth.uid()) is not null
    limit 1
  )
  select case
    when configured.lifecycle_override = 'setup' then 'hidden'
    when configured.lifecycle_override = 'picks_open'
      and configured.entry_deadline_override > now() then 'open'
    when configured.lifecycle_override is not null then 'revealed'
    when not exists (
      select 1
      from public.espn_games as games
      where games.season_year = p_season_year
        and games.round_code = 'ROUND_OF_64'
    ) then 'hidden'
    when exists (
      select 1
      from public.espn_games as games
      where games.season_year = p_season_year
        and games.round_code = 'ROUND_OF_64'
        and games.starts_at <= now()
    ) then 'revealed'
    else 'open'
  end
  from configured
  where configured.season_year = p_season_year;
$$;

revoke all on function private.bracket_access_state(smallint) from public;
revoke all on function private.bracket_access_state(smallint) from anon;
revoke all on function private.bracket_access_state(smallint) from authenticated;
revoke all on function private.bracket_access_state(smallint) from service_role;

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
    select
      config.season_year,
      config.lifecycle_override,
      config.entry_deadline_override
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
      coalesce(ready.championship_complete, false) as championship_complete,
      configured.lifecycle_override,
      configured.entry_deadline_override
    from configured_season as configured
    left join latest_ready_field as ready on true
  )
  select
    selected.season_year,
    selected.configured_season_year,
    case
      when selected.lifecycle_override = 'setup' then 'setup'
      when selected.lifecycle_override = 'picks_open'
        and selected.entry_deadline_override > now() then 'picks_open'
      when selected.lifecycle_override = 'picks_open' then 'live'
      when selected.lifecycle_override is not null then selected.lifecycle_override
      when not selected.field_ready then 'setup'
      when selected.championship_complete then 'final'
      when selected.entry_deadline <= now() then 'live'
      else 'picks_open'
    end as phase,
    case
      when selected.lifecycle_override = 'setup' then false
      else selected.field_ready
    end as field_ready,
    case
      when selected.lifecycle_override is not null
        then selected.entry_deadline_override
      else selected.entry_deadline
    end as entry_deadline,
    selected.championship_tipoff,
    case
      when selected.lifecycle_override in ('setup', 'picks_open', 'live')
        then false
      when selected.lifecycle_override = 'final' then true
      else selected.championship_complete
    end as championship_complete
  from selected_season as selected
  where (select auth.uid()) is not null;
$$;

revoke all on function public.get_tournament_lifecycle() from public;
revoke all on function public.get_tournament_lifecycle() from anon;
grant execute on function public.get_tournament_lifecycle()
to authenticated, service_role;

drop policy if exists "Players can view brackets after tipoff"
on public.brackets;

create policy "Players can view brackets after tipoff"
on public.brackets
for select
to authenticated
using (
  (select auth.uid()) = user_id
  or (select private.bracket_access_state(season_year)) = 'revealed'
);

drop policy if exists "Players can create brackets before tipoff"
on public.brackets;

create policy "Players can create brackets before tipoff"
on public.brackets
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and (select private.bracket_access_state(season_year)) = 'open'
);

drop policy if exists "Players can update brackets before tipoff"
on public.brackets;

create policy "Players can update brackets before tipoff"
on public.brackets
for update
to authenticated
using (
  (select auth.uid()) = user_id
  and (select private.bracket_access_state(season_year)) = 'open'
)
with check (
  (select auth.uid()) = user_id
  and (select private.bracket_access_state(season_year)) = 'open'
);
