\set ON_ERROR_STOP on

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

  if not public.finish_execution_job(claimed.id, claimed.worker_token, 'succeeded', null, null) then
    raise exception 'Current worker could not finalize job';
  end if;
  if public.finish_execution_job(claimed.id, claimed.worker_token, 'succeeded', null, null) then
    raise exception 'Finalization accepted a stale/reused worker token';
  end if;

  if has_function_privilege('anon', 'public.claim_execution_job(integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.claim_execution_job(integer)', 'EXECUTE') then
    raise exception 'Untrusted roles can execute the worker claim RPC';
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
  update public.execution_jobs
     set locked_until = now() - interval '1 second'
   where id = expired_job.id;
  perform * from public.claim_execution_job(300);
  select * into expired_job from public.execution_jobs where id = expired_job.id;
  if expired_job.status <> 'needs_review' or expired_job.worker_token is not null then
    raise exception 'Expired lease was not safely moved to needs_review';
  end if;

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

select status, attempts from public.execution_jobs
where idempotency_key = 'smoke-idempotency-key';
