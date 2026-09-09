import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Cloud,
  ExternalLink,
  Globe2,
  RefreshCw,
  Send,
  Settings2,
  ShieldCheck,
  Smartphone,
  Users,
  WifiOff
} from 'lucide-react';
import { Tournament } from '../types';
import { createInitialEmptyTournament } from '../data/initialData';
import { chessResultsApi } from '../chessResults/api';
import { buildChessResultsXml } from '../chessResults/publication';
import { CompanionRegistration } from './CompanionRegistration';
import { CompanionSetup } from './CompanionSetup';

const STORAGE_KEY = 'fide_tournament_manager_v2';
type CompanionTab = 'setup' | 'players' | 'publish';
type BusyAction = 'sync' | 'pull' | 'hub' | 'cr-test' | 'cr-publish' | 'cr-admin' | null;

export type CompanionCloud = {
  activeCloud: any;
  status: string;
  statusKind: 'ok' | 'busy' | 'warn' | 'offline';
  busy: boolean;
  conflict: boolean;
  cloudDirty: boolean;
  syncNow: (tournament: Tournament) => Promise<void>;
  pullChanges: (tournament: Tournament) => Promise<any>;
  resolveConflict: (tournament: Tournament) => Promise<any>;
  resolveConflictWithStrategy: (tournament: Tournament, strategy: 'web' | 'cloud') => Promise<any>;
  checkStatus: (tournament: Tournament) => Promise<any>;
  publishOnline: (tournament: Tournament) => Promise<void>;
  openPublicPage: (tournament: Tournament) => void | Promise<void>;
  returnToCloudList: () => Promise<void>;
};

const isTnr = (value: unknown) => /^\d+$/.test(String(value || '').trim());
const newClientId = () => globalThis.crypto?.randomUUID?.() || `cp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const isSourceIdMismatch = (error: unknown) => /source[\s-]*id[\s\S]*not valid/i.test(String((error as any)?.message || error || ''));

function readTournament(): Tournament {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (error) {
    console.error('Could not read synchronized tournament state.', error);
  }
  return createInitialEmptyTournament('Tournament');
}

export function CompanionWorkspace({ cloud }: { cloud: CompanionCloud }) {
  const [tournament, setTournament] = useState<Tournament>(readTournament);
  const [activeTab, setActiveTab] = useState<CompanionTab>('setup');
  const [busy, setBusy] = useState<BusyAction>(null);
  const [message, setMessage] = useState('');
  const [messageKind, setMessageKind] = useState<'ok' | 'warn' | 'error'>('ok');
  const [sourceMismatchTnr, setSourceMismatchTnr] = useState('');
  const [pendingConflictFields, setPendingConflictFields] = useState<string[]>([]);
  const tournamentRef = useRef(tournament);
  const chessResultsPublishLockRef = useRef(false);

  useEffect(() => { tournamentRef.current = tournament; }, [tournament]);
  useEffect(() => { if (!cloud.conflict) setPendingConflictFields([]); }, [cloud.conflict]);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tournament));
  }, [tournament]);

  const updateTournament = (updater: (previous: Tournament) => Tournament) => {
    setTournament(previous => updater(previous));
  };

  const displayName = tournament.name?.trim() || 'Tournament';
  const cloudRevision = Number(cloud.activeCloud?.revision || (tournament as any)?.cloud?.baseRevision || 0);
  const publicHubSlug = String((tournament as any)?.online?.publicSlug || '').trim();
  const publicHubUrl = String((tournament as any)?.online?.publicPageUrl || '').trim()
    || (publicHubSlug ? `https://chess-publisher.org/tournaments?id=${encodeURIComponent(publicHubSlug)}` : '');
  const tnr = String(tournament.chessResults?.key || tournament.settings?.tnr || '').trim();

  const setupProgress = useMemo(() => {
    const required = [
      tournament.name,
      tournament.settings.country,
      tournament.settings.city,
      tournament.settings.startDate,
      tournament.settings.rounds,
      tournament.settings.timeControl,
      tournament.settings.tournamentFormat
    ];
    return Math.round((required.filter(value => String(value || '').trim()).length / required.length) * 100);
  }, [tournament]);

  const setNotice = (kind: 'ok' | 'warn' | 'error', text: string) => {
    setMessageKind(kind);
    setMessage(text);
  };

  const adoptSynchronizedTournament = () => {
    const synchronized = readTournament();
    setTournament(synchronized);
    tournamentRef.current = synchronized;
    return synchronized;
  };

  const persistTournament = (next: Tournament) => {
    setTournament(next);
    tournamentRef.current = next;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const unifiedSync = async () => {
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

  const resolveSyncConflict = async (strategy: 'safe' | 'web' | 'cloud' = 'safe') => {
    setBusy('pull');
    setMessage('');
    try {
      const result = strategy === 'safe'
      ? await cloud.resolveConflict(tournamentRef.current)
      : await cloud.resolveConflictWithStrategy(tournamentRef.current, strategy);
      adoptSynchronizedTournament();
      if (result?.kind === 'needs-choice') {
        const fields = Array.isArray(result.conflicts) ? result.conflicts : [];
        setPendingConflictFields(fields);
        const preview = fields.slice(0, 4).join(', ');
        const more = fields.length > 4 ? ` +${fields.length - 4} more` : '';
        setNotice('warn', `Same-field conflict${fields.length === 1 ? '' : 's'}: ${preview}${more}. Choose Keep Web or Use Cloud for the overlapping fields.`);
        return;
      }
      if (result?.kind === 'resolved' || result?.kind === 'not-conflicted') {
        setPendingConflictFields([]);
        if (strategy === 'web') {
          setNotice('ok', 'Conflict resolved. Web values were kept for overlapping fields and Cloud-only changes were merged. Push Web → Cloud when ready.');
        } else if (strategy === 'cloud') {
          setNotice('ok', 'Conflict resolved. Cloud values were kept for overlapping fields and Web-only changes were merged. Push Web → Cloud when ready.');
        } else {
          setNotice('ok', 'Safe conflict resolution completed where fields did not overlap. No same-field conflicts remain. Push Web → Cloud when ready.');
        }
        return;
      }
      setNotice('warn', 'Conflict is still protected because a common base could not be proven. Nothing was overwritten.');
    } catch (error: any) {
      setNotice('error', error?.message || 'Could not resolve the synchronization conflict safely.');
    } finally {
      setBusy(null);
    }
  };

  const publishHub = async () => {
    setBusy('hub');
    setMessage('');
    try {
      await cloud.syncNow(tournamentRef.current);
      const synchronized = adoptSynchronizedTournament();
      await cloud.publishOnline(synchronized);
      adoptSynchronizedTournament();
      setNotice('ok', 'Published to Chess-Publisher Online Hub.');
    } catch (error: any) {
      setNotice('error', error?.message || 'Online Hub publication failed.');
    } finally {
      setBusy(null);
    }
  };

  const testChessResults = async () => {
    setBusy('cr-test');
    setMessage('');
    try {
      const result = await chessResultsApi.test();
      setNotice('ok', result?.sidVerified ? 'Chess-Results bridge verified.' : 'Chess-Results bridge is reachable.');
    } catch (error: any) {
      setNotice('error', error?.message || 'Chess-Results bridge test failed.');
    } finally {
      setBusy(null);
    }
  };

  const createFreshChessResultsTnr = async () => {
    const oldKey = sourceMismatchTnr || tnr;
    if (!isTnr(oldKey) || chessResultsPublishLockRef.current) return;
    chessResultsPublishLockRef.current = true;
    setBusy('cr-publish');
    setMessage('');
    try {
      await cloud.syncNow(tournamentRef.current);
      const current = adoptSynchronizedTournament();
      const initial = buildChessResultsXml(current);
      const clientId = current.chessResults?.clientId || newClientId();
      const created = await chessResultsApi.create({
        tournament: current.name || '',
        federation: initial.federation,
        mode: current.settings.tournamentType,
        clientId
      });
      const freshKey = String(created?.key || '').trim();
      if (!isTnr(freshKey)) throw new Error('Chess-Results returned an invalid replacement TNR.');

      const prepared: Tournament = {
        ...current,
        settings: { ...current.settings, tnr: freshKey },
        chessResults: {
          ...current.chessResults,
          sourceId: Number(created?.sourceId || 21),
          clientId,
          key: freshKey,
          mode: current.settings.tournamentType,
          federation: String(created?.federation || initial.federation),
          createdAt: new Date().toISOString(),
          freshTnrRequired: false,
          lastError: '',
          uploadStatus: 'New Chess-Publisher TNR assigned — preparing upload'
        }
      };

      // GETKEY keys must be saved immediately, before the first upload attempt.
      persistTournament(prepared);

      const publication = buildChessResultsXml(prepared, { requireKey: true, key: freshKey });
      await chessResultsApi.publish({ key: freshKey, xml: publication.xml });
      const now = new Date().toISOString();
      const published: Tournament = {
        ...prepared,
        chessResults: {
          ...prepared.chessResults,
          key: freshKey,
          lastUpload: now,
          lastError: '',
          uploadStatus: 'Published / synced',
          publishCount: (prepared.chessResults?.publishCount || 0) + 1,
          activityLog: [
            { at: now, type: 'ok' as const, message: `Replaced incompatible TNR ${oldKey} with Chess-Publisher TNR ${freshKey}.` },
            { at: now, type: 'ok' as const, message: `Published TNR ${freshKey}: ${publication.players} players.` },
            ...(prepared.chessResults?.activityLog || [])
          ].slice(0, 120)
        }
      };
      persistTournament(published);
      await cloud.syncNow(published);
      adoptSynchronizedTournament();
      setSourceMismatchTnr('');
      setNotice('ok', `New Chess-Publisher TNR ${freshKey} created, published and synchronized.`);
    } catch (error: any) {
      setNotice('error', error?.message || 'Could not create a new Chess-Publisher TNR.');
    } finally {
      chessResultsPublishLockRef.current = false;
      setBusy(null);
    }
  };

  const publishChessResults = async () => {
    if (chessResultsPublishLockRef.current) return;
    chessResultsPublishLockRef.current = true;
    setBusy('cr-publish');
    setMessage('');
    setSourceMismatchTnr('');
    let attemptedKey = '';
    let transitionedFromTnr = '';
    try {
      const localBeforeSync = tournamentRef.current;
      const requestedModeBeforeSync = String(localBeforeSync.settings.tournamentType || '').trim().toLowerCase();
      const identityBeforeSync = {
        cloudTournamentId: String((localBeforeSync as any)?.cloud?.cloudTournamentId || '').trim(),
        internalId: String((localBeforeSync as any)?.cloud?.internalId || '').trim(),
        name: String(localBeforeSync.name || '').trim(),
        mode: requestedModeBeforeSync
      };
      const linkedKeyBeforeSync = String(localBeforeSync.chessResults?.key || localBeforeSync.settings?.tnr || '').trim();
      const linkedFederationBeforeSync = String(localBeforeSync.chessResults?.federation || '').trim().toUpperCase();
      const explicitLinkedModeBeforeSync = String(localBeforeSync.chessResults?.mode || '').trim().toLowerCase();
      const linkedModeBeforeSync = explicitLinkedModeBeforeSync
        || (linkedFederationBeforeSync === 'XXX' ? 'test' : isTnr(linkedKeyBeforeSync) ? 'real' : '');
      const modeChangedBeforeSync = isTnr(linkedKeyBeforeSync)
        && ['real', 'test'].includes(requestedModeBeforeSync)
        && ['real', 'test'].includes(linkedModeBeforeSync)
        && requestedModeBeforeSync !== linkedModeBeforeSync;
      const staleFreshIdentity = isTnr(linkedKeyBeforeSync) && localBeforeSync.chessResults?.freshTnrRequired === true;

      // Never synchronize a mixed identity such as settings=test with an old Real TNR.
      // Detach the old TNR first, synchronize that coherent transition, then obtain exactly one replacement key.
      if (modeChangedBeforeSync || staleFreshIdentity) {
        transitionedFromTnr = linkedKeyBeforeSync;
        const transitionMode = ['real', 'test'].includes(requestedModeBeforeSync) ? requestedModeBeforeSync : linkedModeBeforeSync;
        const transitionFederation = transitionMode === 'test'
          ? 'XXX'
          : String(localBeforeSync.settings.country || '').trim().toUpperCase();
        const transition: Tournament = {
          ...localBeforeSync,
          settings: { ...localBeforeSync.settings, tnr: '' },
          chessResults: {
            ...localBeforeSync.chessResults,
            key: '',
            mode: transitionMode,
            federation: transitionFederation,
            freshTnrRequired: true,
            lastError: '',
            uploadStatus: `Preparing one new ${transitionMode === 'test' ? 'Test' : 'Real'} Chess-Results TNR; previous TNR ${linkedKeyBeforeSync} is no longer active for this mode.`
          }
        };
        persistTournament(transition);
      }

      await cloud.syncNow(tournamentRef.current);
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
      let key = String(current.chessResults?.key || '').trim();
      let next = current;
      attemptedKey = key;
      const requestedMode = String(current.settings.tournamentType || '').trim().toLowerCase();
      const linkedFederation = String(current.chessResults?.federation || '').trim().toUpperCase();
      const explicitLinkedMode = String(current.chessResults?.mode || '').trim().toLowerCase();
      const linkedMode = explicitLinkedMode
        || (linkedFederation === 'XXX' ? 'test' : isTnr(key) ? 'real' : '');
      const modeChanged = isTnr(key)
        && ['real', 'test'].includes(requestedMode)
        && ['real', 'test'].includes(linkedMode)
        && requestedMode !== linkedMode;
      const requiresFreshTnr = Boolean(current.chessResults?.freshTnrRequired || modeChanged);
      const replacedKey = transitionedFromTnr || (requiresFreshTnr && isTnr(key) ? key : '');

      if (!isTnr(key) || requiresFreshTnr) {
        const clientId = current.chessResults?.clientId || newClientId();
        const created = await chessResultsApi.create({
          tournament: identityBeforeSync.name,
          federation: initial.federation,
          mode: identityBeforeSync.mode,
          clientId
        });
        key = String(created?.key || '').trim();
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
        next = {
          ...current,
          settings: { ...current.settings, tnr: key },
          chessResults: {
            ...current.chessResults,
            sourceId: Number(created?.sourceId || 21),
            clientId,
            key,
            mode: current.settings.tournamentType,
            federation: String(created?.federation || initial.federation),
            createdAt: new Date().toISOString(),
            freshTnrRequired: false,
            lastError: '',
            uploadStatus: replacedKey
              ? `Tournament mode changed — TNR ${replacedKey} replaced by ${key}; preparing upload`
              : 'TNR assigned — preparing upload'
          }
        };
        persistTournament(next);
      }

      const publication = buildChessResultsXml(next, { requireKey: true, key });
      await chessResultsApi.publish({ key, xml: publication.xml });
      const now = new Date().toISOString();
      const published: Tournament = {
        ...next,
        settings: { ...next.settings, tnr: key },
        chessResults: {
          ...next.chessResults,
          sourceId: 21,
          key,
          lastUpload: now,
          lastError: '',
          uploadStatus: 'Published / synced',
          publishCount: (next.chessResults?.publishCount || 0) + 1,
          activityLog: [
            ...(replacedKey ? [{ at: now, type: 'ok' as const, message: `Tournament mode changed; replaced incompatible TNR ${replacedKey} with TNR ${key}.` }] : []),
            { at: now, type: 'ok' as const, message: `Published TNR ${key}: ${publication.players} players.` },
            ...(next.chessResults?.activityLog || [])
          ].slice(0, 120)
        }
      };
      persistTournament(published);
      await cloud.syncNow(published);
      adoptSynchronizedTournament();
      setNotice('ok', replacedKey
        ? `Tournament mode changed. New Chess-Results TNR ${key} was created and published correctly.`
        : `Chess-Results TNR ${key} published and synchronized.`);
    } catch (error: any) {
      if (isSourceIdMismatch(error) && isTnr(attemptedKey)) {
        setSourceMismatchTnr(attemptedKey);
        setMessage('');
      } else {
        setNotice('error', error?.message || 'Chess-Results publication failed.');
      }
    } finally {
      chessResultsPublishLockRef.current = false;
      setBusy(null);
    }
  };

  const openChessResultsAdmin = async () => {
    if (!isTnr(tnr)) return;
    setBusy('cr-admin');
    try {
      const result = await chessResultsApi.adminLink({ key: tnr, section: 'admin' });
      if (!result?.url) throw new Error('Authenticated Chess-Results admin URL was not returned.');
      window.open(result.url, '_blank', 'noopener,noreferrer');
    } catch (error: any) {
      setNotice('error', error?.message || 'Could not open Chess-Results admin.');
    } finally {
      setBusy(null);
    }
  };

  const openChessResultsUpload = async () => {
    if (!isTnr(tnr)) return;
    setBusy('cr-admin');
    try {
      const result = await chessResultsApi.adminLink({ key: tnr, section: 'upload' });
      if (!result?.url) throw new Error('Authenticated Chess-Results Upload Data URL was not returned.');
      window.open(result.url, '_blank', 'noopener,noreferrer');
    } catch (error: any) {
      setNotice('error', error?.message || 'Could not open Chess-Results Upload Data.');
    } finally {
      setBusy(null);
    }
  };

  const openHubPage = async () => {
    setMessage('');
    try {
      await cloud.openPublicPage(tournamentRef.current);
      adoptSynchronizedTournament();
    } catch (error: any) {
      setNotice('error', error?.message || 'Could not open the public Hub page.');
    }
  };

  const leaveTournament = async () => {
    if (cloud.cloudDirty) {
      const leave = window.confirm('Web has local changes that may not be confirmed in Cloud yet. Leave this tournament without forcing a hidden Push?');
      if (!leave) return;
    }
    await cloud.returnToCloudList();
  };

  const nav = [
    { id: 'setup' as const, label: 'Setup', icon: Settings2, detail: `${setupProgress}% complete` },
    { id: 'players' as const, label: 'Players', icon: Users, detail: `${tournament.players.length} registered` },
    { id: 'publish' as const, label: 'Publish', icon: Send, detail: '2 publication targets' }
  ];

  const publishBlocked = busy !== null || cloud.busy || cloud.conflict;

  return (
    <div className="companion-shell" data-companion-version="1">
      <aside className="companion-sidebar">
        <div className="companion-brand">
          <div className="companion-brand-mark">CP</div>
          <div><strong>Chess-Publisher</strong><span>Web Companion</span></div>
        </div>

        <button className="companion-tournament-switch" type="button" onClick={leaveTournament}>
          <ArrowLeft size={16} />
          <span><small>My tournaments</small><strong>{displayName}</strong></span>
        </button>

        <nav className="companion-nav" aria-label="Tournament workspace">
          {nav.map(item => {
            const Icon = item.icon;
            return (
              <button key={item.id} className={activeTab === item.id ? 'is-active' : ''} onClick={() => setActiveTab(item.id)} type="button">
                <Icon size={19} />
                <span><strong>{item.label}</strong><small>{item.detail}</small></span>
              </button>
            );
          })}
        </nav>

        <div className="companion-sidebar-status">
          <div className={`companion-sync-dot ${cloud.conflict ? 'is-warn' : cloud.statusKind === 'offline' ? 'is-offline' : 'is-ok'}`} />
          <div><strong>{cloud.conflict ? 'Sync conflict' : cloud.status}</strong><span>Cloud revision {cloudRevision || '—'}</span></div>
        </div>
      </aside>

      <header className="companion-topbar">
        <div className="companion-title-block">
          <span>{activeTab === 'setup' ? 'Tournament Setup' : activeTab === 'players' ? 'Player Registration' : 'Publish Tournament'}</span>
          <strong>{displayName}</strong>
        </div>
        <div className="companion-top-actions">
          <button type="button" className="companion-button primary" data-unified-sync="true" onClick={unifiedSync} disabled={busy !== null || cloud.busy} title="Unified safe SYNC: no-op, pull Cloud-only, push Web-only, or stop on a true two-sided conflict.">
            <Cloud size={16} /> {busy === 'sync' ? '↕ SYNC…' : '↕ SYNC'}
          </button>
        </div>
      </header>

      <main className="companion-main">
        {cloud.conflict && (
          <div className="companion-alert warn companion-conflict-alert">
            <WifiOff size={18} />
            <div className="companion-conflict-copy">
              <strong>Desktop/Cloud and Web both changed this tournament.</strong>
              <span>{pendingConflictFields.length > 0
                ? `Same-field conflicts: ${pendingConflictFields.slice(0, 4).join(', ')}${pendingConflictFields.length > 4 ? ` +${pendingConflictFields.length - 4} more` : ''}. Choose which side wins only for these overlapping fields.`
                : 'Pull and Push are blocked from overwriting either side. Resolve conflict first merges all non-overlapping fields and asks for a side only when the same field changed on both sides.'}</span>
            </div>
            {pendingConflictFields.length > 0 ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="companion-button secondary companion-conflict-action" onClick={() => void resolveSyncConflict('web')} disabled={busy !== null || cloud.busy} title="Keep Web values only for same-field conflicts">
                  <RefreshCw size={16} className={busy === 'pull' ? 'spin' : ''} /> Keep Web
                </button>
                <button type="button" className="companion-button secondary companion-conflict-action" onClick={() => void resolveSyncConflict('cloud')} disabled={busy !== null || cloud.busy} title="Keep Cloud values only for same-field conflicts">
                  <Cloud size={16} /> Use Cloud
                </button>
              </div>
            ) : (
              <button type="button" className="companion-button secondary companion-conflict-action" onClick={() => void resolveSyncConflict('safe')} disabled={busy !== null || cloud.busy}>
                <RefreshCw size={16} className={busy === 'pull' ? 'spin' : ''} /> {busy === 'pull' ? 'Resolving…' : 'Resolve conflict'}
              </button>
            )}
          </div>
        )}
        {message && (
          <div className={`companion-alert ${messageKind}`}>
            {messageKind === 'ok' ? <CheckCircle2 size={18} /> : <WifiOff size={18} />}
            <span>{message}</span>
          </div>
        )}
        {sourceMismatchTnr && activeTab === 'publish' && (
          <div className="companion-alert warn companion-conflict-alert" data-chess-results-source-recovery>
            <ShieldCheck size={18} />
            <div className="companion-conflict-copy">
              <strong>TNR {sourceMismatchTnr} cannot be updated from Chess-Publisher.</strong>
              <span>This tournament key belongs to a different Chess-Results program source. Chess-Publisher Source 21 is fixed by the official interface. Create a new Chess-Publisher TNR to continue without changing the Desktop/Cloud tournament itself.</span>
            </div>
            <button
              type="button"
              className="companion-button secondary companion-conflict-action"
              onClick={createFreshChessResultsTnr}
              disabled={busy !== null || cloud.busy || cloud.conflict}
            >
              <RefreshCw size={16} className={busy === 'cr-publish' ? 'spin' : ''} /> {busy === 'cr-publish' ? 'Creating…' : 'Create new Chess-Publisher TNR'}
            </button>
          </div>
        )}

        {activeTab === 'setup' && (
          <div className="companion-content-frame companion-setup-frame">
            <CompanionSetup tournament={tournament} onUpdateTournament={updateTournament} />
          </div>
        )}

        {activeTab === 'players' && (
          <div className="companion-content-frame companion-registration-frame">
            <div className="companion-section-head">
              <div><span className="companion-eyebrow">REGISTRATION</span><h1>Player registration</h1><p>Fast FIDE search, manual registration and roster maintenance for the same synchronized Desktop tournament.</p></div>
              <div className="companion-counter"><strong>{tournament.players.length}</strong><span>players</span></div>
            </div>
            <CompanionRegistration tournament={tournament} onUpdateTournament={updateTournament} />
          </div>
        )}

        {activeTab === 'publish' && (
          <div className="companion-publish-stack">
            <section className="companion-publish-command-panel">
              <div className="companion-publish-command-head">
                <div>
                  <span className="companion-eyebrow">PUBLISH</span>
                  <h1>Choose where to publish</h1>
                  <p>Publish first confirms a safe Web → Cloud Push. If Desktop/Cloud is newer, publication stops and requires an explicit Pull before anything is overwritten.</p>
                </div>
                <div className="companion-publish-revision">r{cloudRevision || 0}</div>
              </div>

              <div className="companion-publish-command-grid">
                <button
                  type="button"
                  data-publish-target="chess-results"
                  className="companion-publish-command chessresults"
                  onClick={publishChessResults}
                  disabled={publishBlocked}
                >
                  <span className="companion-publish-command-icon"><Globe2 size={24} /></span>
                  <span className="companion-publish-command-copy">
                    <small>CHESS-RESULTS</small>
                    <strong>{busy === 'cr-publish' ? 'Publishing…' : 'Publish to Chess-Results'}</strong>
                    <em>{isTnr(tnr) ? `TNR ${tnr} · update existing tournament` : 'Create TNR automatically and publish'}</em>
                  </span>
                  <Send size={19} className="companion-publish-command-arrow" />
                </button>

                <button
                  type="button"
                  data-publish-target="online-hub"
                  className="companion-publish-command hub"
                  onClick={publishHub}
                  disabled={publishBlocked}
                >
                  <span className="companion-publish-command-icon"><Cloud size={24} /></span>
                  <span className="companion-publish-command-copy">
                    <small>CHESS-PUBLISHER</small>
                    <strong>{busy === 'hub' ? 'Publishing…' : 'Publish to Online Hub'}</strong>
                    <em>{publicHubUrl ? 'Update the existing public Hub tournament' : 'Create or update the public Hub tournament'}</em>
                  </span>
                  <Send size={19} className="companion-publish-command-arrow" />
                </button>
              </div>

              <div className="companion-publish-quick-actions" data-hub-public-page-action>
                <button
                  type="button"
                  className="companion-button secondary"
                  onClick={openHubPage}
                  disabled={busy !== null || cloud.busy}
                >
                  <ExternalLink size={16} /> Open public Hub page
                </button>
                <span>{publicHubUrl ? 'View the tournament exactly as visitors see it on Chess-Publisher Hub.' : 'If this tournament already exists on the Hub, the Web Companion will find and open it automatically.'}</span>
              </div>
            </section>

            <div className="companion-publish-details-grid">
              <section className="companion-publish-card">
                <div className="companion-publish-icon chessresults"><Globe2 size={23} /></div>
                <div className="companion-card-copy">
                  <span className="companion-eyebrow">CHESS-RESULTS STATUS</span>
                  <h2>{isTnr(tnr) ? `TNR ${tnr}` : 'Not published yet'}</h2>
                  <p>Secure server-side publication. Bridge credentials and AES material never enter the browser.</p>
                </div>
                <div className="companion-card-stats">
                  <span><small>TNR</small><strong>{isTnr(tnr) ? tnr : 'Automatic'}</strong></span>
                  <span><small>Players</small><strong>{tournament.players.length}</strong></span>
                  <span><small>Status</small><strong>{tournament.chessResults?.lastUpload ? 'Published' : 'Ready'}</strong></span>
                </div>
                <div className="companion-card-actions">
                  <button type="button" className="companion-button secondary" onClick={testChessResults} disabled={busy !== null}><ShieldCheck size={16} /> Test bridge</button>
                  {isTnr(tnr) && <>
                    <a className="companion-button secondary" href={`https://chess-results.com/tnr${encodeURIComponent(tnr)}.aspx?lan=1`} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Public page</a>
                    <button type="button" className="companion-button secondary" onClick={openChessResultsAdmin} disabled={busy !== null}><Globe2 size={16} /> Admin</button>
                    <button type="button" data-chess-results-upload-data className="companion-button secondary" onClick={openChessResultsUpload} disabled={busy !== null}><ExternalLink size={16} /> Upload data</button>
                  </>}
                </div>
              </section>

              <section className="companion-publish-card">
                <div className="companion-publish-icon hub"><Cloud size={23} /></div>
                <div className="companion-card-copy">
                  <span className="companion-eyebrow">ONLINE HUB STATUS</span>
                  <h2>{publicHubUrl ? 'Public tournament linked' : 'Hub link can be recovered automatically'}</h2>
                  <p>The public Hub is a publication target. Private Cloud Workspace remains the Desktop ↔ Web source of truth.</p>
                </div>
                <div className="companion-card-stats">
                  <span><small>Players</small><strong>{tournament.players.length}</strong></span>
                  <span><small>Cloud revision</small><strong>r{cloudRevision || 0}</strong></span>
                  <span><small>Public</small><strong>{publicHubUrl ? 'Linked' : 'Check Hub'}</strong></span>
                </div>
                <div className="companion-card-actions">
                  <button type="button" className="companion-button secondary" onClick={openHubPage} disabled={busy !== null || cloud.busy}><ExternalLink size={16} /> Open public Hub page</button>
                </div>
              </section>
            </div>

            <section className="companion-sync-card" data-unified-sync-status="true">
              <div><Smartphone size={20} /><span><strong>Unified ↕ SYNC</strong><small>One safe action: no-op when equal, pull Cloud-only changes, push Web-only changes, and stop on a true two-sided conflict.</small></span></div>
              <button type="button" className="companion-button primary" onClick={unifiedSync} disabled={busy !== null || cloud.busy}><Cloud size={16} /> {busy === 'sync' ? '↕ SYNC…' : '↕ SYNC'}</button>
            </section>
          </div>
        )}
      </main>

      <nav className="companion-mobile-nav companion-native-tabbar" aria-label="Mobile tournament navigation">
        {nav.map(item => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return <button key={item.id} type="button" className={active ? 'is-active' : ''} aria-current={active ? 'page' : undefined} onClick={() => setActiveTab(item.id)}><span className="companion-mobile-nav-icon"><Icon size={22} /></span><span>{item.label}</span></button>;
        })}
        <button type="button" className="companion-mobile-home-action" onClick={leaveTournament}><span className="companion-mobile-nav-icon"><ArrowLeft size={22} /></span><span>Tournaments</span></button>
      </nav>
    </div>
  );
}
