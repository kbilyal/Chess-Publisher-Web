const PRINT_ROOT_ID = 'cp-organizer-pairings-print-root';
const PRINT_BODY_CLASS = 'cp-organizer-pairings-isolated-print';
let cleanupTimer: number | null = null;

function cleanupPrintClone() {
  document.body.classList.remove(PRINT_BODY_CLASS);
  document.getElementById(PRINT_ROOT_ID)?.remove();
  if (cleanupTimer !== null) {
    window.clearTimeout(cleanupTimer);
    cleanupTimer = null;
  }
}

function printIsolated(sheet: HTMLElement) {
  cleanupPrintClone();

  const root = document.createElement('div');
  root.id = PRINT_ROOT_ID;
  root.setAttribute('aria-hidden', 'false');

  const clone = sheet.cloneNode(true) as HTMLElement;
  clone.removeAttribute('aria-hidden');
  clone.setAttribute('data-isolated-print-sheet', 'true');
  root.appendChild(clone);
  document.body.appendChild(root);
  document.body.classList.add(PRINT_BODY_CLASS);

  const finish = () => cleanupPrintClone();
  window.addEventListener('afterprint', finish, { once: true });
  cleanupTimer = window.setTimeout(finish, 30000);

  // Two animation frames guarantee that the cloned bulletin has entered layout
  // before Chromium takes its print snapshot.
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => window.print());
  });
}

// Capture before React's delegated click handler. This prevents the legacy
// in-place print path from running and removes all dependency on App wrappers.
document.addEventListener('click', event => {
  const target = event.target instanceof Element ? event.target.closest('.organizer-pairings-print') : null;
  if (!target) return;

  const panel = target.closest('.organizer-pairings-panel');
  const sheet = panel?.querySelector<HTMLElement>('.organizer-pairings-print-sheet');
  if (!sheet) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  printIsolated(sheet);
}, true);
