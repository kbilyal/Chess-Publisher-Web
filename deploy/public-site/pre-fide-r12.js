/* Chess-Publisher public site — Pre-FIDE r12 parallel release channel
   Stable remains authoritative and unchanged. Marker: pre-fide-r12-public-v1 */
(() => {
  'use strict';

  const VERSION = 'v1.06.00-beta.98-r12';
  const RELEASE_URL = 'https://github.com/kbilyal/ChessPublisher/releases/tag/v1.06.00-beta.98-r12-pre-fide';
  // Integrity anchor retained for the production regression gate.
  const EXE_ASSET = 'ChessPublisher-v1.06.00-beta.98-r12.exe';

  function cleanupLegacyHeroUi() {
    document.getElementById('heroPreFideDownload')?.remove();
    document.getElementById('releaseChannelStrip')?.remove();
  }

  function installStyles() {
    if (document.getElementById('pre-fide-r12-public-style')) return;
    const style = document.createElement('style');
    style.id = 'pre-fide-r12-public-style';
    style.textContent = `
      .pre-fide-release-note{
        grid-column:1/-1;
        width:100%;
        margin-top:18px;
        padding-top:14px;
        border-top:1px solid #e5ebf2;
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:16px;
        flex-wrap:wrap;
        color:#66778d;
        font-size:.8rem;
        line-height:1.5;
      }
      .pre-fide-release-copy{
        display:flex;
        align-items:center;
        gap:9px;
        flex-wrap:wrap;
        min-width:0;
      }
      .pre-fide-release-label{
        display:inline-flex;
        align-items:center;
        min-height:24px;
        padding:3px 8px;
        border:1px solid #cfd9e5;
        border-radius:999px;
        background:#f8fafc;
        color:#40536a;
        font-size:.64rem;
        font-weight:850;
        letter-spacing:.09em;
        text-transform:uppercase;
        white-space:nowrap;
      }
      .pre-fide-release-note strong{color:#22364d;font-weight:800}
      .pre-fide-release-note a{
        color:#315f8e;
        font-weight:800;
        text-decoration:none;
        white-space:nowrap;
      }
      .pre-fide-release-note a:hover{text-decoration:underline}
      .pre-fide-release-qualifier{color:#8794a5;font-size:.74rem}
      @media(max-width:640px){
        .pre-fide-release-note{align-items:flex-start;gap:8px}
        .pre-fide-release-note a{width:100%;padding-left:0}
      }
    `;
    document.head.appendChild(style);
  }

  function findDownloadSection() {
    const byId = document.getElementById('download');
    if (byId) return byId;
    const heading = Array.from(document.querySelectorAll('h2,h3')).find((node) =>
      /Download\s+Chess-Publisher/i.test(node.textContent || '')
    );
    return heading?.closest('section') || null;
  }

  function install() {
    cleanupLegacyHeroUi();
    installStyles();

    if (document.getElementById('preFideReleaseNote')) return true;

    const section = findDownloadSection();
    if (!section) return false;

    const host = section.querySelector('.shell') || section.firstElementChild || section;
    const note = document.createElement('div');
    note.id = 'preFideReleaseNote';
    note.className = 'pre-fide-release-note';
    note.setAttribute('aria-label', 'Pre-release testing channel');
    note.dataset.exeAsset = EXE_ASSET;
    note.innerHTML = `
      <div class="pre-fide-release-copy">
        <span class="pre-fide-release-label">Pre-release</span>
        <span><strong>TEC review build</strong> · ${VERSION}</span>
        <span class="pre-fide-release-qualifier">Testing channel · Stable remains recommended</span>
      </div>
      <a href="${RELEASE_URL}" target="_blank" rel="noopener">View release notes ↗</a>
    `;
    host.appendChild(note);

    document.documentElement.dataset.preFideRelease = VERSION;
    return true;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
})();
