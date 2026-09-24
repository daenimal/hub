# MicroHub

Personal in-browser micro-utility hub for developers, 3D artists, and creators.

Stack: Next.js 16 (App Router) + TypeScript + Tailwind CSS v4 + Supabase (PostgreSQL, Auth, RLS). Cost target: 0€ operational (Vercel/Cloudflare Pages free tier, Supabase free tier, Lemon Squeezy).

## Getting started

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Pages are Server Components by default; interactivity lives in leaf components, and heavy pixel work runs in a Web Worker (OffscreenCanvas) so image processing never blocks the UI thread.

## Environment variables

See `.env.example`. Required keys:

- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key

The public URL + anon key are the only values that reach the browser. Tooling/server-only values (git-ignored or set as GitHub Actions secrets, never in the client):

- `SUPABASE_URL` - project URL used by `scripts/weekly-report.mjs`
- `SUPABASE_SERVICE_ROLE_KEY` - service role key for server-side scripts only
- `SUPABASE_DB_PASSWORD` - DB password for the local Supabase CLI (`link`/`db push`)
- `DATABASE_URL` - raw Postgres connection string for future background work (PgBouncer transaction mode, port `6543`, `?pgbouncer=true`, prepared statements disabled)

## Database & migrations

All schema changes live in `/supabase/migrations/` and are applied via the Supabase CLI (or SQL editor):

```bash
npx supabase link --project-ref your-project-ref
npx supabase db push
```

The migrations are:

- `001_initial_schema.sql` - `profiles` linked to `auth.users` with a `role` column (`CHECK (role IN ('user','admin'))`); `is_admin()` security-definer function used by RLS policies and admin guards; RLS (users read/update their own profile, admins all profiles, no client-side role escalation); auto-creation of profiles on signup
- `002_app_errors.sql` - `app_errors` table with RLS (anyone inserts through the validated endpoints, only admins read/delete), used by the error capture and the weekly monitoring report

## Observability & monitoring

- Server/proxy errors are captured by `instrumentation.ts` (Next.js `onRequestError`).
- Client errors are captured by `components/client-error-monitor.tsx` (window `error`/`unhandledrejection`, throttled) and by the `app/error.tsx` / `app/global-error.tsx` boundaries; validated payloads are posted to `/api/log`.
- Everything lands in the `app_errors` table (`lib/observability/report.ts` handles sanitize + throttle).
- `.github/workflows/weekly-monitoring.yml` runs `scripts/weekly-report.mjs` every Monday at 08:00 (and on `workflow_dispatch`): it summarizes the last 7 days of errors (grouped by message/source), flags failed deployments, and opens a GitHub issue with diagnostics.

## Testing

```bash
npm run test:e2e     # Playwright: smoke + auth-guard specs (env-agnostic)
npm run test:e2e:ui  # interactive Playwright UI mode
npm run lint
npm run typecheck
```

## Security model

Admin routes are protected on three tiers:

1. **Client Guard** - the Navbar only shows the Admin link to admins
2. **Routing** - `proxy.ts` (Next.js 16 proxy, formerly middleware) refreshes the session and redirects unauthorized users
3. **Data** - SQL RLS + `is_admin()` enforce rules at the database level

## Tool 1: Texture / Retro-Style Optimizer

Route: `/tools/texture-optimizer`. Pixel manipulation (quantization, dithering, resizing) runs off the main thread in `workers/optimizer.worker.ts` (OffscreenCanvas), instantiated via `lib/texture-optimizer/worker.ts`.

See `AGENTS.md` for the binding architecture guidelines for all future work.