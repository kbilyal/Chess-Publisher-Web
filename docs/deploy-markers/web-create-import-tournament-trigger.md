# Web create/import tournament trigger

Implement New tournament plus one unified TRF16/TRF26/TUNX import action on My tournaments. Every created/imported tournament must receive a fresh private Cloud identity and revision so Chess-Publisher Desktop can open and continue the same tournament.

Feature validation covers importer, private/public Cloud boundaries, Desktop/Web roundtrip, TRF16/TRF26, Chess-Results, FIDE, transactions and build. The authoritative Gacrux/BBP parity check remains the mandatory production deploy gate on the resulting source commit.
