(function () {
    'use strict';
    if (window.TrinoTimeProductionDiagnostics) return;

    const byId = (id) => document.getElementById(id);
    const esc = (value) => String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    let lastRoles = null;
    let lastIntegrity = null;
    let lastLive = null;
    let lastRunAt = 0;
    let running = false;

    function diagnosticsApi() {
        const core = window.TrinoTimeCore;
        return core && core.productionDiagnostics ? core.productionDiagnostics : null;
    }

    function permissionApi() {
        const core = window.TrinoTimeCore;
        return core && core.permissions ? core.permissions : null;
    }

    function adminAllowed() {
        try {
            const permissions = permissionApi();
            const actor = permissions && typeof permissions.actor === 'function' ? permissions.actor() : null;
            return !!(permissions && actor && actor.role === 'admin' && actor.authenticated && permissions.can('system.health.view'));
        } catch (_) {
            return false;
        }
    }

    function fmtMs(value) {
        const ms = Number(value);
        return Number.isFinite(ms) && ms >= 0 ? `${Math.round(ms)} ms` : 'Not confirmed';
    }

    function fmtTime(value) {
        const ms = Number(value);
        if (!Number.isFinite(ms) || ms <= 0) return 'Never';
        try {
            return new Intl.DateTimeFormat(undefined, {
                month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit'
            }).format(new Date(ms));
        } catch (_) {
            return new Date(ms).toLocaleString();
        }
    }

    function setText(id, text) {
        const el = byId(id);
        if (el) el.textContent = text;
    }

    function setStatus(text, state) {
        const el = byId('productionDiagnosticsStatus');
        if (!el) return;
        el.textContent = text;
        el.dataset.state = state || 'idle';
        el.title = lastLive && lastLive.error ? String(lastLive.error) : '';
    }

    function setBusy(value) {
        running = !!value;
        ['productionDiagnosticsRunBtn', 'productionIntegrityRunBtn'].forEach((id) => {
            const btn = byId(id);
            if (btn) btn.disabled = running;
        });
    }

    function roleState(snapshot) {
        const summary = snapshot && snapshot.summary;
        if (!summary) return 'idle';
        if (summary.fail) return 'fail';
        if (summary.warn) return 'warn';
        return 'pass';
    }

    function liveState(live) {
        if (!live || !live.ranAt) return 'idle';
        if (live.state === 'fail' || live.readMs == null || live.writeMs == null || live.readbackMs == null || live.restoreMs == null) return 'fail';
        if (live.listenerMs == null) return 'warn';
        return 'pass';
    }

    function integrityState(snapshot) {
        if (!snapshot) return 'idle';
        if (Number(snapshot.critical || 0) > 0) return 'fail';
        if (Number(snapshot.warning || 0) > 0) return 'warn';
        return 'pass';
    }

    function overallState() {
        const states = [roleState(lastRoles), liveState(lastLive), integrityState(lastIntegrity)].filter((state) => state !== 'idle');
        if (!states.length) return 'idle';
        if (states.includes('fail')) return 'fail';
        if (states.includes('warn')) return 'warn';
        return 'pass';
    }

    function refreshSummary() {
        const roleSummary = lastRoles && lastRoles.summary;
        if (roleSummary) {
            const passing = Number(roleSummary.pass || 0);
            const total = Number(roleSummary.total || 0);
            const suffix = roleSummary.fail ? ` · ${roleSummary.fail} failed` : (roleSummary.warn ? ` · ${roleSummary.warn} warning` : ' · clear');
            setText('productionDiagRoles', `${passing}/${total} passed${suffix}`);
        } else {
            setText('productionDiagRoles', 'Not run');
        }

        if (lastLive && lastLive.ranAt) {
            setText('productionDiagRead', lastLive.readMs == null ? 'Failed' : fmtMs(lastLive.readMs));
            setText('productionDiagWrite', lastLive.writeMs == null ? 'Failed' : (lastLive.restoreMs == null ? `${fmtMs(lastLive.writeMs)} · restore failed` : `${fmtMs(lastLive.writeMs)} · restored`));
            setText('productionDiagListener', lastLive.listenerMs == null ? 'Not observed' : fmtMs(lastLive.listenerMs));
        } else {
            setText('productionDiagRead', 'Not run');
            setText('productionDiagWrite', 'Not run');
            setText('productionDiagListener', 'Not run');
        }

        if (lastIntegrity) {
            const critical = Number(lastIntegrity.critical || 0);
            const warning = Number(lastIntegrity.warning || 0);
            setText('productionDiagIntegrity', critical || warning ? `${critical} critical · ${warning} warning` : 'Clear');
        } else {
            setText('productionDiagIntegrity', 'Not run');
        }
        setText('productionDiagLastRun', fmtTime(lastRunAt || (lastLive && lastLive.ranAt) || (lastIntegrity && lastIntegrity.ranAt) || (lastRoles && lastRoles.ranAt)));

        const state = overallState();
        if (running) setStatus('Running checks…', 'running');
        else if (state === 'fail') setStatus('Action required', 'fail');
        else if (state === 'warn') setStatus('Review warnings', 'warn');
        else if (state === 'pass') setStatus('All checks passed', 'pass');
        else setStatus('Not run', 'idle');
    }

    function renderRoleResults(snapshot) {
        const host = byId('productionRoleResults');
        if (!host) return;
        const results = snapshot && Array.isArray(snapshot.results) ? snapshot.results : [];
        if (!results.length) {
            host.innerHTML = '<p class="production-diagnostics-empty">No role tests have been run yet.</p>';
            return;
        }
        const roleOrder = Array.isArray(snapshot.roles) ? snapshot.roles : ['Admin', 'Team Leader', 'Backup TL', 'Agent'];
        const groups = roleOrder.map((role) => ({ role, items: results.filter((item) => item && item.role === role) })).filter((group) => group.items.length);
        host.innerHTML = groups.map((group) => {
            const counts = group.items.reduce((acc, item) => {
                const state = item && item.state || 'info';
                acc[state] = (acc[state] || 0) + 1;
                return acc;
            }, {});
            const groupState = counts.fail ? 'fail' : (counts.warn ? 'warn' : 'pass');
            const rows = group.items.map((item) => `
                <div class="production-diagnostics-row" data-state="${esc(item.state)}">
                    <span class="production-diagnostics-indicator" aria-hidden="true"></span>
                    <div><strong>${esc(item.label)}</strong><p>${esc(item.detail)}</p></div>
                    <span class="production-diagnostics-result">${esc(String(item.state || 'info').toUpperCase())}</span>
                </div>`).join('');
            return `
                <section class="production-diagnostics-role" data-state="${groupState}">
                    <header><h5>${esc(group.role)}</h5><span>${group.items.length} check${group.items.length === 1 ? '' : 's'}</span></header>
                    ${rows}
                </section>`;
        }).join('');
    }

    function renderIntegrity(snapshot) {
        const host = byId('productionIntegrityResults');
        if (!host) return;
        const issues = snapshot && Array.isArray(snapshot.issues) ? snapshot.issues : [];
        if (!snapshot) {
            host.innerHTML = '<p class="production-diagnostics-empty">No integrity scan has been run yet.</p>';
            return;
        }
        if (!issues.length) {
            host.innerHTML = '<div class="production-integrity-clear"><strong>✓ No integrity exceptions detected</strong><span>Attendance sequences, leave links, POD context, and Coaching locks are internally consistent on this device.</span></div>';
            return;
        }
        const rows = issues.slice(0, 40).map((issue) => {
            const severity = issue && issue.severity === 'critical' ? 'fail' : 'warn';
            const context = [issue && issue.name, issue && issue.pod, issue && issue.date].filter(Boolean).join(' · ');
            return `
                <div class="production-diagnostics-row" data-state="${severity}">
                    <span class="production-diagnostics-indicator" aria-hidden="true"></span>
                    <div><strong>${esc(issue && issue.title || 'Integrity review')}</strong><p>${context ? `${esc(context)} — ` : ''}${esc(issue && issue.detail || '')}</p></div>
                    <span class="production-diagnostics-result">${severity === 'fail' ? 'CRITICAL' : 'REVIEW'}</span>
                </div>`;
        }).join('');
        const remainder = issues.length > 40 ? `<p class="production-diagnostics-more">Showing the first 40 of ${issues.length} issues. Open Admin Review Center for the full actionable list.</p>` : '';
        host.innerHTML = rows + remainder;
    }

    function syncExistingSnapshots() {
        const api = diagnosticsApi();
        if (!api || !adminAllowed()) return;
        try {
            const integrity = api.getIntegritySnapshot && api.getIntegritySnapshot();
            if (integrity) lastIntegrity = integrity;
        } catch (_) {}
        try {
            const live = api.getLiveHealthProbe && api.getLiveHealthProbe();
            if (live && live.ranAt) lastLive = live;
        } catch (_) {}
        renderIntegrity(lastIntegrity);
        refreshSummary();
    }

    async function runFullDiagnostics() {
        if (running) return;
        const api = diagnosticsApi();
        if (!api || !adminAllowed()) return;
        setBusy(true);
        setStatus('Running checks…', 'running');
        try {
            const result = await api.runFull();
            if (result) {
                lastRoles = result.roles || null;
                lastIntegrity = result.integrity || null;
                lastLive = result.live || null;
                lastRunAt = Number(result.ranAt || Date.now());
            }
            renderRoleResults(lastRoles);
            renderIntegrity(lastIntegrity);
        } catch (error) {
            setStatus('Diagnostics failed', 'fail');
            const host = byId('productionRoleResults');
            if (host) host.innerHTML = `<div class="production-diagnostics-error"><strong>Diagnostics could not complete.</strong><span>${esc(error && error.message || String(error || 'Unknown error'))}</span></div>`;
        } finally {
            setBusy(false);
            refreshSummary();
            try { window.TrinoTimeCore && window.TrinoTimeCore.adminOps && window.TrinoTimeCore.adminOps.refresh && window.TrinoTimeCore.adminOps.refresh(); } catch (_) {}
        }
    }

    function runIntegrityScan() {
        if (running) return;
        const api = diagnosticsApi();
        if (!api || !adminAllowed()) return;
        setBusy(true);
        setStatus('Scanning records…', 'running');
        try {
            lastIntegrity = api.runIntegrityScan();
            lastRunAt = Date.now();
            renderIntegrity(lastIntegrity);
            const details = byId('productionIntegrityResults') && byId('productionIntegrityResults').closest('details');
            if (details) details.open = true;
        } catch (error) {
            const host = byId('productionIntegrityResults');
            if (host) host.innerHTML = `<div class="production-diagnostics-error"><strong>Integrity scan could not complete.</strong><span>${esc(error && error.message || String(error || 'Unknown error'))}</span></div>`;
        } finally {
            setBusy(false);
            refreshSummary();
            try { window.TrinoTimeCore && window.TrinoTimeCore.adminOps && window.TrinoTimeCore.adminOps.refresh && window.TrinoTimeCore.adminOps.refresh(); } catch (_) {}
        }
    }

    function refreshVisibility() {
        const panel = byId('productionDiagnosticsPanel');
        if (!panel) return;
        const allowed = adminAllowed();
        panel.hidden = !allowed;
        if (allowed) syncExistingSnapshots();
    }

    function bind() {
        const runBtn = byId('productionDiagnosticsRunBtn');
        const integrityBtn = byId('productionIntegrityRunBtn');
        if (runBtn && !runBtn.dataset.productionDiagnosticsBound) {
            runBtn.dataset.productionDiagnosticsBound = '1';
            runBtn.addEventListener('click', runFullDiagnostics);
        }
        if (integrityBtn && !integrityBtn.dataset.productionDiagnosticsBound) {
            integrityBtn.dataset.productionDiagnosticsBound = '1';
            integrityBtn.addEventListener('click', runIntegrityScan);
        }
        ['syncDiagnosticsRefreshBtn', 'systemHealthRetryBtn', 'systemHealthDiagnosticsBtn'].forEach((id) => {
            const btn = byId(id);
            if (!btn || btn.dataset.productionDiagnosticsRefreshBound) return;
            btn.dataset.productionDiagnosticsRefreshBound = '1';
            btn.addEventListener('click', () => window.setTimeout(refreshVisibility, 250));
        });
    }

    function init() {
        bind();
        refreshVisibility();
        window.setTimeout(refreshVisibility, 700);
        window.setInterval(() => {
            const panel = byId('productionDiagnosticsPanel');
            if (!running && panel && !panel.hidden && byId('settingsOverlay')?.classList.contains('open') && document.visibilityState !== 'hidden') syncExistingSnapshots();
        }, 30000);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();

    window.TrinoTimeProductionDiagnostics = Object.freeze({
        refresh: refreshVisibility,
        runFull: runFullDiagnostics,
        runIntegrity: runIntegrityScan,
        version: '1.1.76'
    });
}());
