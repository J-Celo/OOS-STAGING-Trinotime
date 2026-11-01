(function () {
    'use strict';

    const root = document.documentElement;
    const REDUCE_MOTION = () => {
        try {
            return window.matchMedia('(prefers-reduced-motion: reduce)').matches || root.dataset.mytrinoReduceMotion === 'true';
        } catch (_) { return false; }
    };
    const TAB_SELECTOR = '.log-tab,.settings-tab-btn,.team-tab-btn,.pod-tab,.pod-tab-solo,.today-status-view-tab,[data-notification-center-tab]';
    const INTERACTIVE_SELECTOR = 'a,button,input,textarea,select,option,label,summary,[role="button"],[role="link"],[contenteditable="true"],[data-no-drag-scroll]';
    const DRAGGABLE_CONTROL_HOST = '.log-tabs,.pod-tabs,.settings-tabs,.notification-center-tabs';
    const DRAG_THRESHOLD = 6;
    const VELOCITY_LIMIT = 2.45; // px/ms, intentionally bounded.
    const MOMENTUM_STOP = 0.018;
    const FRICTION_16MS = 0.905;

    let drag = null;
    let dragFrame = 0;
    let momentum = null;
    let momentumFrame = 0;
    let suppressClickUntil = 0;
    let tabTimer = 0;
    let pressedControl = null;

    function markTabSwitching() {
        root.classList.add('tt-tab-switching');
        if (tabTimer) clearTimeout(tabTimer);
        tabTimer = setTimeout(() => {
            tabTimer = 0;
            root.classList.remove('tt-tab-switching');
        }, 190);
    }

    function scrollAxes(el) {
        if (!el) return { x:false, y:false };
        const style = getComputedStyle(el);
        const ox = String(style.overflowX || style.overflow || '');
        const oy = String(style.overflowY || style.overflow || '');
        return {
            x: /(auto|scroll|overlay)/.test(ox) && el.scrollWidth > el.clientWidth + 2,
            y: /(auto|scroll|overlay)/.test(oy) && el.scrollHeight > el.clientHeight + 2
        };
    }

    function findScroller(target) {
        let el = target && target.nodeType === 1 ? target : target?.parentElement;
        while (el && el !== document.body && el !== document.documentElement) {
            const axes = scrollAxes(el);
            if (axes.x || axes.y) return { el, axes };
            el = el.parentElement;
        }
        const doc = document.scrollingElement || document.documentElement;
        const axes = {
            x: doc.scrollWidth > doc.clientWidth + 2,
            y: doc.scrollHeight > doc.clientHeight + 2
        };
        return axes.x || axes.y ? { el: doc, axes } : null;
    }

    function interactiveBlocksDrag(target, scroller) {
        const interactive = target?.closest?.(INTERACTIVE_SELECTOR);
        if (!interactive) return false;
        // Tab strips remain draggable from their buttons: a normal click still
        // works, while movement past the threshold becomes a drag and suppresses
        // the click. All other controls retain normal interaction semantics.
        return !interactive.closest?.(DRAGGABLE_CONTROL_HOST) || !scroller?.closest?.(DRAGGABLE_CONTROL_HOST);
    }

    function clampVelocity(value) {
        return Math.max(-VELOCITY_LIMIT, Math.min(VELOCITY_LIMIT, Number(value) || 0));
    }

    function cancelMomentum() {
        if (momentumFrame) cancelAnimationFrame(momentumFrame);
        momentumFrame = 0;
        if (momentum?.el?.classList) momentum.el.classList.remove('tt-drag-scroll-active');
        momentum = null;
    }

    function cancelDrag() {
        if (dragFrame) cancelAnimationFrame(dragFrame);
        dragFrame = 0;
        if (drag?.el?.classList) drag.el.classList.remove('tt-drag-scroll-candidate', 'tt-drag-scroll-active');
        drag = null;
        root.classList.remove('tt-drag-scrolling');
    }

    function cancelAll() {
        cancelDrag();
        cancelMomentum();
        root.classList.remove('tt-tab-switching');
        if (tabTimer) clearTimeout(tabTimer);
        tabTimer = 0;
        if (pressedControl) pressedControl.classList.remove('tt-physics-press');
        pressedControl = null;
    }

    function applyDragFrame(now) {
        dragFrame = 0;
        const s = drag;
        if (!s || !s.dragging) return;
        const dx = s.x - s.appliedX;
        const dy = s.y - s.appliedY;
        const dt = Math.max(4, Math.min(34, now - s.lastFrameAt || 16));
        let movedX = 0, movedY = 0;
        if (s.axes.x && dx) {
            const before = s.el.scrollLeft;
            s.el.scrollLeft -= dx;
            movedX = s.el.scrollLeft - before;
        }
        if (s.axes.y && dy) {
            const before = s.el.scrollTop;
            s.el.scrollTop -= dy;
            movedY = s.el.scrollTop - before;
        }
        const instantVx = movedX / dt;
        const instantVy = movedY / dt;
        s.vx = clampVelocity(s.vx * 0.42 + instantVx * 0.58);
        s.vy = clampVelocity(s.vy * 0.42 + instantVy * 0.58);
        s.appliedX = s.x;
        s.appliedY = s.y;
        s.lastFrameAt = now;
    }

    function startMomentum(el, vx, vy, axes) {
        if (REDUCE_MOTION()) return;
        vx = clampVelocity(vx);
        vy = clampVelocity(vy);
        if (Math.hypot(vx, vy) < 0.10) return;
        cancelMomentum();
        momentum = { el, vx, vy, axes, last: performance.now() };
        el.classList?.add('tt-drag-scroll-active');
        const tick = (now) => {
            if (!momentum) return;
            const m = momentum;
            const dt = Math.max(5, Math.min(32, now - m.last));
            m.last = now;
            let hitX = false, hitY = false;
            if (m.axes.x && Math.abs(m.vx) >= MOMENTUM_STOP) {
                const before = m.el.scrollLeft;
                m.el.scrollLeft += m.vx * dt;
                hitX = Math.abs(m.el.scrollLeft - before) < 0.2;
            }
            if (m.axes.y && Math.abs(m.vy) >= MOMENTUM_STOP) {
                const before = m.el.scrollTop;
                m.el.scrollTop += m.vy * dt;
                hitY = Math.abs(m.el.scrollTop - before) < 0.2;
            }
            const decay = Math.pow(FRICTION_16MS, dt / 16.667);
            m.vx = hitX ? 0 : m.vx * decay;
            m.vy = hitY ? 0 : m.vy * decay;
            if (Math.hypot(m.vx, m.vy) < MOMENTUM_STOP) {
                cancelMomentum();
                return;
            }
            momentumFrame = requestAnimationFrame(tick);
        };
        momentumFrame = requestAnimationFrame(tick);
    }

    function onPointerDown(event) {
        if (event.pointerType && event.pointerType !== 'mouse') return;
        if (event.button !== 0 || event.isPrimary === false) return;
        const tab = event.target?.closest?.(TAB_SELECTOR);
        if (tab) markTabSwitching();

        const found = findScroller(event.target);
        if (!found || interactiveBlocksDrag(event.target, found.el)) return;
        cancelMomentum();
        drag = {
            pointerId: event.pointerId,
            el: found.el,
            axes: found.axes,
            startX: event.clientX,
            startY: event.clientY,
            x: event.clientX,
            y: event.clientY,
            appliedX: event.clientX,
            appliedY: event.clientY,
            lastFrameAt: performance.now(),
            vx: 0,
            vy: 0,
            dragging: false
        };
        drag.el.classList?.add('tt-drag-scroll-candidate');
        // Keep the original pointer target intact for ordinary clicks. Pointer
        // capture is intentionally deferred until movement crosses the drag
        // threshold; capturing on pointerdown can retarget the eventual click
        // to the scroll container and make custom list rows appear unclickable.
    }

    function onPointerMove(event) {
        const s = drag;
        if (!s || event.pointerId !== s.pointerId) return;
        s.x = event.clientX;
        s.y = event.clientY;
        if (!s.dragging) {
            const dx = s.x - s.startX;
            const dy = s.y - s.startY;
            const relevant = Math.hypot(s.axes.x ? dx : 0, s.axes.y ? dy : 0);
            if (relevant < DRAG_THRESHOLD) return;
            s.dragging = true;
            s.el.classList?.remove('tt-drag-scroll-candidate');
            s.el.classList?.add('tt-drag-scroll-active');
            root.classList.add('tt-drag-scrolling');
            try { s.el.setPointerCapture?.(event.pointerId); } catch (_) {}
        }
        event.preventDefault();
        if (!dragFrame) dragFrame = requestAnimationFrame(applyDragFrame);
    }

    function finishPointer(event, cancelled) {
        const s = drag;
        if (!s || event.pointerId !== s.pointerId) return;
        if (dragFrame) {
            cancelAnimationFrame(dragFrame);
            dragFrame = 0;
            if (s.dragging) applyDragFrame(performance.now());
        }
        const wasDragging = s.dragging;
        const vx = s.vx, vy = s.vy, el = s.el, axes = s.axes;
        try { el.releasePointerCapture?.(event.pointerId); } catch (_) {}
        cancelDrag();
        if (wasDragging) {
            suppressClickUntil = performance.now() + 260;
            if (!cancelled) startMomentum(el, vx, vy, axes);
        }
    }

    function onClickCapture(event) {
        if (performance.now() < suppressClickUntil) {
            event.preventDefault();
            event.stopImmediatePropagation();
            suppressClickUntil = 0;
        }
    }

    function pressControl(target) {
        const control = target?.closest?.('button,[role="button"],input[type="button"],input[type="submit"],input[type="reset"],summary');
        if (!control || control.disabled) return;
        if (pressedControl && pressedControl !== control) pressedControl.classList.remove('tt-physics-press');
        pressedControl = control;
        control.classList.add('tt-physics-press');
    }

    function releaseControl() {
        const control = pressedControl;
        if (!control) return;
        pressedControl = null;
        requestAnimationFrame(() => control.classList.remove('tt-physics-press'));
    }

    document.addEventListener('pointerdown', event => {
        pressControl(event.target);
        onPointerDown(event);
    }, { capture:true, passive:true });
    document.addEventListener('pointermove', onPointerMove, { capture:true, passive:false });
    document.addEventListener('pointerup', event => { finishPointer(event, false); releaseControl(); }, { capture:true, passive:true });
    document.addEventListener('pointercancel', event => { finishPointer(event, true); releaseControl(); }, { capture:true, passive:true });
    document.addEventListener('click', onClickCapture, true);
    document.addEventListener('keydown', event => {
        const key = String(event && event.key || '');
        if ((key === 'Enter' || key === ' ') && document.activeElement?.matches?.(TAB_SELECTOR)) markTabSwitching();
        if (key === 'PageDown' || key === 'PageUp' || key === 'Home' || key === 'End' || key.startsWith('Arrow')) cancelMomentum();
    }, true);
    document.addEventListener('keyup', releaseControl, true);
    document.addEventListener('wheel', cancelMomentum, { capture:true, passive:true });
    document.addEventListener('touchstart', cancelMomentum, { capture:true, passive:true });
    window.addEventListener('blur', cancelAll, { passive:true });
    window.addEventListener('pagehide', cancelAll, { passive:true });
    document.addEventListener('visibilitychange', () => { if (document.hidden) cancelAll(); }, { passive:true });
    window.addEventListener('trinotime:settings-closing', cancelAll);

    window.TrinoTimeInteractionPhysics = Object.freeze({
        version: '1.1.52',
        cancel: cancelAll,
        markTabSwitching
    });
})();
