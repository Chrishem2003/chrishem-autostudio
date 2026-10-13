# P0 staging acceptance evidence record

**Status:** NOT RUN — fill this record only from the actual dedicated non-production deployment.

Do not paste secret values, access tokens, full provider payloads, personal data, or credential-bearing logs into this file. Record only safe identifiers, outcomes, timestamps, and links to access-controlled evidence.

## Deployment identity
- Staging application URL (hostname only if desired):
- Staging Supabase project reference (non-secret project ref):
- Deployed Git commit SHA:
- CI run URL for that exact SHA:
- Migration list checked by:
- Date/time (include timezone):
- Reviewer / second-person confirmation:

## Database migration and permissions
- [ ] Reviewed `supabase migration list` and `supabase db push --dry-run` against the intended staging project.
- [ ] Applied migrations and confirmed all expected migrations are recorded as applied.
- [ ] Inspected queue table constraints, indexes, RLS, grants, and protected RPC signatures.
- [ ] Verified protected RPCs cannot be called by unauthorized database roles.
- Evidence link(s) / safe notes:

## Protected cron endpoint
For `POST /api/public/cron/run-scheduled`, `POST /api/public/cron/run-execution-job`, and `GET /api/public/cron/execution-queue-health`:
- [ ] Missing bearer token is denied.
- [ ] Incorrect bearer token is denied.
- [ ] Denied responses include `Cache-Control: no-store`, `Pragma: no-cache`, and `X-Content-Type-Options: nosniff`.
- [ ] Scheduler success and failure responses also include the same security headers; verify stale-run reconciliation and query failures explicitly.
- [ ] Authentication adapter failure returns a generic `503`, includes security headers, and does not start scheduled work or claim a queue job.
- [ ] Denied requests do not construct the worker or query queue state.
- [ ] `AUTOSTUDIO_DURABLE_QUEUE_ENABLED` and `AUTOSTUDIO_DURABLE_QUEUE_WORKER_ENABLED` remain disabled during baseline acceptance.
- [ ] With the worker flag disabled, valid auth returns the expected disabled response and no job is claimed.
- [ ] Only during the explicitly approved isolated worker test, enable the worker flag while producers remain disabled; valid auth against an empty queue returns `outcome: empty`, then restore the worker flag to disabled.
- [ ] Responses/logs do not reveal secrets, workflow payloads, or provider response bodies.
- Evidence link(s) / safe notes:

## Controlled provider sandbox test
- Test automation ID:
- Queue job ID:
- Run ID:
- Provider sandbox/reference ID (non-secret):
- Provider-side audit/history evidence link:
- [ ] One controlled manual run completes using server-owned audit writes and audit history matches its outcome.
- [ ] Authenticated users can read only their own run/step history and cannot insert, update, or delete audit rows through the Supabase API.
- [ ] One scheduled run follows enqueue-then-worker execution and audit history matches its outcome.
- [ ] Replaying the same logical enqueue returns the existing job.
- [ ] Reusing an idempotency key with changed logical input is rejected.
- [ ] Provider-side history confirms the external effect occurred exactly once.
- [ ] A safe preflight rejection causes no external effect.
- [ ] Busy automation lease defers the job without starting steps.
- Evidence link(s) / safe notes:

## Recovery and audit-integrity rehearsal
- [ ] Interrupt a worker after a step intent is persisted.
- [ ] Confirm in-flight step outcome is marked uncertain and parent run/job is recoverable.
- [ ] Confirm uncertain external actions are never blindly retried.
- [ ] Inspect provider-side history before any manual retry.
- [ ] Confirm recovery changes only the intended run and step records.
- [ ] Confirm lease expiry, stale worker finalization, and fencing behave as expected.
- [ ] Confirm queue health alerts accurately report review-needed jobs, expired leases, and audit consistency findings without mutating state.
- Evidence link(s) / safe notes:

## Final decision
- [ ] Exact deployed SHA has green required CI.
- [ ] All required staging checks above are evidenced.
- [ ] Any failed checks have documented remediation and successful retest.
- [ ] Second reviewer approves the evidence.
- [ ] P0 exit review explicitly authorizes P1.
- Decision: **P0 OPEN / P0 PASSED**
- Approver and date:
- Notes:

**Do not enable production queue consumers or outbound transports based only on this record's existence.** P0 remains open until evidence is completed, reviewed, and explicitly accepted.

## Repository CI checkpoint — 2026-10-13

- Code checkpoint: `ad91a53bb5842ae5bd6cc6098e750c3eac7b9a73`
- Exact-head CI: [run 38376964605 — passed](https://github.com/Chrishem2003/chrishem-autostudio/actions/runs/38376964605)
- Passed: typecheck, unit tests, targeted execution-integrity lint, production build, disposable PostgreSQL migration/permission smoke tests, and concurrent job-claim smoke tests.
- Staging acceptance remains **NOT RUN**. This CI checkpoint does not authorize enabling queue workers/outbound transport or closing P0.


## Repository CI checkpoint — 2026-10-13 (audit-error redaction)

- Code checkpoint: `ea5efc1ffe9f000aea13ae50850af591933302e0`
- Exact-head CI: [run 38379158465 — passed](https://github.com/Chrishem2003/chrishem-autostudio/actions/runs/38379158465)
- Passed: typecheck, unit tests, targeted execution-integrity lint, production build, disposable PostgreSQL migration/permission smoke tests, and concurrent job-claim smoke tests.
- The change sanitizes manual step audit details and shared run error summaries before persistence. It does not establish staging acceptance or authorize enabling queue workers/outbound transport; staging status remains **NOT RUN**.


## Exact-head verification — 2026-10-13 (stale-worker fencing)

- Code checkpoint: `1c446748d0e3902c66e33a6ad3d4b38a80acceb2`.
- Exact-head CI: [run 38385124681 — passed](https://github.com/Chrishem2003/chrishem-autostudio/actions/runs/38385124681).
- Verified jobs: typecheck, unit tests, targeted execution-integrity lint, production build, and disposable PostgreSQL durable-queue migration/concurrency smoke tests.
- The latest SQL regression confirms a stale worker's original fencing token cannot finalize a job after lease recovery has moved it to `needs_review`; the associated audit run remains failed and is not rewritten by the stale worker.
- This is repository CI evidence only. Hosted staging acceptance remains **NOT RUN**; provider-side duplicate-effect checks, interrupted-worker rehearsal, deployed outbound transport verification and independent review remain required. Keep queue producer/worker and outbound transport flags disabled; P0 stays open and P1 is not authorized.


## Repository hardening checkpoint — bounded lease heartbeat

- Source review found that an unresolved heartbeat request could keep the worker waiting indefinitely after the provider action settled.
- Added a bounded heartbeat timeout and regression tests. This checkpoint is source-only until exact-head CI reports success.
- Hosted staging acceptance remains **NOT RUN**. Do not enable queue producers/workers or outbound transport based on this change alone.


## Scheduled-run audit redaction parity checkpoint

- The legacy direct scheduled execution path now sanitizes persisted step error details and nested output snapshots using the same shared sanitizers as manual and queue execution.
- Verify with a controlled staging run that credential-like values are not persisted. This code checkpoint alone does not complete staging acceptance.
