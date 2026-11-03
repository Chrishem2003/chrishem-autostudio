\set ON_ERROR_STOP on

-- Minimal schema for the disposable PostgreSQL service used by CI.
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key);
create table if not exists public.automations (
  id uuid primary key,
  user_id uuid,
  status text not null,
  last_run_at timestamptz
);

create type public.run_status as enum ('queued', 'running', 'success', 'failed', 'dry_run', 'halted');

create table if not exists public.run_logs (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.automations(id) on delete cascade,
  status public.run_status not null default 'queued',
  trigger_type text not null default 'manual',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer,
  error_summary text,
  execution_job_id uuid,
  queue_review_required boolean not null default false
);

create table if not exists public.run_step_logs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.run_logs(id) on delete cascade,
  status public.run_status not null default 'queued',
  outcome_state text not null default 'not_attempted'
    check (outcome_state in ('confirmed', 'uncertain', 'not_attempted')),
  error_detail text,
  output_snapshot jsonb
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $auth_uid$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$auth_uid$;

create or replace function public.owns_automation(_automation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $owns_automation$
  select exists (
    select 1 from public.automations
     where id = _automation_id and user_id = auth.uid()
  )
$owns_automation$;

create or replace function public.owns_run(_run_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $owns_run$
  select exists (
    select 1
      from public.run_logs r
      join public.automations a on a.id = r.automation_id
     where r.id = _run_id and a.user_id = auth.uid()
  )
$owns_run$;

do $create_roles$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'create ' || 'role anon nologin';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'create ' || 'role authenticated nologin';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'create ' || 'role service_role nologin bypassrls';
  end if;
end
$create_roles$;
