(() => {
  if (window.__cpRegRedesignApplied) return;
  window.__cpRegRedesignApplied = true;

  const qs = (sel, root = document) => root.querySelector(sel);
  const byId = id => document.getElementById(id);
  const store = () => window.cpWebStorage || window.localStorage;
  const COLLAPSE_KEY = 'ChessPublisher.RatingTools.Collapsed';
  const MANUAL_KEY = 'ChessPublisher.ManualEntry.Collapsed';

  // Inline !important beats every desktop theme rule, so emptied legacy shells stay hidden.
  const hide = el => { if (el) el.style.setProperty('display', 'none', 'important'); };
  const make = (tag, className, text) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
  };
  const read = key => { try { return store().getItem(key); } catch (_) { return null; } };
  const write = (key, value) => { try { store().setItem(key, value); } catch (_) {} };

  function syncSegmentedRatingUI() {
    const sel = byId('defaultRating');
    if (!sel) return;
    const val = sel.value || 'std';
    document.querySelectorAll('.cp-reg-rating-seg-btn').forEach(btn => {
      const on = btn.dataset.ratingCtrl === val;
      if (btn.classList.contains('active') !== on) btn.classList.toggle('active', on);
      if (btn.getAttribute('aria-pressed') !== String(on)) btn.setAttribute('aria-pressed', String(on));
    });
  }

  function syncFideMiniSummary() {
    const el = byId('cpRegFideMiniSummaryText');
    if (!el) return;
    const fmt = raw => {
      const n = parseInt(String(raw || '').replace(/[^0-9]/g, ''), 10);
      if (!Number.isFinite(n) || n <= 0) return null;
      return n >= 1000 ? `${Math.floor(n / 1000)}k` : String(n);
    };
    const date = (qs('#ratingListsStdDate')?.textContent || '').trim();
    const parts = [];
    const std = fmt(qs('#ratingListsStdCount')?.textContent);
    const rpd = fmt(qs('#ratingListsRapidCount')?.textContent);
    const blz = fmt(qs('#ratingListsBlitzCount')?.textContent);
    if (std) parts.push(`STD ${std}`);
    if (rpd) parts.push(`RPD ${rpd}`);
    if (blz) parts.push(`BLZ ${blz}`);
    const next = parts.length
      ? `FIDE ${date && date !== '—' ? date + ' · ' : ''}${parts.join(' · ')}`
      : ((qs('#fideAutoStatus')?.textContent || '').trim() || 'FIDE rating lists not loaded');
    if (el.textContent !== next) el.textContent = next;
    const dot = qs('.cp-reg-fide-dot');
    if (dot) dot.classList.toggle('cp-reg-fide-dot-off', !parts.length);
  }

  function syncResortButtonHighlight() {
    const badge = byId('startingRankResortState');
    const btn = byId('resortStartingListBtn');
    if (!badge || !btn) return;
    const needs = badge.classList.contains('workflow-warn') || /required/i.test(badge.textContent || '');
    if (btn.classList.contains('cp-reg-needs-action') !== needs) btn.classList.toggle('cp-reg-needs-action', needs);
  }

  // The desktop bundle collapses its own panel with .tools-collapsed (fixed 24px height) and hides the
  // library with #registration.rating-tools-collapsed. The redesign owns that state, so strip them.
  function clearDesktopCollapseClasses() {
    const box = byId('cpPlayersRatingDataBox');
    const reg = byId('registration');
    if (box?.classList.contains('tools-collapsed')) box.classList.remove('tools-collapsed');
    if (reg?.classList.contains('rating-tools-collapsed')) reg.classList.remove('rating-tools-collapsed');
  }

  function applyDrawerState(collapsed) {
    const box = byId('cpPlayersRatingDataBox');
    const btn = byId('btnToggleRatingTools');
    if (!box) return;
    box.classList.toggle('cp-reg-drawer-collapsed', collapsed);
    if (btn) {
      const label = collapsed ? '⚙ Rating Data & Library ▾' : '▲ Collapse Rating Tools';
      if (btn.textContent !== label) btn.textContent = label;
      btn.setAttribute('aria-expanded', String(!collapsed));
    }
  }

  function buildRatingDrawer(reg) {
    const box = byId('cpPlayersRatingDataBox');
    if (!box) return;

    const importBtn = qs('.player-import-toolbar button', box);
    const updateBtn = byId('btnAutoUpdateFide');
    const reviewBtn = byId('btnUpdateRegisteredFromFide');
    const toggleBtn = byId('btnToggleRatingTools');
    const fideAutoStatus = byId('fideAutoStatus');
    const libHome = byId('cpRatingListLibraryHome');
    const libStatus = byId('cpRatingListLibraryStatus');
    const importInfo = byId('importInfo');
    const clusterGrid = qs('.button-cluster-grid', box);
    const clusters = clusterGrid ? Array.from(clusterGrid.querySelectorAll(':scope > .button-cluster')) : [];
    const integratedPanel = byId('integratedRatingListsPanel');

    if (updateBtn) {
      updateBtn.textContent = '⬇ Download / Update FIDE Lists';
      updateBtn.title = 'Download and update the official FIDE Standard, Rapid and Blitz rating lists';
    }

    const strip = make('div', 'cp-reg-command-strip');
    const left = make('div', 'cp-reg-strip-left');
    if (importBtn) left.appendChild(importBtn);
    left.appendChild(make('span', 'cp-reg-strip-divider'));
    const mini = make('div', 'cp-reg-fide-mini');
    mini.title = 'Active FIDE rating database';
    mini.appendChild(make('span', 'cp-reg-fide-dot'));
    const miniText = make('span', null, 'FIDE rating lists');
    miniText.id = 'cpRegFideMiniSummaryText';
    mini.appendChild(miniText);
    left.appendChild(mini);
    if (updateBtn) left.appendChild(updateBtn);
    if (reviewBtn) left.appendChild(reviewBtn);

    const right = make('div', 'cp-reg-strip-right');
    if (libStatus) right.appendChild(libStatus);
    if (toggleBtn) right.appendChild(toggleBtn);
    strip.append(left, right);

    const drawer = make('div', 'cp-reg-drawer-body');

    const leftCard = make('div', 'cp-reg-drawer-card');
    const leftHead = make('div', 'cp-reg-drawer-card-header');
    leftHead.appendChild(make('span', null, 'Integrated FIDE Rating Lists'));
    if (fideAutoStatus) leftHead.appendChild(fideAutoStatus);
    leftCard.appendChild(leftHead);
    const fideBody = make('div', 'cp-reg-fide-drawer-body');
    if (integratedPanel) fideBody.appendChild(integratedPanel);
    if (clusters[1]) {
      Array.from(clusters[1].children).forEach(ch => {
        if (ch.classList.contains('button-cluster-title')) return;
        if (ch.classList.contains('toolbar') && !ch.querySelector('button,input,select,span,a')) return;
        if (ch.classList.contains('toolbar') && !ch.textContent.trim()) return;
        fideBody.appendChild(ch);
      });
    }
    leftCard.appendChild(fideBody);

    const rightCard = make('div', 'cp-reg-drawer-card');
    const rightHead = make('div', 'cp-reg-drawer-card-header');
    rightHead.appendChild(make('span', null, 'Custom Rating List Library'));
    rightHead.appendChild(make('span', 'cp-reg-muted', 'Searchable only'));
    rightCard.appendChild(rightHead);
    if (libHome) {
      hide(qs(':scope > .group-title', libHome));
      libHome.classList.add('cp-reg-lib-home');
      rightCard.appendChild(libHome);
    }
    if (clusters[2]) {
      const details = make('details', 'cp-reg-manual-txt-details');
      details.appendChild(make('summary', null, 'Manual FIDE .txt Rating List Import (Advanced)'));
      const inner = make('div', 'cp-reg-manual-txt-inner');
      Array.from(clusters[2].children).forEach(ch => {
        if (!ch.classList.contains('button-cluster-title')) inner.appendChild(ch);
      });
      if (importInfo) inner.appendChild(importInfo);
      details.appendChild(inner);
      rightCard.appendChild(details);
    } else if (importInfo) {
      rightCard.appendChild(importInfo);
    }
    drawer.append(leftCard, rightCard);

    hide(qs(':scope > .group-title', box));
    hide(clusterGrid);
    box.prepend(drawer);
    box.prepend(strip);
    box.classList.add('cp-reg-rating-box');

    clearDesktopCollapseClasses();
    applyDrawerState(read(COLLAPSE_KEY) !== '0');

    window.toggleRatingToolsCollapse = function () {
      clearDesktopCollapseClasses();
      const collapsed = !box.classList.contains('cp-reg-drawer-collapsed');
      applyDrawerState(collapsed);
      write(COLLAPSE_KEY, collapsed ? '1' : '0');
    };

    syncFideMiniSummary();
  }

  function buildManualEntry() {
    const addBtn = byId('manualAddPlayerBtn');
    const box = addBtn?.closest('.groupbox');
    if (!box) return;
    box.classList.add('cp-reg-manual-box');
    const title = qs(':scope > .group-title', box);
    const toolbar = qs(':scope > .toolbar', box);
    if (title) {
      title.classList.add('cp-reg-manual-title');
      title.textContent = '+ Add Player';
    }
    if (toolbar) {
      toolbar.classList.add('cp-reg-manual-form');
      const labels = {
        manualName: 'Name', manualRating: 'Rating', manualTitle: 'Title', manualFed: 'Federation',
        manualFide: 'FIDE ID', manualBirth: 'Birth', manualGender: 'Gender'
      };
      Object.entries(labels).forEach(([id, text]) => {
        const field = byId(id);
        if (!field || field.parentElement !== toolbar) return;
        const wrap = make('label', `cp-reg-field cp-reg-field-${id}`);
        wrap.appendChild(make('span', 'cp-reg-field-label', text));
        toolbar.insertBefore(wrap, field);
        wrap.appendChild(field);
      });
      const birth = byId('manualBirth');
      if (birth) birth.placeholder = 'YYYY or YYYY-MM-DD';
      const name = byId('manualName');
      if (name) name.placeholder = 'Surname, Firstname';
    }
    if (title && !qs('.cp-reg-manual-collapse-btn', box)) {
      const toggle = make('button', 'cp-reg-manual-collapse-btn');
      toggle.type = 'button';
      const apply = collapsed => {
        box.classList.toggle('cp-reg-manual-collapsed', collapsed);
        toggle.textContent = collapsed ? '▾ Show' : '▴ Hide';
        toggle.setAttribute('aria-expanded', String(!collapsed));
      };
      toggle.title = 'Collapse or expand the manual player entry form';
      toggle.addEventListener('click', () => {
        const collapsed = !box.classList.contains('cp-reg-manual-collapsed');
        apply(collapsed);
        write(MANUAL_KEY, collapsed ? '1' : '0');
      });
      box.appendChild(toggle);
      apply(read(MANUAL_KEY) === '1');
    }
  }

  function buildFidePane() {
    const pane = byId('fideResultsBox');
    if (!pane) return;
    const title = qs('.fide-results-title', pane);
    const titleText = title ? qs('span:first-child', title) : null;
    if (titleText) titleText.textContent = 'FIDE & Rating Lists';

    const bar = make('div', 'cp-reg-rating-control-bar');
    bar.title = 'Choose which rating (Standard, Rapid or Blitz) is used when adding players';
    bar.appendChild(make('span', 'cp-reg-rating-control-label', 'Add with Rating:'));
    const seg = make('div', 'cp-reg-rating-segmented');
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', 'Rating time control');
    const sel = byId('defaultRating');
    [['std', 'Standard'], ['rapid', 'Rapid'], ['blitz', 'Blitz']].forEach(([val, text]) => {
      const b = make('button', 'cp-reg-rating-seg-btn', text);
      b.type = 'button';
      b.dataset.ratingCtrl = val;
      b.addEventListener('click', () => {
        if (!sel || sel.value === val) { syncSegmentedRatingUI(); return; }
        sel.value = val;
        syncSegmentedRatingUI();
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        if (typeof window.queueFideSearch === 'function') { try { window.queueFideSearch(); } catch (_) {} }
      });
      seg.appendChild(b);
    });
    bar.appendChild(seg);
    if (sel) {
      hide(sel);
      sel.addEventListener('change', syncSegmentedRatingUI);
      bar.appendChild(sel);
    }

    const searchBar = make('div', 'cp-reg-fide-search-bar');
    const search = byId('fideSearch');
    if (search) {
      search.placeholder = 'Search player by name or FIDE ID (FIDE + imported lists)…';
      searchBar.appendChild(search);
    }
    const hint = make('div', 'cp-reg-fide-hint', 'Double-click a player to add to the Starting Rank List');

    const anchor = title ? title.nextSibling : pane.firstChild;
    pane.insertBefore(bar, anchor);
    pane.insertBefore(searchBar, bar.nextSibling);
    pane.insertBefore(hint, searchBar.nextSibling);
    syncSegmentedRatingUI();
  }

  function buildStartingPane(reg) {
    const pane = byId('startingRankBox');
    if (!pane) return;
    const header = qs(':scope > .group-title', pane);
    const resortState = byId('startingRankResortState');
    const fontControls = qs('.starting-font-controls', pane);
    const maximizeBtn = byId('btnMaximizeLists');
    const pairingsBtn = byId('btnStartingListToPairings');

    if (header) {
      const label = qs('span:first-child', header);
      const left = make('div', 'cp-reg-pane-head-left');
      if (label) left.appendChild(label);
      if (resortState) left.appendChild(resortState);
      const right = make('div', 'cp-reg-pane-head-right');
      if (fontControls) right.appendChild(fontControls);
      if (maximizeBtn) right.appendChild(maximizeBtn);
      if (pairingsBtn) right.appendChild(pairingsBtn);
      header.textContent = '';
      header.append(left, right);
      header.classList.add('cp-reg-pane-head');
    }

    const tools = qs('.starting-rank-tools', pane);
    const frame = qs('.table-frame', pane);
    const actionRow = qs('.player-action-row', reg);
    const publishStrip = qs('.publish-strip-pro', reg);
    const sortTools = byId('sortMode')?.closest('.inline-tools');
    const sortLabel = sortTools ? qs('label', sortTools) : null;
    if (sortLabel) sortLabel.textContent = 'Sort:';

    const row2 = make('div', 'cp-reg-subbar');
    const row2Left = make('div', 'cp-reg-subbar-group');
    const filter = byId('startingRankSearch');
    if (filter) row2Left.appendChild(filter);
    if (sortTools) row2Left.appendChild(sortTools);
    const row2Right = make('div', 'cp-reg-subbar-group');
    const count = byId('selectedCount');
    const editBtn = actionRow ? qs('button[onclick*="editSelectedPlayer"]', actionRow) : null;
    const deleteBtn = byId('deleteSelectedPlayersBtn');
    [count, editBtn, deleteBtn].forEach(el => el && row2Right.appendChild(el));
    row2.append(row2Left, row2Right);

    const row3 = make('div', 'cp-reg-subbar cp-reg-subbar-muted');
    const tpn = make('div', 'cp-reg-subbar-group cp-reg-tpn-group');
    ['resortStartingListBtn', 'cpRrTpnDrawBtn', 'cpTpnExchangeBtn'].forEach(id => {
      const b = byId(id);
      if (b) tpn.appendChild(b);
    });
    const exp = make('div', 'cp-reg-export-segmented');
    exp.appendChild(make('span', 'cp-reg-export-label', 'Export:'));
    const txt = publishStrip ? qs('button[onclick*="exportParticipantsTxt"]', publishStrip) : null;
    const pdf = publishStrip ? qs('button[onclick*="openStartingListExportDialog"]', publishStrip) : null;
    const xml = byId('exportPlayersXmlBtn');
    [txt, pdf, xml].forEach(el => el && exp.appendChild(el));
    row3.append(tpn, exp);

    if (frame) {
      pane.insertBefore(row2, frame);
      pane.insertBefore(row3, frame);
      const late = byId('cpR11LateEntryBar');
      if (late) pane.insertBefore(late, frame);
    } else {
      pane.append(row2, row3);
    }

    hide(tools);
    hide(actionRow);
    hide(publishStrip);
    syncResortButtonHighlight();
  }

  function keepInPlace(reg) {
    clearDesktopCollapseClasses();
    syncFideMiniSummary();
    syncResortButtonHighlight();
    syncSegmentedRatingUI();

    const tpn = qs('.cp-reg-tpn-group', reg);
    if (tpn) {
      ['cpRrTpnDrawBtn', 'cpTpnExchangeBtn'].forEach(id => {
        const b = byId(id);
        if (b && b.parentElement !== tpn) tpn.appendChild(b);
      });
    }
    const frame = qs('#startingRankBox .table-frame', reg);
    const late = byId('cpR11LateEntryBar');
    if (late && frame && late.parentElement !== frame.parentElement) frame.parentElement.insertBefore(late, frame);
    const fideBody = qs('.cp-reg-fide-drawer-body', reg);
    const panel = byId('integratedRatingListsPanel');
    if (panel && fideBody && panel.parentElement !== fideBody) fideBody.prepend(panel);
    const status = byId('fideAutoStatus');
    const head = qs('.cp-reg-drawer-card-header', reg);
    if (status && head && status.parentElement !== head) head.appendChild(status);
  }

  function enhanceRegistrationPage() {
    const reg = byId('registration');
    if (!reg || reg.dataset.cpRegEnhanced === '1') return;
    reg.dataset.cpRegEnhanced = '1';
    reg.classList.add('cp-reg-v2');

    buildRatingDrawer(reg);
    buildManualEntry();
    buildFidePane();
    buildStartingPane(reg);

    const opts = { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class'] };
    let queued = false;
    const observer = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        observer.disconnect();
        try { keepInPlace(reg); } finally { observer.observe(reg, opts); }
      });
    });
    observer.observe(reg, opts);
  }

  // Run after the desktop bundle's own DOMContentLoaded installers (rating tools, resizers).
  const start = () => setTimeout(enhanceRegistrationPage, 0);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
