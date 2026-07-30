create table public.tournament_communications_config (
  source text primary key,
  commissioner_email text not null,
  commissioner_name text not null,
  commissioner_phone text,
  venmo_handle text not null default '@Luke-Zerona',
  app_url text not null default 'https://zmm-eta.vercel.app',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tournament_communications_config_source_check
    check (btrim(source) <> ''),
  constraint tournament_communications_config_email_check
    check (char_length(btrim(commissioner_email)) between 3 and 320),
  constraint tournament_communications_config_name_check
    check (char_length(btrim(commissioner_name)) between 1 and 100),
  constraint tournament_communications_config_phone_check
    check (
      commissioner_phone is null
      or char_length(btrim(commissioner_phone)) between 7 and 30
    ),
  constraint tournament_communications_config_venmo_check
    check (char_length(btrim(venmo_handle)) between 2 and 50),
  constraint tournament_communications_config_app_url_check
    check (app_url ~ '^https://')
);

create table public.tournament_launches (
  season_year smallint primary key,
  field_signature text not null,
  field_ready_at timestamptz not null,
  commissioner_notification_idempotency_key uuid not null
    default gen_random_uuid(),
  commissioner_notified_at timestamptz,
  commissioner_message_id text,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  launch_started_at timestamptz,
  launch_completed_at timestamptz,
  recipient_count integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  field_changed_after_launch_at timestamptz,
  field_change_idempotency_key uuid not null default gen_random_uuid(),
  field_change_message_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tournament_launches_season_year_check
    check (season_year between 2000 and 2100),
  constraint tournament_launches_field_signature_check
    check (char_length(field_signature) = 64),
  constraint tournament_launches_counts_check
    check (
      recipient_count >= 0
      and sent_count >= 0
      and failed_count >= 0
      and sent_count + failed_count <= recipient_count
    ),
  constraint tournament_launches_approval_check
    check (
      (approved_by is null and approved_at is null)
      or (approved_by is not null and approved_at is not null)
    )
);

create unique index tournament_launches_commissioner_notification_key_idx
on public.tournament_launches (commissioner_notification_idempotency_key);

create unique index tournament_launches_field_change_key_idx
on public.tournament_launches (field_change_idempotency_key);

create table public.tournament_launch_deliveries (
  season_year smallint not null
    references public.tournament_launches(season_year)
    on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  recipient_email text not null,
  idempotency_key uuid not null default gen_random_uuid(),
  attempt_count smallint not null default 0,
  attempted_at timestamptz,
  sent_at timestamptz,
  brevo_message_id text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (season_year, user_id),
  constraint tournament_launch_deliveries_email_check
    check (char_length(btrim(recipient_email)) between 3 and 320),
  constraint tournament_launch_deliveries_attempts_check
    check (attempt_count between 0 and 3)
);

create unique index tournament_launch_deliveries_idempotency_key_idx
on public.tournament_launch_deliveries (idempotency_key);

create index tournament_launch_deliveries_user_id_idx
on public.tournament_launch_deliveries (user_id);

create index tournament_launch_deliveries_retry_idx
on public.tournament_launch_deliveries (season_year, user_id)
where sent_at is null and attempt_count < 3;

alter table public.tournament_communications_config enable row level security;
alter table public.tournament_launches enable row level security;
alter table public.tournament_launch_deliveries enable row level security;

revoke all on table public.tournament_communications_config
from public, anon, authenticated;
revoke all on table public.tournament_launches
from public, anon, authenticated;
revoke all on table public.tournament_launch_deliveries
from public, anon, authenticated;

grant usage on schema public to service_role;
grant select, insert, update, delete
on table public.tournament_communications_config
to service_role;
grant select, insert, update, delete
on table public.tournament_launches
to service_role;
grant select, insert, update, delete
on table public.tournament_launch_deliveries
to service_role;

comment on table public.tournament_communications_config is
  'Private commissioner contact information used by ZMM transactional emails.';
comment on table public.tournament_launches is
  'One commissioner-reviewed bracket-opening communication workflow per season.';
comment on table public.tournament_launch_deliveries is
  'Private per-account delivery and retry log for the brackets-open email.';

do $$
declare
  launch_job_id bigint;
  launch_command text := $command$
    select net.http_post(
      url := (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'espn_sync_project_url'
      ) || '/functions/v1/manage-tournament-launch',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'espn_sync_secret_key'
        )
      ),
      body := '{"mode":"check"}'::jsonb,
      timeout_milliseconds := 60000
    )
  $command$;
begin
  if not exists (
    select 1
    from vault.decrypted_secrets
    where name = 'espn_sync_project_url'
  ) then
    raise exception 'Vault secret espn_sync_project_url is required';
  end if;

  if not exists (
    select 1
    from vault.decrypted_secrets
    where name = 'espn_sync_secret_key'
  ) then
    raise exception 'Vault secret espn_sync_secret_key is required';
  end if;

  select jobid
  into launch_job_id
  from cron.job
  where jobname = 'check-zmm-tournament-launch';

  if launch_job_id is null then
    perform cron.schedule(
      'check-zmm-tournament-launch',
      '8,23,38,53 * * * *',
      launch_command
    );
  else
    perform cron.alter_job(
      job_id := launch_job_id,
      schedule := '8,23,38,53 * * * *',
      command := launch_command,
      active := true
    );
  end if;
end
$$;
