/* TrinoTime v1.1.128 RC11 — Final UI Stabilization runtime.
   UI lifecycle only; no workforce data, authorization, or persistence changes. */
(() => {
  'use strict';
  const VERSION = '1.1.128-rc11-final-ui-stabilization';

  const norm = value => String(value || '').trim().toLowerCase();
  const isCloseTextButton = button => button && button.tagName === 'BUTTON' && norm(button.textContent) === 'close';
  const isTopCloseRegion = button => Boolean(button && button.closest(
    '.tt-tab-modal-head,.tt-tab-modal-actions,.history-head,.tl-status-detail-head,.backup-tl-handoff-head,.coaching-report-head,.speedtest-head,.announce-modal-header,.settings-modal-header,.profile-directory-fab-drawer-head,.ai-chat-head,.tt-wm-topbar'
  ));
  const isKnownTopClose = button => Boolean(button && (
    isTopCloseRegion(button) ||
    button.classList.contains('tt-tab-close-top') ||
    button.classList.contains('tt-sticky-close') ||
    button.classList.contains('coaching-report-close-top') ||
    button.classList.contains('totals-header-close')
  ));

  function retireDuplicateBottomClose(overlay, button) {
    const topClose = Array.from(overlay.querySelectorAll('button')).find(other => {
      if (other === button || other.hidden) return false;
      const aria = norm(other.getAttribute('aria-label'));
      return (aria.startsWith('close ') || isKnownTopClose(other)) && isKnownTopClose(other);
    });
    if (!topClose) return false;
    button.classList.add('tt-bottom-close-retired');
    button.setAttribute('aria-hidden', 'true');
    button.tabIndex = -1;
    const parent = button.parentElement;
    if (parent && parent.children.length === 1) parent.classList.add('tt-bottom-close-retired-row');
    return true;
  }

  function moveCloseToTop(overlay, button) {
    if (!overlay || !button || isKnownTopClose(button)) return;
    if (retireDuplicateBottomClose(overlay, button)) return;
    const box = button.closest('.modal-box');
    if (!box) return;
    let dock = Array.from(box.children).find(child => child.classList && child.classList.contains('tt-global-close-dock'));
    if (!dock) {
      dock = document.createElement('div');
      dock.className = 'tt-global-close-dock';
      dock.setAttribute('data-tt-global-close-dock', VERSION);
      box.prepend(dock);
    }
    button.classList.add('tt-global-close-top');
    if (!button.getAttribute('aria-label')) {
      const title = box.querySelector('[id$="Title"],.modal-title,h3,h2');
      button.setAttribute('aria-label', title ? `Close ${String(title.textContent || '').trim()}` : 'Close dialog');
    }
    dock.appendChild(button);
  }

  function normalizeModalCloseControls() {
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      Array.from(overlay.querySelectorAll('button')).filter(isCloseTextButton).forEach(button => moveCloseToTop(overlay, button));
    });
    document.documentElement.dataset.ttGlobalCloseSweep = VERSION;
  }

  function keepAiOnTop() {
    const floater = document.getElementById('aiChatFloater');
    if (floater) floater.dataset.ttUtilityLayer = 'top';
    const panel = document.getElementById('aiChatPanel');
    if (panel) panel.dataset.ttUtilityLayer = 'top';
  }

  function run() {
    normalizeModalCloseControls();
    keepAiOnTop();
  }

  run();
  setTimeout(run, 0);
  window.addEventListener('pageshow', run);
  window.TrinoTimeFinalUiStabilization = Object.freeze({ version: VERSION, refresh: run });
})();
