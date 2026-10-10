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
