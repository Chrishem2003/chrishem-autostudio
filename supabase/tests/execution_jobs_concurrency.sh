#!/usr/bin/env bash
set -euo pipefail

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

psql -v ON_ERROR_STOP=1 -f supabase/tests/execution_jobs_concurrency_seed.sql
ready="$(psql -X -A -t -v ON_ERROR_STOP=1 -c "select count(*) from public.execution_jobs where idempotency_key like 'concurrent-claim-%' and status = 'queued'")"
if [[ "$ready" != "8" ]]; then
  echo "Concurrency fixture setup failed: queued=$ready (expected 8)" >&2
  psql -X -c "select id, idempotency_key, status, attempts, available_at from public.execution_jobs order by created_at"
  exit 1
fi

for i in $(seq 1 8); do
  (
    psql -X -A -t -v ON_ERROR_STOP=1 -c "select id from public.claim_execution_job(300)" \
      > "$tmp_dir/raw-$i"
    tr -d '[:space:]' < "$tmp_dir/raw-$i" > "$tmp_dir/claim-$i"
    printf '\n' >> "$tmp_dir/claim-$i"
  ) &
done
wait

cat "$tmp_dir"/claim-* | sed '/^$/d' > "$tmp_dir/claimed-ids"
total="$(wc -l < "$tmp_dir/claimed-ids" | tr -d '[:space:]')"
unique="$(sort -u "$tmp_dir/claimed-ids" | wc -l | tr -d '[:space:]')"

if [[ "$total" != "8" || "$unique" != "8" ]]; then
  echo "Concurrent claim safety failed: total=$total unique=$unique (expected 8/8)" >&2
  for file in "$tmp_dir"/raw-*; do echo "--- $file"; cat "$file"; done >&2
  psql -X -c "select id, idempotency_key, status, attempts, available_at from public.execution_jobs order by created_at" >&2
  cat "$tmp_dir/claimed-ids" >&2
  exit 1
fi

echo "Concurrent claim safety passed: 8 workers claimed 8 distinct jobs."

# Concurrent duplicate deliveries with the same idempotency key must converge
# on one durable job, even when every caller races through the unique constraint.
for i in $(seq 1 8); do
  (
    psql -X -A -t -v ON_ERROR_STOP=1 -c "
      select id from public.enqueue_execution_job(
        '00000000-0000-4000-8000-000000000002',
        'webhook',
        'concurrent-idempotency-race',
        '{\"same\":true}'::jsonb,
        null,
        3,
        now()
      );
    " > "$tmp_dir/enqueue-raw-$i"
    tr -d '[:space:]' < "$tmp_dir/enqueue-raw-$i" > "$tmp_dir/enqueue-id-$i"
    printf '\n' >> "$tmp_dir/enqueue-id-$i"
  ) &
done
wait

cat "$tmp_dir"/enqueue-id-* | sed '/^$/d' > "$tmp_dir/enqueued-ids"
enqueue_total="$(wc -l < "$tmp_dir/enqueued-ids" | tr -d '[:space:]')"
enqueue_unique="$(sort -u "$tmp_dir/enqueued-ids" | wc -l | tr -d '[:space:]')"
enqueue_rows="$(psql -X -A -t -v ON_ERROR_STOP=1 -c "
  select count(*) from public.execution_jobs
   where idempotency_key = 'concurrent-idempotency-race'
")"
if [[ "$enqueue_total" != "8" || "$enqueue_unique" != "1" || "$enqueue_rows" != "1" ]]; then
  echo "Concurrent idempotent enqueue failed: responses=$enqueue_total unique_ids=$enqueue_unique durable_rows=$enqueue_rows (expected 8/1/1)" >&2
  cat "$tmp_dir/enqueued-ids" >&2
  psql -X -c "select id, idempotency_key, payload, status from public.execution_jobs where idempotency_key = 'concurrent-idempotency-race'" >&2
  exit 1
fi

echo "Concurrent idempotency safety passed: 8 duplicate deliveries converged on one job."

# Remove the completed fixture request so the next claim is deterministic.
psql -v ON_ERROR_STOP=1 -c "
  update public.execution_jobs
     set status = 'dead_letter', finished_at = now(), updated_at = now()
   where automation_id = '00000000-0000-4000-8000-000000000002'
     and idempotency_key = 'concurrent-idempotency-race'
     and status = 'queued';
"

# An expired worker must never win finalization while lease recovery races it.
# The database predicate fences the expired token, and recovery must close the
# associated audit run while preserving its uncertain step outcome.
psql -v ON_ERROR_STOP=1 -c "
  select public.enqueue_execution_job(
    '00000000-0000-4000-8000-000000000002',
    'manual',
    'expired-finalize-recovery-race',
    '{\"race\":true}'::jsonb,
    null,
    3,
    now()
  );
  insert into public.run_logs (id, automation_id, status, started_at, trigger_type)
  values ('00000000-0000-4000-8000-000000000040',
          '00000000-0000-4000-8000-000000000002', 'running', now() - interval '2 minutes', 'manual');
  insert into public.run_step_logs (id, run_id, status, outcome_state)
  values ('00000000-0000-4000-8000-000000000041',
          '00000000-0000-4000-8000-000000000040', 'running', 'uncertain');
"
race_job_id="$(psql -X -A -t -v ON_ERROR_STOP=1 -c "
  select id from public.execution_jobs
   where idempotency_key = 'expired-finalize-recovery-race'
")"
race_claim="$(psql -X -A -t -v ON_ERROR_STOP=1 -c "select id::text || ':' || worker_token::text from public.claim_execution_job(300)" | tr -d '[:space:]')"
if [[ -z "$race_claim" ]]; then
  echo "Could not claim expired-finalization race fixture" >&2
  exit 1
fi
race_worker_token="${race_claim#*:}"
psql -v ON_ERROR_STOP=1 -c "
  select public.attach_execution_job_run(
    '$race_job_id', '$race_worker_token', '00000000-0000-4000-8000-000000000040'
  );
  update public.execution_jobs
     set locked_until = now() - interval '1 second'
   where id = '$race_job_id';
"
(
  psql -X -A -t -v ON_ERROR_STOP=1 -c "
    select public.finish_execution_job(
      '$race_job_id', '$race_worker_token', 'succeeded', null, null
    );
  " > "$tmp_dir/expired-finish"
) &
finish_pid=$!
(
  sleep 0.1
  psql -X -q -v ON_ERROR_STOP=1 -c "select id from public.claim_execution_job(300)" > "$tmp_dir/expired-recovery"
) &
recovery_pid=$!
wait "$finish_pid"
wait "$recovery_pid"
finish_result="$(tr -d '[:space:]' < "$tmp_dir/expired-finish")"
race_status="$(psql -X -A -t -v ON_ERROR_STOP=1 -c "select status from public.execution_jobs where id = '$race_job_id'" | tr -d '[:space:]')"
run_status="$(psql -X -A -t -v ON_ERROR_STOP=1 -c "select status from public.run_logs where id = '00000000-0000-4000-8000-000000000040'" | tr -d '[:space:]')"
step_state="$(psql -X -A -t -v ON_ERROR_STOP=1 -c "select status || ':' || outcome_state from public.run_step_logs where id = '00000000-0000-4000-8000-000000000041'" | tr -d '[:space:]')"
if [[ "$finish_result" != "f" || "$race_status" != "needs_review" || "$run_status" != "failed" || "$step_state" != "failed:uncertain" ]]; then
  echo "Expired finalize/recovery race failed: finish=$finish_result job=$race_status run=$run_status step=$step_state" >&2
  psql -X -c "select id, status, worker_token, locked_until, run_id from public.execution_jobs where id = '$race_job_id'" >&2
  psql -X -c "select id, status, finished_at, error_summary from public.run_logs where id = '00000000-0000-4000-8000-000000000040'" >&2
  psql -X -c "select id, status, outcome_state, error_detail from public.run_step_logs where id = '00000000-0000-4000-8000-000000000041'" >&2
  exit 1
fi

echo "Expired finalize/recovery race passed: stale finalization rejected and audit outcome retained as uncertain."

# Race stale-run reconciliation against a fresh scheduler lease claim. The
# claimant first owns the automation row; reconciliation must wait, then see
# the newly committed lease and leave the stale run open for a later review.
psql -v ON_ERROR_STOP=1 -c "
  insert into public.run_logs (id, automation_id, status, started_at, trigger_type)
  values ('00000000-0000-4000-8000-000000000030',
          '00000000-0000-4000-8000-000000000002',
          'running', now() - interval '30 minutes', 'schedule')
  on conflict (id) do update set status = 'running',
    started_at = now() - interval '30 minutes', trigger_type = 'schedule';
"
(
  psql -X -q -v ON_ERROR_STOP=1 -c "
    begin;
    select id from public.automations
      where id = '00000000-0000-4000-8000-000000000002'
      for update;
    select pg_sleep(1.5);
    select public.claim_scheduled_automation(
      '00000000-0000-4000-8000-000000000002', 900
    );
    commit;
  " > "$tmp_dir/scheduler-claim"
) &
claim_pid=$!
sleep 0.2
reconcile_result="$(psql -X -A -t -v ON_ERROR_STOP=1 -c "select public.reconcile_stale_execution_run('00000000-0000-4000-8000-000000000030', null)" | tr -d '[:space:]')"
wait "$claim_pid"

if [[ "$reconcile_result" != "active_lease" ]]; then
  echo "Stale-run/lease race failed: reconcile result=$reconcile_result (expected active_lease)" >&2
  cat "$tmp_dir/scheduler-claim" >&2
  psql -X -c "select id, status, started_at from public.run_logs where id = '00000000-0000-4000-8000-000000000030'" >&2
  exit 1
fi

run_status="$(psql -X -A -t -v ON_ERROR_STOP=1 -c "select status from public.run_logs where id = '00000000-0000-4000-8000-000000000030'" | tr -d '[:space:]')"
if [[ "$run_status" != "running" ]]; then
  echo "Stale-run/lease race closed a run while a fresh lease was acquired: status=$run_status" >&2
  exit 1
fi

echo "Stale-run/lease race passed: fresh scheduler lease fenced reconciliation."

# Two recovery callers racing the same stale run must produce exactly one
# reconciliation; the loser must observe the now-terminal parent and do nothing.
psql -v ON_ERROR_STOP=1 -c "
  insert into public.run_logs (id, automation_id, status, started_at, trigger_type)
  values ('00000000-0000-4000-8000-000000000031',
          '00000000-0000-4000-8000-000000000002',
          'running', now() - interval '30 minutes', 'manual')
  on conflict (id) do update set status = 'running',
    started_at = now() - interval '30 minutes', trigger_type = 'manual';
  insert into public.run_step_logs (id, run_id, status, outcome_state)
  values ('00000000-0000-4000-8000-000000000032',
          '00000000-0000-4000-8000-000000000031', 'running', 'uncertain')
  on conflict (id) do update set status = 'running', outcome_state = 'uncertain';
"
(
  psql -X -A -t -v ON_ERROR_STOP=1 -c "select public.reconcile_stale_execution_run('00000000-0000-4000-8000-000000000031', null)" \
    | tr -d '[:space:]' > "$tmp_dir/reconcile-race-1"
) &
reconcile_one=$!
(
  psql -X -A -t -v ON_ERROR_STOP=1 -c "select public.reconcile_stale_execution_run('00000000-0000-4000-8000-000000000031', null)" \
    | tr -d '[:space:]' > "$tmp_dir/reconcile-race-2"
) &
reconcile_two=$!
wait "$reconcile_one"
wait "$reconcile_two"
reconcile_results="$(cat "$tmp_dir/reconcile-race-1" "$tmp_dir/reconcile-race-2" | sort | tr '\\n' ' ')"
reconciled_count="$(grep -h -o 'reconciled' "$tmp_dir"/reconcile-race-* | wc -l | tr -d '[:space:]')"
not_running_count="$(grep -h -o 'not_running' "$tmp_dir"/reconcile-race-* | wc -l | tr -d '[:space:]')"
race_parent="$(psql -X -A -t -v ON_ERROR_STOP=1 -c "select status from public.run_logs where id = '00000000-0000-4000-8000-000000000031'" | tr -d '[:space:]')"
race_step="$(psql -X -A -t -v ON_ERROR_STOP=1 -c "select status || ':' || outcome_state from public.run_step_logs where id = '00000000-0000-4000-8000-000000000032'" | tr -d '[:space:]')"
if [[ "$reconciled_count" != "1" || "$not_running_count" != "1" || "$race_parent" != "failed" || "$race_step" != "failed:uncertain" ]]; then
  echo "Concurrent stale reconciliation failed: results=$reconcile_results parent=$race_parent step=$race_step (expected reconciled/not_running, failed, failed:uncertain)" >&2
  exit 1
fi

echo "Concurrent stale reconciliation passed: exactly one caller reconciled the run."
