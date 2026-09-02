import React, { useState } from 'react';
import { Tournament, Player } from '../types';
import { buildTRFText, parseTRF } from '../engine/trfParser';
import { 
  generatePgnText, 
  generateStandingsCsv, 
  generatePlayersCsv, 
  generatePairingsCsv, 
  generateCrossTableCsv, 
  generateHtmlReport, 
  downloadFile 
} from '../engine/exportFormats';
import { PrintDocType } from './PrintDocumentModal';
import { TrfImportModal } from './TrfImportModal';
import { 
  FileText, Download, Copy, Upload, CheckCircle2, 
  AlertTriangle, ShieldCheck, Check, Sparkles, Printer,
  FileSpreadsheet, Globe, Database, Award, Users, LayoutGrid,
  Layers, CheckSquare, Calendar, ChevronRight
} from 'lucide-react';

interface ExportTrfTabProps {
  tournament: Tournament;
  onImportTournament: (imported: Tournament) => void;
  onOpenPrintModal: (docType: PrintDocType, roundNum?: number) => void;
}

export const ExportTrfTab: React.FC<ExportTrfTabProps> = ({
  tournament,
  onImportTournament,
  onOpenPrintModal
}) => {
  const [trfVersion, setTrfVersion] = useState<16 | 26>(26);
  const [copiedPgn, setCopiedPgn] = useState(false);
  const [copiedTrf, setCopiedTrf] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [pendingTrfText, setPendingTrfText] = useState<string | null>(null);
  const [showTrfImportModal, setShowTrfImportModal] = useState(false);

  const validation = buildTRFText(tournament, trfVersion);
  const trfText = validation.text;
  const safeName = (tournament.name || 'tournament').replace(/[^a-z0-9_-]/gi, '_').toLowerCase();

  const liveBoards = tournament.pairings.liveBoards || {};
  const generatedRounds = Object.keys(liveBoards).map(Number).filter(n => n > 0).sort((a, b) => a - b);
  const currentRound = generatedRounds.length > 0 ? generatedRounds[generatedRounds.length - 1] : 1;

  // --- Handlers for Downloads & Copies ---
  const handleDownloadTrf = () => {
    downloadFile(trfText, `${safeName}_trf${trfVersion}.trf`, 'text/plain;charset=utf-8');
  };

  const handleCopyTrf = () => {
    navigator.clipboard.writeText(trfText);
    setCopiedTrf(true);
    setTimeout(() => setCopiedTrf(false), 2000);
  };

  const handleDownloadPgn = () => {
    const pgn = generatePgnText(tournament);
    downloadFile(pgn, `${safeName}_games.pgn`, 'application/x-chess-pgn;charset=utf-8');
  };

  const handleCopyPgn = () => {
    const pgn = generatePgnText(tournament);
    navigator.clipboard.writeText(pgn);
    setCopiedPgn(true);
    setTimeout(() => setCopiedPgn(false), 2000);
  };

  const handleDownloadStandingsCsv = () => {
    const csv = generateStandingsCsv(tournament);
    downloadFile(csv, `${safeName}_standings.csv`, 'text/csv;charset=utf-8');
  };

  const handleDownloadPlayersCsv = () => {
    const csv = generatePlayersCsv(tournament);
    downloadFile(csv, `${safeName}_players_roster.csv`, 'text/csv;charset=utf-8');
  };

  const handleDownloadPairingsCsv = () => {
    const csv = generatePairingsCsv(tournament);
    downloadFile(csv, `${safeName}_all_pairings.csv`, 'text/csv;charset=utf-8');
  };

  const handleDownloadCrossTableCsv = () => {
    const csv = generateCrossTableCsv(tournament);
    downloadFile(csv, `${safeName}_crosstable.csv`, 'text/csv;charset=utf-8');
  };

  const handleDownloadHtml = () => {
    const html = generateHtmlReport(tournament);
    downloadFile(html, `${safeName}_report.html`, 'text/html;charset=utf-8');
  };

  const handleDownloadJsonBackup = () => {
    const json = JSON.stringify(tournament, null, 2);
    downloadFile(json, `${safeName}_backup.json`, 'application/json;charset=utf-8');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportError(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        if (!text || text.trim().length === 0) {
          throw new Error("TRF file is empty.");
        }
        setPendingTrfText(text);
        setShowTrfImportModal(true);
      } catch (err: any) {
        setImportError(err.message || "Failed to read TRF file");
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6 animate-in fade-in duration-200 text-slate-800">
      
      {/* 1. Official Printable Documents & Protocols Section */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
              <Printer className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Official Tournament Printouts & Match Protocols
              </h2>
              <p className="text-xs text-slate-500">
                Print-ready official bulletins, table nameplates, scoresheets, and arbiter protocols.
              </p>
            </div>
          </div>

          <button
            onClick={() => onOpenPrintModal('pairings', currentRound)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm flex items-center gap-1.5 transition self-start sm:self-auto"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Open Full Print Center</span>
          </button>
        </div>

        {/* 6 Quick-Print Action Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {/* A: Pairings Bulletin */}
          <div 
            onClick={() => onOpenPrintModal('pairings', currentRound)}
            className="p-3.5 rounded-xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50/40 cursor-pointer transition flex items-start justify-between group shadow-2xs"
          >
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                <LayoutGrid className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-900 group-hover:text-blue-700 transition">
                  Round Pairings Bulletin
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Official pairings table for the playing hall notice board.
                </p>
              </div>
            </div>
            <Printer className="w-4 h-4 text-slate-400 group-hover:text-blue-600 flex-shrink-0 transition" />
          </div>

          {/* B: Table Nameplates / Cards */}
          <div 
            onClick={() => onOpenPrintModal('board_cards', currentRound)}
            className="p-3.5 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40 cursor-pointer transition flex items-start justify-between group shadow-2xs"
          >
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-900 group-hover:text-indigo-700 transition">
                  Table Cards / Nameplates
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Foldable board cards with player names, ratings & signatures.
                </p>
              </div>
            </div>
            <Printer className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 flex-shrink-0 transition" />
          </div>

          {/* C: Round Results Protocol */}
          <div 
            onClick={() => onOpenPrintModal('round_protocol', currentRound)}
            className="p-3.5 rounded-xl border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/40 cursor-pointer transition flex items-start justify-between group shadow-2xs"
          >
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                <CheckSquare className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-900 group-hover:text-emerald-700 transition">
                  Round Results Protocol
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Official signed protocol for round games and forfeit records.
                </p>
              </div>
            </div>
            <Printer className="w-4 h-4 text-slate-400 group-hover:text-emerald-600 flex-shrink-0 transition" />
          </div>

          {/* D: Official Standings */}
          <div 
            onClick={() => onOpenPrintModal('standings')}
            className="p-3.5 rounded-xl border border-slate-200 hover:border-amber-300 hover:bg-amber-50/40 cursor-pointer transition flex items-start justify-between group shadow-2xs"
          >
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Award className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-900 group-hover:text-amber-700 transition">
                  Official Standings & Tie-Breaks
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Final / intermediate rankings with FIDE 2026 tie-break breakdown.
                </p>
              </div>
            </div>
            <Printer className="w-4 h-4 text-slate-400 group-hover:text-amber-600 flex-shrink-0 transition" />
          </div>

          {/* E: Match Result Slips */}
          <div 
            onClick={() => onOpenPrintModal('result_slips', currentRound)}
            className="p-3.5 rounded-xl border border-slate-200 hover:border-violet-300 hover:bg-violet-50/40 cursor-pointer transition flex items-start justify-between group shadow-2xs"
          >
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-violet-100 text-violet-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                <FileText className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-900 group-hover:text-violet-700 transition">
                  Match Result Slips (4 / page)
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Printable score slips for players to sign & submit to arbiter table.
                </p>
              </div>
            </div>
            <Printer className="w-4 h-4 text-slate-400 group-hover:text-violet-600 flex-shrink-0 transition" />
          </div>

          {/* F: Starting Rank List */}
          <div 
            onClick={() => onOpenPrintModal('starting_list')}
            className="p-3.5 rounded-xl border border-slate-200 hover:border-slate-400 hover:bg-slate-50 cursor-pointer transition flex items-start justify-between group shadow-2xs"
          >
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Users className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-900 group-hover:text-slate-800 transition">
                  Starting Rank List Bulletin
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Alphabetical / rating seeded player roster with FIDE IDs.
                </p>
              </div>
            </div>
            <Printer className="w-4 h-4 text-slate-400 group-hover:text-slate-700 flex-shrink-0 transition" />
          </div>
        </div>
      </section>

      {/* 2. Full Suite of File Exports (PGN, TRF, CSV, HTML, JSON) */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
        <div className="border-b border-slate-100 pb-3">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Download className="w-4 h-4 text-blue-600" />
            Tournament Data Exports & Reports
          </h2>
          <p className="text-xs text-slate-500">
            Export tournament games, player rosters, and cross-tables into universal chess formats.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          
          {/* Card 1: PGN Games Archive */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3 flex flex-col justify-between">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <div className="font-bold text-slate-900 flex items-center gap-2">
                  <span className="w-6 h-6 rounded bg-amber-100 text-amber-800 flex items-center justify-center font-mono font-bold text-[11px]">
                    PGN
                  </span>
                  <span>PGN Tournament Games</span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                  ChessBase & Lichess Ready
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Exports all played and scheduled tournament games with standard PGN tags (Event, Site, Date, Round, Elo, Result).
              </p>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-slate-200">
              <button
                onClick={handleDownloadPgn}
                className="flex-1 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-semibold flex items-center justify-center gap-1.5 transition shadow-2xs"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download .pgn</span>
              </button>
              <button
                onClick={handleCopyPgn}
                className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg font-medium flex items-center gap-1 transition"
                title="Copy PGN to clipboard"
              >
                {copiedPgn ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedPgn ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>
          </div>

          {/* Card 2: FIDE TRF Standard Report (TRF16 / TRF26) */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3 flex flex-col justify-between">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <div className="font-bold text-slate-900 flex items-center gap-2">
                  <span className="w-6 h-6 rounded bg-blue-100 text-blue-800 flex items-center justify-center font-mono font-bold text-[11px]">
                    TRF
                  </span>
                  <span>FIDE Tournament Report File</span>
                </div>

                {/* TRF Version Selector */}
                <div className="flex items-center gap-1 bg-white p-0.5 border border-slate-300 rounded-md text-[10px] font-semibold">
                  <button
                    onClick={() => setTrfVersion(26)}
                    className={`px-2 py-0.5 rounded transition ${trfVersion === 26 ? 'bg-blue-600 text-white' : 'text-slate-600'}`}
                  >
                    TRF26
                  </button>
                  <button
                    onClick={() => setTrfVersion(16)}
                    className={`px-2 py-0.5 rounded transition ${trfVersion === 16 ? 'bg-blue-600 text-white' : 'text-slate-600'}`}
                  >
                    TRF16
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-slate-500">
                Official FIDE rating report format with column width verification for server submission.
              </p>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-slate-200">
              <button
                onClick={handleDownloadTrf}
                className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold flex items-center justify-center gap-1.5 transition shadow-2xs"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download .trf (TRF{trfVersion})</span>
              </button>
              <button
                onClick={handleCopyTrf}
                className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg font-medium flex items-center gap-1 transition"
                title="Copy TRF text"
              >
                {copiedTrf ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedTrf ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>
          </div>

          {/* Card 3: CSV / Excel Spreadsheets */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3 flex flex-col justify-between">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <div className="font-bold text-slate-900 flex items-center gap-2">
                  <span className="w-6 h-6 rounded bg-emerald-100 text-emerald-800 flex items-center justify-center font-mono font-bold text-[11px]">
                    CSV
                  </span>
                  <span>Excel / CSV Data Tables</span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                  Comma-Separated
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Download individual tournament components in format compatible with Excel and Google Sheets.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-slate-200">
              <button
                onClick={handleDownloadStandingsCsv}
                className="py-1.5 px-2 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded-lg font-semibold flex items-center justify-center gap-1 transition text-[11px]"
              >
                <FileSpreadsheet className="w-3 h-3 text-emerald-600" />
                <span>Standings CSV</span>
              </button>
              <button
                onClick={handleDownloadPairingsCsv}
                className="py-1.5 px-2 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded-lg font-semibold flex items-center justify-center gap-1 transition text-[11px]"
              >
                <FileSpreadsheet className="w-3 h-3 text-emerald-600" />
                <span>Pairings CSV</span>
              </button>
              <button
                onClick={handleDownloadPlayersCsv}
                className="py-1.5 px-2 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded-lg font-semibold flex items-center justify-center gap-1 transition text-[11px]"
              >
                <FileSpreadsheet className="w-3 h-3 text-emerald-600" />
                <span>Roster CSV</span>
              </button>
              <button
                onClick={handleDownloadCrossTableCsv}
                className="py-1.5 px-2 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded-lg font-semibold flex items-center justify-center gap-1 transition text-[11px]"
              >
                <FileSpreadsheet className="w-3 h-3 text-emerald-600" />
                <span>Cross-Table CSV</span>
              </button>
            </div>
          </div>

          {/* Card 4: Web HTML & Portable JSON Backup */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3 flex flex-col justify-between">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <div className="font-bold text-slate-900 flex items-center gap-2">
                  <span className="w-6 h-6 rounded bg-indigo-100 text-indigo-800 flex items-center justify-center font-mono font-bold text-[11px]">
                    WEB
                  </span>
                  <span>HTML Report & JSON Backup</span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200">
                  Self-Contained
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Standalone HTML page for publishing to club websites or JSON full snapshot for database archival.
              </p>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-slate-200">
              <button
                onClick={handleDownloadHtml}
                className="flex-1 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg font-semibold flex items-center justify-center gap-1.5 transition text-xs"
              >
                <Globe className="w-3.5 h-3.5 text-indigo-600" />
                <span>Download HTML Report</span>
              </button>
              <button
                onClick={handleDownloadJsonBackup}
                className="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold flex items-center justify-center gap-1.5 transition text-xs shadow-2xs"
              >
                <Database className="w-3.5 h-3.5" />
                <span>Portable Backup (.json)</span>
              </button>
            </div>
          </div>

        </div>
      </section>

      {/* 3. External Tournament File Import (TRF16 / TRF26) */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
        <div className="border-b border-slate-100 pb-3">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Upload className="w-4 h-4 text-blue-600" />
            Import External TRF16 / TRF26 Tournament File
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Load an existing tournament report file from Swiss-Manager, Tournament Director, or FIDE rating server.
          </p>
        </div>

        {importError && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs">
            <b>Import Error:</b> {importError}
          </div>
        )}

        <div className="p-6 border-2 border-dashed border-slate-300 hover:border-slate-400 rounded-xl bg-slate-50 flex flex-col items-center justify-center text-center space-y-2">
          <Upload className="w-7 h-7 text-slate-400" />
          <div className="text-xs text-slate-700">
            <label className="text-blue-600 hover:underline font-semibold cursor-pointer">
              <span>Click to browse and upload a .trf file</span>
              <input
                type="file"
                accept=".trf,.txt"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
            <p className="text-slate-500 text-[11px] mt-0.5">
              Supports standard TRF16, TRF26, and Chess-Results exports
            </p>
          </div>
        </div>
      </section>

      {/* Transactional TRF Import Preflight Modal */}
      {showTrfImportModal && pendingTrfText && (
        <TrfImportModal
          isOpen={showTrfImportModal}
          onClose={() => {
            setShowTrfImportModal(false);
            setPendingTrfText(null);
          }}
          currentTournament={tournament}
          trfContent={pendingTrfText}
          onCommit={(importedTournament) => {
            onImportTournament(importedTournament);
            setShowTrfImportModal(false);
            setPendingTrfText(null);
          }}
        />
      )}

    </div>
  );
};
