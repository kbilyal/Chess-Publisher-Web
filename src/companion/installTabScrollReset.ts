/*
 * Web Companion navigation polish.
 * UI behavior only: every workspace tab press returns the document to the top.
 * No tournament, sync, pairing, publication or registration data is changed.
 */

const INSTALL_FLAG = '__cpCompanionTabScrollResetInstalled';
const NAV_BUTTON_SELECTOR = '.companion-nav button, .companion-mobile-nav button';

type CompanionWindow = Window & { [INSTALL_FLAG]?: boolean };

const companionWindow = window as CompanionWindow;

if (!companionWindow[INSTALL_FLAG]) {
  companionWindow[INSTALL_FLAG] = true;

  document.addEventListener('click', event => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!target.closest(NAV_BUTTON_SELECTOR)) return;

    // Run after the tab click has been handled/rendered so every destination
    // starts from its natural top position, including tapping the active tab.
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    });
  });
}
