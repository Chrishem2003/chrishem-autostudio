-- Renew the shared manual/scheduled automation lease only while its
-- current token is valid and the lease has not already expired.
create or replace function public.heartbeat_manual_automation(
  _automation_id uuid,
  _lock_token uuid,
  _lease_seconds integer default 300
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if _lease_seconds < 60 or _lease_seconds > 900 then
    raise exception 'Invalid automation lease duration';
  end if;

  update public.scheduled_run_locks
     set locked_until = now() + make_interval(secs => _lease_seconds),
         updated_at = now()
   where automation_id = _automation_id
     and lock_token = _lock_token
     and locked_until > now();

  return found;
end;
$$;

revoke all on function public.heartbeat_manual_automation(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.heartbeat_manual_automation(uuid, uuid, integer) to service_role;

comment on function public.heartbeat_manual_automation(uuid, uuid, integer) is
  'Fenced renewal of the shared automation lease; stale or expired tokens cannot extend ownership.';
