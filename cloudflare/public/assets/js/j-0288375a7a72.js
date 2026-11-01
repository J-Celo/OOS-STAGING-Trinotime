    (function () {
        'use strict';
        const q = (s, root=document) => root.querySelector(s);
        const qa = (s, root=document) => Array.from(root.querySelectorAll(s));
        const state = {
            dataLoaded: false,
            lastInteraction: null,
            activeColumnKey: '',
            actionTimers: new Map(),
            coachingWasBusy: false
        };

        function bridge() { return window.trinoAttendanceBridge || null; }
        function safeJsonGet(key, fallback) {
            try { const raw=localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch (_) { return fallback; }
        }
        function safeJsonSet(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {} }
        function manilaDateKey() {
            try { return new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Manila',year:'numeric',month:'numeric',day:'numeric'}).format(new Date()); }
            catch (_) { const d=new Date(); return (d.getMonth()+1)+'/'+d.getDate()+'/'+d.getFullYear(); }
        }

        function initInteractionTracking() {
            document.addEventListener('pointerdown', e => {
                const target=e.target && e.target.closest ? e.target.closest('button,a,input,select,textarea,[tabindex]') : null;
                if (target) state.lastInteraction=target;
            }, true);
            document.addEventListener('focusin', e => {
                if (e.target && !e.target.closest('.modal-overlay,.settings-overlay,.announce-overlay,.agent-login-overlay')) state.lastInteraction=e.target;
            }, true);
        }

        function initStatusLegend() {
            const head=q('.attendance-summary-head');
            if (!head || q('#ttStatusLegend')) return;
            const legend=document.createElement('div');
            legend.id='ttStatusLegend'; legend.className='tt-status-legend'; legend.setAttribute('aria-label','Attendance status color legend');
            legend.innerHTML = '<span class="tt-status-legend-label">Status colors</span>'+
                '<span class="tt-status-legend-chip is-active"><i class="tt-status-legend-dot"></i>Active</span>'+
                '<span class="tt-status-legend-chip is-break"><i class="tt-status-legend-dot"></i>On Break</span>'+
                '<span class="tt-status-legend-chip is-complete"><i class="tt-status-legend-dot"></i>Completed</span>'+
                '<span class="tt-status-legend-chip is-not-in"><i class="tt-status-legend-dot"></i>Not Yet In</span>'+
                '<span class="tt-status-legend-chip is-review"><i class="tt-status-legend-dot"></i>Needs Review</span>';
            head.insertAdjacentElement('afterend', legend);
        }

        function initTodaySummaryFilters() {
            const summary=q('#attendanceTodaySummary');if(!summary)return;
            const mapping=[['.is-working','working'],['.is-break','break'],['.is-complete','complete'],['.is-not-in','not-in'],['.is-issues','issues']];
            mapping.forEach(([selector,key])=>{const card=q('.attendance-summary-card'+selector,summary);if(!card)return;card.dataset.attendanceMetric=key;card.setAttribute('role','button');card.setAttribute('tabindex','0');card.setAttribute('aria-pressed','false');card.title='Filter attendance table: '+card.querySelector('span')?.textContent;});
            const activate=target=>{const card=target&&target.closest?target.closest('.attendance-summary-card[data-attendance-metric]'):null;if(!card||!summary.contains(card))return;const dashboard=window.trinoAttendanceDashboard;if(dashboard&&typeof dashboard.setMetric==='function')dashboard.setMetric(card.dataset.attendanceMetric||'');};
            summary.addEventListener('click',e=>activate(e.target));
            summary.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.closest('.attendance-summary-card[data-attendance-metric]')){e.preventDefault();activate(e.target);}});
        }

        const OPTIONAL_COLUMNS = [
            {key:'start-break', label:'Start Break', index:5, width:130},
            {key:'end-break', label:'End Break', index:6, width:130},
            {key:'night-diff', label:'Night Diff', index:9, width:140},
            {key:'break-summary', label:'Break Summary', index:10, width:160}
        ];
        function columnStorageKey() {
            const b=bridge();
            let role='viewer', identity='default';
            if (b) {
                if (typeof b.isAdmin==='function' && b.isAdmin()) role='admin';
                else if (typeof b.isTeamLeader==='function' && b.isTeamLeader()) role='teamleader';
                else role='agent';
                if (role==='agent' && typeof b.getCurrentEmployee==='function' && b.getCurrentEmployee()) identity=b.getCurrentEmployee();
                else if (typeof b.getScopeLabel==='function' && b.getScopeLabel()) identity=b.getScopeLabel();
            }
            return 'trinotime:attendance-columns:v42:'+role+':'+String(identity).toLowerCase().replace(/[^a-z0-9_-]+/g,'-');
        }
        function readColumnPrefs() {
            const key=columnStorageKey(); state.activeColumnKey=key;
            const saved=safeJsonGet(key,{}); const result={};
            OPTIONAL_COLUMNS.forEach(c => result[c.key] = saved[c.key] !== false);
            return result;
        }
        function writeColumnPrefs(prefs) { safeJsonSet(columnStorageKey(), prefs); }
        let lastColumnLayoutSignature = '';
        function applyColumnPrefs(prefs) {
            const container=q('#desktopTableContainer'); if(!container) return;
            OPTIONAL_COLUMNS.forEach(c => { container.dataset['ttHide'+c.key.split('-').map(x=>x[0].toUpperCase()+x.slice(1)).join('')] = String(prefs[c.key]===false); });
            const coreNightDisabled=container.classList.contains('night-diff-disabled');
            let width=coreNightDisabled ? 1375 : 1515;
            OPTIONAL_COLUMNS.forEach(c => {
                if (prefs[c.key]===false && !(c.key==='night-diff' && coreNightDisabled)) width-=c.width;
            });
            container.style.setProperty('--tt-custom-table-min-width', Math.max(930,width)+'px');
            const nightInput=q('[data-tt-column="night-diff"]');
            if (nightInput) {
                nightInput.disabled=coreNightDisabled;
                const label=nightInput.closest('.tt-column-option');
                if(label) label.classList.toggle('is-disabled',coreNightDisabled);
            }
            const layoutSignature = JSON.stringify([coreNightDisabled, ...OPTIONAL_COLUMNS.map(c=>prefs[c.key]===false)]);
            if (layoutSignature !== lastColumnLayoutSignature) {
                lastColumnLayoutSignature = layoutSignature;
                window.dispatchEvent(new Event('resize'));
            }
        }
        function initColumnPicker() {
            const right=q('.attendance-quickbar-right'); if(!right || q('#ttColumnsControl')) return;
            const wrap=document.createElement('div'); wrap.className='tt-columns-control'; wrap.id='ttColumnsControl';
            wrap.innerHTML='<button class="tt-columns-btn" id="ttColumnsBtn" type="button" aria-haspopup="menu" aria-expanded="false">Columns</button><div class="tt-columns-menu" id="ttColumnsMenu" role="menu" hidden><div class="tt-columns-head"><strong>Attendance columns</strong><small>Agent Name and Actions always stay visible.</small></div>'+OPTIONAL_COLUMNS.map(c=>'<label class="tt-column-option"><input type="checkbox" data-tt-column="'+c.key+'" checked> <span>'+c.label+'</span></label>').join('')+'<button class="tt-columns-reset" id="ttColumnsReset" type="button">Reset optional columns</button></div>';
            const viewSummary=q('#attendanceViewSummary'); right.insertBefore(wrap, viewSummary || null);
            const btn=q('#ttColumnsBtn'), menu=q('#ttColumnsMenu',wrap);
            function syncFromStorage(){ const prefs=readColumnPrefs(); OPTIONAL_COLUMNS.forEach(c=>{const input=q('[data-tt-column="'+c.key+'"]',wrap); if(input) input.checked=prefs[c.key]!==false;}); applyColumnPrefs(prefs); }
            function close(){menu.hidden=true;btn.setAttribute('aria-expanded','false');}
            btn.addEventListener('click',()=>{ if(menu.hidden){syncFromStorage();menu.hidden=false;btn.setAttribute('aria-expanded','true');const first=q('input:not(:disabled)',menu);if(first)first.focus();}else close(); });
            wrap.addEventListener('change',e=>{const input=e.target.closest('[data-tt-column]');if(!input)return;const prefs=readColumnPrefs();prefs[input.dataset.ttColumn]=input.checked;writeColumnPrefs(prefs);applyColumnPrefs(prefs);});
            q('#ttColumnsReset',wrap).addEventListener('click',()=>{const prefs={};OPTIONAL_COLUMNS.forEach(c=>prefs[c.key]=true);writeColumnPrefs(prefs);OPTIONAL_COLUMNS.forEach(c=>{const input=q('[data-tt-column="'+c.key+'"]',wrap);if(input)input.checked=true;});applyColumnPrefs(prefs);});
            document.addEventListener('pointerdown',e=>{if(!wrap.contains(e.target))close();},true);
            document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!menu.hidden){close();btn.focus();}});
            syncFromStorage();
            const container=q('#desktopTableContainer');
            if(container&&typeof MutationObserver==='function')new MutationObserver(()=>{if(columnStorageKey()!==state.activeColumnKey)syncFromStorage();else applyColumnPrefs(readColumnPrefs());}).observe(container,{attributes:true,attributeFilter:['class']});
            const selected=q('#selectedEmployeeDisplay');
            if(selected&&typeof MutationObserver==='function')new MutationObserver(()=>{if(columnStorageKey()!==state.activeColumnKey)syncFromStorage();}).observe(selected,{childList:true,subtree:true});
        }

        function extractCardName(card) {
            const node=q('.att-card-name',card); if(!node)return'';
            const clone=node.cloneNode(true); qa('.avatar,.voided-record-badge,.note-badge,.edit-name-btn',clone).forEach(n=>n.remove());
            return clone.textContent.trim();
        }
        function cardTimeValue(node) {
            if(!node)return''; const clone=node.cloneNode(true); qa('b,.time-flag',clone).forEach(n=>n.remove()); return clone.textContent.trim();
        }
        function cardDate(card) {
            const meta=q('.att-card-head > span',card); const m=meta && meta.textContent.match(/(\d{1,2}\/\d{1,2}\/\d{4})/); return m?m[1]:'';
        }
        function mobileCardStatus(card,name) {
            if(card.classList.contains('voided-record-card')) return {label:'Needs Review',cls:'is-review'};
            const times=qa('.att-card-time',card); const ti=cardTimeValue(times[0]), sb=cardTimeValue(times[1]), eb=cardTimeValue(times[2]), lo=cardTimeValue(times[3]);
            const set=v=>v&&v!=='—'&&!/^in progress$/i.test(v);
            if(set(lo))return{label:'Completed',cls:'is-complete'};
            if(set(sb)&&!set(eb))return{label:'On Break',cls:'is-break'};
            if(window.TrinoTimeCoaching&&typeof window.TrinoTimeCoaching.isActive==='function'&&window.TrinoTimeCoaching.isActive(name))return{label:'Coaching',cls:'is-coaching'};
            if(set(ti))return cardDate(card)&&cardDate(card)!==manilaDateKey()?{label:'Needs Review',cls:'is-review'}:{label:'Active',cls:'is-active'};
            return{label:'Not In',cls:'is-idle'};
        }
        function compactMobileCards() {
            const mobile=q('#mobileCards'); if(!mobile)return;
            qa('.att-card:not([data-tt-compact-ready])',mobile).forEach(card=>{
                card.dataset.ttCompactReady='true';
                const name=extractCardName(card), status=mobileCardStatus(card,name);
                const times=qa('.att-card-time',card), timeIn=cardTimeValue(times[0]) || '—';
                const summary=document.createElement('div'); summary.className='tt-mobile-card-summary';
                summary.innerHTML='<div class="tt-mobile-card-glance"><span class="tt-mobile-status '+status.cls+'">'+status.label+'</span><span class="tt-mobile-timein"><small>Time In</small><strong></strong></span></div><button class="tt-mobile-details-toggle" type="button" aria-expanded="false">View details</button>';
                const timeInStrong=q('.tt-mobile-timein strong',summary); if(timeInStrong) timeInStrong.textContent=timeIn;
                const details=document.createElement('div'); details.className='tt-mobile-card-details'; details.hidden=true;
                const movable=Array.from(card.children).filter(el=>el.classList.contains('att-card-times')||el.classList.contains('att-card-note')||el.classList.contains('attendance-actions-stack'));
                movable.forEach(el=>details.appendChild(el));
                const head=q('.att-card-head',card), meta=q('.att-card-meta',card);
                (head||card).insertAdjacentElement('afterend',summary);
                (meta||summary).insertAdjacentElement('afterend',details);
                const toggle=q('.tt-mobile-details-toggle',summary);
                toggle.addEventListener('click',()=>{const open=details.hidden;details.hidden=!open;toggle.setAttribute('aria-expanded',String(open));toggle.textContent=open?'Hide details':'View details';});
            });
        }
        function initMobileCompactCards() {
            const mobile=q('#mobileCards'); if(!mobile)return; compactMobileCards();
            if(typeof MutationObserver==='function')new MutationObserver(()=>compactMobileCards()).observe(mobile,{childList:true});
        }

        function initScrollContext() {
            const container=q('#desktopTableContainer'); if(!container||q('#ttScrollContext'))return;
            const bar=document.createElement('div');bar.id='ttScrollContext';bar.className='tt-scroll-context';bar.hidden=true;
            bar.innerHTML='<span class="tt-scroll-left">← Agent Name</span><span class="tt-scroll-middle">Time &amp; break details</span><span class="tt-scroll-right">Actions →</span>';
            container.insertAdjacentElement('beforebegin',bar);
            let frame=0;
            function update(){frame=0;const max=Math.max(0,container.scrollWidth-container.clientWidth),scrollable=max>2&&window.matchMedia('(min-width:681px)').matches;bar.hidden=!scrollable;if(!scrollable)return;const pct=max?Math.round((container.scrollLeft/max)*100):0;bar.classList.toggle('can-left',container.scrollLeft>2);bar.classList.toggle('can-right',container.scrollLeft<max-2);q('.tt-scroll-middle',bar).textContent='Time & break details · '+pct+'%';}
            function schedule(){if(!frame)frame=requestAnimationFrame(update);}
            container.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',schedule,{passive:true});
            if(typeof ResizeObserver==='function')new ResizeObserver(schedule).observe(container); schedule();
        }

        const ACTION_MAP = {'Time In':'btnTimeIn','Start Break':'btnStartBreak','End Break':'btnEndBreak','Time Out':'btnLogOut'};
        function setConflictingActionLock(activeBtn,locked){
            const card=q('#punchCard'); if(!card)return;
            qa('#attendanceTopActions .punch-btn').forEach(other=>{if(other===activeBtn)return;other.classList.toggle('tt-conflicting-locked',locked);if(locked)other.setAttribute('aria-disabled','true');else other.removeAttribute('aria-disabled');});
            card.dataset.ttActionSaving=locked?'true':'false';
        }
        function clearActionFeedback(btn){if(!btn)return;const wasSaving=btn.classList.contains('tt-action-saving');btn.classList.remove('tt-action-saving','tt-action-confirmed','tt-action-error');btn.removeAttribute('aria-busy');if(wasSaving)setConflictingActionLock(btn,false);const timer=state.actionTimers.get(btn);if(timer)clearTimeout(timer);state.actionTimers.delete(btn);}
        function flashAction(btn,cls,ms){if(!btn)return;clearActionFeedback(btn);btn.classList.add(cls);btn.setAttribute('aria-busy',cls==='tt-action-saving'?'true':'false');if(cls==='tt-action-saving')setConflictingActionLock(btn,true);if(ms){const t=setTimeout(()=>clearActionFeedback(btn),ms);state.actionTimers.set(btn,t);}}
        function initActionFeedback() {
            document.addEventListener('click',e=>{const blocked=e.target&&e.target.closest?e.target.closest('.punch-btn.tt-conflicting-locked'):null;if(!blocked)return;e.preventDefault();e.stopImmediatePropagation();},true);
            const save=q('#punchSaveState');
            if(save&&typeof MutationObserver==='function'){
                const sync=()=>{const text=String(save.textContent||'');const label=Object.keys(ACTION_MAP).find(k=>text.startsWith(k));if(!label)return;const btn=q('#'+ACTION_MAP[label]);if(save.classList.contains('is-saving'))flashAction(btn,'tt-action-saving');else if(save.classList.contains('is-saved')||save.classList.contains('is-pending'))flashAction(btn,'tt-action-confirmed',1250);else if(save.classList.contains('is-error'))flashAction(btn,'tt-action-error',1800);};
                new MutationObserver(sync).observe(save,{childList:true,characterData:true,subtree:true,attributes:true,attributeFilter:['class']});sync();
            }
            const label=q('#coachingActionLabel'), coaching=q('#btnCoaching');
            if(label&&coaching&&typeof MutationObserver==='function'){
                const sync=()=>{const text=String(label.textContent||'');const busy=/Starting Coaching|Stopping Coaching/i.test(text);if(busy){state.coachingWasBusy=true;flashAction(coaching,'tt-action-saving');}else if(state.coachingWasBusy){state.coachingWasBusy=false;flashAction(coaching,'tt-action-confirmed',1250);}};
                new MutationObserver(sync).observe(label,{childList:true,characterData:true,subtree:true});sync();
            }
        }

        function updateActionGuidance() {
            const card=q('#punchCard'), hint=q('#ttNextActionHint'); if(!card||!hint)return;
            const b=bridge(), name=b&&typeof b.getCurrentEmployee==='function'?b.getCurrentEmployee():'';
            const buttons=['btnTimeIn','btnStartBreak','btnEndBreak','btnLogOut','btnCoaching'].map(id=>q('#'+id)).filter(Boolean);
            buttons.forEach(btn=>btn.classList.remove('tt-action-option','tt-contextual-primary'));
            card.classList.remove('tt-shift-complete');
            if(!name){hint.textContent='Select your name to see the next available attendance action.';return;}
            const coachingActive=!!(window.TrinoTimeCoaching&&typeof window.TrinoTimeCoaching.isActive==='function'&&window.TrinoTimeCoaching.isActive(name));
            const status=b&&typeof b.getAgentQuickStatus==='function'?b.getAgentQuickStatus(name):null;
            if(coachingActive){const cb=q('#btnCoaching');if(cb&&!cb.disabled){cb.classList.add('tt-contextual-primary','tt-action-option');}hint.textContent='Coaching is active. Stop Coaching before starting a break or logging out.';return;}
            const enabled=buttons.filter(btn=>!btn.disabled); enabled.forEach(btn=>btn.classList.add('tt-action-option'));
            if(status&&status.state==='complete'){card.classList.add('tt-shift-complete');hint.textContent='Shift complete. Today’s punches are locked unless an authorized correction is needed.';return;}
            if(status&&status.state==='break'){const btn=q('#btnEndBreak');if(btn&&!btn.disabled)btn.classList.add('tt-contextual-primary');hint.textContent='You are on break. End Break is the recommended next action.';return;}
            if(status&&status.state==='active'){hint.textContent='You are active. Start Break, Coaching, or Time Out are available when appropriate.';return;}
            const ti=q('#btnTimeIn');if(ti&&!ti.disabled)ti.classList.add('tt-contextual-primary');
            hint.textContent=status&&status.state==='off'?'Time In is available when you are ready to start your scheduled work.':'Time In starts today’s attendance record.';
        }
        function initActionGuidance() {
            const grid=q('.punch-grid'); if(!grid)return;
            if(!q('#ttNextActionHint')){const hint=document.createElement('div');hint.id='ttNextActionHint';hint.className='tt-next-action-hint';hint.setAttribute('aria-live','polite');grid.insertAdjacentElement('beforebegin',hint);}
            const watch=['btnTimeIn','btnStartBreak','btnEndBreak','btnLogOut','btnCoaching','statusText','coachingActionLabel'].map(id=>q('#'+id)).filter(Boolean);
            if(typeof MutationObserver==='function'){const observer=new MutationObserver(()=>requestAnimationFrame(updateActionGuidance));watch.forEach(el=>observer.observe(el,{attributes:true,attributeFilter:['disabled'],childList:true,characterData:true,subtree:true}));}
            updateActionGuidance();
        }

        function rowName(row) {const cell=row.cells&&row.cells[2];if(!cell)return'';if(cell.dataset.attendanceName)return cell.dataset.attendanceName;const clone=cell.cloneNode(true);qa('.avatar,.attendance-row-tags,.note-badge,.edit-name-btn',clone).forEach(n=>n.remove());return clone.textContent.trim();}
        function attentionCounts() {
            const counts={missing:0,late:0,early:0,break:0,incomplete:0,total:0,coaching:0}; const b=bridge();
            if(!b)return counts;
            qa('#desktopTbody tr:not(.attendance-date-divider):not(.attendance-search-empty)').forEach(row=>{
                const date=row.cells&&row.cells[0]?row.cells[0].textContent.trim():'',name=rowName(row);if(!date||!name||typeof b.getRecord!=='function'||typeof b.analyzeRecord!=='function')return;
                const rec=b.getRecord(date,name);if(!rec)return;const a=b.analyzeRecord(rec);if(!a)return;if(a.hasIssue)counts.total++;['missing','late','early','break','incomplete'].forEach(k=>{if(a.categories&&a.categories.includes(k))counts[k]++;});
            });
            if(window.TrinoTimeCoaching&&typeof window.TrinoTimeCoaching.getVisibleSessions==='function'){
                const now=Date.now();counts.coaching=window.TrinoTimeCoaching.getVisibleSessions().filter(s=>{
                    const flags=Array.isArray(s.reviewFlags)?s.reviewFlags:[];const start=new Date(s.startTime||0).getTime();const active=String(s.status||'').toUpperCase()==='ACTIVE';return flags.length>0||(active&&Number.isFinite(start)&&now-start>4*60*60*1000);
                }).length;
            }
            return counts;
        }
        function clickAttendanceCategory(category) {
            const dashboard=window.trinoAttendanceDashboard;
            if(dashboard&&typeof dashboard.setCategory==='function'){dashboard.setCategory(category);const chip=qa('.attendance-attention-chip').find(btn=>btn.dataset.category===category);if(chip)chip.scrollIntoView({block:'nearest'});return;}
            const chip=qa('.attendance-attention-chip').find(btn=>btn.dataset.category===category);if(chip){chip.click();chip.scrollIntoView({block:'nearest'});}else{const issues=q('#attendanceIssuesToggle');if(issues)issues.click();}
        }
        function renderAttentionPanel() {
            const panel=q('#ttAttentionPanel'), b=bridge(); if(!panel||!b)return;
            const view=document.body?.dataset?.ttAdminView;
            if(document.hidden || (typeof b.isAdmin==='function' && b.isAdmin() && view && view!=='attendance'))return;
            const privileged=(typeof b.isAdmin==='function'&&b.isAdmin())||(typeof b.isTeamLeader==='function'&&b.isTeamLeader());panel.classList.toggle('show',privileged);if(!privileged)return;
            const counts=attentionCounts();const items=[
                ['missing','Missing Time Out',counts.missing],['break','Excess / Long Break',counts.break],['late','Late Time In',counts.late],['early','Early Time Out',counts.early],['incomplete','Incomplete Record',counts.incomplete],['coaching','Long / Review Coaching',counts.coaching],['total','Records to Review',counts.total]
            ];
            const grid=q('.tt-attention-grid',panel), subtitle=q('.tt-attention-sub',panel);const total=counts.total+counts.coaching;
            if(subtitle){subtitle.textContent=total?total+' unique record'+(total===1?'':'s')+' in the current table scope need a closer look. Issue categories can overlap.':'All scanned attendance and coaching records are clear.';subtitle.classList.toggle('tt-attention-clear',!total);}
            grid.innerHTML='';
            if(!total){grid.innerHTML='<div class="tt-attention-clear" style="font-size:11px;font-weight:750;padding:5px 1px;">✓ No attention items in the current scope.</div>';return;}
            const dashboardState=window.trinoAttendanceDashboard&&typeof window.trinoAttendanceDashboard.getState==='function'?window.trinoAttendanceDashboard.getState():{};
            items.filter(i=>i[2]>0).forEach(([key,label,count])=>{const active=(key==='total'?Boolean(dashboardState.issuesOnly):dashboardState.category===key);const btn=document.createElement('button');btn.type='button';btn.className='tt-attention-card'+(key==='coaching'?' is-coaching':'')+(key==='total'?' is-total':'')+(active?' is-filter-active':'');btn.dataset.ttAttention=key;btn.setAttribute('aria-pressed',String(active));btn.innerHTML='<span>'+label+'</span><strong>'+count+'</strong>';grid.appendChild(btn);});
        }
        let attentionRefreshHandle=0;
        function scheduleAttentionPanelRefresh() {
            if(attentionRefreshHandle)return;
            const run=()=>{attentionRefreshHandle=0;if(document.visibilityState!=='hidden')renderAttentionPanel();};
            if(typeof requestIdleCallback==='function')attentionRefreshHandle=requestIdleCallback(run,{timeout:280});
            else attentionRefreshHandle=setTimeout(run,48);
        }
        function initAttentionPanel() {
            const summary=q('#attendanceTodaySummary');if(!summary||q('#ttAttentionPanel'))return;
            const panel=document.createElement('section');panel.id='ttAttentionPanel';panel.className='tt-attention-panel';panel.setAttribute('aria-live','polite');panel.innerHTML='<div class="tt-attention-head"><div><strong>Attention Required</strong><span class="tt-attention-sub">Scanning current scope…</span></div></div><div class="tt-attention-grid"></div>';summary.insertAdjacentElement('afterend',panel);
            panel.addEventListener('click',e=>{const btn=e.target.closest('[data-tt-attention]');if(!btn)return;const key=btn.dataset.ttAttention;if(key==='coaching'){if(window.TrinoTimeCoaching&&typeof window.TrinoTimeCoaching.openReport==='function')window.TrinoTimeCoaching.openReport();}else if(key==='total'){const dashboard=window.trinoAttendanceDashboard;if(dashboard&&typeof dashboard.setIssuesOnly==='function'){const st=dashboard.getState?dashboard.getState():{};dashboard.setIssuesOnly(!st.issuesOnly);}else{const issues=q('#attendanceIssuesToggle');if(issues)issues.click();}}else clickAttendanceCategory(key);scheduleAttentionPanelRefresh();});
            const tbody=q('#desktopTbody');if(tbody&&typeof MutationObserver==='function')new MutationObserver(scheduleAttentionPanelRefresh).observe(tbody,{childList:true});
            document.addEventListener('trinotime:admin-view-change',scheduleAttentionPanelRefresh);
            setInterval(()=>{if(document.visibilityState!=='hidden'&&!document.documentElement.classList.contains('tt-is-scrolling'))scheduleAttentionPanelRefresh();},60000);renderAttentionPanel();
        }

        const OVERLAY_BASE_SELECTOR='.modal-overlay,.announce-overlay,.agent-login-overlay,.speedtest-overlay';
        const OVERLAY_SELECTOR='.modal-overlay.open,.announce-overlay.open,.agent-login-overlay.open,.speedtest-overlay.open';
        function focusables(root){return qa('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',root).filter(el=>{const s=getComputedStyle(el);return s.display!=='none'&&s.visibility!=='hidden'&&el.getClientRects().length;});}
        function isExplicitOverlayDismiss(el) {
            if(!el)return false;
            if(el.id==='agentLoginBackBtn'||el.classList.contains('agent-login-back'))return true;
            return /close/i.test((el.getAttribute('aria-label')||'')+' '+(el.id||'')+' '+(el.textContent||''))||el.classList.contains('cancel');
        }
        function closeOverlay(overlay) {
            const own=q('.tt-modal-close',overlay);const candidates=focusables(overlay).filter(el=>el!==own);
            const close=candidates.find(isExplicitOverlayDismiss);
            if(close){close.click();return;}
            overlay.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));
            requestAnimationFrame(()=>{if(overlay.classList.contains('open'))overlay.classList.remove('open');});
        }
        function enhanceOpenOverlay(overlay) {
            if(!overlay||overlay.dataset.ttA11yOpen==='true')return;overlay.dataset.ttA11yOpen='true';
            const dialog=q('[role="dialog"],.modal-box,.settings-modal,.announce-modal,.agent-login-card,.speedtest-modal',overlay);if(!dialog)return;
            if(!dialog.hasAttribute('tabindex'))dialog.setAttribute('tabindex','-1');
            overlay._ttReturnFocus=(state.lastInteraction&&state.lastInteraction.isConnected&&!overlay.contains(state.lastInteraction))?state.lastInteraction:document.activeElement;
            const hasExplicit=focusables(dialog).some(isExplicitOverlayDismiss);
            if(!hasExplicit&&!q('.tt-modal-close',dialog)){
                const close=document.createElement('button');close.type='button';close.className='tt-modal-close';close.textContent='Close';close.setAttribute('aria-label','Close dialog');close.addEventListener('click',()=>closeOverlay(overlay));dialog.insertBefore(close,dialog.firstChild);
            }


            requestAnimationFrame(()=>{if(!overlay.classList.contains('open')||overlay.contains(document.activeElement))return;const target=q('[autofocus]',dialog)||focusables(dialog)[0]||dialog;try{target.focus({preventScroll:true});}catch(_){target.focus();}});
        }
        function cleanupClosedOverlay(overlay) {
            if(!overlay||overlay.dataset.ttA11yOpen!=='true'||overlay.classList.contains('open'))return;
            overlay.dataset.ttA11yOpen='false';const back=overlay._ttReturnFocus;overlay._ttReturnFocus=null;if(back&&back.isConnected&&typeof back.focus==='function')requestAnimationFrame(()=>{try{back.focus({preventScroll:true});}catch(_){back.focus();}});
        }
        function cleanupClosedOverlays() { qa('[data-tt-a11y-open="true"]').forEach(cleanupClosedOverlay); }
        function topOpenOverlay(){const list=qa(OVERLAY_SELECTOR);return list.length?list[list.length-1]:null;}
        function initModalAccessibility() {
            document.addEventListener('keydown',e=>{const overlay=topOpenOverlay();if(!overlay)return;if(e.key==='Escape'){e.preventDefault();closeOverlay(overlay);return;}if(e.key!=='Tab')return;const dialog=q('[role="dialog"],.modal-box,.settings-modal,.announce-modal,.agent-login-card,.speedtest-modal',overlay)||overlay;const items=focusables(dialog);if(!items.length){e.preventDefault();dialog.focus();return;}const first=items[0],last=items[items.length-1];if(!overlay.contains(document.activeElement)){e.preventDefault();(e.shiftKey?last:first).focus();return;}if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}},true);
            if(typeof MutationObserver==='function'){
                const attributeObserver=new MutationObserver(records=>{records.forEach(record=>{const overlay=record.target;if(!overlay||!overlay.matches||!overlay.matches(OVERLAY_BASE_SELECTOR))return;if(overlay.classList.contains('open'))enhanceOpenOverlay(overlay);else cleanupClosedOverlay(overlay);});});
                const watchOverlay=overlay=>{if(!overlay||overlay.dataset.ttA11yObserved==='true')return;overlay.dataset.ttA11yObserved='true';attributeObserver.observe(overlay,{attributes:true,attributeFilter:['class','style']});if(overlay.classList.contains('open'))enhanceOpenOverlay(overlay);};
                qa(OVERLAY_BASE_SELECTOR).forEach(watchOverlay);
                new MutationObserver(records=>{records.forEach(record=>record.addedNodes.forEach(node=>{if(!node||node.nodeType!==1)return;if(node.matches&&node.matches(OVERLAY_BASE_SELECTOR))watchOverlay(node);if(node.querySelectorAll)qa(OVERLAY_BASE_SELECTOR,node).forEach(watchOverlay);}));}).observe(document.body,{subtree:true,childList:true});
            } else qa(OVERLAY_SELECTOR).forEach(enhanceOpenOverlay);
        }

        function initLoadingState() {
            const root=q('#appRoot'), card=q('#punchCard'), status=q('#statusLine');if(!root||!card||!status)return;
            const loading=document.createElement('div');loading.className='tt-workspace-loading';loading.setAttribute('role','status');loading.setAttribute('aria-live','polite');loading.innerHTML='<span class="tt-loading-bars" aria-hidden="true"><i></i><i></i><i></i></span><span><strong>Loading attendance workspace…</strong><br>Restoring local data and checking live sync.</span>';status.insertAdjacentElement('afterend',loading);
            function appVisible(){const s=getComputedStyle(root);return s.visibility!=='hidden'&&s.display!=='none';}
            function update(){
                const snapshot=window.TrinoTimeCore?.attendancePresentation?.snapshot({limit:1});
                // Hydration, including an empty authorized dataset, determines readiness.
                // Do not keep a signed-out/new identity marked loaded from a prior session.
                state.dataLoaded=!!snapshot?.ready;
                const value=state.dataLoaded?'false':appVisible()?'true':'false';
                if(root.dataset.ttDataLoading!==value)root.dataset.ttDataLoading=value;
            }
            window.addEventListener('trinotime:attendance-projection-change',update);
            const mobile=q('#mobileCards'),tbody=q('#desktopTbody');if(typeof MutationObserver==='function'){const obs=new MutationObserver(update);obs.observe(root,{attributes:true,attributeFilter:['style','class']});if(mobile)obs.observe(mobile,{childList:true});if(tbody)obs.observe(tbody,{childList:true});}
            let settingsCloseLoadingGuard=0;
            window.addEventListener('trinotime:settings-closed',()=>{
                if(settingsCloseLoadingGuard)clearTimeout(settingsCloseLoadingGuard);
                requestAnimationFrame(()=>{
                    update();
                    const signedIn=!!q('#sessionIndicator')?.dataset?.role;
                    if(!signedIn||root.dataset.ttDataLoading!=='true')return;
                    settingsCloseLoadingGuard=setTimeout(()=>{
                        settingsCloseLoadingGuard=0; update();
                        if(root.dataset.ttDataLoading==='true')root.dataset.ttDataLoading='false';
                    },2500);
                });
            });
            update();
        }

        function initRootHorizontalContainment() {



            let correcting=false;
            const clamp=()=>{
                if(correcting||Math.abs(window.scrollX)<1)return;
                correcting=true;
                const scroller=document.scrollingElement||document.documentElement;
                if(scroller)scroller.scrollLeft=0;
                document.documentElement.scrollLeft=0;
                document.body.scrollLeft=0;
                requestAnimationFrame(()=>{correcting=false;});
            };
            try{document.documentElement.style.setProperty('overflow-x','clip','important');}catch(_){}
            window.addEventListener('scroll',clamp,{passive:true});
            window.addEventListener('resize',clamp,{passive:true});
            clamp();
        }

        function exposeResponsiveQA() {
            window.TrinoTimeResponsiveQA=Object.freeze({
                version:'42', breakpoints:[320,375,430,768,1024,1280,1440,1920],
                snapshot:function(){
                    const viewport=document.documentElement.clientWidth;const rootOverflow=getComputedStyle(document.documentElement).overflowX;const rawPageOverflow=Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-viewport;const pageOverflow=(rootOverflow==='clip'||rootOverflow==='hidden')?0:rawPageOverflow;
                    const touch=qa('button:not([disabled]),a[href],input:not([type="hidden"]),select,textarea').map(el=>{const r=el.getBoundingClientRect();return{tag:el.tagName,id:el.id||'',w:Math.round(r.width),h:Math.round(r.height),visible:r.width>0&&r.height>0};}).filter(x=>x.visible);
                    return{viewport,pageOverflow:Math.max(0,Math.round(pageOverflow)),undersizedTouchTargets:touch.filter(x=>x.h<44),attendanceScroll:q('#desktopTableContainer')?{clientWidth:q('#desktopTableContainer').clientWidth,scrollWidth:q('#desktopTableContainer').scrollWidth,scrollLeft:q('#desktopTableContainer').scrollLeft}:null,openModals:qa(OVERLAY_SELECTOR).length};
                }
            });
        }

        function init() {
            initInteractionTracking(); initStatusLegend(); initTodaySummaryFilters(); initColumnPicker(); initMobileCompactCards(); initScrollContext(); initActionFeedback(); initActionGuidance(); initAttentionPanel(); initModalAccessibility(); initLoadingState(); initRootHorizontalContainment(); exposeResponsiveQA();
        }
        if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
    })();

