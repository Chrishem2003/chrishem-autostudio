// @ts-nocheck -- Bun's test runner supplies test types at runtime
import { describe, expect, it } from "bun:test";
import { withPreparedExecutionPlan } from "../prepared-execution-gate";
const valid = { name: "Gate test", nodes: [{ id: "trigger", defId: "trigger.manual", x: 0, y: 0, name: "Start", config: {} }, { id: "request", defId: "action.http", x: 100, y: 0, name: "Request", config: { url: "https://example.com" } }], edges: [{ id: "edge-1", from: "trigger", to: "request" }] };
describe("prepared execution entry-point gate", () => {
 it("rejects malformed workflow JSON before callback execution", async () => { const calls: string[] = []; const result = await withPreparedExecutionPlan({ nodes: [{ id: "broken" }], edges: [] }, async () => { calls.push("preflight"); return true; }); expect(result.success).toBe(false); expect(calls).toEqual([]); });
 it("rejects invalid graph structure before callback execution", async () => { const calls: string[] = []; const result = await withPreparedExecutionPlan({ ...valid, edges: [{ id: "edge-1", from: "trigger", to: "missing" }] }, async () => { calls.push("preflight"); return true; }); expect(result.success).toBe(false); expect(calls).toEqual([]); });
 it("runs callback only after a valid plan is prepared", async () => { const calls: string[] = []; const result = await withPreparedExecutionPlan(valid, async ({ workflow, plan }) => { calls.push("preflight"); return { name: workflow.name, ids: plan.nodes.map((node) => node.id) }; }); expect(result).toEqual({ success: true, value: { name: "Gate test", ids: ["trigger", "request"] } }); expect(calls).toEqual(["preflight"]); });
});
