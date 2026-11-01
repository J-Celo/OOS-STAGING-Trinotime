(() => {
  'use strict';

  // TrinoTime v1.1.11 UI stability completion.
  // DOM presentation/accessibility only. No Firebase, App Check, reCAPTCHA,
  // Auth, database, API-key, permission, entitlement, or security-runtime access.
  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;

  function currentVersion() {
    const meta = document.querySelector('meta[name="trinotime-version"]');
    return String(meta?.content || '1.1.11').trim() || '1.1.11';
  }

  function isOpen(node) {
    return !!node && (node.classList.contains('open') || node.getAttribute('aria-hidden') === 'false');
  }

  function syncFloatingSurfaceState() {
    root.classList.toggle('tt-ai-chat-open', isOpen($('aiChatPanel')));
    root.classList.toggle('tt-profile-search-open', isOpen($('profileDirectorySearchDrawer')));
    root.classList.toggle('tt-leave-request-open', isOpen($('leaveRequestOverlay')));
  }

  function observeOpenState(id) {
    const node = $(id);
    if (!node) return;
    new MutationObserver(syncFloatingSurfaceState).observe(node, {
      attributes: true,
      attributeFilter: ['class', 'aria-hidden']
    });
  }

  function notificationCount() {
    const badge = $('notifBellBadge');
    if (!badge || !badge.classList.contains('show')) return 0;
    const raw = String(badge.textContent || '').trim();
    if (raw === '99+') return 99;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  }

  function syncNotificationA11y() {
    const bell = $('notifBellBtn');
    const badge = $('notifBellBadge');
    if (!bell || !badge) return;
    const count = notificationCount();
    bell.setAttribute('aria-label', count > 0
      ? `Open Notification Center, ${count >= 99 ? '99 or more' : count} unread notification${count === 1 ? '' : 's'}`
      : 'Open Notification Center');
    badge.setAttribute('aria-hidden', count > 0 ? 'false' : 'true');
  }

  function syncVersionDisplay() {
    const version = currentVersion();
    root.dataset.trinoUiRelease = version;
    document.querySelectorAll('[data-trinotime-version-display]').forEach((node) => {
      node.textContent = document.querySelector('meta[name="trinotime-display-version"]')?.content || version;
    });
    const build = $('gateReadinessBuildValue');
    if (build) build.textContent = `v${version}`;
  }

  function init() {
    ['aiChatPanel', 'profileDirectorySearchDrawer', 'leaveRequestOverlay'].forEach(observeOpenState);
    const badge = $('notifBellBadge');
    if (badge) {
      new MutationObserver(syncNotificationA11y).observe(badge, {
        attributes: true,
        attributeFilter: ['class'],
        childList: true,
        subtree: true,
        characterData: true
      });
    }
    syncFloatingSurfaceState();
    syncNotificationA11y();
    // Run last so older UI modules with legacy hard-coded labels cannot leave the
    // visible build number stale after this release is loaded.
    syncVersionDisplay();
    requestAnimationFrame(syncVersionDisplay);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
