(() => {
  'use strict';

  const API_BASE = 'https://api.chess-publisher.org';
  const WEB_PORTAL_URL = '/app/';
  const ARBITER_COMPANION_URL = 'https://web.chess-publisher.org/';
  const GIS_SRC = 'https://accounts.google.com/gsi/client';

  let currentUser = null;
  let cachedClientId = '';
  let gisLoadPromise = null;
  let tournamentsLoaded = false;

  function makeEl(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
  }

  function loadGisScript() {
    if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);
    if (gisLoadPromise) return gisLoadPromise;
    gisLoadPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${GIS_SRC}"]`);
      if (existing) {
        let attempts = 0;
        const poll = () => {
          if (window.google?.accounts?.id) return resolve(window.google.accounts.id);
          if (++attempts > 40) return reject(new Error('GIS timeout'));
          window.setTimeout(poll, 150);
        };
        poll();
        return;
      }
      const script = document.createElement('script');
      script.src = GIS_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => {
        let attempts = 0;
        const poll = () => {
          if (window.google?.accounts?.id) return resolve(window.google.accounts.id);
          if (++attempts > 40) return reject(new Error('GIS unavailable'));
          window.setTimeout(poll, 100);
        };
        poll();
      };
      script.onerror = () => reject(new Error('GIS failed to load'));
      document.head.append(script);
    });
    return gisLoadPromise;
  }

  async function fetchAuthState() {
    try {
      const res = await fetch(`${API_BASE}/api/auth/me?optional=1`, {
        headers: { Accept: 'application/json' },
        credentials: 'include',
        cache: 'no-store'
      });
      if (!res.ok) return null;
      const data = await res.json().catch(() => null);
      if (data?.ok === true && data?.authenticated === true && data?.user?.id) {
        return data.user;
      }
      return null;
    } catch {
      return null;
    }
  }

  async function resolveClientId() {
    if (cachedClientId) return cachedClientId;
    try {
      const res = await fetch(`${API_BASE}/api/auth/config`, {
        headers: { Accept: 'application/json' },
        credentials: 'omit',
        cache: 'no-store'
      });
      const data = res.ok ? await res.json().catch(() => null) : null;
      cachedClientId = String(data?.googleClientId || '').trim();
      return cachedClientId;
    } catch {
      return '';
    }
  }

  function updatePortalSignInBanner(user) {
    const banner = document.querySelector('.portal-sign-in');
    if (!banner) return;
    if (user) {
      const label = user.name || user.email || 'Organizer';
      banner.textContent = `Signed in as ${label} · Web Portal & Arbiter Companion ready`;
    } else {
      banner.textContent = 'Now with Google Sign-In';
    }
  }

  function renderWidget(slot) {
    slot.replaceChildren();
    const wrap = makeEl('div', 'cp-site-auth');
    wrap.id = 'cpSiteAuthWidget';

    const btn = makeEl('button', 'cp-site-auth-btn');
    btn.type = 'button';
    btn.setAttribute('aria-expanded', 'false');

    const popover = makeEl('div', 'cp-site-auth-popover');
    popover.hidden = true;

    const closePopover = () => {
      popover.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
    };

    if (currentUser) {
      const displayName = String(currentUser.name || currentUser.email || 'Account').trim();
      if (typeof currentUser.avatarUrl === 'string' && currentUser.avatarUrl.startsWith('https://')) {
        const img = makeEl('img', 'cp-site-auth-avatar');
        img.src = currentUser.avatarUrl;
        img.alt = '';
        img.referrerPolicy = 'no-referrer';
        btn.append(img);
      } else {
        btn.append(makeEl('span', 'cp-site-auth-initials', displayName.slice(0, 2).toUpperCase()));
      }
      btn.append(makeEl('span', 'cp-site-auth-name', displayName));

      const head = makeEl('div', 'cp-site-auth-pop-head');
      head.append(makeEl('strong', null, displayName));
      if (currentUser.email) head.append(makeEl('span', null, currentUser.email));
      popover.append(head);

      const links = makeEl('div', 'cp-site-auth-links');
      const portalLink = makeEl('a', 'cp-site-auth-link primary', 'Web Portal');
      portalLink.href = WEB_PORTAL_URL;
      const arbiterLink = makeEl('a', 'cp-site-auth-link', 'Arbiter Companion');
      arbiterLink.href = ARBITER_COMPANION_URL;
      links.append(portalLink, arbiterLink);
      popover.append(links);

      popover.append(makeEl('div', 'cp-site-auth-section-title', 'My Cloud Tournaments'));
      const tList = makeEl('div', 'cp-site-auth-tournaments', 'Opening…');
      popover.append(tList);

      const signOutBtn = makeEl('button', 'cp-site-auth-signout', 'Sign Out');
      signOutBtn.type = 'button';
      signOutBtn.addEventListener('click', async () => {
        signOutBtn.disabled = true;
        try {
          await fetch(`${API_BASE}/api/auth/logout`, {
            method: 'POST',
            credentials: 'include',
            cache: 'no-store'
          });
        } catch {}
        try { sessionStorage.removeItem('cp.desktop-web.session'); } catch {}
        try { window.google?.accounts?.id?.disableAutoSelect?.(); } catch {}
        currentUser = null;
        tournamentsLoaded = false;
        updatePortalSignInBanner(null);
        renderWidget(slot);
      });
      popover.append(signOutBtn);

      btn.addEventListener('click', async () => {
        const nextOpen = popover.hidden;
        popover.hidden = !nextOpen;
        btn.setAttribute('aria-expanded', String(nextOpen));
        if (nextOpen && !tournamentsLoaded) {
          tournamentsLoaded = true;
          tList.textContent = 'Loading…';
          try {
            const res = await fetch(`${API_BASE}/api/v1/cloud/tournaments`, {
              headers: { Accept: 'application/json' },
              credentials: 'include',
              cache: 'no-store'
            });
            const data = res.ok ? await res.json().catch(() => null) : null;
            const rows = Array.isArray(data?.tournaments) ? data.tournaments : [];
            tList.replaceChildren();
            if (!rows.length) {
              tList.append(makeEl('div', 'cp-site-auth-status', 'No Cloud tournaments yet.'));
              return;
            }
            for (const item of rows.slice(0, 6)) {
              const row = makeEl('div', 'cp-site-auth-trow');
              row.append(makeEl('span', null, item?.name || item?.id || 'Tournament'));
              const actions = makeEl('div', 'cp-site-auth-trow-actions');
              const openPortal = makeEl('a', null, 'Portal');
              openPortal.href = item?.id ? `/app/workspace.html?cloudTournamentId=${encodeURIComponent(item.id)}` : WEB_PORTAL_URL;
              const openArbiter = makeEl('a', null, 'Arbiter');
              openArbiter.href = item?.id ? `${ARBITER_COMPANION_URL}?cloudTournamentId=${encodeURIComponent(item.id)}` : ARBITER_COMPANION_URL;
              actions.append(openPortal, openArbiter);
              row.append(actions);
              tList.append(row);
            }
          } catch {
            tournamentsLoaded = false;
            tList.textContent = 'Could not load tournaments.';
          }
        }
      });
    } else {
      btn.append(makeEl('span', 'cp-site-auth-initials', 'G'));
      btn.append(makeEl('span', null, 'Sign in with Google'));

      const gsiWrap = makeEl('div', 'cp-site-auth-gsi-wrap');
      gsiWrap.append(makeEl('p', null, 'Sign in once with Google to access your private Cloud workspace in Web Portal and Arbiter Companion.'));
      const gsiMount = makeEl('div', null);
      const statusEl = makeEl('div', 'cp-site-auth-status');
      gsiWrap.append(gsiMount, statusEl);
      popover.append(gsiWrap);

      let gsiMounted = false;
      btn.addEventListener('click', async () => {
        const nextOpen = popover.hidden;
        popover.hidden = !nextOpen;
        btn.setAttribute('aria-expanded', String(nextOpen));
        if (!nextOpen || gsiMounted) return;
        statusEl.textContent = 'Loading Google Sign-In…';
        try {
          const [clientId, gsi] = await Promise.all([resolveClientId(), loadGisScript()]);
          if (!clientId) {
            statusEl.textContent = 'Google Sign-In is unavailable right now.';
            return;
          }
          gsi.initialize({
            client_id: clientId,
            callback: async response => {
              const credential = String(response?.credential || '').trim();
              if (!credential) return;
              statusEl.textContent = 'Signing in…';
              try {
                const res = await fetch(`${API_BASE}/api/auth/google`, {
                  method: 'POST',
                  headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
                  credentials: 'include',
                  cache: 'no-store',
                  body: JSON.stringify({ credential })
                });
                const data = await res.json().catch(() => null);
                if (!res.ok || data?.ok !== true || !data?.user?.id) {
                  throw new Error(data?.message || 'Sign-in failed');
                }
                currentUser = data.user;
                tournamentsLoaded = false;
                updatePortalSignInBanner(currentUser);
                renderWidget(slot);
              } catch {
                statusEl.textContent = 'Google Sign-In failed. Please try again.';
              }
            },
            auto_select: false
          });
          gsiMount.replaceChildren();
          gsi.renderButton(gsiMount, {
            theme: 'outline',
            size: 'large',
            text: 'signin_with',
            shape: 'rectangular',
            locale: 'en'
          });
          statusEl.textContent = '';
          gsiMounted = true;
        } catch {
          statusEl.textContent = 'Could not load Google Sign-In.';
        }
      });
    }

    document.addEventListener('click', event => {
      if (!popover.hidden && !wrap.contains(event.target)) {
        closePopover();
      }
    });

    wrap.append(btn, popover);
    slot.append(wrap);
  }

  async function init() {
    const navShell = document.querySelector('.site-header .nav-shell');
    if (!navShell) return;

    let slot = document.querySelector('#cpSiteAuthSlot');
    if (!slot) {
      slot = makeEl('div', 'cp-site-auth-slot');
      slot.id = 'cpSiteAuthSlot';
      const toggle = navShell.querySelector('.nav-toggle');
      if (toggle) navShell.insertBefore(slot, toggle);
      else navShell.append(slot);
    }

    currentUser = await fetchAuthState();
    updatePortalSignInBanner(currentUser);
    renderWidget(slot);

    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState !== 'visible') return;
      const latest = await fetchAuthState();
      const prevId = currentUser?.id || '';
      const nextId = latest?.id || '';
      if (prevId !== nextId) {
        currentUser = latest;
        tournamentsLoaded = false;
        updatePortalSignInBanner(currentUser);
        renderWidget(slot);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => void init(), { once: true });
  } else {
    void init();
  }
})();
