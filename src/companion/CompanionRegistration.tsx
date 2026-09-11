import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpDown, Check, Download, Loader2, RefreshCw, Search, Trash2, UserPlus, Users, X } from 'lucide-react';
import { Attendance, FideTitle, Gender, Tournament } from '../types';
import { FidePlayerRecord } from '../server/fide/types';
import { TransactionManager } from '../transactions/TransactionManager';
import type { FidePlayerSyncSelection } from '../transactions/types';
import { applyFidePlayerSync } from '../transactions/fideSyncWorkflow';
import {
  executeBulkStatusTransaction,
  executeDeletePlayerTransaction,
  executeRegisterPlayerTransaction,
  isStartingRankLocked
} from '../transactions/playerWorkflow';
import { downloadPlayersXml } from '../importers/playersXml';
import { getFideBrowserDatabaseInfo, searchFideBrowserDatabase } from './fideBrowserDatabase';
import { getPlayerPublicationOrder } from '../publication/playerPublicationOrder';

interface Props {
  tournament: Tournament;
  onUpdateTournament: (updater: (previous: Tournament) => Tournament) => void;
}

type Notice = { kind: 'ok' | 'warn' | 'error'; text: string } | null;
type RosterSortMode = 'starting' | 'rating' | 'name';
type FideListInfo = { listVersion: string; label: string; recordCount: number; source: 'service' | 'browser' | 'live' };

const RATING_FIELDS = ['ratingStandard', 'ratingRapid', 'ratingBlitz'] as const;

const ratingFor = (record: FidePlayerRecord, type: 'Standard' | 'Rapid' | 'Blitz') =>
  type === 'Rapid' ? Number(record.ratingRapid || 0) : type === 'Blitz' ? Number(record.ratingBlitz || 0) : Number(record.ratingStandard || 0);

async function searchFidePlayers(query: string, ratingType: 'Standard' | 'Rapid' | 'Blitz') {
  try {
    const response = await fetch(`/api/fide/search?limit=20&tournamentType=${encodeURIComponent(ratingType)}&filterRating=all&q=${encodeURIComponent(query)}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (Array.isArray(payload?.players) && payload.players.length > 0) {
      return { players: payload.players as FidePlayerRecord[], source: 'service' as const };
    }
  } catch {
    // Static production intentionally falls through to the packaged FIDE database
    // and its public FIDE-data fallback.
  }
  const players = await searchFideBrowserDatabase(query, ratingType, 20);
  return { players, source: 'static-db' as const };
}

async function lookupFidePlayerById(fideId: number, ratingType: 'Standard' | 'Rapid' | 'Blitz'): Promise<FidePlayerRecord | null> {
  const query = String(fideId);
  try {
    const response = await fetch(`/api/fide/search?limit=10&tournamentType=${encodeURIComponent(ratingType)}&filterRating=all&q=${encodeURIComponent(query)}`);
    if (response.ok) {
      const payload = await response.json();
      if (Array.isArray(payload?.players)) {
        const exact = (payload.players as FidePlayerRecord[]).find(player => Number(player.fideId) === fideId);
        if (exact) return exact;
      }
    }
  } catch {
    // Continue to browser database / live fallback.
  }

  const browserPlayers = await searchFideBrowserDatabase(query, ratingType, 10);
  return browserPlayers.find(player => Number(player.fideId) === fideId) || null;
}

async function loadFideListInfo(): Promise<FideListInfo> {
  try {
    const response = await fetch('/api/fide/status', { cache: 'no-store' });
    if (response.ok) {
      const status = await response.json();
      const version = String(status?.listVersion || '').trim();
      const recordCount = Number(status?.recordCount || 0);
      if (version && version.toLowerCase() !== 'bootstrap' && recordCount >= 100000) {
        return { listVersion: version, label: version, recordCount, source: 'service' };
      }
    }
  } catch {
    // Static production uses the manifest below.
  }

  const manifest = await getFideBrowserDatabaseInfo();
  const version = String(manifest?.listVersion || '').trim();
  const recordCount = Number(manifest?.recordCount || 0);
  if (version && version.toLowerCase() !== 'bootstrap' && recordCount >= 100000) {
    return { listVersion: version, label: version, recordCount, source: 'browser' };
  }

  return { listVersion: 'live', label: 'Latest available FIDE data', recordCount, source: 'live' };
}

export const CompanionRegistration: React.FC<Props> = ({ tournament, onUpdateTournament }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FidePlayerRecord[]>([]);
  const [searching, setSearching] = useState(false);
  const [listQuery, setListQuery] = useState('');
  const sortMode: RosterSortMode = getPlayerPublicationOrder(tournament);
  const [notice, setNotice] = useState<Notice>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [busyKey, setBusyKey] = useState('');
  const [fideListInfo, setFideListInfo] = useState<FideListInfo | null>(null);
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
  const lastRatingRefresh = (tournament as any).fideRatingRefresh as { listVersion?: string; updatedAt?: string } | undefined;
  const currentListVersion = fideListInfo?.listVersion || '';
  const hasNewMonthlyList = Boolean(
    currentListVersion &&
    currentListVersion !== 'live' &&
    lastRatingRefresh?.listVersion &&
    lastRatingRefresh.listVersion !== 'live' &&
    lastRatingRefresh.listVersion !== currentListVersion
  );

  useEffect(() => {
    let active = true;
    void loadFideListInfo().then(info => {
      if (active) setFideListInfo(info);
    }).catch(() => {
      if (active) setFideListInfo({ listVersion: 'live', label: 'Latest available FIDE data', recordCount: 0, source: 'live' });
    });
    return () => { active = false; };
  }, []);

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

  const handleSortModeChange = (mode: RosterSortMode) => {
    onUpdateTournament(previous => ({
      ...previous,
      settings: { ...(previous.settings as any), playerPublicationOrder: mode } as any
    }));
  };

  const handleExportPlayersXml = () => {
    try {
      downloadPlayersXml(tournament);
      setNotice({ kind: 'ok', text: `Exported ${players.length} players to Players.XML.` });
    } catch (error: any) {
      setNotice({ kind: 'error', text: error?.message || 'Players XML export failed.' });
    }
  };

  const handleRefreshFideRatings = async () => {
    const eligiblePlayers = players.filter(player => {
      const fideId = Number.parseInt(String(player.fideId || '').trim(), 10);
      return Number.isFinite(fideId) && fideId > 0;
    });

    if (!eligiblePlayers.length) {
      setNotice({ kind: 'warn', text: 'No registered players have a valid FIDE ID to update.' });
      return;
    }

    setBusyKey('ratings-refresh');
    setNotice(null);

    try {
      const info = await loadFideListInfo();
      setFideListInfo(info);

      const idCounts = new Map<number, number>();
      eligiblePlayers.forEach(player => {
        const id = Number.parseInt(String(player.fideId || '').trim(), 10);
        idCounts.set(id, (idCounts.get(id) || 0) + 1);
      });

      const authoritativeById = new Map<number, FidePlayerRecord>();
      const selections: FidePlayerSyncSelection[] = [];
      let matchedCount = 0;
      let missingCount = 0;
      let duplicateCount = 0;

      // Intentionally sequential. The browser fallback may use a public API,
      // whose guidance recommends one request at a time.
      for (const player of eligiblePlayers) {
        const fideId = Number.parseInt(String(player.fideId || '').trim(), 10);
        if ((idCounts.get(fideId) || 0) > 1) {
          duplicateCount += 1;
          continue;
        }

        const authoritative = await lookupFidePlayerById(fideId, ratingType);
        if (!authoritative) {
          missingCount += 1;
          continue;
        }

        authoritativeById.set(fideId, authoritative);
        matchedCount += 1;

        const currentStandard = player.stdRating !== undefined ? Number(player.stdRating || 0) : (ratingType === 'Standard' ? Number(player.rating || 0) : 0);
        const currentRapid = player.rapidRating !== undefined ? Number(player.rapidRating || 0) : (ratingType === 'Rapid' ? Number(player.rating || 0) : 0);
        const currentBlitz = player.blitzRating !== undefined ? Number(player.blitzRating || 0) : (ratingType === 'Blitz' ? Number(player.rating || 0) : 0);
        const selectedFields: FidePlayerSyncSelection['selectedFields'] = [];

        if (currentStandard !== Number(authoritative.ratingStandard || 0)) selectedFields.push('ratingStandard');
        if (currentRapid !== Number(authoritative.ratingRapid || 0)) selectedFields.push('ratingRapid');
        if (currentBlitz !== Number(authoritative.ratingBlitz || 0)) selectedFields.push('ratingBlitz');

        if (selectedFields.length) {
          selections.push({ playerKey: player.localKey, selectedFields });
        }
      }

      const refreshMetadata = {
        listVersion: info.listVersion,
        listLabel: info.label,
        source: info.source,
        updatedAt: new Date().toISOString(),
        matchedCount,
        changedCount: selections.length,
        missingCount,
        duplicateCount
      };

      if (!selections.length) {
        const unchangedTournament: Tournament = JSON.parse(JSON.stringify(tournament));
        (unchangedTournament as any).fideRatingRefresh = refreshMetadata;
        commitTournament(unchangedTournament);
        const warnings = [
          missingCount ? `${missingCount} not found` : '',
          duplicateCount ? `${duplicateCount} skipped for duplicate FIDE ID` : ''
        ].filter(Boolean).join(', ');
        setNotice({
          kind: warnings ? 'warn' : 'ok',
          text: `FIDE ratings already match ${info.label}.${warnings ? ` ${warnings}.` : ''}`
        });
        return;
      }

      const result = applyFidePlayerSync(
        tournament,
        selections,
        fideId => authoritativeById.get(fideId) || null,
        { arbiterConfirmed: true, arbiterName: 'Web Organizer' }
      );
      (result.tournament as any).fideRatingRefresh = refreshMetadata;
      commitTournament(result.tournament);

      const unchangedCount = Math.max(0, matchedCount - selections.length);
      const details = [
        `${selections.length} updated`,
        `${unchangedCount} unchanged`,
        missingCount ? `${missingCount} not found` : '',
        duplicateCount ? `${duplicateCount} skipped for duplicate FIDE ID` : ''
      ].filter(Boolean).join(' · ');
      setNotice({
        kind: missingCount || duplicateCount ? 'warn' : 'ok',
        text: `FIDE ratings refreshed from ${info.label}: ${details}. Starting/pairing numbers and results were not changed.${result.startingListOutdated ? ' Rating order has changed, but official starting numbers remain locked.' : ''}`
      });
    } catch (error: any) {
      setNotice({ kind: 'error', text: error?.message || 'FIDE rating refresh failed. Tournament data was preserved.' });
    } finally {
      setBusyKey('');
    }
  };

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

  const listStatusText = fideListInfo
    ? `FIDE list: ${fideListInfo.label}${hasNewMonthlyList ? ' · New monthly list available' : lastRatingRefresh?.listVersion === fideListInfo.listVersion ? ' · Applied to this tournament' : ''}`
    : 'FIDE list: checking latest available data…';

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
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="companion-button secondary"
              disabled={!players.length || busyKey !== ''}
              onClick={() => void handleRefreshFideRatings()}
              title={`Refresh Standard, Rapid and Blitz ratings from ${fideListInfo?.label || 'the latest available FIDE data'} without changing pairings or results.`}
            >
              {busyKey === 'ratings-refresh' ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
              {busyKey === 'ratings-refresh' ? 'Updating ratings…' : 'Update FIDE ratings'}
            </button>
            <button type="button" className="companion-button secondary" disabled={!players.length} onClick={handleExportPlayersXml} title="Export the current roster as Players.XML"><Download size={16} /> Export players (XML)</button>
            <div className="companion-roster-count"><Users size={16} /><strong>{players.length}</strong></div>
          </div>
        </div>
        <div className="companion-sort-note">{listStatusText}. Rating refresh never changes official starting numbers, pairings or results.</div>
        <div className="companion-roster-toolbar">
          <label className="companion-searchbox small"><Search size={16} /><input value={listQuery} onChange={event => setListQuery(event.target.value)} placeholder="Filter registered players" /></label>
          <label className="companion-sort-control">
            <ArrowUpDown size={15} />
            <span>Sort & publish</span>
            <select value={sortMode} onChange={event => handleSortModeChange(event.target.value as RosterSortMode)}>
              <option value="starting">Starting #</option>
              <option value="rating">Rating ↓</option>
              <option value="name">Name A–Z</option>
            </select>
          </label>
        </div>
        <div className="companion-sort-note">This order is also used for Chess-Results and Online Hub publication; sorting never changes official starting numbers or pairing numbers.</div>

        <div className="companion-roster-list">
          {filteredPlayers.map(player => (
            <div key={player.localKey} className="companion-roster-row">
              <div className="companion-player-rank">#{player.pairingNumber}</div>
              <div className="companion-player-main">
                <strong>{player.name}</strong>
                <span>
                  {player.title ? `${player.title} · ` : ''}{player.fed || 'FID'}
                  {player.fideId && player.fideId !== '-' && player.fideId !== '0' ? (
                    <>{' · FIDE '}<a
                      href={`https://ratings.fide.com/profile/${encodeURIComponent(player.fideId.trim())}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`Open FIDE profile ${player.fideId}`}
                      aria-label={`Open FIDE profile ${player.fideId} for ${player.name}`}
                      style={{ color: '#1769e0', fontWeight: 800, textDecoration: 'underline', textUnderlineOffset: '2px' }}
                    >{player.fideId}</a></>
                  ) : null}
                </span>
              </div>
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
