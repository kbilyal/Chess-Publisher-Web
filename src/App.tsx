import React, { useState, useEffect } from 'react';
import { Tournament, TabType } from './types';
import { INITIAL_TOURNAMENT_DATA, createInitialEmptyTournament } from './data/initialData';
import { Header } from './components/Header';
import { TournamentSetupTab } from './components/TournamentSetupTab';
import { PlayersTab } from './components/PlayersTab';
import { PairingsTab } from './components/PairingsTab';
import { StandingsTab } from './components/StandingsTab';
import { TieBreaksTab } from './components/TieBreaksTab';
import { ScheduleTab } from './components/ScheduleTab';
import { ChessResultsTab } from './components/ChessResultsTab';
import { ExportTrfTab } from './components/ExportTrfTab';
import { PlayerHistoryModal } from './components/PlayerHistoryModal';
import { TieBreakSettingsModal } from './components/TieBreakSettingsModal';
import { TestRunnerModal } from './components/TestRunnerModal';
import { PrintDocumentModal, PrintDocType } from './components/PrintDocumentModal';
import { ResortStartingListModal } from './components/ResortStartingListModal';
import { ResetTournamentModal } from './components/ResetTournamentModal';
import { defaultTransactionManager } from './transactions/TransactionManager';
import { executeUndoReset } from './transactions/resetWorkflow';

const STORAGE_KEY = 'fide_tournament_manager_v2';

export default function App() {
  const [tournament, setTournament] = useState<Tournament>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error("Failed to parse saved tournament data from localStorage:", e);
    }
    return INITIAL_TOURNAMENT_DATA;
  });

  const [activeTab, setActiveTab] = useState<TabType>('pairings');
  const [selectedPlayerIdForHistory, setSelectedPlayerIdForHistory] = useState<number | null>(null);
  const [selectedTieBreakForSettings, setSelectedTieBreakForSettings] = useState<string | null>(null);
  const [showTestRunner, setShowTestRunner] = useState(false);
  const [selectedPrintDoc, setSelectedPrintDoc] = useState<{ docType: PrintDocType; round?: number } | null>(null);
  const [showResortModal, setShowResortModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [hasUndoSnapshot, setHasUndoSnapshot] = useState(false);

  // Auto-save to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tournament));
    } catch (e) {
      console.error("Failed to save tournament state:", e);
    }
  }, [tournament]);

  // Resort Starting List Handler - Opens Transactional Preflight Modal
  const handleResortStartingList = () => {
    setShowResortModal(true);
  };

  // Reset Tournament Handler - Opens Transactional Preflight Modal
  const handleOpenResetModal = () => {
    setShowResetModal(true);
  };

  // Undo Last Reset Handler
  const handleUndoReset = async () => {
    try {
      const result = await executeUndoReset(defaultTransactionManager);
      setTournament(result.tournament);
      setHasUndoSnapshot(false);
      setActiveTab('pairings');
    } catch (err: any) {
      alert(`Undo failed: ${err.message || String(err)}`);
    }
  };

  // Reset to initial sample tournament (calls transactional modal)
  const handleLoadSampleTournament = () => {
    setShowResetModal(true);
  };

  // Start a fresh tournament (calls transactional modal)
  const handleCreateNewTournament = () => {
    setShowResetModal(true);
  };

  // Export full portable JSON
  const handleExportPortableJson = () => {
    const jsonStr = JSON.stringify(tournament, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = (tournament.name || 'tournament').replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
    a.href = url;
    a.download = `${safeName}_portable_backup.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Import full portable JSON
  const handleImportPortableJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        if (!parsed.settings || !parsed.players) {
          throw new Error("Invalid tournament JSON structure.");
        }
        setTournament(parsed);
        alert(`Successfully imported tournament "${parsed.name}" with ${parsed.players.length} players!`);
        setActiveTab('pairings');
      } catch (err: any) {
        alert("Failed to load JSON backup: " + (err.message || String(err)));
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="min-h-screen bg-slate-100/80 text-slate-800 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      {/* Top Main Navigation Header */}
      <Header
        tournament={tournament}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenTestRunner={() => setShowTestRunner(true)}
        onLoadSampleTournament={handleLoadSampleTournament}
        onCreateNewTournament={handleCreateNewTournament}
        onOpenResetTournament={handleOpenResetModal}
        onUndoReset={handleUndoReset}
        canUndoReset={hasUndoSnapshot || defaultTransactionManager.getUndoResetSnapshot() !== null}
        onExportPortableJson={handleExportPortableJson}
        onImportPortableJson={handleImportPortableJson}
      />

      {/* Primary Tab Content Area */}
      <main className="flex-1 pb-16">
        {activeTab === 'setup' && (
          <TournamentSetupTab
            tournament={tournament}
            onUpdateTournament={setTournament}
            onOpenTieBreakSettings={name => setSelectedTieBreakForSettings(name)}
          />
        )}

        {activeTab === 'players' && (
          <PlayersTab
            tournament={tournament}
            onUpdateTournament={setTournament}
            onResortStartingList={handleResortStartingList}
          />
        )}

        {activeTab === 'pairings' && (
          <PairingsTab
            tournament={tournament}
            onUpdateTournament={setTournament}
            onOpenPlayerHistory={id => setSelectedPlayerIdForHistory(id)}
            onOpenPrintModal={(docType, round) => setSelectedPrintDoc({ docType, round })}
          />
        )}

        {activeTab === 'standings' && (
          <StandingsTab
            tournament={tournament}
            onOpenPlayerHistory={id => setSelectedPlayerIdForHistory(id)}
            onOpenTieBreakSettings={name => setSelectedTieBreakForSettings(name)}
            onOpenPrintModal={docType => setSelectedPrintDoc({ docType })}
          />
        )}

        {activeTab === 'tiebreaks' && (
          <TieBreaksTab
            tournament={tournament}
            onUpdateTournament={setTournament}
            onNavigateToStandings={() => setActiveTab('standings')}
          />
        )}

        {activeTab === 'schedule' && (
          <ScheduleTab
            tournament={tournament}
            onUpdateTournament={setTournament}
          />
        )}

        {activeTab === 'chessresults' && (
          <ChessResultsTab
            tournament={tournament}
            onUpdateTournament={setTournament}
          />
        )}

        {activeTab === 'export' && (
          <ExportTrfTab
            tournament={tournament}
            onImportTournament={imported => {
              setTournament(imported);
              setActiveTab('pairings');
            }}
            onOpenPrintModal={(docType, round) => setSelectedPrintDoc({ docType, round })}
          />
        )}
      </main>

      {/* Modals */}
      {selectedPrintDoc !== null && (
        <PrintDocumentModal
          tournament={tournament}
          initialDocType={selectedPrintDoc.docType}
          initialRound={selectedPrintDoc.round}
          onClose={() => setSelectedPrintDoc(null)}
        />
      )}

      {selectedPlayerIdForHistory !== null && (
        <PlayerHistoryModal
          tournament={tournament}
          playerId={selectedPlayerIdForHistory}
          onClose={() => setSelectedPlayerIdForHistory(null)}
        />
      )}

      {selectedTieBreakForSettings !== null && (
        <TieBreakSettingsModal
          tournament={tournament}
          tieBreakName={selectedTieBreakForSettings}
          onClose={() => setSelectedTieBreakForSettings(null)}
          onUpdateTournament={setTournament}
        />
      )}

      {showTestRunner && (
        <TestRunnerModal
          onClose={() => setShowTestRunner(false)}
        />
      )}

      {showResortModal && (
        <ResortStartingListModal
          isOpen={showResortModal}
          onClose={() => setShowResortModal(false)}
          tournament={tournament}
          onCommit={(resorted) => {
            setTournament(resorted);
            setShowResortModal(false);
          }}
        />
      )}

      {showResetModal && (
        <ResetTournamentModal
          isOpen={showResetModal}
          onClose={() => setShowResetModal(false)}
          tournament={tournament}
          onCommit={(resetTournament) => {
            setTournament(resetTournament);
            setHasUndoSnapshot(true);
            setShowResetModal(false);
            setActiveTab('setup');
          }}
        />
      )}
    </div>
  );
}
