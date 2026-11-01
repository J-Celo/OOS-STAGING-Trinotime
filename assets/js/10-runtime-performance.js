    (function () {
        'use strict';
        const root = document.documentElement;
        const band = document.querySelector('.band');
        if (!band) return;

        function setBandVisible(visible) {
            root.dataset.bandVisible = visible && !document.hidden ? 'true' : 'false';
        }

        if ('IntersectionObserver' in window) {
            const observer = new IntersectionObserver(function (entries) {
                const entry = entries && entries[0];
                setBandVisible(Boolean(entry && entry.isIntersecting));
            }, { root: null, rootMargin: '120px 0px', threshold: 0 });
            observer.observe(band);
        } else {
            setBandVisible(true);
        }

        document.addEventListener('visibilitychange', function () {
            if (document.hidden) setBandVisible(false);
            else {
                const rect = band.getBoundingClientRect();
                setBandVisible(rect.bottom >= -120 && rect.top <= window.innerHeight + 120);
            }
        }, { passive: true });
    })();
    
