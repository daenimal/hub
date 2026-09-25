-- 004_app_errors_rate_limit.sql
-- Hardening: the /api/log route and the server reporters are open to
-- anonymous clients, and the in-memory throttle in lib/observability/report.ts
-- is per-serverless-instance (unreliable on Vercel). This trigger caps how
-- many identical (source, message) rows may be inserted per window at the
-- database level, so a burst or a direct REST insert cannot flood the table.

create or replace function public.rate_limit_app_error()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count integer;
begin
  select count(*) into recent_count
  from public.app_errors
  where source = new.source
    and message = new.message
    and created_at > now() - interval '15 seconds';

  if recent_count >= 20 then
    return null; -- skip the insert silently, keeping the table small
  end if;

  return new;
end;
$$;

create trigger app_errors_rate_limit_before_insert
  before insert on public.app_errors
  for each row
  execute function public.rate_limit_app_error();