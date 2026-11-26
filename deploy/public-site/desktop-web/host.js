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
    !!session.user && typeof session.user.id === 'string' && session.user.id.length > 0 &&
    typeof session.user.organizerId === 'string' && session.user.organizerId.length > 0;
  let allowed = isCookieMode;
  let sessionExpired = false;
  const accountChanges = isCookieMode && typeof BroadcastChannel === 'function'
    ? new BroadcastChannel('cp.desktop-web.google-session') : null;

  if (!allowed) {
    sessionStorage.removeItem(sessionKey);
    location.replace('./');
    document.documentElement.style.visibility = 'hidden';
  }
  window.cpDesktopWebAllowed = allowed;
  window.cpDesktopWebAuthMode = isCookieMode ? 'cookie' : 'none';

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
    if (!allowed || !isCookieMode) return '';
    return COOKIE_SENTINEL;
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
    sessionStorage.removeItem(sessionKey);
    if (secretsKey) sessionStorage.removeItem(secretsKey);
    for (const listener of authClearListeners) {
      try { listener(); } catch {}
    }
  }

  function leaveStaleWorkspace() {
    if (!allowed && !sessionExpired) return;
    clearAuthState();
    document.documentElement.style.visibility = 'hidden';
    location.replace('./');
  }

  async function persistLocalUnsavedChangesQuietly() {
    try { if (typeof saveAll === 'function') saveAll(); } catch {}
    window.__cpWebSuppressAutosaveQueue = (window.__cpWebSuppressAutosaveQueue || 0) + 1;
    try {
      if (typeof writePersistentState === 'function') await writePersistentState(false, true);
    } catch {} finally {
      window.__cpWebSuppressAutosaveQueue = Math.max(0, (window.__cpWebSuppressAutosaveQueue || 0) - 1);
    }
  }

  function makeEl(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
  }

  function showSessionExpiredNotice() {
    if (typeof document === 'undefined' || !document.body) return;
    if (document.getElementById('cpSessionExpiredBanner')) return;
    const banner = makeEl('div', 'cp-session-expired-banner');
    banner.id = 'cpSessionExpiredBanner';
    banner.setAttribute('role', 'alert');
    const msg = makeEl(
      'span',
      'cp-session-expired-text',
      'Your Google session expired. Unsynchronized edits are saved safely in this browser. Sign in again to resume Cloud sync.'
    );
    const btn = makeEl('button', 'cp-session-expired-btn', 'Sign in with Google');
    btn.type = 'button';
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      await persistLocalUnsavedChangesQuietly();
      location.replace('./');
    });
    banner.append(msg, btn);
    const appWin = document.getElementById('appWindow');
    const menuBar = document.getElementById('classicMenuBar');
    if (menuBar && menuBar.parentElement) menuBar.insertAdjacentElement('afterend', banner);
    else if (appWin) appWin.prepend(banner);
    else document.body.prepend(banner);
  }

  async function handleSessionExpired() {
    if (sessionExpired) return;
    sessionExpired = true;
    await persistLocalUnsavedChangesQuietly();
    clearAuthState();
    showSessionExpiredNotice();
  }

  accountChanges?.addEventListener('message', ({ data }) => {
    if (data?.id !== session.user.id || data?.organizerId !== session.user.organizerId) {
      leaveStaleWorkspace();
    }
  });

  if (isCookieMode && typeof window.fetch === 'function') {
    const nativeFetch = window.fetch.bind(window);
    const expectedOrganizer = session.user?.organizerId;

    async function getBridgeToken(forceRefresh = false) {
      if (!allowed) throw new Error('Signed out.');
      if (!forceRefresh && bridgeTokenCache.token && Date.now() < bridgeTokenCache.expMs - 60000) {
        return bridgeTokenCache.token;
      }
      const res = await nativeFetch(`${apiBase}/api/auth/bridge-token`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'X-Expected-Organizer': expectedOrganizer },
        credentials: 'include',
        cache: 'no-store'
      });
      const data = res.ok ? await res.json().catch(() => null) : null;
      if (!res.ok || !data?.token) {
        if (res.status === 401) void handleSessionExpired();
        throw new Error(data?.message || 'Google session bridge token unavailable.');
      }
      const expMs = Number(data.exp) ? Number(data.exp) * 1000 : Date.now() + 14 * 60000;
      bridgeTokenCache = { token: String(data.token), expMs };
      return bridgeTokenCache.token;
    }

    window.fetch = async (input, init) => {
      let parsed;
      try {
        const rawUrl = input instanceof Request ? input.url : String(input);
        parsed = new URL(rawUrl, window.location?.href || apiBase);
      } catch {
        return nativeFetch(input, init);
      }
      const apiOrigin = new URL(apiBase).origin;
      const isTargetApi = parsed.origin === LEGACY_API_ORIGIN || parsed.origin === apiOrigin;
      if (isTargetApi) {
        const headers = new Headers(input instanceof Request ? input.headers : undefined);
        if (init?.headers) {
          new Headers(init.headers).forEach((value, key) => headers.set(key, value));
        }
        let effectivePath = parsed.pathname;
        let effectiveMethod = init?.method || (input instanceof Request ? input.method : undefined);
        const hubManagedMatch = effectivePath.match(/^\/api\/v1\/tournaments\/([^/]+)(\/(?:snapshot|regulations-file|restore))?$/);
        if (hubManagedMatch && (headers.get('X-Organizer-Token') || '').trim() === COOKIE_SENTINEL) {
          const suffix = hubManagedMatch[2] || '';
          effectivePath = `/api/v1/organizer/tournaments/${hubManagedMatch[1]}${suffix}`;
          headers.delete('Authorization');
          headers.delete('X-Organizer-Token');
          if (suffix === '/regulations-file' && String(effectiveMethod || '').toUpperCase() === 'PUT') {
            effectiveMethod = 'POST';
          }
        }
        const authHeader = headers.get('Authorization') || '';
        if (authHeader.trim() === `Bearer ${COOKIE_SENTINEL}`) {
          headers.delete('Authorization');
        }
        if ((headers.get('X-Organizer-Token') || '').trim() === COOKIE_SENTINEL) {
          headers.delete('X-Organizer-Token');
        }
        const rewrittenUrl = `${apiBase}${effectivePath}${parsed.search}`;
        const usesWorkspaceSession = /^\/api\/(?:auth\/(?:link-organizer|logout)(?:\/|$)|v1\/(?:cloud|organizer)(?:\/|$))/.test(effectivePath);
        if (usesWorkspaceSession) {
          if (!allowed) throw new Error('Signed out.');
          headers.set('X-Expected-Organizer', expectedOrganizer);
        }
        const nextInit = {
          ...init,
          ...(effectiveMethod ? { method: effectiveMethod } : {}),
          headers,
          credentials: 'include'
        };
        const res = input instanceof Request && rewrittenUrl !== input.url
          ? await nativeFetch(new Request(rewrittenUrl, input), nextInit)
          : await nativeFetch(input instanceof Request ? input : rewrittenUrl, nextInit);
        if (usesWorkspaceSession && res?.status === 401 && allowed && !sessionExpired) {
          const cloned = typeof res.clone === 'function' ? res.clone() : null;
          void (cloned ? cloned.json().catch(() => null) : Promise.resolve(null)).then(body => {
            if (body?.error === 'organizer_session_changed') leaveStaleWorkspace();
            else void handleSessionExpired();
          });
        }
        return res;
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
          const retry = input instanceof Request ? input.clone() : input;
          const res = await nativeFetch(input, nextInit);
          if (res.status === 401) {
            const refreshed = await getBridgeToken(true);
            headers.set('Authorization', `Bearer ${refreshed}`);
            return nativeFetch(retry, { ...nextInit, headers });
          }
          return res;
        }
      }
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
      const get = () => organizer
        ? expectedToken
        : (secrets.get(key) || (key.startsWith('manage-') && allowed ? COOKIE_SENTINEL : ''));
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

  function buildArbiterCompanionHref() {
    try {
      const current = typeof getCurrentTournament === 'function' ? getCurrentTournament() : null;
      const incoming = typeof location !== 'undefined' ? new URLSearchParams(location.search || '').get('cloudTournamentId') : '';
      const cloudId = String(current?.cloud?.cloudTournamentId || current?.cloud?.internalId || incoming || '').trim();
      if (cloudId) return `${ARBITER_COMPANION_URL}?cloudTournamentId=${encodeURIComponent(cloudId)}`;
    } catch {}
    return ARBITER_COMPANION_URL;
  }

  // Compact standards-compliant QR Model 2 encoder (Byte mode, ECC-L, versions 1-10)
  // so Guest Arbiter links never leave the browser.
  function createQrSvgElement(text) {
    const bytes = new TextEncoder().encode(String(text || ''));
    const CAPACITIES_L = [0, 17, 32, 53, 78, 106, 134, 154, 192, 230, 271];
    const TOTAL_CODEWORDS = [0, 26, 44, 70, 100, 134, 172, 196, 242, 292, 346];
    const ECC_PER_BLOCK = [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18];
    const BLOCK_COUNTS = [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4];
    const ALIGN_POS = [[], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
    const version = CAPACITIES_L.findIndex((cap, v) => v >= 1 && bytes.length <= cap);
    if (version < 1) return null;

    const GF_EXP = new Uint8Array(512);
    const GF_LOG = new Uint8Array(256);
    let x = 1;
    for (let i = 0; i < 255; i++) {
      GF_EXP[i] = x;
      GF_LOG[x] = i;
      x = (x << 1) ^ (x & 0x80 ? 0x11d : 0);
    }
    for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
    const gfMul = (a, b) => (a && b ? GF_EXP[GF_LOG[a] + GF_LOG[b]] : 0);
    const polyMul = (p, q) => {
      const r = new Uint8Array(p.length + q.length - 1);
      for (let i = 0; i < p.length; i++) {
        for (let j = 0; j < q.length; j++) r[i + j] ^= gfMul(p[i], q[j]);
      }
      return r;
    };
    const rsGen = deg => {
      let g = new Uint8Array([1]);
      for (let i = 0; i < deg; i++) g = polyMul(g, new Uint8Array([1, GF_EXP[i]]));
      return g;
    };
    const rsEcc = (data, eccLen) => {
      const gen = rsGen(eccLen);
      const res = new Uint8Array(data.length + eccLen);
      res.set(data);
      for (let i = 0; i < data.length; i++) {
        const factor = res[i];
        if (factor) for (let j = 0; j < gen.length; j++) res[i + j] ^= gfMul(gen[j], factor);
      }
      return res.slice(data.length);
    };

    const totalCw = TOTAL_CODEWORDS[version];
    const eccLen = ECC_PER_BLOCK[version];
    const blocks = BLOCK_COUNTS[version];
    const dataCwTotal = totalCw - eccLen * blocks;
    const bits = [];
    const pushBits = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1); };
    pushBits(0b0100, 4);
    pushBits(bytes.length, version <= 9 ? 8 : 16);
    for (const b of bytes) pushBits(b, 8);
    for (let i = 0; i < 4 && bits.length < dataCwTotal * 8; i++) bits.push(0);
    while (bits.length % 8) bits.push(0);
    const dataBytes = [];
    for (let i = 0; i < bits.length; i += 8) {
      let v = 0;
      for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
      dataBytes.push(v);
    }
    let pad = 0;
    while (dataBytes.length < dataCwTotal) dataBytes.push((pad++ & 1) ? 0x11 : 0xec);

    const shortBlocks = blocks - (dataCwTotal % blocks);
    const shortLen = Math.floor(dataCwTotal / blocks);
    const dataBlocks = [];
    const eccBlocks = [];
    let offset = 0;
    for (let b = 0; b < blocks; b++) {
      const len = shortLen + (b >= shortBlocks ? 1 : 0);
      const slice = new Uint8Array(dataBytes.slice(offset, offset + len));
      offset += len;
      dataBlocks.push(slice);
      eccBlocks.push(rsEcc(slice, eccLen));
    }
    const stream = [];
    const maxDataLen = Math.max(...dataBlocks.map(b => b.length));
    for (let i = 0; i < maxDataLen; i++) for (const b of dataBlocks) if (i < b.length) stream.push(b[i]);
    for (let i = 0; i < eccLen; i++) for (const b of eccBlocks) stream.push(b[i]);

    const size = version * 4 + 17;
    const grid = Array.from({ length: size }, () => new Int8Array(size).fill(-1));
    const fixed = Array.from({ length: size }, () => new Uint8Array(size));
    const setMod = (r, c, dark) => {
      if (r < 0 || c < 0 || r >= size || c >= size) return;
      grid[r][c] = dark ? 1 : 0;
      fixed[r][c] = 1;
    };
    const drawFinder = (r0, c0) => {
      for (let dr = -1; dr <= 7; dr++) {
        for (let dc = -1; dc <= 7; dc++) {
          const rr = r0 + dr, cc = c0 + dc;
          if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
          const inBox = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
          const dark = inBox && (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
          setMod(rr, cc, dark);
        }
      }
    };
    drawFinder(0, 0);
    drawFinder(0, size - 7);
    drawFinder(size - 7, 0);
    for (let i = 8; i < size - 8; i++) {
      setMod(6, i, i % 2 === 0);
      setMod(i, 6, i % 2 === 0);
    }
    setMod(size - 8, 8, true);
    const ap = ALIGN_POS[version];
    for (const r of ap) {
      for (const c of ap) {
        if ((r <= 8 && c <= 8) || (r <= 8 && c >= size - 8) || (r >= size - 8 && c <= 8)) continue;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            setMod(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
          }
        }
      }
    }
    for (let i = 0; i < 9; i++) {
      if (i !== 6) { fixed[8][i] = 1; fixed[i][8] = 1; }
    }
    for (let i = 0; i < 8; i++) {
      fixed[8][size - 1 - i] = 1;
      if (i < 7) fixed[size - 1 - i][8] = 1;
    }
    if (version >= 7) {
      let rem = version;
      for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >> 11) * 0x1f25);
      const vbits = (version << 12) | rem;
      for (let i = 0; i < 18; i++) {
        const bit = (vbits >> i) & 1;
        const a = Math.floor(i / 3), b = i % 3;
        setMod(a, size - 11 + b, bit);
        setMod(size - 11 + b, a, bit);
      }
    }

    let bitIdx = 0;
    const totalBits = stream.length * 8;
    for (let col = size - 1; col > 0; col -= 2) {
      if (col === 6) col--;
      const upward = ((size - 1 - col - (col < 6 ? 1 : 0)) >> 1) % 2 === 0;
      for (let step = 0; step < size; step++) {
        const r = upward ? size - 1 - step : step;
        for (let dc = 0; dc < 2; dc++) {
          const c = col - dc;
          if (fixed[r][c]) continue;
          const bit = bitIdx < totalBits ? ((stream[bitIdx >> 3] >> (7 - (bitIdx & 7))) & 1) : 0;
          bitIdx++;
          grid[r][c] = bit;
        }
      }
    }

    const maskFns = [
      (r, c) => (r + c) % 2 === 0,
      (r) => r % 2 === 0,
      (_, c) => c % 3 === 0,
      (r, c) => (r + c) % 3 === 0,
      (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
      (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
      (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
      (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0
    ];

    const writeFormat = (m, maskId) => {
      const fmtVal = (0b01 << 3) | maskId;
      let d = fmtVal << 10;
      for (let i = 4; i >= 0; i--) if ((d >> (i + 10)) & 1) d ^= 0x537 << i;
      const full = ((fmtVal << 10) | d) ^ 0x5412;
      for (let i = 0; i < 6; i++) {
        m[8][i] = (full >> (14 - i)) & 1;
        m[size - 1 - i][8] = (full >> i) & 1;
      }
      m[8][7] = (full >> 8) & 1;
      m[8][8] = (full >> 7) & 1;
      m[7][8] = (full >> 6) & 1;
      for (let i = 0; i < 6; i++) m[5 - i][8] = (full >> (5 - i)) & 1;
      for (let i = 0; i < 8; i++) m[8][size - 8 + i] = (full >> (7 - i)) & 1;
    };

    const penalty = m => {
      let score = 0;
      for (let r = 0; r < size; r++) {
        let run = 1;
        for (let c = 1; c < size; c++) {
          if (m[r][c] === m[r][c - 1]) run++;
          else { if (run >= 5) score += 3 + (run - 5); run = 1; }
        }
        if (run >= 5) score += 3 + (run - 5);
      }
      for (let c = 0; c < size; c++) {
        let run = 1;
        for (let r = 1; r < size; r++) {
          if (m[r][c] === m[r - 1][c]) run++;
          else { if (run >= 5) score += 3 + (run - 5); run = 1; }
        }
        if (run >= 5) score += 3 + (run - 5);
      }
      for (let r = 0; r < size - 1; r++) {
        for (let c = 0; c < size - 1; c++) {
          const v = m[r][c];
          if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) score += 3;
        }
      }
      return score;
    };

    let bestMask = 0;
    let bestScore = Infinity;
    let bestGrid = null;
    for (let maskId = 0; maskId < 8; maskId++) {
      const m = grid.map((row, r) => row.map((v, c) => (fixed[r][c] ? v : (v ^ (maskFns[maskId](r, c) ? 1 : 0)))));
      writeFormat(m, maskId);
      const s = penalty(m);
      if (s < bestScore) { bestScore = s; bestMask = maskId; bestGrid = m; }
    }

    const ns = 'http://www.w3.org/2000/svg';
    const quiet = 2;
    const viewSize = size + quiet * 2;
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${viewSize} ${viewSize}`);
    svg.setAttribute('width', '168');
    svg.setAttribute('height', '168');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Guest Arbiter QR Code');
    const bg = document.createElementNS(ns, 'rect');
    bg.setAttribute('width', String(viewSize));
    bg.setAttribute('height', String(viewSize));
    bg.setAttribute('fill', '#ffffff');
    svg.appendChild(bg);
    const pathParts = [];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (bestGrid[r][c]) pathParts.push(`M${c + quiet},${r + quiet}h1v1h-1z`);
      }
    }
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', pathParts.join(''));
    path.setAttribute('fill', '#0f172a');
    svg.appendChild(path);
    return svg;
  }

  function formatTimestamp(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    try {
      return new Intl.DateTimeFormat('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false
      }).format(d);
    } catch {
      return d.toISOString();
    }
  }

  function formatBytes(value) {
    const n = Math.max(0, Number(value) || 0);
    if (n >= 1048576) return `${(n / 1048576).toFixed(2)} MiB`;
    if (n >= 1024) return `${(n / 1024).toFixed(1)} KiB`;
    return `${n} B`;
  }

  function openModalOverlay(id, titleText) {
    document.getElementById(id)?.remove();
    const overlay = makeEl('div', 'cp-modal-overlay');
    overlay.id = id;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    const card = makeEl('div', 'cp-modal-card');
    const header = makeEl('div', 'cp-modal-header');
    header.append(makeEl('strong', 'cp-modal-title', titleText));
    const closeBtn = makeEl('button', 'cp-modal-close', '×');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close dialog');
    closeBtn.addEventListener('click', () => overlay.remove());
    header.append(closeBtn);

    const body = makeEl('div', 'cp-modal-body');
    const footer = makeEl('div', 'cp-modal-footer');
    const doneBtn = makeEl('button', 'cp-modal-btn-secondary', 'Close');
    doneBtn.type = 'button';
    doneBtn.addEventListener('click', () => overlay.remove());
    footer.append(doneBtn);

    card.append(header, body, footer);
    overlay.append(card);
    overlay.addEventListener('click', event => {
      if (event.target === overlay) overlay.remove();
    });
    document.body?.append(overlay);
    return { overlay, body, footer, close: () => overlay.remove() };
  }

  async function openHistoryModal(tournamentId, tournamentName) {
    const modal = openModalOverlay('cpCloudHistoryModal', `Version History — ${tournamentName || tournamentId}`);
    const statusLine = makeEl('p', 'cp-modal-status', 'Loading version history…');
    const tableWrap = makeEl('div', 'table-frame cp-modal-table-frame');
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    for (const col of ['Rev.', 'Created', 'Device', 'Reason', 'Size', 'Action']) {
      headRow.append(makeEl('th', '', col));
    }
    thead.append(headRow);
    const tbody = document.createElement('tbody');
    table.append(thead, tbody);
    tableWrap.append(table);
    modal.body.append(statusLine, tableWrap);

    try {
      if (typeof window.cpCloudListRevisions !== 'function') {
        throw new Error('Version history service is not ready.');
      }
      const result = await window.cpCloudListRevisions(tournamentId);
      const rows = Array.isArray(result?.revisions) ? result.revisions : [];
      statusLine.textContent = rows.length
        ? 'Restore is non-destructive: restoring an earlier revision creates a new current revision.'
        : 'No revisions stored yet.';
      tbody.replaceChildren();
      for (const r of rows) {
        const tr = document.createElement('tr');
        const revNum = Number(r.revision) || 0;
        tr.append(makeEl('td', '', `r${revNum}`));
        tr.append(makeEl('td', '', formatTimestamp(r.createdAt)));
        tr.append(makeEl('td', '', String(r.deviceLabel || r.deviceId || '—')));
        tr.append(makeEl('td', '', `${r.reason || 'sync'}${r.sourceRevision ? ` (from r${Number(r.sourceRevision)})` : ''}`));
        tr.append(makeEl('td', '', formatBytes(r.size)));
        const actionTd = document.createElement('td');
        const restoreBtn = makeEl('button', 'cp-user-action-btn', 'Restore');
        restoreBtn.type = 'button';
        restoreBtn.addEventListener('click', async () => {
          restoreBtn.disabled = true;
          try {
            if (typeof window.cpCloudRestoreRevision !== 'function') throw new Error('Restore is unavailable.');
            const runner = window.cpWebRunCloudExclusive
              ? () => window.cpWebRunCloudExclusive(() => window.cpCloudRestoreRevision(tournamentId, revNum))
              : () => window.cpCloudRestoreRevision(tournamentId, revNum);
            const restored = await runner();
            if (restored) modal.close();
          } catch (error) {
            statusLine.textContent = error?.message || 'Could not restore revision.';
          } finally {
            restoreBtn.disabled = false;
          }
        });
        actionTd.append(restoreBtn);
        tr.append(actionTd);
        tbody.append(tr);
      }
    } catch (error) {
      statusLine.textContent = error?.message || 'Could not load version history.';
    }
  }

  async function openArbiterAccessModal() {
    const current = typeof getCurrentTournament === 'function' ? getCurrentTournament() : null;
    const name = current?.name || (typeof data !== 'undefined' ? data?.currentTournament : '') || 'Current Tournament';
    const cloudId = String(current?.cloud?.cloudTournamentId || '').trim();
    const modal = openModalOverlay('cpArbiterAccessModal', `Guest Arbiter Access — ${name}`);
    const statusLine = makeEl('p', 'cp-modal-status', '');
    modal.body.append(statusLine);

    if (!current || !cloudId) {
      statusLine.textContent = 'Synchronize this tournament to Cloud first before creating a Guest Arbiter link.';
      const syncBtn = makeEl('button', 'cp-user-action-btn primary', 'Sync Now');
      syncBtn.type = 'button';
      syncBtn.addEventListener('click', async () => {
        syncBtn.disabled = true;
        statusLine.textContent = 'Synchronizing tournament to Cloud…';
        try {
          if (typeof window.cpCloudSyncUnifiedNow === 'function') await window.cpCloudSyncUnifiedNow();
          modal.close();
          await openArbiterAccessModal();
        } catch (error) {
          statusLine.textContent = error?.message || 'Could not synchronize tournament.';
          syncBtn.disabled = false;
        }
      });
      modal.body.append(syncBtn);
      return;
    }

    const intro = makeEl(
      'p',
      'cp-modal-note',
      'Guest arbiters can view pairings and submit board results from mobile devices without signing in with Google.'
    );
    const controlsRow = makeEl('div', 'cp-arbiter-modal-actions');
    const createBtn = makeEl('button', 'cp-user-action-btn primary', 'Create Guest Link & QR');
    createBtn.type = 'button';
    const revokeBtn = makeEl('button', 'cp-user-action-btn danger', 'Revoke Access');
    revokeBtn.type = 'button';
    controlsRow.append(createBtn, revokeBtn);

    const shareBox = makeEl('div', 'cp-arbiter-share-box');
    shareBox.hidden = true;
    const linkRow = makeEl('div', 'cp-arbiter-link-row');
    const linkInput = document.createElement('input');
    linkInput.type = 'text';
    linkInput.readOnly = true;
    linkInput.id = 'cpArbiterGuestUrlInput';
    linkInput.setAttribute('aria-label', 'Guest Arbiter Access URL');
    const copyBtn = makeEl('button', 'cp-user-action-btn', 'Copy Link');
    copyBtn.type = 'button';
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(linkInput.value);
        statusLine.textContent = 'Guest Arbiter link copied.';
      } catch {
        linkInput.select();
        statusLine.textContent = 'Select and copy the Guest Arbiter link above.';
      }
    });
    linkRow.append(linkInput, copyBtn);
    const qrWrap = makeEl('div', 'cp-arbiter-qr-wrap');
    qrWrap.id = 'cpArbiterQrWrap';
    shareBox.append(linkRow, qrWrap);

    const sessionsWrap = makeEl('div', 'cp-arbiter-sessions-wrap');
    modal.body.append(intro, controlsRow, shareBox, sessionsWrap);

    function renderGrantStatus(info) {
      const grant = info?.grant || null;
      const sessions = Array.isArray(info?.sessions) ? info.sessions : [];
      const pendingCount = Number(info?.pendingResults || 0);
      revokeBtn.disabled = !grant;
      createBtn.textContent = grant ? 'Rotate Guest Link & QR' : 'Create Guest Link & QR';
      if (info?.accessUrl) {
        linkInput.value = info.accessUrl;
        qrWrap.replaceChildren();
        const svg = createQrSvgElement(info.accessUrl);
        if (svg) qrWrap.append(svg);
        shareBox.hidden = false;
      } else if (!grant) {
        shareBox.hidden = true;
      }
      statusLine.textContent = grant
        ? `Guest Arbiter link is active · ${sessions.length} connected device(s) · ${pendingCount} pending result(s).`
        : 'No active Guest Arbiter link for this tournament.';

      sessionsWrap.replaceChildren();
      if (sessions.length) {
        sessionsWrap.append(makeEl('strong', 'cp-arbiter-sessions-title', 'Active Guest Arbiters'));
        const ul = document.createElement('ul');
        ul.className = 'cp-arbiter-sessions-list';
        for (const s of sessions) {
          ul.append(makeEl('li', '', `${s.name || 'Arbiter'} · last seen ${formatTimestamp(s.lastSeenAt || s.createdAt)}`));
        }
        sessionsWrap.append(ul);
      }
    }

    async function loadStatus() {
      statusLine.textContent = 'Checking Guest Arbiter access…';
      const res = await fetch(`${apiBase}/api/v1/cloud/tournaments/${encodeURIComponent(cloudId)}/arbiter-access`, {
        headers: { Accept: 'application/json' },
        credentials: 'include',
        cache: 'no-store'
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.message || 'Could not load Guest Arbiter status.');
      renderGrantStatus(payload);
    }

    createBtn.addEventListener('click', async () => {
      createBtn.disabled = true;
      revokeBtn.disabled = true;
      try {
        const res = await fetch(`${apiBase}/api/v1/cloud/tournaments/${encodeURIComponent(cloudId)}/arbiter-access`, {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          credentials: 'include',
          body: '{}'
        });
        const payload = await res.json().catch(() => null);
        if (!res.ok) throw new Error(payload?.message || 'Could not create Guest Arbiter link.');
        renderGrantStatus(payload);
      } catch (error) {
        statusLine.textContent = error?.message || 'Could not create Guest Arbiter link.';
      } finally {
        createBtn.disabled = false;
      }
    });

    revokeBtn.addEventListener('click', async () => {
      createBtn.disabled = true;
      revokeBtn.disabled = true;
      try {
        const res = await fetch(`${apiBase}/api/v1/cloud/tournaments/${encodeURIComponent(cloudId)}/arbiter-access`, {
          method: 'DELETE',
          headers: { Accept: 'application/json' },
          credentials: 'include'
        });
        const payload = await res.json().catch(() => null);
        if (!res.ok) throw new Error(payload?.message || 'Could not revoke Guest Arbiter access.');
        linkInput.value = '';
        qrWrap.replaceChildren();
        shareBox.hidden = true;
        renderGrantStatus({ grant: null, sessions: [], pendingResults: 0 });
      } catch (error) {
        statusLine.textContent = error?.message || 'Could not revoke Guest Arbiter access.';
      } finally {
        createBtn.disabled = false;
      }
    });

    try {
      await loadStatus();
    } catch (error) {
      statusLine.textContent = error?.message || 'Could not load Guest Arbiter status.';
    }
  }

  window.cpWebOpenArbiterAccessModal = openArbiterAccessModal;
  window.cpWebOpenCloudHistoryModal = openHistoryModal;
  window.cpWebCreateQrSvgElement = createQrSvgElement;

  function renderUserMenu(menu) {
    const user = isCookieMode ? session.user : null;
    const displayName = (user?.name || user?.email || 'Organizer').trim();
    const wrap = makeEl('div', 'cp-user-menu');
    wrap.id = 'cpDesktopWebUserMenu';

    const toggle = makeEl('button', 'cp-user-toggle');
    toggle.type = 'button';
    toggle.id = 'cpDesktopWebUserBtn';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-haspopup', 'true');

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
    header.append(makeEl('div', 'cp-user-panel-eyebrow', 'Google Account'));
    header.append(makeEl('strong', 'cp-user-panel-name', displayName));
    if (user?.email) header.append(makeEl('div', 'cp-user-panel-email', user.email));
    panel.append(header);

    const arbiterBtn = makeEl('a', 'cp-arbiter-link', 'Arbiter Companion');
    arbiterBtn.id = 'cpArbiterCompanionBtn';
    arbiterBtn.href = ARBITER_COMPANION_URL;
    arbiterBtn.target = '_blank';
    arbiterBtn.rel = 'noopener noreferrer';
    arbiterBtn.title = 'Open Arbiter Companion (mobile/quick setup, registration & publishing)';
    arbiterBtn.addEventListener('click', () => {
      arbiterBtn.href = buildArbiterCompanionHref();
      try { (window.cpWebFlushPairingNow || window.cpWebFlushAutosave)?.(); } catch {}
    });

    const quickSection = makeEl('div', 'cp-user-panel-section');
    quickSection.append(makeEl('div', 'cp-user-section-title', 'Cloud & Companion'));

    const syncNowBtn = makeEl('button', 'cp-user-action-btn cp-user-sync-btn', '↻ Sync Now');
    syncNowBtn.type = 'button';
    syncNowBtn.id = 'cpUserMenuSyncBtn';

    const panelArbiterLink = makeEl('a', 'cp-user-panel-link', 'Open Arbiter Companion ↗');
    panelArbiterLink.id = 'cpUserPanelArbiterLink';
    panelArbiterLink.href = ARBITER_COMPANION_URL;
    panelArbiterLink.target = '_blank';
    panelArbiterLink.rel = 'noopener noreferrer';
    panelArbiterLink.addEventListener('click', () => {
      panelArbiterLink.href = buildArbiterCompanionHref();
      panel.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      try { (window.cpWebFlushPairingNow || window.cpWebFlushAutosave)?.(); } catch {}
    });

    const guestArbiterBtn = makeEl('button', 'cp-user-action-btn', 'Guest Arbiter Access (Link & QR)…');
    guestArbiterBtn.type = 'button';
    guestArbiterBtn.id = 'cpUserMenuArbiterAccessBtn';
    guestArbiterBtn.addEventListener('click', () => {
      panel.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      void openArbiterAccessModal();
    });

    quickSection.append(syncNowBtn, panelArbiterLink, guestArbiterBtn);
    panel.append(quickSection);

    const tournamentsSection = makeEl('div', 'cp-user-panel-section');
    const tHeader = makeEl('div', 'cp-user-section-row');
    tHeader.append(makeEl('div', 'cp-user-section-title', 'My Tournaments'));
    const refreshListBtn = makeEl('button', 'cp-user-mini-btn', '↻ Refresh');
    refreshListBtn.type = 'button';
    refreshListBtn.id = 'cpUserTournamentsRefreshBtn';
    tHeader.append(refreshListBtn);
    const list = makeEl('div', 'cp-user-tournaments-list');
    list.id = 'cpUserTournamentsList';
    list.textContent = 'Open menu to load…';
    tournamentsSection.append(tHeader, list);
    panel.append(tournamentsSection);

    const signOutSection = makeEl('div', 'cp-user-panel-footer');
    const signOutBtn = makeEl('button', 'cp-user-signout-btn', 'Sign Out');
    signOutBtn.type = 'button';
    signOutBtn.id = 'cpDesktopWebSignOut';
    signOutBtn.addEventListener('click', async () => {
      signOutBtn.disabled = true;
      try {
        if (typeof saveAll === 'function') saveAll();
        if (typeof fileSaveTournament === 'function' && typeof getCurrentTournament === 'function' && getCurrentTournament()) {
          if (!await fileSaveTournament(true)) throw new Error('Tournament could not be saved.');
        }
        await window.cpWebFlushAutosave?.();
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
        clearAuthState();
        location.replace('./');
      } catch (error) {
        if (typeof setStatus === 'function') setStatus(error.message);
        signOutBtn.disabled = false;
      }
    });
    signOutSection.append(signOutBtn);
    panel.append(signOutSection);

    let loadedTournaments = false;
    async function loadUserTournaments(force = false) {
      if (loadedTournaments && !force) return;
      loadedTournaments = true;
      list.textContent = 'Loading…';
      try {
        const res = await fetch(`${apiBase}/api/v1/cloud/tournaments`, {
          headers: { Accept: 'application/json' },
          credentials: 'include',
          cache: 'no-store'
        });
        if (!res.ok) throw new Error('Could not load tournaments.');
        const dataPayload = await res.json().catch(() => null);
        const rows = Array.isArray(dataPayload?.tournaments) ? dataPayload.tournaments : [];
        list.replaceChildren();
        if (!rows.length) {
          list.textContent = 'No saved online tournaments yet.';
          return;
        }
        const currentCloudId = (() => {
          try { return String((typeof getCurrentTournament === 'function' ? getCurrentTournament()?.cloud?.cloudTournamentId : '') || '').trim(); }
          catch { return ''; }
        })();
        for (const item of rows.slice(0, 20)) {
          const row = makeEl('div', 'cp-user-tournament-row');
          const itemBtn = makeEl('button', 'cp-user-tournament-item', item.name || item.id);
          itemBtn.type = 'button';
          if (currentCloudId && item.id === currentCloudId) {
            itemBtn.classList.add('cp-user-tournament-current');
            const badge = makeEl('span', 'cp-user-current-badge', 'Current');
            itemBtn.append(badge);
          }
          const rev = Number(item.revision);
          if (Number.isFinite(rev) && rev >= 0) {
            itemBtn.append(makeEl('span', 'cp-user-rev-badge', `r${rev}`));
          }
          itemBtn.addEventListener('click', async () => {
            panel.hidden = true;
            toggle.setAttribute('aria-expanded', 'false');
            try {
              if (typeof window.cpCloudOpenRowSafely === 'function' && item.id) {
                await window.cpCloudOpenRowSafely(item.id);
              } else if (typeof window.cpCloudOpenTournament === 'function' && item.id) {
                const openFn = window.cpWebRunCloudExclusive
                  ? () => window.cpWebRunCloudExclusive(() => window.cpCloudOpenTournament(item.id))
                  : () => window.cpCloudOpenTournament(item.id);
                await openFn();
              }
            } catch (error) {
              if (typeof setStatus === 'function') setStatus(error?.message || 'Could not open tournament.');
              if (typeof window.appAlert === 'function') await window.appAlert(error?.message || 'Could not open tournament.', 'My Tournaments', 'warning');
            }
          });
          const histBtn = makeEl('button', 'cp-user-mini-btn', 'History');
          histBtn.type = 'button';
          histBtn.title = 'View Cloud version history';
          histBtn.addEventListener('click', () => {
            panel.hidden = true;
            toggle.setAttribute('aria-expanded', 'false');
            void openHistoryModal(item.id, item.name);
          });
          row.append(itemBtn, histBtn);
          list.append(row);
        }
      } catch {
        list.textContent = 'Could not load tournaments. Try again.';
        loadedTournaments = false;
      }
    }

    async function runManualSync() {
      if (sessionExpired) {
        await persistLocalUnsavedChangesQuietly();
        location.replace('./');
        return;
      }
      const headerSyncBtn = document.getElementById('cpWebHeaderSyncBtn');
      if (headerSyncBtn) { headerSyncBtn.disabled = true; headerSyncBtn.textContent = 'Syncing…'; }
      syncNowBtn.disabled = true;
      try {
        if (typeof window.cpCloudSyncUnifiedNow === 'function') {
          await window.cpCloudSyncUnifiedNow();
        } else if (typeof window.cpCloudDownloadWebResults === 'function') {
          const run = () => window.cpCloudDownloadWebResults();
          await (window.cpWebRunCloudExclusive ? window.cpWebRunCloudExclusive(run) : run());
        } else {
          throw new Error('Cloud sync service is not ready yet.');
        }
        if (loadedTournaments) await loadUserTournaments(true);
      } catch (error) {
        const msg = error?.message || 'Cloud synchronization failed.';
        if (typeof setStatus === 'function') setStatus(msg);
        if (typeof window.appAlert === 'function') await window.appAlert(msg, 'Cloud Sync', 'warning');
      } finally {
        syncNowBtn.disabled = false;
        if (headerSyncBtn) { headerSyncBtn.disabled = false; headerSyncBtn.textContent = '↻ Sync'; }
      }
    }

    window.cpWebRunManualSync = runManualSync;

    syncNowBtn.addEventListener('click', () => {
      panel.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      void runManualSync();
    });

    refreshListBtn.addEventListener('click', () => void loadUserTournaments(true));

    const headerSyncBtn = document.getElementById('cpWebHeaderSyncBtn');
    if (headerSyncBtn && !headerSyncBtn.__cpBound) {
      headerSyncBtn.__cpBound = true;
      headerSyncBtn.addEventListener('click', () => void runManualSync());
    }

    const statusBadge = document.getElementById('cpWebCloudSaveStatus');
    if (statusBadge && !statusBadge.__cpBound) {
      statusBadge.__cpBound = true;
      statusBadge.addEventListener('click', () => {
        const st = statusBadge.dataset?.cpCloudState || '';
        if (st === 'expired') {
          void persistLocalUnsavedChangesQuietly().then(() => location.replace('./'));
        } else if (st === 'conflict') {
          void runManualSync();
        }
      });
    }

    toggle.addEventListener('click', () => {
      const nextOpen = panel.hidden;
      panel.hidden = !nextOpen;
      toggle.setAttribute('aria-expanded', String(nextOpen));
      if (nextOpen) void loadUserTournaments(loadedTournaments);
    });

    document.addEventListener('click', event => {
      if (!panel.hidden && !wrap.contains(event.target)) {
        panel.hidden = true;
        toggle.setAttribute('aria-expanded', 'false');
      }
    });

    wrap.append(arbiterBtn, toggle, panel);
    menu.append(wrap);
  }

  function autoOpenRequestedCloudTournament() {
    let targetId = '';
    try {
      const raw = new URLSearchParams(location.search || '').get('cloudTournamentId');
      if (/^[A-Za-z0-9._:-]{1,200}$/.test(String(raw || '').trim())) targetId = String(raw).trim();
    } catch {}
    if (!targetId) return;

    let attempts = 0;
    const tryOpen = () => {
      if (!allowed || sessionExpired) return;
      const openFn = window.cpCloudOpenRowSafely || window.cpCloudOpenTournament;
      if (typeof openFn === 'function') {
        try {
          const cur = typeof getCurrentTournament === 'function' ? getCurrentTournament() : null;
          if (cur?.cloud?.cloudTournamentId === targetId) return;
        } catch {}
        const invoke = () => (window.cpCloudOpenRowSafely
          ? window.cpCloudOpenRowSafely(targetId)
          : (window.cpWebRunCloudExclusive ? window.cpWebRunCloudExclusive(() => window.cpCloudOpenTournament(targetId)) : window.cpCloudOpenTournament(targetId)));
        void invoke().catch(error => console.warn('Deep-link Cloud open:', error));
        return;
      }
      if (++attempts < 50) setTimeout(tryOpen, 100);
    };
    setTimeout(tryOpen, 150);
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (!allowed) return;
    if (isCookieMode && typeof window.fetch === 'function') {
      const verifyAccount = () => {
        if (!allowed || sessionExpired) return;
        return window.fetch(`${apiBase}/api/auth/me?optional=1`, {
          headers: { Accept: 'application/json' },
          credentials: 'include',
          cache: 'no-store',
          signal: AbortSignal.timeout(5000)
        }).then(async res => {
          const data = res.ok ? await res.json().catch(() => null) : null;
          const user = data?.user;
          if (data?.ok === true && data.authenticated === true && user) {
            if (user.id !== session.user.id || user.organizerId !== session.user.organizerId) {
              leaveStaleWorkspace();
            }
          } else if (res.status === 401 || (data?.ok === true && data.authenticated === false)) {
            await handleSessionExpired();
          }
        }).catch(() => {});
      };
      void verifyAccount();
      window.addEventListener('focus', verifyAccount);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void verifyAccount();
      });
    }
    const menu = document.querySelector('#classicMenuBar');
    if (menu) renderUserMenu(menu);
    autoOpenRequestedCloudTournament();
  }, { once: true });
})();
