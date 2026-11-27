(() => {
  if (!window.cpDesktopWebAllowed) return;

  const pending = new Map();
  const blocked = new Map();
  let timer;
  let running;
  let retryDelay = 2500;
  let authBlocked = false;
  let exclusivePending = 0;
  let message = 'Cloud autosave on';
  let statusState = 'ok';
  const automaticEnabled = () => window.cpWebAutoSaveSyncEnabled?.() !== false;

  function setCloudStatus(value, state = statusState) {
    message = value;
    statusState = state;
    const status = document.getElementById('cpWebCloudSaveStatus');
    if (status) {
      status.textContent = value;
      if (status.dataset) status.dataset.cpCloudState = state;
      if (status.classList) {
        status.classList.remove('cp-cloud-status-ok', 'cp-cloud-status-syncing', 'cp-cloud-status-warn', 'cp-cloud-status-expired');
        if (state === 'syncing') status.classList.add('cp-cloud-status-syncing');
        else if (state === 'conflict' || state === 'offline' || state === 'pending') status.classList.add('cp-cloud-status-warn');
        else if (state === 'expired') status.classList.add('cp-cloud-status-expired');
        else status.classList.add('cp-cloud-status-ok');
      }
    }
  }

  function schedule(delay = 1250) {
    if (!pending.size || authBlocked || !automaticEnabled()) return;
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
    setCloudStatus('Session expired · Sign in again', 'expired');
  });

  async function saveBatch() {
    if (authBlocked) {
      pending.clear();
      return false;
    }
    if (!automaticEnabled()) return false;
    if (!navigator.onLine || window.__cpOnlineCloudBusy || exclusivePending > 0) {
      if (!navigator.onLine) setCloudStatus('Offline · Cloud save pending', 'offline');
      schedule(retryDelay);
      return true;
    }

    const core = window.ChessPublisherCloudSyncInternals;
    if (!core || typeof core.tournamentContentHash !== 'function' || typeof window.cpWebBackupTournament !== 'function') {
      schedule(retryDelay);
      return true;
    }

    window.__cpOnlineCloudBusy = true;
    let retry = false;
    try {
      for (const [name, job] of [...pending]) {
        if (authBlocked || !automaticEnabled()) break;
        if (pending.get(name) !== job) continue;
        const local = data?.tournaments?.[name];
        if (!local || local.cloud?.internalId !== job.tournament.cloud?.internalId) {
          pending.delete(name);
          blocked.delete(name);
          continue;
        }

        const hash = await core.tournamentContentHash(name, job.tournament);
        if (!automaticEnabled()) break;
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

        setCloudStatus('Saving to private Cloud…', 'syncing');
        const result = await window.cpWebBackupTournament(name, job.tournament);
        const status = Number(result?.error?.status || 0);
        if (result?.noToken || status === 401 || status === 403) {
          authBlocked = true;
          pending.clear();
          blocked.clear();
          setCloudStatus('Session expired · Sign in again', 'expired');
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
    if (!automaticEnabled()) {
      setCloudStatus('AutoSave & Sync off', 'paused');
      return false;
    }
    if (retry) {
      setCloudStatus('Saved locally · Cloud save pending', 'pending');
      schedule(retryDelay);
      retryDelay = Math.min(60000, retryDelay * 2);
      return true;
    }
    retryDelay = 2500;
    if (blocked.size) setCloudStatus('Cloud changes need review · Click Sync', 'conflict');
    else if (pending.size) setCloudStatus('Cloud save pending', 'pending');
    else setCloudStatus('Saved to private Cloud', 'ok');
    if (pending.size) schedule(250);
    return false;
  }

  function flush() {
    if (running || authBlocked || exclusivePending > 0 || !pending.size || !automaticEnabled()) return running;
    clearTimeout(timer);
    running = saveBatch().finally(() => { running = undefined; });
    return running;
  }

  async function reconcileBlockedAndStatus() {
    if (authBlocked) return;
    const core = window.ChessPublisherCloudSyncInternals;
    if (core && blocked.size) {
      for (const name of [...blocked.keys()]) {
        const local = data?.tournaments?.[name];
        if (!local) {
          blocked.delete(name);
          pending.delete(name);
          continue;
        }
        try {
          const hash = await core.tournamentContentHash(name, local);
          if (local.cloud?.cloudTournamentId && core.storedBaseFingerprint(local.cloud) === hash) {
            blocked.delete(name);
            const queued = pending.get(name);
            if (queued && queued.tournament?.cloud?.internalId === local.cloud?.internalId) {
              const queuedHash = await core.tournamentContentHash(name, queued.tournament);
              if (queuedHash === hash) pending.delete(name);
            }
          }
        } catch (error) {
          console.warn('Cloud autosave status check:', error);
        }
      }
    }
    if (authBlocked || running) return;
    if (!automaticEnabled()) {
      setCloudStatus('AutoSave & Sync off', 'paused');
      return;
    }
    if (blocked.size) setCloudStatus('Cloud changes need review · Click Sync', 'conflict');
    else if (pending.size) setCloudStatus('Cloud save pending', 'pending');
    else setCloudStatus('Saved to private Cloud', 'ok');
  }

  window.cpWebQueueAutosave = enqueue;
  window.cpWebWaitAutosaveIdle = async () => {
    while (running) await running;
  };
  window.cpWebRunCloudExclusive = async fn => {
    exclusivePending += 1;
    let acquired = false;
    try {
      clearTimeout(timer);
      await window.cpWebWaitAutosaveIdle();
      if (window.__cpOnlineCloudBusy) {
        throw new Error('Another Cloud sync operation is already running.');
      }
      window.__cpOnlineCloudBusy = true;
      acquired = true;
      return await fn();
    } finally {
      exclusivePending = Math.max(0, exclusivePending - 1);
      if (acquired) {
        window.__cpOnlineCloudBusy = false;
        await reconcileBlockedAndStatus();
        if (pending.size && !authBlocked) schedule(250);
      }
    }
  };
  window.cpWebFlushAutosave = async () => {
    for (let pass = 0; pass < 5; pass++) {
      while (running) await running;
      if (authBlocked || !pending.size || !automaticEnabled() || !navigator.onLine || window.__cpOnlineCloudBusy) break;
      const hadRetry = await flush();
      if (hadRetry || !pending.size) break;
    }
  };
  window.cpWebFlushPairingNow = async () => {
    if (authBlocked || !automaticEnabled() || !navigator.onLine) return false;
    if (typeof window.cpRunAutosaveCheckpoint === 'function') {
      await window.cpRunAutosaveCheckpoint().catch(() => {});
    } else if (typeof window.cpFlushPersistence === 'function') {
      await window.cpFlushPersistence().catch(() => {});
    }
    await window.cpWebFlushAutosave();
    return true;
  };

  window.addEventListener('online', () => {
    retryDelay = 2500;
    schedule(0);
  });
  window.addEventListener('pageshow', () => schedule(0));
  window.addEventListener('pagehide', () => {
    if (pending.size && !authBlocked && automaticEnabled() && navigator.onLine) flush();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') schedule(0);
    else if (document.visibilityState === 'hidden' && pending.size && !authBlocked && automaticEnabled() && navigator.onLine) flush();
  });
  document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('autosaveToggle');
    const scope = window.cpWebAutoSaveSyncScope;
    function applyPreference(enabled) {
      if (toggle && !toggle.disabled) toggle.checked = enabled;
      if (!enabled) {
        clearTimeout(timer);
        if (!authBlocked) setCloudStatus('AutoSave & Sync off', 'paused');
      } else if (!authBlocked) {
        setCloudStatus('Cloud autosave on', 'ok');
        schedule(0);
      }
      if (typeof toggleAutosave !== 'function' || toggle?.disabled || autosaveEnabled === enabled) return;
      const dirty = stateDirty;
      toggleAutosave(enabled);
      if (enabled && !dirty && getCurrentTournament()) {
        void cpRunAutosaveCheckpoint().catch(error => console.warn('AutoSave restart:', error));
      }
    }
    toggle?.addEventListener('change', () => {
      toggle.checked = window.cpAutoSaveSync.setEnabled(scope, toggle.checked);
    });
    const unsubscribe = window.cpAutoSaveSync?.subscribe(scope, applyPreference);
    if (unsubscribe) window.cpWebOnAuthCleared?.(unsubscribe);
    applyPreference(automaticEnabled());
  }, { once: true });
})();
