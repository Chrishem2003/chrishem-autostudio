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
         ('00000000-0000-4000-8000-000000000025','00000000-0000-4000-8000-000000000020','succeeded','confirmed','preexisting successful step');
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
