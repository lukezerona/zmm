create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create table if not exists public.espn_sync_config (
  source text primary key,
  season_year smallint not null,
  tournament_start date not null,
  tournament_end date not null,
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint espn_sync_config_source_not_blank check (btrim(source) <> ''),
  constraint espn_sync_config_season_year check (season_year between 2000 and 2100),
  constraint espn_sync_config_date_order check (tournament_end >= tournament_start)
);

create table if not exists public.espn_games (
  espn_event_id text primary key,
  season_year smallint not null,
  season_slug text,
  starts_at timestamptz not null,
  event_name text not null,
  tournament_headline text not null,
  region text,
  round_code text not null,
  round_number smallint,
  is_play_in boolean not null default false,
  venue_name text,
  venue_city text,
  venue_state text,
  broadcast text,
  status_state text not null,
  status_description text,
  status_detail text,
  completed boolean not null,
  period smallint,
  clock text,
  home_team_id text not null,
  home_team_name text not null,
  home_team_abbreviation text,
  home_team_seed smallint,
  home_team_logo_url text,
  home_score smallint,
  home_winner boolean not null default false,
  away_team_id text not null,
  away_team_name text not null,
  away_team_abbreviation text,
  away_team_seed smallint,
  away_team_logo_url text,
  away_score smallint,
  away_winner boolean not null default false,
  source_hash text not null,
  source_updated_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint espn_games_event_id_not_blank check (btrim(espn_event_id) <> ''),
  constraint espn_games_season_year check (season_year between 2000 and 2100),
  constraint espn_games_region check (
    region is null or region in ('east', 'midwest', 'south', 'west')
  ),
  constraint espn_games_round_code check (
    round_code ~ '^[A-Z0-9_]{2,40}$'
  ),
  constraint espn_games_round_number check (
    round_number is null or round_number >= 0
  ),
  constraint espn_games_period check (period is null or period >= 0),
  constraint espn_games_home_seed check (
    home_team_seed is null or home_team_seed >= 1
  ),
  constraint espn_games_away_seed check (
    away_team_seed is null or away_team_seed >= 1
  ),
  constraint espn_games_home_score check (home_score is null or home_score >= 0),
  constraint espn_games_away_score check (away_score is null or away_score >= 0),
  constraint espn_games_different_teams check (home_team_id <> away_team_id)
);

create table if not exists public.espn_sync_state (
  source text primary key,
  last_attempt_at timestamptz not null,
  last_success_at timestamptz,
  last_error text,
  last_request_scope text,
  source_event_count integer not null default 0,
  tournament_event_count integer not null default 0,
  changed_game_count integer not null default 0,
  skipped_game_count integer not null default 0,
  duration_ms integer,
  constraint espn_sync_state_source_not_blank check (btrim(source) <> ''),
  constraint espn_sync_state_nonnegative_counts check (
    source_event_count >= 0
    and tournament_event_count >= 0
    and changed_game_count >= 0
    and skipped_game_count >= 0
    and (duration_ms is null or duration_ms >= 0)
  )
);

create index if not exists espn_games_season_round_start_idx
on public.espn_games (season_year, round_number, starts_at);

create index if not exists espn_games_status_start_idx
on public.espn_games (status_state, starts_at)
where completed = false;

alter table public.espn_sync_config enable row level security;
alter table public.espn_games enable row level security;
alter table public.espn_sync_state enable row level security;

revoke all on table public.espn_sync_config from anon, authenticated;
revoke all on table public.espn_games from anon, authenticated;
revoke all on table public.espn_sync_state from anon, authenticated;

grant usage on schema public to authenticated, service_role;
grant select on table public.espn_games to authenticated;
grant select, insert, update, delete on table public.espn_sync_config to service_role;
grant select, insert, update, delete on table public.espn_games to service_role;
grant select, insert, update, delete on table public.espn_sync_state to service_role;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'espn_games'
      and policyname = 'Authenticated players can view ESPN games'
  ) then
    create policy "Authenticated players can view ESPN games"
    on public.espn_games
    for select
    to authenticated
    using (true);
  end if;
end
$$;

insert into public.espn_sync_config (
  source,
  season_year,
  tournament_start,
  tournament_end,
  enabled
)
values (
  'mens-college-basketball',
  2026,
  date '2026-03-17',
  date '2026-04-07',
  false
)
on conflict (source) do nothing;

do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'espn_games'
  ) then
    alter publication supabase_realtime add table public.espn_games;
  end if;
end
$$;
