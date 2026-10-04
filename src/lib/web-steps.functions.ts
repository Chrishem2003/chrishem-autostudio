import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("POST"),
  url: z.string().url().max(2000),
  body: z.string().max(100_000).optional(),
  timeoutSec: z.number().min(1).max(60).default(30),
});

/** Blocks local / private network addresses so steps can only reach the public internet. */
export function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local")) return true;
  if (h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) return true;
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

export const runWebStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data }) => {
    const url = new URL(data.url);
    if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, status: 0, ms: 0, attempts: 0, detail: "Only http/https addresses are allowed." };
    if (isBlockedHost(url.hostname)) return { ok: false, status: 0, ms: 0, attempts: 0, detail: "Private or local addresses can't be called from a flow." };
    const started = Date.now();
    let attempts = 0;
    let last = "";
    while (attempts < 3) {
      attempts++;
      try {
        const hasBody = data.method !== "GET" && data.method !== "DELETE" && data.body;
        const res = await fetch(url, {
          method: data.method,
          headers: hasBody ? { "content-type": "application/json", "user-agent": "Chrishem-AutoStudio/1.0" } : { "user-agent": "Chrishem-AutoStudio/1.0" },
          body: hasBody ? data.body : undefined,
          redirect: "manual",
          signal: AbortSignal.timeout(data.timeoutSec * 1000),
        });
        const text = (await res.text()).slice(0, 300);
        if (res.status === 429 || res.status >= 500) {
          last = `Got ${res.status} from ${url.hostname}.`;
        } else {
          const ms = Date.now() - started;
          const retried = attempts > 1 ? ` (succeeded on try ${attempts})` : "";
          return res.ok
            ? { ok: true, status: res.status, ms, attempts, detail: `${res.status} from ${url.hostname}${retried}. ${text ? `Reply: ${text}` : ""}`.trim() }
            : { ok: false, status: res.status, ms, attempts, detail: `${url.hostname} refused the request (${res.status}). Check the address and body. ${text}`.trim() };
        }
      } catch (e) {
        last = e instanceof Error && e.name === "TimeoutError" ? `No reply within ${data.timeoutSec}s.` : `Couldn't reach ${url.hostname}.`;
      }
      if (attempts < 3) await new Promise((r) => setTimeout(r, 250 * 2 ** (attempts - 1)));
    }
    return { ok: false, status: 0, ms: Date.now() - started, attempts, detail: `${last} Tried 3 times — try again shortly.` };
  });
