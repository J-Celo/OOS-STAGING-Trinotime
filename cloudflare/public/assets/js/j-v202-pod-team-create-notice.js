/* TrinoTime V2.0.3 RC4 — verified POD / Team creation notice.
   Additive only: observes the existing Admin POD manager success status after
   Firebase confirmation and presents a body-level, front-most notification. */
(() => {
  'use strict';

  const SUCCESS_SUFFIX = ' was created with its Day Off schedule shell confirmed by Firebase.';
  const NOTICE_ID = 'ttPodCreateNotice';
  const DISPLAY_MS = 3800;

  function ensureNotice() {
    let notice = document.getElementById(NOTICE_ID);
    if (notice) return notice;

    notice = document.createElement('div');
    notice.id = NOTICE_ID;
    notice.className = 'tt-pod-create-notice';
    notice.setAttribute('role', 'status');
    notice.setAttribute('aria-live', 'polite');
    notice.setAttribute('aria-atomic', 'true');
    notice.setAttribute('aria-hidden', 'true');

    const mark = document.createElement('span');
    mark.className = 'tt-pod-create-notice-mark';
    mark.setAttribute('aria-hidden', 'true');
    mark.textContent = '✓';

    const text = document.createElement('span');
    text.className = 'tt-pod-create-notice-text';

    notice.append(mark, text);
    document.body.appendChild(notice);
    return notice;
  }

  function createdNameFromStatus(status) {
    if (!status || String(status.dataset.state || '') !== 'success') return '';
    const message = String(status.textContent || '').trim();
    if (!message.endsWith(SUCCESS_SUFFIX)) return '';
    return message.slice(0, -SUCCESS_SUFFIX.length).trim();
  }

  function showCreatedNotice(name) {
    const notice = ensureNotice();
    const text = notice.querySelector('.tt-pod-create-notice-text');
    if (!text) return;

    clearTimeout(notice._hideTimer);
    text.textContent = `${name} created.`;
    notice.setAttribute('aria-hidden', 'false');
    notice.classList.remove('is-visible');
    // Restart the transition even for two quick consecutive successful creates.
    void notice.offsetWidth;
    notice.classList.add('is-visible');
    notice._hideTimer = setTimeout(() => {
      notice.classList.remove('is-visible');
      notice.setAttribute('aria-hidden', 'true');
    }, DISPLAY_MS);
  }

  function init() {
    const status = document.getElementById('podTeamManagementStatus');
    if (!status) return;

    let lastConfirmedMessage = '';
    const inspect = () => {
      const name = createdNameFromStatus(status);
      if (!name) return;
      const confirmedMessage = String(status.textContent || '').trim();
      if (confirmedMessage === lastConfirmedMessage) return;
      lastConfirmedMessage = confirmedMessage;
      showCreatedNotice(name);
    };

    const observer = new MutationObserver(inspect);
    observer.observe(status, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['data-state']
    });
    inspect();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
