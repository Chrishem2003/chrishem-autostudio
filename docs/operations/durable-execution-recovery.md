# Durable execution queue: operator recovery guide

## Rollout guard

Live manual executions use the durable queue only when the server environment contains:

`AUTOSTUDIO_DURABLE_QUEUE_ENABLED=true`

The flag is intentionally opt-in. Keep it disabled until the database migration is applied to the target environment, the scheduler is configured for `/api/public/cron/run-execution-job`, and controlled tests pass. The queue worker endpoint must use the existing cron authentication configuration.

## Queue status meanings

- `queued`: eligible for execution at/after `available_at`; may also be waiting for a safe retry.
- `running`: currently leased to a worker. The worker token fences heartbeats, audit-run attachment, and finalization.
- `succeeded`: worker recorded successful completion.
- `failed`: execution ended in a known failure that is not scheduled for retry.
- `needs_review`: execution outcome may be uncertain. Verify external provider state before deciding what to do next.
- `dead_letter`: configured retry limit was reached; inspect the failure and correct its cause before manually re-queueing.

Never treat a timeout as proof that an external action did not happen. Do not blindly replay jobs in `needs_review`.

## Read-only diagnostics

Use the Supabase SQL editor or a read-only database session.

### Queue counts

```sql
select status, count(*) as jobs
from public.execution_jobs
group by status
order by status;
```

### Recent queue jobs and linked audit runs

```sql
select
  j.id as job_id,
  j.automation_id,
  j.status as job_status,
  j.attempts,
  j.max_attempts,
  j.available_at,
  j.locked_until,
  j.run_id,
  r.status as run_status,
  r.started_at,
  r.finished_at,
  j.last_error
from public.execution_jobs j
left join public.run_logs r on r.id = j.run_id
order by j.updated_at desc
limit 100;
```

### Running jobs with expired leases

```sql
select id, automation_id, run_id, attempts, locked_until, updated_at
from public.execution_jobs
where status = 'running'
  and locked_until <= now()
order by locked_until;
```

The next successful claim operation reconciles expired leases to `needs_review`. When a job has a linked run, the reconciliation trigger marks still-running step records failed with `outcome_state = 'uncertain'` and closes the run summary.

The cron-secret-protected `/api/public/cron/execution-queue-health` endpoint returns the exact `totalCount` of expired leases plus a bounded diagnostic sample (`sampledCount`, at most 100 rows queried and 20 included in the response) and a `truncated` flag, alongside queue/audit consistency findings. Treat the total as the incident count and the sample as a triage aid. These are read-only observations; the endpoint does not renew leases, replay jobs, or repair audit rows.

### Running audit records not linked to a running job

```sql
select r.id, r.automation_id, r.started_at, r.status
from public.run_logs r
where r.status = 'running'
  and not exists (
    select 1
    from public.execution_jobs j
    where j.run_id = r.id
      and j.status = 'running'
  )
order by r.started_at;
```

This is a review queue, not an automatic repair command. Check recent worker logs and the associated job before changing records.

## Incident procedure

1. Capture the job ID, linked run ID, timestamps, attempt count, and sanitized error.
2. Inspect `run_logs` and `run_step_logs`; identify any step whose external outcome is uncertain.
3. Verify the corresponding provider state using the provider's own history or idempotency lookup.
4. Retry only after proving no effect occurred, or after confirming that the provider supports the same stable idempotency key for the operation.
5. If the external outcome cannot be established, leave the job for manual review and document the decision. Do not reset lease/status fields directly as a shortcut.
6. Before enabling the feature in a new environment, apply migrations and run the CI migration smoke test plus a controlled end-to-end test with non-production provider credentials.

## Scope and limitations

The database smoke test validates migrations, permissions, idempotency, lease fencing, concurrent claims, audit-run attachment, and expired-lease reconciliation. It does not prove that a production deployment has applied the migration, configured the scheduler, or completed a live provider integration test. Confirm those separately before rollout.

## Interrupted manual and scheduled runs

The authenticated `/api/public/cron/run-scheduled` task scans up to 100 open manual and scheduled runs older than 20 minutes on each invocation, oldest first. Before starting a new live manual run, the authenticated server function also checks up to 50 stale manual runs for that same automation while holding its own lease. Both paths call the transactional `reconcile_stale_execution_run` RPC, which serializes against the per-automation lease and leaves a run untouched while another worker owns an active lease. Reconciliation closes the parent run as failed and marks only still-running step intents as failed/uncertain; it never replays provider actions.

If the scheduler is stopped or the stale-run query/RPC fails, open records may remain for later inspection. The read-only queue-health endpoint reports stale manual/scheduled candidates. Treat those candidates as review signals, not proof that execution is active or safe to replay. Inspect provider history before any manual retry.

### Find open audit runs that are not attached to an active queue job

```sql
select
  r.id as run_id,
  r.automation_id,
  r.started_at,
  r.status as run_status,
  count(s.id) filter (where s.status = 'running') as running_step_count,
  count(s.id) filter (where s.outcome_state = 'uncertain') as uncertain_step_count
from public.run_logs r
left join public.run_step_logs s on s.run_id = r.id
where r.status = 'running'
  and not exists (
    select 1
    from public.execution_jobs j
    where j.run_id = r.id
      and j.status = 'running'
      and j.locked_until > now()
  )
group by r.id, r.automation_id, r.started_at, r.status
order by r.started_at;
```

This query is diagnostic only. It can include a recently interrupted manual/scheduled run, a queue run awaiting lease reconciliation, or a run whose worker is delayed. Check worker logs, the matching step intents, and provider-side activity before changing state. For each in-flight step, establish whether the external action happened; preserve uncertainty when it cannot be established. Do not blindly mark the parent run successful or replay the automation. If the audit database itself is unavailable, wait for recovery and repeat the read-only checks before attempting any repair.

When incident volume justifies automation, add a dedicated, lease-fenced stale-run reconciliation task with explicit ownership, age thresholds, per-path eligibility, and audit evidence before enabling automatic repair. Do not treat this operator query as an automatic repair mechanism.



## Stale manual and scheduled run monitoring

The cron-secret-protected `/api/public/cron/execution-queue-health` response includes `staleRuns` for manual and scheduled audit runs that remain `running` beyond the 20-minute recovery threshold. The response separates `totalCount` from the bounded query sample, reports whether the sample is truncated, and includes at most 20 run references for triage.

These are **review candidates, not automatic repairs**. A stale-looking row does not prove the worker stopped or that an external action did not happen. Before a manual recovery, check the current automation lease, worker logs, in-flight step intents, and provider-side state. If the external outcome cannot be established, preserve the uncertain outcome. The health endpoint is read-only and does not alter run, step, or lease state.
