import { z } from "zod";

/**
 * Runtime boundary for workflow JSON loaded from the database.
 * Database JSON is untrusted even when it was originally written by our UI.
 * Graph semantics are checked separately by planLinearExecution.
 */
const MAX_TOTAL_WORKFLOW_CHARS = 512_000;
const MAX_TOTAL_CONFIG_CHARS = 256_000;

const persistedWorkflowShape = z.object({
  name: z.string().min(1).max(200),
  nodes: z.array(z.object({
    id: z.string().min(1).max(120),
    defId: z.string().min(1).max(160),
    x: z.number().finite(),
    y: z.number().finite(),
    name: z.string().min(1).max(200),
    config: z.record(z.string().min(1).max(120), z.string().max(8_000)),
  })).max(200),
  edges: z.array(z.object({
    id: z.string().min(1).max(120),
    from: z.string().min(1).max(120),
    to: z.string().min(1).max(120),
  })).max(500),
}).passthrough();

export type PersistedWorkflowShape = z.infer<typeof persistedWorkflowShape>;

export function parsePersistedWorkflow(value: unknown):
  | { success: true; data: PersistedWorkflowShape }
  | { success: false } {
  // The schema preserves workflow metadata for compatibility. Bound the whole
  // JSON payload as well as config values so passthrough metadata cannot bypass
  // the input budget. Reject non-JSON values (e.g. cycles or BigInt) safely.
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return { success: false };
  }
  if (typeof serialized !== "string" || serialized.length > MAX_TOTAL_WORKFLOW_CHARS) {
    return { success: false };
  }

  // Accessors and proxies are not expected in database JSON, but this function
  // is also a trust boundary for tests, adapters, and future callers. A getter
  // may return one value during serialization and throw/change during parsing.
  // Any such runtime behavior must reject the workflow rather than escape.
  try {
    // Validate the exact JSON snapshot whose size was checked. Parsing the
    // original object again would re-read getters/proxies and could validate a
    // different value than the one serialized at this trust boundary.
    const snapshot: unknown = JSON.parse(serialized);
    const parsed = persistedWorkflowShape.safeParse(snapshot);
    if (!parsed.success) return { success: false };

    // Per-field limits alone still allow a large configuration payload across
    // many nodes. Bound the aggregate before graph planning, logging, or enqueueing.
    let totalConfigChars = 0;
    for (const node of parsed.data.nodes) {
      for (const [key, configValue] of Object.entries(node.config)) {
        totalConfigChars += key.length + configValue.length;
        if (totalConfigChars > MAX_TOTAL_CONFIG_CHARS) return { success: false };
      }
    }

    return { success: true, data: parsed.data };
  } catch {
    return { success: false };
  }
}
