const DELETE_BUTTON_SELECTOR = '.companion-roster-row .companion-icon-danger';
const STATUS_SELECTOR = '.companion-roster-row .companion-attendance';
const LOCK_ATTR = 'data-registration-delete-locked';
const STYLE_ID = 'cp-registration-roster-guard-style';

function isRegistrationLocked(): boolean {
  const sections = Array.from(document.querySelectorAll<HTMLElement>('.companion-registration-card'));
  const rosterSection = sections.find(section => section.querySelector('.companion-roster-list'));
  const headingText = rosterSection?.querySelector('.companion-registration-heading p')?.textContent || '';
  return /starting numbers are locked/i.test(headingText);
}

function ensureRosterStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    ${STATUS_SELECTOR}{display:none!important}
    .companion-registration .companion-icon-danger[${LOCK_ATTR}="true"]{
      border-color:#d8dee8!important;
      background:#f3f5f8!important;
      color:#aab3c0!important;
      opacity:.72!important;
      cursor:not-allowed!important;
      pointer-events:none!important;
      box-shadow:none!important;
    }
  `;
  document.head.appendChild(style);
}

function applyRegistrationRosterRules(): void {
  ensureRosterStyle();
  const locked = isRegistrationLocked();

  document.querySelectorAll<HTMLSelectElement>(STATUS_SELECTOR).forEach(select => {
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');
  });

  document.querySelectorAll<HTMLButtonElement>(DELETE_BUTTON_SELECTOR).forEach(button => {
    if (locked) {
      button.disabled = true;
      button.setAttribute(LOCK_ATTR, 'true');
      button.setAttribute('aria-disabled', 'true');
      button.title = 'Player removal is locked after Round 1 pairings are generated.';
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
  const target = event.target instanceof Element
    ? event.target.closest<HTMLButtonElement>(DELETE_BUTTON_SELECTOR)
    : null;
  if (!target || !isRegistrationLocked()) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  target.disabled = true;
  target.setAttribute(LOCK_ATTR, 'true');
  target.setAttribute('aria-disabled', 'true');
}

const scheduleApply = () => window.requestAnimationFrame(applyRegistrationRosterRules);

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const observer = new MutationObserver(scheduleApply);
  const start = () => {
    applyRegistrationRosterRules();
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();

  document.addEventListener('click', blockLockedDelete, true);
}
