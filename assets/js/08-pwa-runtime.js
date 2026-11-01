    // ===== PWA: install button + service worker =====
    (function () {
        var installBtn = document.getElementById('installAppBtn');
        var installDivider = document.getElementById('installAppDivider');
        var deferredPrompt = null;

        function showInstallBtn() {
            if (installBtn) installBtn.style.display = '';
            if (installDivider) installDivider.style.display = '';
        }
        function hideInstallBtn() {
            if (installBtn) installBtn.style.display = 'none';
            if (installDivider) installDivider.style.display = 'none';
        }

        // Already installed / running standalone: nothing to do.
        var isStandalone = window.matchMedia('(display-mode: standalone)').matches
            || window.navigator.standalone === true;
        if (isStandalone) hideInstallBtn();

        // Chrome/Edge/Android: browser tells us installability is available.
        window.addEventListener('beforeinstallprompt', function (e) {
            e.preventDefault();
            deferredPrompt = e;
            if (!isStandalone) showInstallBtn();
        });

        if (installBtn) {
            installBtn.addEventListener('click', async function () {
                if (deferredPrompt) {
                    deferredPrompt.prompt();
                    try { await deferredPrompt.userChoice; } catch (err) {}
                    deferredPrompt = null;
                    hideInstallBtn();
                    return;
                }
                // iOS Safari (and any browser without beforeinstallprompt)
                // has no programmatic install API, so guide the user instead.
                var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
                var msg = isIOS
                    ? 'To install: tap the Share icon in Safari, then <strong>Add to Home Screen</strong>.'
                    : 'To install: open your browser menu and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.';
                var dialogs = window.TrinoTimeCore && window.TrinoTimeCore.dialogs;
                if (dialogs && typeof dialogs.alert === 'function') {
                    void dialogs.alert('Install TrinoTime', msg, { confirmLabel:'Got It', kind:'install-help' });
                }
            });
        }

        window.addEventListener('appinstalled', hideInstallBtn);

        // App version + update handling. This checks both the deployed HTML
        // version marker and service-worker lifecycle so fixes can be surfaced even
        // when the app has remained open or installed for a long time.
        var versionMeta = document.querySelector('meta[name="trinotime-version"]');
        var currentAppVersion = versionMeta ? String(versionMeta.getAttribute('content') || '') : '';
        var versionLabel = document.getElementById('appVersionLabel');
        if (versionLabel && currentAppVersion) versionLabel.textContent = currentAppVersion;
        if (currentAppVersion) {
            document.querySelectorAll('[data-trinotime-version-display]').forEach(function (node) {
                node.textContent = currentAppVersion;
            });
        }
        var updateBanner = document.getElementById('appUpdateBanner');
        var updateMessage = document.getElementById('appUpdateMessage');
        var updateReloadBtn = document.getElementById('appUpdateReloadBtn');
        var updateLaterBtn = document.getElementById('appUpdateLaterBtn');
        var pendingUpdateRegistration = null;
        var pendingDeployedVersion = '';
        var updateReloading = false;
        var lastVersionCheckAt = 0;

        function showAppUpdateBanner(nextVersion, registration) {
            var targetVersion = String(nextVersion || 'new');
            try {
                if (sessionStorage.getItem('trinotime_update_later_version') === targetVersion) return;
            } catch (e) {}
            pendingDeployedVersion = targetVersion;
            if (registration) pendingUpdateRegistration = registration;
            if (updateMessage) {
                updateMessage.textContent = targetVersion && targetVersion !== 'new'
                    ? 'Version ' + targetVersion + ' is available. Update and reload to get the latest fixes.'
                    : 'A newer TrinoTime build is ready. Update and reload to get the latest fixes.';
            }
            if (updateBanner) {
                updateBanner.classList.add('show');
                updateBanner.setAttribute('aria-hidden', 'false');
            }
        }
        function hideAppUpdateBanner() {
            if (!updateBanner) return;
            updateBanner.classList.remove('show');
            updateBanner.setAttribute('aria-hidden', 'true');
        }
        function freshAppReload() {
            if (updateReloading) return;
            updateReloading = true;
            var url = new URL(window.location.href);
            url.searchParams.delete('_trinotime_version_check');
            url.searchParams.set('trinotimeUpdate', String(Date.now()));
            window.location.replace(url.toString());
        }
        async function checkDeployedAppVersion(force) {
            if (!currentAppVersion || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
            var now = Date.now();
            if (!force && now - lastVersionCheckAt < 5 * 60 * 1000) return;
            lastVersionCheckAt = now;
            try {
                var checkUrl = new URL(window.location.href);
                checkUrl.searchParams.delete('trinotimeUpdate');
                checkUrl.searchParams.set('_trinotime_version_check', String(now));
                var response = await fetch(checkUrl.toString(), { cache: 'no-store', credentials: 'same-origin' });
                if (!response.ok) return;
                var html = await response.text();
                var match = html.match(/<meta\s+name=["']trinotime-version["']\s+content=["']([^"']+)["']/i);
                if (match && match[1] && match[1] !== currentAppVersion) {
                    showAppUpdateBanner(match[1], pendingUpdateRegistration);
                }
            } catch (e) {}
        }

        if (updateLaterBtn) {
            updateLaterBtn.addEventListener('click', function () {
                try { sessionStorage.setItem('trinotime_update_later_version', pendingDeployedVersion || 'new'); } catch (e) {}
                hideAppUpdateBanner();
            });
        }
        if (updateReloadBtn) {
            updateReloadBtn.addEventListener('click', async function () {
                if (typeof navigator !== 'undefined' && navigator.onLine === false) {
                    if (updateMessage) updateMessage.textContent = 'Connect to the internet before updating TrinoTime.';
                    return;
                }
                updateReloadBtn.disabled = true;
                updateReloadBtn.textContent = 'Updating...';
                try {
                    var reg = pendingUpdateRegistration;
                    if (!reg && 'serviceWorker' in navigator) {
                        try { reg = await navigator.serviceWorker.getRegistration(); } catch (e) {}
                    }
                    if (reg && reg.waiting) {
                        try { reg.waiting.postMessage({ type: 'SKIP_WAITING' }); } catch (e) {}
                        // Give the waiting worker time to activate and claim this tab.
                        // Only unregister as a last resort if it is still stuck in waiting.
                        setTimeout(async function () {
                            if (updateReloading) return;
                            try {
                                var latestReg = await navigator.serviceWorker.getRegistration();
                                if (latestReg && latestReg.waiting) {
                                    try { await latestReg.unregister(); } catch (e) {}
                                }
                            } catch (e) {}
                            freshAppReload();
                        }, 1800);
                    } else if (reg) {
                        try { await reg.unregister(); } catch (e) {}
                        freshAppReload();
                    } else {
                        freshAppReload();
                    }
                } catch (e) {
                    freshAppReload();
                }
            });
        }

        // Register the service worker (needed for Chrome/Edge to consider
        // the app installable, and gives a bit of offline resilience for
        // the app shell itself).
        if ('serviceWorker' in navigator) {
            // A first-time service-worker claim should not force an unnecessary reload.
            // Existing controlled sessions still reload immediately after an accepted update.
            var hadServiceWorkerController = !!navigator.serviceWorker.controller;
            navigator.serviceWorker.addEventListener('controllerchange', function () {
                if (hadServiceWorkerController || updateReloading) freshAppReload();
                hadServiceWorkerController = true;
            });
            window.addEventListener('load', function () {
                navigator.serviceWorker.register('sw.js').then(function (registration) {
                    pendingUpdateRegistration = registration;
                    if (registration.waiting && navigator.serviceWorker.controller) {
                        showAppUpdateBanner('new', registration);
                    }
                    registration.addEventListener('updatefound', function () {
                        var worker = registration.installing;
                        if (!worker) return;
                        worker.addEventListener('statechange', function () {
                            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
                                showAppUpdateBanner('new', registration);
                            }
                        });
                    });
                    registration.update().catch(function () {});
                    checkDeployedAppVersion(true);
                    setInterval(function () {
                        registration.update().catch(function () {});
                        checkDeployedAppVersion(false);
                    }, 30 * 60 * 1000);
                }).catch(function () {
                    // Non-fatal: app still works without it, just no install prompt.
                    checkDeployedAppVersion(true);
                });
            });
        } else {
            window.addEventListener('load', function () { checkDeployedAppVersion(true); });
        }
        window.addEventListener('focus', function () { checkDeployedAppVersion(false); });
        window.addEventListener('online', function () { checkDeployedAppVersion(true); });
    })();
    
