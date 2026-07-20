create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  display_name text not null,
  created_at timestamptz not null default now(),
  constraint profiles_username_lowercase check (username = lower(username)),
  constraint profiles_username_format check (
    username ~ '^[a-z0-9][a-z0-9_.-]{2,23}$'
  ),
  constraint profiles_display_name_length check (
    char_length(btrim(display_name)) between 1 and 50
  )
);

alter table public.profiles enable row level security;

revoke all on table public.profiles from anon;
grant usage on schema public to authenticated, service_role;
grant select, insert, update on table public.profiles to authenticated;
grant select, insert, update, delete on table public.profiles to service_role;

create policy "Players can view their own profile"
on public.profiles
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Players can create their own profile"
on public.profiles
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Players can update their own profile"
on public.profiles
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
