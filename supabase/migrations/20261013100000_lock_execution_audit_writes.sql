-- Keep execution history read-only to authenticated clients.
-- Runtime mutations remain server-owned through service_role guarded paths.
-- This prevents a user from fabricating, rewriting, or deleting their own
-- run history via the Supabase REST API and invalidating audit/recovery evidence.

revoke all on table public.run_logs from public, anon, authenticated;
revoke all on table public.run_step_logs from public, anon, authenticated;

grant select on table public.run_logs to authenticated;
grant select on table public.run_step_logs to authenticated;
grant all on table public.run_logs to service_role;
grant all on table public.run_step_logs to service_role;

drop policy if exists "run_logs_owner_all" on public.run_logs;
drop policy if exists "run_step_logs_owner_all" on public.run_step_logs;

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
