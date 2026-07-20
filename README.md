# ZMM — Zerona March Madness

A black-and-blue family March Madness app built with Next.js, TypeScript, and Supabase authentication. This first version includes:

- An animated ZMM logo reveal and responsive sign-in screen
- Persistent Supabase sessions for automatic sign-in on return visits
- Invite-only account setup with unique usernames and display names
- Username-based sign-in and password recovery through hidden email aliases
- Loading, error, and password visibility states
- Supabase password recovery and new-password flow
- A protected Create Bracket placeholder personalized with the signed-in user's name
- A clear setup state when Supabase has not been connected yet

## 1. Run the site locally

Install Node.js if needed, then open a terminal in this folder and run:

```bash
npm install
npm run dev
```

Visit `http://localhost:3000`.

## 2. Connect a free Supabase project

1. Create an account at [supabase.com](https://supabase.com) and create a new project on the Free plan.
2. In your Supabase dashboard, open **Project Settings → API**.
3. Copy the **Project URL** and the **Publishable key** (an older project may label this the `anon` public key).
4. Copy `.env.example` to a new file named `.env.local`.
5. Replace the three example values in `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY=YOUR_SERVER_ONLY_SECRET_KEY
```

The secret key is required for ZMM's private username-to-account lookup. It is safe in the gitignored `.env.local`, but never prefix it with `NEXT_PUBLIC_`, commit it, paste it into chat, or use it in browser code. Restart `npm run dev` after changing environment variables.

Apply [`supabase/migrations/20260719180902_create_player_profiles.sql`](supabase/migrations/20260719180902_create_player_profiles.sql) to the development project in **SQL Editor** before testing invitations. Apply the same migration to production only after the development flow passes.

## 3. Configure authentication

In Supabase, open **Authentication → URL Configuration**:

- Set **Site URL** to `http://localhost:3000` while testing locally.
- Add `http://localhost:3000/reset-password` to **Redirect URLs**.
- Add `http://localhost:3000/accept-invite` to **Redirect URLs**.
- In production, set Site URL to the live Vercel URL and add both `/reset-password` and `/accept-invite` URLs to the redirect list.

ZMM-branded templates for password recovery, invitations, account confirmation, and magic-link sign-in are ready in [`supabase/email-templates`](supabase/email-templates). Follow that folder's README to paste them into Supabase and configure a free SMTP sender for delivery to family members.

## 4. Invite family members

ZMM intentionally has no public sign-up page. Each invitation creates one private player account.

1. Open **Authentication → Users** in Supabase.
2. Choose **Add user → Send invitation**.
3. Enter a unique real `+` alias, such as `zeronafamily+charlie@gmail.com`.
4. The player opens the ZMM invitation email.
5. ZMM sends the authenticated invitee to `/accept-invite`.
6. The player chooses a username, display name, and password.
7. Future sign-ins and password recovery use the username. Supabase sends recovery mail to the hidden alias.

If an invitation expires, send a new one from the same Supabase Users screen.

## 5. Test the complete flow

1. Send an invitation to one of your own `+` aliases.
2. Accept it and create a username, display name, and password.
3. Confirm that the personalized Create Bracket placeholder opens.
4. Sign out and sign in using the username rather than the email.
5. Close and reopen the browser tab; the saved session should sign the user in automatically.
6. Sign out, select **Forgot password?**, submit the username, and open the recovery link.
7. Choose a new password and sign in again.

## 6. Deploy to Vercel for free

1. Push this project to a GitHub repository.
2. Create a free account at [vercel.com](https://vercel.com) and choose **Add New → Project**.
3. Import the GitHub repository. Vercel will detect Next.js automatically.
4. Before deploying, add all three Supabase values under **Environment Variables**:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SECRET_KEY`
5. Deploy, then copy the live Vercel URL into the Supabase URL Configuration described above.

Configure the server-only secret in three separate places:

- Local development: put the development project's secret directly in the gitignored `.env.local`.
- Vercel Preview: add the development project's secret as a Sensitive variable scoped only to **Preview**.
- Vercel Production: add the production project's secret as a Sensitive variable scoped only to **Production**.

Vercel does not allow Sensitive variables in its Development environment. That environment is not needed for the normal `npm run dev` workflow because Next.js reads the local `.env.local` file.

Supabase Free plus Vercel Hobby should be sufficient for a small private family bracket. Both services have usage limits, so review their current plan pages before expanding beyond family use.

## Useful commands

```bash
npm run dev
npm run build
npm run lint
```
