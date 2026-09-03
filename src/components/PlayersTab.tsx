import React, { useState, useEffect, useRef } from 'react';
import { Tournament, Player, FideTitle, Gender, Attendance } from '../types';
import { FEDERATIONS, getFederationFlag } from '../data/initialData';
import { FideDatabaseStatus } from './FideDatabaseStatus';
import { FidePlayerRecord } from '../server/fide/types';
import { FideSyncModal } from './FideSyncModal';
import { RequestedByesModal } from './RequestedByesModal';
import { TransactionManager } from '../transactions/TransactionManager';
import {
  isStartingRankLocked,
  checkPlayerHasHistory,
  validatePlayerEntry,
  annotateInitialSortOrder,
  executeRegisterPlayerTransaction,
  executeDeletePlayerTransaction,
  executeBulkStatusTransaction,
  executeBulkFederationTransaction,
  executeBulkDeleteTransaction
} from '../transactions/playerWorkflow';
import { 
  Users, UserPlus, Search, ArrowUpDown, Check, X, 
  Trash2, Edit3, ShieldAlert, Sparkles, RefreshCw, ExternalLink, Loader2,
  Lock, Calendar, CheckSquare, Square, AlertTriangle, AlertCircle
} from 'lucide-react';

interface PlayersTabProps {
  tournament: Tournament;
  onUpdateTournament: (updater: (prev: Tournament) => Tournament) => void;
  onResortStartingList: () => void;
}

export const PlayersTab: React.FC<PlayersTabProps> = ({
  tournament,
  onUpdateTournament,
  onResortStartingList
}) => {
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [syncTargetKey, setSyncTargetKey] = useState<string | undefined>(undefined);

  const [fideSearchQuery, setFideSearchQuery] = useState('');
  const [fideResults, setFideResults] = useState<FidePlayerRecord[]>([]);
  const [isSearchingFide, setIsSearchingFide] = useState(false);
  const [fideSearchNotice, setFideSearchNotice] = useState<string | null>(null);
  const [fideRatingFilter, setFideRatingFilter] = useState<'all' | 'rated' | 'unrated'>('all');
  const [playerSelectedRating, setPlayerSelectedRating] = useState<Record<number, 'Standard' | 'Rapid' | 'Blitz'>>({});
  const [fideDatabaseRevision, setFideDatabaseRevision] = useState(0);

  const [listFilter, setListFilter] = useState('');
  const [sortMode, setSortMode] = useState<'rating' | 'name' | 'birth' | 'initialSort'>('rating');

  // Multi-Selection State for Bulk Operations
  const [selectedPlayerKeys, setSelectedPlayerKeys] = useState<Set<string>>(new Set());
  const [bulkFedCode, setBulkFedCode] = useState('BUL');
  const [bulkNotice, setBulkNotice] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);

  // Requested Byes Modal State
  const [byesTargetPlayer, setByesTargetPlayer] = useState<Player | null>(null);

  // Blocked Player Deletion Notice Modal
  const [blockedHistoryNotice, setBlockedHistoryNotice] = useState<{ name: string; reasons: string[] } | null>(null);

  // Manual Player Add Form
  const [manualName, setManualName] = useState('');
  const [manualRating, setManualRating] = useState('0');
  const [manualTitle, setManualTitle] = useState<FideTitle>('');
  const [manualFed, setManualFed] = useState('BUL');
  const [manualFideId, setManualFideId] = useState('');
  const [manualBirth, setManualBirth] = useState('');
  const [manualGender, setManualGender] = useState<Gender>('m');
  const [isLookingUpFide, setIsLookingUpFide] = useState(false);
  const [manualLookupNotice, setManualLookupNotice] = useState<string | null>(null);

  // Edit Player Modal State
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);

  const players = tournament.players || [];
  const rankLocked = isStartingRankLocked(tournament);
  const latestRound = Object.keys(tournament.pairings.liveBoards || {}).length;

  // Determine active tournament rating type (Standard, Rapid, or Blitz)
  const defaultRatingType: 'Standard' | 'Rapid' | 'Blitz' = 
    (tournament.settings?.tournamentRatingType as 'Standard' | 'Rapid' | 'Blitz') || 
    ((tournament as any).ratingType as 'Standard' | 'Rapid' | 'Blitz') || 
    'Standard';

  // Real-time Duplicate FIDE ID check for manual entry
  const duplicateManualPlayer = manualFideId.trim() && manualFideId.trim() !== '-' && manualFideId.trim() !== '0'
    ? players.find(p => p.fideId && p.fideId.trim() === manualFideId.trim())
    : null;

  // Duplicate FIDE ID check for edit modal
  const duplicateEditPlayer = editingPlayer && editingPlayer.fideId && editingPlayer.fideId.trim() !== '-' && editingPlayer.fideId.trim() !== '0'
    ? players.find(p => p.localKey !== editingPlayer.localKey && p.fideId && p.fideId.trim() === editingPlayer.fideId.trim())
    : null;

  // Search and browse real authoritative FIDE backend API with debouncing and order-independent matching
  const searchTimeoutRef = useRef<any>(null);

  useEffect(() => {
    const q = fideSearchQuery.trim();

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    setIsSearchingFide(true);
    setFideSearchNotice(null);

    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const queryParam = q ? `&q=${encodeURIComponent(q)}` : '';
        const res = await fetch(`/api/fide/search?limit=50&tournamentType=${encodeURIComponent(defaultRatingType)}&filterRating=${encodeURIComponent(fideRatingFilter)}${queryParam}`);
        if (res.ok) {
          const data = await res.json();
          setFideResults(data.players || []);
          if (data.players && data.players.length === 0) {
            setFideSearchNotice(
              q
                ? 'Няма намерени FIDE състезатели по зададените критерии.'
                : 'Няма налични състезатели в FIDE базата данни за избрания филтър.'
            );
          }
        } else {
          setFideResults([]);
          setFideSearchNotice('Грешка при заявка към FIDE базата данни.');
        }
      } catch (err: any) {
        setFideResults([]);
        setFideSearchNotice('Няма връзка с FIDE сървъра за търсене.');
      } finally {
        setIsSearchingFide(false);
      }
    }, q.length > 0 ? 250 : 0);

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [fideSearchQuery, defaultRatingType, fideRatingFilter, fideDatabaseRevision]);

  // Lookup manual FIDE ID directly
  const handleLookupManualFideId = async () => {
    const fideId = manualFideId.trim();
    if (!fideId) return;

    setIsLookingUpFide(true);
    setManualLookupNotice(null);

    try {
      const res = await fetch(`/api/fide/player/${encodeURIComponent(fideId)}?tournamentType=${encodeURIComponent(defaultRatingType)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.found && data.player) {
          const p: FidePlayerRecord = data.player;
          if (p.name) setManualName(p.name);
          if (p.federation) setManualFed(p.federation);
          if (p.title) setManualTitle((p.title as FideTitle) || '');
          if (p.birth) setManualBirth(String(p.birth));
          if (p.gender) setManualGender(p.gender.toLowerCase() === 'w' ? 'f' : 'm');

          const chosenRating = defaultRatingType === 'Rapid' 
            ? (p.ratingRapid || p.ratingStandard || 0)
            : defaultRatingType === 'Blitz'
            ? (p.ratingBlitz || p.ratingStandard || 0)
            : (p.ratingStandard || 0);

          setManualRating(String(chosenRating));
          setManualLookupNotice(`Заредени официални данни за ${p.name} (${defaultRatingType}: ${chosenRating || 'няма'})`);
        } else {
          setManualLookupNotice(`Няма намерен FIDE състезател с ID: ${fideId}`);
        }
      } else {
        setManualLookupNotice('Грешка при проверка на FIDE ID.');
      }
    } catch (e: any) {
      setManualLookupNotice('Няма връзка с FIDE базата данни.');
    } finally {
      setIsLookingUpFide(false);
    }
  };

  const handleAddFidePlayer = async (p: FidePlayerRecord, chosenType: 'Standard' | 'Rapid' | 'Blitz') => {
    const chosenRating = chosenType === 'Rapid' 
      ? (p.ratingRapid || 0)
      : chosenType === 'Blitz'
      ? (p.ratingBlitz || 0)
      : (p.ratingStandard || 0);

    const manager = new TransactionManager<Tournament>();
    try {
      const res = await executeRegisterPlayerTransaction(
        manager,
        tournament,
        {
          name: p.name,
          rating: chosenRating,
          stdRating: p.ratingStandard || 0,
          rapidRating: p.ratingRapid || 0,
          blitzRating: p.ratingBlitz || 0,
          fed: p.federation || 'FID',
          fideId: String(p.fideId),
          birth: p.birth ? String(p.birth) : '-',
          gender: p.gender && p.gender.toLowerCase() === 'w' ? 'f' : 'm',
          title: (p.title as FideTitle) || '',
          attendance: 'present',
          fideK: chosenRating >= 2400 ? 10 : 20
        },
        {
          joinedFromRound: rankLocked ? latestRound + 1 : 1,
          lateEntryByeType: 'zero'
        }
      );

      onUpdateTournament(() => res.tournament);
      setBulkNotice({ type: 'success', text: `Player "${p.name}" registered successfully (#${res.player.pairingNumber}).` });
    } catch (err: any) {
      setBulkNotice({ type: 'error', text: err.message || 'Failed to register player.' });
    }
  };

  const handleAddAllFidePlayers = async () => {
    const unadded = fideResults.filter(p => !players.some(x => x.fideId === String(p.fideId) && String(p.fideId) !== '-'));
    if (unadded.length === 0) return;

    const manager = new TransactionManager<Tournament>();
    let currentTourn = tournament;
    let addedCount = 0;

    for (const p of unadded) {
      const chosenType = playerSelectedRating[p.fideId] || defaultRatingType;
      const chosenRating = chosenType === 'Rapid' 
        ? (p.ratingRapid || 0)
        : chosenType === 'Blitz'
        ? (p.ratingBlitz || 0)
        : (p.ratingStandard || 0);

      try {
        const res = await executeRegisterPlayerTransaction(
          manager,
          currentTourn,
          {
            name: p.name,
            rating: chosenRating,
            stdRating: p.ratingStandard || 0,
            rapidRating: p.ratingRapid || 0,
            blitzRating: p.ratingBlitz || 0,
            fed: p.federation || 'FID',
            fideId: String(p.fideId),
            birth: p.birth ? String(p.birth) : '-',
            gender: p.gender && p.gender.toLowerCase() === 'w' ? 'f' : 'm',
            title: (p.title as FideTitle) || '',
            attendance: 'present',
            fideK: chosenRating >= 2400 ? 10 : 20
          },
          {
            joinedFromRound: rankLocked ? latestRound + 1 : 1,
            lateEntryByeType: 'zero'
          }
        );
        currentTourn = res.tournament;
        addedCount++;
      } catch (err: any) {
        console.warn('Could not add player:', p.name, err);
      }
    }

    onUpdateTournament(() => currentTourn);
    setBulkNotice({ type: 'success', text: `Успешно добавени ${addedCount} състезатели от FIDE списъка в турнира.` });
  };

  const handleAddManualPlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualName.trim()) return;

    if (duplicateManualPlayer) {
      alert(`Cannot add player: FIDE ID ${manualFideId} is already assigned to "${duplicateManualPlayer.name}" (#${duplicateManualPlayer.pairingNumber}).`);
      return;
    }

    const ratingVal = parseInt(manualRating, 10) || 0;
    const manager = new TransactionManager<Tournament>();

    try {
      const res = await executeRegisterPlayerTransaction(
        manager,
        tournament,
        {
          name: manualName.trim(),
          rating: ratingVal,
          stdRating: ratingVal,
          fed: manualFed.toUpperCase(),
          fideId: manualFideId.trim() || '-',
          birth: manualBirth.trim() || '-',
          gender: manualGender,
          title: manualTitle,
          attendance: 'present',
          fideK: ratingVal >= 2400 ? 10 : 20
        },
        {
          joinedFromRound: rankLocked ? latestRound + 1 : 1,
          lateEntryByeType: 'zero'
        }
      );

      onUpdateTournament(() => res.tournament);
      setBulkNotice({ type: 'success', text: `Player "${manualName.trim()}" registered (#${res.player.pairingNumber}).` });

      // Reset Form
      setManualName('');
      setManualRating('0');
      setManualTitle('');
      setManualFideId('');
      setManualBirth('');
    } catch (err: any) {
      setBulkNotice({ type: 'error', text: err.message || 'Failed to register manual player.' });
    }
  };

  const handleToggleAttendance = async (localKey: string, nextAttendance: Attendance) => {
    const manager = new TransactionManager<Tournament>();
    try {
      const res = await executeBulkStatusTransaction(manager, tournament, [localKey], nextAttendance);
      onUpdateTournament(() => res.tournament);
    } catch (err: any) {
      setBulkNotice({ type: 'error', text: err.message || 'Failed to update attendance.' });
    }
  };

  const handleDeletePlayer = async (localKey: string) => {
    const history = checkPlayerHasHistory(tournament, localKey);
    const targetPlayer = players.find(p => p.localKey === localKey);

    if (history.hasHistory) {
      setBlockedHistoryNotice({
        name: targetPlayer?.name || 'Player',
        reasons: history.reasons
      });
      return;
    }

    if (!window.confirm(`Remove player "${targetPlayer?.name}" from tournament roster?`)) return;

    const manager = new TransactionManager<Tournament>();
    try {
      const res = await executeDeletePlayerTransaction(manager, tournament, localKey);
      onUpdateTournament(() => res.tournament);
      setSelectedPlayerKeys(prev => {
        const next = new Set(prev);
        next.delete(localKey);
        return next;
      });
      setBulkNotice({ type: 'success', text: `Player "${targetPlayer?.name}" removed from tournament roster.` });
    } catch (err: any) {
      setBulkNotice({ type: 'error', text: err.message || 'Failed to delete player.' });
    }
  };

  const handleSaveEditedPlayer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlayer) return;

    if (duplicateEditPlayer) {
      alert(`Duplicate FIDE ID: FIDE ID ${editingPlayer.fideId} is already assigned to "${duplicateEditPlayer.name}".`);
      return;
    }

    const validation = validatePlayerEntry(tournament, editingPlayer, editingPlayer.localKey);
    if (!validation.valid) {
      alert(validation.errors.join('\n'));
      return;
    }

    onUpdateTournament(prev => ({
      ...prev,
      players: prev.players.map(p => p.localKey === editingPlayer.localKey ? editingPlayer : p)
    }));

    setEditingPlayer(null);
    setBulkNotice({ type: 'success', text: `Player "${editingPlayer.name}" updated successfully.` });
  };

  // Bulk Operations Handlers
  const handleBulkStatusChange = async (attendance: Attendance) => {
    if (selectedPlayerKeys.size === 0) return;
    const manager = new TransactionManager<Tournament>();
    try {
      const res = await executeBulkStatusTransaction(manager, tournament, Array.from(selectedPlayerKeys), attendance);
      onUpdateTournament(() => res.tournament);
      setBulkNotice({ type: 'success', text: `Bulk status: ${res.report.affectedCount} player(s) set to "${attendance}".` });
      setSelectedPlayerKeys(new Set());
    } catch (err: any) {
      setBulkNotice({ type: 'error', text: err.message || 'Failed bulk status update.' });
    }
  };

  const handleBulkFederationApply = async () => {
    if (selectedPlayerKeys.size === 0) return;
    const manager = new TransactionManager<Tournament>();
    try {
      const res = await executeBulkFederationTransaction(manager, tournament, Array.from(selectedPlayerKeys), bulkFedCode);
      onUpdateTournament(() => res.tournament);
      setBulkNotice({ type: 'success', text: `Bulk federation: ${res.report.affectedCount} player(s) updated to "${bulkFedCode}".` });
      setSelectedPlayerKeys(new Set());
    } catch (err: any) {
      setBulkNotice({ type: 'error', text: err.message || 'Failed bulk federation update.' });
    }
  };

  const handleBulkDelete = async () => {
    if (selectedPlayerKeys.size === 0) return;
    if (!window.confirm(`Delete ${selectedPlayerKeys.size} selected player(s)? (Players with game history will be protected)`)) return;

    const manager = new TransactionManager<Tournament>();
    try {
      const res = await executeBulkDeleteTransaction(
        manager,
        tournament,
        Array.from(selectedPlayerKeys),
        { allowPartial: true }
      );

      onUpdateTournament(() => res.tournament);
      setSelectedPlayerKeys(new Set());

      if (res.report.blockedCount > 0) {
        setBulkNotice({
          type: 'warning',
          text: `Deleted ${res.report.affectedCount} player(s). ${res.report.blockedCount} player(s) were protected from deletion because they have played games or pairings.`
        });
      } else {
        setBulkNotice({ type: 'success', text: `Successfully deleted ${res.report.affectedCount} player(s).` });
      }
    } catch (err: any) {
      setBulkNotice({ type: 'error', text: err.message || 'Failed bulk delete.' });
    }
  };

  const handleToggleSelectAll = () => {
    if (selectedPlayerKeys.size === visiblePlayers.length) {
      setSelectedPlayerKeys(new Set());
    } else {
      setSelectedPlayerKeys(new Set(visiblePlayers.map(p => p.localKey)));
    }
  };

  const handleToggleSelectPlayer = (key: string) => {
    setSelectedPlayerKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Filter and Sort Player List (order-independent across first name, last name, FED, FIDE ID)
  const visiblePlayers = [...players]
    .filter(p => {
      if (!listFilter.trim()) return true;
      const tokens = listFilter.toLowerCase().trim().split(/[\s,]+/).filter(Boolean);
      return tokens.every(tok => 
        p.name.toLowerCase().includes(tok) || 
        p.fed.toLowerCase().includes(tok) || 
        p.fideId.toLowerCase().includes(tok) ||
        (p.club && p.club.toLowerCase().includes(tok)) ||
        (p.title && p.title.toLowerCase().includes(tok))
      );
    })
    .sort((a, b) => {
      if (sortMode === 'rating') {
        if (b.rating !== a.rating) return b.rating - a.rating;
        return a.name.localeCompare(b.name);
      }
      if (sortMode === 'initialSort') {
        return (a.initialSortOrder || a.pairingNumber) - (b.initialSortOrder || b.pairingNumber);
      }
      if (sortMode === 'name') return a.name.localeCompare(b.name);
      if (sortMode === 'birth') return (b.birth || '').localeCompare(a.birth || '');
      return 0;
    });

  const presentCount = players.filter(p => p.attendance === 'present' || !p.attendance).length;
  const absentCount = players.filter(p => p.attendance === 'absent').length;
  const withdrawnCount = players.filter(p => p.attendance === 'withdrawn').length;

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6 animate-in fade-in duration-200 text-slate-800">
      {/* 0. Authoritative FIDE Rating Database Status Panel */}
      <FideDatabaseStatus onDatabaseUpdated={() => setFideDatabaseRevision(r => r + 1)} />

      {/* Starting Rank Lock Warning Banner */}
      {rankLocked && (
        <div className="p-3.5 bg-amber-50/80 border border-amber-200 rounded-xl flex items-start gap-3 text-amber-900 text-xs shadow-2xs">
          <Lock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <div className="font-bold text-amber-950 flex items-center gap-2">
              <span>Starting Numbers Locked (Round 1 Pairings Generated)</span>
              <span className="px-1.5 py-0.2 rounded bg-amber-200/70 border border-amber-300 font-mono text-[10px] font-semibold">
                FIDE Invariant
              </span>
            </div>
            <p className="text-amber-800 leading-relaxed">
              Official starting ranks and pairing numbers are fixed. Newly registered late participants receive sequential numbers appended to the list and are assigned unplayed byes for preceding rounds.
            </p>
          </div>
        </div>
      )}

      {/* Bulk Operation Notification Banner */}
      {bulkNotice && (
        <div className={`p-3 rounded-xl border flex items-center justify-between text-xs transition ${
          bulkNotice.type === 'success' 
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
            : bulkNotice.type === 'warning'
            ? 'bg-amber-50 border-amber-200 text-amber-800'
            : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          <div className="flex items-center gap-2">
            {bulkNotice.type === 'success' && <Check className="w-4 h-4 text-emerald-600" />}
            {bulkNotice.type === 'warning' && <AlertTriangle className="w-4 h-4 text-amber-600" />}
            {bulkNotice.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-600" />}
            <span>{bulkNotice.text}</span>
          </div>
          <button
            onClick={() => setBulkNotice(null)}
            className="text-slate-400 hover:text-slate-600 p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 1. Quick Registration & FIDE Live Directory */}
      <div className="grid grid-cols-1 lg:grid-cols-11 gap-6">
        {/* Manual Player Entry Form */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-blue-600" />
              Manual Player Registration
            </h2>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-800 font-semibold">
              {rankLocked ? 'Late Entry' : 'Roster Add'}
            </span>
          </div>

          <form onSubmit={handleAddManualPlayer} className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-2.5">
              <div className="col-span-2 space-y-1">
                <label className="font-semibold text-slate-700 flex items-center gap-1">
                  Full Name (Last, First) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={manualName}
                  onChange={e => setManualName(e.target.value)}
                  placeholder="e.g. Anand, Viswanathan"
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none transition"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Rating (FIDE/Nat)</label>
                <input
                  type="number"
                  min="0"
                  max="3500"
                  value={manualRating}
                  onChange={e => setManualRating(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 font-bold focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none transition"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">FIDE Title</label>
                <select
                  value={manualTitle}
                  onChange={e => setManualTitle(e.target.value as FideTitle)}
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none transition"
                >
                  <option value="">No Title</option>
                  <option value="GM">GM — Grandmaster</option>
                  <option value="IM">IM — International Master</option>
                  <option value="WGM">WGM — Woman Grandmaster</option>
                  <option value="FM">FM — FIDE Master</option>
                  <option value="WIM">WIM — Woman IM</option>
                  <option value="CM">CM — Candidate Master</option>
                  <option value="WFM">WFM — Woman FM</option>
                  <option value="WCM">WCM — Woman CM</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Federation</label>
                <select
                  value={manualFed}
                  onChange={e => setManualFed(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none transition"
                >
                  {FEDERATIONS.map(([code, name]) => (
                    <option key={code} value={code}>{getFederationFlag(code)} {code} — {name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-slate-700">FIDE ID</label>
                  {manualFideId && (
                    <button
                      type="button"
                      onClick={handleLookupManualFideId}
                      disabled={isLookingUpFide}
                      className="text-[10px] text-blue-600 hover:text-blue-800 font-bold underline flex items-center gap-0.5"
                    >
                      {isLookingUpFide ? 'Проверка...' : `Попълни (${defaultRatingType})`}
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  value={manualFideId}
                  onChange={e => setManualFideId(e.target.value.replace(/\D/g, ''))}
                  placeholder="e.g. 1503014"
                  className={`w-full px-3 py-1.5 bg-slate-50 border rounded-lg text-slate-900 font-mono focus:bg-white focus:ring-2 focus:outline-none transition ${
                    duplicateManualPlayer ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-100' : 'border-slate-300 focus:border-blue-500 focus:ring-blue-100'
                  }`}
                />
                {duplicateManualPlayer && (
                  <p className="text-[10px] text-rose-600 font-medium">
                    ⚠️ DUPLICATE_FIDE_ID: Assigned to "{duplicateManualPlayer.name}" (#{duplicateManualPlayer.pairingNumber}).
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Birth (YYYY or YYYY-MM-DD)</label>
                <input
                  type="text"
                  value={manualBirth}
                  onChange={e => setManualBirth(e.target.value)}
                  placeholder="e.g. 1990"
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 font-mono focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none transition"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Gender</label>
                <select
                  value={manualGender}
                  onChange={e => setManualGender(e.target.value as Gender)}
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none transition"
                >
                  <option value="m">Male (m)</option>
                  <option value="f">Female (f)</option>
                </select>
              </div>
            </div>

            {manualLookupNotice && (
              <div className="p-2 rounded bg-blue-50 border border-blue-200 text-blue-800 text-[11px]">
                {manualLookupNotice}
              </div>
            )}

            <button
              type="submit"
              disabled={Boolean(duplicateManualPlayer)}
              className={`w-full py-2 rounded-lg font-semibold transition shadow-sm flex items-center justify-center gap-1.5 ${
                duplicateManualPlayer 
                  ? 'bg-slate-300 text-slate-500 cursor-not-allowed' 
                  : 'bg-blue-600 hover:bg-blue-700 text-white active:bg-blue-800'
              }`}
            >
              <UserPlus className="w-4 h-4" />
              <span>{rankLocked ? 'Add Late Entrant to Tournament' : 'Add Player to Roster'}</span>
            </button>
          </form>
        </div>

        {/* Live Authoritative FIDE Directory Search */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4 flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Search className="w-4 h-4 text-emerald-600" />
              FIDE Рейтинг Списък (Standard, Rapid, Blitz)
            </h2>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 font-semibold">
              Индексирано търсене
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px] bg-slate-50 p-2 rounded-lg border border-slate-200">
            <div className="flex items-center gap-1 text-slate-700">
              <span className="font-medium text-slate-500">Тип турнир:</span>
              <span className="font-bold text-slate-900 px-1.5 py-0.2 bg-white border border-slate-200 rounded">
                {defaultRatingType === 'Rapid' ? 'Рапид (Rapid)' : defaultRatingType === 'Blitz' ? 'Блиц (Blitz)' : 'Класически (Standard)'}
              </span>
            </div>
            <div className="flex items-center gap-1 text-emerald-800 font-semibold">
              <Check className="w-3.5 h-3.5 text-emerald-600" />
              <span>По подразбиране чекнат: <b>{defaultRatingType}</b></span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-[11px] font-medium">
              <span className="text-slate-500 px-1 text-[10px]">Филтър:</span>
              <button
                type="button"
                onClick={() => setFideRatingFilter('all')}
                className={`px-2 py-0.5 rounded-md transition ${
                  fideRatingFilter === 'all'
                    ? 'bg-white text-slate-900 font-bold shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Всички
              </button>
              <button
                type="button"
                onClick={() => setFideRatingFilter('rated')}
                className={`px-2 py-0.5 rounded-md transition ${
                  fideRatingFilter === 'rated'
                    ? 'bg-white text-slate-900 font-bold shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Само с рейтинг
              </button>
              <button
                type="button"
                onClick={() => setFideRatingFilter('unrated')}
                className={`px-2 py-0.5 rounded-md transition ${
                  fideRatingFilter === 'unrated'
                    ? 'bg-purple-600 text-white font-bold shadow-2xs'
                    : 'text-purple-700 hover:bg-purple-50'
                }`}
              >
                Без рейтинг
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-500 font-mono">
                {fideResults.length > 0 ? `${fideResults.length} състезатели` : 'FIDE Official List'}
              </span>
              {fideResults.filter(p => !players.some(x => x.fideId === String(p.fideId) && String(p.fideId) !== '-')).length > 0 && (
                <button
                  type="button"
                  onClick={handleAddAllFidePlayers}
                  className="px-2 py-0.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold shadow-2xs transition flex items-center gap-1"
                  title="Добави всички състезатели от списъка в активния турнир"
                >
                  <UserPlus className="w-3 h-3" />
                  <span>Добави всички ({fideResults.filter(p => !players.some(x => x.fideId === String(p.fideId) && String(p.fideId) !== '-')).length})</span>
                </button>
              )}
            </div>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
            <input
              type="text"
              value={fideSearchQuery}
              onChange={e => setFideSearchQuery(e.target.value)}
              placeholder="Търсене по име (латиница или кирилица) или FIDE ID (напр. Carlsen, Топалов, 2905540)..."
              className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 focus:outline-none transition"
            />
            {isSearchingFide && (
              <Loader2 className="w-4 h-4 text-emerald-600 animate-spin absolute right-3 top-2.5" />
            )}
          </div>

          {/* Results List */}
          <div className="flex-1 min-h-[160px] max-h-[240px] overflow-y-auto border border-slate-200 rounded-lg bg-slate-50 divide-y divide-slate-200 text-xs">
            {isSearchingFide && fideResults.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-6 text-center text-slate-500">
                <Loader2 className="w-6 h-6 animate-spin text-emerald-600 mb-2" />
                <span>Търсене в официалната FIDE база данни...</span>
              </div>
            ) : fideResults.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-6 text-center text-slate-400">
                <Users className="w-8 h-8 mb-2 opacity-40" />
                <span>{fideSearchNotice || 'Въведете име на латиница/кирилица или FIDE ID (напр. "Топалов", "Carlsen", "2905540").'}</span>
              </div>
            ) : (
              fideResults.map(p => {
                const alreadyRegistered = players.some(x => x.fideId === String(p.fideId) && String(p.fideId) !== '-');
                const chosenType = playerSelectedRating[p.fideId] || defaultRatingType;
                const isCompletelyUnrated = (p.ratingStandard || 0) === 0 && (p.ratingRapid || 0) === 0 && (p.ratingBlitz || 0) === 0;

                return (
                  <div
                    key={p.fideId}
                    className="p-2.5 flex flex-col sm:flex-row sm:items-center justify-between hover:bg-slate-100 transition gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-slate-900 flex items-center gap-1.5 truncate">
                        <span>{getFederationFlag(p.federation)}</span>
                        {p.title && (
                          <span className="text-[10px] px-1 py-0.2 rounded bg-amber-50 text-amber-800 font-bold border border-amber-200">
                            {p.title}
                          </span>
                        )}
                        <span className="truncate">{p.name}</span>
                        {p.birth && (
                          <span className="text-[10px] text-slate-400 font-mono">
                            ({p.birth})
                          </span>
                        )}
                        {isCompletelyUnrated && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-100 text-purple-800 font-bold border border-purple-200">
                            Без рейтинг
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        <span className="text-[10px] text-slate-500 font-medium">Чек на рейтинг:</span>
                        {(['Standard', 'Rapid', 'Blitz'] as const).map(type => {
                          const ratingVal = type === 'Standard' ? p.ratingStandard : type === 'Rapid' ? p.ratingRapid : p.ratingBlitz;
                          const isChecked = chosenType === type;
                          const isDefault = defaultRatingType === type;
                          const label = type === 'Standard' ? 'STD' : type === 'Rapid' ? 'RAP' : 'BLZ';

                          return (
                            <button
                              key={type}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPlayerSelectedRating(prev => ({ ...prev, [p.fideId]: type }));
                              }}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold flex items-center gap-1 border transition ${
                                isChecked
                                  ? 'bg-emerald-100 border-emerald-500 text-emerald-900 shadow-2xs ring-1 ring-emerald-400'
                                  : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                              }`}
                            >
                              <span className={`w-3 h-3 rounded-full flex items-center justify-center text-[8px] font-bold ${
                                isChecked ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'
                              }`}>
                                {isChecked ? '✓' : ''}
                              </span>
                              <span>{label}: {ratingVal || '—'}</span>
                              {isDefault && (
                                <span className="text-[9px] text-amber-600 font-sans">★</span>
                              )}
                            </button>
                          );
                        })}
                        <span className="text-slate-400 text-[10px] font-mono ml-auto">ID: {p.fideId}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleAddFidePlayer(p, chosenType)}
                      disabled={alreadyRegistered}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex-shrink-0 transition sm:self-center ${
                        alreadyRegistered
                          ? 'bg-slate-200 text-slate-500 cursor-not-allowed border border-slate-300'
                          : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
                      }`}
                    >
                      {alreadyRegistered ? 'Добавен' : '+ Добави'}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* 2. Registered Competitors & Starting Rank List */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600" />
              Starting Rank & Attendance List
            </h2>
            <div className="flex items-center gap-2 text-xs font-mono">
              <span className="px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 font-semibold">
                🟢 {presentCount} Present
              </span>
              {absentCount > 0 && (
                <span className="px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-800 font-semibold">
                  ⏸ {absentCount} Absent
                </span>
              )}
              {withdrawnCount > 0 && (
                <span className="px-2 py-0.5 rounded bg-rose-50 border border-rose-200 text-rose-800 font-semibold">
                  ✕ {withdrawnCount} Withdrawn
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="sync-all-fide-btn"
              type="button"
              onClick={() => {
                setSyncTargetKey(undefined);
                setIsSyncModalOpen(true);
              }}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-lg text-xs font-semibold shadow-sm flex items-center gap-1.5 transition"
              title="Synchronize all eligible tournament players with authoritative FIDE database"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Sync All with FIDE</span>
            </button>

            <button
              onClick={onResortStartingList}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg text-xs font-semibold shadow-sm flex items-center gap-1.5 transition"
              title="Recalculate Starting Numbers based on FIDE ratings, titles, and national ratings"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Resort Starting List</span>
            </button>
          </div>
        </div>

        {/* Bulk Action Bar (Visible when 1+ players selected) */}
        {selectedPlayerKeys.size > 0 && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs animate-in fade-in duration-150">
            <div className="flex items-center gap-2 font-semibold text-blue-900">
              <CheckSquare className="w-4 h-4 text-blue-600" />
              <span>{selectedPlayerKeys.size} player(s) selected:</span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-slate-500 font-medium">Status:</span>
              <button
                onClick={() => handleBulkStatusChange('present')}
                className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-semibold transition"
              >
                ✓ Present
              </button>
              <button
                onClick={() => handleBulkStatusChange('absent')}
                className="px-2 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded font-semibold transition"
              >
                ⏸ Absent
              </button>
              <button
                onClick={() => handleBulkStatusChange('withdrawn')}
                className="px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded font-semibold transition"
              >
                ✕ Withdrawn
              </button>

              <div className="h-4 w-px bg-blue-200 mx-1" />

              <span className="text-slate-500 font-medium">FED:</span>
              <select
                value={bulkFedCode}
                onChange={e => setBulkFedCode(e.target.value)}
                className="px-2 py-1 bg-white border border-slate-300 rounded text-slate-800 font-mono font-semibold"
              >
                {FEDERATIONS.map(([code]) => (
                  <option key={code} value={code}>{code}</option>
                ))}
              </select>
              <button
                onClick={handleBulkFederationApply}
                className="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-semibold transition"
              >
                Apply FED
              </button>

              <div className="h-4 w-px bg-blue-200 mx-1" />

              <button
                onClick={handleBulkDelete}
                className="px-2 py-1 bg-rose-100 hover:bg-rose-200 text-rose-800 border border-rose-300 rounded font-semibold transition flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                <span>Delete Selected</span>
              </button>

              <button
                onClick={() => setSelectedPlayerKeys(new Set())}
                className="px-2 py-1 text-slate-500 hover:text-slate-800 font-medium transition"
              >
                Clear
              </button>
            </div>
          </div>
        )}

        {/* Search & Sort Toolstrip */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
            <input
              type="text"
              value={listFilter}
              onChange={e => setListFilter(e.target.value)}
              placeholder="Filter registered competitors..."
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none transition"
            />
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <span className="text-slate-500 font-medium">View Sort:</span>
            <select
              value={sortMode}
              onChange={e => setSortMode(e.target.value as any)}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 font-medium focus:outline-none"
            >
              <option value="rating">Assigned Rank / Rating ↓</option>
              <option value="initialSort">Initial Sort Order (Pre-Lock)</option>
              <option value="name">Name A-Z</option>
              <option value="birth">Date of Birth</option>
            </select>
          </div>
        </div>

        {/* Table Frame */}
        <div className="border border-slate-200 rounded-lg overflow-x-auto bg-white">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-semibold font-mono">
                <th className="py-2.5 px-3 w-8 text-center">
                  <button
                    onClick={handleToggleSelectAll}
                    className="text-slate-500 hover:text-slate-800"
                    title={selectedPlayerKeys.size === visiblePlayers.length ? 'Deselect all' : 'Select all'}
                  >
                    {selectedPlayerKeys.size > 0 && selectedPlayerKeys.size === visiblePlayers.length ? (
                      <CheckSquare className="w-4 h-4 text-blue-600" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-400" />
                    )}
                  </button>
                </th>
                <th className="py-2.5 px-3 w-12 text-center" title="Assigned Pairing Number / Rank">No.</th>
                <th className="py-2.5 px-3 w-16 text-center" title="Initial Sort Order (Deterministic rating/title/national ranking)">Seed</th>
                <th className="py-2.5 px-3 w-36 text-center">Status</th>
                <th className="py-2.5 px-3">Player Name</th>
                <th className="py-2.5 px-3 w-16">Title</th>
                <th className="py-2.5 px-3 w-16 text-right">Rating</th>
                <th className="py-2.5 px-3 w-14 text-center">FED</th>
                <th className="py-2.5 px-3 w-28">FIDE ID</th>
                <th className="py-2.5 px-3 w-20">Birth</th>
                <th className="py-2.5 px-3 w-24 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visiblePlayers.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-8 text-center text-slate-400">
                    No competitors registered yet. Add players manually or from the FIDE directory above.
                  </td>
                </tr>
              ) : (
                visiblePlayers.map(p => {
                  const isSelected = selectedPlayerKeys.has(p.localKey);
                  const isAbsent = p.attendance === 'absent';
                  const isWithdrawn = p.attendance === 'withdrawn';
                  const requestedByes = p.requestedByes || {};
                  const byeKeys = Object.keys(requestedByes);

                  return (
                    <tr
                      key={p.localKey}
                      className={`hover:bg-slate-50 transition ${
                        isSelected 
                          ? 'bg-blue-50/60' 
                          : isWithdrawn 
                          ? 'bg-rose-50/40 text-slate-500' 
                          : isAbsent 
                          ? 'bg-amber-50/40 text-slate-700' 
                          : 'text-slate-800'
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-2 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelectPlayer(p.localKey)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                      </td>

                      {/* Official Assigned Pairing Number */}
                      <td className="py-2 px-3 text-center font-mono font-bold text-slate-700">
                        {p.pairingNumber}
                      </td>

                      {/* Initial Deterministic Seed Sort */}
                      <td className="py-2 px-3 text-center font-mono text-slate-400 font-medium">
                        {p.initialSortOrder || p.pairingNumber}
                      </td>

                      {/* Presence Toggle Buttons (Present, Absent, Withdrawn) */}
                      <td className="py-2 px-3 text-center">
                        <div className="inline-flex rounded-lg border border-slate-300 bg-slate-100 p-0.5 text-[10px]">
                          <button
                            onClick={() => handleToggleAttendance(p.localKey, 'present')}
                            className={`px-1.5 py-0.5 rounded font-semibold transition ${
                              !isAbsent && !isWithdrawn
                                ? 'bg-emerald-600 text-white shadow-xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                            title="Mark Present"
                          >
                            ✓ Pres
                          </button>
                          <button
                            onClick={() => handleToggleAttendance(p.localKey, 'absent')}
                            className={`px-1.5 py-0.5 rounded font-semibold transition ${
                              isAbsent
                                ? 'bg-amber-600 text-white shadow-xs'
                                : 'text-slate-600 hover:text-amber-700'
                            }`}
                            title="Mark Absent for upcoming round"
                          >
                            ⏸ Abs
                          </button>
                          <button
                            onClick={() => handleToggleAttendance(p.localKey, 'withdrawn')}
                            className={`px-1.5 py-0.5 rounded font-semibold transition ${
                              isWithdrawn
                                ? 'bg-rose-600 text-white shadow-xs'
                                : 'text-slate-600 hover:text-rose-700'
                            }`}
                            title="Withdraw from tournament"
                          >
                            ✕ Withdr
                          </button>
                        </div>
                      </td>

                      {/* Player Name */}
                      <td className="py-2 px-3 font-semibold text-slate-900">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span>{getFederationFlag(p.fed)}</span>
                          <span className={isWithdrawn ? 'line-through text-slate-400' : isAbsent ? 'text-amber-800' : ''}>
                            {p.name}
                          </span>

                          {p.joinedFromRound > 1 && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-100 border border-amber-200 text-amber-900 font-mono font-bold">
                              Late R{p.joinedFromRound}+
                            </span>
                          )}

                          {byeKeys.map(rStr => (
                            <span
                              key={rStr}
                              className="text-[9px] px-1 py-0.2 rounded bg-blue-50 border border-blue-200 text-blue-800 font-mono font-bold"
                              title={`Requested Bye: Round ${rStr} (${requestedByes[rStr] === 'half' ? '½ Bye' : '0 Bye'})`}
                            >
                              {requestedByes[rStr] === 'half' ? '½' : '0'}B R{rStr}
                            </span>
                          ))}
                        </div>
                      </td>

                      {/* Title */}
                      <td className="py-2 px-3 font-bold text-amber-700">
                        {p.title || '—'}
                      </td>

                      {/* Rating */}
                      <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                        {p.rating}
                      </td>

                      {/* Federation */}
                      <td className="py-2 px-3 text-center font-mono font-medium text-slate-600">
                        {p.fed}
                      </td>

                      {/* FIDE ID */}
                      <td className="py-2 px-3 font-mono text-slate-600">
                        {p.fideId && p.fideId !== '-' ? (
                          <a
                            href={`https://ratings.fide.com/profile/${p.fideId}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-blue-600 hover:underline flex items-center gap-1"
                          >
                            {p.fideId} <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>

                      {/* Birth */}
                      <td className="py-2 px-3 font-mono text-slate-500">
                        {p.birth || '—'}
                      </td>

                      {/* Actions */}
                      <td className="py-2 px-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {/* Requested Byes Button */}
                          <button
                            onClick={() => setByesTargetPlayer(p)}
                            className="p-1 hover:bg-blue-50 text-slate-500 hover:text-blue-600 rounded transition"
                            title="Manage Requested Byes"
                          >
                            <Calendar className="w-3.5 h-3.5" />
                          </button>

                          {/* Sync with FIDE */}
                          <button
                            id={`sync-player-btn-${p.localKey}`}
                            type="button"
                            onClick={() => {
                              setSyncTargetKey(p.localKey);
                              setIsSyncModalOpen(true);
                            }}
                            className="p-1 hover:bg-indigo-50 text-slate-500 hover:text-indigo-600 rounded transition"
                            title={`Sync ${p.name} with FIDE`}
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </button>

                          {/* Edit Player */}
                          <button
                            onClick={() => setEditingPlayer({ ...p })}
                            className="p-1 hover:bg-slate-200 text-slate-500 hover:text-blue-600 rounded transition"
                            title="Edit Player"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete Player */}
                          <button
                            onClick={() => handleDeletePlayer(p.localKey)}
                            className="p-1 hover:bg-rose-100 text-slate-400 hover:text-rose-600 rounded transition"
                            title="Delete Player (Safely blocks players with game history)"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Edit Player Modal */}
      {editingPlayer && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl shadow-2xl w-full max-w-lg p-5 animate-in fade-in zoom-in-95 duration-150 text-slate-800">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2 mb-4">
              <Edit3 className="w-5 h-5 text-blue-600" />
              Edit Player: {editingPlayer.name}
            </h3>

            <form onSubmit={handleSaveEditedPlayer} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1">
                  <label className="font-semibold text-slate-700">Name</label>
                  <input
                    type="text"
                    required
                    value={editingPlayer.name}
                    onChange={e => setEditingPlayer({ ...editingPlayer, name: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Rating</label>
                  <input
                    type="number"
                    min="0"
                    max="3500"
                    value={editingPlayer.rating}
                    onChange={e => setEditingPlayer({ ...editingPlayer, rating: parseInt(e.target.value, 10) || 0 })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 font-bold focus:outline-none focus:border-blue-500 focus:bg-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">FIDE Title</label>
                  <select
                    value={editingPlayer.title}
                    onChange={e => setEditingPlayer({ ...editingPlayer, title: e.target.value as FideTitle })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
                  >
                    <option value="">No Title</option>
                    <option value="GM">GM</option>
                    <option value="IM">IM</option>
                    <option value="WGM">WGM</option>
                    <option value="FM">FM</option>
                    <option value="WIM">WIM</option>
                    <option value="CM">CM</option>
                    <option value="WFM">WFM</option>
                    <option value="WCM">WCM</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Federation</label>
                  <select
                    value={editingPlayer.fed}
                    onChange={e => setEditingPlayer({ ...editingPlayer, fed: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
                  >
                    {FEDERATIONS.map(([code, name]) => (
                      <option key={code} value={code}>{getFederationFlag(code)} {code} — {name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">FIDE ID</label>
                  <input
                    type="text"
                    value={editingPlayer.fideId}
                    onChange={e => setEditingPlayer({ ...editingPlayer, fideId: e.target.value.replace(/\D/g, '') })}
                    className={`w-full px-3 py-2 bg-slate-50 border rounded-lg text-slate-900 font-mono focus:outline-none focus:bg-white ${
                      duplicateEditPlayer ? 'border-rose-400 focus:border-rose-500' : 'border-slate-300 focus:border-blue-500'
                    }`}
                  />
                  {duplicateEditPlayer && (
                    <p className="text-[10px] text-rose-600 font-medium">
                      ⚠️ Duplicate FIDE ID: Already held by "{duplicateEditPlayer.name}".
                    </p>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Birth Date</label>
                  <input
                    type="text"
                    value={editingPlayer.birth}
                    onChange={e => setEditingPlayer({ ...editingPlayer, birth: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 font-mono focus:outline-none focus:border-blue-500 focus:bg-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Gender</label>
                  <select
                    value={editingPlayer.gender}
                    onChange={e => setEditingPlayer({ ...editingPlayer, gender: e.target.value as Gender })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
                  >
                    <option value="m">Male (m)</option>
                    <option value="f">Female (f)</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    setSyncTargetKey(editingPlayer.localKey);
                    setIsSyncModalOpen(true);
                  }}
                  className="px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg font-semibold flex items-center gap-1.5 transition"
                  title="Preview and synchronize this player with FIDE"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Sync with FIDE</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingPlayer(null)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={Boolean(duplicateEditPlayer)}
                    className={`px-4 py-2 rounded-lg font-semibold transition shadow-sm ${
                      duplicateEditPlayer ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Blocked History Deletion Notice Modal */}
      {blockedHistoryNotice && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">
                  Cannot Delete Competitor With History
                </h4>
                <p className="text-xs text-slate-600 mt-1">
                  <b>{blockedHistoryNotice.name}</b> has played games or pairings in this tournament. FIDE regulations prohibit removing competitors with existing tournament records.
                </p>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs space-y-1 font-mono text-slate-700 max-h-32 overflow-y-auto">
              <div className="font-bold text-[11px] text-slate-500 font-sans mb-1">Existing Record(s):</div>
              {blockedHistoryNotice.reasons.map((r, i) => (
                <div key={i} className="text-[11px]">• {r}</div>
              ))}
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900">
              💡 <b>Recommended Action:</b> Change player status to <b>Withdrawn</b> or <b>Absent</b> to prevent pairings in future rounds while preserving tournament history.
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setBlockedHistoryNotice(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold shadow-xs transition"
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Requested Byes Modal */}
      {byesTargetPlayer && (
        <RequestedByesModal
          tournament={tournament}
          player={byesTargetPlayer}
          onClose={() => setByesTargetPlayer(null)}
          onUpdateTournament={onUpdateTournament}
        />
      )}

      {/* FIDE Synchronization Modal */}
      <FideSyncModal
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
        tournament={tournament}
        onUpdateTournament={updated => onUpdateTournament(() => updated)}
        targetPlayerKey={syncTargetKey}
        onTriggerResort={onResortStartingList}
      />
    </div>
  );
};
