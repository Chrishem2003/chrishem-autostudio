\set ON_ERROR_STOP on

-- Minimal schema for the disposable PostgreSQL service used by CI.
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key);
create table if not exists public.automations (
  id uuid primary key,
  user_id uuid,
  status text not null
);

do $
begin
  create type public.run_status as enum ('queued', 'running', 'success', 'failed', 'dry_run', 'halted');
exception when duplicate_object then null;
end
$;

-- Minimal run-audit tables needed to exercise lease-expiry reconciliation in CI.
create table if not exists public.run_logs (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.automations(id) on delete cascade,
  status public.run_status not null default 'queued',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer,
  error_summary text,
  execution_job_id uuid
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

do $$
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
$$;
