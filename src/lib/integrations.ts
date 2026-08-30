/**
 * Large integration catalog. Each app expands into multiple generated steps
 * (triggers + actions), which is where the bulk of the studio's step library
 * comes from.
 */

export interface AppDef {
  id: string;
  name: string;
  category: string;
  /** Nouns this app works with, e.g. "message", "deal". */
  objects: string[];
  /** Event names that can start a flow. */
  events?: string[];
  auth?: "oauth2" | "apiKey" | "basic" | "none";
}

export const CATEGORIES = [
  "Communication",
  "CRM & Sales",
  "Marketing",
  "Productivity",
  "Databases",
  "Developer",
  "Finance & Payments",
  "E-commerce",
  "Support",
  "HR & Recruiting",
  "Analytics",
  "AI & ML",
  "Storage & Files",
  "Calendar & Scheduling",
  "Forms & Surveys",
  "Social Media",
  "Project Management",
  "Security & Identity",
  "Logistics & Maps",
  "Health",
  "Education",
  "Real Estate",
  "Legal",
  "IoT & Devices",
] as const;

export type Category = (typeof CATEGORIES)[number];

const A = (
  name: string,
  category: Category,
  objects: string[],
  events: string[] = [],
  auth: AppDef["auth"] = "oauth2",
): AppDef => ({
  id: name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, ""),
  name,
  category,
  objects,
  events,
  auth,
});

export const APPS: AppDef[] = [
  // Communication
  A("Slack", "Communication", ["message", "channel", "user", "file", "reminder"], ["message posted", "reaction added", "member joined"]),
  A("Microsoft Teams", "Communication", ["message", "channel", "meeting"], ["message posted", "meeting started"]),
  A("Discord", "Communication", ["message", "member", "role"], ["message posted", "member joined"]),
  A("Telegram", "Communication", ["message", "photo", "poll"], ["message received"], "apiKey"),
  A("WhatsApp Business", "Communication", ["message", "template", "media"], ["message received", "status update"], "apiKey"),
  A("Twilio", "Communication", ["sms", "call", "verification"], ["sms received", "call completed"], "apiKey"),
  A("Vonage", "Communication", ["sms", "call"], ["sms received"], "apiKey"),
  A("Gmail", "Communication", ["email", "draft", "label", "thread"], ["email received", "label applied"]),
  A("Outlook", "Communication", ["email", "draft", "folder"], ["email received"]),
  A("Resend", "Communication", ["email", "audience", "contact"], ["email delivered", "email bounced"], "apiKey"),
  A("SendGrid", "Communication", ["email", "list", "contact"], ["email opened", "email clicked"], "apiKey"),
  A("Postmark", "Communication", ["email", "template"], ["email delivered"], "apiKey"),
  A("Mailgun", "Communication", ["email", "list"], ["email delivered"], "apiKey"),
  A("Zoom", "Communication", ["meeting", "webinar", "recording"], ["meeting ended", "recording ready"]),
  A("Google Meet", "Communication", ["meeting", "recording"], ["meeting ended"]),
  A("Matrix", "Communication", ["message", "room"], ["message posted"], "apiKey"),
  A("Signal", "Communication", ["message"], ["message received"], "apiKey"),
  A("Mattermost", "Communication", ["message", "channel"], ["message posted"], "apiKey"),

  // CRM & Sales
  A("HubSpot", "CRM & Sales", ["contact", "company", "deal", "ticket", "note", "task"], ["deal stage changed", "contact created", "form submitted"]),
  A("Salesforce", "CRM & Sales", ["lead", "account", "opportunity", "case", "task"], ["record created", "record updated", "opportunity won"]),
  A("Pipedrive", "CRM & Sales", ["deal", "person", "organization", "activity"], ["deal updated", "deal won"]),
  A("Zoho CRM", "CRM & Sales", ["lead", "contact", "deal"], ["record created"]),
  A("Close", "CRM & Sales", ["lead", "opportunity", "call"], ["lead status changed"], "apiKey"),
  A("Attio", "CRM & Sales", ["record", "list", "note"], ["record created"], "apiKey"),
  A("Copper", "CRM & Sales", ["person", "opportunity"], ["opportunity updated"], "apiKey"),
  A("Apollo", "CRM & Sales", ["contact", "sequence", "account"], ["reply received"], "apiKey"),
  A("Lemlist", "CRM & Sales", ["lead", "campaign"], ["reply received", "email opened"], "apiKey"),
  A("Outreach", "CRM & Sales", ["prospect", "sequence"], ["prospect replied"]),
  A("Gong", "CRM & Sales", ["call", "transcript"], ["call recorded"]),

  // Marketing
  A("Mailchimp", "Marketing", ["subscriber", "campaign", "audience"], ["subscriber added", "campaign sent"]),
  A("Klaviyo", "Marketing", ["profile", "event", "flow"], ["profile created", "metric fired"], "apiKey"),
  A("ActiveCampaign", "Marketing", ["contact", "deal", "automation"], ["contact tagged"], "apiKey"),
  A("Customer.io", "Marketing", ["person", "event", "campaign"], ["event tracked"], "apiKey"),
  A("Brevo", "Marketing", ["contact", "campaign", "sms"], ["contact added"], "apiKey"),
  A("Google Ads", "Marketing", ["campaign", "lead", "budget"], ["lead form submitted"]),
  A("Meta Ads", "Marketing", ["campaign", "lead", "audience"], ["lead created"]),
  A("LinkedIn Ads", "Marketing", ["campaign", "lead"], ["lead gen form submitted"]),
  A("Beehiiv", "Marketing", ["subscriber", "post"], ["subscriber added"], "apiKey"),
  A("ConvertKit", "Marketing", ["subscriber", "sequence", "tag"], ["subscriber tagged"], "apiKey"),
  A("Webflow", "Marketing", ["item", "form submission", "site"], ["form submitted", "item published"]),

  // Productivity
  A("Notion", "Productivity", ["page", "database row", "block", "comment"], ["page created", "page updated", "database row added"]),
  A("Google Docs", "Productivity", ["document", "paragraph"], ["document updated"]),
  A("Google Sheets", "Productivity", ["row", "sheet", "cell"], ["row added", "row updated"]),
  A("Microsoft Excel", "Productivity", ["row", "worksheet"], ["row added"]),
  A("Coda", "Productivity", ["row", "doc", "table"], ["row created"], "apiKey"),
  A("Evernote", "Productivity", ["note", "notebook"], ["note created"]),
  A("Obsidian", "Productivity", ["note", "vault file"], ["note created"], "none"),
  A("Todoist", "Productivity", ["task", "project", "label"], ["task completed", "task created"]),
  A("Things", "Productivity", ["task", "project"], ["task completed"], "none"),
  A("Miro", "Productivity", ["board", "sticky note"], ["board updated"]),
  A("Figma", "Productivity", ["file", "comment", "component"], ["comment added", "file updated"]),

  // Databases
  A("Airtable", "Databases", ["record", "table", "view"], ["record created", "record updated"], "apiKey"),
  A("Supabase", "Databases", ["row", "bucket object", "user"], ["row inserted", "row updated", "row deleted"], "apiKey"),
  A("PostgreSQL", "Databases", ["row", "query result"], ["row inserted"], "basic"),
  A("MySQL", "Databases", ["row", "query result"], ["row inserted"], "basic"),
  A("MongoDB", "Databases", ["document", "collection"], ["document inserted"], "basic"),
  A("Redis", "Databases", ["key", "stream entry"], ["key expired"], "basic"),
  A("Firebase", "Databases", ["document", "user"], ["document written"], "apiKey"),
  A("Snowflake", "Databases", ["row", "query result"], ["query finished"], "basic"),
  A("BigQuery", "Databases", ["row", "query result"], ["query finished"]),
  A("ClickHouse", "Databases", ["row", "query result"], ["insert completed"], "basic"),
  A("Elasticsearch", "Databases", ["document", "index"], ["document indexed"], "basic"),
  A("Pinecone", "Databases", ["vector", "namespace"], ["upsert completed"], "apiKey"),
  A("Weaviate", "Databases", ["object", "class"], ["object created"], "apiKey"),

  // Developer
  A("GitHub", "Developer", ["issue", "pull request", "release", "repository", "comment"], ["push", "pull request opened", "issue opened", "release published"]),
  A("GitLab", "Developer", ["issue", "merge request", "pipeline"], ["push", "pipeline finished"]),
  A("Bitbucket", "Developer", ["issue", "pull request"], ["push"]),
  A("Jira", "Developer", ["issue", "sprint", "comment"], ["issue created", "issue transitioned"]),
  A("Linear", "Developer", ["issue", "project", "cycle"], ["issue created", "issue status changed"], "apiKey"),
  A("Sentry", "Developer", ["issue", "event"], ["new error", "regression"], "apiKey"),
  A("Datadog", "Developer", ["metric", "monitor", "event"], ["alert triggered"], "apiKey"),
  A("PagerDuty", "Developer", ["incident", "service"], ["incident triggered", "incident resolved"], "apiKey"),
  A("Vercel", "Developer", ["deployment", "project"], ["deployment succeeded", "deployment failed"], "apiKey"),
  A("Netlify", "Developer", ["deployment", "form submission"], ["deploy succeeded", "form submitted"], "apiKey"),
  A("Cloudflare", "Developer", ["dns record", "worker", "cache"], ["security event"], "apiKey"),
  A("AWS Lambda", "Developer", ["invocation", "function"], ["invocation completed"], "apiKey"),
  A("Docker Hub", "Developer", ["image", "tag"], ["image pushed"], "apiKey"),
  A("Jenkins", "Developer", ["build", "job"], ["build finished"], "basic"),
  A("CircleCI", "Developer", ["pipeline", "workflow"], ["workflow finished"], "apiKey"),

  // Finance & Payments
  A("Stripe", "Finance & Payments", ["customer", "invoice", "subscription", "payment", "refund"], ["payment succeeded", "payment failed", "subscription cancelled", "invoice paid"], "apiKey"),
  A("Paddle", "Finance & Payments", ["transaction", "subscription", "customer"], ["transaction completed", "subscription paused"], "apiKey"),
  A("PayPal", "Finance & Payments", ["payment", "invoice", "dispute"], ["payment received", "dispute opened"]),
  A("M-Pesa", "Finance & Payments", ["payment", "b2c transfer", "statement"], ["payment received", "payment reversed"], "apiKey"),
  A("Flutterwave", "Finance & Payments", ["payment", "payout", "customer"], ["payment successful"], "apiKey"),
  A("Paystack", "Finance & Payments", ["transaction", "customer", "plan"], ["charge successful"], "apiKey"),
  A("Wise", "Finance & Payments", ["transfer", "balance"], ["transfer completed"], "apiKey"),
  A("QuickBooks", "Finance & Payments", ["invoice", "expense", "customer"], ["invoice paid"]),
  A("Xero", "Finance & Payments", ["invoice", "bill", "contact"], ["invoice paid"]),
  A("Wave", "Finance & Payments", ["invoice", "customer"], ["invoice sent"]),
  A("Brex", "Finance & Payments", ["expense", "card", "transaction"], ["transaction posted"], "apiKey"),
  A("Ramp", "Finance & Payments", ["expense", "transaction"], ["transaction posted"], "apiKey"),
  A("Plaid", "Finance & Payments", ["account", "transaction", "balance"], ["transaction synced"], "apiKey"),

  // E-commerce
  A("Shopify", "E-commerce", ["order", "product", "customer", "fulfillment"], ["order created", "order paid", "cart abandoned", "product updated"]),
  A("WooCommerce", "E-commerce", ["order", "product", "coupon"], ["order created"], "apiKey"),
  A("BigCommerce", "E-commerce", ["order", "product"], ["order created"], "apiKey"),
  A("Etsy", "E-commerce", ["order", "listing"], ["order received"]),
  A("Amazon Seller", "E-commerce", ["order", "listing", "shipment"], ["order received"], "apiKey"),
  A("Magento", "E-commerce", ["order", "product"], ["order placed"], "apiKey"),
  A("Gumroad", "E-commerce", ["sale", "product"], ["sale made"], "apiKey"),
  A("Lemon Squeezy", "E-commerce", ["order", "license", "subscription"], ["order created"], "apiKey"),

  // Support
  A("Zendesk", "Support", ["ticket", "user", "macro"], ["ticket created", "ticket solved"]),
  A("Intercom", "Support", ["conversation", "contact", "note"], ["conversation started", "reply received"]),
  A("Freshdesk", "Support", ["ticket", "contact"], ["ticket created"], "apiKey"),
  A("Front", "Support", ["conversation", "comment"], ["message received"], "apiKey"),
  A("Crisp", "Support", ["conversation", "message"], ["message received"], "apiKey"),
  A("Help Scout", "Support", ["conversation", "customer"], ["conversation created"], "apiKey"),
  A("Zoho Desk", "Support", ["ticket", "contact"], ["ticket created"]),

  // HR & Recruiting
  A("BambooHR", "HR & Recruiting", ["employee", "time off", "report"], ["employee hired", "time off requested"], "apiKey"),
  A("Workday", "HR & Recruiting", ["worker", "job requisition"], ["worker hired"]),
  A("Greenhouse", "HR & Recruiting", ["candidate", "application", "interview"], ["candidate applied", "stage changed"], "apiKey"),
  A("Lever", "HR & Recruiting", ["candidate", "opportunity"], ["candidate created"], "apiKey"),
  A("Personio", "HR & Recruiting", ["employee", "absence"], ["employee added"], "apiKey"),
  A("Deel", "HR & Recruiting", ["contract", "invoice", "worker"], ["contract signed"], "apiKey"),
  A("Gusto", "HR & Recruiting", ["employee", "payroll"], ["payroll processed"]),

  // Analytics
  A("Google Analytics", "Analytics", ["report", "event"], ["threshold crossed"]),
  A("Mixpanel", "Analytics", ["event", "profile", "cohort"], ["event tracked"], "apiKey"),
  A("Amplitude", "Analytics", ["event", "cohort"], ["cohort updated"], "apiKey"),
  A("PostHog", "Analytics", ["event", "person", "feature flag"], ["event captured"], "apiKey"),
  A("Metabase", "Analytics", ["question", "dashboard"], ["alert fired"], "apiKey"),
  A("Looker", "Analytics", ["look", "dashboard"], ["schedule delivered"]),
  A("Segment", "Analytics", ["track event", "identify"], ["event received"], "apiKey"),

  // AI & ML
  A("Lovable AI", "AI & ML", ["completion", "classification", "embedding", "image"], ["generation finished"], "none"),
  A("OpenAI", "AI & ML", ["completion", "embedding", "image", "transcription"], ["run completed"], "apiKey"),
  A("Anthropic", "AI & ML", ["completion", "tool call"], ["run completed"], "apiKey"),
  A("Google Gemini", "AI & ML", ["completion", "embedding", "image"], ["run completed"], "apiKey"),
  A("Mistral", "AI & ML", ["completion", "embedding"], ["run completed"], "apiKey"),
  A("Hugging Face", "AI & ML", ["inference", "dataset"], ["inference finished"], "apiKey"),
  A("Replicate", "AI & ML", ["prediction", "model"], ["prediction finished"], "apiKey"),
  A("ElevenLabs", "AI & ML", ["speech", "voice"], ["generation finished"], "apiKey"),
  A("Deepgram", "AI & ML", ["transcript"], ["transcription ready"], "apiKey"),
  A("AssemblyAI", "AI & ML", ["transcript", "summary"], ["transcription ready"], "apiKey"),
  A("Perplexity", "AI & ML", ["answer", "citation"], ["answer ready"], "apiKey"),

  // Storage & Files
  A("Google Drive", "Storage & Files", ["file", "folder", "permission"], ["file added", "file updated"]),
  A("Dropbox", "Storage & Files", ["file", "folder"], ["file added"]),
  A("OneDrive", "Storage & Files", ["file", "folder"], ["file added"]),
  A("Box", "Storage & Files", ["file", "folder"], ["file uploaded"]),
  A("AWS S3", "Storage & Files", ["object", "bucket"], ["object created"], "apiKey"),
  A("Cloudinary", "Storage & Files", ["asset", "transformation"], ["asset uploaded"], "apiKey"),
  A("DocuSign", "Storage & Files", ["envelope", "signature"], ["envelope completed"]),
  A("PandaDoc", "Storage & Files", ["document", "template"], ["document signed"], "apiKey"),

  // Calendar & Scheduling
  A("Google Calendar", "Calendar & Scheduling", ["event", "calendar", "invite"], ["event created", "event starting soon"]),
  A("Outlook Calendar", "Calendar & Scheduling", ["event", "invite"], ["event created"]),
  A("Calendly", "Calendar & Scheduling", ["booking", "invitee"], ["invitee scheduled", "invitee cancelled"], "apiKey"),
  A("Cal.com", "Calendar & Scheduling", ["booking", "event type"], ["booking created"], "apiKey"),
  A("Acuity", "Calendar & Scheduling", ["appointment", "client"], ["appointment scheduled"], "apiKey"),

  // Forms & Surveys
  A("Typeform", "Forms & Surveys", ["response", "form"], ["response submitted"], "apiKey"),
  A("Google Forms", "Forms & Surveys", ["response", "form"], ["response submitted"]),
  A("Tally", "Forms & Surveys", ["submission"], ["submission received"], "apiKey"),
  A("Jotform", "Forms & Surveys", ["submission"], ["submission received"], "apiKey"),
  A("SurveyMonkey", "Forms & Surveys", ["response", "survey"], ["response completed"]),
  A("Fillout", "Forms & Surveys", ["submission"], ["submission received"], "apiKey"),

  // Social Media
  A("X (Twitter)", "Social Media", ["post", "mention", "dm"], ["mention received", "new follower"]),
  A("LinkedIn", "Social Media", ["post", "comment", "message"], ["comment received"]),
  A("Instagram", "Social Media", ["post", "story", "comment"], ["comment received", "mention"]),
  A("Facebook Pages", "Social Media", ["post", "comment", "message"], ["message received"]),
  A("YouTube", "Social Media", ["video", "comment", "playlist"], ["video published", "comment posted"]),
  A("TikTok", "Social Media", ["video", "comment"], ["video published"]),
  A("Reddit", "Social Media", ["post", "comment"], ["keyword mentioned"]),
  A("Buffer", "Social Media", ["update", "profile"], ["post published"], "apiKey"),

  // Project Management
  A("Asana", "Project Management", ["task", "project", "section"], ["task created", "task completed"]),
  A("Trello", "Project Management", ["card", "list", "board"], ["card moved", "card created"]),
  A("Monday.com", "Project Management", ["item", "board", "update"], ["item created", "status changed"], "apiKey"),
  A("ClickUp", "Project Management", ["task", "list", "doc"], ["task status changed"], "apiKey"),
  A("Basecamp", "Project Management", ["todo", "message"], ["todo completed"]),
  A("Height", "Project Management", ["task", "list"], ["task created"], "apiKey"),
  A("Wrike", "Project Management", ["task", "folder"], ["task updated"]),

  // Security & Identity
  A("Auth0", "Security & Identity", ["user", "role", "session"], ["user signed up", "login failed"], "apiKey"),
  A("Okta", "Security & Identity", ["user", "group", "app assignment"], ["user deactivated"], "apiKey"),
  A("1Password", "Security & Identity", ["item", "vault"], ["item shared"], "apiKey"),
  A("Cloudflare Access", "Security & Identity", ["policy", "session"], ["access denied"], "apiKey"),
  A("Have I Been Pwned", "Security & Identity", ["breach", "account"], ["breach detected"], "apiKey"),

  // Logistics & Maps
  A("Google Maps", "Logistics & Maps", ["route", "place", "distance"], ["geofence entered"], "apiKey"),
  A("Mapbox", "Logistics & Maps", ["route", "geocode"], ["geofence entered"], "apiKey"),
  A("Shippo", "Logistics & Maps", ["shipment", "label", "tracking"], ["tracking updated"], "apiKey"),
  A("EasyPost", "Logistics & Maps", ["shipment", "tracker"], ["tracking updated"], "apiKey"),
  A("DHL", "Logistics & Maps", ["shipment", "tracking"], ["status changed"], "apiKey"),
  A("FedEx", "Logistics & Maps", ["shipment", "tracking"], ["status changed"], "apiKey"),
  A("Uber Direct", "Logistics & Maps", ["delivery", "courier"], ["delivery status changed"], "apiKey"),

  // Health
  A("Epic FHIR", "Health", ["patient", "appointment", "observation"], ["appointment booked", "result available"], "oauth2"),
  A("Cerner", "Health", ["patient", "encounter"], ["encounter created"]),
  A("Dosespot", "Health", ["prescription", "patient"], ["prescription sent"], "apiKey"),
  A("Fitbit", "Health", ["activity", "sleep", "heart rate"], ["daily summary ready"]),
  A("Apple Health", "Health", ["workout", "metric"], ["metric recorded"], "none"),
  A("Withings", "Health", ["measurement", "device"], ["measurement recorded"]),

  // Education
  A("Google Classroom", "Education", ["course", "assignment", "submission"], ["assignment submitted"]),
  A("Canvas LMS", "Education", ["course", "assignment", "grade"], ["grade posted"], "apiKey"),
  A("Moodle", "Education", ["course", "enrolment", "grade"], ["enrolment created"], "apiKey"),
  A("Teachable", "Education", ["student", "course", "enrolment"], ["student enrolled"], "apiKey"),
  A("Kajabi", "Education", ["member", "offer"], ["purchase made"], "apiKey"),

  // Real Estate
  A("Zillow", "Real Estate", ["listing", "lead"], ["lead received"], "apiKey"),
  A("MLS Grid", "Real Estate", ["listing", "media"], ["listing changed"], "apiKey"),
  A("Property24", "Real Estate", ["listing", "enquiry"], ["enquiry received"], "apiKey"),
  A("Buildium", "Real Estate", ["lease", "tenant", "work order"], ["work order created"], "apiKey"),

  // Legal
  A("Clio", "Legal", ["matter", "contact", "time entry"], ["matter created"]),
  A("Ironclad", "Legal", ["contract", "workflow"], ["contract signed"], "apiKey"),
  A("LegalZoom", "Legal", ["filing", "document"], ["filing completed"], "apiKey"),

  // IoT & Devices
  A("MQTT", "IoT & Devices", ["message", "topic"], ["message received"], "basic"),
  A("Home Assistant", "IoT & Devices", ["entity", "automation", "scene"], ["state changed"], "apiKey"),
  A("Particle", "IoT & Devices", ["device", "event", "function"], ["event published"], "apiKey"),
  A("Arduino Cloud", "IoT & Devices", ["thing", "property"], ["property changed"], "apiKey"),
  A("Tuya", "IoT & Devices", ["device", "command"], ["device state changed"], "apiKey"),
];

export const ACTION_VERBS = ["Create", "Update", "Find", "Delete", "List"] as const;

export function appActionId(app: AppDef, verb: string, object: string) {
  return `app.${app.id}.${verb.toLowerCase()}.${object.replace(/\s+/g, "-")}`;
}

export function appTriggerId(app: AppDef, event: string) {
  return `apptrigger.${app.id}.${event.replace(/\s+/g, "-")}`;
}

/** Total generated steps across every app. */
export function catalogSize() {
  let actions = 0;
  let triggers = 0;
  for (const app of APPS) {
    actions += app.objects.length * ACTION_VERBS.length;
    triggers += app.events?.length ?? 0;
  }
  return { apps: APPS.length, actions, triggers, total: actions + triggers };
}
