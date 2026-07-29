# ZMM unfinished-bracket reminders

This production Edge Function sends one branded email per account containing every
unfinished family bracket on that account.

## Schedule

Supabase Cron invokes the function every 15 minutes. The function only sends while
bracket entry is open and one of these deadline-relative reminders is due:

- two calendar days before lock at 7:00 PM Eastern;
- one calendar day before lock at 7:00 PM Eastern;
- lock day at 9:00 AM Eastern, or three hours before lock when the deadline is
  earlier than noon.

Deliveries are recorded in `public.bracket_reminder_deliveries`. The unique
season/account/stage key plus Brevo's idempotency header prevents duplicate
messages, and a failed delivery is retried at most three times.

## Secrets

The function reuses the production secrets already used by the ESPN monitor:

- `BREVO_API_KEY`
- `ZMM_ALERT_FROM_EMAIL` (optional; falls back to the current Brevo sender)
- `ZMM_ALERT_EMAIL_TO` (optional reply-to fallback)

Optional reminder-specific overrides:

- `ZMM_REMINDER_REPLY_TO`
- `ZMM_APP_URL`
- `ZMM_LOGO_URL`

## Preview

POST a secret-authenticated request with:

```json
{ "mode": "preview", "stage": "early" }
```

Valid stages are `early`, `tomorrow`, and `final`. Preview mode returns the exact
subject, plain text, and HTML without sending an email or writing a delivery row.
