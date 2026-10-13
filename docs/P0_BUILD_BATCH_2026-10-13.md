# P0 Build Batch Checkpoint — 2026-10-13

**Status: P0 OPEN.** Work remains on `audit/p0-hardening`; `main` is unchanged. Do not merge, deploy, start P1, or enable durable queue/worker/outbound transports.

## Completed code batches

- `ca9ff48301c73187c762248f32a8820ba533dc6e`: malformed Response proxies now fail closed with a generic 503; regression coverage added. Exact-head CI run 38371020201 passed.
- `03b8023a66862f9cc664ba9dbc5cad36381281bc`: unexpected scheduler failures now return a generic cache-safe response; fallback/header tests added. Exact-head CI run 38371249464 passed.
- `98076bfd972f5eecdb7880f38caeaa50791afd1e`: unexpected worker failures now return a generic cache-safe response; targeted lint now includes the cron guard. Exact-head CI run 38371422066 passed.

## Verified by exact-head CI

Typecheck, full unit suite, targeted execution-integrity lint, production build, configured P0 migration-chain smoke test on disposable PostgreSQL, queue RPC permission/idempotency/lease-fencing checks, and concurrent-worker claim test all passed on the latest code commit.

## Still blocked on real staging evidence

The staging acceptance record remains NOT RUN. Still required: hosted non-production Supabase migration and permission checks; deployed cron authentication checks; provider-sandbox exactly-once/idempotency evidence; interrupted-worker and recovery rehearsal; deployed outbound transport TLS/DNS/redirect/timeout proof; audit-history review; second-person acceptance; and resolution or explicit review of the repository-wide lint baseline.

CI does not prove these external gates. P0 remains open; P1 is not authorized.


## Lease-recovery stale-finalizer regression — 2026-10-13

- Extended the disposable PostgreSQL smoke test to simulate a worker attempting to finalize after its lease has expired and recovery has already moved the job to `needs_review`.
- The test now requires the stale worker's original token to be rejected and asserts that neither the recovered queue status nor the reconciled audit run can be overwritten.
- This supplements the existing checks for expired-lease recovery, uncertain in-flight steps, and no automatic replay. It is still CI evidence only; deployed staging recovery and provider-side duplicate-effect rehearsal remain mandatory.


## Bounded lease-heartbeat transport — 2026-10-13

- Review found that the keepalive helper awaited an in-flight heartbeat without a deadline. If the database/network request never settled, a provider action could finish while the worker remained stuck awaiting heartbeat state, preventing a timely uncertainty decision.
- Added a bounded heartbeat wait (15 seconds by default). A timeout, rejection, malformed result, or explicit lost-lease response is treated as lost ownership; the provider action is allowed to settle, then the helper throws so the caller does not report success or blindly retry an uncertain effect.
- Added regression tests for a never-settling heartbeat and invalid timeout configuration. Exact-head CI is required before treating this change as verified.
- This is repository code hardening only. Hosted staging acceptance remains NOT RUN; P0 remains open and P1 is not authorized.


## Scheduled execution audit redaction parity — 2026-10-13

- Review found that the legacy direct scheduled executor still wrote raw step detail/output snapshots, unlike manual and durable queue paths.
- Aligned scheduled audit persistence with shared error and nested-output sanitizers to reduce the risk of storing credentials or sensitive provider outputs in durable history.
- Exact-head CI required; staging audit-history acceptance remains open.


## Queue worker stale-audit fencing — 2026-10-13

- Added dual-lease checks before step outcome writes and parent-run finalization. If lease ownership is lost, the worker no longer performs best-effort recovery writes through stale ownership; the authoritative reconciler handles the remaining open audit intent.
- This change needs exact-head CI and a controlled staging lease-expiry/interruption rehearsal before acceptance.


## Manual execution nested-output sanitization — 2026-10-13

- Review found manual-run output snapshots were not using the shared nested-output sanitizer even though error details were redacted.
- Aligned manual execution with the scheduled and durable-queue paths so nested outputs are sanitized before durable audit persistence.
- Exact-head CI and staging audit inspection are required; P0 remains open.


## Automation lease heartbeat fencing regression — 2026-10-13

- Added SQL smoke coverage that an expired automation lease cannot be renewed, an old token cannot renew a replacement lease, and the current token can heartbeat and release successfully.
- Exact-head CI must pass; staging acceptance remains open.
