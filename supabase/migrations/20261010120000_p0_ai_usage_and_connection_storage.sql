-- P0 hardening: missing server-only connection storage and atomic AI usage quotas.
-- app_user_connections intentionally has no client policies: service_role is the only reader/writer.

create table if not exists public.app_user_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  connector_id text not null,
  connection_key_ciphertext text not null,
  account_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, connector_id)
);

alter table public.app_user_connections enable row level security;
revoke all on table public.app_user_connections from public, anon, authenticated;
grant all on table public.app_user_connections to service_role;

create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task text not null,
  tokens integer not null default 0 check (tokens >= 0),
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_user_task_created_idx
  on public.ai_usage (user_id, task, created_at desc);

alter table public.ai_usage enable row level security;
revoke all on table public.ai_usage from public, anon, authenticated;
grant select on table public.ai_usage to authenticated;
grant all on table public.ai_usage to service_role;

create policy "ai_usage_select_own"
  on public.ai_usage for select to authenticated
  using (user_id = auth.uid());

-- Serializes quota checks per user/task so parallel requests cannot bypass the limit.
create or replace function public.consume_ai_plan_quota(_task text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _user_id uuid := auth.uid();
  _used integer;
  _usage_id uuid;
begin
  if _user_id is null then
    return null;
  end if;

  if _task is distinct from 'compose_flow' then
    raise exception 'Unsupported AI quota task';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(_user_id::text || ':' || _task, 0));

  select count(*)::integer
    into _used
    from public.ai_usage
    where user_id = _user_id
      and task = _task
      and created_at >= now() - interval '1 hour';

  if _used >= 20 then
    return null;
  end if;

  insert into public.ai_usage (user_id, task, tokens)
    values (_user_id, _task, 0)
    returning id into _usage_id;

  return _usage_id;
end;
$$;

revoke all on function public.consume_ai_plan_quota(text, integer) from public, anon;
grant execute on function public.consume_ai_plan_quota(text, integer) to authenticated;
