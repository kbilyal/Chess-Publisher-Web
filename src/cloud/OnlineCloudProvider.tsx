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

const TOURNAMENT_STORAGE_KEY = 'fide_tournament_manager_v2';
const TOKEN_SESSION_KEY = 'cpstudio.organizerToken.session';
const TOKEN_LOCAL_KEY = 'cpstudio.organizerToken.remembered';
const DEVICE_KEY = 'cpstudio.cloud.device.v1';

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
  autoBackup: boolean;
  logs: string[];
  publicState: any;
  pullChanges: (tournament: Tournament) => Promise<void>;
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

function device() {
  try {
    const current = JSON.parse(localStorage.getItem(DEVICE_KEY) || 'null');
    if (current?.id) return current as { id: string; label: string };
  } catch { /* ignore */ }
  const id = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  const next = { id: `studio-web:${id}`, label: 'Chess-Publisher Web (Google AI Studio)' };
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
  const [appKey, setAppKey] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [publicState, setPublicState] = useState<any>(null);
  const [autoBackup, setAutoBackupState] = useState(false);

  const tokenRef = useRef('');
  const activeRef = useRef<CloudTournamentMeta | null>(null);
  const foregroundRef = useRef<string>('');
  const backgroundRef = useRef(false);
  const lastAutoSeenRef = useRef('');
  const autoChangedAtRef = useRef(0);

  useEffect(() => { tokenRef.current = token; }, [token]);
  useEffect(() => { activeRef.current = activeCloud; }, [activeCloud]);

  const organizerName = useMemo(
    () => workspace?.organizer?.displayName || workspace?.organizer?.name || 'Organizer',
    [workspace]
  );

  function log(message: string) {
    const line = `${new Date().toLocaleTimeString()}  ${message}`;
    setLogs(current => [line, ...current].slice(0, 120));
  }

  function commitLocal(tournament: Tournament, remount = true) {
    localStorage.setItem(TOURNAMENT_STORAGE_KEY, JSON.stringify(tournament));
    if (remount) setAppKey(value => value + 1);
  }

  async function refreshWorkspace(currentToken = tokenRef.current) {
    const [ws, list] = await Promise.all([
      cloudApi.workspace(currentToken),
      cloudApi.listTournaments(currentToken)
    ]);
    setWorkspace(ws);
    setCloudTournaments(list?.tournaments || []);
    return list?.tournaments || [];
  }

  async function loginWithToken(candidateRaw: string, remember: boolean) {
    const candidate = text(candidateRaw);
    if (!candidate) return;
    setBusy(true);
    setStatus('Checking Organizer Token…');
    setStatusKind('busy');
    try {
      await refreshWorkspace(candidate);
      setToken(candidate);
      tokenRef.current = candidate;
      sessionStorage.setItem(TOKEN_SESSION_KEY, candidate);
      if (remember) localStorage.setItem(TOKEN_LOCAL_KEY, candidate);
      else localStorage.removeItem(TOKEN_LOCAL_KEY);
      setRememberToken(remember);
      setPhase('select');
      setStatus('Connected');
      setStatusKind('ok');
      log('Organizer Cloud Workspace connected.');
    } catch (error: any) {
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

  function chooseExistingRemote(tournament: Tournament | any, list = cloudTournaments) {
    const cloudId = text(tournament?.cloud?.cloudTournamentId);
    if (cloudId) {
      const byId = list.find(item => item.id === cloudId);
      if (byId) return byId;
    }
    const internalId = chooseInternalTournamentId(tournament);
    return list.find(item => text(item.localKey) === internalId) || null;
  }

  async function continueWithLocal() {
    const local = readLocalTournament();
    if (!local) {
      setStatus('No local tournament is available.');
      setStatusKind('warn');
      return;
    }
    const remote = chooseExistingRemote(local);
    const identity = ensureLocalIdentity(local, {
      internalIdCandidates: [remote?.localKey, remote?.id],
      cloudTournamentId: remote?.id
    });
    setActiveCloud(remote);
    activeRef.current = remote;
    setAutoBackupState(identity.cloud?.autoBackup === true);
    setConflict(false);
    commitLocal(identity);
    setPhase('app');
    setStatus(remote ? `Cloud linked · r${Number(remote.revision || 0)}` : 'Local tournament · Cloud not linked yet');
    setStatusKind('ok');
  }

  async function openCloud(meta: CloudTournamentMeta) {
    setBusy(true);
    setStatus('Loading cloud tournament…');
    setStatusKind('busy');
    try {
      const result = await cloudApi.getSnapshot(tokenRef.current, meta.id);
      const parsed = extractPrivateTournament(result?.snapshot, meta.name || '');
      const current = readLocalTournament();
      const cloudFingerprint = await fingerprintTournament(parsed.tournament);
      const remoteRevision = Number(result?.tournament?.revision ?? meta.revision ?? 0);
      const loaded = preserveInstallationLocalFields(parsed.tournament, current, {
        cloudTournamentId: meta.id,
        baseRevision: remoteRevision,
        baseFingerprint: cloudFingerprint
      });
      setActiveCloud({ ...meta, revision: remoteRevision, localKey: result?.tournament?.localKey || meta.localKey });
      activeRef.current = { ...meta, revision: remoteRevision };
      setAutoBackupState(loaded.cloud?.autoBackup === true);
      setConflict(false);
      commitLocal(loaded);
      setPhase('app');
      setStatus(`Synced · r${remoteRevision}`);
      setStatusKind('ok');
      log(`Opened private cloud tournament at revision ${remoteRevision}.`);
    } catch (error: any) {
      setStatus(error?.message || 'Cloud tournament could not be opened.');
      setStatusKind(error?.code === 'network_error' ? 'offline' : 'warn');
    } finally {
      setBusy(false);
    }
  }

  async function ensureCloudLink(tournament: Tournament) {
    let list = cloudTournaments;
    let remote = chooseExistingRemote(tournament, list) || activeRef.current;
    if (remote) return remote;

    list = await refreshWorkspace();
    remote = chooseExistingRemote(tournament, list);
    if (remote) return remote;

    const internalId = chooseInternalTournamentId(tournament);
    const created = await cloudApi.createTournament(tokenRef.current, {
      localKey: internalId,
      name: tournamentName(tournament),
      deviceId: device().id,
      deviceLabel: device().label
    });
    remote = created?.tournament;
    if (!remote?.id) throw new Error('Cloud Workspace did not return a tournament ID.');
    setCloudTournaments(current => [remote!, ...current.filter(item => item.id !== remote!.id)]);
    setActiveCloud(remote);
    activeRef.current = remote;
    log(`Created private Cloud Workspace link ${remote.id}.`);
    return remote;
  }

  async function getCloudState(remote: CloudTournamentMeta) {
    const metaResult = await cloudApi.getTournament(tokenRef.current, remote.id);
    const remoteMeta = metaResult?.tournament || remote;
    const revision = Number(remoteMeta?.revision || 0);
    if (revision <= 0) return { meta: remoteMeta, revision: 0, snapshot: null, tournament: null, fingerprint: '' };
    const current = await cloudApi.getSnapshot(tokenRef.current, remote.id);
    const parsed = extractPrivateTournament(current?.snapshot, remoteMeta?.name || remote.name || '');
    const fingerprint = await fingerprintTournament(parsed.tournament);
    return { meta: current?.tournament || remoteMeta, revision: Number(current?.tournament?.revision || revision), snapshot: current?.snapshot, tournament: parsed.tournament, fingerprint };
  }

  async function resolveBaseFingerprint(tournament: Tournament | any, remoteId: string) {
    const stored = text(tournament?.cloud?.baseFingerprint);
    if (stored) return stored;
    const baseRevision = Number(tournament?.cloud?.baseRevision || 0);
    if (baseRevision <= 0) return '';
    try {
      const historical = await cloudApi.getRevisionSnapshot(tokenRef.current, remoteId, baseRevision);
      const parsed = extractPrivateTournament(historical?.snapshot, tournamentName(tournament));
      return await fingerprintTournament(parsed.tournament);
    } catch {
      return '';
    }
  }

  async function foreground<T>(name: string, fn: () => Promise<T>) {
    if (foregroundRef.current || backgroundRef.current) {
      throw new Error(`${foregroundRef.current || 'Cloud backup'} is already running.`);
    }
    foregroundRef.current = name;
    setBusy(true);
    try { return await fn(); }
    finally {
      foregroundRef.current = '';
      setBusy(false);
    }
  }

  async function pullChanges(tournamentInput: Tournament) {
    try {
      await foreground('Pull Changes', async () => {
        setStatus('Pull Changes · saving local tournament…');
        setStatusKind('busy');

        // beta.4 rule: local persistence checkpoint happens before any cloud decision.
        const seeded = ensureLocalIdentity(tournamentInput, {
          internalIdCandidates: [tournamentInput?.online?.hubTournamentId]
        });
        commitLocal(seeded, false);
        const localFingerprint = await fingerprintTournament(seeded);
        const remote = await ensureCloudLink(seeded);
        const cloud = await getCloudState(remote);

        if (cloud.revision === 0 || !cloud.tournament) {
          const snapshot = buildPrivateSnapshot(tournamentName(seeded), seeded);
          const saved = await cloudApi.putSnapshot(tokenRef.current, remote.id, 0, snapshot, device());
          const revision = Number(saved?.revision || 1);
          const updated = withUpdatedBase(seeded, remote.id, revision, localFingerprint);
          setActiveCloud({ ...remote, revision });
          activeRef.current = { ...remote, revision };
          setConflict(false);
          commitLocal(updated);
          setStatus(`Local changes pushed · r${revision}`);
          setStatusKind('ok');
          log(`Pull Changes: remote was empty; pushed local content as r${revision}.`);
          return;
        }

        let baseFingerprint = await resolveBaseFingerprint(seeded, remote.id);
        if (!baseFingerprint) {
          if (localFingerprint === cloud.fingerprint) {
            baseFingerprint = cloud.fingerprint;
          } else {
            setConflict(true);
            setStatus('Conflict · common base is unavailable; no overwrite');
            setStatusKind('warn');
            log('Pull Changes failed closed because common base could not be reconstructed.');
            return;
          }
        }

        const decision = classifyThreeWay(localFingerprint, baseFingerprint, cloud.fingerprint);
        if (decision === 'cloud-only') {
          const pulled = preserveInstallationLocalFields(cloud.tournament, seeded, {
            cloudTournamentId: remote.id,
            baseRevision: cloud.revision,
            baseFingerprint: cloud.fingerprint
          });
          setActiveCloud({ ...remote, ...cloud.meta, revision: cloud.revision });
          activeRef.current = { ...remote, ...cloud.meta, revision: cloud.revision };
          setConflict(false);
          commitLocal(pulled);
          setStatus(`Cloud changes pulled · r${cloud.revision}`);
          setStatusKind('ok');
          log(`Pull Changes: cloud-only change loaded from r${cloud.revision}.`);
          return;
        }

        if (decision === 'local-only') {
          const outgoing = buildPrivateSnapshot(tournamentName(seeded), seeded);
          const saved = await cloudApi.putSnapshot(tokenRef.current, remote.id, cloud.revision, outgoing, device());
          const revision = Number(saved?.revision || cloud.revision);
          const updated = withUpdatedBase(seeded, remote.id, revision, localFingerprint);
          setActiveCloud({ ...remote, ...cloud.meta, revision });
          activeRef.current = { ...remote, ...cloud.meta, revision };
          setConflict(false);
          commitLocal(updated);
          setStatus(`Local changes pushed · r${revision}`);
          setStatusKind('ok');
          log(`Pull Changes: local-only change pushed as r${revision}.`);
          return;
        }

        if (decision === 'equal') {
          const updated = withUpdatedBase(seeded, remote.id, cloud.revision, cloud.fingerprint);
          setActiveCloud({ ...remote, ...cloud.meta, revision: cloud.revision });
          activeRef.current = { ...remote, ...cloud.meta, revision: cloud.revision };
          setConflict(false);
          commitLocal(updated);
          setStatus(`Synced · r${cloud.revision}`);
          setStatusKind('ok');
          log(`Pull Changes: content already equal; advanced common revision to r${cloud.revision} without PUT.`);
          return;
        }

        setConflict(true);
        setStatus(`Conflict · local and cloud changed since common base r${Number(seeded.cloud?.baseRevision || 0)} · no overwrite`);
        setStatusKind('warn');
        log('Pull Changes: true two-sided conflict; local and cloud were both preserved.');
      });
    } catch (error: any) {
      setStatus(error?.message || 'Pull Changes failed.');
      setStatusKind(error?.code === 'network_error' ? 'offline' : 'warn');
      log(`Pull Changes error: ${error?.message || error}`);
    }
  }

  async function pushOnlyBackup(tournamentInput: Tournament, background = false) {
    if (conflict) return;
    const seeded = ensureLocalIdentity(tournamentInput, {
      internalIdCandidates: [tournamentInput?.online?.hubTournamentId]
    });
    commitLocal(seeded, false);
    const localFingerprint = await fingerprintTournament(seeded);
    const remote = await ensureCloudLink(seeded);
    const cloud = await getCloudState(remote);

    if (cloud.revision === 0 || !cloud.tournament) {
      const saved = await cloudApi.putSnapshot(tokenRef.current, remote.id, 0, buildPrivateSnapshot(tournamentName(seeded), seeded), device());
      const revision = Number(saved?.revision || 1);
      const updated = withUpdatedBase(seeded, remote.id, revision, localFingerprint);
      setActiveCloud({ ...remote, revision });
      activeRef.current = { ...remote, revision };
      commitLocal(updated, !background);
      setStatus(`Backed up · r${revision}`);
      setStatusKind('ok');
      log(`Push-only backup created r${revision}.`);
      return;
    }

    let baseFingerprint = await resolveBaseFingerprint(seeded, remote.id);
    if (!baseFingerprint) {
      if (localFingerprint === cloud.fingerprint) {
        const updated = withUpdatedBase(seeded, remote.id, cloud.revision, cloud.fingerprint);
        commitLocal(updated, !background);
        setStatus(`Synced · r${cloud.revision}`);
        setStatusKind('ok');
        return;
      }
      setConflict(true);
      setStatus('Cloud changed or common base is missing · Pull Changes required');
      setStatusKind('warn');
      log('Push-only backup stopped; it never pulled or overwrote remote data.');
      return;
    }

    const decision = classifyThreeWay(localFingerprint, baseFingerprint, cloud.fingerprint);
    if (decision === 'equal') {
      const updated = withUpdatedBase(seeded, remote.id, cloud.revision, cloud.fingerprint);
      commitLocal(updated, !background);
      setStatus(`Synced · r${cloud.revision}`);
      setStatusKind('ok');
      return;
    }
    if (decision !== 'local-only') {
      setConflict(true);
      setStatus('Cloud has changes · Pull Changes required; automatic backup did not pull');
      setStatusKind('warn');
      log(`Push-only backup stopped on ${decision}; no overwrite.`);
      return;
    }

    const saved = await cloudApi.putSnapshot(tokenRef.current, remote.id, cloud.revision, buildPrivateSnapshot(tournamentName(seeded), seeded), device());
    const revision = Number(saved?.revision || cloud.revision);
    const updated = withUpdatedBase(seeded, remote.id, revision, localFingerprint);
    setActiveCloud({ ...remote, ...cloud.meta, revision });
    activeRef.current = { ...remote, ...cloud.meta, revision };
    commitLocal(updated, !background);
    setStatus(`Backed up · r${revision}`);
    setStatusKind('ok');
    log(`Push-only backup uploaded local changes as r${revision}.`);
  }

  async function backupNow(tournament: Tournament) {
    if (foregroundRef.current || backgroundRef.current) return;
    backgroundRef.current = true;
    setBusy(true);
    setStatus('Backing up local changes…');
    setStatusKind('busy');
    try { await pushOnlyBackup(tournament, false); }
    catch (error: any) {
      if (error instanceof CloudApiError && error.code === 'cloud_revision_conflict') {
        setConflict(true);
        setStatus('Conflict · cloud changed; no overwrite');
      } else {
        setStatus(error?.message || 'Cloud backup failed.');
      }
      setStatusKind(error?.code === 'network_error' ? 'offline' : 'warn');
    } finally {
      backgroundRef.current = false;
      setBusy(false);
    }
  }

  function setAutoBackup(enabled: boolean, tournament: Tournament) {
    const seeded: any = ensureLocalIdentity(tournament);
    seeded.cloud = { ...seeded.cloud, autoBackup: enabled };
    setAutoBackupState(enabled);
    commitLocal(seeded);
    log(`Automatic cloud backup ${enabled ? 'enabled (push-only)' : 'disabled'}.`);
  }

  useEffect(() => {
    if (phase !== 'app' || !autoBackup) return;
    const timer = window.setInterval(() => {
      if (foregroundRef.current || backgroundRef.current || conflict) return;
      const raw = localStorage.getItem(TOURNAMENT_STORAGE_KEY) || '';
      if (!raw) return;
      if (raw !== lastAutoSeenRef.current) {
        lastAutoSeenRef.current = raw;
        autoChangedAtRef.current = Date.now();
        return;
      }
      if (Date.now() - autoChangedAtRef.current < 2000) return;
      const local = readLocalTournament();
      if (!local) return;
      const base = text((local as any)?.cloud?.baseFingerprint);
      void fingerprintTournament(local).then(fp => {
        if (!base || fp === base || foregroundRef.current || backgroundRef.current || conflict) return;
        backgroundRef.current = true;
        void pushOnlyBackup(local, true)
          .catch((error: any) => {
            setStatus(error?.message || 'Automatic cloud backup failed.');
            setStatusKind(error?.code === 'network_error' ? 'offline' : 'warn');
          })
          .finally(() => { backgroundRef.current = false; });
      });
    }, 900);
    return () => window.clearInterval(timer);
  }, [phase, autoBackup, conflict]);

  async function publishOnline(tournamentInput: Tournament) {
    try {
      await foreground('Publish Online', async () => {
        setStatus('Publishing Online…');
        setStatusKind('busy');
        let tournament: any = ensureLocalIdentity(tournamentInput, {
          internalIdCandidates: [tournamentInput?.online?.hubTournamentId]
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
          log(`Smart Publish created public Hub tournament ${hub?.id}.`);
        }

        if (!hub?.id) throw new Error('Tournament Hub did not return a tournament ID.');
        if (hub.deleted) {
          await hubApi.restoreOwnedTournament(tokenRef.current, hub.id);
          hub.deleted = false;
        }
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
        // Hub logical ID becomes the preferred private logical identity on first link.
        if (!text(tournament.cloud?.internalId) || String(tournament.cloud.internalId).startsWith('tournament:')) {
          tournament.cloud = { ...(tournament.cloud || {}), internalId: hub.id };
        }
        setPublicState(tournament.online);
        commitLocal(tournament);
        setStatus(`Published Online · r${tournament.online.revision}`);
        setStatusKind('ok');
        log(`Public Hub publish completed at revision ${tournament.online.revision}.`);
      });
    } catch (error: any) {
      const message = error instanceof HubApiError && error.status === 404
        ? 'Hub owner-publish API is not deployed yet. Deploy Hub API beta.10, then retry.'
        : (error?.message || 'Publish Online failed.');
      setStatus(message);
      setStatusKind(error?.code === 'network_error' ? 'offline' : 'warn');
      log(`Publish Online error: ${message}`);
    }
  }

  function openPublicPage(tournament: Tournament) {
    const url = publicPageUrl(tournament);
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
    await cloudApi.restore(tokenRef.current, remote.id, revision);
    await refreshWorkspace();
    setStatus(`Cloud revision ${revision} restored remotely · use Pull Changes to reconcile`);
    setStatusKind('warn');
    log(`Private cloud history restored from r${revision}; local content was not overwritten.`);
  }

  async function apiHealth() {
    const health = await hubApi.health();
    log(`API Health: ${health?.ok ? 'PASS' : 'FAIL'}.`);
    return health;
  }

  async function uploadRegulations(tournamentInput: Tournament, file: File) {
    const id = text((tournamentInput as any)?.online?.hubTournamentId);
    if (!id) throw new Error('Publish Online first to create the public Hub tournament.');
    const uploaded = await hubApi.uploadOwnedRegulations(tokenRef.current, id, file);
    const tournament: any = clone(tournamentInput);
    tournament.regulations = { ...(tournament.regulations || {}), attachment: uploaded?.file || null };
    commitLocal(tournament);
    setStatus('Regulations uploaded · Publish Online to expose the new attachment');
    setStatusKind('ok');
    log(`Uploaded regulations file ${file.name}.`);
  }

  async function deletePublicTournament(tournament: Tournament) {
    const id = text((tournament as any)?.online?.hubTournamentId);
    const slug = text((tournament as any)?.online?.publicSlug);
    if (!id || !slug) throw new Error('Public Hub tournament is not linked.');
    await hubApi.deleteOwnedTournament(tokenRef.current, id, slug);
    setStatus('Public tournament moved to recovery window');
    setStatusKind('warn');
    log('Public Hub tournament soft-deleted.');
  }

  async function restorePublicTournament(tournament: Tournament) {
    const id = text((tournament as any)?.online?.hubTournamentId);
    if (!id) throw new Error('Public Hub tournament is not linked.');
    await hubApi.restoreOwnedTournament(tokenRef.current, id);
    setStatus('Public tournament restored');
    setStatusKind('ok');
    log('Public Hub tournament restored.');
  }

  async function returnToCloudList() {
    // Local state is already saved by App. Do not auto-push when leaving.
    setPhase('select');
    await refreshWorkspace();
    setStatus('Connected');
    setStatusKind('ok');
  }

  function signOut() {
    sessionStorage.removeItem(TOKEN_SESSION_KEY);
    localStorage.removeItem(TOKEN_LOCAL_KEY);
    setToken('');
    tokenRef.current = '';
    setWorkspace(null);
    setCloudTournaments([]);
    setActiveCloud(null);
    activeRef.current = null;
    setPhase('login');
    setStatus('Organizer Token required');
    setStatusKind('warn');
    setConflict(false);
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
    autoBackup,
    logs,
    publicState,
    pullChanges,
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
              <div className="text-xs text-slate-500 mt-1">No automatic cloud download will occur.</div>
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
