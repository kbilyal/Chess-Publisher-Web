import React from 'react';
import { Tournament, TabType } from '../types';
import { 
  Trophy, Plus, ShieldCheck, FlaskConical,
  RotateCcw, FileText, Calendar, Users, LayoutGrid, Award, Globe,
  Download, Upload, Printer
} from 'lucide-react';

interface HeaderProps {
  tournament: Tournament;
  activeTab: TabType;
  onSelectTab: (tab: TabType) => void;
  onOpenTestRunner: () => void;
  onLoadSampleTournament: () => void;
  onCreateNewTournament: () => void;
  onOpenResetTournament?: () => void;
  onUndoReset?: () => void;
  canUndoReset?: boolean;
  onExportPortableJson?: () => void;
  onImportPortableJson?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const Header: React.FC<HeaderProps> = ({
  tournament,
  activeTab,
  onSelectTab,
  onOpenTestRunner,
  onLoadSampleTournament,
  onCreateNewTournament,
  onOpenResetTournament,
  onUndoReset,
  canUndoReset = false,
  onExportPortableJson,
  onImportPortableJson
}) => {
  const playerCount = tournament.players?.length || 0;
  const liveBoards = tournament.pairings.liveBoards || {};
  const generatedRounds = Object.keys(liveBoards).map(Number).filter(n => n > 0).sort((a, b) => a - b);
  const currentRound = generatedRounds.length ? generatedRounds[generatedRounds.length - 1] : 0;

  const navTabs: { id: TabType; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number | string }[] = [
    { id: 'setup', label: 'Tournament Setup', icon: Trophy },
    { id: 'players', label: 'Players Roster', icon: Users, badge: playerCount },
    { id: 'pairings', label: 'Pairings & Results', icon: LayoutGrid, badge: currentRound > 0 ? `R${currentRound}` : undefined },
    { id: 'standings', label: 'Standings & Tie-Breaks', icon: Award },
    { id: 'schedule', label: 'Schedule', icon: Calendar },
    { id: 'chessresults', label: 'Chess-Results', icon: Globe },
    { id: 'export', label: 'Export & Print', icon: Printer }
  ];

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm select-none">
      {/* Top Application Bar */}
      <div className="px-4 py-2.5 flex items-center justify-between gap-3 border-b border-slate-100 bg-white">
        {/* Brand & Tournament Name */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2.5 text-blue-600 font-bold tracking-tight text-sm flex-shrink-0">
            <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shadow-sm">
              <Trophy className="w-4 h-4 text-amber-500" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5 leading-none">
                <span className="bg-gradient-to-r from-blue-700 via-indigo-600 to-amber-600 bg-clip-text text-transparent font-extrabold text-sm tracking-tight">
                  Chess-Publisher
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-mono font-bold">
                  FIDE 2026
                </span>
              </div>
              <span className="text-[11px] text-slate-500 font-medium truncate max-w-[200px] sm:max-w-xs mt-0.5">
                {tournament.name || "FIDE Tournament Manager"}
              </span>
            </div>
          </div>

          <div className="h-4 w-px bg-slate-200 hidden sm:block" />

          {/* Quick Tournament Actions */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={onCreateNewTournament}
              className="px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 hover:text-slate-900 rounded-md text-xs flex items-center gap-1.5 transition shadow-sm font-medium"
              title="Start a new empty tournament"
            >
              <Plus className="w-3.5 h-3.5 text-blue-600" />
              <span className="hidden md:inline">New</span>
            </button>

            <button
              onClick={onLoadSampleTournament}
              className="px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-300 text-slate-600 hover:text-slate-900 rounded-md text-xs flex items-center gap-1.5 transition font-medium"
              title="Load 12-player sample FIDE tournament"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
              <span className="hidden lg:inline text-slate-600">Load Sample</span>
            </button>

            {onOpenResetTournament && (
              <button
                onClick={onOpenResetTournament}
                className="px-2.5 py-1 bg-white hover:bg-rose-50 border border-rose-200 text-rose-700 hover:text-rose-900 rounded-md text-xs flex items-center gap-1.5 transition font-medium shadow-sm"
                title="Reset or wipe tournament with pre-flight inspection"
              >
                <RotateCcw className="w-3.5 h-3.5 text-rose-600" />
                <span className="hidden lg:inline">Reset</span>
              </button>
            )}

            {canUndoReset && onUndoReset && (
              <button
                onClick={onUndoReset}
                className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 rounded-md text-xs flex items-center gap-1.5 transition font-semibold shadow-sm animate-pulse"
                title="Undo last reset and restore archived tournament snapshot"
              >
                <RotateCcw className="w-3.5 h-3.5 text-amber-700" />
                <span>Undo Reset</span>
              </button>
            )}

            {onExportPortableJson && (
              <button
                onClick={onExportPortableJson}
                className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 rounded-md text-xs flex items-center gap-1.5 transition font-semibold"
                title="Download Portable JSON tournament backup"
              >
                <Download className="w-3.5 h-3.5 text-blue-600" />
                <span className="hidden xl:inline">Portable Backup</span>
              </button>
            )}

            {onImportPortableJson && (
              <label
                className="px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 rounded-md text-xs flex items-center gap-1.5 transition font-medium cursor-pointer shadow-sm"
                title="Import Portable JSON tournament backup"
              >
                <Upload className="w-3.5 h-3.5 text-slate-500" />
                <span className="hidden xl:inline">Load JSON</span>
                <input
                  type="file"
                  accept=".json"
                  onChange={onImportPortableJson}
                  className="hidden"
                />
              </label>
            )}
          </div>
        </div>

        {/* Right Status & Test Suite Trigger */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* FIDE Engine Status Badge */}
          <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-semibold font-mono">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>FIDE Dutch 1.9.57 & 2026 Tie-Breaks Active</span>
          </div>

          {/* Test Runner Modal Button */}
          <button
            onClick={onOpenTestRunner}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 rounded-lg text-xs font-semibold shadow-sm transition group"
            title="Open Automated FIDE Rules & Engine Compliance Test Suite"
          >
            <FlaskConical className="w-3.5 h-3.5 text-amber-600 group-hover:rotate-12 transition-transform" />
            <span>Test Suite</span>
          </button>
        </div>
      </div>

      {/* Primary Navigation Ribbon */}
      <div className="px-4 flex items-center gap-1 overflow-x-auto no-scrollbar bg-slate-50/90 text-xs border-b border-slate-200">
        {navTabs.map(tab => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              className={`px-3.5 py-2.5 font-medium whitespace-nowrap border-b-2 flex items-center gap-2 transition ${
                isActive
                  ? 'border-blue-600 text-blue-700 bg-white font-semibold shadow-sm -mb-px'
                  : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
              <span>{tab.label}</span>
              {tab.badge !== undefined && (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono border ${
                  isActive 
                    ? 'bg-blue-100 text-blue-800 border-blue-300' 
                    : 'bg-slate-200 text-slate-700 border-slate-300'
                }`}>
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </header>
  );
};
