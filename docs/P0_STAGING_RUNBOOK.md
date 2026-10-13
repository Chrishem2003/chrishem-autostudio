# P0 staging execution runbook

This runbook is for a **dedicated non-production Supabase project and application deployment only**. The repository's `supabase/config.toml` contains a project reference that may be production; never assume it is a staging target and never run migration commands against that default project without independently verifying the target.

## Safety preflight

1. Obtain an approved staging Supabase project reference and a separate staging application URL.
2. Confirm the project reference in the Supabase dashboard matches the intended non-production project. If the target is ambiguous, stop.
3. Ensure staging backups/restore strategy and an authorized reviewer are in place.
4. Keep `AUTOSTUDIO_DURABLE_QUEUE_ENABLED=false`, `AUTOSTUDIO_DURABLE_QUEUE_WORKER_ENABLED=false`, and `AUTOSTUDIO_OUTBOUND_TRANSPORT_READY=false` in the staging secret manager for baseline checks. Do not paste secret values into chat, issues, logs, or this repository.
5. Run commands from the repository root with the Supabase CLI installed and authenticated through the approved operator workflow.

## Migration dry run and apply

Use an explicit project reference for every command. Replace `<STAGING_PROJECT_REF>` only with the independently verified non-production project reference.

```sh
supabase login
supabase link --project-ref <STAGING_PROJECT_REF>
supabase migration list --linked
supabase db push --dry-run --linked
```

Review the complete migration plan before proceeding. Stop if the linked project is not the approved staging project or the dry run includes unexpected changes.

After reviewer approval:

```sh
supabase db push --linked
supabase migration list --linked
```

Verify the expected migration history and inspect the resulting queue tables, indexes, RLS, grants, and RPC signatures. Do not treat the disposable PostgreSQL CI smoke test as evidence that a hosted Supabase project was migrated.

## Protected cron endpoint checks

Run these against the staging application only. Do not include real tokens in shell history, screenshots, or shared logs. Store the staging cron secret in the deployment secret manager and use your organization's approved secret injection method.

For each endpoint below, check both missing and incorrect bearer tokens and verify a denied response has `Cache-Control: no-store`, `Pragma: no-cache`, and `X-Content-Type-Options: nosniff`:

- `POST /api/public/cron/run-scheduled`
- `POST /api/public/cron/run-execution-job`
- `GET /api/public/cron/execution-queue-health`

Then verify with valid staging authentication that scheduled work does not create external effects while all side-effect gates remain disabled. Verify the worker-disabled response does not claim jobs. Only in an isolated, explicitly approved test, enable the worker flag while producers and outbound transports remain disabled; check an empty queue returns the documented empty outcome, then immediately restore the worker flag to disabled.

Check scheduler success, authentication-adapter failure, reconciliation/query failures, and worker errors for safe generic response bodies and the required headers. Do not expose credentials, workflow payloads, or provider response bodies in logs.

## Provider sandbox and recovery

Use a dedicated test automation and provider sandbox account. Capture only non-secret IDs and links to access-controlled evidence in `P0_STAGING_ACCEPTANCE_RECORD.md`.

Verify manual and scheduled execution, idempotent enqueue/replay, changed-input rejection for a reused idempotency key, provider-side exactly-once effect evidence, preflight rejection with no effect, lease contention, interrupted worker recovery, expired lease handling, uncertain external action handling, and read-only health diagnostics. Never replay an uncertain external action until provider history has been inspected.

## Exit criteria

Complete every applicable checkbox in `P0_STAGING_ACCEPTANCE_RECORD.md`, record the exact deployed SHA and its green CI URL, obtain a second reviewer, and explicitly approve P0 exit. Until then P0 stays OPEN and P1, durable queue consumers, and outbound transports stay disabled.

**Stop condition:** if staging access, project identity, provider sandbox, or audit evidence is unavailable, record the blocker and leave the gate open. Do not substitute assumptions or local CI results for staging evidence.
