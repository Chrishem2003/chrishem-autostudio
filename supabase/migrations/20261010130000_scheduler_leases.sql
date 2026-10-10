-- Prevent overlapping cron invocations from sending the same scheduled flow twice.
alter table public.automations
  add column if not exists schedule_lock_token uuid,
  add column if not exists schedule_lock_until timestamptz;

create index if not exists automations_live_schedule_lock_idx
  on public.automations (status, schedule_lock_until)
  where status = 'live';

create or replace function public.claim_scheduled_automation(
  _automation_id uuid,
  _lease_seconds integer default 900
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _token uuid;
begin
  if _lease_seconds < 60 or _lease_seconds > 3600 then
    raise exception 'Invalid scheduler lease duration';
  end if;

  update public.automations
     set schedule_lock_token = gen_random_uuid(),
         schedule_lock_until = now() + make_interval(secs => _lease_seconds)
   where id = _automation_id
     and status = 'live'
     and (schedule_lock_until is null or schedule_lock_until <= now())
  returning schedule_lock_token into _token;

  return _token;
end;
$$;

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
  update public.automations
     set schedule_lock_token = null,
         schedule_lock_until = null,
         last_run_at = _last_run_at
   where id = _automation_id
     and schedule_lock_token = _lock_token;

  return found;
end;
$$;

revoke all on function public.claim_scheduled_automation(uuid, integer) from public, anon, authenticated;
revoke all on function public.release_scheduled_automation(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.claim_scheduled_automation(uuid, integer) to service_role;
grant execute on function public.release_scheduled_automation(uuid, uuid, timestamptz) to service_role;
