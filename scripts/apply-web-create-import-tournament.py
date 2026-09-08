from pathlib import Path
import re

# 1) Full private tournament-file importer: TRF16/TRF26 + TUNX.
importer = Path('src/importers/tournamentFileImport.ts')
importer.parent.mkdir(parents=True, exist_ok=True)
importer.write_text(r'''import { parse as parseTunx } from '@echecs/tunx';
import { Tournament, BoardPairing, FideTitle, Gender, RatingType } from '../types';
import { createInitialEmptyTournament } from '../data/initialData';
import { calculateTrfImportPreflight } from '../transactions/trfImportWorkflow';

export type TournamentImportKind = 'trf' | 'tunx';
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

export async function importTournamentFile(file: File): Promise<TournamentImportResult> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const lowerName = file.name.toLowerCase();
  const isTunxMagic = bytes.length >= 4 && bytes[0] === 0x93 && bytes[1] === 0xff && bytes[2] === 0x89 && bytes[3] === 0x44;
  if (lowerName.endsWith('.tunx') || isTunxMagic) return importTunxBytes(bytes, file.name);
  const trf = decodeText(bytes);
  if (!/(^|\r?\n)001\s/.test(trf) && !/(^|\r?\n)012\s/.test(trf)) {
    throw new Error('Unsupported tournament file. Select TRF16, TRF26 or TUNX.');
  }
  return importTrfText(trf, file.name);
}
''')

# 2) My Tournaments start page UI: New tournament + one Import button.
p = Path('src/companion/CompanionCloudScreens.tsx')
s = p.read_text()
s = s.replace("import React from 'react';", "import React, { useRef, useState } from 'react';")
s = s.replace(
    "import { ArrowRight, CheckCircle2, Cloud, LogOut, RefreshCw, ShieldCheck, Smartphone, Trophy, WifiOff } from 'lucide-react';",
    "import { ArrowRight, CheckCircle2, Cloud, FileUp, LogOut, Plus, RefreshCw, ShieldCheck, Smartphone, Trophy, WifiOff, X } from 'lucide-react';"
)
s = s.replace(
    "  onContinueLocal: () => void;\n}) {\n  const { organizerName, tournaments, localTournament, busy, status, statusKind, onRefresh, onSignOut, onOpen, onContinueLocal } = props;",
    "  onContinueLocal: () => void;\n  onCreateNew: (name: string) => void;\n  onImportFile: (file: File) => void;\n}) {\n  const { organizerName, tournaments, localTournament, busy, status, statusKind, onRefresh, onSignOut, onOpen, onContinueLocal, onCreateNew, onImportFile } = props;\n  const [newDialog, setNewDialog] = useState(false);\n  const [newName, setNewName] = useState('New Tournament');\n  const importInputRef = useRef<HTMLInputElement>(null);\n  const submitNew = () => {\n    const value = newName.trim();\n    if (!value || busy) return;\n    setNewDialog(false);\n    onCreateNew(value);\n  };"
)
head = '''        <section className="companion-select-head">\n          <div><span className="companion-entry-eyebrow">SYNCHRONIZED WORKSPACE</span><h1>My tournaments</h1><p>Open the same private tournament used by Chess-Publisher Desktop.</p></div>\n          <div className="companion-organizer-pill"><ShieldCheck size={15} /><span><small>Organizer</small><strong>{organizerName}</strong></span></div>\n        </section>'''
replacement = '''        <section className="companion-select-head">\n          <div><span className="companion-entry-eyebrow">SYNCHRONIZED WORKSPACE</span><h1>My tournaments</h1><p>Create here or import a full tournament, then continue the same Cloud record in Chess-Publisher Desktop.</p></div>\n          <div className="companion-organizer-pill"><ShieldCheck size={15} /><span><small>Organizer</small><strong>{organizerName}</strong></span></div>\n        </section>\n\n        <section className="companion-start-actions" aria-label="Tournament start actions">\n          <button type="button" className="companion-start-action primary" disabled={busy} onClick={() => setNewDialog(true)}>\n            <Plus size={18} /><span><strong>New tournament</strong><small>Create a private Cloud tournament that Desktop can open.</small></span><ArrowRight size={16} />\n          </button>\n          <button type="button" className="companion-start-action" disabled={busy} onClick={() => importInputRef.current?.click()}>\n            <FileUp size={18} /><span><strong>Import tournament</strong><small>TRF16 · TRF26 · TUNX — full tournament import and Cloud sync.</small></span><ArrowRight size={16} />\n          </button>\n          <input\n            ref={importInputRef}\n            className="companion-import-input"\n            type="file"\n            accept=".trf,.trf16,.trf26,.txt,.tunx,.TUNX,text/plain,application/octet-stream"\n            onChange={event => {\n              const file = event.target.files?.[0];\n              event.currentTarget.value = '';\n              if (file) onImportFile(file);\n            }}\n          />\n        </section>\n\n        {newDialog && (\n          <div className="companion-new-dialog" role="dialog" aria-modal="true" aria-label="Create new tournament">\n            <div className="companion-new-dialog-card">\n              <div className="companion-new-dialog-head"><div><span className="companion-entry-eyebrow">NEW PRIVATE TOURNAMENT</span><h2>Create tournament</h2></div><button type="button" aria-label="Close" onClick={() => setNewDialog(false)}><X size={17} /></button></div>\n              <label className="companion-entry-field"><span>Tournament name</span><input autoFocus value={newName} onChange={event => setNewName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') submitNew(); if (event.key === 'Escape') setNewDialog(false); }} /></label>\n              <p>The tournament is created immediately in the private Organizer Cloud. No public Hub page or Chess-Results TNR is created automatically.</p>\n              <div className="companion-new-dialog-actions"><button type="button" onClick={() => setNewDialog(false)}>Cancel</button><button type="button" className="primary" disabled={!newName.trim() || busy} onClick={submitNew}><Plus size={15} /> Create tournament</button></div>\n            </div>\n          </div>\n        )}'''
if head not in s:
    raise SystemExit('Companion select head marker not found')
s = s.replace(head, replacement, 1)
s = s.replace('Create or sync a tournament from Chess-Publisher Desktop first.', 'Create a tournament here, import TRF/TUNX, or sync one from Chess-Publisher Desktop.')
p.write_text(s)

# 3) CSS for start actions and dialog, keeping phone UX usable.
p = Path('src/companion-cloud.css')
s = p.read_text()
marker = ".companion-select-status { margin:18px 0 14px; min-height:34px; display:flex; align-items:center; gap:7px; color:#65758a; font-size:9px; font-weight:700; }\n"
addition = r'''.companion-start-actions { margin:18px 0 4px; display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:9px; }
.companion-start-action { min-height:70px; padding:12px 13px; display:grid; grid-template-columns:auto minmax(0,1fr) auto; align-items:center; gap:10px; border:1px solid #cad8e8; border-radius:13px; background:#fff; color:#2d5e91; cursor:pointer; text-align:left; box-shadow:0 5px 16px rgba(15,23,42,.03); }
.companion-start-action.primary { border-color:#9fc4ef; background:linear-gradient(135deg,#f3f8ff,#f9fcff); color:#1769e0; }
.companion-start-action:hover { border-color:#8fb9e7; background:#f8fbff; }
.companion-start-action:disabled { opacity:.5; cursor:not-allowed; }
.companion-start-action span,.companion-start-action strong,.companion-start-action small { min-width:0; display:block; }
.companion-start-action strong { color:#20314a; font-size:10.5px; font-weight:850; }
.companion-start-action small { margin-top:4px; color:#7a899d; font-size:8.3px; line-height:1.35; }
.companion-import-input { display:none !important; }
.companion-new-dialog { position:fixed; inset:0; z-index:100; padding:18px; display:grid; place-items:center; background:rgba(8,20,37,.44); backdrop-filter:blur(5px); }
.companion-new-dialog-card { width:min(480px,100%); padding:19px; border:1px solid #d5e0ec; border-radius:16px; background:#fff; box-shadow:0 24px 70px rgba(5,18,36,.22); }
.companion-new-dialog-head { margin-bottom:16px; display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
.companion-new-dialog-head h2 { margin:5px 0 0; color:#17263b; font-size:20px; font-weight:870; letter-spacing:-.035em; }
.companion-new-dialog-head button { width:34px; height:34px; display:grid; place-items:center; border:1px solid #dae3ec; border-radius:9px; background:#fff; color:#607086; cursor:pointer; }
.companion-new-dialog-card > p { margin:12px 0 0; color:#78879a; font-size:8.8px; line-height:1.55; }
.companion-new-dialog-actions { margin-top:16px; display:flex; justify-content:flex-end; gap:8px; }
.companion-new-dialog-actions button { min-height:38px; padding:0 12px; display:flex; align-items:center; gap:6px; border:1px solid #d4dee9; border-radius:9px; background:#fff; color:#516176; cursor:pointer; font-size:9px; font-weight:800; }
.companion-new-dialog-actions button.primary { border-color:#1769e0; background:#1769e0; color:#fff; }
.companion-new-dialog-actions button:disabled { opacity:.45; cursor:not-allowed; }
'''
if addition not in s:
    if marker not in s: raise SystemExit('CSS insertion marker missing')
    s = s.replace(marker, addition + marker, 1)
s = s.replace(
    "  .companion-select-head { align-items:flex-start; flex-direction:column; gap:11px; }",
    "  .companion-select-head { align-items:flex-start; flex-direction:column; gap:11px; }\n  .companion-start-actions { grid-template-columns:1fr; }\n  .companion-start-action { min-height:74px; }\n  .companion-new-dialog { padding:10px; }\n  .companion-new-dialog-card { padding:16px 13px; }\n  .companion-new-dialog-actions { flex-direction:column-reverse; }\n  .companion-new-dialog-actions button { width:100%; min-height:44px; justify-content:center; }"
)
p.write_text(s)

# 4) Provider: create/import must create a new private Cloud record r1 and open it.
p = Path('src/cloud/OnlineCloudProviderV2.tsx')
s = p.read_text()
if "tournamentFileImport" not in s:
    s = s.replace(
        "import { CompanionLoginScreen, CompanionTournamentSelectScreen } from '../companion/CompanionCloudScreens';",
        "import { CompanionLoginScreen, CompanionTournamentSelectScreen } from '../companion/CompanionCloudScreens';\nimport { createCleanTournament, importTournamentFile } from '../importers/tournamentFileImport';"
    )
insert_before = "  async function loginWithToken(candidateRaw: string, remember: boolean) {\n"
if 'async function createPrivateTournamentAndOpen' not in s:
    helper = r'''  async function createPrivateTournamentAndOpen(seed: Tournament, sourceLabel: string) {
    await runQueued(sourceLabel, async () => {
      setStatus(`${sourceLabel} · creating private Cloud record…`);
      setStatusKind('busy');
      setConflict(false);
      conflictRef.current = false;
      setRemoteChangesAvailable(false);
      setCloudDirty(false);

      // Create/Import is intentionally a NEW identity. Never adopt the currently
      // open browser tournament, an existing Hub id, or a same-name Cloud record.
      const clean: any = clone(seed);
      delete clean.cloud;
      delete clean.online;
      delete clean.hub;
      const seeded: any = ensureLocalIdentity(clean);
      const internalId = chooseInternalTournamentId(seeded);
      const device = browserDevice();
      const created = await cloudApi.createTournament(tokenRef.current, {
        localKey: internalId,
        name: tournamentName(seeded),
        deviceId: device.id,
        deviceLabel: device.label
      });
      const remote = created?.tournament as CloudTournamentMeta | undefined;
      if (!remote?.id) throw new Error('Cloud Workspace did not return a tournament ID for the new tournament.');

      const fingerprint = await fingerprintTournament(seeded);
      const saved = await cloudApi.putSnapshot(
        tokenRef.current,
        remote.id,
        0,
        buildPrivateSnapshot(tournamentName(seeded), seeded),
        device
      );
      const revision = Number(saved?.revision || 1);
      const updated = withBrowserBase(seeded, remote.id, revision, fingerprint);
      commitLocal(updated, true);
      setActiveCloud({ ...remote, revision });
      activeRef.current = { ...remote, revision };
      setCloudTournaments(current => [{ ...remote, revision }, ...current.filter(item => item.id !== remote.id)]);
      setLastSyncAt(updated.cloud?.lastSyncAt || '');
      setPublicState(null);
      setPhase('app');
      phaseRef.current = 'app';
      setStatus(`${sourceLabel} · private Cloud r${revision} · ready in Desktop`);
      setStatusKind('ok');
      log(`${sourceLabel}: created ${remote.id} at private Cloud revision ${revision}.`);
    }, true);
  }

  async function createNewTournamentFromStart(name: string) {
    try {
      await createPrivateTournamentAndOpen(createCleanTournament(name), 'New tournament');
    } catch (error: any) {
      setStatus(error?.message || 'Could not create the new tournament.');
      setStatusKind(error?.code === 'network_error' ? 'offline' : 'warn');
    }
  }

  async function importTournamentFromStart(file: File) {
    setBusy(true);
    setStatus(`Importing ${file.name}…`);
    setStatusKind('busy');
    try {
      const imported = await importTournamentFile(file);
      setBusy(false);
      await createPrivateTournamentAndOpen(imported.tournament, `Imported ${imported.kind.toUpperCase()} · ${imported.playerCount} players`);
    } catch (error: any) {
      setBusy(false);
      setStatus(error?.message || 'Tournament import failed.');
      setStatusKind('warn');
      log(`Tournament import failed: ${error?.message || String(error)}`);
    }
  }

'''
    if insert_before not in s: raise SystemExit('Provider login marker missing')
    s = s.replace(insert_before, helper + insert_before, 1)
select_marker = "        onContinueLocal={() => void continueWithLocal()}\n"
if 'onCreateNew=' not in s:
    if select_marker not in s: raise SystemExit('Provider select props marker missing')
    s = s.replace(select_marker, select_marker + "        onCreateNew={name => void createNewTournamentFromStart(name)}\n        onImportFile={file => void importTournamentFromStart(file)}\n", 1)
p.write_text(s)

# 5) Tests: functional TRF + synthetic binary TUNX + private/public source boundary.
test = Path('src/cloud/tests/runTournamentCreateImportTests.ts')
test.write_text(r'''import assert from 'node:assert/strict';
import { buildTRFText } from '../../engine/trfParser';
import { buildPrivateSnapshot } from '../onlineCloudSync';
import { buildPublicHubSnapshot } from '../publicHubSnapshot';
import { createInitialEmptyTournament } from '../../data/initialData';
import { createCleanTournament, importTrfText, importTunxBytes } from '../../importers/tournamentFileImport';

function u16(value: number) { return [value & 0xff, (value >> 8) & 0xff]; }
function u32(value: number) { return [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff]; }
function utf16(value: string) {
  const bytes: number[] = [...u16(value.length)];
  for (const ch of value) bytes.push(ch.charCodeAt(0) & 0xff, (ch.charCodeAt(0) >> 8) & 0xff);
  return bytes;
}
function syntheticTunx() {
  const header = new Uint8Array(108);
  header.set([0x93, 0xff, 0x89, 0x44], 0);
  const metadata = Array.from({ length: 21 }, () => '');
  metadata[0] = 'Synthetic TUNX Open';
  metadata[3] = 'FA Test Arbiter';
  metadata[10] = 'Sofia';
  metadata[14] = '15+10';
  metadata[20] = 'BUL';
  const metadataBytes = metadata.flatMap(utf16);
  const config = new Uint8Array(4 + 0x1100);
  config.set([0x95, 0xff, 0x89, 0x44], 0);
  const cv = new DataView(config.buffer);
  cv.setUint16(4 + 0x00, 1, true); // total rounds
  cv.setUint8(4 + 0x0b, 0); // swiss
  cv.setUint8(4 + 0x11, 1); // current round
  cv.setUint16(4 + 0x13, 1, true); // players
  cv.setUint32(4 + 0x47, 20260908, true);
  cv.setUint32(4 + 0x4b, 20260908, true);
  const strings = Array.from({ length: 30 }, () => '');
  strings[0] = 'Player'; strings[1] = 'One'; strings[4] = 'FM'; strings[10] = 'BUL';
  const playerStrings = strings.flatMap(utf16);
  const numeric = new Uint8Array(110);
  const nv = new DataView(numeric.buffer);
  nv.setUint16(0x08, 2100, true);
  nv.setUint32(0x18, 2900001, true);
  const pairing = new Uint8Array(21);
  const pv = new DataView(pairing.buffer);
  pv.setUint16(0, 1, true);
  pv.setUint16(2, 0xfffe, true);
  pv.setUint16(4, 9, true); // full bye in upstream parser
  const total = header.length + metadataBytes.length + config.length + 4 + playerStrings.length + numeric.length + 4 + pairing.length;
  const out = new Uint8Array(total);
  let at = 0;
  out.set(header, at); at += header.length;
  out.set(metadataBytes, at); at += metadataBytes.length;
  out.set(config, at); at += config.length;
  out.set([0xa5, 0xff, 0x89, 0x44], at); at += 4;
  out.set(playerStrings, at); at += playerStrings.length;
  out.set(numeric, at); at += numeric.length;
  out.set([0xb3, 0xff, 0x89, 0x44], at); at += 4;
  out.set(pairing, at);
  return out;
}

const fresh: any = createCleanTournament('Created in Web');
assert.equal(fresh.name, 'Created in Web');
assert.equal(fresh.players.length, 0);
assert.equal(fresh.settings.city, '');
assert.equal(fresh.settings.tnr, '');
assert.equal(fresh.cloud, undefined);
assert.equal(fresh.online, undefined);

const trfSource: any = createInitialEmptyTournament('TRF Import Source');
trfSource.settings.organizer = 'TRF Import Source';
trfSource.settings.city = 'Sofia';
trfSource.settings.country = 'BUL';
trfSource.settings.startDate = '2026-09-08T10:00';
trfSource.settings.endDate = '2026-09-08T18:00';
trfSource.settings.chiefArbiter = 'FA Import Test';
trfSource.settings.timeControl = '15+10';
trfSource.settings.rounds = '1';
trfSource.players = [
  { id: 1, localKey: 'fid:2900001', name: 'One, Player', rating: 2100, fed: 'BUL', fideId: '2900001', birth: '1990-01-01', gender: 'm', title: 'FM', attendance: 'present', pairingNumber: 1, joinedFromRound: 1 },
  { id: 2, localKey: 'fid:2900002', name: 'Two, Player', rating: 2000, fed: 'BUL', fideId: '2900002', birth: '1991-01-01', gender: 'm', title: '', attendance: 'present', pairingNumber: 2, joinedFromRound: 1 }
];
trfSource.pairings.liveBoards = { '1': [{ board: 1, whiteKey: 'fid:2900001', blackKey: 'fid:2900002', result: '1 - 0' }] };
const trf = buildTRFText(trfSource, 26, 1);
assert.equal(trf.ok, true, trf.errors.join(' '));
const importedTrf: any = importTrfText(trf.text, 'sample.trf');
assert.equal(importedTrf.kind, 'trf');
assert.equal(importedTrf.playerCount, 2);
assert.equal(importedTrf.tournament.settings.tnr, '');
assert.equal(importedTrf.tournament.pairings.trfImportMeta.sourceType, 'trf');
assert.equal(Object.keys(importedTrf.tournament.pairings.liveBoards).length, 1);

const tunxBytes = syntheticTunx();
const importedTunx: any = importTunxBytes(tunxBytes, 'synthetic.TUNX');
assert.equal(importedTunx.kind, 'tunx');
assert.equal(importedTunx.tournament.name, 'Synthetic TUNX Open');
assert.equal(importedTunx.playerCount, 1);
assert.equal(importedTunx.tournament.players[0].pairingNumber, 1);
assert.equal(importedTunx.tournament.players[0].fideId, '2900001');
assert.equal(importedTunx.tournament.settings.city, 'Sofia');
assert.equal(importedTunx.tournament.settings.country, 'BUL');
assert.equal(importedTunx.tournament.settings.timeControl, '15+10');
assert.ok(importedTunx.tournament.regulations.tunxSourceTemplateBase64.length > 20);
assert.equal(importedTunx.tournament.regulations.tunxSourceTemplateFileName, 'synthetic.TUNX');
assert.equal(importedTunx.tournament.pairings.liveBoards['1'][0].result, '1 BYE');

const privateSnapshot = buildPrivateSnapshot(importedTunx.tournament.name, importedTunx.tournament);
assert.ok(JSON.stringify(privateSnapshot).includes('tunxSourceTemplateBase64'), 'Original TUNX source must travel only in private Desktop/Web snapshot.');
const publicSnapshot = buildPublicHubSnapshot(importedTunx.tournament);
assert.equal(JSON.stringify(publicSnapshot).includes('tunxSourceTemplateBase64'), false, 'Raw TUNX source must never enter the public Hub snapshot.');
assert.equal(JSON.stringify(publicSnapshot).includes('synthetic.TUNX'), false, 'Private import filename must not be exposed in the public Hub payload.');

console.log('WEB_NEW_TOURNAMENT_CLEAN_SEED=PASS');
console.log('WEB_TRF16_TRF26_FULL_IMPORT=PASS');
console.log('WEB_TUNX_BINARY_IMPORT=PASS');
console.log('TUNX_PRIVATE_CLOUD_ONLY=PASS');
''')

# 6) UI regressions.
p = Path('tests/ui/companion-cloud-screens.test.mjs')
s = p.read_text()
extra = r'''
has(screens, 'New tournament', 'My Tournaments must expose Web tournament creation.');
has(screens, 'Import tournament', 'My Tournaments must expose one tournament import action.');
has(screens, '.trf,.trf16,.trf26,.txt,.tunx,.TUNX', 'One file picker must accept TRF16/TRF26/TUNX.');
has(provider, 'createPrivateTournamentAndOpen', 'Web-created/imported tournaments must create an authoritative private Cloud record.');
has(provider, 'cloudApi.createTournament', 'Web create/import must allocate a Cloud tournament identity.');
has(provider, 'cloudApi.putSnapshot', 'Web create/import must write initial Cloud revision r1 for Desktop continuation.');
has(provider, 'onCreateNew={name => void createNewTournamentFromStart(name)}', 'New tournament start action is not wired.');
has(provider, 'onImportFile={file => void importTournamentFromStart(file)}', 'TRF/TUNX import start action is not wired.');
'''
if "My Tournaments must expose Web tournament creation" not in s:
    s = s.replace("has(screens, 'Cloud tournaments', 'Cloud tournament list is missing.');\n", "has(screens, 'Cloud tournaments', 'Cloud tournament list is missing.');\n" + extra)
p.write_text(s)

p = Path('tests/ui/hub-companion-v1.test.mjs')
s = p.read_text()
if "Unified TRF/TUNX import" not in s:
    marker = "has(cloudScreens, 'My tournaments', 'My Tournaments navigation wording is missing.');\n"
    addition = "has(cloudScreens, 'New tournament', 'Web start page must create a new private tournament.');\nhas(cloudScreens, 'Import tournament', 'Web start page must expose unified tournament import.');\nhas(cloudScreens, '.trf,.trf16,.trf26,.txt,.tunx,.TUNX', 'Unified TRF/TUNX import file picker is missing.');\n"
    if marker not in s: raise SystemExit('hub companion cloud screen marker missing')
    s = s.replace(marker, marker + addition, 1)
p.write_text(s)

# 7) package script; npm install in workflow will add the parser dependency + lockfile.
p = Path('package.json')
s = p.read_text()
if '"test:tournament-import"' not in s:
    s = s.replace(
        '"test:chess-results": "tsx src/server/tests/runChessResultsTests.ts && tsx src/server/tests/runChessResultsRouteTests.ts"',
        '"test:chess-results": "tsx src/server/tests/runChessResultsTests.ts && tsx src/server/tests/runChessResultsRouteTests.ts",\n    "test:tournament-import": "tsx src/cloud/tests/runTournamentCreateImportTests.ts"'
    )
p.write_text(s)
