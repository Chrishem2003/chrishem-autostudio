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