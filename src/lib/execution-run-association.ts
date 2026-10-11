export interface ExecutionRunAssociationDependencies {
  createRun: () => Promise<{ runId: string | null; failed?: boolean }>;
  attachRun: (runId: string) => Promise<{ attached: boolean }>;
  onRunCreated?: (runId: string) => void;
}

/**
 * Fail-closed boundary for a durable queue job's audit run. The caller must
 * await this function before starting any workflow/provider step.
 */
export async function createAndAttachExecutionJobRun(
  dependencies: ExecutionRunAssociationDependencies,
): Promise<string> {
  const created = await dependencies.createRun();
  if (created.failed || !created.runId) {
    throw new Error("Could not persist the queued run before execution; no workflow steps were started.");
  }

  dependencies.onRunCreated?.(created.runId);

  let association: { attached: boolean };
  try {
    association = await dependencies.attachRun(created.runId);
  } catch {
    throw new Error("Could not associate queued job with its audit run; execution halted.");
  }
  if (!association.attached) {
    throw new Error("Could not associate queued job with its audit run; execution halted.");
  }

  return created.runId;
}
