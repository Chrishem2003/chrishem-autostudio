# AUTO-STUDIO P0 Readiness Gate

Status: **OPEN — do not start P1 yet**

This checklist is the release gate for P0 execution-integrity hardening. A code commit alone does not mean a gate passed.

## A. Execution and audit consistency

- [x] Report a succeeded queue job that has no linked audit run.
- [x] Report a succeeded queue job whose linked audit run is missing, failed, unfinished, or not succeeded.
- [x] Report a succeeded queue job without its own completion timestamp.
- [x] Report a successful audit run without its own completion timestamp.
- [x] Fail closed in diagnostics when a linked audit-run ID is duplicated in the supplied snapshot.
- [x] Fail closed in diagnostics when a queue-job ID is duplicated in the supplied snapshot.
- [x] Reject malformed completion timestamps and flag timestamps on active queue/audit records.
- [x] Flag terminal failed audit runs that lack a completion timestamp.
- [x] Detect one audit run linked to multiple queue jobs, despite the database one-to-one association guard.
- [x] Detect successful queue completion timestamps that precede the linked audit-run completion timestamp.
- [x] Treat malformed/negative queue status aggregates as a critical health diagnostic instead of silently reporting healthy.
- [x] Fail closed on malformed queue diagnostic counters, timestamps, and missing status-count envelopes.
- [x] Queue-health input hardening and malformed-input regressions passed exact-head CI on commit `898ce72494ae772b5aa564c7137c4564f3937094`: typecheck, 353 unit tests, focused execution-integrity lint, production build, and disposable PostgreSQL migration/idempotency/fencing/concurrency smoke tests. See [CI run 38532270434](https://github.com/Chrishem2003/chrishem-autostudio/actions/runs/38532270434).
- [x] Earlier exact-head CI checkpoints verified audit association and completion-ordering regressions; the newest checkpoint above additionally verifies queue-health malformed-input guards.
- [x] Report non-success queue states linked to a successful audit run.
- [x] Report a running queue job linked to failed, succeeded, cancelled, canceled, timed-out, or abandoned audit runs.
- [x] Add focused regression cases for the added diagnostic conditions.
- [x] Latest full test suite, typecheck, and production build passed on commit `f78cc7fae0e74f08a1c32fd7ec056866da0323ea`; rerun is required after subsequent CI changes.
- [x] Typecheck, complete unit suite, targeted execution-integrity lint, and production build passed on commit `c3d9e8278dfef23b4cc0b1ee6700e21f150e1804`; see [CI run 38134707956](https://github.com/Chrishem2003/chrishem-autostudio/actions/runs/38134707956). Re-run required after any further code changes.
- [x] Exact-head CI passed on `1ecacb6a90b056cfdbc97852fa0bdb1be5c687d0`: typecheck, complete unit suite (including oversized metadata/circular JSON regressions), targeted execution-integrity lint, production build, and disposable PostgreSQL queue migration/concurrency smoke test. See [CI run 38135590856](https://github.com/Chrishem2003/chrishem-autostudio/actions/runs/38135590856).
- [x] Exact-head CI passed on `6cfb63186f9d4dd1d9eb9899872759766c9074f4`: typecheck, complete unit suite, targeted execution-integrity lint, production build, and disposable PostgreSQL queue migration/concurrency smoke test. See [CI run 38137098245](https://github.com/Chrishem2003/chrishem-autostudio/actions/runs/38137098245). This verifies that commit only; any later code change requires a new exact-head run.
- [x] Queue-health consistency diagnostics expose a job-count mismatch when separately queried aggregate counts and inspected rows differ, avoiding a false impression that non-transactional snapshots are perfectly aligned.
- [x] Queue-health audit findings distinguish the bounded job-scan limit from the response sample limit; findingsTruncated is true if either bound prevents a complete queue-wide finding list.
- [ ] Final P0 head has focused and full test results recorded; this gate stays open until final code changes are complete.
- [ ] Safe integration of P0 onto a clean branch from `main` is reviewed and verified; see [P0 main integration reconnaissance](./P0_MAIN_INTEGRATION_RECONNAISSANCE.md). A green CI run on the hardening branch does not validate a separately constructed integration branch.
- [ ] Repository-wide lint baseline is remediated separately: the first full-repo run reported 2,683 errors (mostly Prettier formatting plus test-file `@ts-nocheck` violations). Do not mass-format unrelated application files as part of this safety patch.

## B. Execution lifecycle and recovery

- [x] Shared flow-step engine fails closed when its runtime budget is malformed (non-finite start/limit, non-positive limit, or future start time); regression tests verify no executor runs and a no-effect failure outcome is persisted. Exact-head CI passed on `52596649c31909aee864eeeea8282c288e995e08`: typecheck, unit tests, focused execution-integrity lint, production build, and disposable PostgreSQL queue migration/concurrency smoke tests. [CI run 38535743213](https://github.com/Chrishem2003/chrishem-autostudio/actions/runs/38535743213).


- [x] Worker rejects a `succeeded` result unless the executor reports `effect_confirmed`; contradictory or malformed executor results go to `needs_review` rather than false success or automatic replay. Regression tests added.
- [x] Queue claim failure propagates without calling the executor or finalizer; regression test passed in CI run 38134707956.
- [x] Run creation/association fails closed before execution starts; regression tests passed in prior green CI run.
- [x] Database finalization rejects queue success without a linked, persisted successful audit run; disposable PostgreSQL smoke test passed in CI run 38134707956.
- [x] Worker reports thrown/rejected finalization rather than claiming success; regression tests passed in CI run 38134707956. Staging recovery behavior remains to be verified.
- [x] Disposable PostgreSQL smoke test verifies idempotent enqueue, conflicting-key rejection, lease fencing, terminal success/audit guard, and concurrent workers claim distinct jobs; CI run 38134707956.
- [x] Scheduled producer rejects malformed stale-run discovery results before scheduling new work. Regression tests and route guard passed exact-head CI on `cf242d0ce16f7204f076979502da0975660a5bb9`: [run 38537414451](https://github.com/Chrishem2003/chrishem-autostudio/actions/runs/38537414451). Hosted staging recovery rehearsal remains open.
- [x] Scheduler strictly validates stale-run reconciliation RPC outcomes without coercing untrusted values. Regression tests, typecheck, tests, production build, and durable-queue migration smoke test passed exact-head CI on `04cc8d003c6e8fabc633129ca30ec4e5f2778c04`: [run 38538286720](https://github.com/Chrishem2003/chrishem-autostudio/actions/runs/38538286720). Hosted staging recovery rehearsal remains open.
- [x] Scheduled lease release now locks the automation parent before deleting the lease row, matching claim lock order and preventing a release/claim deadlock. Migration-chain verification, database lock-order assertion, full tests, typecheck, production build, and PostgreSQL smoke checks passed exact-head CI on `2e3c7d2194373248f791468c89512c75f0504799`: [run 38540476904](https://github.com/Chrishem2003/chrishem-autostudio/actions/runs/38540476904). Hosted staging acceptance remains open.
- [x] Added a separate-session scheduled release/claim race regression to CI. Both CI jobs passed on exact head `ecc10358a1aae72794530e46b2ec0863074f8274`: [run 38542393290](https://github.com/Chrishem2003/chrishem-autostudio/actions/runs/38542393290). This validates a concurrent race path in CI, but does not replace hosted staging acceptance or an independent review.
- [x] The execution worker now rejects malformed/non-JSON payload values (including accessors, cycles, `Date`, `Map`, non-finite numbers, and `BigInt`) before executor entry. Regression tests confirm malformed claims do not execute or attempt finalization with untrusted identity. Exact-head typecheck, tests, production build, and durable-queue migration smoke test passed: [run 38545184834](https://github.com/Chrishem2003/chrishem-autostudio/actions/runs/38545184834).
- [x] Stale-run recovery now acquires the automation row lock before the run-audit row lock, matching lease-claim lock order; PostgreSQL smoke test asserts the lock ordering. Exact-head typecheck, tests, production build, and migration smoke test passed on `71042e1de9bf561d140cf59539d59dcad56cc3a7`: [run 38539590750](https://github.com/Chrishem2003/chrishem-autostudio/actions/runs/38539590750). Hosted concurrency/recovery rehearsal remains open.
- [ ] Verify provider-specific retry attempts remain idempotent end-to-end in staging.
- [x] Expand the staging runbook with provider-accepted/lost-response, confirmed-no-effect retry, stable-key, and provider idempotency-contract scenarios; staging execution remains required.
- [x] Retry policy now routes malformed attempt counters, invalid maximum-attempt limits, and inconsistent attempts-above-limit records to `needs_review` without throwing; regression tests passed exact-head CI on `775180843f0e97a9ffc2e133af73507a28c68536`: [run 38533599636](https://github.com/Chrishem2003/chrishem-autostudio/actions/runs/38533599636).
- [x] Disposable PostgreSQL smoke test verifies expired queue leases route to `needs_review` and stale in-flight steps remain uncertain; CI run 38134707956.
- [ ] Verify interrupted/expired running jobs in the actual staging deployment without duplicate side effects.
- [ ] Verify concurrent workers cannot claim the same job beyond the intended lease/locking rules.
- [ ] Verify audit history is append-only where required and diagnostics remain read-only.

## C. Deployment and integrations

- Staging procedure: follow [`docs/P0_STAGING_RUNBOOK.md`](./P0_STAGING_RUNBOOK.md) only against an independently verified non-production Supabase project. The runbook is operational guidance, not evidence that staging checks have passed.

- [ ] Complete and review the evidence record in [`docs/P0_STAGING_ACCEPTANCE_RECORD.md`](./P0_STAGING_ACCEPTANCE_RECORD.md); the template itself is not evidence that staging passed.

- [ ] Confirm migrations apply cleanly to a disposable/staging database.
- [ ] Run integration tests against staging Supabase with non-production test data.
- [ ] Verify secrets are never exposed to client code, logs, or test artifacts.
- [ ] Keep durable queue consumers and outbound message transports disabled until their provider-specific staging checks pass.
- [ ] Confirm CI checks for the final P0 head are green; investigate missing checks rather than interpreting them as success.

## P0 exit rule

P0 is complete only when all applicable A, B, and C gates are evidenced by actual test or staging results, all critical failures are resolved, and the final branch head has green required CI checks. Then review the master plan and explicitly authorize P1.

Do not mark any unchecked item as passed based on code inspection alone.


## Enqueue NULL-parameter hardening — 2026-10-11

- Extended the same SQL three-valued-logic review to `enqueue_execution_job`: explicit NULL trigger type and NULL retry limit could bypass their range/membership IF checks and fail later at table constraints.
- Added a forward-only migration `20261011160000_enqueue_null_validation.sql` so already-migrated environments receive the correction without rewriting migration history.
- Added smoke assertions for the exact validation errors and wired the migration into the PostgreSQL CI chain. Verify the exact-head workflow before treating this as accepted.
- Staging deployment and real provider-side duplicate-effect evidence remain open; do not enable production queue or outbound transport.

## Queue-to-audit association integrity — 2026-10-11

- Added a forward-only migration that prevents a queue job from attaching an audit run belonging to a different automation.
- Added a partial unique index so one audit run cannot be associated with multiple durable queue jobs. Migration intentionally fails with an explicit message if existing duplicate associations need manual reconciliation.
- PostgreSQL smoke coverage verifies cross-automation association is rejected and the same audit run cannot be attached to a second job.
- CI applies this migration after the existing audit-success guard. Exact-head CI must pass before this is accepted.
- This remains code/CI verification only; actual staging migration and provider-effect acceptance are still open. Keep queue and outbound transport disabled.

## SQL NULL lease-boundary hardening — 2026-10-11

- Review found that PostgreSQL comparisons against explicit `NULL` evaluate to unknown, so range-only checks could be bypassed by a caller passing `NULL` to queue claim/heartbeat RPCs. A claim could then attempt to create a running job with no valid expiry.
- Both RPCs now explicitly reject a NULL lease duration as well as values outside 30–900 seconds.
- Disposable PostgreSQL regression coverage includes NULL, below-minimum, and above-maximum values for both RPCs. Exact-head CI must pass before this fix is considered verified.
- This is database-level hardening only; staging rollout, authentication, provider idempotency, and interrupted-worker rehearsal remain open. Queue and outbound transport stay disabled.

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


## Enqueue RPC response contract — 2026-10-11

- The enqueue adapter validates the database RPC response as untrusted data: the returned job identifier must be non-empty and bounded, and status must be one of the database-supported queue states.
- Regression tests cover malformed rows, missing fields, unknown status values, and valid statuses.
- Exact-head CI passed on commit `347e4123336cc12c3fefc861bf4ea37227261093`: typecheck, unit tests, production build and the disposable PostgreSQL queue migration/concurrency smoke test. See [CI run 38144857528](https://github.com/Chrishem2003/chrishem-autostudio/actions/runs/38144857528).
- Optional enqueue timestamps are now bounded to 100 characters before date parsing, with a regression test for oversized input. This remains application-level validation; database/provider staging gates remain open.


## Exact-head payload boundary verification — 2026-10-11

- Commit `e321d897bc0bb5d2dedcc792bd49d06b3fe96f2b` passed exact-head CI: [run 38145487142](https://github.com/Chrishem2003/chrishem-autostudio/actions/runs/38145487142).
- The enqueue/claim payload validator now verifies the parsed JSON value remains a non-null object, not merely that the original input was object-shaped before serialization. Regression tests cover `Date` serialization and custom `toJSON()` results.
- This is code/CI evidence only; it does not satisfy the open staging gates or authorize P1.


## Executor result runtime-boundary hardening — 2026-10-11

- Worker result validation snapshots adapter output into a plain object and routes thrown property access or malformed runtime values to `needs_review`.
- Regression coverage includes a throwing status getter and a changing getter, preventing malformed adapter values from escaping the worker's uncertain-outcome policy.
- This remains code-level hardening; exact-head CI and all staging acceptance gates are still required before P0 closure.


## Worker RPC boolean contract — 2026-10-11

- The worker now requires literal `true` from heartbeat and finalization dependencies. Truthy but malformed runtime responses cannot masquerade as lease ownership or durable completion.
- Regression cases cover object/string/number heartbeat and finalization responses. This is defense in depth alongside the Supabase adapter's strict `data === true` conversion.
- Exact-head CI is required for this change. Staging provider-idempotency, interruption-recovery, concurrency, and deployment gates remain open; do not enable the durable queue or outbound transport based on unit tests alone.


## Shared automation lease renewal — 2026-10-11

- Added a service-role-only, token-fenced RPC to renew the shared manual/scheduled automation lease. Stale or already-expired lock tokens cannot renew ownership.
- The durable queue worker renews both its queue lease and the shared automation lease before recording each step intent and before starting each external action.
- PostgreSQL smoke coverage checks successful renewal, stale-token rejection, and expired-lease rejection; CI now applies the new migration before running the queue smoke suite.
- This reduces the chance that a multi-step queue run outlives its overlap-prevention lock. It does not replace staging tests or guarantee renewal while an individual provider call is stalled.

## Immutable execution request snapshot — 2026-10-11

- The worker now recursively freezes the normalized JSON payload as well as the top-level claimed-job envelope before passing it to an executor.
- Regression coverage attempts to rewrite a nested recipient field and verifies the original request value remains intact, alongside the job ID and lease token.
- This prevents adapter-side mutation of the in-memory request from changing what downstream asynchronous work reads. Exact-head CI is required; external staging and provider-effect gates remain open.

## Claimed-job identity immutability — 2026-10-11

- The worker now snapshots and freezes the claimed job envelope before exposing it to the executor. This protects the job ID and lease fencing token used for heartbeat/finalization from accidental or hostile mutation by execution adapters.
- Regression coverage attempts to mutate both identifiers and verifies heartbeat and finalization still use the original claimed identity.
- Exact-head CI is required. This is defense in depth and does not replace staging validation of provider idempotency, recovery, concurrency, authentication, or migrations.


- The worker now snapshots and freezes the claimed job envelope before exposing it to the executor. This protects the job ID and lease fencing token used for heartbeat/finalization from accidental or hostile mutation by execution adapters.
- Regression coverage attempts to mutate both identifiers and verifies heartbeat and finalization still use the original claimed identity.
- Exact-head CI is required. This is defense in depth and does not replace staging validation of provider idempotency, recovery, concurrency, authentication, or migrations.


- The worker now recursively freezes the normalized JSON payload as well as the top-level claimed-job envelope before passing it to an executor.
- Regression coverage attempts to rewrite a nested recipient field and verifies the original request value remains intact, alongside the job ID and lease token.
- This prevents adapter-side mutation of the in-memory request from changing what downstream asynchronous work reads. Exact-head CI is required; external staging and provider-effect gates remain open.

## Claimed-job identity immutability — 2026-10-11

- The worker now snapshots and freezes the claimed job envelope before exposing it to the executor. This protects the job ID and lease fencing token used for heartbeat/finalization from accidental or hostile mutation by execution adapters.
- Regression coverage attempts to mutate both identifiers and verifies heartbeat and finalization still use the original claimed identity.
- Exact-head CI is required. This is defense in depth and does not replace staging validation of provider idempotency, recovery, concurrency, authentication, or migrations.


- The worker now snapshots and freezes the claimed job envelope before exposing it to the executor. This protects the job ID and lease fencing token used for heartbeat/finalization from accidental or hostile mutation by execution adapters.
- Regression coverage attempts to mutate both identifiers and verifies heartbeat and finalization still use the original claimed identity.
- Exact-head CI is required. This is defense in depth and does not replace staging validation of provider idempotency, recovery, concurrency, authentication, or migrations.


## Provider-call lease keepalive — 2026-10-11

- Commit `bfcf93482b53f3956ca166a93991d616a84df3eb` adds a bounded recurring keepalive while a provider action is pending. Each pulse renews the queue lease first, then the shared automation lease; malformed, rejected, or false heartbeat results fail closed.
- Unit tests cover pending-action renewal, lost lease, malformed heartbeat response, action failure propagation, and invalid intervals. Exact-head CI passed both required jobs: [run 38159286868](https://github.com/Chrishem2003/chrishem-autostudio/actions/runs/38159286868).
- This does not cancel an already-issued provider request. If lease ownership is lost during a request, the worker treats the result as uncertain and requires review; staging must prove a slow/interrupted provider call does not create duplicate effects.
- Current gate head has changed since the above CI checkpoint; rerun exact-head CI after the next commit. P0 remains open and queue/outbound flags must remain disabled until staging evidence is recorded.


## Recovery scope and terminal audit preservation — 2026-10-11

- Added PostgreSQL regression coverage that recovery changes only unfinished steps in the interrupted run, preserves already-terminal step diagnostics, and leaves unrelated running runs untouched.
- This is database-smoke evidence only. The live staging interruption/restart rehearsal and provider-side duplicate-effect inspection remain unchecked. Queue/outbound transport remain disabled until all release gates pass.

## Exact-head queue input and lease-bound verification — 2026-10-11

- Commit `0ef5cacd6f95f20e1954d6138b3cb7b634843a7d` passed both required CI jobs: [run 38170222554](https://github.com/Chrishem2003/chrishem-autostudio/actions/runs/38170222554).
- The disposable PostgreSQL smoke test now verifies that the database rejects out-of-range worker lease durations, unsupported trigger types, retry limits outside the allowed range, and queue payloads exceeding the 64 KiB database limit.
- This is a regression-test checkpoint, not staging acceptance. Provider idempotency, interrupted-worker recovery, production-runtime transport compatibility, staging authentication, and the full migration rollout remain unverified. Keep durable queue and outbound transport disabled until those gates have evidence.

## Exact-head scheduler lease-boundary verification — 2026-10-11

- Commit `331eb33f2428e0835cd81d318afc036c81c48f6f` passed both required CI jobs: [run 38172882461](https://github.com/Chrishem2003/chrishem-autostudio/actions/runs/38172882461).
- The disposable PostgreSQL smoke suite now checks manual and scheduled lease-duration bounds, stale manual-release token rejection, preservation of the active lease after a stale release attempt, and that manual lease release does not advance the scheduler cadence cursor.
- The first run exposed an incomplete disposable schema fixture (missing the `automations.last_run_at` column referenced by the scheduler release RPC). The fixture was corrected to model that existing contract; the full migration and concurrency smoke test then passed.
- This does not close P0. Live staging migration/authentication, interrupted-worker recovery, provider idempotency/duplicate-effect checks, and deployed outbound transport compatibility remain open. Durable queue and outbound transport must remain disabled until those acceptance checks are evidenced.


## Queue final-status NULL validation — 2026-10-11

- Hardened `finish_execution_job` to reject an explicit NULL status before PostgreSQL three-valued logic can bypass the allowed-status check.
- Added a forward-only migration and a disposable PostgreSQL smoke regression asserting the exact validation error.
- CI applies the new migration before the queue smoke suite. Verify green CI on the exact latest branch head before treating this batch as accepted.
- This is code/database-smoke evidence only. Live staging, provider-side idempotency, interruption recovery, authentication and deployment gates remain open; keep the durable queue and outbound transport disabled.


## Enqueue NULL-contract hardening — 2026-10-11

- Added a forward migration that explicitly rejects NULL trigger types and retry limits before SQL three-valued logic can bypass normal comparisons.
- Added disposable PostgreSQL regression tests for both NULL cases and wired the migration into CI.
- Require both CI jobs to pass on the exact latest commit. This does not replace live staging acceptance; queue workers and outbound transport remain disabled until all P0 gates are closed.


## Shared automation lease NULL-contract hardening — 2026-10-12

- Added a forward-only migration that rejects explicit NULL durations in scheduled lease claims, manual lease claims, and shared-lease heartbeats. PostgreSQL range comparisons with NULL evaluate to unknown and otherwise can bypass an IF range check.
- Added PostgreSQL smoke regressions that assert the exact validation errors for all three RPCs and wired the migration into CI after the existing queue/lease guards.
- This is database-smoke and exact-head CI evidence only. Live staging migration, auth, provider idempotency, interrupted-worker recovery, and provider-side duplicate-effect verification remain open. Keep the durable queue and outbound transport disabled.


## Scheduled release cursor guard — 2026-10-12

- Added a forward-only guard rejecting NULL _last_run_at in release_scheduled_automation before the lock is deleted. This prevents clearing cadence progress, which could reset scheduled idempotency-key derivation.
- Added a regression test proving a NULL cursor is rejected and the lease remains held, followed by a valid release test; wired the migration into PostgreSQL CI.
- Live staging migration and scheduled end-to-end acceptance remain open. Keep producer, worker, and outbound transport gates disabled until the staging runbook is completed.


## Queue health alerts and malformed-claim fail-closed behavior — 2026-10-13

- Added a read-only alert summary to the cron-secret-protected queue-health endpoint: critical alerts for human-review jobs, dead letters, expired leases, and queue/audit consistency findings; warnings for failed jobs, queue wait beyond five minutes, stale open runs, incomplete bounded scans, and snapshot mismatches.
- Alert evaluation is a pure function with regression tests. It does not mutate queue state, release leases, authorize retries, or infer provider idempotency.
- Hardened the worker to reject malformed claim retry counters before invoking the executor; invalid metadata is finalized to `needs_review` when possible, and a rejected finalization is reported without executing the job.
- Both CI jobs passed for implementation commit `c7d2017b3451ce8f489142f70dacfc76d851aef8`: [GitHub Actions run 38354868220](https://github.com/Chrishem2003/chrishem-autostudio/actions/runs/38354868220). Documentation changes and any later code changes still require exact-head CI.
- These are code and disposable-CI checks only. All staging acceptance gates remain open; do not enable durable queue consumers or outbound transport.


## Worker claim-envelope validation — 2026-10-13

- The worker now validates trigger type and idempotency-key shape before calling the executor; malformed request metadata is routed to `needs_review` where the fencing identity remains usable.
- Missing/blank job identity, automation identity, or worker token fails closed without attempting finalization with an untrusted fencing identity.
- Regression tests assert invalid claims never invoke the executor. Exact-head CI passed after updating the shared test fixture to include the required trigger type: [run 38355329532](https://github.com/Chrishem2003/chrishem-autostudio/actions/runs/38355329532).
- This protects the worker boundary but does not prove staging adapter correctness or provider idempotency. P0 remains open.


## Conservative outcome classification — 2026-10-13

- Safe-to-retry classification now requires recognized preflight/configuration language at the beginning of the error detail; incidental phrases embedded in timeout/provider errors remain uncertain.
- Regression tests cover misleading embedded phrases, preventing an ambiguous provider failure from being treated as proof that no external effect occurred.
- This is unit/CI evidence only. Provider-level idempotency and interrupted-side-effect recovery still require controlled staging acceptance.

## Exact-head checkpoint — 2026-10-13

- [x] Latest exact-head CI passed on `c2312469606bba63977b0c56fa094b58064751e8`: typecheck, unit tests, execution-integrity lint, production build, and disposable PostgreSQL queue migration/concurrency smoke test. See [CI run 38358756478](https://github.com/Chrishem2003/chrishem-autostudio/actions/runs/38358756478).
- [x] Execution-worker responses now pass through a shared helper that enforces `Cache-Control: no-store`, `Pragma: no-cache`, and `X-Content-Type-Options: nosniff`; regression coverage verifies authorized response status/body preservation and required headers.
- [x] Queue-health authentication denials use the same response helper rather than mutating headers directly.
- [ ] Re-run exact-head CI after any later code/document changes.
- [ ] Complete the staging Supabase migration and protected cron authentication checks.
- [ ] Complete controlled staging provider idempotency, duplicate-effect, interrupted-worker, and audit-history acceptance checks.
- [ ] Remediate or explicitly accept the documented repository-wide lint baseline before release.
- [ ] P0 exit review and explicit P1 authorization.

**Decision remains: P0 OPEN; P1 is not yet authorized.** Green CI validates code and disposable PostgreSQL behavior, but the staging environment and provider-side evidence have not been verified. Keep durable queue and outbound transport flags disabled until the open acceptance gates are evidenced.


## Scheduler response-header hardening — 2026-10-13

- Scheduler success responses and the stale-run reconciliation/query failure responses now pass through the shared cron response-header helper, alongside authentication denial and authentication-adapter failure responses.
- Exact-head CI passed on `ed4678726ac2dc6e3cbbbb54f90e4581c45319fe`: typecheck, unit tests, targeted execution-integrity lint, production build, and disposable PostgreSQL migration/concurrency smoke test. See [CI run 38361519365](https://github.com/Chrishem2003/chrishem-autostudio/actions/runs/38361519365).
- The exact-head run verifies the code change only. Staging migrations, real provider idempotency/duplicate-effect checks, interrupted-worker recovery, and audit-history acceptance remain open. Do not enable durable queue consumers or outbound transport.

## Complete migration-chain CI checkpoint — 2026-10-13

- Commit `d431fcb5717f5985b43313fd75d41ae06ee32bb2` passed both required CI jobs: [run 38363868791](https://github.com/Chrishem2003/chrishem-autostudio/actions/runs/38363868791).
- The database workflow now applies the P0 migrations in chronological order, including scheduler/audit reconciliation, shared automation lease heartbeat, enqueue validation, association guards, and later NULL-contract protections.
- The successful disposable PostgreSQL run exercised the complete configured migration chain, idempotency/lease-fencing/RPC-permission smoke checks, and concurrent-worker claim test.
- This evidence is limited to GitHub Actions and a disposable PostgreSQL instance. It is **not** evidence of a live staging migration, protected deployed cron authentication, provider-side idempotency, or interruption-recovery acceptance.
- Re-run exact-head CI after this documentation update. P0 remains open; do not merge into `main` or enable durable queue/outbound transport until the staging acceptance record is completed and reviewed.

## P0 migration-chain guard verification — 2026-10-13

- Added `supabase/tests/assert_p0_migration_chain.sh` and wired it into the disposable PostgreSQL CI job before migration application.
- The guard asserts the reviewed 16-file P0 sequence matches the workflow, remains chronologically sorted, and references existing migration files. It is scoped to this P0 smoke chain; it does not claim to apply every migration in the repository.
- Exact-head CI passed on `94544236ace5a9c702b1e071ef154384fff8bebb`: [run 38365100889](https://github.com/Chrishem2003/chrishem-autostudio/actions/runs/38365100889). Both required jobs passed: typecheck/tests/targeted lint/production build and the PostgreSQL migration/concurrency smoke test, including the new chain assertion.
- This remains CI-only evidence. Hosted staging migration/authentication, provider-side exact-once evidence, interrupted-worker recovery, audit-history verification, and final acceptance review are still open. P0 remains open and P1 is not authorized.

## Shared scheduler/worker authentication boundary — 2026-10-13

- Review found the scheduled producer route used a truthiness check for its authentication adapter result, unlike the worker's stricter runtime boundary. A malformed falsy value such as `undefined` or `false` could otherwise be mistaken for authorization success by a runtime adapter that violates its TypeScript contract.
- Added one shared authentication normalizer for scheduler and worker routes. Only literal `null` permits protected work; actual `Response` denials preserve their status/body with required security headers; thrown or malformed adapter results return a generic cache-safe 503 before protected work runs.
- Added regression coverage for malformed falsy values, valid denial, literal-null success, and the existing worker task-laziness contract. Exact-head CI is required; staging authentication remains an independent release gate.

## Queue-health authentication boundary — 2026-10-13

- Follow-up review found the secret-protected queue-health endpoint also used a truthiness check for its authentication adapter result. It now uses the same shared fail-closed normalizer as the scheduled producer and queue worker, so malformed falsy results cannot expose queue counts, failure summaries, lease details, or audit-consistency diagnostics.
- Regression tests for the shared normalizer cover malformed falsy values and security headers. Exact-head CI must pass after this route change; deployed endpoint authentication remains an open staging gate.


## Client-side execution-audit write boundary — 2026-10-13

- Review of the original schema found authenticated users had direct INSERT/UPDATE/DELETE privileges and owner-all RLS policies on `run_logs` and `run_step_logs`. This allowed a client to fabricate or rewrite audit evidence even though the application routes used server-owned execution.
- Added forward-only migration `20261013100000_lock_execution_audit_writes.sql`: authenticated users retain owner-scoped SELECT access, while all audit writes are restricted to the server-side `service_role` guarded paths.
- Extended the disposable PostgreSQL migration chain and smoke assertions to verify client write privileges/policies are absent while required service-role writes remain available.
- This is database/CI verification only; hosted staging migration and live audit-history acceptance remain open.


## Exact-head audit-write boundary checkpoint — 2026-10-13

- Commit `8771b31d38bb669dc8c66c8cb1c26a015d0a7d48` passed both required CI jobs: typecheck, full unit suite, targeted execution-integrity lint, production build, and the disposable PostgreSQL migration/concurrency smoke test. See [run 38372858015](https://github.com/Chrishem2003/chrishem-autostudio/actions/runs/38372858015).
- The new forward migration `20261013100000_lock_execution_audit_writes.sql` restricts authenticated clients to owner-scoped SELECT access for `run_logs` and `run_step_logs`; server-owned writes remain available to `service_role`.
- The disposable smoke suite verifies client INSERT/UPDATE/DELETE privileges are absent, service-role writes remain available, and authenticated write policies have been removed.
- This checkpoint is code/CI evidence only. Hosted staging migration and audit/recovery acceptance remain open; P0 is not passed and P1 is not authorized.


## Manual execution compatibility with server-owned audit writes — 2026-10-13

- The new audit-table grants intentionally block authenticated INSERT/UPDATE/DELETE. A code review found the manual flow executor still attempted to persist run and step audit records through the authenticated Supabase client.
- Updated the server-side manual executor to use the privileged server-only client for run/step audit inserts, finalization, and interrupted-run recovery, after the automation has been loaded with the authenticated user's ownership filter. Owner-scoped history reads and user-owned automation updates remain on the authenticated client.
- Exact-head CI passed after the correction at commit `79d681b97a1a3f56dec18f1a6f507e021f2f5f87`: [run 38374624825](https://github.com/Chrishem2003/chrishem-autostudio/actions/runs/38374624825).
- This verifies typecheck/tests/build and disposable PostgreSQL smoke tests, not live Supabase runtime behavior. Staging manual/dry/live run checks must confirm audit writes work and history remains owner-scoped before P0 can close.


## DNS pinning resolver-contract hardening — 2026-10-13

- Added strict validation that every DNS result is a literal IPv4/IPv6 address and its declared address family matches the parsed address before the result can be pinned to a socket.
- Added regression tests for hostname-shaped resolver output, IPv4/IPv6 family mismatches, and mixed answer sets containing malformed entries. Unsafe or malformed results fail closed before a network request.
- Exact-head CI passed at commit `ad91a53bb5842ae5bd6cc6098e750c3eac7b9a73`: [run 38376964605](https://github.com/Chrishem2003/chrishem-autostudio/actions/runs/38376964605). This is repository-level evidence only; deployed DNS/TLS/timeout/redirect smoke tests remain staging acceptance requirements.


## Sensitive execution-error audit redaction — 2026-10-13

- Review found that synchronous manual execution wrote raw step detail into `run_step_logs.error_detail` / `output_snapshot.detail`, and the shared finalization helper could write raw failure detail into `run_logs.error_summary`. This was inconsistent with the queue worker's existing redaction boundary.
- Centralized sanitization for shared run summaries and applied the same sanitization before manual step details are persisted. The redaction covers authorization tokens, credential-like assignments, query-bearing URLs, JWTs and email addresses; safe static fallback text is used when the remaining detail is not useful.
- Added regression coverage for sensitive values in persisted run summaries. Exact-head CI passed at commit `ea5efc1ffe9f000aea13ae50850af591933302e0`: [run 38379158465](https://github.com/Chrishem2003/chrishem-autostudio/actions/runs/38379158465).
- This is source/CI evidence only. Actual staging checks, second-person review and all previously open P0 acceptance gates remain outstanding; P0 stays open.


## Exact-head verification — 2026-10-13 (stale-worker fencing)

- Code checkpoint: `1c446748d0e3902c66e33a6ad3d4b38a80acceb2`.
- Exact-head CI: [run 38385124681 — passed](https://github.com/Chrishem2003/chrishem-autostudio/actions/runs/38385124681).
- Verified jobs: typecheck, unit tests, targeted execution-integrity lint, production build, and disposable PostgreSQL durable-queue migration/concurrency smoke tests.
- The latest SQL regression confirms a stale worker's original fencing token cannot finalize a job after lease recovery has moved it to `needs_review`; the associated audit run remains failed and is not rewritten by the stale worker.
- This is repository CI evidence only. Hosted staging acceptance remains **NOT RUN**; provider-side duplicate-effect checks, interrupted-worker rehearsal, deployed outbound transport verification and independent review remain required. Keep queue producer/worker and outbound transport flags disabled; P0 stays open and P1 is not authorized.


## Bounded lease-heartbeat transport — 2026-10-13

- Source review identified an unbounded wait when an automation/queue heartbeat promise never settled. The keepalive helper now races each heartbeat against a bounded timeout (15 seconds by default) and treats timeout as lost lease ownership.
- Added regression coverage for a stalled heartbeat request and invalid timeout values. The action is still awaited before returning an uncertainty error because a dispatched external side effect cannot safely be cancelled or assumed absent.
- Exact-head CI must pass after this change. This does not replace deployed staging checks or provider-side idempotency evidence; P0 remains open and P1 is not authorized.


## Scheduled-run audit redaction parity — 2026-10-13

- Follow-up review found the legacy direct scheduled executor still persisted raw step details and output snapshots, while manual and durable-queue execution sanitized those values. This could retain credential-bearing provider errors or sensitive nested output fields in run history.
- Updated scheduled step audit persistence to use the shared error sanitizer and bounded nested-output sanitizer, matching the manual/queue execution paths.
- Exact-head CI must pass before treating the fix as verified. Staging audit-history verification remains required; P0 remains open.


## Queue-worker audit writes fenced by both leases — 2026-10-13

- Review found that the durable worker checked both leases before starting steps and during provider calls, but its audit-outcome persistence and parent-run finalization were not preceded by a fresh ownership check. A delayed/stale worker could therefore rewrite audit records after lease ownership had moved.
- The worker now checks the queue and per-automation leases before persisting step outcomes and before finalizing the run. If either lease is lost, it leaves the in-flight intent/run for the fenced recovery path rather than writing through stale ownership.
- Exact-head CI is required; staging interruption/fencing rehearsal remains a separate acceptance gate. P0 remains open.


## Manual-run nested output redaction parity — 2026-10-13

- Cross-path review found that manual-run step details were sanitized but nested step outputs were still persisted directly in output snapshots. Provider outputs may contain access tokens, cookies, or other sensitive values even when the error text is clean.
- Manual execution now applies the bounded shared nested-output sanitizer before persisting output snapshots, aligning manual, scheduled, and durable-queue paths.
- Exact-head CI and controlled staging audit inspection remain required; P0 remains open.


## Automation heartbeat fencing smoke coverage — 2026-10-13

- Expanded the disposable PostgreSQL smoke test to verify expired lease tokens cannot renew their expiry, superseded tokens cannot renew a replacement lease, and the current unexpired token can renew/release normally.
- Exact-head CI must pass; this remains disposable-database evidence, not hosted staging acceptance.


## Queue success status-contract correction — 2026-10-13

- Deep review confirmed a mismatch: the shared application finalizer persists successful `run_logs` rows as `success`, while the queue finalization guard required `succeeded`. This could reject a valid queue success after the run audit had been persisted.
- Added a forward migration that preserves the queue job status `succeeded` but checks the linked audit run for the application's actual `success` status and a non-null finish timestamp. Updated the migration-chain guard and smoke fixture to exercise the real contract.
- Exact-head CI must pass before considering the fix verified. Staging acceptance remains NOT RUN; P0 stays open.


## Queue status-guard regression repair — 2026-10-13

- The first full migration-chain run caught a regression in the new forward migration: its replacement finalizer had omitted the explicit NULL-status check from the preceding guard. Restored the NULL check while retaining the `run_logs.status = success` contract.
- This illustrates why the entire migration chain, not only the changed SQL function, must pass. The latest exact-head CI is required before this correction is considered verified.


## Sanitizer dictionary-key hardening — 2026-10-13

- Cross-path audit sanitization now builds sanitized objects with a null prototype, so attacker-controlled keys such as `__proto__` are treated as inert data rather than prototype setters.
- Added regression coverage for prototype-named keys, sensitive nested values, and serialization. Exact-head CI must pass before this checkpoint is accepted.
- This is repository-level validation only; staging acceptance remains open and queue/outbound flags remain disabled.


## Output property-name redaction — 2026-10-13

- Extended audit sanitization to inspect object property names as untrusted provider output, not just values. Sensitive-key labels are replaced and URL/email/secret-like content in other keys is sanitized before persistence.
- Added regression coverage for query-bearing URLs, email addresses, sensitive labels, and preservation of a safe field. Exact-head CI must pass before accepting this checkpoint.
- Staging acceptance remains open; queue consumers and outbound transports stay disabled.


- Regression follow-up: the first output-key-redaction CI run correctly exposed two tests that still expected sensitive keys to remain unchanged. Updated those assertions to the new redacted-key contract and to confirm nested prototype-named data remains inert; rerun exact-head CI before accepting.


## Queue/audit success vocabulary alignment — 2026-10-13

- Cross-path review found that manual and scheduled run finalization persists the canonical audit status `success`, while the queue status is `succeeded`. The queue-health consistency checker had only accepted `succeeded` for audit rows, which could report healthy completed jobs as inconsistent.
- Updated diagnostics to recognize canonical `success` and retain `succeeded` compatibility for existing snapshots. Added a regression for a succeeded queue job linked to a completed `success` audit run.
- This defect was found by code-path review; exact-head CI must pass before accepting the correction. Staging acceptance remains open.

- [x] Queue-health diagnostics recognize the canonical audit status `success` (while retaining compatibility with `succeeded`) for successful run consistency, including mismatched non-success and still-running queue jobs. Exact-head CI passed on `4692e3a57c5d54998edd78456170f6d35354a228`; see [CI run 38420760154](https://github.com/Chrishem2003/chrishem-autostudio/actions/runs/38420760154).


## Dual-lease heartbeat exception handling — 2026-10-13

- Cross-path review found that the per-automation lease heartbeat could throw a transport exception before setting the worker's `executionLeaseLost` flag. That could incorrectly allow the catch path to attempt audit recovery writes without verified lease ownership.
- Added a fail-closed heartbeat confirmation helper that accepts only literal `true` and converts thrown transport errors to lost ownership. Queue-worker recovery then skips audit writes after either lease cannot be confirmed. Unit tests cover thrown errors and malformed responses.
- Exact-head CI is required; staging interruption rehearsal remains open.


## Intent-persistence lease-loss recovery guard — 2026-10-13

- Cross-path review found that the queue worker's `persistIntent` callback renewed the queue and automation leases directly, but did not set the shared `executionLeaseLost` flag when either heartbeat failed. A subsequent catch path could therefore attempt recovery writes after ownership had become unverifiable.
- Intent persistence now uses the shared dual-lease heartbeat function, which records lease loss before returning. The catch path consequently skips best-effort audit recovery when either fence fails, leaving reconciliation to the authoritative stale-run recovery path.
- Exact-head CI and a controlled staging interruption rehearsal remain required. This is not staging evidence; P0 remains open.


## Expired-lease audit-association regression — 2026-10-13

- Extended the disposable PostgreSQL queue smoke test to assert that an expired worker token cannot attach or re-attach an audit run after the lease expires, even before the stale-job recovery pass changes the queue status.
- This closes a specific audit-mutation assertion alongside existing stale-token heartbeat/finalization checks. The test has been added but is not accepted until exact-head CI passes.
- Hosted staging interruption/fencing rehearsal remains open; P0 stays open and queue/outbound flags remain disabled.


## Interrupted-run recovery ownership recheck — 2026-10-13

- Cross-path review found a narrow gap: if an error occurred after an audit run was created but before the next normal heartbeat, the catch path could begin best-effort audit recovery based only on the previously recorded lease-loss flag. It now confirms both queue and automation leases immediately before recovery mutations; an unconfirmed heartbeat fails closed and leaves the run for authoritative reconciliation.
- This is a source-level guard, not hosted staging evidence. Exact-head CI and a controlled lease-expiry/interruption rehearsal remain required; P0 stays open and queue/outbound flags remain disabled.


## Scheduled execution lease fencing — 2026-10-13

- Cross-path review found the legacy direct scheduler did not renew its automation lease around long provider actions or verify ownership before writing step outcomes, final summaries, and interrupted-run recovery. It now renews the shared automation lease before each action, keeps it alive during provider calls, and fails closed on lease loss before audit mutations; the catch path leaves unresolved history to stale-run reconciliation when ownership cannot be confirmed.
- Exact-head CI and controlled staging interruption/lease-expiry rehearsal remain required. This is not hosted staging evidence; P0 remains open and queue/outbound flags stay disabled.


## Manual execution lease fencing — 2026-10-13

- Manual live execution now renews its automation lease before each provider action, keeps the lease alive during long provider calls, and checks lease ownership before step-intent/outcome writes and parent-run finalization. If ownership cannot be confirmed, catch-path recovery writes are skipped so stale-run reconciliation can handle the uncertain run.
- This is code-level hardening only. Exact-head CI and controlled staging interruption/lease-expiry testing remain required; P0 stays open and durable queue/outbound transport flags remain disabled.


- Manual and scheduled live paths now re-confirm the current automation lease immediately before inserting the parent run audit record, after preflight/reconciliation work. This closes a stale-ownership window before the run is even created. Exact-head CI and staging fault-injection remain required; no staging acceptance is implied.


## Exact-head checkpoint — Gmail raw-header control-character regression (2026-10-13)

- [x] Exact-head CI passed on `fd526ebe01ec83632b32a7d7769241dbbd2a2931`: [run 38473193054](https://github.com/Chrishem2003/chrishem-autostudio/actions/runs/38473193054).
- [x] Both required CI jobs passed: typecheck, full unit suite, targeted execution-integrity lint, production build, complete configured disposable PostgreSQL migration chain, RPC permission/idempotency/fencing checks, and concurrent-worker claim smoke test.
- [x] Added regression coverage proving a NUL control character in a Gmail subject is encoded rather than emitted raw in a mail header.
- [ ] Repository-wide lint is not green. Recorded baseline: 3,317 findings (3,311 errors and 6 warnings), predominantly Prettier formatting. The CI step is explicitly non-blocking; this must be remediated or explicitly dispositioned before release.
- [ ] Hosted staging migrations/RLS/RPC and deployed cron-auth checks.
- [ ] Provider sandbox duplicate-effect/idempotency proof and interrupted-worker recovery rehearsal.
- [ ] Deployed outbound HTTP/TLS/DNS/redirect/timeout verification.
- [ ] Audit-history inspection and independent acceptance.
- [ ] Final P0 exit review and explicit P1 authorization.

The exact-head CI checkpoint does not change the release decision: **P0 OPEN; P1 not authorized**. Keep durable queue producer/worker and outbound transport gates disabled until the staging acceptance record is completed and reviewed.


## Exact-head checkpoint — Gmail subject header-injection regression (2026-10-13)

- [x] Exact-head CI passed on `2f79c6a33cc71c9af29ec92081b672f41488aa01`: [run 38474905024](https://github.com/Chrishem2003/chrishem-autostudio/actions/runs/38474905024).
- [x] Typecheck, full unit suite, targeted execution-integrity lint, production build, configured disposable PostgreSQL migration chain, RPC permission/idempotency/fencing checks, and concurrent-worker claim smoke test all passed.
- [x] Gmail raw-message regression covers NUL plus CRLF/Bcc header injection and asserts the unsafe subject is encoded instead of creating a raw header.
- [ ] Repository-wide lint remains non-blocking and not green: 3,317 recorded findings (3,311 errors and 6 warnings), predominantly Prettier formatting.
- [ ] Hosted staging migrations/RLS/RPC and deployed cron-auth checks.
- [ ] Provider sandbox duplicate-effect/idempotency proof and interrupted-worker recovery rehearsal.
- [ ] Deployed outbound HTTP/TLS/DNS/redirect/timeout verification.
- [ ] Audit-history inspection and independent acceptance.
- [ ] Final P0 exit review and explicit P1 authorization.

**Decision remains P0 OPEN; P1 is not authorized.** Keep durable queue producer/worker and outbound transport gates disabled until the staging acceptance record is completed and reviewed.


## Exact-head CI confirmation — IPv6 NAT64 SSRF guard (2026-10-13)

- [x] Security guard and regression tests passed exact-head CI on `cd105335d78ab4586b1296bdea5fc900e349edc4`: [run 38475519710](https://github.com/Chrishem2003/chrishem-autostudio/actions/runs/38475519710). The duplicate run `38475446807` was cancelled by GitHub Actions concurrency; the successful run tested the same exact head.
- [x] Both required jobs passed: typecheck, full unit tests, targeted execution-integrity lint, production build, and disposable PostgreSQL migration/permission/idempotency/fencing/concurrency smoke checks.
- [x] Added blocking for the well-known `64:ff9b::/96` NAT64 prefix and local-use `64:ff9b:1::/48`, with regressions for loopback/private IPv4 embeddings.
- [ ] Repository-wide lint disposition remains open (recorded baseline: 3,317 findings, 3,311 errors and 6 warnings; mostly formatting).
- [ ] Hosted staging migrations/RLS/RPC and deployed cron-auth checks.
- [ ] Provider sandbox duplicate-effect/idempotency proof and interrupted-worker recovery rehearsal.
- [ ] Deployed outbound HTTP/TLS/DNS/redirect/timeout verification; audit-history inspection; independent acceptance.
- [ ] Reconcile branch against current `main` (PR was reported dirty and 157 commits behind), then rerun CI on final synchronized head.

**Decision unchanged: P0 OPEN; P1 is not authorized.** Do not merge, deploy, or enable durable queue producers/workers or outbound transport. This checkpoint records repository CI only, not hosted staging acceptance.

## Exact-head verification — DNS-returned NAT64 SSRF regression (2026-10-13)

- [x] Exact-head CI passed on `60f25130989ac9328911d69fe534ac657b577331`: [run 38476054304](https://github.com/Chrishem2003/chrishem-autostudio/actions/runs/38476054304).
- [x] Both required jobs passed: typecheck, unit tests, targeted execution-integrity lint, production build, and disposable PostgreSQL migration/permission/idempotency/fencing/concurrency smoke checks.
- [x] Added resolver-boundary tests proving well-known/local-use NAT64 IPv6 answers are rejected even when supplied by DNS, including a mixed public-plus-NAT64 answer set.
- [ ] Hosted staging migration/RLS/RPC and deployed cron-auth acceptance remain open.
- [ ] Provider sandbox duplicate-effect/idempotency proof, interrupted-worker recovery rehearsal, deployed outbound HTTP/TLS/DNS/redirect/timeout verification, audit-history inspection, and independent acceptance remain open.
- [ ] Repository-wide lint disposition remains open (recorded baseline: 3,317 findings, 3,311 errors and 6 warnings, predominantly formatting).
- [ ] Branch synchronization against current `main` remains open; do not merge while the PR is dirty/behind, and rerun CI on the final synchronized head.

**Release decision unchanged: P0 OPEN; P1 is not authorized.** This checkpoint verifies repository code only. Do not merge, deploy, or enable durable queue producers/workers or outbound transport.


## Branch reconciliation plan — 2026-10-14

The hardening branch is intentionally **not synchronized automatically**. The GitHub comparison against `main` reports `diverged`, with 797 branch-only commits, 157 main-only commits, and 123 changed paths on the hardening side. Of those paths, 64 overlap files changed on `main` since the common ancestor. This is a material integration risk, not a routine behind-branch update.

### Reconciliation order

1. **Freeze the evidence baseline.** Preserve the current hardening head and its passing exact-head CI before any synchronization attempt.
2. **Inventory main-only behavior first.** Review the 157 main-only commits and classify their changes by runtime surface; do not assume they are cosmetic or safely replayable.
3. **Reconcile shared runtime contracts before UI.** Review these overlapping paths as pairs: `.github/workflows/ci.yml`, `package.json`, `src/lib/web-steps.server.ts`, `src/routes/api/public/cron/run-scheduled.ts`, `src/routes/api/public/cron/run-execution-job.ts`, execution-job helpers/tests, and Supabase generated types/migrations. Preserve both branches' intended behavior and migration ordering.
4. **Do not transplant queue migrations blindly.** Check migration timestamp order, function signatures, grants/revokes, RLS policies, and compatibility with the schema already on `main`. Staging migration execution and RLS/RPC checks are mandatory.
5. **Re-run focused and full CI after each controlled reconciliation batch.** No production or `main` update until the synchronized branch has green exact-head CI and independent review.
6. **Keep risky capabilities gated.** Queue producers/workers and outbound transport stay disabled until hosted staging, idempotency, recovery, network-boundary, and audit-history gates pass.

### Evidence checkpoint

- Current reviewed hardening head: `67ac323943ac861912b7587847fb1eceb89757c2`.
- Exact-head CI: [run 38476560866](https://github.com/Chrishem2003/chrishem-autostudio/actions/runs/38476560866) — passed.
- Merge/rebase/synchronization: **not performed**; no `main` or deployment changes were made.
- Release decision: **P0 OPEN; P1 not authorized**.


### Focused overlap review — scheduler producer contract (2026-10-14)

A first side-by-side review of `main` and `audit/p0-hardening` found a behavior-level conflict that must be resolved before synchronization:

- **Current `main` scheduler is queue-only:** it returns 503 when the durable queue feature gate is off, validates persisted workflows with `preparePersistedExecutionPlan`, uses `scheduledExecutionIdempotencyKey`, enqueues, and only then advances `last_run_at`.
- **Hardening branch scheduler retains a legacy inline-execution path** when the queue gate is off, in addition to stale-run reconciliation, per-automation lease heartbeats, audit recovery, and live capability preflight. That path must not be discarded blindly, but it must also not be reintroduced into a queue-only producer contract without an explicit architecture decision.
- **Idempotency implementation differs:** `main` uses the shared helper, which rejects unsupported cadences and invalid timestamps. The branch constructs a key inline using `Date.parse(last_run_at)` and a truncated cadence string. During reconciliation, prefer the shared validated helper and add regression coverage for invalid timestamps/cadences and repeat/concurrent scheduler calls.
- **Plan-validation wrappers are not themselves the main conflict:** branch `withPreparedExecutionPlan` delegates to `preparePersistedExecutionPlan`; reconcile the route's preflight/recovery behavior around that shared trust boundary rather than duplicating or weakening validation.

**Required resolution before a sync commit:** retain `main`'s fail-closed queue-only producer contract unless a reviewed rollout design explicitly authorizes a legacy mode; preserve the branch's stale-run recovery, live preflight, lease fencing, and audit-sanitization protections where compatible; replace ad-hoc idempotency construction with the shared helper; test that enqueue failure does not advance the schedule marker and that repeat calls for one schedule generation do not duplicate jobs. No route rewrite or branch synchronization was performed in this review.


## Queue-only scheduled producer and lease-release confirmation — 2026-10-14

- The scheduled cron route now fails closed with HTTP 503 when the durable queue rollout gate is disabled. The old inline scheduled execution path was removed; scheduled work is queued rather than executed inside the producer request.
- The producer preserves live capability preflight before enqueue, derives the shared idempotency key from the schedule generation, and advances the schedule cursor only after enqueue succeeds.
- Lease release is accepted only when the RPC has no error and returns literal `true`. For an ambiguous first-generation enqueue failure with no prior cursor, the producer retains the lease until expiry rather than changing the idempotency generation and risking a duplicate job.
- Exact-head CI passed on commit `11ccd4a1ccbe3fff1877aed515e764525d164b1d`: typecheck, complete unit suite, targeted execution-integrity lint, production build, and disposable PostgreSQL migration/idempotency/lease-fencing/concurrent-worker smoke test. See [CI run 38522195285](https://github.com/Chrishem2003/chrishem-autostudio/actions/runs/38522195285).
- This is code and disposable-database evidence only. Hosted staging migration/RLS/RPC checks, deployed cron authentication, provider-side duplicate-effect/idempotency tests, interrupted-worker recovery, deployed HTTP/TLS/DNS/redirect/timeout checks, audit-history inspection, and repository-wide lint disposition remain open. P0 remains open; do not enable production queue/outbound transport or begin P1.


## Exact-head checkpoint — schedule timing boundary regressions — 2026-10-14

- Added explicit boundary tests for the five-minute cadence (not due at 4m29s; due at 4m30s), hourly cadence (not due at 54m59s; due at 55m), and invalid-timezone fallback to UTC.
- The latest recorded code head for this test batch is `bc4f5aee4c8157b4624e5007529d71a7fbaf5ced`. Exact-head CI passed: [run 38523951631](https://github.com/Chrishem2003/chrishem-autostudio/actions/runs/38523951631). Typecheck, unit tests, production build, and disposable PostgreSQL durable-queue migration smoke test passed.
- Follow-up integration review confirmed the SQL smoke suite explicitly checks scheduled lease token fencing, NULL-cursor rejection without lease removal, idempotent enqueue payload consistency, service-role-only RPC execution, and expired worker jobs being parked for review rather than automatically replayed.
- This does not establish hosted staging acceptance. Hosted migration/RLS/RPC checks, deployed cron authentication, provider-side duplicate-effect/idempotency proof, interrupted-worker recovery, deployed network-boundary checks, audit-history inspection, repository-wide lint disposition, branch reconciliation, and final independent P0 review remain open.

**Release decision remains P0 OPEN; P1 is not authorized.** Do not merge, deploy, or enable production queue producers/workers or outbound transport until the outstanding acceptance gates pass.


## Repository-wide lint disposition — exact-head CI 2026-10-14

- The exact-head run for commit `682066dfdc02125a27a9a99ca1b141eb9fff8fb3` passed typecheck, the complete unit-test command, targeted execution-integrity lint, production build, and the disposable PostgreSQL queue/migration smoke test: [CI run 38524279719](https://github.com/Chrishem2003/chrishem-autostudio/actions/runs/38524279719).
- The same run's non-blocking repository-wide `bun run lint` step reported **3,148 errors and 6 warnings**; 3,090 errors were marked auto-fixable by ESLint. The log showed findings across 121 source files, including both legacy UI files and execution-related modules. Because this step uses `continue-on-error: true`, the green workflow does not mean repository-wide lint is clean.
- Do not hide this baseline by broadening lint ignores or weakening rules. Prioritize formatter-only auto-fixes in reviewable batches, then rerun the complete lint command and targeted integrity checks. Preserve semantic/security changes for separate reviewed patches.
- This lint debt remains an explicit P0 disposition gate. P0 remains open; P1 is not authorized.


## Worker lease statement-time expiry fence — 2026-10-14

- Cross-path review identified that PostgreSQL `now()` is transaction-stable. A finalizer that begins before lease expiry and waits on a row lock could otherwise evaluate the lease using stale transaction-start time after expiry.
- Added `20261014120000_execution_lease_statement_time.sql`: queue claim/recovery, heartbeat, and finalization now use `clock_timestamp()` for lease-expiry predicates and state timestamps. Finalization retains the audit-success requirement and service-role-only grants.
- Added SQL definition assertions plus `supabase/tests/execution_job_expiry_lock_race.sh`, which holds the queue row lock past expiry and verifies that the waiting stale finalizer is rejected and the job is parked for review.
- Exact-head CI passed on `29587b967675d08eea55d43460ecdecf88fec457`: [run 38547358190](https://github.com/Chrishem2003/chrishem-autostudio/actions/runs/38547358190). Both required jobs passed, including typecheck, full unit suite, targeted integrity lint, production build, migration smoke assertions, and concurrent queue/lease tests.
- This is repository and disposable-database evidence only. Hosted staging lease-expiry/interruption rehearsal, provider idempotency proof, network-boundary verification, independent acceptance, and repository-wide lint disposition remain open. **P0 remains OPEN; P1 is not authorized.** Keep queue producer/worker and outbound transport gates disabled.


## Worker lease lock-wait fencing — 2026-10-14

- Follow-up review expanded the statement-time check beyond finalization: audit-run association is also a lease-fenced mutation. The first lock-race test exposed that a time predicate alone in an `UPDATE ... WHERE` can be evaluated before a row-lock wait, and the initial test did not isolate lease expiry from the separate audit-success guard.
- The forward migration now locks the queue row with `SELECT ... FOR UPDATE` first, then checks `locked_until` against `clock_timestamp()` for heartbeat, audit-run association, and finalization. The association function retains the same-automation check, unique association guard, null-run rejection, and service-role-only grants.
- The concurrent regression script now tests both finalization and audit-run association with a lock held beyond lease expiry. The finalization case uses `needs_review` to test the lease fence itself rather than accidentally passing because a successful audit run was absent. SQL smoke assertions require lock-first checks.
- Exact-head CI passed on `98bdb9179d89310299340ce579829ca2f30133ce`: [run 38550010325](https://github.com/Chrishem2003/chrishem-autostudio/actions/runs/38550010325). Both required jobs passed, including typecheck, full unit tests, targeted integrity lint, production build, disposable PostgreSQL migration assertions, and concurrent lease tests.
- This is repository/disposable-database evidence only. Hosted staging lock-wait/expiry interruption rehearsal, provider idempotency proof, deployed network-boundary verification, independent acceptance, and repository-wide lint disposition remain open. **P0 remains OPEN; P1 is not authorized.** Keep queue producer/worker and outbound transport gates disabled.


## Expired-job recovery lock discipline — 2026-10-14

- Extended the lock-first lease rule to stale-worker recovery. `claim_execution_job` now selects expired running jobs with `FOR UPDATE SKIP LOCKED`, then performs a fresh `clock_timestamp()` expiry check while holding each row lock before moving it to `needs_review`. Rows already owned by another transaction are skipped for a later poll rather than waited on with a stale predicate.
- The SQL smoke assertion now verifies that recovery uses both the lock-skipping selection and the fresh expiry check. Exact-head CI passed on `310b5f32953e7df040bfd470a51244d73e6478ae`: [run 38550454301](https://github.com/Chrishem2003/chrishem-autostudio/actions/runs/38550454301). Both required jobs passed.
- Hosted staging concurrency/fault-injection, provider idempotency proof, network-boundary verification, independent acceptance, and repository-wide lint disposition remain open. This is not a release approval: **P0 remains OPEN; P1 is not authorized.**


## Ambiguous heartbeat/finalization response regression coverage — 2026-10-14

- Added a keepalive regression where the heartbeat times out but later resolves `true`. The late response must not restore lease confidence, restart heartbeat requests, or permit a successful provider result to be returned; the provider action is allowed to settle and the outcome remains review-required.
- Strengthened the worker finalization test to model the database state changing to `succeeded` before the transport throws. The worker returns `finalization_rejected` (unknown to the caller) and does not execute or finalize a second time in the same call. Recovery must consult durable state; it must not infer that the commit failed from the missing response.
- These are deterministic adapter-level regression tests. They do not substitute for hosted staging fault injection that drops responses after committed heartbeat/finalization RPCs. P0 remains open until staging, idempotency, network boundary, independent review, and remaining lint criteria are accepted.


## Durable-state behavior after ambiguous claim/finalization responses — 2026-10-14

- Strengthened the worker regression for a claim RPC that commits `queued → running` but whose response is lost. The caller propagates the transport failure and invokes neither the executor nor finalizer; the durable row remains running until normal lease-expiry recovery parks it for review.
- Added disposable PostgreSQL coverage that polls the queue repeatedly after a committed terminal `succeeded` state, simulating a lost finalization response. The terminal status, completion timestamp, and cleared lease identity must remain unchanged, and the job must never be returned by a later claim.
- Existing completed-audit/expired-lease coverage separately verifies that a lost finalization response followed by lease expiry parks the queue record for review while preserving the successful run and step audit; no automatic replay occurs.
- These tests establish repository and disposable-database behavior, not real network fault injection. Hosted staging must still drop responses after committed claim/heartbeat/finalization operations and verify deployed recovery behavior before P0 can close.
