\set ON_ERROR_STOP on

-- Minimal disposable schema to exercise the real migration and RPC contracts.
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key);
create table if not exists public.automations (
  id uuid primary key,
  status text not null
);

create table if not exists public.run_logs (
  id uuid primary key,
  automation_id uuid,
  status text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer,
  error_summary text,
  trigger_type text not null default 'manual'
);
create table if not exists public.run_step_logs (
  id uuid primary key,
  run_id uuid not null references public.run_logs(id) on delete cascade,
  status text not null,
  outcome_state text,
  error_detail text,
  output_snapshot jsonb not null default '{}'::jsonb
);

do $bootstrap$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end
$bootstrap$;
