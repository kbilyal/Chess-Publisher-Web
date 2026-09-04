import React, { createContext, ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Tournament } from '../types';
import { cloudApi, CloudApiError } from './cloudWorkspaceApi';
import { hubApi, HubApiError } from './hubApi';
import { buildPublicHubSnapshot } from './publicHubSnapshot';
import {
  buildPrivateSnapshot,
  chooseInternalTournamentId,
  classifyThreeWay,
  ensureLocalIdentity,
  extractPrivateTournament,
  fingerprintTournament,
  preserveInstallationLocalFields,
  withUpdatedBase
} from './onlineCloudSync';
import { CloudSyncCoordinator } from './CloudSyncCoordinator';
import {
  decideAutomaticSync,
  findOwnedContinuationTournament,
  parseContinuationHint,
  stripContinuationHint
} from './browserSyncPolicy';

const TOURNAMENT_STORAGE_KEY = 'fide_tournament_manager_v2';
const TOKEN_SESSION_KEY = 'cpstudio.organizerToken.session';
const TOKEN_LOCAL_KEY = 'cpstudio.organizerToken.remembered';
const DEVICE_KEY = 'cpstudio.cloud.device.v1';
const FINGERPRINT_SCHEMA = 5;
const AUTOSYNC_DELAY_MS = 1000;

type CloudTournamentMeta = {
  id: string;
  localKey?: string;
  name?: string;
  revision?: number;
  checksum?: string;
  updatedAt?: string;
  [key: string]: any;
};

type StatusKind = 'ok' | 'busy' | 'warn' | 'offline';

type OnlineCloudContextValue = {
  token: string;
  organizerName: string;
  activeCloud: CloudTournamentMeta | null;
  cloudTournaments: CloudTournamentMeta[];
  status: string;
  statusKind: StatusKind;
  busy: boolean;
  conflict: boolean;
  remoteChangesAvailable: boolean;
  cloudDirty: boolean;
  autoBackup: boolean;
  lastSyncAt: string;
  logs: string[];
  publicState: any;
  pullChanges: (tournament: Tournament) => Promise<void>;
  syncNow: (tournament: Tournament) => Promise<void>;
  backupNow: (tournament: Tournament) => Promise<void>;
  setAutoBackup: (enabled: boolean, tournament: Tournament) => void;
  publishOnline: (tournament: Tournament) => Promise<void>;
  openPublicPage: (tournament: Tournament) => void;
  refreshHistory: () => Promise<any[]>;
  restorePrivateRevision: (revision: number) => Promise<void>;
  apiHealth: () => Promise<any>;
  uploadRegulations: (tournament: Tournament, file: File) => Promise<void>;
  deletePublicTournament: (tournament: Tournament) => Promise<void>;
  restorePublicTournament: (tournament: Tournament) => Promise<void>;
  returnToCloudList: () => Promise<void>;
  signOut: () => void;
};

const OnlineCloudContext = createContext<OnlineCloudContextValue | null>(null);
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const text = (value: unknown) => value == null ? '' : String(value).trim();
const normalizeOrganizerToken = (value: unknown) => text(value)
  .replace(/^Bearer\s+/i, '')
  .replace(/^['"]|['"]$/g, '')
  .trim();

function browserDevice() {
  try {
    const current = JSON.parse(localStorage.getItem(DEVICE_KEY) || 'null');
    if (current?.id) return current as { id: string; label: string };
  } catch { /* ignore */ }
  const id = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  const next = { id: `web-install:${id}`, label: 'Chess-Publisher Web' };
  localStorage.setItem(DEVICE_KEY, JSON.stringify(next));
  return next;
}

function readLocalTournament(): Tournament | null {
  const raw = localStorage.getItem(TOURNAMENT_STORAGE_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); }
  catch { return null; }
}

function tournamentName(tournament: Tournament | any) {
  return text(tournament?.name || tournament?.settings?.eventName || 'Tournament');
}

function publicPageUrl(tournament: Tournament | any) {
  const explicit = text(tournament?.online?.publicPageUrl);
  if (explicit) return explicit;
  const slug = text(tournament?.online?.publicSlug);
  return slug ? `https://chess-publisher.org/tournaments?id=${encodeURIComponent(slug)}` : '';
}

function withBrowserBase(tournament: Tournament | any, cloudTournamentId: string, revision: number, fingerprint: string) {
  const next: any = withUpdatedBase(tournament, cloudTournamentId, revision, fingerprint);
  next.cloud = {
    ...(next.cloud || {}),
    schemaVersion: 4,
    fingerprintSchema: FINGERPRINT_SCHEMA,
    cloudTournamentId,
    baseRevision: revision,
    baseFingerprint: fingerprint,
    lastSyncAt: new Date().toISOString(),
    autoBackup: true
  };
  return next as Tournament;
}

export function useOnlineCloud() {
  const value = useContext(OnlineCloudContext);
  if (!value) throw new Error('Online & Cloud context is unavailable.');
  return value;
}

export function OnlineCloudProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<'login' | 'select' | 'app'>('login');
  const [token, setToken] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [rememberToken, setRememberToken] = useState(false);
  const [workspace, setWorkspace] = useState<any>(null);
  const [cloudTournaments, setCloudTournaments] = useState<CloudTournamentMeta[]>([]);
  const [activeCloud, setActiveCloud] = useState<CloudTournamentMeta | null>(null);
  const [status, setStatus] = useState('Organizer Token required');
  const [statusKind, setStatusKind] = useState<StatusKind>('warn');
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [remoteChangesAvailable, setRemoteChangesAvailable] = useState(false);
  const [cloudDirty, setCloudDirty] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState('');
  const [appKey, setAppKey] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [publicState, setPublicState] = useState<any>(null);

  const tokenRef = useRef('');
  const activeRef = useRef<CloudTournamentMeta | null>(null);
  const phaseRef = useRef(phase);
  const conflictRef = useRef(false);
  const coordinatorRef = useRef(new CloudSyncCoordinator());
  const lastObservedRawRef = useRef('');
  const continuationHintRef = useRef(typeof window !== 'undefined' ? parseContinuationHint(window.location.search) : '');
  const operationNameRef = useRef('');

  useEffect(() => { tokenRef.current = token; }, [token]);
  useEffect(() => { activeRef.current = activeCloud; }, [activeCloud]);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { conflictRef.current = conflict; }, [conflict]);

  const organizerName = useMemo(
    () => workspace?.organizer?.displayName || workspace?.organizer?.name || 'Organizer',
    [workspace]
  );

  function log(message: string) {
    const line = `${new Date().toLocaleTimeString()}  ${message}`;
    setLogs(current => [line, ...current].slice(0, 120));
  }

  function commitLocal(tournament: Tournament, remount = false) {
    localStorage.setItem(TOURNAMENT_STORAGE_KEY, JSON.stringify(tournament));
    lastObservedRawRef.current = localStorage.getItem(TOURNAMENT_STORAGE_KEY) || '';
    if (remount) setAppKey(value => value + 1);
  }

  async function refreshWorkspace(currentToken = tokenRef.current) {
    const [ws, list] = await Promise.all([
      cloudApi.workspace(currentToken),
      cloudApi.listTournaments(currentToken)
    ]);
    setWorkspace(ws);
    const tournaments = list?.tournaments || [];
    setCloudTournaments(tournaments);
    return tournaments as CloudTournamentMeta[];
  }

  function chooseExistingRemote(tournament: Tournament | any, list = cloudTournaments) {
    const cloudId = text(tournament?.cloud?.cloudTournamentId);
    if (cloudId) {
      const byId = list.find(item => item.id === cloudId);
      if (byId) return byId;
    }
    const internalId = chooseInternalTournamentId(tournament);
    return list.find(item => text(item.localKey) === internalId) || null;
  }

  async function getCloudState(remote: CloudTournamentMeta) {
    const metaResult = await cloudApi.getTournament(tokenRef.current, remote.id);
    const remoteMeta = metaResult?.tournament || remote;
    const revision = Number(remoteMeta?.revision || 0);
    if (revision <= 0) return { meta: remoteMeta, revision: 0, tournament: null as Tournament | null, fingerprint: '' };
    const current = await cloudApi.getSnapshot(tokenRef.current, remote.id);
    const parsed = extractPrivateTournament(current?.snapshot, remoteMeta?.name || remote.name || '');
    const fingerprint = await fingerprintTournament(parsed.tournament);
    return {
      meta: current?.tournament || remoteMeta,
      revision: Number(current?.tournament?.revision || revision),
      tournament: parsed.tournament,
      fingerprint
    };
  }

  async function resolveBaseFingerprint(tournament: Tournament | any, remoteId: string) {
    const cloud = tournament?.cloud || {};
    const stored = text(cloud.baseFingerprint);
    const schema = Number(cloud.fingerprintSchema || 0);
    if (stored && schema === FINGERPRINT_SCHEMA) return stored;

    const baseRevision = Number(cloud.baseRevision || 0);
    if (baseRevision <= 0) return '';
    try {
      const historical = await cloudApi.getRevisionSnapshot(tokenRef.current, remoteId, baseRevision);
      const parsed = extractPrivateTournament(historical?.snapshot, tournamentName(tournament));
      return await fingerprintTournament(parsed.tournament);
    } catch {
      return '';
    }
  }

  async function ensureCloudLink(tournament: Tournament) {
    let list = cloudTournaments;
    let remote = chooseExistingRemote(tournament, list) || activeRef.current;
    if (remote) return remote;

    list = await refreshWorkspace();
    remote = chooseExistingRemote(tournament, list);
    if (remote) {
      setActiveCloud(remote);
      activeRef.current = remote;
      return remote;
    }

    const internalId = chooseInternalTournamentId(tournament);
    const created = await cloudApi.createTournament(tokenRef.current, {
      localKey: internalId,
      name: tournamentName(tournament),
      deviceId: browserDevice().id,
      deviceLabel: browserDevice().label
    });
    remote = created?.tournament;
    if (!remote?.id) throw new Error('Cloud Workspace did not return a tournament ID.');
    setCloudTournaments(current => [remote!, ...current.filter(item => item.id !== remote!.id)]);
    setActiveCloud(remote);
    activeRef.current = remote;
    log(`Created private Cloud Workspace link ${remote.id}.`);
    return remote;
  }

  async function runQueued<T>(name: string, operation: () => Promise<T>, foreground = false) {
    return coordinatorRef.current.enqueue(async () => {
      operationNameRef.current = name;
      if (foreground) setBusy(true);
      try { return await operation(); }
      finally {
        operationNameRef.current = '';
        if (foreground) setBusy(false);
      }
    });
  }

  async function safeAutomaticSync() {
    const local = readLocalTournament();
    if (!local || !tokenRef.current || phaseRef.current !== 'app') return;
    if (conflictRef.current) return;

    setStatus('Syncing Cloud…');
    setStatusKind('busy');

    try {
      const seeded = ensureLocalIdentity(local, {
        internalIdCandidates: [(local as any)?.online?.hubTournamentId]
      });
      commitLocal(seeded, false);
      const localFingerprint = await fingerprintTournament(seeded);
      const remote = await ensureCloudLink(seeded);
      const cloud = await getCloudState(remote);

      if (cloud.revision === 0 || !cloud.tournament) {
        const saved = await cloudApi.putSnapshot(tokenRef.current, remote.id, 0, buildPrivateSnapshot(tournamentName(seeded), seeded), browserDevice());
        const revision = Number(saved?.revision || 1);
        const updated = withBrowserBase(seeded, remote.id, revision, localFingerprint);
        commitLocal(updated, false);
        setActiveCloud({ ...remote, revision });
        activeRef.current = { ...remote, revision };
        setConflict(false);
        conflictRef.current = false;
        setRemoteChangesAvailable(false);
        setCloudDirty(false);
        setLastSyncAt(updated.cloud?.lastSyncAt || '');
        setStatus(`Synced · r${revision}`);
        setStatusKind('ok');
        log(`Automatic Cloud Sync created r${revision}.`);
        return;
      }

      let baseFingerprint = await resolveBaseFingerprint(seeded, remote.id);
      if (!baseFingerprint) {
        if (localFingerprint === cloud.fingerprint) {
          baseFingerprint = cloud.fingerprint;
        } else {
          setConflict(true);
          conflictRef.current = true;
          setCloudDirty(true);
          setStatus('Conflict — common base unavailable; Pull Changes required');
          setStatusKind('warn');
          log('Automatic Cloud Sync failed closed because common base could not be reconstructed.');
          return;
        }
      }

      const decision = decideAutomaticSync(localFingerprint, baseFingerprint, cloud.fingerprint);
      if (decision === 'equal') {
        const updated = withBrowserBase(seeded, remote.id, cloud.revision, cloud.fingerprint);
        commitLocal(updated, false);
        setActiveCloud({ ...remote, ...cloud.meta, revision: cloud.revision });
        activeRef.current = { ...remote, ...cloud.meta, revision: cloud.revision };
        setConflict(false);
        conflictRef.current = false;
        setRemoteChangesAvailable(false);
        setCloudDirty(false);
        setLastSyncAt(updated.cloud?.lastSyncAt || '');
        setStatus(`Synced · r${cloud.revision}`);
        setStatusKind('ok');
        return;
      }

      if (decision === 'remote-available') {
        setRemoteChangesAvailable(true);
        setCloudDirty(false);
        setStatus(`Cloud changes available · r${cloud.revision} — Pull Changes`);
        setStatusKind('warn');
        log(`Automatic Cloud Sync detected remote-only changes at r${cloud.revision}; no background pull occurred.`);
        return;
      }

      if (decision === 'conflict') {
        setConflict(true);
        conflictRef.current = true;
        setRemoteChangesAvailable(true);
        setCloudDirty(true);
        setStatus('Conflict — local and Cloud both changed; no overwrite');
        setStatusKind('warn');
        log('Automatic Cloud Sync detected a true two-sided conflict; both copies were preserved.');
        return;
      }

      const saved = await cloudApi.putSnapshot(
        tokenRef.current,
        remote.id,
        cloud.revision,
        buildPrivateSnapshot(tournamentName(seeded), seeded),
        browserDevice()
      );
      const revision = Number(saved?.revision || cloud.revision + 1);
      const updated = withBrowserBase(seeded, remote.id, revision, localFingerprint);
      commitLocal(updated, false);
      setActiveCloud({ ...remote, ...cloud.meta, revision });
      activeRef.current = { ...remote, ...cloud.meta, revision };
      setConflict(false);
      conflictRef.current = false;
      setRemoteChangesAvailable(false);
      setCloudDirty(false);
      setLastSyncAt(updated.cloud?.lastSyncAt || '');
      setStatus(`Synced · r${revision}`);
      setStatusKind('ok');
      log(`Automatic Cloud Sync uploaded local changes as r${revision}.`);
    } catch (error: any) {
      if (error instanceof CloudApiError && error.code === 'cloud_revision_conflict') {
        setRemoteChangesAvailable(true);
        setCloudDirty(true);
        setStatus('Cloud changed during sync — Pull Changes required');
        setStatusKind('warn');
        log('Optimistic revision gate stopped a stale automatic upload.');
        return;
      }
      setCloudDirty(true);
      setStatus(error?.code === 'network_error' ? 'Saved locally — Cloud sync pending' : (error?.message || 'Cloud sync failed.'));
      setStatusKind(error?.code === 'network_error' ? 'offline' : 'warn');
      log(`Automatic Cloud Sync error: ${error?.message || error}`);
    }
  }

  function scheduleAutomaticSync() {
    if (!tokenRef.current || phaseRef.current !== 'app' || conflictRef.current) return;
    coordinatorRef.current.schedule(() => safeAutomaticSync(), AUTOSYNC_DELAY_MS);
  }

  async function pullChanges(tournamentInput: Tournament) {
    coordinatorRef.current.cancelScheduled();
    setStatus(operationNameRef.current ? 'Pull Changes queued…' : 'Pull Changes…');
    setStatusKind('busy');

    await runQueued('Pull Changes', async () => {
      try {
        const current = readLocalTournament() || tournamentInput;
        const seeded = ensureLocalIdentity(current, {
          internalIdCandidates: [(current as any)?.online?.hubTournamentId]
        });
        commitLocal(seeded, false);
        const localFingerprint = await fingerprintTournament(seeded);
        const remote = await ensureCloudLink(seeded);
        const cloud = await getCloudState(remote);

        if (cloud.revision === 0 || !cloud.tournament) {
          const saved = await cloudApi.putSnapshot(tokenRef.current, remote.id, 0, buildPrivateSnapshot(tournamentName(seeded), seeded), browserDevice());
          const revision = Number(saved?.revision || 1);
          const updated = withBrowserBase(seeded, remote.id, revision, localFingerprint);
          commitLocal(updated, true);
          setActiveCloud({ ...remote, revision });
          activeRef.current = { ...remote, revision };
          setConflict(false);
          conflictRef.current = false;
          setRemoteChangesAvailable(false);
          setCloudDirty(false);
          setLastSyncAt(updated.cloud?.lastSyncAt || '');
          setStatus(`Local changes pushed · r${revision}`);
          setStatusKind('ok');
          return;
        }

        let baseFingerprint = await resolveBaseFingerprint(seeded, remote.id);
        if (!baseFingerprint) {
          if (localFingerprint === cloud.fingerprint) baseFingerprint = cloud.fingerprint;
          else {
            setConflict(true);
            conflictRef.current = true;
            setStatus('Conflict — common base unavailable; no overwrite');
            setStatusKind('warn');
            return;
          }
        }

        const decision = classifyThreeWay(localFingerprint, baseFingerprint, cloud.fingerprint);
        if (decision === 'cloud-only') {
          const pulled = preserveInstallationLocalFields(cloud.tournament, seeded, {
            cloudTournamentId: remote.id,
            baseRevision: cloud.revision,
            baseFingerprint: cloud.fingerprint
          }) as any;
          pulled.cloud = {
            ...(pulled.cloud || {}),
            fingerprintSchema: FINGERPRINT_SCHEMA,
            autoBackup: true,
            lastSyncAt: new Date().toISOString()
          };
          commitLocal(pulled, true);
          setActiveCloud({ ...remote, ...cloud.meta, revision: cloud.revision });
          activeRef.current = { ...remote, ...cloud.meta, revision: cloud.revision };
          setConflict(false);
          conflictRef.current = false;
          setRemoteChangesAvailable(false);
          setCloudDirty(false);
          setLastSyncAt(pulled.cloud.lastSyncAt);
          setStatus(`Cloud changes pulled · r${cloud.revision}`);
          setStatusKind('ok');
          log(`Pull Changes loaded cloud-only changes from r${cloud.revision}.`);
          return;
        }

        if (decision === 'local-only') {
          const saved = await cloudApi.putSnapshot(tokenRef.current, remote.id, cloud.revision, buildPrivateSnapshot(tournamentName(seeded), seeded), browserDevice());
          const revision = Number(saved?.revision || cloud.revision + 1);
          const updated = withBrowserBase(seeded, remote.id, revision, localFingerprint);
          commitLocal(updated, true);
          setActiveCloud({ ...remote, ...cloud.meta, revision });
          activeRef.current = { ...remote, ...cloud.meta, revision };
          setConflict(false);
          conflictRef.current = false;
          setRemoteChangesAvailable(false);
          setCloudDirty(false);
          setLastSyncAt(updated.cloud?.lastSyncAt || '');
          setStatus(`Local changes pushed · r${revision}`);
          setStatusKind('ok');
          log(`Pull Changes pushed local-only changes as r${revision}.`);
          return;
        }

        if (decision === 'equal') {
          const updated = withBrowserBase(seeded, remote.id, cloud.revision, cloud.fingerprint);
          commitLocal(updated, false);
          setActiveCloud({ ...remote, ...cloud.meta, revision: cloud.revision });
          activeRef.current = { ...remote, ...cloud.meta, revision: cloud.revision };
          setConflict(false);
          conflictRef.current = false;
          setRemoteChangesAvailable(false);
          setCloudDirty(false);
          setLastSyncAt(updated.cloud?.lastSyncAt || '');
          setStatus(`Synced · r${cloud.revision}`);
          setStatusKind('ok');
          return;
        }

        setConflict(true);
        conflictRef.current = true;
        setRemoteChangesAvailable(true);
        setCloudDirty(true);
        setStatus(`Conflict — local and Cloud changed since common base r${Number((seeded as any)?.cloud?.baseRevision || 0)}`);
        setStatusKind('warn');
        log('Pull Changes detected a true two-sided conflict; no overwrite occurred.');
      } catch (error: any) {
        setCloudDirty(true);
        setStatus(error?.code === 'network_error' ? 'Saved locally — Cloud sync pending' : (error?.message || 'Pull Changes failed.'));
        setStatusKind(error?.code === 'network_error' ? 'offline' : 'warn');
        log(`Pull Changes error: ${error?.message || error}`);
      }
    }, true);
  }

  async function syncNow(tournamentInput: Tournament) {
    coordinatorRef.current.cancelScheduled();
    const current = readLocalTournament() || tournamentInput;
    commitLocal(current, false);
    setCloudDirty(true);
    await runQueued('Sync Now', safeAutomaticSync, true);
  }

  async function backupNow(tournamentInput: Tournament) {
    await syncNow(tournamentInput);
  }

  function setAutoBackup(_enabled: boolean, tournamentInput: Tournament) {
    const seeded: any = ensureLocalIdentity(tournamentInput);
    seeded.cloud = { ...(seeded.cloud || {}), autoBackup: true };
    commitLocal(seeded, false);
    setStatus('Automatic Cloud Sync is always ON in the browser.');
    setStatusKind('ok');
  }

  async function openCloud(meta: CloudTournamentMeta) {
    await runQueued('Open Cloud Tournament', async () => {
      setBusy(true);
      setStatus('Loading cloud tournament…');
      setStatusKind('busy');
      try {
        const result = await cloudApi.getSnapshot(tokenRef.current, meta.id);
        const parsed = extractPrivateTournament(result?.snapshot, meta.name || '');
        const current = readLocalTournament();
        const cloudFingerprint = await fingerprintTournament(parsed.tournament);
        const remoteRevision = Number(result?.tournament?.revision ?? meta.revision ?? 0);
        const loaded: any = preserveInstallationLocalFields(parsed.tournament, current, {
          cloudTournamentId: meta.id,
          baseRevision: remoteRevision,
          baseFingerprint: cloudFingerprint
        });
        loaded.cloud = {
          ...(loaded.cloud || {}),
          schemaVersion: 4,
          fingerprintSchema: FINGERPRINT_SCHEMA,
          autoBackup: true,
          lastSyncAt: new Date().toISOString()
        };
        setActiveCloud({ ...meta, revision: remoteRevision, localKey: result?.tournament?.localKey || meta.localKey });
        activeRef.current = { ...meta, revision: remoteRevision };
        setConflict(false);
        conflictRef.current = false;
        setRemoteChangesAvailable(false);
        setCloudDirty(false);
        setLastSyncAt(loaded.cloud.lastSyncAt);
        commitLocal(loaded, true);
        setPhase('app');
        phaseRef.current = 'app';
        setStatus(`Synced · r${remoteRevision}`);
        setStatusKind('ok');
        log(`Opened private cloud tournament at revision ${remoteRevision}.`);
        if (
          continuationHintRef.current &&
          (continuationHintRef.current === meta.id || continuationHintRef.current === meta.localKey) &&
          typeof window !== 'undefined'
        ) {
          continuationHintRef.current = '';
          window.history.replaceState({}, '', stripContinuationHint(window.location.href));
        }
      } finally {
        setBusy(false);
      }
    });
  }

  async function continueWithLocal() {
    const local = readLocalTournament();
    if (!local) {
      setStatus('No local tournament is available.');
      setStatusKind('warn');
      return;
    }
    const remote = chooseExistingRemote(local);
    const identity: any = ensureLocalIdentity(local, {
      internalIdCandidates: [remote?.localKey, remote?.id],
      cloudTournamentId: remote?.id
    });
    identity.cloud = { ...(identity.cloud || {}), schemaVersion: 4, autoBackup: true };
    setActiveCloud(remote);
    activeRef.current = remote;
    setConflict(false);
    conflictRef.current = false;
    setRemoteChangesAvailable(false);
    setCloudDirty(true);
    commitLocal(identity, true);
    setPhase('app');
    phaseRef.current = 'app';
    setStatus(remote ? `Cloud linked · r${Number(remote.revision || 0)} · syncing…` : 'Local tournament · creating Cloud link…');
    setStatusKind('busy');
    coordinatorRef.current.schedule(() => safeAutomaticSync(), 50);
  }

  async function loginWithToken(candidateRaw: string, remember: boolean) {
    const candidate = normalizeOrganizerToken(candidateRaw);
    if (!candidate) return;
    setBusy(true);
    setStatus('Checking Organizer Token…');
    setStatusKind('busy');
    try {
      tokenRef.current = candidate;
      const list = await refreshWorkspace(candidate);
      setToken(candidate);
      sessionStorage.setItem(TOKEN_SESSION_KEY, candidate);
      if (remember) localStorage.setItem(TOKEN_LOCAL_KEY, candidate);
      else localStorage.removeItem(TOKEN_LOCAL_KEY);
      setRememberToken(remember);
      setStatus('Connected');
      setStatusKind('ok');
      log('Organizer Cloud Workspace connected.');

      const hint = continuationHintRef.current;
      if (hint) {
        // Resolve only after token authentication and only within the returned
        // organizer-owned list. Desktop may pass the record ID or internalId
        // (returned by the API as localKey).
        const owned = findOwnedContinuationTournament(list, hint);
        if (owned) {
          setPhase('select');
          phaseRef.current = 'select';
          await openCloud(owned);
          return;
        }
        setStatus('Requested tournament is unavailable in this Organizer Workspace.');
        setStatusKind('warn');
      }
      setPhase('select');
      phaseRef.current = 'select';
    } catch (error: any) {
      tokenRef.current = '';
      setStatus(error?.message || 'Organizer Token could not be verified.');
      setStatusKind(error?.code === 'network_error' ? 'offline' : 'warn');
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

  useEffect(() => {
    if (phase !== 'app') return;
    lastObservedRawRef.current = localStorage.getItem(TOURNAMENT_STORAGE_KEY) || '';
    const timer = window.setInterval(() => {
      const raw = localStorage.getItem(TOURNAMENT_STORAGE_KEY) || '';
      if (!raw || raw === lastObservedRawRef.current) return;
      lastObservedRawRef.current = raw;
      const local = readLocalTournament();
      if (!local) return;
      setCloudDirty(true);
      if (!conflictRef.current) {
        setStatus(navigator.onLine ? 'Saved locally · Cloud sync pending' : 'Saved locally — Cloud sync pending');
        setStatusKind(navigator.onLine ? 'busy' : 'offline');
        scheduleAutomaticSync();
      }
    }, 300);
    return () => window.clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'app') return;
    const onOnline = () => {
      if (!cloudDirty || conflictRef.current) return;
      setStatus('Connection restored · checking Cloud revision…');
      setStatusKind('busy');
      coordinatorRef.current.schedule(() => safeAutomaticSync(), 150);
    };
    const onOffline = () => {
      setStatus('Offline · changes are saved locally');
      setStatusKind('offline');
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [phase, cloudDirty]);

  async function publishOnline(tournamentInput: Tournament) {
    await runQueued('Publish Online', async () => {
      try {
        setStatus('Publishing Online…');
        setStatusKind('busy');
        let tournament: any = ensureLocalIdentity(readLocalTournament() || tournamentInput, {
          internalIdCandidates: [(tournamentInput as any)?.online?.hubTournamentId]
        });
        commitLocal(tournament, false);
        const internalId = chooseInternalTournamentId(tournament);
        const listed = await hubApi.listOrganizerTournaments(tokenRef.current);
        let hub = (listed?.tournaments || []).find((item: any) =>
          item.id === tournament?.online?.hubTournamentId || text(item.localKey) === internalId
        );

        if (!hub) {
          const created = await hubApi.createOrganizerTournament(tokenRef.current, {
            localKey: internalId,
            name: tournamentName(tournament),
            status: 'registration',
            federation: /^[A-Z]{3}$/.test(String(tournament.settings?.country || '').toUpperCase()) ? String(tournament.settings.country).toUpperCase() : 'FID',
            roundsDeclared: Math.max(1, Number.parseInt(tournament.settings?.rounds || '1', 10) || 1),
            format: tournament.settings?.tournamentFormat || 'Individual Swiss',
            pairingSystem: tournament.settings?.pairingSystem || 'FIDE Dutch System',
            timeControl: tournament.settings?.timeControl || tournament.settings?.timeControlPreset || '',
            ratingType: tournament.settings?.tournamentRatingType || 'Unrated',
            fideRated: tournament.settings?.fideRated === 'Yes',
            city: tournament.settings?.city || '',
            startAt: tournament.settings?.startDate || null,
            endAt: tournament.settings?.endDate || null,
            isPublic: true
          });
          hub = created?.tournament;
        }

        if (!hub?.id) throw new Error('Tournament Hub did not return a tournament ID.');
        if (hub.deleted) await hubApi.restoreOwnedTournament(tokenRef.current, hub.id);
        const revision = Number(hub.revision || 0);
        const snapshot = buildPublicHubSnapshot(tournament, {
          hubTournamentId: hub.id,
          publicSlug: hub.publicSlug,
          revision
        });
        const published = await hubApi.publishOwnedTournament(tokenRef.current, hub.id, revision, snapshot);
        const publicSlug = text(published?.publicSlug || hub.publicSlug);
        const page = text(published?.publicPageUrl) || (publicSlug ? `https://chess-publisher.org/tournaments?id=${encodeURIComponent(publicSlug)}` : '');
        tournament.online = {
          ...(tournament.online || {}),
          hubTournamentId: hub.id,
          publicSlug,
          publicPageUrl: page,
          revision: Number(published?.revision || revision),
          lastPublishedAt: new Date().toISOString()
        };
        if (!text(tournament.cloud?.internalId) || String(tournament.cloud.internalId).startsWith('tournament:')) {
          tournament.cloud = { ...(tournament.cloud || {}), internalId: hub.id };
        }
        setPublicState(tournament.online);
        commitLocal(tournament, true);
        setStatus(`Published Online · r${tournament.online.revision}`);
        setStatusKind('ok');
        log(`Public Hub publish completed at revision ${tournament.online.revision}.`);
        scheduleAutomaticSync();
      } catch (error: any) {
        const message = error instanceof HubApiError && error.status === 404
          ? 'Hub owner-publish API is not deployed yet.'
          : (error?.message || 'Publish Online failed.');
        setStatus(message);
        setStatusKind(error?.code === 'network_error' ? 'offline' : 'warn');
        log(`Publish Online error: ${message}`);
      }
    }, true);
  }

  function openPublicPage(tournament: Tournament) {
    const url = publicPageUrl(readLocalTournament() || tournament);
    if (!url) {
      setStatus('Publish Online first to create a public page.');
      setStatusKind('warn');
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function refreshHistory() {
    const remote = activeRef.current || chooseExistingRemote(readLocalTournament());
    if (!remote) return [];
    const result = await cloudApi.revisions(tokenRef.current, remote.id);
    return result?.revisions || [];
  }

  async function restorePrivateRevision(revision: number) {
    const remote = activeRef.current || chooseExistingRemote(readLocalTournament());
    if (!remote) throw new Error('Private cloud tournament is not linked.');
    await runQueued('Restore Cloud Revision', async () => {
      await cloudApi.restore(tokenRef.current, remote.id, revision);
      await refreshWorkspace();
      setRemoteChangesAvailable(true);
      setStatus(`Cloud revision ${revision} restored remotely · Pull Changes required`);
      setStatusKind('warn');
      log(`Private cloud history restored from r${revision}; local content was not overwritten.`);
    }, true);
  }

  async function apiHealth() {
    const health = await hubApi.health();
    log(`API Health: ${health?.ok ? 'PASS' : 'FAIL'}.`);
    return health;
  }

  async function uploadRegulations(tournamentInput: Tournament, file: File) {
    const tournament: any = readLocalTournament() || tournamentInput;
    const id = text(tournament?.online?.hubTournamentId);
    if (!id) throw new Error('Publish Online first to create the public Hub tournament.');
    const uploaded = await hubApi.uploadOwnedRegulations(tokenRef.current, id, file);
    tournament.regulations = { ...(tournament.regulations || {}), attachment: uploaded?.file || null };
    commitLocal(tournament, true);
    setStatus('Regulations uploaded · synchronizing…');
    setStatusKind('busy');
    scheduleAutomaticSync();
  }

  async function deletePublicTournament(tournamentInput: Tournament) {
    const tournament: any = readLocalTournament() || tournamentInput;
    const id = text(tournament?.online?.hubTournamentId);
    const slug = text(tournament?.online?.publicSlug);
    if (!id || !slug) throw new Error('Public Hub tournament is not linked.');
    await hubApi.deleteOwnedTournament(tokenRef.current, id, slug);
    setStatus('Public tournament moved to recovery window');
    setStatusKind('warn');
    log('Public Hub tournament soft-deleted.');
  }

  async function restorePublicTournament(tournamentInput: Tournament) {
    const tournament: any = readLocalTournament() || tournamentInput;
    const id = text(tournament?.online?.hubTournamentId);
    if (!id) throw new Error('Public Hub tournament is not linked.');
    await hubApi.restoreOwnedTournament(tokenRef.current, id);
    setStatus('Public tournament restored');
    setStatusKind('ok');
    log('Public Hub tournament restored.');
  }

  async function returnToCloudList() {
    coordinatorRef.current.cancelScheduled();
    setPhase('select');
    phaseRef.current = 'select';
    await refreshWorkspace();
    setStatus('Connected');
    setStatusKind('ok');
  }

  function signOut() {
    coordinatorRef.current.cancelScheduled();
    sessionStorage.removeItem(TOKEN_SESSION_KEY);
    localStorage.removeItem(TOKEN_LOCAL_KEY);
    setToken('');
    tokenRef.current = '';
    setWorkspace(null);
    setCloudTournaments([]);
    setActiveCloud(null);
    activeRef.current = null;
    setPhase('login');
    phaseRef.current = 'login';
    setStatus('Organizer Token required');
    setStatusKind('warn');
    setConflict(false);
    conflictRef.current = false;
    setRemoteChangesAvailable(false);
  }

  const context: OnlineCloudContextValue = {
    token,
    organizerName,
    activeCloud,
    cloudTournaments,
    status,
    statusKind,
    busy,
    conflict,
    remoteChangesAvailable,
    cloudDirty,
    autoBackup: true,
    lastSyncAt,
    logs,
    publicState,
    pullChanges,
    syncNow,
    backupNow,
    setAutoBackup,
    publishOnline,
    openPublicPage,
    refreshHistory,
    restorePrivateRevision,
    apiHealth,
    uploadRegulations,
    deletePublicTournament,
    restorePublicTournament,
    returnToCloudList,
    signOut
  };

  if (phase === 'login') {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
        <div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl shadow-xl p-6 space-y-5">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Chess-Publisher Web</h1>
            <p className="text-sm text-slate-500 mt-1">Private Organizer Cloud Workspace</p>
          </div>
          <label className="block text-xs font-semibold text-slate-700">Organizer Token</label>
          <input
            type="password"
            value={tokenInput}
            onChange={event => setTokenInput(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter') void loginWithToken(tokenInput, rememberToken); }}
            className="w-full px-3 py-2.5 border border-slate-300 rounded-lg font-mono text-sm focus:outline-none focus:border-blue-500"
            autoComplete="off"
          />
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={rememberToken} onChange={event => setRememberToken(event.target.checked)} />
            Remember on this browser
          </label>
          <button disabled={busy || !tokenInput.trim()} onClick={() => void loginWithToken(tokenInput, rememberToken)} className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-sm">
            Connect
          </button>
          <div className={`text-xs ${statusKind === 'warn' || statusKind === 'offline' ? 'text-rose-700' : 'text-slate-500'}`}>{status}</div>
        </div>
      </div>
    );
  }

  if (phase === 'select') {
    const local = readLocalTournament();
    return (
      <div className="min-h-screen bg-slate-100 p-5 sm:p-8">
        <div className="max-w-5xl mx-auto space-y-5">
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex items-center justify-between gap-4">
            <div>
              <h1 className="text-lg font-bold text-slate-900">My Cloud Tournaments</h1>
              <p className="text-xs text-slate-500 mt-1">Connected organizer: {organizerName}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => void refreshWorkspace()} className="px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold bg-white hover:bg-slate-50">Refresh</button>
              <button onClick={signOut} className="px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold bg-white hover:bg-slate-50">Sign out</button>
            </div>
          </div>

          {local && (
            <button onClick={() => void continueWithLocal()} className="w-full text-left bg-blue-50 border border-blue-200 hover:border-blue-400 rounded-xl p-4 shadow-sm transition">
              <div className="text-xs uppercase tracking-wider text-blue-700 font-bold">This browser</div>
              <div className="font-semibold text-slate-900 mt-1">Continue local tournament: {tournamentName(local)}</div>
              <div className="text-xs text-slate-500 mt-1">Local save is immediate; Cloud sync starts automatically after opening.</div>
            </button>
          )}

          <div className="grid gap-3">
            {cloudTournaments.map(meta => (
              <button key={meta.id} onClick={() => void openCloud(meta)} className="text-left bg-white border border-slate-200 hover:border-blue-400 rounded-xl p-4 shadow-sm transition flex items-center justify-between gap-4">
                <div>
                  <div className="font-semibold text-slate-900">{meta.name || 'Tournament'}</div>
                  <div className="text-xs text-slate-500 mt-1 font-mono">{meta.id}</div>
                </div>
                <div className="text-xs font-mono text-slate-600">r{Number(meta.revision || 0)}</div>
              </button>
            ))}
            {!cloudTournaments.length && <div className="bg-white border border-slate-200 rounded-xl p-6 text-sm text-slate-500">No private cloud tournaments yet.</div>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <OnlineCloudContext.Provider value={context}>
      <div key={appKey}>{children}</div>
    </OnlineCloudContext.Provider>
  );
}
