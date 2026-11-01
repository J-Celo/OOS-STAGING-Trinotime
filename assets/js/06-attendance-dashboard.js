    /* Attendance-log dashboard enhancements live outside the core tracker.
       This layer is intentionally read-only: it consumes rendered rows and a
       read-only bridge, but never writes Firebase records or credited-hours data. */
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
        let categoryFilter = '';
        let observer = null;
        let renderFrame = 0;
        let restoringDateFilters = false;

        function normalize(value) {
            return String(value || '').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
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
        function manilaTodayParts() {
            try {
                const parts = new Intl.DateTimeFormat('en-US', { timeZone:'Asia/Manila', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(new Date());
                const values = {}; parts.forEach(part => { values[part.type] = part.value; });
                return { y:Number(values.year), m:Number(values.month), d:Number(values.day) };
            } catch (error) {
                const now = new Date(); return { y:now.getFullYear(), m:now.getMonth()+1, d:now.getDate() };
            }
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
            const pretty = new Intl.DateTimeFormat('en-US', { timeZone:'UTC', weekday:'short', month:'short', day:'numeric', year:'numeric' }).format(date);
            if (key === todayKey) return 'Today · ' + pretty;
            if (key === yesterdayKey) return 'Yesterday · ' + pretty;
            return pretty;
        }
        function cellText(row, index) { return row && row.cells[index] ? row.cells[index].textContent.trim() : ''; }
        function dataRows() { return Array.from(tbody.children).filter(row => !row.classList.contains('attendance-date-divider') && !row.classList.contains('attendance-search-empty')); }

        function attendanceSearchDataset() {
            const names = new Map();
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
                const shown=displayName(name), key=normalize(shown);
                if (key && !names.has(key)) names.set(key, shown);
            });
            return Array.from(names.values()).sort((a, b) => a.localeCompare(b));
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
            const matches = attendanceSearchDataset().filter(name => normalize(name).includes(query)).slice(0, 8);
            if (!matches.length) {
                const empty = document.createElement('div');
                empty.className = 'attendance-search-suggestion-empty';
                empty.textContent = 'No matching agents';
                searchSuggestions.appendChild(empty);
            } else {
                matches.forEach(name => {
                    const option = document.createElement('button');
                    option.type = 'button';
                    option.className = 'attendance-search-suggestion';
                    option.setAttribute('role', 'option');
                    option.dataset.agentName = name;
                    const primary = document.createElement('span');
                    primary.className = 'attendance-search-suggestion-name';
                    primary.textContent = name;
                    const secondary = document.createElement('span');
                    secondary.className = 'attendance-search-suggestion-hint';
                    secondary.textContent = 'Filter attendance';
                    option.append(primary, secondary);
                    searchSuggestions.appendChild(option);
                });
            }
            searchSuggestions.classList.add('is-open');
            input.setAttribute('aria-expanded', 'true');
        }
        function handleAttendanceSearchInput() {
            const hasQuery = Boolean(String(input.value || '').trim());
            search.classList.toggle('has-query', hasQuery);
            renderAttendanceSearchSuggestions();
            scheduleApply();
        }

        function loadPrefs() {
            try {
                const raw = localStorage.getItem(PREF_KEY); if (!raw) return null;
                const p = JSON.parse(raw);
                issuesOnly = Boolean(p.issuesOnly);
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
                    collapsedDates:Array.from(collapsedDates).slice(-180),
                    expandedDates:Array.from(expandedDates).slice(-180),
                    filterDate:(document.getElementById('filterDate') || {}).value || '',
                    filterDateTo:(document.getElementById('filterDateTo') || {}).value || '',
                    payPeriodPreset:(document.getElementById('payPeriodPreset') || {}).value || ''
                }));
            } catch (e) {}
        }

        function bridge() { return window.trinoAttendanceBridge || null; }
        function displayName(name) { const b=bridge(); return b && typeof b.getDisplayName==='function' ? b.getDisplayName(name) : String(name||''); }
        window.addEventListener('trinotime:profile-display-name-updated',()=>{closeAttendanceSearchSuggestions();scheduleApply();});
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

            // Keep the fallback object contract identical to the Firebase-backed
            // analyzer. Quantities that cannot be recovered reliably from the DOM
            // use neutral values until the underlying record is available.
            return {
                row, rawDate, dateKey:key, name, normalizedName:normalize(name),
                status, statusClass, hasIssue:Boolean(hasPunch && categories.length>0), categories,
                late, early, longBreak, reducedCredit,
                manualDeductionHours:0, breakDeductionHours:0,
                missingTimeOut, incomplete,
                regularHours:null, otHours:0,
                hasPunch
            };
        }
        function analyzeRow(row) {
            const rawDate=cellText(row,0), nameCell=row.cells[2], rawName=nameCell ? (nameCell.dataset.attendanceName || '') : '';
            let name = rawName;
            if (!name && nameCell) {
                const clone = nameCell.cloneNode(true);
                clone.querySelectorAll('.avatar,.note-badge,.attendance-row-tags,.edit-name-btn').forEach(node => node.remove());
                name = clone.textContent.trim();
            }
            name = name || cellText(row,2).trim();
            const b=bridge(), rec=b && typeof b.getRecord==='function' ? b.getRecord(rawDate,name) : null;
            if (rec && typeof b.analyzeRecord==='function') {
                const a=b.analyzeRecord(rec);
                return { ...a, row, rawDate, dateKey:dateKey(parseDateParts(rawDate)), name, normalizedName:normalize(name) };
            }
            return fallbackAnalyzeRow(row);
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
            cell.dataset.attendanceName=a.name;
            const old=cell.querySelector('.attendance-row-tags'); if(old) old.remove();
            const tags=document.createElement('span'); tags.className='attendance-row-tags';
            addBadge(tags,a.status,a.statusClass);
            if(a.late) addBadge(tags,'Late','flag-warning');
            if(a.early) addBadge(tags,'Early Time Out','flag-warning');
            if(a.longBreak) addBadge(tags,'Long Break','flag-warning','Break exceeded the fixed 30-minute allowance. Excess minutes are deducted automatically.');
            if(Number(a.breakDeductionHours||0)>0) addBadge(tags,'Break -'+formatDashboardDuration(Number(a.breakDeductionHours)),'flag-warning','Automatic excess-break deduction from regular paid hours.');
            if(a.reducedCredit) addBadge(tags,'Reduced Credit','flag-info','Regular credited hours are below 6.0h.');
            if(Number(a.manualDeductionHours||0)>0) addBadge(tags,'Adjusted -'+formatDashboardDuration(Number(a.manualDeductionHours)),'flag-warning','Admin/TL manual deduction applied to regular credited hours.');
            if(a.otHours>0) addBadge(tags,'OT +'+formatDashboardDuration(Number(a.otHours)),'flag-ot');
            cell.appendChild(tags);
        }
        function summarizeGroup(items) {
            const counts={complete:0,active:0,onBreak:0,issues:0};
            items.forEach(item=>{ if(item.status==='Complete')counts.complete++; if(item.status==='Active')counts.active++; if(item.status==='On Break')counts.onBreak++; if(item.hasIssue)counts.issues++; });
            return counts;
        }
        function makeDateDivider(rawDate,key,items,collapsed) {
            const counts=summarizeGroup(items), row=document.createElement('tr'); row.className='attendance-date-divider'+(collapsed?' is-collapsed':''); row.dataset.dateKey=key;
            const cell=document.createElement('td'); cell.colSpan=attendanceVisibleColumnCount(); const line=document.createElement('div'); line.className='attendance-date-line';
            const button=document.createElement('button'); button.type='button'; button.className='attendance-date-toggle'; button.dataset.dateKey=key; button.setAttribute('aria-expanded',String(!collapsed)); button.setAttribute('aria-label',(collapsed?'Expand ':'Collapse ')+formatDateLabel(rawDate)+' attendance records'); button.innerHTML='<span class="attendance-date-chevron" aria-hidden="true">▼</span><span class="attendance-date-label"></span>'; button.querySelector('.attendance-date-label').textContent=formatDateLabel(rawDate);
            const summary=document.createElement('span'); summary.className='attendance-date-summary'; const parts=[items.length+' record'+(items.length===1?'':'s'),counts.complete+' complete']; if(counts.active)parts.push(counts.active+' active'); if(counts.onBreak)parts.push(counts.onBreak+' on break'); summary.appendChild(document.createTextNode(parts.join(' · ')+' · ')); const issue=document.createElement('span'); issue.className=counts.issues?'has-issues':''; issue.textContent=counts.issues+' issue'+(counts.issues===1?'':'s'); summary.appendChild(issue);
            line.append(button,summary); cell.appendChild(line); row.appendChild(cell); return row;
        }
        function makeEmptyRow(message) { const row=document.createElement('tr'); row.className='attendance-search-empty'; const cell=document.createElement('td'); cell.colSpan=attendanceVisibleColumnCount(); cell.textContent=message; row.appendChild(cell); return row; }
        function setSearchOpen(open) {
            // The search field now lives in the toolbar and remains visible.
            search.classList.add('open');
            if (open) requestAnimationFrame(() => input.focus());
        }

        function renderTodaySummary() {
            const b=bridge(); if(!b || typeof b.getTodaySummary!=='function') return;
            const summary=b.getTodaySummary();
            const set=(id,val)=>{const el=document.getElementById(id); if(el) el.textContent=String(val);};
            set('attendanceSummaryWorking',summary.working); set('attendanceSummaryBreak',summary.onBreak); set('attendanceSummaryComplete',summary.complete); set('attendanceSummaryNotIn',summary.notIn); set('attendanceSummaryIssues',summary.issues);
            const scope=document.getElementById('attendanceSummaryScope'); if(scope) scope.textContent=(summary.scope||'Current view')+' · '+summary.scheduled+' scheduled';
        }
        function renderAgentStatus() {
            if(!agentQuickStatus) return; const b=bridge(); if(!b || typeof b.getAgentQuickStatus!=='function') return;
            const status=b.getAgentQuickStatus(); agentQuickStatus.className='agent-quick-status';
            if(!status){ agentQuickStatus.textContent=''; return; }
            agentQuickStatus.classList.add('show','is-'+status.state); agentQuickStatus.innerHTML='<strong></strong><span></span>'; agentQuickStatus.querySelector('strong').textContent=status.label; agentQuickStatus.querySelector('span').textContent=status.detail;
        }
        function renderAttention(analyses) {
            if(!attentionBar || !attentionChips) return;
            const defs=[['missing','Missing Time Outs'],['late','Late'],['early','Early Time Out'],['break','Long Break'],['reduced','Reduced Credit'],['incomplete','Incomplete']];
            const counts={}; defs.forEach(([key])=>counts[key]=analyses.filter(a=>a.categories && a.categories.includes(key)).length);
            const visible=defs.filter(([key])=>counts[key]>0);
            attentionBar.classList.toggle('show',visible.length>0);
            attentionChips.innerHTML='';
            visible.forEach(([key,label])=>{ const btn=document.createElement('button'); const active=categoryFilter===key; btn.type='button'; btn.className='attendance-attention-chip'; btn.dataset.category=key; btn.setAttribute('aria-pressed',String(active)); btn.title=active?'Clear '+label+' filter':'Show only '+label; btn.textContent=label+' '+counts[key]+(active?'  ×':''); attentionChips.appendChild(btn); });
            if(categoryFilter && !visible.some(([key])=>key===categoryFilter)) categoryFilter='';
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
            if(observer) observer.disconnect();
            try {
                tbody.querySelectorAll('.attendance-date-divider,.attendance-search-empty').forEach(node=>node.remove());
                const queryRaw=input.value.trim(), query=normalize(queryRaw); search.classList.toggle('has-query',Boolean(query));
                const rows=dataRows(), analyses=rows.map(analyzeRow), issueTotal=analyses.filter(a=>a.hasIssue).length;
                if(issuesCount) issuesCount.textContent=String(issueTotal);
                if(issuesToggle) issuesToggle.setAttribute('aria-pressed',String(issuesOnly));
                renderAttention(analyses); renderTodaySummary(); renderAgentStatus(); updateAdminActionVisibility();
                let visible=0, matched=0; const groups=[]; const groupMap=new Map();
                analyses.forEach(a=>{
                    decorateRow(a); a.row.classList.remove('attendance-search-match'); if(a.row.cells[2])a.row.cells[2].classList.remove('attendance-search-name-match');
                    const queryMatch=!query || a.normalizedName.includes(query); if(query && queryMatch){matched++; a.row.classList.add('attendance-search-match'); if(a.row.cells[2])a.row.cells[2].classList.add('attendance-search-name-match');}
                    const categoryMatch=!categoryFilter || (a.categories && a.categories.includes(categoryFilter));
                    const shouldShow=queryMatch && (!issuesOnly || a.hasIssue) && categoryMatch;
                    a._visibleByFilter=shouldShow;
                    const key=a.dateKey || a.rawDate || 'unknown'; if(!groupMap.has(key)){const group={key,rawDate:a.rawDate,items:[]};groupMap.set(key,group);groups.push(group);} groupMap.get(key).items.push(a);
                });
                groups.forEach(group=>{
                    const filtered=group.items.filter(a=>a._visibleByFilter); if(!filtered.length){group.items.forEach(a=>a.row.style.display='none');return;}
                    const collapsed=query ? false : isCollapsed(group.key); const divider=makeDateDivider(group.rawDate,group.key,filtered,collapsed); const first=group.items[0].row; tbody.insertBefore(divider,first);
                    group.items.forEach(a=>{ const show=a._visibleByFilter && !collapsed; a.row.style.display=show?'':'none'; if(show)visible++; });
                });
                if(!groups.some(g=>g.items.some(a=>a._visibleByFilter))) tbody.appendChild(makeEmptyRow(query?'No attendance records match “'+queryRaw+'”.':(categoryFilter?'No records match this issue category.':(issuesOnly?'No attendance issues in this view.':'No attendance records in this view.'))));
                if(searchCount) searchCount.textContent=query ? matched+' match'+(matched===1?'':'es') : '';
                if(viewSummary){ const parts=[visible+' visible']; if(rows.length!==visible)parts.push(rows.length+' total'); if(issueTotal)parts.push(issueTotal+' issue'+(issueTotal===1?'':'s')); if(categoryFilter)parts.push('category filtered'); viewSummary.textContent=parts.join(' · '); }
                if(resetViewBtn){
                    const filterEmp=document.getElementById('filterEmp'), from=document.getElementById('filterDate'), to=document.getElementById('filterDateTo'), preset=document.getElementById('payPeriodPreset');
                    const hasBaseFilter=Boolean((filterEmp&&filterEmp.value)||(from&&from.value)||(to&&to.value)||(preset&&preset.value));
                    const hasViewFilter=Boolean(query||issuesOnly||categoryFilter||hasBaseFilter);
                    resetViewBtn.classList.toggle('show',hasViewFilter);
                    resetViewBtn.setAttribute('aria-hidden',String(!hasViewFilter));
                }
            } finally { if(observer)observer.observe(tbody,{childList:true}); }
        }
        function scheduleApply(){ if(renderFrame)cancelAnimationFrame(renderFrame); renderFrame=requestAnimationFrame(()=>{renderFrame=0;applyAttendanceView();}); }
        function setIssuesOnly(next){issuesOnly=Boolean(next);savePrefs();scheduleApply();}
        function resetAttendanceView(){
            input.value='';
            closeAttendanceSearchSuggestions();
            issuesOnly=false;
            categoryFilter='';
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
                input.value='';
                closeAttendanceSearchSuggestions();
                savePrefs();
                scheduleApply();
                input.blur();
                toggle.focus();
            }
        });
        if(searchClear)searchClear.addEventListener('click',e=>{
            e.stopPropagation();
            input.value='';
            closeAttendanceSearchSuggestions();
            savePrefs();
            scheduleApply();
            input.focus();
        });
        if(searchSuggestions) searchSuggestions.addEventListener('click', e => {
            const option = e.target.closest('.attendance-search-suggestion');
            if (!option || !searchSuggestions.contains(option)) return;
            input.value = option.dataset.agentName || '';
            // Dispatch through the real input path so both the attendance filter
            // and the workspace preference layer observe the selected Agent.
            input.dispatchEvent(new Event('input', { bubbles:true }));
            closeAttendanceSearchSuggestions();
            input.focus();
        });
        document.addEventListener('pointerdown', e => {
            if (searchSuggestions && searchSuggestions.classList.contains('is-open') && !search.contains(e.target)) {
                closeAttendanceSearchSuggestions();
            }
        }, true);
        if(issuesToggle)issuesToggle.addEventListener('click',()=>setIssuesOnly(!issuesOnly));
        if(attentionChips)attentionChips.addEventListener('click',e=>{const btn=e.target.closest('.attendance-attention-chip');if(!btn)return;categoryFilter=categoryFilter===btn.dataset.category?'':btn.dataset.category;savePrefs();scheduleApply();});
        if(resetViewBtn)resetViewBtn.addEventListener('click',resetAttendanceView);
        tbody.addEventListener('click',e=>{const btn=e.target.closest('.attendance-date-toggle');if(!btn||!tbody.contains(btn))return;const key=btn.dataset.dateKey||'';if(!key)return;if(isCollapsed(key)){collapsedDates.delete(key);expandedDates.add(key);}else{expandedDates.delete(key);collapsedDates.add(key);}savePrefs();scheduleApply();});
        if(clearFilters)clearFilters.addEventListener('click',()=>{input.value='';closeAttendanceSearchSuggestions();issuesOnly=false;categoryFilter='';collapsedDates.clear();expandedDates.clear();setSearchOpen(false);savePrefs();scheduleApply();});
        if(integrityBtn)integrityBtn.addEventListener('click',renderIntegrityCheck);
        if(integrityClose)integrityClose.addEventListener('click',()=>integrityOverlay.classList.remove('open'));
        if(integrityOverlay)integrityOverlay.addEventListener('click',e=>{if(e.target===integrityOverlay)integrityOverlay.classList.remove('open');});
        const empSelect=document.getElementById('empSelect'); if(empSelect)empSelect.addEventListener('change',scheduleApply);
        ['filterDate','filterDateTo','payPeriodPreset'].forEach(id=>{const el=document.getElementById(id);if(el)el.addEventListener('change',()=>{if(!restoringDateFilters)savePrefs();});});

        window.trinoAttendanceDashboard={
            getState:()=>({query:input.value.trim(),issuesOnly,category:categoryFilter}),
            refresh:scheduleApply,
            reset:resetAttendanceView
        };

        document.addEventListener('DOMContentLoaded',function(){
            setTimeout(function(){
                const from=document.getElementById('filterDate'),to=document.getElementById('filterDateTo'),preset=document.getElementById('payPeriodPreset');
                let restored=false; restoringDateFilters=true;
                if(from&&loadedPrefs.filterDate){from.value=loadedPrefs.filterDate;restored=true;}
                if(to&&loadedPrefs.filterDateTo){to.value=loadedPrefs.filterDateTo;restored=true;}
                if(preset&&loadedPrefs.payPeriodPreset){preset.value=loadedPrefs.payPeriodPreset;}
                restoringDateFilters=false;
                if(restored&&from)from.dispatchEvent(new Event('change',{bubbles:true}));
                scheduleApply();
            },0);
        });
        observer=new MutationObserver(scheduleApply); observer.observe(tbody,{childList:true});
        applyAttendanceView();
    }());
    
