# Automation Studio master-plan progress review

Review date: 2026-10-10  
Plan source: **Automation Studio Master Plan and Lovable Prompt Pack** (user-provided attachment)  
Repository: https://github.com/Chrishem2003/chrishem-autostudio  
Review branch: `audit/p0-hardening`

## Executive assessment

The project has moved from an audited prototype toward a safer execution foundation. The strongest progress is in server-owned execution, URL/SSRF defenses, truthful live-capability checks, per-automation leases, durable queue primitives, and conservative recovery. The current CI proves typecheck, unit tests, production build, and the queue migration/concurrency tests against a disposable PostgreSQL 16 environment.

This is **not yet a production-ready or master-plan-complete automation platform**. The user's staging Supabase project, protected cron provider, actual outbound transport, and real provider actions have not been verified from this branch. The large integration catalog still contains many entries that are labels rather than live adapters. The executor currently accepts a linear chain only; conditional branches, parallel paths, and full step-to-step data mapping remain incomplete.

## Crosswalk against the plan

| Plan phase / outcome | Current status | Evidence / next acceptance gate |
|---|---|---|
| P0: protect AI planning | Implemented in code; CI green | `composeFlow` has authenticated middleware, a 20-second timeout, per-user quota/metering; verify behavior with signed-out and over-quota staging requests. |
| P0: SSRF-safe HTTP | Implemented in code; CI green | DNS answer validation, connection pinning, blocked special-use ranges and tests; still verify the deployed Node/runtime transport path with a controlled smoke test. |
| P0: missing connection-table migration | Implemented in repo | Verify full migration chain against the intended staging Supabase project. |
| P0: real scheduled Gmail execution / shared step wrapper | Shared server-side step executor and schedule path exist | Provider-side scheduled delivery has not been verified on staging. |
| P1a: truthful connection states | Partial but materially improved | Gmail requires a recent successful user-initiated test email; chat/HTTP are explicitly deployment-gated rather than falsely described as verified. |
| P1a: manifest per connector and generated catalog | Partial | `connector-manifests.ts` currently covers Gmail, chat webhooks, and HTTP. The broader app catalog is still separate and does not represent hundreds of real integrations. |
| P1: provider-agnostic AI gateway | Not complete | The plan calls for `ai.server.ts`, structured schema validation/retry, provider selection and metering. Existing planning still uses the Lovable gateway. |
| P1: full natural-language flow drafting | Partial | Intent planning exists, but the plan's complete per-step settings, missing-input collection, up-to-three clarification questions, reasoning line and chat-based JSON-patch refinement are not all delivered. |
| P2: triggers and queue-backed execution | Foundation in place | Manual live and scheduled producers can enqueue behind `AUTOSTUDIO_DURABLE_QUEUE_ENABLED`; worker claims at most one job per request and uses fenced leases. Inbound webhook queueing and polling cursors are not yet complete. |
| P2: durable reliability | CI verified, staging pending | Idempotent enqueue, atomic `SKIP LOCKED` claims, heartbeat/finalization fencing, safe retry policy, and uncertain-job review exist. Validate retry timing, interruption behavior and actual external side effects in staging. |
| P3: connector drafting from API documentation | Not complete | Requires a reviewable AI-generated connector workflow that remains Test only until human approval. |
| P4: industry packs | Partial / existing foundation | Verticals and templates exist; verify coverage and connector reality against the plan's first 16 industry packs. |
| P5: builder UX and accessibility | Not yet measured against targets | Plan acceptance includes keyboard operation, WCAG AA, accessibility score 95+, no horizontal overflow at 375px and a tested first automation in under five minutes. |
| P6: teams, roles and approvals | Not complete | Workspace/member role enforcement, invitation flow, shared connections, approval-to-go-live, comments and notifications require dedicated implementation and authorization tests. |
| P7: reliability analytics and API | Partial foundation | Run logs, versions and a health score exist, but full run search/timeline, safe replay, usage/cost quotas, version diff/restore, scoped REST keys, provider status and retention controls need acceptance tests. |
| P8: differentiators | Not complete | Autopilot, Watch Mode, 30-day rewind simulation, approve/undo, multilingual/voice input and connector drafting are future phases. |

## Connector contract milestone — 2026-10-10

The reviewed connector registry now defines explicit action contracts for the three supported families: Gmail send, chat webhook message, and HTTP request. Each action contract records accepted node IDs, required and optional string settings, side-effect class, idempotency posture, bounded timeout metadata, and truthful output semantics. A shared validator rejects missing required settings, non-string config values, and unreviewed actions; live preflight invokes it before the executor can perform a side effect. Generated chat message nodes resolve only for explicitly approved tool names.

Automated contract tests now check unique action identifiers, valid manifest-to-action relationships, output descriptions, timeout bounds, missing settings, type-invalid settings, and rejection of catalog-only actions. This narrows the gap between the marketing catalog and runtime capabilities, but it does not yet generate every catalog badge from the registry or implement additional providers.

## Current architecture strengths

- Server functions authenticate users and owner-scope automation lookups.
- Live execution is fail-closed when a step lacks a reviewed live executor or deployment prerequisites.
- A flow is rejected for live execution unless it is a single connected linear chain; unsupported branching is not silently flattened.
- Outbound HTTP validates DNS answers and pins requests to a validated public address.
- Step intent is recorded before external actions; uncertain outcomes are surfaced rather than automatically replayed.
- Manual and scheduled execution share the step execution/finalization helpers and per-automation lease model.
- The durable queue uses database-side idempotency, atomic claims, lease fencing, bounded attempts and a review state for expired in-flight jobs.
- The Studio UI now suppresses concurrent run submissions while one is in flight and reuses the same request ID during that invocation.

## Issues identified and corrected during this review

1. **Failed scheduled enqueue could advance the cadence cursor.** The scheduler's failure release timestamp now falls back to the Unix epoch when no previous `last_run_at` exists, so a failed enqueue remains eligible on the next scheduler pass rather than being silently delayed for an entire cadence interval.
2. **Rapid duplicate UI submissions could get distinct request IDs.** Studio now uses an in-flight guard and a shared request ID for the current run invocation, making repeated submissions in that invocation idempotent at the queue boundary.
3. **Permanent worker preflight errors could consume the retry budget immediately.** The queue worker now distinguishes permanent configuration/validation failures from retryable lock contention. Missing verification, invalid saved workflows and unsupported live plans finish as failed without rapid requeue; a busy automation retains its 30-second retry time. Unit tests cover both paths.

These fixes are covered by the branch's typecheck, unit tests, production build and PostgreSQL queue CI; the latest exact-commit run must remain green before merge.

## Required release gates

1. Keep `AUTOSTUDIO_DURABLE_QUEUE_ENABLED=false` until staging has the migration, deployed worker endpoint and verified cron secret.
2. Test unauthorized and authorized worker requests without leaking secrets.
3. Verify manual and scheduled queue jobs, duplicate enqueue, busy automation lease, retry backoff, expired lease and interrupted run history.
4. Verify provider-side effects independently (for example, a controlled test email) and prove no duplicate side effect.
5. Exercise outbound transport in the actual deployment runtime; a green build does not prove DNS pinning behaves correctly on the deployed platform.
6. Add automated integration contract tests for every manifest and ensure catalog badges are generated from supported runtime capability rather than app names.
7. Only then consider the queue ready for a gradual production rollout.

## Recommended build order from here

1. Complete the connector manifest contract and derive truth labels from the registry.
2. Finish staging queue/transport rehearsal and close any runtime failures.
3. Replace linear-only assumptions with an explicitly modeled execution graph and safe data mapping; keep unsupported branches disabled until semantics and tests exist.
4. Finish the provider-agnostic AI gateway and complete draft/refine/missing-input experience.
5. Audit onboarding, keyboard navigation, WCAG AA and mobile layout against measurable plan targets.
6. Build P6 teams/approvals, P7 observability and API, then P8 differentiators.

## Evidence boundary

GitHub CI is evidence for code/build/unit-test and disposable PostgreSQL behavior only. It is not evidence that a real Supabase project, deployment secret, scheduler service, provider account or customer workflow has been configured successfully.

## Connector capability labels — 2026-10-10

**Accepted on commit `7811db4d5e22ad986cb2a33e846e377249822c07`: GitHub Actions passed typecheck, unit tests, production build, and PostgreSQL queue smoke test.**

- Added a shared capability-label resolver backed by the reviewed connector manifest registry.
- The Step Library and Inspector now distinguish 'User test required', 'Runtime gated', 'Preflight only', and 'Catalog only' for connector-facing steps.
- Labels are based on explicit runtime/verification contracts, not on a provider name or a successful configuration form.
- Added regression coverage for Gmail, chat webhooks, generic HTTP, unsupported catalog-only HubSpot actions, and a core schedule trigger that should not receive a connector badge.
- This is a UI truthfulness improvement, not proof of live provider execution. Catalog-only steps remain unsupported for live execution unless a reviewed manifest and executor path are added.

### Acceptance evidence required

1. CI must pass on the exact head commit (typecheck, unit tests, production build and PostgreSQL queue smoke test).
2. Confirm the Step Library and Inspector render matching labels for the same node.
3. Confirm unsupported app.* and action.* nodes stay visibly marked 'Catalog only'.
4. Continue to keep deployment-gated HTTP and webhook transports disabled for production until staging security checks pass.

## Data-mapping safety boundary — 2026-10-10

**Accepted on commit `f1c769d8a1affe2e2794caef670707bd898fd668`: typecheck, unit tests, production build, and PostgreSQL queue smoke test all passed.**

- The Inspector now clearly labels displayed mapping tokens as design hints, not working runtime bindings.
- Live preflight rejects unresolved {{...}} placeholders in action configuration before any external side effect can occur. This prevents literal template strings from being sent as recipients, message content, or request payload values.
- Added regression tests covering Gmail recipient/subject/body and HTTP JSON payload tokens.
- The live executor still supports only a validated linear chain. Actual upstream-output capture, safe field-path resolution, type-aware interpolation and per-step output persistence remain future work. Do not treat this guard as implementation of data mapping.

### Acceptance evidence required

1. CI passes on the exact commit.
2. Unresolved tokens fail preflight with a clear error and no provider call.
3. Ordinary literal configurations and existing dry-run behavior remain unchanged.
4. The master plan's data-mapping milestone is not complete until output values can be safely produced, mapped, validated, redacted and audited end-to-end.

## Persisted workflow graph validation hardening — 2026-10-10

**Implemented; exact-head CI verification pending.**

- The live execution planner now rejects persisted node configuration objects containing non-string values before connector preflight or step execution. This prevents malformed JSON from reaching string-oriented provider adapters and causing an unhandled runtime exception.
- The planner now rejects duplicate connection IDs as well as duplicate endpoint pairs, dangling endpoints, cycles, branching, multiple triggers and disconnected nodes.
- Added regression tests for nested/non-string configuration values and duplicate connection IDs.
- This does not implement branching or dynamic data mapping. The live execution contract remains a single connected, acyclic chain with one trigger.

### Acceptance evidence required

1. Typecheck, unit tests, production build and PostgreSQL queue smoke test pass on the exact head commit.
2. Malformed persisted flows are rejected before any step intent or provider call.
3. Valid linear flows retain their current ordering and behavior.


## Runtime data-mapping resolver foundation — 2026-10-10

**Resolver and regression tests implemented on commit `51887f75fd221599688dfd529bcb49b2f624f3e3`; exact-head CI passed.** Both CI jobs completed successfully: typecheck, unit tests, production build, and PostgreSQL queue smoke test.

- Added a pure resolver for explicit `{{steps.<node-id>.<field>}}` references.
- It only accepts scalar string/number/boolean outputs, rejects missing fields and malformed tokens, and caps resolved values at 8,000 characters.
- Added tests for multi-token interpolation, missing references, malformed syntax, nested payload rejection, false/zero values, and oversized output.
- This is deliberately only the resolver foundation. It is **not wired into live execution yet**: upstream output contracts, allowlisted connector output capture, persistence/redaction, and pre-side-effect resolution integration remain required before live mapping can be enabled.
- Keep existing unresolved-token rejection in place until the complete runtime path is integrated and verified end-to-end.

### Next integration gate

1. Define connector-specific allowlisted output fields (never persist arbitrary provider bodies or credentials).
2. Extend step results and persistence to carry bounded, redacted structured outputs separately from human-readable status details.
3. Resolve mappings using only successfully completed prior nodes, before the next step's intent/external action; fail closed on absent values.
4. Add tests proving missing mappings stop before provider calls and sensitive values are not persisted in output snapshots.
5. Keep branching, parallel execution, and automatic retry of uncertain external side effects out of scope until their semantics are explicitly modeled.


## Runtime mapping integration — 2026-10-10

**Implemented on the active hardening branch; exact-head CI verification pending.**

- The shared ordered execution engine now resolves explicit `{{steps.<node-id>.<field>}}` references against outputs from earlier steps that completed successfully.
- Missing, malformed, or unsupported mappings fail the step before invoking the executor; the flow halts and the result explains that no external action was attempted.
- The executor now exposes only allowlisted scalar outputs for supported side effects: Gmail acceptance and a validated provider message ID when present, or HTTP status for chat/HTTP actions. It does not expose response bodies as mapping fields.
- Both durable-worker and legacy scheduled-run audit snapshots persist the allowlisted output object separately from the step detail. Existing detail remains bounded; no arbitrary provider response body is added to the output snapshot.
- Added flow-engine regression coverage for successful mapping and missing-output fail-stop behavior.
- Scope remains intentionally linear. Only successful prior nodes can supply outputs; failed steps cannot feed later steps, and no automatic replay semantics were added.

### Remaining acceptance checks

1. Exact-head CI passes typecheck, unit tests, production build and PostgreSQL smoke test.
2. Confirm route persistence serializes only the output fields from reviewed executors.
3. Add provider-adapter integration tests and a deployment staging rehearsal before enabling the durable queue or outbound HTTP transport.
4. Validate that mapping tokens in all supported config fields are resolved before any external request; unsupported token syntax must fail closed.


## Whole-flow mapping contract preflight — 2026-10-10

**Implemented and verified on commit `cc96736240b10cbc1d237f25a04efeaa3f0e1134`.** CI passed for both jobs: typecheck, unit tests, production build, and PostgreSQL queue migration smoke test.

- Every mapping is validated across the full planned linear chain before any executor can run. A broken reference in a later step therefore cannot be discovered only after an earlier step has already caused an external side effect.
- Mapping sources must be earlier nodes and fields must exist in the reviewed connector action's declared output contract.
- Dynamic values are allowed only in reviewed content fields: Gmail subject/body, HTTP request body, and supported chat message content. Recipient addresses, destination URLs, webhook URLs, and other unsupported fields fail closed.
- Malformed tokens, references to trigger/non-output fields, unknown output fields, and non-text configuration values are rejected. The failing node's preflight result is audited as `not_attempted`; no executor is called.
- Added tests for successful declared-field mapping, invalid later-step references, malformed tokens, unknown output fields, and sensitive-field restrictions. CI recorded 108 passing tests after the assertion correction.
- Runtime resolution still checks actual values from successful prior steps and retains the 8,000-character bound. The output contract remains allowlisted; generic HTTP response bodies are never exposed to mappings.
- This is not a production launch approval. Durable queue and outbound HTTP remain gated pending a deployment staging rehearsal, transport/SSRF checks in the target environment, and provider-adapter integration verification.

### Next engineering gate

1. Add explicit regression coverage for output redaction and persistence snapshots, including ensuring provider credentials or arbitrary response bodies can never enter mapped outputs.
2. Test malformed persisted workflows through the actual API entry points, not only the shared engine.
3. Run a staging rehearsal with queue flag and outbound transport disabled first; enable only after reviewed operator-controlled acceptance checks.


## Output allowlisting and pre-enqueue mapping validation — 2026-10-10

**Implemented on the active hardening branch; the latest code CI typecheck, unit tests, and production build passed. Final queue smoke-test result is being checked against the exact current head.**

- Added a shared execution-boundary sanitizer that treats adapter outputs as untrusted, retains only connector-declared fields, validates field-specific formats, and drops undeclared fields such as arbitrary response bodies and access-token fields.
- Sanitization occurs before audit persistence and before outputs are made available to downstream steps. Regression tests assert that sensitive-looking fields and private response payloads do not appear in persisted step objects or downstream mapping values.
- The linear execution planner now performs whole-flow mapping contract validation after determining the actual graph order. Scheduler/worker paths that use the planner reject malformed mappings before queueing or running the workflow; the shared execution engine repeats validation as defense in depth.
- Added planning tests for rejected trigger/non-output references and accepted declared HTTP status mappings, plus engine-level tests for sanitized persistence and downstream mapping.
- Fixed an existing test fixture that had passed connector IDs as configuration values rather than using actual node definition IDs. CI caught this mismatch; the corrected fixture now exercises the intended HTTP output contract.
- The workflow still supports only a linear chain. Branching, arbitrary provider response mapping, and production transport activation remain out of scope until their contracts and staging evidence are complete.

### Next batch

1. Add API-route regression tests for invalid saved workflow payloads and confirm rejection happens before enqueue/intent creation.
2. Review outbound HTTP SSRF protections and deployment-gate behavior against the actual transport implementation.
3. Verify the latest exact-head CI run and keep the durable queue disabled until a staging rehearsal is signed off.


## Audit-data minimization and manual-run parity — 2026-10-10

**Implemented on commit `062305cad656504cd0a169e6518dc9cc7c5a7ed8`; both CI jobs passed on that exact code head.**

- The HTTP transport no longer buffers response-body previews for run details. It enforces the 1 MB response-size limit while consuming the response stream, but persisted execution summaries contain only the status and destination hostname, never remote payload content.
- Added regression tests for generic success/error summaries that must not include response bodies.
- The authenticated manual flow executor now persists sanitized, connector-allowlisted step outputs in its audit snapshot, matching the queue-worker and scheduled execution paths.
- The planner validates mapping contracts before the manual queue/enqueue branch, and the shared execution engine repeats validation and sanitizes outputs before audit persistence and downstream use.
- Verification: typecheck, unit tests, production build, and durable queue migration smoke test all passed on the exact code head. The latest run is [GitHub Actions](https://github.com/Chrishem2003/chrishem-autostudio/actions/runs/38084834085).

### Remaining launch gates

- Run a controlled staging rehearsal with outbound transport and durable queue still disabled first.
- Verify deployment-specific DNS/network behavior and operator-controlled enablement before activating external requests.
- Keep uncertain external side effects in manual review rather than automatic replay.


## Prototype-safe mapping storage — 2026-10-10

**Implemented on commit `75244ff8f00620093fd65d9980f1f69ee737bdf7`; both CI jobs passed on the exact code head.**

- Prior-step output storage and resolved configuration objects now use null-prototype records, avoiding inherited object properties and special-key setter behavior during interpolation.
- Resolver lookups require an own entry for the referenced step ID as well as an own field on the step output.
- Added regression tests for special-looking step IDs and for resolved config objects without inherited prototypes.
- Verification: typecheck, unit tests, production build, and durable queue migration smoke test all passed on the exact code head: [GitHub Actions](https://github.com/Chrishem2003/chrishem-autostudio/actions/runs/38085054808).

### Next batch priority

1. Finish the API-entrypoint and persisted-workflow negative-path review.
2. Add staging checklist assertions for output redaction, queue disabled-by-default, and outbound transport disabled-by-default.
3. Only after those checks, plan the controlled staging rehearsal; do not enable live transport merely because CI is green.

## Persisted-workflow boundary and SSRF range review — 2026-10-10

A shared runtime schema now validates saved workflow JSON at the authenticated manual execution entry point, the scheduled producer, and the durable queue worker. It bounds node/edge counts, IDs, labels, configuration keys and values, and rejects malformed node coordinates before planning. The queue worker now fails malformed persisted workflows as not-attempted rather than trusting a database JSON cast. Graph semantics still pass through the separate linear execution planner.

The outbound IP policy now also rejects additional IPv4 special-use ranges (192.31.196.0/24, 192.52.193.0/24, and 192.175.48.0/24) and the IPv6 documentation prefix 3fff::/20, with regression tests. The request transport remains pinned to a previously validated DNS result and does not automatically follow redirects; remote response bodies are bounded and never stored in run details.

**Acceptance boundary:** these changes need exact-head CI confirmation. They do not constitute a staging deployment, a real provider-side delivery test, or permission to enable queue/outbound feature flags. Keep `AUTOSTUDIO_DURABLE_QUEUE_ENABLED=false` and `AUTOSTUDIO_OUTBOUND_TRANSPORT_READY` unset/false until the staging runbook's gates pass.
