import { preparePersistedExecutionPlan, type PreparedExecutionPlan } from "@/lib/prepare-execution-plan";
export type PreparedExecutionGate<T> = { success: true; value: T } | { success: false; error: string };
/** Invalid saved workflows never reach the caller's capability-preflight callback. */
export async function withPreparedExecutionPlan<T>(value: unknown, preflight: (prepared: Extract<PreparedExecutionPlan, { success: true }>) => T | Promise<T>): Promise<PreparedExecutionGate<Awaited<T>>> {
 const prepared = preparePersistedExecutionPlan(value);
 if (!prepared.success) return prepared;
 return { success: true, value: await preflight(prepared) };
}
