/*
 * Chess-Publisher Web · Production UI v6 bridge · September 2026
 * Presentation-only enhancement for the canonical production-web shell.
 * Protected tournament engines, TRF, FIDE, Chess-Results, pairing and Cloud logic are untouched.
 */
(() => {
  'use strict';

  const root = document.documentElement;
  root.dataset.cpUiV6Production = '1';

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));
  const clean = value => value == null ? '' : String(value).trim();
  const norm = value => clean(value).toLowerCase().replace(/\s+/g, ' ');

  const TAB_META = [
    ['tournament setup', '♜', 'Setup'],
    ['lists & players', '♙', 'Players'],
    ['players', '♙', 'Players'],
    ['pairings', '▦', 'Pairings'],
    ['standings', '♕', 'Standings'],
    ['tie-break', '⌁', 'Tie-Breaks'],
    ['schedule', '□', 'Schedule'],
    ['chess-results', '◎', 'Chess-Results'],
    ['online', '☁', 'Online & Cloud'],
    ['cloud', '☁', 'Online & Cloud'],
    ['export', '▤', 'Export & Print'],
    ['dgt', '♟', 'DGT']
  ];

  function findTab(label) {
    const wanted = norm(label);
    return $$('.tabs .tab').find(tab => norm(tab.textContent).includes(wanted)) || null;
  }

  function tabMeta(tab) {
    const label = norm(tab?.textContent);
    const match = TAB_META.find(([key]) => label.includes(key));
    return match || ['', '•', clean(tab?.textContent) || 'Section'];
  }

  function tournament() {
    try {
      if (typeof window.getCurrentTournament === 'function') return window.getCurrentTournament() || {};
    } catch { /* presentation must never block the app */ }
    try {
      return JSON.parse(localStorage.getItem('fide_tournament_manager_v2') || '{}') || {};
    } catch {
      return {};
    }
  }

  function tournamentName(data = tournament()) {
    return clean(data?.name || data?.settings?.eventName || data?.tournamentName || 'Current Tournament');
  }

  function playerCount(data = tournament()) {
    const list = data?.players || data?.participants || data?.registration?.players;
    return Array.isArray(list) ? list.length : Number(data?.playerCount || 0) || 0;
  }

  function hasStarted(data = tournament()) {
    const round = Number(data?.currentRound || data?.round || data?.state?.currentRound || 0);
    return round > 0 || Boolean(data?.started || data?.status === 'started');
  }

  function ensureSidebarChrome() {
    const tabs = $('#appWindow > .tabs') || $('.tabs');
    if (!tabs) return;

    if (!tabs.querySelector('.cpv6-prod-brand')) {
      const brand = document.createElement('div');
      brand.className = 'cpv6-prod-brand';
      brand.innerHTML = '<span class="cpv6-prod-brand-mark" aria-hidden="true">♜</span><span><strong>Chess-Publisher</strong><small>Tournament workspace</small></span>';
      tabs.prepend(brand);
    }

    if (!tabs.querySelector('.cpv6-prod-current')) {
      const current = document.createElement('section');
      current.className = 'cpv6-prod-current';
      current.setAttribute('aria-label', 'Current tournament');
      current.innerHTML = '<span class="cpv6-prod-eyebrow">Current tournament</span><strong class="cpv6-prod-current-name">Current Tournament</strong><span class="cpv6-prod-current-meta"><span data-cpv6-players>0 players</span><span data-cpv6-state>Not started</span></span>';
      const firstTab = tabs.querySelector('.tab');
      if (firstTab) tabs.insertBefore(current, firstTab);
      else tabs.appendChild(current);
    }

    if (!tabs.querySelector('.cpv6-prod-workspace-label')) {
      const label = document.createElement('div');
      label.className = 'cpv6-prod-workspace-label';
      label.textContent = 'Workspace';
      const firstTab = tabs.querySelector('.tab');
      if (firstTab) tabs.insertBefore(label, firstTab);
      else tabs.appendChild(label);
    }

    if (!tabs.querySelector('.cpv6-prod-sidebar-footer')) {
      const footer = document.createElement('div');
      footer.className = 'cpv6-prod-sidebar-footer';
      footer.innerHTML = '<strong>✓ FIDE 2026 workspace</strong><small>Existing tournament engines and rules remain unchanged.</small>';
      tabs.appendChild(footer);
    }

    $$('.tabs .tab').forEach(tab => {
      const [, icon, shortLabel] = tabMeta(tab);
      tab.dataset.cpv6MobileLabel = shortLabel;
      let span = tab.querySelector('.cpv6-prod-tab-icon');
      if (!span) {
        span = document.createElement('span');
        span.className = 'cpv6-prod-tab-icon';
        span.setAttribute('aria-hidden', 'true');
        tab.prepend(span);
      }
      // Keep the real tab textContent unchanged so every legacy tab handler keeps
      // receiving exactly the same label as before the UI presentation layer.
      span.dataset.cpv6Icon = icon;
      span.textContent = '';
    });
  }

  function updateSidebarChrome() {
    const data = tournament();
    const name = $('.cpv6-prod-current-name');
    const players = $('[data-cpv6-players]');
    const state = $('[data-cpv6-state]');
    if (name) name.textContent = tournamentName(data);
    if (players) players.textContent = `${playerCount(data)} players`;
    if (state) state.textContent = hasStarted(data) ? 'In progress' : 'Not started';
  }

  function fieldValue(page, selectors) {
    for (const selector of selectors) {
      const node = $(selector, page);
      if (!node) continue;
      const value = 'value' in node ? node.value : node.textContent;
      if (clean(value)) return clean(value);
    }
    return '';
  }

  function setupCompletion(page) {
    if (!page) return { done: 0, total: 8, percent: 0 };
    const probes = [
      ['input[name*="name" i]', '#tournamentName', 'input[id*="tournament" i][id*="name" i]'],
      ['input[name*="organizer" i]', 'input[id*="organizer" i]'],
      ['input[name*="chief" i]', 'input[id*="chief" i]', 'input[id*="arbiter" i]'],
      ['input[name*="city" i]', 'input[id*="city" i]'],
      ['input[type="date"]', 'input[id*="start" i]'],
      ['select[name*="pair" i]', 'select[id*="pair" i]'],
      ['input[name*="round" i]', 'input[id*="round" i]', 'select[id*="round" i]'],
      ['select[name*="time" i]', 'select[id*="time" i]', 'input[id*="time" i]']
    ];
    const done = probes.reduce((count, selectors) => count + (fieldValue(page, selectors) ? 1 : 0), 0);
    return { done, total: probes.length, percent: Math.round((done / probes.length) * 100) };
  }

  function activateTabByText(label) {
    const target = findTab(label);
    if (target) target.click();
  }

  function legacyTabId(tab) {
    const onclick = clean(tab?.getAttribute?.('onclick'));
    const match = /showTab\(['"]([^'"]+)/.exec(onclick);
    return clean(match?.[1]);
  }

  function ensureMobileTabActivation(tab) {
    if (!tab || !window.matchMedia('(max-width: 1099px)').matches) return;
    window.setTimeout(() => {
      const active = tab.classList.contains('active') || tab.getAttribute('aria-selected') === 'true';
      if (active || typeof window.showTab !== 'function') return;
      const id = legacyTabId(tab);
      if (!id) return;
      try {
        // Do not replace any tab handler. This is a mobile presentation fallback
        // that invokes the exact existing shell function with the original tab node.
        window.showTab(id, tab);
      } catch { /* the underlying shell remains authoritative */ }
    }, 0);
  }

  function setupPage() {
    const mainTab = findTab('tournament setup');
    if (!mainTab) return null;
    const active = mainTab.classList.contains('active') || mainTab.getAttribute('aria-selected') === 'true';
    if (!active) return null;
    return $('.content .page.active') || $('.page.active');
  }

  function ensureSetupRail() {
    const page = setupPage();
    if (!page) return;
    page.classList.add('cpv6-prod-setup-page');
    if (page.querySelector('.cpv6-prod-setup-rail')) return;

    const rail = document.createElement('aside');
    rail.className = 'cpv6-prod-setup-rail';
    rail.setAttribute('aria-label', 'Tournament setup overview');
    rail.innerHTML = `
      <section class="cpv6-prod-hero">
        <span class="cpv6-prod-hero-mark" aria-hidden="true">♜</span>
        <strong>Create. Manage. Publish.</strong>
        <small>From the first player to the final report.</small>
      </section>
      <section class="cpv6-prod-progress-card">
        <h3>Tournament Progress</h3>
        <div class="cpv6-prod-progress-body">
          <div class="cpv6-prod-ring" data-cpv6-ring><strong data-cpv6-percent>0%</strong></div>
          <div class="cpv6-prod-steps">
            <span class="is-done">✓ Setup</span>
            <span>♙ Players</span>
            <span>▦ Pairings</span>
            <span>♕ Results</span>
          </div>
        </div>
        <small data-cpv6-progress-copy>Complete the essential setup fields.</small>
      </section>
      <section class="cpv6-prod-quick-card">
        <h3>Quick Actions</h3>
        <button type="button" data-cpv6-go="players"><span>♙</span>Open Player List <b>→</b></button>
        <button type="button" data-cpv6-go="pairings"><span>▦</span>Go to Pairings <b>→</b></button>
        <button type="button" data-cpv6-go="standings"><span>♕</span>View Standings <b>→</b></button>
        <button type="button" data-cpv6-go="chess-results"><span>◎</span>Chess-Results <b>→</b></button>
        <button type="button" data-cpv6-go="online"><span>☁</span>Online & Cloud <b>→</b></button>
      </section>
      <div class="cpv6-prod-safe-note">ⓘ UI-only redesign. Tournament rules and calculation engines are unchanged.</div>`;
    page.appendChild(rail);

    rail.addEventListener('click', event => {
      const button = event.target.closest('[data-cpv6-go]');
      if (!button) return;
      const map = {
        players: 'players',
        pairings: 'pairings',
        standings: 'standings',
        'chess-results': 'chess-results',
        online: 'online'
      };
      activateTabByText(map[button.dataset.cpv6Go]);
    });

    updateSetupProgress();
  }

  function updateSetupProgress() {
    const page = setupPage();
    const rail = page?.querySelector('.cpv6-prod-setup-rail');
    if (!page || !rail) return;
    const progress = setupCompletion(page);
    const ring = rail.querySelector('[data-cpv6-ring]');
    const percent = rail.querySelector('[data-cpv6-percent]');
    const copy = rail.querySelector('[data-cpv6-progress-copy]');
    if (ring) ring.style.setProperty('--cpv6-progress', `${progress.percent * 3.6}deg`);
    if (percent) percent.textContent = `${progress.percent}%`;
    if (copy) copy.textContent = `${progress.done} of ${progress.total} essential setup fields are complete.`;
  }

  function syncActiveNav() {
    const tabs = $$('.tabs .tab');
    tabs.forEach(tab => {
      const active = tab.classList.contains('active') || tab.getAttribute('aria-selected') === 'true';
      tab.classList.toggle('cpv6-prod-active', active);
    });
  }

  function refreshPresentation() {
    ensureSidebarChrome();
    updateSidebarChrome();
    syncActiveNav();
    ensureSetupRail();
    updateSetupProgress();
  }

  document.addEventListener('click', event => {
    const tab = event.target.closest('.tabs .tab');
    if (tab) {
      ensureMobileTabActivation(tab);
      window.setTimeout(refreshPresentation, 0);
    }
  }, true);
  document.addEventListener('input', event => {
    if (event.target.closest('.page')) window.requestAnimationFrame(updateSetupProgress);
  }, true);
  document.addEventListener('change', event => {
    if (event.target.closest('.page')) window.requestAnimationFrame(updateSetupProgress);
  }, true);

  const observer = new MutationObserver(() => window.requestAnimationFrame(refreshPresentation));
  const start = () => {
    refreshPresentation();
    const app = $('#appWindow');
    if (app) observer.observe(app, { attributes: true, subtree: true, attributeFilter: ['class', 'aria-selected'] });
    window.setInterval(updateSidebarChrome, 3000);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
