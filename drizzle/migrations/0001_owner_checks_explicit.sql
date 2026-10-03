CREATE OR REPLACE FUNCTION public.owns_automation(_automation_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.automations WHERE id = _automation_id AND user_id = auth.uid())
$$;
CREATE OR REPLACE FUNCTION public.owns_run(_run_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.run_logs r JOIN public.automations a ON a.id = r.automation_id WHERE r.id = _run_id AND a.user_id = auth.uid())
$$;