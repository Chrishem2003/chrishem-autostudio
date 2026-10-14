# P0 staging acceptance: stale-worker fencing and recovery

**Status: NOT RUN — staging evidence required.** This checklist supplements `docs/durable-queue-staging-runbook.md`. Passing repository CI is necessary but does not prove the deployed Supabase project, cron scheduler, runtime, or provider behavior is safe.

## Safety controls

- [ ] Use a dedicated non-production Supabase project and a dedicated provider sandbox/test mailbox.
- [ ] Record the deployed commit SHA and migration status before testing.
- [ ] Keep production queue producers, queue workers, and outbound transport disabled.
- [ ] Do not paste bearer tokens, service-role keys, OAuth tokens, or provider payloads into evidence.
- [ ] Ensure no unrelated live automation can execute during the rehearsal.

## Stale-worker fencing scenario

1. Create one controlled test automation whose effect can be independently observed and safely repeated only under test conditions.
2. Enqueue one job and let worker A claim it. Record the job ID, run ID, and fencing identity in the restricted staging evidence log.
3. Pause or interrupt worker A after its run/step intent is persisted. Do not assume the provider request was cancelled.
4. Allow the lease to expire and run the supported recovery path. Verify the job moves to the review-required terminal/intermediate state defined by the migration, the audit run is finalized as failed, and in-flight step outcomes remain marked uncertain.
5. Start worker B or otherwise recover the job with a new fencing identity. Confirm worker A's original fencing identity cannot finalize, succeed, fail, or overwrite the recovered job.
6. Confirm the associated audit run and step records are not rewritten by worker A after recovery.
7. Inspect the provider's own history and reconcile whether the external effect happened. Never blindly replay an uncertain action.
8. Repeat with a second unrelated run active. Verify recovery of the first run does not mutate the second run or its step records.

## Provider outcome certainty and duplicate-effect scenarios

Run these only against a provider sandbox or a controlled test destination. Capture provider-side event IDs and effect counts, not credentials or message contents.

### Provider accepted the request but the response was lost

1. Configure the test adapter/proxy to let the provider accept one request, then drop the response before the worker receives it.
2. Verify the job/run records the action as uncertain or review-required and does not automatically retry the provider call.
3. Inspect provider-side history using a stable test correlation/idempotency key. Record whether the effect occurred and its provider event identifier.
4. Reconcile the job through the supported operator path; do not change certainty to confirmed-no-effect based only on a timeout.
5. Verify a second worker, duplicate webhook, cron overlap, or manual replay does not create another external effect.

### Confirmed no-effect retry

1. Configure a deterministic sandbox rejection that occurs before the provider performs the effect.
2. Verify the adapter reports `confirmed_no_effect` only when supported by authoritative provider evidence.
3. Verify the queued retry retains the same durable job identity/idempotency key and is bounded by the configured attempt policy.
4. Verify attempt exhaustion routes to the documented terminal/review state and does not loop indefinitely.

### Provider idempotency contract

- [ ] Record the provider and adapter versions plus the exact idempotency guarantee relied on.
- [ ] Prove the provider actually honors the supplied key for the relevant operation; a local key or adapter assertion alone is not proof.
- [ ] Verify key scope, retention window, payload-mismatch behavior, and response lookup/reconciliation behavior.
- [ ] If the provider has no authoritative idempotency/reconciliation mechanism, confirm uncertain outcomes remain manual-review only.

## Required negative cases

- [ ] Missing, blank, or stale fencing identity cannot finalize a queue job.
- [ ] A stale worker cannot overwrite `needs_review` or other recovery-owned state.
- [ ] An in-flight step with uncertain outcome is not automatically replayed.
- [ ] Existing terminal step diagnostics are preserved during recovery.
- [ ] A failed/rejected heartbeat while a provider request is in flight results in a review-required outcome, even if the provider request later settles.
- [ ] Duplicate delivery of the same request does not create a second queue job or a duplicate provider-side effect.
- [ ] Simulated provider acceptance with a lost response remains review-required and is not automatically replayed.
- [ ] A safe confirmed-no-effect retry retains the stable job/idempotency identity and respects the attempt limit.
- [ ] Unauthorized cron requests are rejected without claiming jobs or reading queue snapshots.
- [ ] Health endpoint responses are non-cacheable and contain no secrets or raw provider payloads.

## Evidence record

Record only non-secret identifiers and outcomes:

| Field | Value |
| --- | --- |
| Environment / Supabase project reference | |
| Deployed commit SHA | |
| Migration status verified by | |
| Worker A job/run identifiers | |
| Recovery timestamp and resulting state | |
| Worker B/new fencing identity outcome | |
| Unrelated-run isolation result | |
| Provider-side effect count and evidence reference | |
| Cron authentication results | |
| Reviewer and review date | |
| Defects / follow-up issue links | |

## Release decision

P0 remains **OPEN** until the checklist is run against the deployed non-production environment, provider-side effects are reconciled, and an independent reviewer accepts the evidence. Do not enable production queue producers/workers or outbound transport, merge the P0 branch to `main`, or begin P1 based on this document or CI results alone.
