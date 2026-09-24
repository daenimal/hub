# MicroHub

Personal in-browser micro-utility hub for developers, 3D artists, and creators.

Stack: Next.js 16 (App Router) + TypeScript + Tailwind CSS v4 + Supabase (PostgreSQL, Auth, RLS). Cost target: 0€ operational (Vercel/Cloudflare Pages free tier, Supabase free tier, Lemon Squeezy).

## Getting started

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Every page is fully client-side where possible; heavy pixel work runs in a Web Worker.

## Environment variables

See `.env.example`. Required keys:

- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key

Optional (future server-side work): `SUPABASE_SERVICE_ROLE_KEY` and a raw `DATABASE_URL` (PgBouncer transaction mode, port `6543`, `?pgbouncer=true`, prepared statements disabled).

## Database & migrations

All schema changes live in `/supabase/migrations/` and are applied via the Supabase CLI (or SQL editor):

```bash
npx supabase link --project-ref your-project-ref
npx supabase db push
```

The initial migration `001_initial_schema.sql` creates:

- `profiles` linked to `auth.users` with a `role` column (`CHECK (role IN ('user','admin'))`)
- `is_admin()` security-definer function used by RLS policies and admin guards
- RLS: users read/update their own profile; admins read/update all profiles; no client-side role escalation (column-level grants)
- Auto-creation of profiles on signup

## Security model

Admin routes are protected on three tiers:

1. **Client Guard** - the Navbar only shows the Admin link to admins
2. **Routing** - `proxy.ts` (Next.js 16 proxy, formerly middleware) refreshes the session and redirects unauthorized users
3. **Data** - SQL RLS + `is_admin()` enforce rules at the database level

## Tool 1: Optimizer di Texture / Stile Retrò

Route: `/tools/texture-optimizer`. Pixel manipulation (quantization, dithering, resizing) runs off the main thread in `workers/optimizer.worker.ts` (OffscreenCanvas), instantiated via `lib/texture-optimizer/worker.ts`.

See `AGENTS.md` for the binding architecture guidelines for all future work.