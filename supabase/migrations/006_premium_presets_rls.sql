-- 006_premium_presets_rls.sql
-- 1) Enforce the premium tier at the database level for tool presets: writing
--    presets (create/update/delete) now requires profiles.premium = true,
--    mirroring the 3-tier principle already applied to the admin role
--    (client guard + proxy + RLS). Admins bypass the premium requirement.
-- 2) Index the app_errors rate-limit query (source, message, created_at) so a
--    growing table does not end up doing a seq-scan on every insert.

-- ---------------------------------------------------------------------------
-- Tool presets: premium-gated writes
-- ---------------------------------------------------------------------------

drop policy if exists "create_own_presets" on public.tool_presets;
drop policy if exists "update_own_presets" on public.tool_presets;
drop policy if exists "delete_own_presets" on public.tool_presets;

-- Authenticated premium users (or admins) create their own presets.
create policy "create_premium_or_admin_presets"
  on public.tool_presets
  for insert
  with check (
    auth.uid() is not null
    and user_id = auth.uid()
    and (
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.premium = true
      )
      or public.is_admin()
    )
  );

create policy "update_premium_or_admin_presets"
  on public.tool_presets
  for update
  using (
    user_id = auth.uid()
    and (
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.premium = true
      )
      or public.is_admin()
    )
  )
  with check (
    user_id = auth.uid()
    and (
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.premium = true
      )
      or public.is_admin()
    )
  );

create policy "delete_premium_or_admin_presets"
  on public.tool_presets
  for delete
  using (
    user_id = auth.uid()
    and (
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.premium = true
      )
      or public.is_admin()
    )
  );

-- ---------------------------------------------------------------------------
-- app_errors: index for the per-(source, message) rate-limit lookup
-- ---------------------------------------------------------------------------

create index if not exists app_errors_recent_idx
  on public.app_errors (source, message, created_at desc);