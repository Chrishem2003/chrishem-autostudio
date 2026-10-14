-- Re-check staleness and lease ownership with a fresh wall clock after the
-- parent automation lock is acquired. Transaction-start now() can be stale
-- after lock waits and must not authorize recovery based on an expired lease.
create or replace function public.reconcile_stale_execution_run(
  _run_id uuid,
  _lock_token uuid default null
)
returns text
language plpgsql
security definer
set search_path = public
as $reconcile_stale_execution_run$
declare
  _automation_id uuid;
  _trigger_type text;
  _started_at timestamptz;
  _current_lock_token uuid;
  _locked_until timestamptz;
begin
  -- Read identity without locking the child row first: lease claim/release paths
  -- lock the automation parent first, so this order avoids lock inversion.
  select automation_id, trigger_type::text, started_at
    into _automation_id, _trigger_type, _started_at
    from public.run_logs
   where id = _run_id
     and status::text = 'running';

  if not found then
    return 'not_running';
  end if;

  if _trigger_type not in ('manual', 'schedule') then
    return 'unsupported_trigger';
  end if;

  -- Parent-first lock ordering matches automation lease claim/release RPCs.
  perform 1
    from public.automations
   where id = _automation_id
   for update;

  if not found then
    return 'not_running';
  end if;

  -- Re-read and lock the child after the parent lock, because the original
  -- snapshot may have become terminal while waiting for the automation row.
  select automation_id, trigger_type::text, started_at
    into _automation_id, _trigger_type, _started_at
    from public.run_logs
   where id = _run_id
     and status::text = 'running'
   for update;

  if not found then
    return 'not_running';
  end if;

  if _trigger_type not in ('manual', 'schedule') then
    return 'unsupported_trigger';
  end if;

  if _started_at > clock_timestamp() - interval '20 minutes' then
    return 'not_stale';
  end if;

  select lock_token, locked_until
    into _current_lock_token, _locked_until
    from public.scheduled_run_locks
   where automation_id = _automation_id;

  if found and _locked_until > clock_timestamp() then
    if _lock_token is null or _current_lock_token is distinct from _lock_token then
      return 'active_lease';
    end if;
  elsif _lock_token is not null then
    return 'lease_not_owned';
  end if;

  update public.run_step_logs
     set status = 'failed',
         outcome_state = 'uncertain',
         error_detail = 'The worker stopped before confirming this step. Verify external effects before retrying.',
         output_snapshot = jsonb_build_object(
           'recoveryHint',
           'Stale in-flight step; external outcome is uncertain. Verify before retry.'
         )
   where run_id = _run_id
     and status = 'running';

  update public.run_logs
     set status = 'failed',
         finished_at = clock_timestamp(),
         duration_ms = greatest(
           0,
           floor(extract(epoch from (clock_timestamp() - started_at)) * 1000)::integer
         ),
         error_summary = 'The worker stopped before finalizing this run. Inspect uncertain step outcomes before retrying.'
   where id = _run_id
     and status::text = 'running';

  if not found then
    return 'not_running';
  end if;

  return 'reconciled';
end;
$reconcile_stale_execution_run$;

revoke all on function public.reconcile_stale_execution_run(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reconcile_stale_execution_run(uuid, uuid) to service_role;

comment on function public.reconcile_stale_execution_run(uuid, uuid) is
  'Atomically reconciles stale manual/scheduled runs using parent-first locks and fresh wall-clock lease checks; never replays external actions.';
