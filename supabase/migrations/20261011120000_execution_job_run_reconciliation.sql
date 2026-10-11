-- Link durable queue jobs to their audit run so expired worker leases can
-- reconcile stale "running" rows without replaying uncertain external actions.
alter table public.execution_jobs
  add column if not exists run_id uuid references public.run_logs(id) on delete set null;

create index if not exists execution_jobs_run_id_idx
  on public.execution_jobs (run_id)
  where run_id is not null;

create or replace function public.attach_execution_job_run(
  _job_id uuid,
  _worker_token uuid,
  _run_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.execution_jobs
     set run_id = _run_id,
         updated_at = now()
   where id = _job_id
     and status = 'running'
     and worker_token = _worker_token
     and locked_until > now()
     and (run_id is null or run_id = _run_id);

  return found;
end;
$$;

revoke all on function public.attach_execution_job_run(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.attach_execution_job_run(uuid, uuid, uuid) to service_role;

create or replace function public.reconcile_expired_execution_job_run()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'running'
     and new.status = 'needs_review'
     and old.run_id is not null then
    update public.run_step_logs
       set status = 'failed',
           outcome_state = 'uncertain',
           error_detail = 'Worker lease expired before the step outcome was confirmed. Verify external effects before retrying.',
           output_snapshot = jsonb_build_object(
             'recoveryHint',
             'Worker lease expired; verify the external outcome before retrying.'
           )
     where run_id = old.run_id
       and status = 'running';

    update public.run_logs
       set status = 'failed',
           finished_at = coalesce(finished_at, now()),
           duration_ms = greatest(0, floor(extract(epoch from (now() - started_at)) * 1000)::integer),
           error_summary = 'Queued worker lease expired. Verify uncertain step outcomes before retrying.'
     where id = old.run_id
       and status = 'running';
  end if;

  return new;
end;
$$;

drop trigger if exists execution_job_run_reconciliation on public.execution_jobs;
create trigger execution_job_run_reconciliation
after update of status on public.execution_jobs
for each row
when (old.status is distinct from new.status)
execute function public.reconcile_expired_execution_job_run();

comment on column public.execution_jobs.run_id is
  'Audit run created by the current worker lease; used to reconcile interrupted executions.';
