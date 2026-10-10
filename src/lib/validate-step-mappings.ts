import { NODES } from "@/lib/automation-catalog";
import { getConnectorActionForNode } from "@/lib/connector-manifests";
import type { WorkflowNode } from "@/lib/workflow";

const TOKEN = /\{\{steps\.([A-Za-z0-9_-]+)\.([A-Za-z][A-Za-z0-9_]*)\}\}/g;

export interface StepMappingValidationError {
  nodeId: string;
  error: string;
}

function allowedMappingKeys(node: WorkflowNode): ReadonlySet<string> {
  if (node.defId === "action.gmail") return new Set(["subject", "body"]);
  if (node.defId === "action.http") return new Set(["body"]);
  if (node.defId === "action.slack" ||
      (node.defId.startsWith("app.") && node.defId.endsWith(".create.message"))) {
    return new Set(["message"]);
  }
  return new Set();
}

/** Validate every mapping before execution so later bad references cannot follow earlier side effects. */
export function validateStepMappings(nodes: readonly WorkflowNode[]): StepMappingValidationError | null {
  const priorNodes = new Map<string, WorkflowNode>();

  for (const node of nodes) {
    const allowedKeys = allowedMappingKeys(node);
    for (const [key, rawValue] of Object.entries(node.config)) {
      if (typeof rawValue !== "string") {
        return { nodeId: node.id, error: `Step "${node.name}" has a non-text configuration value.` };
      }
      if (!rawValue.includes("{{") && !rawValue.includes("}}")) continue;
      if (!allowedKeys.has(key)) {
        return { nodeId: node.id, error: `Data mapping is not allowed for "${key}" on step "${node.name}".` };
      }

      let malformed = false;
      let invalidReference: string | null = null;
      const replaced = rawValue.replace(TOKEN, (_token, sourceId: string, field: string) => {
        const source = priorNodes.get(sourceId);
        if (!source) {
          invalidReference = `steps.${sourceId}.${field} is not an earlier step`;
          return "";
        }
        const sourceTool = NODES[source.defId]?.tool;
        const sourceAction = getConnectorActionForNode(source.defId, sourceTool)?.action;
        if (!sourceAction?.output.fields.includes(field)) {
          invalidReference = `steps.${sourceId}.${field} is not a declared output`;
          return "";
        }
        return "";
      });
      if (rawValue.includes("{{") || rawValue.includes("}}")) {
        malformed = replaced.includes("{{") || replaced.includes("}}");
      }
      if (malformed) {
        return { nodeId: node.id, error: `Step "${node.name}" contains an invalid or unsupported data token.` };
      }
      if (invalidReference) {
        return { nodeId: node.id, error: `Step "${node.name}" has an invalid data mapping: ${invalidReference}.` };
      }
    }
    priorNodes.set(node.id, node);
  }
  return null;
}
