-- 002_app_errors.sql
-- Observability: error log table used by the client/server error reporters
-- and by the weekly monitoring report.

create table if not exists public.app_errors (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  source      text not null default 'server' check (source in ('client', 'server', 'proxy')),
  severity    text not null default 'error' check (severity in ('info', 'warning', 'error', 'fatal')),
  message     text not null,
  digest      text,
  route       text,
  path        text,
  method      text,
  status_code integer,
  stack       text,
  user_agent  text
);

comment on table public.app_errors is 'Captured runtime errors (client, server, proxy) for monitoring.';

create index if not exists app_errors_created_at_idx on public.app_errors (created_at desc);
create index if not exists app_errors_source_idx on public.app_errors (source);

-- ---------------------------------------------------------------------------
-- RLS + grants
-- ---------------------------------------------------------------------------

alter table public.app_errors enable row level security;

-- Writes go through the validated /api/log route and the server instrumentation;
-- Fake/arbitrary payloads are rejected server-side. Admins read via is_admin().
create policy "anyone_insert_errors"
  on public.app_errors
  for insert
  with check (true);

create policy "admins_read_errors"
  on public.app_errors
  for select
  using (public.is_admin());

create policy "admins_delete_errors"
  on public.app_errors
  for delete
  using (public.is_admin());

revoke all on table public.app_errors from anon, authenticated;
grant insert on table public.app_errors to anon, authenticated;
grant select on table public.app_errors to authenticated; -- RLS restricts reads to admins