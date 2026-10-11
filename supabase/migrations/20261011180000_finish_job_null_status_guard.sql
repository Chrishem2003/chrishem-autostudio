-- Reject NULL final status explicitly before SQL three-valued logic can bypass validation.
-- This forward migration fixes already-deployed copies of finish_execution_job.
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
  if _status is null
     or _status not in ('succeeded', 'failed', 'queued', 'needs_review', 'dead_letter') then
    raise exception 'Invalid execution job final status';
  end if;

  update public.execution_jobs
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
   where id = _job_id
     and status = 'running'
     and worker_token = _worker_token
     and locked_until > now();

  return found;
end;
$$;

revoke all on function public.finish_execution_job(uuid, uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.finish_execution_job(uuid, uuid, text, text, timestamptz) to service_role;

comment on function public.finish_execution_job(uuid, uuid, text, text, timestamptz) is
  'Finalizes only the current unexpired worker lease and rejects NULL or unsupported terminal states.';
