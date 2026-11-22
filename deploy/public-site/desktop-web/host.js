(() => {
  const sessionKey = 'cp.desktop-web.session';
  let session;
  try { session = JSON.parse(sessionStorage.getItem(sessionKey) || 'null'); } catch {}
  const allowed = !!session && /^[a-f0-9]{64}$/.test(session.scope || '') && /^[!-~]{1,2048}$/.test(session.token || '');
  if (!allowed) {
    sessionStorage.removeItem(sessionKey);
    location.replace('./');
    document.documentElement.style.visibility = 'hidden';
  }
  window.cpDesktopWebAllowed = allowed;

  const namespace = allowed ? `cp-desktop-web:${session.scope}:` : '';
  window.cpWebStorage = allowed ? {
    getItem: key => localStorage.getItem(namespace + key),
    setItem: (key, value) => localStorage.setItem(namespace + key, value),
    removeItem: key => localStorage.removeItem(namespace + key)
  } : {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {}
  };
  window.cpWebDatabase = allowed ? {
    open: (name, ...args) => indexedDB.open(namespace + name, ...args),
    deleteDatabase: name => indexedDB.deleteDatabase(namespace + name)
  } : {
    open: () => { throw new Error('Signed out.'); },
    deleteDatabase: () => { throw new Error('Signed out.'); }
  };

  window.cpDesktopWebOrganizerToken = () => allowed ? session?.token || '' : '';

  const secretsKey = allowed ? `cp.desktop-web.secrets:${session.scope}` : '';
  const secrets = new Map();
  if (secretsKey) {
    try {
      const stored = JSON.parse(sessionStorage.getItem(secretsKey) || 'null');
      if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
        for (const [key, value] of Object.entries(stored)) secrets.set(key, String(value || ''));
      }
    } catch {}
  }
  function persistSecrets() {
    try {
      if (allowed && secrets.size) sessionStorage.setItem(secretsKey, JSON.stringify(Object.fromEntries(secrets)));
      else if (secretsKey) sessionStorage.removeItem(secretsKey);
    } catch {}
  }

  const authClearListeners = new Set();
  window.cpWebOnAuthCleared = listener => {
    if (typeof listener === 'function') authClearListeners.add(listener);
  };
  function clearAuthState() {
    secrets.clear();
    if (session) session.token = '';
    sessionStorage.removeItem(sessionKey);
    if (secretsKey) sessionStorage.removeItem(secretsKey);
    for (const listener of authClearListeners) {
      try { listener(); } catch {}
    }
  }

  const listeners = new Set();
  window.__cpBrowserHostBridge = {
    addEventListener(type, listener) {
      if (type === 'message') listeners.add(listener);
    },
    postMessage(message) {
      if (message?.type !== 'cp:hub-secret') return;
      const { key, requestId, operation } = message;
      const organizer = key.startsWith('organizer-primary:');
      const get = () => organizer ? session?.token : secrets.get(key);
      const tokenChange = operation === 'set' && organizer && String(message.value || '') !== session?.token;
      if (operation === 'set' && !organizer && allowed) {
        secrets.set(key, String(message.value || ''));
        persistSecrets();
      }
      if (operation === 'remove') {
        if (organizer) {
          clearAuthState();
        } else {
          secrets.delete(key);
          persistSecrets();
        }
      }
      const value = get();
      queueMicrotask(() => {
        const data = tokenChange
          ? { type: 'cp:hub-secret-result', requestId, ok: false, error: 'Sign out before switching organizer accounts.' }
          : { type: 'cp:hub-secret-result', requestId, ok: true, found: !!value, value: value || '' };
        for (const listener of listeners) listener({ data });
      });
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    if (!allowed) return;
    const menu = document.querySelector('#classicMenuBar');
    if (!menu) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Sign out';
    button.id = 'cpDesktopWebSignOut';
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        if (typeof saveAll === 'function') saveAll();
        if (typeof fileSaveTournament === 'function' && getCurrentTournament()) {
          if (!await fileSaveTournament(true)) throw new Error('Tournament could not be saved.');
        }
        await window.cpWebFlushAutosave?.();
        clearAuthState();
        location.replace('./');
      } catch (error) {
        if (typeof setStatus === 'function') setStatus(error.message);
        button.disabled = false;
      }
    });
    menu.append(button);
  }, { once: true });
})();
