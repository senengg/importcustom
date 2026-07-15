# Custom Import Profit Calculator

A shared Vercel app for import-cost, Amazon settlement, profit, margin and ROI calculations.

## Multi-user access

- Individual email/password accounts through Supabase Auth.
- Invitation-only registration.
- One shared workspace for all authorised users.
- Admin, editor and viewer roles.
- Optimistic version checking to prevent silent overwrites.
- Tamper-resistant activity logs retained for 30 days.
- Local browser storage remains a temporary offline fallback.

## Supabase setup

1. Create a Supabase project.
2. Open the Supabase SQL Editor and run `supabase/schema.sql`.
3. Disable public sign-ups in Authentication settings.
4. Configure custom SMTP for reliable invitations and password recovery.
5. Add the production URL to the allowed Auth redirect URLs:
   `https://importcustom.vercel.app/`

## Vercel environment variables

Add these values to Production, Preview and Development as appropriate:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (mark as sensitive)
- `APP_URL=https://importcustom.vercel.app`

Environment-variable changes require a new deployment.

## Initial invitations

After applying the schema, run:

```powershell
$env:SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"
$env:APP_URL="https://importcustom.vercel.app"
node scripts/invite-initial-users.mjs
```

This sends invitation emails to Senthil K, Selva S and Joel B as administrators. Invitation links open the app's password-setup screen.

## Development

- `npm run dev` starts the local preview with a local mock administrator.
- `npm test` verifies the app and multi-user state API.
- `npm run build` creates the Vercel `dist` output.
