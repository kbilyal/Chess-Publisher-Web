/* hub-useful-links-organizer-v2: publish bridge only; native editor lives in CompanionSetup. */
(() => {
  'use strict';

  const STORAGE_KEY = 'fide_tournament_manager_v2';
  const SNAPSHOT_PATH = /\/api\/v1\/organizer\/tournaments\/[^/]+\/snapshot(?:$|\?)/;
  const MAX_LINKS = 12;

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

  const readLinks = () => {
    try {
      const tournament = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      return normalizeLinks(tournament?.regulations?.usefulLinks);
    } catch (_) {
      return [];
    }
  };

  const nativeFetch = window.fetch?.bind(window);
  if (!nativeFetch) return;

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
})();
