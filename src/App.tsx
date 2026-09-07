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
import { Tournament } from './types';
import { createInitialEmptyTournament } from './data/initialData';
import { TournamentSetupTab } from './components/TournamentSetupTab';
import { PlayersTab } from './components/PlayersTab';
import { TieBreakSettingsModal } from './components/TieBreakSettingsModal';
import { ResortStartingListModal } from './components/ResortStartingListModal';
import { useOnlineCloud } from './cloud/OnlineCloudProvider';
import { chessResultsApi } from './chessResults/api';
import { buildChessResultsXml } from './chessResults/publication';

const STORAGE_KEY = 'fide_tournament_manager_v2';
type CompanionTab = 'setup' | 'players' | 'publish';
type BusyAction = 'sync' | 'pull' | 'hub' | 'cr-test' | 'cr-publish' | 'cr-admin' | null;

const isTnr = (value: unknown) => /^\d+$/.test(String(value || '').trim());
const newClientId = () => globalThis.crypto?.randomUUID?.() || `cp-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function readTournament(): Tournament {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (error) {
    console.error('Could not read synchronized tournament state.', error);
  }
  return createInitialEmptyTournament('Tournament');
}

export default function App() {
  const cloud = useOnlineCloud();
  const [tournament, setTournament] = useState<Tournament>(readTournament);
  const [activeTab, setActiveTab] = useState<CompanionTab>('setup');
  const [busy, setBusy] = useState<BusyAction>(null);
  const [message, setMessage] = useState('');
  const [messageKind, setMessageKind] = useState<'ok' | 'warn' | 'error'>('ok');
  const [tieBreakSettings, setTieBreakSettings] = useState<string | null>(null);
  const [showResort, setShowResort] = useState(false);
  const tournamentRef = useRef(tournament);

  useEffect(() => { tournamentRef.current = tournament; }, [tournament]);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tournament));
  }, [tournament]);

  // Desktop may have changed the same Cloud tournament while this browser was
  // in the background. Re-check when the user returns; the existing three-way
  // sync policy remains authoritative and never silently overwrites conflicts.
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
  const publicHubUrl = String((tournament as any)?.online?.publicPageUrl || '').trim();
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

  const syncNow = async () => {
    setBusy('sync');
    setMessage('');
    try {
      await cloud.syncNow(tournamentRef.current);
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
      setNotice('ok', 'Latest desktop/cloud revision checked.');
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
      await cloud.publishOnline(tournamentRef.current);
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

  const publishChessResults = async () => {
    setBusy('cr-publish');
    setMessage('');
    try {
      // Always sync the full private tournament first so Web and desktop retain
      // one shared authoritative object before an external publication occurs.
      await cloud.syncNow(tournamentRef.current);
      const current = tournamentRef.current;
      const initial = buildChessResultsXml(current);
      let key = String(current.chessResults?.key || '').trim();
      let next = current;

      if (!isTnr(key)) {
        const clientId = current.chessResults?.clientId || newClientId();
        const created = await chessResultsApi.create({
          tournament: current.name || '',
          federation: initial.federation,
          mode: current.settings.tournamentType,
          clientId
        });
        key = String(created?.key || '').trim();
        if (!isTnr(key)) throw new Error('Chess-Results returned an invalid TNR.');
        next = {
          ...current,
          settings: { ...current.settings, tnr: key },
          chessResults: {
            ...current.chessResults,
            clientId,
            key,
            mode: current.settings.tournamentType,
            federation: initial.federation,
            createdAt: current.chessResults?.createdAt || new Date().toISOString(),
            freshTnrRequired: false,
            lastError: '',
            uploadStatus: 'TNR assigned — preparing upload'
          }
        };
        setTournament(next);
        tournamentRef.current = next;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      }

      const publication = buildChessResultsXml(next, { requireKey: true, key });
      await chessResultsApi.publish({ key, xml: publication.xml });
      const now = new Date().toISOString();
      const published: Tournament = {
        ...next,
        settings: { ...next.settings, tnr: key },
        chessResults: {
          ...next.chessResults,
          key,
          lastUpload: now,
          lastError: '',
          uploadStatus: 'Published / synced',
          publishCount: (next.chessResults?.publishCount || 0) + 1,
          activityLog: [
            { at: now, type: 'ok' as const, message: `Published TNR ${key}: ${publication.players} players.` },
            ...(next.chessResults?.activityLog || [])
          ].slice(0, 120)
        }
      };
      setTournament(published);
      tournamentRef.current = published;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(published));
      await cloud.syncNow(published);
      setNotice('ok', `Chess-Results TNR ${key} published and synchronized.`);
    } catch (error: any) {
      setNotice('error', error?.message || 'Chess-Results publication failed.');
    } finally {
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

  const leaveTournament = async () => {
    if (!cloud.conflict) {
      try { await cloud.syncNow(tournamentRef.current); } catch { /* list remains available */ }
    }
    await cloud.returnToCloudList();
  };

  const nav = [
    { id: 'setup' as const, label: 'Setup', icon: Settings2, detail: 'Tournament settings' },
    { id: 'players' as const, label: 'Players', icon: Users, detail: `${tournament.players.length} registered` },
    { id: 'publish' as const, label: 'Publish', icon: Send, detail: 'Hub & Chess-Results' }
  ];

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
          <div className="companion-alert warn">
            <WifiOff size={18} />
            <div><strong>Desktop and Web changed the same tournament.</strong><span>No data was overwritten. Use Check updates to resolve through the existing three-way sync workflow.</span></div>
          </div>
        )}
        {message && (
          <div className={`companion-alert ${messageKind}`}>
            {messageKind === 'ok' ? <CheckCircle2 size={18} /> : <WifiOff size={18} />}
            <span>{message}</span>
          </div>
        )}

        {activeTab === 'setup' && (
          <div className="companion-content-frame">
            <div className="companion-section-head">
              <div><span className="companion-eyebrow">SETUP</span><h1>Tournament setup</h1><p>Only tournament metadata is edited here. Pairing, TRF and desktop engines remain untouched.</p></div>
              <div className="companion-progress"><strong>{setupProgress}%</strong><span>complete</span></div>
            </div>
            <TournamentSetupTab tournament={tournament} onUpdateTournament={updateTournament} onOpenTieBreakSettings={setTieBreakSettings} />
          </div>
        )}

        {activeTab === 'players' && (
          <div className="companion-content-frame">
            <div className="companion-section-head">
              <div><span className="companion-eyebrow">REGISTRATION</span><h1>Players</h1><p>Register and maintain the same player list used by the desktop tournament.</p></div>
              <div className="companion-counter"><strong>{tournament.players.length}</strong><span>players</span></div>
            </div>
            <PlayersTab tournament={tournament} onUpdateTournament={updateTournament} onResortStartingList={() => setShowResort(true)} />
          </div>
        )}

        {activeTab === 'publish' && (
          <div className="companion-publish-grid">
            <section className="companion-publish-card">
              <div className="companion-publish-icon hub"><Cloud size={23} /></div>
              <div className="companion-card-copy">
                <span className="companion-eyebrow">CHESS-PUBLISHER</span>
                <h2>Online Hub</h2>
                <p>Publish the current synchronized tournament to the public Hub. The private Cloud Workspace remains the source of truth.</p>
              </div>
              <div className="companion-card-stats">
                <span><small>Players</small><strong>{tournament.players.length}</strong></span>
                <span><small>Cloud revision</small><strong>r{cloudRevision || 0}</strong></span>
                <span><small>Public</small><strong>{publicHubUrl ? 'Linked' : 'Not yet'}</strong></span>
              </div>
              <div className="companion-card-actions">
                <button type="button" className="companion-button primary wide" onClick={publishHub} disabled={busy !== null || cloud.busy || cloud.conflict}>
                  <Send size={17} /> {busy === 'hub' ? 'Publishing…' : publicHubUrl ? 'Update Online Hub' : 'Publish Online Hub'}
                </button>
                {publicHubUrl && <button type="button" className="companion-button secondary" onClick={() => cloud.openPublicPage(tournament)}><ExternalLink size={16} /> Open Hub page</button>}
              </div>
            </section>

            <section className="companion-publish-card">
              <div className="companion-publish-icon chessresults"><Globe2 size={23} /></div>
              <div className="companion-card-copy">
                <span className="companion-eyebrow">CHESS-RESULTS</span>
                <h2>Chess-Results</h2>
                <p>Secure server-side publication. Organizer Token authentication is reused; bridge secrets never enter the browser.</p>
              </div>
              <div className="companion-card-stats">
                <span><small>TNR</small><strong>{isTnr(tnr) ? tnr : 'Automatic'}</strong></span>
                <span><small>Players</small><strong>{tournament.players.length}</strong></span>
                <span><small>Status</small><strong>{tournament.chessResults?.lastUpload ? 'Published' : 'Ready'}</strong></span>
              </div>
              <div className="companion-card-actions">
                <button type="button" className="companion-button primary wide" onClick={publishChessResults} disabled={busy !== null || cloud.busy || cloud.conflict}>
                  <Send size={17} /> {busy === 'cr-publish' ? 'Publishing…' : isTnr(tnr) ? 'Update Chess-Results' : 'Publish to Chess-Results'}
                </button>
                <button type="button" className="companion-button secondary" onClick={testChessResults} disabled={busy !== null}><ShieldCheck size={16} /> Test bridge</button>
                {isTnr(tnr) && <>
                  <a className="companion-button secondary" href={`https://chess-results.com/tnr${encodeURIComponent(tnr)}.aspx?lan=1`} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Public page</a>
                  <button type="button" className="companion-button secondary" onClick={openChessResultsAdmin} disabled={busy !== null}><Globe2 size={16} /> Admin</button>
                </>}
              </div>
            </section>

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

      {tieBreakSettings !== null && (
        <TieBreakSettingsModal tournament={tournament} tieBreakName={tieBreakSettings} onClose={() => setTieBreakSettings(null)} onUpdateTournament={updateTournament} />
      )}
      {showResort && (
        <ResortStartingListModal isOpen={showResort} onClose={() => setShowResort(false)} tournament={tournament} onCommit={next => { setTournament(next); setShowResort(false); }} />
      )}
    </div>
  );
}
