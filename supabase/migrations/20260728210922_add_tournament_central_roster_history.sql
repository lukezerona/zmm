create table public.tournament_entries (
  bracket_id uuid primary key
    references public.brackets(id)
    on delete cascade,
  season_year smallint not null,
  owner_user_id uuid not null
    references auth.users(id)
    on delete cascade,
  display_name text not null,
  joined_at timestamptz not null,
  updated_at timestamptz not null default now(),
  constraint tournament_entries_season_year
    check (season_year between 2000 and 2100),
  constraint tournament_entries_display_name_length
    check (char_length(btrim(display_name)) between 1 and 50)
);

create index tournament_entries_season_joined_idx
on public.tournament_entries (season_year, joined_at, bracket_id);

create index tournament_entries_owner_season_idx
on public.tournament_entries (owner_user_id, season_year);

alter table public.tournament_entries enable row level security;

revoke all on table public.tournament_entries
from public, anon, authenticated;

grant select on table public.tournament_entries to authenticated;
grant select, insert, update, delete
on table public.tournament_entries
to service_role;

create policy "Authenticated players can view tournament roster"
on public.tournament_entries
for select
to authenticated
using ((select auth.uid()) is not null);

create or replace function private.sync_tournament_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.tournament_entries (
    bracket_id,
    season_year,
    owner_user_id,
    display_name,
    joined_at,
    updated_at
  )
  values (
    new.id,
    new.season_year,
    new.user_id,
    new.display_name,
    new.created_at,
    now()
  )
  on conflict (bracket_id) do update
  set
    season_year = excluded.season_year,
    owner_user_id = excluded.owner_user_id,
    display_name = excluded.display_name,
    joined_at = excluded.joined_at,
    updated_at = now();

  return new;
end;
$$;

revoke all
on function private.sync_tournament_entry()
from public, anon, authenticated, service_role;

create trigger sync_tournament_entry
after insert or update of user_id, season_year, display_name
on public.brackets
for each row
execute function private.sync_tournament_entry();

insert into public.tournament_entries (
  bracket_id,
  season_year,
  owner_user_id,
  display_name,
  joined_at,
  updated_at
)
select
  bracket.id,
  bracket.season_year,
  bracket.user_id,
  bracket.display_name,
  bracket.created_at,
  bracket.updated_at
from public.brackets as bracket
on conflict (bracket_id) do update
set
  season_year = excluded.season_year,
  owner_user_id = excluded.owner_user_id,
  display_name = excluded.display_name,
  joined_at = excluded.joined_at,
  updated_at = excluded.updated_at;

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
  ),
  season_state as (
    select
      exists (
        select 1
        from public.espn_games as games
        where games.season_year = p_season_year
          and games.round_code = 'ROUND_OF_64'
      ) as has_field,
      exists (
        select 1
        from public.espn_games as games
        where games.season_year = p_season_year
          and games.round_code = 'ROUND_OF_64'
          and games.starts_at <= now()
      ) as has_started,
      exists (
        select 1
        from public.espn_games as games
        where games.season_year = p_season_year
          and games.round_code = 'CHAMPIONSHIP'
          and games.completed
      ) as championship_complete
  )
  select case
    when p_season_year < configured.season_year
      and season_state.championship_complete then 'revealed'
    when p_season_year <> configured.season_year then 'hidden'
    when configured.lifecycle_override = 'setup' then 'hidden'
    when configured.lifecycle_override = 'picks_open'
      and configured.entry_deadline_override > now() then 'open'
    when configured.lifecycle_override is not null then 'revealed'
    when not season_state.has_field then 'hidden'
    when season_state.has_started then 'revealed'
    else 'open'
  end
  from configured
  cross join season_state;
$$;

revoke all
on function private.bracket_access_state(smallint)
from public, anon, authenticated, service_role;

grant usage on schema private to authenticated;
grant execute
on function private.bracket_access_state(smallint)
to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'tournament_entries'
  ) then
    alter publication supabase_realtime
    add table public.tournament_entries;
  end if;
end;
$$;
