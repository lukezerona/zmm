# ZMM — Zerona March Madness

A black-and-blue family March Madness app built with Next.js, TypeScript, and Supabase authentication. This first version includes:

- An animated ZMM logo reveal and responsive sign-in screen
- Persistent Supabase sessions for automatic sign-in on return visits
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
5. Replace the two example values in `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_KEY
```

Never put the `service_role` or secret key in this file. Restart `npm run dev` after changing environment variables.

## 3. Configure authentication

In Supabase, open **Authentication → URL Configuration**:

- Set **Site URL** to `http://localhost:3000` while testing locally.
- Add `http://localhost:3000/reset-password` to **Redirect URLs**.
- After Vercel gives you a production URL, change Site URL to that URL and also add `https://YOUR-VERCEL-DOMAIN.vercel.app/reset-password` to Redirect URLs.

ZMM-branded templates for password recovery, invitations, account confirmation, and magic-link sign-in are ready in [`supabase/email-templates`](supabase/email-templates). Follow that folder's README to paste them into Supabase and configure a free SMTP sender for delivery to family members.

## 4. Add family members

This version intentionally has no public sign-up page. That keeps the family pool private.

1. Open **Authentication → Users** in Supabase.
2. Choose **Add user → Create new user**.
3. Enter the family member's email and a temporary password.
4. To display their real name, open that user and set **User Metadata** to:

```json
{
  "full_name": "Family Member Name"
}
```

If no name is provided, the bracket page uses the portion of their email before `@`.

## 5. Test the complete flow

1. Sign in with a family account.
2. Confirm that the personalized Create Bracket placeholder opens.
3. Close and reopen the browser tab; the saved Supabase session should sign the user in automatically.
4. Sign out, select **Forgot password?**, submit the email, and open the link in the recovery email.
5. Choose a new password and sign in again.

## 6. Deploy to Vercel for free

1. Push this project to a GitHub repository.
2. Create a free account at [vercel.com](https://vercel.com) and choose **Add New → Project**.
3. Import the GitHub repository. Vercel will detect Next.js automatically.
4. Before deploying, add both Supabase values under **Environment Variables**:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. Deploy, then copy the live Vercel URL into the Supabase URL Configuration described above.

Supabase Free plus Vercel Hobby should be sufficient for a small private family bracket. Both services have usage limits, so review their current plan pages before expanding beyond family use.

## Useful commands

```bash
npm run dev
npm run build
npm run lint
```
