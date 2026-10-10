import { planLinearExecution, type ExecutionPlan } from "@/lib/execution-plan";
import { parsePersistedWorkflow, type PersistedWorkflowShape } from "@/lib/persisted-workflow";

export type PreparedExecutionPlan =
  | { success: true; workflow: PersistedWorkflowShape; plan: ExecutionPlan }
  | { success: false; error: string };

/**
 * Shared trust boundary for saved workflow JSON entering execution paths.
 * Parsing and graph/mapping validation must both pass before enqueueing,
 * creating a run intent, or invoking an executor.
 */
export function preparePersistedExecutionPlan(value: unknown): PreparedExecutionPlan {
  const parsed = parsePersistedWorkflow(value);
  if (!parsed.success) {
    return {
      success: false,
      error: "The saved automation is invalid. Open it in the builder and save a corrected version.",
    };
  }

  const plan = planLinearExecution(parsed.data);
  if (plan.error) return { success: false, error: plan.error };

  return { success: true, workflow: parsed.data, plan };
}
