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


## Implementation progress on `audit/p0-hardening`

This section records actual changes on the branch; it does not imply they are merged or deployed.

### Implemented

- Added `bun run typecheck` and `bun run test`; moved the four existing test files to Bun's built-in test runner so the committed `bun.lock` remains the source of dependency truth.
- Added GitHub Actions CI for locked dependency installation, typechecking, unit tests, and production build. A completed CI run at commit `73c530701a678a73f8e053c8598c51bccf7c56b2` passed locked dependency installation, typecheck, all 32 unit tests, and production build. The test suite now covers chat steps, Gmail rules, schedule rules, outbound-address safety, DNS pinning, and executor live-capability gates. Any subsequent code or configuration changes must pass CI again before merge.
- Added DNS resolution of all answers, rejection if any answer is private/special-use, IPv4-mapped IPv6 handling, hostname/IP classification, connection pinning, manual redirect handling, and bounded request/response sizes for outbound HTTP.
- Added regression tests for private IPv4/IPv6, malformed IPv6-like host strings, public hostnames beginning with `fc` / `fd`, mixed public/private DNS answers, and validated-address pinning.
- Protected AI planning with Supabase auth middleware, schema validation, timeout, and a database-enforced per-user quota.
- Added shared server-side step execution for manual saved-flow runs and scheduled runs. Unsupported nodes fail closed instead of being marked as successful practice steps.
- Saved-flow execution now requires ownership and persisted live status. The live toggle is cloud-backed; editing and saving an existing live flow pauses it until a fresh Preview is run.
- Generic metadata-only connector calls no longer claim an app is connected. Gmail uses only the gmail.send scope and stays pending until the user explicitly sends a test email to a recipient they control; direct Gmail and direct HTTP server functions are disabled so they cannot bypass saved-flow/live-status checks.
- Added explicit owner filters to important automation reads/writes and redaction of credential-like fields/text in persisted run details.
- Rewrote README with environment, CI, and scheduler operations guidance; removed the tracked `.env` from this branch and added a placeholder-only `.env.example`.

### Still open before merge / deployment

1. The newest commit must complete CI successfully; the earlier green run does not cover later changes.
2. Runtime execution of the pinned HTTP transport must be verified on the actual deployment runtime. The repository's current build configuration defaults to a Cloudflare target, while the strongest DNS-pinning implementation uses Node's HTTP(S) request APIs. A successful bundle build alone does not prove those APIs work in the deployed runtime. Do not claim outbound HTTP is production-ready until a deployed smoke test passes or the deployment target/egress transport is reconciled.
3. The atomic scheduler lease is now implemented; the durable job queue, queue retries, dead-lettering, idempotency keys, and circuit state remain P2 work.
4. Finish the connector manifest registry and true `verify()` adapters. Gmail gets a real read-only profile check; generic app entries remain unverified, and the chat-webhook path still needs an explicit provider verification/test UX.
5. Add a complete server-side `executeFlow` endpoint so manual, scheduled, and webhook runs share flow traversal, branch handling, run creation, event logs, and idempotency rather than sharing only the per-step executor.
6. Reconcile the credential vault with the plan's future `credentials` table and key-version rotation; current storage intentionally matches the existing `app_user_connections` contract.
7. Run a non-production Supabase migration rehearsal and end-to-end test with a dedicated Gmail account before any production migration or live schedule is enabled.
