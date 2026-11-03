# Auto-Studio P0 staging acceptance record

**Status: NOT RUN — P0 remains OPEN.**

This record must be completed only from the actual dedicated non-production application and Supabase project. Repository CI and disposable PostgreSQL tests are not hosted-staging acceptance.

## Code and CI checkpoint

- Repository: `Chrishem2003/chrishem-autostudio`
- Reconciliation branch: `audit/p0-reconciliation-2026-11-03`
- Draft pull request: [#7](https://github.com/Chrishem2003/chrishem-autostudio/pull/7)
- Exact code head: `f53139a98d475940751d23947325736a36e476fd`
- Exact-head CI: [run 41641171720 — passed](https://github.com/Chrishem2003/chrishem-autostudio/actions/runs/41641171720)
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
