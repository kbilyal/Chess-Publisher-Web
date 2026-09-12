import { Tournament } from '../types';
import { calculateTournamentStandings, getStandingTieBreakValue } from '../engine/tiebreaks';
import { chooseInternalTournamentId } from './onlineCloudSync';
import { orderPlayersForPublication } from '../publication/playerPublicationOrder';

const SCHEMA_VERSION = '1.0';
const PRODUCT = 'Chess-Publisher';
const CLIENT_VERSION = 'Web Companion Online & Cloud';
const BYE_RESULTS = new Set(['PAB', '1 BYE', '½ BYE', '1/2 BYE', '0 BYE']);

const text = (value: unknown) => value == null ? '' : String(value).trim();
const nullableText = (value: unknown) => {
  const normalized = text(value);
  return normalized && normalized !== '-' ? normalized : null;
};
const asInteger = (value: unknown, fallback = 0) => {
  const number = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(number) ? number : fallback;
};
const asNumber = (value: unknown, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};
const stableDecimal = (value: unknown) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return text(value);
  return Math.round((number + Number.EPSILON) * 1_000_000) / 1_000_000;
};
const asBoolean = (value: unknown) => typeof value === 'boolean'
  ? value
  : /^(yes|true|1|y)$/i.test(text(value));
const isoOrNull = (value: unknown) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  const raw = text(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};
const fed = (value: unknown) => {
  const code = text(value).toUpperCase();
  if (!code || code === 'FIDE') return 'FID';
  return /^[A-Z]{3}$/.test(code) ? code : 'FID';
};
const normalizeResult = (value: unknown) => text(value) || '-';
const isByeResult = (value: unknown) => BYE_RESULTS.has(normalizeResult(value).toUpperCase());
const boardComplete = (board: any) => {
  const result = normalizeResult(board?.result);
  if (isByeResult(result)) return true;
  return Boolean(text(board?.whiteKey) && text(board?.blackKey) && result !== '-');
};
const roundComplete = (boards: any) => Array.isArray(boards) && boards.length > 0 && boards.every(boardComplete);

function generatedRoundNumbers(tournament: Tournament | any) {
  const live = tournament?.pairings?.liveBoards || {};
  return Object.keys(live)
    .map(Number)
    .filter(round => Number.isInteger(round) && round > 0 && Array.isArray(live[String(round)]) && live[String(round)].length > 0)
    .sort((a, b) => a - b);
}

function tournamentStatus(tournament: Tournament | any, roundsDeclared: number) {
  const rounds = generatedRoundNumbers(tournament);
  const latest = rounds.length ? rounds[rounds.length - 1] : 0;
  if (roundsDeclared > 0 && latest >= roundsDeclared && roundComplete(tournament?.pairings?.liveBoards?.[String(roundsDeclared)])) return 'finished';
  if (latest > 0) return 'playing';
  if ((tournament?.players || []).length > 0 || text(tournament?.settings?.startDate)) return 'registration';
  return 'draft';
}

function playerStableKey(player: any, index: number) {
  const localKey = text(player?.localKey || player?.key);
  if (localKey) return localKey;
  const fideId = nullableText(player?.fideId);
  if (fideId) return `fid:${fideId}`;
  throw new Error(`Hub snapshot requires a stable key for local player at index ${index}.`);
}

function normalizePlayers(tournament: Tournament | any) {
  return orderPlayersForPublication(tournament).map((player: any, index: number) => ({
    key: playerStableKey(player, index),
    name: text(player?.name),
    fideId: nullableText(player?.fideId),
    federation: fed(player?.fed),
    rating: Math.max(0, asInteger(player?.rating, 0)),
    birth: nullableText(player?.birth),
    title: text(player?.title),
    attendance: player?.attendance === 'absent' ? 'absent' : 'present',
    joinedFromRound: Math.max(1, asInteger(player?.joinedFromRound, 1))
  }));
}

function normalizeRounds(tournament: Tournament | any) {
  const live = tournament?.pairings?.liveBoards || {};
  return generatedRoundNumbers(tournament).map(round => ({
    round,
    complete: roundComplete(live[String(round)] || []),
    pairings: (live[String(round)] || [])
      .map((pairing: any, index: number) => ({
        board: Math.max(1, asInteger(pairing?.board, index + 1)),
        whiteKey: nullableText(pairing?.whiteKey),
        blackKey: isByeResult(pairing?.result) || text(pairing?.blackKey).toLowerCase() === 'bye' ? null : nullableText(pairing?.blackKey),
        result: normalizeResult(pairing?.result)
      }))
      .sort((a: any, b: any) => a.board - b.board)
  }));
}

function defaultTieBreakKey(label: unknown, index: number) {
  const compact = text(label)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return compact || `tb-${index + 1}`;
}

function normalizeRegulationsFile(tournament: Tournament | any) {
  const raw = tournament?.hub?.regulationsFile
    || tournament?.online?.regulationsFile
    || tournament?.regulations?.attachment;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const name = text(raw.name || raw.fileName || raw.filename);
  if (!name) return null;
  return {
    name,
    size: Math.max(0, asInteger(raw.size ?? raw.sizeBytes, 0)),
    contentType: text(raw.contentType || raw.mimeType || raw.type) || 'application/octet-stream',
    uploadedAt: isoOrNull(raw.uploadedAt || raw.createdAt),
    objectKey: nullableText(raw.objectKey || raw.key || raw.storageKey),
    url: nullableText(raw.url || raw.publicUrl || raw.downloadUrl),
    sha256: nullableText(raw.sha256 || raw.checksum),
    etag: nullableText(raw.etag)
  };
}

function normalizeRegulations(tournament: Tournament | any) {
  const regulations = tournament?.regulations || {};
  return {
    eligibility: text(regulations.eligibility),
    format: text(regulations.format),
    rounds: text(regulations.rounds),
    timeControl: text(regulations.timeControl),
    pairingSystem: text(regulations.pairingSystem),
    rating: text(regulations.rating),
    defaultTime: text(regulations.defaultTime),
    drawRules: text(regulations.drawRules),
    pabPoints: text(regulations.pabPoints),
    tieBreaks: (Array.isArray(regulations.tieBreaks) ? regulations.tieBreaks : []).map(text).filter(Boolean),
    entryFee: text(regulations.entryFee),
    registrationDeadline: isoOrNull(regulations.registrationDeadline),
    maximumPlayers: text(regulations.maximumPlayers),
    fideInfo: text(regulations.fideInfo),
    totalPrizeFund: text(regulations.totalPrizeFund),
    mainPrizes: text(regulations.mainPrizes),
    specialPrizes: text(regulations.specialPrizes),
    categoryPrizes: text(regulations.categoryPrizes),
    additional: text(regulations.additional),
    file: normalizeRegulationsFile(tournament)
  };
}

function normalizeSchedule(tournament: Tournament | any) {
  const rows = Array.isArray(tournament?.schedule?.rows) ? tournament.schedule.rows : [];
  return rows.map((row: any) => ({
    no: text(row?.no),
    dateTime: isoOrNull(row?.dateTime),
    event: text(row?.event),
    description: text(row?.description)
  }));
}

export function validatePublicHubSnapshot(snapshot: any) {
  if (snapshot?.schemaVersion !== SCHEMA_VERSION) throw new Error('Unsupported Hub snapshot schema version.');
  if (snapshot?.client?.product !== PRODUCT || !text(snapshot?.client?.version)) throw new Error('Invalid Hub snapshot client.');
  if (!text(snapshot?.tournament?.localKey)) throw new Error('Tournament local key is missing.');
  if (!text(snapshot?.tournament?.name)) throw new Error('Tournament name is missing.');
  if (!/^[A-Z]{3}$/.test(text(snapshot?.tournament?.location?.federation))) throw new Error('Tournament federation must be a three-letter code.');
  if (snapshot?.tournament?.fideEventId != null && !/^\d+$/.test(text(snapshot.tournament.fideEventId))) {
    throw new Error('FIDE Event ID must be numeric when published to the Hub.');
  }

  const players = Array.isArray(snapshot?.players) ? snapshot.players : [];
  const playerKeys = new Set<string>();
  for (const player of players) {
    if (!text(player?.key)) throw new Error('A Hub player key is missing.');
    if (!text(player?.name)) throw new Error(`Hub player name is missing for ${player?.key}.`);
    if (playerKeys.has(player.key)) throw new Error(`Duplicate Hub player key: ${player.key}`);
    if (!/^[A-Z]{3}$/.test(text(player?.federation))) throw new Error(`Player federation must be a three-letter code: ${player.key}`);
    playerKeys.add(player.key);
  }

  const roundNumbers = new Set<number>();
  for (const round of snapshot?.rounds || []) {
    if (roundNumbers.has(round.round)) throw new Error(`Duplicate Hub round: ${round.round}`);
    roundNumbers.add(round.round);
    const boards = new Set<number>();
    for (const pairing of round?.pairings || []) {
      if (boards.has(pairing.board)) throw new Error(`Duplicate board ${pairing.board} in round ${round.round}.`);
      boards.add(pairing.board);
      for (const key of [pairing.whiteKey, pairing.blackKey]) {
        if (key && !playerKeys.has(key)) throw new Error(`Unknown player key ${key} in round ${round.round}.`);
      }
    }
  }

  const regulationsFile = snapshot?.regulations?.file;
  if (regulationsFile) {
    if (!text(regulationsFile.name)) throw new Error('Regulations attachment filename is missing.');
    if (!Number.isInteger(regulationsFile.size) || regulationsFile.size < 0 || regulationsFile.size > 20 * 1024 * 1024) {
      throw new Error('Regulations attachment size is invalid.');
    }
  }

  const standingPlayers = new Set<string>();
  for (const row of snapshot?.standings?.rows || []) {
    if (!playerKeys.has(row.playerKey)) throw new Error(`Unknown standings player key: ${row.playerKey}`);
    if (standingPlayers.has(row.playerKey)) throw new Error(`Duplicate standings player key: ${row.playerKey}`);
    standingPlayers.add(row.playerKey);
    if ((row.tieBreakValues || []).length !== (snapshot?.standings?.tieBreaks || []).length) {
      throw new Error(`Tie-break value count mismatch for ${row.playerKey}.`);
    }
  }
  return true;
}

export function buildPublicHubSnapshot(tournament: Tournament | any, publication: {
  hubTournamentId?: string;
  publicSlug?: string;
  revision?: number;
} = {}) {
  const settings = tournament?.settings || {};
  const roundsDeclared = Math.max(1, asInteger(settings.rounds, 1));
  const currentRevision = Math.max(0, asInteger(publication.revision, 0));
  const standings = calculateTournamentStandings(tournament);
  const tieList = Array.isArray(standings?.tieList) ? standings.tieList : [];
  const internalId = chooseInternalTournamentId(tournament, [publication.hubTournamentId]);
  const fideEventId = /^\d+$/.test(text(settings.fideEventId)) ? text(settings.fideEventId).slice(0, 20) : null;

  const snapshot = {
    schemaVersion: SCHEMA_VERSION,
    client: {
      product: PRODUCT,
      version: CLIENT_VERSION
    },
    publication: {
      hubTournamentId: nullableText(publication.hubTournamentId),
      publicSlug: nullableText(publication.publicSlug),
      revision: currentRevision + 1,
      generatedAt: new Date().toISOString(),
      previousRevision: currentRevision === 0 ? null : currentRevision,
      checksum: null
    },
    tournament: {
      localKey: internalId,
      name: text(tournament?.name) || 'Tournament',
      status: tournamentStatus(tournament, roundsDeclared),
      format: text(settings.tournamentFormat),
      pairingSystem: text(settings.pairingSystem),
      timeControl: text(settings.customTimeControl || settings.timeControl || settings.timeControlPreset),
      ratingType: text(settings.tournamentRatingType),
      fideRated: asBoolean(settings.fideRated),
      fideEventId,
      roundsDeclared,
      location: {
        venue: text(settings.venue),
        city: text(settings.city),
        federation: fed(settings.country)
      },
      staff: {
        organizer: text(settings.organizer),
        chiefArbiter: text(settings.chiefArbiter),
        arbiter: text(settings.arbiter),
        director: text(settings.director)
      },
      dates: {
        start: isoOrNull(settings.startDate),
        end: isoOrNull(settings.endDate),
        registrationDeadline: isoOrNull(settings.generalRegistrationDeadline)
      },
      contact: {
        email: text(settings.email),
        phone: text(settings.phone)
      },
      links: {
        website: text(settings.website),
        live: text(settings.liveLink)
      }
    },
    players: normalizePlayers(tournament),
    rounds: normalizeRounds(tournament),
    standings: {
      round: Math.max(0, asInteger(standings?.completed, 0)),
      final: roundsDeclared > 0 && Math.max(0, asInteger(standings?.completed, 0)) >= roundsDeclared,
      tieBreaks: tieList.map((label: string, index: number) => ({
        key: defaultTieBreakKey(label, index),
        label: text(label)
      })),
      rows: (standings?.players || []).map((player: any, index: number) => ({
        rank: index + 1,
        playerKey: text(player?.key) || playerStableKey(player, index),
        points: asNumber(player?.score, 0),
        tieBreakValues: tieList.map((tie: string) => stableDecimal(getStandingTieBreakValue(player, tie)))
      }))
    },
    regulations: normalizeRegulations(tournament),
    schedule: normalizeSchedule(tournament)
  };

  validatePublicHubSnapshot(snapshot);
  return snapshot;
}
