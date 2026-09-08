import React, { useMemo } from 'react';
import { Calendar, Clock, Globe2, MapPin, ShieldCheck, Trophy, Users } from 'lucide-react';
import { PairingSystem, RatingType, Tournament, TournamentFormat } from '../types';
import { FEDERATIONS, TIME_CONTROLS, getFederationFlag } from '../data/initialData';

interface Props {
  tournament: Tournament;
  onUpdateTournament: (updater: (previous: Tournament) => Tournament) => void;
}

const text = (value: unknown) => String(value ?? '').trim();

function classifyTimeControl(value: string, fallback: RatingType): RatingType {
  const candidate = text(value);
  if (!candidate || candidate === 'Custom') return fallback || 'Standard';
  const match = candidate.match(/^(\d+)\s*\+\s*(\d+)/);
  if (!match) return 'Standard';
  const baseMinutes = Number.parseInt(match[1], 10);
  const incrementSeconds = Number.parseInt(match[2], 10);
  const totalMinutesFor60Moves = baseMinutes + incrementSeconds;
  if (totalMinutesFor60Moves <= 10) return 'Blitz';
  if (totalMinutesFor60Moves < 60) return 'Rapid';
  return 'Standard';
}

export const CompanionSetup: React.FC<Props> = ({ tournament, onUpdateTournament }) => {
  const settings = tournament.settings;
  const regulations = tournament.regulations;
  const isRoundRobin = settings.tournamentFormat === 'Individual Round Robin';

  const completion = useMemo(() => {
    const required = [
      tournament.name,
      settings.country,
      settings.city,
      settings.startDate,
      settings.endDate,
      settings.rounds,
      settings.timeControl,
      settings.tournamentFormat,
      settings.chiefArbiter
    ];
    return Math.round((required.filter(value => text(value)).length / required.length) * 100);
  }, [tournament, settings]);

  const updateSetting = <K extends keyof typeof settings>(key: K, value: typeof settings[K]) => {
    onUpdateTournament(previous => ({
      ...previous,
      settings: { ...previous.settings, [key]: value }
    }));
  };

  const updateRegulation = <K extends keyof typeof regulations>(key: K, value: typeof regulations[K]) => {
    onUpdateTournament(previous => ({
      ...previous,
      regulations: { ...previous.regulations, [key]: value }
    }));
  };

  const updateName = (name: string) => {
    onUpdateTournament(previous => ({
      ...previous,
      name
    }));
  };

  const changeFormat = (format: TournamentFormat) => {
    const rr = format === 'Individual Round Robin';
    const pairingSystem: PairingSystem = rr ? 'Round Robin - Berger Tables' : 'FIDE Dutch System';
    const playerCount = tournament.players.length;
    const rounds = rr
      ? String(((playerCount % 2 === 0 ? Math.max(1, playerCount - 1) : Math.max(1, playerCount)) * (Number.parseInt(settings.roundRobinCycles || '1', 10) || 1)))
      : '7';
    onUpdateTournament(previous => ({
      ...previous,
      settings: { ...previous.settings, tournamentFormat: format, pairingSystem, rounds },
      regulations: { ...previous.regulations, format, pairingSystem, rounds }
    }));
  };

  const changeTimeControlPreset = (preset: string) => {
    const currentCustom = settings.customTimeControl || '';
    const value = preset === 'Custom' ? currentCustom : preset;
    const ratingType = classifyTimeControl(value, settings.tournamentRatingType);
    onUpdateTournament(previous => ({
      ...previous,
      settings: {
        ...previous.settings,
        timeControlPreset: preset,
        timeControl: value,
        customTimeControl: preset === 'Custom' ? currentCustom : '',
        tournamentRatingType: ratingType
      },
      regulations: {
        ...previous.regulations,
        timeControl: value,
        rating: `FIDE ${ratingType} Rated`
      }
    }));
  };

  const changeCustomTimeControl = (value: string) => {
    const ratingType = classifyTimeControl(value, settings.tournamentRatingType);
    onUpdateTournament(previous => ({
      ...previous,
      settings: {
        ...previous.settings,
        timeControlPreset: 'Custom',
        customTimeControl: value,
        timeControl: value,
        tournamentRatingType: ratingType
      },
      regulations: {
        ...previous.regulations,
        timeControl: value,
        rating: `FIDE ${ratingType} Rated`
      }
    }));
  };

  return (
    <div className="companion-setup">
      <section className="companion-setup-card companion-setup-summary">
        <div>
          <span className="companion-eyebrow">TOURNAMENT SETUP</span>
          <h2>{tournament.name || 'New tournament'}</h2>
          <p>Keep only the tournament information needed on the go. Pairing, TRF and calculation engines remain on Desktop.</p>
        </div>
        <div className="companion-setup-progress"><strong>{completion}%</strong><span>ready</span></div>
      </section>

      <section className="companion-setup-card">
        <div className="companion-setup-heading"><Trophy size={18} /><div><h3>Identity</h3><p>Name, organizer, federation and rating status.</p></div></div>
        <div className="companion-setup-grid two">
          <label className="wide"><span>Tournament name *</span><input value={tournament.name || ''} onChange={event => updateName(event.target.value)} placeholder="Tournament name" /></label>
          <label><span>Organizer</span><input value={settings.organizer || ''} onChange={event => updateSetting('organizer', event.target.value)} /></label>
          <label><span>Federation *</span><select value={settings.country || 'BUL'} onChange={event => updateSetting('country', event.target.value)}>{FEDERATIONS.map(([code, name]) => <option key={code} value={code}>{getFederationFlag(code)} {code} — {name}</option>)}</select></label>
          <label><span>Tournament mode</span><select value={settings.tournamentType || 'real'} onChange={event => updateSetting('tournamentType', event.target.value as any)}><option value="real">Real tournament</option><option value="test">Test tournament</option><option value="real-online">Real + online</option><option value="unknown">Not set</option></select></label>
          <label><span>FIDE rated</span><select value={settings.fideRated} onChange={event => updateSetting('fideRated', event.target.value as any)}><option value="Yes">Yes</option><option value="No">No</option></select></label>
          <label><span>FIDE Event ID</span><input inputMode="numeric" value={settings.fideEventId || ''} onChange={event => updateSetting('fideEventId', event.target.value.replace(/\D/g, ''))} placeholder="Optional" /></label>
        </div>
      </section>

      <section className="companion-setup-card">
        <div className="companion-setup-heading"><MapPin size={18} /><div><h3>Place & dates</h3><p>Location and tournament window.</p></div></div>
        <div className="companion-setup-grid two">
          <label><span>City *</span><input value={settings.city || ''} onChange={event => updateSetting('city', event.target.value)} /></label>
          <label><span>Venue</span><input value={settings.venue || ''} onChange={event => updateSetting('venue', event.target.value)} /></label>
          <label><span>Start *</span><input type="datetime-local" value={settings.startDate || ''} onChange={event => updateSetting('startDate', event.target.value)} /></label>
          <label><span>End *</span><input type="datetime-local" value={settings.endDate || ''} onChange={event => updateSetting('endDate', event.target.value)} /></label>
          <label><span>Registration deadline</span><input type="datetime-local" value={settings.generalRegistrationDeadline || ''} onChange={event => updateSetting('generalRegistrationDeadline', event.target.value)} /></label>
          <label><span>Maximum players</span><input inputMode="numeric" value={regulations.maximumPlayers || ''} onChange={event => updateRegulation('maximumPlayers', event.target.value.replace(/\D/g, ''))} /></label>
        </div>
      </section>

      <section className="companion-setup-card">
        <div className="companion-setup-heading"><Clock size={18} /><div><h3>Format & time control</h3><p>Core tournament format. Pairing generation itself remains Desktop-only.</p></div></div>
        <div className="companion-setup-grid two">
          <label><span>Format *</span><select value={settings.tournamentFormat} onChange={event => changeFormat(event.target.value as TournamentFormat)}><option value="Individual Swiss">Individual Swiss</option><option value="Individual Round Robin">Individual Round Robin</option></select></label>
          <label><span>Pairing system</span><input value={settings.pairingSystem} readOnly aria-readonly="true" /></label>
          <label><span>Rounds *</span><input inputMode="numeric" value={settings.rounds || ''} onChange={event => updateSetting('rounds', event.target.value.replace(/\D/g, ''))} /></label>
          {isRoundRobin && <label><span>Round-robin cycles</span><input inputMode="numeric" value={settings.roundRobinCycles || '1'} onChange={event => updateSetting('roundRobinCycles', event.target.value.replace(/\D/g, '') || '1')} /></label>}
          <label><span>Time control *</span><select value={settings.timeControlPreset || settings.timeControl || 'Custom'} onChange={event => changeTimeControlPreset(event.target.value)}>{TIME_CONTROLS.map(value => <option key={value} value={value}>{value}</option>)}<option value="Custom">Custom</option></select></label>
          {(settings.timeControlPreset === 'Custom' || !TIME_CONTROLS.includes(settings.timeControl)) && <label><span>Custom time control</span><input value={settings.customTimeControl || settings.timeControl || ''} onChange={event => changeCustomTimeControl(event.target.value)} placeholder="e.g. 90+30" /></label>}
          <label><span>Rating type</span><input value={settings.tournamentRatingType} readOnly aria-readonly="true" /></label>
        </div>
      </section>

      <section className="companion-setup-card">
        <div className="companion-setup-heading"><ShieldCheck size={18} /><div><h3>Officials & contact</h3><p>Information used in Hub and Chess-Results publication.</p></div></div>
        <div className="companion-setup-grid two">
          <label><span>Chief arbiter *</span><input value={settings.chiefArbiter || ''} onChange={event => updateSetting('chiefArbiter', event.target.value)} /></label>
          <label><span>Arbiter</span><input value={settings.arbiter || ''} onChange={event => updateSetting('arbiter', event.target.value)} /></label>
          <label><span>Tournament director</span><input value={settings.director || ''} onChange={event => updateSetting('director', event.target.value)} /></label>
          <label><span>Email</span><input type="email" value={settings.email || ''} onChange={event => updateSetting('email', event.target.value)} /></label>
          <label><span>Phone</span><input type="tel" value={settings.phone || ''} onChange={event => updateSetting('phone', event.target.value)} /></label>
          <label><span>Website</span><input type="url" value={settings.website || ''} onChange={event => updateSetting('website', event.target.value)} placeholder="https://" /></label>
        </div>
      </section>

      <section className="companion-setup-card">
        <div className="companion-setup-heading"><Users size={18} /><div><h3>Registration & public information</h3><p>Optional details published with the tournament.</p></div></div>
        <div className="companion-setup-grid two">
          <label><span>Entry fee</span><input value={regulations.entryFee || ''} onChange={event => updateRegulation('entryFee', event.target.value)} /></label>
          <label><span>Total prize fund</span><input value={regulations.totalPrizeFund || ''} onChange={event => updateRegulation('totalPrizeFund', event.target.value)} /></label>
          <label className="wide"><span>General notes</span><textarea rows={3} value={settings.generalNotes || ''} onChange={event => updateSetting('generalNotes', event.target.value)} /></label>
          <label className="wide"><span>Additional regulations</span><textarea rows={4} value={regulations.additional || ''} onChange={event => updateRegulation('additional', event.target.value)} /></label>
        </div>
      </section>

      <div className="companion-setup-footnote"><Globe2 size={16} /><span>Edits are saved locally immediately. Cloud autosync is push-only; Pull Cloud → Web is always explicit and never overwrites Web changes silently.</span></div>
    </div>
  );
};
