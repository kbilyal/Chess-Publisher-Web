(() => {
  const sessionKey = 'cp.desktop-web.session';
  const COOKIE_SENTINEL = '__cp_cookie_session__';
  const LEGACY_API_ORIGIN = 'https://chess-publisher-hub-api-beta.kyamranbilyal.workers.dev';
  const apiBase = String(window.CP_API_BASE || 'https://api.chess-publisher.org').trim().replace(/\/+$/, '');

  let session;
  try { session = JSON.parse(sessionStorage.getItem(sessionKey) || 'null'); } catch {}

  const hasValidScope = !!session && /^[a-f0-9]{64}$/.test(session.scope || '');
  const isCookieMode = hasValidScope && session.authMode === 'cookie' &&
    !!session.user && typeof session.user.id === 'string' && session.user.id.length > 0;
  const isLegacyTokenMode = hasValidScope && /^[!-~]{1,2048}$/.test(session.token || '');
  const allowed = isCookieMode || isLegacyTokenMode;

  if (!allowed) {
    sessionStorage.removeItem(sessionKey);
    location.replace('./');
    document.documentElement.style.visibility = 'hidden';
  }
  window.cpDesktopWebAllowed = allowed;
  window.cpDesktopWebAuthMode = isCookieMode ? 'cookie' : (isLegacyTokenMode ? 'token' : 'none');

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

  const organizerTokenValue = () => {
    if (!allowed) return '';
    return isCookieMode ? COOKIE_SENTINEL : (session?.token || '');
  };

  window.cpDesktopWebOrganizerToken = organizerTokenValue;

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

  if (isCookieMode && typeof window.fetch === 'function') {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      try {
        const rawUrl = input instanceof Request ? input.url : String(input);
        const parsed = new URL(rawUrl, window.location?.href || apiBase);
        const apiOrigin = new URL(apiBase).origin;
        const isTargetApi = parsed.origin === LEGACY_API_ORIGIN || parsed.origin === apiOrigin;
        if (isTargetApi) {
          const rewrittenUrl = `${apiBase}${parsed.pathname}${parsed.search}`;
          const headers = new Headers(input instanceof Request ? input.headers : undefined);
          if (init?.headers) {
            new Headers(init.headers).forEach((value, key) => headers.set(key, value));
          }
          const authHeader = headers.get('Authorization') || '';
          if (authHeader.trim() === `Bearer ${COOKIE_SENTINEL}`) {
            headers.delete('Authorization');
          }
          const nextInit = { ...init, headers, credentials: 'include' };
          if (input instanceof Request) {
            return nativeFetch(new Request(rewrittenUrl, nextInit));
          }
          return nativeFetch(rewrittenUrl, nextInit);
        }
      } catch {}
      return nativeFetch(input, init);
    };
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
      const expectedToken = organizerTokenValue();
      const get = () => organizer ? expectedToken : secrets.get(key);
      const tokenChange = operation === 'set' && organizer && String(message.value || '') !== expectedToken;
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

  function makeEl(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
  }

  function renderUserMenu(menu) {
    const user = isCookieMode ? session.user : null;
    const displayName = (user?.name || user?.email || 'Organizer').trim();
    const wrap = makeEl('div', 'cp-user-menu');
    wrap.id = 'cpDesktopWebUserMenu';

    const toggle = makeEl('button', 'cp-user-toggle');
    toggle.type = 'button';
    toggle.id = 'cpDesktopWebUserBtn';
    toggle.setAttribute('aria-expanded', 'false');

    if (user?.avatarUrl && user.avatarUrl.startsWith('https://')) {
      const img = document.createElement('img');
      img.className = 'cp-user-avatar';
      img.src = user.avatarUrl;
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      toggle.append(img);
    } else {
      const initials = displayName.slice(0, 2).toUpperCase();
      toggle.append(makeEl('span', 'cp-user-initials', initials));
    }
    toggle.append(makeEl('span', 'cp-user-name', displayName));

    const panel = makeEl('div', 'cp-user-panel');
    panel.id = 'cpUserMenuPanel';
    panel.hidden = true;

    const header = makeEl('div', 'cp-user-panel-header');
    header.append(makeEl('strong', 'cp-user-panel-name', displayName));
    if (user?.email) header.append(makeEl('div', 'cp-user-panel-email', user.email));
    panel.append(header);

    const tournamentsSection = makeEl('div', 'cp-user-panel-section');
    tournamentsSection.append(makeEl('div', 'cp-user-section-title', 'Моите турнири'));
    const list = makeEl('div', 'cp-user-tournaments-list');
    list.id = 'cpUserTournamentsList';
    list.textContent = 'Натиснете за зареждане…';
    tournamentsSection.append(list);
    panel.append(tournamentsSection);

    if (isCookieMode) {
      const desktopSection = makeEl('div', 'cp-user-panel-section');
      desktopSection.append(makeEl('div', 'cp-user-section-title', 'Десктоп синхронизация'));

      const tokenStatus = makeEl('div', 'cp-user-token-status');
      const genBtn = makeEl('button', 'cp-user-action-btn', 'Генерирай Desktop API ключ');
      genBtn.type = 'button';
      genBtn.addEventListener('click', async () => {
        genBtn.disabled = true;
        tokenStatus.textContent = 'Генериране…';
        try {
          const res = await fetch(`${apiBase}/api/auth/desktop-tokens`, {
            method: 'POST',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ label: 'Desktop App' })
          });
          const data = await res.json().catch(() => null);
          if (!res.ok || !data?.token) throw new Error(data?.message || 'Грешка');
          tokenStatus.textContent = `Нов ключ (копирайте сега): ${data.token}`;
        } catch {
          tokenStatus.textContent = 'Неуспешно генериране на ключ.';
        } finally {
          genBtn.disabled = false;
        }
      });
      desktopSection.append(genBtn, tokenStatus);
      panel.append(desktopSection);
    }

    const signOutBtn = makeEl('button', 'cp-user-signout-btn', 'Изход');
    signOutBtn.type = 'button';
    signOutBtn.id = 'cpDesktopWebSignOut';
    signOutBtn.addEventListener('click', async () => {
      signOutBtn.disabled = true;
      try {
        if (typeof saveAll === 'function') saveAll();
        if (typeof fileSaveTournament === 'function' && getCurrentTournament()) {
          if (!await fileSaveTournament(true)) throw new Error('Tournament could not be saved.');
        }
        await window.cpWebFlushAutosave?.();
        if (isCookieMode) {
          await fetch(`${apiBase}/api/auth/logout`, {
            method: 'POST',
            credentials: 'include',
            cache: 'no-store'
          }).catch(() => {});
          try { window.google?.accounts?.id?.disableAutoSelect?.(); } catch {}
        }
        clearAuthState();
        location.replace('./');
      } catch (error) {
        if (typeof setStatus === 'function') setStatus(error.message);
        signOutBtn.disabled = false;
      }
    });

    let loadedTournaments = false;
    async function loadUserTournaments() {
      if (loadedTournaments) return;
      loadedTournaments = true;
      list.textContent = 'Зареждане…';
      try {
        const res = await fetch(`${apiBase}/api/v1/cloud/tournaments`, {
          headers: {
            Accept: 'application/json',
            ...(isLegacyTokenMode ? { Authorization: `Bearer ${session.token}` } : {})
          },
          credentials: isCookieMode ? 'include' : 'omit',
          cache: 'no-store'
        });
        const data = res.ok ? await res.json().catch(() => null) : null;
        const rows = Array.isArray(data?.tournaments) ? data.tournaments : [];
        list.replaceChildren();
        if (!rows.length) {
          list.textContent = 'Нямате онлайн турнири.';
          return;
        }
        for (const item of rows.slice(0, 10)) {
          const itemBtn = makeEl('button', 'cp-user-tournament-item', item.name || item.id);
          itemBtn.type = 'button';
          itemBtn.addEventListener('click', async () => {
            panel.hidden = true;
            toggle.setAttribute('aria-expanded', 'false');
            if (typeof window.cpCloudOpenTournament === 'function' && item.id) {
              await window.cpCloudOpenTournament(item.id);
            } else if (typeof showTab === 'function') {
              showTab('hub', document.getElementById('tabHub'));
            }
          });
          list.append(itemBtn);
        }
      } catch {
        list.textContent = 'Грешка при зареждане.';
        loadedTournaments = false;
      }
    }

    toggle.addEventListener('click', () => {
      const nextOpen = panel.hidden;
      panel.hidden = !nextOpen;
      toggle.setAttribute('aria-expanded', String(nextOpen));
      if (nextOpen) loadUserTournaments();
    });

    document.addEventListener('click', event => {
      if (!panel.hidden && !wrap.contains(event.target)) {
        panel.hidden = true;
        toggle.setAttribute('aria-expanded', 'false');
      }
    });

    wrap.append(toggle, signOutBtn, panel);
    menu.append(wrap);
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (!allowed) return;
    if (isCookieMode && typeof window.fetch === 'function') {
      window.fetch(`${apiBase}/api/auth/me`, {
        headers: { Accept: 'application/json' },
        credentials: 'include',
        cache: 'no-store'
      }).then(res => {
        if (res.status === 401) {
          clearAuthState();
          location.replace('./');
        }
      }).catch(() => {});
    }
    const menu = document.querySelector('#classicMenuBar');
    if (!menu) return;
    renderUserMenu(menu);
  }, { once: true });
})();
