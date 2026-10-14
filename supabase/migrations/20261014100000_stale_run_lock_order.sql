-- Use the same parent-first lock order as manual/scheduled lease claims.
-- Previously reconciliation locked run_logs first and automations second,
-- while claim RPCs lock automations before creating/attaching run_logs. That
-- inversion can deadlock under concurrent recovery and scheduling.
create or replace function public.reconcile_stale_execution_run(_run_id uuid, _lock_token uuid default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  _automation_id uuid;
  _locked_automation_id uuid;
  _trigger_type text;
  _started_at timestamptz;
  _current_lock_token uuid;
  _locked_until timestamptz;
begin
  -- Read the parent key without locking the child row. This is only a hint for
  -- acquiring locks; every mutable condition is revalidated after both locks.
  select automation_id
    into _automation_id
    from public.run_logs
   where id = _run_id and status::text = 'running';
  if not found then return 'not_running'; end if;

  -- All code paths that coordinate a run and its lease must lock the automation
  -- row before locking the run row to keep a consistent lock hierarchy.
  perform 1 from public.automations where id = _automation_id for update;
  if not found then return 'not_running'; end if;

  select automation_id, trigger_type::text, started_at
    into _locked_automation_id, _trigger_type, _started_at
    from public.run_logs
   where id = _run_id and status::text = 'running'
   for update;
  if not found then return 'not_running'; end if;
  if _locked_automation_id is distinct from _automation_id then
    -- Do not proceed if the relationship changed between the unlocked lookup
    -- and acquiring the parent lock; a retry can safely re-read the row.
    return 'not_running';
  end if;
  if _trigger_type not in ('manual', 'schedule') then return 'unsupported_trigger'; end if;
  if _started_at > now() - interval '20 minutes' then return 'not_stale'; end if;

  -- Claim RPCs serialize on the automation row above. Lock the lease row too so
  -- token/expiry checks cannot race a direct lease mutation during recovery.
  select lock_token, locked_until into _current_lock_token, _locked_until
    from public.scheduled_run_locks
   where automation_id = _automation_id
   for update;
  if found and _locked_until > now() then
    if _lock_token is null or _current_lock_token is distinct from _lock_token then return 'active_lease'; end if;
  elsif _lock_token is not null then
    return 'lease_not_owned';
  end if;

  update public.run_step_logs
     set status = 'failed',
         outcome_state = 'uncertain',
         error_detail = 'The worker stopped before confirming this step. Verify external effects before retrying.',
         output_snapshot = jsonb_build_object('recoveryHint', 'Stale in-flight step; external outcome is uncertain. Verify before retry.')
   where run_id = _run_id and status = 'running';

  update public.run_logs
     set status = 'failed',
         finished_at = now(),
         duration_ms = greatest(0, floor(extract(epoch from (now() - started_at)) * 1000)::integer),
         error_summary = 'The worker stopped before finalizing this run. Inspect uncertain step outcomes before retrying.'
   where id = _run_id and status::text = 'running';
  if not found then return 'not_running'; end if;
  return 'reconciled';
end;
$$;

revoke all on function public.reconcile_stale_execution_run(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reconcile_stale_execution_run(uuid, uuid) to service_role;
comment on function public.reconcile_stale_execution_run(uuid, uuid) is
  'Atomically marks stale manual/scheduled run intents uncertain and closes the run only when the lease safety check passes. Locks automation before run audit to avoid lock-order inversion. Never replays external actions.';
