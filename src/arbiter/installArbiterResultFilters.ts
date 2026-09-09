type ArbiterResultFilter = 'all' | 'missing';

const FILTER_ROOT_ID = 'cp-arbiter-result-filter-root';
let currentFilter: ArbiterResultFilter = 'all';
let observer: MutationObserver | null = null;

function isMissingResultCard(card: Element) {
  const sendButton = card.querySelector<HTMLButtonElement>('.arbiter-send');
  if (!sendButton) return false;
  return /send result/i.test(sendButton.textContent || '');
}

function applyFilter() {
  const cards = [...document.querySelectorAll<HTMLElement>('.arbiter-board-card')];
  const missingCount = cards.filter(isMissingResultCard).length;

  for (const card of cards) {
    const hidden = currentFilter === 'missing' && !isMissingResultCard(card);
    card.classList.toggle('cp-arbiter-filter-hidden', hidden);
  }

  const root = document.getElementById(FILTER_ROOT_ID);
  if (!root) return;
  const allButton = root.querySelector<HTMLButtonElement>('[data-filter="all"]');
  const missingButton = root.querySelector<HTMLButtonElement>('[data-filter="missing"]');
  if (allButton) {
    allButton.textContent = `All (${cards.length})`;
    allButton.classList.toggle('active', currentFilter === 'all');
    allButton.setAttribute('aria-pressed', currentFilter === 'all' ? 'true' : 'false');
  }
  if (missingButton) {
    missingButton.textContent = `Missing (${missingCount})`;
    missingButton.classList.toggle('active', currentFilter === 'missing');
    missingButton.setAttribute('aria-pressed', currentFilter === 'missing' ? 'true' : 'false');
  }
}

function removeFilterRoot() {
  document.getElementById(FILTER_ROOT_ID)?.remove();
}

function ensureFilterRoot() {
  const shell = document.querySelector('.arbiter-shell');
  if (!shell) {
    removeFilterRoot();
    return;
  }

  let root = document.getElementById(FILTER_ROOT_ID);
  if (!root) {
    root = document.createElement('div');
    root.id = FILTER_ROOT_ID;
    root.className = 'cp-arbiter-result-filter';
    root.setAttribute('role', 'group');
    root.setAttribute('aria-label', 'Filter pairings by result status');
    root.innerHTML = `
      <span>Results</span>
      <button type="button" data-filter="all" aria-pressed="true">All</button>
      <button type="button" data-filter="missing" aria-pressed="false">Missing</button>
    `;
    root.addEventListener('click', event => {
      const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button[data-filter]') : null;
      if (!button) return;
      currentFilter = button.dataset.filter === 'missing' ? 'missing' : 'all';
      applyFilter();
    });
    document.body.appendChild(root);
  }

  applyFilter();
}

function refreshFilters() {
  ensureFilterRoot();
  applyFilter();
}

if (typeof document !== 'undefined') {
  const start = () => {
    refreshFilters();
    observer?.disconnect();
    observer = new MutationObserver(() => refreshFilters());
    const root = document.getElementById('root') || document.body;
    observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'disabled'] });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}
