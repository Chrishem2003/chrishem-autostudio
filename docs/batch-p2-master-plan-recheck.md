# AutoStudio master-plan recheck — build batch P2

Review date: 2026-10-11  
Repository: `Chrishem2003/chrishem-autostudio`  
Working branch: `audit/p0-hardening`  
Plan reference: `docs/master-plan-progress-review.md`

## Direction check

**The implementation is still aligned with the master plan's reliability-first order.** The branch is hardening the execution foundation before expanding provider coverage or enabling live transport. The plan is not complete, and this checkpoint must not be presented as production-ready.

## Latest checkpoint and corrective action

- The exact commit `c9c3b231` passed both GitHub Actions jobs: typecheck/unit tests/production build and the durable queue migration smoke test.
- The run exposed a regression-test failure in the HTTP timeout validator: the numeric pattern was escaped incorrectly and rejected valid numeric timeout strings.
- The regex was corrected in `src/lib/connector-manifests.ts`.
- Additional boundary cases were added for normalized HTTP methods, minimum and maximum timeout values, fractional timeouts, and rejection of exponent notation. These tests await the current exact-head CI result.

## Master-plan crosswalk

| Priority | Status | Current boundary / next gate |
|---|---|---|
| P0 security and execution foundation | Code implemented; exact-head CI required | Keep SSRF, ownership, lease fencing, redaction, and rollout gates fail-closed. Run deployment-specific checks in staging. |
| P1 connector truthfulness | Partial | The reviewed runtime manifest covers Gmail, chat webhooks, and HTTP; catalog entries without executors remain catalog-only. Add providers only with reviewed adapters and contract tests. |
| P1 AI gateway and flow drafting | Incomplete | Provider-agnostic gateway, complete structured drafting/refinement, and missing-input clarification remain future work. |
| P2 queue and triggers | Foundation implemented; staging unverified | Manual/scheduled producers and durable worker paths exist. Validate auth, migration chain, duplicate enqueue, interrupted work, and real provider outcomes in staging. |
| P2 data mapping | Linear-chain implementation integrated; broader graph semantics incomplete | Explicit allowlisted scalar outputs can map into reviewed content fields. Branches, parallel execution, arbitrary response bodies, and unsafe dynamic destinations remain unsupported. |
| P3 connector drafting | Incomplete | AI-generated connectors must remain test-only until reviewed and approved. |
| P4 industry packs | Partial | Compare actual executable capability—not catalog count—against the planned industry packs. |
| P5 builder UX/accessibility | Not yet measured | Run keyboard, WCAG AA, 375px overflow, and first-automation usability checks. |
| P6 teams/approvals | Incomplete | Implement workspace roles, invitations, shared connections, approval-to-go-live, comments, and authorization tests. |
| P7 analytics/API | Partial | Complete run search/timeline, safe replay, version diff/restore, scoped API keys, quotas, provider health, and retention controls. |
| P8 differentiators | Future | Autopilot, Watch Mode, rewind simulation, approve/undo, multilingual/voice input, and connector drafting. |

## Build order for the next fast batches

1. Keep the exact-head CI green and repair failures before stacking more code.
2. Finish route-boundary negative-path coverage for malformed persisted workflows and invalid mapping contracts before enqueue or intent creation.
3. Review durable queue interruption/recovery and idempotency behavior, retaining manual review for uncertain side effects.
4. Add connector providers only after a complete manifest, executor, output contract, safe configuration validation, and tests exist.
5. Rehearse the full migration chain and protected worker in staging with external effects disabled first.
6. Measure UX/accessibility against the master plan, then advance to the AI gateway, teams/approvals, and observability milestones.

## Non-negotiable release gates

- `AUTOSTUDIO_DURABLE_QUEUE_ENABLED` stays false until the target staging environment has passed the documented rehearsal.
- `AUTOSTUDIO_OUTBOUND_TRANSPORT_READY` stays false until actual deployment runtime and SSRF behavior are verified.
- No production provider actions or real customer destinations are used for tests.
- A green GitHub run proves repository checks and disposable PostgreSQL behavior only; it does not prove the staging deployment or provider integrations work.
- Do not merge this hardening branch into `main` or declare production readiness solely to accelerate the roadmap.

## Current decision

**Continue building in batches, with CI and safety gates as part of each batch.** The next milestone is route-boundary validation and execution recovery—not broadening the integration catalog before the runtime contracts are proven.
