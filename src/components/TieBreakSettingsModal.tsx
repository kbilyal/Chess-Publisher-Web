import React, { useState } from 'react';
import { Tournament, TieBreakOptionConfig } from '../types';
import { Sliders, X, ShieldCheck, Lock, Info, BookOpen, AlertTriangle } from 'lucide-react';
import { getTieBreakCodeAndName } from '../engine/tiebreakChecker';
import { RuleDetailsModal } from './RuleDetailsModal';

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
  const { code, name } = getTieBreakCodeAndName(tieBreakName);
  const currentOptions: TieBreakOptionConfig = tournament.regulations?.tieBreakOptions?.[tieBreakName] || {};
  const rulesProfile = tournament.regulations?.tieBreakRuleSet || 'FIDE 2026';
  const isFideProfile = rulesProfile === 'FIDE 2026' || rulesProfile === 'FIDE_2026_03';

  const isBuchholz = code.startsWith('BH') || tieBreakName.toLowerCase().includes('buchholz');
  const isSonneborn = code.startsWith('SB') || tieBreakName.toLowerCase().includes('sonneborn');
  const isDirect = code === 'DE' || tieBreakName.toLowerCase().includes('direct encounter');
  const isAro = code.startsWith('ARO') || tieBreakName.toLowerCase().includes('aro') || tieBreakName.toLowerCase().includes('average rating');
  const isWins = code === 'WON' || code === 'WIN' || code === 'BWG' || code === 'BPG';

  // Local draft state for dialog (Apply/Cancel pattern)
  const [modifier, setModifier] = useState<string>(() => {
    if (code.includes('C1')) return 'Cut-1';
    if (code.includes('C2')) return 'Cut-2';
    if (code.includes('M1')) return 'Median-1';
    if (code.includes('M2')) return 'Median-2';
    return 'None';
  });

  const [deExcludeForfeits, setDeExcludeForfeits] = useState<boolean>(() => {
    return currentOptions.countForfeits !== true; // default exclude (true)
  });

  const [deTournamentOverride, setDeTournamentOverride] = useState<boolean>(false);
  const [showRuleDetails, setShowRuleDetails] = useState<boolean>(false);
  const [unratedFloor, setUnratedFloor] = useState<number>(currentOptions.unratedRating || 1400);
  const [countForfeitsForWins, setCountForfeitsForWins] = useState<boolean>(currentOptions.countForfeits ?? (code === 'WIN'));
  const [hasChangedDirectEncounter, setHasChangedDirectEncounter] = useState<boolean>(false);

  const handleApply = () => {
    onUpdateTournament(prev => {
      const existingOptions = { ...(prev.regulations?.tieBreakOptions || {}) };
      const updatedConfig: TieBreakOptionConfig = {
        ...(existingOptions[tieBreakName] || {}),
        unratedRating: unratedFloor,
        countForfeits: isDirect ? !deExcludeForfeits : countForfeitsForWins,
        validFrom2026: isFideProfile
      };

      existingOptions[tieBreakName] = updatedConfig;

      return {
        ...prev,
        regulations: {
          ...prev.regulations,
          tieBreakOptions: existingOptions
        }
      };
    });
    onClose();
  };

  return (
    <>
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 text-slate-800"
        onKeyDown={e => {
          if (e.key === 'Escape') onClose();
        }}
      >
        <div className="bg-white border border-slate-200 rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150 text-xs">
          {/* Header */}
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50 rounded-t-xl">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-800">
                <Sliders className="w-3.5 h-3.5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {name} Settings
                </h3>
                <p className="text-[11px] text-slate-500">
                  Criterion Code: <span className="font-mono font-semibold text-slate-700">{code}</span>
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

          {/* Dialog Body */}
          <div className="p-4 space-y-4 overflow-y-auto max-h-[68vh]">
            {/* General Section */}
            <div className="space-y-2.5 bg-slate-50 p-3 rounded-lg border border-slate-200">
              <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                General
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-slate-500 block text-[11px]">Tie-Break:</span>
                  <span className="font-semibold text-slate-900">{name}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Rules profile:</span>
                  <span className="font-semibold text-slate-900 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                    <span>{rulesProfile}</span>
                  </span>
                </div>
              </div>

              {/* Modifier Dropdown */}
              {(isBuchholz || isSonneborn) && (
                <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between gap-2">
                  <label className="text-slate-700 font-medium">Modifier:</label>
                  <select
                    value={modifier}
                    onChange={e => setModifier(e.target.value)}
                    disabled={isFideProfile}
                    className="px-2.5 py-1 bg-white border border-slate-300 rounded text-xs font-mono font-medium text-slate-900 disabled:bg-slate-100 disabled:text-slate-600"
                  >
                    <option value="None">None</option>
                    <option value="Cut-1">Cut-1 (Lowest)</option>
                    <option value="Cut-2">Cut-2 (Two Lowest)</option>
                    <option value="Median-1">Median-1 (High & Low)</option>
                    <option value="Median-2">Median-2 (Two High & Low)</option>
                  </select>
                </div>
              )}
            </div>

            {/* Buchholz & Sonneborn Unplayed Rounds Section */}
            {(isBuchholz || isSonneborn) && (
              <div className="space-y-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                    Unplayed rounds
                  </div>
                  {isFideProfile && (
                    <span className="text-[10px] text-slate-500 flex items-center gap-1 font-mono">
                      <Lock className="w-3 h-3 text-slate-400" />
                      <span>Controlled by {rulesProfile} profile</span>
                    </span>
                  )}
                </div>

                <div className="space-y-1.5 text-[11px]">
                  <div className="flex items-center justify-between py-1 border-b border-slate-200">
                    <span className="text-slate-600">Handling:</span>
                    <span className="font-semibold text-slate-800">FIDE Article 16</span>
                  </div>
                  <div className="flex items-center justify-between py-1 border-b border-slate-200">
                    <span className="text-slate-600">Dummy opponent:</span>
                    <span className="font-semibold text-slate-800">FIDE Article 16.4</span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-slate-600">VUR cut rule:</span>
                    <span className="font-semibold text-emerald-700 flex items-center gap-1">
                      <span>✓ FIDE Article 16.5</span>
                    </span>
                  </div>
                </div>

                <p className="text-[11px] text-slate-500 pt-1 leading-snug">
                  These settings are controlled by the selected FIDE rules profile to guarantee mathematical compliance with official ratings and tournament reports.
                </p>
              </div>
            )}

            {/* Direct Encounter Section (Section 8) */}
            {isDirect && (
              <div className="space-y-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                  Direct Encounter
                </div>

                <div className="space-y-2">
                  <span className="text-slate-700 font-medium block">Forfeit games:</span>
                  <div className="flex items-center gap-4 text-xs">
                    <label className="flex items-center gap-1.5 cursor-pointer font-medium text-slate-800">
                      <input
                        type="radio"
                        name="de_forfeit_mode"
                        checked={deExcludeForfeits}
                        disabled={isFideProfile && !deTournamentOverride}
                        onChange={() => {
                          setDeExcludeForfeits(true);
                          setHasChangedDirectEncounter(true);
                        }}
                        className="text-blue-600 focus:ring-0"
                      />
                      <span>Exclude</span>
                    </label>

                    <label className="flex items-center gap-1.5 cursor-pointer font-medium text-slate-800">
                      <input
                        type="radio"
                        name="de_forfeit_mode"
                        checked={!deExcludeForfeits}
                        disabled={isFideProfile && !deTournamentOverride}
                        onChange={() => {
                          setDeExcludeForfeits(false);
                          setHasChangedDirectEncounter(true);
                        }}
                        className="text-blue-600 focus:ring-0"
                      />
                      <span>Include</span>
                    </label>
                  </div>
                  <span className="text-[11px] text-slate-500 block">
                    Default: Exclude
                  </span>
                </div>

                <p className="text-[11px] text-slate-600 leading-snug">
                  Applicable forfeits are excluded under the FIDE default rule unless tournament regulations specify otherwise.
                </p>

                <div className="pt-2 border-t border-slate-200">
                  <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-800">
                    <input
                      type="checkbox"
                      checked={deTournamentOverride}
                      onChange={e => setDeTournamentOverride(e.target.checked)}
                      className="rounded text-blue-600 focus:ring-0"
                    />
                    <span>Tournament-specific override</span>
                  </label>
                </div>

                {hasChangedDirectEncounter && !deExcludeForfeits && (
                  <div className="p-2 rounded bg-amber-50 border border-amber-200 text-amber-800 text-[11px] flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                    <span>Warning: Including forfeits in Direct Encounter deviates from standard FIDE 2026 regulations.</span>
                  </div>
                )}
              </div>
            )}

            {/* ARO Section */}
            {isAro && (
              <div className="space-y-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                  Average Rating of Opponents
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-700">Unrated Opponent Substitute Floor:</span>
                  <input
                    type="number"
                    value={unratedFloor}
                    onChange={e => setUnratedFloor(parseInt(e.target.value, 10) || 1400)}
                    className="w-24 px-2 py-1 bg-white border border-slate-300 rounded font-mono text-slate-900"
                  />
                </div>
                <p className="text-[11px] text-slate-500">
                  Per official FIDE rating regulations, unrated opponents receive a substitute floor rating of 1400 when calculating ARO.
                </p>
              </div>
            )}

            {/* Wins Section */}
            {isWins && (
              <div className="space-y-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                  Forfeit Handling for Wins
                </div>
                <label className="flex items-center gap-2 cursor-pointer text-slate-800">
                  <input
                    type="checkbox"
                    checked={countForfeitsForWins}
                    onChange={e => setCountForfeitsForWins(e.target.checked)}
                    className="rounded text-blue-600 focus:ring-0"
                  />
                  <span>Count unplayed forfeit wins (1F) towards total</span>
                </label>
                <span className="text-[11px] text-slate-500 block">
                  WON counts only over-the-board games; WIN counts all victories including forfeits.
                </span>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2.5 border-t border-slate-200 bg-slate-50 rounded-b-xl flex items-center justify-between">
            <button
              onClick={() => setShowRuleDetails(true)}
              className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded text-xs font-medium flex items-center gap-1.5 transition"
            >
              <BookOpen className="w-3.5 h-3.5 text-blue-600" />
              <span>View Rule Details</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded text-xs font-medium transition"
              >
                Cancel
              </button>
              <button
                onClick={handleApply}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold shadow-sm transition"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      </div>

      {showRuleDetails && (
        <RuleDetailsModal
          tieBreakName={tieBreakName}
          isOpen={showRuleDetails}
          onClose={() => setShowRuleDetails(false)}
        />
      )}
    </>
  );
};
