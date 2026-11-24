(() => {
  const sessionKey = 'cp.desktop-web.session';
  const COOKIE_SENTINEL = '__cp_cookie_session__';
  const LEGACY_API_ORIGIN = 'https://chess-publisher-hub-api-beta.kyamranbilyal.workers.dev';
  const CHESS_RESULTS_ORIGIN = 'https://chess-publisher-chess-results.kyamranbilyal.workers.dev';
  const ARBITER_COMPANION_URL = 'https://web.chess-publisher.org/';
  const apiBase = String(window.CP_API_BASE || 'https://api.chess-publisher.org').trim().replace(/\/+$/, '');

  let session;
  try { session = JSON.parse(sessionStorage.getItem(sessionKey) || 'null'); } catch {}

  const hasValidScope = !!session && /^[a-f0-9]{64}$/.test(session.scope || '');
  const isCookieMode = hasValidScope && session.authMode === 'cookie' &&
    !!session.user && typeof session.user.id === 'string' && session.user.id.length > 0;
  const isLegacyTokenMode = hasValidScope && /^[!-~]{1,2048}$/.test(session.token || '');
  let allowed = isCookieMode || isLegacyTokenMode;
  const accountChanges = isCookieMode && typeof BroadcastChannel === 'function'
    ? new BroadcastChannel('cp.desktop-web.google-session') : null;

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
  let bridgeTokenCache = { token: '', expMs: 0 };

  function clearAuthState() {
    allowed = false;
    window.cpDesktopWebAllowed = false;
    bridgeTokenCache = { token: '', expMs: 0 };
    secrets.clear();
    if (session) session.token = '';
    sessionStorage.removeItem(sessionKey);
    if (secretsKey) sessionStorage.removeItem(secretsKey);
    for (const listener of authClearListeners) {
      try { listener(); } catch {}
    }
  }

  function leaveStaleWorkspace() {
    if (!allowed) return;
    clearAuthState();
    document.documentElement.style.visibility = 'hidden';
    location.replace('./');
  }

  accountChanges?.addEventListener('message', ({ data }) => {
    if (data?.id !== session.user.id || data?.organizerId !== session.user.organizerId) {
      leaveStaleWorkspace();
    }
  });

  if (isCookieMode && typeof window.fetch === 'function') {
    const nativeFetch = window.fetch.bind(window);

    async function getBridgeToken(forceRefresh = false) {
      if (!forceRefresh && bridgeTokenCache.token && Date.now() < bridgeTokenCache.expMs - 60000) {
        return bridgeTokenCache.token;
      }
      const res = await nativeFetch(`${apiBase}/api/auth/bridge-token`, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        credentials: 'include',
        cache: 'no-store'
      });
      const data = res.ok ? await res.json().catch(() => null) : null;
      if (!res.ok || !data?.token) {
        throw new Error(data?.message || 'Google session bridge token unavailable.');
      }
      const expMs = Number(data.exp) ? Number(data.exp) * 1000 : Date.now() + 14 * 60000;
      bridgeTokenCache = { token: String(data.token), expMs };
      return bridgeTokenCache.token;
    }

    window.fetch = async (input, init) => {
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

        const isChessResults = parsed.origin === CHESS_RESULTS_ORIGIN && parsed.pathname.startsWith('/api/chess-results/');
        if (isChessResults) {
          const headers = new Headers(input instanceof Request ? input.headers : undefined);
          if (init?.headers) {
            new Headers(init.headers).forEach((value, key) => headers.set(key, value));
          }
          const authHeader = headers.get('Authorization') || '';
          if (!authHeader || authHeader.trim() === `Bearer ${COOKIE_SENTINEL}`) {
            const bridgeToken = await getBridgeToken(false);
            headers.set('Authorization', `Bearer ${bridgeToken}`);
            const nextInit = { ...init, headers };
            const res = input instanceof Request
              ? await nativeFetch(new Request(rawUrl, nextInit))
              : await nativeFetch(rawUrl, nextInit);
            if (res.status === 401) {
              const refreshed = await getBridgeToken(true);
              headers.set('Authorization', `Bearer ${refreshed}`);
              const retryInit = { ...init, headers };
              return input instanceof Request
                ? nativeFetch(new Request(rawUrl, retryInit))
                : nativeFetch(rawUrl, retryInit);
            }
            return res;
          }
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

  function buildArbiterCompanionHref() {
    const current = typeof getCurrentTournament === 'function' ? getCurrentTournament() : null;
    const incoming = new URLSearchParams(location.search).get('cloudTournamentId');
    const cloudId = String(current?.cloud?.cloudTournamentId || current?.cloud?.internalId || incoming || '').trim();
    const url = new URL(ARBITER_COMPANION_URL);
    if (/^[A-Za-z0-9._:-]{1,200}$/.test(cloudId)) url.searchParams.set('cloudTournamentId', cloudId);
    return url;
  }

  function openArbiterCompanion(event) {
    const url = buildArbiterCompanionHref();
    event.currentTarget.href = url.href;
    try { window.cpWebFlushAutosave?.(); } catch {}
    if (!isLegacyTokenMode) return;

    event.preventDefault();
    url.searchParams.set('webHandoff', '1');
    const companion = window.open(url.href, '_blank');
    if (!companion) {
      window.alert('Allow pop-ups for ChessPublisher Web to open Arbiter Companion.');
      return;
    }

    const stop = () => {
      window.clearTimeout(timeout);
      window.removeEventListener('message', ready);
    };
    const ready = message => {
      if (message.origin !== url.origin || message.source !== companion || message.data?.type !== 'cp:companion-ready') return;
      stop();
      if (session.token) companion.postMessage({ type: 'cp:web-organizer-token', token: session.token }, url.origin);
    };
    const timeout = window.setTimeout(stop, 15000);
    window.addEventListener('message', ready);
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

    const arbiterBtn = makeEl('a', 'cp-arbiter-link', 'Arbiter Companion');
    arbiterBtn.id = 'cpArbiterCompanionBtn';
    arbiterBtn.href = ARBITER_COMPANION_URL;
    arbiterBtn.target = '_blank';
    arbiterBtn.rel = 'noopener noreferrer';
    arbiterBtn.title = 'Open Arbiter Companion (mobile/quick setup, registration & publishing)';
    arbiterBtn.addEventListener('click', openArbiterCompanion);

    const quickSection = makeEl('div', 'cp-user-panel-section');
    quickSection.append(makeEl('div', 'cp-user-section-title', 'Quick Access'));
    const panelArbiterLink = makeEl('a', 'cp-user-panel-link', 'Open Arbiter Companion ↗');
    panelArbiterLink.href = ARBITER_COMPANION_URL;
    panelArbiterLink.target = '_blank';
    panelArbiterLink.rel = 'noopener noreferrer';
    panelArbiterLink.addEventListener('click', event => {
      openArbiterCompanion(event);
      panel.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
    });
    quickSection.append(panelArbiterLink);
    panel.append(quickSection);

    const tournamentsSection = makeEl('div', 'cp-user-panel-section');
    tournamentsSection.append(makeEl('div', 'cp-user-section-title', 'My Tournaments'));
    const list = makeEl('div', 'cp-user-tournaments-list');
    list.id = 'cpUserTournamentsList';
    list.textContent = 'Click to load…';
    tournamentsSection.append(list);
    panel.append(tournamentsSection);

    if (isCookieMode) {
      const desktopSection = makeEl('div', 'cp-user-panel-section');
      desktopSection.append(makeEl('div', 'cp-user-section-title', 'Desktop Sync'));

      const tokenStatus = makeEl('div', 'cp-user-token-status');
      const genBtn = makeEl('button', 'cp-user-action-btn', 'Generate Desktop API Key');
      genBtn.type = 'button';
      genBtn.addEventListener('click', async () => {
        genBtn.disabled = true;
        tokenStatus.textContent = 'Generating…';
        try {
          const res = await fetch(`${apiBase}/api/auth/desktop-tokens`, {
            method: 'POST',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ label: 'Desktop App' })
          });
          const data = await res.json().catch(() => null);
          if (!res.ok || !data?.token) throw new Error(data?.message || 'Error');
          tokenStatus.textContent = `New key (copy now): ${data.token}`;
        } catch {
          tokenStatus.textContent = 'Could not generate API key.';
        } finally {
          genBtn.disabled = false;
        }
      });
      desktopSection.append(genBtn, tokenStatus);
      panel.append(desktopSection);
    }

    const signOutBtn = makeEl('button', 'cp-user-signout-btn', 'Sign Out');
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
          try {
            const res = await fetch(`${apiBase}/api/auth/logout`, {
              method: 'POST',
              credentials: 'include',
              redirect: 'error',
              cache: 'no-store',
              signal: AbortSignal.timeout(8000)
            });
            if (!res.ok || (await res.json())?.ok !== true) throw new Error('Sign-out was not confirmed.');
          } catch {
            throw new Error('Could not sign out. Please try again.');
          }
          accountChanges?.postMessage(null);
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

    wrap.append(arbiterBtn, toggle, signOutBtn, panel);
    menu.append(wrap);
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (!allowed) return;
    if (isCookieMode && typeof window.fetch === 'function') {
      const verifyAccount = () => window.fetch(`${apiBase}/api/auth/me?optional=1`, {
        headers: { Accept: 'application/json' },
        credentials: 'include',
        cache: 'no-store',
        signal: AbortSignal.timeout(5000)
      }).then(async res => {
        const data = res.ok ? await res.json().catch(() => null) : null;
        const user = data?.user;
        if (res.status === 401 || (data?.ok === true && (
          data.authenticated !== true || user?.id !== session.user.id || user?.organizerId !== session.user.organizerId
        ))) {
          leaveStaleWorkspace();
        }
      }).catch(() => {});
      void verifyAccount();
      document.addEventListener('visibilitychange', () => {
        if (allowed && document.visibilityState === 'visible') void verifyAccount();
      });
    }
    const menu = document.querySelector('#classicMenuBar');
    if (!menu) return;
    renderUserMenu(menu);
  }, { once: true });
})();
