-- A scheduled lease release must never clear the cadence cursor.
-- A NULL cursor can reset idempotency-key derivation and cause a scheduled
-- automation to enqueue the same cadence window again.
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
  'Token-fenced scheduled lease release; requires a non-NULL cadence cursor so release cannot reset schedule progress.';
