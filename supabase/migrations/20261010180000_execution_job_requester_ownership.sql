-- Fail closed on audit attribution: a user-requested queue job must be requested
-- by the automation owner. System-triggered jobs may use NULL requested_by.
-- Team/workspace membership is not enabled yet, so do not imply shared access.
create or replace function public.enforce_execution_job_requester_ownership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.requested_by is not null and not exists (
    select 1
      from public.automations a
     where a.id = new.automation_id
       and a.user_id = new.requested_by
  ) then
    raise exception 'Execution job requester does not own the automation';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_execution_job_requester_ownership() from public, anon, authenticated;

drop trigger if exists execution_jobs_requester_ownership on public.execution_jobs;
create trigger execution_jobs_requester_ownership
before insert or update of automation_id, requested_by
on public.execution_jobs
for each row execute function public.enforce_execution_job_requester_ownership();

comment on function public.enforce_execution_job_requester_ownership() is
  'Rejects forged requester attribution until explicit workspace membership authorization is implemented.';
