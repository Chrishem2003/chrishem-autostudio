import { NODES } from "./automation-catalog";
import type { Workflow } from "./workflow";

export interface ImpactMetrics {
  runsPerMonth: number;
  hoursSaved: number;
  errorsBlocked: number;
  revenueUnlocked: number;
  paperSheetsAvoided: number;
  kgCo2Avoided: number;
  automatedSteps: number;
}

/** Value model: each step class removes a measured amount of manual handling per run. */
const MINUTES_PER_STEP: Record<string, number> = {
  trigger: 1.5,
  logic: 1,
  ai: 4,
  action: 2.5,
  output: 1,
};

export function impactOf(workflows: Workflow[]): ImpactMetrics {
  let minutes = 0;
  let steps = 0;
  let runs = 0;
  let value = 0;
  for (const wf of workflows) {
    const perRun = wf.nodes.reduce((sum, n) => {
      const kind = NODES[n.defId]?.kind ?? "action";
      return sum + (MINUTES_PER_STEP[kind] ?? 2);
    }, 0);
    const monthly = wf.live ? 620 : 90;
    runs += monthly;
    steps += wf.nodes.length;
    minutes += perRun * monthly;
    value += monthly * wf.nodes.length * 0.42;
  }
  const hoursSaved = minutes / 60;
  return {
    runsPerMonth: Math.round(runs),
    hoursSaved: Math.round(hoursSaved * 10) / 10,
    errorsBlocked: Math.round(runs * 0.031 * Math.max(1, steps / 6)),
    revenueUnlocked: Math.round(value),
    paperSheetsAvoided: Math.round(runs * 1.4),
    kgCo2Avoided: Math.round(hoursSaved * 0.21 * 10) / 10,
    automatedSteps: steps,
  };
}

export interface MarketplacePack {
  id: string;
  name: string;
  creator: string;
  vertical: string;
  price: number;
  billing: "one-time" | "monthly";
  installs: number;
  rating: number;
  summary: string;
  chain: string[];
  tags: string[];
}

export const PACKS: MarketplacePack[] = [
  {
    id: "pack.lead-velocity",
    name: "Lead Velocity Engine",
    creator: "@growthops",
    vertical: "sales",
    price: 29,
    billing: "monthly",
    installs: 4821,
    rating: 4.9,
    summary: "Qualifies inbound leads, enriches them, runs a credit check and syncs the winners to your CRM.",
    chain: ["trigger.webhook", "ai.classify", "logic.filter", "output.log"],
    tags: ["CRM", "Enrichment", "Scoring"],
  },
  {
    id: "pack.cash-collector",
    name: "Cash Collector",
    creator: "@finflow",
    vertical: "finance",
    price: 49,
    billing: "monthly",
    installs: 2903,
    rating: 4.8,
    summary: "Chases overdue invoices on a polite escalating cadence and stops the moment payment clears.",
    chain: ["trigger.schedule", "logic.filter", "ai.summarize", "output.log"],
    tags: ["Invoicing", "Dunning", "Stripe"],
  },
  {
    id: "pack.support-triage",
    name: "Zero-Backlog Support Triage",
    creator: "@helpdeskhero",
    vertical: "support",
    price: 19,
    billing: "monthly",
    installs: 7640,
    rating: 4.7,
    summary: "Reads every ticket, tags intent and urgency, drafts a reply and escalates only true edge cases.",
    chain: ["trigger.email", "ai.classify", "ai.summarize", "logic.approval"],
    tags: ["Tickets", "Sentiment", "Drafting"],
  },
  {
    id: "pack.clinic-flow",
    name: "Clinic Intake & Follow-up",
    creator: "@carestack",
    vertical: "health",
    price: 79,
    billing: "monthly",
    installs: 1180,
    rating: 4.9,
    summary: "Digitises paper intake, extracts patient fields, books follow-ups and logs everything for audit.",
    chain: ["trigger.webhook", "ai.extract", "logic.approval", "output.log"],
    tags: ["Intake", "OCR", "Compliance"],
  },
  {
    id: "pack.field-supply",
    name: "Field Supply Watchtower",
    creator: "@logisticslab",
    vertical: "logistics",
    price: 0,
    billing: "one-time",
    installs: 5312,
    rating: 4.6,
    summary: "Tracks stock levels across depots, forecasts shortfalls and raises restock orders automatically.",
    chain: ["trigger.schedule", "ai.extract", "logic.filter", "output.log"],
    tags: ["Inventory", "Forecast", "Humanitarian"],
  },
  {
    id: "pack.water-watch",
    name: "Community Water Monitor",
    creator: "@openimpact",
    vertical: "logistics",
    price: 0,
    billing: "one-time",
    installs: 906,
    rating: 5,
    summary: "Ingests sensor readings from boreholes, flags contamination risk and alerts local health officers.",
    chain: ["trigger.webhook", "logic.filter", "ai.summarize", "output.log"],
    tags: ["Sensors", "Public health", "Free tier"],
  },
];

export interface ImpactTier {
  id: string;
  name: string;
  price: string;
  runs: string;
  perks: string[];
  highlight?: boolean;
}

export const TIERS: ImpactTier[] = [
  {
    id: "builder",
    name: "Builder",
    price: "$0",
    runs: "1,000 runs / month",
    perks: ["Full canvas + copilot", "All 3,500+ steps", "Community packs"],
  },
  {
    id: "scale",
    name: "Scale",
    price: "$49",
    runs: "250,000 runs / month",
    perks: ["Autonomous healing", "Time-travel debugging", "White-label embed SDK", "Marketplace payouts"],
    highlight: true,
  },
  {
    id: "humanitarian",
    name: "Open-Data Humanitarian",
    price: "$0 forever",
    runs: "Enterprise capacity, donated",
    perks: [
      "Verified NGOs, public health supply chains and environmental monitors",
      "Same engine, no run ceiling",
      "Priority support and onboarding help",
      "Open impact reporting built in",
    ],
  },
];
