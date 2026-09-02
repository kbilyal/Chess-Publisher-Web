# Chess-Publisher Web — Release Checklist

Use this checklist for every RC and Stable promotion.

## Identity
- [ ] Version chosen and not reused.
- [ ] Parent/base commit and version recorded.
- [ ] Build date recorded.
- [ ] Branch/commit SHA recorded.

## Change scope
- [ ] Exact modified-files list generated.
- [ ] Changelog explains every functional change.
- [ ] No unrelated refactor mixed into the release.
- [ ] Protected areas touched only with documented justification.

## Engine integrity
- [ ] Gacrux expected version/commit verified at runtime/build time.
- [ ] BBP expected version/commit verified.
- [ ] No authoritative route falls back to prototype pairing.
- [ ] Checker unsupported state is never reported as PASS.
- [ ] Pairing acceptance triple gate still enforced.

## Functional regression
- [ ] Static/type/build gate PASS.
- [ ] Architecture/process-safety gate PASS.
- [ ] Desktop/Web pairing parity fixtures PASS.
- [ ] Transaction-safety fixtures PASS.
- [ ] FIDE DB tests PASS when affected/available.
- [ ] Player-sync tests PASS when affected/available.
- [ ] TRF regression fixtures PASS when affected.
- [ ] Tie-break/standings fixtures PASS when affected.
- [ ] Chess-Results tests PASS when affected/available.

## Functional parity
- [ ] No previously PASS feature silently became PARTIAL/MISSING.
- [ ] Feature parity manifest/matrix updated for new/restored capabilities.
- [ ] UI redesign did not remove operational arbiter workflows.

## Data safety
- [ ] Destructive operations have preflight/snapshot/rollback.
- [ ] Database migrations have rollback/backup plan.
- [ ] Active tournament is not silently mutated by background data updates.
- [ ] No secrets/API keys included in repository or artifacts.

## Production safety
- [ ] Production routes contain no mock-success behavior.
- [ ] Audit/debug endpoints are disabled or protected in production.
- [ ] Filesystem paths/internal diagnostics are not exposed publicly.
- [ ] Rate/size/time limits exist for external downloads and engine processes.
- [ ] Offline/failure behavior leaves last valid state usable.

## Documentation
- [ ] PROJECT-STATE.md updated.
- [ ] Protected component versions/hashes updated if changed.
- [ ] Known limitations recorded.
- [ ] Deployment requirements documented.
- [ ] Recovery instructions documented where relevant.

## Packaging / promotion
- [ ] Final artifact(s) built from the documented commit.
- [ ] SHA256 generated for final artifacts.
- [ ] Smoke test performed on target environment.
- [ ] RC remains RC until acceptance criteria pass.
- [ ] Stable promotion is explicit; never automatic.

## Stable-only requirements
- [ ] All critical/high parity gaps required for the intended Stable scope are resolved or explicitly accepted/documented.
- [ ] Real tournament acceptance test completed.
- [ ] Backup/recovery verified.
- [ ] Deployment monitoring/logging verified.
- [ ] Release notes clearly state supported/unsupported capabilities.
