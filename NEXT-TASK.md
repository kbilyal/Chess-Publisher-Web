# Next Task — TRF Full Parity (Integration Gate G)

Gate K (Player Registration & Starting List Parity) is closed and verified with 12/12 dedicated regression tests passing (`npm run test:player-parity`) and full UI integration in `PlayersTab.tsx` and `RequestedByesModal.tsx`.

Most recent accepted batch: beta.7 Web Start Page + Simplified Online & Cloud tab + Always-Synced Tournament List. Production Pages deployment and artifact checks pass; authenticated Organizer Token behavior remains a manual acceptance step with real credentials. This does not change the next roadmap task below.

The next roadmap item is **Integration Gate G: TRF Full Parity**.

## Objective
Close the functional parity and compliance gaps for Tournament Report File (TRF) generation, validation, export, and import against FIDE TRF16 and TRF26 standards and Chess-Publisher v1.05.00 Stable desktop baseline.

## Target Areas
1. **TRF Format Dual-Standard Support (TRF16 & TRF26)**:
   - Full TRF16 (1998/2004 80-column standard) specification export.
   - Full TRF26 (2020+ modern 130-column standard) specification export.
   - Starting List TRF export mode (Round 0 / Initial Roster).

2. **Export-through-round (Intermediate Export)**:
   - Ability to export TRF through an arbitrary completed round `R` (e.g. Round 1, Round 2, ... N), correctly calculating scores, results, and opponents up to round `R` only.

3. **FIDE TRF Data Semantics & Encoding**:
   - Forfeits: `1F-0F` encoded as `+` for winner, `-` for loser.
   - Pairing Allocated Bye (PAB): encoded as `U` or pairing-allocated bye code.
   - Requested Half-Point Bye: encoded as `H`.
   - Requested Zero-Point Bye: encoded as `Z`.
   - Partial Birth Dates: FIDE standard `YYYY/00/00` or `YYYY/MM/00` when exact date is unknown.
   - Club, Federation, FIDE ID, National ID, and FIDE title strict column positioning.

4. **Strict TRF Import Validation & Conflict Resolution**:
   - TRF line validator checking column alignment, field lengths, and record types (012 header, 001 player lines, 132/134/142 config).
   - Detection of conflicts (rating discrepancy, player count mismatch, pairing inconsistencies) during import with transaction preview/rollback.

5. **Regression Verification**:
   - Dedicated test suite `npm run test:trf` verifying all export modes, round limits, character alignments, bye encodings, and import idempotency.

## Invariants
- TRF outputs must be verified by `bbpPairings --check` and standard FIDE TRF parsers.
- No truncated or misaligned columns in exported files.
- Export-through-round `R` must never leak pairings or results from rounds `> R`.
