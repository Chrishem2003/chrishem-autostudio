#!/usr/bin/env bash
set -euo pipefail

workflow=".github/workflows/ci.yml"
migration_dir="supabase/migrations"

# This is the deliberately scoped P0 queue-integrity migration chain exercised
# by the disposable PostgreSQL smoke job. Keep it chronological and update this
# contract whenever the CI smoke sequence intentionally changes.
expected=$(cat <<'MIGRATIONS'
20261010120000_p0_ai_usage_and_connection_storage.sql
20261010130000_scheduler_leases.sql
20261010140000_gmail_connection_verification.sql
20261010150000_gmail_test_quota.sql
20261010160000_step_outcome_certainty.sql
20261010170000_durable_execution_jobs.sql
20261011120000_execution_job_run_reconciliation.sql
20261011130000_atomic_stale_run_reconciliation.sql
20261011140000_execution_success_requires_audit.sql
20261011150000_automation_lease_heartbeat.sql
20261011160000_enqueue_null_validation.sql
20261011170000_execution_job_run_association_guard.sql
20261011180000_finish_job_null_status_guard.sql
20261011190000_enqueue_null_contract.sql
20261011200000_scheduler_lease_null_contract.sql
20261011210000_scheduled_release_null_cursor_guard.sql
20261013100000_lock_execution_audit_writes.sql
20261013110000_execution_success_accepts_success_status.sql
20261014100000_stale_run_lock_order.sql
MIGRATIONS
)

actual=$(sed -nE 's#^[[:space:]]*run: psql -v ON_ERROR_STOP=1 -f supabase/migrations/([^[:space:]]+)[[:space:]]*$#\1#p' "$workflow")

if [[ "$actual" != "$expected" ]]; then
  echo "P0 migration chain in $workflow differs from the reviewed expected sequence." >&2
  diff -u <(printf '%s\n' "$expected") <(printf '%s\n' "$actual") || true
  exit 1
fi

if ! printf '%s\n' "$actual" | sort -c; then
  echo "P0 migration chain is not in chronological filename order." >&2
  exit 1
fi

while IFS= read -r migration; do
  [[ -n "$migration" ]] || continue
  if [[ ! -f "$migration_dir/$migration" ]]; then
    echo "P0 migration referenced by CI does not exist: $migration" >&2
    exit 1
  fi
done <<< "$actual"

echo "P0 migration chain is complete, chronological, and references existing files."
