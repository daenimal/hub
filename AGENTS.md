<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## 0. Commands (cheap validation - run them, do not skip)
- `npm run lint` — eslint (whole repo) -> every code change
- `npm run typecheck` — `tsc --noEmit` -> every code change
- `npm run build` — full production build -> only when `next.config.ts`/`package.json`/config changes, or on request
- `npm run test:e2e` — Playwright E2E (chromium, `webServer` builds + starts the app) -> when proxy/auth/route/redirect behavior changes, or on request

Keep diffs minimal. Do not run `npm audit`, upgrade deps, or reformat unrelated code unless asked.

---

# AI Agent Instructions & Architecture Guidelines (`agents.md`)

## 1. Project Overview & Core Philosophy
- **Project:** Personal Micro-Utility Hub (Client-side focused tools for developers, 3D artists, and creators).
- **Language:** English is the project's primary language. All UI copy, metadata, error messages, docs, and test assertions must be written in English (reply to the user in the language they use).
- **Architecture:** Modular Monolith with a Serverless Stack.
- **Cost Target:** 0€ operational cost (using free tiers of Vercel/Cloudflare Pages, Supabase, and Lemon Squeezy).
- **Rule #1:** Avoid over-engineering. Build the first tool end-to-end before expanding the hub structure.

---

## 2. Tech Stack & Non-Negotiable Standards
- **Framework:** Next.js (App Router) + TypeScript.
- **Styling:** Tailwind CSS (utility-first, no custom CSS sprawl).
- **Database & Auth:** Supabase (PostgreSQL, Auth, RLS).
- **State/Limits:** Database-backed for logged-in users; `localStorage` fallback for anonymous users.

---

## 3. Critical Technical Rules (Mandatory Compliance)

### A. Database & Supabase
1. **Connection Pooling:** Always configure Supabase connection strings via **PgBouncer in transaction mode** (port 6543) with `?pgbouncer=true` and disabled prepared statements to prevent connection exhaustion on serverless.
2. **Row Level Security (RLS):** Every table created in Supabase MUST have RLS enabled with explicit policies. Never rely solely on UI or middleware checks.
3. **Migrations Tracking:** Keep all database schemas, tables, and custom SQL functions (like `is_admin()`) inside a `/supabase/migrations/` folder within the Git repository rather than modifying the database purely via the web dashboard.
4. **Admin Role Security:** Use a `profiles` table linked to `auth.users` with a `role` column (`CHECK (role IN ('user','admin'))`). Protect admin routes using a 3-tier strategy: Client Guard (UX), Next.js Proxy/Middleware (Routing), and SQL RLS / `is_admin()` function (Data security).

### B. Performance & Web Workers (Crucial for Tool 1)
1. **No UI Blocking:** Never run heavy pixel manipulation (Canvas API, color quantization, dithering) on the main JavaScript thread.
2. **Web Worker Implementation:** The texture/image optimizer must use an **OffscreenCanvas + Web Worker**.
3. **Next.js Worker Bundling:** When instantiating Web Workers in Next.js TypeScript, always use the Vite/Webpack-compatible syntax to prevent build failures:
   ```typescript
   const worker = new Worker(new URL('@/workers/optimizer.worker.ts', import.meta.url));
   ```

### C. Authentication & Session Handling

1. **@supabase/ssr:** Always use the official `@supabase/ssr` package for handling cookies across Server Components, Client Components, and Middleware. Never mix client and server client instances incorrectly.
2. **Server Components by Default:** Keep components as Server Components by default. Add 'use client' only at the leaf nodes where interactivity, canvas hooks, or auth forms are strictly required.

---

## 4. Git & Workflow Rules

1. **Branching:** Use feature branches (`feat/texture-optimizer`) and merge into `main` only when stable.
2. **Incremental Development:** Complete the full vertical slice of the Texture Optimizer before scaffolding additional hub tools.

---

## 5. Project Map (read these, don't explore blindly)
- `proxy.ts` — Next.js Proxy (v16, replaces `middleware.ts`) -> route guard in `lib/supabase/middleware.ts` (redirects, admin check).
- `lib/supabase/` — `client.ts` (browser), `server.ts` (RSC), `middleware.ts` (proxy session), `env.ts` (config guard, null when env missing), `types.ts` (DB types).
- `components/` — shared UI; `components/tools/texture-optimizer/optimizer-ui.tsx` is Tool 1's client UI (state machine: idle/processing/done/error/canceled; progress, cancel, preview, presets).
- `lib/tools/registry.tsx` — the tool list used by the homepage (single source of truth: `tools`, `getTool`, `toolBadge`).
- `workers/optimizer.worker.ts` — complete pixel pipeline (decode, downscale, median-cut quantization, Floyd-Steinberg/Bayer/ordered dithering, progress, per-job cancel, size guardrails), wired via `lib/texture-optimizer/worker.ts`; presets live in `lib/texture-optimizer/presets.ts` (DB if signed in, localStorage fallback).
- `app/` — routes: `/`, `/login`, `/admin/dashboard`, `/tools/texture-optimizer`, `/api/log` (error intake); `app/robots.ts` disallows `/admin` + `/login`.
- `instrumentation.ts` — server/proxy error capture via `onRequestError`; `lib/observability/report.ts` sanitizes + writes to `app_errors` table.
- `scripts/weekly-report.mjs` + `.github/workflows/weekly-monitoring.yml` — weekly error/deploy report posted as a GitHub issue (cron `0 8 * * 1`).
- `scripts/cleanup-app-errors.mjs` + `.github/workflows/cleanup-app-errors.yml` — weekly `app_errors` retention (deletes rows older than 30 days).
- `e2e/` — Playwright specs (smoke + auth guards + optimizer pipeline/cancel). `playwright.config.ts` uses `npm run build && npm run start` as webServer.
- `supabase/migrations/` — DB schema is the source of truth; never hand-edit the remote DB.

## 6. Windows dev environment
- Use `npm.cmd` / `npx.cmd`: the PowerShell execution policy blocks the `.ps1` shims.
- PowerShell 5.1 quirks to work around: no `-SkipHttpErrorCheck` on `Invoke-WebRequest`, read-only `$HOME`, missing `RandomNumberGenerator::Fill`.

## 7. Security checklist (never skip)
- Never commit `.env*` content or secrets; only placeholders in `.env.example` are tracked. Real env lives in git-ignored `.env.local`.
- Only `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` (public by design) reach the browser. Service role key and DB password are tooling/server-only, never in Vercel env nor commits.
- `SUPABASE_DB_PASSWORD` feeds the local Supabase CLI (link/db push); keep it out of any app runtime env.
- `role` and RLS are never bypassable client-side: rely on `is_admin()` (SECURITY DEFINER) + column-level grants; ship schema changes as migrations.
- Redirect targets (e.g. `?next=`) must be internal absolute paths (`/…`), never `//…` or `\…`.

## 8. Testing strategy
- E2E (Playwright) is the only supported way to test async Server Components, proxy redirects, and route guards — unit tests do not cover async RSC.
- Write/update an `e2e/` spec when touching `proxy.ts`, `lib/supabase/middleware.ts`, auth forms, or route protection. Keep specs env-agnostic so they pass with or without `.env.local`.
