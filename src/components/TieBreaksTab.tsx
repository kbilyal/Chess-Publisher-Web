import React, { useState, useMemo, useEffect } from 'react';
import { Tournament, TieBreakRuleSet } from '../types';
import {
  Sliders,
  ShieldCheck,
  Info,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  BookOpen,
  FileText,
  Lock,
  Unlock,
  Settings2,
  HelpCircle,
  Award
} from 'lucide-react';
import {
  runTieBreakIntegrityCheck,
  getTieBreakCodeAndName,
  TieBreakIntegrityReport
} from '../engine/tiebreakChecker';
import { TieBreakSettingsModal } from './TieBreakSettingsModal';
import { TieBreakCheckerModal } from './TieBreakCheckerModal';
import { AddTieBreakModal } from './AddTieBreakModal';
import { RuleDetailsModal } from './RuleDetailsModal';
import { ArbiterOverrideModal } from './ArbiterOverrideModal';
import { PlayerTieBreakDetailsModal } from './PlayerTieBreakDetailsModal';
import { FIDE_TIE_BREAKS } from '../data/initialData';

interface TieBreaksTabProps {
  tournament: Tournament;
  onUpdateTournament: (updater: (prev: Tournament) => Tournament) => void;
  onNavigateToStandings?: () => void;
}

export const TieBreaksTab: React.FC<TieBreaksTabProps> = ({
  tournament,
  onUpdateTournament,
  onNavigateToStandings
}) => {
  const [selectedTieBreakIndex, setSelectedTieBreakIndex] = useState<number>(0);
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [showCheckerModal, setShowCheckerModal] = useState<boolean>(false);
  const [showRuleDetailsModal, setShowRuleDetailsModal] = useState<boolean>(false);
  const [showArbiterOverrideModal, setShowArbiterOverrideModal] = useState<boolean>(false);
  const [showPlayerDetailsModal, setShowPlayerDetailsModal] = useState<boolean>(false);
  const [playerDetailsTarget, setPlayerDetailsTarget] = useState<{ id: number; tb?: string } | null>(null);
  const [arbiterUnlocked, setArbiterUnlocked] = useState<boolean>(false);
  const [arbiterReason, setArbiterReason] = useState<string>('');

  const configuredTieBreaks = tournament.regulations?.tieBreaks || [];
  const rulesProfile = tournament.regulations?.tieBreakRuleSet || 'FIDE 2026';

  // Check if tournament has started (pairings generated or completed results)
  const tournamentStarted = useMemo(() => {
    if ((tournament.currentRound || 0) > 0) return true;
    if (tournament.rounds && tournament.rounds.some(r => r.pairings && r.pairings.length > 0)) {
      return true;
    }
    return false;
  }, [tournament]);

  const isLocked = tournamentStarted && !arbiterUnlocked;

  // Run integrity check
  const report: TieBreakIntegrityReport = useMemo(() => {
    return runTieBreakIntegrityCheck(tournament);
  }, [tournament]);

  // Ensure selected index is in bounds
  const validSelectedIndex = Math.min(
    Math.max(0, selectedTieBreakIndex),
    Math.max(0, configuredTieBreaks.length - 1)
  );
  const selectedTieBreak = configuredTieBreaks[validSelectedIndex];

  // Helper for moving items
  const handleMove = (direction: 'up' | 'down') => {
    if (isLocked) return;
    const fromIdx = validSelectedIndex;
    const toIdx = direction === 'up' ? fromIdx - 1 : fromIdx + 1;
    if (toIdx < 0 || toIdx >= configuredTieBreaks.length) return;

    onUpdateTournament(prev => {
      const list = [...(prev.regulations?.tieBreaks || [])];
      const item = list.splice(fromIdx, 1)[0];
      list.splice(toIdx, 0, item);
      return {
        ...prev,
        regulations: {
          ...prev.regulations,
          tieBreaks: list
        }
      };
    });
    setSelectedTieBreakIndex(toIdx);
  };

  const handleRemove = (idxToRemove: number) => {
    if (isLocked) return;
    onUpdateTournament(prev => {
      const list = [...(prev.regulations?.tieBreaks || [])];
      list.splice(idxToRemove, 1);
      return {
        ...prev,
        regulations: {
          ...prev.regulations,
          tieBreaks: list
        }
      };
    });
    if (validSelectedIndex >= configuredTieBreaks.length - 1) {
      setSelectedTieBreakIndex(Math.max(0, configuredTieBreaks.length - 2));
    }
  };

  const handleAddCriteria = (newItems: string[]) => {
    if (isLocked) return;
    onUpdateTournament(prev => {
      const currentList = [...(prev.regulations?.tieBreaks || [])];
      return {
        ...prev,
        regulations: {
          ...prev.regulations,
          tieBreaks: [...currentList, ...newItems]
        }
      };
    });
    setSelectedTieBreakIndex(configuredTieBreaks.length);
  };

  const handleProfileChange = (newProfile: string) => {
    if (isLocked) return;
    onUpdateTournament(prev => ({
      ...prev,
      regulations: {
        ...prev.regulations,
        tieBreakRuleSet: newProfile as TieBreakRuleSet
      }
    }));
  };

  const handleRestoreDefaults = () => {
    if (isLocked) return;
    const confirmReset = window.confirm(
      'Restore standard FIDE 2026 tie-break configuration?\n\n' +
      'This will set Rules Profile to FIDE 2026, re-enable Article 16 unplayed round handling, ' +
      'and restore standard options without altering your priority list unless requested.'
    );
    if (!confirmReset) return;

    onUpdateTournament(prev => ({
      ...prev,
      regulations: {
        ...prev.regulations,
        tieBreakRuleSet: 'FIDE 2026',
        pointsForDraw: 0.5,
        tieBreakOptions: {
          ...(prev.regulations?.tieBreakOptions || {}),
          "Buchholz Cut-1 (BH-C1) [84]": { countForfeits: false, validFrom2026: true },
          "Buchholz Tie-Break (2023) [84]": { countForfeits: false, validFrom2026: true },
          "Sonneborn-Berger Tie-Break (2023) [85]": { countForfeits: false, validFrom2026: true },
          "Direct Encounter (DE) [81]": { countForfeits: false, validFrom2026: true },
          "Average Rating of Opponents (ARO) [80]": { unratedRating: 1400 }
        }
      }
    }));
  };

  const handleResetThisTieBreak = () => {
    if (isLocked || !selectedTieBreak) return;
    onUpdateTournament(prev => {
      const opts = { ...(prev.regulations?.tieBreakOptions || {}) };
      delete opts[selectedTieBreak];
      return {
        ...prev,
        regulations: {
          ...prev.regulations,
          tieBreakOptions: opts
        }
      };
    });
  };

  const handleArbiterUnlock = (reason: string) => {
    setArbiterUnlocked(true);
    setArbiterReason(reason);
    // Record in regulations audit log
    onUpdateTournament(prev => {
      const currentOverrides = prev.regulations?.arbiterOverrides || [];
      return {
        ...prev,
        regulations: {
          ...prev.regulations,
          arbiterOverrides: [
            ...currentOverrides,
            {
              timestamp: new Date().toISOString(),
              reason,
              previousTieBreaks: [...(prev.regulations?.tieBreaks || [])],
              newTieBreaks: [...(prev.regulations?.tieBreaks || [])],
              previousProfile: prev.regulations?.tieBreakRuleSet,
              newProfile: prev.regulations?.tieBreakRuleSet
            }
          ]
        }
      };
    });
  };

  // Keyboard navigation for active tie-breaks
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showSettingsModal || showAddModal || showCheckerModal || showRuleDetailsModal || showArbiterOverrideModal || showPlayerDetailsModal) {
        return;
      }

      if (e.altKey && e.key === 'ArrowUp') {
        e.preventDefault();
        handleMove('up');
      } else if (e.altKey && e.key === 'ArrowDown') {
        e.preventDefault();
        handleMove('down');
      } else if (!e.altKey && e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedTieBreakIndex(prev => Math.max(0, prev - 1));
      } else if (!e.altKey && e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedTieBreakIndex(prev => Math.min(configuredTieBreaks.length - 1, prev + 1));
      } else if (e.key === 'Enter' && selectedTieBreak) {
        e.preventDefault();
        setShowSettingsModal(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [validSelectedIndex, configuredTieBreaks.length, isLocked, showSettingsModal, showAddModal, showCheckerModal]);

  const selectedDetails = selectedTieBreak ? getTieBreakCodeAndName(selectedTieBreak) : null;

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-4 text-slate-800 text-xs font-sans">
      {/* Top Header Card (Section 5) */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-blue-100 border border-blue-300 flex items-center justify-center text-blue-700">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900 tracking-tight">
                Tie-Breaks
              </h1>
              <p className="text-[11px] text-slate-500">
                Official FIDE Standings & Tie-Break Priority Chain Configuration
              </p>
            </div>
          </div>
        </div>

        {/* Rules Profile & Discrete Integrity Status */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Rules Profile Selector */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 px-2.5 py-1.5 rounded-md">
            <span className="text-slate-600 font-medium">Rules Profile:</span>
            <select
              value={rulesProfile}
              disabled={isLocked}
              onChange={e => handleProfileChange(e.target.value)}
              className="bg-white border border-slate-300 rounded px-2 py-0.5 text-xs font-semibold text-slate-900 focus:outline-none focus:border-blue-500"
            >
              <option value="FIDE 2026">FIDE 2026</option>
              <option value="Legacy">Legacy</option>
              <option value="Tournament-specific">Tournament-specific</option>
            </select>
            <div
              className="group relative cursor-pointer text-slate-400 hover:text-slate-700"
              title="FIDE 2026 Play-Off and Tie-Break Regulations Effective 1 March 2026"
            >
              <Info className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* Discrete Integrity Indicator (Section 10) */}
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-300 px-3 py-1.5 rounded-md">
            <span className="text-slate-500">Tie-Break Integrity:</span>
            {report.status === 'PASS' ? (
              <span className="font-bold text-emerald-700 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>✓ PASS</span>
              </span>
            ) : report.status === 'WARNING' ? (
              <span className="font-bold text-amber-700 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>⚠ {report.issues.filter(i => i.severity === 'WARNING').length} warnings</span>
              </span>
            ) : (
              <span className="font-bold text-rose-700 flex items-center gap-1">
                <AlertOctagon className="w-3.5 h-3.5" />
                <span>✕ {report.issues.filter(i => i.severity === 'ERROR').length} error(s)</span>
              </span>
            )}

            <button
              onClick={() => setShowCheckerModal(true)}
              className="ml-1 px-2 py-0.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded text-[11px] font-medium transition"
            >
              Details
            </button>
          </div>
        </div>
      </div>

      {/* Arbiter Lock / In-Progress Notification (Section 30 & 31) */}
      {tournamentStarted && (
        <div
          className={`p-3 rounded-xl border flex items-center justify-between gap-3 text-xs transition ${
            isLocked
              ? 'bg-amber-50/90 border-amber-300 text-amber-900'
              : 'bg-emerald-50/80 border-emerald-300 text-emerald-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {isLocked ? (
              <Lock className="w-4 h-4 text-amber-700 flex-shrink-0" />
            ) : (
              <Unlock className="w-4 h-4 text-emerald-700 flex-shrink-0" />
            )}
            <div>
              <span className="font-bold">
                {isLocked
                  ? '🔒 Tie-break rules are locked because the tournament has started.'
                  : '🔓 Tie-break rules unlocked by Arbiter Override.'}
              </span>
              <span className="opacity-80 ml-1.5 hidden sm:inline">
                {isLocked
                  ? 'Criteria cannot be reordered or deleted during active rounds without recorded justification.'
                  : `Reason: "${arbiterReason}". Edits will be committed to official audit log.`}
              </span>
            </div>
          </div>

          {isLocked ? (
            <button
              onClick={() => setShowArbiterOverrideModal(true)}
              className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs font-semibold shadow-xs transition flex-shrink-0"
            >
              Arbiter Override
            </button>
          ) : (
            <button
              onClick={() => setArbiterUnlocked(false)}
              className="px-2.5 py-1 bg-white hover:bg-slate-50 border border-emerald-300 text-emerald-800 rounded text-xs font-medium transition flex-shrink-0"
            >
              Re-Lock
            </button>
          )}
        </div>
      )}

      {/* Main Split Layout: Left (Order) & Right (Selected Details) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Column: Tie-Break Order (Section 5, 46) */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
            <div>
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Tie-Break Order
              </h2>
              <p className="text-[11px] text-slate-500">
                Evaluation priority chain for breaking ties in final standings
              </p>
            </div>
            <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
              {configuredTieBreaks.length} criteria active
            </span>
          </div>

          {/* List / Table of Active Tie-Breaks */}
          <div className="flex-1 min-h-[220px]">
            {configuredTieBreaks.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-8 border-2 border-dashed border-slate-200 rounded-lg text-center space-y-2">
                <AlertTriangle className="w-6 h-6 text-amber-500" />
                <div className="font-semibold text-slate-700">No tie-breaks configured.</div>
                <p className="text-slate-500 text-[11px] max-w-xs">
                  Tournament standings will resolve ties solely using primary score points and initial pairing lots.
                </p>
                <button
                  onClick={() => setShowAddModal(true)}
                  disabled={isLocked}
                  className="mt-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded text-xs font-semibold shadow-sm transition"
                >
                  Add Tie-Break
                </button>
              </div>
            ) : (
              <div className="space-y-1.5">
                {configuredTieBreaks.map((tb, idx) => {
                  const isSelected = validSelectedIndex === idx;
                  const { code, name } = getTieBreakCodeAndName(tb);

                  return (
                    <div
                      key={`${tb}-${idx}`}
                      onClick={() => setSelectedTieBreakIndex(idx)}
                      className={`p-2.5 rounded-lg border transition flex items-center justify-between gap-2 cursor-pointer ${
                        isSelected
                          ? 'bg-blue-50/90 border-blue-400 text-blue-950 shadow-xs'
                          : 'bg-slate-50/70 hover:bg-slate-100 border-slate-200 text-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={`w-5 h-5 rounded-full flex items-center justify-center font-mono font-bold text-[11px] ${
                            isSelected
                              ? 'bg-blue-600 text-white'
                              : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {idx + 1}
                        </span>

                        <div className="truncate">
                          <span className="font-semibold">{name}</span>
                          <span className="ml-2 font-mono text-[11px] text-slate-500 font-bold">
                            ({code})
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            setSelectedTieBreakIndex(idx);
                            setShowSettingsModal(true);
                          }}
                          className="px-2 py-0.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 rounded text-[11px] font-medium transition flex items-center gap-1 shadow-2xs"
                        >
                          <Settings2 className="w-3 h-3 text-slate-500" />
                          <span>Settings</span>
                        </button>

                        <button
                          onClick={e => {
                            e.stopPropagation();
                            handleRemove(idx);
                          }}
                          disabled={isLocked}
                          title="Remove Criterion"
                          className="p-1 hover:bg-rose-100 text-slate-400 hover:text-rose-700 disabled:opacity-30 rounded transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Action Buttons Toolbar below list (Section 5) */}
          <div className="pt-3 mt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setShowAddModal(true)}
                disabled={isLocked}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded text-xs font-semibold shadow-sm transition flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>

              <button
                onClick={() => handleRemove(validSelectedIndex)}
                disabled={isLocked || configuredTieBreaks.length === 0}
                className="px-2.5 py-1.5 bg-white hover:bg-rose-50 hover:text-rose-700 hover:border-rose-300 disabled:opacity-40 border border-slate-300 text-slate-700 rounded text-xs font-medium transition flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5 text-slate-400" />
                <span>Remove</span>
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => handleMove('up')}
                disabled={isLocked || validSelectedIndex === 0 || configuredTieBreaks.length <= 1}
                className="px-2.5 py-1.5 bg-white hover:bg-slate-50 disabled:opacity-40 border border-slate-300 text-slate-700 rounded text-xs font-medium transition flex items-center gap-1 shadow-2xs"
                title="Move Up (Alt+Up)"
              >
                <ArrowUp className="w-3.5 h-3.5" />
                <span>Move Up</span>
              </button>

              <button
                onClick={() => handleMove('down')}
                disabled={
                  isLocked ||
                  validSelectedIndex >= configuredTieBreaks.length - 1 ||
                  configuredTieBreaks.length <= 1
                }
                className="px-2.5 py-1.5 bg-white hover:bg-slate-50 disabled:opacity-40 border border-slate-300 text-slate-700 rounded text-xs font-medium transition flex items-center gap-1 shadow-2xs"
                title="Move Down (Alt+Down)"
              >
                <ArrowDown className="w-3.5 h-3.5" />
                <span>Move Down</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Selected Tie-Break Details (Section 5, 46) */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="pb-2 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Selected Tie-Break
              </h2>
              {selectedDetails && (
                <span className="px-2 py-0.5 rounded bg-blue-100 border border-blue-300 text-blue-800 font-mono font-bold text-[11px]">
                  Priority #{validSelectedIndex + 1}
                </span>
              )}
            </div>

            {selectedDetails ? (
              <div className="space-y-3">
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-2">
                  <div>
                    <span className="text-slate-500 text-[11px] block">Name:</span>
                    <span className="text-sm font-bold text-slate-900">
                      {selectedDetails.name}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-200 text-[11px]">
                    <div>
                      <span className="text-slate-500 block">Code:</span>
                      <span className="font-mono font-bold text-slate-800">
                        {selectedDetails.code}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Rule:</span>
                      <span className="font-semibold text-slate-800 flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                        <span>{rulesProfile}</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Unplayed and VUR Rule Specs */}
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-2 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Unplayed rounds:</span>
                    <span className="font-semibold text-slate-900">FIDE Article 16</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">VUR handling:</span>
                    <span className="font-semibold text-emerald-700">FIDE Article 16.5</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Forfeits:</span>
                    <span className="font-semibold text-slate-900">
                      {tournament.regulations?.tieBreakOptions?.[selectedTieBreak]?.countForfeits
                        ? 'Included'
                        : 'Excluded (FIDE Default)'}
                    </span>
                  </div>
                </div>

                {/* Action Buttons for Selected Tie-Break */}
                <div className="space-y-2 pt-2">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setShowSettingsModal(true)}
                      className="px-3 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 rounded-lg text-xs font-semibold shadow-2xs transition flex items-center justify-center gap-1.5"
                    >
                      <Settings2 className="w-3.5 h-3.5 text-slate-500" />
                      <span>Settings</span>
                    </button>

                    <button
                      onClick={() => setShowRuleDetailsModal(true)}
                      className="px-3 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 rounded-lg text-xs font-semibold shadow-2xs transition flex items-center justify-center gap-1.5"
                    >
                      <BookOpen className="w-3.5 h-3.5 text-amber-600" />
                      <span>Rule Details</span>
                    </button>
                  </div>

                  <button
                    onClick={handleResetThisTieBreak}
                    disabled={isLocked}
                    className="w-full px-3 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 rounded-lg text-xs font-medium transition flex items-center justify-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3 text-slate-500" />
                    <span>Reset This Tie-Break Options</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-slate-400 text-xs">
                Select a tie-break criterion from the left list to view operational rules and parameters.
              </div>
            )}
          </div>

          {/* Standings Link Shortcut */}
          {onNavigateToStandings && (
            <div className="p-2.5 rounded-lg bg-blue-50/50 border border-blue-100 flex items-center justify-between">
              <div className="flex items-center gap-2 text-blue-900">
                <Award className="w-4 h-4 text-blue-600" />
                <span className="font-semibold text-xs">Inspect Standings</span>
              </div>
              <button
                onClick={onNavigateToStandings}
                className="px-2.5 py-1 bg-white hover:bg-blue-50 border border-blue-200 text-blue-800 rounded text-xs font-medium transition"
              >
                View Standings Table →
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Secondary Configuration Area when Tournament-Specific Profile is Active (Section 9) */}
      {rulesProfile === 'Tournament-specific' && (
        <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-amber-900 font-bold text-xs uppercase tracking-wider">
            <Settings2 className="w-4 h-4 text-amber-700" />
            <span>Tournament-Specific Override Parameters</span>
          </div>
          <p className="text-[11px] text-amber-800 leading-snug">
            Custom regulations profile active. You may configure non-standard points for draw or custom forfeit handling. Please ensure published tournament regulations reflect these choices.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-white p-2.5 rounded border border-amber-200">
              <span className="text-slate-500 block text-[10px] uppercase">Points for Draw</span>
              <input
                type="number"
                step="0.1"
                value={tournament.regulations?.pointsForDraw ?? 0.5}
                onChange={e => {
                  const val = parseFloat(e.target.value) || 0.5;
                  onUpdateTournament(prev => ({
                    ...prev,
                    regulations: {
                      ...prev.regulations,
                      pointsForDraw: val
                    }
                  }));
                }}
                disabled={isLocked}
                className="w-full mt-1 px-2 py-1 bg-slate-50 border border-slate-300 rounded font-mono text-slate-900 text-xs"
              />
            </div>
          </div>
        </div>
      )}

      {/* Bottom Action Bar (Section 5, 46) */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <button
          onClick={handleRestoreDefaults}
          disabled={isLocked}
          className="px-3 py-1.5 bg-white hover:bg-slate-50 disabled:opacity-40 border border-slate-300 text-slate-700 rounded-md text-xs font-medium transition flex items-center gap-1.5 shadow-2xs"
        >
          <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
          <span>Restore FIDE Defaults</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCheckerModal(true)}
            className="px-3.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 rounded-md text-xs font-semibold transition flex items-center gap-1.5 shadow-2xs"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
            <span>Run Full Check</span>
          </button>

          <button
            onClick={() => setShowCheckerModal(true)}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-semibold shadow-sm transition flex items-center gap-1.5"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>View Report</span>
          </button>
        </div>
      </div>

      {/* Modals */}
      {showSettingsModal && selectedTieBreak && (
        <TieBreakSettingsModal
          tournament={tournament}
          tieBreakName={selectedTieBreak}
          isOpen={showSettingsModal}
          onClose={() => setShowSettingsModal(false)}
          onUpdateTournament={onUpdateTournament}
        />
      )}

      {showAddModal && (
        <AddTieBreakModal
          tournament={tournament}
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          onAddTieBreaks={handleAddCriteria}
        />
      )}

      {showCheckerModal && (
        <TieBreakCheckerModal
          tournament={tournament}
          isOpen={showCheckerModal}
          onClose={() => setShowCheckerModal(false)}
          onOpenPlayerDetails={(pId, tb) => {
            setPlayerDetailsTarget({ id: pId, tb });
            setShowPlayerDetailsModal(true);
          }}
        />
      )}

      {showRuleDetailsModal && selectedTieBreak && (
        <RuleDetailsModal
          tieBreakName={selectedTieBreak}
          isOpen={showRuleDetailsModal}
          onClose={() => setShowRuleDetailsModal(false)}
        />
      )}

      {showArbiterOverrideModal && (
        <ArbiterOverrideModal
          tournament={tournament}
          isOpen={showArbiterOverrideModal}
          onClose={() => setShowArbiterOverrideModal(false)}
          onUnlock={handleArbiterUnlock}
        />
      )}

      {showPlayerDetailsModal && playerDetailsTarget && (
        <PlayerTieBreakDetailsModal
          tournament={tournament}
          playerId={playerDetailsTarget.id}
          initialTieBreakName={playerDetailsTarget.tb}
          isOpen={showPlayerDetailsModal}
          onClose={() => {
            setShowPlayerDetailsModal(false);
            setPlayerDetailsTarget(null);
          }}
        />
      )}
    </div>
  );
};
