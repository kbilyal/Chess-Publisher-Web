import { Tournament, Player, BoardPairing } from '../types';
import { calculateTournamentStandings, getStandingTieBreakValue } from './tiebreaks';

export function downloadFile(content: string, filename: string, mimeType: string = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// 1. PGN Export (Portable Game Notation for all tournament games)
export function generatePgnText(tournament: Tournament): string {
  const eventName = tournament.name || tournament.settings.organizer || "FIDE Chess Tournament";
  const site = `${tournament.settings.city || "Sofia"}, ${tournament.settings.country || "BUL"}`;
  const timeControl = tournament.settings.timeControl || "90m+30s";
  const liveBoards = tournament.pairings.liveBoards || {};
  const rounds = Object.keys(liveBoards).map(Number).sort((a, b) => a - b);
  const playerByKey = new Map<string, Player>();
  tournament.players.forEach(p => playerByKey.set(p.localKey, p));

  let pgnOutput = '';

  rounds.forEach(r => {
    const boards = liveBoards[String(r)] || [];
    boards.forEach(b => {
      const white = b.whiteKey ? playerByKey.get(b.whiteKey) : null;
      const black = b.blackKey ? playerByKey.get(b.blackKey) : null;

      // Skip unpaired/bye without two players if not wanted, or format as standard bye
      const whiteName = white ? white.name : "BYE";
      const blackName = black ? black.name : "BYE";
      const whiteElo = white ? String(white.rating || 0) : "0";
      const blackElo = black ? String(black.rating || 0) : "0";
      const whiteTitle = white?.title || "";
      const blackTitle = black?.title || "";

      let pgnResult = "*";
      if (b.result === "1 - 0" || b.result === "1F - 0F" || b.result === "1 BYE" || b.result === "PAB") {
        pgnResult = "1-0";
      } else if (b.result === "0 - 1" || b.result === "0F - 1F") {
        pgnResult = "0-1";
      } else if (b.result === "½ - ½" || b.result === "½ BYE") {
        pgnResult = "1/2-1/2";
      }

      // Date format YYYY.MM.DD
      const dateStr = tournament.settings.startDate 
        ? tournament.settings.startDate.slice(0, 10).replace(/-/g, '.')
        : new Date().toISOString().slice(0, 10).replace(/-/g, '.');

      pgnOutput += `[Event "${eventName}"]\n`;
      pgnOutput += `[Site "${site}"]\n`;
      pgnOutput += `[Date "${dateStr}"]\n`;
      pgnOutput += `[Round "${r}.${b.board}"]\n`;
      pgnOutput += `[White "${whiteName}"]\n`;
      pgnOutput += `[Black "${blackName}"]\n`;
      pgnOutput += `[Result "${pgnResult}"]\n`;
      pgnOutput += `[WhiteElo "${whiteElo}"]\n`;
      pgnOutput += `[BlackElo "${blackElo}"]\n`;
      if (whiteTitle) pgnOutput += `[WhiteTitle "${whiteTitle}"]\n`;
      if (blackTitle) pgnOutput += `[BlackTitle "${blackTitle}"]\n`;
      if (white?.fideId) pgnOutput += `[WhiteFideId "${white.fideId}"]\n`;
      if (black?.fideId) pgnOutput += `[BlackFideId "${black.fideId}"]\n`;
      pgnOutput += `[TimeControl "${timeControl}"]\n`;
      if (b.result.includes('F')) {
        pgnOutput += `[Termination "Forfeit (${b.result})"]\n`;
      }
      pgnOutput += `\n${pgnResult}\n\n`;
    });
  });

  return pgnOutput || `{ No paired games played yet in ${eventName} }`;
}

// 2. Standings CSV Export
export function generateStandingsCsv(tournament: Tournament): string {
  const standings = calculateTournamentStandings(tournament);
  const { players, tieList } = standings;

  const headers = [
    'Rank',
    'Starting No (SNo)',
    'Name',
    'Title',
    'Federation',
    'Rating',
    'FIDE ID',
    'Gender',
    'Birth Year',
    'Points',
    ...tieList.map(tb => `TB: ${tb}`)
  ];

  const escapeCsv = (str: any) => {
    const s = String(str ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const rows = players.map((p, idx) => {
    const tbValues = tieList.map(tb => {
      const val = getStandingTieBreakValue(p, tb);
      const is2Dec = tb.includes('Sonneborn') || tb.includes('Average of Opponents');
      return is2Dec ? val.toFixed(2) : val.toFixed(1);
    });

    return [
      idx + 1,
      p.id,
      escapeCsv(p.name),
      p.title || '',
      p.fed,
      p.rating,
      p.fideId,
      p.gender?.toUpperCase() || 'M',
      p.birth || '',
      p.score.toFixed(1),
      ...tbValues
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

// 3. Players Roster Starting List CSV
export function generatePlayersCsv(tournament: Tournament): string {
  const headers = [
    'SNo',
    'Name',
    'Title',
    'FED',
    'Rating',
    'FIDE ID',
    'Gender',
    'Birth Date / Year',
    'K-Factor',
    'Status'
  ];

  const escapeCsv = (str: any) => {
    const s = String(str ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const rows = tournament.players.map((p, idx) => [
    p.pairingNumber || p.id || (idx + 1),
    escapeCsv(p.name),
    p.title || '',
    p.fed,
    p.rating,
    p.fideId,
    p.gender?.toUpperCase() || 'M',
    p.birth || '',
    p.fideK || 20,
    p.attendance || 'present'
  ].join(','));

  return [headers.join(','), ...rows].join('\n');
}

// 4. Pairings & Results CSV for any or all rounds
export function generatePairingsCsv(tournament: Tournament, targetRound?: number): string {
  const liveBoards = tournament.pairings.liveBoards || {};
  const rounds = targetRound 
    ? [targetRound] 
    : Object.keys(liveBoards).map(Number).sort((a, b) => a - b);

  const playerByKey = new Map<string, Player>();
  tournament.players.forEach(p => playerByKey.set(p.localKey, p));

  const headers = [
    'Round',
    'Board',
    'White SNo',
    'White Name',
    'White Title',
    'White FED',
    'White Rating',
    'Result',
    'Black SNo',
    'Black Name',
    'Black Title',
    'Black FED',
    'Black Rating'
  ];

  const escapeCsv = (str: any) => {
    const s = String(str ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const rows: string[] = [];

  rounds.forEach(r => {
    const boards = liveBoards[String(r)] || [];
    boards.forEach(b => {
      const white = b.whiteKey ? playerByKey.get(b.whiteKey) : null;
      const black = b.blackKey ? playerByKey.get(b.blackKey) : null;

      rows.push([
        r,
        b.board,
        white?.id || '',
        escapeCsv(white?.name || (b.result.includes('BYE') ? 'BYE' : '')),
        white?.title || '',
        white?.fed || '',
        white?.rating || '',
        escapeCsv(b.result || '*'),
        black?.id || '',
        escapeCsv(black?.name || (b.result.includes('BYE') ? 'BYE' : '')),
        black?.title || '',
        black?.fed || '',
        black?.rating || ''
      ].join(','));
    });
  });

  return [headers.join(','), ...rows].join('\n');
}

// 5. Cross-Table Progressive Matrix CSV
export function generateCrossTableCsv(tournament: Tournament): string {
  const standings = calculateTournamentStandings(tournament);
  const { players } = standings;
  const announcedRounds = parseInt(tournament.settings.rounds) || 7;
  const liveBoards = tournament.pairings.liveBoards || {};

  const headers = [
    'Rank',
    'SNo',
    'Name',
    'FED',
    'Rating',
    ...Array.from({ length: announcedRounds }, (_, i) => `R${i + 1}`),
    'Total Pts',
    'Buchholz Cut 1',
    'Sonneborn-Berger'
  ];

  const escapeCsv = (str: any) => {
    const s = String(str ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const rows = players.map((p, idx) => {
    // Determine each round result
    const roundCells: string[] = [];
    for (let r = 1; r <= announcedRounds; r++) {
      const boards = liveBoards[String(r)] || [];
      const match = boards.find(b => b.whiteKey === p.key || b.blackKey === p.key);
      if (!match) {
        roundCells.push('-');
      } else {
        const isWhite = match.whiteKey === p.key;
        const oppKey = isWhite ? match.blackKey : match.whiteKey;
        const opp = oppKey ? tournament.players.find(pl => pl.localKey === oppKey) : null;
        const oppSno = opp ? opp.id : '0';
        const colorLetter = isWhite ? 'w' : 'b';

        let resScore = '0';
        if (isWhite) {
          if (match.result === '1 - 0' || match.result === '1F - 0F' || match.result === '1 BYE' || match.result === 'PAB') resScore = '1';
          else if (match.result === '½ - ½' || match.result === '½ BYE') resScore = '½';
        } else {
          if (match.result === '0 - 1' || match.result === '0F - 1F' || match.result === '1 BYE' || match.result === 'PAB') resScore = '1';
          else if (match.result === '½ - ½' || match.result === '½ BYE') resScore = '½';
        }

        roundCells.push(`${oppSno}${colorLetter} ${resScore}`);
      }
    }

    return [
      idx + 1,
      p.id,
      escapeCsv(p.name),
      p.fed,
      p.rating,
      ...roundCells,
      p.score.toFixed(1),
      p.buchholzCut1?.toFixed(1) || '0.0',
      p.sonneborn?.toFixed(2) || '0.00'
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

// 6. Standalone Web-Ready HTML Report
export function generateHtmlReport(tournament: Tournament): string {
  const standings = calculateTournamentStandings(tournament);
  const { players, tieList, completed } = standings;
  const eventName = tournament.name || "Chess Tournament";

  const rowsHtml = players.map((p, idx) => {
    const tbTds = tieList.map(tb => {
      const val = getStandingTieBreakValue(p, tb);
      const is2Dec = tb.includes('Sonneborn') || tb.includes('Average of Opponents');
      return `<td style="text-align:right; font-family:monospace;">${is2Dec ? val.toFixed(2) : val.toFixed(1)}</td>`;
    }).join('');

    return `
      <tr style="border-bottom: 1px solid #e2e8f0; ${idx % 2 === 0 ? 'background:#f8fafc;' : ''}">
        <td style="text-align:center; font-weight:bold;">${idx + 1}</td>
        <td style="text-align:center; color:#64748b;">${p.id}</td>
        <td style="font-weight:600;">${p.title ? `<span style="color:#d97706; font-weight:bold;">${p.title}</span> ` : ''}${p.name}</td>
        <td style="text-align:center;">${p.fed}</td>
        <td style="text-align:right; font-family:monospace;">${p.rating}</td>
        <td style="text-align:right; font-weight:bold; color:#2563eb; font-size:1.05em;">${p.score.toFixed(1)}</td>
        ${tbTds}
      </tr>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${eventName} - Official Standings</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 40px; color: #1e293b; background: #ffffff; }
    h1 { margin-bottom: 4px; color: #0f172a; }
    .meta { color: #64748b; font-size: 14px; margin-bottom: 24px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { background: #0f172a; color: #ffffff; text-align: left; padding: 10px 12px; font-weight: 600; }
    td { padding: 8px 12px; }
    .footer { margin-top: 30px; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 12px; }
  </style>
</head>
<body>
  <h1>${eventName}</h1>
  <div class="meta">
    <b>Venue:</b> ${tournament.settings.city}, ${tournament.settings.country} &bull; 
    <b>Chief Arbiter:</b> ${tournament.settings.chiefArbiter} &bull; 
    <b>Rounds:</b> ${completed} of ${tournament.settings.rounds} &bull; 
    <b>Generated:</b> ${new Date().toLocaleString()}
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:50px; text-align:center;">Rank</th>
        <th style="width:50px; text-align:center;">SNo</th>
        <th>Player Name</th>
        <th style="width:60px; text-align:center;">FED</th>
        <th style="width:70px; text-align:right;">Rating</th>
        <th style="width:70px; text-align:right;">Points</th>
        ${tieList.map((tb, i) => `<th style="text-align:right;">TB${i + 1}</th>`).join('')}
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>

  <div class="footer">
    Official Tournament Report generated by FIDE Dutch Tournament Manager (FIDE 2026 Regulations C.04 Compliant).
  </div>
</body>
</html>`;
}
