import React from 'react';
import { Tournament } from '../types';
import { Sliders, X, ShieldCheck, Check } from 'lucide-react';

interface TieBreakSettingsModalProps {
  tournament: Tournament;
  tieBreakName: string;
  onClose: () => void;
  onUpdateTournament: (updater: (prev: Tournament) => Tournament) => void;
}

export const TieBreakSettingsModal: React.FC<TieBreakSettingsModalProps> = ({
  tournament,
  tieBreakName,
  onClose,
  onUpdateTournament
}) => {
  const isBuchholz = tieBreakName.toLowerCase().includes('buchholz');
  const isAro = tieBreakName.toLowerCase().includes('average') || tieBreakName.toLowerCase().includes('aro');
  const isDirect = tieBreakName.toLowerCase().includes('direct encounter');
  const isSonneborn = tieBreakName.toLowerCase().includes('sonneborn');

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-xl shadow-2xl w-full max-w-lg p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150 text-xs text-slate-800">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-amber-500" />
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Configure Criterion: {tieBreakName}
              </h3>
              <p className="text-[11px] text-slate-500">
                FIDE 2026 Regulations C.04 Parameters & Overrides
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Options based on criterion */}
        <div className="space-y-3 bg-slate-50 p-3.5 rounded-lg border border-slate-200">
          {isBuchholz && (
            <div className="space-y-2">
              <div className="font-semibold text-slate-900">FIDE 2026 Article 16.5.1 Voluntary Unplayed Rounds (VUR):</div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                As of July 1, 2026, FIDE mandates that all unplayed rounds (PAB, ½ BYE, 0 BYE, Forfeits) use an adjusted dummy opponent score equal to: <code className="text-blue-700 font-bold">Player Score + (1 - Round Fraction)</code>. This ensures pairing bye luck does not inflate or deflate tie-breaks.
              </p>
              <div className="pt-1 text-emerald-700 flex items-center gap-1.5 font-bold">
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span>Strict FIDE 2026 VUR Handling: ACTIVE</span>
              </div>
            </div>
          )}

          {isAro && (
            <div className="space-y-2">
              <div className="font-semibold text-slate-900">Unrated Opponent Substitute Rating:</div>
              <p className="text-[11px] text-slate-600">
                Per FIDE 2026 rating guidelines, unrated opponents receive a substitute rating of 1400 (or tournament floor) when computing ARO.
              </p>
              <div className="flex items-center gap-2 pt-1">
                <span className="text-slate-700 font-medium">Substitute Floor:</span>
                <input
                  type="number"
                  defaultValue="1400"
                  className="px-2 py-1 bg-white border border-slate-300 rounded text-slate-900 font-mono w-24 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          )}

          {isDirect && (
            <div className="space-y-2">
              <div className="font-semibold text-slate-900">Direct Encounter Mini-Table Strategy:</div>
              <p className="text-[11px] text-slate-600">
                Direct encounter applies strictly when all tied competitors have played each other. In multi-player ties where not all games were played, the engine safely defers to the next criterion in the priority chain.
              </p>
            </div>
          )}

          {isSonneborn && (
            <div className="space-y-2">
              <div className="font-semibold text-slate-900">Sonneborn-Berger FIDE 2026 Weighting:</div>
              <p className="text-[11px] text-slate-600">
                Wins receive 100% of opponent adjusted score; draws receive 50%. Unplayed wins receive 50% of the calculated dummy score.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold shadow-sm transition"
          >
            Apply & Close
          </button>
        </div>
      </div>
    </div>
  );
};
