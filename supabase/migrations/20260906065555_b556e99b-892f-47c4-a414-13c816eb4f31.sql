-- PHASE 1: foundation & data model

create type public.automation_status as enum ('draft', 'live', 'paused');
create type public.run_status as enum ('queued', 'running', 'success', 'failed', 'halted', 'dry_run');
create type public.integration_status as enum ('connected', 'needs_reauth', 'revoked', 'error');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- profiles ------------------------------------------------------------------
create table public.profiles (
  id uuid primary key,
  workspace_id uuid,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "profiles_select_own" on public.profiles for select to authenticated using (id = auth.uid());
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "profiles_update_own" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- automations ---------------------------------------------------------------
create table public.automations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  workspace_id uuid,
  name text not null default 'Untitled flow',
  description text,
  vertical text,
  status public.automation_status not null default 'draft',
  version integer not null default 1,
  health_score integer not null default 100,
  flow_json jsonb not null default '{}'::jsonb,
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index automations_user_idx on public.automations (user_id, updated_at desc);
grant select, insert, update, delete on public.automations to authenticated;
grant all on public.automations to service_role;
alter table public.automations enable row level security;
create policy "automations_owner_all" on public.automations for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create trigger automations_updated_at before update on public.automations for each row execute function public.set_updated_at();

create or replace function public.owns_automation(_automation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.automations a
    where a.id = _automation_id and a.user_id = auth.uid()
  )
$$;

-- versions ------------------------------------------------------------------
create table public.automation_versions (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.automations(id) on delete cascade,
  workspace_id uuid,
  version_number integer not null,
  flow_json jsonb not null,
  change_summary text,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (automation_id, version_number)
);
create index automation_versions_idx on public.automation_versions (automation_id, version_number desc);
grant select, insert on public.automation_versions to authenticated;
grant all on public.automation_versions to service_role;
alter table public.automation_versions enable row level security;
create policy "versions_select_own" on public.automation_versions for select to authenticated using (public.owns_automation(automation_id));
create policy "versions_insert_own" on public.automation_versions for insert to authenticated with check (public.owns_automation(automation_id));

-- flow nodes ----------------------------------------------------------------
create table public.flow_nodes (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.automations(id) on delete cascade,
  workspace_id uuid,
  def_id text not null,
  type text not null,
  label text,
  config_json jsonb not null default '{}'::jsonb,
  position_x integer not null default 0,
  position_y integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index flow_nodes_automation_idx on public.flow_nodes (automation_id);
grant select, insert, update, delete on public.flow_nodes to authenticated;
grant all on public.flow_nodes to service_role;
alter table public.flow_nodes enable row level security;
create policy "flow_nodes_owner_all" on public.flow_nodes for all to authenticated using (public.owns_automation(automation_id)) with check (public.owns_automation(automation_id));
create trigger flow_nodes_updated_at before update on public.flow_nodes for each row execute function public.set_updated_at();

-- connections ---------------------------------------------------------------
create table public.flow_connections (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.automations(id) on delete cascade,
  workspace_id uuid,
  source_node_id uuid not null references public.flow_nodes(id) on delete cascade,
  target_node_id uuid not null references public.flow_nodes(id) on delete cascade,
  condition_json jsonb,
  created_at timestamptz not null default now()
);
create index flow_connections_automation_idx on public.flow_connections (automation_id);
grant select, insert, update, delete on public.flow_connections to authenticated;
grant all on public.flow_connections to service_role;
alter table public.flow_connections enable row level security;
create policy "flow_connections_owner_all" on public.flow_connections for all to authenticated using (public.owns_automation(automation_id)) with check (public.owns_automation(automation_id));

-- integrations (metadata only, never secrets) --------------------------------
create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  workspace_id uuid,
  provider text not null,
  display_name text,
  account_label text,
  auth_kind text not null default 'oauth2',
  status public.integration_status not null default 'connected',
  scopes text[] not null default '{}',
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);
grant select, insert, update, delete on public.integrations to authenticated;
grant all on public.integrations to service_role;
alter table public.integrations enable row level security;
create policy "integrations_owner_all" on public.integrations for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create trigger integrations_updated_at before update on public.integrations for each row execute function public.set_updated_at();

-- run logs ------------------------------------------------------------------
create table public.run_logs (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.automations(id) on delete cascade,
  workspace_id uuid,
  status public.run_status not null default 'queued',
  trigger_type text,
  is_dry_run boolean not null default false,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer,
  error_summary text,
  created_at timestamptz not null default now()
);
create index run_logs_automation_idx on public.run_logs (automation_id, started_at desc);
grant select, insert, update, delete on public.run_logs to authenticated;
grant all on public.run_logs to service_role;
alter table public.run_logs enable row level security;
create policy "run_logs_owner_all" on public.run_logs for all to authenticated using (public.owns_automation(automation_id)) with check (public.owns_automation(automation_id));

create or replace function public.owns_run(_run_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.run_logs r
    join public.automations a on a.id = r.automation_id
    where r.id = _run_id and a.user_id = auth.uid()
  )
$$;

create table public.run_step_logs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.run_logs(id) on delete cascade,
  workspace_id uuid,
  node_id uuid references public.flow_nodes(id) on delete set null,
  node_label text,
  step_index integer not null default 0,
  status public.run_status not null default 'queued',
  input_snapshot jsonb,
  output_snapshot jsonb,
  duration_ms integer,
  error_detail text,
  created_at timestamptz not null default now()
);
create index run_step_logs_run_idx on public.run_step_logs (run_id, step_index);
grant select, insert, update, delete on public.run_step_logs to authenticated;
grant all on public.run_step_logs to service_role;
alter table public.run_step_logs enable row level security;
create policy "run_step_logs_owner_all" on public.run_step_logs for all to authenticated using (public.owns_run(run_id)) with check (public.owns_run(run_id));