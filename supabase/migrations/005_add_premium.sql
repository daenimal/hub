-- 005_add_premium.sql
-- The premium tier becomes a first-class profile flag. The tool's advanced
-- settings + custom presets panel unlocks only when the account is premium;
-- being signed in alone no longer unlocks it.

alter table public.profiles
  add column if not exists premium boolean not null default false;

comment on column public.profiles.premium is
  'Premium tier flag: unlocks advanced conversion settings and custom presets.';

-- premium must never be writable by clients: the admin role changes it
-- through the service role / SQL only. The column-level UPDATE grant already
-- excludes it (grant update covers full_name, avatar_url, email only).