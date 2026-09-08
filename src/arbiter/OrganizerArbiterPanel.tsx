import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Clipboard, Loader2, QrCode, RefreshCw, ShieldCheck, UserRoundCheck, Users, X } from 'lucide-react';
import { arbiterApi, ArbiterAccessStatus, ArbiterSubmission } from './arbiterApi';
import { Tournament } from '../types';

const TOURNAMENT_STORAGE_KEY = 'fide_tournament_manager_v2';
const QR_MODULE_URL = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/+esm';

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

function readTournament(): Tournament | null {
  try {
    const raw = localStorage.getItem(TOURNAMENT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function relativeTime(value?: string) {
  if (!value) return 'never';
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return value;
  const seconds = Math.max(0, Math.round((Date.now() - time) / 1000));
  if (seconds < 10) return 'now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}

export const OrganizerArbiterPanel: React.FC<{ cloud: any }> = ({ cloud }) => {
  const token = String(cloud?.token || '').trim();
  const tournamentId = String(cloud?.activeCloud?.id || '').trim();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<ArbiterAccessStatus | null>(null);
  const [pending, setPending] = useState<ArbiterSubmission[]>([]);
  const [accessUrl, setAccessUrl] = useState('');
  const [qrSvg, setQrSvg] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const applyingRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!token || !tournamentId) return;
    try {
      const [nextStatus, nextPending] = await Promise.all([
        arbiterApi.organizerStatus(token, tournamentId),
        arbiterApi.organizerPendingResults(token, tournamentId)
      ]);
      setStatus(nextStatus);
      setPending(nextPending.results || []);
    } catch (error: any) {
      setMessage(error?.message || 'Could not refresh Arbiter Access.');
    }
  }, [token, tournamentId]);

  useEffect(() => {
    if (!token || !tournamentId) return;
    void refresh();
    const timer = window.setInterval(() => void refresh(), 8000);
    return () => window.clearInterval(timer);
  }, [token, tournamentId, refresh]);

  const renderQr = async (url: string) => {
    if (!url) return;
    try {
      const moduleUrl = QR_MODULE_URL;
      const mod: any = await import(/* @vite-ignore */ moduleUrl);
      const factory = mod.default || mod;
      const qr = factory(0, 'M');
      qr.addData(url);
      qr.make();
      setQrSvg(qr.createSvgTag({ cellSize: 5, margin: 4, scalable: true }));
    } catch {
      setQrSvg('');
      setMessage('QR renderer could not load. The secure Copy link option is still available.');
    }
  };

  const createGrant = async () => {
    if (!token || !tournamentId) return;
    setBusy(true);
    setMessage('');
    try {
      const result = await arbiterApi.createGrant(token, tournamentId);
      setStatus(result);
      setAccessUrl(result.accessUrl);
      await renderQr(result.accessUrl);
      setMessage('New Arbiter Access QR created. Previous arbiter sessions for this tournament were revoked.');
    } catch (error: any) {
      setMessage(error?.message || 'Could not create Arbiter Access.');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    if (!token || !tournamentId) return;
    if (!window.confirm('Revoke Arbiter Access for this tournament? All current arbiter sessions will stop working immediately.')) return;
    setBusy(true);
    setMessage('');
    try {
      await arbiterApi.revokeGrant(token, tournamentId);
      setAccessUrl('');
      setQrSvg('');
      setPending([]);
      await refresh();
      setMessage('Arbiter Access revoked.');
    } catch (error: any) {
      setMessage(error?.message || 'Could not revoke Arbiter Access.');
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    if (!accessUrl) return;
    await navigator.clipboard.writeText(accessUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const applyPending = useCallback(async (items: ArbiterSubmission[]) => {
    if (!items.length || !token || !tournamentId || applyingRef.current || cloud?.busy || cloud?.conflict) return;
    applyingRef.current = true;
    setMessage(`Applying ${items.length} arbiter result${items.length === 1 ? '' : 's'}…`);
    try {
      const current = readTournament();
      if (!current) throw new Error('The open tournament could not be read from this browser.');
      const currentCloudId = String((current as any)?.cloud?.cloudTournamentId || tournamentId);
      if (currentCloudId && currentCloudId !== tournamentId) throw new Error('Arbiter results belong to a different Cloud tournament.');

      const next: any = clone(current);
      const appliedIds: string[] = [];
      for (const submission of [...items].sort((a, b) => String(a.updatedAt || '').localeCompare(String(b.updatedAt || '')))) {
        const roundKey = String(submission.round);
        if (next.pairings?.finalizedRounds?.[roundKey]) continue;
        const boards = Array.isArray(next.pairings?.liveBoards?.[roundKey]) ? [...next.pairings.liveBoards[roundKey]] : [];
        const index = boards.findIndex((board: any) => Number(board.board) === Number(submission.board));
        if (index < 0) continue;
        const board = boards[index];
        if (String(board.whiteKey || '') !== submission.whiteKey || String(board.blackKey || '') !== submission.blackKey) continue;
        boards[index] = { ...board, result: submission.result };
        next.pairings.liveBoards[roundKey] = boards;
        appliedIds.push(submission.id);
      }

      if (!appliedIds.length) {
        setMessage('Arbiter results are waiting because the pairing changed or the round is finalized.');
        return;
      }

      localStorage.setItem(TOURNAMENT_STORAGE_KEY, JSON.stringify(next));
      await cloud.syncNow(next);
      await arbiterApi.acknowledgeResults(token, tournamentId, appliedIds);
      setMessage(`${appliedIds.length} arbiter result${appliedIds.length === 1 ? '' : 's'} synchronized to Cloud.`);
      await refresh();
    } catch (error: any) {
      setMessage(error?.message || 'Arbiter results are waiting for organizer synchronization.');
    } finally {
      applyingRef.current = false;
    }
  }, [token, tournamentId, cloud, refresh]);

  useEffect(() => {
    if (!pending.length || cloud?.busy || cloud?.conflict) return;
    void applyPending(pending);
  }, [pending, cloud?.busy, cloud?.conflict, applyPending]);

  if (!token || !tournamentId) return null;

  const sessions = status?.sessions || [];
  const onlineCount = sessions.filter(session => session.online).length;

  return (
    <div className={`organizer-arbiter-panel ${open ? 'is-open' : ''}`} data-arbiter-organizer-panel>
      {!open ? (
        <button type="button" className="organizer-arbiter-fab" onClick={() => setOpen(true)} title="Manage Arbiter Access">
          <UserRoundCheck size={20} />
          <span><strong>Arbiters</strong><small>{onlineCount ? `${onlineCount} active` : status?.grant ? 'Access ready' : 'No access'}</small></span>
          {pending.length > 0 && <b>{pending.length}</b>}
        </button>
      ) : (
        <section className="organizer-arbiter-card">
          <header>
            <div><span>ARBITER ACCESS</span><h3><Users size={18} /> Tournament arbiters</h3></div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close Arbiter Access"><X size={18} /></button>
          </header>

          <div className="organizer-arbiter-summary">
            <span><strong>{sessions.length}</strong><small>joined</small></span>
            <span><strong>{onlineCount}</strong><small>active now</small></span>
            <span><strong>{pending.length}</strong><small>result queue</small></span>
          </div>

          {sessions.length > 0 ? (
            <div className="organizer-arbiter-sessions">
              {sessions.map(session => (
                <div key={session.id} className="organizer-arbiter-session">
                  <i className={session.online ? 'online' : ''} />
                  <span><strong>{session.name}</strong><small>{session.online ? 'Working now' : `Last active ${relativeTime(session.lastSeenAt)}`}{session.lastSubmitAt ? ` · result ${relativeTime(session.lastSubmitAt)}` : ''}</small></span>
                </div>
              ))}
            </div>
          ) : (
            <div className="organizer-arbiter-empty">No arbiters have joined this tournament yet.</div>
          )}

          {accessUrl && (
            <div className="organizer-arbiter-share">
              {qrSvg ? <div className="organizer-arbiter-qr" dangerouslySetInnerHTML={{ __html: qrSvg }} /> : <div className="organizer-arbiter-qr fallback"><QrCode size={56} /></div>}
              <div><strong>Scan on the arbiter's phone</strong><small>The arbiter enters a name once. The device keeps access until it is revoked.</small></div>
            </div>
          )}

          <div className="organizer-arbiter-actions">
            <button type="button" className="primary" disabled={busy} onClick={() => void createGrant()}>{busy ? <Loader2 size={16} className="spin" /> : <QrCode size={16} />}{status?.grant ? 'Generate new QR' : 'Generate QR'}</button>
            {accessUrl && <button type="button" disabled={busy} onClick={() => void copyLink()}>{copied ? <Check size={16} /> : <Clipboard size={16} />}{copied ? 'Copied' : 'Copy link'}</button>}
            {status?.grant && <button type="button" className="danger" disabled={busy} onClick={() => void revoke()}><ShieldCheck size={16} /> Revoke</button>}
            <button type="button" disabled={busy} onClick={() => void refresh()}><RefreshCw size={16} /> Refresh</button>
          </div>

          {message && <div className="organizer-arbiter-message">{message}</div>}
          <footer><ShieldCheck size={14} /> Arbiter sessions can read pairings and submit/update results only. Publish permissions are never issued.</footer>
        </section>
      )}
    </div>
  );
};
