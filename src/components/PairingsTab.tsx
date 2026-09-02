import React, { useState, useEffect } from 'react';
import { Tournament, BoardPairing, GameResult } from '../types';
import { generateDutchPairings } from '../engine/dutchEngine';
import { generateBergerSchedule } from '../engine/bergerEngine';
import { calculateTournamentStandings } from '../engine/tiebreaks';
import { getFederationFlag } from '../data/initialData';
import { PairingPreviewModal } from './PairingPreviewModal';
import { RoundEngineMetadata } from '../engine/adapters/types';
import { 
  Play, RefreshCw, RotateCcw, AlertTriangle, CheckCircle2, 
  Search, Sliders, ShieldCheck, ArrowLeftRight, Check, X,
  UserX, PlusCircle, Trash2, HelpCircle, Printer, Shield, Cpu, ExternalLink
} from 'lucide-react';

interface PairingsTabProps {
  tournament: Tournament;
  onUpdateTournament: (updater: (prev: Tournament) => Tournament) => void;
  onOpenPlayerHistory: (playerId: number) => void;
  onOpenPrintModal?: (docType: 'pairings' | 'board_cards' | 'round_protocol' | 'result_slips', roundNum?: number) => void;
}

export const PairingsTab: React.FC<PairingsTabProps> = ({
  tournament,
  onUpdateTournament,
  onOpenPlayerHistory,
  onOpenPrintModal
}) => {
  const [selectedBoardIndex, setSelectedBoardIndex] = useState(0);
  const [playerSearchQuery, setPlayerSearchQuery] = useState('');
  const [filterMissing, setFilterMissing] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [showNextRoundManager, setShowNextRoundManager] = useState(false);
  const [nextRoundFilter, setNextRoundFilter] = useState<'all' | 'active' | 'changed' | 'excluded' | 'pab' | 'fixed'>('all');
  const [nextRoundSearch, setNextRoundSearch] = useState('');

  // Authoritative & Prototype Pairing Engine state
  const [isGeneratingAuthoritative, setIsGeneratingAuthoritative] = useState(false);
  const [authoritativeError, setAuthoritativeError] = useState<{ code: string; message: string } | null>(null);
  const [previewModalData, setPreviewModalData] = useState<{
    round: number;
    previewBoards: BoardPairing[];
    engineMetadata: {
      id: string;
      name: string;
      version: string;
      authoritative: boolean;
      engineType: 'authoritative_gacrux' | 'prototype';
    };
    ruleLog?: string[];
    pabKey?: string;
  } | null>(null);

  const liveBoards = tournament.pairings.liveBoards || {};
  const generatedRounds = Object.keys(liveBoards).map(Number).filter(n => n > 0).sort((a, b) => a - b);
  const latestRound = generatedRounds.length ? generatedRounds[generatedRounds.length - 1] : 0;
  const isRoundRobin = tournament.settings.tournamentFormat === 'Individual Round Robin';

  // Selected round state (default to latest or 1)
  const [activeRound, setActiveRound] = useState<number>(latestRound > 0 ? latestRound : 1);

  // Sync active round when latest round changes
  useEffect(() => {
    if (latestRound > 0 && (!generatedRounds.includes(activeRound) || activeRound === 0)) {
      setActiveRound(latestRound);
    }
  }, [latestRound]);

  const currentBoards = liveBoards[String(activeRound)] || [];
  const isEditableRound = isRoundRobin ? currentBoards.length > 0 : (activeRound === latestRound && latestRound > 0);
  const announcedRounds = parseInt(tournament.settings.rounds) || 7;

  // Standings for player lookup
  const standings = calculateTournamentStandings(tournament);
  const playerByKey = new Map(standings.players.map(p => [p.key, p]));

  // Handle Result Application with Auto-Advance
  const handleSetResult = (result: GameResult, advance: boolean = true) => {
    if (!isEditableRound) {
      alert(`Round ${activeRound} is a locked historical round.`);
      return;
    }

    if (currentBoards.length === 0 || selectedBoardIndex >= currentBoards.length) return;

    onUpdateTournament(prev => {
      const updatedLive = { ...prev.pairings.liveBoards };
      const roundList = [...(updatedLive[String(activeRound)] || [])];

      if (roundList[selectedBoardIndex]) {
        roundList[selectedBoardIndex] = {
          ...roundList[selectedBoardIndex],
          result
        };
      }
      updatedLive[String(activeRound)] = roundList;

      return {
        ...prev,
        pairings: {
          ...prev.pairings,
          liveBoards: updatedLive
        }
      };
    });

    if (advance && selectedBoardIndex < currentBoards.length - 1) {
      setSelectedBoardIndex(prev => prev + 1);
    }
  };

  // Keyboard Shortcuts: 1 -> 1-0, 2 -> 1/2-1/2, 3 -> 0-1, Delete -> Clear
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an input
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

      if (e.key === '1') {
        e.preventDefault();
        handleSetResult('1 - 0', true);
      } else if (e.key === '2' || e.key === '5') {
        e.preventDefault();
        handleSetResult('½ - ½', true);
      } else if (e.key === '3' || e.key === '0') {
        e.preventDefault();
        handleSetResult('0 - 1', true);
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        handleSetResult('-', false);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (selectedBoardIndex < currentBoards.length - 1) {
          setSelectedBoardIndex(prev => prev + 1);
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (selectedBoardIndex > 0) {
          setSelectedBoardIndex(prev => prev - 1);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedBoardIndex, activeRound, currentBoards.length, isEditableRound]);

  // Authoritative Pairing Generation (Gacrux via backend API)
  const handleGenerateAuthoritative = async () => {
    if (tournament.players.length < 2) {
      alert("At least 2 players required to generate pairings.");
      return;
    }

    const nextRoundNumber = latestRound + 1;
    if (nextRoundNumber > announcedRounds) {
      alert(`Tournament complete! All ${announcedRounds} rounds have already been generated.`);
      return;
    }

    setIsGeneratingAuthoritative(true);
    setAuthoritativeError(null);

    try {
      const res = await fetch('/api/pairings/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tournament,
          round: nextRoundNumber,
          options: {
            manualByes: tournament.pairings.engine.manualByes[String(nextRoundNumber)] || {},
            excludedKeys: tournament.pairings.engine.excluded || [],
            fixedBoards: tournament.pairings.engine.fixedBoards || {},
            initialTopColor: (tournament.pairings.engine.initialTopColor as any) || 'w',
            pabPoints: parseFloat(tournament.regulations.pabPoints) || 1.0
          }
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        // Do NOT silently fall back to prototype engine!
        setAuthoritativeError({
          code: data.code || 'AUTHORITATIVE_ENGINE_NOT_CONFIGURED',
          message: data.message || 'Gacrux pairing engine (v1.9.57) is not yet configured or installed on this system.'
        });
        return;
      }

      // Open Draft Preview for Arbiter inspection
      setPreviewModalData({
        round: data.result.round,
        previewBoards: data.result.boards,
        engineMetadata: {
          id: data.result.engine.id,
          name: data.result.engine.name,
          version: data.result.engine.version,
          authoritative: true,
          engineType: 'authoritative_gacrux'
        },
        ruleLog: data.result.ruleLog,
        pabKey: data.result.pabKey
      });
    } catch (err: any) {
      setAuthoritativeError({
        code: 'API_CONNECTION_ERROR',
        message: `Failed to connect to backend engine service: ${err.message}`
      });
    } finally {
      setIsGeneratingAuthoritative(false);
    }
  };

  // Demo / Prototype Pairing Generation (Non-Authoritative)
  const handleGeneratePrototype = () => {
    if (tournament.players.length < 2) {
      alert("At least 2 players required to generate pairings.");
      return;
    }

    if (isRoundRobin) {
      const berger = generateBergerSchedule({
        players: tournament.players,
        cycles: parseInt(tournament.settings.roundRobinCycles || '1'),
        initialTopColor: (tournament.pairings.engine.initialTopColor as any) || 'w'
      });

      onUpdateTournament(prev => ({
        ...prev,
        pairings: {
          ...prev.pairings,
          liveBoards: berger.schedule,
          engine: {
            ...prev.pairings.engine,
            lastGeneratedRound: berger.totalRounds,
            lastEngineMessage: "FIDE Berger Tables schedule generated"
          }
        }
      }));

      setActiveRound(1);
      alert(`FIDE Berger Tables generated all ${berger.totalRounds} Round Robin rounds successfully!`);
      return;
    }

    const nextRoundNumber = latestRound + 1;
    if (nextRoundNumber > announcedRounds) {
      alert(`Tournament complete! All ${announcedRounds} rounds have already been generated.`);
      return;
    }

    const dutchResult = generateDutchPairings({
      round: nextRoundNumber,
      totalRounds: announcedRounds,
      players: tournament.players,
      playerStates: standings.players,
      initialTopColor: (tournament.pairings.engine.initialTopColor as any) || 'w',
      manualByes: tournament.pairings.engine.manualByes[String(nextRoundNumber)] || {},
      excludedKeys: tournament.pairings.engine.excluded || [],
      fixedBoards: tournament.pairings.engine.fixedBoards || {},
      pabPoints: parseFloat(tournament.regulations.pabPoints) || 1.0
    });

    // Open Draft Preview with explicit prototype non-authoritative flag
    setPreviewModalData({
      round: nextRoundNumber,
      previewBoards: dutchResult.boards,
      engineMetadata: {
        id: 'prototype-swiss-dutch',
        name: 'Prototype Swiss Pairing Engine — Non-Authoritative',
        version: '1.05.01-proto',
        authoritative: false,
        engineType: 'prototype'
      },
      ruleLog: dutchResult.ruleLog,
      pabKey: dutchResult.pabKey
    });
  };

  // Commit Accepted Pairing
  const handleCommitPreview = (committedTournament: Tournament) => {
    onUpdateTournament(() => committedTournament);
    const roundNumber = previewModalData?.round || (latestRound + 1);
    setActiveRound(roundNumber);
    setSelectedBoardIndex(0);
    setPreviewModalData(null);
  };

  // Delete latest round
  const handleDeleteLatestRound = () => {
    if (latestRound === 0) return;
    if (!window.confirm(`Delete Round ${latestRound} and its entered results? Rounds are removed in reverse order.`)) return;

    onUpdateTournament(prev => {
      const updated = { ...prev.pairings.liveBoards };
      delete updated[String(latestRound)];
      const newLatest = latestRound - 1;
      return {
        ...prev,
        pairings: {
          ...prev.pairings,
          liveBoards: updated,
          engine: {
            ...prev.pairings.engine,
            lastGeneratedRound: newLatest
          }
        }
      };
    });

    setActiveRound(Math.max(1, latestRound - 1));
  };

  // Reset entire tournament pairings
  const handleResetTournament = () => {
    if (latestRound === 0) return;
    if (!window.confirm("RESET TOURNAMENT?\n\nThis will delete ALL generated rounds and ALL entered game results.\nPlayer registrations, ratings, and settings will be preserved.")) return;

    onUpdateTournament(prev => ({
      ...prev,
      pairings: {
        ...prev.pairings,
        liveBoards: {},
        engine: {
          ...prev.pairings.engine,
          lastGeneratedRound: 0,
          needsResort: false
        }
      }
    }));

    setActiveRound(1);
    setSelectedBoardIndex(0);
  };

  // Color Swap
  const handleSwapColors = () => {
    if (!isEditableRound || !currentBoards[selectedBoardIndex]) return;
    const b = currentBoards[selectedBoardIndex];
    if (!b.whiteKey || !b.blackKey) return;

    onUpdateTournament(prev => {
      const updatedLive = { ...prev.pairings.liveBoards };
      const roundList = [...(updatedLive[String(activeRound)] || [])];

      let swappedResult: GameResult = b.result;
      if (b.result === '1 - 0') swappedResult = '0 - 1';
      else if (b.result === '0 - 1') swappedResult = '1 - 0';
      else if (b.result === '1F - 0F') swappedResult = '0F - 1F';
      else if (b.result === '0F - 1F') swappedResult = '1F - 0F';

      roundList[selectedBoardIndex] = {
        ...b,
        whiteKey: b.blackKey,
        blackKey: b.whiteKey,
        result: swappedResult
      };

      updatedLive[String(activeRound)] = roundList;
      return {
        ...prev,
        pairings: { ...prev.pairings, liveBoards: updatedLive }
      };
    });
  };

  // Filter visible boards
  const visibleBoards = currentBoards.filter((b, idx) => {
    if (filterMissing && b.result !== '-') return false;
    if (!playerSearchQuery.trim()) return true;

    const w = playerByKey.get(b.whiteKey);
    const bl = playerByKey.get(b.blackKey);
    const q = playerSearchQuery.toLowerCase();

    return (
      (w && (w.name.toLowerCase().includes(q) || w.fideId.includes(q) || w.fed.toLowerCase().includes(q))) ||
      (bl && (bl.name.toLowerCase().includes(q) || bl.fideId.includes(q) || bl.fed.toLowerCase().includes(q))) ||
      String(b.board).includes(q)
    );
  });

  const selectedBoard = currentBoards[selectedBoardIndex];
  const selectedWhite = selectedBoard ? playerByKey.get(selectedBoard.whiteKey) : null;
  const selectedBlack = selectedBoard ? playerByKey.get(selectedBoard.blackKey) : null;

  const totalResultsEntered = currentBoards.filter(b => b.result !== '-').length;
  const isRoundComplete = currentBoards.length > 0 && totalResultsEntered === currentBoards.length;

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6 animate-in fade-in duration-200 select-none text-slate-800">
      {/* 1. Control Quickbar & Round Switcher */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Left: Round History Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex-shrink-0">
            Round:
          </span>
          {generatedRounds.length === 0 ? (
            <span className="px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-500 text-xs font-mono font-semibold">
              No rounds yet (Round 1 Pending)
            </span>
          ) : (
            generatedRounds.map(r => {
              const isSelected = activeRound === r;
              const rBoards = liveBoards[String(r)] || [];
              const rComplete = rBoards.length > 0 && rBoards.every(b => b.result !== '-');
              return (
                <button
                  key={r}
                  onClick={() => {
                    setActiveRound(r);
                    setSelectedBoardIndex(0);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono transition flex items-center gap-1.5 flex-shrink-0 ${
                    isSelected
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                  }`}
                >
                  <span>Round {r}</span>
                  {rComplete ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Right: Primary Pair & Delete Actions */}
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button
            onClick={() => setShowNextRoundManager(!showNextRoundManager)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-1.5 transition ${
              showNextRoundManager
                ? 'bg-amber-50 border-amber-300 text-amber-900 shadow-sm'
                : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
            }`}
          >
            <Sliders className="w-3.5 h-3.5 text-amber-600" />
            <span>Next Round Status ({tournament.players.length})</span>
          </button>

          {/* Authoritative Pairing Generation Button */}
          <button
            onClick={handleGenerateAuthoritative}
            disabled={isGeneratingAuthoritative || (!isRoundRobin && (latestRound >= announcedRounds || (latestRound > 0 && !isRoundComplete)))}
            className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-40 text-white rounded-lg text-xs font-bold flex items-center gap-2 shadow-sm transition"
            title={`Generate Round ${latestRound + 1} with authoritative Gacrux engine`}
          >
            <Shield className="w-3.5 h-3.5 text-blue-200" />
            <span>{isGeneratingAuthoritative ? 'Connecting Engine...' : `Generate (Authoritative)`}</span>
          </button>

          {/* Demo / Prototype Pairing Button */}
          <button
            onClick={handleGeneratePrototype}
            disabled={!isRoundRobin && (latestRound >= announcedRounds || (latestRound > 0 && !isRoundComplete))}
            className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 active:bg-amber-200 border border-amber-300 text-amber-900 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-2xs transition"
            title="Generate pairing with prototype engine (Non-authoritative, for UI testing & demonstration only)"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            <span>DEMO / PROTOTYPE</span>
          </button>

          {/* Print Round Pairings & Table Cards */}
          {onOpenPrintModal && (
            <button
              onClick={() => onOpenPrintModal('pairings', activeRound)}
              className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shadow-2xs"
              title="Print official round pairings bulletin & table cards"
            >
              <Printer className="w-3.5 h-3.5 text-blue-600" />
              <span>Print (R{activeRound})</span>
            </button>
          )}

          {/* Delete latest round */}
          <button
            onClick={handleDeleteLatestRound}
            disabled={latestRound === 0}
            className="p-2 bg-slate-100 hover:bg-rose-50 text-slate-500 hover:text-rose-600 disabled:opacity-30 border border-slate-300 rounded-lg transition"
            title="Delete latest round"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          {/* Reset Tournament */}
          <button
            onClick={handleResetTournament}
            disabled={latestRound === 0}
            className="p-2 bg-slate-100 hover:bg-rose-50 text-slate-500 hover:text-rose-600 disabled:opacity-30 border border-slate-300 rounded-lg transition"
            title="Reset all generated tournament rounds"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 2. Next Round Player Status Manager Drawer */}
      {showNextRoundManager && (
        <section className="bg-white border border-amber-300 rounded-xl p-5 shadow-md space-y-4 animate-in slide-in-from-top-4 duration-150">
          <div className="flex items-center justify-between border-b border-amber-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-amber-900 flex items-center gap-2">
                <Sliders className="w-4 h-4 text-amber-600" />
                Player Status for Next Round (Round {latestRound + 1})
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Configure requested byes (½ BYE / 0 BYE / 1 BYE), exclusions, and fixed board constraints before generating pairings.
              </p>
            </div>
            <button
              onClick={() => setShowNextRoundManager(false)}
              className="text-slate-400 hover:text-slate-700 p-1 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Player status list */}
          <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-lg bg-slate-50 divide-y divide-slate-200 text-xs">
            {tournament.players.map(p => {
              const currentStatus = tournament.pairings.engine.manualByes[String(latestRound + 1)]?.[p.localKey] || 
                (tournament.pairings.engine.excluded?.includes(p.localKey) ? 'exclude' : 'active');

              return (
                <div key={p.localKey} className="p-2.5 flex items-center justify-between gap-4 hover:bg-slate-100">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-slate-500 w-6 font-semibold">#{p.pairingNumber}</span>
                    <span>{getFederationFlag(p.fed)}</span>
                    <span className="font-semibold text-slate-900 truncate">{p.name}</span>
                    <span className="text-slate-500 font-mono">({p.rating})</span>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <select
                      value={currentStatus}
                      onChange={e => {
                        const val = e.target.value;
                        onUpdateTournament(prev => {
                          const nextR = latestRound + 1;
                          const manualByes = { ...prev.pairings.engine.manualByes };
                          if (!manualByes[String(nextR)]) manualByes[String(nextR)] = {};
                          
                          let excluded = [...(prev.pairings.engine.excluded || [])];

                          if (val === 'active') {
                            delete manualByes[String(nextR)][p.localKey];
                            excluded = excluded.filter(k => k !== p.localKey);
                          } else if (val === 'exclude') {
                            delete manualByes[String(nextR)][p.localKey];
                            if (!excluded.includes(p.localKey)) excluded.push(p.localKey);
                          } else {
                            manualByes[String(nextR)][p.localKey] = val;
                            excluded = excluded.filter(k => k !== p.localKey);
                          }

                          return {
                            ...prev,
                            pairings: {
                              ...prev.pairings,
                              engine: {
                                ...prev.pairings.engine,
                                manualByes,
                                excluded
                              }
                            }
                          };
                        });
                      }}
                      className="px-2.5 py-1 bg-white border border-slate-300 rounded text-slate-800 text-xs font-medium focus:outline-none shadow-sm"
                    >
                      <option value="active">Active / Plays Normally</option>
                      <option value="H">½ BYE (Half-Point Bye)</option>
                      <option value="F">1 BYE (Full-Point Bye)</option>
                      <option value="Z">0 BYE (Zero-Point Bye)</option>
                      <option value="PAB">PAB (Pairing-Allocated Bye)</option>
                      <option value="exclude">Excluded from Pairing</option>
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 3. Main Live Pairings Workspace & Rapid Result Palette */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Board Pairings Grid (Left 8 cols) */}
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
          {/* Workspace Title & Search Header */}
          <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <span>Round {activeRound} Board Pairings</span>
                  {isEditableRound ? (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-100 border border-emerald-300 text-emerald-800 font-bold">
                      EDITABLE
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-200 border border-slate-300 text-slate-700">
                      HISTORICAL
                    </span>
                  )}
                </h2>

                {/* Round Engine & Checker Metadata Badges */}
                {(() => {
                  const meta = (tournament.pairings as any)?.roundMetadata?.[String(activeRound)] as RoundEngineMetadata | undefined;
                  if (!meta) return null;
                  return (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded border font-semibold ${
                        meta.engine.authoritative
                          ? 'bg-blue-50 border-blue-200 text-blue-800'
                          : 'bg-amber-50 border-amber-200 text-amber-800'
                      }`}>
                        {meta.engine.authoritative ? 'Authoritative: Gacrux' : 'Prototype Engine'}
                      </span>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                        meta.checker.status === 'PASS'
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                          : 'bg-slate-100 border-slate-200 text-slate-600'
                      }`}>
                        Checker: {meta.checker.status}
                      </span>
                    </div>
                  );
                })()}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {currentBoards.length} boards • {totalResultsEntered} / {currentBoards.length} results recorded
              </p>
            </div>

            {/* Search & Missing Filter */}
            <div className="flex items-center gap-2 text-xs">
              <div className="relative w-48">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2 pointer-events-none" />
                <input
                  type="text"
                  value={playerSearchQuery}
                  onChange={e => setPlayerSearchQuery(e.target.value)}
                  placeholder="Find board / player..."
                  className="w-full pl-8 pr-2 py-1 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                />
              </div>
              <button
                onClick={() => setFilterMissing(!filterMissing)}
                className={`px-2.5 py-1 rounded-lg font-semibold border transition ${
                  filterMissing
                    ? 'bg-amber-100 border-amber-300 text-amber-900'
                    : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                }`}
              >
                Missing Only
              </button>
              <button
                onClick={() => window.print()}
                className="px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 rounded-lg font-semibold flex items-center gap-1.5 transition shadow-sm"
                title="Print official round pairings sheet for display"
              >
                <Printer className="w-3.5 h-3.5 text-blue-600" />
                <span>Print</span>
              </button>
            </div>
          </div>

          {/* Table Container */}
          <div className="overflow-x-auto min-h-[360px] max-h-[520px] divide-y divide-slate-100 text-xs">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-semibold font-mono border-b border-slate-200 sticky top-0 z-10">
                  <th className="py-2.5 px-3 w-12 text-center">Bo.</th>
                  <th className="py-2.5 px-3">White Player</th>
                  <th className="py-2.5 px-3 w-28 text-center">Result</th>
                  <th className="py-2.5 px-3">Black Player</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {visibleBoards.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-12 text-center text-slate-400">
                      {currentBoards.length === 0
                        ? "No pairings generated for this round yet. Click 'Generate Round' above."
                        : "No boards match the search / filter criteria."}
                    </td>
                  </tr>
                ) : (
                  visibleBoards.map((b, idx) => {
                    const isSelected = selectedBoardIndex === idx;
                    const w = playerByKey.get(b.whiteKey);
                    const bl = playerByKey.get(b.blackKey);

                    return (
                      <tr
                        key={b.board}
                        onClick={() => setSelectedBoardIndex(idx)}
                        className={`cursor-pointer transition ${
                          isSelected
                            ? 'bg-blue-50 text-blue-900 font-semibold border-y border-blue-200'
                            : 'hover:bg-slate-50 text-slate-800'
                        }`}
                      >
                        {/* Board Number */}
                        <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-500">
                          {b.board}
                        </td>

                        {/* White Player */}
                        <td className="py-2.5 px-3">
                          {w ? (
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 truncate">
                                <span>{getFederationFlag(w.fed)}</span>
                                <span 
                                  className="font-bold hover:text-blue-600 truncate"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onOpenPlayerHistory(w.id);
                                  }}
                                  title="Click to view player games"
                                >
                                  {w.name}
                                </span>
                              </div>
                              <span className="text-[11px] font-mono text-slate-500 flex-shrink-0">
                                {w.score.toFixed(1)} pts • {w.rating}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">Bye / Unpaired</span>
                          )}
                        </td>

                        {/* Result Cell */}
                        <td className="py-2.5 px-3 text-center">
                          <span
                            className={`inline-block px-3 py-1 rounded font-mono font-bold text-xs shadow-sm border ${
                              b.result === '-'
                                ? 'bg-slate-100 text-slate-400 border-slate-200'
                                : b.result === '1 - 0' || b.result === '0 - 1' || b.result === '½ - ½'
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                : 'bg-amber-50 text-amber-800 border-amber-300'
                            }`}
                          >
                            {b.result === '-' ? '—' : b.result}
                          </span>
                        </td>

                        {/* Black Player */}
                        <td className="py-2.5 px-3">
                          {bl ? (
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 truncate">
                                <span>{getFederationFlag(bl.fed)}</span>
                                <span 
                                  className="font-bold hover:text-blue-600 truncate"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onOpenPlayerHistory(bl.id);
                                  }}
                                  title="Click to view player games"
                                >
                                  {bl.name}
                                </span>
                              </div>
                              <span className="text-[11px] font-mono text-slate-500 flex-shrink-0">
                                {bl.score.toFixed(1)} pts • {bl.rating}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">Bye / Unpaired</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Keyboard Navigation Footer */}
          <div className="p-3 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-500 flex items-center justify-between font-mono">
            <span>⌨ Shortcuts: <b>1</b> (1-0) • <b>2</b> (½-½) • <b>3</b> (0-1) • <b>Del</b> (Clear)</span>
            <span>Use <b>↑ / ↓</b> to navigate boards</span>
          </div>
        </div>

        {/* Rapid Result Desk (Right 4 cols) */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-5 sticky top-24">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              Rapid Result Palette
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Click buttons or use numeric keypad hotkeys
            </p>
          </div>

          {/* Active Board Indicator */}
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5 text-xs">
            <div className="flex items-center justify-between text-slate-600">
              <span className="font-semibold text-slate-800">
                Board {selectedBoard ? selectedBoard.board : '—'} of {currentBoards.length}
              </span>
              <span className="font-mono font-bold text-blue-600">
                {selectedBoard?.result || '—'}
              </span>
            </div>

            <div className="text-[11px] text-slate-700 space-y-0.5">
              <div className="truncate">⚪ <b>{selectedWhite?.name || '—'}</b></div>
              <div className="truncate">⚫ <b>{selectedBlack?.name || '—'}</b></div>
            </div>
          </div>

          {/* Standard Results (1:0, 1/2:1/2, 0:1) */}
          <div className="space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Game Results
            </span>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => handleSetResult('1 - 0', true)}
                className="py-3 bg-slate-50 hover:bg-emerald-600 hover:text-white active:bg-emerald-700 text-slate-800 rounded-lg text-sm font-bold border border-slate-300 shadow-sm flex flex-col items-center justify-center transition"
                title="White wins [Hotkey: 1]"
              >
                <span>1 : 0</span>
                <span className="text-[10px] text-slate-500 group-hover:text-emerald-100 font-mono font-normal">Key 1</span>
              </button>

              <button
                onClick={() => handleSetResult('½ - ½', true)}
                className="py-3 bg-slate-50 hover:bg-emerald-600 hover:text-white active:bg-emerald-700 text-slate-800 rounded-lg text-sm font-bold border border-slate-300 shadow-sm flex flex-col items-center justify-center transition"
                title="Draw [Hotkey: 2]"
              >
                <span>½ : ½</span>
                <span className="text-[10px] text-slate-500 group-hover:text-emerald-100 font-mono font-normal">Key 2</span>
              </button>

              <button
                onClick={() => handleSetResult('0 - 1', true)}
                className="py-3 bg-slate-50 hover:bg-emerald-600 hover:text-white active:bg-emerald-700 text-slate-800 rounded-lg text-sm font-bold border border-slate-300 shadow-sm flex flex-col items-center justify-center transition"
                title="Black wins [Hotkey: 3]"
              >
                <span>0 : 1</span>
                <span className="text-[10px] text-slate-500 group-hover:text-emerald-100 font-mono font-normal">Key 3</span>
              </button>
            </div>
          </div>

          {/* Administrative / Forfeits / Byes */}
          <div className="space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Administrative & Byes
            </span>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                onClick={() => handleSetResult('1F - 0F', true)}
                className="py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-md font-semibold transition"
                title="White forfeit win"
              >
                1F : 0F (Forfeit)
              </button>
              <button
                onClick={() => handleSetResult('0F - 1F', true)}
                className="py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-md font-semibold transition"
                title="Black forfeit win"
              >
                0F : 1F (Forfeit)
              </button>
              <button
                onClick={() => handleSetResult('PAB', true)}
                className="py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-md font-semibold transition"
                title="Pairing-allocated bye"
              >
                PAB (Pairing Bye)
              </button>
              <button
                onClick={() => handleSetResult('½ BYE', true)}
                className="py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-md font-semibold transition"
                title="Half-point requested bye"
              >
                ½ BYE (Half)
              </button>
            </div>
          </div>

          {/* Color Swap & Clear Selected */}
          <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
            <button
              onClick={handleSwapColors}
              className="flex-1 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition shadow-sm"
              title="Swap White and Black player colors on this board"
            >
              <ArrowLeftRight className="w-3.5 h-3.5 text-blue-600" />
              <span>Swap Colors</span>
            </button>

            <button
              onClick={() => handleSetResult('-', false)}
              className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold transition shadow-sm"
              title="Clear selected result [Hotkey: Del]"
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      {/* 4. Pairing Preview & Arbiter Acceptance Modal */}
      {previewModalData && (
        <PairingPreviewModal
          round={previewModalData.round}
          previewBoards={previewModalData.previewBoards}
          engineMetadata={previewModalData.engineMetadata}
          ruleLog={previewModalData.ruleLog}
          pabKey={previewModalData.pabKey}
          tournament={tournament}
          isOpen={true}
          onClose={() => setPreviewModalData(null)}
          onAcceptPairing={handleCommitPreview}
          onRegenerate={() => {
            setPreviewModalData(null);
            if (previewModalData.engineMetadata.authoritative) {
              handleGenerateAuthoritative();
            } else {
              handleGeneratePrototype();
            }
          }}
        />
      )}

      {/* 5. Authoritative Engine Unavailable Modal */}
      {authoritativeError && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-150 text-slate-900">
            <div className="p-5 border-b border-slate-200 bg-amber-50/75 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-amber-100 text-amber-700">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Authoritative Engine Not Configured</h3>
                  <p className="text-[11px] font-mono text-slate-500">{authoritativeError.code}</p>
                </div>
              </div>
              <button 
                onClick={() => setAuthoritativeError(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3.5 text-xs text-slate-600">
              <p className="leading-relaxed">
                The authoritative <strong className="text-slate-800">Gacrux FIDE Swiss Dutch engine binary (v1.9.57)</strong> is not configured or discovered on this system.
              </p>
              <div className="p-3 bg-slate-100 rounded-xl border border-slate-200 space-y-1">
                <div className="font-bold text-slate-700">Chess-Publisher Safety Directive:</div>
                <p className="text-[11px] text-slate-500 leading-normal">
                  In strict compliance with FIDE integrity requirements, the system will never silently substitute an uncertified or AI-generated pairing engine for official tournament rounds.
                </p>
              </div>
              <p className="text-[11px] text-slate-500">
                To test the UI layout, board interaction, and result entry workflow, you may run a <strong className="text-amber-800">Demo / Prototype Pairing</strong> with visible non-authoritative markers.
              </p>
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2.5">
              <button
                onClick={() => setAuthoritativeError(null)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 font-semibold hover:bg-slate-200 transition text-xs"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setAuthoritativeError(null);
                  handleGeneratePrototype();
                }}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white rounded-lg font-bold flex items-center gap-1.5 transition text-xs shadow-sm"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Launch Demo / Prototype Pairing</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
