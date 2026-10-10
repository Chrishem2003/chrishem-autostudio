# AutoStudio Repository Audit — Baseline

Audit date: 2026-10-10
Repository: https://github.com/Chrishem2003/chrishem-autostudio
Branch: audit/p0-hardening
Baseline: main branch, read-only inspection through GitHub repository APIs.

## Scope and confidence

This is a source-level baseline, not a local build or live production test. The repository has not yet been cloned into a local runtime in this session, and no build, typecheck, unit test, database migration, or real provider verification has been executed here. Findings below are grounded in the inspected files and should be revalidated by automated checks before merge.

## Existing foundation observed

- TanStack Start / React / TypeScript application with Supabase integration.
- Workflow editor, automation catalog, workflow types, templates/gallery, impact/SDK/embed pages.
- Authentication middleware used by most cloud and Gmail server functions.
- Existing run and step logs, version history, scheduled cadence helper, chat webhook and Gmail step modules.
- Four test files under `src/lib/__tests__`, covering chat steps, Gmail steps, scheduling, and web address rules.
- Lovable-connected repository guidance warns against rewriting published Git history.

## Confirmed source-level gaps

### P0 — Security and execution correctness

1. `src/lib/copilot.functions.ts`: `composeFlow` has no `requireSupabaseAuth` middleware in the inspected implementation, no explicit upstream timeout, and no per-user usage/rate-limit check. Its response is parsed from model text and filtered against candidate IDs, but the returned structure is not fully schema-validated.
2. `src/lib/web-steps.server.ts`: `isBlockedHost` uses string-prefix checks for IPv6 ranges; this can incorrectly reject public hostnames beginning with `fc` or `fd`. It does not resolve DNS records and validate/pin the resolved addresses before the outbound request, leaving a server-side request forgery / DNS-rebinding hardening gap.
3. `src/routes/api/public/cron/run-scheduled.ts`: the scheduler has a separate step loop. It sends chat webhook and HTTP steps, but other action nodes are recorded as `dry_run` / practice steps. This diverges from the guide's goal of one shared executor.
4. Only two files are present under `supabase/migrations` at baseline. The application uses `app_user_connections` in `src/lib/app-user-connections.server.ts` and its generated database types, but the inspected migrations do not create that table.
5. A root `.env` file is tracked. The inspected entries appear to be project URL/ID and publishable-key configuration, not a service-role secret. Nonetheless, tracked environment files are unsafe operational practice; replace it with a placeholder-only `.env.example` and remove `.env` from the branch after confirming no deployment workflow relies on the committed file. If any real secrets are discovered, rotate them.
6. `package.json` defines build/lint/format scripts but no test script. Existing tests import Vitest, while Vitest was not listed among the inspected package's declared dependencies. The test setup needs to be made reproducible before relying on test claims.
7. `src/lib/cloud.functions.ts`: `connectIntegration` marks metadata as `connected` and timestamps it without performing a provider verification call; `verifyIntegration` updates the same fields without a provider call. This conflicts with the plan's "connected means verified" rule.

## Delivery sequence aligned to the Master Plan

- **Gate 0 — Establish a reproducible baseline:** ensure secrets are not tracked; make lint/build/typecheck/tests runnable; record actual outcomes and current commit.
- **P0 — Security and scheduler fixes:** protect and meter AI planning; harden URL/IP checks against private and mapped addresses; add missing connection migration with RLS and no client policies; make scheduled/manual step execution share implementation; document scheduler setup.
- **P1a — Truthful connections:** introduce connector manifests and real read-only verification; only show Live after successful verification.
- **P1b — Connectors:** add providers in the plan's messaging, work-data, and money batches; test each against provider sandbox accounts before claiming Live.
- **P2 — Shared executor and queue:** unify manual, scheduled, and webhook runs; add idempotency, retry/backoff, event logs, provider circuit breakers, and dead-letter handling.
- **P3 — Safe AI planning:** provider-agnostic gateway, strict schemas, usage metering, bounded clarification questions, and reviewable patch-based refinement.
- **P4–P5 — Industry packs and UX:** templates with valid dry runs, onboarding, accessible responsive builder, honest status states, and error actions.
- **P6–P7 — Teams and operations:** workspace roles/approvals, audit log, replay/version diff, quotas, retention, scoped API keys, and health/status reporting.
- **P8 — Differentiators:** metadata-only Autopilot with explicit consent, Watch Mode, rewind simulation, approval/undo, multilingual UX, and human-reviewed connector drafting.

## Additional hardening ideas to evaluate after P0

- A capability/permission matrix per connector action (read, write, destructive, financial) with least-privilege scopes.
- Mandatory confirmation and spend/reach caps for money movement, destructive actions, and bulk messaging.
- Tenant-isolation tests for every RLS-protected table and server-side ownership check.
- Signed, replay-resistant webhook validation with timestamp tolerance and idempotency storage.
- Structured, redacted audit events and an automated secret-scanning CI check.
- A staged rollout / feature-flag strategy and rollback playbook for migrations and executor changes.
- Per-provider rate budgets, concurrency limits, queue backpressure, and provider outage dashboards.
- An integration contract test suite with mocked provider APIs plus a separate sandbox verification checklist.
- Data minimization and retention enforcement, with healthcare templates restricted to reminders as stated in the master plan.
- Backup/restore drills and migration-forward/backward compatibility checks before production changes.

## Merge gate

Do not merge a phase solely because the code was generated. Require its stated acceptance tests, CI checks, migration review, and explicit evidence that every integration labeled Live has passed a real verification call. No live-flow execution should be enabled by an untested refactor.
