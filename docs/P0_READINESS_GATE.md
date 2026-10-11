# AUTO-STUDIO P0 Readiness Gate

Status: **OPEN — do not start P1 yet**

This checklist is the release gate for P0 execution-integrity hardening. A code commit alone does not mean a gate passed.

## A. Execution and audit consistency

- [x] Report a succeeded queue job that has no linked audit run.
- [x] Report a succeeded queue job whose linked audit run is missing, failed, unfinished, or not succeeded.
- [x] Report a succeeded queue job without its own completion timestamp.
- [x] Report a successful audit run without its own completion timestamp.
- [x] Report non-success queue states linked to a successful audit run.
- [x] Report a running queue job linked to failed, succeeded, cancelled, canceled, timed-out, or abandoned audit runs.
- [x] Add focused regression cases for the added diagnostic conditions.
- [x] Latest full test suite, typecheck, and production build passed on commit `f78cc7fae0e74f08a1c32fd7ec056866da0323ea`; rerun is required after subsequent CI changes.
- [ ] Focused test output and complete test-suite result are recorded against the final P0 head.
- [ ] Typecheck, targeted execution-integrity lint, and production build pass on the final P0 head.
- [ ] Repository-wide lint baseline is remediated separately: the first full-repo run reported 2,683 errors (mostly Prettier formatting plus test-file `@ts-nocheck` violations). Do not mass-format unrelated application files as part of this safety patch.

## B. Execution lifecycle and recovery

- [x] Worker rejects a `succeeded` result unless the executor reports `effect_confirmed`; contradictory or malformed executor results go to `needs_review` rather than false success or automatic replay. Regression tests added.
- [ ] Verify run creation and queue claiming failures leave no false-success state.
- [ ] Verify missing or invalid job-to-run links cannot lead to success.
- [ ] Verify finalization failures remain visible and recoverable.
- [ ] Verify retry attempts are idempotent and do not create conflicting terminal states.
- [ ] Verify interrupted/expired running jobs can be recovered without duplicate side effects.
- [ ] Verify concurrent workers cannot claim the same job beyond the intended lease/locking rules.
- [ ] Verify audit history is append-only where required and diagnostics remain read-only.

## C. Deployment and integrations

- [ ] Confirm migrations apply cleanly to a disposable/staging database.
- [ ] Run integration tests against staging Supabase with non-production test data.
- [ ] Verify secrets are never exposed to client code, logs, or test artifacts.
- [ ] Keep durable queue consumers and outbound message transports disabled until their provider-specific staging checks pass.
- [ ] Confirm CI checks for the final P0 head are green; investigate missing checks rather than interpreting them as success.

## P0 exit rule

P0 is complete only when all applicable A, B, and C gates are evidenced by actual test or staging results, all critical failures are resolved, and the final branch head has green required CI checks. Then review the master plan and explicitly authorize P1.

Do not mark any unchecked item as passed based on code inspection alone.
