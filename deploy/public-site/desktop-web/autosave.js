(() => {
  if (!window.cpDesktopWebAllowed) return;

  const pending = new Map();
  const blocked = new Map();
  let timer;
  let running;
  let retryDelay = 2500;
  let authBlocked = false;
  let message = 'Cloud autosave on';

  function setCloudStatus(value) {
    message = value;
    const status = document.getElementById('cpWebCloudSaveStatus');
    if (status) status.textContent = value;
  }

  function schedule(delay = 1250) {
    if (!pending.size || authBlocked) return;
    clearTimeout(timer);
    timer = setTimeout(flush, delay);
  }

  function enqueue(snapshot) {
    if (authBlocked) return;
    for (const [name, tournament] of Object.entries(snapshot?.data?.tournaments || {})) {
      pending.set(name, { tournament });
    }
    if (pending.size) schedule();
  }

  window.cpWebOnAuthCleared?.(() => {
    authBlocked = true;
    pending.clear();
    blocked.clear();
    clearTimeout(timer);
    setCloudStatus('Session expired · Sign in again');
  });

  async function saveBatch() {
    if (authBlocked) {
      pending.clear();
      return false;
    }
    if (!navigator.onLine || window.__cpOnlineCloudBusy) {
      if (!navigator.onLine) setCloudStatus('Offline · Cloud save pending');
      schedule(retryDelay);
      return true;
    }

    window.__cpOnlineCloudBusy = true;
    let retry = false;
    try {
      const core = window.ChessPublisherCloudSyncInternals;
      for (const [name, job] of [...pending]) {
        if (authBlocked) break;
        if (pending.get(name) !== job) continue;
        const local = data?.tournaments?.[name];
        if (!local || local.cloud?.internalId !== job.tournament.cloud?.internalId) {
          pending.delete(name);
          blocked.delete(name);
          continue;
        }

        const hash = await core.tournamentContentHash(name, job.tournament);
        if (pending.get(name) !== job) continue;
        if (local.cloud?.cloudTournamentId && core.storedBaseFingerprint(local.cloud) === hash) {
          pending.delete(name);
          blocked.delete(name);
          continue;
        }
        if (blocked.get(name) === hash) {
          pending.delete(name);
          continue;
        }

        setCloudStatus('Saving to private Cloud…');
        const result = await window.cpWebBackupTournament(name, job.tournament);
        const status = Number(result?.error?.status || 0);
        if (result?.noToken || status === 401 || status === 403) {
          authBlocked = true;
          pending.clear();
          blocked.clear();
          setCloudStatus('Session expired · Sign in again');
          break;
        }
        if (result?.ok && !result.updateAvailable && !result.skipped) {
          blocked.delete(name);
          const latest = pending.get(name);
          if (latest === job) {
            pending.delete(name);
          } else if (latest && latest.tournament?.cloud?.internalId === job.tournament.cloud?.internalId) {
            const latestHash = await core.tournamentContentHash(name, latest.tournament);
            if (pending.get(name) === latest && latestHash === hash) pending.delete(name);
          }
        } else if (result?.updateAvailable || result?.error?.code === 'cloud_true_conflict') {
          if (pending.get(name) === job) pending.delete(name);
          blocked.set(name, hash);
        } else {
          retry = true;
        }
      }
    } catch (error) {
      console.warn('Cloud autosave:', error);
      retry = true;
    } finally {
      window.__cpOnlineCloudBusy = false;
    }

    if (authBlocked) return false;
    if (retry) {
      setCloudStatus('Saved locally · Cloud save pending');
      schedule(retryDelay);
      retryDelay = Math.min(60000, retryDelay * 2);
      return true;
    }
    retryDelay = 2500;
    if (blocked.size) setCloudStatus('Cloud changes need review · Open Online & Cloud');
    else if (pending.size) setCloudStatus('Cloud save pending');
    else setCloudStatus('Saved to private Cloud');
    if (pending.size) schedule(250);
    return false;
  }

  function flush() {
    if (running || authBlocked || !pending.size) return running;
    clearTimeout(timer);
    running = saveBatch().finally(() => { running = undefined; });
    return running;
  }

  window.cpWebQueueAutosave = enqueue;
  window.cpWebWaitAutosaveIdle = async () => {
    while (running) await running;
  };
  window.cpWebRunCloudExclusive = async fn => {
    await window.cpWebWaitAutosaveIdle();
    if (window.__cpOnlineCloudBusy) {
      throw new Error('Another Online & Cloud operation is already running.');
    }
    window.__cpOnlineCloudBusy = true;
    try {
      return await fn();
    } finally {
      window.__cpOnlineCloudBusy = false;
      if (pending.size && !authBlocked) schedule(250);
    }
  };
  window.cpWebFlushAutosave = async () => {
    for (let pass = 0; pass < 5; pass++) {
      while (running) await running;
      if (authBlocked || !pending.size || !navigator.onLine || window.__cpOnlineCloudBusy) break;
      const hadRetry = await flush();
      if (hadRetry || !pending.size) break;
    }
  };

  window.addEventListener('online', () => schedule(0));
  window.addEventListener('pageshow', () => schedule(0));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') schedule(0);
  });
  document.addEventListener('DOMContentLoaded', () => setCloudStatus(message), { once: true });
})();
