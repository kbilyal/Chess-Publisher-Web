const TOURNAMENT_STORAGE_KEY = 'fide_tournament_manager_v2';
const DELETE_BUTTON_SELECTOR = '.companion-roster-row .companion-icon-danger';
const LOCK_ATTR = 'data-registration-delete-locked';

function hasGeneratedRound(): boolean {
  try {
    const raw = localStorage.getItem(TOURNAMENT_STORAGE_KEY);
    if (!raw) return false;
    const tournament = JSON.parse(raw) as any;
    const liveBoards = tournament?.pairings?.liveBoards;
    if (!liveBoards || typeof liveBoards !== 'object') return false;
    return Object.keys(liveBoards).some(key => Number(key) > 0);
  } catch {
    return false;
  }
}

function applyDeleteLock(): void {
  const locked = hasGeneratedRound();
  document.querySelectorAll<HTMLButtonElement>(DELETE_BUTTON_SELECTOR).forEach(button => {
    if (locked) {
      button.disabled = true;
      button.setAttribute(LOCK_ATTR, 'true');
      button.setAttribute('aria-disabled', 'true');
      button.title = 'Player removal is locked after pairings are generated.';
      return;
    }

    if (button.getAttribute(LOCK_ATTR) === 'true') {
      button.removeAttribute(LOCK_ATTR);
      button.removeAttribute('aria-disabled');
      button.removeAttribute('title');
      button.disabled = false;
    }
  });
}

function blockLockedDelete(event: Event): void {
  const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>(DELETE_BUTTON_SELECTOR) : null;
  if (!target || !hasGeneratedRound()) return;
  event.preventDefault();
  event.stopPropagation();
  target.disabled = true;
  target.setAttribute(LOCK_ATTR, 'true');
  target.setAttribute('aria-disabled', 'true');
  target.title = 'Player removal is locked after pairings are generated.';
}

const scheduleApply = () => window.requestAnimationFrame(applyDeleteLock);

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const observer = new MutationObserver(scheduleApply);
  const start = () => {
    applyDeleteLock();
    observer.observe(document.body, { childList: true, subtree: true });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();

  document.addEventListener('click', blockLockedDelete, true);
  window.addEventListener('storage', scheduleApply);
  window.setInterval(applyDeleteLock, 1000);
}
