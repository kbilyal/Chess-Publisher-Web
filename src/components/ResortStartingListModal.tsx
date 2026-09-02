import React, { useState } from 'react';
import { Shield, AlertTriangle, ArrowUpDown, CheckCircle2, XCircle, Info, Lock } from 'lucide-react';
import { Tournament } from '../types';
import { calculateResortPreflight, executeResortTransaction } from '../transactions/resortWorkflow';
import { defaultTransactionManager } from '../transactions/TransactionManager';
import { ResortDiffReport } from '../transactions/types';

interface ResortStartingListModalProps {
  isOpen: boolean;
  onClose: () => void;
  tournament: Tournament;
  onCommit: (updatedTournament: Tournament) => void;
}

export const ResortStartingListModal: React.FC<ResortStartingListModalProps> = ({
  isOpen,
  onClose,
  tournament,
  onCommit
}) => {
  const [forceResortConfirmed, setForceResortConfirmed] = useState(false);
  const [arbiterNotes, setArbiterNotes] = useState('');
  const [isCommitting, setIsCommitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const { diffReport, proposedTournament } = calculateResortPreflight(tournament);
  const snapshotHash = defaultTransactionManager.computeHash(tournament);

  const handleConfirmResort = async () => {
    if (diffReport.requiresForceResort && !forceResortConfirmed) {
      setErrorMessage('Explicit Force Resort confirmation is required when rounds have already started.');
      return;
    }

    setIsCommitting(true);
    setErrorMessage(null);

    try {
      const result = await executeResortTransaction(
        defaultTransactionManager,
        tournament,
        {
          forceResortConfirmed,
          arbiterNotes
        }
      );

      onCommit(result.tournament);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to commit starting list resort.');
    } finally {
      setIsCommitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-3xl w-full flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-100/70 text-blue-700 rounded-xl">
              <ArrowUpDown className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Resort Starting List Preflight</h2>
              <p className="text-xs text-slate-500">
                Transactional Starting Rank Recalculation (FIDE Rating & Title Order)
              </p>
            </div>
          </div>
          <div className="text-right">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block">Snapshot Hash</span>
            <span className="text-xs font-mono text-slate-600 font-semibold">{snapshotHash.slice(0, 12)}...</span>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-sm text-slate-700">
          {/* Warning banner if rounds exist */}
          {diffReport.hasRoundsStarted ? (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="font-semibold text-amber-900">Warning: Tournament In Progress</h4>
                <p className="text-xs text-amber-800 leading-relaxed">
                  {diffReport.roundCount} round(s) have already been generated or played. Re-sorting the starting list
                  re-indexes player pairing numbers (1..N). Existing historical pairings remain untouched, but future
                  pairing engines will use the new starting ranks.
                </p>
                <div className="pt-2">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={forceResortConfirmed}
                      onChange={(e) => {
                        setForceResortConfirmed(e.target.checked);
                        if (e.target.checked) setErrorMessage(null);
                      }}
                      className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                    />
                    <span className="text-xs font-semibold text-amber-950">
                      I understand the consequences and authorize Force Resort as Chief Arbiter.
                    </span>
                  </label>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-blue-50/70 border border-blue-100 rounded-xl flex items-center gap-3">
              <Shield className="w-5 h-5 text-blue-600 shrink-0" />
              <p className="text-xs text-blue-900 leading-relaxed">
                Tournament has not started yet (Round 0). Starting ranks will be safely sorted by Rating (DESC),
                FIDE Title hierarchy (GM..WCM), and Name (A-Z).
              </p>
            </div>
          )}

          {/* Stats Bar */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
              <span className="text-xs text-slate-500 block">Total Roster</span>
              <span className="text-lg font-bold text-slate-900">{diffReport.totalPlayers} Players</span>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
              <span className="text-xs text-slate-500 block">Affected Ranks</span>
              <span className={`text-lg font-bold ${diffReport.affectedCount > 0 ? 'text-blue-600' : 'text-slate-600'}`}>
                {diffReport.affectedCount} Ranks Changed
              </span>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
              <span className="text-xs text-slate-500 block">Pairing Engine Flag</span>
              <span className="text-xs font-semibold text-emerald-700 mt-1 inline-flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Engine In-Sync
              </span>
            </div>
          </div>

          {/* Diff Table */}
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="bg-slate-100/70 px-4 py-2.5 border-b border-slate-200 font-semibold text-xs text-slate-700 flex justify-between items-center">
              <span>Proposed Starting Rank Diff</span>
              <span className="text-[11px] text-slate-500 font-normal">Pre-flight Inspection</span>
            </div>
            <div className="max-h-60 overflow-y-auto divide-y divide-slate-100">
              {diffReport.rankChanges.length === 0 ? (
                <div className="p-6 text-center text-slate-400 text-xs">No registered players to sort.</div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-medium">
                    <tr>
                      <th className="px-3 py-2">Player</th>
                      <th className="px-3 py-2">Rating</th>
                      <th className="px-3 py-2 text-center">Current Rank</th>
                      <th className="px-3 py-2 text-center">New Rank</th>
                      <th className="px-3 py-2 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {diffReport.rankChanges.map((change) => (
                      <tr
                        key={change.playerId}
                        className={change.changed ? 'bg-blue-50/40 hover:bg-blue-50/70' : 'hover:bg-slate-50'}
                      >
                        <td className="px-3 py-2 font-medium text-slate-900">
                          {change.title && (
                            <span className="mr-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                              {change.title}
                            </span>
                          )}
                          {change.playerName}
                        </td>
                        <td className="px-3 py-2 font-mono text-slate-600">{change.rating || 'Unrated'}</td>
                        <td className="px-3 py-2 text-center font-mono text-slate-500">#{change.oldRank}</td>
                        <td className="px-3 py-2 text-center font-mono font-bold text-slate-900">
                          #{change.newRank}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {change.changed ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 bg-blue-100/70 px-2 py-0.5 rounded-full">
                              Shifted
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400">Unchanged</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Arbiter Notes Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Arbiter Audit Notes (Optional)
            </label>
            <input
              type="text"
              value={arbiterNotes}
              onChange={(e) => setArbiterNotes(e.target.value)}
              placeholder="e.g., Re-sorted after late GM registration"
              className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Error display */}
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
              <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div className="text-[11px] text-slate-500 flex items-center gap-1">
            <Info className="w-3.5 h-3.5 text-slate-400" />
            <span>Rollback guarantee: Any persistence error will revert to exact snapshot.</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={isCommitting}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmResort}
              disabled={isCommitting || (diffReport.requiresForceResort && !forceResortConfirmed)}
              className="px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm transition-all flex items-center gap-2"
            >
              {isCommitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Committing...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Confirm & Commit Resort</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
