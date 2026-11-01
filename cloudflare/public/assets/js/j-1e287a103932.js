


    (function () {
        'use strict';

        const tbody = document.getElementById('desktopTbody');
        const search = document.getElementById('attendanceSearch');
        const toggle = document.getElementById('attendanceSearchToggle');
        const input = document.getElementById('attendanceSearchInput');
        const searchClear = document.getElementById('attendanceSearchClear');
        const searchCount = document.getElementById('attendanceSearchCount');
        const searchSuggestions = document.getElementById('attendanceSearchSuggestions');
        const issuesToggle = document.getElementById('attendanceIssuesToggle');
        const issuesCount = document.getElementById('attendanceIssuesCount');
        const resetViewBtn = document.getElementById('attendanceResetView');
        const viewSummary = document.getElementById('attendanceViewSummary');
        const clearFilters = document.getElementById('clearFilters');
        const attentionBar = document.getElementById('attendanceAttentionBar');
        const attentionChips = document.getElementById('attendanceAttentionChips');
        const integrityBtn = document.getElementById('attendanceIntegrityBtn');
        const integrityOverlay = document.getElementById('integrityOverlay');
        const integrityList = document.getElementById('integrityList');
        const integritySummary = document.getElementById('integritySummary');
        const integrityClose = document.getElementById('integrityCloseBtn');
        const agentQuickStatus = document.getElementById('agentQuickStatus');
        if (!tbody || !search || !toggle || !input) return;

        const PREF_KEY = 'oosAttendanceViewPrefsV2';
        const collapsedDates = new Set();
        const expandedDates = new Set();
        let issuesOnly = false;
        let carryoverOnly = false;
        let categoryFilter = '';
        let metricFilter = '';
        let observer = null;
        let renderFrame = 0;
        let restoringDateFilters = false;


        let selectedAgentName = '';
        let rowAnalysisCache = new WeakMap();
        let rowAnalysisCacheExpiresAt = Date.now() + 30000;
        function resetRowAnalysisCache(){ rowAnalysisCache = new WeakMap(); rowAnalysisCacheExpiresAt = Date.now() + 30000; }

        function normalize(value) {
            return String(value || '').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
        }
        function analysisHasCategory(analysis, category) {
            if (!category) return true;
            if (!analysis) return false;
            if (Array.isArray(analysis.categories) && analysis.categories.includes(category)) return true;
            if (category === 'missing') return Boolean(analysis.missingTimeOut || analysis.status === 'Missing Time Out');
            if (category === 'late') return Boolean(analysis.late);
            if (category === 'early') return Boolean(analysis.early);
            if (category === 'break') return Boolean(analysis.longBreak);
            if (category === 'reduced') return Boolean(analysis.reducedCredit);
            if (category === 'adjustment') return Number(analysis.manualDeductionHours || 0) > 0;
            if (category === 'incomplete') return Boolean(analysis.incomplete);
            return false;
        }
        function metricMatchesAnalysis(analysis, metric) {
            const key=String(metric || '');
            if (!key) return true;
            if (!analysis) return false;
            const rowDay=analysis.dateKey || dateKey(parseDateParts(analysis.rawDate));
            if (rowDay !== dayOffsetKey(0)) return false;
            if (key === 'working') return analysis.status === 'Active';
            if (key === 'break') return analysis.status === 'On Break';
            if (key === 'complete') return analysis.status === 'Complete';
            if (key === 'issues') return Boolean(analysis.hasIssue);
            if (key === 'not-in') return !analysis.hasPunch || analysis.status === 'Not Yet In' || analysis.status === 'Note only';
            return true;
        }
        function currentSearchState() {
            const queryRaw = String(input.value || '').trim();
            // The visible search field is authoritative. If it is empty, an older
            // suggestion selection must never keep filtering invisibly.
            if (!queryRaw && selectedAgentName) selectedAgentName = '';
            return {
                queryRaw,
                query: normalize(queryRaw),
                selectedKey: queryRaw ? normalize(selectedAgentName) : ''
            };
        }
        function pad2(value) { return String(value).padStart(2, '0'); }
        function parseDateParts(value) {
            const text = String(value || '').trim();
            let match = text.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
            if (match) return { y:Number(match[1]), m:Number(match[2]), d:Number(match[3]) };
            match = text.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})/);
            if (match) return { y:Number(match[3]), m:Number(match[1]), d:Number(match[2]) };
            return null;
        }
        function dateKey(parts) { return parts ? parts.y + '-' + pad2(parts.m) + '-' + pad2(parts.d) : ''; }
        function trustedClockTodayParts() {
            // The main TrinoTime clock is rendered from the server-adjusted PHT
            // timeline. Use that visible trusted date for Today-at-a-Glance so
            // a device clock that is ahead/behind the verified server time cannot
            // shift the attendance filter onto the wrong calendar day.
            try {
                const main = document.getElementById('clockDateMain');
                const year = document.getElementById('clockDateYear');
                const text = `${main && main.textContent ? main.textContent : ''} ${year && year.textContent ? year.textContent : ''}`.trim();
                const monthMatch = text.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2})\b/i);
                const yearMatch = text.match(/\b(\d{4})\b/);
                if (monthMatch && yearMatch) {
                    const months = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 };
                    const month = months[String(monthMatch[1]).slice(0,3).toLowerCase()];
                    const day = Number(monthMatch[2]);
                    const fullYear = Number(yearMatch[1]);
                    if (month && Number.isInteger(day) && day >= 1 && day <= 31 && Number.isInteger(fullYear)) {
                        return { y:fullYear, m:month, d:day };
                    }
                }
            } catch (error) {}
            return null;
        }
        function manilaTodayParts() {
            const trusted = trustedClockTodayParts();
            if (trusted) return trusted;
            try {
                const parts = new Intl.DateTimeFormat('en-US', { timeZone:'Asia/Manila', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(new Date());
                const values = {}; parts.forEach(part => { values[part.type] = part.value; });
                return { y:Number(values.year), m:Number(values.month), d:Number(values.day) };
            } catch (error) {
                const now = new Date(); return { y:now.getFullYear(), m:now.getMonth()+1, d:now.getDate() };
            }
        }
        function operationalMonthKey() { const p=manilaTodayParts(); return `${p.y}-${pad2(p.m)}`; }
        function operationalMonthLabel() {
            const b=bridge();
            try { const state=b&&typeof b.getOperationalMonth==='function'?b.getOperationalMonth():null; if(state&&state.monthLabel)return String(state.monthLabel); } catch (_) {}
            const p=manilaTodayParts();
            return new Intl.DateTimeFormat('en-US',{timeZone:'UTC',month:'long',year:'numeric'}).format(new Date(Date.UTC(p.y,p.m-1,1,12)));
        }
        function explicitDateScopeActive() {
            return Boolean((document.getElementById('filterDate')||{}).value || (document.getElementById('filterDateTo')||{}).value || (document.getElementById('payPeriodPreset')||{}).value);
        }
        function dayOffsetKey(offset) {
            const p = manilaTodayParts();
            const date = new Date(Date.UTC(p.y, p.m - 1, p.d + offset));
            return date.getUTCFullYear() + '-' + pad2(date.getUTCMonth() + 1) + '-' + pad2(date.getUTCDate());
        }
        function isOlderThanYesterday(key) { return Boolean(key && key !== dayOffsetKey(0) && key !== dayOffsetKey(-1)); }
        function isCollapsed(key) {
            if (collapsedDates.has(key)) return true;
            if (expandedDates.has(key)) return false;
            return isOlderThanYesterday(key);
        }
        function formatDateLabel(rawDate) {
            const parts = parseDateParts(rawDate);
            if (!parts) return rawDate || 'Unknown date';
            const key = dateKey(parts), todayKey = dayOffsetKey(0), yesterdayKey = dayOffsetKey(-1);
            const date = new Date(Date.UTC(parts.y, parts.m - 1, parts.d, 12));
            const formatter = formatDateLabel.formatter || (formatDateLabel.formatter = new Intl.DateTimeFormat('en-US', { timeZone:'UTC', weekday:'short', month:'short', day:'numeric', year:'numeric' }));
            const pretty = formatter.format(date);
            if (key === todayKey) return 'Today · ' + pretty;
            if (key === yesterdayKey) return 'Yesterday · ' + pretty;
            return pretty;
        }
        function cellText(row, index) { return row && row.cells[index] ? row.cells[index].textContent.trim() : ''; }
        function dataRows() { const perf=window.TrinoTimeAttendancePerformance; if(perf&&typeof perf.allRows==='function')return perf.allRows(tbody); return Array.from(tbody.children).filter(row => !row.classList.contains('attendance-date-divider') && !row.classList.contains('attendance-search-empty')); }
        function setAllDateGroupsCollapsed(collapse) {
            const keys = new Set();
            dataRows().forEach(row => {
                const key = dateKey(parseDateParts(cellText(row, 0)));
                if (key) keys.add(key);
            });
            keys.forEach(key => {
                if (collapse) {
                    expandedDates.delete(key);
                    collapsedDates.add(key);
                } else {
                    collapsedDates.delete(key);
                    expandedDates.add(key);
                }
            });
            savePrefs();
            applyNow();
        }

        function attendanceSearchDataset() {
            const agents = new Map();
            dataRows().forEach(row => {
                const cell = row && row.cells ? row.cells[2] : null;
                if (!cell) return;
                let name = String(cell.dataset.attendanceName || '').trim();
                if (!name) {
                    const clone = cell.cloneNode(true);
                    clone.querySelectorAll('.avatar,.note-badge,.attendance-row-tags,.edit-name-btn').forEach(node => node.remove());
                    name = clone.textContent.trim();
                }
                if (!name) return;
                const shown = String(displayName(name) || name).trim();
                const key = normalize(name);
                if (key && !agents.has(key)) agents.set(key, { name, displayName:shown || name });
            });
            return Array.from(agents.values()).sort((a, b) => a.displayName.localeCompare(b.displayName) || a.name.localeCompare(b.name));
        }
        function closeAttendanceSearchSuggestions() {
            if (!searchSuggestions) return;
            searchSuggestions.classList.remove('is-open');
            searchSuggestions.innerHTML = '';
            input.setAttribute('aria-expanded', 'false');
        }
        function renderAttendanceSearchSuggestions() {
            if (!searchSuggestions) return;
            const raw = String(input.value || '').trim();
            const query = normalize(raw);
            searchSuggestions.innerHTML = '';
            if (!query) { closeAttendanceSearchSuggestions(); return; }
            const matches = attendanceSearchDataset().filter(agent =>
                normalize(agent.displayName).includes(query) || normalize(agent.name).includes(query)
            ).slice(0, 8);
            if (!matches.length) {
                const empty = document.createElement('div');
                empty.className = 'attendance-search-suggestion-empty';
                empty.textContent = 'No matching agents';
                searchSuggestions.appendChild(empty);
            } else {
                matches.forEach(agent => {
                    const option = document.createElement('button');
                    option.type = 'button';
                    option.className = 'attendance-search-suggestion';
                    option.setAttribute('role', 'option');
                    option.dataset.agentName = agent.name;
                    option.dataset.agentDisplayName = agent.displayName;
                    const primary = document.createElement('span');
                    primary.className = 'attendance-search-suggestion-name';
                    primary.textContent = agent.displayName;
                    const secondary = document.createElement('span');
                    secondary.className = 'attendance-search-suggestion-hint';
                    secondary.textContent = agent.displayName !== agent.name ? `${agent.name} · Filter attendance` : 'Filter attendance';
                    option.append(primary, secondary);
                    searchSuggestions.appendChild(option);
                });
            }
            searchSuggestions.classList.add('is-open');
            input.setAttribute('aria-expanded', 'true');
        }
        function handleAttendanceSearchInput() {
            const hadSelected=Boolean(selectedAgentName);
            const raw = String(input.value || '').trim();
            if (!raw) {
                selectedAgentName = '';
            } else if (selectedAgentName) {
                const selectedDisplay = String(displayName(selectedAgentName) || selectedAgentName).trim();
                const normalizedRaw = normalize(raw);
                if (normalizedRaw !== normalize(selectedDisplay) && normalizedRaw !== normalize(selectedAgentName)) {
                    selectedAgentName = '';
                }
            }
            const hasQuery = Boolean(raw);
            search.classList.toggle('has-query', hasQuery);
            renderAttendanceSearchSuggestions();
            // If an exact dropdown selection was released, rebuild the source table so
            // records hidden by the exact selection return before applying free-text search.
            if (!hasQuery || (hadSelected && !selectedAgentName)) reconcileNow(true);
            else scheduleApply();
        }

        function loadPrefs() {
            try {
                const raw = localStorage.getItem(PREF_KEY); if (!raw) return null;
                const p = JSON.parse(raw);
                const savedMonth=String(p.operationalMonth||'');
                const currentMonth=operationalMonthKey();
                p.__monthRolled=Boolean(savedMonth && savedMonth !== currentMonth);
                issuesOnly = p.__monthRolled ? false : Boolean(p.issuesOnly);
                carryoverOnly = false;
                (p.collapsedDates || []).forEach(k => collapsedDates.add(k));
                (p.expandedDates || []).forEach(k => expandedDates.add(k));
                return p;
            } catch (e) { return null; }
        }
        const loadedPrefs = loadPrefs() || {};
        function savePrefs() {
            try {
                localStorage.setItem(PREF_KEY, JSON.stringify({
                    issuesOnly,
                    operationalMonth:operationalMonthKey(),
                    collapsedDates:Array.from(collapsedDates).slice(-180),
                    expandedDates:Array.from(expandedDates).slice(-180),
                    filterDate:(document.getElementById('filterDate') || {}).value || '',
                    filterDateTo:(document.getElementById('filterDateTo') || {}).value || '',
                    payPeriodPreset:(document.getElementById('payPeriodPreset') || {}).value || ''
                }));
            } catch (e) {}
        }

        function bridge() { return window.trinoAttendanceBridge || null; }
        function visibleColumnCount() {
            const api = bridge();
            if (api && typeof api.visibleColumnCount === 'function') return api.visibleColumnCount();
            const header = document.getElementById('attendanceNightDiffHeader');
            return header && getComputedStyle(header).display !== 'none' ? 11 : 10;
        }
        function displayName(name) { const b=bridge(); return b && typeof b.getDisplayName==='function' ? b.getDisplayName(name) : String(name||''); }
        window.addEventListener('trinotime:profile-display-name-updated',()=>{resetRowAnalysisCache();closeAttendanceSearchSuggestions();scheduleApply();});
        window.addEventListener('trinotime:attendance-analysis-reset',()=>{resetRowAnalysisCache();scheduleApply();});
        function fallbackAnalyzeRow(row) {
            const rawDate = cellText(row, 0), name = cellText(row, 2).replace(/\s+(Complete|Active|On Break|Missing Time Out|Incomplete|Note only).*$/i, '').trim();
            const key = dateKey(parseDateParts(rawDate));
            const timeIn = cellText(row,3), startBreak=cellText(row,4), endBreak=cellText(row,5), logOut=cellText(row,6);
            const signal = normalize(row.textContent);
            const hasPunch = [timeIn,startBreak,endBreak,logOut].some(v => v && v !== '—' && !/in progress/i.test(v));
            const isToday = key === dayOffsetKey(0);
            let status = hasPunch ? 'Incomplete' : 'Note only';
            let statusClass = hasPunch ? 'status-issue' : 'flag-info';
            if (hasPunch && timeIn && timeIn !== '—' && logOut && logOut !== '—') { status='Complete'; statusClass='status-complete'; }
            else if (hasPunch && isToday && /start break/.test(signal) && !/end break\s+\d/.test(signal)) { status='On Break'; statusClass='status-break'; }
            else if (hasPunch && isToday && timeIn && timeIn !== '—') { status='Active'; statusClass='status-active'; }
            else if (hasPunch && !isToday && timeIn && timeIn !== '—' && (!logOut || logOut === '—')) { status='Missing Time Out'; statusClass='status-issue'; }

            const late = /\blate\b/.test(signal);
            const early = /\bearly\b/.test(signal);
            const longBreak = /long break/.test(signal);
            const reducedCredit = /reduced credit/.test(signal);
            const adjusted = /\badjusted\b/.test(signal);
            const missingTimeOut = status === 'Missing Time Out';
            const incomplete = hasPunch && status === 'Incomplete';
            const categories=[];
            if (missingTimeOut) categories.push('missing');
            if (late) categories.push('late');
            if (early) categories.push('early');
            if (longBreak) categories.push('break');
            if (reducedCredit) categories.push('reduced');
            if (adjusted) categories.push('adjustment');
            if (incomplete) categories.push('incomplete');




            return {
                row, rawDate, dateKey:key, name, normalizedName:normalize(name), normalizedDisplayName:normalize(displayName(name)),
                status, statusClass, hasIssue:Boolean(hasPunch && categories.length>0), categories,
                late, early, longBreak, reducedCredit,
                manualDeductionHours:0, breakDeductionHours:0,
                missingTimeOut, incomplete,
                regularHours:null, otHours:0,
                hasPunch
            };
        }
        function computeAnalyzeRow(row) {
            const rawDate=cellText(row,0), nameCell=row.cells[2], rawName=nameCell ? (nameCell.dataset.attendanceName || '') : '';
            const syntheticNotIn = row && row.dataset && row.dataset.attendanceSynthetic === 'not-in';
            let name = rawName;
            if (!name && nameCell) {
                const clone = nameCell.cloneNode(true);
                clone.querySelectorAll('.avatar,.note-badge,.attendance-row-tags,.edit-name-btn').forEach(node => node.remove());
                name = clone.textContent.trim();
            }
            name = name || cellText(row,2).trim();
            if (syntheticNotIn) {
                return { row, rawDate, dateKey:dateKey(parseDateParts(rawDate)), name, normalizedName:normalize(name), normalizedDisplayName:normalize(displayName(name)), status:'Not Yet In', statusClass:'flag-info', hasIssue:false, categories:[], late:false, early:false, longBreak:false, reducedCredit:false, manualDeductionHours:0, breakDeductionHours:0, missingTimeOut:false, incomplete:false, regularHours:null, otHours:0, nightDiffHours:0, hasPunch:false };
            }
            const b=bridge(), rec=b && typeof b.getRecord==='function' ? b.getRecord(rawDate,name) : null;
            if (rec && typeof b.analyzeRecord==='function') {
                const a=b.analyzeRecord(rec);
                return { ...a, row, rawDate, dateKey:dateKey(parseDateParts(rawDate)), name, normalizedName:normalize(name), normalizedDisplayName:normalize(displayName(name)) };
            }
            return fallbackAnalyzeRow(row);
        }
        function analyzeRow(row) {
            const now=Date.now();
            if(now>=rowAnalysisCacheExpiresAt)resetRowAnalysisCache();
            const cached=rowAnalysisCache.get(row);
            if(cached)return cached;
            const analysis=computeAnalyzeRow(row);
            rowAnalysisCache.set(row,analysis);
            return analysis;
        }
        function formatDashboardDuration(hours) {
            const value = Number(hours);
            if (!Number.isFinite(value)) return '—';
            const totalMinutes = Math.max(0, Math.round(value * 60));
            return Math.floor(totalMinutes / 60) + 'h ' + (totalMinutes % 60) + 'm';
        }
        function addBadge(container,text,className,title) { const badge=document.createElement('span'); badge.className='attendance-badge '+className; badge.textContent=text; if(title) badge.title=title; container.appendChild(badge); }
        function decorateRow(a) {
            const cell=a.row.cells[2]; if(!cell) return;
            if (cell.dataset.attendanceName !== a.name) cell.dataset.attendanceName=a.name;
            const signature=JSON.stringify([a.status,a.statusClass,a.late,a.early,a.longBreak,a.breakDeductionHours,a.reducedCredit,a.manualDeductionHours,a.otHours]);
            const old=cell.querySelector('.attendance-row-tags');
            if(old && old.dataset.attendanceSignature===signature) return;
            if(old) old.remove();
            const tags=document.createElement('span'); tags.className='attendance-row-tags';
            addBadge(tags,a.status,a.statusClass);
            if(a.late) addBadge(tags,'Late','flag-warning');
            if(a.early) addBadge(tags,'Early Time Out','flag-warning');
            if(a.longBreak) addBadge(tags,'Long Break','flag-warning','Break exceeded the fixed 30-minute allowance. Excess minutes are deducted automatically.');
            if(Number(a.breakDeductionHours||0)>0) addBadge(tags,'Break -'+formatDashboardDuration(Number(a.breakDeductionHours)),'flag-warning','Automatic excess-break deduction from regular paid hours.');
            if(a.reducedCredit) addBadge(tags,'Reduced Credit','flag-info','Regular credited hours are below 6.0h.');
            if(Number(a.manualDeductionHours||0)>0) addBadge(tags,'Adjusted -'+formatDashboardDuration(Number(a.manualDeductionHours)),'flag-warning','Admin/TL manual deduction applied to regular credited hours.');
            if(a.otHours>0) addBadge(tags,'OT +'+formatDashboardDuration(Number(a.otHours)),'flag-ot');
            tags.dataset.attendanceSignature=signature;
            cell.appendChild(tags);
        }
        function summarizeGroup(items) {
            const counts={complete:0,active:0,onBreak:0,issues:0};
            items.forEach(item=>{ if(item.status==='Complete')counts.complete++; if(item.status==='Active')counts.active++; if(item.status==='On Break')counts.onBreak++; if(item.hasIssue)counts.issues++; });
            return counts;
        }
        function makeDateDivider(rawDate,key,items,collapsed) {
            const counts=summarizeGroup(items), row=document.createElement('tr'); row.className='attendance-date-divider'+(collapsed?' is-collapsed':''); row.dataset.dateKey=key;
            const cell=document.createElement('td'); cell.colSpan=visibleColumnCount(); const line=document.createElement('div'); line.className='attendance-date-line';
            const button=document.createElement('button'); button.type='button'; button.className='attendance-date-toggle'; button.dataset.dateKey=key; button.setAttribute('aria-expanded',String(!collapsed)); button.setAttribute('aria-label',(collapsed?'Expand ':'Collapse ')+formatDateLabel(rawDate)+' attendance records'); button.innerHTML='<span class="attendance-date-chevron" aria-hidden="true">▼</span><span class="attendance-date-label"></span>'; button.querySelector('.attendance-date-label').textContent=formatDateLabel(rawDate);
            const summary=document.createElement('span'); summary.className='attendance-date-summary'; const parts=[items.length+' record'+(items.length===1?'':'s'),counts.complete+' complete']; if(counts.active)parts.push(counts.active+' active'); if(counts.onBreak)parts.push(counts.onBreak+' on break'); summary.appendChild(document.createTextNode(parts.join(' · ')+' · ')); const issue=document.createElement('span'); issue.className=counts.issues?'has-issues':''; issue.textContent=counts.issues+' issue'+(counts.issues===1?'':'s'); summary.appendChild(issue);
            line.append(button,summary); cell.appendChild(line); row.appendChild(cell); return row;
        }
        function makeEmptyRow(message) { const row=document.createElement('tr'); row.className='attendance-search-empty'; const cell=document.createElement('td'); cell.colSpan=visibleColumnCount(); const label=document.createElement('span'); label.className='attendance-search-empty-message'; label.textContent=message; cell.appendChild(label); row.appendChild(cell); return row; }
        function setAttendanceRowVisible(row, visible) {
            if (!row) return;
            if (row.hidden === visible) row.hidden = !visible;
            if (row.classList.contains('attendance-filter-hidden') === visible) row.classList.toggle('attendance-filter-hidden', !visible);
            if (row.getAttribute('aria-hidden') !== String(!visible)) row.setAttribute('aria-hidden', String(!visible));
            if (visible && row.style.display) row.style.removeProperty('display');
            else if (!visible && (row.style.display !== 'none' || row.style.getPropertyPriority('display') !== 'important')) row.style.setProperty('display','none','important');
        }
        function syncMobileAttendanceCards(analyses) {
            const mobile=document.getElementById('mobileCards'); if(!mobile) return;
            const visibleKeys=new Set(analyses.filter(a=>a._visibleByFilter).map(a=>String(a.rawDate||'')+'|'+String(a.name||'')));
            mobile.querySelectorAll('.att-card[data-attendance-name][data-attendance-date]').forEach(card=>{
                const key=String(card.dataset.attendanceDate||'')+'|'+String(card.dataset.attendanceName||'');
                const visible=visibleKeys.has(key);
                setAttendanceRowVisible(card, visible);
            });
        }
        function setSearchOpen(open) {
            const shouldOpen = Boolean(open);
            search.classList.toggle('open', shouldOpen);
            if (shouldOpen) requestAnimationFrame(() => input.focus());
        }

        // UX15: summary-detail reconciliation uses only the authorized Admin
        // summary response. No new API calls, client edits or derived receipts.
        let attendanceReconciliationOpened = false;
        let attendanceReconciliationBound = false;
        // Presentation only: never show stable internal POD IDs to employees.
        // Resolve against the already-authorized, already-loaded POD directory;
        // keep the underlying ID unchanged for server scoping and permissions.
        function reconciliationPodLabel(item) {
            const raw = String(item?.pod || '').trim();
            const direct = String(item?.podLabel || '').trim();
            if (direct && direct !== 'Assigned POD' && !/^tt-custom-pod:/i.test(direct)) return direct;
            try {
                const label = String(window.TrinoTimePodDisplayLabel?.(raw) || '').trim();
                if (label && !/^tt-custom-pod:/i.test(label)) return label;
            } catch (_) { /* Directory not initialized: use a safe label. */ }
            return raw && !/^tt-custom-pod:/i.test(raw) ? raw : 'Assigned POD';
        }
        function renderAttendanceReconciliation(summary) {
            const region=document.getElementById('attendanceReconciliation');
            const toggle=document.getElementById('attendanceReconciliationToggle');
            const content=document.getElementById('attendanceReconciliationDetails');
            const totals=document.getElementById('attendanceReconciliationTotals');
            const state=document.getElementById('attendanceReconciliationState');
            if(!region || !toggle || !content || !totals || !state)return;
            const isAdmin=summary && summary.viewerRole==='admin' &&
                String(document.body?.dataset?.trinoRole||'').toLowerCase()==='admin';
            region.hidden=!isAdmin;
            if(!isAdmin){attendanceReconciliationOpened=false;content.hidden=true;toggle.setAttribute('aria-expanded','false');totals.textContent='';state.textContent='';content.replaceChildren(state);return;}
            if(!attendanceReconciliationBound){
                attendanceReconciliationBound=true;
                toggle.addEventListener('click',()=>{
                    attendanceReconciliationOpened=!attendanceReconciliationOpened;
                    renderAttendanceReconciliation(bridge()?.getTodaySummary?.());
                });
            }
            const details=summary.reconciliation;
            const valid=summary.ready!==false && details &&
                Array.isArray(details.missingTimeIn) && Array.isArray(details.unrosteredPunches);
            const missing=valid?Number(details.missingTotal)||0:0;
            const unmatched=valid?Number(details.unrosteredTotal)||0:0;
            totals.textContent=valid ? `${missing} scheduled without Time In · ${unmatched} punches outside loaded roster` : 'Attendance snapshot not yet available';
            toggle.setAttribute('aria-expanded',String(attendanceReconciliationOpened));
            content.hidden=!attendanceReconciliationOpened;
            if(!attendanceReconciliationOpened)return;
            content.replaceChildren(state);
            const freshness = summary.pendingAttendanceWrites ? 'Local attendance writes pending — not server verified' :
                summary.serverVerified===true ? 'Current authorized server snapshot' :
                summary.snapshotAt ? 'Snapshot is stale or not verified' : 'No verified server snapshot';
            state.textContent=freshness;
            const note=document.createElement('p');
            note.className='attendance-reconciliation-note';
            note.textContent='Read-only snapshot comparison. Scheduled without Time In is not automatically an absence. Tracker activity and attendance punching are separate.';
            content.appendChild(note);
            if(!valid){const empty=document.createElement('p');empty.textContent='Waiting for the authorized attendance snapshot. No zero totals inferred.';content.appendChild(empty);return;}
            const sections=[
                ['Scheduled without Time In', details.missingTimeIn, missing],
                ['Punch found outside loaded roster', details.unrosteredPunches, unmatched]
            ];
            sections.forEach(([heading,items,count])=>{
                const section=document.createElement('section');section.className='attendance-reconciliation-group';
                const h=document.createElement('h4');h.textContent=`${heading} (${count})`;section.appendChild(h);
                if(!count){const p=document.createElement('p');p.textContent='No records in this category.';section.appendChild(p);}
                else{
                    const list=document.createElement('ul');
                    items.forEach(item=>{
                        const row=document.createElement('li');
                        const agent=document.createElement('strong');agent.textContent=String(item.name||'Agent');
                        const reason=document.createElement('span');reason.textContent=`${reconciliationPodLabel(item)} · ${String(item.status||'Needs review')}`;
                        row.append(agent,reason);list.appendChild(row);
                    });
                    section.appendChild(list);
                    if(items.length<count){const more=document.createElement('p');more.textContent=`Showing ${items.length} of ${count} records. Narrow the authorized POD filter to inspect more.`;section.appendChild(more);}
                }
                content.appendChild(section);
            });
        }

        function renderTodaySummary() {
            const b=bridge(); if(!b || typeof b.getTodaySummary!=='function') return;
            const summary=b.getTodaySummary();
            const set=(id,val)=>{const el=document.getElementById(id); if(el && el.textContent!==String(val)) el.textContent=String(val);};
            const ready = summary.ready !== false;
            set('attendanceSummaryWorking',ready?summary.working:'—');
            set('attendanceSummaryBreak',ready?summary.onBreak:'—');
            set('attendanceSummaryComplete',ready?summary.complete:'—');
            set('attendanceSummaryNotIn',ready?summary.notIn:'—');
            set('attendanceSummaryIssues',ready?summary.issues:'—');
            document.querySelectorAll('.attendance-summary-card[data-attendance-metric]').forEach(card=>{
                const active=card.dataset.attendanceMetric===metricFilter;
                card.classList.toggle('is-filter-active',active);
                card.setAttribute('aria-pressed',String(active));
            });
            const isTl=summary.viewerRole==='teamleader' && String(document.body?.dataset?.trinoRole||'').toLowerCase()==='teamleader';
            renderAttendanceReconciliation(summary);
            const title=document.querySelector('#attendanceTodaySummary .attendance-summary-title');
            if(title) title.textContent=isTl?'My POD · Quick Team Status':'Today at a glance';
            const scope=document.getElementById('attendanceSummaryScope');
            if(scope){
                // Presentation only: preserve the exact scoped ID in summary.
                // The summary label sometimes includes a raw custom POD ID and suffix.
                const rawScope=String(summary.scope||'Current view');
                const readableScope=rawScope.replace(/tt-custom-pod:[a-z0-9_-]+:[a-z0-9_-]+/ig, id=>{
                    try {
                        const display=String(window.TrinoTimePodDisplayLabel?.(id)||'').trim();
                        if(display && !/^tt-custom-pod:/i.test(display) && !/^(assigned pod|unassigned)$/i.test(display))return display;
                    } catch (_) { /* Safe fallback while directory loads. */ }
                    return 'Assigned POD';
                });
                const label=readableScope+' · '+(ready?summary.scheduled+' scheduled · '+summary.roster+' rostered':'Checking attendance');
                if(scope.textContent!==label)scope.textContent=label;
                scope.title='Only TrinoTime attendance punches are counted. All Pods applies to the selected team. A missing roster or stale snapshot can affect visibility.';
            }
            const trust=document.getElementById('attendanceSummaryTrust');
            if(trust){
                let state='waiting', message='Waiting for attendance snapshot';
                if(ready){
                    if(summary.pendingAttendanceWrites){state='pending';message='Local attendance changes pending sync';}
                    else if(summary.serverVerified === true){state='fresh';message='Fresh attendance snapshot';}
                    else if(summary.snapshotAt){state='stale';message='Snapshot unverified or aging';}
                    else {state='waiting';message='Server verification pending';}
                }
                trust.dataset.state=state;
                trust.textContent=message;
                trust.title=summary.snapshotAt ? 'Last snapshot received '+new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',hour:'numeric',minute:'2-digit'}).format(new Date(summary.snapshotAt))+' PHT. This verifies attendance data retrieval, not Tracker task uploads.' : 'No verified attendance snapshot timestamp yet. Counts are not proof of live Augmoto activity.';
            }
            const warning=document.getElementById('attendanceSummaryRosterWarning');
            if(warning){
                const show=ready && summary.viewerRole==='admin' && Number(summary.unmatched)>0;
                warning.hidden=!show;
                if(show) warning.textContent=`${summary.unmatched} active/completed punch record${summary.unmatched===1?'':'s'} outside the loaded roster · Review roster synchronization`;
                else warning.textContent='';
            }
            const coach=document.getElementById('attendanceSummaryTlCoaching');
            if(coach){
                coach.hidden=!isTl;
                if(isTl){
                    // Existing getVisibleSessions() enforces the signed-in TL's
                    // authorized Coaching scope. Defensively filter by exact POD.
                    const api=window.TrinoTimeCoaching;
                    let text='Coaching: unavailable';
                    if(api && typeof api.getVisibleSessions==='function' && summary.scopePod){
                        try{
                            const sessions=api.getVisibleSessions();
                            if(Array.isArray(sessions)){
                                const active=sessions.filter(s=>s && String(s.pod||'')===String(summary.scopePod) && String(s.status||'').toUpperCase()==='ACTIVE').length;
                                text=`Coaching: ${active} visible active`;
                            }
                        }catch(_){/* Do not imply zero when the Coaching source fails. */}
                    }
                    if(coach.textContent!==text)coach.textContent=text;
                    coach.title='Read-only sessions visible to your authorized POD. Coaching updates separately from attendance punches.';
                }
            }
        }

        function renderAgentStatus() {
            if(!agentQuickStatus) return; const b=bridge(); if(!b || typeof b.getAgentQuickStatus!=='function') return;
            const status=b.getAgentQuickStatus(); agentQuickStatus.className='agent-quick-status';
            if(!status){ agentQuickStatus.textContent=''; return; }
            agentQuickStatus.classList.add('show','is-'+status.state); agentQuickStatus.innerHTML='<strong></strong><span></span>'; agentQuickStatus.querySelector('strong').textContent=status.label; agentQuickStatus.querySelector('span').textContent=status.detail;
        }
        function renderAttention(analyses, sourceMeta) {
            if(!attentionBar || !attentionChips) return;
            const defs=[['missing','Missing Time Outs'],['late','Late'],['early','Early Time Out'],['break','Long Break'],['reduced','Reduced Credit'],['incomplete','Incomplete']];
            const sourceCounts=sourceMeta&&sourceMeta.categoryCounts&&typeof sourceMeta.categoryCounts==='object'?sourceMeta.categoryCounts:null;
            const counts={}; defs.forEach(([key])=>counts[key]=sourceCounts?Number(sourceCounts[key]||0):analyses.filter(a=>analysisHasCategory(a,key)).length);
            const visible=defs.filter(([key])=>counts[key]>0);
            const b=bridge(); let carryover={count:0,monthLabel:operationalMonthLabel()};
            try{if(b&&typeof b.getPriorPeriodCarryover==='function')carryover=b.getPriorPeriodCarryover()||carryover;}catch(_){}
            const carryoverCount=Math.max(0,Number(carryover.count)||0);
            const signature=JSON.stringify([visible.map(([key])=>[key,counts[key]]),categoryFilter,carryoverOnly,carryoverCount,operationalMonthKey()]);
            if (attentionChips.dataset.ttSignature === signature) return;
            attentionChips.dataset.ttSignature=signature;
            attentionBar.classList.toggle('show',visible.length>0||carryoverCount>0);
            const label=attentionBar.querySelector('.attendance-attention-label');
            if(label)label.textContent=carryoverOnly?'Prior-period carryover':(explicitDateScopeActive()?'Needs attention · selected range':'Needs attention · '+operationalMonthLabel());
            attentionChips.innerHTML='';
            if(!carryoverOnly) visible.forEach(([key,labelText])=>{ const btn=document.createElement('button'); const active=categoryFilter===key; btn.type='button'; btn.className='attendance-attention-chip'; btn.dataset.category=key; btn.setAttribute('aria-pressed',String(active)); btn.title=active?'Clear '+labelText+' filter':'Show only '+labelText; btn.textContent=labelText+' '+counts[key]+(active?'  ×':''); attentionChips.appendChild(btn); });
            if(carryoverCount>0){const btn=document.createElement('button');btn.type='button';btn.className='attendance-attention-chip';btn.dataset.attendanceCarryover='true';btn.setAttribute('aria-pressed',String(carryoverOnly));btn.title=carryoverOnly?'Return to the current-month operational view':'Review unresolved open shifts from prior months';btn.textContent=(carryoverOnly?'Current month · ':'Prior-period carryover ')+(carryoverOnly?operationalMonthLabel():carryoverCount)+(carryoverOnly?'  ×':'');attentionChips.appendChild(btn);}
            if(!carryoverOnly&&categoryFilter && !visible.some(([key])=>key===categoryFilter)) categoryFilter='';
        }
        function updateAdminActionVisibility() { const b=bridge(); if(integrityBtn) integrityBtn.style.display=(b && typeof b.isAdmin==='function' && b.isAdmin())?'inline-flex':'none'; }
        function renderIntegrityCheck() {
            const b=bridge(); if(!b || typeof b.getIntegrityIssues!=='function' || !b.isAdmin || !b.isAdmin()) return;
            const report=b.getIntegrityIssues(); integritySummary.textContent=`Scanned ${report.scanned} punch record${report.scanned===1?'':'s'} in ${report.scope||'the current scope'}. ${report.issues.length} potential problem${report.issues.length===1?'':'s'} found.`;
            integrityList.innerHTML='';
            if(!report.issues.length){ const empty=document.createElement('div'); empty.className='integrity-empty'; empty.textContent='✓ No impossible sequences, overlapping shifts, duplicate timestamps, or missing past Time Outs found in this scope.'; integrityList.appendChild(empty); }
            else report.issues.forEach(issue=>{ const item=document.createElement('div'); item.className='integrity-item'+(issue.severity==='error'?' is-error':''); const head=document.createElement('div'); head.className='integrity-item-head'; const who=document.createElement('span'); who.textContent=displayName(issue.name); const type=document.createElement('span'); type.textContent=issue.type; head.append(who,type); const meta=document.createElement('div'); meta.className='integrity-item-meta'; meta.textContent=(issue.pod||'')+' · '+issue.date; const body=document.createElement('div'); body.className='integrity-item-body'; body.textContent=issue.message; item.append(head,meta,body); integrityList.appendChild(item); });
            integrityOverlay.classList.add('open');
        }

        function applyAttendanceView() {
            if (typeof window !== 'undefined' && window.TrinoTimeAttendancePerformance?.isVisible?.() === false) return;
            if(observer) observer.disconnect();
            try {
                const perf=window.TrinoTimeAttendancePerformance;
                const virtualized=Boolean(perf&&typeof perf.isVirtualized==='function'&&perf.isVirtualized(tbody));
                const existingDividers = virtualized ? new Map() : new Map(Array.from(tbody.querySelectorAll('.attendance-date-divider')).map(node=>[node.dataset.dateKey,node]));
                tbody.querySelectorAll('.attendance-search-empty').forEach(node=>node.remove());
                const viewDay=dayOffsetKey(0);
                const searchState=currentSearchState(), queryRaw=searchState.queryRaw, query=searchState.query, selectedKey=searchState.selectedKey; search.classList.toggle('has-query',Boolean(query));
                const rows=dataRows(), analyses=rows.map(analyzeRow);
                const sourceInfo=perf&&typeof perf.sourceInfo==='function'?perf.sourceInfo():null;
                const sourceMeta=sourceInfo&&sourceInfo.active&&sourceInfo.meta?sourceInfo.meta:null;
                const issueTotal=sourceMeta&&Number.isFinite(Number(sourceMeta.issueTotal))?Number(sourceMeta.issueTotal):analyses.filter(a=>a.hasIssue).length;
                if(issuesCount) issuesCount.textContent=String(issueTotal);
                if(issuesToggle) issuesToggle.setAttribute('aria-pressed',String(issuesOnly));
                renderAttention(analyses,sourceMeta); renderTodaySummary(); renderAgentStatus(); updateAdminActionVisibility();
                let visible=0, matched=0; const groups=[]; const groupMap=new Map();
                analyses.forEach(a=>{
                    decorateRow(a);
                    const freeTextMatch=!query || a.normalizedName.includes(query) || String(a.normalizedDisplayName || '').includes(query);
                    const queryMatch=selectedKey ? a.normalizedName === selectedKey : freeTextMatch;
                    const highlighted=Boolean((query || selectedKey) && queryMatch);
                    if (highlighted) matched++;
                    if (a.row.classList.contains('attendance-search-match') !== highlighted) a.row.classList.toggle('attendance-search-match',highlighted);
                    const nameCell=a.row.cells[2];
                    if (nameCell && nameCell.classList.contains('attendance-search-name-match') !== highlighted) nameCell.classList.toggle('attendance-search-name-match',highlighted);
                    const categoryMatch=analysisHasCategory(a,categoryFilter);
                    const metricMatch=metricMatchesAnalysis(a,metricFilter);
                    const shouldShow=queryMatch && (!issuesOnly || a.hasIssue) && categoryMatch && metricMatch;
                    a._visibleByFilter=shouldShow;
                    const key=a.dateKey || a.rawDate || 'unknown'; if(!groupMap.has(key)){const group={key,rawDate:a.rawDate,items:[]};groupMap.set(key,group);groups.push(group);} groupMap.get(key).items.push(a);
                });
                groups.forEach(group=>{
                    const filtered=group.items.filter(a=>a._visibleByFilter); if(!filtered.length){group.items.forEach(a=>setAttendanceRowVisible(a.row,false));return;}
                    const filteringActive=Boolean(query||selectedKey||issuesOnly||categoryFilter||metricFilter);
                    // Filtered views auto-expand by default, but an explicit Collapse all
                    // action is still respected. collapsedDates contains only user-forced
                    // collapsed groups, while old dates that are merely collapsed by
                    // default continue to auto-open when a filter is active.
                    const collapsed=filteringActive ? collapsedDates.has(group.key) : isCollapsed(group.key);
                    const signature=JSON.stringify([group.rawDate,viewDay,collapsed,visibleColumnCount(),filtered.length,summarizeGroup(filtered)]);
                    let divider=virtualized?null:existingDividers.get(group.key);
                    if(!virtualized)existingDividers.delete(group.key);
                    if (!divider || divider.dataset.ttDividerSignature !== signature) {
                        const replacement=makeDateDivider(group.rawDate,group.key,filtered,collapsed);
                        replacement.dataset.ttDividerSignature=signature;
                        if (!virtualized && divider) divider.replaceWith(replacement);
                        divider=replacement;
                    }
                    group._divider=divider;
                    group._collapsed=collapsed;
                    if(!virtualized){
                        const first=group.items[0].row;
                        if (divider.nextElementSibling !== first) tbody.insertBefore(divider,first);
                    }
                    group.items.forEach(a=>{ const show=a._visibleByFilter && !collapsed; setAttendanceRowVisible(a.row,show); if(show)visible++; });
                });
                if(!virtualized)existingDividers.forEach(node=>node.remove());
                syncMobileAttendanceCards(analyses);
                const noMatches=!groups.some(g=>g.items.some(a=>a._visibleByFilter));
                const emptyMessage=query?'No attendance records match “'+queryRaw+'”.':(carryoverOnly?'No unresolved prior-period attendance carryover remains.':(metricFilter?'No attendance records match this Today at a Glance status.':(categoryFilter?'No records match this issue category.':(issuesOnly?'No attendance issues in this view.':(explicitDateScopeActive()?'No attendance records in the selected range.':'No attendance records in '+operationalMonthLabel()+'.')))));
                const emptyRow=noMatches?makeEmptyRow(emptyMessage):null;
                if(!virtualized&&emptyRow)tbody.appendChild(emptyRow);
                const sourceFilteredTotal=sourceMeta&&Number.isFinite(Number(sourceMeta.filteredTotal))?Number(sourceMeta.filteredTotal):rows.length;
                const sourceMatchTotal=sourceMeta&&Number.isFinite(Number(sourceMeta.queryMatchTotal))?Number(sourceMeta.queryMatchTotal):matched;
                if(searchCount) searchCount.textContent=query ? sourceMatchTotal+' match'+(sourceMatchTotal===1?'':'es') : '';
                if(viewSummary){
                    const rangeLabel=sourceInfo&&sourceInfo.active&&sourceInfo.total?`${sourceInfo.from}–${sourceInfo.to} shown`:(visible+' visible');
                    const parts=[carryoverOnly?'Prior-period carryover':(explicitDateScopeActive()?'Selected range':operationalMonthLabel()),rangeLabel];
                    if(sourceFilteredTotal!==visible||sourceInfo?.active)parts.push(sourceFilteredTotal+' total');
                    if(issueTotal)parts.push(issueTotal+' issue'+(issueTotal===1?'':'s'));
                    if(categoryFilter)parts.push('category filtered'); if(metricFilter)parts.push('today status filtered'); viewSummary.textContent=parts.join(' · ');
                }
                if(resetViewBtn){
                    const filterEmp=document.getElementById('filterEmp'), from=document.getElementById('filterDate'), to=document.getElementById('filterDateTo'), preset=document.getElementById('payPeriodPreset');
                    const hasBaseFilter=Boolean((filterEmp&&filterEmp.value)||(from&&from.value)||(to&&to.value)||(preset&&preset.value));
                    const hasViewFilter=Boolean(query||issuesOnly||categoryFilter||metricFilter||hasBaseFilter);
                    resetViewBtn.classList.toggle('show',hasViewFilter);
                    resetViewBtn.setAttribute('aria-hidden',String(!hasViewFilter));
                }
                const pageFilterKey = JSON.stringify([query,selectedKey,issuesOnly,carryoverOnly,categoryFilter,metricFilter,operationalMonthKey(),
                    ...['filterEmp','filterDate','filterDateTo','payPeriodPreset'].map(id=>document.getElementById(id)?.value || '')]);
                if(sourceInfo&&sourceInfo.active){
                    // RC66 source-level windowing already chose the active <=50 records
                    // before HTML/DOM construction. Do not paginate or retain another
                    // hidden/detached copy of the complete month here.
                    perf.paginate(pageFilterKey);
                }else if(virtualized&&perf&&typeof perf.virtualize==='function'){
                    const virtualGroups=groups.filter(g=>g.items.some(a=>a._visibleByFilter)).map(g=>({
                        divider:g._divider,
                        rows:g._collapsed?[]:g.items.filter(a=>a._visibleByFilter).map(a=>a.row)
                    }));
                    perf.virtualize(tbody,pageFilterKey,virtualGroups,emptyRow);
                }else{
                    window.TrinoTimeAttendancePerformance.paginate(pageFilterKey);
                }
            } finally { if(observer)observer.observe(tbody,{childList:true}); }
        }
        let attendanceApplyTimer = 0;
        function scheduleApply(){
            if (typeof window !== 'undefined' && window.TrinoTimeAttendancePerformance?.isVisible?.() === false) return;
            if(renderFrame || attendanceApplyTimer) return;
            renderFrame=requestAnimationFrame(()=>{
                renderFrame=0;
                if(document.documentElement.classList.contains('tt-is-scrolling')){
                    attendanceApplyTimer=setTimeout(()=>{attendanceApplyTimer=0;scheduleApply();},180);
                    return;
                }
                applyAttendanceView();
            });
        }
        function applyNow(){
            if(renderFrame){cancelAnimationFrame(renderFrame);renderFrame=0;}
            if(attendanceApplyTimer){clearTimeout(attendanceApplyTimer);attendanceApplyTimer=0;}
            applyAttendanceView();
        }
        function refreshSourceTable() {
            const b=bridge();
            if (b && typeof b.refreshTable==='function') {
                // Base-table rendering must always start from the complete source
                // for the selected POD/date/agent scope. The Today metric is a
                // presentation filter applied below; suppress it only during the
                // synchronous source rebuild, then restore it before applyNow().
                const savedMetric = metricFilter;
                metricFilter = '';
                try { b.refreshTable(); return true; } catch (e) { return false; }
                finally { metricFilter = savedMetric; }
            }
            return false;
        }
        function reconcileNow(sourceRefresh) {
            if (sourceRefresh) refreshSourceTable();
            applyNow();
            // Actual source mutations are observed; do not repeat the full pass next frame.
        }
        function setIssuesOnly(next){const hadMetric=Boolean(metricFilter);carryoverOnly=false;issuesOnly=Boolean(next);if(issuesOnly){categoryFilter='';metricFilter='';}savePrefs();reconcileNow(true);}
        function setCarryoverOnly(next){carryoverOnly=Boolean(next);if(carryoverOnly){issuesOnly=false;categoryFilter='';metricFilter='';}savePrefs();reconcileNow(true);}
        function selectAttendanceAgent(name,label) {
            selectedAgentName=String(name || '').trim();
            input.value=String(label || displayName(selectedAgentName) || selectedAgentName).trim();
            search.classList.toggle('has-query',Boolean(input.value));
            closeAttendanceSearchSuggestions();
            savePrefs();
            reconcileNow(true);
        }
        function clearAttendanceSearchPreservingView() {
            input.value='';
            selectedAgentName='';
            closeAttendanceSearchSuggestions();
            search.classList.remove('has-query');
            savePrefs();
            reconcileNow(true);
            // Source render + next-frame reconciliation keeps any active category/metric authoritative.
        }
        function setCategoryFilter(nextCategory) {
            const next=String(nextCategory || '');
            const hadMetric=Boolean(metricFilter);
            categoryFilter=categoryFilter===next?'':next;
            metricFilter='';
            issuesOnly=false;
            carryoverOnly=false;
            if (!String(input.value || '').trim()) selectedAgentName='';
            savePrefs();
            reconcileNow(hadMetric);
        }
        function setMetricFilter(nextMetric) {
            const next=String(nextMetric || '');
            metricFilter=metricFilter===next?'':next;
            categoryFilter='';
            issuesOnly=false;
            carryoverOnly=false;
            savePrefs();
            reconcileNow(true);
        }
        function resetAttendanceView(){
            input.value='';
            selectedAgentName='';
            closeAttendanceSearchSuggestions();
            issuesOnly=false;
            carryoverOnly=false;
            categoryFilter='';
            metricFilter='';
            collapsedDates.clear();
            expandedDates.clear();
            setSearchOpen(false);
            const clear=document.getElementById('clearFilters');
            if(clear){
                clear.click();
                savePrefs();
                scheduleApply();
                return;
            }
            ['filterEmp','filterDate','filterDateTo','payPeriodPreset'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
            savePrefs();
            scheduleApply();
        }

        toggle.addEventListener('click',()=>{ setSearchOpen(true); renderAttendanceSearchSuggestions(); });
        input.addEventListener('input', handleAttendanceSearchInput);
        input.addEventListener('change', handleAttendanceSearchInput);
        input.addEventListener('focus', renderAttendanceSearchSuggestions);
        input.addEventListener('keydown',e=>{
            if(e.key==='Escape'){
                clearAttendanceSearchPreservingView();
                setSearchOpen(false);
                input.blur();
                toggle.focus();
            }
        });
        if(searchClear)searchClear.addEventListener('click',e=>{
            e.preventDefault();
            e.stopPropagation();
            clearAttendanceSearchPreservingView();
            input.focus();
        });
        if(searchSuggestions) searchSuggestions.addEventListener('click', e => {
            const option = e.target.closest('.attendance-search-suggestion');
            if (!option || !searchSuggestions.contains(option)) return;
            const name=String(option.dataset.agentName || '').trim();
            const label=option.dataset.agentDisplayName || displayName(name) || name;
            selectAttendanceAgent(name,label);
            input.focus();
        });
        document.addEventListener('pointerdown', e => {
            if (searchSuggestions && searchSuggestions.classList.contains('is-open') && !search.contains(e.target)) {
                closeAttendanceSearchSuggestions();
            }
        }, true);
        if(issuesToggle)issuesToggle.addEventListener('click',()=>setIssuesOnly(!issuesOnly));
        if(attentionChips)attentionChips.addEventListener('click',e=>{const btn=e.target.closest('.attendance-attention-chip');if(!btn)return;e.preventDefault();if(btn.dataset.attendanceCarryover==='true'){setCarryoverOnly(!carryoverOnly);return;}setCategoryFilter(btn.dataset.category||'');});
        if(resetViewBtn)resetViewBtn.addEventListener('click',resetAttendanceView);
        tbody.addEventListener('click',e=>{const btn=e.target.closest('.attendance-date-toggle');if(!btn||!tbody.contains(btn))return;const key=btn.dataset.dateKey||'';if(!key)return;if(isCollapsed(key)){collapsedDates.delete(key);expandedDates.add(key);}else{expandedDates.delete(key);collapsedDates.add(key);}savePrefs();scheduleApply();});
        if(clearFilters)clearFilters.addEventListener('click',()=>{input.value='';selectedAgentName='';closeAttendanceSearchSuggestions();issuesOnly=false;carryoverOnly=false;categoryFilter='';metricFilter='';collapsedDates.clear();expandedDates.clear();setSearchOpen(false);savePrefs();scheduleApply();});
        if(integrityBtn)integrityBtn.addEventListener('click',renderIntegrityCheck);
        if(integrityClose)integrityClose.addEventListener('click',()=>integrityOverlay.classList.remove('open'));
        if(integrityOverlay)integrityOverlay.addEventListener('click',e=>{if(e.target===integrityOverlay)integrityOverlay.classList.remove('open');});
        const empSelect=document.getElementById('empSelect'); if(empSelect)empSelect.addEventListener('change',scheduleApply);
        ['filterDate','filterDateTo','payPeriodPreset'].forEach(id=>{const el=document.getElementById(id);if(el)el.addEventListener('change',()=>{if(!restoringDateFilters){carryoverOnly=false;savePrefs();scheduleApply();}});});

        window.trinoAttendanceDashboard={
            getState:()=>({query:input.value.trim(),selectedAgent:selectedAgentName,issuesOnly,carryoverOnly,category:categoryFilter,metric:metricFilter,operationalMonth:operationalMonthKey()}),
            refresh:scheduleApply,
            refreshNow:applyNow,
            selectAgent:selectAttendanceAgent,
            clearSearch:clearAttendanceSearchPreservingView,
            setIssuesOnly:setIssuesOnly,
            setCarryoverOnly:setCarryoverOnly,
            setCategory:setCategoryFilter,
            setMetric:setMetricFilter,
            setAllDatesCollapsed:setAllDateGroupsCollapsed,
            reset:resetAttendanceView
        };

        document.addEventListener('DOMContentLoaded',function(){
            setTimeout(function(){
                const from=document.getElementById('filterDate'),to=document.getElementById('filterDateTo'),preset=document.getElementById('payPeriodPreset');
                let restored=false; restoringDateFilters=true;
                const monthRolled=Boolean(loadedPrefs.__monthRolled);
                if(!monthRolled&&from&&loadedPrefs.filterDate){from.value=loadedPrefs.filterDate;restored=true;}
                if(!monthRolled&&to&&loadedPrefs.filterDateTo){to.value=loadedPrefs.filterDateTo;restored=true;}
                if(!monthRolled&&preset&&loadedPrefs.payPeriodPreset){preset.value=loadedPrefs.payPeriodPreset;}
                if(monthRolled){issuesOnly=false;carryoverOnly=false;if(from)from.value='';if(to)to.value='';if(preset)preset.value='';savePrefs();}
                restoringDateFilters=false;
                if(restored&&from)from.dispatchEvent(new Event('change',{bubbles:true}));
                scheduleApply();
            },0);
        });
        let lastOperationalMonth=operationalMonthKey();
        setInterval(()=>{
            if(document.visibilityState==='hidden')return;
            const nextMonth=operationalMonthKey();
            if(nextMonth===lastOperationalMonth)return;
            lastOperationalMonth=nextMonth;
            if(!explicitDateScopeActive()){issuesOnly=false;carryoverOnly=false;categoryFilter='';metricFilter='';savePrefs();refreshSourceTable();applyNow();}
            else savePrefs();
        },60000);
        document.addEventListener('trinotime:admin-view-change', scheduleApply);
        document.addEventListener('visibilitychange', scheduleApply);
        // Update the light status cards as soon as an authoritative attendance
        // projection changes. Large table paints may be intentionally deferred
        // while an Admin scrolls; their summary must not remain at a stale zero.
        let pendingSummaryRefresh = null;
        window.addEventListener('trinotime:attendance-projection-change', () => {
            if (document.visibilityState === 'hidden' || pendingSummaryRefresh !== null) return;
            pendingSummaryRefresh = setTimeout(() => {
                pendingSummaryRefresh = null;
                renderTodaySummary();
            }, 200);
        }, { passive:true });
        // Only repaint the small provenance line periodically when Attendance is
        // visible. This does not initiate network requests or redraw attendance rows.
        setInterval(()=>{
            if(document.visibilityState==='hidden')return;
            const card=document.getElementById('logTableCard');
            if(!card || card.offsetParent===null)return;
            renderTodaySummary();
        },30000);
        observer=new MutationObserver(scheduleApply);
        const startAttendanceEnhancements = () => {
            try { observer.observe(tbody,{childList:true}); } catch (_) {}
            applyAttendanceView();
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startAttendanceEnhancements, { once:true });
        else startAttendanceEnhancements();
    }());

