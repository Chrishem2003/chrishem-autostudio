import { NODES } from "@/lib/automation-catalog";
import { getConnectorActionForNode } from "@/lib/connector-manifests";
import type { WorkflowNode } from "@/lib/workflow";
import type { ExecutedStep } from "@/lib/execute-step.server";

/**
 * Treat adapter outputs as untrusted at the shared engine boundary. Only fields
 * declared by the connector contract may be persisted or supplied downstream.
 */
export function sanitizeStepOutputs(node: WorkflowNode, step: ExecutedStep): ExecutedStep {
  if (!step.outputs) return step;
  const tool = NODES[node.defId]?.tool;
  const contract = getConnectorActionForNode(node.defId, tool)?.action;
  if (!contract) {
    const { outputs: _discarded, ...withoutOutputs } = step;
    return withoutOutputs;
  }

  const safe: Record<string, string | number | boolean> = {};
  for (const field of contract.output.fields) {
    if (!Object.prototype.hasOwnProperty.call(step.outputs, field)) continue;
    const value = step.outputs[field];
    if (typeof value === "boolean") {
      if (field === "accepted") safe[field] = value;
      continue;
    }
    if (typeof value === "number") {
      if (field === "httpStatus" && Number.isInteger(value) && value >= 100 && value <= 599) safe[field] = value;
      continue;
    }
    if (typeof value !== "string" || value.length === 0 || value.length > 8_000) continue;
    if (field === "providerMessageId") {
      if (/^[A-Za-z0-9_-]{1,256}$/.test(value)) safe[field] = value;
      continue;
    }
    if (field === "httpStatus") {
      if (/^[1-5]\d\d$/.test(value)) safe[field] = Number(value);
      continue;
    }
    if (field === "accepted") {
      if (value === "true" || value === "false") safe[field] = value === "true";
    }
  }
  const { outputs: _discarded, ...withoutOutputs } = step;
  return Object.keys(safe).length ? { ...withoutOutputs, outputs: safe } : withoutOutputs;
}
