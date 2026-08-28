import type { NodeKind } from "@/lib/automation-catalog";

export const KIND_STYLE: Record<NodeKind, { chip: string; dot: string; ring: string; stroke: string }> = {
  trigger: {
    chip: "bg-trigger/12 text-trigger border-trigger/40",
    dot: "bg-trigger",
    ring: "border-trigger/60",
    stroke: "var(--trigger)",
  },
  logic: {
    chip: "bg-logic/12 text-logic border-logic/40",
    dot: "bg-logic",
    ring: "border-logic/60",
    stroke: "var(--logic)",
  },
  ai: {
    chip: "bg-ai/12 text-ai border-ai/40",
    dot: "bg-ai",
    ring: "border-ai/60",
    stroke: "var(--ai)",
  },
  action: {
    chip: "bg-action/12 text-action border-action/40",
    dot: "bg-action",
    ring: "border-action/60",
    stroke: "var(--action)",
  },
  output: {
    chip: "bg-output/12 text-output border-output/40",
    dot: "bg-output",
    ring: "border-output/60",
    stroke: "var(--output)",
  },
};
