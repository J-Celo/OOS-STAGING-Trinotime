/* Presentation only: the desktop information rail follows the natural hero height. */
(() => {
  'use strict';
  function init() {
    const root = document.getElementById('appRoot');
    const band = root?.querySelector(':scope > .band');
    if (!root || !band) return;
    let frame = 0;
    function measure() {
      frame = 0;
      if (document.body.dataset.trinoRole !== 'agent') {
        root.style.removeProperty('--tt-agent-hero-bottom');
        return;
      }
      const bottom = Math.ceil(band.getBoundingClientRect().bottom - root.getBoundingClientRect().top);
      if (bottom > 0) {
        const value = bottom + 'px';
        if (root.style.getPropertyValue('--tt-agent-hero-bottom') !== value)
          root.style.setProperty('--tt-agent-hero-bottom', value);
      }
    }
    function schedule() { if (!frame) frame = requestAnimationFrame(measure); }
    if (typeof ResizeObserver === 'function') new ResizeObserver(schedule).observe(band);
    new MutationObserver(schedule).observe(document.body, {attributes:true, attributeFilter:['data-trino-role','class']});
    window.addEventListener('resize', schedule, {passive:true});
    schedule();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
