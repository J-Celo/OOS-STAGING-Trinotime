    (() => {
        const root = document.documentElement;
        if (!isPremiumFeatureEnabled()) {
            root.dataset.glassPerformance = 'normal';
            root.dataset.performanceModeSource = 'edition';
            return;
        }
        const PREF_KEY = 'trinotime:performancePreference:v2';
        const LEGACY_LOW_KEY = 'trinotime:lowPerformanceMode:v1';
        const SESSION_FPS_KEY = 'trinotime:lowFpsDetected:v1';
        const SESSION_FPS_META_KEY = 'trinotime:lowFpsMeta:v1';
        const VALID_PREFS = new Set(['auto', 'full', 'low']);
        const state = {
            preference: 'auto',
            lowFps: false,
            fpsSamples: [],
            reason: '',
            mode: 'full',
            testInProgress: false,
            lastTestAt: 0
        };
        const media = query => {
            try { return !!(window.matchMedia && window.matchMedia(query).matches); }
            catch (e) { return false; }
        };
        const localGet = key => { try { return localStorage.getItem(key); } catch (e) { return null; } };
        const localSet = (key, value) => { try { localStorage.setItem(key, value); return true; } catch (e) { return false; } };
        const localRemove = key => { try { localStorage.removeItem(key); } catch (e) {} };
        const sessionGet = key => { try { return sessionStorage.getItem(key); } catch (e) { return null; } };
        const sessionSet = (key, value) => { try { sessionStorage.setItem(key, value); } catch (e) {} };
        const sessionRemove = key => { try { sessionStorage.removeItem(key); } catch (e) {} };

        const storedPref = localGet(PREF_KEY);
        if (VALID_PREFS.has(storedPref)) {
            state.preference = storedPref;
        } else if (localGet(LEGACY_LOW_KEY) === '1') {
            state.preference = 'low';
            localSet(PREF_KEY, 'low');
            localRemove(LEGACY_LOW_KEY);
        }
        state.lowFps = sessionGet(SESSION_FPS_KEY) === '1';
        if (state.lowFps) {
            try {
                const meta = JSON.parse(sessionGet(SESSION_FPS_META_KEY) || '{}');
                if (Array.isArray(meta.fpsSamples)) {
                    state.fpsSamples = meta.fpsSamples.filter(Number.isFinite).slice(-2);
                }
                if (Number.isFinite(meta.lastTestAt)) state.lastTestAt = meta.lastTestAt;
            } catch (e) {}
        }

        function clearSessionFpsLock() {
            state.lowFps = false;
            sessionRemove(SESSION_FPS_KEY);
            sessionRemove(SESSION_FPS_META_KEY);
        }

        function lockSessionForLowFps() {
            state.lowFps = true;
            state.lastTestAt = Date.now();
            sessionSet(SESSION_FPS_KEY, '1');
            sessionSet(SESSION_FPS_META_KEY, JSON.stringify({
                fpsSamples: state.fpsSamples.filter(Number.isFinite).slice(-2),
                lastTestAt: state.lastTestAt
            }));
        }

        function supportsBackdropFilter() {
            try {
                return !!(window.CSS && CSS.supports && (
                    CSS.supports('backdrop-filter', 'blur(1px)') ||
                    CSS.supports('-webkit-backdrop-filter', 'blur(1px)')
                ));
            } catch (e) { return false; }
        }

        function hardwareSnapshot() {
            const width = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
            const cores = Number(navigator.hardwareConcurrency || 0);
            const memory = Number(navigator.deviceMemory || 0);
            const saveData = !!(navigator.connection && navigator.connection.saveData);
            const compact = width <= 780;
            const touchTablet = media('(pointer: coarse)') && width <= 1024;
            const reducedMotion = media('(prefers-reduced-motion: reduce)');
            const slowUpdate = media('(update: slow)');
            const noBackdrop = !supportsBackdropFilter();
            return { width, cores, memory, saveData, compact, touchTablet, reducedMotion, slowUpdate, noBackdrop };
        }

        function autoClassification(h) {
            if (h.noBackdrop) return { mode:'low', reason:'Backdrop blur is not supported by this browser/GPU.' };
            if (state.lowFps) return { mode:'low', reason:'Repeated low frame-rate was detected; Low mode is locked for this browser session.' };
            if (h.saveData) return { mode:'low', reason:'Data Saver is enabled; lightweight rendering is active.' };
            if (h.slowUpdate) return { mode:'low', reason:'The display reports a slow update profile.' };
            if (h.cores > 0 && h.cores <= 2) return { mode:'low', reason:`Low CPU capacity detected (${h.cores} logical cores).` };
            if (h.memory > 0 && h.memory <= 2) return { mode:'low', reason:`Low device memory detected (${h.memory} GB reported).` };
            if (h.cores > 0 && h.cores <= 4 && h.memory > 0 && h.memory <= 4) return { mode:'low', reason:`Constrained hardware detected (${h.cores} cores / ${h.memory} GB reported).` };
            if (h.memory > 0 && h.memory <= 4) return { mode:'reduced', reason:`Reduced glass is active for ${h.memory} GB reported device memory.` };
            if (h.compact || h.touchTablet || h.reducedMotion) return { mode:'reduced', reason:'Reduced glass is active for this screen/input or accessibility profile.' };
            return { mode:'full', reason:'Hardware profile supports Full Liquid Glass.' };
        }

        function classifyPerformance() {
            const h = hardwareSnapshot();
            if (state.preference === 'low') {
                return { mode:'low', reason:'Low Performance is manually selected.', hardware:h, source:'manual-low' };
            }
            if (state.preference === 'full') {
                const note = h.noBackdrop ? ' Full mode is selected, but this browser may ignore backdrop blur.' : '';
                return { mode:'full', reason:`Full Liquid Glass is manually selected.${note}`, hardware:h, source:'manual-full' };
            }
            const auto = autoClassification(h);
            return { ...auto, hardware:h, source:'auto' };
        }

        function preferenceLabel() {
            return state.preference === 'full' ? 'Forced Full' : state.preference === 'low' ? 'Forced Low' : 'Auto';
        }
        function renderingLabel(mode) {
            return mode === 'low' ? 'Low Performance' : mode === 'reduced' ? 'Reduced Glass' : 'Full Liquid Glass';
        }
        function blurLabel(mode, hardware) {
            if (hardware && hardware.noBackdrop) return 'Unsupported';
            return mode === 'low' ? 'Disabled' : mode === 'reduced' ? 'Reduced' : 'Full';
        }
        function motionLabel(mode, hardware) {
            if (hardware && hardware.reducedMotion) return 'System reduced';
            return mode === 'low' ? 'Minimal' : mode === 'reduced' ? 'Reduced' : 'Premium';
        }
        function latestFpsLabel() {
            const value = state.fpsSamples.length ? state.fpsSamples[state.fpsSamples.length - 1] : null;
            return Number.isFinite(value) ? `${Math.round(value)} FPS` : 'Not tested';
        }

        function updateSettingsUi(result) {
            document.querySelectorAll('[data-performance-choice]').forEach(button => {
                const active = button.dataset.performanceChoice === state.preference;
                button.setAttribute('aria-pressed', active ? 'true' : 'false');
            });
            const status = document.getElementById('performanceModeStatus');
            const badge = document.getElementById('performanceModeBadge');
            const rendering = document.getElementById('performanceRenderingValue');
            const source = document.getElementById('performanceSourceValue');
            const fps = document.getElementById('performanceFpsValue');
            const blur = document.getElementById('performanceBlurValue');
            const motion = document.getElementById('performanceMotionValue');
            const retest = document.getElementById('performanceRetestBtn');
            if (rendering) rendering.textContent = renderingLabel(result.mode);
            if (source) source.textContent = preferenceLabel();
            if (fps) fps.textContent = latestFpsLabel();
            if (blur) blur.textContent = blurLabel(result.mode, result.hardware);
            if (motion) motion.textContent = motionLabel(result.mode, result.hardware);
            if (status) {
                const h = result.hardware || {};
                const hardwareBits = [];
                if (h.cores) hardwareBits.push(`${h.cores} cores`);
                if (h.memory) hardwareBits.push(`${h.memory} GB memory`);
                const hw = hardwareBits.length ? ` · ${hardwareBits.join(' / ')}` : '';
                const testing = state.testInProgress ? ' · Performance test running…' : '';
                const sessionLock = state.lowFps && state.preference === 'auto'
                    ? ' · Session FPS lock active until this browser session ends or you choose Retest Performance.'
                    : '';
                status.textContent = `${result.reason}${hw}${testing}${sessionLock}`;
            }
            if (badge) {
                badge.classList.toggle('is-low', result.mode === 'low');
                badge.classList.toggle('is-full', result.mode === 'full');
                badge.classList.toggle('is-reduced', result.mode === 'reduced');
                badge.textContent = result.mode === 'low' ? 'Low' : result.mode === 'reduced' ? 'Reduced' : 'Full';
            }
            if (retest) {
                retest.disabled = state.testInProgress || state.preference === 'low';
                retest.textContent = state.testInProgress ? 'Testing…' : 'Retest Performance';
                retest.title = state.preference === 'low' ? 'Switch to Auto or Full before retesting performance.' : 'Run a fresh frame-rate health check.';
            }
        }

        function applyPerformanceMode() {
            const result = classifyPerformance();
            state.mode = result.mode;
            state.reason = result.reason;
            root.dataset.glassPerformance = result.mode;
            root.dataset.performanceModeSource = result.source;
            root.dataset.performancePreference = state.preference;
            updateSettingsUi(result);
            try {
                window.dispatchEvent(new CustomEvent('trinotime:performance-mode', { detail: { ...result, preference:state.preference, lowFps:state.lowFps } }));
            } catch (e) {}
            return result;
        }

        function setPreference(preference) {
            const next = VALID_PREFS.has(preference) ? preference : 'auto';
            state.preference = next;
            if (next === 'auto') localRemove(PREF_KEY);
            else localSet(PREF_KEY, next);
            applyPerformanceMode();
            if (next === 'auto' && !state.lowFps && !state.fpsSamples.length) {
                setTimeout(runFpsHealthCheck, 450);
            }
        }

        let resizeRaf = 0;
        function queueResolve() {
            if (resizeRaf) cancelAnimationFrame(resizeRaf);
            resizeRaf = requestAnimationFrame(() => {
                resizeRaf = 0;
                applyPerformanceMode();
            });
        }

        function sampleFrameRate(durationMs = 1350) {
            return new Promise(resolve => {
                if (document.visibilityState !== 'visible') return resolve(null);
                const intervals = [];
                let start = 0;
                let previous = 0;
                function frame(ts) {
                    if (document.visibilityState !== 'visible') return resolve(null);
                    if (!start) { start = ts; previous = ts; return requestAnimationFrame(frame); }
                    const dt = ts - previous;
                    previous = ts;
                    if (dt > 0 && dt < 250) intervals.push(dt);
                    if (ts - start < durationMs) return requestAnimationFrame(frame);
                    if (intervals.length < 20) return resolve(null);
                    const sorted = intervals.slice().sort((a,b) => a-b);
                    const trimmed = sorted.slice(0, Math.max(20, Math.floor(sorted.length * .90)));
                    const avg = trimmed.reduce((sum, n) => sum + n, 0) / trimmed.length;
                    resolve(avg > 0 ? 1000 / avg : null);
                }
                requestAnimationFrame(frame);
            });
        }

        async function runFpsHealthCheck({ force = false } = {}) {
            if (state.testInProgress || document.visibilityState !== 'visible') return;
            if (!force && state.preference !== 'auto') return;
            if (!force && state.lowFps) return;
            if (state.preference === 'low') return;
            state.testInProgress = true;
            if (force) {
                clearSessionFpsLock();
                state.fpsSamples = [];
                state.lastTestAt = 0;
                applyPerformanceMode();
            }
            updateSettingsUi(classifyPerformance());
            try {
                const first = await sampleFrameRate(1450);
                if (!Number.isFinite(first)) return;
                state.fpsSamples.push(first);
                updateSettingsUi(classifyPerformance());
                if (first < 45) {
                    await new Promise(resolve => setTimeout(resolve, 900));
                    if (document.visibilityState !== 'visible') return;
                    const second = await sampleFrameRate(1450);
                    if (Number.isFinite(second)) state.fpsSamples.push(second);
                    if (Number.isFinite(second) && first < 45 && second < 45) {
                        lockSessionForLowFps();
                    } else {
                        clearSessionFpsLock();
                    }
                } else if (force) {
                    clearSessionFpsLock();
                }
                if (!state.lastTestAt) state.lastTestAt = Date.now();
            } finally {
                state.testInProgress = false;
                applyPerformanceMode();
            }
        }

        async function retestPerformance() {
            if (state.preference === 'low') return;
            await runFpsHealthCheck({ force:true });
        }

        function bindSettingsControls() {
            document.querySelectorAll('[data-performance-choice]').forEach(button => {
                if (button.dataset.performanceBound) return;
                button.dataset.performanceBound = '1';
                button.addEventListener('click', () => setPreference(button.dataset.performanceChoice));
            });
            const retest = document.getElementById('performanceRetestBtn');
            if (retest && !retest.dataset.bound) {
                retest.dataset.bound = '1';
                retest.addEventListener('click', () => { void retestPerformance(); });
            }
            updateSettingsUi(classifyPerformance());
        }

        function syncPageVisibility() {
            root.dataset.pageVisibility = document.visibilityState === 'hidden' ? 'hidden' : 'visible';
            if (document.visibilityState === 'visible') queueResolve();
        }

        window.TrinoPerformanceMode = {
            getState: () => ({ ...state, hardware:hardwareSnapshot() }),
            refresh: applyPerformanceMode,
            setPreference,
            retest: retestPerformance,

            setLowPerformance: enabled => setPreference(enabled ? 'low' : 'auto')
        };

        syncPageVisibility();
        applyPerformanceMode();
        document.addEventListener('DOMContentLoaded', bindSettingsControls, { once:true });
        window.addEventListener('resize', queueResolve, { passive:true });
        window.addEventListener('orientationchange', queueResolve, { passive:true });
        document.addEventListener('visibilitychange', syncPageVisibility);
        try {
            const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
            if (mq.addEventListener) mq.addEventListener('change', queueResolve);
            else if (mq.addListener) mq.addListener(queueResolve);
        } catch (e) {}




        window.addEventListener('load', () => setTimeout(() => runFpsHealthCheck(), 2800), { once:true });
    })();



/* TrinoTime v1.0.36 — adaptive ambient workspace video manager. */
(() => {
    const VIDEO_SOURCE = 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260428_193507_4286c423-2fd9-4efd-92bd-91a939453fc1.mp4';
    const ready = () => {
        const root = document.documentElement;
        const body = document.body;
        const ambient = document.getElementById('ttRivrAmbient');
        const video = document.getElementById('ttRivrAmbientVideo');
        if (!body || !ambient || !video) return;
        const source = video.querySelector('source');
        if (!source) return;

        const media = query => {
            try { return !!(window.matchMedia && window.matchMedia(query).matches); }
            catch (e) { return false; }
        };
        const hasSaveData = () => !!(navigator.connection && navigator.connection.saveData);
        const roleAllowed = () => ['admin','teamleader','agent'].includes(String(body.dataset.trinoRole || ''));
        const customWorkspace = () => root.dataset.trinoCustomWorkspace === 'enabled';
        const motionAllowed = () => !media('(prefers-reduced-motion: reduce)');
        const performanceAllowed = () => root.dataset.glassPerformance !== 'low';
        const shouldStream = () => customWorkspace() && roleAllowed() && motionAllowed() && performanceAllowed() && !hasSaveData();

        let attached = false;
        let playRequest = 0;
        function detach() {
            playRequest += 1;
            ambient.classList.remove('is-video-ready');
            try { video.pause(); } catch (e) {}
            if (attached) {
                source.removeAttribute('src');
                source.removeAttribute('data-loaded');
                attached = false;
                try { video.load(); } catch (e) {}
            }
        }
        async function attachAndPlay() {
            if (!shouldStream()) return detach();
            if (!attached) {
                source.src = source.dataset.src || VIDEO_SOURCE;
                source.dataset.loaded = '1';
                attached = true;
                try { video.load(); } catch (e) {}
            }
            if (document.visibilityState !== 'visible') return;
            const requestId = ++playRequest;
            try {
                await video.play();
                if (requestId === playRequest && shouldStream()) ambient.classList.add('is-video-ready');
            } catch (e) {
                ambient.classList.remove('is-video-ready');
            }
        }
        function sync() {
            if (!shouldStream()) detach();
            else void attachAndPlay();
        }
        video.addEventListener('playing', () => { if (shouldStream()) ambient.classList.add('is-video-ready'); });
        video.addEventListener('error', () => ambient.classList.remove('is-video-ready'));
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                try { video.pause(); } catch (e) {}
                ambient.classList.remove('is-video-ready');
            } else sync();
        });
        window.addEventListener('trinotime:performance-mode', sync);
        try {
            const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
            if (reduced.addEventListener) reduced.addEventListener('change', sync);
            else if (reduced.addListener) reduced.addListener(sync);
        } catch (e) {}
        try {
            if (navigator.connection && navigator.connection.addEventListener) navigator.connection.addEventListener('change', sync);
        } catch (e) {}
        new MutationObserver(sync).observe(root, { attributes:true, attributeFilter:['data-trino-custom-workspace','data-glass-performance'] });
        new MutationObserver(sync).observe(body, { attributes:true, attributeFilter:['data-trino-role'] });
        sync();
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready, { once:true });
    else ready();
})();
