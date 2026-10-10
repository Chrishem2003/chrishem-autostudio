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

1. Finish staging queue/transport rehearsal and close any runtime failures.
2. Complete the connector manifest contract and derive truth labels from the registry.
3. Replace linear-only assumptions with an explicitly modeled execution graph and safe data mapping; keep unsupported branches disabled until semantics and tests exist.
4. Finish the provider-agnostic AI gateway and complete draft/refine/missing-input experience.
5. Audit onboarding, keyboard navigation, WCAG AA and mobile layout against measurable plan targets.
6. Build P6 teams/approvals, P7 observability and API, then P8 differentiators.

## Evidence boundary

GitHub CI is evidence for code/build/unit-test and disposable PostgreSQL behavior only. It is not evidence that a real Supabase project, deployment secret, scheduler service, provider account or customer workflow has been configured successfully.
