create table public.bracket_reminder_deliveries (
  id bigint generated always as identity primary key,
  season_year smallint not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  reminder_stage text not null,
  recipient_email text not null,
  bracket_ids uuid[] not null,
  bracket_names text[] not null,
  scheduled_for timestamptz not null,
  attempted_at timestamptz not null default now(),
  sent_at timestamptz,
  attempt_count smallint not null default 0,
  brevo_message_id text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bracket_reminder_deliveries_season_year_check
    check (season_year between 2000 and 2100),
  constraint bracket_reminder_deliveries_stage_check
    check (reminder_stage in ('early', 'tomorrow', 'final')),
  constraint bracket_reminder_deliveries_recipient_check
    check (char_length(btrim(recipient_email)) between 3 and 320),
  constraint bracket_reminder_deliveries_brackets_check
    check (
      cardinality(bracket_ids) > 0
      and cardinality(bracket_ids) = cardinality(bracket_names)
    ),
  constraint bracket_reminder_deliveries_attempt_count_check
    check (attempt_count between 0 and 3),
  constraint bracket_reminder_deliveries_unique
    unique (season_year, user_id, reminder_stage)
);

create index bracket_reminder_deliveries_retry_idx
on public.bracket_reminder_deliveries (
  season_year,
  reminder_stage,
  user_id
)
where sent_at is null and attempt_count < 3;

alter table public.bracket_reminder_deliveries enable row level security;

revoke all on table public.bracket_reminder_deliveries
from public, anon, authenticated;
grant usage on schema public to service_role;
grant select, insert, update, delete
on table public.bracket_reminder_deliveries
to service_role;
grant usage, select
on sequence public.bracket_reminder_deliveries_id_seq
to service_role;

comment on table public.bracket_reminder_deliveries is
  'Private delivery and retry log for unfinished ZMM bracket reminder emails.';

do $$
declare
  reminder_job_id bigint;
  reminder_command text := $command$
    select net.http_post(
      url := (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'espn_sync_project_url'
      ) || '/functions/v1/send-bracket-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'espn_sync_secret_key'
        )
      ),
      body := '{"mode":"run"}'::jsonb,
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
  into reminder_job_id
  from cron.job
  where jobname = 'send-zmm-bracket-reminders';

  if reminder_job_id is null then
    perform cron.schedule(
      'send-zmm-bracket-reminders',
      '*/15 * * * *',
      reminder_command
    );
  else
    perform cron.alter_job(
      job_id := reminder_job_id,
      schedule := '*/15 * * * *',
      command := reminder_command,
      active := true
    );
  end if;
end
$$;
