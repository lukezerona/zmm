create table if not exists public.tournament_region_pairings (
  season_year smallint primary key,
  left_top_region text not null,
  left_bottom_region text not null,
  right_top_region text not null,
  right_bottom_region text not null,
  updated_at timestamptz not null default now(),
  constraint tournament_region_pairings_season_year
    check (season_year between 2000 and 2100),
  constraint tournament_region_pairings_valid_regions
    check (
      left_top_region in ('east', 'midwest', 'south', 'west')
      and left_bottom_region in ('east', 'midwest', 'south', 'west')
      and right_top_region in ('east', 'midwest', 'south', 'west')
      and right_bottom_region in ('east', 'midwest', 'south', 'west')
    ),
  constraint tournament_region_pairings_unique_regions
    check (
      left_top_region <> left_bottom_region
      and left_top_region <> right_top_region
      and left_top_region <> right_bottom_region
      and left_bottom_region <> right_top_region
      and left_bottom_region <> right_bottom_region
      and right_top_region <> right_bottom_region
    )
);

alter table public.tournament_region_pairings enable row level security;

revoke all on table public.tournament_region_pairings
from anon, authenticated;

grant select on table public.tournament_region_pairings to authenticated;
grant select, insert, update, delete
on table public.tournament_region_pairings
to service_role;

create policy "Authenticated players can view tournament region pairings"
on public.tournament_region_pairings
for select
to authenticated
using (true);

insert into public.tournament_region_pairings (
  season_year,
  left_top_region,
  left_bottom_region,
  right_top_region,
  right_bottom_region
)
values (
  2026,
  'east',
  'south',
  'west',
  'midwest'
)
on conflict (season_year) do nothing;
