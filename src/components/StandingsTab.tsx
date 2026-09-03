import React, { useState, useMemo } from 'react';
import { Tournament, PlayerRoundState } from '../types';
import { calculateTournamentStandings, calculateSpecialPrizes, getStandingTieBreakValue } from '../engine/tiebreaks';
import { runTieBreakIntegrityCheck } from '../engine/tiebreakChecker';
import { getFederationFlag } from '../data/initialData';
import { 
  Trophy, Medal, Award, Search, CheckCircle2, 
  ExternalLink, HelpCircle, User, Filter, Eye, ChevronRight, Printer,
  ShieldCheck, AlertTriangle, AlertOctagon, Sliders
} from 'lucide-react';
import { PlayerTieBreakDetailsModal } from './PlayerTieBreakDetailsModal';
import { TieBreakCheckerModal } from './TieBreakCheckerModal';

interface StandingsTabProps {
  tournament: Tournament;
  onOpenPlayerHistory: (playerId: number) => void;
  onOpenTieBreakSettings: (tieName: string) => void;
  onOpenPrintModal?: (docType: 'standings' | 'crosstable') => void;
}

export const StandingsTab: React.FC<StandingsTabProps> = ({
  tournament,
  onOpenPlayerHistory,
  onOpenTieBreakSettings,
  onOpenPrintModal
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showSpecialPrizes, setShowSpecialPrizes] = useState(false);
  const [selectedSpecialAges, setSelectedSpecialAges] = useState<string[]>(['U18', '50+', '65+']);
  const [femalePrize, setFemalePrize] = useState(true);
  const [showFideDiagnostics, setShowFideDiagnostics] = useState(false);
  const [selectedPlayerForDetails, setSelectedPlayerForDetails] = useState<{ id: number; tb?: string } | null>(null);
  const [showCheckerModal, setShowCheckerModal] = useState(false);

  const integrityReport = useMemo(() => runTieBreakIntegrityCheck(tournament), [tournament]);
  const playerIssuesMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const iss of integrityReport.issues) {
      if (iss.playerId) {
        map.set(iss.playerId, iss.issue);
      }
    }
    return map;
  }, [integrityReport]);

  const standingsResult = calculateTournamentStandings(tournament);
  const { players, tieList, completed } = standingsResult;
  const announcedRounds = parseInt(tournament.settings.rounds) || 7;
  const isComplete = completed >= announcedRounds && completed > 0;

  // Filter visible standings
  const visiblePlayers = players.filter(p => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.fed.toLowerCase().includes(q) || p.fideId.includes(q);
  });

  // Calculate Special Prizes
  const specialResults = calculateSpecialPrizes(players, {
    ages: selectedSpecialAges,
    female: femalePrize,
    places: 3,
    ratingRanges: [
      { enabled: true, name: "Under 2200", from: "0", to: "2199" },
      { enabled: true, name: "Under 2000", from: "0", to: "1999" }
    ]
  });

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6 animate-in fade-in duration-200 select-none text-slate-800">
      {/* 1. Header & Tie-Break Priority Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-500" />
              <span>{isComplete ? 'Final Official Standings' : `Standings after Round ${completed} of ${announcedRounds}`}</span>
              {isComplete && (
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-50 border border-emerald-300 text-emerald-800">
                  TOURNAMENT COMPLETE
                </span>
              )}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Ranked strictly by primary points followed by the FIDE 2026 Tie-Break Priority Chain.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCheckerModal(true)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-1.5 transition ${
                integrityReport.status === 'PASS'
                  ? 'bg-white hover:bg-slate-50 border-slate-300 text-slate-700'
                  : 'bg-amber-50 border-amber-300 text-amber-900 shadow-sm'
              }`}
              title="Open FIDE Tie-Break Integrity Diagnostic Report"
            >
              <ShieldCheck className={`w-3.5 h-3.5 ${integrityReport.status === 'PASS' ? 'text-emerald-600' : 'text-amber-600'}`} />
              <span>Integrity: {integrityReport.status === 'PASS' ? '✓ PASS' : `⚠ ${integrityReport.issues.length}`}</span>
            </button>

            <button
              onClick={() => setShowFideDiagnostics(!showFideDiagnostics)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-1.5 transition ${
                showFideDiagnostics 
                  ? 'bg-blue-50 border-blue-300 text-blue-900 shadow-sm' 
                  : 'bg-white hover:bg-slate-50 border-slate-300 text-slate-700'
              }`}
            >
              <Eye className="w-3.5 h-3.5 text-blue-600" />
              <span>FIDE 2026 Diagnostics</span>
            </button>

            <button
              onClick={() => setShowSpecialPrizes(!showSpecialPrizes)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-1.5 transition ${
                showSpecialPrizes 
                  ? 'bg-amber-50 border-amber-300 text-amber-900 shadow-sm' 
                  : 'bg-white hover:bg-slate-50 border-slate-300 text-slate-700'
              }`}
            >
              <Award className="w-3.5 h-3.5 text-amber-600" />
              <span>Special Prizes</span>
            </button>

            <button
              onClick={() => onOpenPrintModal ? onOpenPrintModal('standings') : window.print()}
              className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shadow-sm"
              title="Print official tournament standings table"
            >
              <Printer className="w-3.5 h-3.5 text-blue-600" />
              <span>Print Official Standings</span>
            </button>
          </div>
        </div>

        {/* Tie Break Sequence Bar */}
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="font-bold text-slate-500 uppercase tracking-wider text-[11px]">
            Tie-Break Order:
          </span>
          <span className="px-2.5 py-1 rounded bg-slate-100 border border-slate-200 text-slate-800 font-semibold font-mono">
            Points (Game Pts)
          </span>
          {tieList.map((tb, idx) => (
            <React.Fragment key={tb}>
              <span className="text-slate-400">→</span>
              <button
                onClick={() => onOpenTieBreakSettings(tb)}
                className="px-2.5 py-1 rounded bg-blue-50 border border-blue-200 text-blue-800 font-semibold font-mono hover:bg-blue-100 transition flex items-center gap-1 shadow-sm"
                title="Click to view tie-break options"
              >
                <span>TB{idx + 1}: {tb.split(' ')[0]}</span>
              </button>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* 2. Special Prizes Panel (Collapsible) */}
      {showSpecialPrizes && (
        <section className="bg-white border border-amber-300 rounded-xl p-5 shadow-md space-y-4 animate-in slide-in-from-top-4 duration-150">
          <div className="flex items-center justify-between border-b border-amber-100 pb-3">
            <h3 className="text-sm font-bold text-amber-900 flex items-center gap-2">
              <Award className="w-4 h-4 text-amber-600" />
              Special Category Prizes (Age & Rating Brackets)
            </h3>
            <div className="flex items-center gap-2 text-xs">
              <label className="flex items-center gap-1.5 text-slate-700 font-medium">
                <input
                  type="checkbox"
                  checked={femalePrize}
                  onChange={e => setFemalePrize(e.target.checked)}
                  className="rounded border-slate-300 bg-white text-blue-600"
                />
                Best Female
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
            {specialResults.map(grp => (
              <div key={grp.name} className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
                <div className="font-bold text-slate-800 border-b border-slate-200 pb-1.5 flex items-center justify-between">
                  <span>{grp.name}</span>
                  <span className="text-[10px] font-mono text-slate-500">{grp.players.length} winners</span>
                </div>
                <div className="space-y-1.5">
                  {grp.players.length === 0 ? (
                    <span className="text-slate-400 italic block py-2">No eligible competitors.</span>
                  ) : (
                    grp.players.map((p, idx) => (
                      <div key={p.id} className="flex items-center justify-between text-slate-700">
                        <div className="flex items-center gap-2 truncate">
                          <span className="font-mono font-bold text-amber-500">
                            {idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'}
                          </span>
                          <span className="truncate font-semibold text-slate-900">{p.name}</span>
                        </div>
                        <span className="font-mono text-slate-600 font-bold">{p.score.toFixed(1)} pts</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 3. FIDE 2026 Article 16 Diagnostics Panel (Collapsible) */}
      {showFideDiagnostics && (
        <section className="bg-white border border-blue-300 rounded-xl p-5 shadow-md space-y-4 animate-in slide-in-from-top-4 duration-150">
          <div className="flex items-center justify-between border-b border-blue-100 pb-3">
            <h3 className="text-sm font-bold text-blue-900 flex items-center gap-2">
              <Eye className="w-4 h-4 text-blue-600" />
              FIDE 2026 Tie-Break Diagnostics (Articles 16.3 & 16.5 VUR Breakdown)
            </h3>
            <span className="text-[10px] font-mono text-slate-500">
              Unplayed Dummy Scores & Adjusted Points Verification
            </span>
          </div>

          <div className="overflow-x-auto max-h-64 border border-slate-200 rounded-lg bg-slate-50 divide-y divide-slate-200 text-xs">
            <table className="w-full text-left border-collapse font-mono">
              <thead>
                <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 font-semibold">
                  <th className="py-2 px-3">Player</th>
                  <th className="py-2 px-3 text-right">Raw Pts</th>
                  <th className="py-2 px-3 text-right">Art 16.3 Adj</th>
                  <th className="py-2 px-3 text-right">BH (Total)</th>
                  <th className="py-2 px-3 text-right">BH-C1 (Cut 1)</th>
                  <th className="py-2 px-3 text-right">SB</th>
                  <th className="py-2 px-3 text-right">ARO</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {players.map(p => (
                  <tr key={p.id} className="hover:bg-slate-100/70">
                    <td className="py-1.5 px-3 font-sans font-semibold text-slate-900">{p.name}</td>
                    <td className="py-1.5 px-3 text-right font-bold text-slate-800">{p.score.toFixed(1)}</td>
                    <td className="py-1.5 px-3 text-right text-indigo-700 font-bold">{p.adjustedScore2026?.toFixed(1) || p.score.toFixed(1)}</td>
                    <td className="py-1.5 px-3 text-right text-slate-700">{p.buchholz?.toFixed(1) || '0.0'}</td>
                    <td className="py-1.5 px-3 text-right text-blue-700 font-bold">{p.buchholzCut1?.toFixed(1) || '0.0'}</td>
                    <td className="py-1.5 px-3 text-right text-emerald-700">{p.sonneborn?.toFixed(2) || '0.00'}</td>
                    <td className="py-1.5 px-3 text-right text-slate-600">{p.aro || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 4. Live Official Standings Table */}
      <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
        {/* Search Bar */}
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-4">
          <div className="relative w-full sm:w-72 text-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by name, ID, or FED..."
              className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-blue-500"
            />
          </div>

          <span className="text-xs font-mono text-slate-500 flex-shrink-0">
            Showing {visiblePlayers.length} of {players.length} competitors
          </span>
        </div>

        {/* Table Frame */}
        <div className="overflow-x-auto min-h-[420px] text-xs">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-semibold font-mono sticky top-0 z-10">
                <th className="py-2.5 px-3 w-14 text-center">Rank</th>
                <th className="py-2.5 px-3">Player Name</th>
                <th className="py-2.5 px-3 w-16 text-center">FED</th>
                <th className="py-2.5 px-3 w-20 text-right">Rating</th>
                <th className="py-2.5 px-3 w-20 text-right font-bold text-slate-900">Points</th>
                {tieList.map((tb, idx) => (
                  <th key={tb} className="py-2.5 px-3 text-right font-mono text-slate-600" title={tb}>
                    TB{idx + 1}: {tb.split(' ')[0]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {visiblePlayers.length === 0 ? (
                <tr>
                  <td colSpan={5 + tieList.length} className="py-12 text-center text-slate-400">
                    No players found matching the search.
                  </td>
                </tr>
              ) : (
                visiblePlayers.map((p, rankIdx) => {
                  const rank = rankIdx + 1;
                  return (
                    <tr
                      key={p.id}
                      onClick={() => onOpenPlayerHistory(p.id)}
                      className={`hover:bg-slate-50 cursor-pointer transition ${
                        rank === 1 && isComplete ? 'bg-amber-50/50' : ''
                      }`}
                      title="Click to view full player game history"
                    >
                      {/* Rank Medal */}
                      <td className="py-2.5 px-3 text-center font-mono font-bold">
                        {rank === 1 ? (
                          <span className="text-amber-500 font-bold">🥇 1</span>
                        ) : rank === 2 ? (
                          <span className="text-slate-500 font-bold">🥈 2</span>
                        ) : rank === 3 ? (
                          <span className="text-amber-700 font-bold">🥉 3</span>
                        ) : (
                          <span className="text-slate-600">{rank}</span>
                        )}
                      </td>

                      {/* Player Name */}
                      <td className="py-2.5 px-3 font-semibold text-slate-900">
                        <div className="flex items-center gap-1.5">
                          <span>{getFederationFlag(p.fed)}</span>
                          <span className="hover:text-blue-600 transition">{p.name}</span>
                          {p.title && (
                            <span className="text-[10px] px-1 rounded bg-amber-50 border border-amber-200 text-amber-800 font-bold">
                              {p.title}
                            </span>
                          )}
                          {playerIssuesMap.has(p.id) && (
                            <span
                              className="text-amber-600 cursor-pointer inline-flex items-center ml-1"
                              title={`Integrity issue: ${playerIssuesMap.get(p.id)}`}
                              onClick={e => {
                                e.stopPropagation();
                                setSelectedPlayerForDetails({ id: p.id });
                              }}
                            >
                              <AlertTriangle className="w-3.5 h-3.5" />
                            </span>
                          )}
                        </div>
                      </td>

                      {/* FED */}
                      <td className="py-2.5 px-3 text-center font-mono text-slate-600">
                        {p.fed}
                      </td>

                      {/* Rating */}
                      <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                        {p.rating}
                      </td>

                      {/* Points */}
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-blue-600 text-sm">
                        {p.score.toFixed(1)}
                      </td>

                      {/* Tie-Breaks */}
                      {tieList.map(tb => {
                        const val = getStandingTieBreakValue(p, tb);
                        const isDecimals2 = tb.includes('Sonneborn') || tb.includes('Average of Opponents');
                        return (
                          <td
                            key={tb}
                            onClick={e => {
                              e.stopPropagation();
                              setSelectedPlayerForDetails({ id: p.id, tb });
                            }}
                            className="py-2.5 px-3 text-right font-mono text-slate-700 hover:bg-blue-100/70 hover:text-blue-900 transition cursor-pointer"
                            title={`Click to inspect ${p.name}'s ${tb} breakdown`}
                          >
                            {isDecimals2 ? val.toFixed(2) : val.toFixed(1)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Modals */}
      {selectedPlayerForDetails && (
        <PlayerTieBreakDetailsModal
          tournament={tournament}
          playerId={selectedPlayerForDetails.id}
          initialTieBreakName={selectedPlayerForDetails.tb}
          isOpen={!!selectedPlayerForDetails}
          onClose={() => setSelectedPlayerForDetails(null)}
        />
      )}

      {showCheckerModal && (
        <TieBreakCheckerModal
          tournament={tournament}
          isOpen={showCheckerModal}
          onClose={() => setShowCheckerModal(false)}
          onOpenPlayerDetails={(id, tb) => setSelectedPlayerForDetails({ id, tb })}
        />
      )}
    </div>
  );
};
