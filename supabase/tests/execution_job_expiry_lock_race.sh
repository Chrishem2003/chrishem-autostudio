#!/usr/bin/env bash
set -euo pipefail

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

automation_id="00000000-0000-4000-8000-000000000002"
finish_job_id="00000000-0000-4000-8000-000000000077"
finish_token="00000000-0000-4000-8000-000000000078"
heartbeat_job_id="00000000-0000-4000-8000-000000000079"
heartbeat_token="00000000-0000-4000-8000-000000000080"

psql -v ON_ERROR_STOP=1 -c "
  delete from public.execution_jobs where id in ('$finish_job_id', '$heartbeat_job_id');
  insert into public.execution_jobs (
    id, automation_id, trigger_type, idempotency_key, payload, status,
    attempts, max_attempts, worker_token, locked_until, started_at
  ) values
    ('$finish_job_id', '$automation_id', 'manual', 'statement-time-finish-race', '{}'::jsonb, 'running',
     1, 3, '$finish_token', clock_timestamp() + interval '1 second', clock_timestamp()),
    ('$heartbeat_job_id', '$automation_id', 'manual', 'statement-time-heartbeat-race', '{}'::jsonb, 'running',
     1, 3, '$heartbeat_token', clock_timestamp() + interval '1 second', clock_timestamp());
"

# Session A holds the finalization job row past expiry. Session B begins while
# the lease is still live but must re-check the fence after the lock wait.
(
  psql -X -q -v ON_ERROR_STOP=1 -c "
    begin;
    select id from public.execution_jobs where id = '$finish_job_id' for update;
    select pg_sleep(2);
    commit;
  " > "$tmp_dir/finish-holder"
) &
holder_pid=$!
sleep 0.2
(
  psql -X -A -t -v ON_ERROR_STOP=1 -c "
    select public.finish_execution_job(
      '$finish_job_id', '$finish_token', 'needs_review',
      'statement-time expiry race', null
    );
  " | tr -d '[:space:]' > "$tmp_dir/finish-result"
) &
finish_pid=$!
wait "$holder_pid"
wait "$finish_pid"

finish_result="$(cat "$tmp_dir/finish-result")"
if [[ "$finish_result" != "f" ]]; then
  echo "Expired worker finalized after waiting on a row lock: result=$finish_result" >&2
  exit 1
fi

# Repeat the same lock-wait expiry test for heartbeat; a stale worker must not
# extend an expired lease simply because its transaction began before expiry.
(
  psql -X -q -v ON_ERROR_STOP=1 -c "
    begin;
    select id from public.execution_jobs where id = '$heartbeat_job_id' for update;
    select pg_sleep(2);
    commit;
  " > "$tmp_dir/heartbeat-holder"
) &
holder_pid=$!
sleep 0.2
(
  psql -X -A -t -v ON_ERROR_STOP=1 -c "
    select public.heartbeat_execution_job('$heartbeat_job_id', '$heartbeat_token', 300);
  " | tr -d '[:space:]' > "$tmp_dir/heartbeat-result"
) &
heartbeat_pid=$!
wait "$holder_pid"
wait "$heartbeat_pid"

heartbeat_result="$(cat "$tmp_dir/heartbeat-result")"
if [[ "$heartbeat_result" != "f" ]]; then
  echo "Expired worker renewed a lease after waiting on a row lock: result=$heartbeat_result" >&2
  exit 1
fi

psql -v ON_ERROR_STOP=1 -c "select * from public.claim_execution_job(300)" > "$tmp_dir/recovery"
finish_status="$(psql -X -A -t -v ON_ERROR_STOP=1 -c "select status from public.execution_jobs where id = '$finish_job_id'" | tr -d '[:space:]')"
heartbeat_status="$(psql -X -A -t -v ON_ERROR_STOP=1 -c "select status from public.execution_jobs where id = '$heartbeat_job_id'" | tr -d '[:space:]')"
if [[ "$finish_status" != "needs_review" || "$heartbeat_status" != "needs_review" ]]; then
  echo "Expired lease rows were not parked for review: finish=$finish_status heartbeat=$heartbeat_status" >&2
  exit 1
fi

# Automation lease heartbeat also takes the automation parent lock. Its
# expiry predicate must use clock_timestamp after waiting, not transaction now().
automation_token="$(psql -X -A -t -v ON_ERROR_STOP=1 -c "select public.claim_manual_automation('$automation_id', 300)" | tr -d '[:space:]')"
if [[ -z "$automation_token" ]]; then
  echo "Could not claim automation lease fixture" >&2
  exit 1
fi
psql -v ON_ERROR_STOP=1 -c "
  update public.scheduled_run_locks
     set locked_until = clock_timestamp() + interval '1 second'
   where automation_id = '$automation_id'
     and lock_token = '$automation_token';
"

(
  psql -X -q -v ON_ERROR_STOP=1 -c "
    begin;
    select id from public.automations where id = '$automation_id' for update;
    select pg_sleep(2);
    commit;
  " > "$tmp_dir/automation-holder"
) &
holder_pid=$!
sleep 0.2
(
  psql -X -A -t -v ON_ERROR_STOP=1 -c "
    select public.heartbeat_manual_automation('$automation_id', '$automation_token', 300);
  " | tr -d '[:space:]' > "$tmp_dir/automation-heartbeat-result"
) &
automation_heartbeat_pid=$!
wait "$holder_pid"
wait "$automation_heartbeat_pid"

automation_heartbeat_result="$(cat "$tmp_dir/automation-heartbeat-result")"
if [[ "$automation_heartbeat_result" != "f" ]]; then
  echo "Expired automation lease renewed after waiting on the parent lock: result=$automation_heartbeat_result" >&2
  exit 1
fi
expired_automation_lock="$(psql -X -A -t -v ON_ERROR_STOP=1 -c "
  select (locked_until <= clock_timestamp())::text
    from public.scheduled_run_locks
   where automation_id = '$automation_id'
     and lock_token = '$automation_token'
" | tr -d '[:space:]')"
if [[ "$expired_automation_lock" != "true" ]]; then
  echo "Automation lease expiry timestamp was extended after the lock wait" >&2
  exit 1
fi

replacement_token="$(psql -X -A -t -v ON_ERROR_STOP=1 -c "select public.claim_manual_automation('$automation_id', 300)" | tr -d '[:space:]')"
if [[ -z "$replacement_token" || "$replacement_token" == "$automation_token" ]]; then
  echo "Expired automation lease was not safely replaced" >&2
  exit 1
fi
psql -v ON_ERROR_STOP=1 -c "select public.release_manual_automation('$automation_id', '$replacement_token')"

echo "Statement-time queue and automation lease races passed: stale heartbeats/finalization were rejected after lock waits."
