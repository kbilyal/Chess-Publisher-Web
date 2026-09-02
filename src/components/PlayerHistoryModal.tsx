import React from 'react';
import { Tournament, PlayerRoundState } from '../types';
import { calculateTournamentStandings } from '../engine/tiebreaks';
import { getFederationFlag } from '../data/initialData';
import { X, User, Trophy, Shield, Award, ExternalLink } from 'lucide-react';

interface PlayerHistoryModalProps {
  tournament: Tournament;
  playerId: number;
  onClose: () => void;
}

export const PlayerHistoryModal: React.FC<PlayerHistoryModalProps> = ({
  tournament,
  playerId,
  onClose
}) => {
  const standings = calculateTournamentStandings(tournament);
  const player = standings.players.find(p => p.id === playerId);
  const playerByKey = new Map(standings.players.map(p => [p.key, p]));

  if (!player) return null;

  const liveBoards = tournament.pairings.liveBoards || {};
  const rounds = Object.keys(liveBoards).map(Number).sort((a, b) => a - b);

  // Collect rounds for this player
  const history: {
    round: number;
    board: number;
    color: 'White' | 'Black' | 'Bye';
    opponentName: string;
    opponentRating: number;
    opponentFed: string;
    opponentTitle?: string;
    result: string;
    pts: number;
  }[] = [];

  let cumScore = 0;

  rounds.forEach(r => {
    const boards = liveBoards[String(r)] || [];
    const b = boards.find(board => board.whiteKey === player.key || board.blackKey === player.key);

    if (b) {
      const isWhite = b.whiteKey === player.key;
      const oppKey = isWhite ? b.blackKey : b.whiteKey;
      const opp = oppKey ? playerByKey.get(oppKey) : null;

      let roundPts = 0;
      if (isWhite) {
        if (b.result === '1 - 0' || b.result === '1F - 0F' || b.result === '1 BYE' || b.result === 'PAB') roundPts = 1;
        else if (b.result === '½ - ½' || b.result === '½ BYE') roundPts = 0.5;
      } else {
        if (b.result === '0 - 1' || b.result === '0F - 1F' || b.result === '1 BYE' || b.result === 'PAB') roundPts = 1;
        else if (b.result === '½ - ½' || b.result === '½ BYE') roundPts = 0.5;
      }

      cumScore += roundPts;

      history.push({
        round: r,
        board: b.board,
        color: !oppKey ? 'Bye' : isWhite ? 'White' : 'Black',
        opponentName: opp ? opp.name : (b.result.includes('BYE') || b.result === 'PAB' ? 'Unpaired / Bye' : '—'),
        opponentRating: opp ? opp.rating : 0,
        opponentFed: opp ? opp.fed : '',
        opponentTitle: opp ? opp.title : undefined,
        result: b.result,
        pts: roundPts
      });
    }
  });

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-xl shadow-2xl w-full max-w-2xl p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150 text-xs text-slate-800">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
              <User className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-1.5">
                <span>{getFederationFlag(player.fed)}</span>
                <span>{player.name}</span>
                {player.title && (
                  <span className="text-[10px] px-1 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-800 font-bold">
                    {player.title}
                  </span>
                )}
              </h3>
              <p className="text-[11px] text-slate-500 font-mono">
                SNo. {player.id} • Rating: {player.rating} • FED: {player.fed} • FIDE ID: {player.fideId}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Player Stats Quickbar */}
        <div className="grid grid-cols-4 gap-2 text-center font-mono">
          <div className="bg-slate-50 p-2 rounded-lg border border-slate-200">
            <span className="text-[10px] text-slate-500 block">Total Score</span>
            <span className="text-sm font-bold text-blue-600">{player.score.toFixed(1)}</span>
          </div>
          <div className="bg-slate-50 p-2 rounded-lg border border-slate-200">
            <span className="text-[10px] text-slate-500 block">Buchholz C1</span>
            <span className="text-sm font-bold text-slate-800">{player.buchholzCut1?.toFixed(1) || '0.0'}</span>
          </div>
          <div className="bg-slate-50 p-2 rounded-lg border border-slate-200">
            <span className="text-[10px] text-slate-500 block">Sonneborn-B.</span>
            <span className="text-sm font-bold text-slate-800">{player.sonneborn?.toFixed(2) || '0.00'}</span>
          </div>
          <div className="bg-slate-50 p-2 rounded-lg border border-slate-200">
            <span className="text-[10px] text-slate-500 block">ARO (Avg Opp)</span>
            <span className="text-sm font-bold text-slate-800">{player.aro || 0}</span>
          </div>
        </div>

        {/* Games Table */}
        <div className="border border-slate-200 rounded-lg overflow-x-auto bg-white">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-semibold font-mono border-b border-slate-200">
                <th className="py-2 px-3 w-10 text-center">Rd</th>
                <th className="py-2 px-3 w-10 text-center">Bo.</th>
                <th className="py-2 px-3 w-14 text-center">Color</th>
                <th className="py-2 px-3">Opponent</th>
                <th className="py-2 px-3 w-16 text-right">Opp Rtg</th>
                <th className="py-2 px-3 w-20 text-center">Result</th>
                <th className="py-2 px-3 w-12 text-right">Pts</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {history.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-slate-400">
                    No games played in this tournament yet.
                  </td>
                </tr>
              ) : (
                history.map(g => (
                  <tr key={g.round} className="hover:bg-slate-50">
                    <td className="py-2 px-3 text-center font-mono font-bold text-slate-500">{g.round}</td>
                    <td className="py-2 px-3 text-center font-mono text-slate-500">{g.board}</td>
                    <td className="py-2 px-3 text-center font-mono text-slate-700">
                      {g.color === 'White' ? '⚪ W' : g.color === 'Black' ? '⚫ B' : '—'}
                    </td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-1.5 truncate">
                        {g.opponentFed && <span>{getFederationFlag(g.opponentFed)}</span>}
                        {g.opponentTitle && (
                          <span className="text-[10px] px-1 rounded bg-amber-50 text-amber-800 font-bold border border-amber-200">
                            {g.opponentTitle}
                          </span>
                        )}
                        <span className="truncate text-slate-900 font-semibold">{g.opponentName}</span>
                      </div>
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-slate-600">
                      {g.opponentRating || '—'}
                    </td>
                    <td className="py-2 px-3 text-center font-mono font-bold">
                      <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-800">
                        {g.result}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-emerald-600">
                      {g.pts}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-2 border-t border-slate-100">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition"
          >
            Close Card
          </button>
        </div>
      </div>
    </div>
  );
};
