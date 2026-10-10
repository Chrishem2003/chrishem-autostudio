# AutoStudio Repository Audit — Baseline

Audit date: 2026-10-10
Repository: https://github.com/Chrishem2003/chrishem-autostudio
Branch: audit/p0-hardening
Baseline: main branch, read-only inspection through GitHub repository APIs.

## Scope and confidence

This is a source-level baseline, not a local build or live production test. The repository has not yet been cloned into a local runtime in this session, and no build, typecheck, unit test, database migration, or real provider verification has been executed here. Findings below are grounded in the inspected files and should be revalidated by automated checks before merge.

## Existing foundation observed

- TanStack Start / React / TypeScript application with Supabase integration.
- Workflow editor, automation catalog, workflow types, templates/gallery, impact/SDK/embed pages.
- Authentication middleware used by most cloud and Gmail server functions.
- Existing run and step logs, version history, scheduled cadence helper, chat webhook and Gmail step modules.
- Four test files under `src/lib/__tests__`, covering chat steps, Gmail steps, scheduling, and web address rules.
- Lovable-connected repository guidance warns against rewriting published Git history.

## Confirmed source-level gaps

### P0 — Security and execution correctness

1. `src/lib/copilot.functions.ts`: `composeFlow` has no `requireSupabaseAuth` middleware in the inspected implementation, no explicit upstream timeout, and no per-user usage/rate-limit check. Its response is parsed from model text and filtered against candidate IDs, but the returned structure is not fully schema-validated.
2. `src/lib/web-steps.server.ts`: `isBlockedHost` uses string-prefix checks for IPv6 ranges; this can incorrectly reject public hostnames beginning with `fc` or `fd`. It does not resolve DNS records and validate/pin the resolved addresses before the outbound request, leaving a server-side request forgery / DNS-rebinding hardening gap.
3. `src/routes/api/public/cron/run-scheduled.ts`: the scheduler has a separate step loop. It sends chat webhook and HTTP steps, but other action nodes are recorded as `dry_run` / practice steps. This diverges from the guide's goal of one shared executor.
4. Only two files are present under `supabase/migrations` at baseline. The application uses `app_user_connections` in `src/lib/app-user-connections.server.ts` and its generated database types, but the inspected migrations do not create that table.
5. A root `.env` file is tracked. The inspected entries appear to be project URL/ID and publishable-key configuration, not a service-role secret. Nonetheless, tracked environment files are unsafe operational practice; replace it with a placeholder-only `.env.example` and remove `.env` from the branch after confirming no deployment workflow relies on the committed file. If any real secrets are discovered, rotate them.
6. `package.json` defines build/lint/format scripts but no test script. Existing tests import Vitest, while Vitest was not listed among the inspected package's declared dependencies. The test setup needs to be made reproducible before relying on test claims.
7. `src/lib/cloud.functions.ts`: `connectIntegration` marks metadata as `connected` and timestamps it without performing a provider verification call; `verifyIntegration` updates the same fields without a provider call. This conflicts with the plan's "connected means verified" rule.

## Delivery sequence aligned to the Master Plan

- **Gate 0 — Establish a reproducible baseline:** ensure secrets are not tracked; make lint/build/typecheck/tests runnable; record actual outcomes and current commit.
- **P0 — Security and scheduler fixes:** protect and meter AI planning; harden URL/IP checks against private and mapped addresses; add missing connection migration with RLS and no client policies; make scheduled/manual step execution share implementation; document scheduler setup.
- **P1a — Truthful connections:** introduce connector manifests and real read-only verification; only show Live after successful verification.
- **P1b — Connectors:** add providers in the plan's messaging, work-data, and money batches; test each against provider sandbox accounts before claiming Live.
- **P2 — Shared executor and queue:** unify manual, scheduled, and webhook runs; add idempotency, retry/backoff, event logs, provider circuit breakers, and dead-letter handling.
- **P3 — Safe AI planning:** provider-agnostic gateway, strict schemas, usage metering, bounded clarification questions, and reviewable patch-based refinement.
- **P4–P5 — Industry packs and UX:** templates with valid dry runs, onboarding, accessible responsive builder, honest status states, and error actions.
- **P6–P7 — Teams and operations:** workspace roles/approvals, audit log, replay/version diff, quotas, retention, scoped API keys, and health/status reporting.
- **P8 — Differentiators:** metadata-only Autopilot with explicit consent, Watch Mode, rewind simulation, approval/undo, multilingual UX, and human-reviewed connector drafting.

## Additional hardening ideas to evaluate after P0

- A capability/permission matrix per connector action (read, write, destructive, financial) with least-privilege scopes.
- Mandatory confirmation and spend/reach caps for money movement, destructive actions, and bulk messaging.
- Tenant-isolation tests for every RLS-protected table and server-side ownership check.
- Signed, replay-resistant webhook validation with timestamp tolerance and idempotency storage.
- Structured, redacted audit events and an automated secret-scanning CI check.
- A staged rollout / feature-flag strategy and rollback playbook for migrations and executor changes.
- Per-provider rate budgets, concurrency limits, queue backpressure, and provider outage dashboards.
- An integration contract test suite with mocked provider APIs plus a separate sandbox verification checklist.
- Data minimization and retention enforcement, with healthcare templates restricted to reminders as stated in the master plan.
- Backup/restore drills and migration-forward/backward compatibility checks before production changes.

## Merge gate

Do not merge a phase solely because the code was generated. Require its stated acceptance tests, CI checks, migration review, and explicit evidence that every integration labeled Live has passed a real verification call. No live-flow execution should be enabled by an untested refactor.


## Implementation progress on `audit/p0-hardening`

This section records actual changes on the branch; it does not imply they are merged or deployed.

### Implemented

- Added `bun run typecheck` and `bun run test`; moved the four existing test files to Bun's built-in test runner so the committed `bun.lock` remains the source of dependency truth.
- Added GitHub Actions CI for locked dependency installation, typechecking, unit tests, and production build. A completed CI run at commit `4182c7ea85d2bc9054011da1d1ea4df42031ed2e` passed locked dependency installation, typecheck, all 32 unit tests, and production build. The test suite now covers chat steps, Gmail rules, schedule rules, outbound-address safety, DNS pinning, and executor live-capability gates. Any subsequent code or configuration changes must pass CI again before merge.
- Added DNS resolution of all answers, rejection if any answer is private/special-use, IPv4-mapped IPv6 handling, hostname/IP classification, connection pinning, manual redirect handling, and bounded request/response sizes for outbound HTTP. Live HTTP/chat actions fail closed unless `AUTOSTUDIO_OUTBOUND_TRANSPORT_READY=true` is set after a deployed runtime smoke test.
- Added regression tests for private IPv4/IPv6, malformed IPv6-like host strings, public hostnames beginning with `fc` / `fd`, mixed public/private DNS answers, and validated-address pinning.
- Protected AI planning with Supabase auth middleware, schema validation, timeout, and a database-enforced per-user quota.
- Added shared server-side step execution for manual saved-flow runs and scheduled runs. Unsupported nodes fail closed instead of being marked as successful practice steps.
- Saved-flow execution now requires ownership and persisted live status. The live toggle is cloud-backed; editing and saving an existing live flow pauses it until a fresh Preview is run.
- Generic metadata-only connector calls no longer claim an app is connected. Gmail uses only the gmail.send scope and stays pending until the user explicitly sends a test email to a recipient they control; test sends are limited to three per user per hour. Direct Gmail and direct HTTP server functions are disabled so they cannot bypass saved-flow/live-status checks.
- Added explicit owner filters to important automation reads/writes and redaction of credential-like fields/text in persisted run details.
- Rewrote README with environment, CI, and scheduler operations guidance; removed the tracked `.env` from this branch and added a placeholder-only `.env.example`.

### Still open before merge / deployment

1. The newest commit must complete CI successfully; the earlier green run does not cover later changes.
2. Runtime execution of the pinned HTTP transport must be verified on the actual deployment runtime. The repository's current build configuration defaults to a Cloudflare target, while the strongest DNS-pinning implementation uses Node's HTTP(S) request APIs. A successful bundle build alone does not prove those APIs work in the deployed runtime. The runtime flag now keeps live HTTP/chat actions disabled by default. Do not set it or claim outbound HTTP is production-ready until a deployed smoke test passes or the deployment target/egress transport is reconciled.
3. The atomic scheduler lease is now implemented; the durable job queue, queue retries, dead-lettering, idempotency keys, and circuit state remain P2 work.
4. Finish the connector manifest registry and true `verify()` adapters. Gmail verification requires an explicit test email using the send-only scope; generic app entries remain unverified, and the chat-webhook path still needs an explicit provider verification/test UX.
5. Add a complete server-side `executeFlow` endpoint so manual, scheduled, and webhook runs share flow traversal, branch handling, run creation, event logs, and idempotency rather than sharing only the per-step executor.
6. Reconcile the credential vault with the plan's future `credentials` table and key-version rotation; current storage intentionally matches the existing `app_user_connections` contract.
7. Run a non-production Supabase migration rehearsal and end-to-end test with a dedicated Gmail account before any production migration or live schedule is enabled.

## Follow-up review — current branch state

The initial baseline section above records what was true before P0 implementation. This follow-up supersedes those baseline statuses where noted.

### P0 improvements now present in the branch

- AI flow planning requires authentication, validates input and model output, uses a 20-second timeout, applies a database-backed limit of 20 planning attempts per user per hour, and records token usage when the provider reports it.
- Outbound HTTP resolves all DNS answers, rejects unsafe/mixed private-public answers, pins the selected validated IP for the request, disables redirects, limits request/response sizes, and fails closed unless the deployed runtime is explicitly verified.
- Scheduled runs use a service-role-only lease to prevent overlapping cron invocations from claiming the same automation.
- Manual and scheduled execution share the server-side `executeStep` capability gate; unsupported live steps fail closed. A full shared `executeFlow` engine is still outstanding.
- Gmail remains pending until the user sends a real test email to a recipient they control; the test-send quota and 30-day verification expiry are enforced in server-side code/database.
- CI is present and has passed on commit `bd5d464fabc68770315b6420b1352a85650780a8` (frozen dependency install, typecheck, 33 unit tests, production build). Later commits must have their own green run before merge.
- A follow-up source review found and corrected an invalid SQL function grant signature in the AI quota migration before it is released. The connection schema now includes `verified_at` and cascades when its auth user is deleted.

### Additional correctness improvement

Automatic retries are now restricted to HTTP methods treated as idempotent by HTTP semantics (GET, PUT, DELETE). POST and PATCH are not retried automatically, because a timeout or 5xx response does not prove a side effect did not happen. This avoids duplicate webhook/chat deliveries from blind retries. The policy has a unit regression test. A future executor may retry non-idempotent actions only when the connector supplies a verified provider idempotency key or an operator-approved deduplication contract.

### Still-open release gates

1. Run CI on the current branch head and retain its exact result; the earlier green run does not cover later commits.
2. Apply migrations in a disposable/non-production Supabase project and verify the full migration chain, table grants, RLS behavior, function privileges, quota concurrency, and scheduler lease concurrency.
3. Confirm the deployed runtime is compatible with Node HTTP(S) request APIs. Keep `AUTOSTUDIO_OUTBOUND_TRANSPORT_READY` unset/false until a deployed smoke test proves DNS pinning, TLS hostname verification, timeout handling, and no redirect following.
4. Perform a dedicated-mailbox Gmail test and scheduled-run end-to-end test, including expired/revoked credentials and run/step-log persistence.
5. Extend the new starter connector manifest registry provider-by-provider and implement real verification adapters; metadata-only integrations must remain Test only/Coming soon.
6. Replace the current ordered-node loops with a single durable `executeFlow(flow, trigger, mode)` engine supporting graph/branch semantics, step input/output schemas, shared event logs, idempotency, retries/backoff, circuit breakers, queue workers, and dead-letter notifications.
7. Add versioned credential encryption keys and a rotation/re-encryption procedure before storing more provider credentials.
8. Do not merge or deploy this draft until the above release gates pass. CI green alone is not proof of production safety.

## Second implementation pass — current verified branch head

The current branch has moved beyond the earlier `bd5d464` checkpoint. At commit `0083431254644a4c4b043ec61f1a0bd032a1427d`, GitHub Actions passed:
- Typecheck: passed
- Unit tests: **34 passed, 0 failed**
- Production build: passed

This CI result validates the source and build only. It does not run PostgreSQL migrations or call real provider accounts.

Additional implementation in this pass:
- Manual cloud runs now execute as one authenticated server-side flow request, using the saved server-side definition. The browser no longer orchestrates live side effects step-by-step.
- Removed the client-submitted run-history endpoint, which could accept fabricated success/preview records.
- Individual-step execution now rejects live mode; it remains available only for dry/test behavior. Live side effects must pass through the full-flow endpoint.
- Manual live runs and scheduled runs share the same per-automation lease table. Manual lease release does not advance the schedule cadence cursor; a four-minute manual execution budget fits inside its ten-minute lease.
- The Run panel distinguishes Preview from live execution, asks for confirmation before a live run, and no longer claims structural validation alone proves live readiness.
- Automatic HTTP retries now apply only to GET, PUT, and DELETE. POST/PATCH are not retried without a provider-supported idempotency contract, avoiding duplicate messages or writes.
- The AI usage migration's function grant/revoke signatures were corrected before release.

### Current honest status

**P0 source/build work is substantially hardened, but not release-approved.** The full shared `executeFlow` engine is not yet shared with the scheduler: manual and scheduled entry points still have separate graph traversal code, though both use the same server-side per-step executor and lease table. Branch/condition semantics, durable queue workers, dead-letter handling, provider circuit breakers, and consistent event-stream logging remain future P2 work.

Still required before merging/deploying:
1. Apply the complete migration chain to a disposable Supabase project; verify the SQL runs end-to-end and test RLS/grants and lease/quota concurrency.
2. Prove the deployed runtime is compatible with the Node HTTP(S) pinned-address transport. Keep live outbound HTTP/chat disabled until this smoke test passes.
3. Run end-to-end Gmail and scheduled-flow tests using a dedicated test mailbox and non-production environment.
4. The starter connector manifest registry is implemented. Remaining: add provider-specific manifests as adapters mature and real verification/test-send workflows for chat webhooks and generic HTTP endpoints.
5. Add runtime tests for server-side complete-flow execution and duplicate concurrent run attempts.


## Product UX and connector-manifest follow-up — 2026-10-10

The branch now includes responsive Workspace navigation, Studio links to primary product areas, saved-automation search/status filters, and `docs/product-north-star.md`. A starter registry in `src/lib/connector-manifests.ts` documents the current Gmail, chat-webhook, and generic HTTP execution paths, including verification levels, runtime gates, and retry policies. The live capability gate rejects action nodes without a reviewed manifest. Tests specifically ensure that a configured chat webhook is not described as provider-verified.

CI passed on commit `c3cf62968358b58d85d857282f633d993803a23f`: frozen dependency install, TypeScript typecheck, 39 unit tests across 6 files, and production build. Later commits must pass their own CI. These checks do not substitute for the outstanding non-production migration rehearsal and deployed provider/runtime smoke tests.


## Shared orchestration and finalization follow-up — 2026-10-10

Latest verified branch head: `21514a023eebae01589cda4c563aefa8c8a71483`.

GitHub Actions passed on this head:
- Frozen dependency installation: passed
- TypeScript typecheck: passed
- Unit tests: **60 passed, 0 failed**
- Production build: passed

New source changes:
- `src/lib/execute-flow-steps.server.ts` is now the shared ordered step traversal used by both manual and scheduled runs. It owns the intent-before-action boundary, execution-budget check, outcome classification, and stop-on-failure behavior. Trigger adapters continue to own authentication, lease claims/releases, and database-specific persistence.
- `src/lib/run-finalization.ts` now defines the shared terminal status, duration, finish timestamp, and bounded error-summary policy for manual and scheduled runs.
- Added focused tests for intent-write failure, outcome-write failure, ordered execution, and finalization status/duration behavior.
- The execution-budget failure detail explicitly states that the action was not attempted, so its outcome classifier can distinguish it from an uncertain provider failure.

This reduces orchestration drift but does **not** yet deliver the full planned `executeFlow(flow, trigger, mode)` system. Graph/branch semantics, schema-validated step inputs/outputs, a durable queue/worker, provider idempotency, controlled retries/backoff, circuit breakers, and dead-letter handling remain open. Migration rehearsal and deployed runtime/provider tests remain release gates. The pull request remains a draft and has not been merged.


## Trigger correctness and fail-stop regression pass — 2026-10-10

At commit `402cb35c0e2f6225aaf90795422360f7f23ac376`, GitHub Actions passed typecheck, unit tests, and production build. The suite reports **65 passed, 0 failed**.

This pass caught and fixed an important trigger-path inconsistency: the manual flow endpoint includes its manual trigger in the ordered execution plan, but live capability checks previously rejected that trigger as unsupported. The manual trigger is now treated as an invocation boundary (like the already-supported scheduled trigger), while other unimplemented trigger types remain blocked. Regression tests cover both live preflight and successful trigger acceptance.

The shared flow-step tests now additionally cover stop-after-first-failure, execution-budget exhaustion classified as not attempted, and thrown outcome-persistence callbacks. These checks protect the no-blind-replay rule. CI does not exercise live Supabase state or real provider sends; those release gates remain open.


## Durable execution queue foundation — 2026-10-10

Added migration `supabase/migrations/20261010170000_durable_execution_jobs.sql` to introduce the database contract for durable background execution.

- `execution_jobs` stores trigger type, bounded JSON payload, a stable per-automation idempotency key, attempt limits, availability time, status, and worker lease metadata.
- `enqueue_execution_job` deduplicates repeat deliveries using the unique automation/idempotency-key pair and rejects non-live automations, unsupported triggers, invalid attempt counts, and payloads over 64 KiB.
- `claim_execution_job` uses a row lock with `SKIP LOCKED` to claim one ready job atomically.
- Worker heartbeats and finalization are fenced by the current worker token, so an expired or replaced worker cannot finalize a job using a stale lease.
- Expired running jobs transition to `needs_review`; they are **not automatically replayed**, because a worker may have performed an external side effect before crashing.
- The table and RPC functions are service-role-only; normal browser roles have no queue access.

**Important boundary:** this is the database queue foundation, not yet a deployed worker and not yet connected to manual/scheduled execution entry points. The migration has not been applied to a live or disposable Supabase project in this environment. Before wiring producers, validate the complete migration chain, concurrent enqueue/claim behavior, lease fencing, role grants, and expired-job recovery in a non-production database. Retry only when the caller can establish that repeating the operation is safe; otherwise use `needs_review`.


## Retry-policy guard and regression tests — 2026-10-10

Added `src/lib/execution-job-policy.ts` as a pure policy boundary for the future queue worker, with regression coverage in `src/lib/__tests__/execution-job-policy.test.ts`.

- A known-not-attempted or confirmed-no-effect operation may be retried while attempts remain.
- An uncertain outcome moves to `needs_review` unless the specific provider's idempotency support is verified and a stable key is supplied for reuse.
- An already-confirmed side effect is never automatically repeated.
- Safe retries at the configured attempt limit become `dead_letter`.
- Invalid attempt counters are rejected.

This module is deliberately not wired into production execution yet; that requires a worker adapter and verified provider-specific idempotency contracts. Unit tests can validate the policy, but they do not validate SQL behavior or a real provider's guarantees.


The first CI run for the new retry-policy tests exposed a TypeScript test-runner typing mismatch (`bun:test` declarations are provided at runtime but not to `tsc`). The test file now follows the existing suite's `@ts-nocheck` convention; subsequent CI passed typecheck, tests, and build for that test fix. A further migration review tightened the lease consistency constraint so non-running rows require both lease fields to be null, rather than allowing a partially populated lease.

A further SQL review changed the payload limit from `pg_column_size` to `octet_length(payload::text)` (and the matching enqueue check), so the 64 KiB policy is based on serialized JSON size rather than a potentially compressed storage representation.


## Guarded worker orchestration — 2026-10-10

Added a one-job worker orchestration boundary in `src/lib/execution-job-worker.ts` with focused tests in `src/lib/__tests__/execution-job-worker.test.ts`.

- Claims at most one job through an injected adapter, keeping database/RPC transport separate from policy.
- Converts unexpected executor exceptions into an uncertain outcome, which defaults to `needs_review`.
- Uses the shared retry policy before choosing queued, needs-review, or dead-letter outcomes.
- Requires successful finalization to be acknowledged; rejected finalization is reported explicitly rather than described as success.
- If the executor heartbeats and the lease is rejected, the worker does not try to finalize with a stale token.

This is orchestration logic only. It is not yet connected to a Supabase RPC adapter, a scheduler/worker deployment, or production execution routes. The executor must use the supplied stable idempotency key only with provider-specific guarantees that have been verified. A real worker runtime must heartbeat during long-running work and abort further work as soon as lease loss is detected.


Worker orchestration CI note: the first typecheck exposed an `exactOptionalPropertyTypes` mismatch when passing an optional provider-idempotency flag. The worker now omits that field when it is undefined. Latest verified CI on commit `3d4a2718f679dc3c11d3019a250c279dba48ea9f` passed typecheck, unit tests (**82 passed, 0 failed**), and production build.


## Server-only queue RPC adapter — 2026-10-10

Added `src/lib/execution-job-queue.server.ts` and typed the four queue RPCs in the Supabase database type map. The adapter wraps enqueue, atomic claim, heartbeat and fenced finalization; it validates claimed row fields before passing a job into the worker. The module imports the server-only service-role client and must not be imported from browser-facing modules.

This connects the TypeScript worker boundary to the database RPC contract, but does not itself deploy a worker or validate that the migration is applied. Migration rehearsal and live database integration tests remain release gates.

The adapter's first CI pass found strict TypeScript issues around the recursive Supabase `Json` payload type and index-signature access. Those were corrected; CI for commit `dbd542378ad892fe5c488acd34618666b4e38a7b` passed typecheck, tests, and production build. This remains code-level verification only; no live database RPC was invoked.
