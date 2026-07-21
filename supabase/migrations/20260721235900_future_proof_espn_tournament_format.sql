alter table public.espn_games
  drop constraint if exists espn_games_round_code,
  drop constraint if exists espn_games_round_number,
  drop constraint if exists espn_games_home_seed,
  drop constraint if exists espn_games_away_seed;

alter table public.espn_games
  add column if not exists is_play_in boolean not null default false;

update public.espn_games
set is_play_in = (
  round_code ~ '^FIRST_' or round_code = 'OPENING_ROUND'
)
where is_play_in is distinct from (
  round_code ~ '^FIRST_' or round_code = 'OPENING_ROUND'
);

alter table public.espn_games
  drop column if exists counts_for_bracket,
  alter column round_number drop not null;

alter table public.espn_games
  add constraint espn_games_round_code check (
    round_code ~ '^[A-Z0-9_]{2,40}$'
  ),
  add constraint espn_games_round_number check (
    round_number is null or round_number >= 0
  ),
  add constraint espn_games_home_seed check (
    home_team_seed is null or home_team_seed >= 1
  ),
  add constraint espn_games_away_seed check (
    away_team_seed is null or away_team_seed >= 1
  );
