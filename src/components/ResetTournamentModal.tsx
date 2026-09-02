import React, { useState } from 'react';
import { RotateCcw, AlertTriangle, Trash2, CheckCircle2, Shield, Info, Database, Layers } from 'lucide-react';
import { Tournament } from '../types';
import { calculateResetPreflight, executeResetTransaction } from '../transactions/resetWorkflow';
import { defaultTransactionManager } from '../transactions/TransactionManager';
import { ResetMode } from '../transactions/types';

interface ResetTournamentModalProps {
  isOpen: boolean;
  onClose: () => void;
  tournament: Tournament;
  onCommit: (newTournament: Tournament) => void;
}

export const ResetTournamentModal: React.FC<ResetTournamentModalProps> = ({
  isOpen,
  onClose,
  tournament,
  onCommit
}) => {
  const [mode, setMode] = useState<ResetMode>('CLEAR_PAIRINGS_ONLY');
  const [confirmationChecked, setConfirmationChecked] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const { diffReport } = calculateResetPreflight(tournament, mode);
  const snapshotHash = defaultTransactionManager.computeHash(tournament);

  const handleConfirmReset = async () => {
    if (!confirmationChecked) {
      setErrorMessage('Please confirm the reset acknowledgement checkbox.');
      return;
    }

    setIsCommitting(true);
    setErrorMessage(null);

    try {
      const result = await executeResetTransaction(
        defaultTransactionManager,
        tournament,
        mode
      );

      onCommit(result.tournament);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to execute tournament reset.');
    } finally {
      setIsCommitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-rose-50/40">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-rose-100 text-rose-700 rounded-xl">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Reset Tournament Preflight</h2>
              <p className="text-xs text-slate-500">
                Transactional Tournament Wipe & Reinitialization
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
          {/* Mode Selector */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-700">Select Reset Operation Mode</label>
            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => {
                  setMode('CLEAR_PAIRINGS_ONLY');
                  setConfirmationChecked(false);
                }}
                className={`p-3.5 text-left rounded-xl border transition-all ${
                  mode === 'CLEAR_PAIRINGS_ONLY'
                    ? 'border-blue-500 bg-blue-50/50 ring-2 ring-blue-500/20'
                    : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Layers className={`w-4 h-4 ${mode === 'CLEAR_PAIRINGS_ONLY' ? 'text-blue-600' : 'text-slate-500'}`} />
                  <span className="text-xs font-bold text-slate-900">Pairings Only</span>
                </div>
                <p className="text-[11px] text-slate-500 leading-tight">
                  Clears all rounds & results. Preserves registered players & settings.
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setMode('FULL_RESET');
                  setConfirmationChecked(false);
                }}
                className={`p-3.5 text-left rounded-xl border transition-all ${
                  mode === 'FULL_RESET'
                    ? 'border-rose-500 bg-rose-50/50 ring-2 ring-rose-500/20'
                    : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Trash2 className={`w-4 h-4 ${mode === 'FULL_RESET' ? 'text-rose-600' : 'text-slate-500'}`} />
                  <span className="text-xs font-bold text-slate-900">Full Wipe</span>
                </div>
                <p className="text-[11px] text-slate-500 leading-tight">
                  Completely empties tournament: players, rounds, results, and resets settings.
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setMode('LOAD_SAMPLE');
                  setConfirmationChecked(false);
                }}
                className={`p-3.5 text-left rounded-xl border transition-all ${
                  mode === 'LOAD_SAMPLE'
                    ? 'border-emerald-500 bg-emerald-50/50 ring-2 ring-emerald-500/20'
                    : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Database className={`w-4 h-4 ${mode === 'LOAD_SAMPLE' ? 'text-emerald-600' : 'text-slate-500'}`} />
                  <span className="text-xs font-bold text-slate-900">Load Sample</span>
                </div>
                <p className="text-[11px] text-slate-500 leading-tight">
                  Resets to authoritative FIDE sample tournament (12 players, round 1 paired).
                </p>
              </button>
            </div>
          </div>

          {/* Preflight Inspection Card */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center justify-between">
              <span>Pre-Flight Impact Assessment</span>
              <span className="text-slate-400 font-mono text-[10px]">Target: {diffReport.targetName}</span>
            </h4>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-white border border-slate-200/80 rounded-lg">
                <span className="text-slate-500 block mb-0.5">Will be Erased:</span>
                <ul className="space-y-1 font-medium text-slate-800">
                  <li className="flex items-center justify-between">
                    <span>Active Rounds:</span>
                    <span className="font-bold text-rose-600">{diffReport.pairingsToDeleteRounds} round(s)</span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span>Pairings & Results:</span>
                    <span className="font-bold text-rose-600">{diffReport.liveBoardsToDeleteCount} games</span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span>Registered Players:</span>
                    <span className={`font-bold ${diffReport.playersToDeleteCount > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                      {diffReport.playersToDeleteCount} player(s)
                    </span>
                  </li>
                </ul>
              </div>

              <div className="p-3 bg-white border border-slate-200/80 rounded-lg">
                <span className="text-slate-500 block mb-0.5">Will be Preserved:</span>
                <ul className="space-y-1 font-medium text-slate-800">
                  <li className="flex items-center justify-between">
                    <span>Tournament Settings:</span>
                    <span className={`font-bold ${diffReport.settingsPreserved ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {diffReport.settingsPreserved ? 'Preserved' : 'Reset'}
                    </span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span>Player Roster:</span>
                    <span className={`font-bold ${diffReport.playersPreserved ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {diffReport.playersPreserved ? 'Preserved' : 'Reset'}
                    </span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span>Snapshot Archive:</span>
                    <span className="font-bold text-emerald-600">Saved for Undo</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Acknowledgement Checkbox */}
          <div className="p-4 bg-amber-50/70 border border-amber-200/70 rounded-xl space-y-2">
            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={confirmationChecked}
                onChange={(e) => {
                  setConfirmationChecked(e.target.checked);
                  if (e.target.checked) setErrorMessage(null);
                }}
                className="w-4 h-4 mt-0.5 text-rose-600 rounded border-slate-300 focus:ring-rose-500"
              />
              <span className="text-xs font-semibold text-slate-900 leading-relaxed">
                I understand this operation will wipe data from active memory. A full snapshot will be archived so I
                can click "Undo Last Reset" if needed.
              </span>
            </label>
          </div>

          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800">
              {errorMessage}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div className="text-[11px] text-slate-500 flex items-center gap-1">
            <Shield className="w-3.5 h-3.5 text-slate-400" />
            <span>Automatic snapshot taken before reset execution.</span>
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
              onClick={handleConfirmReset}
              disabled={isCommitting || !confirmationChecked}
              className={`px-5 py-2 text-xs font-semibold text-white rounded-lg shadow-sm transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                mode === 'FULL_RESET'
                  ? 'bg-rose-600 hover:bg-rose-700 active:bg-rose-800'
                  : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800'
              }`}
            >
              {isCommitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Resetting...</span>
                </>
              ) : (
                <>
                  <RotateCcw className="w-4 h-4" />
                  <span>Confirm & Execute Reset</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
