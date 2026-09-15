/* Chess-Publisher public site — Pre-FIDE r12 parallel release channel
   Stable remains authoritative and unchanged. Marker: pre-fide-r12-public-v1 */
(() => {
  'use strict';

  const VERSION = 'v1.06.00-beta.98-r12';
  const EXE_URL = 'https://github.com/kbilyal/ChessPublisher/releases/download/v1.06.00-beta.98-r12-pre-fide/ChessPublisher-v1.06.00-beta.98-r12.exe';
  const RELEASE_URL = 'https://github.com/kbilyal/ChessPublisher/releases/tag/v1.06.00-beta.98-r12-pre-fide';

  function installStyles() {
    if (document.getElementById('pre-fide-r12-public-style')) return;
    const style = document.createElement('style');
    style.id = 'pre-fide-r12-public-style';
    style.textContent = `
      .pre-fide-download{position:relative;border-color:#87a8cb!important;background:#f5f9ff!important;color:#123d68!important}
      .pre-fide-download:hover{background:#eaf3ff!important;border-color:#5f8fbe!important}
      .release-channel-strip{display:flex;gap:10px;flex-wrap:wrap;align-items:stretch;margin-top:15px;max-width:790px}
      .release-channel-card{display:flex;align-items:center;gap:10px;min-height:42px;padding:9px 12px;border:1px solid #dce6f1;border-radius:13px;background:#fff;color:#52667d;font-size:.79rem;line-height:1.35;box-shadow:0 5px 16px rgba(7,20,38,.04)}
      .release-channel-card strong{color:#0a1730;font-size:.8rem;white-space:nowrap}
      .release-channel-card.pre-fide{border-color:#b8cee5;background:#f8fbff}
      .release-channel-card.pre-fide strong{color:#0b63ce}
      .release-channel-card a{font-weight:800;color:#0b63ce;text-decoration:none;white-space:nowrap}
      .release-channel-card a:hover{text-decoration:underline}
      .pre-fide-disclaimer{width:100%;margin:0;color:#75869a;font-size:.72rem;line-height:1.45}
      @media(max-width:640px){
        .release-channel-strip{display:grid;grid-template-columns:1fr;width:100%}
        .release-channel-card{width:100%;justify-content:space-between}
        .pre-fide-download{width:100%;text-align:center}
      }
    `;
    document.head.appendChild(style);
  }

  function install() {
    const stable = document.getElementById('heroDownload');
    if (!stable) return false;
    installStyles();

    const actions = stable.closest('.hero-actions') || stable.parentElement;
    if (!actions) return false;

    if (!document.getElementById('heroPreFideDownload')) {
      const button = document.createElement('a');
      button.id = 'heroPreFideDownload';
      button.className = 'button button-secondary pre-fide-download';
      button.href = EXE_URL;
      button.textContent = 'Download Pre-FIDE r12';
      button.setAttribute('aria-label', `Download Chess-Publisher ${VERSION} Pre-FIDE Windows executable`);
      stable.insertAdjacentElement('afterend', button);
    }

    if (!document.getElementById('releaseChannelStrip')) {
      const strip = document.createElement('div');
      strip.id = 'releaseChannelStrip';
      strip.className = 'release-channel-strip';
      strip.setAttribute('aria-label', 'Chess-Publisher release channels');
      strip.innerHTML = `
        <div class="release-channel-card stable"><strong>Stable</strong><span>v1.05.01 · recommended production channel</span></div>
        <div class="release-channel-card pre-fide"><strong>Pre-FIDE</strong><span>${VERSION} · TEC review candidate</span><a href="${RELEASE_URL}">Release notes →</a></div>
        <p class="pre-fide-disclaimer">Pre-FIDE is a review candidate and does not claim FIDE approval or certification. Stable remains available in parallel and is not replaced.</p>
      `;
      actions.insertAdjacentElement('afterend', strip);
    }

    document.documentElement.dataset.preFideRelease = VERSION;
    return true;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
})();
