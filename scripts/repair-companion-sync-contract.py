from pathlib import Path
import re

# 1) Preserve Desktop tournament name and all portable fields through private Cloud snapshots.
p = Path('src/cloud/onlineCloudSync.ts')
s = p.read_text()
old = '''export function buildPrivateSnapshot(name: string, tournament: Tournament | any) {
  const clean = stripForPrivateCloud(tournament);
  const internalId = chooseInternalTournamentId(clean);
  return {
    version: 'V99',
    data: {
      currentTournament: name,
      tournaments: { [name]: clean },
      preferences: {}
    },
    telegramGlobal: {},
    currentTournament: name,
    preferences: {},
    cloudWorkspace: {
      schemaVersion: 4,
      scope: 'single-tournament',
      private: true,
      internalId,
      clientVersion: 'chess-publisher-web-online-cloud-beta5'
    }
  };
}

export function extractPrivateTournament(snapshot: any, fallbackName = '') {
  const name = text(snapshot?.data?.currentTournament || snapshot?.currentTournament || fallbackName);
  const tournaments = snapshot?.data?.tournaments;
  const tournament = name && tournaments && typeof tournaments === 'object' ? tournaments[name] : null;
  if (!name || !tournament) {
    throw new Error('Cloud snapshot does not contain a Chess-Publisher tournament object.');
  }
  return { name, tournament: clone(tournament) as Tournament };
}'''
new = '''export function buildPrivateSnapshot(name: string, tournament: Tournament | any) {
  const clean: any = stripForPrivateCloud(tournament);
  const snapshotName = text(name || clean?.name || clean?.settings?.eventName || 'Tournament') || 'Tournament';
  // Desktop historically stores the tournament name primarily as currentTournament
  // + the tournaments map key. Persist it inside the portable object as well so
  // Desktop -> Web -> Desktop roundtrips cannot lose the visible tournament name.
  clean.name = snapshotName;
  const internalId = chooseInternalTournamentId(clean);
  return {
    version: 'V99',
    data: {
      currentTournament: snapshotName,
      tournaments: { [snapshotName]: clean },
      preferences: {}
    },
    telegramGlobal: {},
    currentTournament: snapshotName,
    preferences: {},
    cloudWorkspace: {
      schemaVersion: 4,
      scope: 'single-tournament',
      private: true,
      internalId,
      clientVersion: 'chess-publisher-web-online-cloud-beta5'
    }
  };
}

export function extractPrivateTournament(snapshot: any, fallbackName = '') {
  const tournaments = snapshot?.data?.tournaments;
  const keys = tournaments && typeof tournaments === 'object' ? Object.keys(tournaments) : [];
  const requestedName = text(snapshot?.data?.currentTournament || snapshot?.currentTournament || fallbackName);
  const name = requestedName && tournaments?.[requestedName]
    ? requestedName
    : (keys[0] || requestedName || text(fallbackName));
  const tournament = name && tournaments && typeof tournaments === 'object' ? tournaments[name] : null;
  if (!name || !tournament) {
    throw new Error('Cloud snapshot does not contain a Chess-Publisher tournament object.');
  }
  const hydrated: any = clone(tournament);
  // Legacy Desktop snapshots can omit tournament.name because the map key is
  // authoritative there. Hydrate it for the Web UI without changing any other data.
  if (!text(hydrated.name)) hydrated.name = name;
  return { name, tournament: hydrated as Tournament };
}'''
if s.count(old) != 1:
    raise SystemExit(f'onlineCloudSync snapshot block count={s.count(old)}')
s = s.replace(old, new, 1)
p.write_text(s)

# 2) Tournament name must never silently become the organizer.
p = Path('src/companion/CompanionSetup.tsx')
s = p.read_text()
old = '''  const updateName = (name: string) => {
    onUpdateTournament(previous => ({
      ...previous,
      name,
      settings: { ...previous.settings, organizer: previous.settings.organizer || name }
    }));
  };'''
new = '''  const updateName = (name: string) => {
    onUpdateTournament(previous => ({
      ...previous,
      name
    }));
  };'''
if s.count(old) != 1:
    raise SystemExit(f'CompanionSetup updateName count={s.count(old)}')
s = s.replace(old, new, 1)
s = s.replace(
  'Every edit is written to the same private tournament object and picked up by the existing Desktop ↔ Web Cloud synchronization.',
  'Edits are saved locally immediately. Cloud autosync is push-only; Pull Cloud → Web is always explicit and never overwrites Web changes silently.'
)
p.write_text(s)

# 3) Add safe display sorting in the Web roster without renumbering players.
p = Path('src/companion/CompanionRegistration.tsx')
s = p.read_text()
s = s.replace(
  "import { Check, Loader2, Search, Trash2, UserPlus, Users, X } from 'lucide-react';",
  "import { ArrowUpDown, Check, Loader2, Search, Trash2, UserPlus, Users, X } from 'lucide-react';"
)
needle = "  const [listQuery, setListQuery] = useState('');\n"
if s.count(needle) != 1:
    raise SystemExit(f'listQuery marker count={s.count(needle)}')
s = s.replace(needle, needle + "  const [sortMode, setSortMode] = useState<'starting' | 'rating' | 'name'>('starting');\n", 1)
old = '''  const filteredPlayers = useMemo(() => {
    const q = listQuery.trim().toLowerCase();
    if (!q) return [...players].sort((a, b) => a.pairingNumber - b.pairingNumber);
    return [...players]
      .filter(player => [player.name, player.fideId, player.fed, player.club].some(value => String(value || '').toLowerCase().includes(q)))
      .sort((a, b) => a.pairingNumber - b.pairingNumber);
  }, [players, listQuery]);'''
new = '''  const filteredPlayers = useMemo(() => {
    const q = listQuery.trim().toLowerCase();
    const visible = [...players].filter(player =>
      !q || [player.name, player.fideId, player.fed, player.club]
        .some(value => String(value || '').toLowerCase().includes(q))
    );
    return visible.sort((a, b) => {
      if (sortMode === 'rating') {
        if (Number(b.rating || 0) !== Number(a.rating || 0)) return Number(b.rating || 0) - Number(a.rating || 0);
        const byName = String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
        return byName || a.pairingNumber - b.pairingNumber;
      }
      if (sortMode === 'name') {
        const byName = String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
        if (byName) return byName;
        if (Number(b.rating || 0) !== Number(a.rating || 0)) return Number(b.rating || 0) - Number(a.rating || 0);
        return a.pairingNumber - b.pairingNumber;
      }
      return a.pairingNumber - b.pairingNumber;
    });
  }, [players, listQuery, sortMode]);'''
if s.count(old) != 1:
    raise SystemExit(f'filteredPlayers block count={s.count(old)}')
s = s.replace(old, new, 1)
old = '''        <label className="companion-searchbox small"><Search size={16} /><input value={listQuery} onChange={event => setListQuery(event.target.value)} placeholder="Filter registered players" /></label>

        <div className="companion-roster-list">'''
new = '''        <div className="companion-roster-toolbar">
          <label className="companion-searchbox small"><Search size={16} /><input value={listQuery} onChange={event => setListQuery(event.target.value)} placeholder="Filter registered players" /></label>
          <label className="companion-sort-control">
            <ArrowUpDown size={15} />
            <span>Sort view</span>
            <select value={sortMode} onChange={event => setSortMode(event.target.value as 'starting' | 'rating' | 'name')}>
              <option value="starting">Starting #</option>
              <option value="rating">Rating ↓</option>
              <option value="name">Name A–Z</option>
            </select>
          </label>
        </div>
        <div className="companion-sort-note">View only — sorting never changes official starting numbers or pairing numbers.</div>

        <div className="companion-roster-list">'''
if s.count(old) != 1:
    raise SystemExit(f'roster toolbar marker count={s.count(old)}')
s = s.replace(old, new, 1)
p.write_text(s)

p = Path('src/companion-registration.css')
s = p.read_text()
marker = '''.companion-searchbox.small { min-height: 40px; margin-bottom: 10px; }
.companion-searchbox.small input { height: 38px; font-size: 11px; }
'''
addition = '''.companion-searchbox.small { min-height: 40px; margin-bottom: 0; }
.companion-searchbox.small input { height: 38px; font-size: 11px; }
.companion-roster-toolbar { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 9px; align-items: center; margin-bottom: 5px; }
.companion-sort-control { min-height: 40px; padding: 0 10px; display: flex; align-items: center; gap: 7px; border: 1px solid #d6e0eb; border-radius: 10px; background: #f9fbfd; color: #617086; }
.companion-sort-control > span { font-size: 8.5px; font-weight: 800; text-transform: uppercase; white-space: nowrap; }
.companion-sort-control select { min-height: 30px; border: 0; outline: 0; background: transparent; color: #253650; font-size: 10px; font-weight: 800; }
.companion-sort-note { margin: 0 0 8px; color: #7c899a; font-size: 8.5px; }
'''
if s.count(marker) != 1:
    raise SystemExit(f'registration css marker count={s.count(marker)}')
s = s.replace(marker, addition, 1)
mobile = '''  .companion-registration-heading h2 { font-size: 15px; }
  .companion-registration-heading p { font-size: 9px; }
  .companion-searchbox { min-height: 48px; }
'''
mobile_new = '''  .companion-registration-heading h2 { font-size: 15px; }
  .companion-registration-heading p { font-size: 9px; }
  .companion-roster-toolbar { grid-template-columns: 1fr; }
  .companion-sort-control { min-height: 44px; justify-content: space-between; }
  .companion-sort-control select { font-size: 14px; }
  .companion-searchbox { min-height: 48px; }
'''
if s.count(mobile) != 1:
    raise SystemExit(f'registration css mobile marker count={s.count(mobile)}')
s = s.replace(mobile, mobile_new, 1)
p.write_text(s)

# 4) Make Pull and Push truly directional in the Companion facade.
p = Path('src/companion/companionCloudActions.ts')
s = p.read_text()
s = s.replace(
'''  buildPrivateSnapshot,
  chooseInternalTournamentId,
  extractPrivateTournament,
  fingerprintTournament,''',
'''  buildPrivateSnapshot,
  chooseInternalTournamentId,
  classifyThreeWay,
  extractPrivateTournament,
  fingerprintTournament,'''
)
# Insert a true pull-only function before smartPullChanges.
marker = '''export function mergeCompanionTournamentChanges(
  baseTournament: Tournament,
  localTournament: Tournament,
  remoteTournament: Tournament
): MergeResult {'''
idx = s.find('async function smartPullChanges')
if idx < 0:
    raise SystemExit('smartPullChanges marker missing')
pull_fn = '''async function pullChangesOnly(cloud: any, tournament: Tournament) {
  const local: any = readLocalTournament() || tournament;
  const token = text(cloud?.token);
  const remoteId = text(local?.cloud?.cloudTournamentId || cloud?.activeCloud?.id);
  if (!token || !remoteId) throw new Error('Cloud tournament is not linked.');

  const remoteResult = await cloudApi.getSnapshot(token, remoteId);
  const remote = extractPrivateTournament(remoteResult?.snapshot, remoteResult?.tournament?.name || tournamentName(local)).tournament;
  const revision = Number(remoteResult?.tournament?.revision || cloud?.activeCloud?.revision || 0);
  const [localFingerprint, remoteFingerprint] = await Promise.all([
    fingerprintTournament(local),
    fingerprintTournament(remote)
  ]);

  if (localFingerprint === remoteFingerprint) {
    // Re-enter the provider only after equality is proven; this refreshes its
    // revision metadata and cannot upload local content.
    await cloud.pullChanges(local);
    return { kind: 'equal', revision };
  }

  let baseFingerprint = text(local?.cloud?.baseFingerprint);
  const baseRevision = Number(local?.cloud?.baseRevision || 0);
  if (!baseFingerprint && baseRevision > 0) {
    try {
      const historical = await cloudApi.getRevisionSnapshot(token, remoteId, baseRevision);
      const base = extractPrivateTournament(historical?.snapshot, tournamentName(local)).tournament;
      baseFingerprint = await fingerprintTournament(base);
    } catch {
      baseFingerprint = '';
    }
  }

  if (!baseFingerprint) {
    // Unknown common base: let the provider set its fail-closed conflict state.
    await cloud.pullChanges(local);
    return { kind: 'conflict', revision };
  }

  const decision = classifyThreeWay(localFingerprint, baseFingerprint, remoteFingerprint);
  if (decision === 'cloud-only') {
    await cloud.pullChanges(local);
    return { kind: 'pulled', revision };
  }
  if (decision === 'local-only') {
    // A Pull command must never upload Web changes.
    return { kind: 'local-only', revision };
  }
  if (decision === 'equal') {
    await cloud.pullChanges(local);
    return { kind: 'equal', revision };
  }

  // True two-sided conflict: provider marks the conflict and preserves both copies.
  await cloud.pullChanges(local);
  return { kind: 'conflict', revision };
}

'''
s = s[:idx] + pull_fn + s[idx:]
old = '''  if (localFingerprint !== remoteFingerprint) {
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
  return local;'''
new = '''  if (localFingerprint !== remoteFingerprint) {
    // Push is strictly Web -> Cloud. It never downloads or merges a newer
    // remote revision behind the user's back.
    throw new Error('Cloud has newer Desktop changes or a synchronization conflict. Pull Cloud → Web before pushing or publishing.');
  }
  return local;'''
if s.count(old) != 1:
    raise SystemExit(f'syncNowConfirmed reconciliation block count={s.count(old)}')
s = s.replace(old, new, 1)
old = '''    syncNow: (tournament: Tournament) => syncNowConfirmed(cloud, tournament),
    pullChanges: (tournament: Tournament) => smartPullChanges(cloud, tournament),
    publishOnline: (tournament: Tournament) => publishOnlineWithRecovery(cloud, tournament),'''
new = '''    syncNow: (tournament: Tournament) => syncNowConfirmed(cloud, tournament),
    pullChanges: (tournament: Tournament) => pullChangesOnly(cloud, tournament),
    resolveConflict: (tournament: Tournament) => smartPullChanges(cloud, tournament),
    publishOnline: (tournament: Tournament) => publishOnlineWithRecovery(cloud, tournament),'''
if s.count(old) != 1:
    raise SystemExit(f'facade mapping count={s.count(old)}')
s = s.replace(old, new, 1)
p.write_text(s)

# 5) Make the Web UI explicit about direction and remove silent focus pulls / hidden leave pushes.
p = Path('src/companion/CompanionWorkspace.tsx')
s = p.read_text()
s = s.replace(
'''  syncNow: (tournament: Tournament) => Promise<void>;
  pullChanges: (tournament: Tournament) => Promise<void>;
  publishOnline:''',
'''  syncNow: (tournament: Tournament) => Promise<void>;
  pullChanges: (tournament: Tournament) => Promise<any>;
  resolveConflict: (tournament: Tournament) => Promise<any>;
  publishOnline:'''
)
focus = '''  useEffect(() => {
    const onFocus = () => {
      if (cloud.busy || cloud.conflict || cloud.cloudDirty) return;
      void cloud.pullChanges(tournamentRef.current);
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [cloud]);

'''
if s.count(focus) != 1:
    raise SystemExit(f'focus pull block count={s.count(focus)}')
s = s.replace(focus, '', 1)
old = '''      await cloud.syncNow(tournamentRef.current);
      adoptSynchronizedTournament();
      setNotice('ok', 'Tournament synchronized with the desktop/cloud workspace.');'''
new = '''      await cloud.syncNow(tournamentRef.current);
      adoptSynchronizedTournament();
      setNotice('ok', 'Push complete: Web → Cloud. Desktop can continue from this Cloud revision.');'''
if s.count(old) < 1:
    raise SystemExit('sync notice block missing')
s = s.replace(old, new, 1)
old = '''      await cloud.pullChanges(tournamentRef.current);
      adoptSynchronizedTournament();
      setNotice('ok', 'Desktop and Web revisions checked. Non-overlapping changes were merged safely when possible.');'''
new = '''      const result = await cloud.pullChanges(tournamentRef.current);
      adoptSynchronizedTournament();
      if (result?.kind === 'pulled') setNotice('ok', 'Pull complete: Cloud → Web. The latest Desktop/Cloud revision is now open in Web.');
      else if (result?.kind === 'equal') setNotice('ok', 'No pull needed: Web already matches the current Cloud revision.');
      else if (result?.kind === 'local-only') setNotice('warn', 'Web has local changes that are not in Cloud. Pull did not upload them. Use Push Web → Cloud when ready.');
      else setNotice('warn', 'Both Web and Cloud changed. Nothing was overwritten. Resolve the conflict before Pull, Push or Publish.');'''
if s.count(old) != 1:
    raise SystemExit(f'pull notice block count={s.count(old)}')
s = s.replace(old, new, 1)
# Add explicit conflict resolver before publishHub.
marker = '''  const publishHub = async () => {'''
resolver = '''  const resolveSyncConflict = async () => {
    setBusy('pull');
    setMessage('');
    try {
      await cloud.resolveConflict(tournamentRef.current);
      adoptSynchronizedTournament();
      setNotice('ok', 'Safe conflict resolution completed where fields did not overlap. Same-field conflicts remain protected from overwrite.');
    } catch (error: any) {
      setNotice('error', error?.message || 'Could not resolve the synchronization conflict safely.');
    } finally {
      setBusy(null);
    }
  };

'''
if s.count(marker) != 1:
    raise SystemExit('publishHub marker missing')
s = s.replace(marker, resolver + marker, 1)
old = '''  const leaveTournament = async () => {
    if (!cloud.conflict) {
      try { await cloud.syncNow(tournamentRef.current); } catch { /* list remains available */ }
    }
    await cloud.returnToCloudList();
  };'''
new = '''  const leaveTournament = async () => {
    if (cloud.cloudDirty) {
      const leave = window.confirm('Web has local changes that may not be confirmed in Cloud yet. Leave this tournament without forcing a hidden Push?');
      if (!leave) return;
    }
    await cloud.returnToCloudList();
  };'''
if s.count(old) != 1:
    raise SystemExit(f'leaveTournament block count={s.count(old)}')
s = s.replace(old, new, 1)
s = s.replace(
'''          <button type="button" className="companion-button secondary" onClick={pullDesktopChanges} disabled={busy !== null || cloud.busy}>
            <RefreshCw size={16} className={busy === 'pull' ? 'spin' : ''} /> Check updates
          </button>
          <button type="button" className="companion-button primary" onClick={syncNow} disabled={busy !== null || cloud.busy || cloud.conflict}>
            <Cloud size={16} /> {busy === 'sync' ? 'Syncing…' : 'Sync now'}
          </button>''',
'''          <button type="button" className="companion-button secondary" onClick={pullDesktopChanges} disabled={busy !== null || cloud.busy} title="Download the current Cloud/Desktop revision into Web. Never uploads Web edits.">
            <RefreshCw size={16} className={busy === 'pull' ? 'spin' : ''} /> {busy === 'pull' ? 'Pulling…' : 'Pull Cloud → Web'}
          </button>
          <button type="button" className="companion-button primary" onClick={syncNow} disabled={busy !== null || cloud.busy || cloud.conflict} title="Upload Web edits to Cloud. Never downloads a newer Cloud revision.">
            <Cloud size={16} /> {busy === 'sync' ? 'Pushing…' : 'Push Web → Cloud'}
          </button>'''
)
s = s.replace(
'''              <strong>Desktop and Web both changed this tournament.</strong>
              <span>Resolve safely merges non-overlapping changes. If the same field changed on both devices, nothing is overwritten.</span>''',
'''              <strong>Desktop/Cloud and Web both changed this tournament.</strong>
              <span>Pull and Push are blocked from overwriting either side. Resolve conflict merges only non-overlapping fields; same-field conflicts remain protected.</span>'''
)
s = s.replace(
'''            <button type="button" className="companion-button secondary companion-conflict-action" onClick={pullDesktopChanges} disabled={busy !== null || cloud.busy}>
              <RefreshCw size={16} className={busy === 'pull' ? 'spin' : ''} /> {busy === 'pull' ? 'Resolving…' : 'Resolve safely'}
            </button>''',
'''            <button type="button" className="companion-button secondary companion-conflict-action" onClick={resolveSyncConflict} disabled={busy !== null || cloud.busy}>
              <RefreshCw size={16} className={busy === 'pull' ? 'spin' : ''} /> {busy === 'pull' ? 'Resolving…' : 'Resolve conflict'}
            </button>'''
)
s = s.replace(
'Both actions first synchronize the tournament with the same Desktop/Cloud record, then publish that synchronized revision.',
'Publish first confirms a safe Web → Cloud Push. If Desktop/Cloud is newer, publication stops and requires an explicit Pull before anything is overwritten.'
)
s = s.replace(
'''<div><Smartphone size={20} /><span><strong>One tournament, every device</strong><small>Desktop and Web use the same private Cloud tournament identity and revision history.</small></span></div>
              <button type="button" className="companion-button secondary" onClick={pullDesktopChanges} disabled={busy !== null || cloud.busy}><RefreshCw size={16} /> Check latest desktop revision</button>''',
'''<div><Smartphone size={20} /><span><strong>One tournament, explicit direction</strong><small>Pull = Cloud → Web only. Push = Web → Cloud only. Neither command silently reverses direction.</small></span></div>
              <button type="button" className="companion-button secondary" onClick={pullDesktopChanges} disabled={busy !== null || cloud.busy}><RefreshCw size={16} /> Pull latest Cloud → Web</button>'''
)
p.write_text(s)

# 6) Permanent regression for Desktop legacy name + complete portable payload + explicit sync/sorting UI.
test = Path('src/cloud/tests/runCompanionSyncContractTests.ts')
test.write_text(r'''import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildPrivateSnapshot, extractPrivateTournament } from '../onlineCloudSync';

const legacyTournament: any = {
  settings: {
    organizer: 'Organizer X', chiefArbiter: 'Kyamran Bilyal', arbiter: 'Deputy', director: 'Director',
    tnr: '', venue: 'Hall A', city: 'Sofia', country: 'BUL', timeControl: '90+30', timeControlPreset: '90+30',
    customTimeControl: '', startDate: '2026-09-07T09:00', endDate: '2026-09-07T23:01', generalRegistrationDeadline: '',
    rounds: '7', lastSwissRounds: '', roundRobinCycles: '1', tournamentFormat: 'Individual Swiss', pairingSystem: 'FIDE Dutch System',
    fideRated: 'No', tournamentRatingType: 'Standard', initialRankSorting: 'automatic', initialRatingSource: 'fide', pairingScoreSystem: 'Game points (1, ½, 0)',
    tournamentType: 'test', liveLink: 'https://example.test/live', website: 'https://example.test', email: 'arbiter@example.test', phone: '+359000', fideEventId: '490658', generalNotes: 'Notes'
  },
  telegram: { channel: '', language: 'en', signature: '' },
  chessResults: { sourceId: 21, creatorId: 0, clientId: '', key: '', mode: 'test', federation: 'XXX', createdAt: '', lastUpload: '', uploadStatus: '', lastError: '', publishCount: 0, lastConnectionTest: '', sidVerified: false, freshTnrRequired: false, pinBoardEnabled: false, pinBoardText: '', activityLog: [] },
  pairings: { server: '', round: '', results: '', showScheduleOnPrint: false, liveBoards: {}, finalStandingsPromptedRound: 0, engine: { mode: '', excluded: [], lastGeneratedRound: 0, lastEngineMessage: '', excludeRemaining: {}, excludeRounds: {}, manualByes: {}, fixedBoards: {}, roundActivationConfirmed: {}, playerStatusCollapsed: false, needsResort: false, registrationsDirty: false, syncedAbsent: {}, registrationSyncedAt: '', registrationSyncedForRound: 0, registrationSyncedSignature: '', firstRoundRegistrationLocked: false, firstRoundRegistrationSyncedSignature: '', firstRoundRegistrationNeedsResort: false, firstRoundRegistrationSyncedAt: '' } },
  schedule: { registrationOpens: '', registrationCloses: '', technicalMeeting: '', openingCeremony: '', closingCeremony: '', awardCeremony: '', notes: 'Schedule note', rows: [{ no: '1', dateTime: '2026-09-07T09:00', event: 'Round 1', description: '' }] },
  regulations: { eligibility: 'Open', format: 'Individual Swiss', rounds: '7', timeControl: '90+30', pairingSystem: 'FIDE Dutch System', rating: 'Unrated', defaultTime: '', drawRules: '', pabPoints: '1.0', tieBreaks: ['Buchholz'], tieBreakOptions: {}, entryFee: '10', registrationDeadline: '', maximumPlayers: '100', fideInfo: '', totalPrizeFund: '1000', mainPrizes: '', specialPrizes: '', categoryPrizes: '', additional: 'Regulations' },
  players: [
    { id: 1, localKey: 'p1', name: 'Zulu, Player', rating: 1800, fed: 'BUL', fideId: '1', birth: '1990', gender: 'm', title: '', attendance: 'present', pairingNumber: 2, joinedFromRound: 1 },
    { id: 2, localKey: 'p2', name: 'Alpha, Player', rating: 2200, fed: 'BUL', fideId: '2', birth: '1991', gender: 'm', title: 'FM', attendance: 'present', pairingNumber: 1, joinedFromRound: 1 }
  ]
};

const legacySnapshot: any = {
  version: 'V99',
  data: { currentTournament: 'Tournament Ubuntu', tournaments: { 'Tournament Ubuntu': legacyTournament }, preferences: {} },
  currentTournament: 'Tournament Ubuntu'
};
const parsed = extractPrivateTournament(legacySnapshot, 'fallback');
assert.equal(parsed.name, 'Tournament Ubuntu');
assert.equal(parsed.tournament.name, 'Tournament Ubuntu', 'Desktop map-key tournament name must hydrate into Web tournament.name.');
assert.deepEqual(parsed.tournament.settings, legacyTournament.settings, 'Every Tournament Setup setting must survive Desktop -> Web extraction unchanged.');
assert.deepEqual(parsed.tournament.regulations, legacyTournament.regulations, 'Regulations must survive Desktop -> Web extraction unchanged.');
assert.deepEqual(parsed.tournament.schedule, legacyTournament.schedule, 'Schedule must survive Desktop -> Web extraction unchanged.');
assert.deepEqual(parsed.tournament.players, legacyTournament.players, 'Player roster must survive Desktop -> Web extraction unchanged.');

const rebuilt: any = buildPrivateSnapshot('Tournament Ubuntu', parsed.tournament);
const roundtrip = rebuilt.data.tournaments['Tournament Ubuntu'];
assert.equal(roundtrip.name, 'Tournament Ubuntu');
assert.deepEqual(roundtrip.settings, legacyTournament.settings, 'Every setup field must survive Web -> Cloud serialization unchanged.');
assert.deepEqual(roundtrip.regulations, legacyTournament.regulations);
assert.deepEqual(roundtrip.schedule, legacyTournament.schedule);
assert.deepEqual(roundtrip.players, legacyTournament.players);

const setup = readFileSync(resolve(process.cwd(), 'src/companion/CompanionSetup.tsx'), 'utf8');
const registration = readFileSync(resolve(process.cwd(), 'src/companion/CompanionRegistration.tsx'), 'utf8');
const workspace = readFileSync(resolve(process.cwd(), 'src/companion/CompanionWorkspace.tsx'), 'utf8');
const actions = readFileSync(resolve(process.cwd(), 'src/companion/companionCloudActions.ts'), 'utf8');
assert.doesNotMatch(setup, /organizer:\s*previous\.settings\.organizer\s*\|\|\s*name/, 'Editing tournament name must never populate Organizer implicitly.');
assert.match(registration, /'starting' \| 'rating' \| 'name'/, 'Web roster must expose Starting #, Rating and Name sort modes.');
assert.match(registration, /Rating ↓/);
assert.match(registration, /Name A–Z/);
assert.match(registration, /sorting never changes official starting numbers or pairing numbers/);
assert.match(workspace, /Pull Cloud → Web/);
assert.match(workspace, /Push Web → Cloud/);
assert.doesNotMatch(workspace, /window\.addEventListener\('focus', onFocus\)/, 'Web must not silently Pull merely because the browser regained focus.');
assert.match(actions, /async function pullChangesOnly/);
assert.match(actions, /A Pull command must never upload Web changes/);
assert.match(actions, /Cloud has newer Desktop changes or a synchronization conflict\. Pull Cloud → Web before pushing or publishing\./);
assert.match(actions, /resolveConflict: \(tournament: Tournament\) => smartPullChanges/);
console.log('PASS Companion sync contract: full Desktop/Web tournament parity + directional Pull/Push + safe roster view sorting.');
''')

# Add the regression to the existing production cloud-roundtrip gate.
p = Path('package.json')
s = p.read_text()
old = '"test:cloud-roundtrip": "tsx src/cloud/tests/runCloudRoundtripTests.ts && tsx src/cloud/tests/runCompanionConflictMergeTests.ts && tsx src/cloud/tests/runPublicHubSnapshotParityTests.ts && tsx src/cloud/tests/runHubRegulationsRepublishTests.ts"'
new = '"test:cloud-roundtrip": "tsx src/cloud/tests/runCloudRoundtripTests.ts && tsx src/cloud/tests/runCompanionConflictMergeTests.ts && tsx src/cloud/tests/runPublicHubSnapshotParityTests.ts && tsx src/cloud/tests/runHubRegulationsRepublishTests.ts && tsx src/cloud/tests/runCompanionSyncContractTests.ts"'
if s.count(old) != 1:
    raise SystemExit(f'package cloud-roundtrip marker count={s.count(old)}')
s = s.replace(old, new, 1)
p.write_text(s)
