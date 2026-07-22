alter table public.espn_sync_state
  add column if not exists last_alert_at timestamptz,
  add column if not exists last_alert_signature text,
  add column if not exists last_alert_delivery_error text;
