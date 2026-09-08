from pathlib import Path
import re

# Shared read-only status + local-only conflict resolution.
p = Path('src/companion/companionCloudActions.ts')
s = p.read_text()

insert_marker = "async function smartPullChanges(cloud: any, tournament: Tournament) {\n"
if 'export async function checkCloudStatusOnly' not in s:
    status_helper = r'''export type DirectionalCloudStatus = {
  kind: 'in-sync' | 'local-changes' | 'remote-changes' | 'conflict' | 'unlinked' | 'no-cloud-snapshot';
  revision: number;
  message: string;
};

export async function checkCloudStatusOnly(cloud: any, tournament: Tournament): Promise<DirectionalCloudStatus> {
  const local: any = readLocalTournament() || tournament;
  const token = text(cloud?.token);
  const remoteId = text(local?.cloud?.cloudTournamentId || cloud?.activeCloud?.id);
  if (!token || !remoteId) {
    return { kind: 'unlinked', revision: 0, message: 'This tournament is not linked to a private Cloud record.' };
  }

  const remoteResult = await cloudApi.getSnapshot(token, remoteId);
  const revision = Number(remoteResult?.tournament?.revision || cloud?.activeCloud?.revision || 0);
  if (!remoteResult?.snapshot) {
    return { kind: 'no-cloud-snapshot', revision, message: 'Cloud has no tournament snapshot yet. Use Push Desktop → Cloud.' };
  }

  const remote = extractPrivateTournament(
    remoteResult.snapshot,
    remoteResult?.tournament?.name || tournamentName(local)
  ).tournament;
  const [localFingerprint, remoteFingerprint] = await Promise.all([
    fingerprintTournament(local),
    fingerprintTournament(remote)
  ]);
  if (localFingerprint === remoteFingerprint) {
    return { kind: 'in-sync', revision, message: `Desktop and Cloud match at r${revision}.` };
  }

  let baseFingerprint = text(local?.cloud?.baseFingerprint);
  const baseRevision = Number(local?.cloud?.baseRevision || 0);
  if (!baseFingerprint && baseRevision > 0) {
    try {
      const baseResult = await cloudApi.getRevisionSnapshot(token, remoteId, baseRevision);
      const base = extractPrivateTournament(baseResult?.snapshot, tournamentName(local)).tournament;
      baseFingerprint = await fingerprintTournament(base);
    } catch {
      baseFingerprint = '';
    }
  }
  if (!baseFingerprint) {
    return { kind: 'conflict', revision, message: 'Common base cannot be confirmed. Nothing was overwritten.' };
  }

  const decision = classifyThreeWay(localFingerprint, baseFingerprint, remoteFingerprint);
  if (decision === 'local-only') {
    return { kind: 'local-changes', revision, message: 'Desktop has changes that are not in Cloud.' };
  }
  if (decision === 'cloud-only') {
    return { kind: 'remote-changes', revision, message: 'Cloud has newer changes. Pull Cloud → Desktop before pushing.' };
  }
  if (decision === 'equal') {
    return { kind: 'in-sync', revision, message: `Desktop and Cloud match at r${revision}.` };
  }
  return { kind: 'conflict', revision, message: 'Desktop and Cloud both changed. Nothing was overwritten.' };
}

'''
    if insert_marker not in s:
        raise SystemExit('smartPullChanges marker missing')
    s = s.replace(insert_marker, status_helper + insert_marker, 1)

start = s.index('async function smartPullChanges(cloud: any, tournament: Tournament) {')
end = s.index('async function syncNowConfirmed(cloud: any, tournament: Tournament) {', start)
block = s[start:end]
old = r'''    const currentFingerprint = await fingerprintTournament(current);
    const hydrated = preserveInstallationLocalFields(merge.merged, local, {
      cloudTournamentId: remote.id,
      baseRevision: currentRevision,
      baseFingerprint: currentFingerprint
    });
    const mergedFingerprint = await fingerprintTournament(hydrated);
    const saved = await cloudApi.putSnapshot(
      token,
      remote.id,
      currentRevision,
      buildPrivateSnapshot(tournamentName(hydrated), hydrated),
      browserDevice()
    );
    const revision = Number(saved?.revision || currentRevision + 1);
    const updated = withUpdatedBase(hydrated, remote.id, revision, mergedFingerprint);
    localStorage.setItem(TOURNAMENT_STORAGE_KEY, JSON.stringify(updated));

    // Re-enter the existing provider's Pull Changes path so it remains the
    // authority that clears conflict state and refreshes its React metadata.
    return cloud.pullChanges(updated);'''
new = r'''    const currentFingerprint = await fingerprintTournament(current);
    const hydrated = preserveInstallationLocalFields(merge.merged, local, {
      cloudTournamentId: remote.id,
      baseRevision: currentRevision,
      baseFingerprint: currentFingerprint
    });
    localStorage.setItem(TOURNAMENT_STORAGE_KEY, JSON.stringify(hydrated));

    // Resolve Conflict is intentionally local-only. Re-enter Pull only to refresh
    // provider state against the confirmed current base. The provider's local-only
    // branch is prohibited from uploading, so the user explicitly chooses Push next.
    return cloud.pullChanges(hydrated);'''
if old not in block:
    raise SystemExit('old smart conflict upload block not found')
block = block.replace(old, new, 1)
s = s[:start] + block + s[end:]

facade_old = "    resolveConflict: (tournament: Tournament) => smartPullChanges(cloud, tournament),\n"
facade_new = facade_old + "    checkStatus: (tournament: Tournament) => checkCloudStatusOnly(cloud, tournament),\n"
if 'checkStatus: (tournament: Tournament)' not in s:
    if facade_old not in s:
        raise SystemExit('facade marker missing')
    s = s.replace(facade_old, facade_new, 1)
p.write_text(s)

# Desktop control panel.
p = Path('src/cloud/OnlineCloudTabV2.tsx')
s = p.read_text()
s = s.replace("import React, { useEffect, useState } from 'react';", "import React, { useEffect, useState } from 'react';")
if "createCompanionCloudFacade" not in s:
    s = s.replace("import { useOnlineCloud } from './OnlineCloudProviderV2';", "import { useOnlineCloud } from './OnlineCloudProviderV2';\nimport { createCompanionCloudFacade, DirectionalCloudStatus } from '../companion/companionCloudActions';")
if "const [directionalStatus" not in s:
    s = s.replace(
        "  const [loadingHistory, setLoadingHistory] = useState(false);",
        "  const [loadingHistory, setLoadingHistory] = useState(false);\n  const [checkingStatus, setCheckingStatus] = useState(false);\n  const [resolvingConflict, setResolvingConflict] = useState(false);\n  const [directionalStatus, setDirectionalStatus] = useState<DirectionalCloudStatus | null>(null);\n  const directionalCloud = createCompanionCloudFacade(cloud);"
    )

marker = "  useEffect(() => setHistory([]), [cloud.activeCloud?.id]);\n"
if 'async function checkCloudStatus()' not in s:
    helpers = r'''
  async function checkCloudStatus() {
    setCheckingStatus(true);
    try {
      setDirectionalStatus(await directionalCloud.checkStatus(tournament));
    } catch (error: any) {
      setDirectionalStatus({ kind: 'conflict', revision: cloudRevision, message: error?.message || 'Cloud status check failed.' });
    } finally {
      setCheckingStatus(false);
    }
  }

  async function resolveConflict() {
    setResolvingConflict(true);
    try {
      await directionalCloud.resolveConflict(tournament);
      setDirectionalStatus(await directionalCloud.checkStatus(tournament));
    } catch (error: any) {
      setDirectionalStatus({ kind: 'conflict', revision: cloudRevision, message: error?.message || 'Conflict could not be resolved safely.' });
    } finally {
      setResolvingConflict(false);
    }
  }

  function openInWeb() {
    const cloudTournamentId = String((tournament as any)?.cloud?.cloudTournamentId || cloud.activeCloud?.id || '').trim();
    const logicalId = String((tournament as any)?.cloud?.internalId || '').trim();
    const hint = cloudTournamentId || logicalId;
    const query = hint ? `?cloudTournamentId=${encodeURIComponent(hint)}&source=desktop` : '?source=desktop';
    window.open(`https://web.chess-publisher.org/${query}`, '_blank', 'noopener,noreferrer');
  }

  const directionalLabel = directionalStatus?.kind === 'in-sync' ? '✓ In sync'
    : directionalStatus?.kind === 'local-changes' ? '↑ Desktop changes not pushed'
    : directionalStatus?.kind === 'remote-changes' ? '↓ Cloud has newer changes'
    : directionalStatus?.kind === 'conflict' ? '⚠ Conflict — nothing overwritten'
    : directionalStatus?.kind === 'no-cloud-snapshot' ? '○ Cloud has no snapshot'
    : directionalStatus?.kind === 'unlinked' ? '○ Not linked'
    : '';
'''
    if marker not in s:
        raise SystemExit('OnlineCloudTab helper marker missing')
    s = s.replace(marker, marker + helpers, 1)

# Replace 3-card top grid with two directional primary actions.
old_grid_start = '        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">'
old_grid_end = '        <div className={`rounded-lg border px-3 py-2 text-xs flex items-center justify-between gap-3 ${'
start = s.index(old_grid_start)
end = s.index(old_grid_end, start)
new_grid = r'''        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <button
            onClick={() => void cloud.pullChanges(tournament)}
            className="min-h-20 rounded-xl border border-blue-300 bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 text-left shadow-sm transition"
          >
            <div className="flex items-center gap-2 font-bold"><CloudDownload className="w-5 h-5" /> Pull Cloud → Desktop</div>
            <div className="text-[11px] text-blue-100 mt-1">Downloads the current Cloud revision only. It never uploads Desktop edits.</div>
          </button>

          <button
            onClick={() => void cloud.syncNow(tournament)}
            className="min-h-20 rounded-xl border border-emerald-300 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-3 text-left shadow-sm transition"
          >
            <div className="flex items-center gap-2 font-bold"><CloudUpload className="w-5 h-5" /> Push Desktop → Cloud</div>
            <div className="text-[11px] text-emerald-100 mt-1">Uploads Desktop changes only after the revision guard passes. It never pulls newer Cloud data.</div>
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <button onClick={() => void checkCloudStatus()} disabled={checkingStatus || cloud.busy} className="px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50 font-semibold text-xs flex items-center gap-2">
            <RefreshCw className={`w-4 h-4 ${checkingStatus ? 'animate-spin' : ''}`} /> {checkingStatus ? 'Checking…' : 'Check Cloud Status'}
          </button>
          <button onClick={openInWeb} className="px-3 py-2 rounded-lg border border-blue-300 bg-blue-50 hover:bg-blue-100 text-blue-900 font-semibold text-xs flex items-center gap-2">
            <ExternalLink className="w-4 h-4" /> Open in Web
          </button>
          {(cloud.conflict || directionalStatus?.kind === 'conflict') && (
            <button onClick={() => void resolveConflict()} disabled={resolvingConflict || cloud.busy} className="px-3 py-2 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 disabled:opacity-50 text-amber-950 font-semibold text-xs flex items-center gap-2">
              <ShieldAlert className="w-4 h-4" /> {resolvingConflict ? 'Resolving…' : 'Resolve Conflict'}
            </button>
          )}
        </div>

        {directionalStatus && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
            <div className="font-bold text-slate-900">{directionalLabel}{directionalStatus.revision ? ` · Cloud r${directionalStatus.revision}` : ''}</div>
            <div className="text-slate-600 mt-0.5">{directionalStatus.message}</div>
          </div>
        )}

'''
s = s[:start] + new_grid + s[end:]
p.write_text(s)

# Permanent directional regression checks.
p = Path('src/cloud/tests/runDirectionalDesktopParityTests.ts')
s = p.read_text()
if "readFileSync" not in s:
    s = s.replace("import assert from 'node:assert/strict';", "import assert from 'node:assert/strict';\nimport { readFileSync } from 'node:fs';")
if 'DESKTOP_DIRECTIONAL_CONTROL_PANEL=PASS' not in s:
    addition = r'''
const providerSource = readFileSync('src/cloud/OnlineCloudProviderV2.tsx', 'utf8');
const desktopTabSource = readFileSync('src/cloud/OnlineCloudTabV2.tsx', 'utf8');
const companionActionsSource = readFileSync('src/companion/companionCloudActions.ts', 'utf8');
const pullBody = providerSource.split('async function pullChanges(tournamentInput: Tournament) {', 2)[1]?.split('async function syncNow(tournamentInput: Tournament) {', 1)[0] || '';
assert.ok(pullBody.includes('Pull Cloud → Desktop found no remote snapshot; no upload occurred.'), 'Pull must fail directionally when Cloud has no snapshot.');
assert.ok(pullBody.includes('Pull Cloud → Desktop detected local-only changes and did not upload them.'), 'Pull must leave Desktop-only edits local.');
assert.equal(pullBody.includes('cloudApi.putSnapshot('), false, 'Pull Cloud → Desktop must never upload a snapshot.');
assert.ok(desktopTabSource.includes('Pull Cloud → Desktop'));
assert.ok(desktopTabSource.includes('Push Desktop → Cloud'));
assert.ok(desktopTabSource.includes('Check Cloud Status'));
assert.ok(desktopTabSource.includes('Resolve Conflict'));
assert.ok(desktopTabSource.includes('Open in Web'));
assert.ok(companionActionsSource.includes('export async function checkCloudStatusOnly'), 'Cloud status check must be read-only and reusable by Desktop/Web.');
const resolveBody = companionActionsSource.split('async function smartPullChanges(cloud: any, tournament: Tournament) {', 2)[1]?.split('async function syncNowConfirmed(cloud: any, tournament: Tournament) {', 1)[0] || '';
assert.equal(resolveBody.includes('cloudApi.putSnapshot('), false, 'Resolve Conflict must save a safe merge locally and require an explicit Push afterwards.');
assert.ok(resolveBody.includes('Resolve Conflict is intentionally local-only.'));
console.log('DESKTOP_DIRECTIONAL_CONTROL_PANEL=PASS');
'''
    s += addition
p.write_text(s)
