(() => {
  const legacyPairings = window.openPairingsExportDialog;
  const legacyPrint = window.printReport;
  const html = value => escapeHtml(String(value ?? ''));
  const titleFor = kind => kind === 'players' ? 'Starting list' : 'Pairings';
  const fieldLabels = {
    board: 'Board number', sno: 'Start number', title: 'Chess title', rating: 'Rating',
    federation: 'Federation', fideId: 'FIDE ID', gender: 'Gender', birth: 'Birth date / year',
    points: 'Points before round', bold: 'Bold text', signOff: 'Arbiter sign-off',
  };
  const reportDateFormat = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  function formatReportDate(value) {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : reportDateFormat.format(date);
  }

  function startingTable(rows, options) {
    const labels = { ...fieldLabels, sno: 'No.', title: 'Title', name: 'Player', fed: 'Fed.', birth: 'Birth' };
    const columns = startingListExportColumns(options);
    return `<table class="cp-pdf-table cp-pdf-starting"><thead><tr>${columns.map(({ key }) =>
      `<th scope="col" class="cp-pdf-${key}">${html(labels[key])}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((player, index) => `<tr>${columns.map(({ key }) =>
        `<td class="cp-pdf-${key}">${html(startingListExportValue(player, index, key)) || '–'}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }

  function isPairingBye(result) {
    return isByeResult(result) || /^(?:BYE|0[.,]5 BYE)$/i.test(String(result || '').trim());
  }

  function pairingPlayer(row, side, options) {
    if (!row[side] && side === 'black') {
      // Administrative entries have no opponent and no writable game result.
      const label = isPairingBye(row.result) ? 'Bye' : '–';
      const code = row.result && row.result !== '-' && row.result !== 'BYE' ? row.result : '';
      return `<span class="cp-pdf-no-opponent">${label}</span>${code ? `<small class="cp-pdf-player-meta">${html(code)}</small>` : ''}`;
    }
    const title = options.title && row[side + 'Title'];
    const meta = [
      options.sno && row[side + 'SNo'] && `No. ${row[side + 'SNo']}`,
      options.points && row[side + 'Points'] !== '' && `Pts ${cpExactExportPoints(row[side + 'Points'])}`,
      options.rating && row[side + 'Rating'] && `Rtg ${row[side + 'Rating']}`,
      options.federation && String(row[side + 'Fed'] || '').toUpperCase(),
      options.fideId && row[side + 'FideId'] && `FIDE ${row[side + 'FideId']}`,
    ].filter(Boolean);
    return `<span class="cp-pdf-player-name">${title ? `<span class="cp-pdf-title-tag">${html(title)}</span> ` : ''}${html(row[side]) || '–'}</span>
      ${meta.length ? `<small class="cp-pdf-player-meta">${meta.map(item => `<span>${html(item)}</span>`).join('')}</small>` : ''}`;
  }

  function pairingResult(row) {
    if (!row.white || !row.black) return '';
    const result = cpResultVisualState(row.result);
    return result.className === 'result-empty'
      ? '<span class="cp-pdf-score-box" role="img" aria-label="Blank space for handwritten result"></span>'
      : html(result.text);
  }

  function pairingHeader(tournament, round, rows) {
    const settings = tournament.settings || {};
    const start = (tournament.schedule?.rows || []).find(row =>
      scheduleRoundNumberFromEvent(row.event) === Number(round))?.dateTime;
    const details = [
      ['Round start', formatReportDate(start)],
      ['Venue', [...new Set([settings.venue, settings.city].filter(Boolean))].join(', ')],
      ['Time control', settings.timeControl],
    ].filter(([, value]) => value);
    let games = 0;
    let recorded = 0;
    let byes = 0;
    let other = 0;
    for (const row of rows) {
      if (row.white && row.black) {
        games++;
        if (cpResultVisualState(row.result).className !== 'result-empty') recorded++;
      } else if (isPairingBye(row.result)) {
        byes++;
      } else {
        other++;
      }
    }
    return `<header class="cp-pdf-pairings-header">
      <div class="cp-pdf-pairings-heading">
        <div><p class="cp-pdf-tournament">${html(data.currentTournament)}</p><h1>Pairings</h1></div>
        <div class="cp-pdf-round-card"><span>Round</span><strong>${html(round)}</strong></div>
      </div>
      ${details.length ? `<dl class="cp-pdf-round-details">${details.map(([label, value]) =>
        `<div><dt>${label}</dt><dd>${html(value)}</dd></div>`).join('')}</dl>` : ''}
      <div class="cp-pdf-round-summary">
        <span><strong>${games}</strong> ${games === 1 ? 'game' : 'games'}</span>
        <span><strong>${recorded}</strong> recorded</span>
        <span><strong>${games - recorded}</strong> pending</span>
        ${byes ? `<span><strong>${byes}</strong> ${byes === 1 ? 'bye' : 'byes'}</span>` : ''}
        ${other ? `<span><strong>${other}</strong> ${other === 1 ? 'other entry' : 'other entries'}</span>` : ''}
      </div>
    </header>`;
  }

  function pairingTable(rows, options) {
    return `<table class="cp-pdf-table cp-pdf-pairings"><thead><tr>
      ${options.board ? '<th scope="col" class="cp-pdf-board">Board</th>' : ''}
      <th scope="col" class="cp-pdf-white"><span class="cp-pdf-piece"></span>White</th>
      <th scope="col" class="cp-pdf-result">Result</th>
      <th scope="col"><span class="cp-pdf-piece cp-pdf-piece-black"></span>Black</th>
      </tr></thead><tbody>${rows.map(row => `<tr>
        ${options.board ? `<td class="cp-pdf-board">${html(row.board)}</td>` : ''}
        <td class="cp-pdf-white">${pairingPlayer(row, 'white', options)}</td>
        <td class="cp-pdf-result">${pairingResult(row)}</td>
        <td class="cp-pdf-black">${pairingPlayer(row, 'black', options)}</td>
      </tr>`).join('')}</tbody></table>`;
  }

  function reportMarkup(kind, rows, options, round) {
    const tournament = getCurrentTournament();
    const settings = tournament.settings || {};
    if (kind === 'pairings') {
      const font = options.fontFamily !== pairingsExportDefaults().fontFamily
        ? ` style="font-family:${html(pairingsExportFontCss(options.fontFamily))}"` : '';
      return `<article class="cp-pdf-report${options.bold ? ' cp-pdf-bold' : ''}" lang="en"${font}>
        ${pairingHeader(tournament, round, rows)}
        ${pairingTable(rows, options)}
        ${options.signOff ? `<section class="cp-pdf-sign-off" aria-label="Arbiter sign-off">
          <h2>Arbiter sign-off</h2>
          <div class="cp-pdf-sign-off-fields"><span>Name</span><span>Signature</span><span>Date / time</span></div>
        </section>` : ''}
      </article>`;
    }
    const date = [...new Set([settings.startDate, settings.endDate].map(formatReportDate).filter(Boolean))].join(' – ');
    const meta = [Array.from(new Set([settings.city, settings.venue].filter(Boolean))).join(', '), date, settings.timeControl].filter(Boolean);
    return `<article class="cp-pdf-report" lang="en">
      <header class="cp-pdf-report-header">
        <p class="cp-pdf-tournament">${html(data.currentTournament)}</p>
        <h1>Starting list</h1>
        <div class="cp-pdf-report-facts">
          <span class="cp-pdf-count">${rows.length} ${rows.length === 1 ? 'player' : 'players'}</span>
          ${meta.map(value => `<span>${html(value)}</span>`).join('')}
        </div>
      </header>
      ${startingTable(rows, options)}
    </article>`;
  }

  function printReport(markup, filename, pageLabel) {
    const root = document.getElementById('screenPrintReport');
    const pageStyle = document.documentElement.style;
    const pageLabelKey = '--cp-pdf-page-label';
    const originalTitle = document.title;
    const previousMarkup = [...root.childNodes];
    const restore = () => {
      root.replaceChildren(...previousMarkup);
      document.title = originalTitle;
      if (pageLabel) pageStyle.removeProperty(pageLabelKey);
    };
    root.innerHTML = markup;
    document.title = filename;
    if (pageLabel) pageStyle.setProperty(pageLabelKey, `"${CSS.escape(pageLabel)}"`);
    window.addEventListener('afterprint', restore, { once: true });
    try {
      window.print();
    } catch (error) {
      window.removeEventListener('afterprint', restore);
      restore();
      throw error;
    }
  }

  function openPdf(kind) {
    if (document.getElementById('cpPdfDialog')) return;
    const isPlayers = kind === 'players';
    const round = isPlayers ? null : getSelectedPairingRoundNumber();
    const rows = isPlayers ? startingListExportPlayers() : buildLivePairingsRows();
    const heading = titleFor(kind);
    if (!rows.length) {
      appAlert(isPlayers ? 'There are no players to export.'
        : 'There are no pairings for the selected round.', heading, 'warning');
      return;
    }

    const saved = isPlayers ? getStartingListExportOptions() : getPairingsExportOptions();
    const defaults = isPlayers ? startingListExportDefaults() : { ...pairingsExportDefaults(), signOff: false };
    const presets = [
      ['standard', 'Standard', defaults],
      ['compact', 'Compact', {
        ...defaults, title: false, ...(isPlayers ? { federation: false } : { sno: false, points: false }),
      }],
      ['fide', 'FIDE details', {
        ...defaults, fideId: true, ...(isPlayers ? { gender: true, birth: true } : { federation: true, rating: true }),
      }],
    ];
    if (!isPlayers) presets.splice(1, 0, ['arbiter', 'Arbiter sheet', { ...defaults, signOff: true }]);
    const keys = isPlayers ? ['sno', 'title', 'rating', 'federation', 'fideId', 'gender', 'birth']
      : ['board', 'sno', 'title', 'points', 'rating', 'federation', 'fideId', 'bold', 'signOff'];
    const fonts = ['Calibri', 'Arial', 'Segoe UI', 'Tahoma', 'Verdana', 'Times New Roman'];
    const trigger = document.activeElement;
    const d = document.createElement('dialog');
    d.id = 'cpPdfDialog';
    d.className = 'cp-pdf-dialog';
    d.lang = 'en';
    d.setAttribute('aria-labelledby', 'cpPdfTitle');
    d.innerHTML = `
      <header class="cp-pdf-dialog-head">
        <div><p>Export PDF</p><h2 id="cpPdfTitle" tabindex="-1" autofocus>${heading}</h2></div>
        <button type="button" class="cp-pdf-close" data-close aria-label="Close">×</button>
      </header>
      <div class="cp-pdf-layout">
        <aside class="cp-pdf-settings">
          <fieldset><legend>Preset</legend>
            <div class="cp-pdf-presets">${presets.map(([key, label]) =>
              `<button type="button" data-preset="${key}" aria-pressed="false">${label}</button>`).join('')}</div>
          </fieldset>
          <details class="cp-pdf-details"><summary>Customize fields</summary>
            <div class="cp-pdf-fields">${keys.map(key =>
              `<label><input type="checkbox" name="${key}">${fieldLabels[key]}</label>`).join('')}</div>
            ${isPlayers ? '' : `<label class="cp-pdf-select">Font
              <select name="fontFamily">${fonts.map(font =>
                `<option value="${font}">${font === 'Calibri' ? 'Default for PDF' : font}</option>`).join('')}</select></label>`}
          </details>
        </aside>
        <section class="cp-pdf-preview" aria-label="Document preview">
          <div class="cp-pdf-preview-label"><strong>Preview</strong>
            <div><span>A4 · Portrait</span>
            <button type="button" data-zoom aria-pressed="false" aria-label="Actual size">100%</button></div></div>
          <div class="cp-pdf-preview-scroll" tabindex="0" aria-label="Report content"><div class="cp-pdf-paper"></div></div>
        </section>
      </div>
      <footer class="cp-pdf-dialog-foot">
        <p>Choose “Save as PDF” in the print dialog.</p>
        <div><button type="button" data-close>Cancel</button>
        <button type="button" data-print>Print / Save PDF</button></div>
      </footer>`;
    const controls = [...d.querySelectorAll('[name]')];
    const paper = d.querySelector('.cp-pdf-paper');
    const preview = d.querySelector('.cp-pdf-preview-scroll');
    const read = () => ({
      ...saved,
      ...Object.fromEntries(controls.map(input => [input.name, input.type === 'checkbox' ? input.checked : input.value])),
    });
    const write = options => controls.forEach(input => {
      if (input.type === 'checkbox') input.checked = Boolean(options[input.name]);
      else input.value = options[input.name];
    });
    const draw = () => {
      const options = read();
      for (const [key, , preset] of presets) {
        const matches = controls.every(input => options[input.name] === preset[input.name]);
        d.querySelector(`[data-preset="${key}"]`).setAttribute('aria-pressed', String(matches));
      }
      paper.innerHTML = reportMarkup(kind, rows, options, round);
    };
    const zoomButton = d.querySelector('[data-zoom]');
    const fitPaper = () => {
      const zoom = Math.min(1, Math.max(1, preview.clientWidth - 24) / 794);
      paper.style.zoom = zoomButton.getAttribute('aria-pressed') === 'true' ? 1 : zoom;
    };
    const resize = new ResizeObserver(fitPaper);
    d.addEventListener('change', draw);
    d.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button) return;
      if (button.hasAttribute('data-close')) d.close();
      if (button === zoomButton) {
        zoomButton.setAttribute('aria-pressed', String(zoomButton.getAttribute('aria-pressed') !== 'true'));
        fitPaper();
      }
      const preset = presets.find(([key]) => key === button.dataset.preset);
      if (preset) {
        write(preset[2]);
        draw();
      }
      if (button.hasAttribute('data-print')) {
        const options = read();
        if (isPlayers) saveStartingListExportOptions(options);
        else savePairingsExportOptions(options);
        const filename = `${data.currentTournament} - ${heading}${isPlayers ? '' : ` - Round ${round}`}`;
        const pageLabel = isPlayers ? '' : `${data.currentTournament} · Round ${round}`;
        printReport(paper.innerHTML, filename, pageLabel);
      }
    });
    d.addEventListener('close', () => {
      resize.disconnect();
      d.remove();
      trigger?.focus();
    }, { once: true });
    write(saved);
    draw();
    document.body.append(d);
    resize.observe(preview);
    d.showModal();
  }

  // Keep the authoritative TXT builder and its existing download workflow.
  // The extra print action intentionally mirrors Standings' monospaced TXT sheet.
  function printPairingsTxt(modal) {
    const rows = buildLivePairingsRows();
    if (!rows.length) {
      appAlert('There are no pairings for the selected round.', 'Pairings', 'warning');
      return;
    }
    const run = () => {
      const text = buildPairingsReadableText(getPairingsExportOptions());
      const root = document.getElementById('screenPrintReport');
      if (!root || !text || !text.trim()) {
        appAlert('The selected pairings could not be prepared for printing.', 'Pairings', 'warning');
        return;
      }
      const originalNodes = [...root.childNodes];
      const originalTitle = document.title;
      const previousDisplay = modal.style.display;
      const restore = () => {
        root.replaceChildren(...originalNodes);
        document.title = originalTitle;
        modal.style.display = previousDisplay;
        window.removeEventListener('afterprint', restore);
      };
      const sheet = document.createElement('div');
      sheet.className = 'print-doc final-txt-print';
      const pre = document.createElement('pre');
      pre.className = 'final-txt-pre';
      pre.textContent = text; // Never interpret player names as HTML.
      sheet.appendChild(pre);
      root.replaceChildren(sheet);
      const round = getSelectedPairingRoundNumber();
      document.title = `${data.currentTournament} - Pairings - Round ${round}`;
      modal.style.display = 'none';
      window.addEventListener('afterprint', restore, { once: true });
      setTimeout(() => {
        try { window.print(); }
        catch (error) { restore(); throw error; }
      }, 30);
    };
    if (typeof withExportLanguage === 'function') withExportLanguage(run);
    else run();
  }

  function openPairingsTxtWithPrint() {
    const result = legacyPairings('txt');
    const installPrintButton = () => {
      const modal = document.getElementById('pairingsExportModal');
      if (!modal || modal.querySelector('[data-cp-pairings-txt-print]')) return;
      const buttons = [...modal.querySelectorAll('button')];
      const exportButton = buttons.reverse().find(button =>
        /(?:download|export|save).*txt|^(?:download|export|save)(?:\\s|$)/i.test(button.textContent.trim()));
      if (!exportButton) return;
      const printButton = document.createElement('button');
      printButton.type = 'button';
      printButton.dataset.cpPairingsTxtPrint = 'true';
      printButton.className = exportButton.className;
      printButton.textContent = 'Print TXT';
      printButton.title = 'Print this fixed-width TXT report like Final Standings';
      printButton.addEventListener('click', () => printPairingsTxt(modal));
      exportButton.insertAdjacentElement('beforebegin', printButton);
    };
    installPrintButton();
    setTimeout(installPrintButton, 0);
    return result;
  }

  window.openStartingListExportDialog = () => openPdf('players');
  window.openPairingsExportDialog = (target = 'pdf') =>
    String(target).toLowerCase() === 'txt' ? openPairingsTxtWithPrint() : openPdf('pairings');
  window.printReport = kind => kind === 'players' || kind === 'pairings' ? openPdf(kind) : legacyPrint(kind);
})();
