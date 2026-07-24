# Custom Import Profit Calculator

A shared Vercel app for import-cost, Amazon settlement, profit, margin and ROI calculations.

## Multi-user access

- Individual email/password accounts through Supabase Auth.
- Invitation-only registration.
- One shared workspace for all authorised users.
- Admin, editor and viewer roles.
- Optimistic version checking to prevent silent overwrites.
- Tamper-resistant activity logs retained for 30 days.
- Local browser storage is available only after authentication and is cleared on logout or session failure.
- All database tables are private to the server API; browser roles have no direct table access.
- Audit records older than 30 days are deleted daily by Supabase Cron.

## Supabase setup

1. Create a Supabase project.
2. Open the Supabase SQL Editor and run `supabase/schema.sql`.
3. Disable public sign-ups in Authentication settings.
4. Configure custom SMTP for reliable invitations and password recovery.
5. Add the production URL to the allowed Auth redirect URLs:
   `https://importcustom.vercel.app/`

For an existing project, apply
`supabase/migrations/20260724090000_security_hardening.sql` in the SQL Editor
before deploying the matching application code. This enables RLS on every table,
removes browser-role grants, repairs the signup trigger, and installs the
30-day audit-log cleanup job. Confirm the job is active under Integrations /
Cron after applying it.

Also configure Auth session controls to match `supabase/config.toml`:

- Maximum session lifetime: 24 hours.
- Inactivity timeout: 8 hours.
- Secure password changes: enabled.

Confirm database backups are active in the Supabase dashboard. Enable
point-in-time recovery if the workspace requires recovery between daily backups.

## Vercel environment variables

Add these values to Production, Preview and Development as appropriate:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY` (mark as sensitive)
- `APP_URL=https://importcustom.vercel.app`

Environment-variable changes require a new deployment.
Legacy `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` names remain supported
during migration, but new deployments should use the publishable and secret keys.

## Initial invitations

After applying the schema, run:

```powershell
$env:SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
$env:SUPABASE_SECRET_KEY="YOUR_SECRET_KEY"
$env:APP_URL="https://importcustom.vercel.app"
node scripts/invite-initial-users.mjs
```

This sends invitation emails to Senthil K, Selva S and Joel B as administrators. Invitation links open the app's password-setup screen.

## Development

- Double-click `Start Local App.cmd` to open the app at `http://localhost:4173`.
- `npm run dev` starts the same local app from a terminal.
- The local app uses the production authentication API and shared cloud data by default.
- Set `LOCAL_API_MODE=mock` before starting only when an offline mock administrator is required.
- `npm test` verifies the app and multi-user state API.
- `npm run build` creates the Vercel `dist` output.
