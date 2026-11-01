(() => {
  'use strict';
  if (window.__ttTrackerDownloadBuild) return;
  window.__ttTrackerDownloadBuild = 'RC2-STAGING-TRACKER-ZIP-2.2.62-20261024';

  // STAGING ONLY: link to the existing governed staging ZIP endpoint, not the
  // production Chrome Web Store listing. Keep the installed unpacked extension
  // and its local pending work; do not treat the ZIP as an auto-update.
  const TRACKER_ENV = 'STAGING QA';
  const TRACKER_DOWNLOAD_PATH = '/api/workforce/governance/qc-tracker-download';
  let trackerVersion = '2.2.62'; // Offline fallback; update from staging-only release feed.
  const linkIcon = () => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4"></path><path d="M5 17v3h14v-3"></path></svg>';

  function decorateLink(link, type) {
    const filename = `TrinoTime-QC-Tracker-v${trackerVersion}.zip`;
    link.href = TRACKER_DOWNLOAD_PATH;
    link.setAttribute('download', filename);
    link.removeAttribute('target');
    link.removeAttribute('rel');
    link.dataset.ttTrackerDownload = type;
    link.setAttribute('aria-label', `Download TrinoTime QC Tracker v${trackerVersion} STAGING QA ZIP`);
    link.title = `Download STAGING QA Tracker v${trackerVersion} ZIP (update existing unpacked extension; do not remove pending work)`;
    if (type === 'premium') {
      link.className = 'tt-premium-nav-btn tt-tracker-download-premium tt-tracker-qa-download';
      link.dataset.ttTooltip = `Download staging Tracker v${trackerVersion} ZIP`;
      link.innerHTML = `${linkIcon()}<span class="tt-nav-label">QC Tracker</span><span class="tt-tracker-download-badge">STG ZIP</span>`;
    } else {
      link.className = 'tt-coverage-workspace-tab tt-tracker-download-standard tt-tracker-qa-download';
      link.innerHTML = `${linkIcon()}<span class="tt-tracker-download-standard-label">Tracker ZIP</span><span class="tt-tracker-download-stg">STG</span>`;
    }
    return link;
  }

  function ensureLink(nav, type) {
    if (!nav) return null;
    let link = nav.querySelector(`[data-tt-tracker-download="${type}"]`);
    // Replace any old Web Store CTA or stale button, without keeping its handler.
    if (link && (link.tagName !== 'A' || link.getAttribute('href') !== TRACKER_DOWNLOAD_PATH || !link.hasAttribute('download'))) {
      const replacement = decorateLink(document.createElement('a'), type);
      link.replaceWith(replacement);
      link = replacement;
    }
    if (!link) link = decorateLink(document.createElement('a'), type);
    else if (link.getAttribute('download') !== `TrinoTime-QC-Tracker-v${trackerVersion}.zip`) decorateLink(link, type);
    const before = type === 'standard'
      ? nav.querySelector('[data-tt-nav="metrics"]')
      : nav.querySelector('[data-tt-nav="install"]');
    if (before && link.previousElementSibling !== before) before.insertAdjacentElement('afterend', link);
    else if (!link.isConnected) nav.appendChild(link);
    return link;
  }

  function ensureLinks() {
    ensureLink(document.getElementById('ttCoverageWorkspaceTabs'), 'standard');
    ensureLink(document.querySelector('#ttPremiumSidebar .tt-premium-nav'), 'premium');
  }

  async function loadCurrentTrackerRelease() {
    try {
      const response = await fetch('/downloads/qc-tracker-current.json', {cache:'no-store', credentials:'same-origin'});
      if (!response.ok) return;
      const release = await response.json();
      if (release?.schema !== 'trinotime-qc-tracker-release-v1' || release.channel !== 'staging-qa'
        || release.downloadUrl !== TRACKER_DOWNLOAD_PATH || !/^\d+\.\d+\.\d+$/.test(release.version)) return;
      trackerVersion = release.version;
      // Updating the label does not alter the governed ZIP path or permissions.
      for (const link of document.querySelectorAll('[data-tt-tracker-download]')) {
        if (link.tagName === 'A') decorateLink(link, link.dataset.ttTrackerDownload);
      }
    } catch { /* Offline: keep the local staging-only fallback. */ }
  }

  function start() {
    ensureLinks();
    void loadCurrentTrackerRelease();
    const root = document.getElementById('appRoot') || document.body;
    if (root) new MutationObserver(ensureLinks).observe(root, {childList: true, subtree: false});
    new MutationObserver(() => setTimeout(ensureLinks, 0)).observe(document.documentElement, {
      attributes: true, attributeFilter: ['data-trino-custom-workspace']
    });
    document.addEventListener('trinotime:workspace-opening', ensureLinks);
    window.addEventListener('pageshow', ensureLinks);
    [250, 800, 1800].forEach(ms => setTimeout(ensureLinks, ms));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once: true});
  else start();
})();
