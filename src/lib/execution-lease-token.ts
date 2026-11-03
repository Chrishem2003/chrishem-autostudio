/** Runtime validator for opaque database lease tokens crossing an RPC boundary. */
export function isValidExecutionLeaseToken(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 200
    && value.trim() === value
    && !/\s/.test(value);
}
