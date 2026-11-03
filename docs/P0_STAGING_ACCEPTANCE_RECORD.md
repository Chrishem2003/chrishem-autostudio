# Auto-Studio P0 staging acceptance record

**Status: NOT RUN — P0 remains OPEN.**

This record must be completed only from the actual dedicated non-production application and Supabase project. Repository CI and disposable PostgreSQL tests are not hosted-staging acceptance.

## Code and CI checkpoint

- Repository: `Chrishem2003/chrishem-autostudio`
- Reconciliation branch: `audit/p0-reconciliation-2026-11-03`
- Draft pull request: [#7](https://github.com/Chrishem2003/chrishem-autostudio/pull/7)
- Exact code head: `6102eb289483e136db9d899e16042d79f12ea111`
- Exact-head CI: [run 41643455167 — passed](https://github.com/Chrishem2003/chrishem-autostudio/actions/runs/41641171720)
- Hosted staging deployment SHA:
- Dedicated staging Supabase project reference:
- Staging application hostname:
- Migration verification date/time (timezone):
- Operator:
- Independent reviewer:

## Staging identity and migration safety

- [ ] Independently confirm the Supabase project is dedicated non-production.
- [ ] Independently confirm the application deployment is dedicated non-production.
- [ ] Confirm backups/restore strategy and authorized operator access.
- [ ] Review `supabase migration list --linked`.
- [ ] Review `supabase db push --dry-run --linked` against the explicitly verified staging project.
- [ ] Apply approved migrations only to that staging project.
- [ ] Confirm the new automation-heartbeat, stale-run-reconciliation and audit-write-lockdown migrations are applied.
- [ ] Inspect table RLS, grants, policies and service-role-only RPC signatures.

## Rollout gates and cron protection

- [ ] Keep `AUTOSTUDIO_DURABLE_QUEUE_ENABLED=false`.
- [ ] Keep `AUTOSTUDIO_DURABLE_QUEUE_WORKER_ENABLED=false`.
- [ ] Keep `AUTOSTUDIO_OUTBOUND_TRANSPORT_READY=false`.
- [ ] Verify missing and incorrect cron bearer tokens are denied for scheduler, worker and queue-health endpoints.
- [ ] Verify every response has no-store/no-cache/nosniff headers.
- [ ] Verify authentication adapter failures return generic safe errors.
- [ ] Verify the scheduler disabled response does not query/enqueue work.
- [ ] Verify the worker disabled response does not claim a job.
- [ ] In an explicitly approved isolated check only, enable the worker flag while the producer remains disabled; confirm an empty queue response, then restore it to disabled.

## Queue, worker and provider sandbox

- [ ] Run one controlled manual sandbox execution.
- [ ] Run one controlled scheduled sandbox execution.
- [ ] Confirm producer and worker are independently gated.
- [ ] Confirm queue-job and automation lease heartbeats both renew only for current tokens.
- [ ] Confirm stale/expired/superseded lease tokens cannot renew or finalize.
- [ ] With `AUTOSTUDIO_OUTBOUND_TRANSPORT_READY=false`, confirm Gmail, HTTP, webhook and chat steps all fail preflight before any provider request.
- [ ] Confirm provider preflight rejection produces no external effect.
- [ ] Confirm a reused idempotency key returns the same logical job.
- [ ] Confirm changed logical input with a reused key is rejected.
- [ ] Confirm provider-side history shows exactly one external effect.
- [ ] Confirm uncertain provider outcomes go to review and are never blindly replayed.

## Audit integrity and recovery

- [ ] Confirm authenticated users can read only their own run and step history.
- [ ] Confirm authenticated users cannot insert, update or delete run/step audit rows.
- [ ] Confirm server-side service-role writes persist run and step audit records.
- [ ] Confirm output snapshots and errors redact credential-like values and are bounded.
- [ ] Interrupt a worker after step intent persistence.
- [ ] Confirm stale-run reconciliation waits while an automation lease is active.
- [ ] Confirm expired-lease recovery marks unfinished steps failed/uncertain and closes the run.
- [ ] Confirm recovery does not execute or replay provider actions.
- [ ] Confirm queue-health endpoint is read-only and reports audit inconsistencies accurately.

## Exit decision

- [ ] Exact deployed SHA has green required CI.
- [ ] All staging checks above have evidence links or safe notes.
- [ ] All failures have documented remediation and successful retest.
- [ ] Independent reviewer approves the evidence.
- [ ] Explicit P0 exit review authorizes P1.

**Decision: P0 OPEN / P0 PASSED**

Approver:
Date:
Evidence links:
Notes:

Do not enable production queue consumers or outbound transports based on this record's existence. Never paste credentials, access tokens, provider payloads, personal data or secret environment values into this file.

## Latest branch-head CI confirmation

- Latest PR head at this record update: `9a967fd2950c3569f85f345918484a59fc770c44` (documentation-only change from the code checkpoint).
- Exact-head GitHub Actions run: [run 41643832725 — passed](https://github.com/Chrishem2003/chrishem-autostudio/actions/runs/41643832725).
- Underlying code checkpoint: `708bea9a9f21a883446839ab9690341447836aa5`; [run 41643600763 — passed](https://github.com/Chrishem2003/chrishem-autostudio/actions/runs/41643600763).
- Verified jobs: frozen dependency install, typecheck, full unit tests, focused execution-integrity/cron lint, production build, disposable PostgreSQL migration chain, statement-time queue lease lock-wait race tests, and concurrent worker claim tests.
- This latest run verifies the branch head, including the documentation-only acceptance-record updates; it does not replace hosted staging acceptance.
- Hosted staging acceptance remains **NOT RUN**. P0 remains **OPEN** and P1 remains **NOT AUTHORIZED**.

## Latest exact-head CI confirmation — 2026-11-03

- PR #7 latest head: `cfbc26c909a046e744d7f15477c7c2ae2c3c3cb3`.
- Exact-head GitHub Actions run: [run 41644313050 — passed](https://github.com/Chrishem2003/chrishem-autostudio/actions/runs/41644313050).
- Both jobs completed successfully: typecheck, full unit tests, focused lint, production build, disposable PostgreSQL migration chain, RPC permission checks, statement-time queue lease lock-wait race tests, and concurrent worker claim tests.
- This is automated CI evidence only. Hosted Auto-Studio staging acceptance remains **NOT RUN**; production migration/deployment remains unauthorized; P1 remains not authorized.

## Staging environment boundary

- The connected Supabase project `Chrishem Platform Staging` (ref `bokxljngydmqrmktofwm`) is a shared platform/NEMA staging environment with existing platform job and NEMA tables/migrations.
- It has not been verified as a dedicated Auto-Studio staging database. Do not apply Auto-Studio migrations or run acceptance writes against it without an explicit environment decision and an isolated staging target.

## Follow-up verification — exact documentation head

- Latest head before this record update: `31d6692ecabd78da634b11ffb15eb36268c34c66`.
- Exact-head GitHub Actions run: [run 41644666547 — passed](https://github.com/Chrishem2003/chrishem-autostudio/actions/runs/41644666547).
- Both CI jobs completed successfully: typecheck/full unit tests/focused lint/production build and disposable PostgreSQL migration/permission/lease-race/concurrent-claim smoke tests.
- Repository-side review rechecked fail-closed producer/worker/outbound flags, immutable JSON payload handling, strict heartbeat ownership, bounded retry timestamps, uncertain-effect review routing, service-role-only queue RPC grants, and audit-backed successful finalization.
- This review is not an independent approval and does not replace provider-sandbox or hosted staging acceptance. P0 remains **OPEN**; P1 remains **NOT AUTHORIZED**.
