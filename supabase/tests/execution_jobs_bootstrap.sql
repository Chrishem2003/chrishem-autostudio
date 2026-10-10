\set ON_ERROR_STOP on

-- Minimal schema for the disposable PostgreSQL service used by CI.
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key);
create table if not exists public.automations (
  id uuid primary key,
  user_id uuid,
  status text not null
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
