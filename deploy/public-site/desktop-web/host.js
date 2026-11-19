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

  const namespace = `cp-desktop-web:${allowed ? session.scope : 'signed-out'}:`;
  window.cpWebStorage = {
    getItem: key => localStorage.getItem(namespace + key),
    setItem: (key, value) => localStorage.setItem(namespace + key, value),
    removeItem: key => localStorage.removeItem(namespace + key)
  };
  window.cpWebDatabase = {
    open: (name, ...args) => indexedDB.open(namespace + name, ...args),
    deleteDatabase: name => indexedDB.deleteDatabase(namespace + name)
  };

  const secrets = new Map();
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
      if (operation === 'set' && !organizer) secrets.set(key, String(message.value || ''));
      if (operation === 'remove') {
        if (organizer) {
          if (session) session.token = '';
          sessionStorage.removeItem(sessionKey);
        } else secrets.delete(key);
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
        sessionStorage.removeItem(sessionKey);
        location.replace('./');
      } catch (error) {
        if (typeof setStatus === 'function') setStatus(error.message);
        button.disabled = false;
      }
    });
    menu.append(button);
  }, { once: true });
})();
