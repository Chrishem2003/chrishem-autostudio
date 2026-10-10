# Batch P1 — Connector contract hardening

Date: 2026-10-10  
Branch: `audit/p0-hardening`

## Scope delivered

- Connector capability labels distinguish catalog-only, user test-send required, and deployment-gated actions.
- Generated message node matching rejects malformed node IDs.
- Connector configuration validation now rejects unknown keys instead of silently accepting typos or unsupported options.
- HTTP request configuration accepts only GET, POST, PUT, PATCH, or DELETE and a configured timeout between 1 and 30 seconds.
- The chat action contract explicitly permits the legacy `fields` message fallback used by the chat request builder.
- Regression coverage exercises capability labels, malformed node IDs, required settings, unsupported settings, and HTTP method/timeout validation.

## Safety invariants

1. A catalog entry is not evidence of a live executor.
2. OAuth connection alone is not evidence that a provider action works.
3. Webhook URL configuration is not proof of provider-side message delivery.
4. Unknown connector settings must fail closed.
5. Generic outbound HTTP remains disabled unless the deployment runtime smoke-test gate is enabled.
6. CI success does not replace a staging test against the actual configured Supabase project and provider accounts.

## Verification status

- The preceding checkpoint commit `47acea4` passed CI typecheck, unit tests, production build, and the disposable PostgreSQL durable-queue migration/concurrency checks.
- The connector contract changes in `8f5d0d8` and `135486f` have new GitHub Actions runs queued/pending. Do not mark this batch fully verified until those runs finish successfully.
- No live provider messages were sent as part of CI verification.
- The staging Supabase migration chain, protected cron endpoint, and deployed outbound transport still require the documented non-production rollout checks in `docs/durable-queue-staging-runbook.md`.

## Next acceptance gates

- [ ] Latest CI typecheck, unit tests, production build, and database smoke tests all pass.
- [ ] Run the complete migration chain against a dedicated staging Supabase project and inspect the applied migration list.
- [ ] Verify the protected execution-job endpoint rejects missing/invalid cron credentials.
- [ ] Perform controlled test-mode and dry-run checks without external side effects.
- [ ] Verify one user-authorized Gmail test send and one provider-specific webhook smoke test in staging.
- [ ] Verify outbound HTTP SSRF defenses using controlled test hosts and confirm the runtime gate stays disabled by default.
- [ ] Review queue retry/uncertain-outcome behavior before enabling durable live execution.

## Release decision

**Not production-ready yet.** Keep durable queue and outbound transport feature flags disabled until all relevant staging gates pass and the release reviewer records the evidence.
