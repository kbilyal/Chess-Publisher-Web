import React, { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { cloudApi, CloudApiError } from './cloudWorkspaceApi';

const TOURNAMENT_STORAGE_KEY = 'fide_tournament_manager_v2';
const TOKEN_SESSION_KEY = 'cpstudio.organizerToken.session';
const TOKEN_LOCAL_KEY = 'cpstudio.organizerToken.remembered';
const DEVICE_KEY = 'cpstudio.cloud.device.v1';
const SETTINGS_CACHE_KEY = 'cpstudio.cloud.settings.v1';

type CloudTournamentMeta = {
  id: string;
  name?: string;
  revision?: number;
  checksum?: string;
  updatedAt?: string;
  [key: string]: any;
};

type ActiveCloudTournament = {
  id: string;
  name: string;
  revision: number;
  checksum?: string;
  updatedAt?: string;
};

type SyncKind = 'ok' | 'busy' | 'warn' | 'offline';

type Props = { children: ReactNode };

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const text = (value: unknown) => value == null ? '' : String(value).trim();

function uuid() {
  return crypto.randomUUID?.() || `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

function device() {
  try {
    const current = JSON.parse(localStorage.getItem(DEVICE_KEY) || 'null');
    if (current?.id) return current as { id: string; label: string };
  } catch { /* ignored */ }
  const next = { id: `studio-web:${uuid()}`, label: 'Chess-Publisher Web (Google AI Studio)' };
  localStorage.setItem(DEVICE_KEY, JSON.stringify(next));
  return next;
}

function deepMergePreserveUnknown(base: any, overlay: any): any {
  if (Array.isArray(overlay)) return clone(overlay);
  if (!overlay || typeof overlay !== 'object') return overlay;
  const source = base && typeof base === 'object' && !Array.isArray(base) ? base : {};
  const result: any = clone(source);
  for (const [key, value] of Object.entries(overlay)) {
    result[key] = value && typeof value === 'object' && !Array.isArray(value)
      ? deepMergePreserveUnknown(source[key], value)
      : clone(value);
  }
  return result;
}

function extractTournament(snapshot: any, fallbackName = '') {
  const name = text(snapshot?.data?.currentTournament || snapshot?.currentTournament || fallbackName);
  const tournaments = snapshot?.data?.tournaments;
  const tournament = name && tournaments && typeof tournaments === 'object' ? tournaments[name] : null;
  if (!name || !tournament) throw new Error('Cloud snapshot does not contain a Chess-Publisher tournament object.');
  return { name, tournament };
}

function mergeTournamentIntoSnapshot(snapshot: any, name: string, tournament: any) {
  const next = clone(snapshot || {});
  if (!next.data || typeof next.data !== 'object') next.data = {};
  if (!next.data.tournaments || typeof next.data.tournaments !== 'object') next.data.tournaments = {};
  const baseTournament = next.data.tournaments[name] || {};
  next.data.currentTournament = name;
  next.data.tournaments[name] = deepMergePreserveUnknown(baseTournament, tournament);
  next.currentTournament = name;
  next.savedAt = new Date().toISOString();
  next.preferences = next.preferences || {};
  next.telegramGlobal = next.telegramGlobal || {};
  next.cloudWorkspace = {
    ...(next.cloudWorkspace || {}),
    schemaVersion: 2,
    scope: 'single-tournament',
    private: true,
    clientVersion: 'studio-cloud-integration-0.1'
  };
  return next;
}

function makeSnapshot(name: string, tournament: any) {
  return {
    version: 'V99',
    savedAt: new Date().toISOString(),
    data: { currentTournament: name, tournaments: { [name]: clone(tournament) }, preferences: {} },
    telegramGlobal: {},
    currentTournament: name,
    preferences: {},
    cloudWorkspace: {
      schemaVersion: 2,
      scope: 'single-tournament',
      private: true,
      clientVersion: 'studio-cloud-integration-0.1'
    }
  };
}

function fmt(value: unknown) {
  if (!value) return '—';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function CloudWorkspaceBootstrap({ children }: Props) {
  const [phase, setPhase] = useState<'login' | 'select' | 'app'>('login');
  const [token, setToken] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [rememberToken, setRememberToken] = useState(false);
  const [workspace, setWorkspace] = useState<any>(null);
  const [tournaments, setTournaments] = useState<CloudTournamentMeta[]>([]);
  const [active, setActive] = useState<ActiveCloudTournament | null>(null);
  const [appMountKey, setAppMountKey] = useState(0);
  const [message, setMessage] = useState('Organizer Token required');
  const [syncKind, setSyncKind] = useState<SyncKind>('warn');
  const [conflictRevision, setConflictRevision] = useState<number | null>(null);
  const [settings, setSettings] = useState<any>(null);
  const [settingsRevision, setSettingsRevision] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const snapshotRef = useRef<any>(null);
  const lastObservedLocalRef = useRef('');
  const lastUploadedLocalRef = useRef('');
  const changedAtRef = useRef(0);
  const syncInFlightRef = useRef(false);
  const tokenRef = useRef('');
  const activeRef = useRef<ActiveCloudTournament | null>(null);

  useEffect(() => { tokenRef.current = token; }, [token]);
  useEffect(() => { activeRef.current = active; }, [active]);

  const organizerName = useMemo(() => workspace?.organizer?.displayName || workspace?.organizer?.name || 'Organizer', [workspace]);

  async function refreshCloud(currentToken = tokenRef.current) {
    const [ws, list, cloudSettings] = await Promise.all([
      cloudApi.workspace(currentToken),
      cloudApi.listTournaments(currentToken),
      cloudApi.getSettings(currentToken)
    ]);
    setWorkspace(ws);
    setTournaments(list?.tournaments || []);
    const loadedSettings = cloudSettings?.settings || { schemaVersion: 1, preferences: {}, telegram: { channels: [] } };
    setSettings(loadedSettings);
    setSettingsRevision(Number(cloudSettings?.revision) || 0);
    localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(loadedSettings));
    return ws;
  }

  async function loginWithToken(value: string, remember: boolean) {
    const candidate = text(value);
    if (!candidate) return;
    setBusy(true);
    setMessage('Checking Organizer Token…');
    setSyncKind('busy');
    try {
      await refreshCloud(candidate);
      setToken(candidate);
      tokenRef.current = candidate;
      sessionStorage.setItem(TOKEN_SESSION_KEY, candidate);
      if (remember) localStorage.setItem(TOKEN_LOCAL_KEY, candidate);
      else localStorage.removeItem(TOKEN_LOCAL_KEY);
      setRememberToken(remember);
      setPhase('select');
      setMessage('Cloud connected');
      setSyncKind('ok');
    } catch (error: any) {
      setMessage(error?.message || 'Organizer Token could not be verified.');
      setSyncKind(error?.code === 'network_error' ? 'offline' : 'warn');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const remembered = sessionStorage.getItem(TOKEN_SESSION_KEY) || localStorage.getItem(TOKEN_LOCAL_KEY) || '';
    if (!remembered) return;
    setTokenInput(remembered);
    const remember = Boolean(localStorage.getItem(TOKEN_LOCAL_KEY));
    setRememberToken(remember);
    void loginWithToken(remembered, remember);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function signOut() {
    sessionStorage.removeItem(TOKEN_SESSION_KEY);
    localStorage.removeItem(TOKEN_LOCAL_KEY);
    setToken('');
    tokenRef.current = '';
    setWorkspace(null);
    setTournaments([]);
    setActive(null);
    activeRef.current = null;
    snapshotRef.current = null;
    setConflictRevision(null);
    setPhase('login');
    setMessage('Organizer Token required');
    setSyncKind('warn');
  }

  async function openCloudTournament(meta: CloudTournamentMeta) {
    if (!meta?.id) return;
    setBusy(true);
    setMessage('Loading cloud tournament…');
    setSyncKind('busy');
    try {
      const result = await cloudApi.getSnapshot(tokenRef.current, meta.id);
      const snapshot = clone(result?.snapshot);
      const parsed = extractTournament(snapshot, meta.name || '');
      const localJson = JSON.stringify(parsed.tournament);
      localStorage.setItem(TOURNAMENT_STORAGE_KEY, localJson);
      snapshotRef.current = snapshot;
      lastObservedLocalRef.current = localJson;
      lastUploadedLocalRef.current = localJson;
      changedAtRef.current = Date.now();
      const nextActive = {
        id: meta.id,
        name: parsed.name,
        revision: Number(result?.tournament?.revision ?? result?.revision ?? meta.revision) || 0,
        checksum: result?.tournament?.checksum || meta.checksum,
        updatedAt: result?.tournament?.updatedAt || meta.updatedAt
      };
      setActive(nextActive);
      activeRef.current = nextActive;
      setConflictRevision(null);
      setAppMountKey(key => key + 1);
      setPhase('app');
      setMessage(`Synced · r${nextActive.revision}`);
      setSyncKind('ok');
    } catch (error: any) {
      setMessage(error?.message || 'Cloud tournament could not be opened.');
      setSyncKind(error?.code === 'network_error' ? 'offline' : 'warn');
    } finally {
      setBusy(false);
    }
  }

  async function createCloudCopyFromLocal() {
    const raw = localStorage.getItem(TOURNAMENT_STORAGE_KEY);
    if (!raw) {
      alert('No local Studio tournament is available to upload.');
      return;
    }
    let tournament: any;
    try { tournament = JSON.parse(raw); }
    catch { alert('The local tournament JSON is invalid.'); return; }
    const proposed = text(tournament?.name || tournament?.settings?.eventName || 'New Tournament');
    const name = text(prompt('Cloud tournament name', proposed));
    if (!name) return;

    setBusy(true);
    setMessage('Creating cloud tournament…');
    setSyncKind('busy');
    try {
      const created = await cloudApi.createTournament(tokenRef.current, {
        localKey: `cp-studio:${uuid()}`,
        name,
        deviceId: device().id,
        deviceLabel: device().label
      });
      const meta = created?.tournament;
      if (!meta?.id) throw new Error('Cloud Workspace did not return a tournament ID.');
      const snapshot = makeSnapshot(name, tournament);
      const saved = await cloudApi.putSnapshot(tokenRef.current, meta.id, Number(meta.revision) || 0, snapshot, device());
      await refreshCloud();
      await openCloudTournament({ ...meta, name, revision: saved?.revision });
    } catch (error: any) {
      setMessage(error?.message || 'Cloud tournament could not be created.');
      setSyncKind(error?.code === 'network_error' ? 'offline' : 'warn');
    } finally {
      setBusy(false);
    }
  }

  async function syncNow(forceLatest = false) {
    const currentActive = activeRef.current;
    const currentToken = tokenRef.current;
    if (!currentActive || !currentToken || !snapshotRef.current || syncInFlightRef.current) return false;

    const localJson = localStorage.getItem(TOURNAMENT_STORAGE_KEY) || '';
    if (!localJson) return false;
    if (!forceLatest && localJson === lastUploadedLocalRef.current) {
      setMessage(`Synced · r${currentActive.revision}`);
      setSyncKind('ok');
      return true;
    }

    let localTournament: any;
    try { localTournament = JSON.parse(localJson); }
    catch { setMessage('Local tournament JSON is invalid.'); setSyncKind('warn'); return false; }

    syncInFlightRef.current = true;
    setMessage('Syncing…');
    setSyncKind('busy');
    try {
      let baseRevision = currentActive.revision;
      if (forceLatest) {
        const latest = await cloudApi.getTournament(currentToken, currentActive.id);
        baseRevision = Number(latest?.tournament?.revision) || baseRevision;
      }
      const outgoing = mergeTournamentIntoSnapshot(snapshotRef.current, currentActive.name, localTournament);
      const saved = await cloudApi.putSnapshot(currentToken, currentActive.id, baseRevision, outgoing, device());
      snapshotRef.current = outgoing;
      lastUploadedLocalRef.current = localJson;
      const updated = {
        ...currentActive,
        revision: Number(saved?.revision) || baseRevision,
        checksum: saved?.checksum || currentActive.checksum,
        updatedAt: saved?.updatedAt || new Date().toISOString()
      };
      setActive(updated);
      activeRef.current = updated;
      setConflictRevision(null);
      setMessage(`Synced · r${updated.revision}`);
      setSyncKind('ok');
      return true;
    } catch (error: any) {
      if (error instanceof CloudApiError && error.code === 'cloud_revision_conflict') {
        setConflictRevision(error.currentRevision);
        setMessage(`Conflict · cloud r${error.currentRevision ?? '?'}`);
        setSyncKind('warn');
      } else if (error?.code === 'network_error') {
        setMessage('Offline · local changes pending');
        setSyncKind('offline');
      } else {
        setMessage(error?.message || 'Cloud sync failed.');
        setSyncKind('warn');
      }
      return false;
    } finally {
      syncInFlightRef.current = false;
    }
  }

  useEffect(() => {
    if (phase !== 'app' || !active) return;
    const timer = window.setInterval(() => {
      if (conflictRevision !== null || syncInFlightRef.current) return;
      const local = localStorage.getItem(TOURNAMENT_STORAGE_KEY) || '';
      if (!local) return;
      if (local !== lastObservedLocalRef.current) {
        lastObservedLocalRef.current = local;
        changedAtRef.current = Date.now();
        setMessage('Local changes pending…');
        setSyncKind('busy');
        return;
      }
      if (local !== lastUploadedLocalRef.current && Date.now() - changedAtRef.current >= 1500) {
        void syncNow(false);
      }
    }, 700);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, active?.id, conflictRevision]);

  async function loadCloudCopyAfterConflict() {
    const current = activeRef.current;
    if (!current) return;
    await openCloudTournament(current);
  }

  async function saveDraftAsNewRevision() {
    if (!confirm('Keep the newer cloud revision in history and create a new current revision from this Web draft?')) return;
    await syncNow(true);
  }

  async function returnToTournamentList() {
    const local = localStorage.getItem(TOURNAMENT_STORAGE_KEY) || '';
    if (activeRef.current && local !== lastUploadedLocalRef.current && conflictRevision === null) {
      const saved = await syncNow(false);
      if (!saved) return;
    }
    setPhase('select');
    try {
      await refreshCloud();
      setMessage('Cloud connected');
      setSyncKind('ok');
    } catch (error: any) {
      setMessage(error?.message || 'Could not refresh Cloud Workspace.');
      setSyncKind(error?.code === 'network_error' ? 'offline' : 'warn');
    }
  }

  function openSettings() {
    setSettingsDraft(clone(settings || { schemaVersion: 1, preferences: {}, telegram: { channels: [] } }));
    setSettingsOpen(true);
  }

  async function saveSettings() {
    if (!settingsDraft) return;
    setBusy(true);
    try {
      const payload = clone(settingsDraft);
      payload.schemaVersion = 1;
      delete payload.token;
      const saved = await cloudApi.putSettings(tokenRef.current, settingsRevision, payload, device());
      const revision = Number(saved?.revision) || settingsRevision;
      setSettings(payload);
      setSettingsRevision(revision);
      localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(payload));
      setSettingsOpen(false);
      setMessage(`Settings synced · r${revision}`);
      setSyncKind('ok');
    } catch (error: any) {
      if (error?.code === 'cloud_settings_revision_conflict') {
        alert(`Organizer settings changed on another client (cloud revision ${error.currentRevision ?? '?'}). Reload settings before saving.`);
      } else {
        alert(error?.message || 'Settings sync failed.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function reloadSettings() {
    setBusy(true);
    try {
      const result = await cloudApi.getSettings(tokenRef.current);
      const loaded = result?.settings || { schemaVersion: 1, preferences: {}, telegram: { channels: [] } };
      setSettings(loaded);
      setSettingsDraft(clone(loaded));
      setSettingsRevision(Number(result?.revision) || 0);
      localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(loaded));
    } finally {
      setBusy(false);
    }
  }

  if (phase === 'login') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <div className="w-full max-w-lg rounded-3xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-blue-400">Chess-Publisher Web</div>
          <h1 className="mt-3 text-3xl font-bold">Organizer Cloud Workspace</h1>
          <p className="mt-3 text-sm leading-6 text-slate-400">Use the same Organizer Token as Chess-Publisher Desktop. The token is verified by the private Cloud Workspace API and is never written into a tournament snapshot.</p>
          <label className="mt-7 block text-sm font-semibold">Organizer Token</label>
          <input
            type="password"
            value={tokenInput}
            onChange={e => setTokenInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !busy) void loginWithToken(tokenInput, rememberToken); }}
            autoComplete="off"
            className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-blue-500"
            placeholder="Paste Organizer Token"
          />
          <label className="mt-4 flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={rememberToken} onChange={e => setRememberToken(e.target.checked)} />
            Remember on this device
          </label>
          <button disabled={busy} onClick={() => void loginWithToken(tokenInput, rememberToken)} className="mt-6 w-full rounded-xl bg-blue-600 px-4 py-3 font-bold text-white disabled:opacity-50">{busy ? 'Connecting…' : 'Sign in'}</button>
          <div className={`mt-4 text-sm ${syncKind === 'warn' ? 'text-amber-300' : syncKind === 'offline' ? 'text-orange-300' : 'text-slate-400'}`}>{message}</div>
        </div>
      </div>
    );
  }

  if (phase === 'select') {
    return (
      <div className="min-h-screen bg-slate-100 text-slate-800">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center gap-4 px-5 py-4">
            <div><div className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Chess-Publisher Web</div><div className="font-bold">{organizerName}</div></div>
            <div className="ml-auto flex flex-wrap gap-2">
              <button onClick={openSettings} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold">Settings · r{settingsRevision}</button>
              <button disabled={busy} onClick={() => void refreshCloud()} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold">Refresh</button>
              <button onClick={signOut} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold">Sign out</button>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-5 py-8">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div><h1 className="text-3xl font-bold">My Cloud Tournaments</h1><p className="mt-1 text-sm text-slate-500">Desktop and Web use the same private snapshots and revision history.</p></div>
            <button disabled={busy} onClick={() => void createCloudCopyFromLocal()} className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">Upload current local tournament</button>
          </div>
          <div className="grid gap-3">
            {tournaments.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-slate-500">No private cloud tournaments yet. Sync one from Desktop first, or upload the current local Studio tournament.</div>}
            {tournaments.map(meta => (
              <button key={meta.id} disabled={busy} onClick={() => void openCloudTournament(meta)} className="flex w-full items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-blue-300 hover:shadow-md disabled:opacity-50">
                <div className="min-w-0 flex-1"><div className="truncate text-lg font-bold">{meta.name || 'Unnamed tournament'}</div><div className="mt-1 text-xs text-slate-500">Updated {fmt(meta.updatedAt)}</div></div>
                <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">r{Number(meta.revision) || 0}</div>
                <div className="font-bold text-blue-600">Open →</div>
              </button>
            ))}
          </div>
          <div className={`mt-5 text-sm ${syncKind === 'warn' ? 'text-amber-700' : syncKind === 'offline' ? 'text-orange-700' : 'text-slate-500'}`}>{message}</div>
        </main>
        {settingsOpen && renderSettingsModal()}
      </div>
    );
  }

  function renderSettingsModal() {
    const draft = settingsDraft || { schemaVersion: 1, preferences: {}, telegram: { channels: [] } };
    const preferences = draft.preferences || (draft.preferences = {});
    const telegram = draft.telegram || (draft.telegram = { channels: [] });
    const channels = Array.isArray(telegram.channels) ? telegram.channels : [];
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4">
        <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
          <div className="flex items-start justify-between gap-4"><div><h2 className="text-xl font-bold">Synced Organizer Settings</h2><p className="text-sm text-slate-500">Cloud revision {settingsRevision}</p></div><button onClick={() => setSettingsOpen(false)} className="rounded-lg border px-3 py-1">×</button></div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold">Default rating list
              <select value={preferences.defaultRating || 'rapid'} onChange={e => setSettingsDraft({ ...draft, preferences: { ...preferences, defaultRating: e.target.value } })} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2">
                <option value="std">Standard</option><option value="rapid">Rapid</option><option value="blitz">Blitz</option>
              </select>
            </label>
            <label className="text-sm font-semibold">Starting list sort
              <select value={preferences.sortMode || 'rating'} onChange={e => setSettingsDraft({ ...draft, preferences: { ...preferences, sortMode: e.target.value } })} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2">
                <option value="rating">Rating</option><option value="name">Name</option><option value="fideId">FIDE ID</option>
              </select>
            </label>
            <label className="sm:col-span-2 text-sm font-semibold">Telegram channel names
              <textarea value={channels.join('\n')} onChange={e => setSettingsDraft({ ...draft, telegram: { ...telegram, channels: e.target.value.split(/\n+/).map(text).filter(Boolean) } })} className="mt-2 min-h-28 w-full rounded-lg border border-slate-300 px-3 py-2" />
            </label>
          </div>
          <p className="mt-4 text-xs leading-5 text-slate-500">Organizer Token, Telegram bot token, DGT hardware/ports and device-specific paths are intentionally not stored in synchronized settings.</p>
          <div className="mt-6 flex justify-end gap-2"><button disabled={busy} onClick={() => void reloadSettings()} className="rounded-lg border border-slate-300 px-4 py-2 font-semibold">Reload Cloud</button><button disabled={busy} onClick={() => void saveSettings()} className="rounded-lg bg-blue-600 px-4 py-2 font-bold text-white">Save Settings</button></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="sticky top-0 z-[80] border-b border-slate-800 bg-slate-950 text-white shadow-lg">
        <div className="flex min-h-11 items-center gap-3 px-4 py-2 text-xs">
          <strong className="whitespace-nowrap">Chess-Publisher Cloud</strong>
          <span className="hidden text-slate-400 sm:inline">{organizerName}</span>
          <span className="min-w-0 truncate text-slate-300">{active?.name || 'Tournament'}</span>
          <span className={`ml-auto whitespace-nowrap rounded-full px-2 py-1 font-bold ${syncKind === 'ok' ? 'bg-emerald-500/15 text-emerald-300' : syncKind === 'offline' ? 'bg-orange-500/15 text-orange-300' : syncKind === 'warn' ? 'bg-amber-500/15 text-amber-300' : 'bg-blue-500/15 text-blue-300'}`}>{message}</span>
          <button onClick={() => void syncNow(false)} className="rounded-md border border-slate-700 px-2 py-1 font-semibold hover:bg-slate-800">Sync Now</button>
          <button onClick={openSettings} className="hidden rounded-md border border-slate-700 px-2 py-1 font-semibold hover:bg-slate-800 md:block">Settings</button>
          <button onClick={() => void returnToTournamentList()} className="rounded-md border border-slate-700 px-2 py-1 font-semibold hover:bg-slate-800">Cloud Tournaments</button>
        </div>
        {conflictRevision !== null && (
          <div className="flex flex-wrap items-center gap-3 border-t border-amber-700/40 bg-amber-950 px-4 py-2 text-xs text-amber-100">
            <strong>Revision conflict:</strong><span>another Desktop/Web client saved cloud revision {conflictRevision}. Your local Studio draft has not been overwritten.</span>
            <button onClick={() => void loadCloudCopyAfterConflict()} className="ml-auto rounded-md bg-white/10 px-2 py-1 font-bold">Load Cloud Copy</button>
            <button onClick={() => void saveDraftAsNewRevision()} className="rounded-md bg-amber-500 px-2 py-1 font-bold text-slate-950">Save Draft as New Revision</button>
          </div>
        )}
      </div>
      <div key={appMountKey}>{children}</div>
      {settingsOpen && renderSettingsModal()}
    </div>
  );
}
