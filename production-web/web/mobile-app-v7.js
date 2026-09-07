/* Chess-Publisher Web · Mobile App v7 · September 2026
 * Mobile-only navigation facade. It never replaces showTab or tournament logic;
 * every navigation action delegates to the existing production tab/button.
 */
(() => {
  'use strict';

  const root = document.documentElement;
  root.dataset.cpMobileApp = '7';

  const MOBILE_QUERY = '(max-width: 768px)';
  const media = window.matchMedia(MOBILE_QUERY);
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const clean = value => value == null ? '' : String(value).trim();

  const PRIMARY = [
    { key: 'main', label: 'Setup', icon: '⌂', tabIds: ['tabMain'], legacyIds: ['main'] },
    { key: 'registration', label: 'Players', icon: '♙', tabIds: ['tabRegistration'], legacyIds: ['registration'] },
    { key: 'pairings', label: 'Pairings', icon: '▦', tabIds: ['tabPairings'], legacyIds: ['pairings'] },
    { key: 'standings', label: 'Standings', icon: '♕', tabIds: ['tabStandings'], legacyIds: ['standings'] }
  ];

  const MORE = [
    { key: 'schedule', label: 'Schedule', description: 'Rounds, dates and playing times', icon: '◷', tabIds: ['tabSchedule'], legacyIds: ['schedule'] },
    { key: 'chessresults', label: 'Chess-Results', description: 'Publish and manage tournament results', icon: '◎', tabIds: ['tabChessResults'], legacyIds: ['chessresults'] },
    { key: 'cloud', label: 'Online & Cloud', description: 'Continue and sync the tournament online', icon: '☁', tabIds: ['tabCloudWorkspace', 'tabHub'], legacyIds: ['cloudWorkspace', 'hub'] },
    { key: 'export', label: 'Export & Print', description: 'Reports, printouts and tournament files', icon: '▤', tabIds: ['tabExport'], legacyIds: ['exportPage'] }
  ];

  const ALL = [...PRIMARY, ...MORE];
  let toastTimer = 0;

  function resolveTab(item) {
    for (const id of item.tabIds || []) {
      const node = document.getElementById(id);
      if (node) return node;
    }
    return null;
  }

  function isDisabled(tab) {
    if (!tab) return true;
    return tab.disabled === true ||
      tab.classList.contains('disabled') ||
      tab.getAttribute('aria-disabled') === 'true';
  }

  function isActive(tab) {
    return Boolean(tab && (tab.classList.contains('active') || tab.getAttribute('aria-selected') === 'true'));
  }

  function isolateLegacyTabsForPhone() {
    const tabs = $('#appWindow > .tabs');
    if (!tabs) return;
    const mobileProperties = {
      position: 'fixed',
      left: '-10000px',
      top: '0',
      right: 'auto',
      bottom: 'auto',
      width: '1px',
      'min-width': '1px',
      'max-width': '1px',
      height: '1px',
      'min-height': '1px',
      'max-height': '1px',
      padding: '0',
      margin: '0',
      overflow: 'hidden',
      opacity: '0',
      'pointer-events': 'none',
      'box-shadow': 'none',
      border: '0'
    };
    if (media.matches) {
      for (const [property, value] of Object.entries(mobileProperties)) {
        tabs.style.setProperty(property, value, 'important');
      }
      tabs.dataset.cpMobileLegacyIsolated = '1';
      return;
    }
    if (tabs.dataset.cpMobileLegacyIsolated !== '1') return;
    for (const property of Object.keys(mobileProperties)) tabs.style.removeProperty(property);
    delete tabs.dataset.cpMobileLegacyIsolated;
  }

  function currentItem() {
    return ALL.find(item => isActive(resolveTab(item))) || PRIMARY[0];
  }

  function friendlyDisabledMessage(item) {
    if (item.key === 'pairings') return 'Add players first. Pairings will unlock automatically.';
    if (item.key === 'standings') return 'Standings become available after the tournament has results.';
    return `${item.label} is not available at this stage of the tournament.`;
  }

  function toast(message) {
    const node = $('#cpMobileToast');
    if (!node) return;
    window.clearTimeout(toastTimer);
    node.textContent = message;
    node.classList.add('is-visible');
    toastTimer = window.setTimeout(() => node.classList.toggle('is-visible', false), 2300);
  }

  function closeMore() {
    $('#cpMobileMoreBackdrop')?.classList.toggle('is-open', false);
    const sheet = $('#cpMobileMoreSheet');
    sheet?.classList.toggle('is-open', false);
    sheet?.setAttribute('aria-hidden', 'true');
    $('#cpMobileMoreButton')?.setAttribute('aria-expanded', 'false');
  }

  function openMore() {
    if (!media.matches) return;
    syncState();
    $('#cpMobileMoreBackdrop')?.classList.add('is-open');
    const sheet = $('#cpMobileMoreSheet');
    sheet?.classList.add('is-open');
    sheet?.setAttribute('aria-hidden', 'false');
    $('#cpMobileMoreButton')?.setAttribute('aria-expanded', 'true');
  }

  function activate(item) {
    if (!media.matches || !item) return false;
    const tab = resolveTab(item);
    if (!tab) {
      toast(`${item.label} is not available in this Web workspace.`);
      return false;
    }
    if (isDisabled(tab)) {
      toast(friendlyDisabledMessage(item));
      return false;
    }

    closeMore();

    let activated = false;
    if (typeof window.showTab === 'function') {
      for (const legacyId of item.legacyIds || []) {
        try {
          window.showTab(legacyId, tab);
          if (isActive(tab)) {
            activated = true;
            break;
          }
        } catch { /* use the untouched button handler fallback */ }
      }
    }

    if (!activated) {
      try {
        tab.click();
        activated = isActive(tab);
      } catch { /* keep current page and show feedback below */ }
    }

    window.setTimeout(() => {
      isolateLegacyTabsForPhone();
      syncState();
      const nowActive = isActive(tab);
      if (!nowActive && !isDisabled(tab)) {
        toast(`${item.label} could not be opened. The current tournament state may not allow it yet.`);
      }
      const content = $('#appWindow > .content');
      if (nowActive && content) content.scrollTop = 0;
    }, 40);

    return activated;
  }

  function navButton(item) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cp-mobile-nav-item';
    button.dataset.cpMobileKey = item.key;
    button.setAttribute('aria-label', item.label);
    button.innerHTML = `<span class="cp-mobile-nav-icon" aria-hidden="true">${item.icon}</span><span class="cp-mobile-nav-label">${item.label}</span>`;
    button.addEventListener('click', () => activate(item));
    return button;
  }

  function moreItem(item) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cp-mobile-more-item';
    button.dataset.cpMobileMoreKey = item.key;
    button.innerHTML = `
      <span class="cp-mobile-more-icon" aria-hidden="true">${item.icon}</span>
      <span class="cp-mobile-more-copy"><strong>${item.label}</strong><small>${item.description}</small></span>
      <span class="cp-mobile-more-arrow" aria-hidden="true">›</span>`;
    button.addEventListener('click', () => activate(item));
    return button;
  }

  function ensureShell() {
    if ($('#cpMobileAppNav')) return;

    const nav = document.createElement('nav');
    nav.id = 'cpMobileAppNav';
    nav.className = 'cp-mobile-app-nav';
    nav.setAttribute('aria-label', 'Mobile tournament navigation');
    PRIMARY.forEach(item => nav.appendChild(navButton(item)));

    const more = document.createElement('button');
    more.id = 'cpMobileMoreButton';
    more.type = 'button';
    more.className = 'cp-mobile-nav-item';
    more.dataset.cpMobileKey = 'more';
    more.setAttribute('aria-label', 'More sections');
    more.setAttribute('aria-controls', 'cpMobileMoreSheet');
    more.setAttribute('aria-expanded', 'false');
    more.innerHTML = '<span class="cp-mobile-nav-icon" aria-hidden="true">☰</span><span class="cp-mobile-nav-label">More</span>';
    more.addEventListener('click', openMore);
    nav.appendChild(more);

    const backdrop = document.createElement('button');
    backdrop.id = 'cpMobileMoreBackdrop';
    backdrop.type = 'button';
    backdrop.className = 'cp-mobile-more-backdrop';
    backdrop.setAttribute('aria-label', 'Close more sections');
    backdrop.addEventListener('click', closeMore);

    const sheet = document.createElement('section');
    sheet.id = 'cpMobileMoreSheet';
    sheet.className = 'cp-mobile-more-sheet';
    sheet.setAttribute('aria-label', 'More tournament sections');
    sheet.setAttribute('aria-hidden', 'true');
    sheet.innerHTML = `
      <div class="cp-mobile-more-handle" aria-hidden="true"></div>
      <div class="cp-mobile-more-head"><strong>More</strong><button type="button" class="cp-mobile-more-close" aria-label="Close">×</button></div>
      <div class="cp-mobile-more-list"></div>`;
    sheet.querySelector('.cp-mobile-more-close')?.addEventListener('click', closeMore);
    const list = sheet.querySelector('.cp-mobile-more-list');
    MORE.forEach(item => list?.appendChild(moreItem(item)));

    const toastNode = document.createElement('div');
    toastNode.id = 'cpMobileToast';
    toastNode.className = 'cp-mobile-toast';
    toastNode.setAttribute('role', 'status');
    toastNode.setAttribute('aria-live', 'polite');

    document.body.append(nav, backdrop, sheet, toastNode);
  }

  function syncState() {
    if (!$('#cpMobileAppNav')) return;
    const current = currentItem();
    const secondaryActive = MORE.some(item => item.key === current.key);

    PRIMARY.forEach(item => {
      const button = $(`[data-cp-mobile-key="${item.key}"]`);
      const tab = resolveTab(item);
      const locked = isDisabled(tab);
      button?.classList.toggle('is-active', item.key === current.key);
      button?.classList.toggle('is-disabled', locked);
      button?.setAttribute('aria-current', item.key === current.key ? 'page' : 'false');
      button?.setAttribute('aria-label', locked ? `${item.label}, currently locked. Tap for details.` : item.label);
      button?.removeAttribute('aria-disabled');
    });

    const moreButton = $('#cpMobileMoreButton');
    moreButton?.classList.toggle('is-active', secondaryActive);
    moreButton?.setAttribute('aria-current', secondaryActive ? 'page' : 'false');

    MORE.forEach(item => {
      const button = $(`[data-cp-mobile-more-key="${item.key}"]`);
      const tab = resolveTab(item);
      const locked = isDisabled(tab);
      button?.classList.toggle('is-active', item.key === current.key);
      button?.classList.toggle('is-disabled', locked);
      button?.setAttribute('aria-label', locked ? `${item.label}, currently locked. Tap for details.` : item.label);
      button?.removeAttribute('aria-disabled');
    });
  }

  function onLegacyNavigation(event) {
    if (!media.matches) return;
    const tab = event.target?.closest?.('#appWindow > .tabs > .tab');
    if (!tab) return;
    window.setTimeout(() => {
      isolateLegacyTabsForPhone();
      syncState();
    }, 30);
  }

  function handleViewportChange() {
    ensureShell();
    isolateLegacyTabsForPhone();
    if (!media.matches) closeMore();
    syncState();
  }

  function start() {
    ensureShell();
    isolateLegacyTabsForPhone();
    syncState();
    document.addEventListener('click', onLegacyNavigation, false);
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeMore();
    });
    media.addEventListener?.('change', handleViewportChange);

    // Some sections are enabled/disabled by the existing tournament flow after
    // registration or results changes. Reflect that state without wrapping or
    // replacing any production function.
    window.setInterval(() => {
      if (media.matches) {
        isolateLegacyTabsForPhone();
        syncState();
      }
    }, 900);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
