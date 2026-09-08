from pathlib import Path

p = Path('src/cloud/publicHubSnapshot.ts')
s = p.read_text()
old_results = "const BYE_RESULTS = new Set(['PAB', '½ BYE', '1/2 BYE', '0 BYE']);"
new_results = "const BYE_RESULTS = new Set(['PAB', '1 BYE', '½ BYE', '1/2 BYE', '0 BYE']);"
if old_results in s:
    s = s.replace(old_results, new_results, 1)
elif new_results not in s:
    raise SystemExit('Public Hub bye result marker missing')

old_key = "        blackKey: nullableText(pairing?.blackKey),"
new_key = "        blackKey: isByeResult(pairing?.result) || text(pairing?.blackKey).toLowerCase() === 'bye' ? null : nullableText(pairing?.blackKey),"
if old_key in s:
    s = s.replace(old_key, new_key, 1)
elif new_key not in s:
    raise SystemExit('Public Hub blackKey normalization marker missing')
p.write_text(s)

# Strengthen the new import regression: a private bye sentinel must never become
# a pseudo-player in the public Hub snapshot.
t = Path('src/cloud/tests/runTournamentCreateImportTests.ts')
ts = t.read_text()
marker = "const publicSnapshot = buildPublicHubSnapshot(importedTunx.tournament);\n"
assertion = "assert.equal(publicSnapshot.rounds[0]?.pairings[0]?.blackKey, null, 'Hub bye pairing must not expose a pseudo-player key.');\n"
if assertion not in ts:
    if marker not in ts:
        raise SystemExit('Tournament import public snapshot marker missing')
    ts = ts.replace(marker, marker + assertion, 1)
t.write_text(ts)
