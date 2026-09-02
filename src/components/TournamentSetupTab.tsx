import React from 'react';
import { Tournament, RatingType, TournamentFormat, PairingSystem } from '../types';
import { FEDERATIONS, FIDE_TIE_BREAKS, ROUND_ROBIN_TIE_BREAKS, TIME_CONTROLS, getFederationFlag } from '../data/initialData';
import { 
  Trophy, Clock, Calendar, Globe, Award, Settings, 
  ExternalLink, ArrowUp, ArrowDown, Trash2, Plus, Sliders
} from 'lucide-react';

interface TournamentSetupTabProps {
  tournament: Tournament;
  onUpdateTournament: (updater: (prev: Tournament) => Tournament) => void;
  onOpenTieBreakSettings: (tieName: string) => void;
}

export const TournamentSetupTab: React.FC<TournamentSetupTabProps> = ({
  tournament,
  onUpdateTournament,
  onOpenTieBreakSettings
}) => {
  const { settings, regulations } = tournament;
  const isRoundRobin = settings.tournamentFormat === 'Individual Round Robin';
  const availableTieBreaks = isRoundRobin ? ROUND_ROBIN_TIE_BREAKS : FIDE_TIE_BREAKS;

  const updateSetting = <K extends keyof typeof settings>(key: K, value: typeof settings[K]) => {
    onUpdateTournament(prev => ({
      ...prev,
      settings: {
        ...prev.settings,
        [key]: value
      }
    }));
  };

  const updateRegulation = <K extends keyof typeof regulations>(key: K, value: typeof regulations[K]) => {
    onUpdateTournament(prev => ({
      ...prev,
      regulations: {
        ...prev.regulations,
        [key]: value
      }
    }));
  };

  // Helper for Time Control parsing & FIDE Classification
  const handleTimeControlChange = (tcValue: string) => {
    let ratingType: RatingType = settings.tournamentRatingType;
    let customVal = settings.customTimeControl;

    if (tcValue !== 'Custom') {
      customVal = '';
      // Automatic FIDE Classification: M mins + S secs inc (60 moves = S mins) => M + S total minutes
      const m = tcValue.match(/^(\d+)\s*\+\s*(\d+)/);
      if (m) {
        const totalMinutes = parseInt(m[1]) + parseInt(m[2]);
        if (totalMinutes <= 10) ratingType = 'Blitz';
        else if (totalMinutes < 60) ratingType = 'Rapid';
        else ratingType = 'Standard';
      }
    }

    onUpdateTournament(prev => ({
      ...prev,
      settings: {
        ...prev.settings,
        timeControlPreset: tcValue,
        timeControl: tcValue === 'Custom' ? customVal : tcValue,
        customTimeControl: customVal,
        tournamentRatingType: ratingType
      },
      regulations: {
        ...prev.regulations,
        timeControl: tcValue === 'Custom' ? customVal : tcValue,
        rating: `FIDE ${ratingType} Rated`
      }
    }));
  };

  const handleCustomTcInput = (val: string) => {
    let ratingType: RatingType = settings.tournamentRatingType;
    const m = val.match(/^(\d+)\s*\+\s*(\d+)/);
    if (m) {
      const totalMinutes = parseInt(m[1]) + parseInt(m[2]);
      if (totalMinutes <= 10) ratingType = 'Blitz';
      else if (totalMinutes < 60) ratingType = 'Rapid';
      else ratingType = 'Standard';
    }

    onUpdateTournament(prev => ({
      ...prev,
      settings: {
        ...prev.settings,
        customTimeControl: val,
        timeControl: val,
        tournamentRatingType: ratingType
      },
      regulations: {
        ...prev.regulations,
        timeControl: val,
        rating: `FIDE ${ratingType} Rated`
      }
    }));
  };

  const handleFormatChange = (fmt: TournamentFormat) => {
    const isRR = fmt === 'Individual Round Robin';
    const pairingSys: PairingSystem = isRR ? 'Round Robin - Berger Tables' : 'FIDE Dutch System';
    const numPlayers = tournament.players.length;
    const calculatedRounds = isRR 
      ? ((numPlayers % 2 === 0 ? numPlayers - 1 : numPlayers) * parseInt(settings.roundRobinCycles || '1')) || 5
      : 7;

    onUpdateTournament(prev => ({
      ...prev,
      settings: {
        ...prev.settings,
        tournamentFormat: fmt,
        pairingSystem: pairingSys,
        rounds: String(calculatedRounds)
      },
      regulations: {
        ...prev.regulations,
        format: fmt,
        pairingSystem: pairingSys,
        rounds: String(calculatedRounds)
      }
    }));
  };

  const handleAddTieBreak = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (!val || regulations.tieBreaks.includes(val)) return;

    if (regulations.tieBreaks.length >= 6) {
      alert("Maximum 6 tie-break criteria allowed for strict FIDE & Chess-Results compatibility.");
      return;
    }

    updateRegulation('tieBreaks', [...regulations.tieBreaks, val]);
    e.target.value = '';
  };

  const handleMoveTieBreak = (idx: number, direction: 'up' | 'down') => {
    const list = [...regulations.tieBreaks];
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= list.length) return;

    const temp = list[idx];
    list[idx] = list[targetIdx];
    list[targetIdx] = temp;

    updateRegulation('tieBreaks', list);
  };

  const handleRemoveTieBreak = (idx: number) => {
    const list = regulations.tieBreaks.filter((_, i) => i !== idx);
    updateRegulation('tieBreaks', list);
  };

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6 animate-in fade-in duration-200 text-slate-800">
      {/* 1. Tournament General Information */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Trophy className="w-5 h-5 text-blue-600" />
            General Information & Tournament Identity
          </h2>
          <span className="text-xs font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
            FIDE Regulations C.04 Compliance
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          {/* Tournament Name */}
          <div className="lg:col-span-2 space-y-1">
            <label className="font-semibold text-slate-700 flex items-center gap-1">
              Tournament Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={tournament.name || ''}
              onChange={e => {
                const val = e.target.value;
                onUpdateTournament(prev => ({
                  ...prev,
                  name: val,
                  settings: { ...prev.settings, organizer: val }
                }));
              }}
              placeholder="e.g. Golden Rhodopes Chess Festival 2026"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 font-medium focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none transition"
            />
          </div>

          {/* Organizer */}
          <div className="space-y-1">
            <label className="font-semibold text-slate-700">Organizer</label>
            <input
              type="text"
              value={settings.organizer}
              onChange={e => updateSetting('organizer', e.target.value)}
              placeholder="Chess Club or Federation"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none transition"
            />
          </div>

          {/* Federation */}
          <div className="space-y-1">
            <label className="font-semibold text-slate-700 flex items-center gap-1">
              Country / Federation <span className="text-rose-500">*</span>
            </label>
            <select
              value={settings.country}
              onChange={e => updateSetting('country', e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none transition font-medium"
            >
              {FEDERATIONS.map(([code, name]) => (
                <option key={code} value={code}>
                  {getFederationFlag(code)} {code} — {name}
                </option>
              ))}
            </select>
          </div>

          {/* Chief Arbiter */}
          <div className="space-y-1">
            <label className="font-semibold text-slate-700 flex items-center gap-1">
              Chief Arbiter <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={settings.chiefArbiter}
              onChange={e => updateSetting('chiefArbiter', e.target.value)}
              placeholder="IA / FA Name"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none transition"
            />
          </div>

          {/* Deputy Arbiter */}
          <div className="space-y-1">
            <label className="font-semibold text-slate-700">Deputy / Arbiter</label>
            <input
              type="text"
              value={settings.arbiter}
              onChange={e => updateSetting('arbiter', e.target.value)}
              placeholder="Arbiter Name"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none transition"
            />
          </div>

          {/* City */}
          <div className="space-y-1">
            <label className="font-semibold text-slate-700 flex items-center gap-1">
              City <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={settings.city}
              onChange={e => updateSetting('city', e.target.value)}
              placeholder="e.g. Plovdiv"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none transition"
            />
          </div>

          {/* Venue */}
          <div className="space-y-1">
            <label className="font-semibold text-slate-700">Venue / Hall</label>
            <input
              type="text"
              value={settings.venue}
              onChange={e => updateSetting('venue', e.target.value)}
              placeholder="e.g. Grand Hotel Hall Moscow"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none transition"
            />
          </div>

          {/* Start Date & Time */}
          <div className="space-y-1">
            <label className="font-semibold text-slate-700 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-blue-600" />
              Start Date & Time <span className="text-rose-500">*</span>
            </label>
            <input
              type="datetime-local"
              value={settings.startDate}
              onChange={e => updateSetting('startDate', e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none transition"
            />
          </div>

          {/* End Date & Time */}
          <div className="space-y-1">
            <label className="font-semibold text-slate-700 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-blue-600" />
              End Date & Time <span className="text-rose-500">*</span>
            </label>
            <input
              type="datetime-local"
              value={settings.endDate}
              onChange={e => updateSetting('endDate', e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none transition"
            />
          </div>

          {/* FIDE Event ID */}
          <div className="space-y-1">
            <label className="font-semibold text-slate-700 flex items-center justify-between">
              <span>FIDE Event ID</span>
              {settings.fideEventId && (
                <a
                  href={`https://ratings.fide.com/tournament_information.phtml?event=${settings.fideEventId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] text-blue-600 hover:underline flex items-center gap-0.5"
                >
                  Open FIDE <ExternalLink className="w-2.5 h-2.5" />
                </a>
              )}
            </label>
            <input
              type="text"
              value={settings.fideEventId}
              onChange={e => updateSetting('fideEventId', e.target.value.replace(/\D/g, ''))}
              placeholder="e.g. 490658"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 font-mono focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none transition"
            />
          </div>

          {/* FIDE Rated Toggle */}
          <div className="space-y-1">
            <label className="font-semibold text-slate-700">FIDE Rated?</label>
            <select
              value={settings.fideRated}
              onChange={e => updateSetting('fideRated', e.target.value as any)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none transition font-semibold"
            >
              <option value="Yes">Yes — FIDE Rated</option>
              <option value="No">No — Unrated</option>
            </select>
          </div>
        </div>
      </section>

      {/* 2. Format, Time Control & Pairing Rules */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Clock className="w-5 h-5 text-indigo-600" />
            Format, Time Control & Pairing Rules
          </h2>
          <span className="text-xs text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200 font-mono">
            Auto Time-Classification Active
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          {/* Tournament Format */}
          <div className="space-y-1">
            <label className="font-semibold text-slate-700">Tournament Format</label>
            <select
              value={settings.tournamentFormat}
              onChange={e => handleFormatChange(e.target.value as TournamentFormat)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 font-semibold focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none transition"
            >
              <option value="Individual Swiss">Individual Swiss</option>
              <option value="Individual Round Robin">Individual Round Robin</option>
            </select>
          </div>

          {/* Pairing System */}
          <div className="space-y-1">
            <label className="font-semibold text-slate-700">Pairing System</label>
            <input
              type="text"
              readOnly
              value={settings.pairingSystem}
              className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-slate-600 font-mono cursor-not-allowed"
            />
          </div>

          {/* Number of Rounds */}
          <div className="space-y-1">
            <label className="font-semibold text-slate-700 flex items-center justify-between">
              <span>Number of Rounds</span>
              {isRoundRobin && <span className="text-[10px] text-indigo-600 font-semibold">(Calculated)</span>}
            </label>
            <input
              type="number"
              min="1"
              max="99"
              value={settings.rounds}
              readOnly={isRoundRobin}
              onChange={e => {
                const val = e.target.value;
                updateSetting('rounds', val);
                updateRegulation('rounds', val);
              }}
              className={`w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 font-bold focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none transition ${
                isRoundRobin ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''
              }`}
            />
          </div>

          {/* Round Robin Cycles (if applicable) */}
          {isRoundRobin && (
            <div className="space-y-1">
              <label className="font-semibold text-slate-700">Round Robin Cycles</label>
              <select
                value={settings.roundRobinCycles || '1'}
                onChange={e => {
                  const cyc = e.target.value;
                  const numPlayers = tournament.players.length;
                  const calcRounds = (numPlayers % 2 === 0 ? numPlayers - 1 : numPlayers) * parseInt(cyc);
                  updateSetting('roundRobinCycles', cyc);
                  updateSetting('rounds', String(calcRounds || 5));
                  updateRegulation('rounds', String(calcRounds || 5));
                }}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 font-semibold focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none transition"
              >
                <option value="1">1 × Single Round Robin</option>
                <option value="2">2 × Double Round Robin (Color Reversal)</option>
                <option value="3">3 × Triple Round Robin</option>
                <option value="4">4 × Quadruple Round Robin</option>
              </select>
            </div>
          )}

          {/* Time Control Preset */}
          <div className="space-y-1">
            <label className="font-semibold text-slate-700">Time Control Preset</label>
            <select
              value={settings.timeControlPreset || '90+30'}
              onChange={e => handleTimeControlChange(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 font-semibold focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none transition"
            >
              {TIME_CONTROLS.filter(Boolean).map(tc => (
                <option key={tc} value={tc}>{tc} {tc === '90+30' ? '(Classical Standard)' : tc === '15+10' ? '(FIDE Rapid)' : tc === '3+2' ? '(FIDE Blitz)' : ''}</option>
              ))}
            </select>
          </div>

          {/* Custom Time Control */}
          {settings.timeControlPreset === 'Custom' && (
            <div className="space-y-1">
              <label className="font-semibold text-slate-700">Custom Time Control (M+S)</label>
              <input
                type="text"
                value={settings.customTimeControl}
                onChange={e => handleCustomTcInput(e.target.value)}
                placeholder="e.g. 45+15"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 font-mono focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none transition"
              />
            </div>
          )}

          {/* Auto-detected Rating Type */}
          <div className="space-y-1">
            <label className="font-semibold text-slate-700 flex items-center justify-between">
              <span>Rating Type</span>
              <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded font-mono font-semibold">FIDE Laws Classification</span>
            </label>
            <div className="flex items-center gap-2">
              <select
                value={settings.tournamentRatingType}
                onChange={e => updateSetting('tournamentRatingType', e.target.value as RatingType)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 font-bold focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none transition"
              >
                <option value="Standard">Standard (≥60 mins/player)</option>
                <option value="Rapid">Rapid (10-60 mins/player)</option>
                <option value="Blitz">Blitz (≤10 mins/player)</option>
                <option value="Unrated">Unrated</option>
              </select>
            </div>
          </div>

          {/* PAB Points (Pairing-Allocated Bye) */}
          <div className="space-y-1">
            <label className="font-semibold text-slate-700 flex items-center justify-between">
              <span>PAB Points</span>
              <span className="text-[10px] text-slate-500 font-mono">TRF 162 Record</span>
            </label>
            <select
              value={regulations.pabPoints || '1.0'}
              onChange={e => updateRegulation('pabPoints', e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 font-bold focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none transition"
            >
              <option value="1.0">1.0 point (Standard FIDE)</option>
              <option value="0.5">0.5 point (Half point)</option>
              <option value="0.0">0.0 point (Zero point)</option>
            </select>
          </div>
        </div>
      </section>

      {/* 3. FIDE 2026 Tie-Breaks Priority Order */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Sliders className="w-5 h-5 text-amber-600" />
              FIDE 2026 Tie-Break Priority Chain (Max 6)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Strictly calculated per FIDE 2026 Regulations (Buchholz VUR cuts, Sonneborn-Berger dummy scores, Direct Encounter recursive mini-tables).
            </p>
          </div>
          <span className="text-xs font-mono px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-800 font-semibold">
            {regulations.tieBreaks.length} / 6 Active
          </span>
        </div>

        {/* Add Tie-Break Selector */}
        <div className="flex items-center gap-3">
          <select
            onChange={handleAddTieBreak}
            defaultValue=""
            className="flex-1 px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none transition"
          >
            <option value="" disabled>+ Add Tie-Break Criterion to Priority List...</option>
            {availableTieBreaks
              .filter(tb => !regulations.tieBreaks.includes(tb))
              .map(tb => (
                <option key={tb} value={tb}>{tb}</option>
              ))}
          </select>
        </div>

        {/* Active Priority List */}
        <div className="space-y-2">
          {regulations.tieBreaks.length === 0 ? (
            <div className="text-center py-6 border border-dashed border-slate-300 rounded-lg text-slate-400 text-xs">
              No tie-break criteria defined. Add at least 2 criteria for official FIDE standings.
            </div>
          ) : (
            regulations.tieBreaks.map((tb, idx) => (
              <div
                key={tb}
                className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs hover:border-slate-300 transition"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-6 h-6 rounded-full bg-blue-100 border border-blue-300 text-blue-800 flex items-center justify-center font-mono font-bold text-xs flex-shrink-0">
                    {idx + 1}
                  </span>
                  <div className="min-w-0">
                    <span className="font-semibold text-slate-800 block truncate">{tb}</span>
                    <span className="text-[10px] text-slate-500">
                      TB{idx + 1} for FIDE TRF26 & Chess-Results
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => onOpenTieBreakSettings(tb)}
                    className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded text-[11px] font-medium flex items-center gap-1 transition shadow-sm"
                    title="Fine-tune parameters (unrated substitute, cuts, etc.)"
                  >
                    <Settings className="w-3 h-3 text-slate-500" />
                    <span>Options</span>
                  </button>
                  <button
                    onClick={() => handleMoveTieBreak(idx, 'up')}
                    disabled={idx === 0}
                    className="p-1 bg-white hover:bg-slate-100 disabled:opacity-30 text-slate-600 border border-slate-300 rounded transition shadow-sm"
                    title="Move Up"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleMoveTieBreak(idx, 'down')}
                    disabled={idx === regulations.tieBreaks.length - 1}
                    className="p-1 bg-white hover:bg-slate-100 disabled:opacity-30 text-slate-600 border border-slate-300 rounded transition shadow-sm"
                    title="Move Down"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleRemoveTieBreak(idx)}
                    className="p-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded transition ml-1"
                    title="Remove"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* 4. Prize Fund & Additional Regulations */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Award className="w-5 h-5 text-emerald-600" />
            Prize Fund & Tournament Regulations
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="space-y-1">
            <label className="font-semibold text-slate-700">Total Prize Fund</label>
            <input
              type="text"
              value={regulations.totalPrizeFund}
              onChange={e => updateRegulation('totalPrizeFund', e.target.value)}
              placeholder="e.g. 5,000 EUR"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none transition"
            />
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-slate-700">Entry Fee</label>
            <input
              type="text"
              value={regulations.entryFee}
              onChange={e => updateRegulation('entryFee', e.target.value)}
              placeholder="e.g. 30 EUR / 20 EUR for Juniors"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none transition"
            />
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-slate-700">Main Prizes Breakdown</label>
            <textarea
              rows={3}
              value={regulations.mainPrizes}
              onChange={e => updateRegulation('mainPrizes', e.target.value)}
              placeholder="1st: 1500 EUR | 2nd: 1000 EUR | 3rd: 750 EUR..."
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none transition resize-none"
            />
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-slate-700">Special & Category Prizes</label>
            <textarea
              rows={3}
              value={regulations.specialPrizes}
              onChange={e => updateRegulation('specialPrizes', e.target.value)}
              placeholder="Best Female: 300 EUR | Best Senior: 200 EUR | U18: 200 EUR..."
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none transition resize-none"
            />
          </div>
        </div>
      </section>
    </div>
  );
};
