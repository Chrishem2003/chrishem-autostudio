-- The shared run finalizer and application UI use "success" for a successful
-- run_logs row. Queue jobs use "succeeded" as their terminal status. Keep those
-- distinct vocabularies aligned at the durable queue boundary.
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

  update public.execution_jobs j
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
   where j.id = _job_id
     and j.status = 'running'
     and j.worker_token = _worker_token
     and j.locked_until > now()
     and (
       _status <> 'succeeded'
       or (
         j.run_id is not null
         and exists (
           select 1
             from public.run_logs r
            where r.id = j.run_id
              and r.status = 'success'
              and r.finished_at is not null
         )
       )
     );

  return found;
end;
$$;

revoke all on function public.finish_execution_job(uuid, uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.finish_execution_job(uuid, uuid, text, text, timestamptz) to service_role;

comment on function public.finish_execution_job(uuid, uuid, text, text, timestamptz) is
  'Fenced queue finalization; succeeded requires a linked run_logs row with application success status and finished_at.';
