export type OutboundGateEnvironment = Record<string, string | undefined>;

export const OUTBOUND_TRANSPORT_DISABLED_MESSAGE =
  "Outbound provider transport is disabled by rollout policy. No external request was sent.";

/** One fail-closed gate for every live provider transport, including Gmail. */
export function outboundTransportGateError(
  env: OutboundGateEnvironment = process.env,
): string | null {
  return env["AUTOSTUDIO_OUTBOUND_TRANSPORT_READY"] === "true"
    ? null
    : OUTBOUND_TRANSPORT_DISABLED_MESSAGE;
}
