import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { Canvas } from "@/components/studio/Canvas";
import { Palette } from "@/components/studio/Palette";
import { Inspector } from "@/components/studio/Inspector";
import { RunPanel } from "@/components/studio/RunPanel";
import { CopilotBar } from "@/components/studio/CopilotBar";
import { TimeTravelPanel } from "@/components/studio/TimeTravelPanel";
import { HealingPanel } from "@/components/studio/HealingPanel";
import { MappingPanel } from "@/components/studio/MappingPanel";
import { TEMPLATES, VERTICALS } from "@/lib/automation-catalog";
import { impactOf } from "@/lib/impact";
import type { Plan } from "@/lib/intent";
import {
  STORAGE_KEY,
  blankWorkflow,
  exportForN8n,
  makeNode,
  simulateRun,
  uid,
  validate,
  workflowFromTemplate,
  type RunStep,
  type Workflow,
} from "@/lib/workflow";
import { cn } from "@/lib/utils";

type PanelTab = "run" | "time" | "heal" | "map" | "templates";

const TAB_LABEL: Record<PanelTab, string> = {
  run: "Run",
  time: "Time-travel",
  heal: "Healing",
  map: "Mapping",
  templates: "Templates",
};

interface Props {
  embedded?: boolean;
  initialVertical?: string | undefined;
  initialTemplate?: string | undefined;
}

export function Studio({ embedded = false, initialVertical, initialTemplate }: Props) {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [steps, setSteps] = useState<RunStep[]>([]);
  const [running, setRunning] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [tab, setTab] = useState<PanelTab>("run");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let loaded: Workflow[] = [];
    if (!embedded) {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) loaded = JSON.parse(raw) as Workflow[];
      } catch {
        loaded = [];
      }
    }
    if (loaded.length === 0) {
      const tplId = initialTemplate && TEMPLATES.some((t) => t.id === initialTemplate) ? initialTemplate : null;
      const base = tplId ? workflowFromTemplate(tplId) : workflowFromTemplate("lead-router");
      loaded = [initialVertical ? { ...base, vertical: initialVertical } : base];
    }
    setWorkflows(loaded);
    setActiveId(loaded[0]?.id ?? null);
    setHydrated(true);
  }, [embedded, initialTemplate, initialVertical]);

  useEffect(() => {
    if (!hydrated || embedded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(workflows));
    } catch {
      /* storage full or blocked — the canvas keeps working in memory */
    }
  }, [workflows, hydrated, embedded]);

  const active = workflows.find((w) => w.id === activeId) ?? null;
  const selected = active?.nodes.find((n) => n.id === selectedId) ?? null;
  const issues = useMemo(() => (active ? validate(active) : []), [active]);
  const impact = useMemo(() => impactOf(workflows), [workflows]);

  const commit = (next: Workflow[]) => {
    setPast((p) => [...p.slice(-40), workflows]);
    setFuture([]);
    setWorkflows(next);
  };

  const update = (fn: (wf: Workflow) => Workflow) =>
    setWorkflows((prev) => {
      setPast((p) => [...p.slice(-40), prev]);
      setFuture([]);
      return prev.map((w) => (w.id === activeId ? { ...fn(w), updatedAt: Date.now() } : w));
    });

  const undo = () => {
    setPast((p) => {
      if (p.length === 0) return p;
      const prevState = p[p.length - 1]!;
      setFuture((f) => [workflows, ...f].slice(0, 40));
      setWorkflows(prevState);
      return p.slice(0, -1);
    });
  };

  const redo = () => {
    setFuture((f) => {
      if (f.length === 0) return f;
      const nextState = f[0]!;
      setPast((p) => [...p, workflows]);
      setWorkflows(nextState);
      return f.slice(1);
    });
  };

  const setConfig = (id: string, key: string, value: string) =>
    update((w) => ({
      ...w,
      nodes: w.nodes.map((n) => (n.id === id ? { ...n, config: { ...n.config, [key]: value } } : n)),
    }));

  const addNode = (defId: string, x?: number, y?: number) => {
    if (!active) return;
    const node = makeNode(defId, x ?? 120 + active.nodes.length * 40, y ?? 120 + (active.nodes.length % 4) * 150);
    const tail = orderedNodes(active).at(-1);
    update((w) => ({
      ...w,
      nodes: [...w.nodes, node],
      edges: tail && NODES[defId]?.kind !== "trigger" ? [...w.edges, { id: uid("e"), from: tail.id, to: node.id }] : w.edges,
    }));
    setSelectedId(node.id);
  };

  const duplicateNode = (id: string) => {
    if (!active) return;
    const src = active.nodes.find((n) => n.id === id);
    if (!src) return;
    const copy = { ...src, id: uid("n"), x: src.x + 32, y: src.y + 44, name: `${src.name} copy` };
    update((w) => ({ ...w, nodes: [...w.nodes, copy] }));
    setSelectedId(copy.id);
  };

  const buildPlanWorkflow = (plan: Plan): Workflow => {
    const nodes = plan.steps.map((s, i) => {
      const node = makeNode(s.defId, 60 + i * 300, 110);
      return { ...node, name: s.name, config: { ...s.config } };
    });
    const edges = nodes.slice(1).map((n, i) => ({ id: uid("e"), from: nodes[i]!.id, to: n.id }));
    return {
      id: uid("wf"),
      name: plan.intent.length > 46 ? `${plan.intent.slice(0, 46)}…` : plan.intent,
      vertical: active?.vertical ?? VERTICALS[0]!.id,
      nodes,
      edges,
      live: false,
      updatedAt: Date.now(),
    };
  };

  const applyPlan = (plan: Plan, mode: "new" | "append" = "new") => {
    if (plan.steps.length === 0) return;
    if (mode === "append" && active) {
      const startIndex = active.nodes.length;
      const nodes = plan.steps.map((s, i) => {
        const node = makeNode(s.defId, 60 + (startIndex + i) * 300, 110 + (startIndex % 2) * 200);
        return { ...node, name: s.name, config: { ...s.config } };
      });
      const edges = nodes.slice(1).map((n, i) => ({ id: uid("e"), from: nodes[i]!.id, to: n.id }));
      update((w) => autoLayout(autoChain({ ...w, nodes: [...w.nodes, ...nodes], edges: [...w.edges, ...edges] })));
      setSelectedId(nodes[0]!.id);
      setTab("map");
      toast.success(`Added ${nodes.length} steps to ${active.name}.`);
      return;
    }
    const wf = autoLayout(buildPlanWorkflow(plan));
    commit([...workflows, wf]);
    setActiveId(wf.id);
    setSelectedId(wf.nodes[0]?.id ?? null);
    setTab("map");
    toast.success(`Provisioned ${wf.nodes.length} connected steps.`);
  };

  const runFlow = () => {
    if (!active) return;
    const result = simulateRun(active);
    if (result.length === 0) {
      toast.error("Nothing to run yet — add and connect a couple of steps.");
      return;
    }
    setSteps([]);
    setRunning(true);
    setTab("run");
    result.forEach((s, i) => {
      window.setTimeout(() => {
        setRunningId(s.nodeId);
        setSteps((prev) => [...prev, s]);
        if (i === result.length - 1) {
          setRunning(false);
          setRunningId(null);
          const failed = result.filter((r) => r.status === "failed").length;
          if (failed) toast.error(`Run finished with ${failed} failed step${failed > 1 ? "s" : ""}.`);
          else toast.success("Run completed successfully.");
        }
      }, 320 * (i + 1));
    });
  };

  const exportFlow = async () => {
    if (!active) return;
    const json = JSON.stringify(exportForN8n(active), null, 2);
    try {
      await navigator.clipboard.writeText(json);
      toast.success("Workflow JSON copied — paste it into n8n.");
    } catch {
      toast.message("Copy blocked by the browser", { description: "Open the console to grab the JSON." });
      console.log(json);
    }
  };

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <Toaster />
      <header className="flex flex-wrap items-center gap-3 border-b border-border bg-surface px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-md bg-primary font-display text-sm font-bold text-primary-foreground">
            A
          </span>
          <div>
            <h1 className="font-display text-sm font-semibold leading-tight">Automation Studio</h1>
            <p className="mono-label">Describe the outcome — we build the pipeline</p>
          </div>
        </div>

        <div className="mx-2 hidden h-7 w-px bg-border sm:block" />

        <select
          value={active?.id ?? ""}
          onChange={(e) => {
            setActiveId(e.target.value);
            setSelectedId(null);
            setSteps([]);
          }}
          className="rounded-lg border border-input bg-surface-raised px-2.5 py-1.5 text-sm outline-none focus:border-primary"
        >
          {workflows.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>

        <button
          onClick={() => {
            const wf = blankWorkflow(active?.vertical);
            setWorkflows((prev) => [...prev, wf]);
            setActiveId(wf.id);
            setSelectedId(null);
            setSteps([]);
          }}
          className="rounded-lg border border-border px-2.5 py-1.5 text-sm transition-colors hover:border-primary/60"
        >
          + New flow
        </button>

        <select
          value={active?.vertical ?? ""}
          onChange={(e) => update((w) => ({ ...w, vertical: e.target.value }))}
          className="rounded-lg border border-input bg-surface-raised px-2.5 py-1.5 text-sm outline-none focus:border-primary"
        >
          {VERTICALS.map((v) => (
            <option key={v.id} value={v.id}>
              {v.glyph} {v.name}
            </option>
          ))}
        </select>

        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-[11px] text-muted-foreground xl:block">
            {impact.hoursSaved.toLocaleString()} h saved · {impact.errorsBlocked.toLocaleString()} errors blocked
          </span>
          {!embedded ? (
            <nav className="hidden items-center gap-2 text-xs md:flex">
              <Link to="/marketplace" className="text-muted-foreground hover:text-foreground">
                Marketplace
              </Link>
              <Link to="/impact" className="text-muted-foreground hover:text-foreground">
                Impact
              </Link>
              <Link to="/sdk" className="text-muted-foreground hover:text-foreground">
                Embed SDK
              </Link>
            </nav>
          ) : null}
          {active ? (
            <>
              <button
                onClick={() => update((w) => ({ ...w, live: !w.live }))}
                className={cn(
                  "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                  active.live
                    ? "border-action/60 bg-action/15 text-action"
                    : "border-border text-muted-foreground hover:border-primary/60",
                )}
              >
                <span className={cn("size-1.5 rounded-full", active.live ? "bg-action" : "bg-muted-foreground")} />
                {active.live ? "Live" : "Paused"}
              </button>
              {workflows.length > 1 ? (
                <button
                  onClick={() => {
                    const rest = workflows.filter((w) => w.id !== active.id);
                    setWorkflows(rest);
                    setActiveId(rest[0]?.id ?? null);
                    setSelectedId(null);
                  }}
                  className="text-xs text-muted-foreground transition-colors hover:text-destructive"
                >
                  Delete flow
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      </header>

      <div className="grid min-h-0 min-w-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[17rem_minmax(0,1fr)_20rem]">
        <aside className="hidden min-h-0 min-w-0 border-r border-border bg-surface lg:block">
          {active ? <Palette vertical={active.vertical} onAdd={(id) => addNode(id)} /> : null}
        </aside>

        <main className="relative flex min-h-0 min-w-0 flex-col overflow-hidden">
          {active ? (
            <>
              <div className="border-b border-border bg-surface/60 p-3">
                <CopilotBar vertical={active.vertical} onApply={applyPlan} />
              </div>
              <div className="relative min-h-0 flex-1 overflow-hidden">
                <div className="pointer-events-none absolute left-4 top-4 z-10 max-w-sm rounded-lg border border-border bg-card/85 px-3 py-2 backdrop-blur">
                  <p className="text-sm font-semibold">{active.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {VERTICALS.find((v) => v.id === active.vertical)?.tagline}
                  </p>
                </div>
                <Canvas
                  workflow={active}
                  selectedId={selectedId}
                  runningId={runningId}
                  onSelect={setSelectedId}
                  onMove={(id, x, y) =>
                    update((w) => ({ ...w, nodes: w.nodes.map((n) => (n.id === id ? { ...n, x, y } : n)) }))
                  }
                  onConnect={(from, to) =>
                    update((w) =>
                      w.edges.some((e) => e.from === from && e.to === to)
                        ? w
                        : { ...w, edges: [...w.edges, { id: uid("e"), from, to }] },
                    )
                  }
                  onDelete={(id) => {
                    update((w) => ({
                      ...w,
                      nodes: w.nodes.filter((n) => n.id !== id),
                      edges: w.edges.filter((e) => e.from !== id && e.to !== id),
                    }));
                    setSelectedId((cur) => (cur === id ? null : cur));
                  }}
                  onDropNode={(defId, x, y) => addNode(defId, x, y)}
                />
              </div>
            </>
          ) : (
            <div className="grid h-full place-items-center text-sm text-muted-foreground">
              Create a flow to get started.
            </div>
          )}
        </main>

        <aside className="flex min-h-0 min-w-0 flex-col border-l border-border bg-surface">
          <div className="flex border-b border-border">
            {(Object.keys(TAB_LABEL) as PanelTab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "flex-1 px-1.5 py-2 text-[10px] font-semibold uppercase tracking-wider transition-colors",
                  tab === t ? "border-b-2 border-primary text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {TAB_LABEL[t]}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-hidden">
            {tab === "run" ? (
              <RunPanel
                issues={issues}
                steps={steps}
                running={running}
                onRun={runFlow}
                onExport={exportFlow}
                onSelectNode={setSelectedId}
              />
            ) : tab === "time" && active ? (
              <TimeTravelPanel workflow={active} onSelectNode={setSelectedId} />
            ) : tab === "heal" && active ? (
              <HealingPanel workflow={active} onHeal={setConfig} onSelectNode={setSelectedId} />
            ) : tab === "map" && active ? (
              <MappingPanel workflow={active} node={selected} onApply={setConfig} />
            ) : (
              <div className="h-full space-y-2 overflow-y-auto p-3">
                <p className="mono-label">Start from a proven flow · {TEMPLATES.length} ready</p>
                {TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      const wf = workflowFromTemplate(t.id);
                      setWorkflows((prev) => [...prev, wf]);
                      setActiveId(wf.id);
                      setSelectedId(null);
                      setSteps([]);
                      setTab("run");
                      toast.success(`${t.name} added to your flows.`);
                    }}
                    className="w-full rounded-lg border border-border bg-card/60 p-3 text-left transition-colors hover:border-primary/60 hover:bg-card"
                  >
                    <p className="text-sm font-semibold">{t.name}</p>
                    <p className="mono-label mt-0.5">
                      {VERTICALS.find((v) => v.id === t.vertical)?.name} · {t.chain.length} steps
                    </p>
                    <p className="mt-1.5 text-xs text-muted-foreground">{t.description}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="max-h-[38%] min-h-0 border-t border-border">
            {active ? (
              <Inspector
                workflow={active}
                node={selected}
                onRename={(id, name) =>
                  update((w) => ({ ...w, nodes: w.nodes.map((n) => (n.id === id ? { ...n, name } : n)) }))
                }
                onConfig={setConfig}
                onDisconnect={(edgeId) => update((w) => ({ ...w, edges: w.edges.filter((e) => e.id !== edgeId) }))}
              />
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
