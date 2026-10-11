-- Explicitly reject NULL enqueue enum/range inputs before SQL three-valued logic.
-- Preserve the established idempotency and payload contract in this forward migration.
create or replace function public.enqueue_execution_job(
  _automation_id uuid,
  _trigger_type text,
  _idempotency_key text,
  _payload jsonb default '{}'::jsonb,
  _requested_by uuid default null,
  _max_attempts integer default 3,
  _available_at timestamptz default now()
)
returns setof public.execution_jobs
language plpgsql
security definer
set search_path = public
as $enqueue$
begin
  if _trigger_type is null or _trigger_type not in ('manual', 'scheduled', 'webhook') then
    raise exception 'Unsupported execution trigger';
  end if;
  if _idempotency_key is null or length(_idempotency_key) < 1 or length(_idempotency_key) > 200 then
    raise exception 'Invalid idempotency key';
  end if;
  if _max_attempts is null or _max_attempts < 1 or _max_attempts > 10 then
    raise exception 'Invalid maximum attempt count';
  end if;
  if _payload is null or octet_length(_payload::text) > 65536 then
    raise exception 'Execution payload exceeds 64 KiB';
  end if;
  if not exists (
    select 1 from public.automations
     where id = _automation_id and status::text = 'live'
  ) then
    raise exception 'Automation is missing or not live';
  end if;

  return query
    insert into public.execution_jobs (
      automation_id, trigger_type, idempotency_key, payload,
      requested_by, max_attempts, available_at
    )
    values (
      _automation_id, _trigger_type, _idempotency_key, _payload,
      _requested_by, _max_attempts, coalesce(_available_at, now())
    )
    on conflict (automation_id, idempotency_key) do update
      -- A replay is idempotent only when it represents the same logical request.
      -- Reusing a key with different intent must fail instead of silently returning
      -- a job whose payload does not match the caller's request.
      set idempotency_key = excluded.idempotency_key
      where execution_jobs.trigger_type = excluded.trigger_type
        and execution_jobs.payload = excluded.payload
        and execution_jobs.requested_by is not distinct from excluded.requested_by
        and execution_jobs.max_attempts = excluded.max_attempts
    returning *;

  if not found then
    raise exception 'Idempotency key was reused with a different request';
  end if;
end;
$enqueue$;


revoke all on function public.enqueue_execution_job(uuid, text, text, jsonb, uuid, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.enqueue_execution_job(uuid, text, text, jsonb, uuid, integer, timestamptz) to service_role;

comment on function public.enqueue_execution_job(uuid, text, text, jsonb, uuid, integer, timestamptz) is
  'Idempotently enqueues a bounded execution request and explicitly rejects NULL trigger or retry-limit inputs.';
