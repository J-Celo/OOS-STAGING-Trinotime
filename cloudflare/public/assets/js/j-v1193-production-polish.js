/* TrinoTime v1.1.93 — Production Polish & UX Refinement
   Non-authoritative UX helpers only. Never reads/writes workforce or billing data. */
(() => {
  'use strict';
  const RELEASE = '1.1.93';
  const bannerId = 'ttConnectivityBanner';
  let hideTimer = 0;
  let hasGoneOffline = false;

  function getBanner() {
    let el = document.getElementById(bannerId);
    if (el) return el;
    el = document.createElement('div');
    el.id = bannerId;
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-atomic', 'true');
    el.hidden = true;
    document.body.appendChild(el);
    return el;
  }

  function showBanner(message, online = false, autoHide = false) {
    const el = getBanner();
    window.clearTimeout(hideTimer);
    el.textContent = message;
    el.classList.toggle('is-online', online);
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add('is-visible'));
    if (autoHide) {
      hideTimer = window.setTimeout(() => {
        el.classList.remove('is-visible');
        window.setTimeout(() => { el.hidden = true; }, 220);
      }, 3600);
    }
  }

  function handleOffline() {
    hasGoneOffline = true;
    document.documentElement.dataset.ttNetwork = 'offline';
    showBanner('You are offline. TrinoTime will retry supported sync actions when your connection returns.');
  }

  function handleOnline() {
    document.documentElement.dataset.ttNetwork = 'online';
    if (hasGoneOffline) showBanner('Back online. TrinoTime can resume sync.', true, true);
  }

  function boot() {
    document.documentElement.dataset.ttUxRelease = RELEASE;
    document.documentElement.dataset.ttNetwork = navigator.onLine ? 'online' : 'offline';
    if (!navigator.onLine) handleOffline();
    window.addEventListener('offline', handleOffline, { passive: true });
    window.addEventListener('online', handleOnline, { passive: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
