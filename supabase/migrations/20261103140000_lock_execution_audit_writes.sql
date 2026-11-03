-- Execution audit history is server-owned. Authenticated users retain
-- owner-scoped read access but cannot fabricate, rewrite, or delete audit rows.

alter table public.run_logs enable row level security;
alter table public.run_step_logs enable row level security;

revoke all on table public.run_logs from public, anon, authenticated;
revoke all on table public.run_step_logs from public, anon, authenticated;

grant select on table public.run_logs to authenticated;
grant select on table public.run_step_logs to authenticated;
grant all on table public.run_logs to service_role;
grant all on table public.run_step_logs to service_role;

drop policy if exists "run_logs_owner_all" on public.run_logs;
drop policy if exists "run_step_logs_owner_all" on public.run_step_logs;
drop policy if exists "run_logs_select_own" on public.run_logs;
drop policy if exists "run_step_logs_select_own" on public.run_step_logs;

create policy "run_logs_select_own"
  on public.run_logs for select to authenticated
  using (public.owns_automation(automation_id));

create policy "run_step_logs_select_own"
  on public.run_step_logs for select to authenticated
  using (public.owns_run(run_id));

comment on table public.run_logs is
  'Execution audit history. Authenticated clients have read-only owner-scoped access; writes are server-owned.';
comment on table public.run_step_logs is
  'Per-step execution audit history. Authenticated clients have read-only owner-scoped access; writes are server-owned.';
