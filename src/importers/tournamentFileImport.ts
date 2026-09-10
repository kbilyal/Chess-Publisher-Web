import { parse as parseTunx } from '@echecs/tunx';
import { Tournament, BoardPairing, FideTitle, Gender, RatingType } from '../types';
import { createInitialEmptyTournament } from '../data/initialData';
import { calculateTrfImportPreflight } from '../transactions/trfImportWorkflow';
import { looksLikePlayersXml, parsePlayersXml } from './playersXml';

export type TournamentImportKind = 'trf' | 'tunx' | 'players-xml';
export type TournamentImportResult = {
  tournament: Tournament;
  kind: TournamentImportKind;
  fileName: string;
  playerCount: number;
  roundsImported: number;
  warnings: string[];
};

const text = (value: unknown) => value == null ? '' : String(value).trim();
const clampPositiveInt = (value: unknown, fallback: number) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};
const isoDateTime = (value: unknown) => {
  const raw = text(value);
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw}T00:00`;
  return raw;
};
const fileStem = (name: string) => name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Imported Tournament';

function clearPortableIdentity(tournament: any) {
  delete tournament.cloud;
  delete tournament.online;
  delete tournament.hub;
  delete tournament.publication;
  delete tournament.savedAt;
  delete tournament.uiState;
  delete tournament.runtimeState;
  delete tournament.dgt;
}

export function createCleanTournament(name = 'New Tournament'): Tournament {
  const next: any = createInitialEmptyTournament(text(name) || 'New Tournament');
  clearPortableIdentity(next);
  next.name = text(name) || 'New Tournament';
  next.settings = {
    ...next.settings,
    organizer: '', chiefArbiter: '', arbiter: '', director: '', tnr: '', venue: '', city: '',
    country: 'BUL', timeControl: '90+30', timeControlPreset: '90+30', customTimeControl: '',
    startDate: '', endDate: '', generalRegistrationDeadline: '', rounds: '7', lastSwissRounds: '7',
    roundRobinCycles: '1', tournamentFormat: 'Individual Swiss', pairingSystem: 'FIDE Dutch System',
    fideRated: 'Yes', tournamentRatingType: 'Standard', initialRankSorting: 'automatic',
    initialRatingSource: 'fide', pairingScoreSystem: 'game-1-0.5-0', tournamentType: 'unknown',
    liveLink: '', website: '', email: '', phone: '', fideEventId: '', generalNotes: ''
  };
  next.telegram = { channel: '', language: 'en', signature: '' };
  next.chessResults = {
    ...next.chessResults,
    clientId: '', key: '', mode: '', federation: 'BUL', createdAt: '', lastUpload: '',
    uploadStatus: 'Not published', lastError: '', publishCount: 0, lastConnectionTest: '',
    sidVerified: false, freshTnrRequired: false, pinBoardEnabled: false, pinBoardText: '', activityLog: []
  };
  next.players = [];
  next.pairings = {
    ...next.pairings,
    round: '-1', results: 'NO', liveBoards: {}, finalStandingsPromptedRound: 0,
    trfImportMeta: undefined, finalizedRounds: {}, roundStatus: {}, finalizedAt: {}, finalizedBy: {}, finalizedSnapshots: {},
    engine: {
      ...next.pairings.engine,
      excluded: [], lastGeneratedRound: 0, lastEngineMessage: 'Engine ready', excludeRemaining: {},
      excludeRounds: {}, manualByes: {}, fixedBoards: {}, roundActivationConfirmed: {}, needsResort: false,
      registrationsDirty: false, syncedAbsent: {}, registrationSyncedAt: '', registrationSyncedForRound: 0,
      registrationSyncedSignature: '', firstRoundRegistrationLocked: false,
      firstRoundRegistrationSyncedSignature: '', firstRoundRegistrationNeedsResort: false,
      firstRoundRegistrationSyncedAt: ''
    }
  };
  next.schedule = {
    registrationOpens: '', registrationCloses: '', technicalMeeting: '', openingCeremony: '',
    closingCeremony: '', awardCeremony: '', notes: '', rows: []
  };
  next.regulations = {
    ...next.regulations,
    eligibility: '', format: 'Individual Swiss', rounds: '7', timeControl: '90+30',
    pairingSystem: 'FIDE Dutch System', rating: '', defaultTime: '', drawRules: '',
    entryFee: '', registrationDeadline: '', maximumPlayers: '', fideInfo: '', totalPrizeFund: '',
    mainPrizes: '', specialPrizes: '', categoryPrizes: '', additional: ''
  };
  delete next.specialPrizeConfig;
  delete next.specialPrizeResult;
  return next as Tournament;
}

function decodeText(bytes: Uint8Array) {
  let decoded = new TextDecoder('utf-8').decode(bytes);
  if (decoded.includes('\uFFFD')) {
    try { decoded = new TextDecoder('windows-1252').decode(bytes); } catch { /* keep UTF-8 */ }
  }
  return decoded;
}

function bytesToBase64(bytes: Uint8Array) {
  if (typeof globalThis.btoa !== 'function') throw new Error('This browser cannot preserve the TUNX source bytes.');
  let binary = '';
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    const part = bytes.subarray(offset, Math.min(bytes.length, offset + chunk));
    binary += String.fromCharCode(...part);
  }
  return globalThis.btoa(binary);
}

function inferRatingType(timeControl: string): RatingType {
  const match = text(timeControl).match(/(\d+)\s*(?:\+\s*(\d+))?/);
  if (!match) return 'Standard';
  const base = Number(match[1] || 0);
  const increment = Number(match[2] || 0);
  const estimated60MoveMinutes = base + increment;
  if (estimated60MoveMinutes >= 60) return 'Standard';
  if (estimated60MoveMinutes >= 10) return 'Rapid';
  return 'Blitz';
}

function mapTieBreak(value: unknown): string | null {
  const key = text(value).toLowerCase();
  const mapped: Record<string, string> = {
    'buchholz': 'Buchholz Tie-Break (2023) [84]',
    'buchholz-cut-1': 'Buchholz Cut-1 (BH-C1) [84]',
    'buchholz-cut-2': 'Buchholz Cut-2 (BH-C2) [84]',
    'buchholz-cut-3': 'Buchholz Cut-2 (BH-C2) [84]',
    'median-buchholz': 'Median Buchholz (BH-M1) [84]',
    'sonneborn-berger': 'Sonneborn-Berger Tie-Break (2023) [85]',
    'direct-encounter': 'Direct Encounter (DE) [81]',
    'average-rating': 'Average Rating of Opponents (ARO) [80]',
    'number-of-wins': 'Greater number of victories (WIN) [68]',
    'performance-rating': 'Performance Tie-Break (TPR) [88]',
    'progressive': 'FIDE Tiebreak (Progressive Score) [86]',
    'koya': 'Koya System (KS) [87]'
  };
  return mapped[key] || null;
}

function mapTrfDescriptor(value: string): string | null {
  const key = value.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
  if (!key || key === 'PTS') return null;
  if (/BHC?1|BH-C1/.test(key)) return 'Buchholz Cut-1 (BH-C1) [84]';
  if (/BHC?2|BH-C2/.test(key)) return 'Buchholz Cut-2 (BH-C2) [84]';
  if (key.startsWith('BH')) return 'Buchholz Tie-Break (2023) [84]';
  if (key.startsWith('SB')) return 'Sonneborn-Berger Tie-Break (2023) [85]';
  if (key === 'DE') return 'Direct Encounter (DE) [81]';
  if (key === 'ARO') return 'Average Rating of Opponents (ARO) [80]';
  if (key === 'WIN' || key === 'WON') return 'Greater number of victories (WIN) [68]';
  if (key === 'BWG') return 'Greater number of games won with Black (BWG) [68]';
  if (key === 'TPR') return 'Performance Tie-Break (TPR) [88]';
  if (key === 'KS' || key === 'KOYA') return 'Koya System (KS) [87]';
  return null;
}

function extractTrfExtra(textContent: string, totalRounds: number) {
  const lines = textContent.split(/\r?\n/);
  let deputyArbiter = '';
  let tournamentType = '';
  const descriptors: string[] = [];
  const roundDates: string[] = [];
  for (const line of lines) {
    const code = line.slice(0, 3);
    const content = line.slice(4).trim();
    if (code === '112' && !deputyArbiter) deputyArbiter = content;
    if (code === '092' && !tournamentType) tournamentType = content;
    if (code === '212') descriptors.push(...content.split(',').map(item => item.trim()).filter(Boolean));
    if (code === '132') {
      const matches = content.match(/(?:\d{4}|\d{2})[\/.\-]\d{2}[\/.\-]\d{2}/g) || [];
      for (const raw of matches) {
        const parts = raw.split(/[\/.\-]/);
        let year = parts[0] || '';
        if (year.length === 2) year = `20${year}`;
        if (year.length === 4) roundDates.push(`${year}-${parts[1]}-${parts[2]}`);
      }
    }
  }
  return { deputyArbiter, tournamentType, descriptors, roundDates: roundDates.slice(0, totalRounds) };
}

export function importTrfText(trfContent: string, sourceFileName = 'tournament.trf'): TournamentImportResult {
  const preliminary = calculateTrfImportPreflight(createCleanTournament(fileStem(sourceFileName)), trfContent);
  if (!preliminary.valid || !preliminary.proposedTournament || !preliminary.parsedData) {
    throw new Error(preliminary.conflictReport.validationErrors.join(' ') || 'TRF import validation failed.');
  }
  const parsed = preliminary.parsedData;
  const next: any = preliminary.proposedTournament;
  clearPortableIdentity(next);
  next.settings.tnr = '';
  next.chessResults = { ...createCleanTournament(next.name).chessResults, federation: parsed.country || 'BUL' };
  const extra = extractTrfExtra(trfContent, parsed.rounds || 0);
  if (extra.deputyArbiter) next.settings.arbiter = extra.deputyArbiter;
  const isRoundRobin = /round\s*robin|berger/i.test(extra.tournamentType);
  next.settings.tournamentFormat = isRoundRobin ? 'Individual Round Robin' : 'Individual Swiss';
  next.settings.pairingSystem = isRoundRobin ? 'Round Robin - Berger Tables' : 'FIDE Dutch System';
  next.settings.tournamentRatingType = inferRatingType(next.settings.timeControl);
  next.regulations = {
    ...next.regulations,
    format: next.settings.tournamentFormat,
    rounds: String(parsed.rounds || next.settings.rounds || 7),
    timeControl: next.settings.timeControl,
    pairingSystem: next.settings.pairingSystem
  };
  const mappedTieBreaks = extra.descriptors.map(mapTrfDescriptor).filter(Boolean) as string[];
  if (mappedTieBreaks.length) next.regulations.tieBreaks = [...new Set(mappedTieBreaks)];
  if (extra.roundDates.length) {
    next.schedule.rows = extra.roundDates.map((date, index) => ({
      no: String(index + 1), dateTime: `${date}T00:00`, event: `Round ${index + 1}`, description: `Round ${index + 1} / ${parsed.rounds}`
    }));
  }
  next.pairings.trfImportMeta = {
    sourceType: 'trf', sourceFileName, importedAt: new Date().toISOString(), trfVersion: parsed.version,
    completePortableImport: true
  };
  return {
    tournament: next as Tournament,
    kind: 'trf',
    fileName: sourceFileName,
    playerCount: next.players.length,
    roundsImported: Object.keys(next.pairings.liveBoards || {}).length,
    warnings: preliminary.conflictReport.validationWarnings || []
  };
}

const CONFIG_MARKER = [0x95, 0xff, 0x89, 0x44];
const PAIRINGS_MARKER = [0xb3, 0xff, 0x89, 0x44];
const PAIRING_RECORD_SIZE = 21;
const BYE_PLAYER_NUMBER = 0xfffe;

function findBytes(haystack: Uint8Array, needle: number[]) {
  outer: for (let index = 0; index <= haystack.length - needle.length; index++) {
    for (let offset = 0; offset < needle.length; offset++) if (haystack[index + offset] !== needle[offset]) continue outer;
    return index;
  }
  return -1;
}

function tunxResult(code: number, hasOpponent: boolean) {
  if (!hasOpponent) {
    if (code === 2) return '½ BYE';
    if (code === 0) return '0 BYE';
    return '1 BYE';
  }
  if (code === 1) return '1 - 0';
  if (code === 2) return '½ - ½';
  if (code === 3) return '0 - 1';
  if (code === 4) return '1F - 0F';
  if (code === 5) return '0F - 1F';
  return '-';
}

function extractTunxLiveBoards(bytes: Uint8Array, parsed: any, keyByStartingRank: Map<number, string>) {
  const configOffset = findBytes(bytes, CONFIG_MARKER);
  const pairingsOffset = findBytes(bytes, PAIRINGS_MARKER);
  if (configOffset < 0 || pairingsOffset < 0) return {} as Record<string, BoardPairing[]>;
  const configData = configOffset + 4;
  if (configData + 0x15 > bytes.length) return {} as Record<string, BoardPairing[]>;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const totalRounds = view.getUint16(configData, true) || Number(parsed?.totalRounds || 0);
  const currentRound = view.getUint8(configData + 0x11);
  const playerCount = view.getUint16(configData + 0x13, true) || (parsed?.players?.length || 0);
  const pairingsPerRound = Math.ceil(playerCount / 2);
  const roundsToRead = Math.min(totalRounds, Math.max(currentRound, parsed?.completedRounds?.length || 0));
  const liveBoards: Record<string, BoardPairing[]> = {};
  const start = pairingsOffset + 4;
  for (let round = 1; round <= roundsToRead; round++) {
    const boards: BoardPairing[] = [];
    for (let slot = 0; slot < pairingsPerRound; slot++) {
      const offset = start + (((round - 1) * pairingsPerRound + slot) * PAIRING_RECORD_SIZE);
      if (offset + PAIRING_RECORD_SIZE > bytes.length) break;
      const whiteNo = view.getUint16(offset, true);
      const blackNo = view.getUint16(offset + 2, true);
      const resultCode = view.getUint16(offset + 4, true);
      if (!whiteNo || whiteNo > playerCount) continue;
      const whiteKey = keyByStartingRank.get(whiteNo);
      if (!whiteKey) continue;
      const hasOpponent = blackNo > 0 && blackNo !== BYE_PLAYER_NUMBER;
      const blackKey = hasOpponent ? keyByStartingRank.get(blackNo) : undefined;
      if (hasOpponent && !blackKey) continue;
      const result = tunxResult(resultCode, hasOpponent) as any;
      boards.push({
        board: slot + 1,
        whiteKey,
        blackKey: blackKey || 'bye',
        result,
        ...(hasOpponent ? {} : { entryType: result === '1 BYE' ? 'PAB' : 'REQUESTED_BYE' })
      });
    }
    if (boards.length) liveBoards[String(round)] = boards;
  }
  return liveBoards;
}

function localKeyForTunxPlayer(player: any, pairingNumber: number) {
  const fideId = text(player?.fideId);
  if (/^\d+$/.test(fideId)) return `fid:${fideId}`;
  const slug = text(player?.name).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'player';
  return `tunx:${slug}:${pairingNumber}`;
}

export function importTunxBytes(bytes: Uint8Array, sourceFileName = 'tournament.TUNX'): TournamentImportResult {
  if (bytes.length > 8 * 1024 * 1024) throw new Error('TUNX import is limited to 8 MiB.');
  const errors: string[] = [];
  const warnings: string[] = [];
  const parsed: any = parseTunx(bytes, {
    onError: (error: any) => errors.push(text(error?.message || error)),
    onWarning: (warning: any) => warnings.push(text(warning?.message || warning))
  });
  if (!parsed) throw new Error(errors.join(' ') || 'The selected file is not a valid TUNX tournament.');
  if (!Array.isArray(parsed.players) || parsed.players.length === 0) throw new Error('TUNX does not contain any tournament players.');
  if (/team/i.test(text(parsed.metadata?.tournamentType))) throw new Error('Team TUNX tournaments are not supported by the current Individual tournament model.');

  const name = text(parsed.metadata?.name) || fileStem(sourceFileName);
  const next: any = createCleanTournament(name);
  const isRoundRobin = /round-robin/i.test(text(parsed.metadata?.tournamentType));
  const country = text(parsed.metadata?.federation).toUpperCase().slice(0, 3) || 'BUL';
  const rounds = clampPositiveInt(parsed.totalRounds, 7);
  const timeControl = text(parsed.metadata?.timeControl) || '90+30';
  next.settings = {
    ...next.settings,
    chiefArbiter: text(parsed.metadata?.chiefArbiter),
    arbiter: Array.isArray(parsed.metadata?.deputyArbiters) ? parsed.metadata.deputyArbiters.filter(Boolean).join('; ') : '',
    city: text(parsed.metadata?.city), country, timeControl, timeControlPreset: timeControl,
    startDate: isoDateTime(parsed.metadata?.startDate), endDate: isoDateTime(parsed.metadata?.endDate),
    rounds: String(rounds), lastSwissRounds: String(rounds),
    tournamentFormat: isRoundRobin ? 'Individual Round Robin' : 'Individual Swiss',
    pairingSystem: isRoundRobin ? 'Round Robin - Berger Tables' : 'FIDE Dutch System',
    tournamentRatingType: inferRatingType(timeControl), tnr: ''
  };
  next.chessResults = { ...next.chessResults, key: '', mode: '', federation: country, freshTnrRequired: false };

  const keyByStartingRank = new Map<number, string>();
  next.players = parsed.players.map((player: any, index: number) => {
    const pairingNumber = clampPositiveInt(player?.startingRank || player?.id, index + 1);
    const localKey = localKeyForTunxPlayer(player, pairingNumber);
    keyByStartingRank.set(pairingNumber, localKey);
    const nationalRating = Array.isArray(player?.nationalRatings) ? Number(player.nationalRatings[0]?.rating || 0) : 0;
    return {
      id: pairingNumber,
      localKey,
      name: text(player?.name) || `Player ${pairingNumber}`,
      rating: Math.max(0, Number(player?.rating || nationalRating || 0)),
      nationalRating: nationalRating > 0 ? nationalRating : undefined,
      fed: text(player?.federation).toUpperCase().slice(0, 3) || country,
      fideId: text(player?.fideId) || '-',
      birth: text(player?.birthDate) || '-',
      gender: (text(player?.sex).toLowerCase() === 'w' ? 'f' : 'm') as Gender,
      title: (text(player?.title) || '') as FideTitle,
      attendance: 'present' as const,
      pairingNumber,
      joinedFromRound: 1,
      nationalId: Array.isArray(player?.nationalRatings) ? text(player.nationalRatings[0]?.nationalId) || undefined : undefined
    };
  });

  const liveBoards = extractTunxLiveBoards(bytes, parsed, keyByStartingRank);
  const importedRoundCount = Object.keys(liveBoards).length;
  next.pairings = {
    ...next.pairings,
    round: importedRoundCount ? String(importedRoundCount) : '-1',
    results: importedRoundCount ? String(importedRoundCount) : 'NO',
    liveBoards,
    trfImportMeta: {
      sourceType: 'tunx', sourceFileName, importedAt: new Date().toISOString(), parser: '@echecs/tunx@1.0.1',
      completePortableImport: true, sourcePreservedPrivately: true
    }
  };

  const importedTieBreakNames = Array.isArray(parsed.tiebreaks) ? parsed.tiebreaks.map((item: any) => text(item)).filter(Boolean) : [];
  const mappedTieBreaks = importedTieBreakNames.map(mapTieBreak).filter(Boolean) as string[];
  next.regulations = {
    ...next.regulations,
    format: next.settings.tournamentFormat,
    rounds: String(rounds),
    timeControl,
    pairingSystem: next.settings.pairingSystem,
    ...(mappedTieBreaks.length ? { tieBreaks: [...new Set(mappedTieBreaks)] } : {}),
    tunxImportedTieBreakNames: importedTieBreakNames,
    tunxSourceTemplateBase64: bytesToBase64(bytes),
    tunxSourceTemplateFileName: sourceFileName
  };

  const roundDates: string[] = Array.isArray(parsed.metadata?.roundDates) ? parsed.metadata.roundDates : [];
  next.schedule.rows = Array.from({ length: rounds }, (_, index) => ({
    no: String(index + 1),
    dateTime: roundDates[index] ? `${roundDates[index]}T00:00` : '',
    event: `Round ${index + 1}`,
    description: `Round ${index + 1} / ${rounds}`
  }));

  return {
    tournament: next as Tournament,
    kind: 'tunx',
    fileName: sourceFileName,
    playerCount: next.players.length,
    roundsImported: importedRoundCount,
    warnings
  };
}

export function importPlayersXmlText(xmlContent: string, sourceFileName = 'Players.XML'): TournamentImportResult {
  const parsed = parsePlayersXml(xmlContent);
  const next: any = createCleanTournament(parsed.tournamentName || fileStem(sourceFileName));
  next.players = parsed.players;
  next.settings = { ...next.settings, tnr: '' };
  next.chessResults = { ...next.chessResults, key: '', freshTnrRequired: false };
  next.pairings = {
    ...next.pairings,
    round: '-1',
    results: 'NO',
    liveBoards: {},
    trfImportMeta: {
      sourceType: 'players-xml',
      sourceFileName,
      sourceTournamentKey: parsed.sourceTournamentKey,
      importedAt: new Date().toISOString(),
      playersOnly: true,
      completePortableImport: false
    }
  };
  return {
    tournament: next as Tournament,
    kind: 'players-xml',
    fileName: sourceFileName,
    playerCount: next.players.length,
    roundsImported: 0,
    warnings: parsed.warnings
  };
}

export async function importTournamentFile(file: File): Promise<TournamentImportResult> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const lowerName = file.name.toLowerCase();
  const isTunxMagic = bytes.length >= 4 && bytes[0] === 0x93 && bytes[1] === 0xff && bytes[2] === 0x89 && bytes[3] === 0x44;
  if (lowerName.endsWith('.tunx') || isTunxMagic) return importTunxBytes(bytes, file.name);
  const decoded = decodeText(bytes);
  if (lowerName.endsWith('.xml') || looksLikePlayersXml(decoded)) {
    if (!looksLikePlayersXml(decoded)) throw new Error('Unsupported XML file. Select a Players XML roster.');
    return importPlayersXmlText(decoded, file.name);
  }
  if (!/(^|\r?\n)001\s/.test(decoded) && !/(^|\r?\n)012\s/.test(decoded)) {
    throw new Error('Unsupported tournament file. Select TRF16, TRF26, TUNX or Players XML.');
  }
  return importTrfText(decoded, file.name);
}
