alter table public.profiles
alter column display_name drop not null;

alter table public.brackets
add column display_name text,
add column is_primary boolean not null default false;

update public.brackets as bracket
set display_name = coalesce(
  nullif(btrim(profile.display_name), ''),
  profile.username
)
from public.profiles as profile
where profile.user_id = bracket.user_id;

update public.brackets
set display_name = 'Bracket'
where display_name is null;

alter table public.brackets
alter column display_name set not null;

alter table public.brackets
add constraint brackets_display_name_length
check (char_length(btrim(display_name)) between 1 and 50);

update public.brackets
set is_primary = true;

alter table public.brackets
drop constraint if exists brackets_user_season_unique;

create unique index brackets_one_primary_per_user_season_idx
on public.brackets (user_id, season_year)
where is_primary;

create unique index brackets_user_season_display_name_unique_idx
on public.brackets (user_id, season_year, lower(btrim(display_name)));

create index brackets_user_season_idx
on public.brackets (user_id, season_year);

create or replace function private.prepare_bracket_entry()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.display_name := coalesce(
    nullif(btrim(new.display_name), ''),
    (
      select profile.username
      from public.profiles as profile
      where profile.user_id = new.user_id
    )
  );

  if tg_op = 'INSERT' then
    new.is_primary := not exists (
      select 1
      from public.brackets as existing
      where existing.user_id = new.user_id
        and existing.season_year = new.season_year
        and existing.is_primary
    );
  elsif
    new.user_id is distinct from old.user_id
    or new.season_year is distinct from old.season_year
    or new.is_primary is distinct from old.is_primary
  then
    raise exception 'Bracket ownership and primary status cannot be changed';
  end if;

  return new;
end;
$$;

revoke all
on function private.prepare_bracket_entry()
from public, anon, authenticated;

drop trigger if exists prepare_bracket_entry
on public.brackets;

create trigger prepare_bracket_entry
before insert or update
on public.brackets
for each row
execute function private.prepare_bracket_entry();

drop policy if exists "Players can delete extra brackets before tipoff"
on public.brackets;

create policy "Players can delete extra brackets before tipoff"
on public.brackets
for delete
to authenticated
using (
  (select auth.uid()) = user_id
  and not is_primary
  and (select private.bracket_access_state(season_year)) = 'open'
);

grant delete on table public.brackets to authenticated;
