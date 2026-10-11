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
    printf '\\n' >> "$tmp_dir/enqueue-id-$i"
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
