# Chrishem AutoStudio — Product North Star

Status: living product contract  
Last reviewed: 2026-10-10  
Scope: product quality, information architecture, user experience, reliability and the build sequence.

## The promise

Chrishem AutoStudio should let a first-time user describe a business outcome, understand the proposed workflow, connect only the accounts needed, preview the exact effects, and safely activate it — then see what happened and recover when something fails.

The product must optimize for **trust, clarity and successful outcomes**, not the largest connector count or the most impressive-looking demo.

## Non-negotiable product rules

1. **Truth before spectacle.** A connector, status, metric, AI action, or repair is shown as real only when backed by verified implementation and evidence. Label examples, previews, estimates and unavailable capabilities explicitly.
2. **Preview before side effects.** Every workflow has a visible lifecycle: Draft → Validate → Preview → Approve → Live → Monitor. Live execution explains which external effects may occur and requires explicit confirmation.
3. **One source of execution truth.** Manual, scheduled and webhook triggers must eventually enter one server-owned execution engine, one event model and one idempotency policy. The browser is a control surface, never the authority for execution outcomes.
4. **Recoverability is a feature.** Failures show the affected step, safe redacted context, likely cause, next safe action, retry eligibility, and whether retrying could duplicate an external effect.
5. **Least privilege by default.** Ask only for required provider scopes, isolate workspace credentials, keep secrets server-side, rotate encryption keys, and provide clear revoke/disconnect flows.
6. **Progressive disclosure.** New users see a short guided path; experts can open graph details, mappings, execution logs, payload schemas and advanced settings without being forced through them.
7. **Accessible and responsive.** Keyboard navigation, visible focus, readable contrast, semantic headings, reduced-motion support, helpful empty/loading/error states and small-screen layouts are acceptance criteria.
8. **No silent degradation.** Missing configuration, unsupported nodes, stale verification, expired credentials, queue backlog and failed schedules must be visible and actionable.
9. **Evidence-based health.** Health scores must be derived from observable, documented signals; never manufacture installs, uptime, savings, success rates or provider status.
10. **Backward compatibility.** Flow versions and migrations must be explicit; deploys should not silently reinterpret existing saved workflows.

## Information architecture

### Primary navigation

- **Studio** — create and edit workflows.
- **My Workspace** — saved workflows, status, version history and ownership.
- **Runs** — searchable run history, step timelines, safe redacted details, retries/replays where safe.
- **Connections** — provider account state, required scopes, last verified time, expiry and disconnect.
- **Templates / Marketplace** — searchable, categorized starter flows with compatibility and required connections visible before installation.
- **Community Gallery** — published workflow definitions with provenance, safety notes and import preview.
- **Impact & Plans** — honest usage, limits and measured impact; checkout only when billing is truly connected.
- **Embed / Developer** — SDK, API docs, webhook setup, examples and compatibility policy.
- **Settings** — profile, workspace, roles, security, usage, retention and audit trail.

Keep the top-level navigation small and stable. Contextual actions such as run, validate, map, inspect and repair belong in the workflow workspace, not as competing global destinations. On mobile, convert the workspace sidebar into a compact wrap/scroll navigation without hiding the current section.

### Studio layout

- **Top bar:** product identity, workflow selector, save state, validation state, command search, help and account/workspace menu.
- **Left rail:** trigger and action palette, grouped by category and searchable.
- **Center canvas:** graph with clear node types, readable labels, zoom/fit, auto-layout, minimap only when useful, and obvious selected-node focus.
- **Right inspector:** selected node configuration, inputs/outputs, field mapping, scopes and validation errors.
- **Bottom or docked run panel:** Preview/Live distinction, run timeline, per-step results, logs and safe recovery actions.
- **AI copilot:** proposes a reviewable patch or workflow draft; it never silently changes a live flow or overrides validation.
- **Global command palette:** keyboard-accessible actions and navigation; every command must have a real action and a useful empty state.

On narrow screens, collapse side panels into tabs/drawers and preserve the canvas's essential controls. Do not simply scale a three-column desktop layout until it becomes unusable.

## Visual system

- Use a calm, high-contrast interface with one primary accent, restrained semantic colors, consistent spacing and a clear type scale.
- Reserve red for errors/destructive actions, amber for warnings/pending states, green for verified success, and neutral tones for informational metadata.
- Use color plus text/icon labels; never communicate status by color alone.
- Prefer consistent page headers, breadcrumb/context, content width, card spacing, button hierarchy and empty states across Studio, Workspace, Marketplace and Gallery.
- Avoid fabricated analytics, excessive gradients, ornamental charts and crowded toolbars. Every visible panel must help the user decide or act.
- Provide loading skeletons for content fetches, retry controls for recoverable errors, confirmation for destructive actions, and success feedback that corresponds to a confirmed server result.

## Workflow lifecycle and status vocabulary

- **Draft:** editable, not executable against real services.
- **Needs setup:** one or more required connections/configurations are missing.
- **Ready to preview:** schema and graph validation pass; preview has no external side effects.
- **Preview passed:** a server-backed preview completed for the current saved version.
- **Needs approval:** policy or user approval is required before live execution.
- **Live:** eligible to execute with a supported trigger, verified connections and passed gates.
- **Paused:** deliberately not scheduled or triggered.
- **Degraded:** recent observable failures, stale connection verification, or operational risk exists.
- **Failed:** a specific execution or setup operation failed; display the cause and next action.
- **Unsupported:** the node/provider is not implemented for the selected trigger/mode. Never disguise it as a successful dry run or a connected account.

Status transitions must be enforced server-side as well as reflected in the UI.

## The execution contract

A future shared engine should accept a validated, versioned workflow plus trigger context and mode. It should:

1. Authenticate the actor or validate a scoped trigger credential.
2. Load the authoritative saved version and verify ownership/workspace policy.
3. Validate graph structure, schemas, connection status, scopes and capability manifests.
4. Create a durable run record and idempotency key before side effects.
5. Enqueue or claim work under a bounded lease; never rely on a browser-held loop.
6. Execute only registered adapters with per-step timeout, rate limits, cancellation and redacted structured events.
7. Apply retry/backoff only when idempotency semantics make it safe; use provider idempotency keys where supported.
8. Stop or branch according to explicit graph semantics; do not silently treat unsupported branches as linear steps.
9. Record durable step outcomes and the exact workflow version; expose the run timeline to the UI.
10. Release leases and finalize the run in guaranteed cleanup paths, with watchdog recovery for abandoned jobs.

Queue semantics, concurrency limits, retries and dead-letter policy need integration tests against a disposable database before production enablement.

## Connector contract

Every provider adapter should declare a versioned manifest: provider ID, display name, trigger/action IDs, required scopes, input/output schemas, verification method, rate-limit hints, retry/idempotency capabilities, data classification, supported regions if applicable, and documented limitations.

Connection lifecycle: **Not connected → Connecting → Pending verification → Verified → Expired/Revoked/Needs attention → Disconnected**. A credential being present is not proof that the provider is usable. Verification must call a safe provider endpoint or perform an explicit test action, and store the result/time/error category without logging secrets.

Start with a small number of complete, well-tested connectors rather than a wide catalog of placeholders. A connector is launch-ready only when OAuth/webhook setup, verification, least privilege, token refresh/revocation, failure messaging, sandbox tests and usage documentation all pass.

## Quality gates and release policy

- Typecheck, unit tests, lint and production build must pass in CI.
- Add component/route tests for navigation, loading, empty/error states, confirmation dialogs and mobile layouts.
- Add database integration tests for migrations, RLS, quota races, leases and idempotency using a disposable environment.
- Add adapter contract tests and sandbox end-to-end tests per provider.
- Run dependency, secret, static-analysis and accessibility checks.
- Test a deployed runtime before enabling outbound transports; a successful bundle build is not runtime proof.
- Use feature flags for risky capabilities and roll out to a test workspace first.
- A release checklist must identify what is verified, what remains gated, migration rollback strategy and an operator to watch the rollout.
- Never claim “no errors” absolutely. Report the checks that ran, the environments they cover and known untested paths.

## Delivery roadmap

### Track A — Finish safety and correctness before launch
- Complete a disposable Supabase migration/RLS/concurrency test.
- Verify the deployed outbound HTTP transport's DNS pinning, TLS, redirects and timeout behavior; keep live transport disabled until it passes.
- Complete Gmail end-to-end, including revoked/expired credentials and schedule execution.
- Add connector manifests and truthful verification lifecycle for each provider.
- Unify manual/scheduled/webhook execution through a shared engine with durable queue, idempotency and recovery.
- Add encryption-key versioning and credential rotation.

### Track B — Make the product feel coherent
- Standardize shared top navigation, responsive workspace navigation, page headers, breadcrumbs and button hierarchy.
- Add global search/command palette navigation for workflows, runs, connectors, templates and settings.
- Build a first-run onboarding checklist with progress, safe sample workflow, connection setup and first preview.
- Add validation summary with jump-to-node actions; make every error explain how to fix it.
- Add workflow list filters/search/sort, bulk-safe pause actions and clear version/status metadata.
- Make run details searchable and filterable; show trigger, workflow version, duration, affected steps and next safe action.
- Test keyboard-only operation and small-screen layouts.

### Track C — Differentiators after the foundation is proven
- Human approvals and policy rules for sensitive actions.
- Safe replay/rewind simulation based on captured, redacted events.
- Metadata-only Watch Mode with explicit consent and scoped permissions.
- Industry packs with tested schemas, required connectors, sample data and honest compatibility labels.
- Team roles, audit log, retention controls, scoped API keys and organization-level quotas.
- Usage/impact analytics only from measured events and documented formulas.

## Definition of done

A feature is not done when the screen exists. It is done when the user can understand it, complete the main path with keyboard and touch, recover from a realistic failure, see truthful status, and automated tests cover the important success and failure cases. Any provider-backed feature also needs a real sandbox or deployed verification result before it is labelled live.
