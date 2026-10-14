#!/usr/bin/env bash
set -euo pipefail

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

job_id="00000000-0000-4000-8000-000000000077"
automation_id="00000000-0000-4000-8000-000000000002"
key="statement-time-expiry-lock-race"
psql -v ON_ERROR_STOP=1 -c "
  delete from public.execution_jobs where id = '$job_id';
  insert into public.execution_jobs (
    id, automation_id, trigger_type, idempotency_key, payload, status,
    attempts, max_attempts, worker_token, locked_until, started_at
  ) values (
    '$job_id', '$automation_id', 'manual', '$key', '{}'::jsonb, 'running',
    1, 3, '00000000-0000-4000-8000-000000000078',
    clock_timestamp() + interval '1 second', clock_timestamp()
  );
"

# Session A holds the row lock past lease expiry. Session B invokes finalization
# while the lease is still live, but must re-check the fence after waiting.
(
  psql -X -q -v ON_ERROR_STOP=1 -c "
    begin;
    select id from public.execution_jobs where id = '$job_id' for update;
    select pg_sleep(2);
    commit;
  " > "$tmp_dir/holder"
) &
holder_pid=$!
sleep 0.2
(
  psql -X -A -t -v ON_ERROR_STOP=1 -c "
    select public.finish_execution_job(
      '$job_id',
      '00000000-0000-4000-8000-000000000078',
      'needs_review',
      'stale worker lock-wait regression',
      null
    );
  " | tr -d '[:space:]' > "$tmp_dir/finish-result"
) &
finish_pid=$!
wait "$holder_pid"
wait "$finish_pid"

finish_result="$(cat "$tmp_dir/finish-result")"
if [[ "$finish_result" != "f" ]]; then
  echo "Expired worker finalized after waiting on a row lock: result=$finish_result" >&2
  psql -X -c "select id, status, worker_token, locked_until from public.execution_jobs where id = '$job_id'" >&2
  exit 1
fi

psql -v ON_ERROR_STOP=1 -c "select * from public.claim_execution_job(300)" > "$tmp_dir/recovery"
status="$(psql -X -A -t -v ON_ERROR_STOP=1 -c "select status from public.execution_jobs where id = '$job_id'" | tr -d '[:space:]')"
if [[ "$status" != "needs_review" ]]; then
  echo "Expired worker job was not parked for review after the blocked finalization: status=$status" >&2
  exit 1
fi


# Audit association is a separate fenced mutation and must obey the same rule.
job_id2="00000000-0000-4000-8000-000000000079"
run_id2="00000000-0000-4000-8000-000000000080"
token2="00000000-0000-4000-8000-000000000081"
psql -v ON_ERROR_STOP=1 -c "
  delete from public.execution_jobs where id = '$job_id2';
  delete from public.run_logs where id = '$run_id2';
  insert into public.run_logs (id, automation_id, status, started_at)
  values ('$run_id2', '$automation_id', 'running', clock_timestamp());
  insert into public.execution_jobs (
    id, automation_id, trigger_type, idempotency_key, payload, status,
    attempts, max_attempts, worker_token, locked_until, started_at
  ) values (
    '$job_id2', '$automation_id', 'manual', 'statement-time-attach-race',
    '{}'::jsonb, 'running', 1, 3, '$token2',
    clock_timestamp() + interval '1 second', clock_timestamp()
  );
"

(
  psql -X -q -v ON_ERROR_STOP=1 -c "
    begin;
    select id from public.execution_jobs where id = '$job_id2' for update;
    select pg_sleep(2);
    commit;
  " > "$tmp_dir/attach-holder"
) &
holder_pid=$!
sleep 0.2
(
  psql -X -A -t -v ON_ERROR_STOP=1 -c "
    select public.attach_execution_job_run('$job_id2', '$token2', '$run_id2');
  " | tr -d '[:space:]' > "$tmp_dir/attach-result"
) &
attach_pid=$!
wait "$holder_pid"
wait "$attach_pid"

attach_result="$(cat "$tmp_dir/attach-result")"
if [[ "$attach_result" != "f" ]]; then
  echo "Expired worker attached audit history after waiting on a row lock: result=$attach_result" >&2
  psql -X -c "select id, status, worker_token, locked_until, run_id from public.execution_jobs where id = '$job_id2'" >&2
  exit 1
fi

echo "Worker lease expiry race passed: blocked finalization and audit association were both rejected after expiry."
