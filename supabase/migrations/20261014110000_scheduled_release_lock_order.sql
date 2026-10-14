-- Keep scheduled lease release in the same parent-first lock order as claims.
-- The old release path deleted the lease row before updating automations, which
-- could deadlock with a claimant holding automations while waiting on that lease.
create or replace function public.release_scheduled_automation(
  _automation_id uuid,
  _lock_token uuid,
  _last_run_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if _last_run_at is null then
    raise exception 'Scheduled run cursor timestamp is required';
  end if;

  -- Claims lock automations before touching scheduled_run_locks. Release must
  -- do the same, or it can hold the lease row while waiting for this parent row.
  perform 1
    from public.automations
   where id = _automation_id
   for update;
  if not found then
    return false;
  end if;

  delete from public.scheduled_run_locks
   where automation_id = _automation_id
     and lock_token = _lock_token;
  if not found then
    return false;
  end if;

  update public.automations
     set last_run_at = _last_run_at
   where id = _automation_id;
  return found;
end;
$$;

revoke all on function public.release_scheduled_automation(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.release_scheduled_automation(uuid, uuid, timestamptz) to service_role;

comment on function public.release_scheduled_automation(uuid, uuid, timestamptz) is
  'Token-fenced scheduled lease release with non-NULL cadence cursor and parent-first lock ordering to avoid deadlocks with lease claims.';
