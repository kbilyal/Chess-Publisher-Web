import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Loader2, RefreshCw, ShieldCheck, Smartphone, Wifi, WifiOff } from 'lucide-react';
import { arbiterApi, ArbiterTournamentView } from './arbiterApi';

const DEVICE_KEY = 'cp.arbiter.device.v1';
const standardResults = ['1 - 0', '½ - ½', '0 - 1'] as const;
const specialResults = ['1F - 0F', '0F - 1F', '0F - 0F'] as const;
const allowedResults = [...standardResults, ...specialResults] as const;
const administrativeEntryTypes = new Set(['PAB', 'REQUESTED_BYE', 'ZERO_POINT_BYE', 'UNPAIRED', 'ABSENT', 'WITHDRAWN']);

type ArbiterResult = typeof allowedResults[number];

function accessCodeFromUrl() {
  return new URLSearchParams(window.location.search).get('arbiter')?.trim() || '';
}

function deviceId() {
  const existing = localStorage.getItem(DEVICE_KEY);
  if (existing) return existing;
  const id = `arbiter-web:${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
  localStorage.setItem(DEVICE_KEY, id);
  return id;
}

function sessionStorageKey(accessCode: string) {
  return `cp.arbiter.session.${accessCode.slice(0, 20)}`;
}

function latestRound(view: ArbiterTournamentView | null) {
  if (!view) return 0;
  return Object.keys(view.pairings?.liveBoards || {})
    .map(Number)
    .filter(value => Number.isFinite(value) && value > 0)
    .reduce((max, value) => Math.max(max, value), 0);
}

function playerLabel(view: ArbiterTournamentView, key: string) {
  const player = view.players.find(item => item.localKey === key);
  if (!player) return { name: key || '—', meta: '' };
  const title = player.title ? `${player.title} ` : '';
  return {
    name: `${title}${player.name}`.trim(),
    meta: `${player.fed || 'FID'} · ${player.rating || '—'}${player.fideId && player.fideId !== '-' ? ` · FIDE ${player.fideId}` : ''}`
  };
}

function matchingBoard(view: ArbiterTournamentView, round: number, board: number, whiteKey: string, blackKey: string) {
  const boards = view.pairings?.liveBoards?.[String(round)] || [];
  const candidate = boards.find(item => Number(item.board) === Number(board));
  if (!candidate) return null;
  if (String(candidate.whiteKey || '') !== whiteKey || String(candidate.blackKey || '') !== blackKey) return null;
  return candidate;
}

function isNormalGame(board: { whiteKey?: string; blackKey?: string; entryType?: string }) {
  return Boolean(board.whiteKey && board.blackKey) && !administrativeEntryTypes.has(String(board.entryType || ''));
}

function isAllowedResult(result: string): result is ArbiterResult {
  return allowedResults.includes(result as ArbiterResult);
}

export const ArbiterPortal: React.FC = () => {
  const accessCode = useMemo(accessCodeFromUrl, []);
  const storageKey = useMemo(() => sessionStorageKey(accessCode), [accessCode]);
  const [sessionToken, setSessionToken] = useState(() => accessCode ? localStorage.getItem(storageKey) || '' : '');
  const [name, setName] = useState('');
  const [view, setView] = useState<ArbiterTournamentView | null>(null);
  const [sessionName, setSessionName] = useState('');
  const [activeRound, setActiveRound] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [online, setOnline] = useState(navigator.onLine);
  const pollRef = useRef<number | null>(null);

  const loadTournament = async (token = sessionToken, quiet = false) => {
    if (!token) return;
    if (!quiet) setBusy(true);
    try {
      const response = await arbiterApi.tournament(token);
      setView(response.tournament);
      setSessionName(response.session.name);
      const newest = latestRound(response.tournament);
      setActiveRound(current => current && response.tournament.pairings.liveBoards[String(current)] ? current : newest);
      if (!quiet) setMessage('Connected · pairings are current.');
      return response.tournament;
    } catch (error: any) {
      if (error?.status === 401 || error?.status === 403) {
        localStorage.removeItem(storageKey);
        setSessionToken('');
        setView(null);
        setMessage('This Arbiter Access session is no longer valid. Ask the organizer for a new QR code.');
      } else if (!quiet) {
        setMessage(error?.message || 'Could not refresh tournament.');
      }
      throw error;
    } finally {
      if (!quiet) setBusy(false);
    }
  };

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    if (!sessionToken) return;
    void loadTournament(sessionToken).catch(() => undefined);
    pollRef.current = window.setInterval(() => void loadTournament(sessionToken, true).catch(() => undefined), 5000);
    const refreshWhenActive = () => {
      if (document.visibilityState === 'visible') void loadTournament(sessionToken, true).catch(() => undefined);
    };
    window.addEventListener('focus', refreshWhenActive);
    document.addEventListener('visibilitychange', refreshWhenActive);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
      window.removeEventListener('focus', refreshWhenActive);
      document.removeEventListener('visibilitychange', refreshWhenActive);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionToken]);

  const join = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!accessCode || name.trim().length < 2) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await arbiterApi.join(accessCode, name.trim(), deviceId());
      localStorage.setItem(storageKey, response.sessionToken);
      setSessionToken(response.sessionToken);
      setSessionName(response.session.name);
      setMessage(`Welcome, ${response.session.name}.`);
    } catch (error: any) {
      setMessage(error?.message || 'Could not join this tournament.');
    } finally {
      setBusy(false);
    }
  };

  const sendWithRevisionGuard = async (
    candidateView: ArbiterTournamentView,
    round: number,
    board: number,
    whiteKey: string,
    blackKey: string,
    result: ArbiterResult
  ) => {
    if (!sessionToken) throw new Error('Arbiter session is not available.');

    const validate = (freshView: ArbiterTournamentView) => {
      const boardMatch = matchingBoard(freshView, round, board, whiteKey, blackKey);
      if (!boardMatch) throw new Error(`Board ${board} changed after the page was opened. The result was not sent.`);
      if (!isNormalGame(boardMatch)) throw new Error(`Board ${board} is now an administrative pairing. The result was not sent.`);
      if (freshView.pairings?.finalizedRounds?.[String(round)]) throw new Error(`Round ${round} is finalized. The result was not sent.`);
    };

    const sendAtRevision = (baseRevision: number) => arbiterApi.submitResult(sessionToken, {
      round,
      board,
      whiteKey,
      blackKey,
      result,
      baseRevision
    });
    const advanceView = (source: ArbiterTournamentView, response: any) => {
      const revision = Number(response?.revision ?? source.revision);
      const next = JSON.parse(JSON.stringify(source)) as ArbiterTournamentView;
      next.revision = Number.isInteger(revision) && revision >= 0 ? revision : source.revision;
      const matched = matchingBoard(next, round, board, whiteKey, blackKey);
      if (matched) matched.result = result;
      return next;
    };

    validate(candidateView);
    try {
      const response = await sendAtRevision(candidateView.revision);
      return advanceView(candidateView, response);
    } catch (error: any) {
      if (error?.code !== 'cloud_revision_conflict') throw error;

      const refreshed = await arbiterApi.tournament(sessionToken);
      const retryView = refreshed.tournament;
      setView(retryView);
      setSessionName(refreshed.session.name);
      validate(retryView);
      const response = await sendAtRevision(retryView.revision);
      return advanceView(retryView, response);
    }
  };

  const submit = async (round: number, board: number, whiteKey: string, blackKey: string, currentResult: string) => {
    if (!view || !sessionToken) return;
    const key = `${round}:${board}`;
    const result = drafts[key] || currentResult;
    if (!isAllowedResult(result)) return;
    setBusy(true);
    setMessage('Checking current Cloud revision…');
    try {
      const freshResponse = await arbiterApi.tournament(sessionToken);
      const freshView = freshResponse.tournament;
      setView(freshView);
      setSessionName(freshResponse.session.name);
      await sendWithRevisionGuard(freshView, round, board, whiteKey, blackKey, result);

      setMessage(`${currentResult && currentResult !== '-' ? 'Updated' : 'Sent'} Board ${board}: ${result} · saved to Cloud.`);
      setDrafts(current => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      await loadTournament(sessionToken, true).catch(() => undefined);
    } catch (error: any) {
      setMessage(error?.message || 'Result could not be sent.');
      await loadTournament(sessionToken, true).catch(() => undefined);
    } finally {
      setBusy(false);
    }
  };

  const submitAll = async () => {
    if (!view || !sessionToken || !activeRound) return;
    const roundBoards = view.pairings.liveBoards[String(activeRound)] || [];
    const pending = roundBoards.flatMap(board => {
      const key = `${activeRound}:${board.board}`;
      const currentResult = board.result || '-';
      const result = drafts[key];
      if (!isNormalGame(board) || !result || result === currentResult || !isAllowedResult(result)) return [];
      return [{ key, board: Number(board.board), whiteKey: board.whiteKey, blackKey: board.blackKey, result }];
    });

    if (!pending.length) {
      await loadTournament(sessionToken, true).catch(() => undefined);
      setMessage('↕ SYNC complete · no result changes are waiting to be sent.');
      return;
    }

    setBusy(true);
    setMessage(`Checking current Cloud revision for ${pending.length} result(s)…`);
    const sentKeys: string[] = [];
    try {
      const freshResponse = await arbiterApi.tournament(sessionToken);
      let workingView = freshResponse.tournament;
      setView(workingView);
      setSessionName(freshResponse.session.name);
      if (workingView.pairings?.finalizedRounds?.[String(activeRound)]) throw new Error(`Round ${activeRound} is finalized. No remaining results were sent.`);

      for (const item of pending) {
        workingView = await sendWithRevisionGuard(
          workingView,
          activeRound,
          item.board,
          item.whiteKey,
          item.blackKey,
          item.result
        );
        sentKeys.push(item.key);
      }

      setDrafts(current => {
        const next = { ...current };
        for (const key of sentKeys) delete next[key];
        return next;
      });
      setMessage(`Sent all ${sentKeys.length} changed result(s) for Round ${activeRound} · saved to Cloud.`);
      await loadTournament(sessionToken, true).catch(() => undefined);
    } catch (error: any) {
      if (sentKeys.length) {
        setDrafts(current => {
          const next = { ...current };
          for (const key of sentKeys) delete next[key];
          return next;
        });
      }
      const detail = error?.message || 'Result batch could not be completed.';
      setMessage(sentKeys.length
        ? `${sentKeys.length} of ${pending.length} result(s) were sent. Unsent changes remain selected. ${detail}`
        : detail);
      await loadTournament(sessionToken, true).catch(() => undefined);
    } finally {
      setBusy(false);
    }
  };

  if (!accessCode) {
    return (
      <main className="arbiter-entry-shell">
        <section className="arbiter-entry-card">
          <ShieldCheck size={34} />
          <h1>Arbiter Access</h1>
          <p>This link does not contain a valid tournament access grant.</p>
        </section>
      </main>
    );
  }

  if (!sessionToken) {
    return (
      <main className="arbiter-entry-shell">
        <form className="arbiter-entry-card" onSubmit={join}>
          <div className="arbiter-brand-mark">CP</div>
          <span className="arbiter-eyebrow">ARBITER ACCESS</span>
          <h1>Enter your name</h1>
          <p>The organizer will see this name while results are being entered. Access is limited to pairings and results for this tournament.</p>
          <label className="arbiter-name-field">
            <span>Arbiter name</span>
            <input value={name} onChange={event => setName(event.target.value)} autoFocus autoComplete="name" maxLength={80} placeholder="e.g. Ivan Petrov" />
          </label>
          <button type="submit" className="arbiter-primary" disabled={busy || name.trim().length < 2}>
            {busy ? <Loader2 size={18} className="spin" /> : <Smartphone size={18} />} Join tournament
          </button>
          {message && <div className="arbiter-message warn">{message}</div>}
          <small className="arbiter-security-note"><ShieldCheck size={14} /> No publishing, tournament setup, Cloud administration or Chess-Results access.</small>
        </form>
      </main>
    );
  }

  if (!view) {
    return (
      <main className="arbiter-entry-shell">
        <section className="arbiter-entry-card">
          <Loader2 size={28} className="spin" />
          <h1>Loading tournament…</h1>
          {message && <p>{message}</p>}
        </section>
      </main>
    );
  }

  const rounds = Object.keys(view.pairings.liveBoards || {}).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  const boards = view.pairings.liveBoards[String(activeRound)] || [];
  const finalized = Boolean(view.pairings.finalizedRounds?.[String(activeRound)]);
  const pendingDraftCount = finalized ? 0 : boards.filter(board => {
    const key = `${activeRound}:${board.board}`;
    const currentResult = board.result || '-';
    const result = drafts[key];
    return isNormalGame(board) && Boolean(result) && result !== currentResult && isAllowedResult(result);
  }).length;

  return (
    <div className="arbiter-shell">
      <header className="arbiter-topbar">
        <div>
          <span className="arbiter-eyebrow">ARBITER ACCESS</span>
          <h1>{view.name}</h1>
          <p>{sessionName} · Cloud revision {view.revision}</p>
        </div>
        <div className="arbiter-top-actions">
          <span className={`arbiter-connection ${online ? 'online' : 'offline'}`}>{online ? <Wifi size={15} /> : <WifiOff size={15} />}{online ? 'Connected' : 'Offline'}</span>
          <button type="button" onClick={() => void loadTournament().catch(() => undefined)} disabled={busy}><RefreshCw size={17} className={busy ? 'spin' : ''} /> Refresh</button>
        </div>
      </header>

      <main className="arbiter-main">
        {message && <div className="arbiter-message"><CheckCircle2 size={16} /> {message}</div>}

        <section className="arbiter-round-toolbar">
          <div><strong>Pairings & Results</strong><span>{finalized ? `Round ${activeRound} is finalized and read-only.` : 'Tap results, then send one board or all changed boards.'}</span></div>
          <div className="arbiter-round-actions">
            <button type="button" className="arbiter-send-all" data-unified-arbiter-sync="true" disabled={busy} onClick={() => void submitAll()} title="Send all changed results with revision protection, or refresh when nothing changed.">
              {busy ? <Loader2 size={15} className="spin" /> : null} ↕ SYNC{pendingDraftCount ? ` (${pendingDraftCount})` : ''}
            </button>
            <label><span>Round</span><select value={activeRound} onChange={event => setActiveRound(Number(event.target.value))}>{rounds.map(round => <option key={round} value={round}>Round {round}</option>)}</select></label>
          </div>
        </section>

        <section className="arbiter-board-list">
          {boards.length === 0 && <div className="arbiter-empty">No pairings are available for this round yet.</div>}
          {boards.map(board => {
            const white = playerLabel(view, board.whiteKey);
            const black = playerLabel(view, board.blackKey);
            const key = `${activeRound}:${board.board}`;
            const currentResult = board.result || '-';
            const selected = drafts[key] || currentResult;
            const canEdit = isNormalGame(board) && !finalized;
            return (
              <article className="arbiter-board-card" data-result-missing={currentResult === '-' ? 'true' : 'false'} key={key}>
                <div className="arbiter-board-number">Board {board.board}</div>
                <div className="arbiter-player white"><strong>{white.name}</strong><span>{white.meta}</span></div>
                <div className="arbiter-result-value">{selected === '-' ? '—' : selected}</div>
                <div className="arbiter-player black"><strong>{black.name}</strong><span>{black.meta}</span></div>
                {canEdit ? (
                  <div className="arbiter-result-actions">
                    <div className="arbiter-result-groups">
                      <div className="arbiter-result-buttons">
                        {standardResults.map(result => <button key={result} type="button" className={selected === result ? 'selected' : ''} onClick={() => setDrafts(current => ({ ...current, [key]: result }))}>{result}</button>)}
                      </div>
                      <div className="arbiter-special-results">
                        <span>Special results</span>
                        <div className="arbiter-result-buttons arbiter-special-result-buttons">
                          {specialResults.map(result => <button key={result} type="button" className={selected === result ? 'selected' : ''} onClick={() => setDrafts(current => ({ ...current, [key]: result }))}>{result}</button>)}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="arbiter-readonly">{finalized ? 'Finalized' : 'Administrative pairing · result controlled by tournament rules'}</div>
                )}
              </article>
            );
          })}
        </section>
      </main>

      <footer className="arbiter-footer"><ShieldCheck size={14} /> Pairings + Results only · Publishing is disabled for Arbiter Access</footer>
    </div>
  );
};