import React, { useEffect, useState } from 'react';
import {
  CloudDownload, CloudUpload, ExternalLink, History, HeartPulse,
  FileUp, Trash2, RotateCcw, ScrollText, DatabaseBackup, ShieldAlert,
  ChevronDown, RefreshCw, LogOut, CheckCircle2
} from 'lucide-react';
import { Tournament } from '../types';
import { useOnlineCloud } from './OnlineCloudProviderV2';
import { createCompanionCloudFacade, DirectionalCloudStatus } from '../companion/companionCloudActions';

export function OnlineCloudTab({ tournament }: { tournament: Tournament }) {
  const cloud = useOnlineCloud();
  const [history, setHistory] = useState<any[]>([]);
  const [health, setHealth] = useState<any>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [resolvingConflict, setResolvingConflict] = useState(false);
  const [directionalStatus, setDirectionalStatus] = useState<DirectionalCloudStatus | null>(null);
  const directionalCloud = createCompanionCloudFacade(cloud);

  const internalId = (tournament as any)?.cloud?.internalId || (tournament as any)?.online?.hubTournamentId || 'not assigned yet';
  const cloudRevision = Number((tournament as any)?.cloud?.baseRevision || cloud.activeCloud?.revision || 0);
  const publicRevision = Number((tournament as any)?.online?.revision || 0);
  const publicUrl = (tournament as any)?.online?.publicPageUrl || '';

  async function loadHistory() {
    setLoadingHistory(true);
    try { setHistory(await cloud.refreshHistory()); }
    finally { setLoadingHistory(false); }
  }

  async function checkHealth() {
    try { setHealth(await cloud.apiHealth()); }
    catch (error: any) { setHealth({ ok: false, message: error?.message || String(error) }); }
  }

  useEffect(() => setHistory([]), [cloud.activeCloud?.id]);

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

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-5 animate-in fade-in duration-200 text-slate-800">
      <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-slate-900">Online & Cloud</h2>
              <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-800 border border-blue-200">Browser Continuation Beta</span>
              {cloud.conflict && (
                <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-800 border border-rose-300 flex items-center gap-1">
                  <ShieldAlert className="w-3 h-3" /> Conflict — no overwrite
                </span>
              )}
              {!cloud.conflict && cloud.remoteChangesAvailable && (
                <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-900 border border-amber-300">Cloud changes available</span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1 max-w-3xl">
              Local save is immediate. Cloud background sync is push-only. Manual directions are explicit: Pull Cloud → Desktop never uploads; Push Desktop → Cloud never downloads a newer Cloud revision.
            </p>
          </div>
          <div className="text-right text-[11px] font-mono text-slate-500">
            <div>Organizer: <span className="text-slate-800 font-semibold">{cloud.organizerName}</span></div>
            <div>Private cloud: r{cloudRevision}</div>
            <div>Public Hub: {publicRevision ? `r${publicRevision}` : 'not published'}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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

        <div className={`rounded-lg border px-3 py-2 text-xs flex items-center justify-between gap-3 ${
          cloud.statusKind === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-900' :
          cloud.statusKind === 'busy' ? 'bg-blue-50 border-blue-200 text-blue-900' :
          cloud.statusKind === 'offline' ? 'bg-slate-100 border-slate-300 text-slate-700' :
          'bg-amber-50 border-amber-300 text-amber-900'
        }`}>
          <span className="flex items-center gap-2">
            {cloud.statusKind === 'ok' && <CheckCircle2 className="w-3.5 h-3.5" />}
            {cloud.status}
          </span>
          {cloud.busy && <RefreshCw className="w-3.5 h-3.5 animate-spin flex-shrink-0" />}
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <details open className="group">
          <summary className="cursor-pointer list-none px-5 py-3 flex items-center justify-between bg-slate-50 border-b border-slate-200">
            <span className="font-semibold text-sm flex items-center gap-2"><DatabaseBackup className="w-4 h-4 text-blue-600" /> Private Cloud Sync</span>
            <ChevronDown className="w-4 h-4 text-slate-400 group-open:rotate-180 transition" />
          </summary>
          <div className="p-5 space-y-4 text-xs">
            <div className="grid sm:grid-cols-3 gap-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500">Automatic Cloud Sync</div>
                <div className="font-semibold text-emerald-700 mt-1">ON · always</div>
                <div className="text-[10px] text-slate-500 mt-1">Changes save locally first, then sync after a short debounce.</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500">Internal Tournament ID</div>
                <div className="font-mono text-slate-800 break-all mt-1">{internalId}</div>
                <div className="text-[10px] text-slate-500 mt-1">Stable logical identity shared by Desktop and Web. It is not a credential.</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500">Last successful sync</div>
                <div className="font-mono text-slate-800 mt-1">{cloud.lastSyncAt ? new Date(cloud.lastSyncAt).toLocaleString() : 'not yet'}</div>
                <div className="text-[10px] text-slate-500 mt-1">{cloud.cloudDirty ? 'Local changes are pending.' : 'Local and known Cloud base are aligned.'}</div>
              </div>
            </div>
          </div>
        </details>

        <details className="group border-t border-slate-200">
          <summary className="cursor-pointer list-none px-5 py-3 flex items-center justify-between bg-white">
            <span className="font-semibold text-sm flex items-center gap-2"><History className="w-4 h-4 text-violet-600" /> History & Recovery</span>
            <ChevronDown className="w-4 h-4 text-slate-400 group-open:rotate-180 transition" />
          </summary>
          <div className="p-5 border-t border-slate-200 space-y-3 text-xs">
            <button onClick={() => void loadHistory()} disabled={loadingHistory} className="px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 font-semibold">
              {loadingHistory ? 'Loading…' : 'Load Cloud History'}
            </button>
            <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
              {history.map(item => (
                <div key={item.revision} className="p-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-mono font-bold">r{item.revision}</div>
                    <div className="text-[10px] text-slate-500">{item.createdAt || ''} · {item.deviceLabel || item.clientVersion || ''}</div>
                  </div>
                  <button onClick={() => void cloud.restorePrivateRevision(Number(item.revision))} className="px-2.5 py-1.5 rounded border border-amber-300 bg-amber-50 text-amber-900 font-semibold">Restore remotely</button>
                </div>
              ))}
              {!history.length && <div className="p-3 text-slate-500">Load history to view immutable private revisions.</div>}
            </div>
            <p className="text-slate-500">Restore creates a new remote current revision. It never overwrites the open browser tournament automatically; use Pull Cloud → Desktop afterwards.</p>
          </div>
        </details>

        <details className="group border-t border-slate-200">
          <summary className="cursor-pointer list-none px-5 py-3 flex items-center justify-between bg-white">
            <span className="font-semibold text-sm flex items-center gap-2"><ScrollText className="w-4 h-4 text-emerald-600" /> Public Hub Tools</span>
            <ChevronDown className="w-4 h-4 text-slate-400 group-open:rotate-180 transition" />
          </summary>
          <div className="p-5 border-t border-slate-200 flex flex-wrap gap-2 text-xs">
            <button onClick={() => void cloud.publishOnline(tournament)} className="px-3 py-2 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-900 font-semibold flex items-center gap-2"><CloudUpload className="w-4 h-4" /> Publish Online</button>
            <label className="px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 font-semibold cursor-pointer flex items-center gap-2">
              <FileUp className="w-4 h-4" /> Upload Regulations
              <input type="file" className="hidden" onChange={event => {
                const file = event.target.files?.[0];
                if (file) void cloud.uploadRegulations(tournament, file).catch(error => alert(error.message));
                event.currentTarget.value = '';
              }} />
            </label>
            <button onClick={() => void cloud.deletePublicTournament(tournament).catch(error => alert(error.message))} className="px-3 py-2 rounded-lg border border-rose-300 bg-rose-50 text-rose-800 font-semibold flex items-center gap-2"><Trash2 className="w-4 h-4" /> Delete / Recovery</button>
            <button onClick={() => void cloud.restorePublicTournament(tournament).catch(error => alert(error.message))} className="px-3 py-2 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 font-semibold flex items-center gap-2"><RotateCcw className="w-4 h-4" /> Restore Public</button>
          </div>
        </details>

        <details className="group border-t border-slate-200">
          <summary className="cursor-pointer list-none px-5 py-3 flex items-center justify-between bg-white">
            <span className="font-semibold text-sm flex items-center gap-2"><HeartPulse className="w-4 h-4 text-rose-600" /> Diagnostics & Logs</span>
            <ChevronDown className="w-4 h-4 text-slate-400 group-open:rotate-180 transition" />
          </summary>
          <div className="p-5 border-t border-slate-200 space-y-3 text-xs">
            <div className="flex flex-wrap gap-2">
              <button onClick={() => void checkHealth()} className="px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 font-semibold">API Health</button>
              <button onClick={() => void cloud.returnToCloudList()} className="px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 font-semibold">Cloud Tournaments</button>
              <button onClick={cloud.signOut} className="px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 font-semibold flex items-center gap-2"><LogOut className="w-4 h-4" /> Sign out</button>
            </div>
            {health && <pre className="p-3 rounded-lg bg-slate-950 text-emerald-300 overflow-auto text-[10px]">{JSON.stringify(health, null, 2)}</pre>}
            <div className="max-h-48 overflow-y-auto rounded-lg bg-slate-950 text-slate-300 font-mono text-[10px] p-3 space-y-1">
              {cloud.logs.length ? cloud.logs.map((line, index) => <div key={`${line}-${index}`}>{line}</div>) : <div>No Online & Cloud activity yet.</div>}
            </div>
          </div>
        </details>
      </section>
    </div>
  );
}
