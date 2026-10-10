import type { Workflow, WorkflowNode } from "@/lib/workflow";

export interface ExecutionPlan {
  nodes: WorkflowNode[];
  error: null;
}

export interface InvalidExecutionPlan {
  nodes: [];
  error: string;
}

export type ExecutionPlanResult = ExecutionPlan | InvalidExecutionPlan;

/**
 * Build the execution order for the currently supported live-engine contract.
 *
 * Until conditional/parallel graph semantics are implemented, live execution
 * accepts only a single connected, acyclic chain with exactly one trigger.
 * This deliberately rejects graphs that a simple topological sort would
 * silently flatten into misleading execution order.
 */
export function planLinearExecution(flow: Pick<Workflow, "nodes" | "edges">): ExecutionPlanResult {
  const { nodes, edges } = flow;
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return { nodes: [], error: "Add at least one step before running this flow." };
  }
  if (!Array.isArray(edges)) {
    return { nodes: [], error: "The flow connections are invalid. Reopen the builder and save the flow again." };
  }

  const byId = new Map<string, WorkflowNode>();
  for (const node of nodes) {
    if (!node || typeof node.id !== "string" || !node.id.trim() || byId.has(node.id)) {
      return { nodes: [], error: "The flow contains a missing or duplicate step ID." };
    }
    byId.set(node.id, node);
  }

  const outgoing = new Map(nodes.map((node) => [node.id, [] as string[]]));
  const incoming = new Map(nodes.map((node) => [node.id, 0]));
  const edgeKeys = new Set<string>();
  for (const edge of edges) {
    if (!edge || !byId.has(edge.from) || !byId.has(edge.to) || edge.from === edge.to) {
      return { nodes: [], error: "The flow contains an invalid connection. Fix the canvas links before running." };
    }
    const key = `${edge.from}\u0000${edge.to}`;
    if (edgeKeys.has(key)) {
      return { nodes: [], error: "The flow contains a duplicate connection. Remove the duplicate link before running." };
    }
    edgeKeys.add(key);
    outgoing.get(edge.from)!.push(edge.to);
    incoming.set(edge.to, incoming.get(edge.to)! + 1);
  }

  if (nodes.filter((node) => node.defId.startsWith("trigger.")).length !== 1) {
    return { nodes: [], error: "Live execution currently requires exactly one trigger per flow." };
  }
  if (edges.length !== nodes.length - 1) {
    return { nodes: [], error: "Live execution currently supports one connected chain. Branching, parallel paths, and disconnected steps are not yet supported." };
  }
  if (outgoing.size && [...outgoing.values()].some((targets) => targets.length > 1)) {
    return { nodes: [], error: "Branching is not supported by the current live executor. Simplify this flow to one chain before running it." };
  }
  if ([...incoming.values()].some((count) => count > 1)) {
    return { nodes: [], error: "Joining parallel paths is not supported by the current live executor." };
  }

  const roots = nodes.filter((node) => incoming.get(node.id) === 0);
  if (roots.length !== 1 || !roots[0]!.defId.startsWith("trigger.")) {
    return { nodes: [], error: "The flow must start with one trigger and every step must be connected to it." };
  }

  const ordered: WorkflowNode[] = [];
  const visited = new Set<string>();
  let current: WorkflowNode | undefined = roots[0];
  while (current) {
    if (visited.has(current.id)) {
      return { nodes: [], error: "The flow contains a cycle. Remove the loop before running it." };
    }
    visited.add(current.id);
    ordered.push(current);
    const nextId = outgoing.get(current.id)![0];
    current = nextId ? byId.get(nextId) : undefined;
  }

  if (ordered.length !== nodes.length) {
    return { nodes: [], error: "Some steps are disconnected or the flow contains a cycle. Connect every step in one chain." };
  }

  return { nodes: ordered, error: null };
}
