import { FideTitle, Gender, Player, Tournament } from '../types';

export type PlayersXmlRoster = {
  tournamentName: string;
  sourceTournamentKey: string;
  players: Player[];
  warnings: string[];
};

const text = (value: unknown) => value == null ? '' : String(value).trim();
const positiveInt = (value: unknown, fallback: number) => {
  const parsed = Number.parseInt(text(value), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};
const nonNegativeInt = (value: unknown, fallback = 0) => {
  const parsed = Number.parseInt(text(value), 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
};

function decodeXmlEntity(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (match, hex) => {
      try { return String.fromCodePoint(Number.parseInt(hex, 16)); } catch { return match; }
    })
    .replace(/&#(\d+);/g, (match, digits) => {
      try { return String.fromCodePoint(Number.parseInt(digits, 10)); } catch { return match; }
    })
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&');
}

function xmlEscape(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

type XmlAttributes = Record<string, string>;

function parseAttributes(fragment: string): XmlAttributes {
  const attributes: XmlAttributes = {};
  const pattern = /([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(fragment))) {
    attributes[match[1].toLowerCase()] = decodeXmlEntity(match[2] ?? match[3] ?? '');
  }
  return attributes;
}

function attr(attributes: XmlAttributes, name: string) {
  return text(attributes[name.toLowerCase()]);
}

function firstTag(source: string, tag: string): XmlAttributes | null {
  const match = new RegExp(`<${tag}\\b([^>]*)/?>`, 'i').exec(source);
  return match ? parseAttributes(match[1]) : null;
}

function allTags(source: string, tag: string): XmlAttributes[] {
  const out: XmlAttributes[] = [];
  const pattern = new RegExp(`<${tag}\\b([^>]*)/?>`, 'gi');
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) out.push(parseAttributes(match[1]));
  return out;
}

export function looksLikePlayersXml(source: string) {
  return /<Players(?:\s|>)/i.test(source) && /<Player\b/i.test(source);
}

function importBirthday(value: string) {
  const raw = text(value);
  if (!raw || /^0+$/.test(raw)) return '-';
  if (/^\d{4}$/.test(raw)) return raw;
  if (/^\d{8}$/.test(raw)) {
    const year = raw.slice(0, 4);
    const month = raw.slice(4, 6);
    const day = raw.slice(6, 8);
    if (year === '0000') return '-';
    if (month === '00' || day === '00') return year;
    return `${year}-${month}-${day}`;
  }
  return raw;
}

function exportBirthday(value: unknown) {
  const raw = text(value);
  if (!raw || raw === '-' || /^0+$/.test(raw)) return '0';
  if (/^\d{4}$/.test(raw)) return `${raw}0000`;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (iso) return `${iso[1]}${iso[2]}${iso[3]}`;
  if (/^\d{8}$/.test(raw)) return raw;
  return raw.replace(/\D/g, '') || '0';
}

function playerName(lastname: string, firstname: string, fallback: string) {
  const last = text(lastname);
  const first = text(firstname);
  if (last && first) return `${last}, ${first}`;
  return last || first || fallback;
}

function splitPlayerName(value: unknown) {
  const name = text(value);
  if (!name) return { lastname: '', firstname: '' };
  const comma = name.indexOf(',');
  if (comma >= 0) {
    return {
      lastname: name.slice(0, comma).trim(),
      firstname: name.slice(comma + 1).trim()
    };
  }
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { lastname: parts[0] || '', firstname: '' };
  return { lastname: parts[parts.length - 1], firstname: parts.slice(0, -1).join(' ') };
}

function localKeyForXmlPlayer(fideId: string, playerId: number, pairingNumber: number) {
  if (/^\d+$/.test(fideId) && fideId !== '0') return `fid:${fideId}`;
  return `players-xml:${playerId}:${pairingNumber}`;
}

export function parsePlayersXml(sourceInput: string): PlayersXmlRoster {
  const source = String(sourceInput || '').replace(/^\uFEFF/, '');
  if (source.length > 4 * 1024 * 1024) throw new Error('Players XML import is limited to 4 MiB.');
  if (!looksLikePlayersXml(source)) throw new Error('The selected XML file is not a Players roster.');

  const tournament = firstTag(source, 'Tournament');
  const tournamentName = tournament ? attr(tournament, 'Name') : '';
  const sourceTournamentKey = tournament ? attr(tournament, 'Key') : '';
  const rows = allTags(source, 'Player');
  if (!rows.length) throw new Error('Players XML does not contain any players.');

  const warnings: string[] = [];
  const usedPairingNumbers = new Set<number>();
  const usedPlayerIds = new Set<number>();
  const usedLocalKeys = new Set<string>();

  const players = rows.map((row, index): Player => {
    const pairingNumber = positiveInt(attr(row, 'PlayerSno'), index + 1);
    if (usedPairingNumbers.has(pairingNumber)) {
      throw new Error(`Players XML contains duplicate PlayerSno ${pairingNumber}.`);
    }
    usedPairingNumbers.add(pairingNumber);

    let playerId = positiveInt(attr(row, 'PlayerUniqueId'), pairingNumber);
    if (usedPlayerIds.has(playerId)) {
      let candidate = pairingNumber;
      while (usedPlayerIds.has(candidate)) candidate += 1;
      warnings.push(`Duplicate PlayerUniqueId ${playerId} was remapped to ${candidate}.`);
      playerId = candidate;
    }
    usedPlayerIds.add(playerId);

    const rawFideId = attr(row, 'FIDEId');
    const fideId = /^\d+$/.test(rawFideId) && rawFideId !== '0' ? rawFideId : '-';
    let localKey = localKeyForXmlPlayer(fideId, playerId, pairingNumber);
    if (usedLocalKeys.has(localKey)) {
      warnings.push(`Duplicate FIDE identity ${fideId} at PlayerSno ${pairingNumber}; a roster-local key was used.`);
      localKey = `players-xml:${playerId}:${pairingNumber}`;
    }
    usedLocalKeys.add(localKey);

    const rating = nonNegativeInt(attr(row, 'Rating'));
    const nationalRating = nonNegativeInt(attr(row, 'NatRating'));
    const rawGender = attr(row, 'Gender').toLowerCase();
    const gender = (rawGender === 'f' || rawGender === 'w' ? 'f' : rawGender === 'm' ? 'm' : '') as Gender;
    const title = attr(row, 'Title').toUpperCase() as FideTitle;
    const fideK = nonNegativeInt(attr(row, 'FIDEFactor'));

    return {
      id: playerId,
      localKey,
      name: playerName(attr(row, 'Lastname'), attr(row, 'Firstname'), `Player ${pairingNumber}`),
      rating,
      fed: attr(row, 'Federation').toUpperCase().slice(0, 3) || 'FID',
      fideId,
      birth: importBirthday(attr(row, 'Birthday')),
      gender,
      title,
      attendance: 'present',
      pairingNumber,
      joinedFromRound: 1,
      initialSortOrder: pairingNumber,
      ...(nationalRating > 0 ? { nationalRating } : {}),
      ...(attr(row, 'NatId') ? { nationalId: attr(row, 'NatId') } : {}),
      ...(attr(row, 'Club') ? { club: attr(row, 'Club') } : {}),
      ...(attr(row, 'Group') ? { group: attr(row, 'Group') } : {}),
      ...(attr(row, 'Type') ? { type: attr(row, 'Type') } : {}),
      ...(attr(row, 'Source') ? { ratingSource: attr(row, 'Source') } : {}),
      ...(attr(row, 'FIDEFactor') ? { fideK } : {})
    };
  });

  return { tournamentName, sourceTournamentKey, players, warnings };
}

function sourceTournamentKey(tournament: Tournament | any) {
  const activeKey = text(tournament?.chessResults?.key || tournament?.settings?.tnr);
  if (/^\d+$/.test(activeKey)) return activeKey;
  const importedKey = text(tournament?.pairings?.trfImportMeta?.sourceTournamentKey);
  return /^\d+$/.test(importedKey) ? importedKey : '';
}

export function buildPlayersXml(tournament: Tournament): string {
  const players = [...(tournament.players || [])].sort((left, right) => {
    const rank = Number(left.pairingNumber || 0) - Number(right.pairingNumber || 0);
    return rank || Number(left.id || 0) - Number(right.id || 0);
  });

  const lines = [
    '<?xml version="1.0"?>',
    '<Players>',
    ` <Tournament Key="${xmlEscape(sourceTournamentKey(tournament))}" Name="${xmlEscape(tournament.name || 'Tournament')}"/>`
  ];

  for (const player of players) {
    const pairingNumber = positiveInt(player.pairingNumber, positiveInt(player.id, 1));
    const playerId = positiveInt(player.id, pairingNumber);
    const { lastname, firstname } = splitPlayerName(player.name);
    const fideId = /^\d+$/.test(text(player.fideId)) && text(player.fideId) !== '0' ? text(player.fideId) : '0';
    const source = text(player.ratingSource) || (fideId !== '0' ? 'FIDE' : '');
    const values: Array<[string, unknown]> = [
      ['PlayerUniqueId', playerId],
      ['PlayerSno', pairingNumber],
      ['Lastname', lastname],
      ['Firstname', firstname],
      ['AcademicTitle', ''],
      ['Federation', text(player.fed).toUpperCase().slice(0, 3)],
      ['Rating', Math.max(0, Number(player.rating || 0))],
      ['Birthday', exportBirthday(player.birth)],
      ['Title', text(player.title)],
      ['FIDEId', fideId],
      ['NatId', text(player.nationalId)],
      ['NatRating', Math.max(0, Number(player.nationalRating || 0))],
      ['Boardnumber', 0],
      ['Gender', text(player.gender)],
      ['TeamSno', 0],
      ['TeamUniqueId', 0],
      ['Type', text(player.type)],
      ['Group', text(player.group)],
      ['Source', source],
      ['ClubNo', 0],
      ['Club', text(player.club)],
      ['FIDEFactor', Math.max(0, Number(player.fideK || 0))]
    ];
    lines.push(` <Player ${values.map(([name, value]) => `${name}="${xmlEscape(value)}"`).join(' ')} />`);
  }

  lines.push('</Players>');
  return `${lines.join('\n')}\n`;
}

export function downloadPlayersXml(tournament: Tournament, fileName = 'Players.XML') {
  const xml = buildPlayersXml(tournament);
  const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
