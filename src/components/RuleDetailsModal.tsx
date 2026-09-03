import React from 'react';
import { X, BookOpen, ExternalLink, ShieldCheck } from 'lucide-react';
import { getTieBreakCodeAndName } from '../engine/tiebreakChecker';

interface RuleDetailsModalProps {
  tieBreakName: string;
  isOpen: boolean;
  onClose: () => void;
}

interface RuleContent {
  title: string;
  articles: string[];
  operationalSummary: string;
  fide2026Specifics: string[];
}

function getRuleInformation(rawName: string): RuleContent {
  const { code } = getTieBreakCodeAndName(rawName);
  const lower = rawName.toLowerCase();

  if (code.startsWith('BH') || lower.includes('buchholz')) {
    const isCut1 = code === 'BH-C1' || lower.includes('cut-1') || lower.includes('cut 1');
    const isCut2 = code === 'BH-C2' || lower.includes('cut-2') || lower.includes('cut 2');
    const isMedian = code.startsWith('BH-M') || lower.includes('median');

    return {
      title: isCut1 ? 'Buchholz Cut 1 (BH-C1)' : isCut2 ? 'Buchholz Cut 2 (BH-C2)' : isMedian ? 'Median Buchholz' : 'Buchholz (BH)',
      articles: [
        'Article 8 — Buchholz System',
        'Article 14 — Modifiers (Cut and Median)',
        'Article 16 — Handling of Unplayed Rounds (Effective 1 March 2026)'
      ],
      operationalSummary:
        'The Buchholz system evaluates the strength of a player\'s opposition by summing the scores of their scheduled opponents. Under the FIDE 2026 regulations, unplayed rounds no longer use the legacy virtual opponent formula; instead, they use precise dummy opponent scores capped by the participant\'s final score.',
      fide2026Specifics: [
        'Unplayed Rounds (Art. 16.4): Byes use min(Player Score, Draw Points × Total Rounds). Forfeits use min(Player Score, Opponent Adjusted Score).',
        'Adjusted Opponent Scores (Art. 16.3): Opponents with round 16.2.5 (final bye or withdrawal) are evaluated as draws (0.5 pts) for your tie-break.',
        isCut1
          ? 'Article 16.5.1 Cut-1 Exception: If the player has one or more Voluntary Unplayed Rounds (VUR), the cut discards the lowest contribution from a VUR, provided it is not lower than the normal lowest score.'
          : 'Modifiers (Art. 14): Discards lowest / highest scores from the evaluated rounds.'
      ]
    };
  }

  if (code.startsWith('SB') || lower.includes('sonneborn')) {
    const isCut1 = code === 'SB-C1' || lower.includes('cut-1');
    return {
      title: isCut1 ? 'Sonneborn-Berger Cut 1 (SB-C1)' : 'Sonneborn-Berger (SB)',
      articles: [
        'Article 14 — Sonneborn-Berger and Modifiers',
        'Article 16 — Handling of Unplayed Rounds (Effective 1 March 2026)'
      ],
      operationalSummary:
        'The Sonneborn-Berger system sums the scores of defeated opponents and half the scores of drawn opponents. For unplayed rounds, the dummy opponent score is multiplied by the points awarded to the player.',
      fide2026Specifics: [
        'Full win / PAB / Forfeit win: 100% of dummy opponent score.',
        'Half-point bye: 50% of dummy opponent score.',
        'Zero-point bye / Forfeit loss: 0 points contribution.',
        isCut1
          ? 'Article 16.5.1 SB Cut Exception: Compares lowest VUR contribution against the least significant value (lowest opponent score; tie-broken by lowest result) and cuts the higher.'
          : 'Normal SB: Evaluates all rounds without reduction.'
      ]
    };
  }

  if (code === 'DE' || lower.includes('direct encounter')) {
    return {
      title: 'Direct Encounter (DE)',
      articles: [
        'Article 6 — Direct Encounter',
        'Article 13 — Standing Determination'
      ],
      operationalSummary:
        'Direct Encounter resolves ties between two or more players based on head-to-head individual results among the tied participants.',
      fide2026Specifics: [
        'Strict Sub-Table Rule: Direct Encounter applies ONLY if ALL tied players have played against each other.',
        'If any member of the tied group did not play another member, Direct Encounter cannot resolve the tie, and the engine immediately defers to the next criterion.',
        'Default Forfeit Rule: Applicable forfeit games are excluded from Direct Encounter sub-tables under standard FIDE rules unless tournament regulations explicitly override.'
      ]
    };
  }

  if (code === 'ARO' || lower.includes('average rating')) {
    return {
      title: 'Average Rating of Opponents (ARO)',
      articles: [
        'Article 9 — Average Rating of Opponents',
        'FIDE Rating Regulations — Unrated Opponent Substitute'
      ],
      operationalSummary:
        'ARO measures the average strength of scheduled opponents by calculating the arithmetic mean of their official FIDE ratings.',
      fide2026Specifics: [
        'Unrated opponents receive the tournament substitute rating floor (standard FIDE default: 1400).',
        'Unplayed rounds are handled according to tournament pairing records or excluded depending on specific regulations.'
      ]
    };
  }

  if (code === 'WON' || code === 'WIN' || code === 'BWG' || lower.includes('won') || lower.includes('victories')) {
    return {
      title: rawName,
      articles: [
        'Article 7 — Number of Wins and Games Won'
      ],
      operationalSummary:
        'Breaks ties using the total number of victories. WON counts over-the-board games won; WIN includes unplayed forfeit wins; BWG counts wins with the Black pieces.',
      fide2026Specifics: [
        'WON (Games Won): Only games actually played on the board resulting in 1-0 or 0-1.',
        'WIN (Victories): Includes both played wins and 1F/forfeit wins.',
        'BWG (Black Wins): Over-the-board wins where the player had the Black pieces.'
      ]
    };
  }

  return {
    title: rawName,
    articles: ['FIDE Play-Off and Tie-Break Regulations'],
    operationalSummary: `Tie-break criterion ${rawName} configured for official tournament standings.`,
    fide2026Specifics: [
      'Calculated in accordance with FIDE Handbook Section C.04 Play-Off and Tie-Break Regulations.'
    ]
  };
}

export const RuleDetailsModal: React.FC<RuleDetailsModalProps> = ({
  tieBreakName,
  isOpen,
  onClose
}) => {
  if (!isOpen) return null;

  const info = getRuleInformation(tieBreakName);

  return (
    <div
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 text-slate-800"
      onKeyDown={e => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div className="bg-white border border-slate-200 rounded-xl shadow-2xl w-full max-w-lg flex flex-col animate-in fade-in zoom-in-95 duration-150 text-xs">
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50 rounded-t-xl">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-800">
              <BookOpen className="w-3.5 h-3.5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">FIDE Rule Information</h3>
              <p className="text-[11px] text-slate-500">
                Official FIDE Handbook Reference & Operational Rules
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

        {/* Content */}
        <div className="p-4 space-y-3.5 overflow-y-auto max-h-[70vh]">
          <div>
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Tie-Break Criterion
            </div>
            <div className="text-sm font-bold text-slate-900 mt-0.5">
              {info.title}
            </div>
          </div>

          {/* Relevant Articles */}
          <div className="space-y-1 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
            <div className="text-[11px] font-bold text-slate-700">
              Relevant FIDE Articles:
            </div>
            <ul className="list-disc list-inside space-y-0.5 text-slate-600 font-mono text-[11px]">
              {info.articles.map((art, idx) => (
                <li key={idx}>{art}</li>
              ))}
            </ul>
          </div>

          {/* Operational Summary */}
          <div className="space-y-1">
            <div className="text-[11px] font-bold text-slate-700">
              Operational Summary:
            </div>
            <p className="text-slate-600 leading-relaxed text-xs">
              {info.operationalSummary}
            </p>
          </div>

          {/* FIDE 2026 Specifics */}
          <div className="space-y-1.5 pt-1">
            <div className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>FIDE 2026 Compliance Specifics:</span>
            </div>
            <div className="space-y-1.5">
              {info.fide2026Specifics.map((spec, idx) => (
                <div key={idx} className="p-2 rounded bg-blue-50/60 border border-blue-100 text-slate-700 leading-snug">
                  {spec}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-slate-200 bg-slate-50 rounded-b-xl flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold shadow-sm transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
