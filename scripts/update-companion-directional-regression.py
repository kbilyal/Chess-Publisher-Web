from pathlib import Path
p = Path('src/cloud/tests/runCompanionChessResultsTransportTests.ts')
s = p.read_text()
old = '''const companionCloudActionsSource = readFileSync(resolve(process.cwd(), 'src/companion/companionCloudActions.ts'), 'utf8');
assert.match(companionCloudActionsSource, /await smartPullChanges\\(cloud, local\\);/, 'Confirmed sync must automatically reconcile a one-sided remote revision once before blocking publish.');
assert.match(companionCloudActionsSource, /Cloud and Web both changed this tournament\\. Resolve the synchronization conflict before publishing\\./, 'True two-sided conflicts must still fail closed.');'''
new = '''const companionCloudActionsSource = readFileSync(resolve(process.cwd(), 'src/companion/companionCloudActions.ts'), 'utf8');
assert.match(companionCloudActionsSource, /async function pullChangesOnly/, 'Companion must expose a true Cloud-to-Web pull-only path.');
assert.match(companionCloudActionsSource, /A Pull command must never upload Web changes\./, 'Pull must never reverse direction into a Push.');
assert.match(companionCloudActionsSource, /Push is strictly Web -> Cloud\./, 'Confirmed Push must never perform an implicit Pull or merge.');
assert.match(companionCloudActionsSource, /Cloud has newer Desktop changes or a synchronization conflict\. Pull Cloud → Web before pushing or publishing\./, 'Push must fail closed when Cloud is newer.');
assert.match(companionCloudActionsSource, /resolveConflict: \(tournament: Tournament\) => smartPullChanges/, 'Three-way merge must be exposed only as an explicit conflict-resolution action.');'''
if s.count(old) != 1:
    raise SystemExit(f'old directional regression block count={s.count(old)}')
s = s.replace(old, new, 1)
p.write_text(s)
