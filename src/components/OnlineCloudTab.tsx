import React, { useEffect, useState } from 'react';
import {
  CloudDownload, CloudUpload, ExternalLink, History, HeartPulse,
  FileUp, Trash2, RotateCcw, ScrollText, DatabaseBackup, ShieldAlert,
  ChevronDown, RefreshCw, LogOut
} from 'lucide-react';
import { Tournament } from '../types';
import { useOnlineCloud } from '../cloud/OnlineCloudProvider';

export function OnlineCloudTab({ tournament }: { tournament: Tournament }) {
  const cloud = useOnlineCloud();
  const [history, setHistory] = useState<any[]>([]);
  const [health, setHealth] = useState<any>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

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

  useEffect(() => {
    setHistory([]);
  }, [cloud.activeCloud?.id]);

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-5 animate-in fade-in duration-200 text-slate-800">
      <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-slate-900">Online & Cloud</h2>
              <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">Beta</span>
              {cloud.conflict && (
                <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-800 border border-rose-300 flex items-center gap-1">
                  <ShieldAlert className="w-3 h-3" /> Conflict — no overwrite
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1 max-w-3xl">
              One organizer workspace for private Cloud revisions and public Tournament Hub publishing. Pull is always explicit; automatic backup is push-only.
            </p>
          </div>
          <div className="text-right text-[11px] font-mono text-slate-500">
            <div>Organizer: <span className="text-slate-800 font-semibold">{cloud.organizerName}</span></div>
            <div>Private cloud: r{cloudRevision}</div>
            <div>Public Hub: {publicRevision ? `r${publicRevision}` : 'not published'}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <button
            disabled={cloud.busy}
            onClick={() => void cloud.pullChanges(tournament)}
            className="min-h-20 rounded-xl border border-blue-300 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-3 text-left shadow-sm transition"
          >
            <div className="flex items-center gap-2 font-bold"><CloudDownload className="w-5 h-5" /> Pull Changes</div>
            <div className="text-[11px] text-blue-100 mt-1">Save local → compare local ↔ common base ↔ cloud → pull/push/equal/conflict.</div>
          </button>

          <button
            disabled={cloud.busy}
            onClick={() => void cloud.publishOnline(tournament)}
            className="min-h-20 rounded-xl border border-emerald-300 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-4 py-3 text-left shadow-sm transition"
          >
            <div className="flex items-center gap-2 font-bold"><CloudUpload className="w-5 h-5" /> Publish Online</div>
            <div className="text-[11px] text-emerald-100 mt-1">Smart create + publish when unlinked; normal revision publish when already linked.</div>
          </button>

          <button
            disabled={!publicUrl && !(tournament as any)?.online?.publicSlug}
            onClick={() => cloud.openPublicPage(tournament)}
            className="min-h-20 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 text-slate-800 px-4 py-3 text-left shadow-sm transition"
          >
            <div className="flex items-center gap-2 font-bold"><ExternalLink className="w-5 h-5 text-blue-600" /> Open Public Page</div>
            <div className="text-[11px] text-slate-500 mt-1">Open the current public tournament page on chess-publisher.org.</div>
          </button>
        </div>

        <div className={`rounded-lg border px-3 py-2 text-xs flex items-center justify-between gap-3 ${
          cloud.statusKind === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-900' :
          cloud.statusKind === 'busy' ? 'bg-blue-50 border-blue-200 text-blue-900' :
          cloud.statusKind === 'offline' ? 'bg-slate-100 border-slate-300 text-slate-700' :
          'bg-amber-50 border-amber-300 text-amber-900'
        }`}>
          <span>{cloud.status}</span>
          {cloud.busy && <RefreshCw className="w-3.5 h-3.5 animate-spin flex-shrink-0" />}
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <details open className="group">
          <summary className="cursor-pointer list-none px-5 py-3 flex items-center justify-between bg-slate-50 border-b border-slate-200">
            <span className="font-semibold text-sm flex items-center gap-2"><DatabaseBackup className="w-4 h-4 text-blue-600" /> Private Cloud Backup</span>
            <ChevronDown className="w-4 h-4 text-slate-400 group-open:rotate-180 transition" />
          </summary>
          <div className="p-5 space-y-4 text-xs">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500">Internal Tournament ID</div>
                <div className="font-mono text-slate-800 break-all mt-1">{internalId}</div>
                <div className="text-[10px] text-slate-500 mt-1">Logical identity only — not a password or access credential.</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500">Installation localKey</div>
                <div className="font-mono text-slate-800 break-all mt-1">{(tournament as any)?.cloud?.localKey || 'assigned locally on first sync'}</div>
                <div className="text-[10px] text-slate-500 mt-1">Stays local to this browser/device and is not the cloud identity.</div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 bg-white">
                <input
                  type="checkbox"
                  checked={cloud.autoBackup}
                  onChange={event => cloud.setAutoBackup(event.target.checked, tournament)}
                />
                <span><b>Automatic backup</b> — opt-in, push-only</span>
              </label>
              <button disabled={cloud.busy} onClick={() => void cloud.backupNow(tournament)} className="px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 font-semibold">
                Back Up Now
              </button>
              <span className="text-slate-500">Automatic backup never downloads a cloud copy over the open tournament.</span>
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
            <p className="text-slate-500">Restore creates a new remote current revision. It does not overwrite the local tournament; use Pull Changes afterwards.</p>
          </div>
        </details>

        <details className="group border-t border-slate-200">
          <summary className="cursor-pointer list-none px-5 py-3 flex items-center justify-between bg-white">
            <span className="font-semibold text-sm flex items-center gap-2"><ScrollText className="w-4 h-4 text-emerald-600" /> Public Hub Tools</span>
            <ChevronDown className="w-4 h-4 text-slate-400 group-open:rotate-180 transition" />
          </summary>
          <div className="p-5 border-t border-slate-200 flex flex-wrap gap-2 text-xs">
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
