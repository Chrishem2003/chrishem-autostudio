import { z } from "zod";

/**
 * Runtime boundary for workflow JSON loaded from the database.
 * Database JSON is untrusted even when it was originally written by our UI.
 * Graph semantics are checked separately by planLinearExecution.
 */
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
  const parsed = persistedWorkflowShape.safeParse(value);
  if (!parsed.success) return { success: false };

  // Per-field limits alone still allow a 1.6 MB configuration payload across
  // 200 nodes. Bound the aggregate before graph planning, logging, or enqueueing.
  let totalConfigChars = 0;
  for (const node of parsed.data.nodes) {
    for (const [key, configValue] of Object.entries(node.config)) {
      totalConfigChars += key.length + configValue.length;
      if (totalConfigChars > MAX_TOTAL_CONFIG_CHARS) return { success: false };
    }
  }

  return { success: true, data: parsed.data };
}
