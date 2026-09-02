# Protected Components

These components are protected because they are authoritative, externally pinned, or safety-critical.

## Authoritative pairing
- Gacrux 1.9.57
- Upstream: OttoMilvang/TieBreakServer
- Pinned commit: `14a34a2c2f36509b110e4f25d6247f31fc4bf2f5`
- Official file-based CLI only.
- Do not rewrite algorithm in TypeScript.
- Do not silently fall back to prototype pairing.

## Independent checker
- BBP Pairings 6.0.0
- Upstream: BieremaBoyzProgramming/bbpPairings
- Pinned commit: `16a000f9811de322b0e835d5643198226165b5a9`
- Unsupported features must return unsupported/fail, never PASS.

## Transaction safety
Protected behavior:
- preflight
- validation
- snapshot
- diff/preview where applicable
- explicit confirmation
- mutation
- commit
- rollback on failure

Do not replace protected transactional workflows with direct state mutation.

## TRF semantics
Protect validated semantics for:
- TRF16
- TRF26
- Starting List TRF
- PAB
- requested byes
- forfeits
- unplayed entries
- partial birth dates such as `YYYY/00/00` and `YYYY/MM/00`

Administrative states must never be normalized into fake played-game results.

## FIDE rating data
Authoritative FIDE source only. No mock/sample fallback in production paths.
Rating database refresh must remain separate from active-tournament player synchronization.

## Tie-break core
Current web tie-break implementation is not yet authoritative. It is protected from casual edits while `UNVERIFIED_IMPLEMENTATION` remains. Promotion to authoritative status requires dedicated parity evidence and fixtures.

## Chess-Results
Once real transmission is verified, preserve the validated protocol, TNR lifecycle, create/update/status/unlink/reset behavior, and error handling. Do not substitute mock success paths.

## Protected-change rule
A protected component may be changed only when:
1. a reproducible failing test exists;
2. evidence points to that component rather than an adapter/UI/state bug;
3. the change is minimal and explicitly documented;
4. all old and new regression gates pass;
5. upstream version/commit/license metadata remains correct.
