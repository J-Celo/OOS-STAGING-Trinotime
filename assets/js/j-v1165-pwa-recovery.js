(function () {
    'use strict';

    var metaVersion = document.querySelector('meta[name="trinotime-version"]');
    var metaFingerprint = document.querySelector('meta[name="trinotime-deployment-fingerprint"]');
    var CURRENT_VERSION = metaVersion ? String(metaVersion.getAttribute('content') || '') : '';
    var CURRENT_FINGERPRINT = metaFingerprint ? String(metaFingerprint.getAttribute('content') || '') : '';
    var ROOT_URL = new URL('./', window.location.href);
    var VERSION_URL = new URL('version.json', ROOT_URL);
    var SW_URL = new URL('sw.js', ROOT_URL);
    SW_URL.searchParams.set('build', CURRENT_VERSION || 'current');
    if (CURRENT_FINGERPRINT) SW_URL.searchParams.set('fp', CURRENT_FINGERPRINT);

    var LEGACY_CACHE_PREFIXES = [
        'trinotime-navigation-',
        'trinotime-static-',
        'trinotime-shell-',
        'trinotime-runtime-',
        'trinotime-assets-',
        'trinotime-precache-',
        'trinotime-app-'
    ];
    var GUARD_KEY = 'trinotime_pwa_self_heal_guard_v1';
    var state = {
        currentVersion: CURRENT_VERSION,
        currentFingerprint: CURRENT_FINGERPRINT,
        serverVersion: '',
        serverFingerprint: '',
        workerVersion: '',
        workerFingerprint: '',
        registration: null,
        updating: false,
        repaired: false,
        lastError: ''
    };

    function publishDiagnostics(status) {
        try {
            var root = document.documentElement;
            root.dataset.trinotimePageBuild = state.currentVersion || '';
            root.dataset.trinotimeServerBuild = state.serverVersion || '';
            root.dataset.trinotimeWorkerBuild = state.workerVersion || '';
            root.dataset.trinotimePwaState = status || (state.updating ? 'updating' : 'checking');
        } catch (_) {}
    }

    function matchesTrinoCache(name) {
        name = String(name || '');
        return LEGACY_CACHE_PREFIXES.some(function (prefix) { return name.indexOf(prefix) === 0; });
    }

    async function purgeTrinoCaches() {
        if (!('caches' in window)) return 0;
        try {
            var keys = await caches.keys();
            var targets = keys.filter(matchesTrinoCache);
            await Promise.all(targets.map(function (key) { return caches.delete(key); }));
            return targets.length;
        } catch (error) {
            state.lastError = String(error && error.message || error || 'Cache cleanup failed');
            return 0;
        }
    }

    function ui() {
        return {
            overlay: document.getElementById('pwaRecoveryOverlay'),
            title: document.getElementById('pwaRecoveryTitle'),
            message: document.getElementById('pwaRecoveryMessage'),
            detail: document.getElementById('pwaRecoveryDetail'),
            repair: document.getElementById('pwaRecoveryRepairBtn'),
            retry: document.getElementById('pwaRecoveryRetryBtn'),
            banner: document.getElementById('appUpdateBanner'),
            bannerMessage: document.getElementById('appUpdateMessage'),
            bannerReload: document.getElementById('appUpdateReloadBtn'),
            bannerLater: document.getElementById('appUpdateLaterBtn')
        };
    }

    function showRecovery(title, message, detail, allowRepair) {
        var parts = ui();
        if (parts.title) parts.title.textContent = title || 'Updating TrinoTime';
        if (parts.message) parts.message.textContent = message || 'Installing the latest verified build. This should only take a moment.';
        if (parts.detail) parts.detail.textContent = detail || '';
        if (parts.repair) parts.repair.hidden = !allowRepair;
        if (parts.retry) parts.retry.hidden = !allowRepair;
        if (parts.overlay) {
            parts.overlay.hidden = false;
            parts.overlay.setAttribute('aria-hidden', 'false');
            parts.overlay.dataset.state = allowRepair ? 'needs-action' : 'updating';
        }
    }

    function hideRecovery() {
        var parts = ui();
        if (parts.overlay) {
            parts.overlay.hidden = true;
            parts.overlay.setAttribute('aria-hidden', 'true');
            delete parts.overlay.dataset.state;
        }
        if (parts.banner) {
            parts.banner.classList.remove('show');
            parts.banner.setAttribute('aria-hidden', 'true');
        }
    }

    function showFallbackBanner(message) {
        var parts = ui();
        if (parts.bannerMessage) parts.bannerMessage.textContent = message || 'A newer TrinoTime build is ready.';
        if (parts.bannerLater) parts.bannerLater.hidden = true;
        if (parts.bannerReload) {
            parts.bannerReload.textContent = 'Repair & Reload';
            parts.bannerReload.disabled = false;
        }
        if (parts.banner) {
            parts.banner.classList.add('show');
            parts.banner.setAttribute('aria-hidden', 'false');
        }
    }

    function semverParts(value) {
        return String(value || '').split('.').map(function (piece) {
            var n = Number(String(piece).replace(/[^0-9].*$/, ''));
            return Number.isFinite(n) ? n : 0;
        });
    }

    function compareVersions(a, b) {
        var aa = semverParts(a);
        var bb = semverParts(b);
        var len = Math.max(aa.length, bb.length, 3);
        for (var i = 0; i < len; i += 1) {
            var av = aa[i] || 0;
            var bv = bb[i] || 0;
            if (av > bv) return 1;
            if (av < bv) return -1;
        }
        return 0;
    }

    async function fetchServerBuild() {
        var requestUrl = new URL(VERSION_URL.toString());
        requestUrl.searchParams.set('_tt', String(Date.now()));
        try {
            var response = await fetch(requestUrl.toString(), {
                cache: 'no-store',
                credentials: 'same-origin',
                headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
            });
            if (!response.ok) throw new Error('Version endpoint returned HTTP ' + response.status);
            var payload = await response.json();
            var version = String(payload && payload.version || '');
            var fingerprint = String(payload && payload.build_fingerprint || '');
            if (!version) throw new Error('Version endpoint did not provide a build number.');
            state.serverVersion = version;
            state.serverFingerprint = fingerprint;
            publishDiagnostics('server-checked');
            return { version: version, fingerprint: fingerprint, ready: payload.ready !== false };
        } catch (error) {
            state.lastError = String(error && error.message || error || 'Version check failed');
            return null;
        }
    }

    function readGuard(target) {
        try {
            var raw = sessionStorage.getItem(GUARD_KEY);
            if (!raw) return { target: target, attempts: 0, startedAt: Date.now() };
            var parsed = JSON.parse(raw);
            if (!parsed || parsed.target !== target || Date.now() - Number(parsed.startedAt || 0) > 10 * 60 * 1000) {
                return { target: target, attempts: 0, startedAt: Date.now() };
            }
            return parsed;
        } catch (_) {
            return { target: target, attempts: 0, startedAt: Date.now() };
        }
    }

    function writeGuard(guard) {
        try { sessionStorage.setItem(GUARD_KEY, JSON.stringify(guard)); } catch (_) {}
    }

    function clearGuard() {
        try { sessionStorage.removeItem(GUARD_KEY); } catch (_) {}
    }

    function cleanRecoveryQuery() {
        try {
            var url = new URL(window.location.href);
            var changed = false;
            ['trinotimeUpdate', 'trinotimeRepair', '_trinotime_version_check'].forEach(function (key) {
                if (url.searchParams.has(key)) {
                    url.searchParams.delete(key);
                    changed = true;
                }
            });
            if (changed && window.history && typeof window.history.replaceState === 'function') {
                window.history.replaceState(null, '', url.pathname + (url.search ? url.search : '') + (url.hash || ''));
            }
        } catch (_) {}
    }

    function reloadFresh(reason) {
        var url = new URL(window.location.href);
        url.searchParams.delete('_trinotime_version_check');
        url.searchParams.set(reason === 'repair' ? 'trinotimeRepair' : 'trinotimeUpdate', String(Date.now()));
        window.location.replace(url.toString());
    }

    function registrationBelongsToTrinoTime(registration) {
        if (!registration || !registration.scope) return false;
        try {
            var scope = new URL(registration.scope);
            return scope.origin === ROOT_URL.origin && scope.pathname === ROOT_URL.pathname;
        } catch (_) {
            return false;
        }
    }

    async function unregisterTrinoWorkers() {
        if (!('serviceWorker' in navigator)) return 0;
        try {
            var registrations = await navigator.serviceWorker.getRegistrations();
            var ours = registrations.filter(registrationBelongsToTrinoTime);
            var results = await Promise.all(ours.map(function (registration) { return registration.unregister(); }));
            return results.filter(Boolean).length;
        } catch (error) {
            state.lastError = String(error && error.message || error || 'Service worker cleanup failed');
            return 0;
        }
    }

    function requestWorkerVersion(worker, timeoutMs) {
        return new Promise(function (resolve) {
            if (!worker || typeof MessageChannel === 'undefined') {
                resolve(null);
                return;
            }
            var settled = false;
            var timer = setTimeout(function () {
                if (!settled) {
                    settled = true;
                    resolve(null);
                }
            }, timeoutMs || 900);
            try {
                var channel = new MessageChannel();
                channel.port1.onmessage = function (event) {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timer);
                    resolve(event && event.data || null);
                };
                worker.postMessage({ type: 'TRINOTIME_GET_VERSION' }, [channel.port2]);
            } catch (_) {
                clearTimeout(timer);
                resolve(null);
            }
        });
    }

    async function ensureLatestWorker() {
        if (!('serviceWorker' in navigator)) return null;
        try {
            var registration = await navigator.serviceWorker.register(SW_URL.toString(), {
                scope: './',
                updateViaCache: 'none'
            });
            state.registration = registration;

            function activate(worker) {
                if (!worker) return;
                try { worker.postMessage({ type: 'SKIP_WAITING' }); } catch (_) {}
            }

            if (registration.waiting) activate(registration.waiting);
            if (registration.installing) {
                registration.installing.addEventListener('statechange', function () {
                    if (registration.installing && registration.installing.state === 'installed') activate(registration.installing);
                });
            }
            registration.addEventListener('updatefound', function () {
                var installing = registration.installing;
                if (!installing) return;
                installing.addEventListener('statechange', function () {
                    if (installing.state === 'installed') activate(installing);
                });
            });
            try { await registration.update(); } catch (_) {}
            if (registration.waiting) activate(registration.waiting);

            var active = navigator.serviceWorker.controller || registration.active;
            var info = await requestWorkerVersion(active, 800);
            if (info) {
                state.workerVersion = String(info.version || '');
                state.workerFingerprint = String(info.fingerprint || '');
                publishDiagnostics('worker-checked');
            }
            return registration;
        } catch (error) {
            state.lastError = String(error && error.message || error || 'Service worker update failed');
            return null;
        }
    }

    async function hardRepairAndReload(automatic) {
        if (state.updating) return;
        state.updating = true;
        state.repaired = true;
        showRecovery(
            automatic ? 'Repairing TrinoTime automatically' : 'Repairing TrinoTime',
            'Removing only obsolete TrinoTime application caches and restarting with the latest build.',
            'Attendance, Firebase records, saved schedules, and synchronized business data are not deleted.',
            false
        );
        try {
            await unregisterTrinoWorkers();
            await purgeTrinoCaches();
        } catch (_) {}
        window.setTimeout(function () { reloadFresh('repair'); }, 180);
    }

    async function recoverToServerBuild(serverBuild) {
        if (!serverBuild || state.updating) return;
        var target = serverBuild.fingerprint || serverBuild.version || 'latest';
        var guard = readGuard(target);

        if (guard.attempts >= 2) {
            state.updating = false;
            showRecovery(
                'TrinoTime needs one-click repair',
                'This browser is still holding an older TrinoTime application copy after automatic recovery.',
                'Click Repair TrinoTime. This resets only TrinoTime\'s own application worker/cache and does not erase attendance or Firebase data.',
                true
            );
            showFallbackBanner('This browser needs a one-click TrinoTime repair before sign-in.');
            return;
        }

        guard.attempts = Number(guard.attempts || 0) + 1;
        writeGuard(guard);

        if (guard.attempts >= 2) {
            await hardRepairAndReload(true);
            return;
        }

        state.updating = true;
        showRecovery(
            'Updating TrinoTime',
            'A newer verified build is available. TrinoTime is applying it automatically before sign-in.',
            'Current ' + (CURRENT_VERSION || 'unknown') + ' → Server ' + serverBuild.version,
            false
        );

        try {
            await purgeTrinoCaches();
            var registration = await ensureLatestWorker();
            if (registration && registration.waiting) {
                try { registration.waiting.postMessage({ type: 'SKIP_WAITING' }); } catch (_) {}
            }
        } catch (_) {}

        window.setTimeout(function () { reloadFresh('update'); }, 320);
    }

    function buildIsCurrent(serverBuild) {
        if (!serverBuild || !serverBuild.version) return true;
        if (compareVersions(CURRENT_VERSION, serverBuild.version) !== 0) return false;
        if (serverBuild.fingerprint && CURRENT_FINGERPRINT && serverBuild.fingerprint !== CURRENT_FINGERPRINT) return false;
        return true;
    }

    async function retryNow() {
        state.updating = false;
        var serverBuild = await fetchServerBuild();
        if (serverBuild && !buildIsCurrent(serverBuild)) {
            clearGuard();
            await recoverToServerBuild(serverBuild);
            return;
        }
        await hardRepairAndReload(false);
    }

    function bindUi() {
        var parts = ui();
        if (parts.repair && !parts.repair.dataset.pwaBound) {
            parts.repair.dataset.pwaBound = '1';
            parts.repair.addEventListener('click', function () {
                clearGuard();
                state.updating = false;
                void hardRepairAndReload(false);
            });
        }
        if (parts.retry && !parts.retry.dataset.pwaBound) {
            parts.retry.dataset.pwaBound = '1';
            parts.retry.addEventListener('click', function () {
                clearGuard();
                state.updating = false;
                void retryNow();
            });
        }
        if (parts.bannerReload && !parts.bannerReload.dataset.pwaRecoveryBound) {
            parts.bannerReload.dataset.pwaRecoveryBound = '1';
            parts.bannerReload.addEventListener('click', function () {
                clearGuard();
                state.updating = false;
                void hardRepairAndReload(false);
            });
        }
        if (parts.bannerLater) parts.bannerLater.hidden = true;
    }

    async function start() {
        bindUi();

        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.addEventListener('message', function (event) {
                var data = event && event.data;
                if (!data || data.type !== 'TRINOTIME_SW_ACTIVATED') return;
                state.workerVersion = String(data.version || '');
                state.workerFingerprint = String(data.fingerprint || '');
                publishDiagnostics('worker-activated');
                void purgeTrinoCaches();
            });
        }

        // Migration step for older releases: remove only TrinoTime's obsolete Cache Storage
        // generations immediately. Local/session storage and Firebase-backed business data are untouched.
        await purgeTrinoCaches();
        await ensureLatestWorker();

        var serverBuild = await fetchServerBuild();
        if (serverBuild && serverBuild.ready !== false && !buildIsCurrent(serverBuild)) {
            await recoverToServerBuild(serverBuild);
            return;
        }

        clearGuard();
        cleanRecoveryQuery();
        hideRecovery();
        publishDiagnostics('current');

        // Re-run a no-store server build check when the tab becomes active again. This is cheap,
        // independent of login state, and prevents a long-lived tab from missing a deployment.
        window.addEventListener('focus', function () {
            window.setTimeout(async function () {
                var fresh = await fetchServerBuild();
                if (fresh && fresh.ready !== false && !buildIsCurrent(fresh)) {
                    state.updating = false;
                    await recoverToServerBuild(fresh);
                }
            }, 80);
        });
        window.addEventListener('online', function () {
            window.setTimeout(async function () {
                var fresh = await fetchServerBuild();
                if (fresh && fresh.ready !== false && !buildIsCurrent(fresh)) {
                    state.updating = false;
                    await recoverToServerBuild(fresh);
                }
            }, 80);
        });
    }

    var api = {
        managed: true,
        version: '1.1.76',
        repair: function () {
            clearGuard();
            state.updating = false;
            return hardRepairAndReload(false);
        },
        retry: retryNow,
        check: fetchServerBuild,
        diagnostics: function () {
            return {
                currentVersion: state.currentVersion,
                currentFingerprint: state.currentFingerprint,
                serverVersion: state.serverVersion,
                serverFingerprint: state.serverFingerprint,
                workerVersion: state.workerVersion,
                workerFingerprint: state.workerFingerprint,
                updating: state.updating,
                repaired: state.repaired,
                lastError: state.lastError
            };
        }
    };
    window.TrinoTimePWA = api;
    publishDiagnostics('booting');

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { void start(); }, { once: true });
    } else {
        void start();
    }
}());
