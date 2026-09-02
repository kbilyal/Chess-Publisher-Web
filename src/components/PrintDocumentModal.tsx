import React, { useState } from 'react';
import { Tournament, Player } from '../types';
import { calculateTournamentStandings, calculateSpecialPrizes, getStandingTieBreakValue } from '../engine/tiebreaks';
import { getFederationFlag } from '../data/initialData';
import { 
  Printer, X, FileText, CheckCircle2, ChevronRight, 
  Users, LayoutGrid, Award, Calendar, Layers, CheckSquare
} from 'lucide-react';

export type PrintDocType = 
  | 'pairings'
  | 'board_cards'
  | 'round_protocol'
  | 'standings'
  | 'starting_list'
  | 'result_slips'
  | 'crosstable';

interface PrintDocumentModalProps {
  tournament: Tournament;
  initialDocType?: PrintDocType;
  initialRound?: number;
  onClose: () => void;
}

export const PrintDocumentModal: React.FC<PrintDocumentModalProps> = ({
  tournament,
  initialDocType = 'pairings',
  initialRound,
  onClose
}) => {
  const liveBoards = tournament.pairings.liveBoards || {};
  const generatedRounds = Object.keys(liveBoards).map(Number).filter(n => n > 0).sort((a, b) => a - b);
  const defaultRound = initialRound || (generatedRounds.length > 0 ? generatedRounds[generatedRounds.length - 1] : 1);

  const [docType, setDocType] = useState<PrintDocType>(initialDocType);
  const [selectedRound, setSelectedRound] = useState<number>(defaultRound);

  const standings = calculateTournamentStandings(tournament);
  const { players, tieList, completed } = standings;
  const playerByKey = new Map<string, Player>();
  tournament.players.forEach(p => playerByKey.set(p.localKey, p));

  const currentBoards = liveBoards[String(selectedRound)] || [];
  const announcedRounds = parseInt(tournament.settings.rounds) || 7;

  // Handle standard print trigger
  const handlePrint = () => {
    window.print();
  };

  const documentOptions: { id: PrintDocType; title: string; subtitle: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'pairings', title: 'Round Pairings Bulletin', subtitle: 'Official pairings table for notice board', icon: LayoutGrid },
    { id: 'board_cards', title: 'Table Nameplates / Cards', subtitle: 'Foldable board cards with player names & ratings', icon: Layers },
    { id: 'round_protocol', title: 'Round Results Protocol', subtitle: 'Arbiter match scoresheet protocol with signatures', icon: CheckSquare },
    { id: 'standings', title: 'Official Standings & Tie-Breaks', subtitle: 'Rankings with FIDE 2026 tie-breaks & special prizes', icon: Award },
    { id: 'starting_list', title: 'Starting Rank List', subtitle: 'Official player list sorted by rating & title', icon: Users },
    { id: 'result_slips', title: 'Match Result Slips (4 per page)', subtitle: 'Slips for players to sign & submit results', icon: FileText },
    { id: 'crosstable', title: 'Progressive Cross-Table', subtitle: 'Round-by-round score matrix', icon: Calendar }
  ];

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      {/* Modal Box */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-5xl my-auto flex flex-col max-h-[92vh] overflow-hidden text-slate-800 animate-in fade-in zoom-in-95 duration-150">
        
        {/* Top Controls Toolbar (Hidden in Print) */}
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 no-print">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Official Tournament Print Center
              </h2>
              <p className="text-xs text-slate-500">
                FIDE Standard printable documents, board cards, bulletins & protocols
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            {/* Round Selector if doc is round-specific */}
            {(docType === 'pairings' || docType === 'board_cards' || docType === 'round_protocol' || docType === 'result_slips') && (
              <div className="flex items-center gap-1.5 bg-white px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold shadow-2xs">
                <span className="text-slate-500">Round:</span>
                <select
                  value={selectedRound}
                  onChange={e => setSelectedRound(Number(e.target.value))}
                  className="bg-transparent text-slate-900 font-bold focus:outline-none cursor-pointer"
                >
                  {generatedRounds.length === 0 ? (
                    <option value={1}>Round 1</option>
                  ) : (
                    generatedRounds.map(r => (
                      <option key={r} value={r}>Round {r}</option>
                    ))
                  )}
                </select>
              </div>
            )}

            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg text-xs font-bold shadow-sm flex items-center gap-1.5 transition"
            >
              <Printer className="w-4 h-4" />
              <span>Print Document (Ctrl+P)</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition"
              title="Close Print Preview"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Document Type Selector Tabs (Hidden in Print) */}
        <div className="px-4 py-2 bg-slate-100 border-b border-slate-200 flex items-center gap-1.5 overflow-x-auto no-scrollbar text-xs no-print">
          {documentOptions.map(opt => {
            const Icon = opt.icon;
            const isSelected = docType === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => setDocType(opt.id)}
                className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap flex items-center gap-1.5 transition ${
                  isSelected
                    ? 'bg-white text-blue-700 font-bold shadow-xs border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isSelected ? 'text-blue-600' : 'text-slate-400'}`} />
                <span>{opt.title}</span>
              </button>
            );
          })}
        </div>

        {/* Printable View Area (Optimized for Paper & On-Screen Sheet) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-200/60 print:bg-white print:p-0 print:m-0">
          <div className="bg-white border border-slate-300 print:border-none shadow-md print:shadow-none rounded-xl print:rounded-none max-w-4xl mx-auto p-6 sm:p-10 text-slate-900 min-h-[600px]">

            {/* Document Common Header */}
            <div className="border-b-2 border-slate-800 pb-3 mb-6">
              <div className="flex justify-between items-start">
                <div>
                  <h1 className="text-xl font-bold tracking-tight text-slate-950 uppercase">
                    {tournament.name || tournament.settings.organizer || "FIDE Chess Tournament"}
                  </h1>
                  <div className="text-xs text-slate-600 mt-1 space-x-3">
                    <span><b>City / Country:</b> {tournament.settings.city || "Sofia"}, {tournament.settings.country || "BUL"}</span>
                    <span>&bull;</span>
                    <span><b>Chief Arbiter:</b> {tournament.settings.chiefArbiter || "IA / FA"}</span>
                    <span>&bull;</span>
                    <span><b>Time Control:</b> {tournament.settings.timeControl || "90m+30s"}</span>
                  </div>
                </div>

                <div className="text-right text-[11px] font-mono text-slate-500">
                  <div><b>FIDE Standard</b></div>
                  <div>Printed: {new Date().toLocaleDateString()} {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                </div>
              </div>
            </div>

            {/* 1. DOCUMENT: Round Pairings Bulletin */}
            {docType === 'pairings' && (
              <div className="space-y-4 text-xs">
                <div className="flex justify-between items-center bg-slate-100 p-2.5 rounded-lg border border-slate-200">
                  <span className="font-bold text-sm text-slate-900 uppercase tracking-wide">
                    Official Pairings &bull; Round {selectedRound} of {announcedRounds}
                  </span>
                  <span className="font-mono text-slate-600">
                    {currentBoards.length} Boards Scheduled
                  </span>
                </div>

                {currentBoards.length === 0 ? (
                  <div className="py-16 text-center text-slate-400 italic font-mono">
                    No pairings generated for Round {selectedRound} yet.
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse border border-slate-300">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-300 text-slate-800 font-bold font-mono">
                        <th className="p-2 text-center w-12 border-r border-slate-300">Bo.</th>
                        <th className="p-2 w-10 text-center border-r border-slate-300">SNo</th>
                        <th className="p-2 border-r border-slate-300">White Player</th>
                        <th className="p-2 w-14 text-right border-r border-slate-300">Elo</th>
                        <th className="p-2 w-20 text-center font-bold border-r border-slate-300">Result</th>
                        <th className="p-2 w-10 text-center border-r border-slate-300">SNo</th>
                        <th className="p-2 border-r border-slate-300">Black Player</th>
                        <th className="p-2 w-14 text-right border-r border-slate-300">Elo</th>
                        <th className="p-2 w-24 text-center">Arbiter / Sign</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {currentBoards.map((b) => {
                        const w = b.whiteKey ? playerByKey.get(b.whiteKey) : null;
                        const blk = b.blackKey ? playerByKey.get(b.blackKey) : null;
                        return (
                          <tr key={b.board} className="hover:bg-slate-50">
                            <td className="p-2 text-center font-bold font-mono border-r border-slate-300 bg-slate-50">
                              {b.board}
                            </td>
                            <td className="p-2 text-center font-mono text-slate-500 border-r border-slate-300">
                              {w ? w.id : '—'}
                            </td>
                            <td className="p-2 font-semibold border-r border-slate-300">
                              <div className="flex items-center gap-1.5">
                                {w?.title && <span className="text-[10px] font-bold text-amber-700 font-mono">{w.title}</span>}
                                <span>{w ? w.name : (b.result.includes('BYE') ? 'BYE' : '—')}</span>
                                {w?.fed && <span className="text-[10px] text-slate-400 font-mono">({w.fed})</span>}
                              </div>
                            </td>
                            <td className="p-2 text-right font-mono border-r border-slate-300">
                              {w?.rating || '—'}
                            </td>
                            <td className="p-2 text-center font-mono font-bold border-r border-slate-300 bg-slate-50">
                              {b.result || '*'}
                            </td>
                            <td className="p-2 text-center font-mono text-slate-500 border-r border-slate-300">
                              {blk ? blk.id : '—'}
                            </td>
                            <td className="p-2 font-semibold border-r border-slate-300">
                              <div className="flex items-center gap-1.5">
                                {blk?.title && <span className="text-[10px] font-bold text-amber-700 font-mono">{blk.title}</span>}
                                <span>{blk ? blk.name : (b.result.includes('BYE') ? 'BYE' : '—')}</span>
                                {blk?.fed && <span className="text-[10px] text-slate-400 font-mono">({blk.fed})</span>}
                              </div>
                            </td>
                            <td className="p-2 text-right font-mono border-r border-slate-300">
                              {blk?.rating || '—'}
                            </td>
                            <td className="p-2 text-center text-slate-300 font-mono">
                              __________
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}

                {/* Arbiter Sign-off block */}
                <div className="pt-8 grid grid-cols-2 gap-8 text-xs">
                  <div>
                    <span className="text-slate-500 block">Sector Arbiter:</span>
                    <div className="mt-6 border-b border-slate-400 w-48" />
                  </div>
                  <div className="text-right">
                    <span className="text-slate-500 block">Chief Arbiter Signature & Stamp:</span>
                    <div className="mt-6 border-b border-slate-400 w-48 ml-auto" />
                    <span className="text-[10px] text-slate-400 font-mono mt-1 block">{tournament.settings.chiefArbiter}</span>
                  </div>
                </div>
              </div>
            )}

            {/* 2. DOCUMENT: Table Nameplates / Board Cards */}
            {docType === 'board_cards' && (
              <div className="space-y-6">
                <div className="text-xs text-slate-500 border-b pb-2 mb-4 font-mono no-print">
                  Fold along center dotted lines to place as 3D standing table cards on each board.
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {currentBoards.map(b => {
                    const w = b.whiteKey ? playerByKey.get(b.whiteKey) : null;
                    const blk = b.blackKey ? playerByKey.get(b.blackKey) : null;

                    return (
                      <div key={b.board} className="border-2 border-slate-900 rounded-xl p-4 bg-white space-y-3 break-inside-avoid shadow-xs">
                        {/* Board Header */}
                        <div className="flex items-center justify-between border-b-2 border-slate-900 pb-2">
                          <span className="text-xs font-bold font-mono uppercase tracking-wider text-slate-600">
                            Round {selectedRound} &bull; {tournament.name?.slice(0, 24) || "Chess"}
                          </span>
                          <span className="text-xl font-extrabold font-mono bg-slate-900 text-white px-3 py-0.5 rounded">
                            BOARD {b.board}
                          </span>
                        </div>

                        {/* White Player */}
                        <div className="p-2.5 bg-slate-50 border border-slate-300 rounded-lg space-y-0.5">
                          <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 font-mono">
                            <span>WHITE ⚪ (SNo. {w?.id || '—'})</span>
                            <span>Elo: {w?.rating || '—'} {w?.fed ? `[${w.fed}]` : ''}</span>
                          </div>
                          <div className="text-base font-bold text-slate-950 truncate">
                            {w?.title ? `${w.title} ` : ''}{w ? w.name : 'BYE'}
                          </div>
                        </div>

                        {/* VS Divider */}
                        <div className="text-center font-extrabold text-xs font-mono text-slate-400">
                          — VS —
                        </div>

                        {/* Black Player */}
                        <div className="p-2.5 bg-slate-900 text-white rounded-lg space-y-0.5">
                          <div className="flex items-center justify-between text-[11px] font-bold text-slate-300 font-mono">
                            <span>BLACK ⚫ (SNo. {blk?.id || '—'})</span>
                            <span>Elo: {blk?.rating || '—'} {blk?.fed ? `[${blk.fed}]` : ''}</span>
                          </div>
                          <div className="text-base font-bold text-white truncate">
                            {blk?.title ? `${blk.title} ` : ''}{blk ? blk.name : 'BYE'}
                          </div>
                        </div>

                        {/* Result Checkboxes & Signatures */}
                        <div className="pt-2 border-t border-dashed border-slate-300 text-[10px] flex items-center justify-between font-mono">
                          <div className="flex items-center gap-2">
                            <span>Result:</span>
                            <span className="border border-slate-400 px-1 py-0.5">[ 1 - 0 ]</span>
                            <span className="border border-slate-400 px-1 py-0.5">[ ½ - ½ ]</span>
                            <span className="border border-slate-400 px-1 py-0.5">[ 0 - 1 ]</span>
                          </div>
                          <div className="text-slate-400">Sign: ____________</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 3. DOCUMENT: Round Results Protocol */}
            {docType === 'round_protocol' && (
              <div className="space-y-4 text-xs">
                <div className="bg-slate-100 p-3 rounded-lg border border-slate-300 flex justify-between items-center">
                  <div>
                    <h2 className="font-bold text-sm text-slate-950 uppercase">
                      Official Round Results Protocol &bull; Round {selectedRound}
                    </h2>
                    <p className="text-[11px] text-slate-600">
                      Verified by Sector Arbiters & Chief Arbiter
                    </p>
                  </div>
                  <div className="text-right font-mono text-xs">
                    <b>Total Games:</b> {currentBoards.length}
                  </div>
                </div>

                <table className="w-full text-left border-collapse border border-slate-300">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-300 font-mono font-bold">
                      <th className="p-2 text-center w-12 border-r border-slate-300">Bo.</th>
                      <th className="p-2 border-r border-slate-300">White Player</th>
                      <th className="p-2 w-14 text-right border-r border-slate-300">Rtg</th>
                      <th className="p-2 w-24 text-center font-bold border-r border-slate-300">Official Result</th>
                      <th className="p-2 border-r border-slate-300">Black Player</th>
                      <th className="p-2 w-14 text-right border-r border-slate-300">Rtg</th>
                      <th className="p-2 w-28 text-center">Remarks / Forfeit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {currentBoards.map(b => {
                      const w = b.whiteKey ? playerByKey.get(b.whiteKey) : null;
                      const blk = b.blackKey ? playerByKey.get(b.blackKey) : null;
                      return (
                        <tr key={b.board}>
                          <td className="p-2 text-center font-mono font-bold border-r border-slate-300 bg-slate-50">{b.board}</td>
                          <td className="p-2 font-semibold border-r border-slate-300">{w?.title ? `${w.title} ` : ''}{w?.name || 'BYE'}</td>
                          <td className="p-2 text-right font-mono border-r border-slate-300">{w?.rating || '—'}</td>
                          <td className="p-2 text-center font-mono font-bold border-r border-slate-300 bg-slate-50">{b.result || '*'}</td>
                          <td className="p-2 font-semibold border-r border-slate-300">{blk?.title ? `${blk.title} ` : ''}{blk?.name || 'BYE'}</td>
                          <td className="p-2 text-right font-mono border-r border-slate-300">{blk?.rating || '—'}</td>
                          <td className="p-2 text-center font-mono text-[10px] text-slate-500">
                            {b.result.includes('F') ? 'Forfeit' : b.result.includes('BYE') ? 'Bye assigned' : 'Regular Game'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Arbiter Signature & Round Timestamp */}
                <div className="pt-8 grid grid-cols-2 gap-8 text-xs">
                  <div className="space-y-2">
                    <p className="text-slate-600">Round Started at: __________________</p>
                    <p className="text-slate-600">Round Finished at: _________________</p>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-500 block">Chief Arbiter Signature:</span>
                    <div className="mt-6 border-b border-slate-400 w-48 ml-auto" />
                    <span className="text-[10px] text-slate-400 font-mono mt-1 block">{tournament.settings.chiefArbiter}</span>
                  </div>
                </div>
              </div>
            )}

            {/* 4. DOCUMENT: Official Standings & Tie-Breaks */}
            {docType === 'standings' && (
              <div className="space-y-4 text-xs">
                <div className="flex justify-between items-center bg-slate-100 p-3 rounded-lg border border-slate-300">
                  <div>
                    <h2 className="font-bold text-sm text-slate-950 uppercase">
                      {completed >= announcedRounds ? 'Final Official Standings' : `Standings after Round ${completed} of ${announcedRounds}`}
                    </h2>
                    <p className="text-[11px] text-slate-600">
                      Ranked strictly per FIDE 2026 Tie-Break Priority System (Articles 16.3 & 16.5)
                    </p>
                  </div>
                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-900 border border-blue-300">
                    {players.length} Competitors
                  </span>
                </div>

                <table className="w-full text-left border-collapse border border-slate-300">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-300 font-mono font-bold">
                      <th className="p-2 text-center w-12 border-r border-slate-300">Rank</th>
                      <th className="p-2 text-center w-10 border-r border-slate-300">SNo</th>
                      <th className="p-2 border-r border-slate-300">Player Name</th>
                      <th className="p-2 w-12 text-center border-r border-slate-300">FED</th>
                      <th className="p-2 w-14 text-right border-r border-slate-300">Elo</th>
                      <th className="p-2 w-16 text-right font-bold border-r border-slate-300 bg-slate-200/60">Points</th>
                      {tieList.map((tb, idx) => (
                        <th key={tb} className="p-2 text-right border-r border-slate-300" title={tb}>
                          TB{idx + 1}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {players.map((p, idx) => (
                      <tr key={p.id} className={idx < 3 ? 'bg-amber-50/40 font-semibold' : ''}>
                        <td className="p-2 text-center font-mono font-bold border-r border-slate-300">
                          {idx === 0 ? '🥇 1' : idx === 1 ? '🥈 2' : idx === 2 ? '🥉 3' : idx + 1}
                        </td>
                        <td className="p-2 text-center font-mono text-slate-500 border-r border-slate-300">{p.id}</td>
                        <td className="p-2 border-r border-slate-300 font-semibold">
                          <div className="flex items-center gap-1.5">
                            {p.title && <span className="text-[10px] font-bold text-amber-700 font-mono">{p.title}</span>}
                            <span>{p.name}</span>
                          </div>
                        </td>
                        <td className="p-2 text-center font-mono text-slate-600 border-r border-slate-300">{p.fed}</td>
                        <td className="p-2 text-right font-mono border-r border-slate-300">{p.rating}</td>
                        <td className="p-2 text-right font-mono font-bold text-blue-700 border-r border-slate-300 bg-slate-100/60">
                          {p.score.toFixed(1)}
                        </td>
                        {tieList.map(tb => {
                          const val = getStandingTieBreakValue(p, tb);
                          const is2Dec = tb.includes('Sonneborn') || tb.includes('Average of Opponents');
                          return (
                            <td key={tb} className="p-2 text-right font-mono border-r border-slate-300">
                              {is2Dec ? val.toFixed(2) : val.toFixed(1)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Signatures and Stamp */}
                <div className="pt-8 grid grid-cols-2 gap-8 text-xs">
                  <div>
                    <span className="text-slate-500 block">Tournament Director:</span>
                    <div className="mt-6 border-b border-slate-400 w-48" />
                    <span className="text-[10px] text-slate-400 font-mono mt-1 block">{tournament.settings.director || tournament.settings.organizer}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-500 block">Chief Arbiter Signature:</span>
                    <div className="mt-6 border-b border-slate-400 w-48 ml-auto" />
                    <span className="text-[10px] text-slate-400 font-mono mt-1 block">{tournament.settings.chiefArbiter}</span>
                  </div>
                </div>
              </div>
            )}

            {/* 5. DOCUMENT: Starting Rank List */}
            {docType === 'starting_list' && (
              <div className="space-y-4 text-xs">
                <div className="bg-slate-100 p-3 rounded-lg border border-slate-300 flex justify-between items-center">
                  <div>
                    <h2 className="font-bold text-sm text-slate-950 uppercase">
                      Official Starting Rank List & Initial Seeding
                    </h2>
                    <p className="text-[11px] text-slate-600">
                      Seeded by FIDE Rating, Title and Alphabetical Order
                    </p>
                  </div>
                  <span className="font-mono text-xs font-bold text-slate-700">
                    Total Registered: {tournament.players.length}
                  </span>
                </div>

                <table className="w-full text-left border-collapse border border-slate-300">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-300 font-mono font-bold">
                      <th className="p-2 text-center w-12 border-r border-slate-300">SNo</th>
                      <th className="p-2 border-r border-slate-300">Player Name</th>
                      <th className="p-2 w-12 text-center border-r border-slate-300">Title</th>
                      <th className="p-2 w-12 text-center border-r border-slate-300">FED</th>
                      <th className="p-2 w-16 text-right border-r border-slate-300">Rating</th>
                      <th className="p-2 w-28 text-center border-r border-slate-300">FIDE ID</th>
                      <th className="p-2 w-12 text-center border-r border-slate-300">Sex</th>
                      <th className="p-2 w-16 text-center border-r border-slate-300">Birth</th>
                      <th className="p-2 w-20 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {tournament.players.map((p, idx) => (
                      <tr key={p.id}>
                        <td className="p-2 text-center font-mono font-bold border-r border-slate-300 bg-slate-50">
                          {p.pairingNumber || p.id || (idx + 1)}
                        </td>
                        <td className="p-2 font-semibold border-r border-slate-300">{p.name}</td>
                        <td className="p-2 text-center font-mono font-bold text-amber-700 border-r border-slate-300">{p.title || '—'}</td>
                        <td className="p-2 text-center font-mono border-r border-slate-300">{p.fed}</td>
                        <td className="p-2 text-right font-mono font-semibold border-r border-slate-300">{p.rating}</td>
                        <td className="p-2 text-center font-mono text-[11px] text-slate-600 border-r border-slate-300">{p.fideId || '—'}</td>
                        <td className="p-2 text-center font-mono border-r border-slate-300">{p.gender?.toUpperCase() || 'M'}</td>
                        <td className="p-2 text-center font-mono border-r border-slate-300">{p.birth || '—'}</td>
                        <td className="p-2 text-center font-mono text-emerald-700">
                          {p.attendance === 'present' ? 'Confirmed' : p.attendance}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* 6. DOCUMENT: Match Result Slips (4 per sheet) */}
            {docType === 'result_slips' && (
              <div className="space-y-6">
                <div className="text-xs text-slate-500 border-b pb-2 mb-4 font-mono no-print">
                  Cut along dashed borders to hand individual match result slips to players at their boards.
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {currentBoards.map(b => {
                    const w = b.whiteKey ? playerByKey.get(b.whiteKey) : null;
                    const blk = b.blackKey ? playerByKey.get(b.blackKey) : null;

                    return (
                      <div key={b.board} className="border-2 border-dashed border-slate-400 p-4 rounded-lg space-y-3 bg-white text-xs break-inside-avoid">
                        <div className="flex justify-between items-center border-b pb-1.5">
                          <span className="font-bold text-[11px] uppercase tracking-wider text-slate-700">
                            {tournament.name?.slice(0, 20) || "Tournament"} &bull; Rd {selectedRound}
                          </span>
                          <span className="font-bold font-mono px-2 py-0.5 bg-slate-100 rounded border border-slate-300">
                            BOARD {b.board}
                          </span>
                        </div>

                        <div className="space-y-1 font-mono text-[11px]">
                          <div className="flex justify-between">
                            <span>⚪ <b>White:</b> {w?.title ? `${w.title} ` : ''}{w ? w.name : 'BYE'}</span>
                            <span className="text-slate-500">[{w?.rating || '—'}]</span>
                          </div>
                          <div className="flex justify-between">
                            <span>⚫ <b>Black:</b> {blk?.title ? `${blk.title} ` : ''}{blk ? blk.name : 'BYE'}</span>
                            <span className="text-slate-500">[{blk?.rating || '—'}]</span>
                          </div>
                        </div>

                        <div className="border border-slate-300 p-2 rounded bg-slate-50 flex items-center justify-around font-mono font-bold text-xs">
                          <span>[  ] 1 - 0</span>
                          <span>[  ] ½ - ½</span>
                          <span>[  ] 0 - 1</span>
                        </div>

                        <div className="grid grid-cols-2 gap-4 pt-2 text-[10px] text-slate-500 font-mono">
                          <div>
                            <span>White Signature:</span>
                            <div className="border-b border-slate-400 mt-4" />
                          </div>
                          <div>
                            <span>Black Signature:</span>
                            <div className="border-b border-slate-400 mt-4" />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 7. DOCUMENT: Progressive Cross-Table */}
            {docType === 'crosstable' && (
              <div className="space-y-4 text-xs">
                <div className="bg-slate-100 p-3 rounded-lg border border-slate-300 flex justify-between items-center">
                  <div>
                    <h2 className="font-bold text-sm text-slate-950 uppercase">
                      Progressive Cross-Table Matrix
                    </h2>
                    <p className="text-[11px] text-slate-600">
                      Opponent pairing & round progression overview
                    </p>
                  </div>
                  <span className="font-mono text-xs font-bold text-slate-700">
                    {announcedRounds} Rounds
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse border border-slate-300 font-mono">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-300 font-bold text-[11px]">
                        <th className="p-2 text-center w-10 border-r border-slate-300">Rk</th>
                        <th className="p-2 text-center w-10 border-r border-slate-300">SNo</th>
                        <th className="p-2 font-sans border-r border-slate-300">Player</th>
                        <th className="p-2 text-right w-14 border-r border-slate-300">Elo</th>
                        {Array.from({ length: announcedRounds }, (_, i) => (
                          <th key={i} className="p-2 text-center w-14 border-r border-slate-300">
                            R{i + 1}
                          </th>
                        ))}
                        <th className="p-2 text-right w-14 font-bold border-r border-slate-300 bg-slate-200/60">Pts</th>
                        <th className="p-2 text-right w-14 border-r border-slate-300">BH-1</th>
                        <th className="p-2 text-right w-14">SB</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-[11px]">
                      {players.map((p, idx) => {
                        const roundCells: { oppSno: string; color: string; score: string }[] = [];
                        for (let r = 1; r <= announcedRounds; r++) {
                          const boards = liveBoards[String(r)] || [];
                          const match = boards.find(b => b.whiteKey === p.key || b.blackKey === p.key);
                          if (!match) {
                            roundCells.push({ oppSno: '—', color: '', score: '' });
                          } else {
                            const isWhite = match.whiteKey === p.key;
                            const oppKey = isWhite ? match.blackKey : match.whiteKey;
                            const opp = oppKey ? playerByKey.get(oppKey) : null;
                            const oppSno = opp ? String(opp.id) : '0';
                            const colorLetter = isWhite ? 'w' : 'b';

                            let resScore = '0';
                            if (isWhite) {
                              if (match.result === '1 - 0' || match.result === '1F - 0F' || match.result === '1 BYE' || match.result === 'PAB') resScore = '1';
                              else if (match.result === '½ - ½' || match.result === '½ BYE') resScore = '½';
                            } else {
                              if (match.result === '0 - 1' || match.result === '0F - 1F' || match.result === '1 BYE' || match.result === 'PAB') resScore = '1';
                              else if (match.result === '½ - ½' || match.result === '½ BYE') resScore = '½';
                            }
                            roundCells.push({ oppSno, color: colorLetter, score: resScore });
                          }
                        }

                        return (
                          <tr key={p.id}>
                            <td className="p-2 text-center font-bold border-r border-slate-300">{idx + 1}</td>
                            <td className="p-2 text-center text-slate-500 border-r border-slate-300">{p.id}</td>
                            <td className="p-2 font-sans font-semibold border-r border-slate-300 truncate max-w-[160px]">{p.name}</td>
                            <td className="p-2 text-right border-r border-slate-300">{p.rating}</td>
                            {roundCells.map((rc, rIdx) => (
                              <td key={rIdx} className="p-1.5 text-center border-r border-slate-300">
                                {rc.oppSno === '—' ? '—' : (
                                  <span className="px-1 py-0.5 rounded bg-slate-100 border border-slate-200">
                                    {rc.oppSno}{rc.color} <b>{rc.score}</b>
                                  </span>
                                )}
                              </td>
                            ))}
                            <td className="p-2 text-right font-bold text-blue-700 border-r border-slate-300 bg-slate-100/60">
                              {p.score.toFixed(1)}
                            </td>
                            <td className="p-2 text-right text-slate-700 border-r border-slate-300">
                              {p.buchholzCut1?.toFixed(1) || '0.0'}
                            </td>
                            <td className="p-2 text-right text-slate-700">
                              {p.sonneborn?.toFixed(2) || '0.00'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Document Footer (Common) */}
            <div className="mt-8 pt-4 border-t border-slate-300 flex justify-between items-center text-[10px] text-slate-400 font-mono">
              <span>Official FIDE Tournament Protocol Engine &bull; Gacrux 1.9.57</span>
              <span>Page 1 / 1 &bull; FIDE Regulations C.04 Compliant</span>
            </div>

          </div>
        </div>

        {/* Modal Bottom Footer Actions */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between no-print text-xs">
          <span className="text-slate-500 font-mono">
            {tournament.name || "FIDE Tournament"} &bull; {tournament.players.length} players registered
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold shadow-sm flex items-center gap-1.5 transition"
            >
              <Printer className="w-4 h-4" />
              <span>Print Document</span>
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition"
            >
              Close
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
