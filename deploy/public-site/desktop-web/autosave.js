(() => {
  if (!window.cpDesktopWebAllowed) return;

  const pending = new Map();
  const blocked = new Map();
  let timer;
  let running;
  let retryDelay = 2500;
  let message = 'Cloud autosave on';

  function setCloudStatus(value) {
    message = value;
    const status = document.getElementById('cpWebCloudSaveStatus');
    if (status) status.textContent = value;
  }

  function schedule(delay = 1250) {
    if (!pending.size) return;
    clearTimeout(timer);
    timer = setTimeout(flush, delay);
  }

  function enqueue(snapshot) {
    for (const [name, tournament] of Object.entries(snapshot?.data?.tournaments || {})) {
      pending.set(name, { tournament });
    }
    if (pending.size) schedule();
  }

  async function saveBatch() {
    if (!navigator.onLine || window.__cpOnlineCloudBusy) {
      if (!navigator.onLine) setCloudStatus('Offline · Cloud save pending');
      schedule(retryDelay);
      return;
    }

    window.__cpOnlineCloudBusy = true;
    let retry = false;
    try {
      const core = window.ChessPublisherCloudSyncInternals;
      for (const [name, job] of [...pending]) {
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
        if (result?.ok && !result.updateAvailable && !result.skipped) {
          if (pending.get(name) === job) pending.delete(name);
          blocked.delete(name);
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

    if (retry) {
      setCloudStatus('Saved locally · Cloud save pending');
      schedule(retryDelay);
      retryDelay = Math.min(60000, retryDelay * 2);
    } else {
      retryDelay = 2500;
      if (blocked.size) setCloudStatus('Cloud changes need review · Open Online & Cloud');
      else if (pending.size) setCloudStatus('Cloud save pending');
      else setCloudStatus('Saved to private Cloud');
      schedule();
    }
  }

  function flush() {
    if (running || !pending.size) return running;
    clearTimeout(timer);
    running = saveBatch().finally(() => { running = undefined; });
    return running;
  }

  window.cpWebQueueAutosave = enqueue;
  window.cpWebFlushAutosave = async () => {
    await running;
    await flush();
  };

  window.addEventListener('online', () => schedule(0));
  window.addEventListener('pageshow', () => schedule(0));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') schedule(0);
  });
  document.addEventListener('DOMContentLoaded', () => setCloudStatus(message), { once: true });
})();
