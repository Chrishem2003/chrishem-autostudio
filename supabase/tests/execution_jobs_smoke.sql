\set ON_ERROR_STOP on

-- Authenticated clients may inspect their own execution history, but must not
-- fabricate, rewrite, or delete audit records. Server-side service_role retains
-- the write permissions required by guarded execution and recovery.
do $audit_check$
declare
  table_name text;
begin
  foreach table_name in array array['run_logs', 'run_step_logs'] loop
    if has_table_privilege('anon', format('public.%I', table_name), 'SELECT')
       or has_table_privilege('anon', format('public.%I', table_name), 'INSERT')
       or has_table_privilege('anon', format('public.%I', table_name), 'UPDATE')
       or has_table_privilege('anon', format('public.%I', table_name), 'DELETE') then
      raise exception 'anon retains access to execution audit table %', table_name;
    end if;
    if has_table_privilege('authenticated', format('public.%I', table_name), 'INSERT')
       or has_table_privilege('authenticated', format('public.%I', table_name), 'UPDATE')
       or has_table_privilege('authenticated', format('public.%I', table_name), 'DELETE') then
      raise exception 'authenticated retains write privileges on %', table_name;
    end if;
    if not has_table_privilege('authenticated', format('public.%I', table_name), 'SELECT') then
      raise exception 'authenticated lost read access to %', table_name;
    end if;
    if not has_table_privilege('service_role', format('public.%I', table_name), 'INSERT')
       or not has_table_privilege('service_role', format('public.%I', table_name), 'UPDATE')
       or not has_table_privilege('service_role', format('public.%I', table_name), 'DELETE') then
      raise exception 'service_role lost required write privileges on %', table_name;
    end if;
  end loop;

  if exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename in ('run_logs', 'run_step_logs')
       and 'authenticated' = any(roles)
       and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  ) then
    raise exception 'Authenticated execution-audit write policy remains enabled';
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'run_logs'
       and policyname = 'run_logs_select_own'
       and cmd = 'SELECT'
       and 'authenticated' = any(roles)
       and qual like '%owns_automation%'
  ) or not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'run_step_logs'
       and policyname = 'run_step_logs_select_own'
       and cmd = 'SELECT'
       and 'authenticated' = any(roles)
       and qual like '%owns_run%'
  ) then
    raise exception 'Owner-scoped authenticated execution-audit read policies are missing';
  end if;
end $audit_check$;

insert into auth.users (id)
values ('00000000-0000-4000-8000-000000000001')
on conflict do nothing;

insert into public.automations (id, status)
values ('00000000-0000-4000-8000-000000000002', 'live')
on conflict (id) do update set status = excluded.status;

do $$
declare
  first_job public.execution_jobs%rowtype;
  duplicate_job public.execution_jobs%rowtype;
  claimed public.execution_jobs%rowtype;
  expired_job public.execution_jobs%rowtype;
  dead_job public.execution_jobs%rowtype;
begin
  -- Shared scheduler/manual leases must reject NULL durations explicitly.
  begin
    perform public.claim_scheduled_automation(
      '00000000-0000-4000-8000-000000000002', null
    );
    raise exception 'Scheduled lease claim accepted NULL duration';
  exception when others then
    if sqlerrm <> 'Invalid scheduler lease duration' then raise; end if;
  end;

  begin
    perform public.claim_manual_automation(
      '00000000-0000-4000-8000-000000000002', null
    );
    raise exception 'Manual lease claim accepted NULL duration';
  exception when others then
    if sqlerrm <> 'Invalid manual-run lease duration' then raise; end if;
  end;

  begin
    perform public.heartbeat_manual_automation(
      '00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000099',
      null
    );
    raise exception 'Automation lease heartbeat accepted NULL duration';
  exception when others then
    if sqlerrm <> 'Invalid automation lease duration' then raise; end if;
  end;

  -- A heartbeat may renew only a current, unexpired automation lease.
  -- Expired and replaced tokens must never revive or extend stale ownership.
  declare
    old_token uuid;
    current_token uuid;
    renewed boolean;
    expired_until timestamptz;
  begin
    old_token := public.claim_manual_automation(
      '00000000-0000-4000-8000-000000000002', 300
    );
    if old_token is null then
      raise exception 'Could not claim heartbeat-fencing fixture';
    end if;

    update public.scheduled_run_locks
       set locked_until = now() - interval '1 second'
     where automation_id = '00000000-0000-4000-8000-000000000002'
       and lock_token = old_token;
    select locked_until into expired_until
      from public.scheduled_run_locks
     where automation_id = '00000000-0000-4000-8000-000000000002';

    renewed := public.heartbeat_manual_automation(
      '00000000-0000-4000-8000-000000000002', old_token, 300
    );
    if renewed is distinct from false then
      raise exception 'Expired automation lease heartbeat was accepted';
    end if;
    if (select locked_until from public.scheduled_run_locks
         where automation_id = '00000000-0000-4000-8000-000000000002')
       is distinct from expired_until then
      raise exception 'Expired automation lease heartbeat changed its expiry';
    end if;

    current_token := public.claim_manual_automation(
      '00000000-0000-4000-8000-000000000002', 300
    );
    if current_token is null or current_token = old_token then
      raise exception 'Expired automation lease was not reclaimed with a new token';
    end if;
    if public.heartbeat_manual_automation(
      '00000000-0000-4000-8000-000000000002', old_token, 300
    ) then
      raise exception 'Superseded automation token renewed the current lease';
    end if;
    if not public.heartbeat_manual_automation(
      '00000000-0000-4000-8000-000000000002', current_token, 300
    ) then
      raise exception 'Current automation token could not renew its active lease';
    end if;
    if not public.release_manual_automation(
      '00000000-0000-4000-8000-000000000002', current_token
    ) then
      raise exception 'Could not release heartbeat-fencing fixture';
    end if;
  end;

  -- Scheduled release must reject a NULL cadence cursor before releasing
  -- the lease; otherwise a caller could clear last_run_at and reset schedule progress.
  declare
    scheduled_token uuid;
  begin
    scheduled_token := public.claim_scheduled_automation(
      '00000000-0000-4000-8000-000000000002', 900
    );
    if scheduled_token is null then
      raise exception 'Could not claim scheduled lease fixture';
    end if;

    -- A stale scheduler token must not release the active lease or move the
    -- cadence cursor, even when the caller supplies an otherwise valid time.
    declare
      scheduled_cursor_before timestamptz;
    begin
      select last_run_at into scheduled_cursor_before
        from public.automations
       where id = '00000000-0000-4000-8000-000000000002';

      if public.release_scheduled_automation(
        '00000000-0000-4000-8000-000000000002', gen_random_uuid(), now()
      ) then
        raise exception 'Scheduled release accepted a stale lock token';
      end if;

      if not exists (
        select 1 from public.scheduled_run_locks
         where automation_id = '00000000-0000-4000-8000-000000000002'
           and lock_token = scheduled_token
           and locked_until > now()
      ) then
        raise exception 'Stale scheduled release altered the active lease';
      end if;

      if (select last_run_at from public.automations
           where id = '00000000-0000-4000-8000-000000000002')
         is distinct from scheduled_cursor_before then
        raise exception 'Stale scheduled release advanced the cadence cursor';
      end if;
    end;

    begin
      perform public.release_scheduled_automation(
        '00000000-0000-4000-8000-000000000002', scheduled_token, null
      );
      raise exception 'Scheduled release accepted NULL cadence cursor';
    exception when others then
      if sqlerrm <> 'Scheduled run cursor timestamp is required' then raise; end if;
    end;

    if not exists (
      select 1 from public.scheduled_run_locks
       where automation_id = '00000000-0000-4000-8000-000000000002'
         and lock_token = scheduled_token
         and locked_until > now()
    ) then
      raise exception 'NULL scheduled cursor release unexpectedly removed the lease';
    end if;

    if not public.release_scheduled_automation(
      '00000000-0000-4000-8000-000000000002', scheduled_token, now()
    ) then
      raise exception 'Scheduled release rejected a valid cursor timestamp';
    end if;
  end;

  -- Required scalar parameters must reject explicit NULL, not fall through
  -- PostgreSQL's three-valued IF logic and fail later with a constraint error.
  begin
    perform * from public.enqueue_execution_job(
      '00000000-0000-4000-8000-000000000002',
      null,
      'smoke-null-trigger',
      '{}'::jsonb,
      '00000000-0000-4000-8000-000000000001',
      3,
      now()
    );
    raise exception 'Enqueue accepted a NULL trigger type';
  exception when others then
    if sqlerrm <> 'Unsupported execution trigger' then raise; end if;
  end;

  begin
    perform * from public.enqueue_execution_job(
      '00000000-0000-4000-8000-000000000002',
      'manual',
      'smoke-null-max-attempts',
      '{}'::jsonb,
      '00000000-0000-4000-8000-000000000001',
      null,
      now()
    );
    raise exception 'Enqueue accepted NULL maximum attempts';
  exception when others then
    if sqlerrm <> 'Invalid maximum attempt count' then raise; end if;
  end;

  select * into first_job
    from public.enqueue_execution_job(
      '00000000-0000-4000-8000-000000000002',
      'manual',
      'smoke-idempotency-key',
      '{"source":"ci"}'::jsonb,
      '00000000-0000-4000-8000-000000000001',
      3,
      now()
    );

  select * into duplicate_job
    from public.enqueue_execution_job(
      '00000000-0000-4000-8000-000000000002',
      'manual',
      'smoke-idempotency-key',
      '{"source":"ci"}'::jsonb,
      '00000000-0000-4000-8000-000000000001',
      3,
      now()
    );

  if first_job.id is null or duplicate_job.id is distinct from first_job.id then
    raise exception 'Idempotent enqueue did not return the same job';
  end if;

  -- A duplicate key may replay the same logical request, not smuggle in
  -- different work while receiving the original job's ID.
  begin
    perform * from public.enqueue_execution_job(
      '00000000-0000-4000-8000-000000000002',
      'manual',
      'smoke-idempotency-key',
      '{"source":"different-intent"}'::jsonb,
      '00000000-0000-4000-8000-000000000001',
      3,
      now()
    );
    raise exception 'Conflicting idempotency replay unexpectedly succeeded';
  exception when others then
    if sqlerrm not like 'Idempotency key was reused with a different request%' then
      raise;
    end if;
  end;

  -- The same idempotency key must not alias a different trigger, actor, or
  -- retry policy, even when the payload happens to be identical.
  begin
    perform * from public.enqueue_execution_job(
      '00000000-0000-4000-8000-000000000002',
      'webhook',
      'smoke-idempotency-key',
      '{"source":"ci"}'::jsonb,
      '00000000-0000-4000-8000-000000000001',
      3,
      now()
    );
    raise exception 'Conflicting trigger replay unexpectedly succeeded';
  exception when others then
    if sqlerrm not like 'Idempotency key was reused with a different request%' then
      raise;
    end if;
  end;

  begin
    perform * from public.enqueue_execution_job(
      '00000000-0000-4000-8000-000000000002',
      'manual',
      'smoke-idempotency-key',
      '{"source":"ci"}'::jsonb,
      null,
      3,
      now()
    );
    raise exception 'Conflicting requester replay unexpectedly succeeded';
  exception when others then
    if sqlerrm not like 'Idempotency key was reused with a different request%' then
      raise;
    end if;
  end;

  begin
    perform * from public.enqueue_execution_job(
      '00000000-0000-4000-8000-000000000002',
      'manual',
      'smoke-idempotency-key',
      '{"source":"ci"}'::jsonb,
      '00000000-0000-4000-8000-000000000001',
      4,
      now()
    );
    raise exception 'Conflicting retry-policy replay unexpectedly succeeded';
  exception when others then
    if sqlerrm not like 'Idempotency key was reused with a different request%' then
      raise;
    end if;
  end;

  select * into claimed from public.claim_execution_job(300);
  if claimed.id is distinct from first_job.id or claimed.status <> 'running'
     or claimed.attempts <> 1 or claimed.worker_token is null then
    raise exception 'Claim did not return the expected running job';
  end if;

  if public.heartbeat_execution_job(claimed.id, gen_random_uuid(), 300) then
    raise exception 'Heartbeat accepted a stale worker token';
  end if;
  if not public.heartbeat_execution_job(claimed.id, claimed.worker_token, 300) then
    raise exception 'Heartbeat rejected the current worker token';
  end if;

  -- Explicit NULL must be rejected with the documented validation error.
  begin
    perform public.finish_execution_job(claimed.id, claimed.worker_token, null, null, null);
    raise exception 'Finalization accepted a NULL status';
  exception when others then
    if sqlerrm <> 'Invalid execution job final status' then raise; end if;
  end;

  -- A worker must not mark the queue successful before its audit run is
  -- attached and the run summary has confirmed successful persistence.
  if public.finish_execution_job(claimed.id, claimed.worker_token, 'succeeded', null, null) then
    raise exception 'Queue job succeeded without an associated audit run';
  end if;
  insert into public.run_logs (id, automation_id, status, started_at)
  values ('00000000-0000-4000-8000-000000000015',
          '00000000-0000-4000-8000-000000000002', 'running', now());
  if not public.attach_execution_job_run(
    claimed.id, claimed.worker_token, '00000000-0000-4000-8000-000000000015'
  ) then
    raise exception 'Could not attach success-path audit run';
  end if;
  if public.finish_execution_job(claimed.id, claimed.worker_token, 'succeeded', null, null) then
    raise exception 'Queue job succeeded while its audit run was still running';
  end if;
  update public.run_logs set status = 'succeeded', finished_at = now()
   where id = '00000000-0000-4000-8000-000000000015' and status = 'running';
  if not public.finish_execution_job(claimed.id, claimed.worker_token, 'succeeded', null, null) then
    raise exception 'Current worker could not finalize after confirmed audit success';
  end if;
  if public.finish_execution_job(claimed.id, claimed.worker_token, 'succeeded', null, null) then
    raise exception 'Finalization accepted a stale/reused worker token';
  end if;

  -- A job cannot borrow another automation's successful audit record.
  insert into public.automations (id, status)
  values ('00000000-0000-4000-8000-000000000003', 'live')
  on conflict (id) do update set status = excluded.status;
  insert into public.run_logs (id, automation_id, status, started_at, finished_at)
  values ('00000000-0000-4000-8000-000000000018',
          '00000000-0000-4000-8000-000000000003', 'succeeded', now(), now());
  select * into first_job
    from public.enqueue_execution_job(
      '00000000-0000-4000-8000-000000000002',
      'manual',
      'smoke-cross-automation-run',
      '{"source":"ci-cross-automation"}'::jsonb,
      '00000000-0000-4000-8000-000000000001',
      3,
      now()
    );
  select * into claimed from public.claim_execution_job(300);
  if claimed.id is distinct from first_job.id then
    raise exception 'Could not claim cross-automation association fixture';
  end if;
  if public.attach_execution_job_run(
    claimed.id, claimed.worker_token, '00000000-0000-4000-8000-000000000018'
  ) then
    raise exception 'Queue job attached an audit run from a different automation';
  end if;
  if not public.finish_execution_job(claimed.id, claimed.worker_token, 'failed', 'Association rejected', null) then
    raise exception 'Could not safely finalize cross-automation association fixture';
  end if;

  -- One audit run cannot be attached to multiple queue jobs, even for the same automation.
  select * into first_job
    from public.enqueue_execution_job(
      '00000000-0000-4000-8000-000000000002',
      'manual',
      'smoke-duplicate-run-link',
      '{"source":"ci-duplicate-run-link"}'::jsonb,
      '00000000-0000-4000-8000-000000000001',
      3,
      now()
    );
  select * into claimed from public.claim_execution_job(300);
  if claimed.id is distinct from first_job.id then
    raise exception 'Could not claim duplicate audit-run association fixture';
  end if;
  if public.attach_execution_job_run(
    claimed.id, claimed.worker_token, '00000000-0000-4000-8000-000000000015'
  ) then
    raise exception 'Audit run was attached to more than one queue job';
  end if;
  if not public.finish_execution_job(claimed.id, claimed.worker_token, 'failed', 'Duplicate association rejected', null) then
    raise exception 'Could not safely finalize duplicate association fixture';
  end if;

  -- A failed audit summary must never permit a queue success, but the same
  -- valid worker lease must still be able to record a truthful failed result.
  select * into first_job
    from public.enqueue_execution_job(
      '00000000-0000-4000-8000-000000000002',
      'manual',
      'smoke-failed-audit-summary',
      '{"source":"ci-failed-audit"}'::jsonb,
      '00000000-0000-4000-8000-000000000001',
      3,
      now()
    );
  select * into claimed from public.claim_execution_job(300);
  if claimed.id is distinct from first_job.id then
    raise exception 'Could not claim failed-audit fixture';
  end if;
  insert into public.run_logs (id, automation_id, status, started_at, finished_at)
  values ('00000000-0000-4000-8000-000000000016',
          '00000000-0000-4000-8000-000000000002', 'failed', now() - interval '1 second', now());
  if not public.attach_execution_job_run(
    claimed.id, claimed.worker_token, '00000000-0000-4000-8000-000000000016'
  ) then
    raise exception 'Could not attach failed-audit fixture';
  end if;
  if public.finish_execution_job(claimed.id, claimed.worker_token, 'succeeded', null, null) then
    raise exception 'Queue job succeeded despite a failed audit run';
  end if;
  if not public.finish_execution_job(claimed.id, claimed.worker_token, 'failed', 'Audit run failed', null) then
    raise exception 'Failed audit run prevented truthful queue failure finalization';
  end if;

  -- A succeeded status without finished_at is not confirmed persistence.
  select * into first_job
    from public.enqueue_execution_job(
      '00000000-0000-4000-8000-000000000002',
      'manual',
      'smoke-unfinished-audit-summary',
      '{"source":"ci-unfinished-audit"}'::jsonb,
      '00000000-0000-4000-8000-000000000001',
      3,
      now()
    );
  select * into claimed from public.claim_execution_job(300);
  if claimed.id is distinct from first_job.id then
    raise exception 'Could not claim unfinished-audit fixture';
  end if;
  insert into public.run_logs (id, automation_id, status, started_at, finished_at)
  values ('00000000-0000-4000-8000-000000000017',
          '00000000-0000-4000-8000-000000000002', 'succeeded', now(), null);
  if not public.attach_execution_job_run(
    claimed.id, claimed.worker_token, '00000000-0000-4000-8000-000000000017'
  ) then
    raise exception 'Could not attach unfinished-audit fixture';
  end if;
  if public.finish_execution_job(claimed.id, claimed.worker_token, 'succeeded', null, null) then
    raise exception 'Queue job succeeded without an audit completion timestamp';
  end if;
  if not public.finish_execution_job(claimed.id, claimed.worker_token, 'needs_review', 'Audit completion is unconfirmed', null) then
    raise exception 'Unconfirmed audit result could not be routed to manual review';
  end if;

  if has_function_privilege('anon', 'public.claim_execution_job(integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.claim_execution_job(integer)', 'EXECUTE') then
    raise exception 'Untrusted roles can execute the worker claim RPC';
  end if;

  -- Every privileged queue/lease/recovery RPC must remain service-role-only.
  if has_function_privilege('anon', 'public.enqueue_execution_job(uuid,text,text,jsonb,uuid,integer,timestamptz)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.enqueue_execution_job(uuid,text,text,jsonb,uuid,integer,timestamptz)', 'EXECUTE')
     or has_function_privilege('anon', 'public.heartbeat_execution_job(uuid,uuid,integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.heartbeat_execution_job(uuid,uuid,integer)', 'EXECUTE')
     or has_function_privilege('anon', 'public.finish_execution_job(uuid,uuid,text,text,timestamptz)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.finish_execution_job(uuid,uuid,text,text,timestamptz)', 'EXECUTE')
     or has_function_privilege('anon', 'public.attach_execution_job_run(uuid,uuid,uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.attach_execution_job_run(uuid,uuid,uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.claim_manual_automation(uuid,integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.claim_manual_automation(uuid,integer)', 'EXECUTE')
     or has_function_privilege('anon', 'public.claim_scheduled_automation(uuid,integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.claim_scheduled_automation(uuid,integer)', 'EXECUTE')
     or has_function_privilege('anon', 'public.heartbeat_manual_automation(uuid,uuid,integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.heartbeat_manual_automation(uuid,uuid,integer)', 'EXECUTE')
     or has_function_privilege('anon', 'public.release_manual_automation(uuid,uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.release_manual_automation(uuid,uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.release_scheduled_automation(uuid,uuid,timestamptz)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.release_scheduled_automation(uuid,uuid,timestamptz)', 'EXECUTE')
     or has_function_privilege('anon', 'public.reconcile_stale_execution_run(uuid,uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.reconcile_stale_execution_run(uuid,uuid)', 'EXECUTE') then
    raise exception 'Untrusted roles can execute a privileged queue, lease, or recovery RPC';
  end if;

  if not has_function_privilege('service_role', 'public.enqueue_execution_job(uuid,text,text,jsonb,uuid,integer,timestamptz)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.claim_execution_job(integer)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.heartbeat_execution_job(uuid,uuid,integer)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.finish_execution_job(uuid,uuid,text,text,timestamptz)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.attach_execution_job_run(uuid,uuid,uuid)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.claim_manual_automation(uuid,integer)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.claim_scheduled_automation(uuid,integer)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.heartbeat_manual_automation(uuid,uuid,integer)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.release_manual_automation(uuid,uuid)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.release_scheduled_automation(uuid,uuid,timestamptz)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.reconcile_stale_execution_run(uuid,uuid)', 'EXECUTE') then
    raise exception 'Service role cannot execute a required queue, lease, or recovery RPC';
  end if;

  -- Ensure the migrations leave row-level security enabled as defense in depth.
  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'execution_jobs'
      and c.relrowsecurity
  ) or not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'scheduled_run_locks'
      and c.relrowsecurity
  ) then
    raise exception 'Row-level security is disabled for a protected queue or lease table';
  end if;

  -- RLS is defense in depth: untrusted roles must have no direct table
  -- privileges, while the server-side service role needs the queue/lease tables.
  if has_table_privilege('anon', 'public.execution_jobs', 'SELECT')
     or has_table_privilege('anon', 'public.execution_jobs', 'INSERT')
     or has_table_privilege('anon', 'public.execution_jobs', 'UPDATE')
     or has_table_privilege('anon', 'public.execution_jobs', 'DELETE')
     or has_table_privilege('authenticated', 'public.execution_jobs', 'SELECT')
     or has_table_privilege('authenticated', 'public.execution_jobs', 'INSERT')
     or has_table_privilege('authenticated', 'public.execution_jobs', 'UPDATE')
     or has_table_privilege('authenticated', 'public.execution_jobs', 'DELETE')
     or has_table_privilege('anon', 'public.scheduled_run_locks', 'SELECT')
     or has_table_privilege('anon', 'public.scheduled_run_locks', 'INSERT')
     or has_table_privilege('anon', 'public.scheduled_run_locks', 'UPDATE')
     or has_table_privilege('anon', 'public.scheduled_run_locks', 'DELETE')
     or has_table_privilege('authenticated', 'public.scheduled_run_locks', 'SELECT')
     or has_table_privilege('authenticated', 'public.scheduled_run_locks', 'INSERT')
     or has_table_privilege('authenticated', 'public.scheduled_run_locks', 'UPDATE')
     or has_table_privilege('authenticated', 'public.scheduled_run_locks', 'DELETE') then
    raise exception 'Untrusted roles have direct access to a protected queue or lease table';
  end if;

  if not has_table_privilege('service_role', 'public.execution_jobs', 'SELECT')
     or not has_table_privilege('service_role', 'public.execution_jobs', 'INSERT')
     or not has_table_privilege('service_role', 'public.execution_jobs', 'UPDATE')
     or not has_table_privilege('service_role', 'public.execution_jobs', 'DELETE')
     or not has_table_privilege('service_role', 'public.scheduled_run_locks', 'SELECT')
     or not has_table_privilege('service_role', 'public.scheduled_run_locks', 'INSERT')
     or not has_table_privilege('service_role', 'public.scheduled_run_locks', 'UPDATE')
     or not has_table_privilege('service_role', 'public.scheduled_run_locks', 'DELETE') then
    raise exception 'Service role is missing required queue or lease table privileges';
  end if;

  select * into expired_job
    from public.enqueue_execution_job(
      '00000000-0000-4000-8000-000000000002',
      'scheduled',
      'smoke-expired-lease',
      '{}'::jsonb,
      null,
      3,
      now()
    );
  select * into claimed from public.claim_execution_job(300);
  if claimed.id is distinct from expired_job.id then
    raise exception 'Could not claim the expired-lease fixture';
  end if;
  insert into public.run_logs (id, automation_id, status, started_at)
  values
    ('00000000-0000-4000-8000-000000000010',
     '00000000-0000-4000-8000-000000000002', 'running', now() - interval '2 minutes'),
    ('00000000-0000-4000-8000-000000000012',
     '00000000-0000-4000-8000-000000000002', 'running', now() - interval '2 minutes');
  insert into public.run_step_logs (id, run_id, status, outcome_state)
  values
    ('00000000-0000-4000-8000-000000000011',
     '00000000-0000-4000-8000-000000000010', 'running', 'uncertain'),
    ('00000000-0000-4000-8000-000000000013',
     '00000000-0000-4000-8000-000000000010', 'running', 'uncertain'),
    ('00000000-0000-4000-8000-000000000018',
     '00000000-0000-4000-8000-000000000010', 'failed', 'uncertain'),
    ('00000000-0000-4000-8000-000000000014',
     '00000000-0000-4000-8000-000000000012', 'running', 'uncertain');
  update public.run_step_logs
     set error_detail = 'preexisting terminal record'
   where id = '00000000-0000-4000-8000-000000000018';

  if public.attach_execution_job_run(
    expired_job.id, gen_random_uuid(), '00000000-0000-4000-8000-000000000010'
  ) then
    raise exception 'Audit run attachment accepted a stale worker token';
  end if;
  if not public.attach_execution_job_run(
    expired_job.id, claimed.worker_token, '00000000-0000-4000-8000-000000000010'
  ) then
    raise exception 'Current worker could not attach its audit run';
  end if;
  -- A retry of the same association is safe, but a different run must never replace it.
  if not public.attach_execution_job_run(
    expired_job.id, claimed.worker_token, '00000000-0000-4000-8000-000000000010'
  ) then
    raise exception 'Idempotent audit run attachment retry was rejected';
  end if;
  if public.attach_execution_job_run(
    expired_job.id, claimed.worker_token, '00000000-0000-4000-8000-000000000012'
  ) then
    raise exception 'Worker changed an already-associated audit run';
  end if;
  update public.execution_jobs
     set locked_until = now() - interval '1 second'
   where id = expired_job.id;
  if public.heartbeat_execution_job(expired_job.id, claimed.worker_token, 300) then
    raise exception 'Heartbeat renewed an already-expired worker lease';
  end if;
  if public.finish_execution_job(expired_job.id, claimed.worker_token, 'succeeded', null, null) then
    raise exception 'Expired worker lease was allowed to finalize the job';
  end if;
  perform * from public.claim_execution_job(300);
  select * into expired_job from public.execution_jobs where id = expired_job.id;
  if expired_job.status <> 'needs_review' or expired_job.worker_token is not null then
    raise exception 'Expired lease was not safely moved to needs_review';
  end if;

  -- A worker that resumes after recovery must not overwrite the safety hold,
  -- even if it still presents the token from its original claim.
  if public.finish_execution_job(
    expired_job.id, claimed.worker_token, 'failed',
    'Late stale-worker finalization must be rejected', null
  ) then
    raise exception 'Expired worker overwrote a recovered needs_review job';
  end if;
  if (select status from public.execution_jobs where id = expired_job.id) <> 'needs_review' then
    raise exception 'Late stale-worker finalization changed the recovered queue status';
  end if;
  if (select status from public.run_logs where id = '00000000-0000-4000-8000-000000000010') <> 'failed' then
    raise exception 'Late stale-worker finalization changed the reconciled audit run';
  end if;

  -- needs_review is a terminal safety hold, not a retry queue. Repeated
  -- claims must not replay a job whose external side effect may be uncertain.
  if exists (
    select 1 from public.claim_execution_job(300) where id = expired_job.id
  ) then
    raise exception 'needs_review job was automatically claimed again';
  end if;
  if (select status from public.execution_jobs where id = expired_job.id) <> 'needs_review'
     or (select attempts from public.execution_jobs where id = expired_job.id) <> expired_job.attempts then
    raise exception 'Repeated claim changed a needs_review job or its attempt count';
  end if;
  if public.attach_execution_job_run(
    expired_job.id, claimed.worker_token, '00000000-0000-4000-8000-000000000012'
  ) then
    raise exception 'Audit run attachment accepted a job after lease expiration';
  end if;
  if (select status from public.run_logs where id = '00000000-0000-4000-8000-000000000010') <> 'failed'
     or (select finished_at from public.run_logs where id = '00000000-0000-4000-8000-000000000010') is null then
    raise exception 'Expired queue lease did not close its associated audit run';
  end if;
  if exists (
    select 1 from public.run_step_logs
     where run_id = '00000000-0000-4000-8000-000000000010'
       and id in ('00000000-0000-4000-8000-000000000011',
                  '00000000-0000-4000-8000-000000000013')
       and (status <> 'failed' or outcome_state <> 'uncertain')
  ) or (select count(*) from public.run_step_logs
         where run_id = '00000000-0000-4000-8000-000000000010') <> 3 then
    raise exception 'Expired queue lease did not preserve every in-flight step as uncertain';
  end if;
  if (select status from public.run_step_logs
       where id = '00000000-0000-4000-8000-000000000018') <> 'failed'
     or (select error_detail from public.run_step_logs
          where id = '00000000-0000-4000-8000-000000000018') <> 'preexisting terminal record' then
    raise exception 'Expired queue recovery overwrote a step that was already terminal';
  end if;
  if (select status from public.run_logs where id = '00000000-0000-4000-8000-000000000012') <> 'running'
     or (select status from public.run_step_logs where id = '00000000-0000-4000-8000-000000000014') <> 'running' then
    raise exception 'Expired queue lease modified an unrelated run or its step';
  end if;


  -- The shared automation lease can be renewed only by its live owner.
  insert into public.scheduled_run_locks (automation_id, lock_token, locked_until)
  values ('00000000-0000-4000-8000-000000000002',
          '00000000-0000-4000-8000-000000000099', now() + interval '5 minutes')
  on conflict (automation_id) do update
    set lock_token = excluded.lock_token, locked_until = excluded.locked_until;
  if not public.heartbeat_manual_automation(
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000099',
    300
  ) then
    raise exception 'Current automation lease owner could not renew its lease';
  end if;
  if public.heartbeat_manual_automation(
    '00000000-0000-4000-8000-000000000002',
    gen_random_uuid(),
    300
  ) then
    raise exception 'Automation lease heartbeat accepted a stale token';
  end if;
  update public.scheduled_run_locks set locked_until = now() - interval '1 second'
   where automation_id = '00000000-0000-4000-8000-000000000002';
  if public.heartbeat_manual_automation(
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000099',
    300
  ) then
    raise exception 'Automation lease heartbeat renewed an expired lease';
  end if;
  update public.scheduled_run_locks set locked_until = now() + interval '5 minutes'
   where automation_id = '00000000-0000-4000-8000-000000000002';

  -- Stale manual/scheduled reconciliation is atomic and lease-aware.
  insert into public.scheduled_run_locks (automation_id, lock_token, locked_until)
  values ('00000000-0000-4000-8000-000000000002',
          '00000000-0000-4000-8000-000000000099', now() + interval '5 minutes')
  on conflict (automation_id) do update
    set lock_token = excluded.lock_token, locked_until = excluded.locked_until;
  insert into public.run_logs (id, automation_id, status, started_at, trigger_type)
  values ('00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000002','running',now()-interval '30 minutes','manual'),
         ('00000000-0000-4000-8000-000000000022','00000000-0000-4000-8000-000000000002','running',now()-interval '30 minutes','schedule'),
         ('00000000-0000-4000-8000-000000000024','00000000-0000-4000-8000-000000000002','running',now()-interval '2 minutes','manual');
  insert into public.run_step_logs (id, run_id, status, outcome_state, error_detail)
  values ('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000020','running','uncertain',null),
         ('00000000-0000-4000-8000-000000000023','00000000-0000-4000-8000-000000000022','running','uncertain',null),
         ('00000000-0000-4000-8000-000000000025','00000000-0000-4000-8000-000000000020','succeeded','confirmed','preexisting successful step'),
         ('00000000-0000-4000-8000-000000000029','00000000-0000-4000-8000-000000000024','running','uncertain','young run must remain untouched');
  -- Old webhook-triggered runs are outside this recovery contract. Do not
  -- accidentally sweep non-manual/non-scheduled execution types into it.
  insert into public.run_logs (id, automation_id, status, started_at, trigger_type)
  values ('00000000-0000-4000-8000-000000000028','00000000-0000-4000-8000-000000000002','running',now()-interval '30 minutes','webhook');
  if public.reconcile_stale_execution_run('00000000-0000-4000-8000-000000000028', null) <> 'unsupported_trigger' then
    raise exception 'Stale-run reconciliation accepted an unsupported webhook trigger';
  end if;
  if (select status from public.run_logs where id = '00000000-0000-4000-8000-000000000028') <> 'running'
     or (select finished_at from public.run_logs where id = '00000000-0000-4000-8000-000000000028') is not null then
    raise exception 'Unsupported webhook run was modified by stale-run recovery';
  end if;

  insert into public.run_logs (id, automation_id, status, started_at, finished_at, trigger_type)
  values ('00000000-0000-4000-8000-000000000026','00000000-0000-4000-8000-000000000002','succeeded',now()-interval '30 minutes',now()-interval '29 minutes','manual');
  insert into public.run_step_logs (id, run_id, status, outcome_state, error_detail)
  values ('00000000-0000-4000-8000-000000000027','00000000-0000-4000-8000-000000000026','succeeded','confirmed','terminal successful run');
  if public.reconcile_stale_execution_run('00000000-0000-4000-8000-000000000026', null) <> 'not_running' then
    raise exception 'Stale-run reconciliation accepted a parent run that was already successful';
  end if;
  if (select status from public.run_logs where id = '00000000-0000-4000-8000-000000000026') <> 'succeeded'
     or (select status from public.run_step_logs where id = '00000000-0000-4000-8000-000000000027') <> 'succeeded'
     or (select error_detail from public.run_step_logs where id = '00000000-0000-4000-8000-000000000027') <> 'terminal successful run' then
    raise exception 'Stale-run reconciliation mutated a terminal successful run or its history';
  end if;
  if public.reconcile_stale_execution_run('00000000-0000-4000-8000-000000000020', null) <> 'active_lease' then
    raise exception 'Stale-run reconciliation ignored an active automation lease';
  end if;
  if public.reconcile_stale_execution_run(
    '00000000-0000-4000-8000-000000000020', '00000000-0000-4000-8000-000000000098'
  ) <> 'active_lease' then
    raise exception 'Stale-run reconciliation accepted a wrong token while a lease was active';
  end if;
  if public.reconcile_stale_execution_run('00000000-0000-4000-8000-000000000024', null) <> 'not_stale' then
    raise exception 'Stale-run reconciliation accepted a run inside the safety window';
  end if;
  if (select status from public.run_logs where id = '00000000-0000-4000-8000-000000000024') <> 'running'
     or (select finished_at from public.run_logs where id = '00000000-0000-4000-8000-000000000024') is not null
     or (select status from public.run_step_logs where id = '00000000-0000-4000-8000-000000000029') <> 'running'
     or (select outcome_state from public.run_step_logs where id = '00000000-0000-4000-8000-000000000029') <> 'uncertain'
     or (select error_detail from public.run_step_logs where id = '00000000-0000-4000-8000-000000000029') <> 'young run must remain untouched' then
    raise exception 'Not-stale result modified parent or in-flight step history';
  end if;
  if public.reconcile_stale_execution_run('00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000099') <> 'reconciled' then
    raise exception 'Lease owner could not atomically reconcile a stale manual run';
  end if;
  if (select status from public.run_logs where id = '00000000-0000-4000-8000-000000000020') <> 'failed'
     or (select outcome_state from public.run_step_logs where id = '00000000-0000-4000-8000-000000000021') <> 'uncertain' then
    raise exception 'Stale-run reconciliation failed to preserve uncertain outcomes';
  end if;
  if (select status from public.run_step_logs where id = '00000000-0000-4000-8000-000000000025') <> 'succeeded'
     or (select outcome_state from public.run_step_logs where id = '00000000-0000-4000-8000-000000000025') <> 'confirmed'
     or (select error_detail from public.run_step_logs where id = '00000000-0000-4000-8000-000000000025') <> 'preexisting successful step' then
    raise exception 'Stale-run reconciliation overwrote an already-terminal step';
  end if;
  -- Recovery may be retried by overlapping scheduler invocations. Once closed,
  -- the run must remain closed and the original terminal history must remain intact.
  if public.reconcile_stale_execution_run('00000000-0000-4000-8000-000000000020', null) <> 'not_running' then
    raise exception 'Repeated stale-run reconciliation did not remain idempotent';
  end if;
  if (select status from public.run_logs where id = '00000000-0000-4000-8000-000000000020') <> 'failed'
     or (select status from public.run_step_logs where id = '00000000-0000-4000-8000-000000000025') <> 'succeeded'
     or (select error_detail from public.run_step_logs where id = '00000000-0000-4000-8000-000000000025') <> 'preexisting successful step' then
    raise exception 'Repeated stale-run reconciliation mutated closed audit history';
  end if;
  if public.reconcile_stale_execution_run('00000000-0000-4000-8000-000000000022', null) <> 'active_lease' then
    raise exception 'Scheduled stale-run reconciliation ignored the active lease';
  end if;
  update public.scheduled_run_locks set locked_until = now() - interval '1 second'
   where automation_id = '00000000-0000-4000-8000-000000000002';
  if public.reconcile_stale_execution_run(
    '00000000-0000-4000-8000-000000000022', '00000000-0000-4000-8000-000000000099'
  ) <> 'lease_not_owned' then
    raise exception 'Expired lease token was accepted for stale-run reconciliation';
  end if;
  if public.reconcile_stale_execution_run('00000000-0000-4000-8000-000000000022', null) <> 'reconciled' then
    raise exception 'Expired lease did not permit safe stale-run reconciliation';
  end if;
  if has_function_privilege('anon', 'public.reconcile_stale_execution_run(uuid, uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.reconcile_stale_execution_run(uuid, uuid)', 'EXECUTE') then
    raise exception 'Untrusted roles can invoke stale-run reconciliation RPC';
  end if;

  -- Explicit NULL bypasses ordinary range comparisons in SQL unless
  -- checked separately; neither queue RPC may create an unleased running job.
  begin
    perform * from public.claim_execution_job(null);
    raise exception 'Claim accepted a NULL lease duration';
  exception when others then
    if sqlerrm <> 'Invalid execution worker lease duration' then raise; end if;
  end;
  begin
    perform public.heartbeat_execution_job(
      '00000000-0000-4000-8000-000000000099',
      gen_random_uuid(),
      null
    );
    raise exception 'Heartbeat accepted a NULL lease duration';
  exception when others then
    if sqlerrm <> 'Invalid execution worker lease duration' then raise; end if;
  end;
  begin
    perform public.heartbeat_execution_job(
      '00000000-0000-4000-8000-000000000099',
      gen_random_uuid(),
      901
    );
    raise exception 'Heartbeat accepted a lease above the maximum';
  exception when others then
    if sqlerrm <> 'Invalid execution worker lease duration' then raise; end if;
  end;

  -- Reject invalid worker lease bounds before any queue state can change.
  begin
    perform * from public.claim_execution_job(29);
    raise exception 'Claim accepted a lease below the minimum';
  exception when others then
    if sqlerrm <> 'Invalid execution worker lease duration' then raise; end if;
  end;
  begin
    perform * from public.claim_execution_job(901);
    raise exception 'Claim accepted a lease above the maximum';
  exception when others then
    if sqlerrm <> 'Invalid execution worker lease duration' then raise; end if;
  end;
  begin
    perform public.heartbeat_execution_job(
      '00000000-0000-4000-8000-000000000099',
      gen_random_uuid(),
      29
    );
    raise exception 'Heartbeat accepted a lease below the minimum';
  exception when others then
    if sqlerrm <> 'Invalid execution worker lease duration' then raise; end if;
  end;

  -- Explicit NULL values must not bypass trigger and retry-limit validation.
  begin
    perform * from public.enqueue_execution_job(
      '00000000-0000-4000-8000-000000000002', null, 'smoke-null-trigger', '{}'::jsonb, null, 3, now()
    );
    raise exception 'NULL trigger unexpectedly enqueued';
  exception when others then
    if sqlerrm <> 'Unsupported execution trigger' then raise; end if;
  end;
  begin
    perform * from public.enqueue_execution_job(
      '00000000-0000-4000-8000-000000000002', 'manual', 'smoke-null-retry-limit', '{}'::jsonb, null, null, now()
    );
    raise exception 'NULL retry limit unexpectedly enqueued';
  exception when others then
    if sqlerrm <> 'Invalid maximum attempt count' then raise; end if;
  end;

  -- Invalid trigger types, retry limits, and oversized payloads must not
  -- create queue rows or bypass the database's enqueue contract.
  begin
    perform * from public.enqueue_execution_job(
      '00000000-0000-4000-8000-000000000002',
      'unknown',
      'smoke-invalid-trigger',
      '{}'::jsonb,
      null,
      3,
      now()
    );
    raise exception 'Unsupported trigger unexpectedly enqueued';
  exception when others then
    if sqlerrm <> 'Unsupported execution trigger' then raise; end if;
  end;
  begin
    perform * from public.enqueue_execution_job(
      '00000000-0000-4000-8000-000000000002',
      'manual',
      'smoke-invalid-retry-limit',
      '{}'::jsonb,
      null,
      11,
      now()
    );
    raise exception 'Out-of-range retry limit unexpectedly enqueued';
  exception when others then
    if sqlerrm <> 'Invalid maximum attempt count' then raise; end if;
  end;
  begin
    perform * from public.enqueue_execution_job(
      '00000000-0000-4000-8000-000000000002',
      'manual',
      'smoke-oversized-payload',
      jsonb_build_object('payload', repeat('x', 65537)),
      null,
      3,
      now()
    );
    raise exception 'Oversized payload unexpectedly enqueued';
  exception when others then
    if sqlerrm <> 'Execution payload exceeds 64 KiB' then raise; end if;
  end;

  -- Shared manual/scheduled lease RPCs enforce their own bounded durations.
  begin
    perform public.claim_manual_automation('00000000-0000-4000-8000-000000000002', 59);
    raise exception 'Manual lease accepted a duration below the minimum';
  exception when others then
    if sqlerrm <> 'Invalid manual-run lease duration' then raise; end if;
  end;
  begin
    perform public.claim_manual_automation('00000000-0000-4000-8000-000000000002', 901);
    raise exception 'Manual lease accepted a duration above the maximum';
  exception when others then
    if sqlerrm <> 'Invalid manual-run lease duration' then raise; end if;
  end;
  begin
    perform public.claim_scheduled_automation('00000000-0000-4000-8000-000000000002', 59);
    raise exception 'Scheduled lease accepted a duration below the minimum';
  exception when others then
    if sqlerrm <> 'Invalid scheduler lease duration' then raise; end if;
  end;
  begin
    perform public.claim_scheduled_automation('00000000-0000-4000-8000-000000000002', 3601);
    raise exception 'Scheduled lease accepted a duration above the maximum';
  exception when others then
    if sqlerrm <> 'Invalid scheduler lease duration' then raise; end if;
  end;

  -- A stale release token must not clear a current manual lease or change the
  -- schedule cursor; manual release itself must not advance that cursor either.
  declare
    manual_token uuid;
    cursor_before timestamptz;
  begin
    select last_run_at into cursor_before
      from public.automations
     where id = '00000000-0000-4000-8000-000000000002';

    manual_token := public.claim_manual_automation(
      '00000000-0000-4000-8000-000000000002', 300
    );
    if manual_token is null then
      raise exception 'Could not claim manual lease fixture';
    end if;

    if public.release_manual_automation(
      '00000000-0000-4000-8000-000000000002', gen_random_uuid()
    ) then
      raise exception 'Manual lease accepted a stale release token';
    end if;
    if not exists (
      select 1 from public.scheduled_run_locks
       where automation_id = '00000000-0000-4000-8000-000000000002'
         and lock_token = manual_token
         and locked_until > now()
    ) then
      raise exception 'Stale release token altered the current lease';
    end if;
    if (select last_run_at from public.automations
         where id = '00000000-0000-4000-8000-000000000002')
       is distinct from cursor_before then
      raise exception 'Stale manual release changed the schedule cursor';
    end if;
    if not public.release_manual_automation(
      '00000000-0000-4000-8000-000000000002', manual_token
    ) then
      raise exception 'Current manual lease token could not release its lease';
    end if;
    if (select last_run_at from public.automations
         where id = '00000000-0000-4000-8000-000000000002')
       is distinct from cursor_before then
      raise exception 'Manual release unexpectedly advanced the schedule cursor';
    end if;
  end;

  select * into dead_job
    from public.enqueue_execution_job(
      '00000000-0000-4000-8000-000000000002',
      'manual',
      'smoke-dead-letter',
      '{}'::jsonb,
      null,
      1,
      now()
    );
  select * into claimed from public.claim_execution_job(300);
  if claimed.id is distinct from dead_job.id then
    raise exception 'Could not claim dead-letter fixture';
  end if;
  if not public.finish_execution_job(claimed.id, claimed.worker_token, 'queued', 'retry exhausted', now()) then
    raise exception 'Could not finalize retry-exhausted fixture';
  end if;
  select * into dead_job from public.execution_jobs where id = dead_job.id;
  if dead_job.status <> 'dead_letter' then
    raise exception 'Retry-exhausted job was not moved to dead_letter';
  end if;
end
$$;

-- Privilege contract: every sensitive queue/lease RPC is service-role-only.
-- Keep this as a migration smoke assertion so a later CREATE OR REPLACE cannot
-- silently restore PostgreSQL's default PUBLIC EXECUTE grant.
do $privilege_check$
declare
  signature text;
  protected_signatures text[] := array[
    'public.enqueue_execution_job(uuid, text, text, jsonb, uuid, integer, timestamptz)',
    'public.claim_execution_job(integer)',
    'public.heartbeat_execution_job(uuid, uuid, integer)',
    'public.finish_execution_job(uuid, uuid, text, text, timestamptz)',
    'public.attach_execution_job_run(uuid, uuid, uuid)',
    'public.reconcile_stale_execution_run(uuid, uuid)',
    'public.claim_scheduled_automation(uuid, integer)',
    'public.release_scheduled_automation(uuid, uuid, timestamptz)',
    'public.claim_manual_automation(uuid, integer)',
    'public.release_manual_automation(uuid, uuid)',
    'public.heartbeat_manual_automation(uuid, uuid, integer)'
  ];
begin
  foreach signature in array protected_signatures loop
    -- PUBLIC grants are inherited by both test roles, so checking anon and
    -- authenticated also catches a function accidentally left executable by PUBLIC.
    if has_function_privilege('anon', signature, 'EXECUTE')
       or has_function_privilege('authenticated', signature, 'EXECUTE') then
      raise exception 'Untrusted role can execute protected RPC: %', signature;
    end if;
    if not has_function_privilege('service_role', signature, 'EXECUTE') then
      raise exception 'Service role cannot execute protected RPC: %', signature;
    end if;
  end loop;

  if has_table_privilege('anon', 'public.execution_jobs', 'SELECT')
     or has_table_privilege('anon', 'public.execution_jobs', 'INSERT')
     or has_table_privilege('authenticated', 'public.execution_jobs', 'UPDATE')
     or has_table_privilege('authenticated', 'public.scheduled_run_locks', 'DELETE') then
    raise exception 'Untrusted role has direct access to queue or lease tables';
  end if;

  if not has_table_privilege('service_role', 'public.execution_jobs', 'SELECT')
     or not has_table_privilege('service_role', 'public.execution_jobs', 'UPDATE')
     or not has_table_privilege('service_role', 'public.scheduled_run_locks', 'DELETE') then
    raise exception 'Service role is missing required queue or lease table privileges';
  end if;
end
$privilege_check$;

select status, attempts from public.execution_jobs
where idempotency_key = 'smoke-idempotency-key';
