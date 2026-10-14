-- Lease validity must be evaluated at the actual statement time, not the
-- transaction start time. PostgreSQL now() is stable for the whole transaction;
-- a finalizer that starts before expiry and waits on a row lock could otherwise
-- pass an expired lease predicate after the lock is released.
create or replace function public.claim_execution_job(_lease_seconds integer default 300)
returns setof public.execution_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  _token uuid := gen_random_uuid();
  _expired_job public.execution_jobs%rowtype;
begin
  if _lease_seconds is null or _lease_seconds < 30 or _lease_seconds > 900 then
    raise exception 'Invalid execution worker lease duration';
  end if;

  -- Skip rows another heartbeat/finalizer currently owns. Once a candidate is
  -- locked, re-check expiry with a fresh wall-clock read before parking it.
  for _expired_job in
    select *
      from public.execution_jobs
     where status = 'running'
       and locked_until <= clock_timestamp()
     for update skip locked
  loop
    if _expired_job.locked_until <= clock_timestamp() then
      update public.execution_jobs
         set status = 'needs_review',
             worker_token = null,
             locked_until = null,
             finished_at = clock_timestamp(),
             updated_at = clock_timestamp(),
             last_error = coalesce(last_error, 'Worker lease expired; external side effects must be checked before retry.')
       where id = _expired_job.id
         and status = 'running'
         and worker_token = _expired_job.worker_token
         and locked_until = _expired_job.locked_until;
    end if;
  end loop;

  return query
    with candidate as (
      select id
        from public.execution_jobs
       where status = 'queued'
         and available_at <= clock_timestamp()
         and attempts < max_attempts
       order by available_at asc, created_at asc
       for update skip locked
       limit 1
    )
    update public.execution_jobs j
       set status = 'running',
           attempts = attempts + 1,
           worker_token = _token,
           locked_until = clock_timestamp() + make_interval(secs => _lease_seconds),
           started_at = clock_timestamp(),
           finished_at = null,
           updated_at = clock_timestamp(),
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
as $heartbeat_job$
declare
  _job public.execution_jobs%rowtype;
begin
  if _lease_seconds is null or _lease_seconds < 30 or _lease_seconds > 900 then
    raise exception 'Invalid execution worker lease duration';
  end if;

  -- Lock first, then evaluate expiry. A WHERE predicate evaluated before a
  -- lock wait can be stale by the time PostgreSQL resumes the UPDATE.
  select * into _job
    from public.execution_jobs
   where id = _job_id
   for update;

  if not found
     or _job.status <> 'running'
     or _job.worker_token is distinct from _worker_token
     or _job.locked_until is null
     or _job.locked_until <= clock_timestamp() then
    return false;
  end if;

  update public.execution_jobs
     set locked_until = clock_timestamp() + make_interval(secs => _lease_seconds),
         updated_at = clock_timestamp()
   where id = _job_id
     and status = 'running'
     and worker_token = _worker_token;

  return found;
end;
$heartbeat_job$;


create or replace function public.attach_execution_job_run(
  _job_id uuid,
  _worker_token uuid,
  _run_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $attach_job_run$
declare
  _job public.execution_jobs%rowtype;
begin
  if _run_id is null then
    return false;
  end if;

  select * into _job
    from public.execution_jobs
   where id = _job_id
   for update;

  if not found
     or _job.status <> 'running'
     or _job.worker_token is distinct from _worker_token
     or _job.locked_until is null
     or _job.locked_until <= clock_timestamp()
     or (_job.run_id is not null and _job.run_id <> _run_id) then
    return false;
  end if;

  update public.execution_jobs j
     set run_id = _run_id,
         updated_at = clock_timestamp()
   where j.id = _job_id
     and j.status = 'running'
     and j.worker_token = _worker_token
     and (j.run_id is null or j.run_id = _run_id)
     and exists (
       select 1 from public.run_logs r
        where r.id = _run_id and r.automation_id = j.automation_id
     )
     and not exists (
       select 1 from public.execution_jobs other
        where other.run_id = _run_id and other.id <> j.id
     );

  return found;
end;
$attach_job_run$;


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
as $finish_execution_job$
declare
  _job public.execution_jobs%rowtype;
begin
  if _status is null or _status not in ('succeeded', 'failed', 'queued', 'needs_review', 'dead_letter') then
    raise exception 'Invalid execution job final status';
  end if;

  -- Serialize against heartbeat/recovery, then re-check the lease using a fresh
  -- wall-clock read after any row-lock wait has completed.
  select * into _job
    from public.execution_jobs
   where id = _job_id
   for update;

  if not found
     or _job.status <> 'running'
     or _job.worker_token is distinct from _worker_token
     or _job.locked_until is null
     or _job.locked_until <= clock_timestamp() then
    return false;
  end if;

  update public.execution_jobs j
     set status = case
           when _status in ('queued', 'failed') and attempts >= max_attempts then 'dead_letter'
           else _status
         end,
         worker_token = null,
         locked_until = null,
         finished_at = case when _status = 'queued' and attempts < max_attempts then null else clock_timestamp() end,
         available_at = case when _status = 'queued' and attempts < max_attempts then coalesce(_retry_at, clock_timestamp()) else available_at end,
         last_error = left(_error, 2000),
         updated_at = clock_timestamp()
   where j.id = _job_id
     and j.status = 'running'
     and j.worker_token = _worker_token
     and (
       _status <> 'succeeded'
       or (
         j.run_id is not null
         and exists (
           select 1 from public.run_logs r
            where r.id = j.run_id
              and r.status = 'success'
              and r.finished_at is not null
         )
       )
     );

  return found;
end;
$finish_execution_job$;



revoke all on function public.claim_execution_job(integer) from public, anon, authenticated;
revoke all on function public.heartbeat_execution_job(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.finish_execution_job(uuid, uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.claim_execution_job(integer) to service_role;
grant execute on function public.heartbeat_execution_job(uuid, uuid, integer) to service_role;
grant execute on function public.finish_execution_job(uuid, uuid, text, text, timestamptz) to service_role;

comment on function public.claim_execution_job(integer) is
  'Claims one ready queue job and parks expired worker leases for review using statement-time lease expiry.';
comment on function public.heartbeat_execution_job(uuid, uuid, integer) is
  'Renews only a matching unexpired worker lease; expiry is evaluated at statement time.';
comment on function public.finish_execution_job(uuid, uuid, text, text, timestamptz) is
  'Finalizes only a matching unexpired worker lease; expiry is evaluated at statement time.';
