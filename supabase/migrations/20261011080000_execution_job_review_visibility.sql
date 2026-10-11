-- Keep queue uncertainty visible in run history without rewriting terminal run outcomes.
alter table public.run_logs
  add column if not exists queue_review_required boolean not null default false;

comment on column public.run_logs.queue_review_required is
  'True when the associated durable queue job requires manual review; independent of the run summary status.';

create or replace function public.reconcile_expired_execution_job_run()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _finished_at timestamptz := coalesce(new.finished_at, now());
begin
  if old.status = 'running' and new.status = 'needs_review' then
    update public.run_logs
       set queue_review_required = true
     where execution_job_id = new.id;

    update public.run_step_logs
       set status = 'failed',
           outcome_state = 'uncertain',
           error_detail = 'Worker lease expired before this step outcome was confirmed. Verify external effects before retrying.',
           output_snapshot = jsonb_build_object(
             'recoveryHint', 'Queue lease expired; this step may have caused an external side effect. Verify outcome before retrying.'
           )
     where run_id in (
       select r.id from public.run_logs r where r.execution_job_id = new.id
     )
       and status = 'running';

    update public.run_logs
       set status = 'failed',
           finished_at = _finished_at,
           duration_ms = greatest(0, floor(extract(epoch from (_finished_at - started_at)) * 1000)::integer),
           error_summary = 'Worker lease expired. Inspect uncertain step outcomes and verify external effects before retrying.'
     where execution_job_id = new.id
       and status = 'running';
  end if;
  return new;
end;
$$;

drop trigger if exists execution_job_run_reconciliation on public.execution_jobs;
create trigger execution_job_run_reconciliation
after update of status on public.execution_jobs
for each row
when (old.status = 'running' and new.status = 'needs_review')
execute function public.reconcile_expired_execution_job_run();

revoke all on function public.reconcile_expired_execution_job_run() from public, anon, authenticated;
