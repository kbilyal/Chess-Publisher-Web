import React, { useState, useMemo } from 'react';
import { Tournament } from '../types';
import { X, Search, Plus, Filter, Check } from 'lucide-react';
import { getTieBreakCodeAndName } from '../engine/tiebreakChecker';

interface AddTieBreakModalProps {
  tournament: Tournament;
  isOpen: boolean;
  onClose: () => void;
  onAddTieBreaks: (newTieBreaks: string[]) => void;
}

interface AvailableCriterion {
  id: string;
  name: string;
  code: string;
  category: 'buchholz' | 'sonneborn' | 'direct' | 'wins' | 'rating' | 'other';
  fideArticle: string;
  description: string;
}

const ALL_AVAILABLE_CRITERIA: AvailableCriterion[] = [
  {
    id: 'Buchholz Cut-1 (BH-C1) [84]',
    name: 'Buchholz Cut-1',
    code: 'BH-C1',
    category: 'buchholz',
    fideArticle: 'Art. 8, 14, 16.5.1',
    description: 'Sum of opponents\' scores excluding the lowest result, applying the Article 16.5.1 VUR exception.'
  },
  {
    id: 'Buchholz Tie-Break (2023) [84]',
    name: 'Buchholz',
    code: 'BH',
    category: 'buchholz',
    fideArticle: 'Art. 8, 16',
    description: 'Full sum of all opponents\' adjusted scores and Article 16 dummy opponent scores.'
  },
  {
    id: 'Buchholz Cut-2 (BH-C2) [84]',
    name: 'Buchholz Cut-2',
    code: 'BH-C2',
    category: 'buchholz',
    fideArticle: 'Art. 8, 14, 16.5.2',
    description: 'Buchholz discarding the two lowest contributing scores.'
  },
  {
    id: 'Median Buchholz (BH-M1) [84]',
    name: 'Buchholz Median 1',
    code: 'BH-M1',
    category: 'buchholz',
    fideArticle: 'Art. 8, 14',
    description: 'Buchholz discarding the highest and lowest scores.'
  },
  {
    id: 'Median Buchholz 2 (BH-M2) [84]',
    name: 'Buchholz Median 2',
    code: 'BH-M2',
    category: 'buchholz',
    fideArticle: 'Art. 8, 14',
    description: 'Buchholz discarding the two highest and two lowest scores.'
  },
  {
    id: 'Sonneborn-Berger Cut-1 (SB-C1) [85]',
    name: 'Sonneborn-Berger Cut-1',
    code: 'SB-C1',
    category: 'sonneborn',
    fideArticle: 'Art. 14, 16.5.1',
    description: 'Sum of defeated opponents\' scores and half of drawn opponents\' scores, cutting the lowest contribution.'
  },
  {
    id: 'Sonneborn-Berger Tie-Break (2023) [85]',
    name: 'Sonneborn-Berger',
    code: 'SB',
    category: 'sonneborn',
    fideArticle: 'Art. 14, 16',
    description: 'Standard Sonneborn-Berger with FIDE Article 16 dummy opponent scores for unplayed rounds.'
  },
  {
    id: 'Direct Encounter (DE) [81]',
    name: 'Direct Encounter',
    code: 'DE',
    category: 'direct',
    fideArticle: 'Art. 6',
    description: 'Results in games played between tied competitors (evaluated only if all tied have met).'
  },
  {
    id: 'Greater number of games won (WON) [68]',
    name: 'Games Won',
    code: 'WON',
    category: 'wins',
    fideArticle: 'Art. 7',
    description: 'Total number of wins scored over the board.'
  },
  {
    id: 'Greater number of victories (WIN) [68]',
    name: 'Number of Wins',
    code: 'WIN',
    category: 'wins',
    fideArticle: 'Art. 7',
    description: 'Number of wins including forfeit wins.'
  },
  {
    id: 'Greater number of games won with Black (BWG) [68]',
    name: 'Games Won with Black',
    code: 'BWG',
    category: 'wins',
    fideArticle: 'Art. 7',
    description: 'Total number of games won with the Black pieces over the board.'
  },
  {
    id: 'Greater number of games played with Black (BPG) [68]',
    name: 'Games Played with Black',
    code: 'BPG',
    category: 'wins',
    fideArticle: 'Art. 7',
    description: 'Number of games played with the Black pieces.'
  },
  {
    id: 'Average Rating of Opponents (ARO) [80]',
    name: 'Average Rating of Opponents',
    code: 'ARO',
    category: 'rating',
    fideArticle: 'Art. 9',
    description: 'Arithmetic mean of the FIDE ratings of all scheduled opponents.'
  },
  {
    id: 'Average of Opponents\' Buchholz (AOB) [77]',
    name: 'Average of Opponents\' Buchholz',
    code: 'AOB',
    category: 'buchholz',
    fideArticle: 'Art. 8.4',
    description: 'Arithmetic mean of the Buchholz scores of all scheduled opponents.'
  },
  {
    id: 'Koya System (KS) [87]',
    name: 'Koya System',
    code: 'KOYA',
    category: 'other',
    fideArticle: 'Art. 10',
    description: 'Number of points scored against opponents who scored at least 50%.'
  },
  {
    id: 'FIDE Tiebreak (Progressive Score) [86]',
    name: 'Progressive Score',
    code: 'PS',
    category: 'other',
    fideArticle: 'Legacy',
    description: 'Cumulative sum of scores after each completed round.'
  }
];

export const AddTieBreakModal: React.FC<AddTieBreakModalProps> = ({
  tournament,
  isOpen,
  onClose,
  onAddTieBreaks
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const activeTieBreaks = tournament.regulations?.tieBreaks || [];
  const activeCodes = useMemo(() => {
    return new Set(activeTieBreaks.map(tb => getTieBreakCodeAndName(tb).code));
  }, [activeTieBreaks]);

  const filteredCriteria = useMemo(() => {
    return ALL_AVAILABLE_CRITERIA.filter(c => {
      // Category match
      if (selectedCategory !== 'all' && c.category !== selectedCategory) {
        return false;
      }
      // Search match
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches = (
          c.name.toLowerCase().includes(q) ||
          c.code.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q) ||
          c.fideArticle.toLowerCase().includes(q)
        );
        if (!matches) return false;
      }
      return true;
    });
  }, [selectedCategory, searchQuery]);

  if (!isOpen) return null;

  const toggleSelection = (id: string, isAlreadyActive: boolean) => {
    if (isAlreadyActive) return;
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleAdd = () => {
    if (selectedIds.length === 0) return;
    onAddTieBreaks(selectedIds);
    setSelectedIds([]);
    onClose();
  };

  const currentCount = activeTieBreaks.length;
  const remainingSlots = Math.max(0, 6 - currentCount);

  return (
    <div
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 text-slate-800"
      onKeyDown={e => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div className="bg-white border border-slate-200 rounded-xl shadow-2xl w-full max-w-xl flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150 text-xs">
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50 rounded-t-xl">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-blue-100 border border-blue-300 flex items-center justify-center text-blue-700">
              <Plus className="w-3.5 h-3.5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Add Tie-Break</h3>
              <p className="text-[11px] text-slate-500">
                Select criteria to append to tournament priority chain ({currentCount} active, max 6)
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

        {/* Search and Category Filter Toolbar */}
        <div className="p-3 border-b border-slate-200 bg-white flex flex-col sm:flex-row gap-2 items-center">
          <div className="relative flex-1 w-full">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search tie-breaks by name, code (e.g. BH, SB, WON)..."
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded text-xs text-slate-900 focus:bg-white focus:border-blue-500 focus:outline-none"
              autoFocus
            />
          </div>

          <div className="flex items-center gap-1.5 w-full sm:w-auto">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
              className="px-2 py-1.5 bg-slate-50 border border-slate-300 rounded text-xs text-slate-800 font-medium focus:bg-white focus:border-blue-500 focus:outline-none"
            >
              <option value="all">All Categories</option>
              <option value="buchholz">Buchholz</option>
              <option value="sonneborn">Sonneborn-Berger</option>
              <option value="direct">Direct Encounter</option>
              <option value="wins">Wins & Games</option>
              <option value="rating">Rating & ARO</option>
              <option value="other">Other Criteria</option>
            </select>
          </div>
        </div>

        {/* Criteria List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {filteredCriteria.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-xs">
              No matching tie-break criteria found.
            </div>
          ) : (
            filteredCriteria.map(item => {
              const isAlreadyActive = activeCodes.has(item.code);
              const isChecked = selectedIds.includes(item.id);

              return (
                <div
                  key={item.id}
                  onClick={() => toggleSelection(item.id, isAlreadyActive)}
                  className={`p-2.5 border rounded-lg transition flex items-start gap-3 cursor-pointer ${
                    isAlreadyActive
                      ? 'bg-slate-100 border-slate-200 opacity-60 cursor-not-allowed'
                      : isChecked
                      ? 'bg-blue-50 border-blue-300 text-blue-900 shadow-xs'
                      : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="pt-0.5">
                    <input
                      type="checkbox"
                      checked={isChecked || isAlreadyActive}
                      disabled={isAlreadyActive}
                      onChange={() => {}}
                      className="rounded border-slate-300 text-blue-600 focus:ring-0 pointer-events-none"
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900">{item.name}</span>
                      <span className="px-1.5 py-0.2 rounded bg-slate-100 border border-slate-300 text-slate-700 font-mono font-bold text-[10px]">
                        {item.code}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {item.fideArticle}
                      </span>
                      {isAlreadyActive && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-50 border border-amber-200 text-amber-800 font-medium">
                          Already in list
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                      {item.description}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-slate-200 bg-slate-50 rounded-b-xl flex items-center justify-between">
          <span className="text-[11px] text-slate-500">
            {selectedIds.length} selected {selectedIds.length > remainingSlots && `(Warning: will exceed 6 max)`}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded text-xs font-medium transition"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={selectedIds.length === 0}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded text-xs font-semibold shadow-sm transition flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Add Selected ({selectedIds.length})</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
