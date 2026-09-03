import React, { useState, useMemo } from 'react';
import { Tournament } from '../types';
import {
  getPlayerTieBreakBreakdown,
  getTieBreakCodeAndName,
  PlayerRoundTieBreakBreakdownRow
} from '../engine/tiebreakChecker';
import { X, UserCheck, ShieldCheck, Scissors, Info, Award } from 'lucide-react';
import { getFederationFlag } from '../data/initialData';

interface PlayerTieBreakDetailsModalProps {
  tournament: Tournament;
  playerId: number;
  initialTieBreakName?: string;
  isOpen: boolean;
  onClose: () => void;
}

export const PlayerTieBreakDetailsModal: React.FC<PlayerTieBreakDetailsModalProps> = ({
  tournament,
  playerId,
  initialTieBreakName,
  isOpen,
  onClose
}) => {
  const configuredTieBreaks = tournament.regulations?.tieBreaks || [];
  const defaultTieBreak = initialTieBreakName || configuredTieBreaks[0] || 'Buchholz Cut-1 (BH-C1) [84]';
  const [selectedTieBreak, setSelectedTieBreak] = useState<string>(defaultTieBreak);
  const [selectedRowIndex, setSelectedRowIndex] = useState<number>(0);

  const breakdown = useMemo(() => {
    return getPlayerTieBreakBreakdown(tournament, playerId, selectedTieBreak);
  }, [tournament, playerId, selectedTieBreak]);

  if (!isOpen || !breakdown) return null;

  const selectedRow: PlayerRoundTieBreakBreakdownRow | undefined = breakdown.rows[selectedRowIndex];

  return (
    <div
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 text-slate-800"
      onKeyDown={e => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div className="bg-white border border-slate-200 rounded-xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150 text-xs">
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50 rounded-t-xl">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-emerald-100 border border-emerald-300 flex items-center justify-center text-emerald-800">
              <Award className="w-3.5 h-3.5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Player Tie-Break Details
              </h3>
              <p className="text-[11px] text-slate-500">
                FIDE 2026 Audit Breakdown: Unplayed Rounds, Dummy Opponents & Cuts
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition"
            title="Close (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Player & Criterion Info Card */}
        <div className="p-3.5 bg-slate-100/70 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-base" title={breakdown.playerFed}>
              {getFederationFlag(breakdown.playerFed)}
            </span>
            <div>
              <div className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                {breakdown.playerTitle && (
                  <span className="text-[10px] bg-slate-200 text-slate-700 px-1 rounded font-bold">
                    {breakdown.playerTitle}
                  </span>
                )}
                <span>{breakdown.playerName}</span>
              </div>
              <div className="text-[11px] text-slate-500 font-mono">
                Rank: <span className="font-bold text-slate-800">#{breakdown.rank}</span> | Score:{' '}
                <span className="font-bold text-slate-800">{breakdown.score} pts</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div>
              <span className="block text-[10px] text-slate-500 uppercase tracking-wider">
                Tie-Break Criterion:
              </span>
              <select
                value={selectedTieBreak}
                onChange={e => {
                  setSelectedTieBreak(e.target.value);
                  setSelectedRowIndex(0);
                }}
                className="px-2 py-1 bg-white border border-slate-300 rounded text-xs font-semibold text-slate-800"
              >
                {configuredTieBreaks.map(tb => {
                  const { code, name } = getTieBreakCodeAndName(tb);
                  return (
                    <option key={tb} value={tb}>
                      {name} ({code})
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="px-3 py-1 bg-white border border-slate-300 rounded-md text-right">
              <span className="block text-[9px] uppercase tracking-wider text-slate-400">Total Value</span>
              <span className="text-sm font-bold text-blue-700 font-mono">
                {breakdown.totalValue.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Breakdown Table */}
        <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
          <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-xs">
            <table className="w-full text-left text-[11px]">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium">
                <tr>
                  <th className="py-1.5 px-2 text-center w-10">Rnd</th>
                  <th className="py-1.5 px-2">Opponent</th>
                  <th className="py-1.5 px-2 text-center w-12">Result</th>
                  <th className="py-1.5 px-2">Status</th>
                  <th className="py-1.5 px-2 text-center w-16">Category</th>
                  <th className="py-1.5 px-2 text-right w-16">Opp Score</th>
                  <th className="py-1.5 px-2 text-right w-16">Adjusted</th>
                  <th className="py-1.5 px-2 text-right w-16">Dummy</th>
                  <th className="py-1.5 px-2 text-right w-20">Contribution</th>
                  <th className="py-1.5 px-2 text-center w-12">Cut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-normal">
                {breakdown.rows.map((row, idx) => {
                  const isSelected = selectedRowIndex === idx;
                  return (
                    <tr
                      key={row.round}
                      onClick={() => setSelectedRowIndex(idx)}
                      className={`cursor-pointer transition ${
                        isSelected
                          ? 'bg-blue-50/80 font-medium text-blue-900'
                          : row.isCut
                          ? 'bg-rose-50/40 text-slate-400'
                          : 'hover:bg-slate-50 text-slate-800'
                      }`}
                    >
                      <td className="py-1.5 px-2 text-center font-mono font-semibold">
                        {row.round}
                      </td>
                      <td className="py-1.5 px-2 flex items-center gap-1.5 truncate max-w-[180px]">
                        <span>{getFederationFlag(row.opponentFed)}</span>
                        <span className="truncate">{row.opponentName}</span>
                      </td>
                      <td className="py-1.5 px-2 text-center font-mono font-bold">
                        {row.result}
                      </td>
                      <td className="py-1.5 px-2 truncate max-w-[140px] text-slate-600">
                        {row.status}
                      </td>
                      <td className="py-1.5 px-2 text-center font-mono text-[10px]">
                        {row.category !== '-' ? (
                          <span className="px-1 py-0.2 rounded bg-slate-100 border border-slate-300 text-slate-700">
                            {row.category}
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono">
                        {row.opponentScore.toFixed(1)}
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono">
                        {row.adjustedScore.toFixed(1)}
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono">
                        {row.dummyScore.toFixed(1)}
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono font-bold text-slate-900">
                        {row.contribution.toFixed(2)}
                      </td>
                      <td className="py-1.5 px-2 text-center">
                        {row.isCut ? (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-rose-100 text-rose-800 font-mono font-bold text-[10px]">
                            <Scissors className="w-2.5 h-2.5" />
                            <span>Cut</span>
                          </span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Detail Panel for Selected Row (Section 14) */}
          {selectedRow && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2 text-xs">
              <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                <span className="font-bold text-slate-900 flex items-center gap-1.5">
                  <span>Round {selectedRow.round} Diagnostic Detail</span>
                  {selectedRow.isCut && (
                    <span className="px-1.5 py-0.2 bg-rose-100 text-rose-800 rounded font-mono text-[10px] font-bold">
                      Discarded by Cut Modifier
                    </span>
                  )}
                </span>
                <span className="font-mono text-slate-500 text-[11px]">
                  Rule: {selectedRow.ruleRef}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-[11px]">
                <div>
                  <span className="text-slate-500 block">Status:</span>
                  <span className="font-semibold text-slate-800">{selectedRow.status}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">FIDE Category:</span>
                  <span className="font-semibold text-slate-800 font-mono">
                    {selectedRow.category !== '-' ? selectedRow.category : 'Standard Played Game'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Dummy Opponent:</span>
                  <span className="font-semibold text-slate-800 font-mono">
                    {selectedRow.dummyScore.toFixed(2)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Round Contribution:</span>
                  <span className="font-bold text-blue-700 font-mono">
                    {selectedRow.contribution.toFixed(2)}
                  </span>
                </div>
              </div>

              <p className="text-[11px] text-slate-500 pt-1 border-t border-slate-200/80 leading-snug">
                {selectedRow.isCut
                  ? `Round ${selectedRow.round} was excluded from the final tie-break total per Article 16.5.1 modifier rules.`
                  : `Round ${selectedRow.round} contributed ${selectedRow.contribution.toFixed(2)} points to the ${breakdown.tieBreakName} total.`}
              </p>
            </div>
          )}

          {/* Operational explanation footnote */}
          <div className="text-[11px] text-slate-500 bg-blue-50/50 border border-blue-100 p-2.5 rounded-lg flex items-start gap-2">
            <Info className="w-3.5 h-3.5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-blue-900 block">Calculation Basis:</span>
              <span>{breakdown.details.explanation}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-slate-200 bg-slate-50 rounded-b-xl flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold shadow-sm transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
