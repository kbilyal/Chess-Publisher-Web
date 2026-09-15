/* hub-useful-links-organizer-v1: Web Companion Hub link editor + publish bridge. */
(() => {
  'use strict';

  const STORAGE_KEY = 'fide_tournament_manager_v2';
  const ROOT_ATTR = 'data-cp-hub-useful-links';
  const MAX_LINKS = 12;
  const SNAPSHOT_PATH = /\/api\/v1\/organizer\/tournaments\/[^/]+\/snapshot(?:$|\?)/;

  const text = value => value == null ? '' : String(value).trim();
  const safeUrl = value => {
    const raw = text(value);
    if (!raw) return '';
    try {
      const parsed = new URL(raw);
      return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : '';
    } catch (_) {
      return '';
    }
  };

  const normalizeLinks = value => {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    const out = [];
    for (const item of value) {
      if (!item || typeof item !== 'object') continue;
      const label = text(item.label || item.name || item.title).slice(0, 80);
      const url = safeUrl(item.url || item.href || item.link);
      if (!label || !url || seen.has(url)) continue;
      seen.add(url);
      out.push({ label, url });
      if (out.length >= MAX_LINKS) break;
    }
    return out;
  };

  const readTournament = () => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    } catch (_) {
      return null;
    }
  };

  const readLinks = () => normalizeLinks(readTournament()?.regulations?.usefulLinks);

  const writeLinks = links => {
    const tournament = readTournament();
    if (!tournament || typeof tournament !== 'object') throw new Error('No tournament is open.');
    tournament.regulations = { ...(tournament.regulations || {}), usefulLinks: normalizeLinks(links) };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tournament));
    return tournament.regulations.usefulLinks;
  };

  // Publish bridge: keep the existing snapshot builder untouched, but attach the
  // organizer-managed portable link list to the outgoing public Hub snapshot.
  const nativeFetch = window.fetch?.bind(window);
  if (nativeFetch) {
    window.fetch = async (input, init) => {
      try {
        const requestUrl = typeof input === 'string' ? input : input?.url || '';
        const method = text(init?.method || input?.method || 'GET').toUpperCase();
        if (method === 'PUT' && SNAPSHOT_PATH.test(requestUrl) && typeof init?.body === 'string') {
          const payload = JSON.parse(init.body);
          if (payload && typeof payload === 'object') {
            payload.regulations = { ...(payload.regulations || {}), usefulLinks: readLinks() };
            init = { ...init, body: JSON.stringify(payload) };
          }
        }
      } catch (error) {
        console.warn('Hub useful links publish bridge skipped:', error);
      }
      return nativeFetch(input, init);
    };
  }

  const ensureStyles = () => {
    if (document.getElementById('cp-hub-useful-links-style')) return;
    const style = document.createElement('style');
    style.id = 'cp-hub-useful-links-style';
    style.textContent = `
      [${ROOT_ATTR}] { flex-basis:100%; width:100%; margin-top:10px; padding:14px; border:1px solid #dbe4ef; border-radius:12px; background:#f8fafc; }
      [${ROOT_ATTR}] .cp-links-head { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:10px; }
      [${ROOT_ATTR}] .cp-links-title { font-size:13px; font-weight:800; color:#0f172a; }
      [${ROOT_ATTR}] .cp-links-help { margin-top:2px; font-size:11px; color:#64748b; line-height:1.45; }
      [${ROOT_ATTR}] .cp-links-list { display:grid; gap:8px; }
      [${ROOT_ATTR}] .cp-link-row { display:grid; grid-template-columns:minmax(140px,.7fr) minmax(260px,1.5fr) auto; gap:8px; align-items:center; }
      [${ROOT_ATTR}] input { min-width:0; width:100%; min-height:40px; border:1px solid #cbd5e1; border-radius:9px; background:#fff; padding:8px 10px; color:#0f172a; font-size:12px; outline:none; }
      [${ROOT_ATTR}] input:focus { border-color:#3b82f6; box-shadow:0 0 0 3px rgba(59,130,246,.12); }
      [${ROOT_ATTR}] button { min-height:40px; border-radius:9px; border:1px solid #cbd5e1; background:#fff; padding:8px 11px; font-size:12px; font-weight:750; cursor:pointer; }
      [${ROOT_ATTR}] button:hover { background:#f1f5f9; }
      [${ROOT_ATTR}] .cp-link-remove { color:#b42318; border-color:#fecaca; }
      [${ROOT_ATTR}] .cp-links-actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:10px; }
      [${ROOT_ATTR}] .cp-link-add { color:#1d4ed8; border-color:#bfdbfe; background:#eff6ff; }
      [${ROOT_ATTR}] .cp-link-publish { color:#065f46; border-color:#a7f3d0; background:#ecfdf5; }
      [${ROOT_ATTR}] .cp-links-status { min-height:18px; margin-top:7px; font-size:11px; color:#64748b; }
      @media (max-width: 640px) {
        [${ROOT_ATTR}] { padding:12px; border-radius:10px; }
        [${ROOT_ATTR}] .cp-links-head { display:block; }
        [${ROOT_ATTR}] .cp-link-row { grid-template-columns:1fr; gap:6px; padding:10px; border:1px solid #e2e8f0; border-radius:10px; background:#fff; }
        [${ROOT_ATTR}] input, [${ROOT_ATTR}] button { min-height:44px; font-size:14px; }
        [${ROOT_ATTR}] .cp-link-remove { width:100%; }
        [${ROOT_ATTR}] .cp-links-actions { display:grid; grid-template-columns:1fr; }
      }
    `;
    document.head.appendChild(style);
  };

  const findPublicHubTools = () => {
    const summaries = [...document.querySelectorAll('summary')];
    const summary = summaries.find(node => /public\s+hub\s+tools/i.test(node.textContent || ''));
    if (!summary) return null;
    return summary.closest('details');
  };

  const buttonByText = (root, pattern) => [...root.querySelectorAll('button')]
    .find(button => pattern.test((button.textContent || '').trim()));

  const renderEditor = () => {
    ensureStyles();
    const details = findPublicHubTools();
    if (!details || details.querySelector(`[${ROOT_ATTR}]`)) return;

    const body = [...details.children].find(node => node.tagName === 'DIV') || details;
    const root = document.createElement('div');
    root.setAttribute(ROOT_ATTR, 'v1');

    const head = document.createElement('div');
    head.className = 'cp-links-head';
    const heading = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'cp-links-title';
    title.textContent = 'Useful links';
    const help = document.createElement('div');
    help.className = 'cp-links-help';
    help.textContent = 'Add Regulations, hotel, live boards or other tournament links. PDF and Google Drive documents open inside the public Hub viewer.';
    heading.append(title, help);
    head.appendChild(heading);

    const list = document.createElement('div');
    list.className = 'cp-links-list';
    const status = document.createElement('div');
    status.className = 'cp-links-status';

    const rows = readLinks();
    if (!rows.length) rows.push({ label: 'Regulations', url: '' });

    const collectRows = () => normalizeLinks([...list.querySelectorAll('.cp-link-row')].map(row => ({
      label: row.querySelector('[data-link-label]')?.value || '',
      url: row.querySelector('[data-link-url]')?.value || ''
    })));

    const addRow = (value = { label: '', url: '' }) => {
      if (list.children.length >= MAX_LINKS) {
        status.textContent = `Maximum ${MAX_LINKS} links.`;
        return;
      }
      const row = document.createElement('div');
      row.className = 'cp-link-row';

      const label = document.createElement('input');
      label.type = 'text';
      label.placeholder = 'Link name (e.g. Regulations)';
      label.maxLength = 80;
      label.value = text(value.label);
      label.setAttribute('data-link-label', 'true');
      label.setAttribute('aria-label', 'Link name');

      const url = document.createElement('input');
      url.type = 'url';
      url.inputMode = 'url';
      url.placeholder = 'https://…';
      url.value = text(value.url);
      url.setAttribute('data-link-url', 'true');
      url.setAttribute('aria-label', 'Link URL');

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'cp-link-remove';
      remove.textContent = 'Remove';
      remove.addEventListener('click', () => row.remove());

      row.append(label, url, remove);
      list.appendChild(row);
    };

    rows.forEach(addRow);

    const actions = document.createElement('div');
    actions.className = 'cp-links-actions';

    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'cp-link-add';
    add.textContent = '+ Add link';
    add.addEventListener('click', () => addRow());

    const save = document.createElement('button');
    save.type = 'button';
    save.textContent = 'Save links';
    save.addEventListener('click', () => {
      try {
        const normalized = writeLinks(collectRows());
        status.textContent = `Saved ${normalized.length} link${normalized.length === 1 ? '' : 's'} locally. Cloud sync will follow automatically.`;
      } catch (error) {
        status.textContent = error?.message || String(error);
      }
    });

    const publish = document.createElement('button');
    publish.type = 'button';
    publish.className = 'cp-link-publish';
    publish.textContent = 'Save & Publish links';
    publish.addEventListener('click', () => {
      try {
        const normalized = writeLinks(collectRows());
        const publishButton = buttonByText(details, /^Publish Online$/i);
        if (!publishButton) throw new Error('Publish Online button is unavailable.');
        status.textContent = `Publishing ${normalized.length} link${normalized.length === 1 ? '' : 's'} to the public Hub…`;
        publishButton.click();
      } catch (error) {
        status.textContent = error?.message || String(error);
      }
    });

    actions.append(add, save, publish);
    root.append(head, list, actions, status);
    body.appendChild(root);
  };

  let queued = false;
  const queueRender = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      renderEditor();
    });
  };

  const observer = new MutationObserver(queueRender);
  const start = () => {
    observer.observe(document.documentElement, { childList: true, subtree: true });
    queueRender();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
