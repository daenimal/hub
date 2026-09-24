<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# AI Agent Instructions & Architecture Guidelines (`agents.md`)

## 1. Project Overview & Core Philosophy
- **Project:** Personal Micro-Utility Hub (Client-side focused tools for developers, 3D artists, and creators).
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
