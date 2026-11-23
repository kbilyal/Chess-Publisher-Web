(() => {
  if (window.__cpWorkspaceRedesignApplied) return;
  window.__cpWorkspaceRedesignApplied = true;

  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const byId = id => document.getElementById(id);
  const store = () => window.cpWebStorage || window.localStorage;
  const hide = el => { if (el) el.style.setProperty('display', 'none', 'important'); };
  const make = (tag, className, text) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
  };
  const read = key => { try { return store().getItem(key); } catch (_) { return null; } };
  const write = (key, value) => { try { store().setItem(key, value); } catch (_) {} };

  function makeKpiChip(label, valueEl) {
    const chip = make('span', 'cp-ws-kpi-chip');
    chip.appendChild(document.createTextNode(label + ' '));
    if (valueEl) chip.appendChild(valueEl);
    return chip;
  }

  function makeExportSegmented(labelText, buttons) {
    const seg = make('div', 'cp-ws-export-segmented');
    seg.appendChild(make('span', 'cp-ws-export-label', labelText));
    buttons.forEach(btn => { if (btn) seg.appendChild(btn); });
    return seg;
  }

  function makeCollapsibleCard(card, { key, defaultCollapsed = false, showLabel = 'Show ▾', hideLabel = 'Hide ▲', titleText = null, leftExtras = [], rightExtras = [], bodyNodes = null } = {}) {
    if (!card || card.dataset.cpWsCollapsible === '1') return null;
    card.dataset.cpWsCollapsible = '1';
    card.classList.add('cp-ws-card');

    const legacyTitle = qs(':scope > .group-title', card);
    const header = make('div', 'cp-ws-card-header');
    const left = make('div', 'cp-ws-card-header-left');
    const titleEl = make('span', 'cp-ws-card-title', titleText || (legacyTitle ? legacyTitle.textContent.trim() : ''));
    left.appendChild(titleEl);
    leftExtras.forEach(el => el && left.appendChild(el));
    if (legacyTitle) hide(legacyTitle);

    const right = make('div', 'cp-ws-card-header-right');
    rightExtras.forEach(el => el && right.appendChild(el));

    const toggle = make('button', 'cp-ws-btn-subtle');
    toggle.type = 'button';
    right.appendChild(toggle);
    header.append(left, right);

    const body = make('div', 'cp-ws-collapsible-body cp-ws-card-body');
    const nodesToMove = bodyNodes
      ? bodyNodes.filter(Boolean)
      : Array.from(card.children).filter(ch => ch !== legacyTitle && ch !== header);
    nodesToMove.forEach(ch => body.appendChild(ch));

    card.prepend(body);
    card.prepend(header);

    const apply = collapsed => {
      card.classList.toggle('cp-ws-collapsed', collapsed);
      toggle.textContent = collapsed ? showLabel : hideLabel;
      toggle.setAttribute('aria-expanded', String(!collapsed));
    };

    toggle.addEventListener('click', () => {
      const collapsed = !card.classList.contains('cp-ws-collapsed');
      apply(collapsed);
      if (key) write(key, collapsed ? '1' : '0');
    });

    const saved = key ? read(key) : null;
    const initialCollapsed = saved === '1' ? true : saved === '0' ? false : defaultCollapsed;
    apply(initialCollapsed);
    return { header, left, right, body, toggle, apply };
  }

  /* ========================================================================
     1. PAIRINGS TAB (#pairings)
     ======================================================================== */
  function syncNextRoundCollapse(pairings) {
    const manager = byId('nextRoundManager');
    const container = byId('nextRoundTableContainer');
    if (!manager || !container) return;
    const collapsed = container.classList.contains('next-round-collapsed');
    if (manager.classList.contains('cp-ws-nr-collapsed') !== collapsed) {
      manager.classList.toggle('cp-ws-nr-collapsed', collapsed);
    }
  }

  function keepPairingsInPlace(pairings) {
    syncNextRoundCollapse(pairings);
    const dangerGroup = qs('.cp-ws-pairings-danger-group', pairings);
    const resetBtn = qs('button[onclick*="resetTournamentRounds"]', pairings);
    if (dangerGroup && resetBtn && resetBtn.parentElement !== dangerGroup) {
      resetBtn.classList.remove('cp-top-reset-tournament');
      dangerGroup.appendChild(resetBtn);
    }
    if (!document.body.classList.contains('cp-pairing-generating') &&
        typeof window.setPairingsPlayerSearch === 'function') {
      const firstAction = qs('.result-main-action', pairings);
      const hasVisibleRow = qsa('#livePairingsBody tr[data-board-index]', pairings)
        .some(row => !row.hidden && !row.classList.contains('cp-search-hidden'));
      if (firstAction && firstAction.disabled && hasVisibleRow) {
        window.setPairingsPlayerSearch(byId('pairingsPlayerSearch')?.value || '');
      }
    }
  }

  function enhancePairings() {
    const pairings = byId('pairings');
    if (!pairings || pairings.dataset.cpWsEnhanced === '1') return;
    pairings.dataset.cpWsEnhanced = '1';
    pairings.classList.add('cp-ws-page');

    const quickbar = qs('.pairing-quickbar', pairings);
    const historybar = qs('.program-historybar', pairings);

    // Top Command Strip
    const strip = make('div', 'cp-ws-command-strip');
    const stripLeft = make('div', 'cp-ws-strip-left');
    const roundLbl = make('strong', 'cp-ws-strip-label', 'Round / History:');
    const roundSel = byId('pairingsRound');
    const syncState = byId('registrationSyncState');
    const editState = byId('roundEditState');
    const syncBtn = byId('syncRegistrationsBtn');
    stripLeft.appendChild(roundLbl);
    [roundSel, syncState, editState, syncBtn].forEach(el => el && stripLeft.appendChild(el));

    const stripRight = make('div', 'cp-ws-strip-right');
    stripRight.appendChild(make('span', 'cp-ws-hotkey-pill', '⌨ 1: 1-0 · 2: ½-½ · 3: 0-1'));
    const txtBtn = quickbar ? qs('button[onclick*="openPairingsExportDialog(\'txt\')"]', quickbar) : null;
    const pdfBtn = quickbar ? qs('button[onclick*="openPairingsExportDialog(\'pdf\')"]', quickbar) : null;
    const dgtBtn = quickbar ? qs('button[onclick*="openDgtPgnExportModal"]', quickbar) : null;
    const xmlBtn = byId('pairingsExportPlayersXmlBtn');
    stripRight.appendChild(makeExportSegmented('Export:', [txtBtn, pdfBtn, dgtBtn, xmlBtn]));
    strip.append(stripLeft, stripRight);

    const anchor = qs(':scope > .current-row', pairings);
    if (anchor) anchor.insertAdjacentElement('afterend', strip);
    else pairings.prepend(strip);
    hide(quickbar);
    hide(historybar);

    // Next Round Manager Drawer
    const nrManager = byId('nextRoundManager');
    if (nrManager) {
      nrManager.classList.add('cp-ws-card', 'cp-ws-nr-card');
      const nrHeader = qs('.next-round-manager-header', nrManager);
      const nrActions = qs('.next-round-actions', nrManager);
      const nrLabel = byId('nextRoundManagerLabel');
      const nrConfirm = byId('nextRoundConfirmState');
      const nrAllActive = byId('btnAllActiveRound1');
      const nrToggle = byId('toggleNextRoundPlayersBtn');
      const nrTitle = qs('.next-round-manager-title', nrManager);
      const nrSubtitle = qs('.next-round-manager-subtitle', nrManager);

      if (nrHeader) {
        nrHeader.classList.add('cp-ws-card-header', 'cp-ws-nr-header');
        const hLeft = make('div', 'cp-ws-card-header-left');
        if (nrTitle) { nrTitle.classList.add('cp-ws-card-title'); hLeft.appendChild(nrTitle); }
        if (nrLabel) hLeft.appendChild(nrLabel);
        if (nrConfirm) hLeft.appendChild(nrConfirm);
        if (nrSubtitle) { nrSubtitle.classList.add('cp-ws-card-subtitle'); hLeft.appendChild(nrSubtitle); }
        const hRight = make('div', 'cp-ws-card-header-right');
        if (nrAllActive) hRight.appendChild(nrAllActive);
        if (nrToggle) hRight.appendChild(nrToggle);
        nrHeader.textContent = '';
        nrHeader.append(hLeft, hRight);
      }

      const nrBody = make('div', 'cp-ws-nr-body');
      const nrFilterRow = make('div', 'cp-ws-nr-filter-row');
      const nrSummary = byId('nextRoundSummary');
      if (nrSummary) nrFilterRow.appendChild(nrSummary);
      const nrToolsRight = make('div', 'cp-ws-nr-tools-right');
      const nrSearch = nrActions ? qs('.next-round-player-search-wrap', nrActions) : null;
      const nrClearFixed = nrActions ? qs('button[onclick*="clearAllFixedBoards"]', nrActions) : null;
      const nrHelp = nrActions ? qs('.next-round-help-btn', nrActions) : null;
      [nrSearch, nrClearFixed, nrHelp].forEach(el => el && nrToolsRight.appendChild(el));
      nrFilterRow.appendChild(nrToolsRight);
      nrBody.appendChild(nrFilterRow);

      const nrTableContainer = byId('nextRoundTableContainer');
      if (nrTableContainer) nrBody.appendChild(nrTableContainer);
      nrManager.appendChild(nrBody);
      hide(nrActions);
      syncNextRoundCollapse(pairings);
    }

    // Swiss Pairings Panel & Quick Result Entry
    const caption = qs('.swiss-pairing-caption', pairings);
    hide(caption);

    const panel = qs('.live-pairing-panel', pairings);
    if (panel) {
      panel.classList.add('cp-ws-pairings-panel');
      const title = qs('.live-pairing-title', panel);
      const roundTitle = byId('livePairingRoundTitle');
      const toolbar = qs('.live-pairing-toolbar', panel);
      const fideBar = qs('.fide-result-bar', panel);
      const swissWs = qs('.swiss-workspace', panel);
      const tableWrap = qs('.live-pairing-table-wrap', panel);
      const liveInfo = byId('livePairingInfo');

      const genBtn = byId('btnGenerateGacrux');
      const resortBtn = byId('pairingsResortStartingListBtn');
      const toolbarGenBtn = byId('pairingsToolbarGenerateBtn');
      const crPubBtn = byId('pairingsChessResultsPublishBtn');
      hide(toolbarGenBtn);

      const card = make('div', 'cp-ws-card cp-ws-pairings-card');
      const cardHeader = make('div', 'cp-ws-card-header');
      const hLeft = make('div', 'cp-ws-card-header-left');
      if (title) { title.classList.add('cp-ws-card-title'); hLeft.appendChild(title); }
      if (roundTitle) { roundTitle.classList.add('cp-ws-round-pill'); hLeft.appendChild(roundTitle); }
      if (liveInfo) { liveInfo.classList.add('cp-ws-card-subtitle'); hLeft.appendChild(liveInfo); }

      const hRight = make('div', 'cp-ws-card-header-right');
      if (resortBtn) hRight.appendChild(resortBtn);
      if (genBtn) { genBtn.classList.add('cp-ws-cta-primary'); hRight.appendChild(genBtn); }
      if (crPubBtn) { crPubBtn.classList.add('cp-ws-btn-secondary'); hRight.appendChild(crPubBtn); }
      cardHeader.append(hLeft, hRight);

      const subbar = make('div', 'cp-ws-pane-subbar');
      const subLeft = make('div', 'cp-ws-subbar-group');
      const searchWrap = toolbar ? qs('.cp-player-search-wrap', toolbar) : null;
      const searchInfo = byId('pairingsPlayerSearchInfo');
      if (searchWrap) subLeft.appendChild(searchWrap);
      if (searchInfo) subLeft.appendChild(searchInfo);

      const subRight = make('div', 'cp-ws-subbar-group cp-ws-pairings-danger-group');
      const importBtn = toolbar ? qs('button[onclick*="trfResultsImportFile"]', toolbar) : null;
      const importInput = byId('trfResultsImportFile');
      const syncWebBtn = byId('pairingsDownloadWebResultsBtn');
      if (syncWebBtn) syncWebBtn.classList.add('cp-ws-btn-secondary');
      const manualCtrl = byId('manualPairingControls');
      const delRoundBtn = toolbar ? qs('button[onclick*="deleteCurrentRound"]', toolbar) : null;
      const resetTourneyBtn = qs('button[onclick*="resetTournamentRounds"]', pairings);
      if (resetTourneyBtn) resetTourneyBtn.classList.remove('cp-top-reset-tournament');

      [importBtn, importInput, syncWebBtn, manualCtrl].forEach(el => el && subRight.appendChild(el));
      subRight.appendChild(make('span', 'cp-ws-divider'));
      [delRoundBtn, resetTourneyBtn].forEach(el => el && subRight.appendChild(el));

      subbar.append(subLeft, subRight);
      card.append(cardHeader, subbar);
      if (tableWrap) card.appendChild(tableWrap);
      if (swissWs) swissWs.prepend(card);

      hide(toolbar);
      hide(fideBar);

      // Quick Result Entry Palette header
      const palette = qs('aside.result-palette', swissWs || panel);
      if (palette && !qs('.cp-ws-palette-header', palette)) {
        palette.classList.add('cp-ws-card', 'cp-ws-palette-card');
        const pHead = make('div', 'cp-ws-card-header cp-ws-palette-header');
        pHead.appendChild(make('span', 'cp-ws-card-title', 'Quick Result Entry'));
        pHead.appendChild(make('span', 'cp-ws-card-subtitle', 'Click row or 1/2/3'));
        palette.prepend(pHead);
      }
    }

    // Compact 1-Row Pairing Engine Strip
    const gacruxBox = qs('.gacrux-box.pairing-engine-bottom', pairings);
    if (gacruxBox) {
      gacruxBox.classList.add('cp-ws-engine-bar');
    }

    // Keep dynamic upstream updates in sync
    const opts = { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] };
    let queued = false;
    const observer = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        observer.disconnect();
        try { keepPairingsInPlace(pairings); } finally { observer.observe(pairings, opts); }
      });
    });
    observer.observe(pairings, opts);
  }

  /* ========================================================================
     2. STANDINGS TAB (#standings)
     ======================================================================== */
  function enhanceStandings() {
    const standings = byId('standings');
    if (!standings || standings.dataset.cpWsEnhanced === '1') return;
    standings.dataset.cpWsEnhanced = '1';
    standings.classList.add('cp-ws-page');

    const controlBox = byId('standingsCompletedRounds')?.closest('.groupbox');
    const topStats = qs('.final-standings-top', standings);
    const exportStrip = qs('.standings-export-strip', standings);

    // Top Command Strip
    const strip = make('div', 'cp-ws-command-strip');
    const stripLeft = make('div', 'cp-ws-strip-left');
    stripLeft.append(
      makeKpiChip('Players', byId('finalPlayersCount')),
      makeKpiChip('Rounds', byId('finalRoundsDone')),
      makeKpiChip('Games', byId('finalGamesPlayed')),
      makeKpiChip('Draws', byId('finalDrawsCount')),
      make('span', 'cp-ws-divider')
    );

    const tbWrap = make('div', 'cp-ws-tb-wrap');
    tbWrap.appendChild(make('span', 'cp-ws-card-subtitle', 'TB:'));
    const tiePriority = byId('standingsTiePriority');
    if (tiePriority) tbWrap.appendChild(tiePriority);
    stripLeft.appendChild(tbWrap);

    const stripRight = make('div', 'cp-ws-strip-right');
    const trfCheckBtn = byId('trf26ComplianceActionBtn');
    const trfBadge = byId('trf26ComplianceBadge');
    if (trfCheckBtn) stripRight.appendChild(trfCheckBtn);
    if (trfBadge) stripRight.appendChild(trfBadge);

    const txtBtn = exportStrip ? qs('button[onclick="openStandingsTxtExportDialog()"]', exportStrip) : null;
    const pdfBtn = exportStrip ? qs('button[onclick*="printReport(\'standings\')"]', exportStrip) : null;
    const trf16Btn = exportStrip ? qs('button[onclick*="exportTRF16"]', exportStrip) : null;
    const trf26Btn = exportStrip ? qs('button[onclick*="exportTRF26"]', exportStrip) : null;
    if (trf26Btn) trf26Btn.classList.add('cp-ws-cta-primary');
    stripRight.appendChild(makeExportSegmented('Export:', [txtBtn, pdfBtn, trf16Btn, trf26Btn]));
    strip.append(stripLeft, stripRight);

    const anchor = qs(':scope > .current-row', standings);
    if (anchor) anchor.insertAdjacentElement('afterend', strip);
    else standings.prepend(strip);

    hide(controlBox);
    hide(topStats);
    hide(exportStrip);

    // Main Standings Card Header
    const mainBox = qs('.standings-main-box', standings);
    if (mainBox) {
      mainBox.classList.add('cp-ws-card', 'cp-ws-standings-main');
      const title = byId('standingsMainTitle');
      const stateLine = byId('standingsStateLine');
      const searchBar = qs('.cp-standings-search-bar', mainBox);
      const header = make('div', 'cp-ws-card-header');
      const hLeft = make('div', 'cp-ws-card-header-left');
      if (title) { title.classList.add('cp-ws-card-title'); hLeft.appendChild(title); }
      if (stateLine) { stateLine.classList.add('cp-ws-card-subtitle'); hLeft.appendChild(stateLine); }
      const hRight = make('div', 'cp-ws-card-header-right');
      if (searchBar) hRight.appendChild(searchBar);
      header.append(hLeft, hRight);
      mainBox.prepend(header);
    }

    // Collapsible Special Prizes Card
    const spBox = byId('specialPrizeAgeChoices')?.closest('.groupbox');
    if (spBox) {
      const spToolbar = qs(':scope > .toolbar', spBox);
      const genSpBtn = spToolbar ? qs('button[onclick*="generateSpecialPrizes"]', spToolbar) : null;
      const spTxtBtn = spToolbar ? qs('button[onclick*="printSpecialPrizesTxt"]', spToolbar) : null;
      const spPdfBtn = spToolbar ? qs('button[onclick*="printSpecialPrizesPdf"]', spToolbar) : null;
      const spPlacesLabel = byId('specialPrizePlaces')?.closest('label');
      if (genSpBtn) genSpBtn.classList.add('cp-ws-btn-secondary');

      const bodyNodes = [
        qs('.special-prize-select-tools', spBox),
        byId('specialPrizeAgeChoices'),
        qs('.special-prize-section-label', spBox),
        byId('specialPrizeRatingChoices'),
        spPlacesLabel
      ];

      makeCollapsibleCard(spBox, {
        key: 'ChessPublisher.Standings.SpecialPrizes.Collapsed',
        defaultCollapsed: true,
        showLabel: 'Configure ▾',
        hideLabel: 'Hide ▲',
        titleText: '🏆 Special Prizes',
        rightExtras: [
          genSpBtn,
          makeExportSegmented('Export:', [spTxtBtn, spPdfBtn])
        ],
        bodyNodes
      });
      hide(spToolbar);
    }
  }

  /* ========================================================================
     3. TOURNAMENT SETUP TAB (#main)
     ======================================================================== */
  function enhanceMainSetup() {
    const main = byId('main');
    if (!main || main.dataset.cpWsEnhanced === '1') return;
    main.dataset.cpWsEnhanced = '1';
    main.classList.add('cp-ws-page');

    // Command Strip
    const currentRow = qs(':scope > .current-row', main);
    const generalExportBox = qs('button[onclick*="exportGeneralTxt"]', main)?.closest('.groupbox');
    if (currentRow) {
      currentRow.classList.add('cp-ws-command-strip');
      const left = make('div', 'cp-ws-strip-left');
      const right = make('div', 'cp-ws-strip-right');
      const newBtn = qs('button[onclick*="newTournamentPrompt"]', currentRow);
      const delBtn = qs('button[onclick*="deleteTournament"]', currentRow);
      if (newBtn) newBtn.classList.add('cp-ws-cta-primary');
      Array.from(currentRow.children).forEach(ch => {
        if (ch === delBtn) left.appendChild(make('span', 'cp-ws-divider'));
        left.appendChild(ch);
      });
      if (generalExportBox) {
        const txtBtn = qs('button[onclick*="exportGeneralTxt"]', generalExportBox);
        const pdfBtn = qs('button[onclick*="printReport(\'general\')"]', generalExportBox);
        right.appendChild(makeExportSegmented('General Export:', [txtBtn, pdfBtn]));
        hide(generalExportBox);
      }
      currentRow.append(left, right);
    }

    // General Information Card
    const genBox = qs('.tournament-general-box', main);
    if (genBox) {
      genBox.classList.add('cp-ws-card');
      const title = qs(':scope > .group-title', genBox);
      const fideBadge = byId('fideModeBadge');
      const fideToggle = byId('fideModeToggleBtn');
      const fideRow = fideBadge?.closest('.fide-event-id-row');
      const fideLabel = fideRow?.previousElementSibling?.tagName === 'LABEL' ? fideRow.previousElementSibling : null;
      const compBtn = fideRow ? qs('button[onclick*="showFideComplianceLog"]', fideRow) : null;

      const header = make('div', 'cp-ws-card-header');
      const hLeft = make('div', 'cp-ws-card-header-left');
      if (title) { title.classList.add('cp-ws-card-title'); hLeft.appendChild(title); }
      const hRight = make('div', 'cp-ws-card-header-right');
      if (fideBadge) hRight.appendChild(fideBadge);
      if (fideToggle) { fideToggle.classList.add('cp-ws-btn-subtle'); hRight.appendChild(fideToggle); }
      if (compBtn) { compBtn.classList.add('cp-ws-btn-subtle'); hRight.appendChild(compBtn); }
      header.append(hLeft, hRight);

      hide(fideLabel);
      hide(fideRow);

      const grid = qs('.tournament-general-grid', genBox);
      if (grid) {
        const body = make('div', 'cp-ws-card-body');
        body.appendChild(grid);
        genBox.append(header, body);

        const sections = [
          ['label[for="mainTournamentName"]', 'General & Officials'],
          ['label[for="timeControl"]', 'Format, Time Control & Dates'],
          ['label[for="fideEventId"]', 'FIDE Registration & Contacts']
        ];
        sections.forEach(([sel, text]) => {
          const target = qs(sel, grid);
          if (target) grid.insertBefore(make('div', 'cp-ws-section-divider', text), target);
        });
      } else {
        genBox.prepend(header);
      }
    }

    // FIDE Eligibility details card
    const fideDetails = byId('cpFideEligibility');
    if (fideDetails) fideDetails.classList.add('cp-ws-details-card');

    // Side-by-side Pairing Essentials + Tournament Rules & Ranking
    const essentials = qs('.pairing-essentials-box', main);
    const rules = qs('.setup-rules-box', main);
    if (essentials && rules) {
      const twoCol = make('div', 'cp-ws-setup-two-col');
      essentials.parentElement.insertBefore(twoCol, essentials);
      essentials.classList.add('cp-ws-card');
      rules.classList.add('cp-ws-card');
      twoCol.append(essentials, rules);
    }

    // Collapsible Secondary Setup Cards
    const prizeBox = qs('.setup-prize-box', main);
    makeCollapsibleCard(prizeBox, {
      key: 'ChessPublisher.Setup.Prize.Collapsed',
      defaultCollapsed: true
    });

    const regAdditionalBox = byId('regAdditional')?.closest('.groupbox');
    if (regAdditionalBox) {
      const uploadBtn = byId('setupRegulationsUploadBtn');
      const uploadStatus = byId('setupRegulationsFileStatus');
      const pubToolbar = qs('.setup-regulations-publish', regAdditionalBox);
      if (uploadBtn) uploadBtn.classList.add('cp-ws-btn-secondary');
      makeCollapsibleCard(regAdditionalBox, {
        key: 'ChessPublisher.Setup.Regs.Collapsed',
        defaultCollapsed: true,
        titleText: 'Additional Regulations & Hub Attachment',
        leftExtras: [uploadStatus],
        rightExtras: [uploadBtn]
      });
      hide(pubToolbar);
    }

    const notesBox = byId('generalNotes')?.closest('.groupbox');
    makeCollapsibleCard(notesBox, {
      key: 'ChessPublisher.Setup.Notes.Collapsed',
      defaultCollapsed: true
    });
  }

  /* ========================================================================
     4. CHESS-RESULTS TAB (#chessresults)
     ======================================================================== */
  function enhanceChessResults() {
    const cr = byId('chessresults');
    if (!cr || cr.dataset.cpWsEnhanced === '1') return;
    cr.dataset.cpWsEnhanced = '1';
    cr.classList.add('cp-ws-page');

    const crHeader = qs('.crxml-header', cr);
    const crSummary = qs('.crxml-summary-grid', cr);

    const strip = make('div', 'cp-ws-command-strip');
    const left = make('div', 'cp-ws-strip-left');
    left.appendChild(make('span', 'cp-ws-card-title', 'Chess-Results Publishing'));
    const status = byId('crXmlInterfaceStatus');
    if (status) left.appendChild(status);

    const right = make('div', 'cp-ws-strip-right');
    right.append(
      makeKpiChip('Tournament', byId('crXmlTournamentName')),
      makeKpiChip('Format', byId('crXmlTournamentFormat')),
      makeKpiChip('Federation', byId('crXmlFederation')),
      makeKpiChip('Players / Rounds', byId('crXmlPlayersRounds'))
    );
    strip.append(left, right);

    const anchor = qs(':scope > .current-row', cr);
    if (anchor) anchor.insertAdjacentElement('afterend', strip);
    else cr.prepend(strip);
    hide(crHeader);
    hide(crSummary);

    // 2-Column Workspace
    const pubBox = qs('.crpub-box', cr);
    const logBox = qs('.crlog-box', cr);
    const pinBox = qs('.crpin-box', cr);
    if (pubBox && logBox && pinBox) {
      const twoCol = make('div', 'cp-ws-cr-two-col');
      const rightStack = make('div', 'cp-ws-cr-right-stack');
      pubBox.parentElement.insertBefore(twoCol, pubBox);
      twoCol.append(pubBox, rightStack);
      rightStack.append(logBox, pinBox);

      pubBox.classList.add('cp-ws-card');
      const pubBtn = byId('crXmlPublishButton');
      if (pubBtn) pubBtn.classList.add('cp-ws-cta-primary');

      logBox.classList.add('cp-ws-card');
      const logTitle = qs(':scope > .group-title', logBox);
      const logToolbar = qs('.crlog-toolbar', logBox);
      const copyBtn = logToolbar ? qs('button[onclick*="copyChessResultsLog"]', logToolbar) : null;
      const clearBtn = logToolbar ? qs('button[onclick*="clearChessResultsLog"]', logToolbar) : null;
      if (copyBtn) copyBtn.classList.add('cp-ws-btn-subtle');
      if (clearBtn) clearBtn.classList.add('cp-ws-btn-subtle');
      const lHeader = make('div', 'cp-ws-card-header');
      const lLeft = make('div', 'cp-ws-card-header-left');
      if (logTitle) { logTitle.classList.add('cp-ws-card-title'); lLeft.appendChild(logTitle); }
      const lRight = make('div', 'cp-ws-card-header-right');
      if (copyBtn) lRight.appendChild(copyBtn);
      if (clearBtn) lRight.appendChild(clearBtn);
      lHeader.append(lLeft, lRight);
      logBox.prepend(lHeader);
      hide(logToolbar);

      // Collapsible Pin Board
      const pinToolbar = qs('.crpin-toolbar', pinBox);
      const pinToggle = pinToolbar ? qs('.crpin-toggle', pinToolbar) : null;
      const pinCount = byId('crPinBoardCount');
      makeCollapsibleCard(pinBox, {
        key: 'ChessPublisher.CR.PinBoard.Collapsed',
        defaultCollapsed: false,
        showLabel: 'Expand ▾',
        hideLabel: 'Hide ▲',
        leftExtras: [pinToggle],
        rightExtras: [pinCount],
        bodyNodes: [byId('crPinBoardText'), qs('.crpin-preview-wrap', pinBox)]
      });
      hide(pinToolbar);
    }
  }

  /* ========================================================================
     5. TOURNAMENT SCHEDULE TAB (#schedule)
     ======================================================================== */
  function enhanceSchedule() {
    const schedule = byId('schedule');
    if (!schedule || schedule.dataset.cpWsEnhanced === '1') return;
    schedule.dataset.cpWsEnhanced = '1';
    schedule.classList.add('cp-ws-page');

    const milestonesBox = byId('registrationOpens')?.closest('.groupbox');
    const roundsBox = byId('scheduleBody')?.closest('.groupbox');
    const notesBox = byId('scheduleNotes')?.closest('.groupbox');
    const exportBar = qs('button[onclick*="exportScheduleTxt"]', schedule)?.closest('.toolbar');

    if (roundsBox) {
      roundsBox.classList.add('cp-ws-card', 'cp-ws-schedule-main');
      const rTitle = qs(':scope > .group-title', roundsBox);
      const rToolbar = qs(':scope > .toolbar', roundsBox);
      const addBtn = rToolbar ? qs('button[onclick*="addScheduleRow"]', rToolbar) : null;
      const genBtn = rToolbar ? qs('button[onclick*="generateRoundRows"]', rToolbar) : null;
      const clrBtn = rToolbar ? qs('button[onclick*="clearSchedule"]', rToolbar) : null;
      if (genBtn) genBtn.classList.add('cp-ws-btn-secondary');

      const txtBtn = exportBar ? qs('button[onclick*="exportScheduleTxt"]', exportBar) : null;
      const pdfBtn = exportBar ? qs('button[onclick*="printReport(\'program\')"]', exportBar) : null;

      const header = make('div', 'cp-ws-card-header');
      const left = make('div', 'cp-ws-card-header-left');
      if (rTitle) { rTitle.classList.add('cp-ws-card-title'); left.appendChild(rTitle); }
      const right = make('div', 'cp-ws-card-header-right');
      [addBtn, genBtn, clrBtn].forEach(el => el && right.appendChild(el));
      right.appendChild(make('span', 'cp-ws-divider'));
      right.appendChild(makeExportSegmented('Export:', [txtBtn, pdfBtn]));
      header.append(left, right);
      roundsBox.prepend(header);
      hide(rToolbar);
      hide(exportBar);

      const anchor = qs(':scope > .current-row', schedule);
      if (anchor) anchor.insertAdjacentElement('afterend', roundsBox);
      else schedule.prepend(roundsBox);
    }

    if (milestonesBox || notesBox) {
      const secondaryRow = make('div', 'cp-ws-schedule-secondary');
      schedule.appendChild(secondaryRow);
      if (milestonesBox) {
        secondaryRow.appendChild(milestonesBox);
        makeCollapsibleCard(milestonesBox, {
          key: 'ChessPublisher.Schedule.Milestones.Collapsed',
          defaultCollapsed: false,
          titleText: 'Tournament Milestones & Ceremonies'
        });
      }
      if (notesBox) {
        secondaryRow.appendChild(notesBox);
        makeCollapsibleCard(notesBox, {
          key: 'ChessPublisher.Schedule.Notes.Collapsed',
          defaultCollapsed: false
        });
      }
    }
  }

  /* ========================================================================
     6. OTHER / EXPORT TAB (#exportPage)
     ======================================================================== */
  function enhanceExportPage() {
    const exp = byId('exportPage');
    if (!exp || exp.dataset.cpWsEnhanced === '1') return;
    exp.dataset.cpWsEnhanced = '1';
    exp.classList.add('cp-ws-page');

    const boxes = qsa(':scope > .groupbox', exp);
    const logBox = byId('log')?.closest('.groupbox');
    const cardBoxes = boxes.filter(b => b !== logBox);

    if (cardBoxes.length) {
      const grid = make('div', 'cp-ws-export-cards-grid');
      cardBoxes[0].parentElement.insertBefore(grid, cardBoxes[0]);
      cardBoxes.forEach(box => {
        box.classList.add('cp-ws-card');
        grid.appendChild(box);
      });
      const backupBtn = qs('button[onclick*="exportBackup"]', exp);
      if (backupBtn) backupBtn.classList.add('cp-ws-btn-secondary');
    }

    if (logBox) {
      logBox.classList.add('cp-ws-card', 'cp-ws-syslog-card');
    }
  }

  function enhanceWorkspaceTabs() {
    enhancePairings();
    enhanceStandings();
    enhanceMainSetup();
    enhanceChessResults();
    enhanceSchedule();
    enhanceExportPage();
  }

  // Run after the desktop bundle's own DOMContentLoaded installers.
  const start = () => setTimeout(enhanceWorkspaceTabs, 0);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
