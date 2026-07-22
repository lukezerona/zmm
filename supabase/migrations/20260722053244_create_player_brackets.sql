create table public.brackets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  season_year smallint not null,
  picks jsonb not null default '{}'::jsonb,
  tiebreaker_total smallint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint brackets_user_season_unique unique (user_id, season_year),
  constraint brackets_season_year check (season_year between 2000 and 2100),
  constraint brackets_picks_object check (jsonb_typeof(picks) = 'object'),
  constraint brackets_tiebreaker_total check (
    tiebreaker_total is null or tiebreaker_total between 0 and 400
  )
);

create index brackets_user_id_idx on public.brackets (user_id);

alter table public.brackets enable row level security;

revoke all on table public.brackets from anon;
grant usage on schema public to authenticated, service_role;
grant select, insert, update on table public.brackets to authenticated;
grant select, insert, update, delete on table public.brackets to service_role;

create policy "Players can view their own brackets"
on public.brackets
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Players can create their own brackets"
on public.brackets
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Players can update their own brackets"
on public.brackets
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
