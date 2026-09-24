-- 003_hardening.sql
-- 1) Shared/per-user tool presets (D2).
-- 2) Sync profiles.email when auth.users.email changes (C1).
-- 3) DB-level sanitization of app_errors inserts (N2).

-- ---------------------------------------------------------------------------
-- Tool presets
-- ---------------------------------------------------------------------------

create table if not exists public.tool_presets (
  id         uuid primary key default gen_random_uuid(),
  tool_id    text not null,
  name       text not null,
  settings   jsonb not null default '{}'::jsonb,
  visibility text not null default 'private' check (visibility in ('private', 'public')),
  user_id    uuid references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.tool_presets
  is 'Named settings presets per tool; private ones belong to a user, public ones are shared.';

create index if not exists tool_presets_tool_idx on public.tool_presets (tool_id);
create index if not exists tool_presets_user_idx on public.tool_presets (user_id);
create index if not exists tool_presets_visibility_idx on public.tool_presets (visibility);

alter table public.tool_presets enable row level security;

-- Anyone can see public presets; users see their own.
create policy "read_public_or_own_presets"
  on public.tool_presets
  for select
  using (visibility = 'public' or user_id = auth.uid());

-- Authenticated users create their own presets.
create policy "create_own_presets"
  on public.tool_presets
  for insert
  with check (auth.uid() is not null and user_id = auth.uid());

create policy "update_own_presets"
  on public.tool_presets
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "delete_own_presets"
  on public.tool_presets
  for delete
  using (user_id = auth.uid());

revoke all on table public.tool_presets from anon;
revoke all on table public.tool_presets from authenticated;
grant select, insert, update, delete on table public.tool_presets to authenticated;

-- Bump updated_at on writes.
create or replace function public.touch_preset()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger tool_presets_touch_updated_at
  before update on public.tool_presets
  for each row
  execute function public.touch_preset();

-- ---------------------------------------------------------------------------
-- Email sync: auth.users.email  ->  profiles.email
-- ---------------------------------------------------------------------------

create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
    set email = new.email
    where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.sync_profile_email();

-- ---------------------------------------------------------------------------
-- DB-level app_errors sanitization (N2): mirror the server-side caps so
-- arbitrary REST inserts cannot push oversized/garbage payloads.
-- ---------------------------------------------------------------------------

create or replace function public.sanitize_app_error()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.message is null or btrim(new.message) = '' then
    raise exception 'app_errors.message must not be empty';
  end if;

  new.message   = left(new.message, 2000);
  new.digest    = case when new.digest is null then null else left(new.digest, 64) end;
  new.route     = case when new.route is null then null else left(new.route, 256) end;
  new.path      = case when new.path is null then null else left(new.path, 500) end;
  new.method    = case when new.method is null then null else left(new.method, 10) end;
  new.stack     = case when new.stack is null then null else left(new.stack, 8000) end;
  new.user_agent = case when new.user_agent is null then null else left(new.user_agent, 300) end;

  return new;
end;
$$;

create trigger app_errors_sanitize_before_insert
  before insert on public.app_errors
  for each row
  execute function public.sanitize_app_error();