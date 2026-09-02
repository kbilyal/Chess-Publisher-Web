import React, { useState, useEffect, useRef } from 'react';
import { Tournament, Player, FideTitle, Gender, Attendance } from '../types';
import { FEDERATIONS, getFederationFlag } from '../data/initialData';
import { FideDatabaseStatus } from './FideDatabaseStatus';
import { FidePlayerRecord } from '../server/fide/types';
import { 
  Users, UserPlus, Search, ArrowUpDown, Check, X, 
  Trash2, Edit3, ShieldAlert, Sparkles, RefreshCw, ExternalLink, Loader2
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
  const [fideSearchQuery, setFideSearchQuery] = useState('');
  const [fideResults, setFideResults] = useState<FidePlayerRecord[]>([]);
  const [isSearchingFide, setIsSearchingFide] = useState(false);
  const [fideSearchNotice, setFideSearchNotice] = useState<string | null>(null);

  const [listFilter, setListFilter] = useState('');
  const [sortMode, setSortMode] = useState<'rating' | 'name' | 'birth'>('rating');

  // Manual Player Add Form
  const [manualName, setManualName] = useState('');
  const [manualRating, setManualRating] = useState('0');
  const [manualTitle, setManualTitle] = useState<FideTitle>('');
  const [manualFed, setManualFed] = useState('BUL');
  const [manualFideId, setManualFideId] = useState('');
  const [manualBirth, setManualBirth] = useState('');
  const [manualGender, setManualGender] = useState<Gender>('m');

  // Edit Player Modal State
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);

  const players = tournament.players || [];
  const latestRound = Object.keys(tournament.pairings.liveBoards || {}).length;
  const isStarted = latestRound > 0;

  // Search real authoritative FIDE backend API with debouncing
  const searchTimeoutRef = useRef<any>(null);

  useEffect(() => {
    const q = fideSearchQuery.trim();
    if (q.length < 2) {
      setFideResults([]);
      setIsSearchingFide(false);
      setFideSearchNotice(null);
      return;
    }

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    setIsSearchingFide(true);
    setFideSearchNotice(null);

    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/fide/search?q=${encodeURIComponent(q)}&limit=50`);
        if (res.ok) {
          const data = await res.json();
          setFideResults(data.players || []);
          if (data.players && data.players.length === 0) {
            setFideSearchNotice('No FIDE players matched your search criteria.');
          }
        } else {
          setFideResults([]);
          setFideSearchNotice('FIDE database query returned an error.');
        }
      } catch (err: any) {
        setFideResults([]);
        setFideSearchNotice('Unable to connect to FIDE search service.');
      } finally {
        setIsSearchingFide(false);
      }
    }, 250);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [fideSearchQuery]);

  const handleAddFidePlayer = (p: FidePlayerRecord) => {
    const fideIdStr = String(p.fideId);
    if (players.some(x => x.fideId === fideIdStr && fideIdStr !== '-')) {
      alert(`Player "${p.name}" (FIDE ID: ${p.fideId}) is already registered.`);
      return;
    }

    // Map rating deterministically to tournament's Rating Type
    let effectiveRating = p.ratingStandard;
    if (tournament.ratingType === 'Rapid' && p.ratingRapid > 0) {
      effectiveRating = p.ratingRapid;
    } else if (tournament.ratingType === 'Blitz' && p.ratingBlitz > 0) {
      effectiveRating = p.ratingBlitz;
    } else if (p.ratingStandard > 0) {
      effectiveRating = p.ratingStandard;
    } else {
      effectiveRating = p.ratingRapid || p.ratingBlitz || 0;
    }

    const nextNo = players.length + 1;
    const newPlayer: Player = {
      id: nextNo,
      localKey: `local:${p.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now()}`,
      name: p.name,
      rating: effectiveRating,
      stdRating: p.ratingStandard,
      rapidRating: p.ratingRapid,
      blitzRating: p.ratingBlitz,
      nationalRating: effectiveRating,
      fed: p.federation || 'FID',
      fideId: fideIdStr,
      birth: p.birth || '-',
      gender: (p.gender || '') as Gender,
      title: (p.title || '') as FideTitle,
      attendance: 'present',
      pairingNumber: nextNo,
      joinedFromRound: isStarted ? latestRound + 1 : 1,
      fideK: effectiveRating >= 2400 ? 10 : 20,
      club: p.federation === 'BUL' ? 'Arda Chess Club' : 'International'
    };

    onUpdateTournament(prev => ({
      ...prev,
      players: [...prev.players, newPlayer],
      pairings: {
        ...prev.pairings,
        engine: {
          ...prev.pairings.engine,
          needsResort: isStarted
        }
      }
    }));
  };

  const handleAddManualPlayer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualName.trim()) return;

    const nextNo = players.length + 1;
    const newPlayer: Player = {
      id: nextNo,
      localKey: `local:${manualName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now()}`,
      name: manualName.trim(),
      rating: parseInt(manualRating) || 0,
      fed: manualFed.toUpperCase(),
      fideId: manualFideId.trim() || '-',
      birth: manualBirth.trim() || '-',
      gender: manualGender,
      title: manualTitle,
      attendance: 'present',
      pairingNumber: nextNo,
      joinedFromRound: isStarted ? latestRound + 1 : 1,
      fideK: (parseInt(manualRating) || 0) >= 2400 ? 10 : 20
    };

    onUpdateTournament(prev => ({
      ...prev,
      players: [...prev.players, newPlayer],
      pairings: {
        ...prev.pairings,
        engine: {
          ...prev.pairings.engine,
          needsResort: isStarted
        }
      }
    }));

    // Reset Form
    setManualName('');
    setManualRating('0');
    setManualTitle('');
    setManualFideId('');
    setManualBirth('');
  };

  const handleToggleAttendance = (localKey: string, current: Attendance) => {
    const nextAttendance: Attendance = current === 'present' ? 'absent' : 'present';
    onUpdateTournament(prev => ({
      ...prev,
      players: prev.players.map(p => p.localKey === localKey ? { ...p, attendance: nextAttendance } : p)
    }));
  };

  const handleDeletePlayer = (localKey: string) => {
    if (isStarted) {
      alert("Cannot delete players after pairings have started. Set player attendance to 'Absent' to exclude from future rounds.");
      return;
    }

    if (!window.confirm("Remove player from tournament?")) return;

    const filtered = players.filter(p => p.localKey !== localKey).map((p, idx) => ({
      ...p,
      id: idx + 1,
      pairingNumber: idx + 1
    }));

    onUpdateTournament(prev => ({
      ...prev,
      players: filtered
    }));
  };

  const handleSaveEditedPlayer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlayer) return;

    onUpdateTournament(prev => ({
      ...prev,
      players: prev.players.map(p => p.localKey === editingPlayer.localKey ? editingPlayer : p)
    }));

    setEditingPlayer(null);
  };

  // Filter and Sort Player List
  const visiblePlayers = [...players]
    .filter(p => {
      if (!listFilter.trim()) return true;
      const q = listFilter.toLowerCase();
      return p.name.toLowerCase().includes(q) || p.fed.toLowerCase().includes(q) || p.fideId.includes(q);
    })
    .sort((a, b) => {
      if (sortMode === 'rating') {
        if (b.rating !== a.rating) return b.rating - a.rating;
        return a.name.localeCompare(b.name);
      }
      if (sortMode === 'name') return a.name.localeCompare(b.name);
      if (sortMode === 'birth') return (b.birth || '').localeCompare(a.birth || '');
      return 0;
    });

  const presentCount = players.filter(p => p.attendance !== 'absent').length;
  const absentCount = players.filter(p => p.attendance === 'absent').length;

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6 animate-in fade-in duration-200 text-slate-800">
      {/* 0. Authoritative FIDE Rating Database Status Panel */}
      <FideDatabaseStatus />

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
              Single Add
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
                <label className="font-semibold text-slate-700">FIDE ID</label>
                <input
                  type="text"
                  value={manualFideId}
                  onChange={e => setManualFideId(e.target.value.replace(/\D/g, ''))}
                  placeholder="e.g. 5000017"
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 font-mono focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none transition"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Birth (YYYY or YYYY-MM-DD)</label>
                <input
                  type="text"
                  value={manualBirth}
                  onChange={e => setManualBirth(e.target.value)}
                  placeholder="e.g. 1990 or 1990-11-30"
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

            <button
              type="submit"
              className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold shadow-sm transition flex items-center justify-center gap-1.5 mt-2"
            >
              <UserPlus className="w-4 h-4" />
              <span>Add Player to Roster</span>
            </button>
          </form>
        </div>

        {/* FIDE Rating Database Directory Quick Lookup */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4 flex flex-col">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Search className="w-4 h-4 text-emerald-600" />
              FIDE Official Rating Directory Search
            </h2>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 font-semibold">
              Indexed Search
            </span>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
            <input
              type="text"
              value={fideSearchQuery}
              onChange={e => setFideSearchQuery(e.target.value)}
              placeholder="Search FIDE player by name, ID, or FED (e.g. Carlsen, Anand, 2905540)..."
              className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 focus:outline-none transition"
            />
            {isSearchingFide && (
              <Loader2 className="w-4 h-4 text-emerald-600 animate-spin absolute right-3 top-2.5" />
            )}
          </div>

          {/* Results List */}
          <div className="flex-1 min-h-[160px] max-h-[220px] overflow-y-auto border border-slate-200 rounded-lg bg-slate-50 divide-y divide-slate-200 text-xs">
            {isSearchingFide && fideResults.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-6 text-center text-slate-500">
                <Loader2 className="w-6 h-6 animate-spin text-emerald-600 mb-2" />
                <span>Searching official FIDE database...</span>
              </div>
            ) : fideResults.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-6 text-center text-slate-400">
                <Users className="w-8 h-8 mb-2 opacity-40" />
                <span>{fideSearchNotice || 'Type at least 2 characters to search the FIDE player directory.'}</span>
              </div>
            ) : (
              fideResults.map(p => {
                const alreadyRegistered = players.some(x => x.fideId === String(p.fideId) && String(p.fideId) !== '-');
                return (
                  <div
                    key={p.fideId}
                    className="p-2.5 flex items-center justify-between hover:bg-slate-100 transition gap-3"
                  >
                    <div className="min-w-0">
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
                      </div>
                      <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5 font-mono">
                        <span>STD: <b className="text-slate-800">{p.ratingStandard || '—'}</b></span>
                        <span>RAP: <b className="text-slate-800">{p.ratingRapid || '—'}</b></span>
                        <span>BLZ: <b className="text-slate-800">{p.ratingBlitz || '—'}</b></span>
                        <span>ID: {p.fideId}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleAddFidePlayer(p)}
                      disabled={alreadyRegistered}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex-shrink-0 transition ${
                        alreadyRegistered
                          ? 'bg-slate-200 text-slate-500 cursor-not-allowed border border-slate-300'
                          : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
                      }`}
                    >
                      {alreadyRegistered ? 'Added' : '+ Add Player'}
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
                <span className="px-2 py-0.5 rounded bg-rose-50 border border-rose-200 text-rose-800 font-semibold">
                  🔴 {absentCount} Absent
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Resort Button */}
            <button
              onClick={onResortStartingList}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg text-xs font-semibold shadow-sm flex items-center gap-1.5 transition"
              title="Recalculate Starting Numbers based on FIDE ratings and titles without breaking past rounds"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Resort Starting List</span>
            </button>
          </div>
        </div>

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
              <option value="rating">Starting Rank / Rating ↓</option>
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
                <th className="py-2.5 px-3 w-12 text-center">No.</th>
                <th className="py-2.5 px-3 w-32 text-center">Presence</th>
                <th className="py-2.5 px-3">Player Name</th>
                <th className="py-2.5 px-3 w-20">Title</th>
                <th className="py-2.5 px-3 w-20 text-right">Rating</th>
                <th className="py-2.5 px-3 w-16 text-center">FED</th>
                <th className="py-2.5 px-3 w-28">FIDE ID</th>
                <th className="py-2.5 px-3 w-24">Birth</th>
                <th className="py-2.5 px-3 w-20 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visiblePlayers.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">
                    No competitors registered yet. Add players manually or from the FIDE directory above.
                  </td>
                </tr>
              ) : (
                visiblePlayers.map(p => {
                  const isAbsent = p.attendance === 'absent';
                  return (
                    <tr
                      key={p.localKey}
                      className={`hover:bg-slate-50 transition ${
                        isAbsent ? 'bg-rose-50/50 text-rose-800' : 'text-slate-800'
                      }`}
                    >
                      <td className="py-2 px-3 text-center font-mono font-bold text-slate-500">
                        {p.pairingNumber}
                      </td>

                      {/* Presence Toggle Buttons */}
                      <td className="py-2 px-3 text-center">
                        <div className="inline-flex rounded-lg border border-slate-300 bg-slate-100 p-0.5 text-[11px]">
                          <button
                            onClick={() => handleToggleAttendance(p.localKey, 'absent')}
                            className={`px-2 py-0.5 rounded font-semibold transition ${
                              !isAbsent
                                ? 'bg-emerald-600 text-white shadow-sm'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            ✓ Pres.
                          </button>
                          <button
                            onClick={() => handleToggleAttendance(p.localKey, 'present')}
                            className={`px-2 py-0.5 rounded font-semibold transition ${
                              isAbsent
                                ? 'bg-rose-600 text-white shadow-sm'
                                : 'text-slate-600 hover:text-rose-700'
                            }`}
                          >
                            ✕ Abs.
                          </button>
                        </div>
                      </td>

                      <td className="py-2 px-3 font-semibold text-slate-900">
                        <div className="flex items-center gap-1.5">
                          <span>{getFederationFlag(p.fed)}</span>
                          <span className={isAbsent ? 'line-through opacity-70' : ''}>{p.name}</span>
                          {p.joinedFromRound > 1 && (
                            <span className="text-[10px] px-1 rounded bg-amber-50 border border-amber-200 text-amber-800 font-mono font-semibold">
                              Late R{p.joinedFromRound}+
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-2 px-3 font-bold text-amber-700">
                        {p.title || '—'}
                      </td>

                      <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                        {p.rating}
                      </td>

                      <td className="py-2 px-3 text-center font-mono font-medium text-slate-600">
                        {p.fed}
                      </td>

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

                      <td className="py-2 px-3 font-mono text-slate-500">
                        {p.birth || '—'}
                      </td>

                      <td className="py-2 px-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => setEditingPlayer({ ...p })}
                            className="p-1 hover:bg-slate-200 text-slate-500 hover:text-blue-600 rounded transition"
                            title="Edit Player"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeletePlayer(p.localKey)}
                            disabled={isStarted}
                            className={`p-1 rounded transition ${
                              isStarted
                                ? 'text-slate-300 cursor-not-allowed'
                                : 'hover:bg-rose-100 text-slate-400 hover:text-rose-600'
                            }`}
                            title={isStarted ? "Locked after pairing starts" : "Delete Player"}
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
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
                    onChange={e => setEditingPlayer({ ...editingPlayer, rating: parseInt(e.target.value) || 0 })}
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
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 font-mono focus:outline-none focus:border-blue-500 focus:bg-white"
                  />
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

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditingPlayer(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition shadow-sm"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
