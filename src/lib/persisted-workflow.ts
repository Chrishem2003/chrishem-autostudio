import { z } from "zod";

/**
 * Runtime boundary for workflow JSON loaded from the database.
 * Database JSON is untrusted even when it was originally written by our UI.
 * Graph semantics are checked separately by planLinearExecution.
 */
export const MAX_PERSISTED_WORKFLOW_BYTES = 512 * 1024;

const persistedWorkflowShape = z.object({
  name: z.string().min(1).max(200),
  nodes: z.array(z.object({
    id: z.string().min(1).max(120),
    defId: z.string().min(1).max(160),
    x: z.number().finite(),
    y: z.number().finite(),
    name: z.string().min(1).max(200),
    config: z.record(z.string().max(120), z.string().max(8_000)),
  })).max(200),
  edges: z.array(z.object({
    id: z.string().min(1).max(120),
    from: z.string().min(1).max(120),
    to: z.string().min(1).max(120),
  })).max(500),
}).passthrough();

export type PersistedWorkflowShape = z.infer<typeof persistedWorkflowShape>;

function isWithinPersistedWorkflowBudget(value: unknown): boolean {
  try {
    const serialized = JSON.stringify(value);
    if (typeof serialized !== "string") return false;
    return new TextEncoder().encode(serialized).byteLength <= MAX_PERSISTED_WORKFLOW_BYTES;
  } catch {
    // Cycles, BigInt, and other non-JSON runtime values are invalid at this boundary.
    return false;
  }
}

export function parsePersistedWorkflow(value: unknown):
  | { success: true; data: PersistedWorkflowShape }
  | { success: false } {
  if (!isWithinPersistedWorkflowBudget(value)) return { success: false };
  const parsed = persistedWorkflowShape.safeParse(value);
  return parsed.success ? { success: true, data: parsed.data } : { success: false };
}
