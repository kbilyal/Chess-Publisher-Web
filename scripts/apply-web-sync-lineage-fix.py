from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path: Path, old: str, new: str, label: str):
    src = path.read_text(encoding='utf-8')
    count = src.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 anchor, found {count}')
    path.write_text(src.replace(old, new, 1), encoding='utf-8')


def replace_all(path: Path, old: str, new: str, min_count: int, label: str):
    src = path.read_text(encoding='utf-8')
    count = src.count(old)
    if count < min_count:
        raise SystemExit(f'{label}: expected at least {min_count} anchors, found {count}')
    path.write_text(src.replace(old, new), encoding='utf-8')

sync = ROOT / 'src/cloud/onlineCloudSync.ts'
replace_once(sync, 'export const PORTABLE_FINGERPRINT_SCHEMA = 6;', 'export const PORTABLE_FINGERPRINT_SCHEMA = 7;', 'fingerprint schema')
old = '''export function tournamentContentForFingerprint(tournament: Tournament | any) {
  const next: any = sanitizePortableValue(clone(tournament || {}));
  delete next.cloud;
  delete next.savedAt;
  delete next.dgt;
  delete next.uiState;
  delete next.runtimeState;
  if (next.online && typeof next.online === 'object') {
    delete next.online.revision;
    delete next.online.lastPublishedAt;
  }
  if (next.telegram && typeof next.telegram === 'object') {
    delete next.telegram.token;
    delete next.telegram.botToken;
  }
  return next;
}
'''
new = '''const VOLATILE_SYNC_KEYS = new Set([
  'updatedat', 'lastviewedat', 'lastaccess', 'requesttimestamp', 'requesttimestamps',
  'cachetimestamp', 'cachetimestamps', 'generatedat', 'serverprocessingmetadata',
  'processingmetadata', 'browserstate', 'browserdata', 'sessionstate', 'sessiondata'
]);

function stripVolatileSyncMetadata(value: any): any {
  if (Array.isArray(value)) return value.map(stripVolatileSyncMetadata);
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, any> = {};
  for (const [key, item] of Object.entries(value)) {
    if (VOLATILE_SYNC_KEYS.has(key.toLowerCase())) continue;
    out[key] = stripVolatileSyncMetadata(item);
  }
  return out;
}

export function tournamentContentForFingerprint(tournament: Tournament | any) {
  // beta79_reference_projection_v1 — this projection intentionally matches the
  // protected Desktop beta.79 CloudWorkspaceAdapter content hash. Public Hub
  // publication metadata remains transportable, but it is not private tournament
  // content and therefore cannot manufacture a private Cloud conflict.
  const next: any = stripVolatileSyncMetadata(sanitizePortableValue(clone(tournament || {})));
  delete next.cloud;
  delete next.online;
  delete next.hub;
  delete next.publication;
  delete next.savedAt;
  delete next.dgt;
  delete next.uiState;
  delete next.runtimeState;
  if (next.telegram && typeof next.telegram === 'object') {
    delete next.telegram.token;
    delete next.telegram.botToken;
  }
  return next;
}
'''
replace_once(sync, old, new, 'beta79 fingerprint projection')

provider = ROOT / 'src/cloud/OnlineCloudProviderV2.tsx'
replace_once(provider,
'''    let list = cloudTournaments;
    let remote = chooseExistingRemote(tournament, list) || activeRef.current;
    if (remote) return remote;
''',
'''    let list = cloudTournaments;
    // Stable identity only. The currently-open Cloud record is never a fallback
    // for a tournament whose cloudTournamentId/internalId does not match it.
    let remote = chooseExistingRemote(tournament, list);
    if (remote) return remote;
''', 'identity-only cloud link')
replace_all(provider,
'''      const revision = Number(saved?.revision || 1);
      const updated = withBrowserBase(seeded, remote.id, revision, localFingerprint);
''',
'''      const revision = Number(saved?.revision || 1);
      const acceptedFingerprint = text(saved?.contentFingerprint) || localFingerprint;
      const updated = withBrowserBase(seeded, remote.id, revision, acceptedFingerprint);
''', 1, 'initial accepted fingerprint')
replace_once(provider,
'''      const revision = Number(saved?.revision || cloud.revision + 1);
      const updated = withBrowserBase(seeded, remote.id, revision, localFingerprint);
''',
'''      const revision = Number(saved?.revision || cloud.revision + 1);
      const acceptedFingerprint = text(saved?.contentFingerprint) || localFingerprint;
      const updated = withBrowserBase(seeded, remote.id, revision, acceptedFingerprint);
''', 'update accepted fingerprint')
replace_once(provider,
'''      const revision = Number(saved?.revision || 1);
      const updated = withBrowserBase(seeded, remote.id, revision, fingerprint);
''',
'''      const revision = Number(saved?.revision || 1);
      const acceptedFingerprint = text(saved?.contentFingerprint) || fingerprint;
      const updated = withBrowserBase(seeded, remote.id, revision, acceptedFingerprint);
''', 'new tournament accepted fingerprint')

workspace = ROOT / 'src/companion/CompanionWorkspace.tsx'
replace_once(workspace,
'''  resolveConflictWithStrategy: (tournament: Tournament, strategy: 'web' | 'cloud') => Promise<any>;
  publishOnline: (tournament: Tournament) => Promise<void>;
''',
'''  resolveConflictWithStrategy: (tournament: Tournament, strategy: 'web' | 'cloud') => Promise<any>;
  checkStatus: (tournament: Tournament) => Promise<any>;
  publishOnline: (tournament: Tournament) => Promise<void>;
''', 'companion checkStatus type')
old = '''  const syncNow = async () => {
    setBusy('sync');
    setMessage('');
    try {
      await cloud.syncNow(tournamentRef.current);
      adoptSynchronizedTournament();
      setNotice('ok', 'Push complete: Web → Cloud. Desktop can continue from this Cloud revision.');
    } catch (error: any) {
      setNotice('error', error?.message || 'Synchronization failed.');
    } finally {
      setBusy(null);
    }
  };

  const pullDesktopChanges = async () => {
    setBusy('pull');
    setMessage('');
    try {
      const result = await cloud.pullChanges(tournamentRef.current);
      adoptSynchronizedTournament();
      if (result?.kind === 'pulled') setNotice('ok', 'Pull complete: Cloud → Web. The latest Desktop/Cloud revision is now open in Web.');
      else if (result?.kind === 'equal') setNotice('ok', 'No pull needed: Web already matches the current Cloud revision.');
      else if (result?.kind === 'local-only') setNotice('warn', 'Web has local changes that are not in Cloud. Pull did not upload them. Use Push Web → Cloud when ready.');
      else setNotice('warn', 'Both Web and Cloud changed. Nothing was overwritten. Resolve the conflict before Pull, Push or Publish.');
    } catch (error: any) {
      setNotice('error', error?.message || 'Could not check the latest revision.');
    } finally {
      setBusy(null);
    }
  };
'''
new = '''  const unifiedSync = async () => {
    setBusy('sync');
    setMessage('');
    try {
      const current = tournamentRef.current;
      const state = await cloud.checkStatus(current);
      if (state?.kind === 'remote-changes') {
        const result = await cloud.pullChanges(current);
        adoptSynchronizedTournament();
        setNotice(result?.kind === 'pulled' ? 'ok' : 'warn', result?.kind === 'pulled'
          ? `↕ SYNC complete: Cloud-only change pulled at r${state.revision}.`
          : '↕ SYNC stopped safely while checking the Cloud-only change.');
        return;
      }
      if (state?.kind === 'local-changes' || state?.kind === 'no-cloud-snapshot' || state?.kind === 'unlinked') {
        await cloud.syncNow(current);
        adoptSynchronizedTournament();
        setNotice('ok', '↕ SYNC complete: Web-only change pushed to Cloud.');
        return;
      }
      if (state?.kind === 'in-sync') {
        // Read-only equality refresh: provider updates the common revision/base
        // without a PUT. Repeated SYNC is therefore a true no-op.
        await cloud.pullChanges(current);
        adoptSynchronizedTournament();
        setNotice('ok', `↕ SYNC: no changes${state.revision ? ` · common base r${state.revision}` : ''}.`);
        return;
      }
      setNotice('warn', 'Desktop/Cloud and Web both changed after the common base. ↕ SYNC stopped safely; resolve the true conflict below.');
    } catch (error: any) {
      setNotice('error', error?.message || '↕ SYNC failed.');
    } finally {
      setBusy(null);
    }
  };
'''
replace_once(workspace, old, new, 'organizer unified sync logic')
old = '''        <div className="companion-top-actions">
          <button type="button" className="companion-button secondary" onClick={pullDesktopChanges} disabled={busy !== null || cloud.busy} title="Download the current Cloud/Desktop revision into Web. Never uploads Web edits.">
            <RefreshCw size={16} className={busy === 'pull' ? 'spin' : ''} /> {busy === 'pull' ? 'Pulling…' : 'Pull Cloud → Web'}
          </button>
          <button type="button" className="companion-button primary" onClick={syncNow} disabled={busy !== null || cloud.busy || cloud.conflict} title="Upload Web edits to Cloud. Never downloads a newer Cloud revision.">
            <Cloud size={16} /> {busy === 'sync' ? 'Pushing…' : 'Push Web → Cloud'}
          </button>
        </div>
'''
new = '''        <div className="companion-top-actions">
          <button type="button" className="companion-button primary" data-unified-sync="true" onClick={unifiedSync} disabled={busy !== null || cloud.busy} title="Unified safe SYNC: no-op, pull Cloud-only, push Web-only, or stop on a true two-sided conflict.">
            <Cloud size={16} /> {busy === 'sync' ? '↕ SYNC…' : '↕ SYNC'}
          </button>
        </div>
'''
replace_once(workspace, old, new, 'organizer single sync button')

arbiter = ROOT / 'src/arbiter/ArbiterPortal.tsx'
replace_once(arbiter,
'''    if (!pending.length) {
      setMessage('No changed results are waiting to be sent for this round.');
      return;
    }
''',
'''    if (!pending.length) {
      await loadTournament(sessionToken, true).catch(() => undefined);
      setMessage('↕ SYNC complete · no result changes are waiting to be sent.');
      return;
    }
''', 'arbiter no-op sync')
replace_once(arbiter,
'''            <button type="button" className="arbiter-send-all" disabled={busy || finalized || pendingDraftCount === 0} onClick={() => void submitAll()}>
              {busy ? <Loader2 size={15} className="spin" /> : null} Send all results{pendingDraftCount ? ` (${pendingDraftCount})` : ''}
            </button>
''',
'''            <button type="button" className="arbiter-send-all" data-unified-arbiter-sync="true" disabled={busy} onClick={() => void submitAll()} title="Send all changed results with revision protection, or refresh when nothing changed.">
              {busy ? <Loader2 size={15} className="spin" /> : null} ↕ SYNC{pendingDraftCount ? ` (${pendingDraftCount})` : ''}
            </button>
''', 'arbiter unified sync button')
replace_once(arbiter,
'''              <article className="arbiter-board-card" key={key}>
''',
'''              <article className="arbiter-board-card" data-result-missing={currentResult === '-' ? 'true' : 'false'} key={key}>
''', 'arbiter missing marker')
old = '''                    <button type="button" className="arbiter-send" disabled={busy || !drafts[key] || drafts[key] === currentResult} onClick={() => void submit(activeRound, board.board, board.whiteKey, board.blackKey, currentResult)}>
                      {busy ? <Loader2 size={16} className="spin" /> : null}{currentResult !== '-' ? 'Update result' : 'Send result'}
                    </button>
'''
replace_once(arbiter, old, '', 'remove individual arbiter send')
# Result POST now increments the tournament revision; keep bulk sequential sends
# on the new accepted revision without requiring a browser refresh.
replace_once(arbiter,
'''    const sendAtRevision = (baseRevision: number) => arbiterApi.submitResult(sessionToken, {
      round,
      board,
      whiteKey,
      blackKey,
      result,
      baseRevision
    });

    validate(candidateView);
    try {
      await sendAtRevision(candidateView.revision);
      return candidateView;
''',
'''    const sendAtRevision = (baseRevision: number) => arbiterApi.submitResult(sessionToken, {
      round,
      board,
      whiteKey,
      blackKey,
      result,
      baseRevision
    });
    const advanceView = (source: ArbiterTournamentView, response: any) => {
      const revision = Number(response?.revision ?? source.revision);
      const next = JSON.parse(JSON.stringify(source)) as ArbiterTournamentView;
      next.revision = Number.isInteger(revision) && revision >= 0 ? revision : source.revision;
      const matched = matchingBoard(next, round, board, whiteKey, blackKey);
      if (matched) matched.result = result;
      return next;
    };

    validate(candidateView);
    try {
      const response = await sendAtRevision(candidateView.revision);
      return advanceView(candidateView, response);
''', 'arbiter accepted revision')
replace_once(arbiter,
'''      await sendAtRevision(retryView.revision);
      return retryView;
''',
'''      const response = await sendAtRevision(retryView.revision);
      return advanceView(retryView, response);
''', 'arbiter retry accepted revision')

filters = ROOT / 'src/arbiter/installArbiterResultFilters.ts'
replace_once(filters,
'''function isMissingResultCard(card: Element) {
  const sendButton = card.querySelector<HTMLButtonElement>('.arbiter-send');
  if (!sendButton) return false;
  return /send result/i.test(sendButton.textContent || '');
}
''',
'''function isMissingResultCard(card: Element) {
  return card.getAttribute('data-result-missing') === 'true';
}
''', 'missing result filter marker')

print('Applied Web/Organizer/Arbiter unified sync lineage fix.')
