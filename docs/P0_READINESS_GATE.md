# AUTO-STUDIO P0 Readiness Gate

Status: **OPEN — do not start P1 yet**

This checklist is the release gate for P0 execution-integrity hardening. A code commit alone does not mean a gate passed.

## A. Execution and audit consistency

- [x] Report a succeeded queue job that has no linked audit run.
- [x] Report a succeeded queue job whose linked audit run is missing, failed, unfinished, or not succeeded.
- [x] Report a succeeded queue job without its own completion timestamp.
- [x] Report a successful audit run without its own completion timestamp.
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
- [ ] Repository-wide lint baseline is remediated separately: the first full-repo run reported 2,683 errors (mostly Prettier formatting plus test-file `@ts-nocheck` violations). Do not mass-format unrelated application files as part of this safety patch.

## B. Execution lifecycle and recovery

- [x] Worker rejects a `succeeded` result unless the executor reports `effect_confirmed`; contradictory or malformed executor results go to `needs_review` rather than false success or automatic replay. Regression tests added.
- [x] Queue claim failure propagates without calling the executor or finalizer; regression test passed in CI run 38134707956.
- [x] Run creation/association fails closed before execution starts; regression tests passed in prior green CI run.
- [x] Database finalization rejects queue success without a linked, persisted successful audit run; disposable PostgreSQL smoke test passed in CI run 38134707956.
- [x] Worker reports thrown/rejected finalization rather than claiming success; regression tests passed in CI run 38134707956. Staging recovery behavior remains to be verified.
- [x] Disposable PostgreSQL smoke test verifies idempotent enqueue, conflicting-key rejection, lease fencing, terminal success/audit guard, and concurrent workers claim distinct jobs; CI run 38134707956.
- [ ] Verify provider-specific retry attempts remain idempotent end-to-end in staging.
- [x] Disposable PostgreSQL smoke test verifies expired queue leases route to `needs_review` and stale in-flight steps remain uncertain; CI run 38134707956.
- [ ] Verify interrupted/expired running jobs in the actual staging deployment without duplicate side effects.
- [ ] Verify concurrent workers cannot claim the same job beyond the intended lease/locking rules.
- [ ] Verify audit history is append-only where required and diagnostics remain read-only.

## C. Deployment and integrations

- [ ] Confirm migrations apply cleanly to a disposable/staging database.
- [ ] Run integration tests against staging Supabase with non-production test data.
- [ ] Verify secrets are never exposed to client code, logs, or test artifacts.
- [ ] Keep durable queue consumers and outbound message transports disabled until their provider-specific staging checks pass.
- [ ] Confirm CI checks for the final P0 head are green; investigate missing checks rather than interpreting them as success.

## P0 exit rule

P0 is complete only when all applicable A, B, and C gates are evidenced by actual test or staging results, all critical failures are resolved, and the final branch head has green required CI checks. Then review the master plan and explicitly authorize P1.

Do not mark any unchecked item as passed based on code inspection alone.


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
