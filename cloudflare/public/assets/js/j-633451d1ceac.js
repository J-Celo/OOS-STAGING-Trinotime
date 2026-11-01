(() => {
  'use strict';

  // TrinoTime v1.1.9 UI hotfix - navigation presentation only.
  // This module does not initialize, configure, read from, or write to Firebase,
  // App Check, reCAPTCHA, Auth, Realtime Database, API keys, permissions, or entitlements.
  const VERSION = document.querySelector('meta[name="trinotime-display-version"]')?.content || document.querySelector('meta[name="trinotime-version"]')?.content || '2.0.3';
  const $ = (id) => document.getElementById(id);

  function isPremiumWorkspace() {
    const html = document.documentElement;
    return html.dataset.trinoTier === 'premium' ||
      html.getAttribute('data-trino-custom-workspace') === 'enabled';
  }

  function clearInjectedBreaks() {
    document.querySelectorAll('.tt-action-account-break, .tt-action-secondary-break').forEach((node) => node.remove());
  }

  let settingsSource = 'settings';
  let settingsWasOpen = false;

  const overlayMap = [
    { overlay: 'dayOffOverlay', button: 'openDayOffBtn' },
    { overlay: 'speedtestOverlay', button: 'headerSpeedtestBtn' },
    { overlay: 'announceOverlay', button: 'notifBellBtn' }
  ];

  function isOpen(node) {
    return !!node && node.classList.contains('open');
  }

  function setActive(button, active) {
    if (!button) return;
    button.classList.toggle('tt-action-active', !!active);
    if (button.hasAttribute('aria-haspopup') || button.hasAttribute('aria-controls')) {
      button.setAttribute('aria-expanded', active ? 'true' : 'false');
    }
  }

  function syncActiveStates() {
    if (isPremiumWorkspace()) {
      overlayMap.forEach(({ button }) => setActive($(button), false));
      setActive($('openShiftGuidelinesBtn'), false);
      setActive($('settingsGearBtn'), false);
      settingsWasOpen = false;
      return;
    }
    overlayMap.forEach(({ overlay, button }) => setActive($(button), isOpen($(overlay))));

    const settingsOpen = isOpen($('settingsOverlay'));
    if (!settingsOpen && settingsWasOpen) settingsSource = 'settings';
    setActive($('openShiftGuidelinesBtn'), settingsOpen && settingsSource === 'guidelines');
    setActive($('settingsGearBtn'), settingsOpen && settingsSource !== 'guidelines');
    settingsWasOpen = settingsOpen;
  }

  function observeOverlay(id) {
    const overlay = $(id);
    if (!overlay) return;
    new MutationObserver(syncActiveStates).observe(overlay, { attributes: true, attributeFilter: ['class'] });
  }

  function syncAiFloatingControls() {
    const panel = $('aiChatPanel');
    document.documentElement.classList.toggle('tt-ai-chat-open', isOpen(panel));
  }

  function observeAiChatPanel() {
    const panel = $('aiChatPanel');
    if (!panel) return;
    new MutationObserver(syncAiFloatingControls).observe(panel, { attributes: true, attributeFilter: ['class'] });
    syncAiFloatingControls();
  }

  function ensureBreaks() {
    if (isPremiumWorkspace()) {
      clearInjectedBreaks();
      return;
    }
    const rail = document.querySelector('#appRoot > .band .action-rail');
    if (!rail) return;

    if (!rail.querySelector('.tt-action-account-break')) {
      const accountBreak = document.createElement('span');
      accountBreak.className = 'tt-action-account-break';
      accountBreak.setAttribute('aria-hidden', 'true');
      const accountAnchor = $('installAppBtn') || $('notifBellBtn') || $('settingsGearBtn') || $('sessionMeta');
      if (accountAnchor && accountAnchor.parentElement === rail) rail.insertBefore(accountBreak, accountAnchor);
    }

    if (!rail.querySelector('.tt-action-secondary-break')) {
      const secondaryBreak = document.createElement('span');
      secondaryBreak.className = 'tt-action-secondary-break';
      secondaryBreak.setAttribute('aria-hidden', 'true');
      const secondaryAnchor = $('appReloadBtn') || $('sessionLogoutBtn');
      if (secondaryAnchor && secondaryAnchor.parentElement === rail) rail.insertBefore(secondaryBreak, secondaryAnchor);
    }
  }

  function improveAria() {
    const relations = {
      openDayOffBtn: 'dayOffOverlay',
      headerSpeedtestBtn: 'speedtestOverlay',
      notifBellBtn: 'announceOverlay',
      settingsGearBtn: 'settingsOverlay',
      openShiftGuidelinesBtn: 'settingsOverlay'
    };
    Object.entries(relations).forEach(([buttonId, overlayId]) => {
      const button = $(buttonId);
      if (!button) return;
      button.setAttribute('aria-haspopup', 'dialog');
      button.setAttribute('aria-controls', overlayId);
      button.setAttribute('aria-expanded', 'false');
    });
  }

  function wireSourceTracking() {
    document.addEventListener('click', (event) => {
      if (event.target.closest?.('#openShiftGuidelinesBtn')) {
        settingsSource = 'guidelines';
        requestAnimationFrame(syncActiveStates);
        return;
      }
      if (event.target.closest?.('#settingsGearBtn') && event.isTrusted) {
        settingsSource = 'settings';
        requestAnimationFrame(syncActiveStates);
      }
    }, true);
  }

  function syncWorkspaceMode() {
    if (isPremiumWorkspace()) {
      clearInjectedBreaks();
      syncActiveStates();
      return;
    }
    ensureBreaks();
    syncActiveStates();
  }

  function observeWorkspaceMode() {
    new MutationObserver(syncWorkspaceMode).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-trino-tier', 'data-trino-custom-workspace']
    });
  }

  function stampRelease() {
    document.documentElement.dataset.trinoUiRelease = VERSION;
    document.querySelectorAll('[data-trinotime-version-display]').forEach((node) => { node.textContent = VERSION; });
    const build = $('gateReadinessBuildValue');
    if (build) build.textContent = `v${VERSION}`;
  }

  function init() {
    stampRelease();
    improveAria();
    wireSourceTracking();
    ['dayOffOverlay', 'speedtestOverlay', 'announceOverlay', 'settingsOverlay'].forEach(observeOverlay);
    observeAiChatPanel();
    observeWorkspaceMode();
    syncWorkspaceMode();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
