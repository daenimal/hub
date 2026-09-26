# TODO

## Pending

### Custom SMTP provider for branded auth emails
- Status: **on hold** — using Supabase default email provider (generic template) for now.
- Why: free-tier projects cannot customize email templates until a custom SMTP provider is configured (API returned: "Email template modification is not available for free tier projects using the default email provider").
- Work already done and ready to ship:
  - `supabase/templates/confirmation.html` — branded Hub confirmation email (CTA, plain-text fallback link, 1h expiry per `mailer_otp_exp`, "didn't create this?" note).
  - `supabase/templates/recovery.html` — branded Hub password reset email.
  - `supabase/email-templates.json` — subjects + template mapping (source of truth).
  - `scripts/apply-email-templates.mjs` — applies SMTP + templates via Management API (`--dry-run` / `--with-smtp`).
  - SMTP placeholder block in `.env.example`; creds go in git-ignored `smtp.env.local`.
- To finish: register a free account on a provider (suggested: Resend 3000/mo or Brevo 300/day), verify the sending domain, put the SMTP creds in `smtp.env.local`, then run `node scripts/apply-email-templates.mjs --with-smtp`. All the wiring can be done in-repo.

### Move auth Site URL to a custom domain (future)
- Status: **done for now** — Supabase `site_url` + `uri_allow_list` set to the Vercel URL `https://hub-iota-woad.vercel.app` via Management API.
- Later: when a custom domain (e.g. `hub.example.com`) is added on Vercel, update `site_url`/`uri_allow_list` again to the custom domain so confirmation links use it.
- Also keep the Vercel env var `NEXT_PUBLIC_SITE_URL` in sync (app/layout.tsx falls back to localhost).

## Done
- Professional email templates + apply script (ready, blocked by SMTP above).