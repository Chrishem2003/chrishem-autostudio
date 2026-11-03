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
as $heartbeat_manual_automation$
begin
  if _lease_seconds < 60 or _lease_seconds > 900 then
    raise exception 'Invalid automation lease duration';
  end if;

  -- Match claim and stale-run recovery lock order: automation parent first,
  -- then the lease row. Recovery cannot race a heartbeat that renews ownership.
  perform 1
    from public.automations
   where id = _automation_id
   for update;
  if not found then
    return false;
  end if;

  update public.scheduled_run_locks
     set locked_until = clock_timestamp() + make_interval(secs => _lease_seconds),
         updated_at = clock_timestamp()
   where automation_id = _automation_id
     and lock_token = _lock_token
     and locked_until > clock_timestamp();

  return found;
end;
$heartbeat_manual_automation$;

revoke all on function public.heartbeat_manual_automation(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.heartbeat_manual_automation(uuid, uuid, integer) to service_role;

comment on function public.heartbeat_manual_automation(uuid, uuid, integer) is
  'Fenced renewal of the shared automation lease; stale or expired tokens cannot extend ownership.';
