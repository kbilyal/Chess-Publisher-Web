import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpDown, Check, Loader2, Search, Trash2, UserPlus, Users, X } from 'lucide-react';
import { Attendance, FideTitle, Gender, Tournament } from '../types';
import { FidePlayerRecord } from '../server/fide/types';
import { TransactionManager } from '../transactions/TransactionManager';
import {
  executeBulkStatusTransaction,
  executeDeletePlayerTransaction,
  executeRegisterPlayerTransaction,
  isStartingRankLocked
} from '../transactions/playerWorkflow';
import { searchFideBrowserDatabase } from './fideBrowserDatabase';

interface Props {
  tournament: Tournament;
  onUpdateTournament: (updater: (previous: Tournament) => Tournament) => void;
}

type Notice = { kind: 'ok' | 'warn' | 'error'; text: string } | null;

const ratingFor = (record: FidePlayerRecord, type: 'Standard' | 'Rapid' | 'Blitz') =>
  type === 'Rapid' ? Number(record.ratingRapid || 0) : type === 'Blitz' ? Number(record.ratingBlitz || 0) : Number(record.ratingStandard || 0);

async function searchFidePlayers(query: string, ratingType: 'Standard' | 'Rapid' | 'Blitz') {
  try {
    const response = await fetch(`/api/fide/search?limit=20&tournamentType=${encodeURIComponent(ratingType)}&filterRating=all&q=${encodeURIComponent(query)}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (Array.isArray(payload?.players)) return { players: payload.players as FidePlayerRecord[], source: 'service' as const };
  } catch {
    // Static production is intentionally allowed to fall through to the same
    // official SQLite database shipped with the Web artifact. This keeps
    // registration functional without introducing a second player-data source.
  }
  const players = await searchFideBrowserDatabase(query, ratingType, 20);
  return { players, source: 'static-db' as const };
}

export const CompanionRegistration: React.FC<Props> = ({ tournament, onUpdateTournament }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FidePlayerRecord[]>([]);
  const [searching, setSearching] = useState(false);
  const [listQuery, setListQuery] = useState('');
  const [sortMode, setSortMode] = useState<'starting' | 'rating' | 'name'>('starting');
  const [notice, setNotice] = useState<Notice>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [busyKey, setBusyKey] = useState('');
  const [manual, setManual] = useState({ name: '', fideId: '', fed: 'BUL', rating: '', birth: '', title: '' as FideTitle, gender: 'm' as Gender });
  const debounceRef = useRef<number | null>(null);

  const players = tournament.players || [];
  const ratingType: 'Standard' | 'Rapid' | 'Blitz' = tournament.settings.tournamentRatingType === 'Rapid'
    ? 'Rapid'
    : tournament.settings.tournamentRatingType === 'Blitz'
      ? 'Blitz'
      : 'Standard';
  const rankLocked = isStartingRankLocked(tournament);
  const latestRound = Object.keys(tournament.pairings?.liveBoards || {}).map(Number).filter(Number.isFinite).reduce((max, value) => Math.max(max, value), 0);

  useEffect(() => {
    const q = query.trim();
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = window.setTimeout(async () => {
      try {
        const result = await searchFidePlayers(q, ratingType);
        setResults(result.players);
        if (!result.players.length) setNotice({ kind: 'warn', text: 'No FIDE players found. You can add the player manually.' });
        else if (result.source === 'static-db') setNotice({ kind: 'ok', text: 'FIDE search is using the locally cached official rating database.' });
      } catch {
        setResults([]);
        setNotice({ kind: 'warn', text: 'FIDE search is unavailable. Manual registration remains available.' });
      } finally {
        setSearching(false);
      }
    }, 220);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query, ratingType]);

  const filteredPlayers = useMemo(() => {
    const q = listQuery.trim().toLowerCase();
    const visible = [...players].filter(player =>
      !q || [player.name, player.fideId, player.fed, player.club]
        .some(value => String(value || '').toLowerCase().includes(q))
    );
    return visible.sort((a, b) => {
      if (sortMode === 'rating') {
        if (Number(b.rating || 0) !== Number(a.rating || 0)) return Number(b.rating || 0) - Number(a.rating || 0);
        const byName = String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
        return byName || a.pairingNumber - b.pairingNumber;
      }
      if (sortMode === 'name') {
        const byName = String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
        if (byName) return byName;
        if (Number(b.rating || 0) !== Number(a.rating || 0)) return Number(b.rating || 0) - Number(a.rating || 0);
        return a.pairingNumber - b.pairingNumber;
      }
      return a.pairingNumber - b.pairingNumber;
    });
  }, [players, listQuery, sortMode]);

  const commitTournament = (next: Tournament) => onUpdateTournament(() => next);

  const registerFide = async (record: FidePlayerRecord) => {
    const key = `fide:${record.fideId}`;
    setBusyKey(key);
    setNotice(null);
    try {
      const manager = new TransactionManager<Tournament>();
      const result = await executeRegisterPlayerTransaction(manager, tournament, {
        name: record.name,
        rating: ratingFor(record, ratingType),
        stdRating: Number(record.ratingStandard || 0),
        rapidRating: Number(record.ratingRapid || 0),
        blitzRating: Number(record.ratingBlitz || 0),
        fed: record.federation || 'FID',
        fideId: String(record.fideId),
        birth: record.birth ? String(record.birth) : '-',
        gender: record.gender?.toLowerCase() === 'w' ? 'f' : ((record.gender || 'm') as Gender),
        title: (record.title || '') as FideTitle,
        attendance: 'present'
      }, {
        joinedFromRound: rankLocked ? latestRound + 1 : 1,
        lateEntryByeType: 'zero'
      });
      commitTournament(result.tournament);
      setNotice({ kind: 'ok', text: `${record.name} registered as #${result.player.pairingNumber}.` });
      setQuery('');
      setResults([]);
    } catch (error: any) {
      setNotice({ kind: 'error', text: error?.message || 'Player registration failed.' });
    } finally {
      setBusyKey('');
    }
  };

  const registerManual = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!manual.name.trim()) return;
    setBusyKey('manual');
    setNotice(null);
    try {
      const manager = new TransactionManager<Tournament>();
      const rating = Math.max(0, Number.parseInt(manual.rating || '0', 10) || 0);
      const result = await executeRegisterPlayerTransaction(manager, tournament, {
        name: manual.name.trim(),
        rating,
        stdRating: ratingType === 'Standard' ? rating : 0,
        rapidRating: ratingType === 'Rapid' ? rating : 0,
        blitzRating: ratingType === 'Blitz' ? rating : 0,
        fed: manual.fed.trim().toUpperCase() || 'FID',
        fideId: manual.fideId.trim() || '-',
        birth: manual.birth.trim() || '-',
        title: manual.title,
        gender: manual.gender,
        attendance: 'present'
      }, {
        joinedFromRound: rankLocked ? latestRound + 1 : 1,
        lateEntryByeType: 'zero'
      });
      commitTournament(result.tournament);
      setManual({ name: '', fideId: '', fed: 'BUL', rating: '', birth: '', title: '', gender: 'm' });
      setManualOpen(false);
      setNotice({ kind: 'ok', text: `${result.player.name} registered as #${result.player.pairingNumber}.` });
    } catch (error: any) {
      setNotice({ kind: 'error', text: error?.message || 'Manual registration failed.' });
    } finally {
      setBusyKey('');
    }
  };

  const updateAttendance = async (localKey: string, attendance: Attendance) => {
    setBusyKey(`attendance:${localKey}`);
    try {
      const manager = new TransactionManager<Tournament>();
      const result = await executeBulkStatusTransaction(manager, tournament, [localKey], attendance);
      commitTournament(result.tournament);
      setNotice({ kind: 'ok', text: 'Player status updated.' });
    } catch (error: any) {
      setNotice({ kind: 'error', text: error?.message || 'Could not update player status.' });
    } finally {
      setBusyKey('');
    }
  };

  const removePlayer = async (localKey: string, name: string) => {
    if (!window.confirm(`Remove ${name} from this tournament?`)) return;
    setBusyKey(`delete:${localKey}`);
    try {
      const manager = new TransactionManager<Tournament>();
      const result = await executeDeletePlayerTransaction(manager, tournament, localKey);
      commitTournament(result.tournament);
      setNotice({ kind: 'ok', text: `${name} removed.` });
    } catch (error: any) {
      setNotice({ kind: 'error', text: error?.message || 'Player could not be removed.' });
    } finally {
      setBusyKey('');
    }
  };

  return (
    <div className="companion-registration">
      {notice && (
        <div className={`companion-registration-notice ${notice.kind}`}>
          {notice.kind === 'ok' ? <Check size={16} /> : <X size={16} />}
          <span>{notice.text}</span>
        </div>
      )}

      <section className="companion-registration-card companion-registration-search">
        <div className="companion-registration-heading">
          <div><span className="companion-eyebrow">FAST REGISTRATION</span><h2>Find player in FIDE</h2><p>Search by name or FIDE ID, then add with one tap.</p></div>
          <button type="button" className="companion-button secondary" onClick={() => setManualOpen(value => !value)}><UserPlus size={16} /> Manual player</button>
        </div>
        <label className="companion-searchbox">
          <Search size={18} />
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Name or FIDE ID" autoComplete="off" />
          {searching && <Loader2 size={17} className="spin" />}
        </label>

        {results.length > 0 && (
          <div className="companion-fide-results">
            {results.map(record => {
              const alreadyAdded = players.some(player => player.fideId === String(record.fideId));
              const rating = ratingFor(record, ratingType);
              return (
                <div key={record.fideId} className="companion-fide-row">
                  <div className="companion-player-rank">{record.title || '—'}</div>
                  <div className="companion-player-main"><strong>{record.name}</strong><span>{record.federation || 'FID'} · FIDE {record.fideId}</span></div>
                  <div className="companion-player-rating"><strong>{rating || '—'}</strong><span>{ratingType}</span></div>
                  <button type="button" className="companion-button primary compact" disabled={alreadyAdded || busyKey !== ''} onClick={() => void registerFide(record)}>
                    {busyKey === `fide:${record.fideId}` ? <Loader2 size={15} className="spin" /> : <UserPlus size={15} />}
                    {alreadyAdded ? 'Added' : 'Add'}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {manualOpen && (
          <form className="companion-manual-form" onSubmit={registerManual}>
            <div className="companion-manual-grid">
              <label><span>Full name *</span><input value={manual.name} onChange={event => setManual(current => ({ ...current, name: event.target.value }))} required /></label>
              <label><span>FIDE ID</span><input inputMode="numeric" value={manual.fideId} onChange={event => setManual(current => ({ ...current, fideId: event.target.value }))} /></label>
              <label><span>Federation</span><input maxLength={3} value={manual.fed} onChange={event => setManual(current => ({ ...current, fed: event.target.value.toUpperCase() }))} /></label>
              <label><span>{ratingType} rating</span><input inputMode="numeric" value={manual.rating} onChange={event => setManual(current => ({ ...current, rating: event.target.value }))} /></label>
              <label><span>Birth year/date</span><input value={manual.birth} onChange={event => setManual(current => ({ ...current, birth: event.target.value }))} placeholder="YYYY or YYYY-MM-DD" /></label>
              <label><span>Title</span><select value={manual.title} onChange={event => setManual(current => ({ ...current, title: event.target.value as FideTitle }))}><option value="">No title</option>{['GM','IM','WGM','FM','WIM','CM','WFM','WCM'].map(title => <option key={title} value={title}>{title}</option>)}</select></label>
            </div>
            <div className="companion-manual-actions">
              <button type="button" className="companion-button secondary" onClick={() => setManualOpen(false)}>Cancel</button>
              <button type="submit" className="companion-button primary" disabled={busyKey !== '' || !manual.name.trim()}>{busyKey === 'manual' ? <Loader2 size={15} className="spin" /> : <UserPlus size={15} />} Register player</button>
            </div>
          </form>
        )}
      </section>

      <section className="companion-registration-card">
        <div className="companion-registration-heading">
          <div><span className="companion-eyebrow">TOURNAMENT ROSTER</span><h2>Registered players</h2><p>{rankLocked ? `Starting numbers are locked. New players join from round ${latestRound + 1}.` : 'Changes here use the same protected desktop player transactions.'}</p></div>
          <div className="companion-roster-count"><Users size={16} /><strong>{players.length}</strong></div>
        </div>
        <div className="companion-roster-toolbar">
          <label className="companion-searchbox small"><Search size={16} /><input value={listQuery} onChange={event => setListQuery(event.target.value)} placeholder="Filter registered players" /></label>
          <label className="companion-sort-control">
            <ArrowUpDown size={15} />
            <span>Sort view</span>
            <select value={sortMode} onChange={event => setSortMode(event.target.value as 'starting' | 'rating' | 'name')}>
              <option value="starting">Starting #</option>
              <option value="rating">Rating ↓</option>
              <option value="name">Name A–Z</option>
            </select>
          </label>
        </div>
        <div className="companion-sort-note">View only — sorting never changes official starting numbers or pairing numbers.</div>

        <div className="companion-roster-list">
          {filteredPlayers.map(player => (
            <div key={player.localKey} className="companion-roster-row">
              <div className="companion-player-rank">#{player.pairingNumber}</div>
              <div className="companion-player-main"><strong>{player.name}</strong><span>{player.title ? `${player.title} · ` : ''}{player.fed || 'FID'}{player.fideId && player.fideId !== '-' ? ` · FIDE ${player.fideId}` : ''}</span></div>
              <div className="companion-player-rating"><strong>{player.rating || '—'}</strong><span>{ratingType}</span></div>
              <select className="companion-attendance" value={player.attendance} disabled={busyKey !== ''} onChange={event => void updateAttendance(player.localKey, event.target.value as Attendance)} aria-label={`Status for ${player.name}`}>
                <option value="present">Present</option>
                <option value="absent">Absent</option>
                <option value="withdrawn">Withdrawn</option>
              </select>
              <button type="button" className="companion-icon-danger" aria-label={`Remove ${player.name}`} disabled={busyKey !== ''} onClick={() => void removePlayer(player.localKey, player.name)}>
                {busyKey === `delete:${player.localKey}` ? <Loader2 size={16} className="spin" /> : <Trash2 size={16} />}
              </button>
            </div>
          ))}
          {!filteredPlayers.length && <div className="companion-empty-roster">{players.length ? 'No players match this filter.' : 'No players registered yet.'}</div>}
        </div>
      </section>
    </div>
  );
};
