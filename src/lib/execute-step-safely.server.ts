import { executeStep, type ExecutionMode, type ExecutedStep } from "@/lib/execute-step.server";
import type { WorkflowNode } from "@/lib/workflow";

export interface SafeStepExecutionInput {
  node: WorkflowNode;
  flowName: string;
  userId: string;
  mode: ExecutionMode;
  onUnexpectedError?: (error: unknown) => void;
}

/**
 * Shared manual/scheduled execution boundary. Unexpected exceptions become a
 * conservative failed result rather than bypassing the durable intent record.
 * The caller remains responsible for persisting intent and final outcome.
 */
export async function executeStepSafely(input: SafeStepExecutionInput): Promise<ExecutedStep> {
  const { onUnexpectedError, ...stepInput } = input;
  try {
    return await executeStep(stepInput);
  } catch (error) {
    onUnexpectedError?.(error);
    return {
      nodeId: input.node.id,
      label: input.node.name.slice(0, 160),
      status: "failed",
      ms: 0,
      detail: "The step stopped unexpectedly. Its external outcome may be uncertain; verify the destination before retrying.",
    };
  }
}
