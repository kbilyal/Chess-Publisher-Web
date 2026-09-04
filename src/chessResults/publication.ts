import { BoardPairing, Tournament } from '../types';

export type ChessResultsPublication = {
  xml: string;
  players: number;
  rounds: number;
  generatedRounds: number;
  pairingRecords: number;
  key: string;
  federation: string;
};

const xml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

const text = (value: unknown, max = 0) => {
  const normalized = String(value ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  return max ? normalized.slice(0, max) : normalized;
};

const attr = (name: string, value: unknown) => `${name}="${xml(value)}"`;

const date = (value: string) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return '';
  const [year, month, day] = match.slice(1).map(Number);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return candidate.getUTCFullYear() === year && candidate.getUTCMonth() === month - 1 && candidate.getUTCDate() === day
    ? `${match[1]}${match[2]}${match[3]}` : '';
};

const birth = (value: string) => {
  const match = String(value || '').match(/^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/);
  if (!match) return '';
  return match[2] && match[3] ? `${match[3]}.${match[2]}.${match[1]}` : match[1];
};

const pairingResult = (value: string, single: boolean) => {
  const result = String(value || '').replace(/\s+/g, '').toUpperCase();
  if (single) {
    // A pairing-allocated bye is the only single-player pairing that uses the
    // Chess-Results -1/K convention. Requested and late-entry byes remain
    // ordinary non-pairing records (-2) unless the authoritative round entry
    // explicitly says PAB.
    if (result === 'PAB') return { white: '1.0', black: '0.0', forfeit: 'K', blackNo: -1 };
    if (result === 'ВЅBYE' || result === '1/2BYE' || result === '0.5BYE') return { white: '0.5', black: '0.0', forfeit: '', blackNo: -2 };
    if (result === '0BYE') return { white: '0.0', black: '0.0', forfeit: '', blackNo: -2 };
    return { white: '', black: '', forfeit: '', blackNo: -2 };
  }
  if (result === '1-0') return { white: '1.0', black: '0.0', forfeit: '' };
  if (result === '0-1') return { white: '0.0', black: '1.0', forfeit: '' };
  if (result === 'ВЅ-ВЅ' || result === '1/2-1/2' || result === '0.5-0.5' || result === '=') return { white: '0.5', black: '0.5', forfeit: '' };
  if (result === '1F-0F' || result === '+:-') return { white: '1.0', black: '0.0', forfeit: 'K' };
  if (result === '0F-1F' || result === '-:+') return { white: '0.0', black: '1.0', forfeit: 'K' };
  if (result === '0F-0F' || result === '-:-') return { white: '0.0', black: '0.0', forfeit: 'D' };
  return { white: '', black: '', forfeit: '' };
};

export function validateChessResultsTournament(tournament: Tournament, requireKey = false, keyOverride = '') {
  const { settings, chessResults } = tournament;
  if (settings.tournamentFormat !== 'Individual Swiss') throw new Error('Chess-Results publishing currently supports Individual Swiss tournaments only.');
  if (!['real', 'test'].includes(settings.tournamentType)) throw new Error('Choose Real tournament or Test tournament before publishing.');
  if (!text(tournament.name, 160)) throw new Error('Tournament name is required.');
  const federation = settings.tournamentType === 'test' ? 'XXX' : String(settings.country || '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(federation)) throw new Error('Tournament federation must be a three-letter FIDE code.');
  const rounds = Number.parseInt(settings.rounds, 10);
  if (!Number.isInteger(rounds) || rounds < 1) throw new Error('A positive number of rounds is required.');
  if (!date(settings.startDate)) throw new Error('A valid tournament start date is required.');
  if (!Array.isArray(tournament.players) || tournament.players.length === 0) throw new Error('At least one registered player is required.');
  const usedNumbers = new Set<number>();
  tournament.players.forEach(player => {
    if (!Number.isInteger(player.pairingNumber) || player.pairingNumber < 1 || usedNumbers.has(player.pairingNumber)) {
      throw new Error(`Player ${player.name || player.id} has an invalid or duplicate starting number.`);
    }
    usedNumbers.add(player.pairingNumber);
  });
  const key = String(keyOverride || chessResults?.key || '').trim();
  if (requireKey && !/^\d+$/.test(key)) throw new Error('A numeric Chess-Results TNR is required.');
  return { federation, rounds, key };
}

export function buildChessResultsXml(tournament: Tournament, options: { requireKey?: boolean; key?: string } = {}): ChessResultsPublication {
  const { federation, rounds, key } = validateChessResultsTournament(tournament, options.requireKey, options.key);
  const settings = tournament.settings;
  const cr = tournament.chessResults;
  const generatedRounds = Object.keys(tournament.pairings.liveBoards || {}).map(Number).filter(Number.isFinite).filter(round => round > 0).sort((a, b) => a - b);
  const latestRound = generatedRounds.at(-1) || 0;
  const playerByKey = new Map(tournament.players.map(player => [player.localKey, player]));
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<chessresults>', '<tournamentdata>'];
  const tournamentAttrs = [
    attr('key', key || '0'), attr('type', '0'), attr('name', text(tournament.name, 160)),
    attr('fideeventid', text(settings.fideEventId, 20)), attr('remark', cr.pinBoardEnabled ? text(cr.pinBoardText, 599) : ''),
    attr('director', text(settings.director, 80)), attr('organiser', text(settings.organizer, 80)), attr('location', text(settings.venue || settings.city, 80)),
    attr('arbiter', text(settings.arbiter, 1200)), attr('rounds', rounds), attr('currentround', latestRound), attr('rankinground', latestRound),
    attr('from', date(settings.startDate)), attr('to', date(settings.endDate) || date(settings.startDate)), attr('ratedfide', settings.fideRated === 'Yes' ? 'J' : '-'),
    attr('timecontrol', text(settings.timeControl, 100)), attr('chiefarbiter', text(settings.chiefArbiter, 120)), attr('mail', text(settings.email, 80)),
    attr('federation', federation), attr('creator', cr.creatorId || 100)
  ];
  lines.push(`<tournament ${tournamentAttrs.join(' ')} />`, '</tournamentdata>', '<rounds>');
  for (let round = 1; round <= rounds; round += 1) lines.push(`<round ${attr('round', round)} ${attr('date', '')} ${attr('time', '')} />`);
  lines.push('</rounds>', '<players>');
  [...tournament.players].sort((a, b) => a.pairingNumber - b.pairingNumber).forEach(player => {
    lines.push(`<player ${[
      attr('no', player.pairingNumber), attr('lastname', text(player.name, 80)), attr('title', player.title), attr('rtg', player.rating || ''),
      attr('rtgfide', player.stdRating || player.rating || ''), attr('dob', birth(player.birth)), attr('sex', player.gender === 'f' ? 'W' : player.gender === 'm' ? 'M' : ''),
      attr('fed', text(player.fed, 3).toUpperCase()), attr('clubname', text(player.club, 40)), attr('fideid', String(player.fideId || '').replace(/^-$/, '')), attr('rank', player.pairingNumber)
    ].join(' ')} />`);
  });
  lines.push('</players>', '<playerpairings>');
  let pairingRecords = 0;
  const orderedPlayers = [...tournament.players].sort((a, b) => a.pairingNumber - b.pairingNumber);
  for (const round of generatedRounds) {
    const boards = [...(tournament.pairings.liveBoards[String(round)] || [])].sort((a, b) => a.board - b.board);
    const pairedKeys = new Set<string>();
    let pairingNumber = 0;
    boards.forEach((board: BoardPairing, index) => {
      const white = playerByKey.get(board.whiteKey);
      const black = playerByKey.get(board.blackKey);
      if (!white && !black) return;
      if (white) pairedKeys.add(white.localKey);
      if (black) pairedKeys.add(black.localKey);
      const result = pairingResult(board.result, !black);
      pairingRecords += 1;
      pairingNumber += 1;
      lines.push(`<playerpairing ${[
        attr('round', round), attr('pairing', pairingNumber), attr('board', board.board || 1), attr('whiteno', white?.pairingNumber || black!.pairingNumber),
        attr('blackno', black?.pairingNumber || result.blackNo || -2), attr('reswhite', result.white), attr('resblack', result.black), attr('forfeit', result.forfeit)
      ].join(' ')} />`);
    });
    // The official XML examples include a -2 placeholder for each player who
    // has no pairing record in the round. Omitting it can leave stale results
    // or make an incremental upload fail validation on Chess-Results.
    orderedPlayers.filter(player => !pairedKeys.has(player.localKey)).forEach(player => {
      pairingRecords += 1;
      pairingNumber += 1;
      lines.push(`<playerpairing ${[
        attr('round', round), attr('pairing', pairingNumber), attr('board', 1), attr('whiteno', player.pairingNumber),
        attr('blackno', -2), attr('reswhite', ''), attr('resblack', ''), attr('forfeit', '')
      ].join(' ')} />`);
    });
  }
  lines.push('</playerpairings>', '<security>', `<securitydata ${attr('source', cr.sourceId || 21)} ${attr('sid', '__CP_CR_SID__')} ${attr('creator_sid', '__CP_CR_CREATOR__')} ${attr('tnr_sid', '__CP_CR_TNR__')} />`, '</security>', '</chessresults>');
  return { xml: lines.join('\r\n'), players: tournament.players.length, rounds, generatedRounds: latestRound, pairingRecords, key, federation };
}
