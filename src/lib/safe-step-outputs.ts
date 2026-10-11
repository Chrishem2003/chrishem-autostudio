import { NODES } from "@/lib/automation-catalog";
import { getConnectorActionForNode } from "@/lib/connector-manifests";
import type { WorkflowNode } from "@/lib/workflow";
import type { ExecutedStep } from "@/lib/execute-step.server";

/** Keep only contract-declared scalar output fields at the execution boundary. */
export function sanitizeStepOutputs(node: WorkflowNode, step: ExecutedStep): ExecutedStep {
  if (!step.outputs) return step;
  const tool = NODES[node.defId]?.tool;
  const action = getConnectorActionForNode(node.defId, tool)?.action;
  if (node.defId === "logic.filter") {
    const safe: Record<string, string | number | boolean> = Object.create(null) as Record<string, string | number | boolean>;
    if (typeof step.outputs["passed"] === "boolean") safe["passed"] = step.outputs["passed"];
    const { outputs: _discarded, ...rest } = step;
    return Object.keys(safe).length ? { ...rest, outputs: safe } : rest;
  }
  if (node.defId === "logic.map") {
    const safe: Record<string, string | number | boolean> = Object.create(null) as Record<string, string | number | boolean>;
    if (typeof step.outputs["mapped"] === "string" && step.outputs["mapped"].length <= 8_000) safe["mapped"] = step.outputs["mapped"];
    if (typeof step.outputs["mappedCount"] === "number" && Number.isInteger(step.outputs["mappedCount"]) && step.outputs["mappedCount"] >= 0 && step.outputs["mappedCount"] <= 50) safe["mappedCount"] = step.outputs["mappedCount"];
    const mappedConfig = node.config["mapping"];
    if (typeof mappedConfig === "string") {
      const mappedFields = mappedConfig.split(/\\r?\\n/);
      for (const line of mappedFields) {
        const separator = line.indexOf("=");
        if (separator < 1) continue;
        const key = line.slice(0, separator).trim();
        if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(key) || key === "mapped" || key === "mappedCount") continue;
        const value = step.outputs[key];
        if (typeof value === "string" && value.length <= 2_000) safe[key] = value;
      }
    }
    const { outputs: _discarded, ...rest } = step;
    return Object.keys(safe).length ? { ...rest, outputs: safe } : rest;
  }
  if (!action) {
    const { outputs: _discarded, ...rest } = step;
    return rest;
  }
  const safe: Record<string, string | number | boolean> = Object.create(null) as Record<string, string | number | boolean>;
  for (const field of action.output.fields) {
    if (!Object.prototype.hasOwnProperty.call(step.outputs, field)) continue;
    const value = step.outputs[field];
    if (field === "accepted") {
      if (value === true || value === false) safe[field] = value;
      else if (value === "true" || value === "false") safe[field] = value === "true";
    } else if (field === "httpStatus") {
      if (typeof value === "number" && Number.isInteger(value) && value >= 100 && value <= 599) safe[field] = value;
      else if (typeof value === "string" && /^[1-5]\\d\\d$/.test(value)) safe[field] = Number(value);
    } else if (field === "providerMessageId" && typeof value === "string" && /^[A-Za-z0-9_-]{1,256}$/.test(value)) {
      safe[field] = value;
    }
  }
  const { outputs: _discarded, ...rest } = step;
  return Object.keys(safe).length ? { ...rest, outputs: safe } : rest;
}
