ALTER TABLE public.automations ADD COLUMN is_published boolean NOT NULL DEFAULT false, ADD COLUMN published_at timestamptz, ADD COLUMN remix_count integer NOT NULL DEFAULT 0;
GRANT SELECT ON public.automations TO anon;
CREATE POLICY automations_public_read ON public.automations FOR SELECT TO anon, authenticated USING (is_published = true);