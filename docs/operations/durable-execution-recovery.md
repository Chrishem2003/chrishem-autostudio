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
