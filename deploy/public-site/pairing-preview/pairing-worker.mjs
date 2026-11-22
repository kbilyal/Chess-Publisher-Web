import { loadPyodide } from './runtime/pyodide.mjs';
import { PairingError, parsePairingOutput, preparePairing, version } from './pairing-format.mjs';

let runtime;
function toLatin1Bytes(text) {
  return Uint8Array.from(String(text), char => {
    const code = char.charCodeAt(0);
    return code <= 0xff ? code : 0x3f;
  });
}

async function loadRuntime() {
  const pythonReady = loadPyodide({
    indexURL: new URL('./runtime/', import.meta.url).href,
    stdout: () => {},
    stderr: () => {}
  });
  const archives = [['gacrux.zip', '/gacrux.zip'], ['networkx.whl', '/networkx.whl']];
  const archiveData = Promise.all(archives.map(async ([asset, path]) => {
    const response = await fetch(new URL(`./runtime/${asset}`, import.meta.url));
    if (!response.ok) throw new Error('Runtime asset is missing.');
    return [path, new Uint8Array(await response.arrayBuffer())];
  }));
  const [python, files] = await Promise.all([pythonReady, archiveData]);
  for (const [path, bytes] of files) python.FS.writeFile(path, bytes);
  python.runPython(`
import sys
sys.path[:0] = ['/gacrux.zip', '/networkx.whl']
from gacrux.version import __version__
from gacrux.pairingchecker import pairingchecker

from gacrux.tiebreakchecker import tiebreakchecker

def run_pairing(args, ties=False):
    previous = sys.argv
    try:
        sys.argv = ['pairingchecker', *args]
        return (tiebreakchecker() if ties else pairingchecker()).common_main()
    finally:
        sys.argv = previous
`);
  if (python.globals.get('__version__') !== version) throw new Error('Unexpected Gacrux version.');
  return python;
}

function getRuntime() {
  runtime ||= loadRuntime().catch(error => {
    runtime = undefined;
    throw error;
  });
  return runtime;
}

async function draw(payload) {
  const { trf, round, rounds, topColor, excluded, players } = preparePairing(payload);
  const python = await getRuntime();
  self.postMessage({ phase: 'pairing' });
  const input = '/preview.trf';
  const output = '/preview.txt';
  const args = python.toPy([
    '-p', '-m', 'dutch', '-i', input, '-o', output, '-f', 'TRF', '-F', 'TXT', '-d', 'T',
    '-n', String(round), '-N', String(rounds), '-t', topColor, '-x', 'weighted',
    ...(excluded.length ? ['-u', ...excluded.map(String)] : [])
  ]);
  const runPairing = python.globals.get('run_pairing');
  try {
    python.FS.writeFile(input, toLatin1Bytes(trf));
    function run() {
      let code;
      try {
        code = runPairing(args);
      } catch (error) {
        if (!python.FS.analyzePath(output).exists) throw error;
        code = 1;
      }
      const raw = python.FS.readFile(output, { encoding: 'utf8' });
      python.FS.unlink(output);
      const pairs = parsePairingOutput(raw, players, excluded);
      if (code !== 0) throw new Error('Gacrux exited before completing the pairing.');
      return pairs;
    }
    const pairs = run();
    if (excluded.length || pairs.some(pair => !pair.black)) {
      if (JSON.stringify(pairs) !== JSON.stringify(run())) throw new Error('Gacrux regeneration mismatch.');
    } else {
      const blocks = new Map();
      for (const {white, black} of pairs) {
        blocks.set(white, String(black).padStart(4) + ' w    ');
        blocks.set(black, String(white).padStart(4) + ' b    ');
      }
      const end = 91 + 10 * (round - 1);
      const checked = trf.split(/\r?\n/).map(line => line.startsWith('001')
        ? line.slice(0, end) + blocks.get(Number(line.slice(4, 8))) : line).join('\r\n');
      python.FS.writeFile(input, toLatin1Bytes(checked));
      const checkArgs = python.toPy(['-c','-m','dutch','-i',input,'-o',output,'-f','TRF','-F','JSON',
        '-n',String(round),'-N',String(rounds),'-t',topColor,'-x','weighted','-d','T']);
      try {
        const code = runPairing(checkArgs);
        const report = python.FS.readFile(output, {encoding:'utf8'});
        if (code !== 0 || !/^Check:\s*True\s*$/m.test(report)) throw new Error('Gacrux rejected round ' + round);
      } finally { checkArgs.destroy(); }
    }
    return { round, version, pairs };
  } finally {
    args.destroy();
    runPairing.destroy();
    for (const path of [input, output]) {
      if (python.FS.analyzePath(path).exists) python.FS.unlink(path);
    }
  }
}

async function checkStandings(req) {
  const python = await getRuntime();
  const input = '/standings.trf', output = '/standings.txt';
  const args = ['-i',input,'-o',output,'-f','TRF','-F','TXT','-n',String(req.round),
    '-c','-r','-d','T',req.mode === 'rr' ? '-p' : '-s'];
  if (Array.isArray(req.tieBreaks) && req.tieBreaks.length) args.push('-t', ...req.tieBreaks);
  if (req.unratedRating != null) args.push('-u',String(req.unratedRating));
  const argv = python.toPy(args);
  const checker = python.globals.get('run_pairing');
  try {
    python.FS.writeFile(input, toLatin1Bytes(req.trf));
    if (checker(argv,true) !== 0) throw new Error('Gacrux could not read the standings.');
    const lines = python.FS.readFile(output,{encoding:'utf8'}).trim().split(/\r?\n/);
    const header = lines.shift().split('\t');
    if (header[0] !== 'Rank' || header[1] !== 'StartNo' || !/^Check:\s*(True|False)$/.test(lines.pop())) {
      throw new Error('Incomplete Gacrux standings report.');
    }
    const rows = new Map();
    for (const line of lines) {
      const fields = line.split('\t');
      const id = Number(fields[1]);
      if (!id || rows.has(id) || !(Number(fields[0]) > 0)) throw new Error('Invalid Gacrux standings row.');
      rows.set(id,fields);
    }
    const mismatches = [];
    let previous = 0;
    if (!req.expected.length || rows.size !== req.expected.length) mismatches.push('Competitor count differs.');
    for (const player of [...req.expected].sort((a,b) => a.rank-b.rank)) {
      const fields = rows.get(player.startNo);
      if (!fields) { mismatches.push('Missing StartNo ' + player.startNo); continue; }
      rows.delete(player.startNo);
      const rank = Number(fields[0]);
      if (rank < previous) mismatches.push('Rank order differs at StartNo ' + player.startNo);
      previous = Math.max(previous,rank);
      for (const [key,expected] of Object.entries(player.values || {})) {
        const actual = fields[header.indexOf(key)];
        if (!actual?.trim() || !Number.isFinite(Number(actual)) || Math.abs(Number(actual)-expected)>0.011) {
          mismatches.push('StartNo ' + player.startNo + ' · ' + key + ': ' + expected + ' / Gacrux ' + (actual ?? 'missing'));
        }
      }
    }
    const check = mismatches.length === 0;
    return {ok:true,available:true,check,state:check?'pass':'fail',round:req.round,version,
      checker:'Gacrux Tie-Break Checker',mismatches,message:mismatches.slice(0,8).join('; ')};
  } finally {
    argv.destroy(); checker.destroy();
    for (const path of [input,output]) if (python.FS.analyzePath(path).exists) python.FS.unlink(path);
  }
}

self.addEventListener('message', async event => {
  if (event.data?.type === 'warmup') {
    await getRuntime().catch(() => {});
    return;
  }
  try {
    self.postMessage({ phase: 'loading' });
    self.postMessage({ result: event.data?.type === 'standings' ? await checkStandings(event.data.request) : await draw(event.data) });
  } catch (error) {
    const message = error instanceof Error ? error.message :
      'Жребият не завърши. Проверете TRF файла и опитайте отново.';
    self.postMessage({ error: message });
  }
});
