(() => {
  'use strict';
    if (window.TrinoTimeAdminCommandCenter) return;

  const VERSION = '1.1.94';
  const STORAGE = 'trinotime-admin-command-state-v2';
  const LEGACY_STORAGE = 'trinotime-admin-command-view';
  const views = new Set(['overview','attendance','workforce','schedule','review','reports']);
  const $ = (s,r=document) => r.querySelector(s);
  const $$ = (s,r=document) => Array.from(r.querySelectorAll(s));
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

  let built = false;
  let metricTimer = 0;
  let saveTimer = 0;
  let noticeTimer = 0;
  let surfaceObserver = null;
  let inspectorObserver = null;
  let restoreMarker = null;
  let embeddedNode = null;
  let embeddedDisplay = '';
  let scheduleRenderQueued = false;
  let restoring = false;
  let workspaceReady = false;
  let activation = 0;

  const nowPht = () => {
    const parts = new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Manila',year:'numeric',month:'numeric',day:'numeric'}).formatToParts(new Date());
    const out = {};
    parts.forEach(part => { if (['year','month','day'].includes(part.type)) out[part.type] = Number(part.value); });
    return out;
  };
  const pht = nowPht();
  const defaultState = () => ({
    version: 2,
    view: 'overview',
    selectedAgent: '',
    attendance: { filterEmp:'', payPeriodPreset:'', filterDate:'', filterDateTo:'', search:'', issuesOnly:false },
    workforce: { lastAction:'roster' },
    reports: { lastAction:'history' },
    schedule: { year:pht.year, month:pht.month - 1 },
    inspector: { tab:'profile' }
  });
  let state = defaultState();

  function loadState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE) || 'null');
      if (parsed && typeof parsed === 'object') {
        state = {
          ...defaultState(),
          ...parsed,
          attendance: { ...defaultState().attendance, ...(parsed.attendance || {}) },
          workforce: { ...defaultState().workforce, ...(parsed.workforce || {}) },
          reports: { ...defaultState().reports, ...(parsed.reports || {}) },
          schedule: { ...defaultState().schedule, ...(parsed.schedule || {}) },
          inspector: { ...defaultState().inspector, ...(parsed.inspector || {}) }
        };
      } else {
        const legacy = localStorage.getItem(LEGACY_STORAGE);
        if (legacy && views.has(legacy)) state.view = legacy;
      }
    } catch (_) {}
    if (!views.has(state.view)) state.view = 'overview';
  }

  function persistSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(STORAGE, JSON.stringify(state)); } catch (_) {}
    }, 80);
  }

  const isAdmin = () => document.body?.dataset?.trinoRole === 'admin';
  function appVisible() {
    const app = $('#appRoot');
    return !!(app && getComputedStyle(app).display !== 'none' && !app.hidden);
  }
  function rawSelectedAgent() {
    return String($('#empSelect')?.value || '').trim();
  }
  function selectedAgent() {
    return rawSelectedAgent() || String($('#empSearch')?.value || '').trim() || '';
  }
  function selectedPod() {
    const select = $('#empSelect');
    const option = select && select.selectedIndex >= 0 ? select.options[select.selectedIndex] : null;
    const sources = [option?.textContent, $('#selectedEmployeeDisplay small')?.textContent, $('#clockShiftPrimary')?.textContent, $('#executiveStatusScope')?.textContent];
    for (const text of sources) {
      const match = String(text || '').match(/\b(POD\s*\d+|ONBOARDING|TESCO|KROGER|ALBERTSONS|CWH)\b/i);
      if (match) return match[1].replace(/\s+/g,' ').toUpperCase();
    }
    return '';
  }
  function click(sel) {
    const el = $(sel);
    if (!el || el.disabled) return false;
    el.click();
    return true;
  }
  function showNotice(message) {
    let box = $('#ttAdminCommandNotice');
    if (!box) return;
    box.textContent = String(message || '');
    box.classList.add('is-showing');
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => box.classList.remove('is-showing'), 3000);
  }

  function reviewTotal() {
    return ['adminReviewAttendanceCount','adminReviewOvertimeCount','adminReviewLeaveCount','adminReviewSecurityCount','adminReviewNetworkCount','adminReviewCoachingCount','adminReviewIntegrityCount','adminReviewSyncCount']
      .reduce((n,id) => n + (parseInt($('#'+id)?.textContent || '0',10) || 0),0);
  }
  function workforceCount() {
    const s = $('#empSelect');
    if (s) return Math.max(0, Array.from(s.options || []).filter(o => o.value).length);
    return $$('#agentSecurityTbody tr').filter(r => !r.classList.contains('agent-security-empty')).length;
  }

  function build() {
    if (built || !$('#mainContent') || !$('#podTabsOuter')) return;
    built = true;
    loadState();

    const bar = document.createElement('section');
    bar.id = 'ttAdminCommandBar';
    bar.setAttribute('aria-label','Admin command center');
    bar.innerHTML = `
      <div class="tt-admin-command-tabs" role="tablist" aria-label="Admin workspace views">
        <button class="tt-admin-command-tab" data-admin-view="overview" role="tab">Overview</button>
        <button class="tt-admin-command-tab" data-admin-view="attendance" role="tab">Attendance</button>
        <button class="tt-admin-command-tab" data-admin-view="workforce" role="tab">Workforce</button>
        <button class="tt-admin-command-tab" data-admin-view="schedule" role="tab">Schedule</button>
        <button class="tt-admin-command-tab" data-admin-view="review" role="tab">Review Center</button>
        <button class="tt-admin-command-tab" data-admin-view="reports" role="tab">Reports</button>
      </div>
      <button class="tt-admin-command-action" data-admin-action="inspector" type="button">Agent Inspector</button>
      <button class="tt-admin-command-action" data-admin-action="tools" type="button">Admin Tools</button>
      <div class="tt-admin-context"><span>Selected</span><strong id="ttAdminSelectedAgent">No agent selected</strong></div>`;
    $('#podTabsOuter').insertAdjacentElement('afterend',bar);

    const main = $('#mainContent');
    const overview = document.createElement('section');
    overview.id = 'ttAdminOverviewPanel';
    overview.className = 'tt-admin-hub';
    overview.innerHTML = `
      <div class="tt-admin-hub-head"><div><span class="tt-admin-hub-kicker">Admin Command Center</span><h2>Operations Overview</h2><p>Live essentials first. Detailed work stays inside its own workspace.</p></div><button class="tt-admin-inline-inspector" data-admin-action="inspector" type="button">Inspect selected Agent</button></div>
      <div class="tt-admin-snapshot-grid">
        <article class="tt-admin-snapshot-card"><span>Working now</span><strong id="ttAdminMetricWorking">0</strong><span id="ttAdminMetricBreak">0 on break</span><button data-admin-jump="attendance">Open Attendance →</button></article>
        <article class="tt-admin-snapshot-card"><span>Needs review</span><strong id="ttAdminMetricReview">0</strong><span id="ttAdminMetricHealth">System health loading</span><button data-admin-jump="review">Open Review Center →</button></article>
        <article class="tt-admin-snapshot-card"><span>Workforce</span><strong id="ttAdminMetricWorkforce">0</strong><span>available Agent profiles</span><button data-admin-jump="workforce">Open Workforce →</button></article>
        <article class="tt-admin-snapshot-card"><span>Selected Agent</span><strong id="ttAdminMetricAgent" class="tt-admin-agent-metric">None</strong><span id="ttAdminMetricAgentMeta">Select an Agent once; context follows you.</span><button data-admin-jump="schedule">Open Schedule →</button></article>
      </div>
      <div class="tt-admin-quick-row"><button data-admin-jump="attendance">Attendance</button><button data-admin-jump="review">Review requests</button><button data-admin-jump="workforce">Find Agent</button><button data-admin-jump="schedule">Schedule</button><button data-admin-action="message">Workspace Messaging</button><button data-admin-action="tools">More admin tools</button></div>`;
    main.insertBefore(overview,main.firstChild);

    const wf = document.createElement('section');
    wf.id = 'ttAdminWorkforceHub';
    wf.className = 'tt-admin-hub';
    wf.innerHTML = `
      <div class="tt-admin-hub-head"><div><span class="tt-admin-hub-kicker">Workforce</span><h2>People & Access</h2><p>Roster, identity and assignment work without hunting through the page.</p></div><button class="tt-admin-inline-inspector" data-admin-action="inspector" type="button">Open Agent Inspector</button></div>
      <div class="tt-admin-hub-grid">
        <button data-admin-workforce="roster"><strong>Agent Roster</strong><small>Search and review current workforce members.</small></button>
        <button data-admin-action="inspector"><strong>Agent Inspector</strong><small>Profile, attendance, schedule, leave, access and history in one drawer.</small></button>
        <button data-admin-workforce="security"><strong>Account Security</strong><small>Password state, lockouts, last login and identity migration.</small></button>
        <button data-admin-workforce="pod"><strong>POD & Role Management</strong><small>Assignments, Team Leaders, backup coverage and POD structure.</small></button>
        <button data-admin-workforce="move"><strong>Move Agents</strong><small>Open the controlled transfer workflow.</small></button>
        <button data-admin-workforce="backup"><strong>Backup TL</strong><small>Manage temporary coverage and handoff.</small></button>
        <button data-admin-action="message"><strong>Message Workforce</strong><small>Open Workspace Messaging without leaving Admin.</small></button>
      </div>`;
    main.insertBefore(wf,$('.log-section'));

    const schedule = document.createElement('section');
    schedule.id = 'ttAdminScheduleHub';
    schedule.className = 'tt-admin-hub tt-admin-schedule-hub';
    schedule.innerHTML = `
      <div class="tt-admin-hub-head"><div><span class="tt-admin-hub-kicker">Schedule</span><h2>Selected-Agent Schedule</h2><p id="ttAdminScheduleContext">Select an Agent to view days off and approved leave.</p></div><div class="tt-admin-hub-actions"><button data-admin-schedule-action="recurring" type="button">Manage recurring schedule</button><button data-admin-schedule-action="exceptions" type="button">Schedule exceptions</button></div></div>
      <div class="tt-admin-schedule-layout">
        <section class="tt-admin-schedule-calendar" aria-label="Selected Agent monthly schedule">
          <div class="tt-admin-schedule-monthbar"><button type="button" data-admin-schedule-nav="prev" aria-label="Previous month">‹</button><strong id="ttAdminScheduleMonth">Month</strong><button type="button" data-admin-schedule-nav="next" aria-label="Next month">›</button><button type="button" data-admin-schedule-nav="today">Today</button></div>
          <div class="tt-admin-schedule-weekdays" aria-hidden="true"><span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span></div>
          <div class="tt-admin-schedule-grid" id="ttAdminScheduleGrid" role="grid"></div>
          <div class="tt-admin-schedule-legend"><span class="is-work"><i></i>Workday</span><span class="is-dayoff"><i></i>Day Off</span><span class="is-leave"><i></i>Leave</span><span class="is-today"><i></i>Today</span></div>
        </section>
        <aside class="tt-admin-schedule-summary"><span>This month</span><div><strong id="ttAdminScheduleWorkCount">0</strong><small>workdays</small></div><div><strong id="ttAdminScheduleDayOffCount">0</strong><small>days off</small></div><div><strong id="ttAdminScheduleLeaveCount">0</strong><small>leave days</small></div><button data-admin-action="inspector" data-inspector-tab="schedule" type="button">Open in Agent Inspector</button></aside>
      </div>`;
    main.insertBefore(schedule,$('.log-section'));

    const reports = document.createElement('section');
    reports.id = 'ttAdminReportsHub';
    reports.className = 'tt-admin-hub';
    reports.innerHTML = `
      <div class="tt-admin-hub-head"><div><span class="tt-admin-hub-kicker">Reports</span><h2>Reports & History</h2><p>Choose the report first instead of scrolling through unrelated Admin tools.</p></div></div>
      <div class="tt-admin-hub-grid">
        <button data-admin-report="history"><strong>Attendance History</strong><small>Historical attendance and date filters.</small></button>
        <button data-admin-report="coaching-report"><strong>Coaching Report</strong><small>Coaching sessions and outcomes.</small></button>
        <button data-admin-report="notes"><strong>Daily Notes</strong><small>Operational note history.</small></button>
        <button data-admin-report="overtime"><strong>Overtime &amp; Payroll</strong><small>Overtime approvals, payroll safeguards, and weekly OT finalization.</small></button>
        <button data-admin-report="network"><strong>Speedtest History</strong><small>Network-readiness evidence.</small></button>
        <button data-admin-report="totals"><strong>Totals</strong><small>Summary and payroll-ready totals.</small></button>
        <button data-admin-report="audit"><strong>Audit</strong><small>Administrative audit trail.</small></button>
        <button data-admin-action="export" data-export-format="excel"><strong>Excel Export Center</strong><small>Open the Admin Export Center in Excel (.xlsx) mode.</small></button>
        <button data-admin-action="export" data-export-format="csv"><strong>CSV Export Center</strong><small>Open the Admin Export Center in CSV (.csv) mode.</small></button>
      </div>`;
    main.insertBefore(reports,$('.log-section'));

    const tools = document.createElement('div');
    tools.id = 'ttAdminToolsOverlay';
    tools.setAttribute('aria-hidden','true');
    tools.innerHTML = `<div class="tt-admin-tools-modal" role="dialog" aria-modal="true" aria-labelledby="ttAdminToolsTitle"><div class="tt-admin-tools-head"><h2 id="ttAdminToolsTitle">Admin Tools</h2><button class="tt-admin-tools-close" type="button" aria-label="Close Admin Tools">×</button></div><div class="tt-admin-tools-body"><div class="tt-admin-tools-grid" id="ttAdminToolsGrid"><button class="tt-admin-tool-tile" data-tool="settings"><strong>Settings</strong><span>Workspace configuration and system options.</span></button><button class="tt-admin-tool-tile" data-tool="premium"><strong>Premium & Workspace</strong><span>Premium access and workspace overrides.</span></button><button class="tt-admin-tool-tile" data-tool="security"><strong>Account Security</strong><span>Open Agent Account Security in a focused workspace.</span></button><button class="tt-admin-tool-tile" data-tool="pod"><strong>POD & Roles</strong><span>Manage POD structure and role assignments.</span></button><button class="tt-admin-tool-tile" data-tool="tlstatus"><strong>TL Status</strong><span>Live Team Leader status and attendance.</span></button><button class="tt-admin-tool-tile" data-tool="shifts"><strong>Shift Times</strong><span>Shift presets and timing configuration.</span></button><button class="tt-admin-tool-tile" data-tool="syncguardian"><strong>Sync Guardian</strong><span>Read-only Coverage and Confirmation sync health by agent.</span></button><button class="tt-admin-tool-tile" data-tool="diagnostics"><strong>Diagnostics</strong><span>Production diagnostics and live-system health.</span></button><button class="tt-admin-tool-tile" data-tool="notifications"><strong>Notifications</strong><span>Open the Notification Center.</span></button><button class="tt-admin-tool-tile" data-tool="help"><strong>Help & Guidelines</strong><span>Support Center and operational guides.</span></button></div><section id="ttAdminEmbeddedTool"><button class="tt-admin-embedded-back" type="button">← All tools</button><h3 class="tt-admin-embedded-title" id="ttAdminEmbeddedTitle">Admin Tool</h3><div class="tt-admin-embedded-host" id="ttAdminEmbeddedHost"></div></section></div></div>`;
    document.body.appendChild(tools);

    const inspector = document.createElement('div');
    inspector.id = 'ttAdminInspectorOverlay';
    inspector.setAttribute('aria-hidden','true');
    inspector.innerHTML = `<aside class="tt-admin-inspector" role="dialog" aria-modal="true" aria-labelledby="ttAdminInspectorTitle"><header class="tt-admin-inspector-head"><div><span>Agent Inspector</span><h2 id="ttAdminInspectorTitle">No Agent selected</h2><small id="ttAdminInspectorMeta">Select an Agent to inspect.</small></div><button class="tt-admin-inspector-close" type="button" aria-label="Close Agent Inspector">×</button></header><nav class="tt-admin-inspector-tabs" role="tablist" aria-label="Agent inspector sections"><button data-inspector-tab="profile" role="tab">Profile</button><button data-inspector-tab="attendance" role="tab">Attendance</button><button data-inspector-tab="schedule" role="tab">Schedule</button><button data-inspector-tab="leave" role="tab">Leave</button><button data-inspector-tab="access" role="tab">Access</button><button data-inspector-tab="history" role="tab">History</button></nav><div class="tt-admin-inspector-body" id="ttAdminInspectorBody"></div></aside>`;
    document.body.appendChild(inspector);

    const quick = document.createElement('div');
    quick.id = 'ttAdminQuickActions';
    quick.innerHTML = `<button class="tt-admin-quick-fab" type="button" aria-haspopup="menu" aria-expanded="false" aria-label="Admin Quick Actions">＋</button><div class="tt-admin-quick-menu" role="menu" hidden><div class="tt-admin-quick-menu-head"><strong>Quick Actions</strong><span id="ttAdminQuickAgent">No Agent selected</span></div><button role="menuitem" data-quick-action="find">⌕ <span>Find Agent</span></button><button role="menuitem" data-quick-action="inspect">◎ <span>Agent Inspector</span></button><button role="menuitem" data-quick-action="add">＋ <span>Add / Assign Agent</span></button><button role="menuitem" data-quick-action="correct">✎ <span>Attendance Correction</span></button><button role="menuitem" data-quick-action="schedule">▦ <span>Schedule</span></button><button role="menuitem" data-quick-action="review">! <span>Review Center</span></button><button role="menuitem" data-quick-action="message">◌ <span>Message Workforce</span></button><button role="menuitem" data-quick-action="export">⇩ <span>Export</span></button><button role="menuitem" data-quick-action="diagnostics">◇ <span>Diagnostics</span></button></div>`;
    bar.appendChild(quick);
    const quickMenu=quick.querySelector('.tt-admin-quick-menu');
    quickMenu.id='ttAdminQuickMenu';
    document.body.appendChild(quickMenu);
    quick.querySelector('.tt-admin-quick-fab').setAttribute('aria-controls','ttAdminQuickMenu');

    const notice = document.createElement('div');
    notice.id = 'ttAdminCommandNotice';
    notice.setAttribute('role','status');
    notice.setAttribute('aria-live','polite');
    document.body.appendChild(notice);

    bind();
    syncAvailability();
  }

  function captureState() {
    if (!isAdmin() || restoring) return;
    state.view = views.has(document.body.dataset.ttAdminView) ? document.body.dataset.ttAdminView : state.view;
    state.selectedAgent = rawSelectedAgent() || state.selectedAgent || '';
    const value = id => String($('#'+id)?.value || '');
    state.attendance = {
      ...state.attendance,
      filterEmp: value('filterEmp'),
      payPeriodPreset: value('payPeriodPreset'),
      filterDate: value('filterDate'),
      filterDateTo: value('filterDateTo'),
      search: value('attendanceSearchInput'),
      issuesOnly: $('#attendanceIssuesToggle')?.getAttribute('aria-pressed') === 'true'
    };
    persistSoon();
  }

  function restoreSelectedAgent() {
    const target = String(state.selectedAgent || '').trim();
    const select = $('#empSelect');
    if (!target || !select || !Array.from(select.options || []).some(option => option.value === target)) return false;
    if (select.value !== target) {
      select.value = target;
      if ($('#empSearch')) $('#empSearch').value = target;
      select.dispatchEvent(new Event('change',{bubbles:true}));
    } else if ($('#empSearch') && !$('#empSearch').value) {
      $('#empSearch').value = target;
    }
    return true;
  }

  function restoreAttendanceState() {
    if (restoring) return;
    restoring = true;
    try {
      const apply = (id, value, event='change') => {
        const el = $('#'+id);
        if (!el || value === undefined || value === null || el.value === String(value)) return;
        if (el.tagName === 'SELECT' && value && !Array.from(el.options || []).some(o => o.value === String(value))) return;
        el.value = String(value);
        el.dispatchEvent(new Event(event,{bubbles:true}));
      };
      apply('filterEmp', state.attendance.filterEmp);
      apply('payPeriodPreset', state.attendance.payPeriodPreset);
      apply('filterDate', state.attendance.filterDate);
      apply('filterDateTo', state.attendance.filterDateTo);
      apply('attendanceSearchInput', state.attendance.search, 'input');
      const issues = $('#attendanceIssuesToggle');
      const wantIssues = !!state.attendance.issuesOnly;
      if (issues && (issues.getAttribute('aria-pressed') === 'true') !== wantIssues) issues.click();
    } finally { restoring = false; }
  }

  function updateMetrics() {
    if (!isAdmin() || document.hidden) return;
    if(document.documentElement.classList.contains('tt-is-scrolling')){scheduleMetrics();return;}
    const set = (id,val) => { const e=$('#'+id); if (e && e.textContent !== String(val)) e.textContent=String(val); };
    const name = selectedAgent();
    set('ttAdminSelectedAgent', name || 'No agent selected');
    set('ttAdminMetricAgent', name || 'None');
    set('ttAdminMetricAgentMeta', name ? `${selectedPod() || 'POD syncing'} · context follows Admin tabs` : 'Select an Agent once; context follows you.');
    set('ttAdminQuickAgent', name || 'No Agent selected');
    const working = $('#executiveStatusActive')?.textContent || $('#attendanceSummaryWorking')?.textContent || '0';
    const onBreak = $('#executiveStatusBreak')?.textContent || $('#attendanceSummaryBreak')?.textContent || '0';
    set('ttAdminMetricWorking', working);
    set('ttAdminMetricBreak', `${onBreak} on break`);
    set('ttAdminMetricReview', reviewTotal());
    set('ttAdminMetricWorkforce', workforceCount());
    set('ttAdminMetricHealth', $('#systemHealthStatus')?.textContent?.trim() || 'Open Review Center for live health');
    if ($('#ttAdminInspectorOverlay')?.classList.contains('is-open')) renderInspector();
    if (document.body.dataset.ttAdminView === 'schedule') queueScheduleRender();
  }
  function scheduleMetrics() { clearTimeout(metricTimer); metricTimer=setTimeout(updateMetrics,160); }

  function activateSurfaceObserver(view) {
    if (surfaceObserver) { surfaceObserver.disconnect(); surfaceObserver = null; }
    const targets = [];
    if (view === 'overview') targets.push($('#executiveStatusActive'),$('#executiveStatusBreak'),$('#adminReviewBadge'),$('#systemHealthStatus'),$('#empSelect'));
    if (view === 'attendance') targets.push($('#empSelect'),$('#statusText'),$('#attendanceTodaySummary'),$('#desktopTbody'));
    if (view === 'workforce') targets.push($('#empSelect'),$('#agentSecurityTbody'));
    if (view === 'schedule') targets.push($('#empSelect'),$('#selectedEmployeeDisplay'));
    if (view === 'review') targets.push($('#adminReviewBadge'),$('#adminReviewList'),$('#systemHealthStatus'));
    if (targets.filter(Boolean).length) {
      surfaceObserver = new MutationObserver(() => {
        scheduleMetrics();
        if (view === 'schedule') queueScheduleRender();
      });
      // Never observe generated calendar descendants: rendering would trigger itself.
      if (view === 'schedule' && $('#appRoot')) surfaceObserver.observe($('#appRoot'),{attributes:true,attributeFilter:['data-tt-data-loading']});
      targets.filter(Boolean).forEach(node => surfaceObserver.observe(node,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['value','style','hidden','data-state','data-render-key','data-tt-data-loading']}));
    }
  }

  function dispatchLifecycle(previous, view) {
    try {
      document.dispatchEvent(new CustomEvent('trinotime:admin-view-change',{detail:{previous,view,selectedAgent:rawSelectedAgent(),version:VERSION}}));
    } catch (_) {}
  }

  const viewScrollPositions = new Map();
  function captureViewScroll(view) {
    if (!views.has(view)) return;
    const host=document.scrollingElement||document.documentElement;
    viewScrollPositions.set(view,Math.max(0,Number(host?.scrollTop)||0));
  }
  function restoreViewScroll(view,navigation) {
    const saved=viewScrollPositions.get(view);
    if(saved===undefined)return false;
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      if(navigation!==navigationEpoch || !isAdmin() || document.body.dataset.ttAdminView!==view)return;
      const host=document.scrollingElement||document.documentElement;
      if (typeof window.__ttInstantScroll==='function')window.__ttInstantScroll(host,saved);
      else host.scrollTop=saved;
    }));
    return true;
  }
  function currentAdminNavigation(navigation,view) {
    return navigation===navigationEpoch && isAdmin() && appVisible() && document.body.dataset.ttAdminView===view;
  }
  let navigationEpoch = 0;
  function setView(view,{scroll=true,restore=true}={}) {
    if (!isAdmin() || !appVisible()) return;
    if (!views.has(view)) view='overview';
    const navigation = ++navigationEpoch;
    const currentNavigation = () => navigation === navigationEpoch && isAdmin() && appVisible() && document.body.dataset.ttAdminView === view;
    const previous = document.body.dataset.ttAdminView || '';
    if (previous && previous !== view) { captureState(); captureViewScroll(previous); }
    document.body.dataset.ttAdminView=view;
    state.view=view;
    $$('[data-admin-view]').forEach(button => {
      const active=button.dataset.adminView===view;
      button.classList.toggle('is-active',active);
      button.setAttribute('aria-selected',active?'true':'false');
      button.tabIndex=active?0:-1;
    });
    const sidebarMap={overview:'dashboard'};
    const side=sidebarMap[view];
    if(side)$$('#ttPremiumSidebar .tt-premium-nav-btn').forEach(b=>b.classList.toggle('is-active',b.dataset.ttNav===side));
    try { localStorage.setItem(LEGACY_STORAGE,view); } catch (_) {}
    persistSoon();
    activateSurfaceObserver(view);
    dispatchLifecycle(previous,view);
    if (view==='review') {
      $('#adminOpsCenter')?.removeAttribute('hidden');
      try { window.TrinoTimeCore?.adminOps?.refresh?.(); } catch (_) {}
    }
    if (view==='attendance') {
      setTimeout(() => {
        if (!currentNavigation()) return;
        restoreAttendanceState();
        const log = $('.log-tab[data-tab="log"]');
        if (log && getComputedStyle(log).display !== 'none') log.click();
      },40);
    }
    if (view==='schedule') queueScheduleRender();
    if (restore) setTimeout(() => { if (currentNavigation()) restoreSelectedAgent(); },70);
    scheduleMetrics();
    if (scroll && !restoreViewScroll(view,navigation)) $('#ttAdminCommandBar')?.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
  }

  let dialogReturnFocus = null;
  function focusAdminDialog(overlay) {
    if (!overlay) return;
    dialogReturnFocus=document.activeElement;
    overlay.querySelector('button')?.focus({preventScroll:true});
    toggleQuick(false);
  }
  function restoreAdminFocus() {
    const target=dialogReturnFocus;
    dialogReturnFocus=null;
    if(target?.isConnected && target.getClientRects().length) target.focus({preventScroll:true});
    else if(isAdmin()) $('#ttAdminCommandBar [aria-selected="true"]')?.focus({preventScroll:true});
  }
  function trapAdminFocus(event,overlay) {
    const items=$$('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex]',overlay)
      .filter(node=>node.tabIndex>=0 && node.getClientRects().length);
    if(!items.length)return;
    const first=items[0],last=items[items.length-1],current=document.activeElement;
    if(!overlay.contains(current) || (event.shiftKey ? current===first : current===last)){
      event.preventDefault();(event.shiftKey?last:first).focus();
    }
  }
  function showOverlay() {
    if ($('#ttAdminInspectorOverlay')?.classList.contains('is-open')) closeInspector();
    const o=$('#ttAdminToolsOverlay'); if(!o)return;
    const wasOpen=o.classList.contains('is-open');
    o.classList.add('is-open'); o.setAttribute('aria-hidden','false');
    if(!wasOpen)focusAdminDialog(o);
    document.body.classList.add('tt-admin-modal-open');
  }
  function closeOverlay() {
    guardianRequest++;restoreEmbedded();
    const o=$('#ttAdminToolsOverlay'); if(!o)return;
    const wasOpen=o.classList.contains('is-open');
    o.classList.remove('is-open'); o.setAttribute('aria-hidden','true');
    if(wasOpen)restoreAdminFocus();
    document.body.classList.remove('tt-admin-modal-open');
    signalSecuritySurface(false);
  }
  function restoreEmbedded() {
    if(embeddedNode&&restoreMarker?.parentNode){restoreMarker.parentNode.insertBefore(embeddedNode,restoreMarker);restoreMarker.remove();embeddedNode.classList.remove('tt-admin-embedded-node');embeddedNode.style.display=embeddedDisplay;embeddedNode=null;restoreMarker=null;embeddedDisplay='';}
    $('#ttSyncGuardianPanel')?.remove();
    $('.tt-admin-tools-modal')?.classList.remove('is-embedded');
  }
  function signalSecuritySurface(active) {
    if (document.body.classList.contains('tt-admin-security-surface-active') === !!active) return;
    document.body.classList.toggle('tt-admin-security-surface-active',!!active);
    try { document.dispatchEvent(new CustomEvent('trinotime:admin-security-visibility',{detail:{active:!!active,version:VERSION}})); } catch (_) {}
  }
  function embedSecurity() {
    const node=$('#agentSecurityPanel'),host=$('#ttAdminEmbeddedHost'); if(!node||!host)return;
    restoreEmbedded();
    restoreMarker=document.createComment('restore-agent-security'); node.parentNode.insertBefore(restoreMarker,node);
    embeddedNode=node; embeddedDisplay=node.style.display||''; host.appendChild(node); node.classList.add('tt-admin-embedded-node'); node.style.display='block';
    $('#ttAdminEmbeddedTitle').textContent='Agent Account Security'; $('.tt-admin-tools-modal')?.classList.add('is-embedded');
    signalSecuritySurface(true); showOverlay();
  }

  function openInspector(tab) {
    if ($('#ttAdminToolsOverlay')?.classList.contains('is-open')) closeOverlay();
    const name=rawSelectedAgent();
    if (!name) {
      setView('attendance');
      setTimeout(()=>$('#empSearch')?.focus(),100);
      showNotice('Select an Agent first, then open Agent Inspector.');
      return;
    }
    if (tab && ['profile','attendance','schedule','leave','access','history'].includes(tab)) state.inspector.tab=tab;
    const overlay=$('#ttAdminInspectorOverlay');
    const wasOpen=overlay?.classList.contains('is-open');
    overlay?.classList.add('is-open'); overlay?.setAttribute('aria-hidden','false');
    if(!wasOpen)focusAdminDialog(overlay);
    document.body.classList.add('tt-admin-modal-open');
    renderInspector();
    bindInspectorObserver();
    persistSoon();
  }
  function closeInspector() {
    const overlay=$('#ttAdminInspectorOverlay');
    const wasOpen=overlay?.classList.contains('is-open');
    overlay?.classList.remove('is-open'); overlay?.setAttribute('aria-hidden','true');
    document.body.classList.remove('tt-admin-modal-open');
    if(wasOpen)restoreAdminFocus();
    if (inspectorObserver) { inspectorObserver.disconnect(); inspectorObserver=null; }
    signalSecuritySurface(false);
  }
  function bindInspectorObserver() {
    if (inspectorObserver) inspectorObserver.disconnect();
    inspectorObserver=new MutationObserver(scheduleMetrics);
    [$('#empSelect'),$('#statusText'),$('#clockShiftPrimary'),$('#agentQuickStatus'),$('#desktopTbody'),$('#agentSecurityTbody')].filter(Boolean).forEach(node=>inspectorObserver.observe(node,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['value','data-state','data-render-key']}));
  }

  function availability(name,pod,year,monthZero,day) {
    const core=window.TrinoTimeCore;
    if (!name||!pod||typeof core?.resolveEffectiveAvailability!=='function') return {kind:'unknown',label:'Syncing'};
    const date=`${String(monthZero+1).padStart(2,'0')}/${String(day).padStart(2,'0')}/${year}`;
    try {
      const result=core.resolveEffectiveAvailability(name,date,pod,{role:'labeler',includeAttendance:false})||{};
      if(result.sourceKind==='leave') return {kind:'leave',label:String(result.leaveRequest?.leaveType||'Approved Leave')};
      if(result.sourceKind==='day_off'||result.code==='scheduled_day_off') return {kind:'dayoff',label:'Day Off'};
      return {kind:'work',label:result.reason||'Scheduled workday'};
    } catch (_) { return {kind:'unknown',label:'Syncing'}; }
  }

  function scheduleCellModel(year,month,name,pod) {
    const live=nowPht();
    const firstDow=new Date(Date.UTC(year,month,1)).getUTCDay();
    const daysInMonth=new Date(Date.UTC(year,month+1,0)).getUTCDate();
    const previousMonthDays=new Date(Date.UTC(year,month,0)).getUTCDate();
    const cells=[]; const counts={work:0,dayoff:0,leave:0};
    for(let i=0;i<42;i++){
      let cy=year,cm=month,day=i-firstDow+1,outside=false;
      if(day<1){outside=true;cm-=1;if(cm<0){cm=11;cy-=1;}day=previousMonthDays+day;}
      else if(day>daysInMonth){outside=true;day-=daysInMonth;cm+=1;if(cm>11){cm=0;cy+=1;}}
      let status={kind:'outside',label:''};
      if(!outside && name && pod){status=availability(name,pod,year,month,day);if(counts[status.kind]!==undefined)counts[status.kind]++;}
      const today=cy===live.year&&cm===live.month-1&&day===live.day;
      cells.push({year:cy,month:cm,day,outside,status,today});
    }
    return {cells,counts};
  }

  function renderCalendarHtml(year,month,name,pod,compact=false) {
    const {cells,counts}=scheduleCellModel(year,month,name,pod);
    const html=cells.map(cell=>{
      const cls=['tt-admin-cal-day'];
      if(cell.outside)cls.push('is-outside');
      else if(cell.status.kind==='dayoff')cls.push('is-dayoff');
      else if(cell.status.kind==='leave')cls.push('is-leave');
      else if(cell.status.kind==='work')cls.push('is-work');
      if(cell.today)cls.push('is-today');
      return `<span class="${cls.join(' ')}" role="gridcell" title="${esc(cell.status.label||'')}"><b>${cell.day}</b>${compact?'':`<small>${cell.outside?'':esc(cell.status.label||'')}</small>`}</span>`;
    }).join('');
    return {html,counts};
  }

  function queueScheduleRender(){if(scheduleRenderQueued)return;scheduleRenderQueued=true;requestAnimationFrame(()=>{scheduleRenderQueued=false;renderSchedule();});}
  function renderSchedule() {
    if(!isAdmin() || document.hidden || document.body.dataset.ttAdminView!=='schedule')return;
    if(document.documentElement.classList.contains('tt-is-scrolling')){scheduleMetrics();return;}
    const grid=$('#ttAdminScheduleGrid'); if(!grid)return;
    const name=rawSelectedAgent(),pod=selectedPod();
    const year=Number(state.schedule.year)||pht.year,month=Number.isInteger(Number(state.schedule.month))?Number(state.schedule.month):pht.month-1;
    const title=$('#ttAdminScheduleMonth');
    if(title)title.textContent=new Intl.DateTimeFormat('en-US',{timeZone:'UTC',month:'long',year:'numeric'}).format(new Date(Date.UTC(year,month,1)));
    const context=$('#ttAdminScheduleContext');
    if(context)context.textContent=name?(pod?`${name} · ${pod} · recurring schedule + approved leave`:`${name} · POD syncing`):'Select an Agent to view days off and approved leave.';
    const model=renderCalendarHtml(year,month,name,pod,false);
    if(grid.innerHTML!==model.html) grid.innerHTML=model.html;
    const set=(id,v)=>{const el=$('#'+id);if(el)el.textContent=String(v);};
    set('ttAdminScheduleWorkCount',model.counts.work);set('ttAdminScheduleDayOffCount',model.counts.dayoff);set('ttAdminScheduleLeaveCount',model.counts.leave);
    persistSoon();
  }

  function inspectorEmpty(message) { return `<div class="tt-admin-inspector-empty"><strong>${esc(message)}</strong><span>Select an Agent from Attendance or use Quick Actions → Find Agent.</span><button data-inspector-action="find" type="button">Find Agent</button></div>`; }
  function selectedAttendanceRows(name) {
    if (!name) return [];
    const projection=window.TrinoTimeCore?.attendancePresentation;
    if (!projection) return [];
    return projection.snapshot({name,limit:5}).rows;
  }
  function attendanceRecordMarkup(row) {
    const state=row.voided?'Voided':row.logOut?'Complete':row.startBreak&&!row.endBreak?'On break':row.timeIn?'Working':'Not yet in';
    return `<div class="tt-admin-inspector-record"><strong>${esc(row.date||'Attendance record')}</strong><span>${esc([row.pod,state,...row.times].join(' · '))}</span></div>`;
  }

  function securityRow(name) {
    if (!name) return null;
    return $$('#agentSecurityTbody tr').find(row=>row.querySelector('[data-agent-security-reset]')?.getAttribute('data-agent-security-reset')===name)||null;
  }
  function upcomingAvailability(name,pod) {
    const live=nowPht(); const base=new Date(Date.UTC(live.year,live.month-1,live.day)); const items=[];
    for(let i=0;i<21;i++){
      const d=new Date(base);d.setUTCDate(base.getUTCDate()+i);const status=availability(name,pod,d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate());
      if(status.kind==='dayoff'||status.kind==='leave')items.push({date:d,status});
      if(items.length>=6)break;
    }
    return items;
  }

  function renderInspector() {
    if (!isAdmin() || !$('#ttAdminInspectorOverlay')?.classList.contains('is-open')) return;
    signalSecuritySurface(state.inspector.tab==='access');
    const body=$('#ttAdminInspectorBody'); if(!body)return;
    const setContent=html=>{
      if(body._adminMarkup===html)return;
      const action=body.contains(document.activeElement)?document.activeElement.dataset?.inspectorAction:null;
      const scrollTop=body.scrollTop;
      body.innerHTML=html;body._adminMarkup=html;body.scrollTop=scrollTop;
      if(action)$$('[data-inspector-action]',body).find(button=>button.dataset.inspectorAction===action)?.focus({preventScroll:true});
    };
    const name=rawSelectedAgent(),pod=selectedPod();
    $('#ttAdminInspectorTitle').textContent=name||'No Agent selected';
    $('#ttAdminInspectorMeta').textContent=name?`${pod||'POD syncing'} · live Admin context`:'Select an Agent to inspect.';
    $$('[data-inspector-tab]').forEach(button=>{
      const active=button.dataset.inspectorTab===state.inspector.tab;
      button.classList.toggle('is-active',active);button.setAttribute('aria-selected',active?'true':'false');button.tabIndex=active?0:-1;
    });
    if(!name){setContent(inspectorEmpty('No Agent selected'));return;}
    const tab=state.inspector.tab;
    if(tab==='profile'){
      const status=$('#statusText')?.textContent?.trim()||'Status not loaded';
      const shift=$('#clockShiftPrimary')?.textContent?.trim()||$('#todayShiftSelect option:checked')?.textContent?.trim()||'Shift syncing';
      const quick=$('#agentQuickStatus')?.textContent?.trim()||'';
      const initials=String(name||'TT').split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join('').toUpperCase()||'TT';
      setContent(`<section class="tt-admin-inspector-profile-hero"><span class="tt-admin-inspector-profile-avatar">${esc(initials)}</span><div><span class="tt-admin-inspector-profile-kicker">TRINOTIME IDENTITY</span><h3>${esc(name)}</h3><p>${esc(pod||'POD syncing')} · Admin read-only context</p><div class="tt-admin-inspector-profile-chips"><span>${esc(status)}</span>${quick?`<span>${esc(quick)}</span>`:''}</div></div></section><div class="tt-admin-inspector-grid tt-admin-inspector-profile-grid"><article><span>Current status</span><strong>${esc(status)}</strong><small>${esc(quick||'Live workforce state')}</small></article><article><span>Shift</span><strong>${esc(shift)}</strong><small>Live selected-Agent context</small></article><article><span>Profile access</span><strong>Secure directory</strong><small>Privacy and role filters remain authoritative</small></article></div><div class="tt-admin-inspector-actions"><button data-inspector-action="directory">Open Secure Profile</button><button data-inspector-action="attendance">Open Attendance</button><button data-inspector-action="schedule">Open Schedule</button><button data-inspector-action="message">Message</button></div>`);
      if (typeof window.TrinoTimeMetricsInspectorGradeMount === 'function') void window.TrinoTimeMetricsInspectorGradeMount(body, name);
    } else if(tab==='attendance'){
      const rows=selectedAttendanceRows(name);
      const list=rows.length?rows.map(attendanceRecordMarkup).join(''):`<div class="tt-admin-inspector-empty compact"><strong>No attendance records in the current view.</strong><span>Open Attendance to load the selected Agent's current records.</span></div>`;
      setContent(`<div class="tt-admin-inspector-section-head"><div><span>Attendance</span><strong>${esc($('#statusText')?.textContent?.trim()||'Status syncing')}</strong></div></div>${list}<div class="tt-admin-inspector-actions"><button data-inspector-action="filter-attendance">Open filtered Attendance</button><button data-inspector-action="correct">Correct latest record</button></div>`);
    } else if(tab==='schedule'){
      const live=nowPht();
      const parsedYear=Number(state.schedule.year), parsedMonth=Number(state.schedule.month);
      const year=Number.isInteger(parsedYear)&&parsedYear>2000?parsedYear:live.year;
      const month=Number.isInteger(parsedMonth)&&parsedMonth>=0&&parsedMonth<=11?parsedMonth:live.month-1;
      const cal=renderCalendarHtml(year,month,name,pod,true);
      setContent(`<div class="tt-admin-inspector-mini-calendar"><div class="tt-admin-schedule-weekdays" aria-hidden="true"><span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span></div><div class="tt-admin-schedule-grid compact">${cal.html}</div></div><div class="tt-admin-inspector-actions"><button data-inspector-action="schedule">Open Schedule workspace</button><button data-inspector-action="recurring">Manage recurring schedule</button><button data-inspector-action="exceptions">Schedule exceptions</button></div>`);
    } else if(tab==='leave'){
      const items=upcomingAvailability(name,pod);
      const list=items.length?items.map(item=>`<div class="tt-admin-inspector-record"><strong>${esc(new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(item.date))}</strong><span>${esc(item.status.label)}</span></div>`).join(''):`<div class="tt-admin-inspector-empty compact"><strong>No upcoming Day Off/Leave found in the next 21 days.</strong><span>Use Review Center for pending leave requests.</span></div>`;
      setContent(`<div class="tt-admin-inspector-section-head"><div><span>Upcoming availability</span><strong>${esc(name)}</strong></div></div>${list}<div class="tt-admin-inspector-actions"><button data-inspector-action="review-leave">Review leave requests</button><button data-inspector-action="schedule">Open Schedule</button></div>`);
    } else if(tab==='access'){
      const row=securityRow(name);const cells=row?Array.from(row.cells||[]).map(c=>String(c.textContent||'').trim()).filter(Boolean):[];
      setContent(`<div class="tt-admin-inspector-section-head"><div><span>Account access</span><strong>${esc(name)}</strong></div></div>${cells.length?`<div class="tt-admin-access-summary">${cells.map((text,i)=>`<div><span>${i===0?'Identity':`Field ${i+1}`}</span><strong>${esc(text)}</strong></div>`).join('')}</div>`:`<div class="tt-admin-inspector-empty compact"><strong>Account details are not loaded yet.</strong><span>Open Account Security to load the authoritative access state.</span></div>`}<div class="tt-admin-inspector-actions"><button data-inspector-action="security">Open Account Security</button><button data-inspector-action="premium">Premium & Workspace</button></div>`);
    } else if(tab==='history'){
      const rows=selectedAttendanceRows(name);
      const list=rows.length?rows.map(attendanceRecordMarkup).join(''):`<div class="tt-admin-inspector-empty compact"><strong>History is available in Reports.</strong><span>Open Attendance History with this Agent preselected.</span></div>`;
      setContent(`<div class="tt-admin-inspector-section-head"><div><span>Recent attendance history</span><strong>${esc(name)}</strong></div></div>${list}<div class="tt-admin-inspector-actions"><button data-inspector-action="history">Open Attendance History</button><button data-inspector-action="totals">Open Totals</button><button data-inspector-action="audit">Open Audit</button></div>`);
    }
  }

  function openExisting(sel,delay=0){closeOverlay();setTimeout(()=>click(sel),delay);}
  function openAdminExportCenter(format){
    setView('reports',{scroll:false});
    const normalized=String(format||'').toLowerCase();
    const requested=normalized==='csv'||normalized==='excel'?normalized:undefined;
    if(typeof window.trinoOpenExportCenter==='function'){
      window.trinoOpenExportCenter(requested);
      return true;
    }
    const fallback=requested==='csv'?'#exportCsv':'#exportExcel';
    if(click(fallback))return true;
    showNotice('Export Center is still loading. Please try again.');
    return false;
  }

  function action(name,source){
    if(name==='tools'){showOverlay();return;}
    if(name==='inspector'){openInspector(source?.dataset?.inspectorTab);return;}
    if(name==='message'){click('#workspaceMessagingLauncher');return;}
    if(name==='export'){openAdminExportCenter(source?.dataset?.exportFormat);return;}
  }
  function workforceAction(name){
    state.workforce.lastAction=name;persistSoon();
    if(name==='security'){embedSecurity();return;}
    setView('workforce',{scroll:false});
    const map={roster:'#rosterTabBtn',move:'#moveAgentsTabBtn',backup:'#backupTlTabBtn'};
    if(map[name])setTimeout(()=>click(map[name]),30);
    if(name==='pod'){if(!click('#openPodTeamManagementBtn'))click('[data-tt-nav="pod"]');}
  }
  function reportAction(name){state.reports.lastAction=name;persistSoon();setView('reports',{scroll:false});const navigation=navigationEpoch;setTimeout(()=>{if(currentAdminNavigation(navigation,'reports'))click(`.log-tab[data-tab="${name}"]`);},40);}
  function tool(name){
    switch(name){
      case'settings':openExisting('#settingsGearBtn');break;
      case'premium':closeOverlay();if(click('#settingsGearBtn'))setTimeout(()=>click('#settingsPremiumAccessTabBtn'),80);break;
      case'security':embedSecurity();break;
      case'pod':closeOverlay();if(!click('#openPodTeamManagementBtn'))click('[data-tt-nav="pod"]');break;
      case'tlstatus':openExisting('#tlAdminOverviewBtn');break;
      case'shifts':openExisting('#openShiftSettingsBtn');break;
      case'syncguardian':openSyncGuardian();break;
      case'diagnostics':closeOverlay();setView('review',{scroll:false});setTimeout(()=>click('#systemHealthDiagnosticsBtn'),70);break;
      case'notifications':openExisting('#notifBellBtn');break;
      case'help':closeOverlay();if(click('#settingsGearBtn'))setTimeout(()=>click('[data-settings-tab="tutorial"]'),70);break;
    }
  }

  // UX18P46: Admin-only observational diagnostics. No agent actions, writes,
  // local browser storage, or automatic polling while the dialog is closed.
  let guardianRequest=0;
  let guardianRows=[];
  let guardianStatus='attention';
  let guardianSearch='';
  const guardianStates={recent:'Synced recently',delayed:'Sync delayed',stale:'Sync stale',
    'no-evidence':'No accepted activity', 'not-working':'Not on active shift',
    unverified:'Attendance unverified',unavailable:'Source unavailable'};
  const guardianAttention=new Set(['delayed','stale','no-evidence','unavailable']);
  function guardianDate(ms){return ms?new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',hour:'numeric',minute:'2-digit',hour12:true}).format(new Date(ms)):'—';}
  function renderSyncGuardian(){
    const body=$('#ttSyncGuardianBody');if(!body)return;
    const all=guardianRows;
    const attention=all.filter(r=>guardianAttention.has(r.coverage.status)||guardianAttention.has(r.confirmation.status));
    const recent=all.filter(r=>r.coverage.status==='recent'||r.confirmation.status==='recent');
    const active=all.filter(r=>r.attendance==='timed_in');
    const q=guardianSearch.toLowerCase();
    const filtered=all.filter(r=>(guardianStatus!=='attention'||attention.includes(r))&&(!q||`${r.name} ${r.podLabel}`.toLowerCase().includes(q)));
    const badge=entry=>`<span class="tt-guardian-pill tt-guardian-${esc(entry.status)}">${esc(guardianStates[entry.status]||'Unknown')}</span>`;
    body.innerHTML=`<div class="tt-guardian-metrics"><div><strong>${active.length}</strong><span>Verified time in</span></div><div><strong>${attention.length}</strong><span>Needs review</span></div><div><strong>${recent.length}</strong><span>Recently synced</span></div><div><strong>${all.length}</strong><span>Authorized agents</span></div></div>
      <div class="tt-guardian-filters"><label>Show <select id="ttSyncGuardianFilter"><option value="attention" ${guardianStatus==='attention'?'selected':''}>Needs review</option><option value="all" ${guardianStatus==='all'?'selected':''}>All agents</option></select></label><label>Find agent <input id="ttSyncGuardianSearch" type="search" autocomplete="off" placeholder="Name or POD" value="${esc(guardianSearch)}"></label></div>
      <div class="tt-guardian-table-wrap"><table class="tt-guardian-table"><thead><tr><th>Agent / POD</th><th>Attendance</th><th>Coverage</th><th>Confirmation</th></tr></thead><tbody>${filtered.length?filtered.map(r=>`<tr><th scope="row">${esc(r.name)}<small>${esc(r.podLabel)}</small></th><td>${esc(r.attendance==='timed_in'?'Time in':r.attendance==='timed_out'?'Time out':'Unverified')}</td>${['coverage','confirmation'].map(w=>{const d=r[w];return `<td>${badge(d)}<small>${d.lastAcknowledgedAtMs?'Accepted '+guardianDate(d.lastAcknowledgedAtMs)+' · '+Number(d.confirmed||0)+' confirmed':'No current-shift acknowledgment'}${d.version?' · v'+esc(d.version):''}</small></td>`;}).join('')}</tr>`).join(''):`<tr><td colspan="4" class="tt-guardian-empty">${guardianStatus==='attention'?'No agents currently match the review filter.':'No agents match your search.'}</td></tr>`}</tbody></table></div>`;
    const filter=$('#ttSyncGuardianFilter'),search=$('#ttSyncGuardianSearch');
    filter?.addEventListener('change',()=>{guardianStatus=filter.value;renderSyncGuardian();});
    search?.addEventListener('input',()=>{const pos=search.selectionStart;guardianSearch=search.value;renderSyncGuardian();const next=$('#ttSyncGuardianSearch');next?.focus({preventScroll:true});try{next?.setSelectionRange(pos,pos);}catch(_){}});
  }
  async function loadSyncGuardian(){
    const request=++guardianRequest,body=$('#ttSyncGuardianBody'),meta=$('#ttSyncGuardianMeta');
    if(!body||!isAdmin())return;
    body.textContent='Loading server-accepted activity…';
    try{
      const user=window.firebase?.auth?.().currentUser;
      if(!user||user.isAnonymous||typeof user.getIdToken!=='function')throw new Error('Admin Firebase session unavailable. Sign in again.');
      const token=await user.getIdToken(false);
      const response=await fetch('/api/workforce/sync-guardian/summary',{method:'GET',cache:'no-store',credentials:'same-origin',headers:{Accept:'application/json',Authorization:`Bearer ${token}`}});
      const data=await response.json();
      if(!response.ok||data.ok!==true)throw new Error(data.message||`Sync Guardian request failed (${response.status}).`);
      if(request!==guardianRequest||!$('#ttSyncGuardianBody')||!isAdmin())return;
      guardianRows=Array.isArray(data.agents)?data.agents:[];
      if(meta)meta.textContent=`Server snapshot: ${new Date(data.generatedAtMs).toLocaleTimeString('en-PH',{timeZone:'Asia/Manila'})} PHT · ${data.date} · Server-accepted data only`;
      renderSyncGuardian();
    }catch(error){if(request===guardianRequest&&body?.isConnected){body.textContent=error?.message||'Unable to load Sync Guardian. No statuses were assumed.';if(meta)meta.textContent='Unable to verify server status';}}
  }
  function openSyncGuardian(){
    if(!isAdmin())return;
    restoreEmbedded();
    const host=$('#ttAdminEmbeddedHost');if(!host)return;
    host.innerHTML=`<section id="ttSyncGuardianPanel" class="tt-guardian-panel"><div class="tt-guardian-intro"><p>Read-only snapshot of what TrinoTime has accepted for the current Attendance shift. No task counts can be changed here.</p><button type="button" id="ttSyncGuardianRefresh">Refresh snapshot</button></div><p id="ttSyncGuardianMeta" class="tt-guardian-meta">Waiting for server evidence</p><div id="ttSyncGuardianBody" aria-live="polite"></div><p class="tt-guardian-disclaimer">A missing acknowledgment is not proof a task was missed. Browser-local pending queues and rejected sync requests are not visible here. No automatic recovery or writes.</p></section>`;
    $('#ttAdminEmbeddedTitle').textContent='Sync Guardian · V1';
    $('.tt-admin-tools-modal')?.classList.add('is-embedded');
    showOverlay();
    $('#ttSyncGuardianRefresh')?.addEventListener('click',loadSyncGuardian);
    guardianStatus='attention';guardianSearch='';guardianRows=[];
    loadSyncGuardian();
  }

  function scheduleAction(name){
    setView('schedule',{scroll:false});
    if(!click('#openDayOffBtn'))return;
    if(name==='exceptions')setTimeout(()=>click('#scheduleExceptionsBtn'),90);
    if(name==='recurring')setTimeout(()=>click('#dayOffEditToggle'),90);
  }

  function filterAttendanceToSelected() {
    const name=rawSelectedAgent(); if(!name){showNotice('Select an Agent first.');setView('attendance');setTimeout(()=>$('#empSearch')?.focus(),80);return;}
    setView('attendance',{scroll:false});
    const navigation=navigationEpoch;
    setTimeout(()=>{
      if(!currentAdminNavigation(navigation,'attendance') || rawSelectedAgent()!==name)return;
      const filter=$('#filterEmp');
      if(filter&&Array.from(filter.options||[]).some(option=>option.value===name)){filter.value=name;filter.dispatchEvent(new Event('change',{bubbles:true}));}
      const search=$('#attendanceSearchInput');if(search){search.value=name;search.dispatchEvent(new Event('input',{bubbles:true}));}
      state.attendance.filterEmp=name;state.attendance.search=name;persistSoon();
    },80);
  }

  function correctSelectedAttendance() {
    const name=rawSelectedAgent();if(!name){showNotice('Select an Agent before opening Attendance Correction.');setView('attendance');setTimeout(()=>$('#empSearch')?.focus(),80);return;}
    filterAttendanceToSelected();
    const navigation=navigationEpoch;
    setTimeout(()=>{
      if(!currentAdminNavigation(navigation,'attendance') || rawSelectedAgent()!==name)return;
      const edit=$$('.row-edit-btn').find(btn=>btn.dataset.name===name);
      if(edit)edit.click();else showNotice(`No editable rendered attendance record found for ${name}. Open Attendance History for older records.`);
    },220);
  }

  function inspectorAction(name){
    const agent=rawSelectedAgent();
    switch(name){
      case'find':closeInspector();setView('attendance');setTimeout(()=>$('#empSearch')?.focus(),80);break;
      case'attendance':closeInspector();setView('attendance');break;
      case'filter-attendance':closeInspector();filterAttendanceToSelected();break;
      case'correct':closeInspector();correctSelectedAttendance();break;
      case'schedule':closeInspector();setView('schedule');break;
      case'recurring':closeInspector();scheduleAction('recurring');break;
      case'exceptions':closeInspector();scheduleAction('exceptions');break;
      case'review-leave':closeInspector();setView('review');break;
      case'security':closeInspector();embedSecurity();break;
      case'premium':closeInspector();if(click('#settingsGearBtn'))setTimeout(()=>click('#settingsPremiumAccessTabBtn'),80);break;
      case'history':closeInspector();setView('reports',{scroll:false});setTimeout(()=>{const sel=$('#historyEmpSelect');if(sel&&agent&&Array.from(sel.options||[]).some(o=>o.value===agent)){sel.value=agent;sel.dispatchEvent(new Event('change',{bubbles:true}));}click('.log-tab[data-tab="history"]');},80);break;
      case'totals':closeInspector();reportAction('totals');break;
      case'audit':closeInspector();reportAction('audit');break;
      case'directory':{
        const directory=window.TrinoTimeProfileDirectory;
        if(directory&&typeof directory.open==='function'){closeInspector();directory.open(agent);}
        else showNotice('Secure Profile Directory is still loading. Please try again.');
        break;
      }
      case'message':closeInspector();click('#workspaceMessagingLauncher');break;
    }
  }

  function positionQuickMenu(){
    const root=$('#ttAdminQuickActions'),menu=$('#ttAdminQuickMenu'),button=root?.querySelector('.tt-admin-quick-fab');
    if(!menu||menu.hidden||!button)return;
    const rect=button.getBoundingClientRect(),gap=8,edge=12;
    const below=innerHeight-rect.bottom-edge-gap,above=rect.top-edge-gap;
    const down=below>=Math.min(420,above);
    menu.style.left=Math.max(edge,Math.min(rect.right-250,innerWidth-262))+'px';
    menu.style.top=down?(rect.bottom+gap)+'px':'auto';
    menu.style.bottom=down?'auto':(innerHeight-rect.top+gap)+'px';
    menu.style.maxHeight=Math.max(80,down?below:above)+'px';
  }
  function toggleQuick(force){const root=$('#ttAdminQuickActions'),menu=$('#ttAdminQuickMenu'),fab=$('.tt-admin-quick-fab',root);if(!root||!menu||!fab)return;const open=typeof force==='boolean'?force:menu.hidden;menu.hidden=!open;root.classList.toggle('is-open',open);fab.setAttribute('aria-expanded',open?'true':'false');if(open)positionQuickMenu();}
  function quickAction(name){
    toggleQuick(false);
    switch(name){
      case'find':setView('attendance');setTimeout(()=>$('#empSearch')?.focus(),90);break;
      case'inspect':openInspector();break;
      case'add':setView('attendance',{scroll:false});setTimeout(()=>click('#addEmpBtn'),70);break;
      case'correct':correctSelectedAttendance();break;
      case'schedule':setView('schedule');break;
      case'review':setView('review');break;
      case'message':click('#workspaceMessagingLauncher');break;
      case'export':action('export');break;
      case'diagnostics':setView('review',{scroll:false});setTimeout(()=>click('#systemHealthDiagnosticsBtn'),80);break;
    }
  }

  function scheduleNav(action){
    const live=nowPht();let year=Number(state.schedule.year)||live.year,month=Number(state.schedule.month);if(!Number.isInteger(month))month=live.month-1;
    if(action==='today'){year=live.year;month=live.month-1;}else{const date=new Date(Date.UTC(year,month+(action==='prev'?-1:1),1));year=date.getUTCFullYear();month=date.getUTCMonth();}
    state.schedule={year,month};persistSoon();queueScheduleRender();
  }

  function simplifySidebar() {
    const sidebar=$('#ttPremiumSidebar');if(!sidebar)return;
    sidebar.classList.toggle('tt-admin-sidebar-simplified',isAdmin()&&appVisible());
    const dash=sidebar.querySelector('[data-tt-nav="dashboard"]');
    const label=dash?.querySelector('.tt-nav-label');
    if(label){if(!label.dataset.originalLabel)label.dataset.originalLabel=label.textContent||'Dashboard';label.textContent=isAdmin()?'Admin Center':label.dataset.originalLabel;}
    if(dash){dash.setAttribute('aria-label',isAdmin()?'Admin Center':'Dashboard');dash.dataset.ttTooltip=isAdmin()?'Admin Center':'Dashboard';}
  }

  function bind(){
    window.addEventListener('resize',()=>toggleQuick(false),{passive:true});
    document.addEventListener('scroll',event=>{if(!event.target.closest?.('.tt-admin-quick-menu'))toggleQuick(false);},{passive:true,capture:true});
    document.addEventListener('click',e=>{
      const v=e.target.closest('[data-admin-view]');if(v&&isAdmin()){e.preventDefault();setView(v.dataset.adminView);return;}
      const j=e.target.closest('[data-admin-jump]');if(j&&isAdmin()){setView(j.dataset.adminJump);return;}
      const a=e.target.closest('[data-admin-action]');if(a&&isAdmin()){action(a.dataset.adminAction,a);return;}
      const w=e.target.closest('[data-admin-workforce]');if(w&&isAdmin()){workforceAction(w.dataset.adminWorkforce);return;}
      const r=e.target.closest('[data-admin-report]');if(r&&isAdmin()){reportAction(r.dataset.adminReport);return;}
      const t=e.target.closest('[data-tool]');if(t&&isAdmin()){tool(t.dataset.tool);return;}
      const sn=e.target.closest('[data-admin-schedule-nav]');if(sn&&isAdmin()){scheduleNav(sn.dataset.adminScheduleNav);return;}
      const sa=e.target.closest('[data-admin-schedule-action]');if(sa&&isAdmin()){scheduleAction(sa.dataset.adminScheduleAction);return;}
      const it=e.target.closest('[data-inspector-tab]');if(it&&$('#ttAdminInspectorOverlay')?.classList.contains('is-open')){state.inspector.tab=it.dataset.inspectorTab;persistSoon();renderInspector();return;}
      const ia=e.target.closest('[data-inspector-action]');if(ia){inspectorAction(ia.dataset.inspectorAction);return;}
      const qa=e.target.closest('[data-quick-action]');if(qa&&isAdmin()){quickAction(qa.dataset.quickAction);return;}
      if(e.target.closest('.tt-admin-quick-fab')){toggleQuick();return;}
      if(e.target.closest('.tt-admin-tools-close')){closeOverlay();return;}
      if(e.target.closest('.tt-admin-embedded-back')){guardianRequest++;restoreEmbedded();signalSecuritySurface(false);return;}
      if(e.target.id==='ttAdminToolsOverlay'){closeOverlay();return;}
      if(e.target.closest('.tt-admin-inspector-close')||e.target.id==='ttAdminInspectorOverlay'){closeInspector();return;}
      if(!e.target.closest('#ttAdminQuickActions, #ttAdminQuickMenu'))toggleQuick(false);
    },false);

    document.addEventListener('keydown',e=>{
      const quickMenu=$('#ttAdminQuickMenu');
      if(e.target.closest('.tt-admin-quick-fab') && ['ArrowDown','ArrowUp'].includes(e.key)){
        e.preventDefault();toggleQuick(true);
        const items=$$('[role="menuitem"]',quickMenu);(e.key==='ArrowUp'?items[items.length-1]:items[0])?.focus();return;
      }
      if(quickMenu && !quickMenu.hidden && quickMenu.contains(e.target)){
        const items=$$('[role="menuitem"]',quickMenu),index=items.indexOf(e.target);
        if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){
          e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?items.length-1:(index+(e.key==='ArrowDown'?1:-1)+items.length)%items.length;items[next]?.focus();return;
        }
        if(e.key==='Escape'){e.preventDefault();toggleQuick(false);$('.tt-admin-quick-fab')?.focus();return;}
        if(e.key==='Tab'){toggleQuick(false);$('.tt-admin-quick-fab')?.focus();}
      }
      const dialog=$('#ttAdminInspectorOverlay.is-open')||$('#ttAdminToolsOverlay.is-open');
      if(dialog && e.key==='Tab'){trapAdminFocus(e,dialog);return;}
      if(dialog && e.altKey)return;

      const tab=e.target.closest('[role="tab"]');
      if(isAdmin() && tab && tab.closest('#ttAdminCommandBar, #ttAdminInspectorOverlay') && ['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){
        const tabs=$$('[role="tab"]',tab.closest('[role="tablist"]'));
        let index=tabs.indexOf(tab);
        index=e.key==='Home'?0:e.key==='End'?tabs.length-1:(index+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
        e.preventDefault();tabs[index].click();tabs[index].focus();return;
      }

      if(e.key==='Escape'){
        if($('#ttAdminInspectorOverlay')?.classList.contains('is-open')){closeInspector();return;}
        if($('#ttAdminToolsOverlay')?.classList.contains('is-open')){closeOverlay();return;}
        toggleQuick(false);
      }
      if(isAdmin()&&e.altKey&&!e.ctrlKey&&!e.metaKey){
        const map={'1':'overview','2':'attendance','3':'workforce','4':'schedule','5':'review','6':'reports'};
        if(map[e.key]){e.preventDefault();setView(map[e.key]);}
      }
    });

    document.addEventListener('change',e=>{
      if(!isAdmin() || restoring) return;
      if(['empSelect','filterEmp','payPeriodPreset','filterDate','filterDateTo'].includes(e.target?.id)){
        if(e.target.id==='empSelect')state.selectedAgent=String(e.target.value||'');
        captureState();scheduleMetrics();queueScheduleRender();
      }
    });
    document.addEventListener('input',e=>{
      if(isAdmin()&&!restoring&&e.target?.id==='attendanceSearchInput'){state.attendance.search=String(e.target.value||'');persistSoon();}
    });
    document.addEventListener('click',e=>{
      if(e.target.closest('#attendanceIssuesToggle'))setTimeout(captureState,0);
      const nav=e.target.closest('#ttPremiumSidebar [data-tt-nav]');if(!nav||!isAdmin())return;
      const n=nav.dataset.ttNav;
      const map={dashboard:'overview',attendance:'attendance',workforce:'workforce',reports:'reports',schedule:'schedule'};
      if(map[n]){e.preventDefault();e.stopImmediatePropagation();setView(map[n]);}
    },true);

    window.addEventListener('trinotime:attendance-projection-change',scheduleMetrics);
    window.addEventListener('beforeunload',captureState,{capture:true});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)captureState();else{scheduleMetrics();if(document.body.dataset.ttAdminView==='schedule')queueScheduleRender();}});
  }

  function syncAvailability(){
    const ready=isAdmin()&&appVisible();
    if (document.documentElement.classList.contains('tt-admin-command-enabled') !== ready) document.documentElement.classList.toggle('tt-admin-command-enabled',ready);
    if (document.body.classList.contains('tt-admin-command-ready') !== ready) document.body.classList.toggle('tt-admin-command-ready',ready);
    simplifySidebar();
    if (ready === workspaceReady) return;
    workspaceReady = ready;
    const currentActivation = ++activation;
    if(ready){
      if(!document.body.dataset.ttAdminView)setView(state.view||'overview',{scroll:false,restore:false});
      setTimeout(()=>{if(currentActivation!==activation||!isAdmin())return;restoreSelectedAgent();if(document.body.dataset.ttAdminView==='attendance')restoreAttendanceState();scheduleMetrics();queueScheduleRender();},140);
      setTimeout(()=>{if(currentActivation!==activation||!isAdmin())return;restoreSelectedAgent();scheduleMetrics();},900);
    }else{
      ++navigationEpoch;
      viewScrollPositions.clear();
      captureState();
      delete document.body.dataset.ttAdminView;
      closeOverlay();closeInspector();toggleQuick(false);
      if(surfaceObserver){surfaceObserver.disconnect();surfaceObserver=null;}
    }
  }

  function init(){
    build();syncAvailability();
    const roleObserver=new MutationObserver(syncAvailability);roleObserver.observe(document.body,{attributes:true,attributeFilter:['data-trino-role']});
    const app=$('#appRoot');if(app)roleObserver.observe(app,{attributes:true,attributeFilter:['style','class','hidden']});
    setInterval(()=>{if(!document.hidden&&isAdmin()){syncAvailability();scheduleMetrics();}},5000);
    window.TrinoTimeAdminCommandCenter=Object.freeze({version:VERSION,setView,openInspector,closeInspector,refresh:()=>{scheduleMetrics();queueScheduleRender();renderInspector();},state:()=>JSON.parse(JSON.stringify(state))});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
