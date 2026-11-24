import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Archive,
  ChevronRight,
  Cloud,
  ExternalLink,
  FileUp,
  LogOut,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  Trophy,
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

export function CompanionEntryScreen({ busy, status, statusKind, tournamentHint }: {
  busy: boolean;
  status: string;
  statusKind: StatusKind;
  tournamentHint: string;
}) {
  const webUrl = new URL('https://chess-publisher.org/app/');
  webUrl.searchParams.set('account', '1');
  if (tournamentHint) webUrl.searchParams.set('cloudTournamentId', tournamentHint);

  return (
    <main className="companion-entry-shell">
      <section className="companion-login-card" aria-labelledby="companion-entry-title">
        <div className="companion-entry-brand">
          <img className="companion-entry-mark" src="/icons/chess-publisher-icon-192.png" alt="" />
          <div><strong>ChessPublisher</strong><span>Arbiter Companion</span></div>
        </div>
        <div className="companion-login-copy">
          <h1 id="companion-entry-title">Arbiter Companion</h1>
          <p>Sign in through ChessPublisher Web, then open Arbiter Companion from your workspace.</p>
        </div>
        {!busy && <a className="companion-entry-primary" href={webUrl.href}>Open ChessPublisher Web</a>}
        {status && <div className={`companion-entry-status ${statusKind}`} role="status">{status}</div>}
      </section>
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
  googleUser?: { name?: string | null; email?: string | null; avatarUrl?: string | null } | null;
  authMode?: 'none' | 'google' | 'token';
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
    googleUser,
    authMode,
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

  const deleteFromCloud = async () => {
    const target = deleteTarget;
    if (!target || busy) return;
    try {
      // onArchive is the legacy provider prop name. The protected DELETE route is
      // now permanent for main-list deletes; reload clears the provider's legacy
      // archive-state bookkeeping immediately after the server confirms deletion.
      await onArchive(target);
      setDeleteTarget(null);
      window.location.reload();
    } catch {
      // Provider exposes the actionable error in the shared status surface.
    }
  };

  const restore = async (target: CompanionCloudTournament) => {
    if (busy) return;
    try {
      await onRestore(target);
    } catch {
      // Provider exposes the actionable error in the shared status surface.
    }
  };

  return (
    <main className="companion-select-shell companion-native-surface">
      <header className="companion-select-topbar companion-native-topbar">
        <div className="companion-entry-brand compact"><img className="companion-entry-mark" src="/icons/chess-publisher-icon-192.png" alt="" /><div><strong>Arbiter Companion</strong><span>{showTrash ? 'Trash' : 'My tournaments'}</span></div></div>
        <div className="companion-select-actions">
          {showTrash && <button type="button" className="companion-icon-action" aria-label="Back to tournaments" onClick={() => { setShowTrash(false); setQuery(''); }}><ArrowLeft size={19} /><span>Back</span></button>}
          <a className="companion-icon-action" href="https://chess-publisher.org/app/" aria-label="Open ChessPublisher Web"><ExternalLink size={17} /><span>ChessPublisher Web</span></a>
          <button type="button" className="companion-icon-action" onClick={onRefresh} disabled={busy} aria-label="Refresh tournaments"><RefreshCw size={18} className={busy ? 'spin' : ''} /><span>Refresh</span></button>
          <button type="button" className="companion-icon-action" onClick={onSignOut} aria-label="Sign out"><LogOut size={18} /><span>Sign out</span></button>
        </div>
      </header>

      <div className="companion-select-content companion-native-content">
        <section className="companion-select-head companion-hub-hero">
          <div><h1>{showTrash ? 'Trash' : 'My tournaments'}</h1><p>{showTrash ? 'Restore tournaments that were archived before permanent Cloud deletion was enabled.' : 'Create, import, or open a synchronized tournament.'}</p></div>
          <div className="companion-organizer-pill">
            {googleUser?.avatarUrl && googleUser.avatarUrl.startsWith('https://') ? (
              <img className="companion-organizer-avatar" src={googleUser.avatarUrl} alt="" referrerPolicy="no-referrer" />
            ) : (
              <ShieldCheck size={15} />
            )}
            <span><small>{authMode === 'google' ? (googleUser?.email || 'Google Cloud') : 'Organizer'}</small><strong>{organizerName}</strong></span>
          </div>
        </section>

        {!showTrash && (
          <section className="companion-start-actions" aria-label="Tournament start actions">
            <button type="button" className="companion-start-action primary" disabled={busy} onClick={() => setNewDialog(true)}>
              <Plus size={20} /><span><strong>New tournament</strong><small>Create a private Cloud tournament.</small></span>
            </button>
            <button type="button" className="companion-start-action" disabled={busy} onClick={() => importInputRef.current?.click()}>
              <FileUp size={20} /><span><strong>Import tournament</strong><small>TRF16, TRF26, TUNX or Players XML.</small></span>
            </button>
            <input
              ref={importInputRef}
              className="companion-import-input"
              type="file"
              accept=".trf,.trf16,.trf26,.txt,.tunx,.TUNX,.xml,.XML,text/plain,application/xml,text/xml,application/octet-stream"
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
          <div className="companion-new-dialog companion-native-sheet-backdrop" role="dialog" aria-modal="true" aria-label="Delete tournament from Cloud">
            <div className="companion-new-dialog-card companion-native-sheet companion-delete-sheet">
              <div className="companion-sheet-grabber" aria-hidden="true" />
              <div className="companion-new-dialog-head"><div><span className="companion-entry-eyebrow danger">PERMANENT CLOUD DELETE</span><h2>Delete from Cloud?</h2></div><button type="button" aria-label="Close" onClick={() => setDeleteTarget(null)}><X size={19} /></button></div>
              <div className="companion-delete-summary"><span className="companion-tournament-icon"><Trophy size={20} /></span><span><strong>{deleteTarget.name || 'Tournament'}</strong><small>Cloud revision r{Number(deleteTarget.revision || 0)}</small></span></div>
              <p>This permanently deletes the tournament from your private Organizer Cloud, including its stored private revisions and snapshots. It cannot be restored. The Public Hub page and Chess-Results tournament are not deleted.</p>
              <div className="companion-new-dialog-actions"><button type="button" onClick={() => setDeleteTarget(null)}>Cancel</button><button type="button" className="destructive" disabled={busy} onClick={() => void deleteFromCloud()}><Trash2 size={16} /> Delete from Cloud</button></div>
            </div>
          </div>
        )}

        <div className={`companion-select-status ${statusKind}`} role="status"><span className="companion-select-status-dot" /><span>{status}</span></div>

        <section className="companion-tournament-list companion-native-list">
          <div className="companion-tournament-list-head"><div><h2>{showTrash ? 'Recently removed' : 'Cloud tournaments'}</h2><p>{filtered.length === source.length ? `${source.length} tournament${source.length === 1 ? '' : 's'}` : `${filtered.length} of ${source.length}`} {showTrash ? 'in Trash.' : 'in your Cloud workspace.'}</p></div>{showTrash ? <Archive size={21} /> : <Cloud size={21} />}</div>
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
                  <button type="button" className="companion-tournament-delete" aria-label={`Delete ${meta.name || 'tournament'} from Cloud`} onClick={() => setDeleteTarget(meta)} disabled={busy}><Trash2 size={18} /></button>
                )}
              </article>
            ))}
            {!filtered.length && <div className="companion-tournament-empty">{showTrash ? <Archive size={30} /> : <Cloud size={30} />}<strong>{query ? 'No tournaments match your search.' : (showTrash ? 'Trash is empty.' : 'No synchronized tournaments yet.')}</strong><span>{query ? 'Try another name, ID or tournament key.' : (showTrash ? 'Previously archived tournaments appear here and can be restored.' : 'Create a tournament here, import TRF/TUNX/Players XML, or sync one from Chess-Publisher Desktop.')}</span></div>}
          </div>
        </section>
      </div>
    </main>
  );
}
