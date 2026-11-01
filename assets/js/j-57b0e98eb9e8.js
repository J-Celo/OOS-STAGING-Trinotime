(() => {
  'use strict';
  // TrinoTime v1.1.14 rendering governor.
  // Presentation/performance only: no Firebase, App Check, reCAPTCHA, Auth,
  // database, API-key, permission, entitlement, or attendance-write access.
  const root = document.documentElement;
  let videoResumeTimer = 0;
  let videoWasPlaying = false;

  const ambientVideo = () => document.getElementById('ttRivrAmbientVideo');

  function pauseAmbientForInteraction() {
    const video = ambientVideo();
    if (!video || video.paused) return;
    videoWasPlaying = true;
    try { video.pause(); } catch (_) {}
  }

  function resumeAmbientAfterInteraction() {
    if (videoResumeTimer) clearTimeout(videoResumeTimer);
    videoResumeTimer = setTimeout(() => {
      videoResumeTimer = 0;
      if (!videoWasPlaying || document.hidden || root.classList.contains('tt-is-scrolling')) return;
      videoWasPlaying = false;
      if (root.dataset.glassPerformance === 'low') return;
      const video = ambientVideo();
      if (!video || !video.paused) return;
      try { const p = video.play(); if (p && typeof p.catch === 'function') p.catch(() => {}); } catch (_) {}
    }, 220);
  }

  function syncInteractionState() {
    const scrolling = root.classList.contains('tt-is-scrolling');
    const interacting = root.classList.contains('tt-input-active');
    root.dataset.renderPressure = (scrolling || interacting) ? 'active' : 'idle';
    if (scrolling) pauseAmbientForInteraction();
    else resumeAmbientAfterInteraction();
  }

  const classObserver = new MutationObserver(syncInteractionState);
  classObserver.observe(root, { attributes:true, attributeFilter:['class'] });

  document.addEventListener('visibilitychange', () => {
    root.dataset.pageVisibility = document.hidden ? 'hidden' : 'visible';
    if (document.hidden) {
      if (videoResumeTimer) clearTimeout(videoResumeTimer);
      videoResumeTimer = 0;
      pauseAmbientForInteraction();
    } else {
      syncInteractionState();
    }
  }, { passive:true });

  // Avoid delayed touch activation without attaching per-control handlers.
  root.dataset.eventPerformance = 'v1.1.14';
  syncInteractionState();
})();
