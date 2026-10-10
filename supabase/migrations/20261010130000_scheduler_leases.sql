-- Prevent overlapping cron invocations from sending the same scheduled flow twice.
-- This lock table is service-role-only; normal authenticated clients cannot claim or extend leases.
create table if not exists public.scheduled_run_locks (
  automation_id uuid primary key references public.automations(id) on delete cascade,
  lock_token uuid not null,
  locked_until timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.scheduled_run_locks enable row level security;
revoke all on table public.scheduled_run_locks from public, anon, authenticated;
grant all on table public.scheduled_run_locks to service_role;

create index if not exists scheduled_run_locks_expiry_idx
  on public.scheduled_run_locks (locked_until);

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
  if _lease_seconds < 60 or _lease_seconds > 3600 then
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

revoke all on function public.claim_scheduled_automation(uuid, integer) from public, anon, authenticated;
revoke all on function public.release_scheduled_automation(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.claim_scheduled_automation(uuid, integer) to service_role;
grant execute on function public.release_scheduled_automation(uuid, uuid, timestamptz) to service_role;

-- Manual live runs share the same per-automation lease as the scheduler, so a
-- button click cannot race a scheduled trigger. Unlike the scheduler release,
-- manual release does not move the cadence cursor.
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
  if _lease_seconds < 60 or _lease_seconds > 900 then
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

create or replace function public.release_manual_automation(
  _automation_id uuid,
  _lock_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.scheduled_run_locks
   where automation_id = _automation_id
     and lock_token = _lock_token;
  return found;
end;
$$;

revoke all on function public.claim_manual_automation(uuid, integer) from public, anon, authenticated;
revoke all on function public.release_manual_automation(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_manual_automation(uuid, integer) to service_role;
grant execute on function public.release_manual_automation(uuid, uuid) to service_role;
