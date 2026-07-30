# ZMM tournament launch communications

This secret-authenticated Edge Function manages a two-step annual workflow:

1. Supabase Cron validates the announced 64-team field and official region
   pairings. Once ready, it sends the commissioner a review email.
2. The commissioner reviews the status and exact family email in the ZMM
   Commissioner screen, then explicitly approves delivery.

The family email is sent once per account, not once per bracket. Delivery rows and
Brevo idempotency UUIDs make retries safe.

The private `tournament_communications_config` row must be configured in each
Supabase environment. It intentionally is not seeded in source control so personal
contact information is not published in the repository.
