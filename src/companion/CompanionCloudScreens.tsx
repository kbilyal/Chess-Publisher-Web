import React, { useRef, useState } from 'react';
import { ArrowRight, CheckCircle2, Cloud, FileUp, LogOut, Plus, RefreshCw, ShieldCheck, Smartphone, Trophy, WifiOff, X } from 'lucide-react';
import { Tournament } from '../types';

export type CompanionCloudTournament = {
  id: string;
  localKey?: string;
  name?: string;
  revision?: number;
  updatedAt?: string;
  [key: string]: any;
};

type StatusKind = 'ok' | 'busy' | 'warn' | 'offline';

export function CompanionLoginScreen(props: {
  tokenInput: string;
  rememberToken: boolean;
  busy: boolean;
  status: string;
  statusKind: StatusKind;
  onTokenInput: (value: string) => void;
  onRememberToken: (value: boolean) => void;
  onConnect: () => void;
}) {
  const { tokenInput, rememberToken, busy, status, statusKind, onTokenInput, onRememberToken, onConnect } = props;
  return (
    <main className="companion-entry-shell">
      <section className="companion-login-card">
        <div className="companion-entry-brand"><div className="companion-entry-mark">CP</div><div><strong>Chess-Publisher</strong><span>Web Companion</span></div></div>
        <div className="companion-login-copy">
          <span className="companion-entry-eyebrow">ORGANIZER WORKSPACE</span>
          <h1>Continue your desktop tournaments anywhere.</h1>
          <p>Use the same Organizer Token to open synchronized tournaments, register players and publish to Chess-Results or the Online Hub.</p>
        </div>
        <label className="companion-entry-field">
          <span>Organizer Token</span>
          <input
            type="password"
            value={tokenInput}
            onChange={event => onTokenInput(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter' && tokenInput.trim() && !busy) onConnect(); }}
            autoComplete="off"
            placeholder="Paste Organizer Token"
          />
        </label>
        <label className="companion-entry-remember"><input type="checkbox" checked={rememberToken} onChange={event => onRememberToken(event.target.checked)} /><span>Remember on this browser</span></label>
        <button type="button" className="companion-entry-primary" disabled={busy || !tokenInput.trim()} onClick={onConnect}>
          {busy ? <RefreshCw size={17} className="spin" /> : <ShieldCheck size={17} />}
          <span>{busy ? 'Connecting…' : 'Connect to my tournaments'}</span><ArrowRight size={17} />
        </button>
        <div className={`companion-entry-status ${statusKind}`}>
          {statusKind === 'ok' ? <CheckCircle2 size={15} /> : statusKind === 'offline' ? <WifiOff size={15} /> : <Cloud size={15} />}
          <span>{status}</span>
        </div>
        <div className="companion-entry-security"><ShieldCheck size={14} /><span>The token is used only for your organizer workspace and secure server-side publication.</span></div>
      </section>
      <aside className="companion-entry-side">
        <div className="companion-entry-side-content">
          <span className="companion-entry-eyebrow light">ONE TOURNAMENT · EVERY DEVICE</span>
          <h2>Desktop creates it. Web continues it.</h2>
          <div className="companion-entry-feature"><Cloud size={20} /><div><strong>Private Cloud synchronization</strong><span>Full tournament object, revision history and conflict protection.</span></div></div>
          <div className="companion-entry-feature"><Smartphone size={20} /><div><strong>Fast on mobile</strong><span>Setup, registration and publishing without the desktop-only workspaces.</span></div></div>
          <div className="companion-entry-feature"><Trophy size={20} /><div><strong>Two publication targets</strong><span>Chess-Results and Chess-Publisher Online Hub stay independent.</span></div></div>
        </div>
      </aside>
    </main>
  );
}

export function CompanionTournamentSelectScreen(props: {
  organizerName: string;
  tournaments: CompanionCloudTournament[];
  localTournament: Tournament | null;
  busy: boolean;
  status: string;
  statusKind: StatusKind;
  onRefresh: () => void;
  onSignOut: () => void;
  onOpen: (meta: CompanionCloudTournament) => void;
  onContinueLocal: () => void;
  onCreateNew: (name: string) => void;
  onImportFile: (file: File) => void;
}) {
  const { organizerName, tournaments, localTournament, busy, status, statusKind, onRefresh, onSignOut, onOpen, onContinueLocal, onCreateNew, onImportFile } = props;
  const [newDialog, setNewDialog] = useState(false);
  const [newName, setNewName] = useState('New Tournament');
  const importInputRef = useRef<HTMLInputElement>(null);
  const submitNew = () => {
    const value = newName.trim();
    if (!value || busy) return;
    setNewDialog(false);
    onCreateNew(value);
  };
  return (
    <main className="companion-select-shell">
      <header className="companion-select-topbar">
        <div className="companion-entry-brand compact"><div className="companion-entry-mark">CP</div><div><strong>Chess-Publisher</strong><span>My tournaments</span></div></div>
        <div className="companion-select-actions">
          <button type="button" onClick={onRefresh} disabled={busy}><RefreshCw size={16} className={busy ? 'spin' : ''} /><span>Refresh</span></button>
          <button type="button" onClick={onSignOut}><LogOut size={16} /><span>Sign out</span></button>
        </div>
      </header>

      <div className="companion-select-content">
        <section className="companion-select-head">
          <div><span className="companion-entry-eyebrow">SYNCHRONIZED WORKSPACE</span><h1>My tournaments</h1><p>Create here or import a full tournament, then continue the same Cloud record in Chess-Publisher Desktop.</p></div>
          <div className="companion-organizer-pill"><ShieldCheck size={15} /><span><small>Organizer</small><strong>{organizerName}</strong></span></div>
        </section>

        <section className="companion-start-actions" aria-label="Tournament start actions">
          <button type="button" className="companion-start-action primary" disabled={busy} onClick={() => setNewDialog(true)}>
            <Plus size={18} /><span><strong>New tournament</strong><small>Create a private Cloud tournament that Desktop can open.</small></span><ArrowRight size={16} />
          </button>
          <button type="button" className="companion-start-action" disabled={busy} onClick={() => importInputRef.current?.click()}>
            <FileUp size={18} /><span><strong>Import tournament</strong><small>TRF16 · TRF26 · TUNX — full tournament import and Cloud sync.</small></span><ArrowRight size={16} />
          </button>
          <input
            ref={importInputRef}
            className="companion-import-input"
            type="file"
            accept=".trf,.trf16,.trf26,.txt,.tunx,.TUNX,text/plain,application/octet-stream"
            onChange={event => {
              const file = event.target.files?.[0];
              event.currentTarget.value = '';
              if (file) onImportFile(file);
            }}
          />
        </section>

        {newDialog && (
          <div className="companion-new-dialog" role="dialog" aria-modal="true" aria-label="Create new tournament">
            <div className="companion-new-dialog-card">
              <div className="companion-new-dialog-head"><div><span className="companion-entry-eyebrow">NEW PRIVATE TOURNAMENT</span><h2>Create tournament</h2></div><button type="button" aria-label="Close" onClick={() => setNewDialog(false)}><X size={17} /></button></div>
              <label className="companion-entry-field"><span>Tournament name</span><input autoFocus value={newName} onChange={event => setNewName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') submitNew(); if (event.key === 'Escape') setNewDialog(false); }} /></label>
              <p>The tournament is created immediately in the private Organizer Cloud. No public Hub page or Chess-Results TNR is created automatically.</p>
              <div className="companion-new-dialog-actions"><button type="button" onClick={() => setNewDialog(false)}>Cancel</button><button type="button" className="primary" disabled={!newName.trim() || busy} onClick={submitNew}><Plus size={15} /> Create tournament</button></div>
            </div>
          </div>
        )}

        <div className={`companion-select-status ${statusKind}`}><span className="companion-select-status-dot" /><span>{status}</span></div>

        {localTournament && (
          <section className="companion-local-continuation">
            <div className="companion-local-icon"><Smartphone size={20} /></div>
            <div><span className="companion-entry-eyebrow">THIS BROWSER</span><strong>{localTournament.name || 'Tournament'}</strong><small>Continue local state; Cloud revision checking starts immediately.</small></div>
            <button type="button" onClick={onContinueLocal} disabled={busy}>Continue <ArrowRight size={16} /></button>
          </section>
        )}

        <section className="companion-tournament-list">
          <div className="companion-tournament-list-head"><div><h2>Cloud tournaments</h2><p>{tournaments.length} tournament{tournaments.length === 1 ? '' : 's'} available for this Organizer Token.</p></div><Cloud size={20} /></div>
          <div className="companion-tournament-grid">
            {tournaments.map(meta => (
              <button key={meta.id} type="button" className="companion-tournament-tile" onClick={() => onOpen(meta)} disabled={busy}>
                <div className="companion-tournament-tile-main"><span className="companion-tournament-icon"><Trophy size={18} /></span><span><strong>{meta.name || 'Tournament'}</strong><small>{meta.localKey || meta.id}</small></span></div>
                <div className="companion-tournament-tile-meta"><span>r{Number(meta.revision || 0)}</span><ArrowRight size={17} /></div>
              </button>
            ))}
            {!tournaments.length && <div className="companion-tournament-empty"><Cloud size={28} /><strong>No synchronized tournaments yet.</strong><span>Create a tournament here, import TRF/TUNX, or sync one from Chess-Publisher Desktop.</span></div>}
          </div>
        </section>
      </div>
    </main>
  );
}
