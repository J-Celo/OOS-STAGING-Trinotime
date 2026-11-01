/* TrinoTime OOS — RC2 staging compact operational workspaces, 2026-10-15.
 * Presentation/navigation only: no storage, session, API, Firebase, or Tracker writes.
 */
(() => {
  'use strict';
  if (window.__ttCompactWorkspacesV1) return;
  window.__ttCompactWorkspacesV1 = true;

  const WORKSPACES = Object.freeze({
    coverage: 'ttCoverageRoot',
    confirmation: 'ttConfirmationRoot',
    metrics: 'ttMetricsRoot',
    'pod-work': 'ttPodDispatchRoot'
  });
  const ACTIVE_CLASS = 'tt-compact-ops-workspace';
  let generation = 0;
  let activeView = '';
  let requestedView = '';
  let userInterrupted = false;

  function signedInShell() {
    const shell = document.getElementById('appRoot');
    if (!shell || shell.inert || shell.getAttribute('aria-hidden') === 'true') return false;
    // Do not turn on the compact layout during the hidden login transition.
    return window.getComputedStyle(shell).visibility !== 'hidden';
  }

  function visibleRoot(view) {
    const node = document.getElementById(WORKSPACES[view]);
    if (!node || !node.isConnected || node.hidden || node.closest('[hidden]')) return null;
    if (window.getComputedStyle(node).display === 'none') return null;
    return node;
  }

  function currentVisibleView() {
    // If two workspaces are momentarily visible during navigation, the most
    // recently requested route wins rather than briefly exposing an old one.
    if (requestedView && visibleRoot(requestedView)) return requestedView;
    for (const view of Object.keys(WORKSPACES)) {
      if (visibleRoot(view)) return view;
    }
    return '';
  }

  function scrollPanelIntoView(root) {
    if (userInterrupted) return;
    root.style.scrollMarginTop = '14px';
    try {
      root.scrollIntoView({block:'start', inline:'nearest', behavior:'instant'});
    } catch (_) {
      root.scrollIntoView({block:'start', inline:'nearest', behavior:'auto'});
    }
  }

  function syncLayout({reveal = false} = {}) {
    const view = signedInShell() ? currentVisibleView() : '';
    const changed = view !== activeView;
    activeView = view;
    document.documentElement.classList.toggle(ACTIVE_CLASS, Boolean(view));
    if (view) {
      document.documentElement.dataset.ttCompactView = view;
      if ((reveal || changed) && (!requestedView || view === requestedView)) {
        const root = visibleRoot(view);
        if (root) scrollPanelIntoView(root);
      }
    } else {
      delete document.documentElement.dataset.ttCompactView;
    }
    return view;
  }

  // Wait a bounded number of frames for the existing code to show the correct
  // root; do not permanently observe all app DOM mutations or poll the page.
  function afterNavigation(ticket, frame = 0) {
    if (ticket !== generation) return;
    const before = activeView;
    const view = syncLayout({reveal: frame === 1});
    const pending = requestedView ? view !== requestedView : view !== '';
    if (!requestedView && !view && before && !userInterrupted && typeof window.scrollTo === 'function') {
      // Restored Dashboard/Attendance/other standard view has its tall header.
      // Return to the top rather than leaving it hidden above the viewport.
      try { window.scrollTo({top:0,left:0,behavior:'instant'}); }
      catch (_) { window.scrollTo(0,0); }
    }
    if (pending && frame < 45) {
      window.requestAnimationFrame(() => afterNavigation(ticket, frame + 1));
      return;
    }
    // One post-layout confirmation; do not fight the user's own scrolling.
    if (view && frame === 1 && !userInterrupted) {
      window.requestAnimationFrame(() => {
        if (ticket === generation) syncLayout();
      });
    }
  }

  function navigate(view) {
    requestedView = Object.prototype.hasOwnProperty.call(WORKSPACES, view) ? view : '';
    userInterrupted = false;
    const ticket = ++generation;
    window.requestAnimationFrame(() => afterNavigation(ticket, 1));
  }

  // Supports both Premium sidebar and existing small-screen workspace tabs.
  document.addEventListener('click', event => {
    const btn = event.target?.closest?.('[data-tt-nav],[data-tt-workspace]');
    if (!btn || btn.disabled || !(
      btn.closest('#ttPremiumSidebar .tt-premium-nav') ||
      btn.closest('#ttCoverageWorkspaceTabs')
    )) return;
    navigate(btn.dataset.ttNav || btn.dataset.ttWorkspace || '');
  }, true);

  // The app uses this existing event when navigating between workspaces.
  document.addEventListener('trinotime:workspace-opening', event => {
    const view = typeof event.detail === 'string' ? event.detail : '';
    navigate(view);
  });

  // If a user scrolls intentionally, do not keep snapping the page back.
  for (const type of ['wheel','touchstart','keydown']) {
    document.addEventListener(type, event => {
      if (type === 'keydown' && !['PageDown','PageUp','ArrowUp','ArrowDown','Home','End',' '].includes(event.key)) return;
      userInterrupted = true;
    }, {capture: true, passive: true});
  }

  // Leave compact mode on logout, even if a former root was left unhidden.
  const shell = document.getElementById('appRoot');
  if (shell && typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver(() => {
      if (!signedInShell()) {
        requestedView = '';
        activeView = '';
        generation++;
        document.documentElement.classList.remove(ACTIVE_CLASS);
        delete document.documentElement.dataset.ttCompactView;
      }
    });
    observer.observe(shell, {attributes:true,attributeFilter:['style','inert','aria-hidden','hidden']});
  }

  // Recover if this file loads while an operational workspace is already open.
  syncLayout();
})();
