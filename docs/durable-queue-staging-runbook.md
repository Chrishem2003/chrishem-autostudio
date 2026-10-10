# Durable execution queue: non-production rollout runbook

**Purpose:** verify the queue against a dedicated non-production Supabase project before enabling it in production.

**Safety defaults:** `AUTOSTUDIO_DURABLE_QUEUE_ENABLED` must remain `false` until the checks below pass. Never paste service-role keys, cron secrets, OAuth tokens, or provider credentials into tickets, chat, or CI logs.

## 1. Preflight

- [ ] Use a dedicated staging Supabase project, not the production project.
- [ ] Confirm the project ref and target environment with a second person before applying migrations.
- [ ] Confirm the application deployment includes `POST /api/public/cron/run-execution-job`.
- [ ] Configure the server-side Supabase URL and service-role key in the deployment secret store.
- [ ] Configure `LOVABLE_CRON_SECRET` in the deployment secret store; do not expose it as a client-side `VITE_*` variable.
- [ ] Keep `AUTOSTUDIO_DURABLE_QUEUE_ENABLED=false` while validating the worker endpoint.
- [ ] In staging, disable or de-publish unrelated live automations so a rollout test cannot trigger unintended external actions.

## 2. Apply and inspect database migrations

Use the Supabase CLI locally, authenticated to the intended staging project:

```bash
supabase login
supabase link --project-ref <STAGING_PROJECT_REF>
supabase migration list
supabase db push --dry-run
```

Review the dry-run target and migration list before applying. Then apply to staging:

```bash
supabase db push
supabase migration list
```

Verify the durable queue migration is recorded as applied. The migration file is `supabase/migrations/20261010170000_durable_execution_jobs.sql`. Inspect the resulting table, constraints, indexes, RLS, grants, and RPC signatures in the staging database. The disposable PostgreSQL CI test is useful but is not a substitute for the full target project's existing schema and migration chain.

## 3. Deploy and smoke-test the protected worker

Deploy the application to staging with the queue flag still disabled. Configure a separate scheduled invocation for:

`POST https://<STAGING_APP_HOST>/api/public/cron/run-execution-job`

Send the cron secret only as the Authorization bearer token. Test these cases without logging the token:

- [ ] No Authorization header returns `401`.
- [ ] An incorrect bearer token returns `401`.
- [ ] A valid bearer token returns a successful response and, with an empty queue, reports `outcome: empty`.
- [ ] The request never exposes service-role credentials or provider secrets in its response/logs.

Do not enable the producer flag until the worker endpoint is deployed and its valid-secret request succeeds.

## 4. Controlled end-to-end queue test

Before turning on the flag, ensure only a deliberately prepared staging test automation is live. Use a dedicated test account/mailbox or another provider sandbox, and choose an action whose effect can be independently verified.

- [ ] Set `AUTOSTUDIO_DURABLE_QUEUE_ENABLED=true` in staging only.
- [ ] Trigger one manual live run with the Studio UI.
- [ ] Confirm the UI says the run was queued, not completed.
- [ ] Confirm one `execution_jobs` row is created and its idempotency key is stable for a repeat of the same request.
- [ ] Invoke the worker; verify job status transitions through `running` to its terminal state.
- [ ] Verify the matching `run_logs` row and all `run_step_logs` records, including outcome certainty.
- [ ] Verify the provider-side effect exactly once using the provider's own audit/history.
- [ ] Replay the same request ID with the same logical payload and confirm enqueue returns the existing job rather than creating a duplicate.
- [ ] Reuse that idempotency key with a changed trigger, payload, requester, or retry limit and confirm enqueue rejects the conflicting request instead of silently returning the old job.
- [ ] Test a safe preflight rejection; it must not perform an external action.
- [ ] Test a busy per-automation lease; the job must be deferred without executing steps.
- [ ] Test scheduled enqueue in staging and confirm the scheduler only enqueues while the worker performs execution.
- [ ] Inspect expired worker leases and verify uncertain work moves to `needs_review`, never to automatic replay.

Do not use production mailboxes, public webhook targets, or customer-connected accounts for these tests.

## 5. Observability and acceptance gates

Record the deployment SHA, migration status, test automation ID, queue job ID, run ID, provider-side evidence, and CI run URLs. Never include secret values or full credential-bearing payloads.

Before any staging enablement, verify the deployed build is using the centralized fail-closed helpers: only the exact string `true` enables `AUTOSTUDIO_DURABLE_QUEUE_ENABLED` or `AUTOSTUDIO_OUTBOUND_TRANSPORT_READY`; unset values must leave both capabilities disabled. Do not set either flag in production as part of this rehearsal.

Acceptance requires all of the following:

1. App typecheck, unit tests, production build, and PostgreSQL concurrency CI are green on the exact deployed commit.
2. The migration chain succeeds on staging and the intended RPC permissions are verified.
3. Valid/invalid cron authentication behavior is verified.
4. Manual and scheduled runs both complete through the queue in staging.
5. Duplicate delivery does not duplicate enqueueing or the external effect.
6. Lease loss, worker interruption, and uncertain outcomes are reconciled without blind retries.
7. Run history accurately reflects both successful and interrupted jobs.

## 6. Rollback

To stop queue processing safely:

1. Disable the worker cron first so it cannot claim additional jobs.
2. Set `AUTOSTUDIO_DURABLE_QUEUE_ENABLED=false` to stop new manual/scheduled queue producers.
3. Inspect all `queued` and `running` jobs. Do not delete or replay jobs with uncertain external outcomes; reconcile them to `needs_review` after evidence review.
4. Confirm the legacy execution paths are healthy before restoring normal scheduling.
5. Keep the queue migration and audit records in place; do not drop tables as an emergency rollback.

The queue flag controls producers, not already queued jobs. Stopping the worker cron is therefore a separate rollback step.

## Current environment boundary

GitHub CI currently validates the worker code and the migration against a disposable PostgreSQL 16 schema. Unit tests also exercise outbound HTTP preflight rejection for non-HTTP schemes, embedded credentials, unsupported methods, and oversized bodies without allowing a request attempt. It does not authenticate to the user's Supabase project, deploy the application, configure a cron provider, or send a real provider action. Those steps require the project's own deployment access and must be completed in staging before production activation.
