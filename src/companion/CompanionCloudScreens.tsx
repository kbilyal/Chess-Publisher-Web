import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Archive,
  CheckCircle2,
  ChevronRight,
  Cloud,
  FileUp,
  LogOut,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Smartphone,
  Trash2,
  Trophy,
  WifiOff,
  X
} from 'lucide-react';

export type CompanionCloudTournament = {
  id: string;
  localKey?: string;
  name?: string;
  revision?: number;
  updatedAt?: string;
  archivedAt?: string;
  archived?: boolean;
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
        <label className="companion-entry-remember"><input type="checkbox" checked={rememberToken} onChange={event => onRememberToken(event.target.checked)} /><span>Remember on this device</span></label>
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

const formatWhen = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
};

export function CompanionTournamentSelectScreen(props: {
  organizerName: string;
  tournaments: CompanionCloudTournament[];
  archivedTournaments: CompanionCloudTournament[];
  busy: boolean;
  status: string;
  statusKind: StatusKind;
  onRefresh: () => void;
  onSignOut: () => void;
  onOpen: (meta: CompanionCloudTournament) => void;
  onCreateNew: (name: string) => void;
  onImportFile: (file: File) => void;
  onLoadArchived: () => Promise<unknown>;
  onArchive: (meta: CompanionCloudTournament) => Promise<void>;
  onRestore: (meta: CompanionCloudTournament) => Promise<void>;
}) {
  const {
    organizerName,
    tournaments,
    archivedTournaments,
    busy,
    status,
    statusKind,
    onRefresh,
    onSignOut,
    onOpen,
    onCreateNew,
    onImportFile,
    onLoadArchived,
    onArchive,
    onRestore
  } = props;
  const [newDialog, setNewDialog] = useState(false);
  const [newName, setNewName] = useState('New Tournament');
  const [query, setQuery] = useState('');
  const [showTrash, setShowTrash] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CompanionCloudTournament | null>(null);
  const [undoTarget, setUndoTarget] = useState<CompanionCloudTournament | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const source = showTrash ? archivedTournaments : tournaments;
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return source;
    return source.filter(meta => [meta.name, meta.localKey, meta.id]
      .some(value => String(value || '').toLocaleLowerCase().includes(needle)));
  }, [source, query]);

  const submitNew = () => {
    const value = newName.trim();
    if (!value || busy) return;
    setNewDialog(false);
    onCreateNew(value);
  };

  const openTrash = () => {
    setShowTrash(true);
    setQuery('');
    void onLoadArchived();
  };

  const moveToTrash = async () => {
    const target = deleteTarget;
    if (!target || busy) return;
    try {
      await onArchive(target);
      setDeleteTarget(null);
      setUndoTarget(target);
    } catch {
      // Provider exposes the actionable error in the shared status surface.
    }
  };

  const restore = async (target: CompanionCloudTournament) => {
    if (busy) return;
    try {
      await onRestore(target);
      if (undoTarget?.id === target.id) setUndoTarget(null);
    } catch {
      // Provider exposes the actionable error in the shared status surface.
    }
  };

  return (
    <main className="companion-select-shell companion-native-surface">
      <header className="companion-select-topbar companion-native-topbar">
        <div className="companion-entry-brand compact"><div className="companion-entry-mark">CP</div><div><strong>Chess-Publisher</strong><span>{showTrash ? 'Trash' : 'My tournaments'}</span></div></div>
        <div className="companion-select-actions">
          {showTrash && <button type="button" className="companion-icon-action" aria-label="Back to tournaments" onClick={() => { setShowTrash(false); setQuery(''); }}><ArrowLeft size={19} /><span>Back</span></button>}
          <button type="button" className="companion-icon-action" onClick={onRefresh} disabled={busy} aria-label="Refresh tournaments"><RefreshCw size={18} className={busy ? 'spin' : ''} /><span>Refresh</span></button>
          <button type="button" className="companion-icon-action" onClick={onSignOut} aria-label="Sign out"><LogOut size={18} /><span>Sign out</span></button>
        </div>
      </header>

      <div className="companion-select-content companion-native-content">
        <section className="companion-select-head companion-hub-hero">
          <div><span className="companion-entry-eyebrow">{showTrash ? 'RECOVERY' : 'SYNCHRONIZED WORKSPACE'}</span><h1>{showTrash ? 'Trash' : 'My tournaments'}</h1><p>{showTrash ? 'Restore a tournament at any time. Moving to Trash never deletes its private revisions or source snapshots.' : 'Create, import or continue the same tournament from Web and Chess-Publisher Desktop.'}</p></div>
          <div className="companion-organizer-pill"><ShieldCheck size={15} /><span><small>Organizer</small><strong>{organizerName}</strong></span></div>
        </section>

        {!showTrash && (
          <section className="companion-start-actions" aria-label="Tournament start actions">
            <button type="button" className="companion-start-action primary" disabled={busy} onClick={() => setNewDialog(true)}>
              <Plus size={20} /><span><strong>New tournament</strong><small>Create a private Cloud tournament that Desktop can open.</small></span><ArrowRight size={18} />
            </button>
            <button type="button" className="companion-start-action" disabled={busy} onClick={() => importInputRef.current?.click()}>
              <FileUp size={20} /><span><strong>Import tournament</strong><small>TRF16 · TRF26 · TUNX — full tournament import and Cloud sync.</small></span><ArrowRight size={18} />
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
        )}

        <section className="companion-list-tools" aria-label="Tournament list tools">
          <label className="companion-tournament-search">
            <Search size={19} aria-hidden="true" />
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder={showTrash ? 'Search Trash' : 'Search tournaments'} aria-label={showTrash ? 'Search Trash' : 'Search tournaments'} />
            {query && <button type="button" aria-label="Clear search" onClick={() => setQuery('')}><X size={17} /></button>}
          </label>
          {!showTrash && <button type="button" className="companion-trash-toggle" onClick={openTrash}><Archive size={18} /><span>Trash</span>{archivedTournaments.length > 0 && <small>{archivedTournaments.length}</small>}</button>}
        </section>

        {newDialog && (
          <div className="companion-new-dialog companion-native-sheet-backdrop" role="dialog" aria-modal="true" aria-label="Create new tournament">
            <div className="companion-new-dialog-card companion-native-sheet">
              <div className="companion-sheet-grabber" aria-hidden="true" />
              <div className="companion-new-dialog-head"><div><span className="companion-entry-eyebrow">NEW PRIVATE TOURNAMENT</span><h2>Create tournament</h2></div><button type="button" aria-label="Close" onClick={() => setNewDialog(false)}><X size={19} /></button></div>
              <label className="companion-entry-field"><span>Tournament name</span><input autoFocus value={newName} onChange={event => setNewName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') submitNew(); if (event.key === 'Escape') setNewDialog(false); }} /></label>
              <p>The tournament is created immediately in the private Organizer Cloud. No public Hub page or Chess-Results TNR is created automatically.</p>
              <div className="companion-new-dialog-actions"><button type="button" onClick={() => setNewDialog(false)}>Cancel</button><button type="button" className="primary" disabled={!newName.trim() || busy} onClick={submitNew}><Plus size={16} /> Create tournament</button></div>
            </div>
          </div>
        )}

        {deleteTarget && (
          <div className="companion-new-dialog companion-native-sheet-backdrop" role="dialog" aria-modal="true" aria-label="Move tournament to Trash">
            <div className="companion-new-dialog-card companion-native-sheet companion-delete-sheet">
              <div className="companion-sheet-grabber" aria-hidden="true" />
              <div className="companion-new-dialog-head"><div><span className="companion-entry-eyebrow danger">SAFE DELETE</span><h2>Move to Trash?</h2></div><button type="button" aria-label="Close" onClick={() => setDeleteTarget(null)}><X size={19} /></button></div>
              <div className="companion-delete-summary"><span className="companion-tournament-icon"><Trophy size={20} /></span><span><strong>{deleteTarget.name || 'Tournament'}</strong><small>Cloud revision r{Number(deleteTarget.revision || 0)}</small></span></div>
              <p>The active Cloud record will disappear from My tournaments, but all private revisions and stored snapshots stay intact. This does not delete the Public Hub page or Chess-Results tournament.</p>
              <div className="companion-new-dialog-actions"><button type="button" onClick={() => setDeleteTarget(null)}>Cancel</button><button type="button" className="destructive" disabled={busy} onClick={() => void moveToTrash()}><Trash2 size={16} /> Move to Trash</button></div>
            </div>
          </div>
        )}

        <div className={`companion-select-status ${statusKind}`}><span className="companion-select-status-dot" /><span>{status}</span></div>

        <section className="companion-tournament-list companion-native-list">
          <div className="companion-tournament-list-head"><div><h2>{showTrash ? 'Recently removed' : 'Cloud tournaments'}</h2><p>{filtered.length === source.length ? `${source.length} tournament${source.length === 1 ? '' : 's'}` : `${filtered.length} of ${source.length}`} {showTrash ? 'in Trash.' : 'available for this Organizer Token.'}</p></div>{showTrash ? <Archive size={21} /> : <Cloud size={21} />}</div>
          <div className="companion-tournament-grid">
            {filtered.map(meta => (
              <article key={meta.id} className="companion-tournament-tile companion-native-tile">
                <button type="button" className="companion-tournament-open" onClick={() => !showTrash && onOpen(meta)} disabled={busy || showTrash}>
                  <span className="companion-tournament-tile-main"><span className="companion-tournament-icon"><Trophy size={19} /></span><span><strong>{meta.name || 'Tournament'}</strong><small>{showTrash ? `Removed ${formatWhen(meta.archivedAt) || 'recently'}` : (formatWhen(meta.updatedAt) ? `Updated ${formatWhen(meta.updatedAt)}` : (meta.localKey || meta.id))}</small></span></span>
                  {!showTrash && <span className="companion-tournament-tile-meta"><span>r{Number(meta.revision || 0)}</span><ChevronRight size={20} /></span>}
                </button>
                {showTrash ? (
                  <button type="button" className="companion-tournament-restore" onClick={() => void restore(meta)} disabled={busy}><RotateCcw size={18} /><span>Restore</span></button>
                ) : (
                  <button type="button" className="companion-tournament-delete" aria-label={`Move ${meta.name || 'tournament'} to Trash`} onClick={() => setDeleteTarget(meta)} disabled={busy}><Trash2 size={18} /></button>
                )}
              </article>
            ))}
            {!filtered.length && <div className="companion-tournament-empty">{showTrash ? <Archive size={30} /> : <Cloud size={30} />}<strong>{query ? 'No matching tournaments.' : (showTrash ? 'Trash is empty.' : 'No synchronized tournaments yet.')}</strong><span>{query ? 'Try another name, ID or tournament key.' : (showTrash ? 'Tournaments moved to Trash will appear here and can be restored.' : 'Create a tournament here, import TRF/TUNX, or sync one from Chess-Publisher Desktop.')}</span></div>}
          </div>
        </section>
      </div>

      {undoTarget && (
        <div className="companion-undo-toast" role="status"><span><CheckCircle2 size={18} /><strong>Moved to Trash</strong></span><button type="button" onClick={() => void restore(undoTarget)} disabled={busy}>Undo</button><button type="button" aria-label="Dismiss" onClick={() => setUndoTarget(null)}><X size={17} /></button></div>
      )}
    </main>
  );
}