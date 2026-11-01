/* TrinoTime Version 3: one-time, agent-only welcome. No dependencies or polling.
 * The Worker atomically claims the account receipt BEFORE automatic display.
 * Local storage is a fast-path only. Server failure defers the optional tour,
 * never blocks sign-in and never displays an unacknowledged repeat.
 */
(() => {
  'use strict';
  if (window.TrinoTimeVersion3Welcome) return;
  const VERSION = '3.0.0';
  const STORAGE_PREFIX = 'trinotime:release-tour:3.0.0:';
  const RETRY_DELAYS = [3000, 12000, 30000];
  const seenThisPage = new Set();
  const attempts = new Map();
  let dialog = null, pageIndex = 0, timer = 0, busy = false, ending = false;
  let generation = 0, activeIdentity = '', observedIdentity = '', pendingDisplay = '';
  let returnFocus = null;
  const bridge = () => window.TrinoTimeCore?.releaseAnnouncement;
  const identity = () => {
    const actor = bridge()?.getActor?.();
    return actor?.role === 'agent' && String(actor.name || '').trim()
      ? 'agent:' + String(actor.name).trim().replace(/\s+/g, ' ').toLowerCase() : '';
  };
  const storageKey = key => STORAGE_PREFIX + encodeURIComponent(key);
  function alreadySeen(key) {
    if (seenThisPage.has(key)) return true;
    try { return localStorage.getItem(storageKey(key)) === VERSION; } catch (_) { return false; }
  }
  function remember(key) {
    seenThisPage.add(key);
    try { localStorage.setItem(storageKey(key), VERSION); } catch (_) {}
  }
  function visible(node) {
    if (!node || node.hidden || !node.getClientRects().length) return false;
    const style = getComputedStyle(node);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  }
  function ready() {
    if (ending || !identity() || bridge()?.ready?.() !== true || document.visibilityState === 'hidden') return false;
    const root = document.getElementById('appRoot');
    if (!root || !visible(root) || root.hasAttribute('inert') || document.body.classList.contains('agent-password-required')) return false;
    return !Array.from(document.querySelectorAll('dialog[open], [role="dialog"][aria-modal="true"], .modal-overlay.open'))
      .some(node => node !== dialog && visible(node));
  }
  const pages = [
    {
      icon:'\u2728', tag:'WELCOME TO VERSION 3', title:'Find your team. Get to work.',
      intro:'TrinoTime V 3.0.0 makes the welcome and sign-in journey clearer without changing your account.',
      items:[
        ['\ud83c\udfe2', 'Workstreams & PODs', 'Chemist Warehouse OOS, TESCO, KROGER and Onboarding are easier to find in the organized portal.'],
        ['\ud83d\udd10', 'Secure team sign-in', 'The Continue button sits below POD choices, and staff sign-in panels open only when needed.'],
        ['\u23f1\ufe0f', 'Attendance stays familiar', 'Your punches, breaks and past records use the same authorized attendance workflow.']
      ]
    },
    {
      icon:'\ud83d\udcca', tag:'OPERATIONS & INSIGHT', title:'Workspaces that help teams stay coordinated.',
      intro:'The tools you can see depend on your existing account permissions and assigned team.',
      items:[
        ['\ud83d\udccb', 'Coverage, Confirmation & Metrics', 'Find role-appropriate task progress and productivity summaries in their dedicated workspaces.'],
        ['\ud83d\udce6', 'Store Operations & Report Viewer', 'Authorized Team Leaders and Admins have queue, work-control and reporting tools under existing POD restrictions.'],
        ['\ud83d\udc65', 'OOS Coverage Beta QAs', 'A dedicated QA entry is prepared. Access still requires verified membership and Admin activation; production activation is on hold.']
      ]
    },
    {
      icon:'\ud83c\udf89', tag:'STAY CONNECTED', title:'You are ready for V 3.0.0.',
      intro:'Your normal workflows are preserved, with updated navigation and release information.',
      items:[
        ['\ud83d\udcac', 'Messaging, profiles & calls', 'Keep using your authorized conversations, profile, voice and video features.'],
        ['\ud83e\uddf0', 'QC Tracker v2.3.2', 'The production Chrome extension has a separate version from the TrinoTime application.'],
        ['\ud83d\udcd6', 'Revisit these updates', 'Read these highlights again in Notifications or Settings under What\'s New.']
      ]
    }
  ];
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  }
  function renderPage(next) {
    pageIndex = Math.max(0, Math.min(pages.length - 1, next));
    const page = pages[pageIndex];
    dialog.querySelector('[data-v2-content]').innerHTML = `
      <div class="tt-v2-page-heading"><span class="tt-v2-page-icon" aria-hidden="true">${page.icon}</span>
        <div><p class="tt-v2-eyebrow">${page.tag}</p><h3 id="tt-v2-page-title">${page.title}</h3></div></div>
      <p class="tt-v2-intro">${page.intro}</p>
      <div class="tt-v2-features">${page.items.map(([icon, title, body]) => `
        <div class="tt-v2-feature"><span class="tt-v2-feature-icon" aria-hidden="true">${icon}</span>
          <div><h4>${escapeHtml(title)}</h4><p>${escapeHtml(body)}</p></div></div>`).join('')}</div>`;
    dialog.querySelector('[data-v2-status]').textContent = `Page ${pageIndex + 1} of ${pages.length}`;
    dialog.querySelector('[data-v2-back]').disabled = pageIndex === 0;
    dialog.querySelector('[data-v2-next]').textContent = pageIndex === pages.length - 1 ? "Let's go!" : 'Next \u2192';
    dialog.querySelectorAll('[data-v2-page]').forEach(button => {
      const selected = Number(button.dataset.v2Page) === pageIndex;
      button.setAttribute('aria-current', selected ? 'step' : 'false');
      button.classList.toggle('is-active', selected);
    });
    dialog.querySelector('[data-v2-content]').scrollTop = 0;
  }
  function close(reason = 'skip') {
    if (!dialog?.open) return;
    // Native close events are queued; release the workspace synchronously on logout.
    document.documentElement.classList.remove('tt-v2-tour-open');
    activeIdentity = '';
    if (reason === 'session-ended' || reason === 'session-changed' || reason === 'page-hidden') returnFocus = null;
    dialog.close(reason);
  }
  function ensureDialog() {
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.id = 'tt-v2-welcome';
    dialog.className = 'tt-v2-welcome';
    dialog.setAttribute('aria-labelledby', 'tt-v2-title');
    dialog.setAttribute('aria-describedby', 'tt-v2-subtitle');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('role', 'dialog');
    dialog.innerHTML = `
      <header class="tt-v2-header">
        <div class="tt-v2-brand">TRINOTIME <span>V 3.0.0</span></div>
        <button class="tt-v2-close" type="button" data-v2-close aria-label="Skip What's New and close">\u00d7</button>
        <h2 id="tt-v2-title" tabindex="-1">\ud83c\udf89 V 3.0.0 is here! What's New? \ud83c\udf89</h2>
        <p id="tt-v2-subtitle">A quick tour of your workspace. Three pages, at your pace.</p>
        <span class="tt-v2-decoration tt-v2-decoration-one" aria-hidden="true"></span>
        <span class="tt-v2-decoration tt-v2-decoration-two" aria-hidden="true"></span>
      </header>
      <section class="tt-v2-content" data-v2-content aria-labelledby="tt-v2-page-title" aria-live="polite" aria-atomic="true"></section>
      <footer class="tt-v2-footer">
        <div class="tt-v2-progress"><span data-v2-status role="status" aria-live="polite">Page 1 of 3</span>
          <nav class="tt-v2-pages" aria-label="What's New pages">${pages.map((_, n) => `<button type="button" data-v2-page="${n}" aria-label="Go to page ${n + 1}">${n + 1}</button>`).join('')}</nav>
        </div>
        <div class="tt-v2-actions"><button type="button" class="tt-v2-skip" data-v2-skip>Skip tour</button>
          <div class="tt-v2-step-actions"><button type="button" class="tt-v2-back" data-v2-back>Back</button><button type="button" class="tt-v2-next" data-v2-next>Next \u2192</button></div>
        </div>
        <p class="tt-v2-footnote">Shown once for your account. Your work is not affected.</p>
      </footer>`;
    document.body.appendChild(dialog);
    dialog.querySelector('[data-v2-close]').addEventListener('click', () => close('skip'));
    dialog.querySelector('[data-v2-skip]').addEventListener('click', () => close('skip'));
    dialog.querySelector('[data-v2-back]').addEventListener('click', () => renderPage(pageIndex - 1));
    dialog.querySelector('[data-v2-next]').addEventListener('click', () => pageIndex === pages.length - 1 ? close('complete') : renderPage(pageIndex + 1));
    dialog.querySelectorAll('[data-v2-page]').forEach(button => button.addEventListener('click', () => renderPage(Number(button.dataset.v2Page))));
    dialog.addEventListener('cancel', event => { event.preventDefault(); close('skip'); });
    dialog.addEventListener('keydown', event => {
      // Prevent the legacy workspace's global shortcuts from handling modal keystrokes.
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); close('skip'); }
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault(); renderPage(pageIndex + (event.key === 'ArrowRight' ? 1 : -1));
      }
      if (event.key === 'Tab') {
        const controls = Array.from(dialog.querySelectorAll('button:not([disabled])'));
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.querySelector('#tt-v2-title'))) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    });
    dialog.addEventListener('close', () => {
      document.documentElement.classList.remove('tt-v2-tour-open');
      activeIdentity = '';
      if (!ending && returnFocus?.isConnected && !returnFocus.closest('[inert]')) {
        try { returnFocus.focus({ preventScroll:true }); } catch (_) {}
      }
      returnFocus = null;
    });
    return dialog;
  }
  function show(key) {
    if (!ready() || identity() !== key) return false;
    const modal = ensureDialog();
    if (typeof modal.showModal !== 'function') return false;
    returnFocus = document.activeElement;
    renderPage(0);
    modal.showModal();
    document.documentElement.classList.add('tt-v2-tour-open');
    activeIdentity = key;
    try { bridge()?.markNotesSeen?.(); } catch (_) {}
    modal.querySelector('#tt-v2-title').focus({ preventScroll:true });
    return true;
  }
  function schedule(delay = 150) {
    clearTimeout(timer);
    if (!ending) timer = setTimeout(() => { timer = 0; void check(); }, delay);
  }
  async function check() {
    const key = identity();
    if (key !== observedIdentity) {
      observedIdentity = key;
      generation++;
      pendingDisplay = '';
      if (dialog?.open && activeIdentity !== key) close('session-changed');
    }
    if (!key || !ready() || busy || dialog?.open) return;
    if (pendingDisplay === key) {
      if (show(key)) pendingDisplay = '';
      return;
    }
    if (alreadySeen(key) || (attempts.get(key) || 0) >= 4) return;
    const stamp = generation;
    busy = true;
    attempts.set(key, (attempts.get(key) || 0) + 1);
    try {
      const result = await bridge().claim(key);
      // Mark the original account only, even if it signed out during the request.
      if (result?.ok !== true || result.version !== VERSION || typeof result.show !== 'boolean') throw new Error('Unconfirmed release receipt.');
      remember(key);
      if (stamp !== generation || ending || identity() !== key) return;
      if (result.show) {
        pendingDisplay = key;
        if (show(key)) pendingDisplay = '';
      }
    } catch (_) {
      // No toast, no unhandled rejection, no auth reset. Retry only a bounded number
      // of times; later sign-ins may try again if no receipt was ever committed.
      if (stamp === generation && !ending && identity() === key) {
        const delay = RETRY_DELAYS[(attempts.get(key) || 1) - 1];
        if (delay !== undefined) schedule(delay);
      }
    } finally {
      busy = false;
      // A different account might have signed in while this request was settling.
      if (!ending && identity() && identity() !== key) schedule();
    }
  }
  function onReady() { ending = false; schedule(600); }
  function endSession() {
    ending = true; generation++; pendingDisplay = ''; observedIdentity = ''; attempts.clear();
    clearTimeout(timer); timer = 0;
    close('session-ended');
  }
  function init() {
    window.addEventListener('trinotime:workforce-agent-ready', onReady);
    window.addEventListener('trinotime:workforce-auth-ready', onReady);
    window.addEventListener('trinotime:session-ending', endSession);
    window.addEventListener('trinotime:workforce-authority-expired', endSession);
    window.addEventListener('online', () => schedule(600));
    window.addEventListener('pageshow', () => schedule(600));
    window.addEventListener('pagehide', () => { clearTimeout(timer); timer = 0; close('page-hidden'); });
    window.addEventListener('storage', event => {
      const key = identity();
      if (key && event.key === storageKey(key) && event.newValue === VERSION) seenThisPage.add(key);
    });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState !== 'hidden') schedule(300); });
    document.addEventListener('close', () => schedule(150), true);
    // Attribute-only observation of modal shells, not the high-churn dashboard subtree.
    const observer = new MutationObserver(() => schedule(150));
    const targets = new Set([document.body, document.getElementById('appRoot'), ...document.querySelectorAll('[role="dialog"][aria-modal="true"], dialog')]);
    targets.forEach(node => { if (node) observer.observe(node, { attributes:true, attributeFilter:['class','style','hidden','open','inert','aria-hidden','data-trino-role'] }); });
    schedule(600);
  }
  // Read-only diagnostic state; no force-show or reset API that could bypass receipts.
  window.TrinoTimeVersion3Welcome = Object.freeze({
    version:VERSION,
    getState: () => ({ open:Boolean(dialog?.open), page:pageIndex + 1, busy, pending:Boolean(pendingDisplay) })
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
