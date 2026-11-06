// Wake existing Coverage/Confirmation sync after browser/network resume.
// Does not claim activity-time ownership or classify employees as working.
(() => {
  'use strict';
  if (window !== window.top || window.__ttAvailabilityWakeV1) return;
  window.__ttAvailabilityWakeV1 = true;
  let lastSentAt = 0;
  function signalAvailability(event) {
    if (navigator.onLine === false) return;
    const now = Date.now();
    const networkRestored = event?.type === 'online';
    if (lastSentAt && now - lastSentAt >= 0 && now - lastSentAt < (networkRestored ? 5000 : 30000)) return;
    lastSentAt = now;
    for (const type of ['cat-availability-resume', 'cft-availability-resume']) {
      chrome.runtime.sendMessage({type, reason:networkRestored ? 'online' : 'resume'}).catch(() => {});
    }
  }
  window.addEventListener('online', signalAvailability);
  window.addEventListener('pageshow', signalAvailability);
  window.addEventListener('focus', signalAvailability);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) signalAvailability();
  });
})();
