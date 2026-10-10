import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("POST"),
  url: z.string().url().max(2000),
  body: z.string().max(100_000).optional(),
  timeoutSec: z.number().min(1).max(60).default(30),
});

export const runWebStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Input.parse(d))
  .handler(async () => ({
    ok: false,
    status: 0,
    ms: 0,
    attempts: 0,
    detail: "Direct HTTP execution is disabled. Save the flow and run it through the guarded automation executor.",
  }));
