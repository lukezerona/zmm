create table public.bracket_payments (
  bracket_id uuid primary key
    references public.brackets(id)
    on delete cascade,
  is_paid boolean not null default false,
  amount_cents integer not null default 1000,
  payment_method text,
  note text,
  paid_at timestamptz,
  marked_by uuid
    references auth.users(id)
    on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bracket_payments_amount_nonnegative
    check (amount_cents >= 0),
  constraint bracket_payments_method_length
    check (
      payment_method is null
      or char_length(btrim(payment_method)) between 1 and 50
    ),
  constraint bracket_payments_note_length
    check (
      note is null
      or char_length(note) <= 500
    ),
  constraint bracket_payments_paid_timestamp
    check (
      (is_paid and paid_at is not null)
      or (not is_paid and paid_at is null)
    )
);

alter table public.bracket_payments enable row level security;

revoke all on table public.bracket_payments
from public, anon, authenticated;

grant usage on schema public to service_role;
grant select, insert, update, delete
on table public.bracket_payments
to service_role;
