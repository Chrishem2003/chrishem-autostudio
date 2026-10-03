import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

export interface GalleryFlow {
  id: string;
  name: string;
  description: string | null;
  vertical: string | null;
  publishedAt: string | null;
  nodes: Array<{ id: string; defId: string; x: number; y: number; name: string }>;
  edges: Array<{ id: string; from: string; to: string }>;
}

/** Public gallery: structure only — step settings are stripped so nothing private leaks. */
export const listGallery = createServerFn({ method: "GET" }).handler(async (): Promise<GalleryFlow[]> => {
  const sb = createClient<Database>(process.env["SUPABASE_URL"]!, process.env["SUPABASE_PUBLISHABLE_KEY"]!, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await sb
    .from("automations")
    .select("id, name, description, vertical, published_at, flow_json")
    .eq("is_published", true)
    .order("published_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => {
    const f = (r.flow_json ?? {}) as { nodes?: GalleryFlow["nodes"]; edges?: GalleryFlow["edges"] };
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      vertical: r.vertical,
      publishedAt: r.published_at,
      nodes: (f.nodes ?? []).map((n) => ({ id: n.id, defId: n.defId, x: n.x, y: n.y, name: n.name })),
      edges: (f.edges ?? []).map((e) => ({ id: e.id, from: e.from, to: e.to })),
    };
  });
});

export const setPublished = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ automationId: z.string().uuid(), published: z.boolean() }).parse(i))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("automations")
      .update({ is_published: data.published, published_at: data.published ? new Date().toISOString() : null })
      .eq("id", data.automationId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
