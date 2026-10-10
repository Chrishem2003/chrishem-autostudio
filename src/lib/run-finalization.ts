import type { ExecutedStep, ExecutionMode } from "@/lib/execute-step.server";

export type RunFinalStatus = "success" | "failed" | "dry_run";

export interface RunFinalization {
  status: RunFinalStatus;
  finishedAt: string;
  durationMs: number;
  errorSummary: string | null;
}

/** Produce one consistent terminal summary for manual and scheduled runs. */
export function buildRunFinalization(input: {
  steps: ExecutedStep[];
  mode: ExecutionMode;
  startedAtMs: number;
  finishedAt?: Date;
}): RunFinalization {
  const failedStep = input.steps.find((step) => step.status === "failed");
  const finishedAt = input.finishedAt ?? new Date();
  return {
    status: failedStep ? "failed" : input.mode === "dry" ? "dry_run" : "success",
    finishedAt: finishedAt.toISOString(),
    durationMs: Math.max(0, finishedAt.getTime() - input.startedAtMs),
    errorSummary: failedStep ? failedStep.detail.slice(0, 500) : null,
  };
}
