/**
 * Catalog of verticals ("sections of the world"), connectable tools, node
 * definitions and starter templates for the Automation Studio.
 */

import { ACTION_VERBS, APPS, appActionId, appTriggerId, type AppDef, type Category } from "./integrations";

export type NodeKind = "trigger" | "action" | "logic" | "ai" | "output";


export interface NodeDef {
  id: string;
  label: string;
  kind: NodeKind;
  tool: string;
  summary: string;
  fields: Array<{ key: string; label: string; placeholder?: string; type?: "text" | "textarea" | "select"; options?: string[] }>;
}

export interface Vertical {
  id: string;
  name: string;
  tagline: string;
  glyph: string;
  /** Integration categories whose steps show up first for this vertical. */
  categories: string[];
  nodes: string[];
}


const BASE_NODES: Record<string, NodeDef> = {
  "trigger.schedule": {
    id: "trigger.schedule",
    label: "Schedule",
    kind: "trigger",
    tool: "Core",
    summary: "Runs the flow on a recurring cadence.",
    fields: [
      { key: "cadence", label: "Cadence", type: "select", options: ["Every 5 min", "Hourly", "Daily 08:00", "Weekly Mon 09:00"] },
      { key: "timezone", label: "Timezone", placeholder: "Africa/Nairobi" },
    ],
  },
  "trigger.webhook": {
    id: "trigger.webhook",
    label: "Webhook",
    kind: "trigger",
    tool: "Core",
    summary: "Starts when an external system posts data.",
    fields: [{ key: "path", label: "Path", placeholder: "/hooks/new-lead" }],
  },
  "trigger.form": {
    id: "trigger.form",
    label: "Form submitted",
    kind: "trigger",
    tool: "Forms",
    summary: "Fires when a user submits a form.",
    fields: [{ key: "form", label: "Form name", placeholder: "Intake form" }],
  },
  "trigger.notion": {
    id: "trigger.notion",
    label: "Notion page changed",
    kind: "trigger",
    tool: "Notion",
    summary: "Watches a database for created or edited pages.",
    fields: [{ key: "database", label: "Database ID", placeholder: "a1b2c3..." }],
  },
  "trigger.email": {
    id: "trigger.email",
    label: "Email received",
    kind: "trigger",
    tool: "Gmail",
    summary: "Triggers on a matching inbox message.",
    fields: [{ key: "query", label: "Search query", placeholder: "from:client@acme.com" }],
  },
  "action.http": {
    id: "action.http",
    label: "HTTP request",
    kind: "action",
    tool: "Core",
    summary: "Call any REST API with full control.",
    fields: [
      { key: "method", label: "Method", type: "select", options: ["GET", "POST", "PUT", "PATCH", "DELETE"] },
      { key: "url", label: "URL", placeholder: "https://api.example.com/v1/items" },
      { key: "body", label: "Body", type: "textarea", placeholder: "{ }" },
    ],
  },
  "action.slack": {
    id: "action.slack",
    label: "Slack message",
    kind: "action",
    tool: "Slack",
    summary: "Post to a channel or DM a teammate.",
    fields: [
      { key: "channel", label: "Channel", placeholder: "#ops" },
      { key: "message", label: "Message", type: "textarea", placeholder: "New lead: {{name}}" },
    ],
  },
  "action.sheets": {
    id: "action.sheets",
    label: "Append row",
    kind: "action",
    tool: "Google Sheets",
    summary: "Write a row into a spreadsheet.",
    fields: [
      { key: "sheet", label: "Spreadsheet", placeholder: "Pipeline 2026" },
      { key: "columns", label: "Columns", placeholder: "name, email, score" },
    ],
  },
  "action.notion": {
    id: "action.notion",
    label: "Create Notion page",
    kind: "action",
    tool: "Notion",
    summary: "Create or update a page in a database.",
    fields: [
      { key: "database", label: "Database", placeholder: "Clients" },
      { key: "title", label: "Title", placeholder: "{{company}} — brief" },
    ],
  },
  "action.email": {
    id: "action.email",
    label: "Send email",
    kind: "action",
    tool: "Resend",
    summary: "Send a templated transactional email.",
    fields: [
      { key: "to", label: "To", placeholder: "{{email}}" },
      { key: "subject", label: "Subject", placeholder: "Your report is ready" },
      { key: "body", label: "Body", type: "textarea" },
    ],
  },
  "action.crm": {
    id: "action.crm",
    label: "Upsert CRM record",
    kind: "action",
    tool: "HubSpot",
    summary: "Create or update a contact/deal.",
    fields: [
      { key: "object", label: "Object", type: "select", options: ["Contact", "Company", "Deal"] },
      { key: "match", label: "Match on", placeholder: "email" },
    ],
  },
  "action.invoice": {
    id: "action.invoice",
    label: "Issue invoice",
    kind: "action",
    tool: "Stripe",
    summary: "Draft and send an invoice.",
    fields: [
      { key: "customer", label: "Customer", placeholder: "{{customer_id}}" },
      { key: "amount", label: "Amount", placeholder: "1200.00" },
    ],
  },
  "action.calendar": {
    id: "action.calendar",
    label: "Create event",
    kind: "action",
    tool: "Google Calendar",
    summary: "Book a slot on a calendar.",
    fields: [
      { key: "calendar", label: "Calendar", placeholder: "primary" },
      { key: "duration", label: "Duration (min)", placeholder: "30" },
    ],
  },
  "action.whatsapp": {
    id: "action.whatsapp",
    label: "WhatsApp message",
    kind: "action",
    tool: "WhatsApp",
    summary: "Send a message to a phone number.",
    fields: [
      { key: "to", label: "To", placeholder: "+2547..." },
      { key: "template", label: "Template", placeholder: "appointment_reminder" },
    ],
  },
  "action.sms": {
    id: "action.sms",
    label: "Send SMS",
    kind: "action",
    tool: "Twilio",
    summary: "Deliver an SMS alert.",
    fields: [{ key: "to", label: "To", placeholder: "+1..." }],
  },
  "action.storage": {
    id: "action.storage",
    label: "Save file",
    kind: "action",
    tool: "Drive",
    summary: "Store a generated document.",
    fields: [{ key: "folder", label: "Folder", placeholder: "/reports/2026" }],
  },
  "logic.filter": {
    id: "logic.filter",
    label: "Filter",
    kind: "logic",
    tool: "Core",
    summary: "Continue only when a condition holds.",
    fields: [{ key: "condition", label: "Condition", placeholder: "{{score}} > 70" }],
  },
  "logic.branch": {
    id: "logic.branch",
    label: "Branch",
    kind: "logic",
    tool: "Core",
    summary: "Split the flow into parallel paths.",
    fields: [{ key: "rules", label: "Rules", type: "textarea", placeholder: "hot / warm / cold" }],
  },
  "logic.delay": {
    id: "logic.delay",
    label: "Wait",
    kind: "logic",
    tool: "Core",
    summary: "Pause before continuing.",
    fields: [{ key: "delay", label: "Delay", placeholder: "15 minutes" }],
  },
  "logic.loop": {
    id: "logic.loop",
    label: "Loop items",
    kind: "logic",
    tool: "Core",
    summary: "Iterate over every item in a list.",
    fields: [{ key: "path", label: "Items path", placeholder: "items[]" }],
  },
  "logic.approval": {
    id: "logic.approval",
    label: "Human approval",
    kind: "logic",
    tool: "Core",
    summary: "Hold until a person approves.",
    fields: [{ key: "approver", label: "Approver", placeholder: "ops@company.com" }],
  },
  "ai.classify": {
    id: "ai.classify",
    label: "AI classify",
    kind: "ai",
    tool: "Lovable AI",
    summary: "Route content into categories.",
    fields: [{ key: "labels", label: "Labels", placeholder: "urgent, billing, spam" }],
  },
  "ai.extract": {
    id: "ai.extract",
    label: "AI extract",
    kind: "ai",
    tool: "Lovable AI",
    summary: "Pull structured fields out of messy text.",
    fields: [{ key: "schema", label: "Fields", placeholder: "name, amount, due_date" }],
  },
  "ai.summarize": {
    id: "ai.summarize",
    label: "AI summarize",
    kind: "ai",
    tool: "Lovable AI",
    summary: "Condense long content into a brief.",
    fields: [{ key: "style", label: "Style", type: "select", options: ["Bullets", "Executive", "One line"] }],
  },
  "ai.agent": {
    id: "ai.agent",
    label: "AI agent",
    kind: "ai",
    tool: "Lovable AI",
    summary: "Reason over the payload and pick a tool.",
    fields: [{ key: "instructions", label: "Instructions", type: "textarea" }],
  },
  "output.report": {
    id: "output.report",
    label: "Build report",
    kind: "output",
    tool: "Core",
    summary: "Compose a shareable document.",
    fields: [{ key: "template", label: "Template", placeholder: "Weekly digest" }],
  },
  "output.dashboard": {
    id: "output.dashboard",
    label: "Update dashboard",
    kind: "output",
    tool: "Core",
    summary: "Push metrics to a live view.",
    fields: [{ key: "widget", label: "Widget", placeholder: "Pipeline health" }],
  },
  // ---- advanced core steps ----
  "trigger.manual": {
    id: "trigger.manual",
    label: "Manual run",
    kind: "trigger",
    tool: "Core",
    summary: "Start the flow yourself from a button.",
    fields: [{ key: "label", label: "Button label", placeholder: "Run report" }],
  },
  "trigger.email.inbound": {
    id: "trigger.email.inbound",
    label: "Inbound email address",
    kind: "trigger",
    tool: "Core",
    summary: "Give the flow its own address; every mail starts a run.",
    fields: [{ key: "alias", label: "Alias", placeholder: "invoices@flows.app" }],
  },
  "trigger.file": {
    id: "trigger.file",
    label: "File dropped",
    kind: "trigger",
    tool: "Core",
    summary: "Watch a folder or bucket for new files.",
    fields: [{ key: "path", label: "Watch path", placeholder: "/inbox" }],
  },
  "trigger.rss": {
    id: "trigger.rss",
    label: "RSS item",
    kind: "trigger",
    tool: "Core",
    summary: "Fires on each new feed entry.",
    fields: [{ key: "feed", label: "Feed URL", placeholder: "https://blog.example.com/rss" }],
  },
  "trigger.error": {
    id: "trigger.error",
    label: "Another flow failed",
    kind: "trigger",
    tool: "Core",
    summary: "Catch failures from any other flow and handle them.",
    fields: [{ key: "flow", label: "Watch flow", placeholder: "Any flow" }],
  },
  "logic.switch": {
    id: "logic.switch",
    label: "Switch",
    kind: "logic",
    tool: "Core",
    summary: "Send each item down a named route.",
    fields: [{ key: "routes", label: "Routes", type: "textarea", placeholder: "hot => sales\ncold => nurture" }],
  },
  "logic.merge": {
    id: "logic.merge",
    label: "Merge branches",
    kind: "logic",
    tool: "Core",
    summary: "Wait for parallel paths and combine their data.",
    fields: [{ key: "mode", label: "Mode", type: "select", options: ["Combine", "Append", "Wait for all"] }],
  },
  "logic.dedupe": {
    id: "logic.dedupe",
    label: "Deduplicate",
    kind: "logic",
    tool: "Core",
    summary: "Skip items already seen before.",
    fields: [{ key: "key", label: "Unique key", placeholder: "{{email}}" }],
  },
  "logic.map": {
    id: "logic.map",
    label: "Transform fields",
    kind: "logic",
    tool: "Core",
    summary: "Rename, format and reshape data between tools.",
    fields: [{ key: "mapping", label: "Mapping", type: "textarea", placeholder: "full_name = {{first}} {{last}}" }],
  },
  "logic.code": {
    id: "logic.code",
    label: "Run code",
    kind: "logic",
    tool: "Core",
    summary: "Drop into JavaScript for anything custom.",
    fields: [{ key: "code", label: "Code", type: "textarea", placeholder: "return items.filter(i => i.score > 70)" }],
  },
  "logic.retry": {
    id: "logic.retry",
    label: "Retry on failure",
    kind: "logic",
    tool: "Core",
    summary: "Automatically retry a flaky step with backoff.",
    fields: [
      { key: "attempts", label: "Attempts", placeholder: "3" },
      { key: "backoff", label: "Backoff", type: "select", options: ["Immediate", "Linear", "Exponential"] },
    ],
  },
  "logic.throttle": {
    id: "logic.throttle",
    label: "Rate limit",
    kind: "logic",
    tool: "Core",
    summary: "Keep within a tool's API limits.",
    fields: [{ key: "rate", label: "Max per minute", placeholder: "60" }],
  },
  "logic.schedule-window": {
    id: "logic.schedule-window",
    label: "Business hours only",
    kind: "logic",
    tool: "Core",
    summary: "Hold work until working hours resume.",
    fields: [
      { key: "hours", label: "Window", placeholder: "Mon–Fri 08:00–18:00" },
      { key: "timezone", label: "Timezone", placeholder: "Africa/Nairobi" },
    ],
  },
  "logic.error-branch": {
    id: "logic.error-branch",
    label: "On error",
    kind: "logic",
    tool: "Core",
    summary: "Route failures to a recovery path.",
    fields: [{ key: "strategy", label: "Strategy", type: "select", options: ["Continue", "Stop flow", "Notify & continue"] }],
  },
  "ai.generate": {
    id: "ai.generate",
    label: "AI write",
    kind: "ai",
    tool: "Lovable AI",
    summary: "Draft copy, replies or documents on brand.",
    fields: [
      { key: "prompt", label: "Prompt", type: "textarea", placeholder: "Write a reply to {{message}}" },
      { key: "tone", label: "Tone", type: "select", options: ["Professional", "Friendly", "Concise", "Persuasive"] },
    ],
  },
  "ai.translate": {
    id: "ai.translate",
    label: "AI translate",
    kind: "ai",
    tool: "Lovable AI",
    summary: "Translate content for any market.",
    fields: [{ key: "target", label: "Target language", placeholder: "Swahili" }],
  },
  "ai.sentiment": {
    id: "ai.sentiment",
    label: "AI sentiment",
    kind: "ai",
    tool: "Lovable AI",
    summary: "Score tone and urgency of a message.",
    fields: [{ key: "scale", label: "Scale", type: "select", options: ["Positive/Negative", "1–5", "Urgency"] }],
  },
  "ai.ocr": {
    id: "ai.ocr",
    label: "AI read document",
    kind: "ai",
    tool: "Lovable AI",
    summary: "Read PDFs, scans and receipts into fields.",
    fields: [{ key: "fields", label: "Fields", placeholder: "vendor, total, date" }],
  },
  "ai.image": {
    id: "ai.image",
    label: "AI image",
    kind: "ai",
    tool: "Lovable AI",
    summary: "Generate visuals for posts and reports.",
    fields: [{ key: "prompt", label: "Prompt", type: "textarea" }],
  },
  "ai.speech": {
    id: "ai.speech",
    label: "AI voice",
    kind: "ai",
    tool: "Lovable AI",
    summary: "Turn text into natural speech.",
    fields: [{ key: "voice", label: "Voice", placeholder: "warm-female" }],
  },
  "ai.transcribe": {
    id: "ai.transcribe",
    label: "AI transcribe",
    kind: "ai",
    tool: "Lovable AI",
    summary: "Transcribe calls, notes and voice messages.",
    fields: [{ key: "language", label: "Language", placeholder: "auto" }],
  },
  "ai.rag": {
    id: "ai.rag",
    label: "AI knowledge answer",
    kind: "ai",
    tool: "Lovable AI",
    summary: "Answer using your own documents.",
    fields: [
      { key: "source", label: "Knowledge source", placeholder: "Notion / Drive / uploads" },
      { key: "question", label: "Question", placeholder: "{{ticket.body}}" },
    ],
  },
  "ai.decide": {
    id: "ai.decide",
    label: "AI decide next step",
    kind: "ai",
    tool: "Lovable AI",
    summary: "Let an agent pick the best branch to take.",
    fields: [{ key: "policy", label: "Policy", type: "textarea", placeholder: "Escalate anything about refunds." }],
  },
  "output.pdf": {
    id: "output.pdf",
    label: "Generate PDF",
    kind: "output",
    tool: "Core",
    summary: "Render a branded PDF from the data.",
    fields: [{ key: "template", label: "Template", placeholder: "Invoice A4" }],
  },
  "output.webhook": {
    id: "output.webhook",
    label: "Send to webhook",
    kind: "output",
    tool: "Core",
    summary: "Post the result anywhere, including back to your app.",
    fields: [{ key: "url", label: "URL", placeholder: "https://yourapp.com/hooks/result" }],
  },
  "output.metric": {
    id: "output.metric",
    label: "Record metric",
    kind: "output",
    tool: "Core",
    summary: "Track a KPI every time the flow runs.",
    fields: [{ key: "metric", label: "Metric name", placeholder: "leads_routed" }],
  },
  "output.audit": {
    id: "output.audit",
    label: "Audit log entry",
    kind: "output",
    tool: "Core",
    summary: "Write a compliance-ready record of what happened.",
    fields: [{ key: "note", label: "Note", placeholder: "Approved by {{approver}}" }],
  },
};

function actionFields(verb: string, object: string): NodeDef["fields"] {
  switch (verb) {
    case "Create":
      return [
        { key: "fields", label: `${cap(object)} fields`, type: "textarea", placeholder: "name = {{name}}\nemail = {{email}}" },
        { key: "account", label: "Connected account", placeholder: "default" },
      ];
    case "Update":
      return [
        { key: "id", label: `${cap(object)} ID`, placeholder: "{{id}}" },
        { key: "fields", label: "Fields to change", type: "textarea", placeholder: "status = won" },
      ];
    case "Find":
      return [
        { key: "query", label: "Search by", placeholder: "email = {{email}}" },
        { key: "onMissing", label: "If nothing found", type: "select", options: ["Continue", "Create it", "Stop flow"] },
      ];
    case "Delete":
      return [{ key: "id", label: `${cap(object)} ID`, placeholder: "{{id}}" }];
    default:
      return [
        { key: "filter", label: "Filter", placeholder: "updated_after = {{yesterday}}" },
        { key: "limit", label: "Max items", placeholder: "50" },
      ];
  }
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function kindForApp(app: AppDef): NodeKind {
  return app.category === "AI & ML" ? "ai" : "action";
}

function buildGenerated(): Record<string, NodeDef> {
  const out: Record<string, NodeDef> = {};
  for (const app of APPS) {
    for (const event of app.events ?? []) {
      const id = appTriggerId(app, event);
      out[id] = {
        id,
        label: `${app.name}: ${cap(event)}`,
        kind: "trigger",
        tool: app.name,
        summary: `Starts the flow when ${event} happens in ${app.name}.`,
        fields: [
          { key: "account", label: "Connected account", placeholder: `${app.name} account` },
          { key: "filter", label: "Only when", placeholder: "leave blank for every event" },
        ],
      };
    }
    for (const object of app.objects) {
      for (const verb of ACTION_VERBS) {
        const id = appActionId(app, verb, object);
        out[id] = {
          id,
          label: `${app.name}: ${verb} ${object}`,
          kind: kindForApp(app),
          tool: app.name,
          summary: `${verb} a ${object} in ${app.name}.`,
          fields: actionFields(verb, object),
        };
      }
    }
  }
  return out;
}

export const GENERATED_NODES = buildGenerated();

export const NODES: Record<string, NodeDef> = { ...BASE_NODES, ...GENERATED_NODES };

export const CORE_NODE_IDS = Object.keys(BASE_NODES);

/** App step ids grouped by integration category. */
export const NODES_BY_CATEGORY = APPS.reduce<Record<string, string[]>>((acc, app) => {
  const ids = Object.values(GENERATED_NODES)
    .filter((n) => n.tool === app.name)
    .map((n) => n.id);
  acc[app.category] = [...(acc[app.category] ?? []), ...ids];
  return acc;
}, {});

const CORE = [
  "trigger.schedule",
  "trigger.webhook",
  "trigger.manual",
  "logic.filter",
  "logic.branch",
  "logic.switch",
  "logic.delay",
  "logic.loop",
  "logic.map",
  "logic.code",
  "logic.dedupe",
  "logic.merge",
  "logic.retry",
  "logic.approval",
  "logic.error-branch",
  "ai.classify",
  "ai.extract",
  "ai.summarize",
  "ai.generate",
  "ai.agent",
  "ai.rag",
  "action.http",
  "output.report",
  "output.dashboard",
  "output.webhook",
  "output.pdf",
  "output.metric",
];



const V = (
  id: string,
  name: string,
  tagline: string,
  glyph: string,
  categories: string[],
  extra: string[] = [],
): Vertical => ({
  id,
  name,
  tagline,
  glyph,
  categories,
  nodes: [...CORE, ...extra, ...categories.flatMap((c) => NODES_BY_CATEGORY[c] ?? [])].filter(
    (v, i, a) => a.indexOf(v) === i,
  ),
});

export const VERTICALS: Vertical[] = [
  V("sales", "Sales & Growth", "Capture, score and route every lead the moment it lands.", "\u25C8", ["CRM & Sales", "Communication", "Forms & Surveys", "Calendar & Scheduling"], ["trigger.form"]),
  V("marketing", "Marketing", "Content pipelines, campaign reporting, always-on nurture.", "\u25C7", ["Marketing", "Social Media", "Analytics", "Productivity"], ["trigger.rss"]),
  V("finance", "Finance & Ops", "Invoices, reconciliation and approvals without spreadsheets.", "\u25A3", ["Finance & Payments", "Productivity", "Storage & Files", "Communication"], ["trigger.email.inbound", "ai.ocr"]),
  V("support", "Customer Support", "Triage, answer and escalate across every inbox.", "\u25C9", ["Support", "Communication", "AI & ML", "CRM & Sales"], ["ai.sentiment"]),
  V("people", "People & HR", "Onboarding, reviews and reminders that never slip.", "\u25CE", ["HR & Recruiting", "Calendar & Scheduling", "Communication", "Storage & Files"], ["trigger.form"]),
  V("health", "Health & Clinics", "Appointments, reminders and follow-up care journeys.", "\u271A", ["Health", "Calendar & Scheduling", "Communication", "Forms & Surveys"]),
  V("logistics", "Logistics & Field", "Dispatch, tracking and exception handling in real time.", "\u25B2", ["Logistics & Maps", "Communication", "Databases", "E-commerce"]),
  V("education", "Education", "Enrolment, cohorts, grading and parent comms.", "\u2756", ["Education", "Forms & Surveys", "Communication", "Calendar & Scheduling"]),
  V("realestate", "Real Estate", "Listings, viewings and buyer follow-through.", "\u2B22", ["Real Estate", "CRM & Sales", "Calendar & Scheduling", "Communication"]),
  V("research", "Research & Data", "Collect, enrich and analyse continuously.", "\u25D0", ["Databases", "Analytics", "AI & ML", "Productivity"], ["trigger.file"]),
  V("ecommerce", "E-commerce & Retail", "Orders, fulfilment, refunds and win-back journeys.", "\u25EC", ["E-commerce", "Finance & Payments", "Logistics & Maps", "Marketing"]),
  V("engineering", "Engineering & DevOps", "Ship, monitor and page the right human automatically.", "\u2318", ["Developer", "Communication", "Analytics", "Security & Identity"], ["trigger.error"]),
  V("product", "Product & Design", "Feedback loops, release notes and roadmap hygiene.", "\u25D1", ["Project Management", "Developer", "Productivity", "Analytics"]),
  V("legal", "Legal & Compliance", "Contracts, signatures and audit-ready trails.", "\u2696", ["Legal", "Storage & Files", "Communication", "Security & Identity"], ["output.audit"]),
  V("agency", "Agencies & Freelance", "Client intake, delivery and invoicing on autopilot.", "\u2726", ["Project Management", "Finance & Payments", "Communication", "Productivity"], ["trigger.form"]),
  V("nonprofit", "Nonprofit & NGO", "Donors, grants, volunteers and impact reporting.", "\u2764", ["Finance & Payments", "Marketing", "Forms & Surveys", "Communication"]),
  V("hospitality", "Hospitality & Travel", "Bookings, guest messaging and review recovery.", "\u2617", ["Calendar & Scheduling", "Communication", "E-commerce", "Social Media"]),
  V("manufacturing", "Manufacturing & IoT", "Sensors, maintenance windows and shop-floor alerts.", "\u2699", ["IoT & Devices", "Databases", "Communication", "Analytics"]),
  V("security", "Security & IT", "Access reviews, incident response and offboarding.", "\u26E8", ["Security & Identity", "Developer", "Communication", "HR & Recruiting"]),
  V("media", "Media & Creators", "Publish everywhere, repurpose everything.", "\u25B6", ["Social Media", "AI & ML", "Storage & Files", "Marketing"]),
  V("recruiting", "Recruiting", "Sourcing, screening and scheduling at speed.", "\u25D3", ["HR & Recruiting", "Calendar & Scheduling", "Communication", "AI & ML"]),
  V("finserv", "Banking & Fintech", "KYC, reconciliation and fraud watch-lists.", "\u25A4", ["Finance & Payments", "Security & Identity", "Databases", "Analytics"]),
  V("government", "Public Sector", "Citizen requests, permits and transparent records.", "\u2691", ["Forms & Surveys", "Storage & Files", "Communication", "Legal"], ["output.audit"]),
  V("personal", "Personal Productivity", "Your own life, quietly automated.", "\u263C", ["Productivity", "Calendar & Scheduling", "Communication", "Health"]),
];


export interface TemplateDef {
  id: string;
  vertical: string;
  name: string;
  description: string;
  chain: string[];
}

const T = (id: string, vertical: string, name: string, description: string, chain: string[]): TemplateDef => ({
  id,
  vertical,
  name,
  description,
  chain: chain.filter((c) => Boolean(NODES[c])),
});

export const TEMPLATES: TemplateDef[] = [
  T("lead-router", "sales", "Inbound lead router", "Score every new lead with AI, push hot ones to the CRM and ping the team instantly.", ["trigger.form", "ai.extract", "logic.filter", "app.hubspot.create.contact", "app.slack.create.message"]),
  T("lead-enrich", "sales", "Lead enrichment & routing", "Enrich each lead, decide the owner and book the first call automatically.", ["apptrigger.typeform.response-submitted", "app.apollo.find.contact", "ai.decide", "app.pipedrive.create.deal", "app.calendly.create.booking"]),
  T("deal-slip", "sales", "Stalled deal rescue", "Spot deals going quiet and nudge the rep with AI-written next steps.", ["trigger.schedule", "app.hubspot.list.deal", "logic.filter", "ai.generate", "app.slack.create.message"]),
  T("meeting-notes", "sales", "Call notes to CRM", "Transcribe the call, summarise it and log it against the deal.", ["apptrigger.zoom.recording-ready", "ai.transcribe", "ai.summarize", "app.salesforce.update.opportunity", "app.notion.create.page"]),
  T("invoice-chaser", "finance", "Invoice chaser", "Watch the billing inbox, extract amounts, issue invoices and follow up on time.", ["trigger.email.inbound", "ai.ocr", "app.stripe.create.invoice", "logic.delay", "app.resend.create.email"]),
  T("expense-approve", "finance", "Expense approvals", "Read receipts, apply policy and route anything unusual to a human.", ["trigger.file", "ai.ocr", "logic.filter", "logic.approval", "app.quickbooks.create.expense", "output.audit"]),
  T("payment-fail", "finance", "Failed payment recovery", "Retry, warn the customer and alert revenue ops before churn happens.", ["apptrigger.stripe.payment-failed", "app.stripe.find.customer", "app.resend.create.email", "logic.delay", "app.slack.create.message"]),
  T("daily-cash", "finance", "Daily cash snapshot", "Pull balances every morning and publish a clean summary.", ["trigger.schedule", "app.plaid.list.balance", "ai.summarize", "output.report", "app.slack.create.message"]),
  T("support-triage", "support", "Support triage desk", "Classify tickets, answer the easy ones and escalate the rest with context.", ["apptrigger.zendesk.ticket-created", "ai.classify", "logic.switch", "ai.rag", "app.zendesk.update.ticket", "app.slack.create.message"]),
  T("angry-customer", "support", "Escalation radar", "Detect frustration in real time and get a human in before it blows up.", ["apptrigger.intercom.reply-received", "ai.sentiment", "logic.filter", "app.pagerduty.create.incident", "app.slack.create.message"]),
  T("csat-loop", "support", "CSAT follow-up", "Ask for feedback after resolution and route low scores to the lead.", ["apptrigger.zendesk.ticket-solved", "logic.delay", "app.typeform.create.response", "logic.filter", "app.slack.create.message"]),
  T("kb-writer", "support", "Knowledge base writer", "Turn repeat tickets into published help articles.", ["trigger.schedule", "app.zendesk.list.ticket", "ai.summarize", "ai.generate", "app.notion.create.page"]),
  T("notion-digest", "research", "Notion live digest", "Track a Notion workspace, summarise changes and publish a daily digest.", ["apptrigger.notion.page-updated", "ai.summarize", "output.report", "app.slack.create.message"]),
  T("notion-analyzer", "research", "Notion live analyzer", "Continuously watch a Notion database, score every entry and push analytics out.", ["apptrigger.notion.database-row-added", "ai.extract", "logic.map", "app.supabase.create.row", "output.dashboard", "output.metric"]),
  T("research-scout", "research", "Research scout", "Watch sources, extract findings and file them with citations.", ["trigger.rss", "app.perplexity.create.answer", "ai.extract", "app.notion.create.page", "app.slack.create.message"]),
  T("data-sync", "research", "Two-way data sync", "Keep a spreadsheet and your database in agreement, safely.", ["trigger.schedule", "app.google-sheets.list.row", "logic.dedupe", "logic.map", "app.supabase.update.row"]),
  T("clinic-reminders", "health", "Appointment reminders", "Book the slot, remind on WhatsApp and follow up after the visit.", ["trigger.form", "app.google-calendar.create.event", "logic.delay", "app.whatsapp-business.create.message", "app.twilio.create.sms"]),
  T("noshow", "health", "No-show recovery", "Detect missed appointments and offer the next slot instantly.", ["apptrigger.acuity.appointment-scheduled", "logic.schedule-window", "logic.filter", "app.whatsapp-business.create.message", "app.acuity.create.appointment"]),
  T("intake-triage", "health", "Patient intake triage", "Read intake forms, flag risk and prepare the clinician brief.", ["trigger.form", "ai.extract", "ai.classify", "logic.filter", "app.epic-fhir.create.appointment", "output.pdf"]),
  T("onboarding", "people", "Employee onboarding", "Kick off accounts, schedule intros and track every checklist item.", ["apptrigger.bamboohr.employee-hired", "app.notion.create.page", "app.google-calendar.create.event", "logic.approval", "app.resend.create.email"]),
  T("offboarding", "security", "Secure offboarding", "Revoke access everywhere the moment someone leaves.", ["apptrigger.bamboohr.employee-hired", "app.okta.update.user", "app.google-drive.update.permission", "app.1password.update.item", "output.audit"]),
  T("candidate-screen", "recruiting", "Candidate screening", "Parse CVs, score against the role and book the promising ones.", ["apptrigger.greenhouse.candidate-applied", "ai.ocr", "ai.classify", "logic.filter", "app.cal-com.create.booking", "app.slack.create.message"]),
  T("interview-loop", "recruiting", "Interview coordination", "Schedule panels, send prep and collect scorecards.", ["apptrigger.lever.candidate-created", "app.google-calendar.create.event", "app.resend.create.email", "logic.delay", "app.typeform.create.response"]),
  T("order-flow", "ecommerce", "Order to fulfilment", "Confirm the order, create the shipment and keep the buyer updated.", ["apptrigger.shopify.order-paid", "app.shippo.create.shipment", "app.resend.create.email", "app.google-sheets.create.row"]),
  T("abandoned-cart", "ecommerce", "Abandoned cart winback", "Personalised recovery sequence written per customer.", ["apptrigger.shopify.cart-abandoned", "logic.delay", "ai.generate", "app.klaviyo.create.event", "app.resend.create.email"]),
  T("refund-guard", "ecommerce", "Refund guard", "Approve small refunds instantly, review the rest.", ["apptrigger.stripe.payment-succeeded", "logic.filter", "logic.approval", "app.stripe.create.refund", "output.audit"]),
  T("review-recovery", "hospitality", "Review recovery", "Catch unhappy reviews and make it right within the hour.", ["trigger.rss", "ai.sentiment", "logic.filter", "app.whatsapp-business.create.message", "app.slack.create.message"]),
  T("booking-concierge", "hospitality", "Booking concierge", "Confirm, upsell and prepare the guest arrival pack.", ["apptrigger.calendly.invitee-scheduled", "ai.generate", "app.resend.create.email", "output.pdf", "app.notion.create.page"]),
  T("deploy-watch", "engineering", "Deploy watchdog", "Announce releases and open an incident the moment one fails.", ["apptrigger.vercel.deployment-failed", "app.sentry.list.issue", "ai.summarize", "app.pagerduty.create.incident", "app.slack.create.message"]),
  T("bug-triage", "engineering", "Bug triage bot", "Turn error spikes into well-written, assigned issues.", ["apptrigger.sentry.new-error", "ai.summarize", "app.linear.create.issue", "app.slack.create.message"]),
  T("pr-review", "engineering", "PR review helper", "Summarise every pull request and nudge reviewers.", ["apptrigger.github.pull-request-opened", "ai.summarize", "app.slack.create.message", "logic.delay", "app.github.create.comment"]),
  T("oncall-digest", "engineering", "On-call handover", "Compile the shift report from alerts, deploys and incidents.", ["trigger.schedule", "app.pagerduty.list.incident", "app.datadog.list.event", "ai.summarize", "output.report"]),
  T("release-notes", "product", "Release notes writer", "Turn merged issues into customer-ready release notes.", ["trigger.schedule", "app.linear.list.issue", "ai.generate", "app.notion.create.page", "app.beehiiv.create.post"]),
  T("feedback-loop", "product", "Feedback to roadmap", "Cluster feedback from every channel into themes.", ["apptrigger.intercom.conversation-started", "ai.classify", "logic.dedupe", "app.linear.create.issue", "output.dashboard"]),
  T("content-engine", "marketing", "Content repurposing engine", "One post becomes a thread, a newsletter and a video script.", ["apptrigger.webflow.item-published", "ai.generate", "logic.branch", "app.x-twitter.create.post", "app.linkedin.create.post", "app.beehiiv.create.post"]),
  T("campaign-report", "marketing", "Campaign report", "Pull spend and conversions daily, explain the movement.", ["trigger.schedule", "app.google-ads.list.campaign", "app.meta-ads.list.campaign", "ai.summarize", "output.dashboard", "app.slack.create.message"]),
  T("social-inbox", "media", "Social inbox", "Reply fast everywhere without living in the apps.", ["apptrigger.instagram.comment-received", "ai.sentiment", "ai.generate", "logic.approval", "app.instagram.create.comment"]),
  T("newsletter", "media", "Newsletter autopilot", "Curate, write, illustrate and schedule the issue.", ["trigger.schedule", "trigger.rss", "ai.summarize", "ai.image", "app.beehiiv.create.post"]),
  T("dispatch", "logistics", "Dispatch & exceptions", "Assign the job, watch tracking and escalate delays.", ["apptrigger.shippo.tracking-updated", "logic.switch", "app.google-maps.find.route", "app.twilio.create.sms", "app.slack.create.message"]),
  T("fleet-maint", "manufacturing", "Predictive maintenance", "Watch sensors, predict failure and book the technician.", ["apptrigger.mqtt.message-received", "logic.map", "ai.decide", "app.monday-com.create.item", "app.twilio.create.sms"]),
  T("listing-syndicate", "realestate", "Listing syndication", "Publish one listing everywhere with generated copy.", ["apptrigger.mls-grid.listing-changed", "ai.generate", "ai.image", "app.property24.create.listing", "app.instagram.create.post"]),
  T("viewing-followup", "realestate", "Viewing follow-through", "Confirm viewings and follow up until there's a decision.", ["apptrigger.zillow.lead-received", "app.hubspot.create.contact", "app.cal-com.create.booking", "logic.delay", "app.whatsapp-business.create.message"]),
  T("contract-flow", "legal", "Contract lifecycle", "Draft, route for signature and file the executed copy.", ["trigger.form", "ai.generate", "app.docusign.create.envelope", "logic.approval", "app.google-drive.create.file", "output.audit"]),
  T("policy-watch", "legal", "Policy change watch", "Track regulatory sources and brief the team on impact.", ["trigger.rss", "ai.summarize", "logic.filter", "app.notion.create.page", "app.slack.create.message"]),
  T("client-intake", "agency", "Client intake to project", "Turn a signed proposal into a fully set-up project.", ["apptrigger.pandadoc.document-signed", "app.clickup.create.project", "app.slack.create.channel", "app.notion.create.page", "app.stripe.create.invoice"]),
  T("timesheet", "agency", "Timesheet to invoice", "Roll logged hours into an invoice every month.", ["trigger.schedule", "app.clickup.list.task", "logic.map", "app.xero.create.invoice", "app.resend.create.email"]),
  T("donor-thanks", "nonprofit", "Donor stewardship", "Thank every donor personally and keep records clean.", ["apptrigger.paystack.charge-successful", "ai.generate", "app.resend.create.email", "app.airtable.create.record", "output.metric"]),
  T("volunteer", "nonprofit", "Volunteer scheduling", "Match availability to shifts and confirm by SMS.", ["trigger.form", "logic.map", "app.google-calendar.create.event", "app.twilio.create.sms", "app.google-sheets.create.row"]),
  T("enrolment", "education", "Enrolment pipeline", "Enrol, welcome and track every new student.", ["apptrigger.teachable.student-enrolled", "app.canvas-lms.create.enrolment", "app.resend.create.email", "app.google-sheets.create.row"]),
  T("grade-alerts", "education", "Grade & attendance alerts", "Spot struggling students early and inform guardians.", ["trigger.schedule", "app.canvas-lms.list.grade", "logic.filter", "ai.generate", "app.whatsapp-business.create.message"]),
  T("access-review", "security", "Quarterly access review", "Collect access lists, get sign-off and log the evidence.", ["trigger.schedule", "app.okta.list.user", "logic.approval", "output.report", "output.audit"]),
  T("breach-watch", "security", "Credential breach watch", "Check exposure and force resets where needed.", ["trigger.schedule", "app.have-i-been-pwned.find.account", "logic.filter", "app.auth0.update.user", "app.slack.create.message"]),
  T("kyc", "finserv", "KYC onboarding", "Verify documents, screen and open the account.", ["trigger.form", "ai.ocr", "logic.filter", "logic.approval", "app.supabase.create.row", "output.audit"]),
  T("recon", "finserv", "Daily reconciliation", "Match transactions across processors and flag gaps.", ["trigger.schedule", "app.stripe.list.payment", "app.m-pesa.list.statement", "logic.code", "logic.filter", "app.slack.create.message"]),
  T("permits", "government", "Permit request handling", "Route applications, track SLAs and keep citizens informed.", ["trigger.form", "ai.classify", "logic.switch", "logic.approval", "app.resend.create.email", "output.audit"]),
  T("morning-brief", "personal", "Personal morning brief", "Calendar, inbox, tasks and weather in one message.", ["trigger.schedule", "app.google-calendar.list.event", "app.gmail.list.email", "app.todoist.list.task", "ai.summarize", "app.telegram.create.message"]),
  T("habit-track", "personal", "Health habit tracker", "Log daily metrics and nudge when you slip.", ["trigger.schedule", "app.fitbit.list.activity", "logic.filter", "app.telegram.create.message", "output.metric"]),
  T("error-handler", "engineering", "Global failure handler", "One flow that catches and reports every other flow's failures.", ["trigger.error", "ai.summarize", "app.linear.create.issue", "app.slack.create.message", "output.audit"]),
];


export const KIND_LABEL: Record<NodeKind, string> = {
  trigger: "Trigger",
  action: "Action",
  logic: "Logic",
  ai: "AI",
  output: "Output",
};

export const KIND_ORDER: NodeKind[] = ["trigger", "logic", "ai", "action", "output"];
