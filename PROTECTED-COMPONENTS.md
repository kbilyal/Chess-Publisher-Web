# Protected Components

These components and behaviors are release-critical. They must not be rewritten, simplified, silently replaced or upgraded without a reproducible defect, explicit justification and dedicated regression fixtures.

## 1. Authoritative Swiss Dutch pairing
- Engine: Gacrux 1.9.57.
- Keep the upstream implementation pinned.
- Do not modify upstream pairing rules.
- Do not replace with generated TypeScript/JavaScript logic.
- Do not silently upgrade engine version.

## 2. Independent pairing verification
- Checker: BBP Pairings 6.0.0.
- Keep version/source pinned.
- Unsupported checker capabilities must return UNSUPPORTED, never PASS.
- A checker must not be replaced by a copy of the same algorithm it is checking.

## 3. Pairing acceptance contract
A pairing must not become official unless all required conditions pass:
1. authoritative engine execution succeeded;
2. independent checker returned PASS;
3. arbiter explicitly accepted the preview.

No automatic commit. No silent fallback.

## 4. TRF16 / TRF26
Protect:
- fixed-column positions;
- FIDE IDs;
- pairing numbers;
- ratings/titles/federations;
- partial birth values;
- colors/results;
- forfeits;
- PAB/requested bye/unplayed distinctions;
- export-through-round semantics;
- import conflict handling.

Never reinterpret unknown or incomplete TRF data as forfeits.

## 5. Tie-breaks
Do not rewrite formulas during UI work. Any formula change requires:
- exact FIDE reference/specification;
- deterministic unit fixtures;
- independent checker/comparison where available;
- real tournament regression cases.

## 6. Transactional tournament operations
Protected operations include:
- Resort Starting List;
- Reset Tournament;
- TRF Import;
- Accept Pairing;
- future Publish/Sync operations.

Required safety pattern:
PRE-FLIGHT -> VALIDATE -> SNAPSHOT -> PREVIEW/DIFF -> CONFIRM -> COMMIT; rollback on failure.

## 7. FIDE rating database and player synchronization
Once implemented:
- database update must never silently mutate active tournament players;
- player sync must show exact field changes and require confirmation;
- Standard/Rapid/Blitz ratings remain distinct;
- partial birth data must not be fabricated.

## 8. Chess-Results
Once real server transmission is integrated:
- preserve request/response contract;
- preserve tournament binding/TNR safety;
- no silent ID reassignment;
- no async continuation against the wrong active tournament.

## Change approval template
Any change to a protected area must document:
- reproducible defect/gap;
- impacted files;
- why current behavior is wrong;
- minimal proposed change;
- fixtures added;
- before/after behavior;
- regression commands and results;
- rollback plan.