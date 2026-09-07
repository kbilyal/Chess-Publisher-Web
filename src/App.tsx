import React, { useState, useEffect } from 'react';
import { CheckCircle2, Users, LayoutGrid, Award, Globe2, Cloud, ArrowRight, Info, Trophy } from 'lucide-react';
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
import { OnlineCloudTab } from './components/OnlineCloudTab';
import { PlayerHistoryModal } from './components/PlayerHistoryModal';
import { TieBreakSettingsModal } from './components/TieBreakSettingsModal';
import { TestRunnerModal } from './components/TestRunnerModal';
import { PrintDocumentModal, PrintDocType } from './components/PrintDocumentModal';
import { ResortStartingListModal } from './components/ResortStartingListModal';
import { ResetTournamentModal } from './components/ResetTournamentModal';
import { defaultTransactionManager } from './transactions/TransactionManager';
import { executeUndoReset } from './transactions/resetWorkflow';

const STORAGE_KEY = 'fide_tournament_manager_v2';
type AppTab = TabType | 'onlinecloud';

export default function App() {
  const [tournament, setTournament] = useState<Tournament>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error('Failed to parse saved tournament data from localStorage:', e);
    }
    return INITIAL_TOURNAMENT_DATA;
  });

  const [activeTab, setActiveTab] = useState<AppTab>('pairings');
  const [selectedPlayerIdForHistory, setSelectedPlayerIdForHistory] = useState<number | null>(null);
  const [selectedTieBreakForSettings, setSelectedTieBreakForSettings] = useState<string | null>(null);
  const [showTestRunner, setShowTestRunner] = useState(false);
  const [selectedPrintDoc, setSelectedPrintDoc] = useState<{ docType: PrintDocType; round?: number } | null>(null);
  const [showResortModal, setShowResortModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [hasUndoSnapshot, setHasUndoSnapshot] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tournament));
    } catch (e) {
      console.error('Failed to save tournament state:', e);
    }
  }, [tournament]);

  const handleResortStartingList = () => setShowResortModal(true);
  const handleOpenResetModal = () => setShowResetModal(true);

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

  const handleLoadSampleTournament = () => setShowResetModal(true);
  const handleCreateNewTournament = () => setShowResetModal(true);

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

  const handleImportPortableJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (!parsed.settings || !parsed.players) throw new Error('Invalid tournament JSON structure.');
        setTournament(parsed);
        alert(`Successfully imported tournament "${parsed.name}" with ${parsed.players.length} players!`);
        setActiveTab('pairings');
      } catch (err: any) {
        alert('Failed to load JSON backup: ' + (err.message || String(err)));
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const setupChecks = [
    Boolean(tournament.name?.trim()),
    Boolean(tournament.settings.country?.trim()),
    Boolean(tournament.settings.chiefArbiter?.trim()),
    Boolean(tournament.settings.city?.trim()),
    Boolean(tournament.settings.startDate),
    Boolean(tournament.settings.endDate),
    Boolean(tournament.settings.timeControl),
    Boolean(tournament.settings.tournamentFormat)
  ];
  const setupDone = setupChecks.filter(Boolean).length;
  const setupProgress = Math.round((setupDone / setupChecks.length) * 100);

  return (
    <div className="cpv6-app" data-active-tab={activeTab}>
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

      <main className="cpv6-main">
        <div className="cpv6-main-inner">
          <div className={`cpv6-workspace ${activeTab === 'setup' ? 'cpv6-workspace-setup' : ''}`}>
            <div className="cpv6-primary-pane">
              {activeTab === 'setup' && <TournamentSetupTab tournament={tournament} onUpdateTournament={setTournament} onOpenTieBreakSettings={name => setSelectedTieBreakForSettings(name)} />}
              {activeTab === 'players' && <PlayersTab tournament={tournament} onUpdateTournament={setTournament} onResortStartingList={handleResortStartingList} />}
              {activeTab === 'pairings' && <PairingsTab tournament={tournament} onUpdateTournament={setTournament} onOpenPlayerHistory={id => setSelectedPlayerIdForHistory(id)} onOpenPrintModal={(docType, round) => setSelectedPrintDoc({ docType, round })} />}
              {activeTab === 'standings' && <StandingsTab tournament={tournament} onOpenPlayerHistory={id => setSelectedPlayerIdForHistory(id)} onOpenTieBreakSettings={name => setSelectedTieBreakForSettings(name)} onOpenPrintModal={docType => setSelectedPrintDoc({ docType })} />}
              {activeTab === 'tiebreaks' && <TieBreaksTab tournament={tournament} onUpdateTournament={setTournament} onNavigateToStandings={() => setActiveTab('standings')} />}
              {activeTab === 'schedule' && <ScheduleTab tournament={tournament} onUpdateTournament={setTournament} />}
              {activeTab === 'chessresults' && <ChessResultsTab tournament={tournament} onUpdateTournament={setTournament} />}
              {activeTab === 'onlinecloud' && <OnlineCloudTab tournament={tournament} />}
              {activeTab === 'export' && (
                <ExportTrfTab tournament={tournament} onImportTournament={imported => { setTournament(imported); setActiveTab('pairings'); }} onOpenPrintModal={(docType, round) => setSelectedPrintDoc({ docType, round })} />
              )}
            </div>

            {activeTab === 'setup' && (
              <aside className="cpv6-setup-rail" aria-label="Tournament setup overview">
                <section className="cpv6-hero-card">
                  <div className="cpv6-hero-mark"><Trophy className="w-7 h-7" /></div>
                  <div>
                    <strong>Create. Manage. Publish.</strong>
                    <span>From the first player to the final report.</span>
                  </div>
                </section>

                <section className="cpv6-overview-card">
                  <div className="cpv6-card-heading">Tournament Progress</div>
                  <div className="cpv6-progress-row">
                    <div className="cpv6-progress-ring" style={{ '--cpv6-progress': `${setupProgress * 3.6}deg` } as React.CSSProperties}>
                      <span>{setupProgress}%</span>
                    </div>
                    <div className="cpv6-progress-steps">
                      <span className="is-done"><CheckCircle2 className="w-4 h-4" /> Setup</span>
                      <span className={tournament.players.length > 0 ? 'is-done' : ''}><Users className="w-4 h-4" /> Players</span>
                      <span><LayoutGrid className="w-4 h-4" /> Pairings</span>
                      <span><Award className="w-4 h-4" /> Results</span>
                    </div>
                  </div>
                  <div className="cpv6-progress-copy">{setupDone} of {setupChecks.length} essential setup fields are complete.</div>
                </section>

                <section className="cpv6-overview-card cpv6-quick-actions">
                  <div className="cpv6-card-heading">Quick Actions</div>
                  <button type="button" onClick={() => setActiveTab('players')}><Users className="w-4 h-4" /><span>Open Player List</span><ArrowRight className="w-4 h-4" /></button>
                  <button type="button" onClick={() => setActiveTab('pairings')}><LayoutGrid className="w-4 h-4" /><span>Go to Pairings</span><ArrowRight className="w-4 h-4" /></button>
                  <button type="button" onClick={() => setActiveTab('standings')}><Award className="w-4 h-4" /><span>View Standings</span><ArrowRight className="w-4 h-4" /></button>
                  <button type="button" onClick={() => setActiveTab('chessresults')}><Globe2 className="w-4 h-4" /><span>Chess-Results</span><ArrowRight className="w-4 h-4" /></button>
                  <button type="button" onClick={() => setActiveTab('onlinecloud')}><Cloud className="w-4 h-4" /><span>Online & Cloud</span><ArrowRight className="w-4 h-4" /></button>
                </section>

                <section className="cpv6-info-strip"><Info className="w-4 h-4" /><span>UI-only redesign. Tournament rules and calculation engines are unchanged.</span></section>
              </aside>
            )}
          </div>
        </div>
      </main>

      {selectedPrintDoc !== null && <PrintDocumentModal tournament={tournament} initialDocType={selectedPrintDoc.docType} initialRound={selectedPrintDoc.round} onClose={() => setSelectedPrintDoc(null)} />}
      {selectedPlayerIdForHistory !== null && <PlayerHistoryModal tournament={tournament} playerId={selectedPlayerIdForHistory} onClose={() => setSelectedPlayerIdForHistory(null)} />}
      {selectedTieBreakForSettings !== null && <TieBreakSettingsModal tournament={tournament} tieBreakName={selectedTieBreakForSettings} onClose={() => setSelectedTieBreakForSettings(null)} onUpdateTournament={setTournament} />}
      {showTestRunner && <TestRunnerModal onClose={() => setShowTestRunner(false)} />}
      {showResortModal && <ResortStartingListModal isOpen={showResortModal} onClose={() => setShowResortModal(false)} tournament={tournament} onCommit={resorted => { setTournament(resorted); setShowResortModal(false); }} />}
      {showResetModal && <ResetTournamentModal isOpen={showResetModal} onClose={() => setShowResetModal(false)} tournament={tournament} onCommit={resetTournament => { setTournament(resetTournament); setHasUndoSnapshot(true); setShowResetModal(false); setActiveTab('setup'); }} />}
    </div>
  );
}
