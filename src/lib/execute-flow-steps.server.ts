import { executeStepSafely } from "@/lib/execute-step-safely.server";
import { classifyExecutionOutcome } from "@/lib/execution-outcome";
import { executeStep, type ExecutionMode, type ExecutedStep } from "@/lib/execute-step.server";
import type { WorkflowNode } from "@/lib/workflow";
import { resolveStepConfig, type SafeStepOutput } from "@/lib/runtime-data-mapping";
import { validateStepMappings } from "@/lib/validate-step-mappings";

export interface StepIntent { id: string; }
export interface ExecuteFlowStepsInput {
  nodes: WorkflowNode[];
  flowName: string;
  userId: string;
  mode: ExecutionMode;
  startedAtMs: number;
  maxRuntimeMs: number;
  execute?: typeof executeStep;
  persistIntent: (node: WorkflowNode, index: number) => Promise<StepIntent | null>;
  persistOutcome: (intentId: string, step: ExecutedStep, outcomeState: ReturnType<typeof classifyExecutionOutcome>) => Promise<boolean>;
  onUnexpectedError?: (node: WorkflowNode, error: unknown) => void;
  onPersistenceError?: (stage: "intent" | "outcome", node: WorkflowNode) => void;
}
export interface ExecuteFlowStepsResult { steps: ExecutedStep[]; failed: boolean; }

/** Shared ordered traversal with full-flow mapping validation before any executor is called. */
export async function executeFlowSteps(input: ExecuteFlowStepsInput): Promise<ExecuteFlowStepsResult> {
  const steps: ExecutedStep[] = [];
  const priorOutputs: Record<string, SafeStepOutput> = {};

  const mappingError = validateStepMappings(input.nodes);
  if (mappingError) {
    const nodeIndex = input.nodes.findIndex((node) => node.id === mappingError.nodeId);
    const node = input.nodes[nodeIndex] ?? input.nodes[0];
    if (!node) return { steps: [], failed: true };
    let intent: StepIntent | null = null;
    try { intent = await input.persistIntent(node, Math.max(0, nodeIndex)); } catch { /* fail closed */ }
    const failedStep: ExecutedStep = {
      nodeId: node.id,
      label: node.name.slice(0, 160),
      status: "failed",
      ms: 0,
      detail: `Flow mapping preflight failed before any step executed: ${mappingError.error} No external action was attempted.`,
    };
    if (!intent) {
      input.onPersistenceError?.("intent", node);
      return { steps: [failedStep], failed: true };
    }
    let persisted = false;
    try {
      persisted = await input.persistOutcome(intent.id, failedStep, "not_attempted");
    } catch { persisted = false; }
    if (!persisted) input.onPersistenceError?.("outcome", node);
    return {
      steps: [persisted ? failedStep : { ...failedStep, detail: "Mapping preflight failed and its outcome could not be safely recorded. No external action was attempted." }],
      failed: true,
    };
  }

  for (let index = 0; index < input.nodes.length; index++) {
    const node = input.nodes[index]!;
    if (steps.some((step) => step.status === "failed")) break;

    let intent: StepIntent | null;
    try { intent = await input.persistIntent(node, index); } catch { intent = null; }
    if (!intent) {
      input.onPersistenceError?.("intent", node);
      steps.push({ nodeId: node.id, label: node.name.slice(0, 160), status: "failed", ms: 0,
        detail: "Could not persist the step intent. No action was attempted; remaining steps were halted." });
      break;
    }

    let step: ExecutedStep;
    if (Date.now() - input.startedAtMs >= input.maxRuntimeMs) {
      step = { nodeId: node.id, label: node.name.slice(0, 160), status: "failed", ms: 0,
        detail: "The flow exceeded its execution budget. No action was attempted for this step; remaining steps were halted." };
    } else {
      const resolution = resolveStepConfig(node.config, priorOutputs);
      if (!resolution.ok) {
        step = { nodeId: node.id, label: node.name.slice(0, 160), status: "failed", ms: 0,
          detail: `Data mapping failed before the external action: ${resolution.error} No action was attempted.` };
      } else {
        step = await executeStepSafely({
          node: { ...node, config: resolution.config },
          flowName: input.flowName, userId: input.userId, mode: input.mode,
          ...(input.execute ? { execute: input.execute } : {}),
          onUnexpectedError: (error) => input.onUnexpectedError?.(node, error),
        });
      }
    }

    const outcomeState = classifyExecutionOutcome(step.status, step.detail);
    let persisted = false;
    try { persisted = await input.persistOutcome(intent.id, step, outcomeState); } catch { persisted = false; }
    if (!persisted) {
      input.onPersistenceError?.("outcome", node);
      steps.push({ ...step, status: "failed", detail: "The step outcome could not be safely recorded. Verify external effects before retrying." });
      break;
    }
    steps.push(step);
    if (step.status === "success" && step.outputs) priorOutputs[node.id] = step.outputs;
  }

  return { steps, failed: steps.some((step) => step.status === "failed") };
}
