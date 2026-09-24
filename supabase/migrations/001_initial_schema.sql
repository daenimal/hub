-- 001_initial_schema.sql
-- Initial schema: profiles table linked to auth.users, role-based RLS, is_admin().

-- ---------------------------------------------------------------------------
-- 1. profiles
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text,
  full_name  text,
  avatar_url text,
  role       text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Public profile and role for each auth.users row.';

-- ---------------------------------------------------------------------------
-- 2. is_admin() - re-used by RLS policies, admin checks, and role-based guards.
-- SECURITY DEFINER so the function bypasses RLS on profiles without recursion.
-- ---------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- 3. Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;

-- Users can read only their own profile.
create policy "users_select_own_profile"
  on public.profiles
  for select
  using (auth.uid() = id);

-- Users can update their own profile. writeable columns are restricted to
-- non-role columns via column-level GRANTs (see section 5).
create policy "users_update_own_profile"
  on public.profiles
  for update
  using (auth.uid() = id);

-- Admins can read and update every profile.
create policy "admins_read_all_profiles"
  on public.profiles
  for select
  using (public.is_admin());

create policy "admins_update_all_profiles"
  on public.profiles
  for update
  using (public.is_admin());

-- No INSERT/DELETE policies: profiles are created by the signup trigger and
-- removed by the FK cascade. Role changes go through the service role or a
-- dedicated SECURITY DEFINER function, never through a client INSERT/UPDATE.

-- ---------------------------------------------------------------------------
-- 4. updated_at maintenance
-- ---------------------------------------------------------------------------

create or replace function public.handle_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- 5. Column-level privileges (defense in depth for the role column)
-- ---------------------------------------------------------------------------

revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to anon, authenticated;
grant update (full_name, avatar_url, email) on table public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Auto-create a profile on signup
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();