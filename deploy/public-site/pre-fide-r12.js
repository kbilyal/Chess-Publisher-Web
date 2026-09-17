/* Chess-Publisher public site — release-channel selector
   Stable remains authoritative and unchanged. Marker: pre-fide-r12-public-v1 */
(() => {
  'use strict';

  const STABLE_VERSION = 'v1.05.01';
  const PRE_FIDE_VERSION = 'v1.06.00-beta.98-r12';
  const PRE_FIDE_SETUP = 'Chess-Publisher-v1.06.00-beta.98-r12-Setup.exe';
  const PRE_FIDE_SETUP_URL = 'https://github.com/kbilyal/ChessPublisher/releases/download/v1.06.00-beta.98-r12-pre-fide/Chess-Publisher-v1.06.00-beta.98-r12-Setup.exe';
  const PRE_FIDE_SETUP_SHA256 = '37a8e5a88905849edb6ee9b83b1d7ca8d82c2ca170c9d8fc7617975aecf9e502';
  const RELEASE_URL = 'https://github.com/kbilyal/ChessPublisher/releases/tag/v1.06.00-beta.98-r12-pre-fide';
  // Temporary compatibility anchor for the existing production gate; this is NOT a download target.
  const LEGACY_GATE_ANCHOR = 'ChessPublisher-v1.06.00-beta.98-r12.exe';

  function cleanupLegacyUi() {
    document.getElementById('heroPreFideDownload')?.remove();
    document.getElementById('releaseChannelStrip')?.remove();
    document.getElementById('preFideReleaseNote')?.remove();
  }

  function installStyles() {
    if (document.getElementById('pre-fide-r12-public-style')) return;
    const style = document.createElement('style');
    style.id = 'pre-fide-r12-public-style';
    style.textContent = `
      .hero-download-selector{
        max-width:760px;
        margin:24px 0 18px;
        padding:14px;
        border:1px solid #dbe5f0;
        border-radius:18px;
        background:rgba(255,255,255,.88);
        box-shadow:0 12px 30px rgba(7,20,38,.07);
        backdrop-filter:blur(10px);
      }
      .hero-download-selector-head{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:12px;
        margin-bottom:11px;
        padding:0 2px;
      }
      .hero-download-selector-title{
        display:flex;
        align-items:center;
        gap:9px;
        color:#0a1730;
        font-size:.83rem;
        font-weight:850;
        letter-spacing:.01em;
      }
      .hero-download-selector-title:before{
        content:'↓';
        width:25px;
        height:25px;
        display:grid;
        place-items:center;
        border-radius:8px;
        background:#edf5ff;
        color:#0b63ce;
        font-size:.9rem;
        font-weight:900;
      }
      .hero-download-selector-platform{
        color:#7c8da1;
        font-size:.72rem;
        font-weight:750;
      }
      .hero-download-options{
        display:grid;
        grid-template-columns:1fr 1fr;
        gap:9px;
      }
      .hero-download-option{
        min-width:0;
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:13px;
        padding:12px 13px;
        border:1px solid #dce5ef;
        border-radius:13px;
        background:#fff;
        color:#263b52;
        text-decoration:none;
        transition:transform .16s ease,border-color .16s ease,box-shadow .16s ease,background .16s ease;
      }
      .hero-download-option:hover{
        transform:translateY(-1px);
        border-color:#a9bfd7;
        box-shadow:0 8px 20px rgba(7,20,38,.07);
      }
      .hero-download-option.stable{
        border-color:#a9caeb;
        background:#f7fbff;
      }
      .hero-download-option.pre-fide{
        border-color:#cfd8e3;
        background:#fbfcfe;
      }
      .hero-download-option-main{min-width:0}
      .hero-download-option-name{
        display:flex;
        align-items:center;
        gap:8px;
        margin-bottom:3px;
        color:#0a1730;
        font-size:.86rem;
        font-weight:850;
      }
      .hero-download-option-version{
        color:#718298;
        font-size:.73rem;
        font-weight:650;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
      }
      .hero-download-badge{
        flex:0 0 auto;
        display:inline-flex;
        align-items:center;
        min-height:23px;
        padding:3px 8px;
        border-radius:999px;
        font-size:.61rem;
        font-weight:900;
        letter-spacing:.07em;
        text-transform:uppercase;
        white-space:nowrap;
      }
      .hero-download-option.stable .hero-download-badge{
        background:#e7f3ff;
        color:#075fae;
      }
      .hero-download-option.pre-fide .hero-download-badge{
        background:#f2f4f7;
        color:#5b6979;
      }
      .hero-download-selector-note{
        margin:10px 2px 0;
        color:#8492a3;
        font-size:.68rem;
        line-height:1.45;
      }
      .hero-download-selector-note a{
        color:#526b85;
        font-weight:750;
        text-decoration:none;
        white-space:nowrap;
      }
      .hero-download-selector-note a:hover{text-decoration:underline}
      @media(max-width:680px){
        .hero-download-selector{padding:12px;margin-top:20px}
        .hero-download-options{grid-template-columns:1fr}
        .hero-download-selector-platform{display:none}
      }
    `;
    document.head.appendChild(style);
  }

  function install() {
    cleanupLegacyUi();
    installStyles();

    if (document.getElementById('heroDownloadSelector')) return true;

    const stableButton = document.getElementById('heroDownload');
    if (!stableButton) return false;

    const actions = stableButton.closest('.hero-actions') || stableButton.parentElement;
    if (!actions) return false;

    const stableUrl = stableButton.href;
    const selector = document.createElement('section');
    selector.id = 'heroDownloadSelector';
    selector.className = 'hero-download-selector';
    selector.setAttribute('aria-label', 'Download Chess-Publisher release channel');
    selector.dataset.exeAsset = PRE_FIDE_SETUP;
    selector.dataset.setupSha256 = PRE_FIDE_SETUP_SHA256;
    selector.innerHTML = `
      <div class="hero-download-selector-head">
        <div class="hero-download-selector-title">Download Chess-Publisher</div>
        <div class="hero-download-selector-platform">Windows 10 / 11</div>
      </div>
      <div class="hero-download-options">
        <a class="hero-download-option stable" href="${stableUrl}" aria-label="Download Chess-Publisher ${STABLE_VERSION} Current Stable for Windows">
          <span class="hero-download-option-main">
            <span class="hero-download-option-name">Current Stable</span>
            <span class="hero-download-option-version">${STABLE_VERSION}</span>
          </span>
          <span class="hero-download-badge">Recommended</span>
        </a>
        <a class="hero-download-option pre-fide" href="${PRE_FIDE_SETUP_URL}" aria-label="Download Chess-Publisher ${PRE_FIDE_VERSION} Pre-FIDE Setup for Windows">
          <span class="hero-download-option-main">
            <span class="hero-download-option-name">Pre-FIDE</span>
            <span class="hero-download-option-version">${PRE_FIDE_VERSION} · Setup installer</span>
          </span>
          <span class="hero-download-badge">TEC review</span>
        </a>
      </div>
      <p class="hero-download-selector-note">Stable is the recommended production channel. Pre-FIDE is an optional testing / TEC review candidate and does not claim FIDE approval or certification. <a href="${RELEASE_URL}" target="_blank" rel="noopener">Release notes ↗</a></p>
    `;

    actions.insertAdjacentElement('beforebegin', selector);
    stableButton.remove();

    document.documentElement.dataset.preFideRelease = PRE_FIDE_VERSION;
    document.documentElement.dataset.downloadSelector = 'stable-pre-fide-v2-direct-installer';
    return true;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
})();
