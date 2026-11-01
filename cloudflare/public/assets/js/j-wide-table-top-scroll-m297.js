(() => {
  'use strict';

  // STAGING UX2: render-only horizontal navigation; no API, Tracker, or role changes.
  const mounted = new WeakMap();

  function mount(scroller) {
    if (!scroller || !(scroller instanceof HTMLElement)) return null;
    const existing = mounted.get(scroller);
    if (existing) {
      existing.sync();
      return existing.rail;
    }

    const bar = document.createElement('div');
    bar.className = 'tt-wide-table-navigation';
    bar.setAttribute('aria-label', 'Table column navigation');

    const left = document.createElement('button');
    left.type = 'button';
    left.className = 'tt-wide-table-step';
    left.textContent = '‹';
    left.setAttribute('aria-label', 'Show previous columns');
    left.title = 'Previous columns';

    const rail = document.createElement('div');
    rail.className = 'tt-wide-table-top-scroll';
    rail.tabIndex = 0;
    rail.setAttribute('role', 'scrollbar');
    rail.setAttribute('aria-orientation', 'horizontal');
    rail.setAttribute('aria-label', 'Horizontal table scroll');
    rail.setAttribute('title', 'Drag to navigate columns, or scroll the mouse wheel here');

    const spacer = document.createElement('div');
    spacer.className = 'tt-wide-table-top-scroll-spacer';
    rail.appendChild(spacer);

    const right = document.createElement('button');
    right.type = 'button';
    right.className = 'tt-wide-table-step';
    right.textContent = '›';
    right.setAttribute('aria-label', 'Show next columns');
    right.title = 'Next columns';
    bar.append(left, rail, right);
    scroller.insertAdjacentElement('beforebegin', bar);

    const maxScroll = () => Math.max(0, scroller.scrollWidth - scroller.clientWidth);
    const syncAria = () => {
      const max = maxScroll();
      rail.setAttribute('aria-valuemin', '0');
      rail.setAttribute('aria-valuemax', String(Math.round(max)));
      rail.setAttribute('aria-valuenow', String(Math.round(scroller.scrollLeft)));
      left.disabled = scroller.scrollLeft <= 1;
      right.disabled = scroller.scrollLeft >= max - 1;
    };

    // UX17.4: mirroring a scrollbar can queue an asynchronous native scroll
    // event. Do not treat that echo as a new user gesture; two-way echoes can
    // fight with one another and make columns slide back and forth by themselves.
    let expectedTable = null;
    let expectedRail = null;
    const clamp = value => Math.max(0, Math.min(maxScroll(), Number(value) || 0));
    const close = (a, b) => Math.abs(a - b) < 1;
    const setTable = value => {
      const next = clamp(value);
      if (close(scroller.scrollLeft, next)) return;
      expectedTable = next;
      scroller.scrollLeft = next;
    };
    const setRail = value => {
      const next = clamp(value);
      if (close(rail.scrollLeft, next)) return;
      expectedRail = next;
      rail.scrollLeft = next;
    };
    const fromTable = () => {
      if (!bar.isConnected || !scroller.isConnected) return;
      const position = clamp(scroller.scrollLeft);
      if (expectedTable !== null && close(position, expectedTable)) {
        expectedTable = null;
        syncAria();
        return;
      }
      expectedTable = null;
      setRail(position);
      syncAria();
    };
    const fromRail = () => {
      if (!bar.isConnected || !scroller.isConnected) return;
      const position = clamp(rail.scrollLeft);
      if (expectedRail !== null && close(position, expectedRail)) {
        expectedRail = null;
        syncAria();
        return;
      }
      expectedRail = null;
      setTable(position);
      syncAria();
    };
    // The real table owns the offset during resizing/refreshed content. The
    // rail is only the input authority while the operator uses that rail.
    const sync = () => {
      if (!bar.isConnected || !scroller.isConnected) return;
      const max = maxScroll();
      bar.hidden = max <= 1;
      spacer.style.width = `${Math.ceil(max + rail.clientWidth)}px`;
      expectedRail = null;
      setRail(scroller.scrollLeft);
      syncAria();
    };
    rail.addEventListener('scroll', fromRail, { passive: true });
    scroller.addEventListener('scroll', fromTable, { passive: true });

    const step = direction => {
      const delta = Math.max(140, Math.round(scroller.clientWidth * 0.58));
      const next = Math.max(0, Math.min(maxScroll(), scroller.scrollLeft + direction * delta));
      scroller.scrollTo({ left: next, behavior: 'smooth' });
    };
    left.addEventListener('click', () => step(-1));
    right.addEventListener('click', () => step(1));

    rail.addEventListener('wheel', event => {
      if (event.ctrlKey || event.metaKey || event.altKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      if (!maxScroll()) return;
      event.preventDefault();
      // Wheel over the top rail navigates columns; vertical wheel over the
      // actual table/page is left alone for normal vertical scrolling.
      scroller.scrollLeft = Math.max(0, Math.min(maxScroll(), scroller.scrollLeft + event.deltaY));
    }, { passive: false });

    rail.addEventListener('keydown', event => {
      const jump = Math.max(80, Math.round(scroller.clientWidth * 0.35));
      let next = null;
      if (event.key === 'ArrowLeft') next = scroller.scrollLeft - jump;
      if (event.key === 'ArrowRight') next = scroller.scrollLeft + jump;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = maxScroll();
      if (next === null) return;
      event.preventDefault();
      scroller.scrollTo({ left: Math.max(0, Math.min(maxScroll(), next)), behavior: 'smooth' });
    });

    if ('ResizeObserver' in window) {
      const resizeObserver = new ResizeObserver(sync);
      resizeObserver.observe(scroller);
      const content = scroller.firstElementChild;
      if (content) resizeObserver.observe(content);
    }

    mounted.set(scroller, { rail, sync });
    requestAnimationFrame(sync);
    return rail;
  }

  function mountAll(root) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('.tt-coverage-table-wrap, .tt-ops-table-scroll').forEach(mount);
  }

  window.TrinoTimeWideTableScroll = Object.freeze({ mount, mountAll });
})();
