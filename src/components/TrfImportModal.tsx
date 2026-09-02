import React, { useState } from 'react';
import { FileText, AlertTriangle, CheckCircle2, XCircle, ArrowRight, Shield, Info, Users, Clock } from 'lucide-react';
import { Tournament } from '../types';
import { calculateTrfImportPreflight, executeTrfImportTransaction } from '../transactions/trfImportWorkflow';
import { defaultTransactionManager } from '../transactions/TransactionManager';

interface TrfImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTournament: Tournament;
  trfContent: string;
  onCommit: (importedTournament: Tournament) => void;
}

export const TrfImportModal: React.FC<TrfImportModalProps> = ({
  isOpen,
  onClose,
  currentTournament,
  trfContent,
  onCommit
}) => {
  const [isCommitting, setIsCommitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const preflight = calculateTrfImportPreflight(currentTournament, trfContent);
  const { valid, conflictReport, parsedData } = preflight;
  const snapshotHash = defaultTransactionManager.computeHash(currentTournament);

  const handleConfirmImport = async () => {
    if (!valid) {
      setErrorMessage('Cannot import invalid TRF file.');
      return;
    }

    setIsCommitting(true);
    setErrorMessage(null);

    try {
      const result = await executeTrfImportTransaction(
        defaultTransactionManager,
        currentTournament,
        trfContent
      );

      onCommit(result.tournament);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to execute TRF import transaction.');
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
            <div className="p-2.5 bg-indigo-100/70 text-indigo-700 rounded-xl">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">TRF Import Preflight & Conflict Inspection</h2>
              <p className="text-xs text-slate-500">
                FIDE TRF16 / TRF26 Transactional Verification
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
          {/* Validation Status Banner */}
          {valid ? (
            <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-xl flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <div className="text-xs text-emerald-900">
                <span className="font-semibold">Valid FIDE TRF Format:</span> Parsed{' '}
                <span className="font-bold">{parsedData?.players?.length || 0}</span> player records and{' '}
                <span className="font-bold">{conflictReport.roundsDifference.importedRounds}</span> round(s) of pairing data.
              </div>
            </div>
          ) : (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3">
              <XCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="font-semibold text-rose-900">Invalid TRF Structure</h4>
                <ul className="list-disc list-inside text-xs text-rose-800 space-y-0.5">
                  {conflictReport.validationErrors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Quick Stats Comparison */}
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div className="p-3 bg-slate-50 border border-slate-200/70 rounded-xl">
              <div className="flex items-center gap-1.5 text-slate-500 mb-1">
                <Users className="w-3.5 h-3.5" />
                <span>Roster Count</span>
              </div>
              <div className="flex items-baseline gap-2 font-bold text-slate-900 text-base">
                <span>{currentTournament.players?.length || 0}</span>
                <ArrowRight className="w-3 h-3 text-slate-400" />
                <span className="text-indigo-600">{parsedData?.players?.length || 0}</span>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200/70 rounded-xl">
              <div className="flex items-center gap-1.5 text-slate-500 mb-1">
                <Clock className="w-3.5 h-3.5" />
                <span>Rounds Loaded</span>
              </div>
              <div className="flex items-baseline gap-2 font-bold text-slate-900 text-base">
                <span>{conflictReport.roundsDifference.currentRounds}</span>
                <ArrowRight className="w-3 h-3 text-slate-400" />
                <span className="text-indigo-600">{conflictReport.roundsDifference.importedRounds}</span>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200/70 rounded-xl">
              <div className="flex items-center gap-1.5 text-slate-500 mb-1">
                <Shield className="w-3.5 h-3.5" />
                <span>Byes / PABs</span>
              </div>
              <div className="flex items-baseline gap-2 font-bold text-slate-900 text-base">
                <span>{conflictReport.byesDifference.currentByesCount}</span>
                <ArrowRight className="w-3 h-3 text-slate-400" />
                <span className="text-indigo-600">{conflictReport.byesDifference.importedByesCount}</span>
              </div>
            </div>
          </div>

          {/* Metadata Differences */}
          {conflictReport.metadataChanges.length > 0 && (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="bg-slate-100/70 px-4 py-2 border-b border-slate-200 text-xs font-semibold text-slate-700">
                Tournament Metadata Differences
              </div>
              <div className="p-3 divide-y divide-slate-100 text-xs">
                {conflictReport.metadataChanges.map((ch, i) => (
                  <div key={i} className="py-1.5 flex items-center justify-between">
                    <span className="text-slate-500 font-medium">{ch.field}:</span>
                    <div className="flex items-center gap-2">
                      <span className="line-through text-slate-400">{ch.oldValue || '(empty)'}</span>
                      <ArrowRight className="w-3 h-3 text-slate-400" />
                      <span className="font-semibold text-slate-900">{ch.newValue}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Player Roster Differences */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="bg-slate-100/70 px-4 py-2 border-b border-slate-200 text-xs font-semibold text-slate-700 flex justify-between items-center">
              <span>Player Roster Differences</span>
              <span className="text-[11px] text-slate-500 font-normal">
                +{conflictReport.addedPlayers.length} added, -{conflictReport.removedPlayers.length} removed, ~{conflictReport.changedPlayerAttributes.length} updated
              </span>
            </div>
            <div className="max-h-48 overflow-y-auto p-3 text-xs space-y-2">
              {conflictReport.addedPlayers.length > 0 && (
                <div>
                  <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wide">Added Players:</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {conflictReport.addedPlayers.map((p, i) => (
                      <span key={i} className="px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded text-[11px]">
                        +{p.name} ({p.rating})
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {conflictReport.removedPlayers.length > 0 && (
                <div>
                  <span className="text-[11px] font-bold text-rose-700 uppercase tracking-wide">Removed Players:</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {conflictReport.removedPlayers.map((p, i) => (
                      <span key={i} className="px-2 py-0.5 bg-rose-50 text-rose-800 border border-rose-200 rounded text-[11px]">
                        -{p.name} ({p.rating})
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {conflictReport.changedPlayerAttributes.length > 0 && (
                <div>
                  <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wide">Attribute Changes:</span>
                  <ul className="mt-1 space-y-1">
                    {conflictReport.changedPlayerAttributes.map((attr, i) => (
                      <li key={i} className="text-slate-600 flex items-center gap-1.5">
                        <span className="font-semibold text-slate-800">{attr.playerName}</span>
                        <span className="text-slate-400">({attr.field}):</span>
                        <span className="line-through text-slate-400">{attr.oldValue}</span>
                        <ArrowRight className="w-3 h-3 text-slate-400" />
                        <span className="font-semibold text-blue-700">{attr.newValue}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {conflictReport.addedPlayers.length === 0 &&
                conflictReport.removedPlayers.length === 0 &&
                conflictReport.changedPlayerAttributes.length === 0 && (
                  <div className="text-center text-slate-400 py-3">Player roster is identical.</div>
                )}
            </div>
          </div>

          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
              <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div className="text-[11px] text-slate-500 flex items-center gap-1">
            <Info className="w-3.5 h-3.5 text-slate-400" />
            <span>Pre-import snapshot created. Reversible at any time.</span>
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
              onClick={handleConfirmImport}
              disabled={isCommitting || !valid}
              className="px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm transition-all flex items-center gap-2"
            >
              {isCommitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Importing...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Confirm & Import TRF</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
