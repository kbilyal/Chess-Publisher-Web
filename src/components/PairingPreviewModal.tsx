import React, { useState } from 'react';
import { 
  X, CheckCircle, AlertTriangle, AlertCircle, ShieldAlert, Cpu, 
  ArrowRight, Check, RotateCcw, Shield, ExternalLink 
} from 'lucide-react';
import { Tournament, BoardPairing, Player } from '../types';
import { PairingCheckResult, RoundEngineMetadata } from '../engine/adapters/types';
import { defaultTournamentRepository } from '../repositories/TournamentRepository';

interface PairingPreviewModalProps {
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
  tournament: Tournament;
  isOpen: boolean;
  onClose: () => void;
  onAcceptPairing: (committedTournament: Tournament) => void;
  onRegenerate: () => void;
}

export const PairingPreviewModal: React.FC<PairingPreviewModalProps> = ({
  round,
  previewBoards,
  engineMetadata,
  ruleLog = [],
  pabKey,
  tournament,
  isOpen,
  onClose,
  onAcceptPairing,
  onRegenerate
}) => {
  const [checkerResult, setCheckerResult] = useState<PairingCheckResult | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [bypassCheckerDev, setBypassCheckerDev] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [isCommitting, setIsCommitting] = useState(false);

  if (!isOpen) return null;

  const playerByKey = new Map<string, Player>(tournament.players.map(p => [p.localKey, p]));

  // Helper to inspect player history
  const getPlayerHistory = (playerKey: string) => {
    const opps: string[] = [];
    const colors: string[] = [];
    for (let r = 1; r < round; r++) {
      const rBoards = tournament.pairings.liveBoards[String(r)] || [];
      const b = rBoards.find(b => b.whiteKey === playerKey || b.blackKey === playerKey);
      if (b) {
        if (b.whiteKey === playerKey) {
          colors.push('W');
          opps.push(b.blackKey);
        } else {
          colors.push('B');
          opps.push(b.whiteKey);
        }
      }
    }
    return { opps, colors: colors.join(' ') };
  };

  // Run independent checker check via backend API
  const handleRunChecker = async () => {
    setIsChecking(true);
    setCommitError(null);
    try {
      const res = await fetch('/api/pairings/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tournament,
          proposedBoards: previewBoards,
          round
        })
      });

      if (res.ok) {
        const data: { checkResult?: PairingCheckResult } = await res.json();
        setCheckerResult(data.checkResult ?? null);
      } else {
        const errData: { message?: string } = await res.json().catch(() => ({} as { message?: string }));
        setCheckerResult({
          status: 'CHECKER_NOT_CONFIGURED',
          passed: false,
          checker: {
            id: 'bbp-independent-checker',
            name: 'BBP Independent Pairing Checker',
            version: '1.05.01',
            authoritative: true
          },
          round,
          timestamp: new Date().toISOString(),
          violations: [
            {
              code: 'CHECKER_NOT_CONFIGURED',
              severity: 'CRITICAL_FAIL',
              message: errData.message || 'Authoritative BBP independent pairing checker is not configured.'
            }
          ],
          warnings: [],
          diagnostics: {
            totalBoards: previewBoards.length,
            totalPlayers: tournament.players.length,
            colorAllocationIssues: 0,
            repeatOpponentIssues: 0,
            scoreGroupIssues: 0,
            floatIssues: 0,
            byeIssues: 0
          }
        });
      }
    } catch (err: any) {
      setCommitError(`Failed to contact checker service: ${err.message}`);
    } finally {
      setIsChecking(false);
    }
  };

  // Arbiter Accept Pairing: execute transaction
  const handleAcceptPairing = async () => {
    // Safety check: require PASS or explicit developer bypass
    const checkerPassed = checkerResult?.status === 'PASS';
    if (!checkerPassed && !bypassCheckerDev) {
      setCommitError('Acceptance blocked: Authoritative independent checker must return PASS before committing, or check the developer override.');
      return;
    }

    setIsCommitting(true);
    setCommitError(null);

    const roundMetadata: RoundEngineMetadata = {
      engine: engineMetadata,
      checker: {
        id: checkerResult?.checker.id || 'bbp-independent-checker',
        name: checkerResult?.checker.name || 'BBP Independent Pairing Checker',
        version: checkerResult?.checker.version || '1.05.01',
        status: checkerPassed ? 'PASS' : (bypassCheckerDev ? 'BYPASSED_DEV' : 'CHECKER_NOT_CONFIGURED')
      },
      generatedAt: new Date().toISOString(),
      acceptedAt: new Date().toISOString()
    };

    try {
      // Transactional commit with rollback safety
      const session = await defaultTournamentRepository.createRoundTransaction(
        round,
        tournament,
        previewBoards,
        roundMetadata
      );

      const updatedTournament = await session.commit();
      onAcceptPairing(updatedTournament);
      onClose();
    } catch (err: any) {
      setCommitError(`Transaction failed: ${err.message}. Changes have been rolled back.`);
    } finally {
      setIsCommitting(false);
    }
  };

  const isCheckerPass = checkerResult?.status === 'PASS';
  const canAccept = isCheckerPass || bypassCheckerDev;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-slate-900">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-100 text-blue-700 font-mono font-black text-sm">
              R{round}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900">Pairing Preview (Draft)</h2>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                  engineMetadata.authoritative
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : 'bg-amber-100 text-amber-900 border border-amber-300'
                }`}>
                  {engineMetadata.authoritative ? 'Authoritative Engine' : 'Prototype / Demonstration'}
                </span>
                <span className="px-2 py-0.5 rounded-md bg-slate-200 text-slate-700 text-xs font-mono">
                  Status: Draft Preview
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Engine: <span className="font-semibold text-slate-700">{engineMetadata.name}</span> ({engineMetadata.version}) • Generated boards: {previewBoards.length}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Warning Banner for Prototype Engine */}
        {!engineMetadata.authoritative && (
          <div className="bg-amber-50 border-b border-amber-200 px-5 py-2.5 flex items-start gap-3 text-amber-900 text-xs">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">PROTOTYPE ENGINE NOTICE:</span> This pairing was generated by the client-side prototype demonstration engine. It is NOT authoritative and must not be used for official FIDE tournaments.
            </div>
          </div>
        )}

        {/* Checker Status Bar */}
        <div className="px-5 py-3 bg-slate-100 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-slate-600" />
            <span className="font-semibold text-slate-700">Independent Checker:</span>
            {checkerResult ? (
              checkerResult.status === 'PASS' ? (
                <span className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md">
                  <CheckCircle className="w-3.5 h-3.5" /> PASS (Verified)
                </span>
              ) : checkerResult.status === 'CHECKER_NOT_CONFIGURED' ? (
                <span className="inline-flex items-center gap-1 font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md">
                  <AlertCircle className="w-3.5 h-3.5" /> CHECKER_NOT_CONFIGURED
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-md">
                  <AlertCircle className="w-3.5 h-3.5" /> FAIL ({checkerResult.violations.length} violations)
                </span>
              )
            ) : (
              <span className="text-slate-500 font-medium">Not checked yet</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRunChecker}
              disabled={isChecking}
              className="px-3 py-1 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-bold rounded-md shadow-2xs transition flex items-center gap-1.5"
            >
              <Cpu className={`w-3.5 h-3.5 text-blue-600 ${isChecking ? 'animate-spin' : ''}`} />
              <span>{isChecking ? 'Checking...' : 'Check Pairing'}</span>
            </button>

            <button
              onClick={onRegenerate}
              className="px-3 py-1 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-semibold rounded-md shadow-2xs transition flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
              <span>Generate Again</span>
            </button>
          </div>
        </div>

        {/* Checker Diagnostics or Violations if any */}
        {checkerResult && checkerResult.violations.length > 0 && (
          <div className="bg-rose-50 border-b border-rose-200 p-4 text-xs text-rose-900 space-y-1">
            <div className="font-bold flex items-center gap-1.5 text-rose-800">
              <ShieldAlert className="w-4 h-4 text-rose-600" />
              <span>Checker Diagnostics / Violations:</span>
            </div>
            <ul className="list-disc pl-5 space-y-1 mt-1 text-slate-700">
              {checkerResult.violations.map((v, i) => (
                <li key={i}>
                  <span className="font-semibold text-rose-700">[{v.code}]</span> {v.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Boards Table */}
        <div className="flex-1 overflow-y-auto p-5">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider bg-slate-50/75 sticky top-0 z-10">
                <th className="py-2.5 px-3 w-14">Board</th>
                <th className="py-2.5 px-3">White Player</th>
                <th className="py-2.5 px-3 w-20 text-center">Score</th>
                <th className="py-2.5 px-3 w-24 text-center">Colors</th>
                <th className="py-2.5 px-3 w-12 text-center">VS</th>
                <th className="py-2.5 px-3 w-24 text-center">Colors</th>
                <th className="py-2.5 px-3 w-20 text-center">Score</th>
                <th className="py-2.5 px-3">Black Player</th>
                <th className="py-2.5 px-3 w-28 text-center">Diagnostics</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {previewBoards.map((b) => {
                const white = playerByKey.get(b.whiteKey);
                const black = playerByKey.get(b.blackKey);
                const isBye = !b.blackKey || b.result.includes('BYE') || b.result === 'PAB';

                const wHistory = white ? getPlayerHistory(white.localKey) : null;
                const bHistory = black ? getPlayerHistory(black.localKey) : null;

                // Check repeat encounter
                const isRematch = white && black && wHistory && wHistory.opps.includes(black.localKey);

                return (
                  <tr 
                    key={b.board}
                    className={`hover:bg-slate-50/80 transition ${isRematch ? 'bg-rose-50/60' : ''}`}
                  >
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-700">
                      #{b.board}
                    </td>

                    {/* White Player */}
                    <td className="py-2.5 px-3">
                      {white ? (
                        <div>
                          <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                            {white.title && <span className="font-mono text-amber-600 font-bold">{white.title}</span>}
                            <span>{white.name}</span>
                            <span className="text-[10px] text-slate-400 font-mono">({white.fed})</span>
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono">
                            Rtg: {white.rating || 'Unrated'}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">Unassigned</span>
                      )}
                    </td>

                    <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-700">
                      {/* White Score placeholder */}
                      -
                    </td>

                    <td className="py-2.5 px-3 text-center font-mono text-[10px] text-slate-500">
                      {wHistory?.colors || '-'}
                    </td>

                    <td className="py-2.5 px-3 text-center font-bold text-slate-400">
                      vs
                    </td>

                    <td className="py-2.5 px-3 text-center font-mono text-[10px] text-slate-500">
                      {bHistory?.colors || '-'}
                    </td>

                    <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-700">
                      -
                    </td>

                    {/* Black Player */}
                    <td className="py-2.5 px-3">
                      {isBye ? (
                        <div className="text-amber-800 font-bold italic bg-amber-50 px-2 py-1 rounded inline-block">
                          {b.result === 'PAB' ? 'Pairing-Allocated Bye (1.0 Pt)' : b.result}
                        </div>
                      ) : black ? (
                        <div>
                          <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                            {black.title && <span className="font-mono text-amber-600 font-bold">{black.title}</span>}
                            <span>{black.name}</span>
                            <span className="text-[10px] text-slate-400 font-mono">({black.fed})</span>
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono">
                            Rtg: {black.rating || 'Unrated'}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">Unassigned</span>
                      )}
                    </td>

                    {/* Diagnostics */}
                    <td className="py-2.5 px-3 text-center">
                      {isRematch ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded">
                          <AlertTriangle className="w-3 h-3" /> REMATCH
                        </span>
                      ) : (
                        <span className="text-[11px] text-emerald-700 font-medium font-mono">
                          Clean
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer with Arbiter Controls */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
          {/* Dev Bypass Checkbox */}
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 cursor-pointer text-slate-600 select-none">
              <input
                type="checkbox"
                checked={bypassCheckerDev}
                onChange={e => setBypassCheckerDev(e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
              />
              <span className="font-mono text-[11px]">
                Allow unverified preview commit <span className="text-amber-700 font-bold">[DEV ONLY]</span>
              </span>
            </label>
            {commitError && (
              <span className="text-rose-600 font-semibold truncate max-w-sm">
                {commitError}
              </span>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2.5 justify-end">
            <button
              onClick={onClose}
              disabled={isCommitting}
              className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-200 font-semibold rounded-lg transition"
            >
              Reject (Discard Draft)
            </button>

            <button
              onClick={handleAcceptPairing}
              disabled={!canAccept || isCommitting}
              className={`px-5 py-2 rounded-lg font-bold flex items-center gap-2 text-white shadow-sm transition ${
                canAccept && !isCommitting
                  ? 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800'
                  : 'bg-slate-400 cursor-not-allowed opacity-60'
              }`}
              title={!canAccept ? "Accepting requires checker PASS or developer override" : "Commit round pairing to live tournament"}
            >
              <Check className="w-4 h-4" />
              <span>{isCommitting ? 'Committing...' : 'Accept Pairing (Commit)'}</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
