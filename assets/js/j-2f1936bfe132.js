    (function () {
        'use strict';
        const root = document.documentElement;
        let activeScroller = null;
        let settleTimer = 0;
        let scrollFrame = 0;
        let pendingScroller = null;
        let inputSettleTimer = 0;

        function normalizeScroller(target) {
            if (!target || target === document || target === window) return document.scrollingElement || document.documentElement;
            if (target.nodeType === 1) return target;
            return document.scrollingElement || document.documentElement;
        }

        function clearScrollingState() {
            if (scrollFrame) cancelAnimationFrame(scrollFrame);
            scrollFrame = 0;
            pendingScroller = null;
            if (settleTimer) clearTimeout(settleTimer);
            settleTimer = 0;
            root.classList.remove('tt-is-scrolling');
            if (activeScroller && activeScroller.classList) activeScroller.classList.remove('tt-active-scroller');
            activeScroller = null;
        }

        function commitScrollState() {
            scrollFrame = 0;
            const next = pendingScroller || document.scrollingElement || document.documentElement;
            pendingScroller = null;
            if (activeScroller !== next) {
                if (activeScroller && activeScroller.classList) activeScroller.classList.remove('tt-active-scroller');
                activeScroller = next;
                if (activeScroller && activeScroller.classList) activeScroller.classList.add('tt-active-scroller');
            }
            if (!root.classList.contains('tt-is-scrolling')) root.classList.add('tt-is-scrolling');
            if (settleTimer) clearTimeout(settleTimer);
            settleTimer = setTimeout(clearScrollingState, 140);
        }

        function onAnyScroll(event) {
            const rawTarget = event && event.target;
            const settings = rawTarget && rawTarget.nodeType === 1 && rawTarget.closest ? rawTarget.closest('#settingsOverlay') : null;
            if (settings && !settings.classList.contains('open')) return;
            pendingScroller = normalizeScroller(rawTarget);
            if (!scrollFrame) scrollFrame = requestAnimationFrame(commitScrollState);
        }


        function markInputActive() {
            if (!root.classList.contains('tt-input-active')) root.classList.add('tt-input-active');
            if (inputSettleTimer) clearTimeout(inputSettleTimer);
            inputSettleTimer = setTimeout(() => {
                inputSettleTimer = 0;
                root.classList.remove('tt-input-active');
            }, 140);
        }



        document.addEventListener('scroll', onAnyScroll, { passive: true, capture: true });
        document.addEventListener('pointerdown', markInputActive, { passive:true, capture:true });
        document.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') markInputActive(); }, { capture:true });
        function clearInputState() {
            if (inputSettleTimer) clearTimeout(inputSettleTimer);
            inputSettleTimer = 0;
            root.classList.remove('tt-input-active');
        }
        window.addEventListener('trinotime:settings-closing', () => { clearScrollingState(); clearInputState(); });
        window.addEventListener('pagehide', () => { clearScrollingState(); clearInputState(); }, { passive: true });
        document.addEventListener('visibilitychange', function () { if (document.hidden) { clearScrollingState(); clearInputState(); } }, { passive: true });
        window.TrinoTimeScrollRuntime = Object.freeze({ version:'1.0.36', cancel:() => { clearScrollingState(); clearInputState(); } });
    })();

