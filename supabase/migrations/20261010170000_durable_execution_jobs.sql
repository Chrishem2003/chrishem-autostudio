-- Durable execution queue foundation.
-- Expired worker leases are moved to needs_review, never blindly replayed:
-- a worker may have completed an external side effect before crashing.
create table if not exists public.execution_jobs (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.automations(id) on delete cascade,
  requested_by uuid references auth.users(id) on delete set null,
  trigger_type text not null check (trigger_type in ('manual', 'scheduled', 'webhook')),
  idempotency_key text not null check (length(idempotency_key) between 1 and 200),
  payload jsonb not null default '{}'::jsonb check (octet_length(payload::text) <= 65536),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'failed', 'needs_review', 'dead_letter')),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  available_at timestamptz not null default now(),
  worker_token uuid,
  locked_until timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (automation_id, idempotency_key),
  check (
    (status = 'running' and worker_token is not null and locked_until is not null)
    or (status <> 'running' and worker_token is null and locked_until is null)
  )
);

create index if not exists execution_jobs_claim_idx
  on public.execution_jobs (available_at, created_at)
  where status = 'queued';
create index if not exists execution_jobs_expired_lease_idx
  on public.execution_jobs (locked_until)
  where status = 'running';
create index if not exists execution_jobs_automation_history_idx
  on public.execution_jobs (automation_id, created_at desc);

alter table public.execution_jobs enable row level security;
revoke all on table public.execution_jobs from public, anon, authenticated;
grant all on table public.execution_jobs to service_role;

-- Idempotent enqueue: a repeated delivery returns the existing job rather than
-- creating a second run. Payloads are bounded to keep queue rows operationally safe.
create or replace function public.enqueue_execution_job(
  _automation_id uuid,
  _trigger_type text,
  _idempotency_key text,
  _payload jsonb default '{}'::jsonb,
  _requested_by uuid default null,
  _max_attempts integer default 3,
  _available_at timestamptz default now()
)
returns setof public.execution_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  if _trigger_type not in ('manual', 'scheduled', 'webhook') then
    raise exception 'Unsupported execution trigger';
  end if;
  if _idempotency_key is null or length(_idempotency_key) < 1 or length(_idempotency_key) > 200 then
    raise exception 'Invalid idempotency key';
  end if;
  if _max_attempts < 1 or _max_attempts > 10 then
    raise exception 'Invalid maximum attempt count';
  end if;
  if _payload is null or octet_length(_payload::text) > 65536 then
    raise exception 'Execution payload exceeds 64 KiB';
  end if;
  if not exists (
    select 1 from public.automations
     where id = _automation_id and status::text = 'live'
  ) then
    raise exception 'Automation is missing or not live';
  end if;

  return query
    insert into public.execution_jobs (
      automation_id, trigger_type, idempotency_key, payload,
      requested_by, max_attempts, available_at
    )
    values (
      _automation_id, _trigger_type, _idempotency_key, _payload,
      _requested_by, _max_attempts, coalesce(_available_at, now())
    )
    on conflict (automation_id, idempotency_key) do update
      set idempotency_key = excluded.idempotency_key
    returning *;
end;
$$;

-- A single worker atomically claims one ready job using SKIP LOCKED.
-- Expired running jobs are sent to needs_review, not re-executed automatically.
create or replace function public.claim_execution_job(_lease_seconds integer default 300)
returns setof public.execution_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  _token uuid := gen_random_uuid();
begin
  if _lease_seconds < 30 or _lease_seconds > 900 then
    raise exception 'Invalid execution worker lease duration';
  end if;

  update public.execution_jobs
     set status = 'needs_review',
         worker_token = null,
         locked_until = null,
         finished_at = now(),
         updated_at = now(),
         last_error = coalesce(last_error, 'Worker lease expired; external side effects must be checked before retry.')
   where status = 'running'
     and locked_until <= now();

  return query
    with candidate as (
      select id
        from public.execution_jobs
       where status = 'queued'
         and available_at <= now()
         and attempts < max_attempts
       order by available_at asc, created_at asc
       for update skip locked
       limit 1
    )
    update public.execution_jobs j
       set status = 'running',
           attempts = attempts + 1,
           worker_token = _token,
           locked_until = now() + make_interval(secs => _lease_seconds),
           started_at = now(),
           finished_at = null,
           updated_at = now(),
           last_error = null
      from candidate
     where j.id = candidate.id
    returning j.*;
end;
$$;

create or replace function public.heartbeat_execution_job(
  _job_id uuid,
  _worker_token uuid,
  _lease_seconds integer default 300
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if _lease_seconds < 30 or _lease_seconds > 900 then
    raise exception 'Invalid execution worker lease duration';
  end if;

  update public.execution_jobs
     set locked_until = now() + make_interval(secs => _lease_seconds),
         updated_at = now()
   where id = _job_id
     and status = 'running'
     and worker_token = _worker_token
     and locked_until > now();

  return found;
end;
$$;

-- Finalization is fenced by the current lease token. "queued" is permitted only
-- for an explicitly safe retry; uncertain side effects should use needs_review.
create or replace function public.finish_execution_job(
  _job_id uuid,
  _worker_token uuid,
  _status text,
  _error text default null,
  _retry_at timestamptz default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if _status not in ('succeeded', 'failed', 'queued', 'needs_review', 'dead_letter') then
    raise exception 'Invalid execution job final status';
  end if;

  update public.execution_jobs
     set status = case
           when _status in ('queued', 'failed') and attempts >= max_attempts then 'dead_letter'
           else _status
         end,
         worker_token = null,
         locked_until = null,
         finished_at = case when _status = 'queued' and attempts < max_attempts then null else now() end,
         available_at = case when _status = 'queued' and attempts < max_attempts then coalesce(_retry_at, now()) else available_at end,
         last_error = left(_error, 2000),
         updated_at = now()
   where id = _job_id
     and status = 'running'
     and worker_token = _worker_token
     and locked_until > now();

  return found;
end;
$$;

revoke all on function public.enqueue_execution_job(uuid, text, text, jsonb, uuid, integer, timestamptz) from public, anon, authenticated;
revoke all on function public.claim_execution_job(integer) from public, anon, authenticated;
revoke all on function public.heartbeat_execution_job(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.finish_execution_job(uuid, uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.enqueue_execution_job(uuid, text, text, jsonb, uuid, integer, timestamptz) to service_role;
grant execute on function public.claim_execution_job(integer) to service_role;
grant execute on function public.heartbeat_execution_job(uuid, uuid, integer) to service_role;
grant execute on function public.finish_execution_job(uuid, uuid, text, text, timestamptz) to service_role;

comment on table public.execution_jobs is
  'Durable execution queue. Expired running jobs require review and are never automatically replayed.';
comment on column public.execution_jobs.idempotency_key is
  'Caller-supplied stable delivery key; duplicate enqueue for the same automation returns the existing job.';
