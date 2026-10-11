-- Reject explicit NULL lease durations before PostgreSQL three-valued logic
-- can bypass the range checks and create leases without a meaningful expiry.
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
  _token uuid := gen_random_uuid();
  _status text;
  _claimed uuid;
begin
  if _lease_seconds is null or _lease_seconds < 60 or _lease_seconds > 3600 then
    raise exception 'Invalid scheduler lease duration';
  end if;

  select status::text into _status
    from public.automations
   where id = _automation_id
   for update;

  if not found or _status <> 'live' then
    return null;
  end if;

  insert into public.scheduled_run_locks (automation_id, lock_token, locked_until, updated_at)
  values (_automation_id, _token, now() + make_interval(secs => _lease_seconds), now())
  on conflict (automation_id) do update
    set lock_token = excluded.lock_token,
        locked_until = excluded.locked_until,
        updated_at = now()
    where public.scheduled_run_locks.locked_until <= now()
  returning lock_token into _claimed;

  return _claimed;
end;
$$;

create or replace function public.claim_manual_automation(
  _automation_id uuid,
  _lease_seconds integer default 300
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _token uuid := gen_random_uuid();
  _status text;
  _claimed uuid;
begin
  if _lease_seconds is null or _lease_seconds < 60 or _lease_seconds > 900 then
    raise exception 'Invalid manual-run lease duration';
  end if;

  select status::text into _status
    from public.automations
   where id = _automation_id
   for update;

  if not found or _status <> 'live' then
    return null;
  end if;

  insert into public.scheduled_run_locks (automation_id, lock_token, locked_until, updated_at)
  values (_automation_id, _token, now() + make_interval(secs => _lease_seconds), now())
  on conflict (automation_id) do update
    set lock_token = excluded.lock_token,
        locked_until = excluded.locked_until,
        updated_at = now()
    where public.scheduled_run_locks.locked_until <= now()
  returning lock_token into _claimed;

  return _claimed;
end;
$$;

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
  if _lease_seconds is null or _lease_seconds < 60 or _lease_seconds > 900 then
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

revoke all on function public.claim_scheduled_automation(uuid, integer) from public, anon, authenticated;
revoke all on function public.claim_manual_automation(uuid, integer) from public, anon, authenticated;
revoke all on function public.heartbeat_manual_automation(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_scheduled_automation(uuid, integer) to service_role;
grant execute on function public.claim_manual_automation(uuid, integer) to service_role;
grant execute on function public.heartbeat_manual_automation(uuid, uuid, integer) to service_role;

comment on function public.claim_scheduled_automation(uuid, integer) is
  'Claims the shared automation lease for a scheduled run; rejects NULL or out-of-range lease duration.';
comment on function public.claim_manual_automation(uuid, integer) is
  'Claims the shared automation lease for a manual run; rejects NULL or out-of-range lease duration.';
comment on function public.heartbeat_manual_automation(uuid, uuid, integer) is
  'Fenced renewal of the shared automation lease; rejects NULL/out-of-range duration and stale or expired tokens.';
