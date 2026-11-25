(() => {
  'use strict';

  const API_BASE = 'https://api.chess-publisher.org';
  const WEB_PORTAL_URL = '/app/';
  const accountChanges = typeof BroadcastChannel === 'function'
    ? new BroadcastChannel('cp.desktop-web.google-session') : null;

  let currentUser = null;
  let tournamentsLoaded = false;

  function makeEl(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
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

  function updatePortalSignInBanner(user) {
    const banner = document.querySelector('.portal-sign-in');
    if (!banner) return;
    if (user) {
      const label = user.name || user.email || 'Organizer';
      banner.textContent = `Signed in as ${label} · ChessPublisher Web ready`;
    } else {
      banner.textContent = 'Now with Google Sign-In';
    }
  }

  function renderWidget(slot) {
    slot.replaceChildren();
    if (!currentUser) {
      const signIn = makeEl('a', 'cp-site-auth-btn', 'Sign in');
      signIn.href = WEB_PORTAL_URL;
      slot.append(signIn);
      return;
    }

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

    const organizerId = currentUser.organizerId;
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
    const portalLink = makeEl('a', 'cp-site-auth-link primary', 'ChessPublisher Web');
    portalLink.href = WEB_PORTAL_URL;
    links.append(portalLink);
    popover.append(links);

    popover.append(makeEl('div', 'cp-site-auth-section-title', 'My Cloud Tournaments'));
    const tList = makeEl('div', 'cp-site-auth-tournaments', 'Opening…');
    popover.append(tList);

    const signOutBtn = makeEl('button', 'cp-site-auth-signout', 'Sign Out');
    signOutBtn.type = 'button';
    const signOutStatus = makeEl('div', 'cp-site-auth-status');
    signOutStatus.setAttribute('role', 'status');
    signOutBtn.addEventListener('click', async () => {
      signOutBtn.disabled = true;
      signOutStatus.textContent = '';
      try {
        const res = await fetch(`${API_BASE}/api/auth/logout`, {
          method: 'POST',
          headers: { 'X-Expected-Organizer': organizerId },
          credentials: 'include',
          redirect: 'error',
          cache: 'no-store',
          signal: AbortSignal.timeout(8000)
        });
        if (!res.ok || (await res.json())?.ok !== true) throw new Error('Sign-out was not confirmed.');
      } catch {
        signOutStatus.textContent = 'Could not sign out. Please try again.';
        signOutBtn.disabled = false;
        return;
      }
      try { sessionStorage.removeItem('cp.desktop-web.session'); } catch {}
      accountChanges?.postMessage(null);
      currentUser = null;
      tournamentsLoaded = false;
      updatePortalSignInBanner(null);
      renderWidget(slot);
    });
    popover.append(signOutBtn, signOutStatus);

    btn.addEventListener('click', async () => {
      const nextOpen = popover.hidden;
      popover.hidden = !nextOpen;
      btn.setAttribute('aria-expanded', String(nextOpen));
      if (nextOpen && !tournamentsLoaded) {
        tournamentsLoaded = true;
        tList.textContent = 'Loading…';
        try {
          const res = await fetch(`${API_BASE}/api/v1/cloud/tournaments`, {
            headers: { Accept: 'application/json', 'X-Expected-Organizer': organizerId },
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
            openPortal.href = item?.id ? `/app/?cloudTournamentId=${encodeURIComponent(item.id)}` : WEB_PORTAL_URL;
            actions.append(openPortal);
            row.append(actions);
            tList.append(row);
          }
        } catch {
          tournamentsLoaded = false;
          tList.textContent = 'Could not load tournaments.';
        }
      }
    });

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
