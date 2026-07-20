# ZMM Supabase email templates

These templates are designed for Supabase Auth with email-safe table layouts and inline styles. No paid email service is required, but Supabase's default sender is only suitable for testing with project-team email addresses.

## Install them in Supabase

Open your project in Supabase and go to **Authentication → Email Templates**. Select the matching template, replace its subject and source with the values below, then click **Save changes**.

| Supabase template | Subject | Source file |
| --- | --- | --- |
| Reset password | `Reset your ZMM password` | `recovery.html` |
| Invite user | `You're invited to Zerona March Madness` | `invite.html` |
| Confirm sign up | `Confirm your ZMM account` | `confirmation.html` |
| Magic link | `Your secure ZMM sign-in link` | `magic-link.html` |

Open each HTML file, copy its complete contents, and paste it into the template's **Source** field. Use Supabase's preview before saving.

## Important logo setup

The templates load the existing logo from the stable public production URL:

```text
https://zmm-eta.vercel.app/zmm-logo.png
```

Using an absolute public URL keeps the logo working when the development project's **Site URL** is `localhost`. If the production domain changes, update this URL in all four templates.

## Test before inviting the family

1. Confirm that your deployed Vercel URL is the Supabase Site URL.
2. Confirm that `https://YOUR-VERCEL-DOMAIN.vercel.app/reset-password` is in the redirect allow list.
3. Confirm that `https://YOUR-VERCEL-DOMAIN.vercel.app/accept-invite` is in the redirect allow list.
4. Send a password reset to your own username from the ZMM login page.
5. Check the message on both a phone and desktop email client.
6. Click the button and confirm that it opens the ZMM new-password page.
7. Use **Authentication → Users → Invite user** with a real `+` email alias.
8. Accept the invite and confirm that ZMM opens the username, display name, and password setup page.

The `{{ .ConfirmationURL }}` placeholder is a Supabase template variable. Do not replace it with a fixed value.

## Let Supabase email the whole family for free

Supabase's default testing sender only delivers to email addresses on your Supabase project team and is currently limited to two messages per hour. Do not add family members to the project team just to receive emails, because that can grant dashboard access.

For family accounts, connect a free SMTP sender under **Authentication → Email → SMTP Settings**. Brevo is a practical free option with SMTP access and a 300-email daily limit:

1. Create a free Brevo account and verify a sender email address.
2. In Brevo, open **Transactional → Settings → SMTP & API → SMTP** and create an SMTP key.
3. In Supabase, enable custom SMTP and enter:
   - Host: `smtp-relay.brevo.com`
   - Port: `587`
   - Username: the SMTP login shown by Brevo
   - Password: the Brevo SMTP key, not a Brevo API key
   - Sender name: `Zerona March Madness`
   - Sender email: the sender address verified in Brevo
4. Save and send a reset email to your own non-team address as a test.

Keep the SMTP key only in the Supabase dashboard. It does not belong in this repository or in Vercel environment variables.
