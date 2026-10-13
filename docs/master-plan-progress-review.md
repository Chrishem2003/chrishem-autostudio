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

## Queue diagnostic snapshot consistency — 2026-10-11

The protected queue-health endpoint now reports `jobCountMismatch` when its independently queried aggregate job counts do not equal the number of queue rows inspected for audit consistency. These reads are not wrapped in one database snapshot, so concurrent enqueue/finalization can legitimately cause a temporary mismatch. The endpoint remains read-only; the mismatch is diagnostic, not a repair trigger. This does not replace staging concurrency acceptance.

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

## Runtime rollout gates and staging acceptance — 2026-10-10

The durable queue and outbound HTTP transport now share a small fail-closed gate module. Only the exact string `"true"` enables each capability; missing, misspelled, whitespace-padded, uppercase, or cross-wired flags remain disabled. Queue producer checks and the outbound transport call site use these helpers rather than duplicating raw environment comparisons.

Regression tests cover absent defaults, invalid values, independent flags, and the outbound transport's no-request response when readiness is not explicitly enabled. Entry-point review confirms manual execution validates saved JSON and the execution plan before queue enqueue; scheduled execution validates persisted JSON and the plan before enqueue; the queue worker revalidates persisted JSON and the plan before creating a run record or step intent.

**Not yet verified:** no real staging environment, deployed worker authentication, provider sandbox effect, or provider-side idempotency contract has been tested in this repository session. The rollout flags must remain disabled until the runbook's environment-specific checks are completed.


## Latest hardening batch — outbound request preflight

Added regression tests asserting that the server-side HTTP step refuses non-HTTP schemes, embedded URL credentials, unsupported methods, and request bodies larger than 64 KB before DNS resolution or any network attempt. These checks complement the existing default-off transport gate, DNS answer filtering and pinning, redirect avoidance, bounded timeout/response size, and conservative retry policy.

The runbook formatting around acceptance criteria was corrected and its environment boundary now explicitly distinguishes CI preflight tests from staging verification.

### Still required before rollout

- Run the latest CI against the exact branch head and inspect all jobs.
- Add/retain deterministic tests for request timeout, response-size overflow, redirect responses, and outbound transport behavior using a controlled local test server or injected transport seam; do not use public endpoints as a test fixture.
- Add stronger route/entry-point integration tests proving malformed persisted workflows and invalid mappings cannot enqueue jobs, create run records, or invoke providers.
- Verify migration/RPC permissions, worker authentication, duplicate delivery, lease loss, scheduled/manual execution, and one provider-side effect in dedicated staging.
- Keep `AUTOSTUDIO_DURABLE_QUEUE_ENABLED=false` and `AUTOSTUDIO_OUTBOUND_TRANSPORT_READY` unset or false until the staging acceptance gates pass.


## Outbound resilience test batch — 2026-10-11

The server-side HTTP client now has narrow injectable dependency seams for DNS resolution, a single request attempt, and retry waiting. Production behavior continues to use the existing validated-DNS/pinned-address transport; the seams exist so unit tests can deterministically verify policy without contacting public hosts.

Added tests verify:
- Redirect responses are not followed automatically.
- GET timeout failures stop after the configured three-attempt bound.
- POST timeout failures are not automatically retried.
- A response-size guard failure stops immediately rather than retrying a potentially large payload.
- Transient server errors on a safe method can recover and return the final successful status.

These are unit-level policy tests, not proof of real socket-level timeout or streaming-response enforcement. Staging still needs a controlled transport smoke test, and route-level tests are still needed to prove invalid workflow data cannot create queue/run records or invoke a provider.


## Durable audit error redaction — 2026-10-11

Added a shared, bounded sanitizer for error text before the durable worker persists job failures. It redacts authorization headers, common secret assignments, JWT-like tokens, URLs, and email addresses; normalizes control whitespace and caps output at 500 characters. Non-string, empty, or effectively redacted messages fall back to static operator guidance.

The worker applies the sanitizer both to executor-thrown exceptions and returned error strings before passing them to the queue finalization RPC. This reduces accidental credential/PII leakage from provider SDK messages into durable job audit fields. It is defense in depth, not a guarantee that every proprietary secret format is recognized; structured provider error codes and safe internal correlation IDs are preferable to raw provider messages.

Regression tests cover common token/key/URL/email patterns, fallback behavior, whitespace normalization, and output bounds.

### Acceptance checks
1. Exact-head CI must pass typecheck, unit tests, production build and queue database smoke tests.
2. Confirm a thrown provider error is redacted before the finalization RPC receives it.
3. Keep queue and outbound transport gates disabled until controlled staging confirms worker auth, lease fencing, audit recovery, and provider idempotency behavior.


## Persisted workflow boundary expansion — 2026-10-11

Expanded regression coverage for the persisted workflow → execution planner boundary. The tests now explicitly verify that duplicate node IDs and dangling edges are rejected by the planner even when the persisted JSON passes structural parsing, and that overlong workflow/node/edge identifiers and excessive edge counts are rejected before graph planning.

These are pure unit tests; they do not claim to simulate authenticated server-function middleware, Supabase transactions, or provider calls. Route-level integration tests and a controlled staging exercise remain required before promoting this branch to `main`.

## Main-branch promotion policy

Keep the hardening work isolated on `audit/p0-hardening` while it is being evaluated. Promote to `main` only after the exact final commit has green application CI and queue migration smoke tests, the PR diff has been reviewed for accidental secret exposure and unsafe execution paths, duplicate/idempotency and interruption behavior have evidence, and staging confirms the queue/transport gates remain disabled by default and can be enabled safely with rollback documented. No production-ready claim is made until those checks are complete.


## Durable queue idempotency integrity — 2026-10-11

Reviewed the durable enqueue function and strengthened its duplicate-delivery contract. Replaying the same automation/idempotency key now returns the existing job only when the logical request matches: trigger type, JSON payload, requester, and retry limit must agree. Reusing a key for different intent raises an explicit database error rather than silently returning an unrelated queued job.

The PostgreSQL smoke test now distinguishes a valid same-request replay from a conflicting payload replay. The staging runbook includes the same-key/different-request rejection as an acceptance check. This preserves safe retries while making request-ID collisions and accidental key reuse observable.

The workflow boundary CI failure on the previous head was also traced to a test expectation that contradicted the parser's existing behavior: duplicate node IDs are rejected by the structural parser before reaching the planner. The test now asserts rejection at that earliest boundary, while dangling-edge validation remains covered at the planner boundary.

**Exact-head verification at commit `63e29069ece37178bd1f4c591ad8629cb4da09ca`:** application typecheck, unit tests, production build, and the PostgreSQL migration/idempotency/lease/concurrency smoke test all passed. The subsequent documentation-only commit will receive its own CI run before promotion.

### Remaining rollout boundary

This verifies the SQL migration against the disposable PostgreSQL CI schema, not the user's live Supabase project. Keep the durable queue and outbound transport flags disabled until the staging runbook verifies real worker authentication, manual/scheduled queue flows, audit recovery, and provider-side effect evidence. Do not merge to `main` solely on the basis of CI.

## Shared saved-workflow preflight — 2026-10-11

**Implemented on the active hardening branch; exact-head CI is pending.**

- Added `preparePersistedExecutionPlan` as a shared boundary that parses untrusted saved workflow JSON and validates graph structure plus mapping contracts before returning an executable linear plan.
- The scheduled-run producer and durable queue worker now use this same helper instead of maintaining separate parser/planner sequences. This reduces the chance that one entry point accepts a saved workflow that another entry point rejects.
- Added unit tests for valid plans, malformed persisted JSON, dangling graph connections, and invalid mappings that reference undeclared trigger outputs.
- The supported runtime remains a single linear chain. This change does not enable branching, parallel paths, new connectors, or production side effects.
- The latest exact-head CI run must pass typecheck, unit tests, production build, and the PostgreSQL queue migration smoke test before this batch is considered verified.

### Master-plan status after this batch

The build remains aligned with the plan's reliability-first sequence: execution boundaries, connector contracts, safe mapping, audit output minimization, and queue recovery precede wider connector coverage and production activation. Still outstanding are staging migration/worker/transport rehearsal, the provider-agnostic AI gateway, full natural-language draft/refine UX, accessibility acceptance, teams/approvals, complete run analytics/API, and the P8 differentiators.

## Reliability advancement — 2026-10-11

- Queue health now reports an exact database count of expired leases separately from the bounded diagnostic sample. The response includes `totalCount`, `sampledCount`, and `truncated`; only up to 20 lease records are returned even though up to 100 are queried for triage.
- The scheduled queue producer now uses a stable payload for a deterministic idempotency key. Previously, a fresh `scheduledAt` timestamp could make a recovery enqueue look like a different request when enqueue succeeded but scheduler-lease release failed. The payload no longer changes across retries for that logical scheduled request.
- Queue RPC adapter exceptions no longer interpolate raw database error messages into thrown errors, and whitespace-only idempotency keys are rejected.
- The latest completed CI baseline before these newest reliability changes passed 190 tests across 27 files, typecheck, production build, and both disposable-PostgreSQL migration/concurrency checks. The newest reliability changes must pass their own exact-commit CI run before being considered verified.

## Durable execution trigger integrity — 2026-10-11

**Implemented and verified on commit `1c7699a1112d30dc1692d28aa23c92e95abd18d4`; both CI jobs passed.**

- The worker now preserves the database claim's authoritative `trigger_type` instead of inferring the run-log trigger from payload metadata.
- Scheduled jobs map the queue's `scheduled` value to the existing run-log label `schedule`; manual and webhook jobs retain their own trigger labels.
- Claim parsing rejects missing or unsupported trigger types before an automation can be executed, and tests cover all three supported queue trigger types plus invalid values.
- This prevents webhook-origin jobs from being silently mislabeled as scheduled runs and removes trust in caller-controlled payload metadata for audit classification.

**Verified:** typecheck, unit tests, production build, and PostgreSQL migration/idempotency/lease/concurrency smoke tests passed on the exact code commit. [GitHub Actions](https://github.com/Chrishem2003/chrishem-autostudio/actions/runs/38117976533)

### Next technical batch

1. Extract shared run-audit lifecycle safeguards and test that audit creation/association/persistence failures stop execution before a provider call.
2. Add route-level regression coverage for malformed persisted workflows at the real enqueue/run boundaries.
3. Continue the provider reliability contract: per-adapter capability declarations and only verified idempotency claims; no speculative retries of uncertain effects.

## Manual execution preflight parity — 2026-10-11

**Implemented on the active hardening branch; exact-head CI pending.**

- The authenticated manual flow entry point now uses `preparePersistedExecutionPlan`, the same saved-workflow trust boundary used by scheduled producers and durable queue workers.
- Manual execution therefore applies structural parsing, graph/linear-chain validation, and whole-flow mapping validation before queue enqueue, run-log creation, step-intent persistence, or provider invocation.
- Existing manual-run business validation and live connector preflight remain in place; this is shared-boundary parity, not a relaxation of capability checks.
- The change removes the separate manual parser/planner path, reducing drift between the three execution entry points.

**Acceptance gate:** exact-head typecheck, unit tests, production build, and PostgreSQL queue smoke checks must pass. Route/server-function behavior still needs staging verification; CI does not prove a live Supabase or provider interaction.

## Worker retry capability boundary — 2026-10-11

**Implemented on the active hardening branch; exact-head CI pending.**

- Removed `providerSupportsIdempotency` from the worker executor result contract. An executor can no longer self-assert that an uncertain provider action is safe to replay.
- The durable worker now sends uncertain outcomes to `needs_review` unless a trusted, reviewed adapter capability is explicitly wired into the worker. That integration is intentionally not inferred from payloads, provider errors, or executor return values.
- Added a regression test that deliberately returns `providerSupportsIdempotency: true` from an executor and asserts the worker still chooses manual review. This protects runtime behavior even if an old adapter continues returning the legacy field.
- Safe retries for failures known not to have attempted an external effect remain available; permanent configuration failures remain terminal.

**Acceptance boundary:** this narrows automatic retries conservatively. It does not implement provider-side idempotency or authorize queue/transport activation. Exact-head typecheck, unit tests, production build, and PostgreSQL queue smoke tests must pass; staging still must verify real provider effects and recovery.

## Provider idempotency claims corrected — 2026-10-11

**Implemented on the active hardening branch; exact-head CI pending.**

- Corrected the Gmail send action manifest: the adapter does not supply a provider-enforced idempotency key, so it must not advertise `provider-managed` idempotency or a provider-contract retry policy.
- Gmail uncertain outcomes now follow the same conservative contract as other message sends: no automatic replay without a separately implemented and verified idempotency mechanism; inspect provider state first.
- Added a connector-manifest regression test so future edits cannot silently restore the unsupported claim.
- This is a capability-truthfulness fix, not a change to the live Gmail transport. It does not authorize queue activation or automatic retries.

**Acceptance gate:** typecheck, tests, production build, and PostgreSQL queue smoke tests must pass on the exact resulting commit. Staging must still demonstrate provider behavior independently; manifest metadata alone is not provider-side proof.

## Audit persistence failure-injection tests — 2026-10-11

Added deterministic regression tests at the shared ordered step-execution boundary for three failure cases:

- A thrown step-intent persistence callback stops execution before any executor is called.
- A step that returns success but whose outcome cannot be persisted causes the flow to stop before any later step begins. The returned summary is failed and explicitly directs operators to verify external effects before retrying.
- When whole-flow mapping preflight fails and its audit intent cannot be persisted, the executor and outcome-persistence callback are never called; no provider step is attempted.

These tests strengthen the step-level fail-closed contract without pretending to test database transactions or provider behavior. They do not yet constitute server-function/route integration tests for run-log creation, durable-job association, or final run finalization. Those boundaries remain rollout acceptance items and must be verified against a controlled staging database before enabling the durable queue.

## Run-finalization write confirmation — 2026-10-11

Hardened all three live run-summary finalization paths (authenticated manual runs, durable queue workers, and scheduled runs). Each update now filters to a run still in `running` state, requests the updated row back, and treats either a database error **or a zero-row result** as an unconfirmed finalization.

- Manual execution throws an explicit recovery-oriented error rather than proceeding to update automation health or returning a successful run response when the summary write cannot be confirmed.
- The durable worker does not return a successful execution result to queue finalization unless the run-summary update returned the row it expected. A missing row or a row no longer in `running` is treated as an audit failure.
- Scheduled execution enters its existing failed-state fallback when the summary update errors or updates no row; it does not assume that a no-error response means a row was changed.

This closes the Supabase/PostgREST distinction between a successful request and a confirmed row mutation. It does not make run-step writes transactional with external provider actions, and it does not replace staging failure-injection tests against a real database. Keep durable queue and outbound transport gates disabled until those staging checks pass.

## Step-outcome write confirmation — 2026-10-11

Both synchronous manual execution and durable queued execution now consider a step outcome persisted only when the database update returns the expected run_step_logs row. Updates are scoped by step intent ID and run ID. A database error or zero-row result fails closed; the shared traversal halts subsequent steps because the external action may already have occurred while its outcome remains unrecorded.

Regression coverage explicitly exercises the zero-row/no-error callback result and verifies later steps do not execute. This is unit coverage of the traversal contract, not a substitute for staging fault-injection against the real Supabase adapter. Durable queue and outbound transport remain gated off pending staging acceptance.


## Interrupted-run recovery confirmation — 2026-10-11

Hardened recovery paths so they do not treat a no-error database response as proof that a run was actually recovered:

- Manual stale-run reconciliation now requests the updated run row and refuses to start a new live run if the stale run summary was not transitioned from `running` to `failed`.
- Manual, queued-worker, and scheduled-run exception recovery now scope the run update to `status = running`, request the updated row, and log an explicit recovery failure when no row is returned. Existing step-intent recovery remains uncertainty-preserving; zero in-flight step rows is allowed, but a database error is not.
- Scheduled step-outcome persistence is now scoped by both intent ID and run ID and succeeds only when the updated step row is returned, matching the manual and queued execution boundaries.
- Scheduled finalization fallback also checks for a returned row and records a diagnostic if fallback recovery cannot be confirmed.

These checks improve diagnosability and avoid false confidence in PostgREST zero-row updates. They do not make provider actions and audit writes transactional; controlled staging fault-injection is still required before enabling durable queue or outbound transport.


## Queue run-association fail-closed boundary — 2026-10-11

Extracted durable queue run creation and job-to-run association into a small, testable boundary. The queue route now records the run ID for recovery, confirms the durable job association, and only then continues to step execution. Run creation failure or association failure throws before the caller can enter workflow execution; if association fails after a run is created, the run ID remains available to the existing recovery path.

Unit tests cover run-creation failure, association rejection/transport error, and successful association. These tests validate the orchestration boundary; they do not emulate the full authenticated route or a real Supabase transaction. Exact-head CI and staging fault-injection remain required.


## Live capability preflight parity — 2026-10-11

Added one shared sequential live-capability preflight helper and applied it to authenticated manual runs, durable queue workers, and scheduled execution. The scheduled direct-execution path previously validated saved workflow structure/mappings but did not re-check each step's live connector capability before taking a scheduler lease and creating a run. It now checks after confirming the schedule is due and before lease acquisition, durable enqueue, audit-run creation, or provider invocation.

Regression tests verify that preflight stops at the first failing node and that a clean plan checks each node. These tests validate shared sequencing; they do not emulate live connector credentials or provider behavior. Exact-head CI and controlled staging checks remain required. Durable queue and outbound transport remain disabled until the documented staging gates pass.


## Execution entry-point regression gate — 2026-10-11

Introduced a shared prepared-execution gate and wired it into authenticated manual runs, scheduled runs, and the durable queue worker. The gate rejects malformed persisted workflows and invalid graph/mapping plans before its capability-preflight callback can run. Added tests for malformed workflow JSON, invalid graph structure, and valid plans entering preflight. These tests exercise the gate used by production entry points; downstream database writes/provider integrations still require staging fault-injection. CI must pass on the exact commit before this batch is considered verified.


## Audit-boundary review — diagnostic failure isolation (2026-10-11)

**Implemented on `audit/p0-hardening`; exact-head CI required before marking verified.**

- The ordered step engine now treats persistence-error callbacks as best-effort diagnostics. If logging/telemetry itself throws, the original safety decision is preserved: an unrecorded intent still means no action is attempted, and an unrecorded outcome still halts all later steps with an uncertainty warning.
- Added regression tests for both callback-failure combinations. These complement the existing intent-write, outcome-write, zero-row update, run-finalization, and recovery tests.
- This is a narrow resilience fix; it does not make provider effects and database audit writes transactional, nor does it replace controlled staging fault-injection.

### Upgraded master-plan phase crosswalk

| Plan area | Current assessment | Exit evidence still needed |
|---|---|---|
| P0 — security and execution foundation | Substantially implemented on the hardening branch; continuous regression work remains | Exact-head CI, reviewed PR diff, protected staging rehearsal, rollback evidence |
| P1 — connector contracts and truthful capabilities | Partial; reviewed manifests cover a limited set of live adapters | Broader adapters must each have validated config, executor, output contract, tests, and honest idempotency claims |
| P1 — AI gateway and natural-language flow drafting | Incomplete | Provider-agnostic gateway, structured draft/refine loop, missing-input clarification, safety validation |
| P2 — durable queue, triggers, and mapping | Core queue/worker and linear-chain mapping implemented; production deployment unverified | Live staging migration, auth/lease fencing, duplicate enqueue, worker recovery and provider-effect rehearsal |
| P3 — AI-assisted connector drafting | Roadmap | Generated integrations remain test-only until reviewed and explicitly approved |
| P4 — industry packs | Partial | Audit real executable capability per pack; do not count catalog-only nodes as implemented integrations |
| P5 — builder UX and accessibility | Not yet accepted | Keyboard-only flow creation, WCAG AA review, 375px layout, first-automation usability tests |
| P6 — teams and approvals | Incomplete | Workspace roles, invitations, shared connections, approval gates and authorization tests |
| P7 — analytics and API | Partial | Search/timeline, safe replay, version diff/restore, scoped API keys, quotas, health and retention controls |
| P8 — differentiators | Roadmap | Autopilot, Watch Mode, rewind simulation, approve/undo, multilingual/voice input |

**Phase decision:** stay in reliability hardening / P0 exit-gate work while closing staging evidence and route-boundary coverage. Do not jump to connector-count expansion or declare production readiness. Keep `AUTOSTUDIO_DURABLE_QUEUE_ENABLED=false` and `AUTOSTUDIO_OUTBOUND_TRANSPORT_READY` unset/false until the documented staging gates pass.


## Queue success requires confirmed audit success — 2026-10-11

- Added a database-level fence to `finish_execution_job`: `succeeded` is accepted only when the job has a linked `run_logs` row whose status is `succeeded` and whose `finished_at` is present. A missing, open, failed, or otherwise unconfirmed audit run causes finalization to return false; the worker cannot silently convert that into queue success.
- Expanded the read-only queue health consistency detector to report succeeded jobs without a linked, terminal-success audit run, including absent links, missing linked rows, failed runs, and missing completion timestamps.
- Added unit regressions for those contradictory states and PostgreSQL smoke coverage proving success is rejected before association and while the audit run is still open, then accepted only after the successful run summary is persisted.
- This is a durable database invariant, not merely a worker convention. Existing failed/review/retry transitions remain available and do not auto-replay external effects.
- CI must verify the new migration and tests on the exact resulting commit. Live Supabase migration application, scheduler configuration, and controlled provider-side staging remain separate rollout gates; queue and outbound transport flags stay disabled until they pass.


## Audit consistency diagnostics — queue completion and contradictory success — 2026-10-11

- Expanded the authenticated read-only queue health snapshot to include the queue row's own `finished_at` value, so a `succeeded` queue row without its completion timestamp is explicitly reported.
- Added detection for non-successful queue states (`queued`, `failed`, `needs_review`, or `dead_letter`) linked to a successfully finalized audit run. This is especially important because a queued state paired with a successful audit can signal a dangerous replay boundary.
- Added unit regressions for missing queue completion timestamps and successful audit runs paired with review/retry states. Diagnostics remain read-only and do not repair or replay work automatically.
- The preceding database smoke-test batch passed both CI jobs on commit `ebea47368689fe56d1d62dda8a7d61869c51a737`. This new diagnostics expansion requires its own exact-head CI before it is considered verified; staging evidence remains outstanding.


## Exact-head P0 verification checkpoint — 2026-10-11

- Commit `968e074a704892f908dac0eef628cffd76b1660b` passed GitHub Actions run [38134763618](https://github.com/Chrishem2003/chrishem-autostudio/actions/runs/38134763618).
- The passing run includes typecheck, the complete unit test suite, targeted execution-integrity lint, production build, disposable PostgreSQL migration smoke tests, idempotency and lease-fencing checks, RPC permission checks, and concurrent distinct-job claims.
- This closes the immediate exact-head CI check for that commit. It does **not** close P0: real staging migration application, authenticated cron endpoint checks, runtime transport validation, interruption/recovery rehearsal, and provider-side no-duplicate-effect evidence remain unchecked in `docs/P0_READINESS_GATE.md` and `docs/durable-queue-staging-runbook.md`.
- Keep `AUTOSTUDIO_DURABLE_QUEUE_ENABLED=false` and `AUTOSTUDIO_OUTBOUND_TRANSPORT_READY` unset/false until the non-production staging acceptance gates pass. The platform is not yet production-ready, and P1 is not authorized.



## Persisted workflow payload-boundary hardening — 2026-10-11

- The persisted workflow parser now enforces a total serialized workflow budget (512,000 characters) in addition to the existing aggregate configuration budget (256,000 characters). This closes a size-limit bypass through compatibility-preserved passthrough metadata.
- Non-serializable values, including cyclic objects and BigInt-containing payloads, are rejected safely before schema parsing or execution planning.
- Regression coverage was added for oversized metadata, cyclic input, and non-JSON values.
- Exact-head CI passed on `84ef7aea4f5654d955ffb1379cbed38422a69caa`: typecheck, unit suite, targeted execution-integrity lint, production build, and PostgreSQL migration/concurrency smoke test. See [CI run 38135641444](https://github.com/Chrishem2003/chrishem-autostudio/actions/runs/38135641444).
- This improves a code-level trust boundary but does not replace staging acceptance. P0 remains open; queue/outbound transport stay disabled until real staging evidence is recorded.



## Queue-health diagnostics accuracy and privacy — 2026-10-11

**Implemented and verified on exact head `6cfb63186f9d4dd1d9eb9899872759766c9074f4`; [CI run 38137098245 passed](https://github.com/Chrishem2003/chrishem-autostudio/actions/runs/38137098245).**

- Queue-health stale-run and expired-lease diagnostics now distinguish the number of rows actually returned to operators (`sampledCount`) from the bounded database result inspected (`inspectedCount`).
- Both summaries report truncation if either the exact database total exceeds the displayed sample or the inspected result exceeds the displayed sample.
- Regression tests cover a 137-row total, a 100-row inspected result, a 20-row displayed sample, and privacy checks that stale-run diagnostics omit automation identifiers.
- Queue-health monitoring continues to be read-only and secret-protected; uncertain/expired work is reported for investigation rather than automatically replayed.

### Current release boundary

This is a diagnostics correctness improvement, not P0 completion. The final P0 gate remains open until the actual non-production Supabase migration chain, authenticated deployed cron endpoint, provider-specific idempotency, interruption recovery, concurrent worker behavior, and secret/log checks have been evidenced in staging. Durable queue consumers and outbound transports remain disabled until those checks pass.


## Queue-health consistency snapshot bounds — 2026-10-11

- The read-only audit-consistency section now reports the total queue population from the already-collected per-status counts separately from the number of jobs inspected in its newest-first 100-row snapshot.
- It also distinguishes findings discovered in that inspected snapshot from the 20 findings returned in the response, and exposes separate and combined truncation flags. Existing `sampledJobs` and `findingCount` fields remain for compatibility; `findingCount` is explicitly the count found within inspected rows, not a claim about the entire queue.
- This avoids an operator mistaking a bounded diagnostic sample for a complete audit of every queued job. It does not mutate or repair queue/audit state, and it does not close the staging requirements in the P0 readiness gate.
- Exact-head CI is required for this batch before it is considered verified.

## Queue finding truncation semantics — 2026-10-11

- Tightened the protected health endpoint's consistency metadata so operators can distinguish findings computed from the inspected newest-first job snapshot from the 20-finding response sample.
- Added explicit findingScanTruncated and findingSampleTruncated fields. The compatibility field findingsTruncated now signals either kind of truncation, preventing a small finding sample from being mistaken for a queue-wide clean bill of health when more than 100 jobs exist.
- The endpoint remains read-only. This improves diagnostic honesty only; it does not replace staging concurrency checks or authorize automatic repair/replay. Exact-head CI is required for this change.


## Exact-head queue-health verification — 2026-10-11

- Current branch head `ba0f8aff3d62515229c17be39321de5ba4031b43` passed both required GitHub Actions jobs: [CI run 38138209525](https://github.com/Chrishem2003/chrishem-autostudio/actions/runs/38138209525).
- The passing jobs cover typecheck, the complete unit suite, targeted execution-integrity lint, production build, and the disposable PostgreSQL durable-queue migration/concurrency smoke test.
- The verified diagnostics work distinguishes database totals, inspected rows, and returned samples; exposes queue-count mismatch and bounded finding-scan/sample truncation; and keeps health checks read-only and secret-protected.
- This is an exact-head CI checkpoint, not P0 exit approval. The checklist below remains open for staging Supabase migration/authentication, provider idempotency and duplicate-effect verification, interrupted-worker recovery, concurrent-worker rehearsal, and final release evidence.
- Keep `AUTOSTUDIO_DURABLE_QUEUE_ENABLED=false` and `AUTOSTUDIO_OUTBOUND_TRANSPORT_READY` unset/false until the non-production staging gates pass.


## Retry-policy capability boundary — 2026-10-11

- Removed provider-idempotency claims from the retry policy's typed input contract. The pure retry decision helper no longer permits an uncertain external outcome to be requeued merely because a caller supplies a boolean and a non-empty key.
- Uncertain effects now always enter `needs_review` until a trusted, reviewed adapter capability is explicitly integrated. Malformed side-effect certainty also fails closed to manual review rather than falling through to a retry path.
- Regression tests cover legacy caller-supplied idempotency claims and malformed certainty. This is deliberately conservative: no provider-specific automatic retry is enabled by this change.
- Exact-head CI and the PostgreSQL smoke test are required for this batch. P0 still requires real staging verification of provider behavior, interruption recovery, concurrency, authentication, and migration rollout; keep durable queue and outbound transport disabled until acceptance evidence is recorded.


## Long-running execution lease keepalive — 2026-10-11

The queue worker now renews both its durable-job lease and shared automation overlap-prevention lease periodically while a provider action is pending. Unit coverage and exact-head CI passed at commit `bfcf93482b53f3956ca166a93991d616a84df3eb` ([run 38159286868](https://github.com/Chrishem2003/chrishem-autostudio/actions/runs/38159286868)). A lost lease during an in-flight action remains an uncertain outcome; the helper cannot cancel an already-issued provider request. Add a slow-action and interrupted-worker rehearsal to staging acceptance before enabling queue consumers. This closes a code-level gap, not the staging gate.


## Lease keepalive failure-path regression coverage — 2026-10-11

- Added regression coverage for a heartbeat transport rejection while a provider action is still in flight. Even if the provider action later rejects, the lease-loss signal takes precedence and the worker requires review rather than assuming retry is safe.
- Added a concurrency assertion that slow heartbeat requests never overlap when the interval fires faster than a heartbeat can complete.
- These are deterministic behavior checks for the in-process keepalive helper; they do not replace the staging rehearsal of actual scheduler timing, provider history, lease expiry, or restart behavior.


## Ambiguous audit-run snapshot handling — 2026-10-11

- Queue/audit consistency diagnostics now detect duplicate audit-run IDs in their supplied snapshot. Rather than letting row ordering choose a potentially misleading status, linked jobs are reported as ambiguous; a queue job marked succeeded is also flagged as lacking a confirmed successful audit run.
- Added a focused regression test with conflicting succeeded/failed rows sharing one run ID. This is defensive diagnostic behavior; the database primary key should prevent such duplicates in normal operation, and the monitor remains read-only.
- Exact-head CI and the PostgreSQL migration smoke test are required after this change. Staging rollout, provider idempotency, interrupted-worker recovery, and concurrent-worker rehearsal remain open.


## Expired-worker recovery scope regression — 2026-10-11

- Expanded the disposable PostgreSQL queue smoke test so the expired-lease recovery trigger is exercised against multiple in-flight step rows in the associated run.
- The test now requires every unfinished step in that run to become failed with `outcome_state = uncertain`, and requires the parent run to have a persisted failure status and completion timestamp.
- A separate running run and its running step are included as isolation controls; recovery must leave both untouched. This guards against broad or incorrectly scoped recovery updates.
- This is disposable-database CI evidence only. The actual non-production Supabase interruption/restart rehearsal and provider-side duplicate-effect inspection remain open; P0 is not closed.


## Terminal-step preservation in expired-worker recovery — 2026-10-11

- Expanded the PostgreSQL recovery fixture with an already-failed step in the same run as unfinished steps.
- The regression requires recovery to mark all still-running steps uncertain while preserving the pre-existing terminal step's status and diagnostic. This catches over-broad recovery updates that could erase useful audit history.
- The disposable PostgreSQL smoke suite and exact-head CI must pass after this addition. Actual staging interruption/restart and provider-effect reconciliation remain open; P0 remains open.


## P0 batch review — 2026-10-13

**Current code checkpoint:** `8771b31d38bb669dc8c66c8cb1c26a015d0a7d48` passed both required CI jobs in [run 38372858015](https://github.com/Chrishem2003/chrishem-autostudio/actions/runs/38372858015).

### Completed in the latest batch

- Hardened the scheduler, worker and queue-health authentication boundaries so malformed runtime auth results fail closed.
- Added generic cache-safe fallback responses for unexpected scheduler and worker exceptions; targeted lint now includes the cron guard.
- Closed a database write-boundary gap: authenticated users previously had direct write privileges and owner-all policies on `run_logs` and `run_step_logs`. A forward-only migration now gives authenticated users owner-scoped read-only access while server-side `service_role` retains guarded writes.
- Extended the disposable PostgreSQL migration-chain guard and smoke checks to verify the audit-write grants and policies.

### Remaining P0 acceptance

The hosted staging acceptance record is still NOT RUN. P0 remains open until a verified non-production Supabase project and deployed app are tested for migration/RLS/grants, cron auth, provider-side idempotency and duplicate effects, interrupted-worker recovery, concurrency, audit history, and deployed outbound transport behavior. A second reviewer and the repository-wide lint baseline decision are also outstanding. Keep queue producers/workers and outbound transport disabled; do not merge to `main` or start P1.

### Master-plan assessment

The latest work strengthens P0 security and execution integrity; it does not complete the broader roadmap. Provider-agnostic AI, graph/branch semantics, broader real connector implementations, accessibility acceptance, teams/approvals, reliability analytics/API and P8 differentiators remain later roadmap items and must not be treated as P0 release blockers unless explicitly brought into the release scope.


## Audit-write permission compatibility fix — 2026-10-13

- The audit-history migration correctly removes direct authenticated write privileges. A follow-up call-path audit found manual execution still used the user-scoped client for audit writes, which would fail under the hardened grants.
- Moved manual run/step audit insertion, outcome persistence, finalization and interruption recovery to the server-only Supabase admin client after the automation is verified against the authenticated user's ID. User-scoped audit reads and user-owned automation updates remain on the authenticated client.
- Exact-head CI passed at `79d681b97a1a3f56dec18f1a6f507e021f2f5f87` ([run 38374624825](https://github.com/Chrishem2003/chrishem-autostudio/actions/runs/38374624825)).
- Staging acceptance still must exercise manual execution and verify owner-scoped audit reads under the actual Supabase roles. P0 remains open.


## Outbound DNS pinning contract — 2026-10-13

- Strengthened `resolvePublicTarget` to reject malformed resolver answers and address-family mismatches for every returned DNS record before selecting a pinned socket destination.
- Added regression coverage for hostname-shaped results, IPv4/IPv6 family mismatches, and mixed public/malformed answers. Existing private-address rejection and DNS pinning tests remain in place.
- Exact-head CI passed at `ad91a53bb5842ae5bd6cc6098e750c3eac7b9a73` ([run 38376964605](https://github.com/Chrishem2003/chrishem-autostudio/actions/runs/38376964605)). Staging must still verify real DNS pinning, TLS hostname validation, timeout and redirect behavior. Outbound transport remains disabled pending the release gate.


## Sensitive audit-error redaction — 2026-10-13

- Fixed a cross-path inconsistency in audit-data sanitization: manual run/step persistence and shared run finalization now sanitize untrusted step-error details before writing durable audit fields.
- Added regression coverage for bearer tokens, query-bearing URLs and email addresses in run summaries.
- Exact-head CI passed at `ea5efc1ffe9f000aea13ae50850af591933302e0` ([run 38379158465](https://github.com/Chrishem2003/chrishem-autostudio/actions/runs/38379158465)).
- All hosted staging, provider-side duplicate-effect, interrupted-worker, deployed transport and independent-review gates remain open. P0 is not passed; P1 is not authorized.
