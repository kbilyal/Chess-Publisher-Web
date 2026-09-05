import React, { useState, useEffect } from 'react';
import { Tournament } from '../types';
import {
  FideSyncDiffReport,
  FidePlayerDiffItem,
  FideSyncField,
  FidePlayerSyncSelection
} from '../transactions/types';
import { 
  RefreshCw, CheckCircle2, AlertTriangle, AlertCircle, 
  HelpCircle, ShieldCheck, X, Check, ArrowRight, Loader2,
  ExternalLink
} from 'lucide-react';
import { getFederationFlag } from '../data/initialData';

interface FideSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  tournament: Tournament;
  onUpdateTournament: (updated: Tournament) => void;
  targetPlayerKey?: string;
  onTriggerResort?: () => void;
}

export const FideSyncModal: React.FC<FideSyncModalProps> = ({
  isOpen,
  onClose,
  tournament,
  onUpdateTournament,
  targetPlayerKey,
  onTriggerResort
}) => {
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [report, setReport] = useState<FideSyncDiffReport | null>(null);

  // Player and field selection state: playerKey -> Set of selected fields
  const [selections, setSelections] = useState<Record<string, Set<FideSyncField>>>({});
  const [arbiterConfirmed, setArbiterConfirmed] = useState(false);
  const [arbiterName, setArbiterName] = useState('Arbiter');
  const [filterTab, setFilterTab] = useState<'all' | 'changed' | 'warnings' | 'unchanged'>('changed');

  // Load preview diff when modal opens
  useEffect(() => {
    if (!isOpen) {
      setReport(null);
      setError(null);
      setSuccessNotice(null);
      setSelections({});
      setArbiterConfirmed(false);
      return;
    }

    fetchPreflightDiff();
  }, [isOpen, targetPlayerKey]);

  const fetchPreflightDiff = async () => {
    setLoading(true);
    setError(null);
    setSuccessNotice(null);

    try {
      const endpoint = targetPlayerKey ? '/api/fide/sync-player' : '/api/fide/sync-all-players';
      const body = targetPlayerKey
        ? { playerKey: targetPlayerKey, apply: false, tournament }
        : { apply: false, tournament };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const data: { success?: boolean; message?: string; diffReport?: FideSyncDiffReport } = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to generate FIDE sync preview.');
      }

      const diffReport: FideSyncDiffReport = data.diffReport as FideSyncDiffReport;
      setReport(diffReport);

      // Initialize selections for CHANGED players
      const initialSelections: Record<string, Set<FideSyncField>> = {};
      for (const p of diffReport.players) {
        if (p.status === 'CHANGED') {
          const fieldSet = new Set<FideSyncField>();
          for (const d of p.diffs) {
            fieldSet.add(d.field);
          }
          initialSelections[p.playerKey] = fieldSet;
        }
      }
      setSelections(initialSelections);

      if (diffReport.changedCount === 0 && diffReport.totalPlayers > 0) {
        setFilterTab('all');
      } else {
        setFilterTab('changed');
      }
    } catch (err: any) {
      setError(err.message || 'Error connecting to FIDE database service.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  // Toggle player selection
  const handleTogglePlayer = (playerKey: string, diffs: { field: FideSyncField }[]) => {
    setSelections(prev => {
      const next = { ...prev };
      if (next[playerKey] && next[playerKey].size > 0) {
        delete next[playerKey];
      } else {
        next[playerKey] = new Set(diffs.map(d => d.field));
      }
      return next;
    });
  };

  // Toggle specific field for a player
  const handleToggleField = (playerKey: string, field: FideSyncField) => {
    setSelections(prev => {
      const next = { ...prev };
      const currentSet = new Set(next[playerKey] || []);
      if (currentSet.has(field)) {
        currentSet.delete(field);
      } else {
        currentSet.add(field);
      }

      if (currentSet.size === 0) {
        delete next[playerKey];
      } else {
        next[playerKey] = currentSet;
      }
      return next;
    });
  };

  const handleSelectAllChanged = () => {
    if (!report) return;
    const allSel: Record<string, Set<FideSyncField>> = {};
    for (const p of report.players) {
      if (p.status === 'CHANGED') {
        allSel[p.playerKey] = new Set(p.diffs.map(d => d.field));
      }
    }
    setSelections(allSel);
  };

  const handleDeselectAll = () => {
    setSelections({});
  };

  // Count selected players and fields
  const selectedPlayerCount = Object.keys(selections).filter(k => (selections[k]?.size || 0) > 0).length;
  let totalSelectedFields = 0;
  for (const set of Object.values(selections) as Set<FideSyncField>[]) {
    totalSelectedFields += set?.size || 0;
  }

  // Apply updates transactionally
  const handleApplySync = async () => {
    if (!arbiterConfirmed) {
      setError('Explicit arbiter confirmation is required to apply changes.');
      return;
    }

    if (selectedPlayerCount === 0) {
      setError('Please select at least one changed player or field to apply.');
      return;
    }

    setApplying(true);
    setError(null);
    setSuccessNotice(null);

    try {
      const playerUpdates: FidePlayerSyncSelection[] = (Object.entries(selections) as [string, Set<FideSyncField>][])
        .filter(([_, fieldSet]) => fieldSet && fieldSet.size > 0)
        .map(([playerKey, fieldSet]) => ({
          playerKey,
          selectedFields: Array.from(fieldSet)
        }));

      const endpoint = targetPlayerKey ? '/api/fide/sync-player' : '/api/fide/sync-all-players';
      const body = targetPlayerKey
        ? {
            playerKey: targetPlayerKey,
            apply: true,
            arbiterConfirmed: true,
            arbiterName: arbiterName.trim() || 'Arbiter',
            selectedFields: playerUpdates[0]?.selectedFields || [],
            tournament
          }
        : {
            apply: true,
            arbiterConfirmed: true,
            arbiterName: arbiterName.trim() || 'Arbiter',
            playerUpdates,
            tournament
          };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const data: { success?: boolean; message?: string; tournament?: Tournament; appliedCount?: number } = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Transaction failed and was safely rolled back.');
      }

      // Successfully committed
      onUpdateTournament(data.tournament as Tournament);
      setSuccessNotice(
        `Successfully applied FIDE synchronization for ${data.appliedCount ?? 0} player(s). Transaction committed.`
      );

      // Re-fetch diff or refresh report
      fetchPreflightDiff();
    } catch (err: any) {
      setError(err.message || 'Synchronization failed. Tournament state has been safely restored to before transaction.');
    } finally {
      setApplying(false);
    }
  };

  const filteredPlayers = (report?.players || []).filter(p => {
    if (filterTab === 'changed') return p.status === 'CHANGED';
    if (filterTab === 'warnings') return p.status === 'UNMATCHED' || p.status === 'DUPLICATE_FIDE_ID';
    if (filterTab === 'unchanged') return p.status === 'UNCHANGED';
    return true;
  });

  return (
    <div id="fide-sync-modal" className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-5">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden text-slate-800 animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="p-5 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-400/40 flex items-center justify-center text-blue-400">
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold flex items-center gap-2">
                FIDE Player Synchronization
                {targetPlayerKey && <span className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-normal">Single Player</span>}
              </h2>
              <p className="text-xs text-slate-400">
                Authoritative diff preview, field-level selection, and transactional apply against FIDE rating database.
              </p>
            </div>
          </div>
          <button
            id="fide-sync-close-btn"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Database Status & Metadata strip */}
        {report?.databaseMetadata && (
          <div className="px-5 py-2.5 bg-slate-100 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
            <div className="flex items-center gap-2 text-slate-600">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>FIDE Database: <strong className="text-slate-900">{report.databaseMetadata.listVersion || 'Active Cache'}</strong> ({report.databaseMetadata.recordCount?.toLocaleString() || 0} players)</span>
            </div>
            <div className="text-slate-500 text-[11px]">
              Active Rating Type: <strong className="text-blue-700">{report.tournamentRatingType}</strong>
            </div>
          </div>
        )}

        {/* Error / Success Banners */}
        {error && (
          <div className="mx-5 mt-4 p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-xs text-rose-800 flex-shrink-0">
            <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 font-medium">{error}</div>
          </div>
        )}

        {successNotice && (
          <div className="mx-5 mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between gap-2 text-xs text-emerald-800 flex-shrink-0">
            <div className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span>{successNotice}</span>
            </div>
            {report?.startingListOutdated && onTriggerResort && (
              <button
                onClick={() => {
                  onClose();
                  onTriggerResort();
                }}
                className="px-2.5 py-1 bg-blue-600 text-white rounded text-xs font-semibold hover:bg-blue-700 transition"
              >
                Resort Starting List Now
              </button>
            )}
          </div>
        )}

        {/* Starting List Outdated Warning */}
        {report?.startingListOutdated && !successNotice && (
          <div className="mx-5 mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-900 flex-shrink-0">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <strong>Starting list may become outdated:</strong> One or more proposed rating or title updates change the initial FIDE rank order. 
              Synchronization preserves existing pairing numbers and past rounds. To update starting ranks, use the separate <em>Resort Starting List</em> workflow after synchronization.
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-slate-500 text-xs">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-3" />
            <span>Comparing tournament players with authoritative FIDE database...</span>
          </div>
        )}

        {/* Loaded Diff Report */}
        {!loading && report && (
          <div className="flex-1 flex flex-col overflow-hidden p-5 space-y-4">
            {/* Metric Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-center flex-shrink-0">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5">
                <div className="text-[11px] font-semibold text-slate-500 uppercase">Total Players</div>
                <div className="text-lg font-mono font-bold text-slate-900">{report.totalPlayers}</div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5">
                <div className="text-[11px] font-semibold text-amber-700 uppercase">Changes Detected</div>
                <div className="text-lg font-mono font-bold text-amber-800">{report.changedCount}</div>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5">
                <div className="text-[11px] font-semibold text-emerald-700 uppercase">Unchanged</div>
                <div className="text-lg font-mono font-bold text-emerald-800">{report.unchangedCount}</div>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5">
                <div className="text-[11px] font-semibold text-slate-600 uppercase">Unmatched</div>
                <div className="text-lg font-mono font-bold text-slate-700">{report.unmatchedCount}</div>
              </div>
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-2.5">
                <div className="text-[11px] font-semibold text-rose-700 uppercase">Duplicates</div>
                <div className="text-lg font-mono font-bold text-rose-800">{report.duplicateCount}</div>
              </div>
            </div>

            {/* Filter Tabs & Selection Controls */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2.5 flex-shrink-0 text-xs">
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
                <button
                  type="button"
                  onClick={() => setFilterTab('changed')}
                  className={`px-3 py-1 rounded-md font-semibold transition ${
                    filterTab === 'changed' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Changes ({report.changedCount})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterTab('warnings')}
                  className={`px-3 py-1 rounded-md font-semibold transition ${
                    filterTab === 'warnings' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Warnings ({report.unmatchedCount + report.duplicateCount})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterTab('unchanged')}
                  className={`px-3 py-1 rounded-md font-semibold transition ${
                    filterTab === 'unchanged' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Unchanged ({report.unchangedCount})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterTab('all')}
                  className={`px-3 py-1 rounded-md font-semibold transition ${
                    filterTab === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All ({report.totalPlayers})
                </button>
              </div>

              {report.changedCount > 0 && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSelectAllChanged}
                    className="px-2.5 py-1 text-blue-600 hover:bg-blue-50 rounded font-semibold transition"
                  >
                    Select All Changes
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={handleDeselectAll}
                    className="px-2.5 py-1 text-slate-500 hover:bg-slate-100 rounded font-semibold transition"
                  >
                    Deselect All
                  </button>
                </div>
              )}
            </div>

            {/* Players Diff List */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {filteredPlayers.length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-xs">
                  No players match the selected filter tab.
                </div>
              ) : (
                filteredPlayers.map(item => {
                  const isPlayerSelected = !!(selections[item.playerKey] && selections[item.playerKey].size > 0);
                  const selectedFieldSet = selections[item.playerKey] || new Set();

                  return (
                    <div
                      key={item.playerKey}
                      className={`border rounded-xl p-4 transition ${
                        item.status === 'CHANGED'
                          ? isPlayerSelected
                            ? 'border-blue-300 bg-blue-50/20 shadow-sm'
                            : 'border-slate-200 bg-white opacity-80'
                          : item.status === 'DUPLICATE_FIDE_ID'
                          ? 'border-rose-200 bg-rose-50/30'
                          : item.status === 'UNMATCHED'
                          ? 'border-slate-200 bg-slate-50/50'
                          : 'border-emerald-100 bg-emerald-50/10'
                      }`}
                    >
                      {/* Player Row Header */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          {item.status === 'CHANGED' && (
                            <input
                              type="checkbox"
                              checked={isPlayerSelected}
                              onChange={() => handleTogglePlayer(item.playerKey, item.diffs)}
                              className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer"
                              title="Toggle all changes for this player"
                            />
                          )}

                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900 text-sm">{item.currentName}</span>
                              {item.authoritativeRecord?.federation && (
                                <span className="text-xs">{getFederationFlag(item.authoritativeRecord.federation)}</span>
                              )}
                              <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                                ID: {item.currentFideId || '—'}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                              Tournament Pairing #{item.playerId}
                            </div>
                          </div>
                        </div>

                        {/* Status Badge */}
                        <div>
                          {item.status === 'CHANGED' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 border border-amber-300 text-amber-900 text-[11px] font-semibold">
                              <AlertTriangle className="w-3 h-3 text-amber-700" />
                              {item.diffs.length} field(s) differ
                            </span>
                          )}
                          {item.status === 'UNCHANGED' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 border border-emerald-300 text-emerald-800 text-[11px] font-semibold">
                              <Check className="w-3 h-3 text-emerald-600" />
                              In Sync
                            </span>
                          )}
                          {item.status === 'UNMATCHED' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-200 border border-slate-300 text-slate-700 text-[11px] font-semibold">
                              <HelpCircle className="w-3 h-3 text-slate-500" />
                              Unmatched
                            </span>
                          )}
                          {item.status === 'DUPLICATE_FIDE_ID' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-100 border border-rose-300 text-rose-800 text-[11px] font-semibold">
                              <AlertCircle className="w-3 h-3 text-rose-600" />
                              Duplicate ID
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Warnings or Notes */}
                      {item.warning && (
                        <div className="mt-2 text-xs text-slate-600 flex items-center gap-1.5 font-sans bg-white/70 p-2 rounded-lg border border-slate-200">
                          <AlertCircle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                          <span>{item.warning}</span>
                        </div>
                      )}

                      {/* Field-level Diffs Grid */}
                      {item.diffs.length > 0 && (
                        <div className="mt-3 pl-7 space-y-1.5 border-t border-slate-200 pt-2.5">
                          {item.diffs.map(diff => {
                            const isFieldChecked = selectedFieldSet.has(diff.field);
                            return (
                              <label
                                key={diff.field}
                                className={`flex items-center justify-between gap-3 text-xs p-1.5 rounded-lg transition cursor-pointer ${
                                  isFieldChecked ? 'bg-blue-50/60' : 'bg-slate-50 opacity-60'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={isFieldChecked}
                                    onChange={() => handleToggleField(item.playerKey, diff.field)}
                                    className="w-3.5 h-3.5 rounded text-blue-600 border-slate-300 focus:ring-blue-500"
                                  />
                                  <span className="font-semibold text-slate-700 w-28">{diff.label}:</span>
                                  <span className="line-through text-slate-400 font-mono">{String(diff.oldValue || '—')}</span>
                                  <ArrowRight className="w-3 h-3 text-slate-400" />
                                  <span className="font-bold text-slate-900 font-mono">{String(diff.newValue || '—')}</span>
                                </div>
                                <span className="text-[10px] text-slate-400 font-mono uppercase">
                                  {isFieldChecked ? 'Selected' : 'Skipped'}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Footer: Arbiter Confirmation & Action Buttons */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4 flex-shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full sm:w-auto text-xs">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                id="fide-sync-arbiter-confirm-checkbox"
                type="checkbox"
                checked={arbiterConfirmed}
                onChange={e => setArbiterConfirmed(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500"
              />
              <span className="font-semibold text-slate-800">
                Arbiter Confirmation
              </span>
            </label>

            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">Name:</span>
              <input
                type="text"
                value={arbiterName}
                onChange={e => setArbiterName(e.target.value)}
                placeholder="Arbiter Name"
                className="px-2 py-1 bg-white border border-slate-300 rounded text-xs text-slate-900 w-28 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              id="fide-sync-cancel-btn"
              type="button"
              onClick={onClose}
              disabled={applying}
              className="px-4 py-2 border border-slate-300 hover:bg-slate-100 rounded-xl text-xs font-semibold text-slate-700 transition"
            >
              Cancel
            </button>

            <button
              id="fide-sync-apply-btn"
              type="button"
              onClick={handleApplySync}
              disabled={applying || selectedPlayerCount === 0 || !arbiterConfirmed}
              className={`px-5 py-2 rounded-xl text-xs font-bold text-white shadow-sm flex items-center gap-2 transition ${
                applying || selectedPlayerCount === 0 || !arbiterConfirmed
                  ? 'bg-slate-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800'
              }`}
            >
              {applying ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Applying Transaction...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Apply {selectedPlayerCount} Selected ({totalSelectedFields} fields)</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
