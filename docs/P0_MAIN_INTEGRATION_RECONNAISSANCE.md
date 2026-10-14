# P0 branch-to-main integration reconnaissance

**Status: REVIEW REQUIRED — no merge or deployment authorized.**

## Snapshot

- Comparison: `main` versus `audit/p0-hardening`
- Comparison result: diverged
- Branch comparison reports 884 commits ahead, 157 behind, and 132 changed files.
- The durable queue / P0 changes must not be integrated by a blind merge or by copying the entire branch history into `main`.

These figures are a point-in-time GitHub comparison and must be refreshed immediately before any integration attempt.

## Direct file checks

| Path | On `main` | On `audit/p0-hardening` | Integration note |
| --- | --- | --- | --- |
| `src/lib/execution-job-policy.ts` | Present | Present | Contents differ materially; review retry-policy behavior and tests together. |
| `src/lib/execution-job-worker.ts` | Present | Present | Contents differ materially; review lease checks, runtime input validation, finalization uncertainty, and executor side-effect certainty. |
| `src/lib/execution-queue-health.ts` | Not found at checked path | Present | Confirm intended target location and consumers before integration. |
| `docs/P0_READINESS_GATE.md` | Not found at checked path | Present | Preserve the release gate as a review artifact; do not assume `main` has an equivalent. |
| `.github/workflows/ci.yml` | Present | Present | Contents differ materially; reconcile workflow triggers, required checks, lint disposition, and disposable database smoke tests. |

## Safe integration sequence

1. Refresh branch comparison and inspect the complete changed-file list and commit graph.
2. Identify the intended product baseline on `main`; determine which of the 132 changed files are P0 prerequisites, unrelated feature work, or historical divergence.
3. Create a clean integration branch from the current `main` head. Do not reset or force-push either existing branch.
4. Port only the reviewed P0 file set and required migrations in dependency order. Resolve policy, worker, CI, and migration conflicts explicitly.
5. Run the full exact-head CI suite and verify the migration smoke test against the clean integration branch.
6. Obtain independent review, then run the dedicated non-production staging acceptance checklist.
7. Merge only after the release gate is satisfied and the integration diff is demonstrably scoped.

## Explicit non-goals

- No merge, rebase, force-push, deployment, or production queue activation was performed as part of this reconnaissance.
- A green CI run on `audit/p0-hardening` does not validate a separately constructed integration branch.
- P0 remains open; P1 is not authorized.
