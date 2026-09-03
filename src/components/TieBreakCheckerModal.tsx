import React, { useState } from 'react';
import { Tournament } from '../types';
import {
  TieBreakIntegrityReport,
  TieBreakDiagnosticIssue,
  runTieBreakIntegrityCheck
} from '../engine/tiebreakChecker';
import {
  X,
  ShieldCheck,
  AlertTriangle,
  AlertOctagon,
  CheckCircle2,
  Copy,
  RefreshCw,
  Info,
  Check,
  ExternalLink
} from 'lucide-react';
import { PlayerTieBreakDetailsModal } from './PlayerTieBreakDetailsModal';

interface TieBreakCheckerModalProps {
  tournament: Tournament;
  isOpen: boolean;
  onClose: () => void;
  onOpenPlayerDetails?: (playerId: number, tieBreakName?: string) => void;
}

export const TieBreakCheckerModal: React.FC<TieBreakCheckerModalProps> = ({
  tournament,
  isOpen,
  onClose,
  onOpenPlayerDetails
}) => {
  const [report, setReport] = useState<TieBreakIntegrityReport>(() =>
    runTieBreakIntegrityCheck(tournament)
  );
  const [copied, setCopied] = useState(false);
  const [selectedIssuePlayer, setSelectedIssuePlayer] = useState<{ id: number; tieBreak?: string } | null>(null);

  if (!isOpen) return null;

  const handleRunAgain = () => {
    const updated = runTieBreakIntegrityCheck(tournament);
    setReport(updated);
  };

  const handleCopyReport = () => {
    const lines = [
      '==================================================',
      'Chess-Publisher — Tie-Break Integrity Report',
      '==================================================',
      `Timestamp: ${report.timestamp}`,
      `Rules Profile: ${report.summary.rulesProfile}`,
      `Players Checked: ${report.summary.playersChecked}`,
      `Tie-Breaks Checked: ${report.summary.tieBreaksChecked}`,
      `Unplayed Rounds: ${report.summary.unplayedRounds}`,
      `Forfeits: ${report.summary.forfeits}`,
      `Status: ${report.status}`,
      '',
      '--- DIAGNOSTIC CHECKS ---'
    ];

    for (const c of report.checks) {
      const sym = c.status === 'PASS' ? '[PASS]' : c.status === 'WARNING' ? '[WARN]' : '[FAIL]';
      lines.push(`${sym} ${c.name}: ${c.message}`);
    }

    if (report.issues.length > 0) {
      lines.push('', '--- ISSUES AND WARNINGS ---');
      for (const iss of report.issues) {
        lines.push(
          `[${iss.severity}] Player: ${iss.player || 'General'} | Rnd: ${iss.round ?? '-'} | TB: ${iss.tieBreak || '-'} | Article: ${iss.fideArticle || '-'}`
        );
        lines.push(`  -> ${iss.issue}`);
      }
    } else {
      lines.push('', 'No violations or mathematical discrepancies found.');
    }

    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleRowClick = (issue: TieBreakDiagnosticIssue) => {
    if (issue.playerId) {
      if (onOpenPlayerDetails) {
        onOpenPlayerDetails(issue.playerId, issue.tieBreak);
      } else {
        setSelectedIssuePlayer({ id: issue.playerId, tieBreak: issue.tieBreak });
      }
    }
  };

  const statusBg =
    report.status === 'PASS'
      ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
      : report.status === 'WARNING'
      ? 'bg-amber-50 border-amber-300 text-amber-900'
      : 'bg-rose-50 border-rose-300 text-rose-900';

  return (
    <>
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 text-slate-800"
        onKeyDown={e => {
          if (e.key === 'Escape') onClose();
        }}
      >
        <div className="bg-white border border-slate-200 rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[88vh] animate-in fade-in zoom-in-95 duration-150 text-xs">
          {/* Header */}
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50 rounded-t-xl">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-blue-100 border border-blue-300 flex items-center justify-center text-blue-700">
                <ShieldCheck className="w-3.5 h-3.5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Tie-Break Integrity Checker
                </h3>
                <p className="text-[11px] text-slate-500">
                  Authoritative FIDE 2026 Audit & Diagnostic Engine
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition"
              title="Close (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="p-4 space-y-3.5 overflow-y-auto max-h-[72vh]">
            {/* Status & Summary Stats Bar */}
            <div className={`p-3 rounded-lg border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 ${statusBg}`}>
              <div className="flex items-center gap-2">
                {report.status === 'PASS' ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                ) : report.status === 'WARNING' ? (
                  <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
                ) : (
                  <AlertOctagon className="w-5 h-5 text-rose-600 flex-shrink-0" />
                )}
                <div>
                  <div className="font-bold text-sm tracking-tight flex items-center gap-1.5">
                    <span>Status:</span>
                    <span>
                      {report.status === 'PASS'
                        ? '✓ PASS'
                        : report.status === 'WARNING'
                        ? `⚠ ${report.issues.filter(i => i.severity === 'WARNING').length} Warning(s)`
                        : `✕ ${report.issues.filter(i => i.severity === 'ERROR').length} Error(s)`}
                    </span>
                  </div>
                  <div className="text-[11px] opacity-80">
                    All calculations verified against FIDE Regulations Effective 1 March 2026
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 font-mono text-[11px] divide-x divide-slate-300">
                <div className="text-right">
                  <span className="block text-[9px] uppercase tracking-wider text-slate-500">Players</span>
                  <span className="font-bold">{report.summary.playersChecked}</span>
                </div>
                <div className="pl-3 text-right">
                  <span className="block text-[9px] uppercase tracking-wider text-slate-500">Tie-Breaks</span>
                  <span className="font-bold">{report.summary.tieBreaksChecked}</span>
                </div>
                <div className="pl-3 text-right">
                  <span className="block text-[9px] uppercase tracking-wider text-slate-500">Unplayed</span>
                  <span className="font-bold">{report.summary.unplayedRounds}</span>
                </div>
                <div className="pl-3 text-right">
                  <span className="block text-[9px] uppercase tracking-wider text-slate-500">Forfeits</span>
                  <span className="font-bold">{report.summary.forfeits}</span>
                </div>
              </div>
            </div>

            {/* Checks List */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                Integrity Invariants & Diagnostics
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {report.checks.map(chk => (
                  <div
                    key={chk.id}
                    className="px-2.5 py-1.5 rounded border border-slate-200 bg-slate-50/70 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      {chk.status === 'PASS' ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                      ) : chk.status === 'WARNING' ? (
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                      ) : (
                        <AlertOctagon className="w-3.5 h-3.5 text-rose-600 flex-shrink-0" />
                      )}
                      <span className="font-medium text-slate-800">{chk.name}</span>
                    </div>
                    <span
                      className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded ${
                        chk.status === 'PASS'
                          ? 'text-emerald-700 bg-emerald-50'
                          : chk.status === 'WARNING'
                          ? 'text-amber-800 bg-amber-50'
                          : 'text-rose-700 bg-rose-50'
                      }`}
                    >
                      {chk.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Issues Table (If any exist) */}
            {report.issues.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                    Discrepancies & Warnings ({report.issues.length})
                  </div>
                  <span className="text-[10px] text-slate-400">
                    Double-click row to inspect player tie-break breakdown
                  </span>
                </div>

                <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
                  <table className="w-full text-left text-[11px]">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium">
                      <tr>
                        <th className="py-1.5 px-2 w-16">Severity</th>
                        <th className="py-1.5 px-2">Player</th>
                        <th className="py-1.5 px-2 w-12 text-center">Rnd</th>
                        <th className="py-1.5 px-2 w-28">Tie-Break</th>
                        <th className="py-1.5 px-2">Issue Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-normal">
                      {report.issues.map(iss => (
                        <tr
                          key={iss.id}
                          onDoubleClick={() => handleRowClick(iss)}
                          className="hover:bg-slate-50 cursor-pointer transition"
                        >
                          <td className="py-1 px-2">
                            <span
                              className={`px-1.5 py-0.2 rounded font-mono font-bold text-[10px] ${
                                iss.severity === 'ERROR'
                                  ? 'bg-rose-100 text-rose-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {iss.severity}
                            </span>
                          </td>
                          <td className="py-1 px-2 font-medium text-slate-900">
                            {iss.player || '-'}
                          </td>
                          <td className="py-1 px-2 text-center font-mono">
                            {iss.round ?? '-'}
                          </td>
                          <td className="py-1 px-2 text-slate-700 font-mono text-[10px]">
                            {iss.tieBreak || '-'}
                          </td>
                          <td className="py-1 px-2 text-slate-600">
                            {iss.issue}
                            {iss.fideArticle && (
                              <span className="ml-1 text-[10px] font-mono text-slate-400">
                                ({iss.fideArticle})
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2.5 border-t border-slate-200 bg-slate-50 rounded-b-xl flex items-center justify-between">
            <button
              onClick={handleCopyReport}
              className="px-2.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded text-xs font-medium flex items-center gap-1.5 transition"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700">Report Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-500" />
                  <span>Copy Report</span>
                </>
              )}
            </button>

            <div className="flex items-center gap-2">
              <button
                onClick={handleRunAgain}
                className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded text-xs font-medium flex items-center gap-1.5 transition"
              >
                <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
                <span>Run Again</span>
              </button>
              <button
                onClick={onClose}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold shadow-sm transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>

      {selectedIssuePlayer && (
        <PlayerTieBreakDetailsModal
          tournament={tournament}
          playerId={selectedIssuePlayer.id}
          initialTieBreakName={selectedIssuePlayer.tieBreak}
          isOpen={!!selectedIssuePlayer}
          onClose={() => setSelectedIssuePlayer(null)}
        />
      )}
    </>
  );
};
