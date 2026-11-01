    /* Attendance review workspace: normal-flow controls, navigation, persisted view,
       filtered totals, row density, horizontal-scroll affordance, and row-aware
       scroll restoration. This layer is read-only with respect to attendance data. */
    (function () {
        'use strict';

        const WORKSPACE_PREF_KEY = 'oosAttendanceWorkspacePrefsV1';
        const SCROLL_KEY = 'oosAttendanceScrollAnchorV1';
        const HORIZONTAL_SCROLL_KEY = 'oosAttendanceHorizontalScrollV1';
        const $ = id => document.getElementById(id);
        const norm = value => String(value || '').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
        let refreshFrame = 0;
        let scrollFrame = 0;
        let scrollPersistTimer = 0;
        let horizontalScrollFrame = 0;
        let horizontalPersistTimer = 0;
        let lastAnchorSampleAt = 0;
        let restoringEmployee = false;
        let restoringCategory = false;
        let categoryRestored = false;
        let desiredEmployee = '';
        let desiredCategory = '';
        let lastAnchor = null;
        let lastHorizontalScrollLeft = 0;
        let tableObserver = null;
        let stickyColumnResizeObserver = null;

        function safeStorage(name) {
            try { return window[name] || null; } catch (e) { return null; }
        }
        function loadJson(storage, key) {
            try { return storage ? (JSON.parse(storage.getItem(key) || '{}') || {}) : {}; } catch (e) { return {}; }
        }
        function saveJson(storage, key, value) {
            try { if (storage) storage.setItem(key, JSON.stringify(value)); } catch (e) {}
        }
        const localStore = safeStorage('localStorage');
        const sessionStore = safeStorage('sessionStorage');
        const prefs = loadJson(localStore, WORKSPACE_PREF_KEY);
        const legacyPrefs = loadJson(localStore, 'oosAttendanceViewPrefsV2');
        if (!Object.prototype.hasOwnProperty.call(prefs, 'filterDate')) prefs.filterDate = legacyPrefs.filterDate || '';
        if (!Object.prototype.hasOwnProperty.call(prefs, 'filterDateTo')) prefs.filterDateTo = legacyPrefs.filterDateTo || '';
        if (!Object.prototype.hasOwnProperty.call(prefs, 'payPeriodPreset')) prefs.payPeriodPreset = legacyPrefs.payPeriodPreset || '';
        if (!Object.prototype.hasOwnProperty.call(prefs, 'issuesOnly')) prefs.issuesOnly = Boolean(legacyPrefs.issuesOnly);
        lastAnchor = loadJson(sessionStore, SCROLL_KEY);
        if (!lastAnchor || !lastAnchor.kind) lastAnchor = null;
        const savedHorizontal = loadJson(sessionStore, HORIZONTAL_SCROLL_KEY);
        const savedHorizontalValue = Number(savedHorizontal && savedHorizontal.scrollLeft);
        lastHorizontalScrollLeft = Number.isFinite(savedHorizontalValue) ? Math.max(0, savedHorizontalValue) :
            (lastAnchor && Number.isFinite(Number(lastAnchor.scrollLeft)) ? Math.max(0, Number(lastAnchor.scrollLeft)) : 0);
        desiredEmployee = String(prefs.employee || '');
        desiredCategory = String(prefs.category || '');

        function dashboardState() {
            try {
                const dashboard = window.trinoAttendanceDashboard;
                return dashboard && typeof dashboard.getState === 'function' ? (dashboard.getState() || {}) : {};
            } catch (e) { return {}; }
        }
        function saveWorkspacePrefs() {
            const filterEmp = $('filterEmp');
            const searchInput = $('attendanceSearchInput');
            const state = dashboardState();
            const density = document.body.classList.contains('attendance-density-compact') ? 'compact' : 'comfortable';
            const from = $('filterDate');
            const to = $('filterDateTo');
            const preset = $('payPeriodPreset');
            prefs.employee = filterEmp && !filterEmp.disabled ? filterEmp.value : '';
            prefs.search = searchInput ? searchInput.value : (prefs.search || '');
            prefs.category = state.category || desiredCategory || '';
            prefs.issuesOnly = Boolean(state.issuesOnly);
            prefs.filterDate = from ? from.value : (prefs.filterDate || '');
            prefs.filterDateTo = to ? to.value : (prefs.filterDateTo || '');
            prefs.payPeriodPreset = preset ? preset.value : (prefs.payPeriodPreset || '');
            prefs.density = density;
            desiredEmployee = prefs.employee || '';
            desiredCategory = prefs.category || '';
            saveJson(localStore, WORKSPACE_PREF_KEY, prefs);
        }
        function scheduleRefresh() {
            if (refreshFrame) return;
            refreshFrame = window.setTimeout(function () {
                refreshFrame = 0;
                refreshWorkspaceUI();
            }, 32);
        }
        function isShown(el) {
            if (!el) return false;
            const style = getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden';
        }
        function getStickyTop() {
            const value = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--attendance-sticky-top'));
            return Number.isFinite(value) ? value : 8;
        }
        function getStickyBottom() {
            const toolbar = $('attendanceStickyControls');
            if (!toolbar || !toolbar.classList.contains('is-stuck')) return 0;
            const rect = toolbar.getBoundingClientRect();
            return Math.max(0, rect.bottom + 4);
        }
        function updateStickyOffsets() {
            /* The attendance review toolbar and attendance table header both
               stay in normal document flow. Only the separate punch card keeps
               its independent sticky behavior. */
            const toolbar = $('attendanceStickyControls');
            if (toolbar) toolbar.classList.remove('is-stuck');
            document.documentElement.style.setProperty('--attendance-sticky-top', '8px');
        }

        function formatIsoDate(value) {
            if (!value) return '';
            const bits = value.split('-').map(Number);
            if (bits.length !== 3 || bits.some(n => !Number.isFinite(n))) return value;
            try {
                return new Intl.DateTimeFormat('en-US', { month:'short', day:'numeric', year:'numeric', timeZone:'UTC' })
                    .format(new Date(Date.UTC(bits[0], bits[1] - 1, bits[2], 12)));
            } catch (e) { return value; }
        }
        function createChip(label, kind, title) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'attendance-filter-chip';
            button.dataset.filterKind = kind;
            button.title = title || ('Remove ' + label + ' filter');
            const text = document.createElement('span');
            text.className = 'attendance-chip-text';
            text.textContent = label;
            const x = document.createElement('span');
            x.className = 'attendance-chip-x';
            x.setAttribute('aria-hidden', 'true');
            x.textContent = '×';
            button.append(text, x);
            return button;
        }
        function renderFilterChips() {
            const host = $('attendanceFilterChips');
            if (!host) return;
            host.innerHTML = '';
            const filterEmp = $('filterEmp');
            const preset = $('payPeriodPreset');
            const from = $('filterDate');
            const to = $('filterDateTo');
            const input = $('attendanceSearchInput');
            const issues = $('attendanceIssuesToggle');
            const state = dashboardState();

            if (filterEmp && filterEmp.value && !filterEmp.disabled) host.appendChild(createChip(filterEmp.value, 'employee', 'Clear employee filter'));
            if ((preset && preset.value) || (from && from.value) || (to && to.value)) {
                let label = '';
                if (preset && preset.value) {
                    const option = preset.options[preset.selectedIndex];
                    label = option ? option.textContent.trim() : 'Date range';
                } else if (from && from.value && to && to.value) {
                    label = formatIsoDate(from.value) + ' – ' + formatIsoDate(to.value);
                } else if (from && from.value) label = 'From ' + formatIsoDate(from.value);
                else label = 'Through ' + formatIsoDate(to.value);
                host.appendChild(createChip(label, 'date', 'Clear date filter'));
            }
            if (issues && issues.getAttribute('aria-pressed') === 'true') host.appendChild(createChip('Issues only', 'issues', 'Clear issues-only filter'));
            if (state.category) {
                const active = document.querySelector('.attendance-attention-chip[aria-pressed="true"]');
                const label = active ? active.textContent.replace(/\s+×\s*$/, '').trim() : state.category;
                host.appendChild(createChip(label, 'category', 'Clear issue-category filter'));
            }
            if (input && input.value.trim()) {
                const value = input.value.trim();
                host.appendChild(createChip('Search: ' + value, 'search', 'Clear attendance search'));
            }
        }
        function clearFilterKind(kind) {
            captureScrollAnchor(true);
            const filterEmp = $('filterEmp');
            const preset = $('payPeriodPreset');
            const from = $('filterDate');
            const to = $('filterDateTo');
            const input = $('attendanceSearchInput');
            const issues = $('attendanceIssuesToggle');
            if (kind === 'employee' && filterEmp) {
                filterEmp.value = '';
                desiredEmployee = '';
                filterEmp.dispatchEvent(new Event('change', { bubbles:true }));
            } else if (kind === 'date') {
                if (preset) preset.value = '';
                if (from) from.value = '';
                if (to) to.value = '';
                if (from) from.dispatchEvent(new Event('change', { bubbles:true }));
                else if (to) to.dispatchEvent(new Event('change', { bubbles:true }));
            } else if (kind === 'issues' && issues && issues.getAttribute('aria-pressed') === 'true') {
                issues.click();
            } else if (kind === 'category') {
                const active = document.querySelector('.attendance-attention-chip[aria-pressed="true"]');
                if (active) active.click();
                desiredCategory = '';
                prefs.category = '';
            } else if (kind === 'search' && input) {
                input.value = '';
                input.dispatchEvent(new Event('input', { bubbles:true }));
            }
            saveWorkspacePrefs();
            scheduleRefresh();
        }

        function rowName(row) {
            if (!row || !row.cells || !row.cells[2]) return '';
            const cell = row.cells[2];
            if (cell.dataset.attendanceName) return cell.dataset.attendanceName.trim();
            const clone = cell.cloneNode(true);
            clone.querySelectorAll('.avatar,.note-badge,.attendance-row-tags,.edit-name-btn,.row-edit-btn').forEach(node => node.remove());
            return clone.textContent.trim();
        }
        function rowDate(row) { return row && row.cells && row.cells[0] ? row.cells[0].textContent.trim() : ''; }
        function rawDateKey(raw) {
            const text = String(raw || '').trim();
            let match = text.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})/);
            if (match) return match[3] + '-' + String(match[1]).padStart(2, '0') + '-' + String(match[2]).padStart(2, '0');
            match = text.match(/^(\d{4})[\/.\-](\d{1,2})[\/.\-](\d{1,2})/);
            if (match) return match[1] + '-' + String(match[2]).padStart(2, '0') + '-' + String(match[3]).padStart(2, '0');
            return '';
        }
        function dataRows() {
            const tbody = $('desktopTbody');
            if (!tbody) return [];
            return Array.from(tbody.children).filter(row => row.tagName === 'TR' && !row.classList.contains('attendance-date-divider') && !row.classList.contains('attendance-search-empty'));
        }
        function rowMatchesView(row, analysis, state) {
            const query = norm(state.query || '');
            const category = state.category || '';
            if (query && !norm(analysis.name).includes(query)) return false;
            if (state.issuesOnly && !analysis.hasIssue) return false;
            if (category && !(analysis.categories || []).includes(category)) return false;
            return true;
        }
        function renderFilteredTotals() {
            const host = $('attendanceFilteredTotals');
            if (!host) return;
            const state = dashboardState();
            let records = 0, credited = 0, nightDiff = 0, late = 0, early = 0, incomplete = 0, issues = 0;
            dataRows().forEach(row => {
                const analysis = analyzeRow(row);
                if (!rowMatchesView(row, analysis, state)) return;
                records++;
                if (Number.isFinite(Number(analysis.regularHours))) credited += Number(analysis.regularHours) + (Number(analysis.otHours) || 0);
                if (Number.isFinite(Number(analysis.nightDiffHours))) nightDiff += Number(analysis.nightDiffHours) || 0;
                if (analysis.hasIssue) issues++;
                if (analysis.late) late++;
                if (analysis.early) early++;
                if (analysis.incomplete || analysis.missingTimeOut) incomplete++;
            });
            const ndSummary = nightDiffEnabledForCurrentView() ? '<span><strong>' + nightDiff.toFixed(2) + '</strong> ND hrs</span>' : '';
            host.innerHTML =
                '<span><strong>' + records + '</strong> record' + (records === 1 ? '' : 's') + '</span>' +
                '<span><strong>' + credited.toFixed(2) + '</strong> credited hrs</span>' +
                ndSummary +
                '<span class="' + (issues ? 'is-issue' : '') + '"><strong>' + issues + '</strong> issue' + (issues === 1 ? '' : 's') + '</span>' +
                '<span class="' + (late ? 'is-issue' : '') + '"><strong>' + late + '</strong> late</span>' +
                '<span class="' + (early ? 'is-issue' : '') + '"><strong>' + early + '</strong> early Time Out' + (early === 1 ? '' : 's') + '</span>' +
                '<span class="' + (incomplete ? 'is-issue' : '') + '"><strong>' + incomplete + '</strong> incomplete</span>';
        }

        function tableDividers() {
            const tbody = $('desktopTbody');
            return tbody ? Array.from(tbody.querySelectorAll('.attendance-date-divider')) : [];
        }
        function jumpTarget() {
            const dividers = tableDividers();
            if (!dividers.length) return null;
            const todayKey = (function () {
                try {
                    const parts = new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Manila', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(new Date());
                    const map = {}; parts.forEach(p => { map[p.type] = p.value; });
                    return map.year + '-' + map.month + '-' + map.day;
                } catch (e) { return ''; }
            }());
            return dividers.find(row => row.dataset.dateKey === todayKey) || dividers[0];
        }
        function refreshJumpButton() {
            const btn = $('attendanceJumpToday');
            if (!btn) return;
            const target = jumpTarget();
            btn.disabled = !target;
            if (!target) {
                btn.title = 'No attendance dates are visible in this view';
                return;
            }
            const label = target.querySelector('.attendance-date-label');
            const isToday = label && /^Today\b/i.test(label.textContent.trim());
            btn.title = isToday ? 'Jump to today' : 'Today is outside this view; jump to the newest visible date';
        }
        function jumpToToday() {
            const target = jumpTarget();
            if (!target) return;
            target.scrollIntoView({ block:'start', behavior:'instant' });
            const offset = Math.max(getStickyBottom(), getStickyTop()) + 6;
            window.scrollBy({ top: target.getBoundingClientRect().top - offset, left: 0, behavior:'instant' });
            captureScrollAnchor(true);
        }
        function setAllDatesCollapsed(collapse) {
            const tbody = $('desktopTbody');
            if (!tbody) return;
            captureScrollAnchor(true);
            const buttons = Array.from(tbody.querySelectorAll('.attendance-date-toggle'));
            buttons.forEach(button => {
                const divider = button.closest('.attendance-date-divider');
                const collapsed = divider && divider.classList.contains('is-collapsed');
                if ((collapse && !collapsed) || (!collapse && collapsed)) button.click();
            });
            scheduleRefresh();
        }



        function canPinAttendanceActions(table) {
            try {
                const bridge = window.trinoAttendanceBridge;
                if (bridge) {
                    const admin = typeof bridge.isAdmin === 'function' && bridge.isAdmin();
                    const lead = typeof bridge.isTeamLeader === 'function' && bridge.isTeamLeader();
                    if (admin || lead) return true;
                }
            } catch (e) { /* role bridge is optional during early startup */ }
            return Boolean(table && table.querySelector('tbody .row-edit-btn'));
        }

        function rememberHorizontalScroll(value, persist = true) {
            const numeric = Number(value);
            if (!Number.isFinite(numeric)) return;
            lastHorizontalScrollLeft = Math.max(0, numeric);
            if (persist) saveJson(sessionStore, HORIZONTAL_SCROLL_KEY, { scrollLeft:lastHorizontalScrollLeft });
        }

        function updateStickyColumnOffsets() {
            const container = $('desktopTableContainer');
            const table = container && container.querySelector(':scope > .desktop-table');
            const headRow = table && table.tHead && table.tHead.rows && table.tHead.rows[0];
            if (!container || !table || !headRow || headRow.cells.length < 10) return;

            const dateWidth = headRow.cells[0].getBoundingClientRect().width;
            const podWidth = headRow.cells[1].getBoundingClientRect().width;
            const nameWidth = headRow.cells[2].getBoundingClientRect().width;
            const actionsHeader = headRow.querySelector('.attendance-actions-header');
            const actionsWidth = actionsHeader ? actionsHeader.getBoundingClientRect().width : 0;
            if (![dateWidth, podWidth, nameWidth, actionsWidth].every(Number.isFinite)) return;

            const available = container.clientWidth;
            let mode = 'wide';
            let nameLeft = dateWidth + podWidth;
            let stackWidth = dateWidth + podWidth + nameWidth;

            /* Let narrower screens trade frozen metadata for usable timestamp room. */
            if (available < 860) {
                mode = 'name';
                nameLeft = 0;
                stackWidth = nameWidth;
            } else if (available < 1080) {
                mode = 'date-name';
                nameLeft = dateWidth;
                stackWidth = dateWidth + nameWidth;
            }

            container.dataset.stickyMode = mode;
            table.style.setProperty('--att-sticky-pod-left', dateWidth.toFixed(2) + 'px');
            table.style.setProperty('--att-sticky-name-left', nameLeft.toFixed(2) + 'px');

            const stickyActions = available >= 681 && canPinAttendanceActions(table);
            container.dataset.stickyActions = stickyActions ? 'true' : 'false';

            const shell = $('attendanceTableShell');
            if (shell) {
                shell.style.setProperty('--att-sticky-stack-width', stackWidth.toFixed(2) + 'px');
                shell.style.setProperty('--att-sticky-actions-width', (stickyActions ? actionsWidth : 0).toFixed(2) + 'px');
            }
        }

        function bindStickyColumnResizeObserver() {
            const container = $('desktopTableContainer');
            const table = container && container.querySelector(':scope > .desktop-table');
            if (!container || !table || typeof ResizeObserver !== 'function' || stickyColumnResizeObserver) return;
            stickyColumnResizeObserver = new ResizeObserver(function () {
                updateStickyColumnOffsets();
                updateScrollShadows();
            });
            stickyColumnResizeObserver.observe(container);
            stickyColumnResizeObserver.observe(table);
            if (table.tHead) stickyColumnResizeObserver.observe(table.tHead);
        }

        function bindAttendanceDragScroll() {
            const container = $('desktopTableContainer');
            if (!container || container.dataset.dragScrollBound === 'true') return;
            container.dataset.dragScrollBound = 'true';

            const interactiveSelector = 'button,input,select,textarea,a,label,[contenteditable="true"],[role="button"]';
            const DRAG_THRESHOLD = 7;
            const drag = {
                active: false,
                dragging: false,
                pointerId: null,
                startX: 0,
                startY: 0,
                startScrollLeft: 0,
                startPageScrollY: 0,
                lastDragEnd: 0
            };

            function currentPageScrollY() {
                return window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
            }

            /* Horizontal dragging must never "leak" into the root document scroller.
               This also neutralizes browser edge auto-scroll if a pointer reaches the
               top/bottom of the viewport while the attendance drag is still active. */
            function preventDeviatedScroll() {
                if (!drag.dragging) return;
                const currentY = currentPageScrollY();
                if (Math.abs(currentY - drag.startPageScrollY) > 0.5) {
                    window.scrollTo(window.scrollX || window.pageXOffset || 0, drag.startPageScrollY);
                }
            }

            function resetDrag(event) {
                const wasDragging = drag.dragging;
                if (wasDragging) preventDeviatedScroll();
                if (event && drag.pointerId !== null && container.hasPointerCapture && container.hasPointerCapture(drag.pointerId)) {
                    try { container.releasePointerCapture(drag.pointerId); } catch (e) { /* pointer already released */ }
                }
                drag.active = false;
                drag.dragging = false;
                drag.pointerId = null;
                container.classList.remove('is-dragging');
                document.documentElement.classList.remove('attendance-drag-scroll-lock');
                if (wasDragging) {
                    drag.lastDragEnd = performance.now();
                    rememberHorizontalScroll(container.scrollLeft);
                }
            }

            container.addEventListener('pointerdown', function (event) {
                if (event.pointerType === 'mouse' && event.button !== 0) return;
                if (event.target.closest(interactiveSelector)) return;
                if (container.scrollWidth <= container.clientWidth + 1) return;

                /* Stop native text/image selection from starting a competing browser
                   drag. That native drag was the source of the downward edge-scroll
                   visible in the reported recording. Touch keeps its native pan-x. */
                if (event.pointerType !== 'touch' && event.cancelable) event.preventDefault();

                drag.active = true;
                drag.dragging = false;
                drag.pointerId = event.pointerId;
                drag.startX = event.clientX;
                drag.startY = event.clientY;
                drag.startScrollLeft = container.scrollLeft;
                drag.startPageScrollY = currentPageScrollY();
                if (event.pointerType === 'mouse') {
                    try { container.focus({ preventScroll:true }); } catch (e) { container.focus(); }
                }
            });

            container.addEventListener('pointermove', function (event) {
                if (!drag.active || event.pointerId !== drag.pointerId) return;
                const dx = event.clientX - drag.startX;
                const dy = event.clientY - drag.startY;

                if (!drag.dragging) {
                    if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
                    /* If a mouse/pen gesture is genuinely vertical, abort before taking
                       ownership. Touch vertical panning is already blocked by pan-x. */
                    if (event.pointerType !== 'touch' && Math.abs(dy) > Math.abs(dx) * 1.08) {
                        resetDrag(event);
                        return;
                    }
                    drag.dragging = true;
                    container.classList.add('is-dragging');
                    document.documentElement.classList.add('attendance-drag-scroll-lock');
                    if (container.setPointerCapture) {
                        try { container.setPointerCapture(event.pointerId); } catch (e) { /* unsupported capture edge case */ }
                    }
                }

                if (event.cancelable) event.preventDefault();
                container.scrollLeft = drag.startScrollLeft - dx;
                preventDeviatedScroll();
            }, { passive: false });

            container.addEventListener('pointerup', resetDrag);
            container.addEventListener('pointercancel', resetDrag);
            container.addEventListener('lostpointercapture', function (event) {
                if (!drag.active || event.pointerId !== drag.pointerId) return;
                resetDrag(event);
            });
            window.addEventListener('scroll', preventDeviatedScroll, { passive: true });

            /* Browsers may synthesize a click after a drag. Swallow only that
               immediate synthetic click so note/edit controls never fire by accident. */
            container.addEventListener('click', function (event) {
                if (performance.now() - drag.lastDragEnd < 180) {
                    event.preventDefault();
                    event.stopPropagation();
                }
            }, true);

            /* Shift + wheel gives mouse users a predictable horizontal shortcut.
               If the browser already supplied deltaX, native scrolling is left alone. */
            container.addEventListener('wheel', function (event) {
                if (!event.shiftKey || Math.abs(event.deltaX) > 0.5 || !event.deltaY) return;
                if (container.scrollWidth <= container.clientWidth + 1) return;
                if (event.cancelable) event.preventDefault();
                container.scrollLeft += event.deltaY;
                rememberHorizontalScroll(container.scrollLeft);
            }, { passive:false });

            /* The scroll region is keyboard-focusable. Arrow keys make small moves;
               PageUp/PageDown make viewport-sized moves; Home/End jump to edges. */
            container.addEventListener('keydown', function (event) {
                if (event.target !== container || event.ctrlKey || event.metaKey || event.altKey) return;
                const max = Math.max(0, container.scrollWidth - container.clientWidth);
                if (max <= 1) return;
                const step = event.shiftKey ? 180 : 90;
                let next = null;
                if (event.key === 'ArrowLeft') next = container.scrollLeft - step;
                else if (event.key === 'ArrowRight') next = container.scrollLeft + step;
                else if (event.key === 'PageUp') next = container.scrollLeft - Math.max(220, container.clientWidth * .72);
                else if (event.key === 'PageDown') next = container.scrollLeft + Math.max(220, container.clientWidth * .72);
                else if (event.key === 'Home') next = 0;
                else if (event.key === 'End') next = max;
                if (next === null) return;
                event.preventDefault();
                container.scrollLeft = Math.max(0, Math.min(max, next));
                rememberHorizontalScroll(container.scrollLeft);
                updateScrollShadows();
            });
        }

        function updateScrollShadows() {
            const container = $('desktopTableContainer');
            const shell = $('attendanceTableShell');
            if (!container || !shell) return;
            const max = Math.max(0, container.scrollWidth - container.clientWidth);
            shell.classList.toggle('can-scroll-left', max > 2 && container.scrollLeft > 2);
            shell.classList.toggle('can-scroll-right', max > 2 && container.scrollLeft < max - 2);
        }
        function applyDensity(value, persist) {
            const density = value === 'compact' ? 'compact' : 'comfortable';
            document.body.classList.toggle('attendance-density-compact', density === 'compact');
            document.body.classList.toggle('attendance-density-comfortable', density === 'comfortable');
            document.querySelectorAll('[data-attendance-density]').forEach(btn => {
                btn.setAttribute('aria-pressed', String(btn.dataset.attendanceDensity === density));
            });
            if (persist !== false) saveWorkspacePrefs();
            scheduleRefresh();
        }

        function visibleAnchorCandidate() {
            const tbody = $('desktopTbody');
            const container = $('desktopTableContainer');
            if (!tbody || !container || !isShown(tbody)) return null;

            const threshold = Math.max(0, getStickyBottom()) + 4;
            const viewportHeight = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
            const viewportWidth = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
            const containerRect = container.getBoundingClientRect();
            if (containerRect.bottom <= threshold || containerRect.top >= viewportHeight || containerRect.right <= 0 || containerRect.left >= viewportWidth) return null;

            /* elementsFromPoint lets the compositor tell us which row is actually
               under the visible table area. The old implementation measured every
               attendance row on every scroll frame, forcing repeated layout work. */
            const sampleY = Math.min(viewportHeight - 4, Math.max(threshold + 6, containerRect.top + 54));
            const sampleX = Math.min(viewportWidth - 4, Math.max(4, containerRect.left + Math.min(36, Math.max(8, containerRect.width * .08))));
            let row = null;
            if (document.elementsFromPoint) {
                const stack = document.elementsFromPoint(sampleX, sampleY);
                for (const el of stack) {
                    const candidate = el && el.closest ? el.closest('tr') : null;
                    if (candidate && tbody.contains(candidate) && !candidate.classList.contains('attendance-search-empty')) {
                        row = candidate;
                        break;
                    }
                }
            }

            /* Conservative fallback for older/edge browsers. It exits on the first
               visible row instead of building/measuring an array of all rows. */
            if (!row) {
                for (const candidate of tbody.children) {
                    if (candidate.tagName !== 'TR' || candidate.classList.contains('attendance-search-empty')) continue;
                    const rect = candidate.getBoundingClientRect();
                    if (rect.height > 0 && rect.bottom > threshold && rect.top < viewportHeight) {
                        row = candidate;
                        break;
                    }
                }
            }
            if (!row) return null;

            const rect = row.getBoundingClientRect();
            if (row.classList.contains('attendance-date-divider')) {
                return { kind:'date', dateKey:row.dataset.dateKey || '', rawDate:'', name:'', viewportTop:rect.top, scrollLeft:container.scrollLeft || 0, ts:Date.now() };
            }
            return { kind:'row', dateKey:'', rawDate:rowDate(row), name:rowName(row), viewportTop:rect.top, scrollLeft:container.scrollLeft || 0, ts:Date.now() };
        }
        function captureScrollAnchor(force, persist = true) {
            const card = $('logTableCard');
            if (!card || !isShown(card)) return;
            const container = $('desktopTableContainer');
            if (container) rememberHorizontalScroll(container.scrollLeft, persist);
            const candidate = visibleAnchorCandidate();
            if (!candidate && !force) return;
            if (candidate) {
                lastAnchor = candidate;
                if (persist) saveJson(sessionStore, SCROLL_KEY, lastAnchor);
            }
        }
        function findAnchorTarget(anchor) {
            const tbody = $('desktopTbody');
            if (!tbody || !anchor) return null;
            if (anchor.kind === 'date' && anchor.dateKey) {
                return Array.from(tbody.querySelectorAll('.attendance-date-divider')).find(row => row.dataset.dateKey === anchor.dateKey) || null;
            }
            if (anchor.kind === 'row') {
                const exact = dataRows().find(row => rowDate(row) === anchor.rawDate && rowName(row) === anchor.name && getComputedStyle(row).display !== 'none');
                if (exact) return exact;
                const sameDate = dataRows().find(row => rowDate(row) === anchor.rawDate && getComputedStyle(row).display !== 'none');
                if (sameDate) return sameDate;
                const anchorDateKey = rawDateKey(anchor.rawDate);
                const divider = anchorDateKey ? Array.from(tbody.querySelectorAll('.attendance-date-divider')).find(row => row.dataset.dateKey === anchorDateKey) : null;
                if (divider) return divider;
            }
            return Array.from(tbody.children).find(row => row.tagName === 'TR' && !row.classList.contains('attendance-search-empty') && getComputedStyle(row).display !== 'none') || null;
        }
        function restoreHorizontalScrollOnly(anchor = lastAnchor) {
            const container = $('desktopTableContainer');
            if (!container) return;
            const anchorScroll = anchor ? Number(anchor.scrollLeft) : NaN;
            const desiredScroll = Number.isFinite(anchorScroll) ? anchorScroll : lastHorizontalScrollLeft;
            const max = Math.max(0, container.scrollWidth - container.clientWidth);
            container.scrollLeft = Math.max(0, Math.min(max, Number(desiredScroll) || 0));
            rememberHorizontalScroll(container.scrollLeft);
            updateStickyColumnOffsets();
            updateScrollShadows();
        }

        function restoreScrollAnchor() {
            const anchor = lastAnchor;
            requestAnimationFrame(function () {
                requestAnimationFrame(function () {
                    if (anchor) {
                        const target = findAnchorTarget(anchor);
                        if (target) {
                            const desired = Number(anchor.viewportTop);
                            const current = target.getBoundingClientRect().top;
                            if (Number.isFinite(desired) && Number.isFinite(current)) window.scrollBy(0, current - desired);
                        }
                    }
                    restoreHorizontalScrollOnly(anchor);
                    updateStickyOffsets();
                });
            });
        }
        function scheduleScrollCapture() {
            /* Keep the hot scroll path read-mostly. Sampling at ~12.5fps is more than
               enough for restoration, while the final 150ms debounce captures the
               exact resting position and performs the only synchronous storage write. */
            if (!scrollFrame) {
                scrollFrame = requestAnimationFrame(function (ts) {
                    scrollFrame = 0;
                    if (ts - lastAnchorSampleAt >= 80) {
                        lastAnchorSampleAt = ts;
                        captureScrollAnchor(false, false);
                    }
                });
            }
            if (scrollPersistTimer) clearTimeout(scrollPersistTimer);
            scrollPersistTimer = window.setTimeout(function () {
                scrollPersistTimer = 0;
                captureScrollAnchor(false, true);
            }, 150);
        }

        function syncToolbarVisibility() {
            const toolbar = $('attendanceStickyControls');
            const filters = $('logFilters');
            const card = $('logTableCard');
            if (!toolbar) return;
            const visible = filters && card && getComputedStyle(filters).display !== 'none' && getComputedStyle(card).display !== 'none';
            toolbar.classList.toggle('is-hidden', !visible);
        }
        function attemptEmployeeRestore() {
            const select = $('filterEmp');
            if (!select || select.disabled || !desiredEmployee || select.value === desiredEmployee) return;
            const exists = Array.from(select.options).some(option => option.value === desiredEmployee);
            if (!exists) return;
            restoringEmployee = true;
            select.value = desiredEmployee;
            select.dispatchEvent(new Event('change', { bubbles:true }));
            restoringEmployee = false;
        }
        function attemptCategoryRestore() {
            if (categoryRestored || restoringCategory || !desiredCategory) return;
            const chip = Array.from(document.querySelectorAll('.attendance-attention-chip')).find(btn => btn.dataset.category === desiredCategory);
            if (!chip) return;
            categoryRestored = true;
            if (chip.getAttribute('aria-pressed') !== 'true') {
                restoringCategory = true;
                chip.click();
                restoringCategory = false;
            }
        }
        function refreshWorkspaceUI() {
            syncToolbarVisibility();
            updateStickyOffsets();
            updateStickyColumnOffsets();
            attemptEmployeeRestore();
            attemptCategoryRestore();
            renderFilterChips();
            renderFilteredTotals();
            refreshJumpButton();
            updateScrollShadows();
        }

        function buildWorkspace() {
            const logSection = document.querySelector('.log-section');
            const logHead = logSection && logSection.querySelector('.log-head');
            const filters = $('logFilters');
            const card = $('logTableCard');
            if (!logSection || !logHead || !filters || !card || $('attendanceStickyControls')) return;

            const toolbar = document.createElement('div');
            toolbar.className = 'attendance-sticky-controls is-hidden';
            toolbar.id = 'attendanceStickyControls';
            toolbar.setAttribute('aria-label', 'Attendance review controls');
            const main = document.createElement('div');
            main.className = 'attendance-sticky-main';
            const actions = document.createElement('div');
            actions.className = 'attendance-review-actions';
            actions.innerHTML =
                '<button class="attendance-review-btn" id="attendanceJumpToday" type="button">Jump to Today</button>' +
                '<button class="attendance-review-btn" id="attendanceCollapseAll" type="button">Collapse all</button>' +
                '<button class="attendance-review-btn" id="attendanceExpandAll" type="button">Expand all</button>' +
                '<span class="attendance-density-control" aria-label="Attendance row density">' +
                    '<button class="attendance-density-btn" data-attendance-density="compact" type="button" aria-pressed="false" title="Tighter rows for admin review">Compact</button>' +
                    '<button class="attendance-density-btn" data-attendance-density="comfortable" type="button" aria-pressed="true" title="Larger rows for touch and easier scanning">Comfortable</button>' +
                '</span>';
            const chips = document.createElement('div');
            chips.className = 'attendance-filter-chips';
            chips.id = 'attendanceFilterChips';
            chips.setAttribute('aria-label', 'Current attendance filters');
            main.append(filters, actions);
            toolbar.append(main, chips);
            logHead.insertAdjacentElement('afterend', toolbar);

            const attention = $('attendanceAttentionBar');
            const totals = document.createElement('div');
            totals.className = 'attendance-filtered-totals';
            totals.id = 'attendanceFilteredTotals';
            totals.setAttribute('aria-live', 'polite');
            if (attention) attention.insertAdjacentElement('afterend', totals);

            const tableContainer = $('desktopTableContainer');
            if (tableContainer && !tableContainer.parentElement.classList.contains('attendance-table-shell')) {
                const shell = document.createElement('div');
                shell.className = 'attendance-table-shell';
                shell.id = 'attendanceTableShell';
                tableContainer.parentNode.insertBefore(shell, tableContainer);
                shell.appendChild(tableContainer);
            }
        }

        function bindWorkspace() {
            const filterEmp = $('filterEmp');
            const input = $('attendanceSearchInput');
            const issues = $('attendanceIssuesToggle');
            const attention = $('attendanceAttentionChips');
            const filters = $('logFilters');
            const card = $('logTableCard');
            const container = $('desktopTableContainer');
            const tbody = $('desktopTbody');
            const chips = $('attendanceFilterChips');

            bindAttendanceDragScroll();
            bindStickyColumnResizeObserver();
            updateStickyColumnOffsets();

            $('attendanceJumpToday')?.addEventListener('click', jumpToToday);
            $('attendanceCollapseAll')?.addEventListener('click', () => setAllDatesCollapsed(true));
            $('attendanceExpandAll')?.addEventListener('click', () => setAllDatesCollapsed(false));
            document.querySelectorAll('[data-attendance-density]').forEach(btn => btn.addEventListener('click', () => applyDensity(btn.dataset.attendanceDensity)));
            if (chips) chips.addEventListener('click', event => {
                const button = event.target.closest('.attendance-filter-chip');
                if (button) clearFilterKind(button.dataset.filterKind || '');
            });

            if (filterEmp) {
                filterEmp.addEventListener('change', function () {
                    if (!restoringEmployee) {
                        desiredEmployee = filterEmp.value;
                        prefs.employee = desiredEmployee;
                        saveWorkspacePrefs();
                    }
                    scheduleRefresh();
                });
                new MutationObserver(function () {
                    attemptEmployeeRestore();
                    scheduleRefresh();
                }).observe(filterEmp, { childList:true });
            }
            if (input) {
                input.addEventListener('input', function () { prefs.search = input.value; saveWorkspacePrefs(); scheduleRefresh(); });
                input.addEventListener('keydown', function (event) {
                    if (event.key === 'Escape') window.setTimeout(function () { saveWorkspacePrefs(); scheduleRefresh(); }, 0);
                });
            }
            const searchClear = $('attendanceSearchClear');
            const searchToggle = $('attendanceSearchToggle');
            if (searchClear) searchClear.addEventListener('click', function () { window.setTimeout(function () { saveWorkspacePrefs(); scheduleRefresh(); }, 0); });
            if (searchToggle) searchToggle.addEventListener('click', function () { window.setTimeout(function () { saveWorkspacePrefs(); scheduleRefresh(); }, 0); });
            ['filterDate','filterDateTo','payPeriodPreset'].forEach(id => {
                const el = $(id);
                if (el) el.addEventListener('change', function () {
                    /* Core preset/date handlers may update sibling fields during
                       the same event. Save on the next task so the final range wins. */
                    window.setTimeout(function () { saveWorkspacePrefs(); scheduleRefresh(); }, 0);
                });
            });
            if (issues) issues.addEventListener('click', function () { window.setTimeout(function () { saveWorkspacePrefs(); scheduleRefresh(); }, 0); });
            const clearButton = $('clearFilters');
            if (clearButton) clearButton.addEventListener('click', function () {
                desiredEmployee = '';
                desiredCategory = '';
                prefs.employee = '';
                prefs.search = '';
                prefs.category = '';
                prefs.issuesOnly = false;
                prefs.filterDate = '';
                prefs.filterDateTo = '';
                prefs.payPeriodPreset = '';
                window.setTimeout(function () {
                    saveWorkspacePrefs();
                    /* The older preference layer saves on date-field change.
                       Dispatch once after every Clear listener has finished so
                       reopening the PWA cannot resurrect a cleared date range. */
                    const from = $('filterDate');
                    if (from) from.dispatchEvent(new Event('change', { bubbles:true }));
                    scheduleRefresh();
                }, 0);
            });
            if (attention) attention.addEventListener('click', function () {
                if (!restoringCategory) {
                    const state = dashboardState();
                    desiredCategory = state.category || '';
                    prefs.category = desiredCategory;
                    saveWorkspacePrefs();
                }
                scheduleRefresh();
            });
            if (container) container.addEventListener('scroll', function () {
                /* One compositor-synced UI update per frame; no storage writes while
                   the scrollbar/finger is moving. sessionStorage is synchronous. */
                if (!horizontalScrollFrame) {
                    horizontalScrollFrame = requestAnimationFrame(function () {
                        horizontalScrollFrame = 0;
                        const left = container.scrollLeft;
                        updateScrollShadows();
                        rememberHorizontalScroll(left, false);
                        if (lastAnchor) lastAnchor.scrollLeft = left;
                    });
                }
                if (horizontalPersistTimer) clearTimeout(horizontalPersistTimer);
                horizontalPersistTimer = window.setTimeout(function () {
                    horizontalPersistTimer = 0;
                    const left = container.scrollLeft;
                    rememberHorizontalScroll(left, true);
                    if (lastAnchor) {
                        lastAnchor.scrollLeft = left;
                        lastAnchor.ts = Date.now();
                        saveJson(sessionStore, SCROLL_KEY, lastAnchor);
                    }
                }, 140);
            }, { passive:true });

            document.addEventListener('click', function (event) {
                const logTab = event.target.closest('.log-tab');
                if (logTab && logTab.dataset.tab !== 'log') captureScrollAnchor(true);
                if (logTab && logTab.dataset.tab === 'log') setTimeout(restoreScrollAnchor, 0);
            }, true);
            document.addEventListener('change', function (event) {
                if (event.target && ['filterEmp','filterDate','filterDateTo','payPeriodPreset'].includes(event.target.id)) captureScrollAnchor(true);
            }, true);
            document.addEventListener('input', function (event) {
                if (event.target && event.target.id === 'attendanceSearchInput') captureScrollAnchor(true);
            }, true);
            document.addEventListener('click', function (event) {
                if (event.target.closest('.attendance-date-toggle,.attendance-issues-toggle,.attendance-attention-chip,.attendance-filter-chip')) captureScrollAnchor(true);
            }, true);

            if (filters) new MutationObserver(function () { syncToolbarVisibility(); scheduleRefresh(); }).observe(filters, { attributes:true, attributeFilter:['style'] });
            if (card) new MutationObserver(function () { syncToolbarVisibility(); scheduleRefresh(); }).observe(card, { attributes:true, attributeFilter:['style'] });
            if (tbody) {
                tableObserver = new MutationObserver(function () {
                    scheduleRefresh();
                    // Rebuilding rows must not reposition the page. Only recover
                    // the attendance table's horizontal offset; vertical restores
                    // are reserved for explicit navigation back to the Log tab.
                    requestAnimationFrame(() => restoreHorizontalScrollOnly());
                });
                tableObserver.observe(tbody, { childList:true });
            }
            window.addEventListener('scroll', scheduleScrollCapture, { passive:true });
            window.addEventListener('resize', function () { updateStickyOffsets(); updateStickyColumnOffsets(); updateScrollShadows(); scheduleRefresh(); }, { passive:true });
        }

        function restoreSavedView() {
            applyDensity(prefs.density || 'comfortable', false);
            const input = $('attendanceSearchInput');
            const search = $('attendanceSearch');
            const toggle = $('attendanceSearchToggle');
            const from = $('filterDate');
            const to = $('filterDateTo');
            const preset = $('payPeriodPreset');
            const issues = $('attendanceIssuesToggle');

            if (prefs.payPeriodPreset && preset) {
                preset.value = String(prefs.payPeriodPreset);
                preset.dispatchEvent(new Event('change', { bubbles:true }));
            } else if ((prefs.filterDate || prefs.filterDateTo) && (from || to)) {
                if (from) from.value = String(prefs.filterDate || '');
                if (to) to.value = String(prefs.filterDateTo || '');
                if (preset) preset.value = '';
                (from || to).dispatchEvent(new Event('change', { bubbles:true }));
            }
            if (issues && typeof prefs.issuesOnly === 'boolean') {
                const state = dashboardState();
                if (Boolean(state.issuesOnly) !== Boolean(prefs.issuesOnly)) issues.click();
            }
            if (input && prefs.search) {
                input.value = String(prefs.search);
                if (search) {
                    search.classList.add('open');
                }
                input.dispatchEvent(new Event('input', { bubbles:true }));
            }
            attemptEmployeeRestore();
            scheduleRefresh();
        }

        function init() {
            buildWorkspace();
            bindWorkspace();
            restoreSavedView();
            updateStickyOffsets();
            updateStickyColumnOffsets();
            updateScrollShadows();
            scheduleRefresh();
            // Do not force an old Attendance Log vertical anchor during app boot.
            // The persistent router restores the page route; an explicit Log-tab
            // activation restores the vertical attendance anchor. Horizontal table
            // position is safe to recover without moving the dashboard viewport.
            setTimeout(restoreHorizontalScrollOnly, 0);
        }

        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
        else init();
    }());
    


/* UX18P43 — Attendance Log navigation presentation only. Existing .log-tab buttons,
   event listeners and role-scoped visibility are retained; no data operations. */
(function () {
  'use strict';
  function initAttendanceLogNavigation() {
    const tabs = document.getElementById('logTabs');
    const section = tabs && tabs.closest('.log-section');
    if (!tabs || !section || tabs.querySelector('.tt-log-more')) return;
    section.classList.add('tt-log-clean');
    tabs.setAttribute('aria-label', 'Attendance sections and tools');
    const primary = new Set(['log','status','coaching-report','bio-break','history']);
    const wrapper = document.createElement('div');
    wrapper.className = 'tt-log-more';
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'tt-log-more-toggle';
    trigger.textContent = 'More tools';
    trigger.setAttribute('aria-controls', 'ttLogMoreMenu');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-haspopup', 'true');
    const menu = document.createElement('div');
    menu.id = 'ttLogMoreMenu';
    menu.className = 'tt-log-more-menu';
    menu.setAttribute('role', 'group');
    menu.setAttribute('aria-label', 'Additional attendance tools');
    menu.hidden = true;
    wrapper.append(trigger, menu);
    tabs.append(wrapper);
    function close(returnFocus) {
      menu.hidden = true;
      section.classList.remove('tt-log-menu-open');
      wrapper.classList.remove('is-open');
      trigger.setAttribute('aria-expanded','false');
      if (returnFocus) trigger.focus();
    }
    function refresh() {
      // Keep new role-authorized tabs visible through More without duplicating or
      // replacing their original click handlers, IDs or authorization checks.
      Array.from(tabs.children).forEach(el => {
        if (el !== wrapper && el.classList.contains('log-tab') && !primary.has(el.dataset.tab || '')) menu.append(el);
      });
      const visible = Array.from(menu.querySelectorAll('.log-tab')).some(b => !b.hidden && b.style.display !== 'none' && getComputedStyle(b).display !== 'none');
      wrapper.hidden = !visible;
      if (!visible) close(false);
    }
    trigger.addEventListener('click', () => {
      const open = menu.hidden;
      menu.hidden = !open;
      wrapper.classList.toggle('is-open', open);
      section.classList.toggle('tt-log-menu-open', open);
      trigger.setAttribute('aria-expanded', String(open));
      if (open) Array.from(menu.querySelectorAll('.log-tab')).find(el => !el.hidden && el.style.display !== 'none' && getComputedStyle(el).display !== 'none')?.focus({preventScroll:true});
    });
    menu.addEventListener('click', event => { if (event.target.closest('.log-tab')) close(false); });
    document.addEventListener('pointerdown', event => { if (!wrapper.contains(event.target)) close(false); });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !menu.hidden) { close(true); event.stopPropagation(); }
    });
    // Core can reveal protected buttons after authorization. Observe those
    // visibility updates, not the table, avoiding per-row DOM work.
    const observer = new MutationObserver(mutations => {
      if (mutations.some(m => m.type === 'childList' || (m.type === 'attributes' && m.target.classList?.contains('log-tab')))) refresh();
    });
    observer.observe(tabs, {subtree:true,childList:true,attributes:true,attributeFilter:['style','hidden']});
    refresh();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initAttendanceLogNavigation, {once:true});
  else initAttendanceLogNavigation();
}());
