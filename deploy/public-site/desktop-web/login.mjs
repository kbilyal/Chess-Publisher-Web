const DEFAULT_API_BASE = 'https://api.chess-publisher.org';
const apiBase = (() => {
  const configured =
    (typeof window !== 'undefined' && window.CP_API_BASE) ||
    document?.querySelector?.('meta[name="cp-api-base"]')?.getAttribute?.('content') ||
    DEFAULT_API_BASE;
  return String(configured).trim().replace(/\/+$/, '');
})();

const api = `${apiBase}/api/v1/cloud/workspace`;
const form = document.querySelector('form');
const input = document.querySelector('#organizer-token');
const button = form?.querySelector?.('button');
const status = document.querySelector('#login-status');
const googleSection = document.querySelector('#google-auth-section');
const googleBtnContainer = document.querySelector('#google-signin-button');
const signedInPanel = document.querySelector('#signed-in-panel');
const signedInAvatar = document.querySelector('#signed-in-avatar');
const signedInName = document.querySelector('#signed-in-name');
const signedInEmail = document.querySelector('#signed-in-email');
const openWorkspaceBtn = document.querySelector('#open-workspace-btn');
const accountLogoutBtn = document.querySelector('#account-logout-btn');
const loginTournamentsList = document.querySelector('#login-tournaments-list');

async function sha256Hex(value) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value)));
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function persistCookieSession(user) {
  const identity = user?.organizerId || user?.id;
  if (!identity || typeof user !== 'object' || Array.isArray(user)) {
    throw new Error('Invalid user profile');
  }
  const scope = await sha256Hex(identity);
  sessionStorage.setItem('cp.desktop-web.session', JSON.stringify({
    authMode: 'cookie',
    scope,
    user: {
      id: String(user.id || ''),
      email: user.email ? String(user.email) : '',
      name: user.name ? String(user.name) : '',
      avatarUrl: user.avatarUrl ? String(user.avatarUrl) : '',
      organizerId: String(user.organizerId || '')
    }
  }));
}

function workspaceTargetUrl() {
  try {
    const raw = new URLSearchParams(typeof location !== 'undefined' ? (location.search || '') : '').get('cloudTournamentId');
    const safe = String(raw || '').trim();
    if (/^[A-Za-z0-9:_-]{1,160}$/.test(safe)) {
      return `./workspace.html?cloudTournamentId=${encodeURIComponent(safe)}`;
    }
  } catch {}
  return './workspace.html';
}

async function handleGoogleCredential(response) {
  const credential = String(response?.credential || '').trim();
  if (!credential) {
    if (status) status.textContent = 'Google returned an invalid sign-in response.';
    return;
  }
  if (status) status.textContent = 'Signing in with Google…';
  try {
    const res = await fetch(`${apiBase}/api/auth/google`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      credentials: 'include',
      redirect: 'error',
      cache: 'no-store',
      body: JSON.stringify({ credential }),
      signal: AbortSignal.timeout(10000)
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || data?.ok !== true || !data?.user || typeof data.user !== 'object' || Array.isArray(data.user) || !data.user.id) {
      throw new Error(data?.message || 'Google auth failed');
    }
    await persistCookieSession(data.user);
    location.assign(workspaceTargetUrl());
  } catch {
    if (status) status.textContent = 'Google Sign-In is temporarily unavailable. Please try again.';
  }
}

async function loadMyTournamentsOnLogin() {
  if (!loginTournamentsList) return;
  loginTournamentsList.textContent = 'Loading…';
  try {
    const res = await fetch(`${apiBase}/api/v1/cloud/tournaments`, {
      headers: { Accept: 'application/json' },
      credentials: 'include',
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(8000)
    });
    const data = res.ok ? await res.json().catch(() => null) : null;
    const rows = Array.isArray(data?.tournaments) ? data.tournaments : [];
    loginTournamentsList.replaceChildren();
    if (!rows.length) {
      const li = document.createElement('li');
      li.textContent = 'You have no saved online tournaments.';
      loginTournamentsList.append(li);
      return;
    }
    for (const item of rows.slice(0, 12)) {
      const li = document.createElement('li');
      const link = document.createElement('a');
      link.href = item?.id ? `./workspace.html?cloudTournamentId=${encodeURIComponent(item.id)}` : './workspace.html';
      link.textContent = item?.name || item?.id || 'Tournament';
      li.append(link);
      loginTournamentsList.append(li);
    }
  } catch {
    loginTournamentsList.textContent = 'Your tournaments could not be loaded. Please try again.';
  }
}

function showSignedInPanel(user) {
  if (!signedInPanel) return;
  if (googleSection) googleSection.hidden = true;
  signedInPanel.hidden = false;
  if (signedInName) signedInName.textContent = user.name || user.email || 'Organizer';
  if (signedInEmail) signedInEmail.textContent = user.email || '';
  if (signedInAvatar) {
    if (typeof user.avatarUrl === 'string' && user.avatarUrl.startsWith('https://')) {
      signedInAvatar.src = user.avatarUrl;
      signedInAvatar.hidden = false;
    } else {
      signedInAvatar.hidden = true;
    }
  }
  openWorkspaceBtn?.addEventListener('click', () => location.assign('./workspace.html'), { once: true });
  accountLogoutBtn?.addEventListener('click', async () => {
    accountLogoutBtn.disabled = true;
    try {
      await fetch(`${apiBase}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        redirect: 'error',
        cache: 'no-store'
      });
    } catch {}
    sessionStorage.removeItem('cp.desktop-web.session');
    try { window.google?.accounts?.id?.disableAutoSelect?.(); } catch {}
    location.replace('./');
  }, { once: true });
  loadMyTournamentsOnLogin();
}

async function resolveGoogleClientId() {
  const inlineId =
    (typeof window !== 'undefined' && window.CP_GOOGLE_CLIENT_ID) ||
    document?.querySelector?.('meta[name="google-client-id"]')?.getAttribute?.('content') ||
    '';
  if (String(inlineId).trim()) return String(inlineId).trim();
  try {
    const res = await fetch(`${apiBase}/api/auth/config`, {
      headers: { Accept: 'application/json' },
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(5000)
    });
    const data = res.ok ? await res.json().catch(() => null) : null;
    return String(data?.googleClientId || '').trim();
  } catch {
    return '';
  }
}

async function initGoogleSignIn() {
  if (!googleBtnContainer) return;

  const isAccountView = typeof location !== 'undefined' && new URLSearchParams(location.search || '').get('account') === '1';
  try {
    const meRes = await fetch(`${apiBase}/api/auth/me?optional=1`, {
      headers: { Accept: 'application/json' },
      credentials: 'include',
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(5000)
    });
    if (meRes.ok) {
      const me = await meRes.json().catch(() => null);
      if (me?.ok === true && me?.authenticated === true && me?.user?.id) {
        await persistCookieSession(me.user);
        if (isAccountView) {
          showSignedInPanel(me.user);
          return;
        }
        location.assign(workspaceTargetUrl());
        return;
      }
    }
  } catch {}

  const clientId = await resolveGoogleClientId();
  if (!clientId) {
    if (status) status.textContent = 'Google Sign-In is unavailable. You can sign in with an Organizer Token below.';
    return;
  }

  let attempts = 0;
  const mount = () => {
    const gsi = window.google?.accounts?.id;
    if (!gsi) {
      if (++attempts < 40) setTimeout(mount, 150);
      return;
    }
    gsi.initialize({
      client_id: clientId,
      callback: handleGoogleCredential,
      auto_select: false
    });
    gsi.renderButton(googleBtnContainer, {
      theme: 'outline',
      size: 'large',
      text: 'signin_with',
      shape: 'rectangular',
      locale: 'en'
    });
  };
  mount();
}

if (typeof window !== 'undefined' && googleBtnContainer) {
  initGoogleSignIn();
}

form?.addEventListener('submit', async event => {
  event.preventDefault();
  if (button.disabled) return;
  const token = input.value.trim();
  if (!/^[!-~]{1,2048}$/.test(token)) {
    status.textContent = 'Enter a valid Organizer Token.';
    return;
  }

  button.disabled = true;
  status.textContent = 'Checking your access…';
  try {
    const response = await fetch(api, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      credentials: 'omit', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(8000)
    });
    if ([401, 403].includes(response.status)) {
      status.textContent = 'The Organizer Token is invalid or access was revoked.';
      return;
    }
    const data = response.ok ? await response.json() : null;
    const organizer = data?.organizer;
    if (data?.ok === false || !organizer || typeof organizer !== 'object' ||
        Array.isArray(organizer) || Object.keys(organizer).length === 0) {
      throw new Error('Workspace unavailable');
    }
    const identity = organizer.id || organizer.organizerId || token;
    const scope = await sha256Hex(identity);
    sessionStorage.setItem('cp.desktop-web.session', JSON.stringify({ token, scope }));
    input.value = '';
    location.assign('./workspace.html');
  } catch {
    status.textContent = 'Sign-in is temporarily unavailable. Please try again.';
  } finally {
    button.disabled = false;
  }
});
