# Chess-Publisher Web — Integration Roadmap

The goal is not merely a modern UI; it is a production-capable Web version with full validated functional parity or explicitly approved Web equivalents.

## Completed foundation
- authoritative Gacrux 1.9.57;
- BBP 6.0.0 independent checker;
- desktop/web pairing parity fixtures;
- transaction safety framework;
- FIDE rating database/cache;
- Results Integrity / round finalization lifecycle.

## Ordered remaining work
1. Batch C — FIDE Player Synchronization.
2. Player Registration / Starting List remaining parity.
3. TRF full parity and export-through-round closure.
4. Independent tie-break / standings authoritative parity gate.
5. Chess-Results real backend transmission and full workflow parity.
6. Smart Calendar / Smart Schedule gap closure.
7. Special prizes, print/export and Tournament Hub parity closure.
8. DGT Web/local-bridge implementation or explicitly approved equivalent architecture.
9. Durable production tournament database, authentication/roles, access control, backups/recovery and restart persistence.
10. Full 104-feature re-audit.
11. Clean-checkout production hardening and load/failure testing.
12. RC gate.
13. 100% integration handoff gate.

No later step may be used to hide an unresolved earlier CRITICAL/HIGH defect.