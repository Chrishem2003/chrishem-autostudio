/**
 * Explicit rollout gates for features that can cause external side effects.
 * Missing, misspelled, or any value other than the literal "true" is disabled.
 */
export type RuntimeEnvironment = Record<string, string | undefined>;

export function isDurableQueueEnabled(env: RuntimeEnvironment = process.env): boolean {
  return env["AUTOSTUDIO_DURABLE_QUEUE_ENABLED"] === "true";
}

/**
 * The worker has its own rollout gate so operators can verify the protected,
 * empty-queue endpoint before enabling producers. Missing means disabled.
 */
export function isDurableQueueWorkerEnabled(env: RuntimeEnvironment = process.env): boolean {
  return env["AUTOSTUDIO_DURABLE_QUEUE_WORKER_ENABLED"] === "true";
}

export function isOutboundTransportReady(env: RuntimeEnvironment = process.env): boolean {
  return env["AUTOSTUDIO_OUTBOUND_TRANSPORT_READY"] === "true";
}
