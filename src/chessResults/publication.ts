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

const numericOrEmpty = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? String(number) : '';
};

const pairingResult = (value: string, single: boolean) => {
  const result = String(value || '').replace(/\s+/g, '').toUpperCase();
  if (single) {
    if (result === 'PAB') return { white: '1.0', black: '0.0', forfeit: 'K', blackNo: -1 };
    if (result === '1BYE') return { white: '1.0', black: '', forfeit: '', blackNo: -2 };
    if (result === '½BYE' || result === '1/2BYE' || result === '0.5BYE') return { white: '0.5', black: '', forfeit: '', blackNo: -2 };
    if (result === '0BYE') return { white: '0.0', black: '', forfeit: '', blackNo: -2 };
    return { white: '', black: '', forfeit: '', blackNo: -2 };
  }
  if (result === '1-0') return { white: '1.0', black: '0.0', forfeit: '' };
  if (result === '0-1') return { white: '0.0', black: '1.0', forfeit: '' };
  if (result === '½-½' || result === '1/2-1/2' || result === '0.5-0.5' || result === '=') return { white: '0.5', black: '0.5', forfeit: '' };
  if (result === '1F-0F' || result === '+:-') return { white: '1.0', black: '0.0', forfeit: 'K' };
  if (result === '0F-1F' || result === '-:+') return { white: '0.0', black: '1.0', forfeit: 'K' };
  if (result === '0F-0F' || result === '-:-') return { white: '0.0', black: '0.0', forfeit: 'D' };
  return { white: '', black: '', forfeit: '' };
};

const resultPoints = (value: string, side: 'white' | 'black', single: boolean, pabPoints = 1) => {
  const result = String(value || '').replace(/\s+/g, '').toUpperCase();
  if (single) {
    if (result === 'PAB') return side === 'white' ? Number(pabPoints || 1) : 0;
    if (result === '1BYE') return side === 'white' ? 1 : 0;
    if (result === '½BYE' || result === '1/2BYE' || result === '0.5BYE') return side === 'white' ? 0.5 : 0;
    return 0;
  }
  if (result === '1-0' || result === '1F-0F' || result === '+:-') return side === 'white' ? 1 : 0;
  if (result === '0-1' || result === '0F-1F' || result === '-:+') return side === 'black' ? 1 : 0;
  if (result === '½-½' || result === '1/2-1/2' || result === '0.5-0.5' || result === '=') return 0.5;
  return 0;
};

const isEnteredResult = (value: string) => {
  const normalized = String(value || '').trim();
  return normalized !== '' && normalized !== '-';
};

function roundSchedule(tournament: Tournament, rounds: number) {
  const rows = Array.isArray(tournament.schedule?.rows) ? tournament.schedule.rows : [];
  const mapped = new Map<number, { date: string; time: string }>();
  for (const row of rows) {
    const label = `${row.event || ''} ${row.description || ''}`;
    const explicitRound = label.match(/\bround\s*(\d{1,3})\b/i);
    const rowNo = Number.parseInt(String(row.no || ''), 10);
    const round = explicitRound ? Number(explicitRound[1]) : rowNo;
    if (!Number.isInteger(round) || round < 1 || round > rounds || mapped.has(round)) continue;
    const rawDateTime = String(row.dateTime || '').trim();
    const match = rawDateTime.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/);
    if (!match) continue;
    const roundDate = date(match[1]);
    const hour = Number(match[2]);
    const minute = Number(match[3]);
    if (!roundDate || hour < 0 || hour > 23 || minute < 0 || minute > 59) continue;
    mapped.set(round, { date: roundDate, time: `${match[2]}:${match[3]}` });
  }
  return mapped;
}

function playerNameParts(value: unknown) {
  const full = text(value);
  const comma = full.indexOf(',');
  if (comma >= 0) {
    return {
      lastname: text(full.slice(0, comma), 32),
      firstname: text(full.slice(comma + 1), 30),
    };
  }
  return { lastname: text(full, 32), firstname: '' };
}

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
  const orderedNumbers = [...usedNumbers].sort((a, b) => a - b);
  const invalidIndex = orderedNumbers.findIndex((number, index) => number !== index + 1);
  if (invalidIndex >= 0) {
    throw new Error(`Chess-Results starting numbers must be continuous from 1 to ${tournament.players.length}. Resort the starting list before publishing.`);
  }
  const key = String(keyOverride || chessResults?.key || '').trim();
  if (requireKey && !/^\d+$/.test(key)) throw new Error('A numeric Chess-Results TNR is required.');
  return { federation, rounds, key };
}

export function buildChessResultsXml(tournament: Tournament, options: { requireKey?: boolean; key?: string } = {}): ChessResultsPublication {
  const { federation, rounds, key } = validateChessResultsTournament(tournament, options.requireKey, options.key);
  const settings = tournament.settings;
  const cr = tournament.chessResults;
  const schedule = roundSchedule(tournament, rounds);
  const liveBoards = tournament.pairings.liveBoards || {};
  const generatedRounds = Object.entries(liveBoards)
    .filter(([, boards]) => Array.isArray(boards) && boards.length > 0)
    .map(([roundKey]) => Number(roundKey))
    .sort((a, b) => a - b);
  const invalidRound = generatedRounds.find(round => !Number.isInteger(round) || round < 1 || round > rounds);
  if (invalidRound !== undefined) {
    throw new Error(`Chess-Results round ${invalidRound} is outside the declared 1-${rounds} round range. Correct the tournament rounds before publishing.`);
  }

  const latestRound = generatedRounds.at(-1) || 0;
  const latestBoards = latestRound ? (liveBoards[String(latestRound)] || []) : [];
  const latestFinalized = latestRound > 0 && (
    tournament.pairings.finalizedRounds?.[String(latestRound)] === true ||
    tournament.pairings.roundStatus?.[String(latestRound)] === 'RESULTS_FINALIZED' ||
    (latestBoards.length > 0 && latestBoards.every(board => isEnteredResult(board.result)))
  );
  const rankingRound = latestRound === 0 ? 0 : latestFinalized ? latestRound : Math.max(0, latestRound - 1);
  const playerByKey = new Map(tournament.players.map(player => [player.localKey, player]));
  const pointsByKey = new Map(tournament.players.map(player => [player.localKey, 0]));

  for (const round of generatedRounds.filter(round => round <= rankingRound)) {
    const pairedKeys = new Set<string>();
    for (const board of liveBoards[String(round)] || []) {
      const white = playerByKey.get(board.whiteKey);
      const black = board.blackKey ? playerByKey.get(board.blackKey) : undefined;
      if (white) {
        pairedKeys.add(white.localKey);
        pointsByKey.set(white.localKey, (pointsByKey.get(white.localKey) || 0) + resultPoints(board.result, 'white', !black, board.pabPoints));
      }
      if (black) {
        pairedKeys.add(black.localKey);
        pointsByKey.set(black.localKey, (pointsByKey.get(black.localKey) || 0) + resultPoints(board.result, 'black', false, board.pabPoints));
      }
    }
    for (const player of tournament.players) {
      if (pairedKeys.has(player.localKey)) continue;
      const requestedBye = player.requestedByes?.[String(round)];
      if (requestedBye === 'half') pointsByKey.set(player.localKey, (pointsByKey.get(player.localKey) || 0) + 0.5);
    }
  }

  const ratingValues = tournament.players.map(player => Number(player.rating || 0)).filter(value => Number.isFinite(value) && value > 0);
  const ratingAverage = ratingValues.length ? Math.round(ratingValues.reduce((sum, value) => sum + value, 0) / ratingValues.length) : '';
  const endStatus = latestRound === rounds && latestFinalized ? 'J' : 'N';
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<chessresults>', '<tournamentdata>'];
  const tournamentAttrs = [
    attr('key', key || '0'), attr('type', '0'), attr('name', text(tournament.name, 160)),
    attr('fideeventid', text(settings.fideEventId, 20)), attr('remark', cr.pinBoardEnabled ? text(cr.pinBoardText, 599) : ''),
    attr('director', text(settings.director, 80)), attr('organiser', text(settings.organizer, 80)), attr('location', text(settings.venue || settings.city, 80)),
    attr('arbiter', text(settings.arbiter, 1200)), attr('rounds', rounds), attr('currentround', latestRound), attr('rankinground', rankingRound),
    attr('sortstartrank', 2), attr('from', date(settings.startDate)), attr('to', date(settings.endDate) || date(settings.startDate)),
    attr('ratedfide', settings.fideRated === 'Yes' ? 'J' : 'N'), attr('ratednational', '-'),
    attr('tb1no', 0), attr('tb2no', 0), attr('tb3no', 0), attr('tb4no', 0), attr('tb5no', 0), attr('replay', 1),
    attr('timecontrol', text(settings.timeControl, 100)), attr('homecolor', ''), attr('samecolor', ''), attr('playerperteam', ''),
    attr('category', 0), attr('ratingavg', ratingAverage), attr('endstatus', endStatus),
    attr('tb1_detail', ''), attr('tb2_detail', ''), attr('tb3_detail', ''), attr('tb4_detail', ''), attr('tb5_detail', ''),
    attr('chiefarbiter', text(settings.chiefArbiter, 120)), attr('deputyarbiter', ''), attr('homepageorganiser', text(settings.website, 80)), attr('mail', text(settings.email, 80)),
    attr('federation', federation), attr('creator', cr.creatorId || 100)
  ];
  lines.push(`<tournament ${tournamentAttrs.join(' ')} />`, '</tournamentdata>', '<rounds>');
  for (let round = 1; round <= rounds; round += 1) {
    const row = schedule.get(round);
    lines.push(`<round ${attr('round', round)} ${attr('date', row?.date || '')} ${attr('time', row?.time || '')} ${attr('replay', 1)} />`);
  }

  lines.push('</rounds>', '<players>');
  const orderedPlayers = [...tournament.players].sort((a, b) => a.pairingNumber - b.pairingNumber);
  orderedPlayers.forEach(player => {
    const names = playerNameParts(player.name);
    const internalId = /^\d{1,12}$/.test(String(player.id || '')) ? player.id : player.pairingNumber;
    const points = pointsByKey.get(player.localKey) || 0;
    lines.push(`<player ${[
      attr('no', player.pairingNumber), attr('id', internalId), attr('lastname', names.lastname), attr('firstname', names.firstname), attr('atitle', ''),
      attr('title', text(player.title, 4)), attr('rtg', numericOrEmpty(player.rating)), attr('rtgfide', numericOrEmpty(player.stdRating || player.rating)),
      attr('rtgnat', numericOrEmpty(player.nationalRating)), attr('dob', birth(player.birth)), attr('sex', player.gender === 'f' ? 'W' : player.gender === 'm' ? 'M' : ''),
      attr('fed', text(player.fed, 3).toUpperCase()), attr('board', ''), attr('teamno', 0), attr('clubname', text(player.club, 40)),
      attr('fideid', String(player.fideId || '').replace(/^-$/, '')), attr('club', ''), attr('typ', text(player.type, 4)), attr('group', text(player.group, 4)),
      attr('rank', player.pairingNumber), attr('tb1', ''), attr('tb2', ''), attr('tb3', ''), attr('tb4', ''), attr('tb5', ''),
      attr('pts', points.toFixed(1)), attr('equal', 'N'), attr('kfaktor', player.fideK || ''), attr('state', '')
    ].join(' ')} />`);
  });

  lines.push('</players>', '<playerpairings>');
  let pairingRecords = 0;
  for (const round of generatedRounds) {
    const boards = [...(liveBoards[String(round)] || [])].sort((a, b) => a.board - b.board);
    const pairedKeys = new Set<string>();
    const boardNumbers = new Set<number>();
    let pairingNumber = 0;

    boards.forEach((board: BoardPairing) => {
      const sourceBoardNumber = Number(board.board);
      if (!Number.isInteger(sourceBoardNumber) || sourceBoardNumber < 1 || boardNumbers.has(sourceBoardNumber)) {
        throw new Error(`Chess-Results round ${round} has an invalid or duplicate board number (${board.board}).`);
      }
      boardNumbers.add(sourceBoardNumber);
      const white = playerByKey.get(board.whiteKey);
      const black = board.blackKey ? playerByKey.get(board.blackKey) : undefined;
      if (!white) throw new Error(`Chess-Results round ${round}, board ${sourceBoardNumber} references an unknown White player.`);
      if (board.blackKey && !black) throw new Error(`Chess-Results round ${round}, board ${sourceBoardNumber} references an unknown Black player.`);
      if (black && black.localKey === white.localKey) throw new Error(`Chess-Results round ${round}, board ${sourceBoardNumber} pairs a player against themselves.`);
      if (pairedKeys.has(white.localKey) || (black && pairedKeys.has(black.localKey))) {
        throw new Error(`Chess-Results round ${round} contains a player on more than one board.`);
      }
      pairedKeys.add(white.localKey);
      if (black) pairedKeys.add(black.localKey);
      const result = pairingResult(board.result, !black);
      pairingRecords += 1;
      pairingNumber += 1;
      // Official 2026 Individual Swiss XML uses pairing as the sequential
      // pairing/table index and board="1" for every player pairing.
      lines.push(`<playerpairing ${[
        attr('round', round), attr('pairing', pairingNumber), attr('board', 1), attr('whiteno', white.pairingNumber),
        attr('blackno', black?.pairingNumber || result.blackNo || -2), attr('reswhite', result.white), attr('resblack', result.black), attr('forfeit', result.forfeit)
      ].join(' ')} />`);
    });

    orderedPlayers.filter(player => !pairedKeys.has(player.localKey)).forEach(player => {
      pairingRecords += 1;
      pairingNumber += 1;
      const requestedBye = player.requestedByes?.[String(round)];
      const whiteResult = requestedBye === 'half' ? '0.5' : requestedBye === 'zero' ? '0.0' : '';
      lines.push(`<playerpairing ${[
        attr('round', round), attr('pairing', pairingNumber), attr('board', 1), attr('whiteno', player.pairingNumber),
        attr('blackno', -2), attr('reswhite', whiteResult), attr('resblack', ''), attr('forfeit', '')
      ].join(' ')} />`);
    });
  }

  lines.push('</playerpairings>', '<security>', `<securitydata ${attr('source', cr.sourceId || 21)} ${attr('sid', '__CP_CR_SID__')} ${attr('creator_sid', '__CP_CR_CREATOR__')} ${attr('tnr_sid', '__CP_CR_TNR__')} />`, '</security>', '</chessresults>');
  return { xml: lines.join('\r\n'), players: tournament.players.length, rounds, generatedRounds: latestRound, pairingRecords, key, federation };
}
