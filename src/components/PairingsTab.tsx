import React, { useState, useEffect } from 'react';
import { Tournament, BoardPairing, GameResult } from '../types';
import { generateDutchPairings } from '../engine/dutchEngine';
import { generateBergerSchedule } from '../engine/bergerEngine';
import { calculateTournamentStandings } from '../engine/tiebreaks';
import { getFederationFlag } from '../data/initialData';
import { PairingPreviewModal } from './PairingPreviewModal';
import { RoundEngineMetadata } from '../engine/adapters/types';
import { 
  getRoundLifecycleState, 
  getBoardDisplayInfo, 
  isNormalGame, 
  determineBoardEntryType,
  sanitizeTournamentHardInvariants
} from '../engine/roundEntryValidator';
import { executeFinalizeRoundTransaction } from '../transactions/finalizeRoundWorkflow';
import { executeUnlockRoundTransaction } from '../transactions/unlockRoundWorkflow';
import { 
  Play, RefreshCw, RotateCcw, AlertTriangle, CheckCircle2, 
  Search, Sliders, ShieldCheck, ArrowLeftRight, Check, X,
  UserX, PlusCircle, Trash2, HelpCircle, Printer, Shield, Cpu, ExternalLink,
  Lock, Unlock, FileCheck, History, AlertOctagon, CheckSquare
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

  // Round Finalization & Lifecycle UI state
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [showFinalizeModal, setShowFinalizeModal] = useState(false);
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [arbiterName, setArbiterName] = useState('Chief Arbiter');
  const [finalizationError, setFinalizationError] = useState<string | null>(null);

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
  const announcedRounds = parseInt(tournament.settings.rounds) || 7;

  // Calculate lifecycle for the active round
  const activeLifecycle = getRoundLifecycleState(tournament, activeRound);
  const latestLifecycle = latestRound > 0 ? getRoundLifecycleState(tournament, latestRound) : null;

  // Standings for player lookup
  const standings = calculateTournamentStandings(tournament);
  const playerByKey = new Map(standings.players.map(p => [p.key, p]));

  // Is active round editable?
  // Editable ONLY if: not finalized AND is editable (for Swiss: activeRound === latestRound)
  const isEditableRound = isRoundRobin 
    ? (!activeLifecycle.isFinalized && currentBoards.length > 0)
    : (activeRound === latestRound && latestRound > 0 && !activeLifecycle.isFinalized);

  // Selected board info
  const selectedBoard = currentBoards[selectedBoardIndex];
  const selectedBoardInfo = selectedBoard ? getBoardDisplayInfo(selectedBoard, tournament, activeRound) : null;
  const selectedWhite = selectedBoard ? playerByKey.get(selectedBoard.whiteKey) : null;
  const selectedBlack = selectedBoard ? playerByKey.get(selectedBoard.blackKey) : null;

  // Handle Result Application with Auto-Advance & Administrative Guard
  const handleSetResult = (result: GameResult, advance: boolean = true) => {
    if (!isEditableRound) {
      if (activeLifecycle.isFinalized) {
        alert(`Round ${activeRound} is finalized and locked. Click 'Unlock for Corrections' to modify results.`);
      } else {
        alert(`Round ${activeRound} is a locked historical round.`);
      }
      return;
    }

    if (currentBoards.length === 0 || selectedBoardIndex >= currentBoards.length) return;
    const targetBoard = currentBoards[selectedBoardIndex];
    if (!targetBoard) return;

    const boardInfo = getBoardDisplayInfo(targetBoard, tournament, activeRound);

    // CRITICAL GUARD: Non-game entries CANNOT receive played chess results (1-0, 0-1, 1/2-1/2, 1F-0F, etc.)
    if (!boardInfo.isNormal && result !== '-') {
      alert(
        `Cannot assign game result '${result}' to Board #${targetBoard.board}.\n\n` +
        `This is an administrative entry (${boardInfo.entryType}) with no opposing player. ` +
        `Points (${boardInfo.points.toFixed(1)} pt) are assigned automatically by tournament regulations.`
      );
      return;
    }

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
      if (!isEditableRound) return;

      const currentBoard = currentBoards[selectedBoardIndex];
      const isNormal = currentBoard ? isNormalGame(currentBoard) : false;

      if (e.key === '1') {
        e.preventDefault();
        if (isNormal) handleSetResult('1 - 0', true);
      } else if (e.key === '2' || e.key === '5') {
        e.preventDefault();
        if (isNormal) handleSetResult('½ - ½', true);
      } else if (e.key === '3' || e.key === '0') {
        e.preventDefault();
        if (isNormal) handleSetResult('0 - 1', true);
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        if (isNormal) handleSetResult('-', false);
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
  }, [selectedBoardIndex, activeRound, currentBoards, isEditableRound]);

  // Execute Round Finalization Transaction
  const handleFinalizeRound = async () => {
    setIsFinalizing(true);
    setFinalizationError(null);

    try {
      // Execute transactional workflow
      const result = await executeFinalizeRoundTransaction(tournament, activeRound, {
        arbiterName: arbiterName || 'Arbiter'
      });

      // Update in-memory state with finalized tournament
      onUpdateTournament(() => result.tournament);
      setShowFinalizeModal(false);
    } catch (err: any) {
      setFinalizationError(err.message || 'Round finalization failed.');
    } finally {
      setIsFinalizing(false);
    }
  };

  // Execute Round Unlock Transaction
  const handleUnlockRound = async () => {
    setIsUnlocking(true);
    setFinalizationError(null);

    try {
      const result = await executeUnlockRoundTransaction(tournament, activeRound, {
        arbiterConfirmed: true,
        arbiterName: arbiterName || 'Arbiter'
      });

      if (result.blocked) {
        setFinalizationError(result.message || 'Unlock blocked due to dependencies.');
        return;
      }

      if (result.tournament) {
        onUpdateTournament(() => result.tournament!);
      }
      setShowUnlockModal(false);
    } catch (err: any) {
      setFinalizationError(err.message || 'Unlock failed.');
    } finally {
      setIsUnlocking(false);
    }
  };

  // Authoritative Pairing Generation (Gacrux via backend API)
  const handleGenerateAuthoritative = async () => {
    if (tournament.players.length < 2) {
      alert("At least 2 players required to generate pairings.");
      return;
    }

    if (latestRound > 0 && latestLifecycle && !latestLifecycle.isFinalized) {
      alert(`Round ${latestRound} must be finalized and verified by the arbiter before generating Round ${latestRound + 1}.`);
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

    if (latestRound > 0 && latestLifecycle && !latestLifecycle.isFinalized) {
      alert(`Round ${latestRound} must be finalized and verified by the arbiter before generating Round ${latestRound + 1}.`);
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
    if (!isNormalGame(b)) return;

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
  const visibleBoards = currentBoards.filter((b) => {
    const isNormal = isNormalGame(b);
    if (filterMissing && isNormal && b.result !== '-') return false;
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
              const rLifecycle = getRoundLifecycleState(tournament, r);
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
                  {rLifecycle.isFinalized ? (
                    <Lock className={`w-3 h-3 ${isSelected ? 'text-blue-100' : 'text-slate-500'}`} />
                  ) : rLifecycle.isComplete ? (
                    <CheckCircle2 className={`w-3.5 h-3.5 ${isSelected ? 'text-emerald-200' : 'text-emerald-600'}`} />
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
            disabled={
              isGeneratingAuthoritative ||
              (!isRoundRobin && (
                latestRound >= announcedRounds ||
                (latestRound > 0 && latestLifecycle && !latestLifecycle.isFinalized)
              ))
            }
            className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-40 text-white rounded-lg text-xs font-bold flex items-center gap-2 shadow-sm transition"
            title={
              latestRound > 0 && latestLifecycle && !latestLifecycle.isFinalized
                ? `Round ${latestRound} must be finalized and locked by arbiter before generating Round ${latestRound + 1}`
                : `Generate Round ${latestRound + 1} with authoritative Gacrux engine`
            }
          >
            <Shield className="w-3.5 h-3.5 text-blue-200" />
            <span>{isGeneratingAuthoritative ? 'Connecting Engine...' : `Generate (Authoritative)`}</span>
          </button>

          {/* Demo / Prototype Pairing Button */}
          <button
            onClick={handleGeneratePrototype}
            disabled={
              !isRoundRobin && (
                latestRound >= announcedRounds ||
                (latestRound > 0 && latestLifecycle && !latestLifecycle.isFinalized)
              )
            }
            className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 active:bg-amber-200 border border-amber-300 text-amber-900 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-2xs transition disabled:opacity-40"
            title={
              latestRound > 0 && latestLifecycle && !latestLifecycle.isFinalized
                ? `Round ${latestRound} must be finalized before generating Round ${latestRound + 1}`
                : "Generate pairing with prototype engine (Non-authoritative, for UI testing & demonstration only)"
            }
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

      {/* Round Lifecycle Notification & Action Banner */}
      {currentBoards.length > 0 && (
        <div className={`p-4 rounded-xl border flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 transition shadow-sm ${
          activeLifecycle.isFinalized
            ? 'bg-blue-50/70 border-blue-200 text-blue-900'
            : activeLifecycle.status === 'ALL_RESULTS_ENTERED'
            ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
            : 'bg-amber-50/60 border-amber-200 text-amber-900'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${
              activeLifecycle.isFinalized
                ? 'bg-blue-100 text-blue-700'
                : activeLifecycle.status === 'ALL_RESULTS_ENTERED'
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-amber-100 text-amber-700'
            }`}>
              {activeLifecycle.isFinalized ? (
                <Lock className="w-5 h-5" />
              ) : activeLifecycle.status === 'ALL_RESULTS_ENTERED' ? (
                <CheckSquare className="w-5 h-5" />
              ) : (
                <History className="w-5 h-5" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm">
                  {activeLifecycle.isFinalized
                    ? `Round ${activeRound} Finalized & Verified 🔒`
                    : activeLifecycle.status === 'ALL_RESULTS_ENTERED'
                    ? `All Results Entered for Round ${activeRound} — Ready to Finalize`
                    : `Round ${activeRound} Active (${activeLifecycle.normalGamesCompleted}/${activeLifecycle.normalGames} Games Completed)`}
                </span>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase tracking-wider ${
                  activeLifecycle.isFinalized
                    ? 'bg-blue-200/80 text-blue-900'
                    : activeLifecycle.status === 'ALL_RESULTS_ENTERED'
                    ? 'bg-emerald-200 text-emerald-900 animate-pulse'
                    : 'bg-amber-200 text-amber-900'
                }`}>
                  {activeLifecycle.status}
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                {activeLifecycle.isFinalized
                  ? `Results are locked. Standings and tie-breaks are computed from this round. Round ${activeRound + 1} pairings can now be generated.`
                  : activeLifecycle.status === 'ALL_RESULTS_ENTERED'
                  ? `Every board has a valid result. Arbiter must explicitly finalize this round to lock scores and enable next round pairings.`
                  : `${activeLifecycle.normalGames - activeLifecycle.normalGamesCompleted} normal board(s) are awaiting game results before finalization.`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Finalize Button */}
            {activeLifecycle.canFinalize && (
              <button
                onClick={() => {
                  setFinalizationError(null);
                  setShowFinalizeModal(true);
                }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Finalize Round {activeRound}</span>
              </button>
            )}

            {/* Unlock Button */}
            {activeLifecycle.isFinalized && (
              <button
                onClick={() => {
                  setFinalizationError(null);
                  setShowUnlockModal(true);
                }}
                className="px-3.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-2xs transition"
              >
                <Unlock className="w-3.5 h-3.5 text-blue-600" />
                <span>Unlock for Corrections</span>
              </button>
            )}
          </div>
        </div>
      )}

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
                  {activeLifecycle.isFinalized ? (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-100 border border-blue-300 text-blue-800 font-bold flex items-center gap-1">
                      <Lock className="w-2.5 h-2.5" />
                      FINALIZED
                    </span>
                  ) : isEditableRound ? (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-100 border border-emerald-300 text-emerald-800 font-bold">
                      ACTIVE / EDITABLE
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
                {currentBoards.length} boards • {activeLifecycle.normalGamesCompleted} / {activeLifecycle.normalGames} normal games completed
                {activeLifecycle.adminEntries > 0 && ` • ${activeLifecycle.adminEntries} administrative ${activeLifecycle.adminEntries === 1 ? 'entry' : 'entries'}`}
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
                  <th className="py-2.5 px-3 w-32 text-center">Result</th>
                  <th className="py-2.5 px-3">Black Player / Entry</th>
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
                    const displayInfo = getBoardDisplayInfo(b, tournament, activeRound);
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
                            <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-500 font-mono text-[11px] italic">
                              {displayInfo.whiteOpponentLabel || 'No Player'}
                            </span>
                          )}
                        </td>

                        {/* Result Cell */}
                        <td className="py-2.5 px-3 text-center">
                          {displayInfo.isNormal ? (
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
                              {activeLifecycle.isFinalized && ' 🔒'}
                            </span>
                          ) : (
                            <span
                              className="inline-block px-2.5 py-1 rounded font-mono font-bold text-[11px] shadow-2xs border bg-slate-100 border-slate-300 text-slate-700"
                              title={`Administrative Entry: ${displayInfo.entryType} (${displayInfo.points.toFixed(1)} pt)`}
                            >
                              {displayInfo.resultBadgeText}
                              {activeLifecycle.isFinalized && ' 🔒'}
                            </span>
                          )}
                        </td>

                        {/* Black Player / Administrative Opponent */}
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
                            <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-600 font-mono text-[11px] font-semibold">
                              {displayInfo.blackOpponentLabel || 'Bye / Unpaired'}
                            </span>
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
            <h3 className="text-sm font-bold text-slate-900 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Rapid Result Palette
              </span>
              {activeLifecycle.isFinalized && (
                <span className="text-[11px] font-mono text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 flex items-center gap-1 font-bold">
                  <Lock className="w-3 h-3" />
                  LOCKED
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {activeLifecycle.isFinalized
                ? "Round is finalized. Results cannot be modified without unlocking."
                : "Click buttons or use numeric keypad hotkeys to record scores"}
            </p>
          </div>

          {/* Active Board Indicator */}
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5 text-xs">
            <div className="flex items-center justify-between text-slate-600">
              <span className="font-semibold text-slate-800">
                Board {selectedBoard ? selectedBoard.board : '—'} of {currentBoards.length}
              </span>
              <span className="font-mono font-bold text-blue-600">
                {selectedBoardInfo ? selectedBoardInfo.resultBadgeText : '—'}
              </span>
            </div>

            <div className="text-[11px] text-slate-700 space-y-0.5">
              <div className="truncate">⚪ <b>{selectedWhite?.name || selectedBoardInfo?.whiteOpponentLabel || '—'}</b></div>
              <div className="truncate">⚫ <b>{selectedBlack?.name || selectedBoardInfo?.blackOpponentLabel || '—'}</b></div>
            </div>
          </div>

          {/* Palette Controls: Normal Games vs Administrative Entries */}
          {selectedBoardInfo && !selectedBoardInfo.isNormal ? (
            /* Non-game / Administrative Board Warning Panel */
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
              <div className="flex items-center gap-2 text-slate-800 font-bold text-xs">
                <ShieldCheck className="w-4 h-4 text-blue-600" />
                <span>Administrative Entry ({selectedBoardInfo.entryType})</span>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                This entry has no opposing player. Regulation points (<b>{selectedBoardInfo.points.toFixed(1)} pt</b>) are awarded automatically.
              </p>
              <div className="p-2 rounded bg-white border border-slate-200 text-[11px] font-mono text-slate-700 text-center font-bold">
                Assigned Value: {selectedBoardInfo.resultBadgeText}
              </div>
              <p className="text-[10px] text-slate-400 italic">
                Normal game results (1-0, 0-1, ½-½) cannot be assigned to bye or unpaired entries.
              </p>
            </div>
          ) : (
            /* Normal 2-Player Game Result Controls */
            <>
              {/* Standard Results (1:0, 1/2:1/2, 0:1) */}
              <div className="space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Game Results
                </span>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => handleSetResult('1 - 0', true)}
                    disabled={!isEditableRound}
                    className="py-3 bg-slate-50 hover:bg-emerald-600 hover:text-white active:bg-emerald-700 disabled:opacity-40 disabled:hover:bg-slate-50 disabled:hover:text-slate-800 text-slate-800 rounded-lg text-sm font-bold border border-slate-300 shadow-sm flex flex-col items-center justify-center transition"
                    title="White wins [Hotkey: 1]"
                  >
                    <span>1 : 0</span>
                    <span className="text-[10px] text-slate-500 group-hover:text-emerald-100 font-mono font-normal">Key 1</span>
                  </button>

                  <button
                    onClick={() => handleSetResult('½ - ½', true)}
                    disabled={!isEditableRound}
                    className="py-3 bg-slate-50 hover:bg-emerald-600 hover:text-white active:bg-emerald-700 disabled:opacity-40 disabled:hover:bg-slate-50 disabled:hover:text-slate-800 text-slate-800 rounded-lg text-sm font-bold border border-slate-300 shadow-sm flex flex-col items-center justify-center transition"
                    title="Draw [Hotkey: 2]"
                  >
                    <span>½ : ½</span>
                    <span className="text-[10px] text-slate-500 group-hover:text-emerald-100 font-mono font-normal">Key 2</span>
                  </button>

                  <button
                    onClick={() => handleSetResult('0 - 1', true)}
                    disabled={!isEditableRound}
                    className="py-3 bg-slate-50 hover:bg-emerald-600 hover:text-white active:bg-emerald-700 disabled:opacity-40 disabled:hover:bg-slate-50 disabled:hover:text-slate-800 text-slate-800 rounded-lg text-sm font-bold border border-slate-300 shadow-sm flex flex-col items-center justify-center transition"
                    title="Black wins [Hotkey: 3]"
                  >
                    <span>0 : 1</span>
                    <span className="text-[10px] text-slate-500 group-hover:text-emerald-100 font-mono font-normal">Key 3</span>
                  </button>
                </div>
              </div>

              {/* Forfeits / Administrative Defaults */}
              <div className="space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Unplayed Game Defaults / Forfeits
                </span>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    onClick={() => handleSetResult('1F - 0F', true)}
                    disabled={!isEditableRound}
                    className="py-1.5 bg-slate-50 hover:bg-slate-100 disabled:opacity-40 text-slate-700 border border-slate-300 rounded-md font-semibold transition"
                    title="White forfeit win (Black absent)"
                  >
                    1F : 0F (Forfeit)
                  </button>
                  <button
                    onClick={() => handleSetResult('0F - 1F', true)}
                    disabled={!isEditableRound}
                    className="py-1.5 bg-slate-50 hover:bg-slate-100 disabled:opacity-40 text-slate-700 border border-slate-300 rounded-md font-semibold transition"
                    title="Black forfeit win (White absent)"
                  >
                    0F : 1F (Forfeit)
                  </button>
                </div>
              </div>

              {/* Color Swap & Clear Selected */}
              <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
                <button
                  onClick={handleSwapColors}
                  disabled={!isEditableRound}
                  className="flex-1 py-1.5 bg-slate-50 hover:bg-slate-100 disabled:opacity-40 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition shadow-sm"
                  title="Swap White and Black player colors on this board"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5 text-blue-600" />
                  <span>Swap Colors</span>
                </button>

                <button
                  onClick={() => handleSetResult('-', false)}
                  disabled={!isEditableRound}
                  className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 disabled:opacity-40 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold transition shadow-sm"
                  title="Clear selected result [Hotkey: Del]"
                >
                  Clear
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 4. Finalize Round Modal */}
      {showFinalizeModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-150 text-slate-900">
            <div className="p-5 border-b border-slate-200 bg-emerald-50/75 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-100 text-emerald-700">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Finalize & Lock Round {activeRound}</h3>
                  <p className="text-[11px] text-slate-500">Authoritative Arbiter Verification & Standings Commitment</p>
                </div>
              </div>
              <button 
                onClick={() => setShowFinalizeModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs text-slate-600">
              <p className="leading-relaxed">
                You are about to finalize <strong className="text-slate-900">Round {activeRound}</strong>. This action validates all board outcomes, creates a SHA-256 state snapshot, recalculates authoritative standings and tie-breaks, and permanently locks result editing.
              </p>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <div className="font-bold text-slate-700 flex items-center justify-between">
                  <span>Round Summary:</span>
                  <span className="font-mono text-emerald-700 font-bold">{activeLifecycle.totalBoards} Total Boards</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600">
                  <div>Normal Games: <b>{activeLifecycle.normalGames}</b> (100% entered)</div>
                  <div>Admin Byes/Entries: <b>{activeLifecycle.adminEntries}</b></div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-700">Arbiter Name / Signature:</label>
                <input
                  type="text"
                  value={arbiterName}
                  onChange={e => setArbiterName(e.target.value)}
                  placeholder="e.g. IA John Doe"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-emerald-500 font-medium"
                />
              </div>

              {finalizationError && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-[11px] flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{finalizationError}</span>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2.5">
              <button
                onClick={() => setShowFinalizeModal(false)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 font-semibold hover:bg-slate-200 transition text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleFinalizeRound}
                disabled={isFinalizing}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-lg font-bold flex items-center gap-1.5 transition text-xs shadow-sm disabled:opacity-50"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>{isFinalizing ? 'Finalizing...' : 'Confirm & Finalize Round'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Unlock Finalized Round Modal */}
      {showUnlockModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-150 text-slate-900">
            <div className="p-5 border-b border-slate-200 bg-amber-50/75 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-amber-100 text-amber-700">
                  <Unlock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Unlock Round {activeRound} for Corrections</h3>
                  <p className="text-[11px] text-slate-500">Security & Integrity Warning</p>
                </div>
              </div>
              <button 
                onClick={() => setShowUnlockModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs text-slate-600">
              {activeRound < latestRound ? (
                /* Hard Block: Subsequent rounds exist */
                <div className="space-y-3">
                  <div className="p-3 bg-rose-50 rounded-xl border border-rose-200 text-rose-900 space-y-1">
                    <div className="font-bold flex items-center gap-1.5">
                      <AlertOctagon className="w-4 h-4 text-rose-600" />
                      <span>Correction Blocked: Downstream Round Dependency</span>
                    </div>
                    <p className="text-[11px] leading-relaxed">
                      Subsequent rounds (Round {activeRound + 1} to Round {latestRound}) already exist and were paired based on the results of Round {activeRound}.
                    </p>
                  </div>
                  <p className="leading-relaxed text-slate-600">
                    Modifying an earlier finalized round would invalidate existing pairings and standings. To modify earlier round results, subsequent rounds must be deleted in reverse order first.
                  </p>
                </div>
              ) : (
                /* Latest round: Permitted with explicit Arbiter confirmation */
                <div className="space-y-3">
                  <p className="leading-relaxed">
                    This round is finalized. Unlocking allows you to correct misrecorded results. Note that changing a result may affect standings, tie-breaks, and future pairings.
                  </p>
                  <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 space-y-1 text-amber-900">
                    <div className="font-bold">Arbiter Confirmation Required:</div>
                    <p className="text-[11px] leading-relaxed">
                      Once corrections are complete, you must re-finalize the round before generating Round {activeRound + 1}.
                    </p>
                  </div>
                </div>
              )}

              {finalizationError && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-[11px] flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{finalizationError}</span>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2.5">
              <button
                onClick={() => setShowUnlockModal(false)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 font-semibold hover:bg-slate-200 transition text-xs"
              >
                Close
              </button>
              {activeRound === latestRound && (
                <button
                  onClick={handleUnlockRound}
                  disabled={isUnlocking}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white rounded-lg font-bold flex items-center gap-1.5 transition text-xs shadow-sm disabled:opacity-50"
                >
                  <Unlock className="w-3.5 h-3.5" />
                  <span>{isUnlocking ? 'Unlocking...' : 'Confirm & Unlock Results'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 6. Pairing Preview & Arbiter Acceptance Modal */}
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

      {/* 7. Authoritative Engine Unavailable Modal */}
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
