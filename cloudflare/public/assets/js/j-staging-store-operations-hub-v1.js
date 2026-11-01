/* TrinoTime RC2 Staging · Store Operations unified hub, 2026-10-15.
   UI-only coordinator over existing authorized POD Store Plans/Store Intelligence.
   No API calls, Firebase access, Tracker sync changes or local storage. */
(() => {
  'use strict';
  if (window.__ttStoreOperationsHubV1) return;
  window.__ttStoreOperationsHubV1 = true;

  const ROOT_ID = 'ttPodDispatchRoot';
  const TABS = Object.freeze([
    ['overview','Overview'],
    ['work','Work Control'],
    ['queue','Store Queue'],
    ['performance','Performance'],
    ['history','History']
  ]);
  const $ = (root, selector) => root?.querySelector(selector) || null;
  let boundRoot = null;
  let rootObserver = null;
  let navRetry = null;
  let lastReport = null;
  let lastReportPanel = null; // Retire cached report whenever the signed-in account rebuilds its panel.
  let overviewCache = null; // Presentation-only snapshot; never caches API authority.
  function matchesVerifiedViewer(root, actor, viewer) {
    if (!actor || !viewer || normalize(viewer.role)!==normalize(actor.role)) return false;
    if (actor.role !== 'admin') return normalize(viewer.name)===normalize(actor.name);
    // Names shown by the shell ("Admin") aren't necessarily the server's
    // canonical name ("Administrator"). Only accept the account name verified
    // by BOTH protected Store Plans roster endpoints for the current panel.
    const verifiedName = $(root,'.tt-sp-panel')?.dataset?.ttVerifiedAdminName || '';
    return Boolean(verifiedName) && normalize(viewer.name)===normalize(verifiedName);
  }

  function normalize(value) { return String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_'); }
  function actorForDisplay() {
    try {
      const actor = window.TrinoTimeMessagingSessionContext?.getActor?.();
      const role = normalize(actor?.role);
      if (role === 'admin') return {role:'admin',name:String(actor.name || 'Admin').trim(),pod:''};
      if (['team_leader','teamleader','tl'].includes(role) && actor?.name && actor?.pod)
        return {role:'team_leader',name:String(actor.name).trim(),pod:String(actor.pod).trim()};
    } catch (_) { /* Account must be verified by the existing module. */ }
    return null;
  }
  function renameExistingNav() {
    // Preserve data-tt-nav="pod-work" so the existing manager retains all its auth and routing.
    for (const btn of document.querySelectorAll('[data-tt-nav="pod-work"]')) {
      if (btn.dataset.ttStoreHubLabel === 'v1') continue;
      btn.dataset.ttStoreHubLabel = 'v1';
      btn.setAttribute('aria-label', 'Store Operations');
      btn.dataset.ttTooltip = 'Store Operations';
      btn.title = 'Store Operations';
      const label = btn.querySelector('.tt-nav-label');
      if (label) label.textContent = 'Store Operations';
      else if (btn.closest('#ttCoverageWorkspaceTabs')) btn.textContent = 'Store Operations';
    }
  }
  function create(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }
  function statCard(title, value) {
    const card = create('div','tt-so-stat');
    card.append(create('span','tt-so-stat-label',title), create('strong','tt-so-stat-value',value));
    return card;
  }
  function reportMatchesCurrent(root, actor, selectedPod) {
    const r=lastReport;if(!r||!actor||!selectedPod||r.period!=='day')return false;
    if(lastReportPanel!==$(root,'.tt-sp-panel') || !matchesVerifiedViewer(root,actor,r.viewer))return false;
    // Admin's selection is passed to the server as pod; a TL's own POD is
    // enforced on the server, and TL reporting does not take a pod override.
    if(actor.role==='admin' && normalize(r.selectedPod)!==normalize(selectedPod))return false;
    if(actor.role==='team_leader' && (normalize(actor.pod)!==normalize(selectedPod)||normalize(r.viewer?.pod)!==normalize(selectedPod)||r.scope!=='own-pod'))return false;
    const date=$(root,'[data-store-plan-date]')?.value||'';
    return Boolean(date && r.date===date);
  }
  function paintOverview(root) {
    const host = $(root,'[data-tt-so-overview]');
    if (!host) return;
    const actor = actorForDisplay();
    const podSelect = $(root,'[data-store-plan-pod]');
    const selectedPod = String(podSelect?.value || '').trim();
    const isAuthorizedDisplay = actor && selectedPod && (actor.role === 'admin' || normalize(actor.pod) === normalize(selectedPod));
    const report = isAuthorizedDisplay && reportMatchesCurrent(root,actor,selectedPod) ? lastReport : null;
    // A fresh authorized report/roster still repaints; repeated unrelated
    // workspace events with identical content no longer rebuild the entire UI.
    const panel=$(root,'.tt-sp-panel');
    const stateKey=JSON.stringify([
      actor?.role||'',actor?.name||'',actor?.pod||'',
      $(root,'.tt-sp-panel')?.dataset?.ttVerifiedAdminName||'',
      selectedPod,podSelect?.selectedOptions?.[0]?.textContent||'',
      $(root,'[data-store-plan-date]')?.value||'',
      $(root,'[data-current-workflow]')?.textContent||'',
      $(root,'[data-current-store]')?.textContent||'',
      $(root,'[data-queue-count]')?.textContent||'',
      report?.receivedAt||0,report?.confirmed||0,report?.knownJobs||0,
      report?.unknownJobs||0,report?.conflictJobs||0
    ]);
    if(overviewCache?.root===root&&overviewCache.host===host&&
       overviewCache.panel===panel&&overviewCache.report===report&&overviewCache.key===stateKey)return;
    overviewCache={root,host,panel,report,key:stateKey};
    host.replaceChildren();
    const header = create('div','tt-so-section-heading');
    header.append(create('h3','', 'Current POD snapshot'),create('p','', 'Read-only summary of the existing POD Work Control. Store instructions are separate from verified Augmoto activity.'));
    host.append(header);
    if (!isAuthorizedDisplay) {
      const notice = create('p','tt-so-notice','Your authorized POD is being verified. Open Work Control to view or refresh the current instruction.');
      host.append(notice);return;
    }
    const wf = $(root,'[data-current-workflow]')?.textContent?.trim() || 'Loading…';
    const store = $(root,'[data-current-store]')?.textContent?.trim() || 'No current store';
    const count = $(root,'[data-queue-count]')?.textContent?.trim() || 'Load a queue to see its stores';
    const podLabel = podSelect?.selectedOptions?.[0]?.textContent?.split(' · ')[0]?.trim() || selectedPod;
    const grid = create('div','tt-so-stats');
    grid.append(statCard('Authorized POD',podLabel),statCard('Live workflow',wf),statCard('Published store',store),statCard('Queue editor',count));
    host.append(grid);
    const snapshot=report;
    const observedSection=create('section','tt-so-observed-section');
    observedSection.setAttribute('aria-label','Observed work for selected day');
    const heading=create('div','tt-so-section-heading');
    heading.append(create('h3','','Observed work · selected day'),create('p','',snapshot?'Verified report · Tracker-observed work, not planned queue completion.':'No report loaded yet. Open Performance to refresh observations.'));
    observedSection.append(heading);
    if(snapshot){
      const observed=create('div','tt-so-stats');
      observed.append(statCard('Confirmed submissions',Number(snapshot.confirmed||0).toLocaleString()),
        statCard('Mapped job/date records',Number(snapshot.knownJobs||0).toLocaleString()),
        statCard('Unknown store records',Number(snapshot.unknownJobs||0).toLocaleString()),
        statCard('Mapping conflicts',Number(snapshot.conflictJobs||0).toLocaleString()));
      observedSection.append(observed);
      const unknown=Math.max(0,Number(snapshot.unknownJobs)||0);
      const conflicts=Math.max(0,Number(snapshot.conflictJobs)||0);
      const summary=create('p','tt-so-mapping-health',unknown||conflicts?
        `${unknown.toLocaleString()} unknown · ${conflicts.toLocaleString()} conflicts · Requires matching Job ID/store evidence`:
        'No unresolved mapping in this loaded report');
      summary.dataset.state=unknown||conflicts?'needs-mapping':'verified';
      observedSection.append(summary);
      const timestamp=create('p','tt-so-note','Report received '+new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',hour:'numeric',minute:'2-digit',hour12:true}).format(new Date(snapshot.receivedAt))+' PHT · Refresh Performance to update.');
      observedSection.append(timestamp);
    }
    host.append(observedSection);
    const quick=create('div','tt-so-shortcuts');
    for(const [id,label] of [['work','Work Control'],['queue','Store Queue'],['performance','Agent Performance'],['history','POD History']]){
      const button=create('button','tt-so-shortcut',label+' →');button.type='button';
      button.addEventListener('click',()=>applyTab(root,id));quick.append(button);
    }
    host.append(quick);
    const info = create('p','tt-so-note','Queue information reflects the last manually loaded queue; it is not a live job counter. Performance and History show server-authorized Tracker observations.');
    host.append(info);
  }
  function reportPeriod(root, period) {
    const select = $(root, '#ttPodStorePerformanceHost [data-tt-store-period]');
    if (!select) return false;
    // Reuse the existing Store Intelligence listener: no custom data fetch or altered auth.
    if (select.value !== period) {
      select.value = period;
      select.dispatchEvent(new Event('change', {bubbles:true}));
    } else {
      // Revisit either report with current authorized observations rather than
      // showing a stale snapshot; reuse the original guarded Refresh handler.
      $(root, '#ttPodStorePerformanceHost [data-tt-store-refresh]')?.click();
    }
    return true;
  }
  function applyTab(root, id) {
    if (!TABS.some(([key]) => key === id) || root.hidden) return;
    // Retain the underlying POD panel, its unsaved form inputs and its event handlers.
    root.dataset.ttStoreHubTab = id;
    for (const btn of root.querySelectorAll('[data-tt-so-tab]')) {
      const active = btn.dataset.ttSoTab === id;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', String(active));
      btn.tabIndex = active ? 0 : -1;
    }
    $(root,'[data-tt-so-overview]')?.toggleAttribute('hidden', id !== 'overview');
    const hint = $(root,'[data-tt-so-history-note]');
    if (hint) hint.hidden = id !== 'history';
    const performanceHint = $(root,'[data-tt-so-performance-note]');
    if (performanceHint) performanceHint.hidden = id !== 'performance';
    const queue = $(root,'.tt-sp-advanced');
    if (queue && id === 'queue') queue.open = true;
    const reportHost = $(root,'#ttPodStorePerformanceHost');
    const waitNotice = $(root,'[data-tt-so-report-notice]');
    if (waitNotice) waitNotice.hidden = !['performance','history'].includes(id) || (!!reportHost && !reportHost.hidden);
    if (id === 'overview') paintOverview(root);
    if (id === 'performance' || id === 'history') {
      window.TrinoTimeDashboardFreshness?.waiting('store',String(actorForDisplay()?.role||'')+'|'+String(actorForDisplay()?.name||'')+'|'+String($(root,'[data-store-plan-pod]')?.value||''));
      reportPeriod(root, id === 'history' ? '7d' : 'day');
    }
  }
  function activate(root) {
    if (!root || root.hidden) return;
    applyTab(root, 'overview');
  }
  function install(root) {
    if (!root || boundRoot === root) return;
    if (rootObserver) {rootObserver.disconnect(); rootObserver=null;}
    boundRoot = root;
    overviewCache=null;
    window.TrinoTimeDashboardFreshness?.reset('store');
    root.classList.add('tt-so-hub');
    const shell = $(root,'.tt-ops-shell');
    const hero = $(root,'.tt-pod-dispatch-hero');
    if (!shell || !hero) return;
    const title = $(hero,'h2');if (title) title.textContent = 'Store Operations';
    const subtitle = $(hero,'p');if (subtitle) subtitle.textContent = 'One workspace for current instructions, store queues, confirmed activity, and recent history.';
    const eyebrow = $(hero,'.tt-pod-dispatch-eyebrow');if (eyebrow) eyebrow.textContent = 'POD · Store Operations';

    let nav = $(root,'[data-tt-so-tabs]');
    if (!nav) {
      nav=create('div','tt-so-tabs');nav.dataset.ttSoTabs='';
      nav.setAttribute('role','tablist');nav.setAttribute('aria-label','Store Operations sections');
      for (const [id,label] of TABS) {
        const btn=create('button','tt-so-tab',label);btn.type='button';btn.dataset.ttSoTab=id;
        btn.setAttribute('role','tab');btn.setAttribute('aria-controls','ttPodDispatchRoot');
        btn.setAttribute('aria-selected','false');
        btn.addEventListener('click',()=>applyTab(root,id));
        nav.append(btn);
      }
      hero.insertAdjacentElement('afterend',nav);
    }
    if (!$(root,'[data-tt-so-overview]')) {
      const overview=create('section','tt-so-overview');overview.dataset.ttSoOverview='';
      overview.setAttribute('aria-label','Store Operations overview');
      nav.insertAdjacentElement('afterend',overview);
    }
    if (!$(root,'[data-tt-so-performance-note]')) {
      const note=create('div','tt-so-performance-note','Performance displays the selected day’s observed Tracker jobs, confirmed submissions, active time and store mappings. It does not grade Agents or prove a Team Leader’s published queue was completed.');
      note.dataset.ttSoPerformanceNote='';note.hidden=true;
      const reportHost=$(root,'#ttPodStorePerformanceHost');
      if (reportHost) reportHost.insertAdjacentElement('beforebegin',note);else shell.append(note);
    }
    if (!$(root,'[data-tt-so-history-note]')) {
      const note=create('div','tt-so-history-note','History displays the previous seven days of server-authorized observed jobs and store trends. It does not represent a full audit of previously published TL instructions.');
      note.dataset.ttSoHistoryNote='';note.hidden=true;
      const reportHost = $(root,'#ttPodStorePerformanceHost');
      if (reportHost) reportHost.insertAdjacentElement('beforebegin',note);else shell.append(note);
    }
    if (!$(root,'[data-tt-so-report-notice]')) {
      const warning=create('p','tt-so-notice','Store reports will appear once your signed-in POD and the report service have been verified. Open Work Control to refresh your authorized POD.');
      warning.dataset.ttSoReportNotice='';warning.hidden=true;
      const reportHost=$(root,'#ttPodStorePerformanceHost');
      if (reportHost) reportHost.insertAdjacentElement('beforebegin',warning);else shell.append(warning);
    }
    rootObserver = new MutationObserver(records => {
      // Manager may rebuild the panel when the TL changes: never cache viewer/store data.
      let rebind = false;
      for (const record of records) {
        if (record.type==='attributes' && record.target===root && record.attributeName==='hidden') {
          if (!root.hidden) { renameExistingNav(); activate(root); } else overviewCache=null;
        }
        if (record.type==='childList' && [...record.addedNodes].some(n=>n.nodeType===1 && (n.matches?.('.tt-sp-panel,.tt-si-panel') || n.querySelector?.('.tt-sp-panel,.tt-si-panel')))) rebind = true;
        if (record.type==='childList' || record.type==='characterData') {
          const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
          // Update the read-only Overview after an authenticated async roster,
          // dispatch, or queue load finishes. Never use the prior account's state.
          if (target?.closest?.('[data-current-store],[data-current-workflow],[data-queue-count]')) rebind = true;
        }
      }
      if (rebind && lastReportPanel && lastReportPanel!==$(root,'.tt-sp-panel')) window.TrinoTimeDashboardFreshness?.reset('store');
      if (rebind && !root.hidden && root.dataset.ttStoreHubTab==='overview') paintOverview(root);
    });
    rootObserver.observe(root,{attributes:true,attributeFilter:['hidden'],childList:true,characterData:true,subtree:true});
    if (!root.hidden) activate(root);
  }
  function discover() {
    renameExistingNav();
    const root=document.getElementById(ROOT_ID);
    if (root && root !== boundRoot) install(root);
    return !!root;
  }
  document.addEventListener('click', event => {
    const trigger = event.target?.closest?.('[data-tt-nav="pod-work"]');
    if (trigger) {
      queueMicrotask(() => {
        discover();
        // Manager's existing click listener opens the original POD page.
        const root=document.getElementById(ROOT_ID);
        if (root && !root.hidden) activate(root);
      });
    }
  }, true);
  document.addEventListener('trinotime:store-report-updated', event => {
    const r=event.detail;
    if(!r||!['day','7d'].includes(r.period)||!r.viewer||!Number.isFinite(r.receivedAt))return;
    // A new session or POD selection cannot reuse a previous report.
    const root=document.getElementById(ROOT_ID);if(!root||root.hidden)return;
    const actor=actorForDisplay();const selectedPod=String($(root,'[data-store-plan-pod]')?.value||'').trim();
    if(!actor||!selectedPod||!matchesVerifiedViewer(root,actor,r.viewer))return;
    if(actor.role==='admin' && normalize(r.selectedPod)!==normalize(selectedPod))return;
    if(actor.role==='team_leader' && (normalize(actor.pod)!==normalize(selectedPod)||normalize(r.viewer.pod)!==normalize(selectedPod)))return;
    if(String($(root,'[data-store-plan-date]')?.value||'')!==r.date)return;
    // Overview always uses the daily report; weekly History must not overwrite it.
    if(r.period==='day'){lastReport=r;lastReportPanel=$(root,'.tt-sp-panel');}
    const shownTab=root.dataset.ttStoreHubTab||'overview';
    if((r.period==='day'&&shownTab!=='history')||(r.period==='7d'&&shownTab==='history'))
      window.TrinoTimeDashboardFreshness?.success('store',String(actor.role)+'|'+String(actor.name)+'|'+selectedPod);
    if(r.period==='day'&&shownTab==='overview')paintOverview(root);
  });
  document.addEventListener('trinotime:store-context', () => {
    queueMicrotask(() => {
      discover();
      const root=document.getElementById(ROOT_ID);
      if (root && !root.hidden && root.dataset.ttStoreHubTab === 'overview') paintOverview(root);
    });
  });
  window.addEventListener('pageshow',discover);
  if (!discover()) {
    // Observe only until the existing manager first creates its page.
    const finder = new MutationObserver(() => {if (discover()) finder.disconnect();});
    finder.observe(document.body,{childList:true,subtree:true});
  }
  // POD manager can recreate the button after a login/role change (its 2-second loop).
  // Keep only its presentation label in sync; the manager owns authorization.
  navRetry = window.setInterval(() => {if (!document.hidden) renameExistingNav();},2200);
})();
