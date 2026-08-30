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
  nodes: string[];
}

export const NODES: Record<string, NodeDef> = {
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
};

const CORE = ["trigger.schedule", "trigger.webhook", "logic.filter", "logic.branch", "logic.delay", "logic.loop", "logic.approval", "ai.classify", "ai.extract", "ai.summarize", "ai.agent", "action.http", "output.report", "output.dashboard"];

export const VERTICALS: Vertical[] = [
  {
    id: "sales",
    name: "Sales & Growth",
    tagline: "Capture, score and route every lead the moment it lands.",
    glyph: "◈",
    nodes: [...CORE, "trigger.form", "action.crm", "action.slack", "action.email", "action.sheets", "action.calendar"],
  },
  {
    id: "marketing",
    name: "Marketing",
    tagline: "Content pipelines, campaign reporting, always-on nurture.",
    glyph: "◇",
    nodes: [...CORE, "trigger.form", "action.notion", "action.email", "action.slack", "action.storage"],
  },
  {
    id: "finance",
    name: "Finance & Ops",
    tagline: "Invoices, reconciliations and approvals without spreadsheets.",
    glyph: "▣",
    nodes: [...CORE, "trigger.email", "action.invoice", "action.sheets", "action.email", "action.storage"],
  },
  {
    id: "support",
    name: "Customer Support",
    tagline: "Triage, answer and escalate across every inbox.",
    glyph: "◉",
    nodes: [...CORE, "trigger.email", "action.slack", "action.email", "action.whatsapp", "action.crm"],
  },
  {
    id: "people",
    name: "People & HR",
    tagline: "Onboarding, reviews and reminders that never slip.",
    glyph: "◎",
    nodes: [...CORE, "trigger.form", "action.calendar", "action.email", "action.notion", "action.sheets"],
  },
  {
    id: "health",
    name: "Health & Clinics",
    tagline: "Appointments, reminders and follow-up care journeys.",
    glyph: "✚",
    nodes: [...CORE, "trigger.form", "action.calendar", "action.whatsapp", "action.sms", "action.notion"],
  },
  {
    id: "logistics",
    name: "Logistics & Field",
    tagline: "Dispatch, tracking and exception handling in real time.",
    glyph: "▲",
    nodes: [...CORE, "action.sms", "action.slack", "action.sheets", "action.storage", "action.http"],
  },
  {
    id: "education",
    name: "Education",
    tagline: "Enrolment, cohorts, grading and parent comms.",
    glyph: "❖",
    nodes: [...CORE, "trigger.form", "action.email", "action.sheets", "action.calendar", "action.whatsapp"],
  },
  {
    id: "realestate",
    name: "Real Estate",
    tagline: "Listings, viewings and buyer follow-through.",
    glyph: "⬢",
    nodes: [...CORE, "trigger.form", "action.crm", "action.calendar", "action.whatsapp", "action.notion"],
  },
  {
    id: "research",
    name: "Research & Data",
    tagline: "Collect, enrich and analyse continuously.",
    glyph: "◐",
    nodes: [...CORE, "trigger.notion", "action.notion", "action.sheets", "action.storage", "action.http"],
  },
];

export interface TemplateDef {
  id: string;
  vertical: string;
  name: string;
  description: string;
  chain: string[];
}

export const TEMPLATES: TemplateDef[] = [
  {
    id: "lead-router",
    vertical: "sales",
    name: "Inbound lead router",
    description: "Score every new lead with AI, push hot ones to the CRM and ping the team instantly.",
    chain: ["trigger.form", "ai.extract", "logic.filter", "action.crm", "action.slack"],
  },
  {
    id: "invoice-chaser",
    vertical: "finance",
    name: "Invoice chaser",
    description: "Watch the billing inbox, extract amounts, issue invoices and follow up on time.",
    chain: ["trigger.email", "ai.extract", "action.invoice", "logic.delay", "action.email"],
  },
  {
    id: "support-triage",
    vertical: "support",
    name: "Support triage desk",
    description: "Classify tickets, answer the easy ones and escalate the rest with context.",
    chain: ["trigger.email", "ai.classify", "logic.branch", "action.email", "action.slack"],
  },
  {
    id: "notion-digest",
    vertical: "research",
    name: "Notion live digest",
    description: "Track a Notion workspace, summarize changes and publish a daily digest.",
    chain: ["trigger.notion", "ai.summarize", "output.report", "action.slack"],
  },
  {
    id: "clinic-reminders",
    vertical: "health",
    name: "Appointment reminders",
    description: "Book the slot, remind on WhatsApp and follow up after the visit.",
    chain: ["trigger.form", "action.calendar", "logic.delay", "action.whatsapp", "action.sms"],
  },
  {
    id: "onboarding",
    vertical: "people",
    name: "Employee onboarding",
    description: "Kick off accounts, schedule intros and track every checklist item.",
    chain: ["trigger.form", "action.notion", "action.calendar", "logic.approval", "action.email"],
  },
];

export const KIND_LABEL: Record<NodeKind, string> = {
  trigger: "Trigger",
  action: "Action",
  logic: "Logic",
  ai: "AI",
  output: "Output",
};

export const KIND_ORDER: NodeKind[] = ["trigger", "logic", "ai", "action", "output"];
