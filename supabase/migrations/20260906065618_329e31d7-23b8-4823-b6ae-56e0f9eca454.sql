-- ownership checks work fine as SECURITY INVOKER: they read public.automations,
-- which is already row-level-secured to the signed-in owner.
create or replace function public.owns_automation(_automation_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1 from public.automations a
    where a.id = _automation_id and a.user_id = auth.uid()
  )
$$;

create or replace function public.owns_run(_run_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.run_logs r
    join public.automations a on a.id = r.automation_id
    where r.id = _run_id and a.user_id = auth.uid()
  )
$$;

-- the sign-up trigger must never be callable through the API
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;
