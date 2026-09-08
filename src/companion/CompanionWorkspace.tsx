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
  pullChanges: (tournament: Tournament) => Promise<void>;
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
  const tournamentRef = useRef(tournament);
  const chessResultsPublishLockRef = useRef(false);

  useEffect(() => { tournamentRef.current = tournament; }, [tournament]);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tournament));
  }, [tournament]);

  useEffect(() => {
    const onFocus = () => {
      if (cloud.busy || cloud.conflict || cloud.cloudDirty) return;
      void cloud.pullChanges(tournamentRef.current);
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [cloud]);

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

  const syncNow = async () => {
    setBusy('sync');
    setMessage('');
    try {
      await cloud.syncNow(tournamentRef.current);
      adoptSynchronizedTournament();
      setNotice('ok', 'Tournament synchronized with the desktop/cloud workspace.');
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
      await cloud.pullChanges(tournamentRef.current);
      adoptSynchronizedTournament();
      setNotice('ok', 'Desktop and Web revisions checked. Non-overlapping changes were merged safely when possible.');
    } catch (error: any) {
      setNotice('error', error?.message || 'Could not check the latest revision.');
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
    if (!cloud.conflict) {
      try { await cloud.syncNow(tournamentRef.current); } catch { /* list remains available */ }
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
          <button type="button" className="companion-button secondary" onClick={pullDesktopChanges} disabled={busy !== null || cloud.busy}>
            <RefreshCw size={16} className={busy === 'pull' ? 'spin' : ''} /> Check updates
          </button>
          <button type="button" className="companion-button primary" onClick={syncNow} disabled={busy !== null || cloud.busy || cloud.conflict}>
            <Cloud size={16} /> {busy === 'sync' ? 'Syncing…' : 'Sync now'}
          </button>
        </div>
      </header>

      <main className="companion-main">
        {cloud.conflict && (
          <div className="companion-alert warn companion-conflict-alert">
            <WifiOff size={18} />
            <div className="companion-conflict-copy">
              <strong>Desktop and Web both changed this tournament.</strong>
              <span>Resolve safely merges non-overlapping changes. If the same field changed on both devices, nothing is overwritten.</span>
            </div>
            <button type="button" className="companion-button secondary companion-conflict-action" onClick={pullDesktopChanges} disabled={busy !== null || cloud.busy}>
              <RefreshCw size={16} className={busy === 'pull' ? 'spin' : ''} /> {busy === 'pull' ? 'Resolving…' : 'Resolve safely'}
            </button>
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
                  <p>Both actions first synchronize the tournament with the same Desktop/Cloud record, then publish that synchronized revision.</p>
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

            <section className="companion-sync-card">
              <div><Smartphone size={20} /><span><strong>One tournament, every device</strong><small>Desktop and Web use the same private Cloud tournament identity and revision history.</small></span></div>
              <button type="button" className="companion-button secondary" onClick={pullDesktopChanges} disabled={busy !== null || cloud.busy}><RefreshCw size={16} /> Check latest desktop revision</button>
            </section>
          </div>
        )}
      </main>

      <nav className="companion-mobile-nav" aria-label="Mobile tournament navigation">
        {nav.map(item => {
          const Icon = item.icon;
          return <button key={item.id} type="button" className={activeTab === item.id ? 'is-active' : ''} onClick={() => setActiveTab(item.id)}><Icon size={21} /><span>{item.label}</span></button>;
        })}
        <button type="button" onClick={leaveTournament}><ArrowLeft size={21} /><span>Tournaments</span></button>
      </nav>
    </div>
  );
}
