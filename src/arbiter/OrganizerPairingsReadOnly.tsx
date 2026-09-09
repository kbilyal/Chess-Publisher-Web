import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Eye, Printer, X } from 'lucide-react';
import { Tournament } from '../types';

const TOURNAMENT_STORAGE_KEY = 'fide_tournament_manager_v2';

function readTournament(expectedCloudId: string): Tournament | null {
  try {
    const raw = localStorage.getItem(TOURNAMENT_STORAGE_KEY);
    if (!raw) return null;
    const tournament = JSON.parse(raw) as Tournament;
    const cloudId = String((tournament as any)?.cloud?.cloudTournamentId || '').trim();
    if (expectedCloudId && cloudId && cloudId !== expectedCloudId) return null;
    return tournament;
  } catch {
    return null;
  }
}

function resultText(value: unknown) {
  const text = String(value || '').trim();
  return text && text !== '-' ? text : '*';
}

export const OrganizerPairingsReadOnly: React.FC<{ cloud: any }> = ({ cloud }) => {
  const token = String(cloud?.token || '').trim();
  const tournamentId = String(cloud?.activeCloud?.id || '').trim();
  const [open, setOpen] = useState(false);
  const [tournament, setTournament] = useState<Tournament | null>(() => readTournament(tournamentId));
  const [selectedRound, setSelectedRound] = useState(1);
  const lastSnapshotRef = useRef('');

  useEffect(() => {
    const refresh = () => {
      const next = readTournament(tournamentId);
      const signature = next ? JSON.stringify({
        id: (next as any)?.cloud?.cloudTournamentId || '',
        name: next.name,
        rounds: next.settings?.rounds,
        players: next.players,
        liveBoards: next.pairings?.liveBoards
      }) : '';
      if (signature === lastSnapshotRef.current) return;
      lastSnapshotRef.current = signature;
      setTournament(next);
    };

    refresh();
    const timer = window.setInterval(refresh, 1000);
    window.addEventListener('storage', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('storage', refresh);
    };
  }, [tournamentId]);

  const generatedRounds = useMemo(() => {
    const liveBoards = tournament?.pairings?.liveBoards || {};
    return Object.keys(liveBoards).map(Number).filter(round => round > 0).sort((a, b) => a - b);
  }, [tournament]);

  useEffect(() => {
    if (!generatedRounds.length) {
      setSelectedRound(1);
      return;
    }
    if (!generatedRounds.includes(selectedRound)) {
      setSelectedRound(generatedRounds[generatedRounds.length - 1]);
    }
  }, [generatedRounds, selectedRound]);

  if (!token || !tournamentId || !tournament) return null;

  const liveBoards = tournament.pairings?.liveBoards || {};
  const currentBoards = liveBoards[String(selectedRound)] || [];
  const announcedRounds = Number.parseInt(String(tournament.settings?.rounds || '')) || generatedRounds.length || 1;
  const playerByKey = new Map(tournament.players.map(player => [player.localKey, player]));

  const handlePrint = () => {
    const className = 'cp-organizer-pairings-printing';
    const cleanup = () => document.body.classList.remove(className);
    document.body.classList.add(className);
    window.addEventListener('afterprint', cleanup, { once: true });
    window.setTimeout(cleanup, 30000);
    window.requestAnimationFrame(() => window.print());
  };

  return (
    <div className={`organizer-pairings-panel ${open ? 'is-open' : ''}`} data-organizer-pairings-readonly="true" data-cloud-tournament-id={tournamentId}>
      {!open ? (
        <button type="button" className="organizer-pairings-fab" onClick={() => setOpen(true)} title="View tournament pairings">
          <Eye size={20} />
          <span><strong>Pairings</strong><small>Read-only monitor</small></span>
        </button>
      ) : (
        <section className="organizer-pairings-card" aria-label="Read-only tournament pairings">
          <header className="organizer-pairings-header">
            <div>
              <span>ORGANIZER · READ ONLY</span>
              <h3>{tournament.name || 'Tournament pairings'}</h3>
              <small>Observe the current draw. Result entry and pairing changes are disabled here.</small>
            </div>
            <button type="button" className="organizer-pairings-close" onClick={() => setOpen(false)} aria-label="Close Pairings"><X size={18} /></button>
          </header>

          <div className="organizer-pairings-toolbar">
            <label>
              <span>Round</span>
              <select value={selectedRound} onChange={event => setSelectedRound(Number(event.target.value))}>
                {generatedRounds.length ? generatedRounds.map(round => <option key={round} value={round}>Round {round}</option>) : <option value={1}>Round 1</option>}
              </select>
            </label>
            <div className="organizer-pairings-readonly-badge"><Eye size={15} /> Read only</div>
            <button type="button" className="organizer-pairings-print" onClick={handlePrint}><Printer size={16} /> Print Pairings</button>
          </div>

          <div className="organizer-pairings-table-wrap">
            {currentBoards.length === 0 ? (
              <div className="organizer-pairings-empty">No pairings generated for Round {selectedRound} yet.</div>
            ) : (
              <table className="organizer-pairings-table">
                <thead><tr><th>Bo.</th><th>White</th><th>Elo</th><th>Result</th><th>Black</th><th>Elo</th></tr></thead>
                <tbody>
                  {currentBoards.map(board => {
                    const white = board.whiteKey ? playerByKey.get(board.whiteKey) : null;
                    const black = board.blackKey ? playerByKey.get(board.blackKey) : null;
                    const boardResult = String(board.result || '');
                    return (
                      <tr key={`${selectedRound}-${board.board}`}>
                        <td><strong>{board.board}</strong></td>
                        <td><span>{white?.title ? <b>{white.title}</b> : null}{white ? white.name : (boardResult.includes('BYE') ? 'BYE' : '—')}</span><small>{white?.fed || ''}{white?.id ? ` · #${white.id}` : ''}</small></td>
                        <td>{white?.rating || '—'}</td>
                        <td><strong>{resultText(board.result)}</strong></td>
                        <td><span>{black?.title ? <b>{black.title}</b> : null}{black ? black.name : (boardResult.includes('BYE') ? 'BYE' : '—')}</span><small>{black?.fed || ''}{black?.id ? ` · #${black.id}` : ''}</small></td>
                        <td>{black?.rating || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <footer className="organizer-pairings-footer"><Eye size={14} /> This Organizer view never submits results, changes pairings or publishes tournament data.</footer>
        </section>
      )}

      <section className="organizer-pairings-print-sheet" aria-hidden="true">
        <div className="organizer-pairings-print-header">
          <div>
            <h1>{tournament.name || tournament.settings?.organizer || 'FIDE Chess Tournament'}</h1>
            <p><b>City / Country:</b> {tournament.settings?.city || '—'}, {tournament.settings?.country || '—'} <span>•</span> <b>Chief Arbiter:</b> {tournament.settings?.chiefArbiter || '—'} <span>•</span> <b>Time Control:</b> {tournament.settings?.timeControl || '—'}</p>
          </div>
          <div><b>FIDE Standard</b><small>Printed: {new Date().toLocaleDateString()} {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small></div>
        </div>

        <div className="organizer-pairings-print-round"><strong>Official Pairings • Round {selectedRound} of {announcedRounds}</strong><span>{currentBoards.length} Boards Scheduled</span></div>

        {currentBoards.length === 0 ? (
          <div className="organizer-pairings-print-empty">No pairings generated for Round {selectedRound} yet.</div>
        ) : (
          <table className="organizer-pairings-print-table">
            <thead><tr><th>Bo.</th><th>SNo</th><th>White Player</th><th>Elo</th><th>Result</th><th>SNo</th><th>Black Player</th><th>Elo</th><th>Arbiter / Sign</th></tr></thead>
            <tbody>
              {currentBoards.map(board => {
                const white = board.whiteKey ? playerByKey.get(board.whiteKey) : null;
                const black = board.blackKey ? playerByKey.get(board.blackKey) : null;
                const boardResult = String(board.result || '');
                return (
                  <tr key={`print-${selectedRound}-${board.board}`}>
                    <td>{board.board}</td>
                    <td>{white?.id || '—'}</td>
                    <td>{white?.title ? `${white.title} ` : ''}{white ? white.name : (boardResult.includes('BYE') ? 'BYE' : '—')}{white?.fed ? ` (${white.fed})` : ''}</td>
                    <td>{white?.rating || '—'}</td>
                    <td>{resultText(board.result)}</td>
                    <td>{black?.id || '—'}</td>
                    <td>{black?.title ? `${black.title} ` : ''}{black ? black.name : (boardResult.includes('BYE') ? 'BYE' : '—')}{black?.fed ? ` (${black.fed})` : ''}</td>
                    <td>{black?.rating || '—'}</td>
                    <td>__________</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <div className="organizer-pairings-print-signatures">
          <div><span>Sector Arbiter:</span><i /></div>
          <div><span>Chief Arbiter Signature &amp; Stamp:</span><i /><small>{tournament.settings?.chiefArbiter || ''}</small></div>
        </div>
      </section>
    </div>
  );
};
