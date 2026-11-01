

    window.__ttInstantScroll = function (scroller, top) {
        if (!scroller) return;
        const previous = scroller.style ? scroller.style.scrollBehavior : '';
        try {
            if (scroller.style) scroller.style.scrollBehavior = 'auto';
            if (typeof scroller.scrollTo === 'function') scroller.scrollTo({ top: Number(top) || 0, behavior: 'instant' });
            else scroller.scrollTop = Number(top) || 0;
        } catch (_) {
            scroller.scrollTop = Number(top) || 0;
        }
        if (scroller.style) {
            requestAnimationFrame(function () {
                scroller.style.scrollBehavior = previous;
            });
        }
    };

