#!/usr/bin/env bash
set -euo pipefail

# Exercise the real release/claim functions in separate PostgreSQL sessions.
# Parent-first lock ordering means the race must serialize without deadlocking.
automation_id="00000000-0000-4000-8000-000000000002"
cursor="2026-10-14 12:00:00+00"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

token="$(psql -X -A -t -v ON_ERROR_STOP=1 -c "select public.claim_scheduled_automation('$automation_id', 900)" | tr -d '[:space:]')"
if [[ -z "$token" ]]; then
  echo "Could not claim scheduled lease for release/claim race fixture" >&2
  exit 1
fi

(
  timeout 15s psql -X -A -t -v ON_ERROR_STOP=1 -c "
    select public.release_scheduled_automation('$automation_id', '$token', '$cursor'::timestamptz);
  " > "$tmp_dir/release"
) &
release_pid=$!

(
  timeout 15s psql -X -A -t -v ON_ERROR_STOP=1 -c "
    select public.claim_scheduled_automation('$automation_id', 900);
  " > "$tmp_dir/claim"
) &
claim_pid=$!

wait "$release_pid"
wait "$claim_pid"

released="$(tr -d '[:space:]' < "$tmp_dir/release")"
if [[ "$released" != "t" ]]; then
  echo "Concurrent scheduled release failed: result=$released (expected true)" >&2
  cat "$tmp_dir/claim" >&2
  exit 1
fi

stored_cursor="$(psql -X -A -t -v ON_ERROR_STOP=1 -c "select last_run_at::timestamptz = '$cursor'::timestamptz from public.automations where id = '$automation_id'" | tr -d '[:space:]')"
if [[ "$stored_cursor" != "t" ]]; then
  echo "Scheduled release did not persist its cursor after the race" >&2
  exit 1
fi

current_token="$(psql -X -A -t -v ON_ERROR_STOP=1 -c "select lock_token from public.scheduled_run_locks where automation_id = '$automation_id'" | tr -d '[:space:]')"
if [[ "$current_token" == "$token" ]]; then
  echo "Original scheduled lease survived a successful release" >&2
  exit 1
fi

echo "Scheduled release/claim race passed: release completed, cursor persisted, and any remaining lease is not the released token."
