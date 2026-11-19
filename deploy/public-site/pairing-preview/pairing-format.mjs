export const version = '1.11.65';
export const maxTrfBytes = 512 * 1024;
const dutch = '192 FIDE_DUTCH_2025';
const dutchCodes = new Set(['', 'FIDE_DUTCH_2025', 'FIDE_DUTCH_2022', 'FIDE_DUTCH', 'DUTCH']);

export class PairingError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function invalid(message) {
  return new PairingError(422, 'invalid_trf', message);
}

// Use the same fixed-width history and temporary Dutch method record as ChessPublisher Web.
export function preparePairing({ trf, round, rounds, topColor = 'W', unpaired = [] } = {}) {
  if (!Number.isInteger(round) || !Number.isInteger(rounds) || round < 1 || rounds < round || rounds > 30) {
    throw invalid('Choose a valid round and planned round count (up to 30).');
  }
  if (topColor !== 'W' && topColor !== 'B') throw invalid('Choose White or Black as the top colour.');
  if (typeof trf !== 'string' || trf.length > maxTrfBytes || /[^\x09\x0a\x0d\x20-\xff]/.test(trf)) {
    throw invalid('Upload a TRF in the ChessPublisher Latin-1 pairing format (up to 512 KiB).');
  }

  const lines = [];
  const players = new Set();
  const historyEnd = 91 + (round - 1) * 10;
  let insertion = -1;
  for (const line of trf.split(/\r\n|\n|\r/)) {
    if (!line.trim()) continue;
    if (!/^\d{3}(?:[ \t]|$)/.test(line)) throw invalid('Found a TRF record without a valid record number.');
    if (/^192(?:\s|$)/.test(line)) {
      if (!dutchCodes.has(line.slice(3).trim().toUpperCase())) {
        throw invalid('This pairing preview supports FIDE Dutch.');
      }
      continue;
    }
    lines.push(line);
    if (!line.startsWith('001')) continue;
    if (insertion === -1) insertion = lines.length - 1;
    const numberField = line.slice(4, 8).trim();
    const player = Number(numberField);
    if (!/^\d{1,4}$/.test(numberField) || !player || players.has(player) || line.length < historyEnd) {
      throw invalid('Each player needs a unique pairing number and complete fixed-width round history.');
    }
    if (line.slice(historyEnd).trim()) throw invalid('Export the TRF through the round before the requested draw.');
    players.add(player);
  }
  if (players.size < 2 || players.size > 400) throw invalid('This preview accepts 2 to 400 players.');
  if (!Array.isArray(unpaired) || unpaired.some(player => !Number.isInteger(player) || !players.has(player))) {
    throw invalid('Unpaired entries must be pairing numbers from the uploaded file.');
  }
  const excluded = [...new Set(unpaired)].sort((first, second) => first - second);
  if (players.size - excluded.length < 2) throw invalid('At least two players must be eligible for pairing.');
  lines.splice(insertion, 0, dutch);
  return {
    trf: lines.join('\r\n') + '\r\n',
    round, rounds, topColor, excluded, players
  };
}

export function parsePairingOutput(output, players, excluded) {
  const rows = output.trim().split(/\r?\n/);
  const error = /^###\s*Error\s+(\d+)/i.exec(rows[0]);
  if (error) throw new PairingError(422, 'gacrux_rejected', `Gacrux rejected the TRF (error ${error[1]}).`);
  const used = new Set(excluded);
  if (!/^\d+$/.test(rows[0]) || Number(rows[0]) !== rows.length - 1 || rows.length < 2) {
    throw new PairingError(502, 'invalid_engine_output', 'Gacrux returned an invalid pairing count.');
  }
  let byes = 0;
  const pairs = rows.slice(1).map(row => {
    const match = /^(\d+)\s+(\d+)$/.exec(row.trim());
    if (!match) throw new PairingError(502, 'invalid_engine_output', 'Gacrux returned an invalid pairing row.');
    const white = Number(match[1]);
    const black = Number(match[2]);
    if (!players.has(white) || used.has(white) ||
        (black && (!players.has(black) || used.has(black) || white === black))) {
      throw new PairingError(502, 'invalid_engine_output', 'Gacrux returned an invalid or repeated player number.');
    }
    if (!black) byes += 1;
    used.add(white);
    if (black) used.add(black);
    return { white, black };
  });
  if (used.size !== players.size || byes > 1) {
    throw new PairingError(502, 'invalid_engine_output', 'The pairing does not cover the eligible player list.');
  }
  return pairs;
}

