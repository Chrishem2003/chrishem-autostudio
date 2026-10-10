/**
 * Explicit rollout gates for features that can cause external side effects.
 * Missing, misspelled, or any value other than the literal "true" is disabled.
 */
export type RuntimeEnvironment = Record<string, string | undefined>;

export function isDurableQueueEnabled(env: RuntimeEnvironment = process.env): boolean {
  return env["AUTOSTUDIO_DURABLE_QUEUE_ENABLED"] === "true";
}

export function isOutboundTransportReady(env: RuntimeEnvironment = process.env): boolean {
  return env["AUTOSTUDIO_OUTBOUND_TRANSPORT_READY"] === "true";
}
