drop policy if exists "Players can view their own profile"
on public.profiles;

create policy "Authenticated players can view pool profiles"
on public.profiles
for select
to authenticated
using (true);

drop policy if exists "Players can view their own brackets"
on public.brackets;

create policy "Players can view brackets after tipoff"
on public.brackets
for select
to authenticated
using (
  (select auth.uid()) = user_id
  or exists (
    select 1
    from public.espn_games
    where espn_games.season_year = brackets.season_year
      and espn_games.round_code = 'ROUND_OF_64'
      and espn_games.starts_at <= now()
  )
);

drop policy if exists "Players can create their own brackets"
on public.brackets;

create policy "Players can create brackets before tipoff"
on public.brackets
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and not exists (
    select 1
    from public.espn_games
    where espn_games.season_year = brackets.season_year
      and espn_games.round_code = 'ROUND_OF_64'
      and espn_games.starts_at <= now()
  )
);

drop policy if exists "Players can update their own brackets"
on public.brackets;

create policy "Players can update brackets before tipoff"
on public.brackets
for update
to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and not exists (
    select 1
    from public.espn_games
    where espn_games.season_year = brackets.season_year
      and espn_games.round_code = 'ROUND_OF_64'
      and espn_games.starts_at <= now()
  )
);
