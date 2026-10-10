import { executeStepSafely } from "@/lib/execute-step-safely.server";
import { classifyExecutionOutcome } from "@/lib/execution-outcome";
import type { ExecutionMode, ExecutedStep } from "@/lib/execute-step.server";
import type { WorkflowNode } from "@/lib/workflow";

export interface StepIntent {
  id: string;
}

export interface ExecuteFlowStepsInput {
  nodes: WorkflowNode[];
  flowName: string;
  userId: string;
  mode: ExecutionMode;
  startedAtMs: number;
  maxRuntimeMs: number;
  persistIntent: (node: WorkflowNode, index: number) => Promise<StepIntent | null>;
  persistOutcome: (intentId: string, step: ExecutedStep, outcomeState: ReturnType<typeof classifyExecutionOutcome>) => Promise<boolean>;
  onUnexpectedError?: (node: WorkflowNode, error: unknown) => void;
  onPersistenceError?: (stage: "intent" | "outcome", node: WorkflowNode) => void;
}

export interface ExecuteFlowStepsResult {
  steps: ExecutedStep[];
  failed: boolean;
}

/**
 * Shared ordered flow traversal for manual and scheduled triggers.
 * Persistence and lease ownership remain with the trigger adapters, while
 * step ordering, budget checks, fail-stop behavior and certainty classification
 * are kept in one implementation.
 */
export async function executeFlowSteps(input: ExecuteFlowStepsInput): Promise<ExecuteFlowStepsResult> {
  const steps: ExecutedStep[] = [];

  for (let index = 0; index < input.nodes.length; index++) {
    const node = input.nodes[index]!;
    if (steps.some((step) => step.status === "failed")) break;

    let intent: StepIntent | null;
    try {
      intent = await input.persistIntent(node, index);
    } catch {
      intent = null;
    }
    if (!intent) {
      input.onPersistenceError?.("intent", node);
      steps.push({
        nodeId: node.id,
        label: node.name.slice(0, 160),
        status: "failed",
        ms: 0,
        detail: "Could not persist the step intent. No action was attempted; remaining steps were halted.",
      });
      break;
    }

    let step: ExecutedStep;
    if (Date.now() - input.startedAtMs >= input.maxRuntimeMs) {
      step = {
        nodeId: node.id,
        label: node.name.slice(0, 160),
        status: "failed",
        ms: 0,
        detail: "The flow exceeded its execution budget. Remaining steps were halted.",
      };
    } else {
      step = await executeStepSafely({
        node,
        flowName: input.flowName,
        userId: input.userId,
        mode: input.mode,
        onUnexpectedError: (error) => input.onUnexpectedError?.(node, error),
      });
    }

    const outcomeState = classifyExecutionOutcome(step.status, step.detail);
    let persisted = false;
    try {
      persisted = await input.persistOutcome(intent.id, step, outcomeState);
    } catch {
      persisted = false;
    }
    if (!persisted) {
      input.onPersistenceError?.("outcome", node);
      steps.push({
        ...step,
        status: "failed",
        detail: "The step outcome could not be safely recorded. Verify external effects before retrying.",
      });
      break;
    }
    steps.push(step);
  }

  return { steps, failed: steps.some((step) => step.status === "failed") };
}
