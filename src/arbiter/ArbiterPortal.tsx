import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Loader2, ShieldCheck, Smartphone, Wifi, WifiOff } from 'lucide-react';
import { arbiterApi, ArbiterTournamentView } from './arbiterApi';
import './arbiter-confirmation.css';

const DEVICE_KEY = 'cp.arbiter.device.v1';
const standardResults = ['1 - 0', '½ - ½', '0 - 1'] as const;
const specialResults = ['1F - 0F', '0F - 1F', '0F - 0F'] as const;
const allowedResults = [...standardResults, ...specialResults] as const;
const CLEAR_RESULT = '-' as const;
const administrativeEntryTypes = new Set(['PAB', 'REQUESTED_BYE', 'ZERO_POINT_BYE', 'UNPAIRED', 'ABSENT', 'WITHDRAWN']);

type ArbiterResult = typeof allowedResults[number];
type ArbiterSubmissionResult = ArbiterResult | typeof CLEAR_RESULT;
type OverwriteApproval = { from: string; to: ArbiterSubmissionResult };
type OverwriteConfirmation = {
  key: string;
  round: number;
  board: number;
  whiteKey: string;
  blackKey: string;
  whiteName: string;
  blackName: string;
  currentResult: string;
  nextResult: ArbiterSubmissionResult;
  source: 'selection' | 'sync-preflight';
};
type ResultObservation = {
  key: string;
  round: number;
  board: number;
  whiteKey: string;
  blackKey: string;
  result: string;
};
type ExternalResultNotice = {
  key: string;
  round: number;
  board: number;
  whiteKey: string;
  blackKey: string;
  whiteName: string;
  blackName: string;
  previousResult: string;
  currentResult: string;
  pendingDraft?: ArbiterSubmissionResult;
};

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

function isAllowedSubmissionResult(result: string): result is ArbiterSubmissionResult {
  return result === CLEAR_RESULT || isAllowedResult(result);
}

function recordedResult(result: unknown) {
  return String(result || CLEAR_RESULT);
}

function resultLabel(result: string) {
  return result === CLEAR_RESULT ? 'No result' : result;
}

function resultObservationKey(round: number, board: number, whiteKey: string, blackKey: string) {
  return `${round}:${board}:${whiteKey}:${blackKey}`;
}

function snapshotResults(view: ArbiterTournamentView) {
  const snapshot: Record<string, ResultObservation> = {};
  for (const [roundText, boards] of Object.entries(view.pairings?.liveBoards || {})) {
    const round = Number(roundText);
    if (!Number.isInteger(round) || round <= 0) continue;
    for (const board of boards) {
      if (!isNormalGame(board)) continue;
      const boardNumber = Number(board.board);
      if (!Number.isInteger(boardNumber) || boardNumber <= 0) continue;
      const whiteKey = String(board.whiteKey || '');
      const blackKey = String(board.blackKey || '');
      const identity = resultObservationKey(round, boardNumber, whiteKey, blackKey);
      snapshot[identity] = {
        key: `${round}:${boardNumber}`,
        round,
        board: boardNumber,
        whiteKey,
        blackKey,
        result: recordedResult(board.result)
      };
    }
  }
  return snapshot;
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
  const [overwriteConfirmation, setOverwriteConfirmation] = useState<OverwriteConfirmation | null>(null);
  const [externalResultNotices, setExternalResultNotices] = useState<ExternalResultNotice[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [online, setOnline] = useState(navigator.onLine);
  const pollRef = useRef<number | null>(null);
  const overwriteApprovalsRef = useRef<Record<string, OverwriteApproval>>({});
  const observedResultsRef = useRef<Record<string, ResultObservation> | null>(null);
  const ownResultWritesRef = useRef<Record<string, string>>({});

  const loadTournament = async (token = sessionToken, quiet = false) => {
    if (!token) return;
    if (!quiet) setBusy(true);
    try {
      const response = await arbiterApi.tournament(token);
      setView(response.tournament);
      setSessionName(response.session.name);
      const newest = latestRound(response.tournament);
      setActiveRound(current => current && response.tournament.pairings.liveBoards[String(current)] ? current : newest);
      if (!quiet) setMessage('Connected · live Cloud state is current.');
      return response.tournament;
    } catch (error: any) {
      if (error?.status === 401 || error?.status === 403) {
        localStorage.removeItem(storageKey);
        setSessionToken('');
        setView(null);
        setMessage('This Arbiter Access session is no longer valid. Ask the organizer for a new QR code.');
      } else if (!quiet) {
        setMessage(error?.message || 'Could not synchronize the tournament.');
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
    const synchronizeWhenActive = () => {
      if (document.visibilityState === 'visible') void loadTournament(sessionToken, true).catch(() => undefined);
    };
    window.addEventListener('focus', synchronizeWhenActive);
    document.addEventListener('visibilitychange', synchronizeWhenActive);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
      window.removeEventListener('focus', synchronizeWhenActive);
      document.removeEventListener('visibilitychange', synchronizeWhenActive);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionToken]);

  useEffect(() => {
    if (!view) {
      observedResultsRef.current = null;
      return;
    }

    const nextSnapshot = snapshotResults(view);
    const previousSnapshot = observedResultsRef.current;
    observedResultsRef.current = nextSnapshot;
    if (!previousSnapshot) return;

    const notices: ExternalResultNotice[] = [];
    const draftsAlreadyApplied: string[] = [];

    for (const [identity, current] of Object.entries(nextSnapshot)) {
      const previous = previousSnapshot[identity];
      if (!previous || previous.result === current.result) continue;

      const ownExpectedResult = ownResultWritesRef.current[current.key];
      if (ownExpectedResult === current.result) {
        delete ownResultWritesRef.current[current.key];
        continue;
      }
      if (ownExpectedResult) delete ownResultWritesRef.current[current.key];

      delete overwriteApprovalsRef.current[current.key];

      // First-time result entry from Desktop/Cloud is synchronized silently.
      // A correction/clear of an already recorded result requires an explicit warning.
      if (previous.result === CLEAR_RESULT) continue;

      const rawDraft = drafts[current.key];
      const pendingDraft = rawDraft && isAllowedSubmissionResult(rawDraft) && rawDraft !== current.result
        ? rawDraft
        : undefined;
      if (rawDraft && rawDraft === current.result) draftsAlreadyApplied.push(current.key);

      const white = playerLabel(view, current.whiteKey);
      const black = playerLabel(view, current.blackKey);
      notices.push({
        key: current.key,
        round: current.round,
        board: current.board,
        whiteKey: current.whiteKey,
        blackKey: current.blackKey,
        whiteName: white.name,
        blackName: black.name,
        previousResult: previous.result,
        currentResult: current.result,
        pendingDraft
      });
    }

    if (draftsAlreadyApplied.length) {
      setDrafts(current => {
        const next = { ...current };
        for (const key of draftsAlreadyApplied) delete next[key];
        return next;
      });
    }
    if (notices.length) {
      setExternalResultNotices(current => [...current, ...notices]);
    }
  }, [view, drafts]);

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

  const applyDraftChange = (
    key: string,
    currentResult: string,
    nextResult: ArbiterSubmissionResult,
    approvedFrom?: string
  ) => {
    setDrafts(current => {
      const next = { ...current };
      if (nextResult === currentResult) delete next[key];
      else next[key] = nextResult;
      return next;
    });
    if (nextResult === currentResult || !approvedFrom || approvedFrom === CLEAR_RESULT) {
      delete overwriteApprovalsRef.current[key];
    } else {
      overwriteApprovalsRef.current[key] = { from: approvedFrom, to: nextResult };
    }
  };

  const requestResultChange = (
    key: string,
    round: number,
    board: number,
    whiteKey: string,
    blackKey: string,
    whiteName: string,
    blackName: string,
    currentResult: string,
    nextResult: ArbiterSubmissionResult
  ) => {
    if (nextResult === currentResult) {
      applyDraftChange(key, currentResult, nextResult);
      return;
    }
    if (currentResult !== CLEAR_RESULT) {
      setOverwriteConfirmation({
        key,
        round,
        board,
        whiteKey,
        blackKey,
        whiteName,
        blackName,
        currentResult,
        nextResult,
        source: 'selection'
      });
      return;
    }
    applyDraftChange(key, currentResult, nextResult);
  };

  const confirmOverwrite = () => {
    const pending = overwriteConfirmation;
    if (!pending || !view) return;
    const latestBoard = matchingBoard(view, pending.round, pending.board, pending.whiteKey, pending.blackKey);
    if (!latestBoard) {
      setOverwriteConfirmation(null);
      delete overwriteApprovalsRef.current[pending.key];
      setMessage(`Board ${pending.board} changed while confirmation was open. Review the current pairing before trying again.`);
      return;
    }
    const latestResult = recordedResult(latestBoard.result);
    if (latestResult !== pending.currentResult) {
      setOverwriteConfirmation(null);
      delete overwriteApprovalsRef.current[pending.key];
      setMessage(`Board ${pending.board} result changed to ${resultLabel(latestResult)} while confirmation was open. Review the latest result before correcting it.`);
      return;
    }
    applyDraftChange(pending.key, latestResult, pending.nextResult, latestResult);
    setOverwriteConfirmation(null);
    setMessage(`Board ${pending.board}: result change confirmed. Press ↕ SYNC to save it.`);
  };

  const sendWithRevisionGuard = async (
    candidateView: ArbiterTournamentView,
    round: number,
    board: number,
    whiteKey: string,
    blackKey: string,
    result: ArbiterSubmissionResult,
    expectedCurrentResult: string
  ) => {
    if (!sessionToken) throw new Error('Arbiter session is not available.');

    const validate = (freshView: ArbiterTournamentView) => {
      const boardMatch = matchingBoard(freshView, round, board, whiteKey, blackKey);
      if (!boardMatch) throw new Error(`Board ${board} changed after the page was opened. ↕ SYNC stopped safely.`);
      if (!isNormalGame(boardMatch)) throw new Error(`Board ${board} is now an administrative pairing. ↕ SYNC stopped safely.`);
      if (freshView.pairings?.finalizedRounds?.[String(round)]) throw new Error(`Round ${round} is finalized. ↕ SYNC stopped safely.`);
      const liveResult = recordedResult(boardMatch.result);
      if (liveResult !== expectedCurrentResult) {
        throw new Error(`Board ${board} result changed from ${resultLabel(expectedCurrentResult)} to ${resultLabel(liveResult)} while ↕ SYNC was running. Review the latest result and confirm before overwriting it.`);
      }
    };

    const resultKey = `${round}:${board}`;
    const sendAtRevision = async (baseRevision: number) => {
      ownResultWritesRef.current[resultKey] = result;
      try {
        return await arbiterApi.submitResult(sessionToken, {
          round,
          board,
          whiteKey,
          blackKey,
          result,
          baseRevision
        });
      } catch (error) {
        if (ownResultWritesRef.current[resultKey] === result) delete ownResultWritesRef.current[resultKey];
        throw error;
      }
    };
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

      const synchronized = await arbiterApi.tournament(sessionToken);
      const retryView = synchronized.tournament;
      setView(retryView);
      setSessionName(synchronized.session.name);
      validate(retryView);
      const response = await sendAtRevision(retryView.revision);
      return advanceView(retryView, response);
    }
  };

  const submitAll = async () => {
    if (!view || !sessionToken || !activeRound || busy) return;
    const roundBoards = view.pairings.liveBoards[String(activeRound)] || [];
    const requested = roundBoards.flatMap(board => {
      const key = `${activeRound}:${board.board}`;
      const currentResult = recordedResult(board.result);
      const result = drafts[key];
      if (!isNormalGame(board) || !result || result === currentResult || !isAllowedSubmissionResult(result)) return [];
      return [{
        key,
        board: Number(board.board),
        whiteKey: board.whiteKey,
        blackKey: board.blackKey,
        currentResult,
        result
      }];
    });

    setBusy(true);
    setMessage(requested.length
      ? `↕ SYNC · checking current Cloud revision for ${requested.length} change(s)…`
      : '↕ SYNC · checking current Cloud state…');
    const completedKeys: string[] = [];
    try {
      const synchronized = await arbiterApi.tournament(sessionToken);
      let workingView = synchronized.tournament;
      setView(workingView);
      setSessionName(synchronized.session.name);

      if (!requested.length) {
        setMessage('↕ SYNC complete · no result changes are waiting.');
        return;
      }
      if (workingView.pairings?.finalizedRounds?.[String(activeRound)]) {
        throw new Error(`Round ${activeRound} is finalized. No result changes were sent.`);
      }

      const prepared = requested.map(item => {
        const freshBoard = matchingBoard(workingView, activeRound, item.board, item.whiteKey, item.blackKey);
        if (!freshBoard) throw new Error(`Board ${item.board} changed after the page was opened. ↕ SYNC stopped safely.`);
        if (!isNormalGame(freshBoard)) throw new Error(`Board ${item.board} is now an administrative pairing. ↕ SYNC stopped safely.`);
        const expectedCurrentResult = recordedResult(freshBoard.result);
        return { ...item, expectedCurrentResult };
      });

      const unconfirmedOverwrite = prepared.find(item => {
        if (item.result === item.expectedCurrentResult || item.expectedCurrentResult === CLEAR_RESULT) return false;
        const approval = overwriteApprovalsRef.current[item.key];
        return !approval || approval.from !== item.expectedCurrentResult || approval.to !== item.result;
      });

      if (unconfirmedOverwrite) {
        const white = playerLabel(workingView, unconfirmedOverwrite.whiteKey);
        const black = playerLabel(workingView, unconfirmedOverwrite.blackKey);
        setOverwriteConfirmation({
          key: unconfirmedOverwrite.key,
          round: activeRound,
          board: unconfirmedOverwrite.board,
          whiteKey: unconfirmedOverwrite.whiteKey,
          blackKey: unconfirmedOverwrite.blackKey,
          whiteName: white.name,
          blackName: black.name,
          currentResult: unconfirmedOverwrite.expectedCurrentResult,
          nextResult: unconfirmedOverwrite.result,
          source: 'sync-preflight'
        });
        setMessage(`↕ SYNC stopped safely · Board ${unconfirmedOverwrite.board} already has ${resultLabel(unconfirmedOverwrite.expectedCurrentResult)} in current Cloud state. Confirm the overwrite before synchronizing.`);
        return;
      }

      for (const item of prepared) {
        if (item.result === item.expectedCurrentResult) {
          completedKeys.push(item.key);
          continue;
        }
        workingView = await sendWithRevisionGuard(
          workingView,
          activeRound,
          item.board,
          item.whiteKey,
          item.blackKey,
          item.result,
          item.expectedCurrentResult
        );
        completedKeys.push(item.key);
      }

      setView(workingView);
      setDrafts(current => {
        const next = { ...current };
        for (const key of completedKeys) delete next[key];
        return next;
      });
      for (const key of completedKeys) delete overwriteApprovalsRef.current[key];
      setMessage(`↕ SYNC complete · ${completedKeys.length} result change(s) synchronized with Cloud.`);
      await loadTournament(sessionToken, true).catch(() => undefined);
    } catch (error: any) {
      if (completedKeys.length) {
        setDrafts(current => {
          const next = { ...current };
          for (const key of completedKeys) delete next[key];
          return next;
        });
        for (const key of completedKeys) delete overwriteApprovalsRef.current[key];
      }
      const detail = error?.message || '↕ SYNC could not be completed.';
      setMessage(completedKeys.length
        ? `↕ SYNC partial · ${completedKeys.length} of ${requested.length} change(s) synchronized. Unsent changes remain selected. ${detail}`
        : detail);
      await loadTournament(sessionToken, true).catch(() => undefined);
    } finally {
      setBusy(false);
    }
  };

  const externalResultNotice = externalResultNotices[0] || null;
  const dismissExternalResultNotice = () => {
    setExternalResultNotices(current => current.slice(1));
  };
  const useCloudResult = () => {
    if (!externalResultNotice) return;
    setDrafts(current => {
      const next = { ...current };
      delete next[externalResultNotice.key];
      return next;
    });
    delete overwriteApprovalsRef.current[externalResultNotice.key];
    setMessage(`Board ${externalResultNotice.board}: current Cloud result ${resultLabel(externalResultNotice.currentResult)} accepted.`);
    dismissExternalResultNotice();
  };
  const keepPendingResult = () => {
    if (!externalResultNotice) return;
    delete overwriteApprovalsRef.current[externalResultNotice.key];
    setMessage(`Board ${externalResultNotice.board}: your pending Web choice is kept. ↕ SYNC will require confirmation before changing the current Cloud result.`);
    dismissExternalResultNotice();
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
    const currentResult = recordedResult(board.result);
    const result = drafts[key];
    return isNormalGame(board) && Boolean(result) && result !== currentResult && isAllowedSubmissionResult(result);
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
        </div>
      </header>

      <main className="arbiter-main">
        {message && <div className="arbiter-message"><CheckCircle2 size={16} /> {message}</div>}

        <section className="arbiter-round-toolbar">
          <div><strong>Pairings & Results</strong><span>{finalized ? `Round ${activeRound} is finalized and read-only.` : 'Choose results or Clear result, then press ↕ SYNC once. Existing results require confirmation before overwrite.'}</span></div>
          <div className="arbiter-round-actions">
            <button type="button" className="arbiter-send-all" data-unified-arbiter-sync="true" disabled={busy || !online} onClick={() => void submitAll()} title="Synchronize the current tournament state and send every changed result with revision protection.">
              {busy ? <Loader2 size={17} className="spin" /> : null} ↕ SYNC{pendingDraftCount ? ` (${pendingDraftCount})` : ''}
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
            const currentResult = recordedResult(board.result);
            const selected = drafts[key] || currentResult;
            const canEdit = isNormalGame(board) && !finalized;
            const clearSelected = selected === CLEAR_RESULT && currentResult !== CLEAR_RESULT;
            const chooseResult = (result: ArbiterSubmissionResult) => requestResultChange(
              key,
              activeRound,
              Number(board.board),
              board.whiteKey,
              board.blackKey,
              white.name,
              black.name,
              currentResult,
              result
            );
            return (
              <article className="arbiter-board-card" data-result-missing={currentResult === CLEAR_RESULT ? 'true' : 'false'} key={key}>
                <div className="arbiter-board-number">Board {board.board}</div>
                <div className="arbiter-player white">
                  <div className="arbiter-player-name-row"><span className="arbiter-color-badge white" aria-label="White">W</span><strong>{white.name}</strong></div>
                  <span>{white.meta}</span>
                </div>
                <div className="arbiter-result-value">{selected === CLEAR_RESULT ? '—' : selected}</div>
                <div className="arbiter-player black">
                  <div className="arbiter-player-name-row"><span className="arbiter-color-badge black" aria-label="Black">B</span><strong>{black.name}</strong></div>
                  <span>{black.meta}</span>
                </div>
                {canEdit ? (
                  <div className="arbiter-result-actions">
                    <div className="arbiter-result-groups">
                      <div className="arbiter-result-buttons">
                        {standardResults.map(result => <button key={result} type="button" className={selected === result ? 'selected' : ''} onClick={() => chooseResult(result)}>{result}</button>)}
                      </div>
                      <div className="arbiter-special-results">
                        <span>Special results</span>
                        <div className="arbiter-result-buttons arbiter-special-result-buttons">
                          {specialResults.map(result => <button key={result} type="button" className={selected === result ? 'selected' : ''} onClick={() => chooseResult(result)}>{result}</button>)}
                        </div>
                      </div>
                      <button
                        type="button"
                        className={`arbiter-clear-result${clearSelected ? ' selected' : ''}`}
                        disabled={selected === CLEAR_RESULT && currentResult === CLEAR_RESULT}
                        onClick={() => chooseResult(CLEAR_RESULT)}
                      >
                        Clear result
                      </button>
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

      {overwriteConfirmation && (
        <div
          className="arbiter-confirmation-backdrop"
          role="presentation"
          onMouseDown={event => {
            if (event.currentTarget === event.target) setOverwriteConfirmation(null);
          }}
          onKeyDown={event => {
            if (event.key === 'Escape') setOverwriteConfirmation(null);
          }}
        >
          <section className="arbiter-confirmation-dialog" role="dialog" aria-modal="true" aria-labelledby="arbiter-confirmation-title">
            <span className="arbiter-confirmation-eyebrow"><ShieldCheck size={15} /> RESULT CHANGE PROTECTION</span>
            <h2 id="arbiter-confirmation-title">Confirm result change</h2>
            <p className="arbiter-confirmation-pairing">Board {overwriteConfirmation.board} · W {overwriteConfirmation.whiteName} vs B {overwriteConfirmation.blackName}</p>
            <div className="arbiter-confirmation-change" aria-label="Result change">
              <div><span>Current</span><strong>{resultLabel(overwriteConfirmation.currentResult)}</strong></div>
              <b aria-hidden="true">→</b>
              <div><span>New</span><strong>{resultLabel(overwriteConfirmation.nextResult)}</strong></div>
            </div>
            <p className="arbiter-confirmation-warning">
              A result is already recorded for this game. Confirm only if this correction is intentional.
              {overwriteConfirmation.source === 'sync-preflight' ? ' The Cloud result changed since this page selection was made.' : ''}
            </p>
            <div className="arbiter-confirmation-actions">
              <button type="button" className="cancel" autoFocus onClick={() => setOverwriteConfirmation(null)}>Cancel</button>
              <button type="button" className="confirm" onClick={confirmOverwrite}>Change result</button>
            </div>
          </section>
        </div>
      )}

      {externalResultNotice && !overwriteConfirmation && (
        <div className="arbiter-external-result-backdrop" role="presentation">
          <section className="arbiter-external-result-dialog" role="dialog" aria-modal="true" aria-labelledby="arbiter-external-result-title">
            <span className="arbiter-external-result-eyebrow"><ShieldCheck size={15} /> DESKTOP / CLOUD UPDATE</span>
            <h2 id="arbiter-external-result-title">Result updated in Cloud</h2>
            <p className="arbiter-confirmation-pairing">Round {externalResultNotice.round} · Board {externalResultNotice.board} · W {externalResultNotice.whiteName} vs B {externalResultNotice.blackName}</p>
            <div className="arbiter-confirmation-change" aria-label="External result change">
              <div><span>Previous</span><strong>{resultLabel(externalResultNotice.previousResult)}</strong></div>
              <b aria-hidden="true">→</b>
              <div><span>Cloud now</span><strong>{resultLabel(externalResultNotice.currentResult)}</strong></div>
            </div>
            <p className="arbiter-external-result-warning">
              This result changed outside this Arbiter page. The current Cloud result is already active. This notification does not write or overwrite tournament data.
            </p>
            {externalResultNotice.pendingDraft ? (
              <>
                <p className="arbiter-external-result-pending">Your unsent Web choice is <strong>{resultLabel(externalResultNotice.pendingDraft)}</strong>. Choose whether to discard it or keep it pending for a later protected ↕ SYNC.</p>
                <div className="arbiter-external-result-actions two">
                  <button type="button" className="use-cloud" autoFocus onClick={useCloudResult}>Use Cloud result</button>
                  <button type="button" className="keep-pending" onClick={keepPendingResult}>Keep my pending change</button>
                </div>
              </>
            ) : (
              <div className="arbiter-external-result-actions">
                <button type="button" className="acknowledge" autoFocus onClick={dismissExternalResultNotice}>Acknowledge</button>
              </div>
            )}
          </section>
        </div>
      )}

      <footer className="arbiter-footer"><ShieldCheck size={14} /> Pairings + Results only · Publishing is disabled for Arbiter Access</footer>
    </div>
  );
};