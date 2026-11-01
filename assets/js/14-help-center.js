/* TrinoTime v1.0.6 Help Center runtime
 * Search, contextual help routing, and non-destructive guide navigation only.
 */
(() => {
    'use strict';

    const VERSION = '1.0.6';
    const $ = id => document.getElementById(id);
    const settingsOverlay = $('settingsOverlay');
    if (!settingsOverlay) return;

    const roleTopicMap = Object.freeze({
        'dayoff': { agent:'helpAgentSchedules', teamleader:'helpTlDayOff', admin:'helpAdminDayOff', fallback:'helpFeatureDayOff' },
        'shift-times': { agent:'helpFeatureShiftTimes', teamleader:'helpTlShiftTimes', admin:'helpAdminShiftTimes', fallback:'helpFeatureShiftTimes' },
        'network': { agent:'helpAgentNetwork', teamleader:'helpFeatureNetwork', admin:'helpAdminNetwork', fallback:'helpFeatureNetwork' },
        'leave': { agent:'helpAgentSchedules', teamleader:'helpTlOperations', admin:'helpAdminAttendance', fallback:'helpFeatureLeave' },
        'tl-attendance': { agent:'helpFeatureTlAttendance', teamleader:'helpTlAttendance', admin:'helpAdminAttendance', fallback:'helpFeatureTlAttendance' },
        'roster': { agent:'helpFeatureRoster', teamleader:'helpTlOperations', admin:'helpAdminIdentity', fallback:'helpFeatureRoster' },
        'profile': { agent:'helpAgentProfile', teamleader:'helpFeatureProfiles', admin:'helpAdminIdentity', fallback:'helpFeatureProfiles' },
        'security': { agent:'helpAgentLogin', teamleader:'helpTlOperations', admin:'helpAdminIdentity', fallback:'helpPermissions' },
        'sync': { agent:'helpLiveSync', teamleader:'helpLiveSync', admin:'helpLiveSync', fallback:'helpLiveSync' }
    });

    function currentRole() {
        const role = String($('sessionIndicator')?.dataset?.role || '').toLowerCase();
        if (role === 'admin') return 'admin';
        if (role === 'teamleader') return 'teamleader';
        if (role === 'agent') return 'agent';
        return 'fallback';
    }

    function targetTabFor(element) {
        const panel = element?.closest?.('.settings-tab-panel');
        if (!panel) return 'tutorial';
        if (panel.id === 'settingsPanelFeatures') return 'features';
        if (panel.id === 'settingsPanelTutorial') return 'tutorial';
        return 'tutorial';
    }

    function activateSettingsTab(tab) {
        const btn = document.querySelector(`.settings-tab-btn[data-settings-tab="${tab}"]`);
        if (btn) btn.click();
    }

    let suspendedSourceOverlay = null;
    let navigationEpoch = 0;
    const pendingFrames = new Set();
    const pendingTimers = new Set();
    let roleGuides = [];

    function cancelPendingNavigation() {
        navigationEpoch += 1;
        pendingFrames.forEach(id => cancelAnimationFrame(id)); pendingFrames.clear();
        pendingTimers.forEach(id => clearTimeout(id)); pendingTimers.clear();
    }
    function queueFrame(callback, epoch) {
        const id = requestAnimationFrame(() => { pendingFrames.delete(id); if (epoch !== navigationEpoch || !settingsOverlay.classList.contains('open')) return; callback(); });
        pendingFrames.add(id); return id;
    }
    function queueTimer(callback, delay, epoch) {
        const id = setTimeout(() => { pendingTimers.delete(id); if (epoch !== navigationEpoch || !settingsOverlay.classList.contains('open')) return; callback(); }, delay);
        pendingTimers.add(id); return id;
    }

    function suspendSourceOverlay(sourceElement) {
        const overlay = sourceElement?.closest?.('.modal-overlay');
        if (!overlay || overlay === settingsOverlay) return;
        if (suspendedSourceOverlay && suspendedSourceOverlay.element !== overlay) restoreSourceOverlay();
        suspendedSourceOverlay = {
            element: overlay,
            ariaHidden: overlay.getAttribute('aria-hidden'),
            hadInert: overlay.hasAttribute('inert')
        };
        overlay.setAttribute('aria-hidden', 'true');
        overlay.setAttribute('inert', '');
    }

    function restoreSourceOverlay() {
        if (!suspendedSourceOverlay) return;
        const { element, ariaHidden, hadInert } = suspendedSourceOverlay;
        if (element && element.isConnected) {
            if (ariaHidden === null) element.removeAttribute('aria-hidden');
            else element.setAttribute('aria-hidden', ariaHidden);
            if (!hadInert) element.removeAttribute('inert');
        }
        suspendedSourceOverlay = null;
    }

    function openSettingsForHelp(sourceElement) {
        suspendSourceOverlay(sourceElement);
        const gear = $('settingsGearBtn');
        if (!settingsOverlay.classList.contains('open') && gear) gear.click();
        if (!settingsOverlay.classList.contains('open')) settingsOverlay.classList.add('open');
        settingsOverlay.classList.add('help-context-open');
    }

    function revealTarget(target) {
        if (!target) return;
        const guide = target.matches?.('details.settings-guide-role') ? target : target.closest?.('details.settings-guide-role');
        if (guide && !guide.open) guide.open = true;
    }

    function focusTopic(target, epoch) {
        if (!target || epoch !== navigationEpoch || !settingsOverlay.classList.contains('open')) return;
        revealTarget(target);
        target.classList.remove('help-topic-highlight');
        void target.offsetWidth;
        target.classList.add('help-topic-highlight');
        target.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
        const heading = target.querySelector('h4, h3, [role="heading"]');
        if (heading) {
            const hadTabIndex = heading.hasAttribute('tabindex');
            if (!hadTabIndex) { heading.setAttribute('tabindex', '-1'); heading.dataset.helpTempTabindex = 'true'; }
            queueTimer(() => {
                try { heading.focus({ preventScroll: true }); } catch (_) {}
                if (!hadTabIndex) queueTimer(() => { heading.removeAttribute('tabindex'); delete heading.dataset.helpTempTabindex; }, 500, epoch);
            }, 260, epoch);
        }
        queueTimer(() => target.classList.remove('help-topic-highlight'), 1900, epoch);
    }

    function openTargetById(id, sourceElement = null) {
        const target = $(id);
        if (!target) return false;
        cancelPendingNavigation();
        const epoch = navigationEpoch;
        openSettingsForHelp(sourceElement);
        activateSettingsTab(targetTabFor(target));
        queueFrame(() => queueFrame(() => focusTopic(target, epoch), epoch), epoch);
        return true;
    }

    function openTopic(topic, sourceElement = null) {
        const route = roleTopicMap[String(topic || '')];
        if (!route) return false;
        const id = route[currentRole()] || route.fallback;
        return openTargetById(id, sourceElement) || openTargetById(route.fallback, sourceElement);
    }

    function cleanText(value) {
        return String(value || '').replace(/\s+/g, ' ').trim();
    }

    function helpIndex() {
        const nodes = Array.from(document.querySelectorAll('#settingsPanelFeatures [data-help-item], #settingsPanelTutorial [data-help-item]'));
        const used = new Set();
        return nodes.map((node, index) => {
            if (!node.id) node.id = `helpGeneratedTopic${index + 1}`;
            if (used.has(node.id)) return null;
            used.add(node.id);
            const title = cleanText(node.dataset.helpTitle || node.querySelector('h4,h3')?.textContent || 'Help topic');
            const keywords = cleanText(node.dataset.helpKeywords || '');
            const body = cleanText(node.textContent).replace(title, '').trim();
            const tab = targetTabFor(node);
            return { node, id:node.id, title, keywords, body, tab, haystack:`${title} ${keywords} ${body}`.toLowerCase() };
        }).filter(Boolean);
    }

    let indexedTopics = [];

    function scoreTopic(item, rawQuery) {
        const query = cleanText(rawQuery).toLowerCase();
        if (!query) return 0;
        const tokens = query.split(/\s+/).filter(Boolean);
        if (!tokens.every(token => item.haystack.includes(token))) return 0;
        let score = 1;
        const title = item.title.toLowerCase();
        const keywords = item.keywords.toLowerCase();
        if (title === query) score += 20;
        else if (title.startsWith(query)) score += 12;
        else if (title.includes(query)) score += 8;
        if (keywords.includes(query)) score += 6;
        tokens.forEach(token => {
            if (title.includes(token)) score += 3;
            if (keywords.includes(token)) score += 2;
        });
        return score;
    }

    function resultExcerpt(item, query) {
        const body = cleanText(item.body);
        if (!body) return '';
        const lower = body.toLowerCase();
        const token = cleanText(query).toLowerCase().split(/\s+/).find(Boolean) || '';
        const at = token ? lower.indexOf(token) : -1;
        const start = at > 45 ? Math.max(0, at - 38) : 0;
        const slice = body.slice(start, start + 150);
        return `${start ? '…' : ''}${slice}${body.length > start + 150 ? '…' : ''}`;
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
    }

    function renderSearchResults(host, query) {
        const results = host.querySelector('.settings-help-search-results');
        const input = host.querySelector('input[type="search"]');
        if (!results || !input) return;
        const normalized = cleanText(query);
        if (!normalized) {
            results.hidden = true;
            results.innerHTML = '';
            input.setAttribute('aria-expanded', 'false');
            return;
        }
        const matches = indexedTopics
            .map(item => ({ item, score:scoreTopic(item, normalized) }))
            .filter(row => row.score > 0)
            .sort((a,b) => b.score - a.score || a.item.title.localeCompare(b.item.title))
            .slice(0, 12);
        results.innerHTML = matches.length ? matches.map(({item}) => `
            <button class="settings-help-result" type="button" role="option" data-help-result-target="${escapeHtml(item.id)}">
                <strong>${escapeHtml(item.title)}</strong><small>${item.tab === 'features' ? 'Features' : 'Tutorials'}</small>
                <span>${escapeHtml(resultExcerpt(item, normalized))}</span>
            </button>`).join('') : '<div class="settings-help-result-empty">No matching help topics. Try a shorter phrase such as “day off”, “sync”, “shift”, or “password”.</div>';
        results.hidden = false;
        input.setAttribute('aria-expanded', 'true');
    }

    function syncAndSearch(sourceInput) {
        const query = sourceInput.value;
        document.querySelectorAll('.settings-help-search input[type="search"]').forEach(input => {
            if (input !== sourceInput) input.value = query;
        });
        document.querySelectorAll('.settings-help-search').forEach(host => renderSearchResults(host, query));
    }

    function clearSearch() {
        document.querySelectorAll('.settings-help-search input[type="search"]').forEach(input => {
            input.value = '';
            input.setAttribute('aria-expanded', 'false');
        });
        document.querySelectorAll('.settings-help-search-results').forEach(results => {
            results.hidden = true;
            results.innerHTML = '';
        });
    }

    function init() {
        indexedTopics = helpIndex();
        document.querySelectorAll('.settings-help-search input[type="search"]').forEach(input => {
            input.addEventListener('input', () => syncAndSearch(input));
            input.addEventListener('keydown', event => {
                if (event.key === 'Escape') {
                    event.stopPropagation();
                    clearSearch();
                    input.focus();
                } else if (event.key === 'Enter') {
                    const host = input.closest('.settings-help-search');
                    const first = host?.querySelector('[data-help-result-target]');
                    if (first) {
                        event.preventDefault();
                        openTargetById(first.dataset.helpResultTarget);
                        clearSearch();
                    }
                }
            });
        });

        document.addEventListener('click', event => {
            const helpBtn = event.target.closest?.('[data-help-topic]');
            if (helpBtn) {
                event.preventDefault();
                event.stopPropagation();
                openTopic(helpBtn.dataset.helpTopic, helpBtn);
                return;
            }
            const result = event.target.closest?.('[data-help-result-target]');
            if (result) {
                event.preventDefault();
                openTargetById(result.dataset.helpResultTarget);
                clearSearch();
                return;
            }
            const jump = event.target.closest?.('[data-help-jump]');
            if (jump) {
                event.preventDefault();
                openTargetById(jump.dataset.helpJump);
                return;
            }
            if (event.target.closest?.('[data-help-search-clear]')) {
                event.preventDefault();
                const host = event.target.closest('.settings-help-search');
                clearSearch();
                host?.querySelector('input[type="search"]')?.focus();
            }
        });

        roleGuides = Array.from(document.querySelectorAll('details.settings-guide-role'));
        roleGuides.forEach(guide => {
            const summary = guide.querySelector(':scope > summary');
            const syncExpanded = () => summary?.setAttribute('aria-expanded', guide.open ? 'true' : 'false');
            syncExpanded();
            guide.addEventListener('toggle', () => {
                syncExpanded();
                if (!guide.open) return;
                roleGuides.forEach(other => {
                    if (other !== guide && other.open) other.open = false;
                });
            });
        });

        function cleanupSettingsHelpState() {
            cancelPendingNavigation();
            clearSearch();
            document.querySelectorAll('.help-topic-highlight').forEach(node => node.classList.remove('help-topic-highlight'));
            document.querySelectorAll('[data-help-temp-tabindex="true"]').forEach(node => { node.removeAttribute('tabindex'); delete node.dataset.helpTempTabindex; });
            roleGuides.forEach(guide => { const shouldOpen = guide.id === 'helpAgentGuide'; if (guide.open !== shouldOpen) guide.open = shouldOpen; });
            restoreSourceOverlay();
        }
        window.addEventListener('trinotime:settings-closing', cleanupSettingsHelpState);
        const observer = new MutationObserver(() => { if (!settingsOverlay.classList.contains('open')) cleanupSettingsHelpState(); });
        observer.observe(settingsOverlay, { attributes:true, attributeFilter:['class'] });

        window.TrinoTimeHelp = Object.freeze({
            version: VERSION,
            open: openTopic,
            openTarget: openTargetById,
            searchCount: () => indexedTopics.length,
            openGuide: id => openTargetById(id),
            beforeSettingsClose: cleanupSettingsHelpState,
            onSettingsClosed: cleanupSettingsHelpState
        });
        document.documentElement.dataset.helpCenter = VERSION;
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
    else init();
})();
