# Project State Report — MicroHub (hub)

> Handover document for AI agents. Read `AGENTS.md`, `README.md`, and `node_modules/next/dist/docs/` (Next.js 16 has breaking changes vs. training data) before touching code.

## 1. What this project is

Personal micro-utility hub: in-browser tools for developers/3D artists/creators. Modular monolith, serverless Stack, **0€ cost target** (Vercel free + Supabase free + GitHub Actions). Rule #1: avoid over-engineering; Tool 1 (Texture Optimizer) is being built end-to-end before adding more tools.

## 2. Where things live

- Repo: `https://github.com/daenimal/hub` (public), branch `main`. Pushing to `main` auto-triggers a Vercel production deploy.
- Local root: `C:\Users\danie\Downloads\git\hub` (Windows). **Use `npm.cmd`/`npx.cmd`** — PowerShell blocks `.ps1` shims.
- Production: `https://hub-iota-woad.vercel.app` (Vercel team `daniels-projects-9284477e`, project `hub`). The prettier alias `hub.vercel.app` is **owned by another project ("MealFor")** and cannot be claimed yet.

## 3. Stack & current state (all verified ✓)

- Next.js 16.3.6 App Router + TypeScript + Tailwind v4. **v16 specifics: `proxy.ts` replaces `middleware.ts`; error boundaries use `retry` (not `reset`); `instrumentation.ts` docs in `node_modules/next/dist/docs/01-app/`.**
- Supabase: project ref `suathhkztrlgsqnwdspj`, region `eu-central-1`. Schema in `/supabase/migrations/`:
  - `001_initial_schema.sql` — `profiles` linked to `auth.users`, `is_admin()` (SECURITY DEFINER), RLS, profile auto-create on signup.
  - `002_app_errors.sql` — `app_errors` error table (RLS: anyone inserts via validated endpoints, only admins read/delete).
  - `003_hardening.sql` — `tool_presets` (per-user/shared presets, RLS on `auth.uid()`), `profiles.email` sync trigger on `auth.users.email` change, DB-level `app_errors` sanitizer trigger (mirrors server-side length caps).
  - Local link intact (`supabase/.temp`, PAT persisted). Migrations 001/002/003 in sync local↔remote.
- Vercel: production deploy current; `/` → 200, `/admin/dashboard` → 307 (proxy guard working).
- Quality gates: `npm run lint`, `npm run typecheck`, `npm run build` green; Playwright e2e 7/7 green (specs are env-agnostic on purpose).

## 4. Architecture map

- `proxy.ts` → `lib/supabase/middleware.ts` — session refresh + admin guard. **Early-exits (no `getUser()`) on public paths** to save serverless time; consequence: on `public` pages near token expiry the Navbar may briefly show logged-out (acceptable trade-off, protected routes unaffected).
- `lib/supabase/` — `client.ts` (browser), `server.ts` (RSC), `middleware.ts`, `env.ts` (returns null when env missing → callers must guard), `types.ts`.
- `components/tools/texture-optimizer/optimizer-ui.tsx` — Tool 1 UI: **state machine** (`idle → processing → done/error/canceled`), live progress, cancel, PNG preview + download, presets (save/load/delete via `lib/texture-optimizer/presets.ts`: Supabase `tool_presets` when signed in, `localStorage` fallback). `workers/optimizer.worker.ts` — **complete pipeline** (decode → downscale to maxWidth/maxHeight with `imageSmoothingEnabled=false` → median-cut quantization → Floyd-Steinberg/Bayer/ordered dithering → progress bands → `transferToImageBitmap`), with guardrails (≤64 MB file, ≤8k×8k decode cap, ≤2048×2048 process cap) and per-job cancel. Wired via `lib/texture-optimizer/worker.ts`. Worker must use `new Worker(new URL('@/workers/optimizer.worker.ts', import.meta.url))`.
- `lib/tools/registry.tsx` — D1: single source of truth for the tool list (homepage renders from it); `getTool(slug)`, `toolBadge(status)`.
- `lib/observability/report.ts` — `sanitizeEntry()` (field/len limits, whitelisted source/severity/method) + `reportError()` (sends via Supabase REST with anon key, 15s in-memory throttle). Errors are reported directly to Supabase REST (never via `/api/log` from the server — avoids recursion).
- `instrumentation.ts` — `onRequestError` → server/proxy errors into `app_errors`.
- `app/api/log/route.ts` — POST intake for client errors; validates/sanitizes then forwards.
- `app/error.tsx` + `app/global-error.tsx` — boundary UI with `retry`, auto-report errors; `components/client-error-monitor.tsx` listens to window `error` + `unhandledrejection` (throttled ~1 per 2s, `keepalive`).
- `scripts/weekly-report.mjs` + `.github/workflows/weekly-monitoring.yml` — every Monday 08:00 (+`workflow_dispatch`): queries last 7 days of `app_errors`, flags failed deployments via `gh api`, opens a GitHub issue with grouped diagnostics. Works locally in dry-run (no `--create-issue`).
- `scripts/cleanup-app-errors.mjs` + `.github/workflows/cleanup-app-errors.yml` — weekly retention: deletes `app_errors` older than 30 days via service role.
- `e2e/` — `home.spec.ts` (3 smoke), `auth.spec.ts` (2 guards), `optimizer.spec.ts` (2: full pipeline + cancel; generates a real PNG in-test). `playwright.config.ts` webServer = `npm run build && npm run start`.

## 5. Environment variables & secrets (critical)

- Public (reach browser): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Tooling/server-only, **never** in browser: `SUPABASE_SERVICE_ROLE_KEY` (also a GitHub Actions repo secret), `SUPABASE_URL` (same as public URL, GitHub secret), `SUPABASE_DB_PASSWORD` (local Supabase CLI only, `supabase db push --password <pw>`).
- GitHub repo secrets set: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- DB password lives in git-ignored `.env.local` and (ideally) a password manager. **Never commit `.env.local`, never commit real key values** — scan confirms zero leakage (only `.env.example` with placeholders is tracked).

## 6. Security posture

- 3-tier admin protection: Navbar shows link only to admins → proxy redirect → DB RLS via `is_admin()`.
- `next.config.ts`: `poweredByHeader: false` + `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`.
- Open-redirect guarded in `login-form.tsx` (`isInternalUrl`: only internal absolute `/…` paths).
- `app/robots.ts` disallows `/admin` + `/login`.

## 7. Known gaps / intended follow-ups

- Weekly GitHub issue only *reports* bugs; fixing them requires a manual/agent session (no autonomous AI in CI, keeps cost 0€).
- `app_errors` retention is handled (weekly cleanup of rows >30 days); adjust `RETENTION_DAYS` in the workflow if needed.
- `components/tools/texture-optimizer/optimizer-ui.tsx` uses raw `<img>` for blob previews (rule disabled at file top) because `next/image` cannot optimize `objectURL` previews.
- The pipeline guardrails cap output at 2048×2048 px and files at 64 MB by design; raise `MAX_PROCESS_PIXELS` if larger textures are ever needed (watch worker memory).

## 8. Hands-on cheat sheet

```powershell
npm.cmd run dev          # local dev (localhost:3000)
npm.cmd run lint; npm.cmd run typecheck   # every code change
npm.cmd run build        # config/package changes only
npm.cmd run test:e2e     # proxy/auth/route changes or on request

npx.cmd supabase db push --password (Get-Content .env.local... )  # apply migrations
node scripts/weekly-report.mjs           # dry-run report (uses SUPABASE_URL + SERVICE_KEY env)
node scripts/cleanup-app-errors.mjs      # retention dry-run (deletes app_errors > 30d)
```

Read `AGENTS.md` for full conventions (§0 Commands, §5 Project Map, §7 Security checklist, §8 Testing strategy).