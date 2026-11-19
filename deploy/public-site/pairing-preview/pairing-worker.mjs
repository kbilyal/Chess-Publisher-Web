import { loadPyodide } from './runtime/pyodide.mjs';
import { PairingError, parsePairingOutput, preparePairing, version } from './pairing-format.mjs';

let runtime;
async function loadRuntime() {
  const python = await loadPyodide({
    indexURL: new URL('./runtime/', import.meta.url).href,
    stdout: () => {},
    stderr: () => {}
  });
  const archives = [['gacrux.zip', '/gacrux.zip'], ['networkx.whl', '/networkx.whl']];
  await Promise.all(archives.map(async ([asset, path]) => {
    const response = await fetch(new URL(`./runtime/${asset}`, import.meta.url));
    if (!response.ok) throw new Error('Runtime asset is missing.');
    python.FS.writeFile(path, new Uint8Array(await response.arrayBuffer()));
  }));
  python.runPython(`
import sys
sys.path[:0] = ['/gacrux.zip', '/networkx.whl']
from gacrux.version import __version__
from gacrux.pairingchecker import pairingchecker

def run_pairing(args):
    previous = sys.argv
    try:
        sys.argv = ['pairingchecker', *args]
        return pairingchecker().common_main()
    finally:
        sys.argv = previous
`);
  if (python.globals.get('__version__') !== version) throw new Error('Unexpected Gacrux version.');
  return python;
}

async function draw(payload) {
  const { trf, round, rounds, topColor, excluded, players } = preparePairing(payload);
  if (!runtime) {
    self.postMessage({ phase: 'loading' });
    runtime = loadRuntime().catch(error => {
      runtime = undefined;
      throw error;
    });
  }
  const python = await runtime;
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
    python.FS.writeFile(input, Uint8Array.from(trf, char => char.charCodeAt(0)));
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
    if (JSON.stringify(pairs) !== JSON.stringify(run())) throw new Error('Pairing verification failed.');
    return { round, version, pairs };
  } finally {
    args.destroy();
    runPairing.destroy();
    for (const path of [input, output]) {
      if (python.FS.analyzePath(path).exists) python.FS.unlink(path);
    }
  }
}

self.addEventListener('message', async event => {
  try {
    self.postMessage({ result: await draw(event.data) });
  } catch (error) {
    const message = error instanceof PairingError ? error.message :
      'Жребият не завърши. Проверете TRF файла и опитайте отново.';
    self.postMessage({ error: message });
  }
});
