import { Tournament, Player, BoardPairing } from '../types';
import { calculateTournamentStandings } from './tiebreaks';

export interface TrfValidationResult {
  ok: boolean;
  version: 16 | 26;
  errors: string[];
  warnings: string[];
  playerCount: number;
  roundsCount: number;
  descriptors?: string[];
  text: string;
}

export interface ParsedTrfTournament {
  name: string;
  city: string;
  country: string;
  startDate: string;
  endDate: string;
  chiefArbiter: string;
  timeControl: string;
  rounds: number;
  players: Partial<Player>[];
  roundsData: Record<number, { whiteNo: number; blackNo: number; result: string }[]>;
  version: 16 | 26;
}

/**
 * Builds FIDE TRF26 or TRF16 text format strictly compliant with FIDE Technical Commission standards.
 */
export function buildTRFText(tournament: Tournament, version: 16 | 26 = 26, throughRound?: number): TrfValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const settings = tournament.settings;
  const players = tournament.players || [];
  const scheduledRounds = parseInt(settings.rounds) || 7;
  const totalRounds = throughRound !== undefined ? throughRound : scheduledRounds;

  if (!settings.organizer && !tournament.name) errors.push("Tournament Name is required (012).");
  if (!settings.city) errors.push("City is required (022).");
  if (!settings.country) errors.push("Country Federation is required (032).");
  if (!settings.startDate) errors.push("Start Date is required (042).");
  if (!settings.endDate) errors.push("End Date is required (052).");
  if (!settings.chiefArbiter) errors.push("Chief Arbiter is required (102).");
  if (!settings.timeControl) errors.push("Time Control is required (122).");

  const standings = calculateTournamentStandings(tournament);
  const rankMap = new Map<number, number>();
  standings.players.forEach((p, idx) => {
    rankMap.set(p.id, idx + 1);
  });

  const lines: string[] = [];

  // 012 Tournament Name
  lines.push(`012 ${tournament.name || settings.organizer}`);
  // 022 City
  lines.push(`022 ${settings.city || settings.venue || 'Unknown'}`);
  // 032 Federation
  lines.push(`032 ${settings.country.toUpperCase()}`);
  // 042 Start Date (YYYY/MM/DD)
  lines.push(`042 ${formatTrfDate(settings.startDate)}`);
  // 052 End Date (YYYY/MM/DD)
  lines.push(`052 ${formatTrfDate(settings.endDate)}`);
  // 062 Number of players
  lines.push(`062 ${players.length}`);
  // 072 Number of rated players
  const ratedCount = players.filter(p => p.rating > 0).length;
  lines.push(`072 ${ratedCount}`);
  // 092 Tournament Type
  lines.push(`092 ${settings.tournamentFormat === 'Individual Round Robin' ? 'Round Robin' : 'Swiss System'}`);
  // 102 Chief Arbiter
  lines.push(`102 ${settings.chiefArbiter}`);
  // 112 Deputy Arbiter
  if (settings.arbiter) {
    lines.push(`112 ${settings.arbiter}`);
  }
  // 122 Time Control
  lines.push(`122 ${settings.timeControl}`);

  // 132 Round Dates
  let roundDatesLine = "132 ".padEnd(91, " ");
  for (let r = 1; r <= scheduledRounds; r++) {
    const sched = tournament.schedule?.rows?.find(row => row.event === `Round ${r}`);
    const dateStr = sched ? formatTrfDate(sched.dateTime).slice(2) : formatTrfDate(settings?.startDate || new Date().toISOString()).slice(2);
    roundDatesLine = setTrfField(roundDatesLine, 92 + (r - 1) * 10, 8, dateStr);
  }
  lines.push(roundDatesLine.trimEnd());

  // 142 Total Rounds
  lines.push(`142 ${settings.rounds}`);

  // 152 Top Color (TRF26)
  const topColor = (tournament.pairings.engine.initialTopColor || 'w').toUpperCase();
  lines.push(`152 ${topColor}`);

  // 162 Score System (TRF26)
  const pabVal = parseFloat(tournament.regulations.pabPoints) || 1.0;
  lines.push(`162  W 1.0    D 0.5    L 0.0    Z 0.0    P ${pabVal.toFixed(1)}`);

  // 182 Software Identifier
  lines.push(`182 Chess-Publisher v1.05.01-RC1 (FIDE Dutch System)`);

  if (version === 26) {
    // 192 Tournament Type Code (TRF26)
    const typeCode = settings.tournamentFormat === 'Individual Round Robin' ? 'BERGER_ROUNDROBIN' : 'FIDE_DUTCH_2025';
    lines.push(`192 ${typeCode}`);

    // 212 Rank Order Descriptors
    const descriptors = ["PTS"];
    (tournament.regulations.tieBreaks || []).forEach(tb => {
      const code = getTieBreakTrfDescriptor(tb);
      if (code && !descriptors.includes(code)) descriptors.push(code);
    });
    lines.push(`212 ${descriptors.join(",")}`);

    // 222 Encoded Time Control
    const encodedTC = encodeTimeControl(settings.timeControl);
    lines.push(`222 ${encodedTC}`);
  }

  // 001 Player records
  const sortedPlayers = [...players].sort((a, b) => a.pairingNumber - b.pairingNumber);

  sortedPlayers.forEach(p => {
    const pState = standings.players.find(s => s.id === p.pairingNumber);
    const score = pState ? pState.score : 0;
    const rank = rankMap.get(p.pairingNumber) || p.pairingNumber;

    let pLine = " ".repeat(91 + totalRounds * 10);
    pLine = setTrfField(pLine, 1, 3, "001");
    pLine = setTrfField(pLine, 5, 4, String(p.pairingNumber), true);
    pLine = setTrfField(pLine, 10, 1, p.gender === 'f' ? 'w' : 'm');
    pLine = setTrfField(pLine, 11, 3, p.title || '');
    pLine = setTrfField(pLine, 15, 33, p.name.slice(0, 33));
    pLine = setTrfField(pLine, 49, 4, p.rating > 0 ? String(p.rating) : '0000', true);
    pLine = setTrfField(pLine, 54, 3, (p.fed || 'BUL').toUpperCase().slice(0, 3));
    pLine = setTrfField(pLine, 58, 11, p.fideId && p.fideId !== '-' ? p.fideId : '', true);
    pLine = setTrfField(pLine, 70, 10, p.birth ? p.birth.replaceAll('-', '/').slice(0, 10) : '');
    pLine = setTrfField(pLine, 81, 4, score.toFixed(1), true);
    pLine = setTrfField(pLine, 86, 4, String(rank), true);

    // Rounds results
    for (let r = 1; r <= totalRounds; r++) {
      const rd = pState?.rounds[r - 1];
      const start = 92 + (r - 1) * 10;
      if (rd) {
        const oppNum = rd.opp ? String(rd.opp).padStart(4, " ") : "0000";
        const color = (rd.color === 'w' || rd.color === 'b') ? rd.color : '-';
        let resCode = rd.result || ' ';
        if (resCode === 'PAB') resCode = 'U';
        else if (resCode === '1 BYE') resCode = 'F';
        else if (resCode === '½ BYE') resCode = 'H';
        else if (resCode === '0 BYE') resCode = 'Z';
        else if (resCode === '1 - 0') resCode = rd.color === 'w' ? '1' : '0';
        else if (resCode === '0 - 1') resCode = rd.color === 'w' ? '0' : '1';
        else if (resCode === '½ - ½') resCode = '=';
        else if (resCode === '1F - 0F') resCode = rd.color === 'w' ? '+' : '-';
        else if (resCode === '0F - 1F') resCode = rd.color === 'w' ? '-' : '+';
        else if (resCode === '0F - 0F') resCode = '-';

        pLine = setTrfField(pLine, start, 4, oppNum, true);
        pLine = setTrfField(pLine, start + 5, 1, color);
        pLine = setTrfField(pLine, start + 7, 1, resCode);
      } else {
        pLine = setTrfField(pLine, start, 4, "0000", true);
        pLine = setTrfField(pLine, start + 5, 1, "-");
        pLine = setTrfField(pLine, start + 7, 1, "Z");
      }
    }

    lines.push(pLine.trimEnd());
  });

  // 240 Individual Byes
  for (let r = 1; r <= totalRounds; r++) {
    const halfByes: number[] = [];
    const fullByes: number[] = [];
    sortedPlayers.forEach(p => {
      const pState = standings.players.find(s => s.id === p.pairingNumber);
      const rd = pState?.rounds[r - 1];
      if (rd && rd.result === 'H') halfByes.push(p.pairingNumber);
      if (rd && rd.result === 'F') fullByes.push(p.pairingNumber);
    });

    if (halfByes.length > 0) {
      lines.push(`240 H ${String(r).padStart(3, ' ')} ${halfByes.map(id => String(id).padStart(4, ' ')).join(' ')}`);
    }
    if (fullByes.length > 0) {
      lines.push(`240 F ${String(r).padStart(3, ' ')} ${fullByes.map(id => String(id).padStart(4, ' ')).join(' ')}`);
    }
  }

  const outputText = lines.join("\r\n") + "\r\n";

  return {
    ok: errors.length === 0,
    version,
    errors,
    warnings,
    playerCount: players.length,
    roundsCount: totalRounds,
    text: outputText
  };
}

/**
 * Parses raw TRF text into structured tournament data.
 */
export function parseTRF(text: string): ParsedTrfTournament {
  const lines = text.split(/\r?\n/);
  const result: ParsedTrfTournament = {
    name: "Imported TRF Tournament",
    city: "",
    country: "BUL",
    startDate: "",
    endDate: "",
    chiefArbiter: "",
    timeControl: "90+30",
    rounds: 7,
    players: [],
    roundsData: {},
    version: 16
  };

  for (const line of lines) {
    const code = line.slice(0, 3);
    const content = line.slice(4).trim();

    if (code === '012') result.name = content;
    else if (code === '022') result.city = content;
    else if (code === '032') result.country = content.slice(0, 3).toUpperCase();
    else if (code === '042') result.startDate = parseTrfDate(content);
    else if (code === '052') result.endDate = parseTrfDate(content);
    else if (code === '102') result.chiefArbiter = content;
    else if (code === '122') result.timeControl = content;
    else if (code === '142') result.rounds = parseInt(content) || 7;
    else if (code === '192' || code === '212' || code === '222') result.version = 26;
    else if (code === '001') {
      // 001 Player line
      const pNo = parseInt(line.substring(4, 8)) || result.players.length + 1;
      const sex = line.charAt(9).toLowerCase() === 'w' ? 'f' : 'm';
      const title = line.substring(10, 13).trim() as any;
      const name = line.substring(14, 47).trim();
      const rtg = parseInt(line.substring(48, 52)) || 0;
      const fed = line.substring(53, 56).trim() || 'BUL';
      const fideId = line.substring(57, 68).trim() || '-';
      const birth = line.substring(69, 79).trim().replaceAll('/', '-');

      result.players.push({
        pairingNumber: pNo,
        name: name || `Player ${pNo}`,
        rating: rtg,
        fed,
        fideId,
        birth,
        gender: sex as any,
        title,
        attendance: 'present',
        joinedFromRound: 1
      });

      // Parse round pairings from 001 line
      const slotCount = Math.floor((line.length - 91) / 10);
      for (let r = 1; r <= slotCount; r++) {
        const start = 91 + (r - 1) * 10;
        const oppNo = parseInt(line.substring(start, start + 4)) || 0;
        const color = line.charAt(start + 5);
        const res = line.charAt(start + 7);

        if (!result.roundsData[r]) result.roundsData[r] = [];

        if (color === 'w' || (oppNo === 0 && color === '-')) {
          let convertedRes = '-';
          if (res === '1') convertedRes = '1 - 0';
          else if (res === '0') convertedRes = '0 - 1';
          else if (res === '=') convertedRes = '½ - ½';
          else if (res === '+') convertedRes = '1F - 0F';
          else if (res === '-') convertedRes = '0F - 1F';
          else if (res === 'U') convertedRes = 'PAB';
          else if (res === 'F') convertedRes = '1 BYE';
          else if (res === 'H') convertedRes = '½ BYE';
          else if (res === 'Z') convertedRes = '0 BYE';

          result.roundsData[r].push({
            whiteNo: pNo,
            blackNo: oppNo,
            result: convertedRes
          });
        }
      }
    }
  }

  return result;
}

export function formatTrfDate(dateStr: string): string {
  if (!dateStr) return "2026/10/02";
  const m = dateStr.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
  if (m) return `${m[1]}/${m[2]}/${m[3]}`;
  return "2026/10/02";
}

function parseTrfDate(dateStr: string): string {
  if (!dateStr) return "2026-10-02T10:00";
  const m = dateStr.match(/^(\d{4})[/.-](\d{2})[/.-](\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}T10:00`;
  return "2026-10-02T10:00";
}

export function setTrfField(line: string, startCol: number, len: number, val: string, rightAlign: boolean = false): string {
  const chars = line.split("");
  const trimmed = val.slice(0, len);
  const padded = rightAlign ? trimmed.padStart(len, " ") : trimmed.padEnd(len, " ");
  for (let i = 0; i < len; i++) {
    chars[startCol - 1 + i] = padded[i] || " ";
  }
  return chars.join("");
}

function getTieBreakTrfDescriptor(tb: string): string {
  if (tb.includes('Buchholz Cut-1')) return 'BH/C1';
  if (tb.includes('Buchholz Cut-2')) return 'BH/C2';
  if (tb.includes('Median Buchholz 2')) return 'BH/M2';
  if (tb.includes('Median Buchholz')) return 'BH/M1';
  if (tb.includes('Buchholz')) return 'BH';
  if (tb.includes('Sonneborn-Berger Cut-1')) return 'SB/C1';
  if (tb.includes('Sonneborn-Berger')) return 'SB';
  if (tb.includes('Direct Encounter')) return 'DE';
  if (tb.includes('Average Rating of Opponents')) return 'ARO';
  if (tb.includes('victories (WIN)')) return 'WIN';
  if (tb.includes('games won (WON)')) return 'WON';
  if (tb.includes('Performance Tie-Break (TPR)')) return 'TPR';
  if (tb.includes('Performance Tie-Break (PTP)')) return 'PTP';
  if (tb.includes('Progressive Score')) return 'PS';
  if (tb.includes('Koya System')) return 'KS';
  return 'OTHER_CUSTOM';
}

function encodeTimeControl(tc: string): string {
  if (!tc) return "90+30";
  const m = tc.match(/^(\d+)\s*\+\s*(\d+)/);
  if (m) {
    const mins = parseInt(m[1]) * 60;
    const inc = parseInt(m[2]);
    return `${mins}+${inc}`;
  }
  return "5400+30";
}
