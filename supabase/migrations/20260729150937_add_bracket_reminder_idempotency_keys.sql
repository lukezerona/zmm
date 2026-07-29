alter table public.bracket_reminder_deliveries
add column idempotency_key uuid not null default gen_random_uuid();

create unique index bracket_reminder_deliveries_idempotency_key_idx
on public.bracket_reminder_deliveries (idempotency_key);

comment on column public.bracket_reminder_deliveries.idempotency_key is
  'Stable Brevo idempotency UUID reused when a failed delivery is retried.';
