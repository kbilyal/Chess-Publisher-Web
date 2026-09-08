from pathlib import Path

workspace = Path('src/companion/CompanionWorkspace.tsx')
s = workspace.read_text()
start_marker = "  const publishChessResults = async () => {\n"
end_marker = "\n  const openChessResultsAdmin = async () => {\n"
if s.count(start_marker) != 1 or s.count(end_marker) != 1:
    raise SystemExit('publishChessResults function boundary not found exactly once')
prefix, rest = s.split(start_marker, 1)
body, suffix = rest.split(end_marker, 1)

needle = """      const localBeforeSync = tournamentRef.current;
      const requestedModeBeforeSync = String(localBeforeSync.settings.tournamentType || '').trim().toLowerCase();
      const linkedKeyBeforeSync = String(localBeforeSync.chessResults?.key || localBeforeSync.settings?.tnr || '').trim();
"""
replacement = """      const localBeforeSync = tournamentRef.current;
      const requestedModeBeforeSync = String(localBeforeSync.settings.tournamentType || '').trim().toLowerCase();
      const identityBeforeSync = {
        cloudTournamentId: String((localBeforeSync as any)?.cloud?.cloudTournamentId || '').trim(),
        internalId: String((localBeforeSync as any)?.cloud?.internalId || '').trim(),
        name: String(localBeforeSync.name || '').trim(),
        mode: requestedModeBeforeSync
      };
      const linkedKeyBeforeSync = String(localBeforeSync.chessResults?.key || localBeforeSync.settings?.tnr || '').trim();
"""
if body.count(needle) != 1:
    raise SystemExit(f'identity-before marker count={body.count(needle)}')
body = body.replace(needle, replacement, 1)

needle = """      await cloud.syncNow(tournamentRef.current);
      const current = adoptSynchronizedTournament();
      const initial = buildChessResultsXml(current);
"""
replacement = """      await cloud.syncNow(tournamentRef.current);
      const current = adoptSynchronizedTournament();
      const identityAfterSync = {
        cloudTournamentId: String((current as any)?.cloud?.cloudTournamentId || '').trim(),
        internalId: String((current as any)?.cloud?.internalId || '').trim(),
        name: String(current.name || '').trim(),
        mode: String(current.settings.tournamentType || '').trim().toLowerCase()
      };
      const cloudIdentityChanged = Boolean(identityBeforeSync.cloudTournamentId)
        && identityAfterSync.cloudTournamentId !== identityBeforeSync.cloudTournamentId;
      const internalIdentityChanged = Boolean(identityBeforeSync.internalId)
        && identityAfterSync.internalId !== identityBeforeSync.internalId;
      const tournamentNameChanged = identityAfterSync.name !== identityBeforeSync.name;
      const tournamentModeChanged = identityAfterSync.mode !== identityBeforeSync.mode;
      if (cloudIdentityChanged || internalIdentityChanged || tournamentNameChanged || tournamentModeChanged) {
        throw new Error('Tournament identity changed during Cloud synchronization. No Chess-Results TNR was created. Reopen the intended tournament and publish again.');
      }
      const initial = buildChessResultsXml(current);
"""
if body.count(needle) != 1:
    raise SystemExit(f'identity-after marker count={body.count(needle)}')
body = body.replace(needle, replacement, 1)

needle = """        const created = await chessResultsApi.create({
          tournament: current.name || '',
          federation: initial.federation,
          mode: current.settings.tournamentType,
          clientId
        });
"""
replacement = """        const created = await chessResultsApi.create({
          tournament: identityBeforeSync.name,
          federation: initial.federation,
          mode: identityBeforeSync.mode,
          clientId
        });
"""
if body.count(needle) != 1:
    raise SystemExit(f'create identity marker count={body.count(needle)}')
body = body.replace(needle, replacement, 1)

needle = """        key = String(created?.key || '').trim();
        attemptedKey = key;
        if (!isTnr(key)) throw new Error('Chess-Results returned an invalid TNR.');
"""
replacement = """        key = String(created?.key || '').trim();
        attemptedKey = key;
        if (!isTnr(key)) throw new Error('Chess-Results returned an invalid TNR.');
        const createdMode = String(created?.mode || '').trim().toLowerCase();
        const createdFederation = String(created?.federation || '').trim().toUpperCase();
        if (createdMode && createdMode !== identityBeforeSync.mode) {
          throw new Error('Chess-Results returned a TNR for a different tournament mode. Publication stopped before upload.');
        }
        if (identityBeforeSync.mode === 'test' && createdFederation !== 'XXX') {
          throw new Error('Chess-Results returned a non-test federation for a Test TNR. Publication stopped before upload.');
        }
"""
if body.count(needle) != 1:
    raise SystemExit(f'created verification marker count={body.count(needle)}')
body = body.replace(needle, replacement, 1)

workspace.write_text(prefix + start_marker + body + end_marker + suffix)

actions = Path('src/companion/companionCloudActions.ts')
s = actions.read_text()
needle = """  if (localFingerprint !== remoteFingerprint) {
    throw new Error('Cloud changed or synchronization is still pending. Pull the latest changes before publishing.');
  }
  return local;
}
"""
replacement = """  if (localFingerprint !== remoteFingerprint) {
    // A foreground Sync Now may discover a one-sided newer revision and stop
    // safely instead of overwriting it. Reconcile that case once automatically
    // before asking the user to intervene. True two-sided conflicts still fail closed.
    await smartPullChanges(cloud, local);
    const reconciledLocal: any = readLocalTournament() || local;
    const reconciledRemoteResult = await cloudApi.getSnapshot(token, cloudTournamentId);
    const reconciledRemote = extractPrivateTournament(
      reconciledRemoteResult?.snapshot,
      reconciledRemoteResult?.tournament?.name || tournamentName(reconciledLocal)
    ).tournament;
    const [reconciledLocalFingerprint, reconciledRemoteFingerprint] = await Promise.all([
      fingerprintTournament(reconciledLocal),
      fingerprintTournament(reconciledRemote)
    ]);
    if (reconciledLocalFingerprint !== reconciledRemoteFingerprint) {
      throw new Error('Cloud and Web both changed this tournament. Resolve the synchronization conflict before publishing.');
    }
    return reconciledLocal;
  }
  return local;
}
"""
if s.count(needle) != 1:
    raise SystemExit(f'sync confirmation marker count={s.count(needle)}')
s = s.replace(needle, replacement, 1)
actions.write_text(s)

test = Path('src/cloud/tests/runCompanionChessResultsTransportTests.ts')
s = test.read_text()
marker = """assert.match(workspaceSource, /identityBeforeSync = \\{[\\s\\S]*cloudTournamentId[\\s\\S]*internalId[\\s\\S]*name[\\s\\S]*mode:/, 'Publish must capture the intended tournament identity before Cloud synchronization.');
assert.match(workspaceSource, /Tournament identity changed during Cloud synchronization\\. No Chess-Results TNR was created\\./, 'Publish must fail before GETKEY when Cloud synchronization changes tournament identity.');
assert.match(workspaceSource, /tournament: identityBeforeSync\\.name/, 'GETKEY must use the pre-confirmed tournament name, not a post-sync replacement object.');
assert.match(workspaceSource, /mode: identityBeforeSync\\.mode/, 'GETKEY must use the pre-confirmed tournament mode.');
const companionCloudActionsSource = readFileSync(resolve(process.cwd(), 'src/companion/companionCloudActions.ts'), 'utf8');
assert.match(companionCloudActionsSource, /await smartPullChanges\\(cloud, local\\);/, 'Confirmed sync must automatically reconcile a one-sided remote revision once before blocking publish.');
assert.match(companionCloudActionsSource, /Cloud and Web both changed this tournament\\. Resolve the synchronization conflict before publishing\\./, 'True two-sided conflicts must still fail closed.');

"""
insert_before = "console.log('PASS Companion Chess-Results transport:"
if marker not in s:
    if insert_before not in s:
        raise SystemExit('transport test console marker missing')
    s = s.replace(insert_before, marker + insert_before, 1)
test.write_text(s)
