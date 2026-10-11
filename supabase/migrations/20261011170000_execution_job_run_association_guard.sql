-- Enforce one-to-one queue/audit association and prevent cross-automation links.
-- Existing duplicates should be reviewed explicitly instead of silently rewritten.
do $$
begin
  if exists (
    select run_id
      from public.execution_jobs
     where run_id is not null
     group by run_id
    having count(*) > 1
  ) then
    raise exception 'Duplicate execution job audit-run links exist; reconcile them before applying association guard';
  end if;
end;
$$;

create unique index if not exists execution_jobs_run_id_unique_idx
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
  if _run_id is null then
    return false;
  end if;

  update public.execution_jobs j
     set run_id = _run_id,
         updated_at = now()
   where j.id = _job_id
     and j.status = 'running'
     and j.worker_token = _worker_token
     and j.locked_until > now()
     and (j.run_id is null or j.run_id = _run_id)
     and exists (
       select 1
         from public.run_logs r
        where r.id = _run_id
          and r.automation_id = j.automation_id
     )
     and not exists (
       select 1
         from public.execution_jobs other
        where other.run_id = _run_id
          and other.id <> j.id
     );

  return found;
end;
$$;

revoke all on function public.attach_execution_job_run(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.attach_execution_job_run(uuid, uuid, uuid) to service_role;

comment on column public.execution_jobs.run_id is
  'Unique audit run association; must belong to the same automation and current worker lease.';
comment on function public.attach_execution_job_run(uuid, uuid, uuid) is
  'Attaches exactly one audit run from the same automation to the current unexpired worker lease.';
