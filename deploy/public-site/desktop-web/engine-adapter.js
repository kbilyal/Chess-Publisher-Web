(() => {
  const engineVersion = '1.11.65';
  let worker;
  let busy = false;

  function getWorker() {
    worker ||= new Worker(new URL('./pairing-worker.mjs', location.href), { type: 'module' });
    return worker;
  }

  function warmOnPairings(event) {
    if (!window.cpDesktopWebAllowed || !event.target.closest?.('#tabPairings')) return;
    for (const type of ['pointerover', 'focusin', 'click']) document.removeEventListener(type, warmOnPairings, true);
    if (worker) return;
    try {
      const active = getWorker();
      active.addEventListener('error', () => {
        if (!busy && worker === active) { active.terminate(); worker = undefined; }
      }, { once: true });
      active.postMessage({ type: 'warmup' });
    } catch { /* Draw retries initialization when requested. */ }
  }
  for (const type of ['pointerover', 'focusin', 'click']) document.addEventListener(type, warmOnPairings, true);

  function draw(payload) {
    if (busy) throw new Error('A pairing is already being calculated.');
    busy = true;
    return new Promise((resolve, reject) => {
      try {
        getWorker();
      } catch (error) {
        busy = false;
        reject(error);
        return;
      }
      const active = worker;
      function finish(error, result, resetWorker = false) {
        clearTimeout(timer);
        active.removeEventListener('message', message);
        active.removeEventListener('error', failed);
        if (resetWorker) { active.terminate(); worker = undefined; }
        busy = false;
        if (error) reject(error);
        else resolve(result);
      }
      function message({ data }) {
        if (data.phase) return;
        if (data.error) finish(new Error(data.error));
        else finish(null, data.result);
      }
      function failed() { finish(new Error('Gacrux could not load in this browser.'), undefined, true); }
      const timer = setTimeout(() => {
        finish(new Error('Gacrux exceeded the browser pairing time limit.'), undefined, true);
      }, 90_000);
      active.addEventListener('message', message);
      active.addEventListener('error', failed);
      active.postMessage(payload);
    });
  }

  let queue = Promise.resolve();
  function checkedRequest(payload) {
    const result = queue.then(() => draw(payload));
    queue = result.catch(() => {});
    return result;
  }

  window.cpDesktopWebEngine = async (path, options) => {
    if (path === '/pair') {
      try {
        const result = await checkedRequest(JSON.parse(options.body));
        return Response.json({
          ok: true,
          output: [result.pairs.length, ...result.pairs.map(pair => `${pair.white} ${pair.black}`)].join('\r\n'),
          engine: `Gacrux ${engineVersion}`,
          checker: { ok: true, check: true, mode: 'gacrux-verification' },
          independentChecker: {
            available: false, state: 'unavailable', version: '6.0.0', checker: 'bbpPairings',
            message: 'The independent BBP checker requires the native service.'
          }
        });
      } catch (error) {
        return Response.json({ ok: false, error: error.message }, { status: 422 });
      }
    }
    if (path === '/tiebreak-checker/status' || path === '/tiebreak-checker/install') {
      return Response.json({ok:true,available:true,ready:true,version:engineVersion});
    }
    if (path === '/tiebreak-checker/check' || path === '/trf26-exchange/check') {
      try {
        return Response.json(await checkedRequest({type:'standings',request:JSON.parse(options.body)}));
      } catch (error) {
        return Response.json({ok:false,error:error.message},{status:422});
      }
    }
    if (/^\/(pairing-checker|tiebreak-checker)\/(status|install)$/.test(path)) {
      return Response.json({ ok: true, ready: false, available: false, state: 'unavailable',
        message: 'This independent checker is available in the native application.' });
    }
    return Response.json({ ok: false, error: 'This operation requires the desktop service.' }, { status: 503 });
  };

  window.initializeGacrux = async function () {
    gacruxRuntime.state = 'ready';
    gacruxRuntime.source = `Gacrux ${engineVersion} · Browser`;
    updateGacruxPanel();
    return true;
  };
})();
