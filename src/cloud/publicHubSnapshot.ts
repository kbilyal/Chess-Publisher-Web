import { Tournament } from '../types';
import { calculateTournamentStandings, getStandingTieBreakValue } from '../engine/tiebreaks';
import { chooseInternalTournamentId } from './onlineCloudSync';

const fed = (value: unknown) => {
  const code = String(value || '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : 'FID';
};

function tournamentStatus(tournament: Tournament) {
  const total = Math.max(1, Number.parseInt(tournament.settings.rounds || '1', 10) || 1);
  const rounds = Object.keys(tournament.pairings.liveBoards || {}).map(Number).filter(value => value > 0);
  const latest = rounds.length ? Math.max(...rounds) : 0;
  if (latest >= total && tournament.pairings.finalizedRounds?.[String(total)]) return 'finished';
  if (latest > 0) return 'playing';
  return 'registration';
}

export function buildPublicHubSnapshot(tournament: Tournament | any, publication: {
  hubTournamentId?: string;
  publicSlug?: string;
  revision?: number;
} = {}) {
  const standings = calculateTournamentStandings(tournament);
  const tieList = standings.tieList || [];
  const rounds = Object.entries(tournament.pairings?.liveBoards || {})
    .map(([round, pairings]: [string, any]) => ({
      round: Number(round),
      pairings: (pairings || []).map((pairing: any) => ({
        board: Number(pairing.board) || 1,
        whiteKey: pairing.whiteKey || '',
        blackKey: pairing.blackKey || '',
        result: pairing.result || '-'
      }))
    }))
    .filter(item => Number.isInteger(item.round) && item.round > 0)
    .sort((a, b) => a.round - b.round);

  const internalId = chooseInternalTournamentId(tournament, [publication.hubTournamentId]);
  const countryFed = fed(tournament.settings?.country);

  return {
    schemaVersion: '1.0',
    client: {
      product: 'Chess-Publisher',
      version: 'Web beta4 Online & Cloud'
    },
    publication: {
      hubTournamentId: publication.hubTournamentId || null,
      publicSlug: publication.publicSlug || null,
      revision: Number(publication.revision || 0)
    },
    tournament: {
      localKey: internalId,
      name: tournament.name || 'Tournament',
      status: tournamentStatus(tournament),
      format: tournament.settings?.tournamentFormat || 'Individual Swiss',
      pairingSystem: tournament.settings?.pairingSystem || 'FIDE Dutch System',
      timeControl: tournament.settings?.customTimeControl || tournament.settings?.timeControl || tournament.settings?.timeControlPreset || '',
      ratingType: tournament.settings?.tournamentRatingType || 'Unrated',
      fideRated: tournament.settings?.fideRated === 'Yes',
      roundsDeclared: Math.max(1, Number.parseInt(tournament.settings?.rounds || '1', 10) || 1),
      dates: {
        start: tournament.settings?.startDate || null,
        end: tournament.settings?.endDate || null
      },
      location: {
        venue: tournament.settings?.venue || '',
        city: tournament.settings?.city || '',
        federation: countryFed
      },
      staff: {
        organizer: tournament.settings?.organizer || '',
        chiefArbiter: tournament.settings?.chiefArbiter || '',
        arbiter: tournament.settings?.arbiter || '',
        director: tournament.settings?.director || ''
      },
      contact: {
        email: tournament.settings?.email || '',
        phone: tournament.settings?.phone || ''
      },
      links: {
        website: tournament.settings?.website || '',
        live: tournament.settings?.liveLink || ''
      },
      regulations: tournament.regulations || {}
    },
    players: (tournament.players || []).map((player: any) => ({
      key: player.localKey,
      name: player.name,
      title: player.title || '',
      fideId: player.fideId || null,
      birth: player.birth || null,
      federation: fed(player.fed),
      rating: Number(player.rating || 0),
      attendance: player.attendance || 'present',
      joinedFromRound: Number(player.joinedFromRound || 1)
    })),
    rounds,
    standings: {
      round: Number(standings.completed || 0),
      tieBreaks: tieList.map((label: string, index: number) => ({ key: `tb-${index + 1}`, label })),
      rows: standings.players.map((player: any, index: number) => ({
        rank: index + 1,
        playerKey: player.key,
        points: Number(player.score || 0),
        tieBreakValues: tieList.map((tie: string) => Number(getStandingTieBreakValue(player, tie) || 0))
      }))
    },
    schedule: (tournament.schedule?.rows || []).map((row: any) => ({
      no: row.no || '',
      dateTime: row.dateTime || '',
      event: row.event || '',
      description: row.description || ''
    }))
  };
}
