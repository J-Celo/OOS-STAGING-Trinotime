(() => {
  'use strict';
  if (window.__ttCoverageDashboardV1) return;
  window.__ttCoverageDashboardV1 = true;
  window.__ttCoverageDashboardBuild = 'RC20';
  window.__ttCoveragePremiumNavBuild = 'RC20';

  const DAILY_SUBMIT_TARGET = 300;
  const ACTIVE_DAY_HOURS = 8;
  const DEFAULT_IDLE_THRESHOLD_MS = 5 * 60 * 1000;
  const state = {
    active:false, actorKey:'', date:'', dashboard:null, bridge:null, refreshTimer:null,
    busy:false, refreshQueued:false, hiddenSnapshot:null, lastSignature:'', lastPollAt:0,
    errorBackoffUntil:0, statusFilter:'all', followShift:true, activeShiftReportDate:''
  };
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const phtDate = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const fmtInt = value => Number(value || 0).toLocaleString();
  const fmtSigned = value => { const n=Math.trunc(Number(value)||0); return n>0?`+${n.toLocaleString()}`:n.toLocaleString(); };
  const submittedTotal = row => Math.max(0, Number(row?.submittedDisplayTotal ?? ((Number(row?.submitted)||0)+(Number(row?.submittedManualAdjustment)||0))) || 0);
  const submittedBreakdown = row => { const c=Math.max(0,Number(row?.submitted)||0),m=Math.trunc(Number(row?.submittedManualAdjustment)||0); return m?`${fmtInt(c)} confirmed · ${fmtSigned(m)} manual`:'Confirmed tasks'; };
  const awayTotalMs = row => Math.max(0, Number(row?.awayMs) || 0);
  const hasAwayTiming = row => row?.awayTimingAvailable === true;
  const idleOnlyMs = row => hasAwayTiming(row) ? Math.max(0, (Number(row?.idleMs) || 0) - awayTotalMs(row)) : Math.max(0, Number(row?.idleMs) || 0);

  function fmtDuration(ms){
    ms=Math.max(0,Number(ms)||0);
    const total=Math.floor(ms/60000),h=Math.floor(total/60),m=total%60;
    return h?`${h}h ${String(m).padStart(2,'0')}m`:`${m}m`;
  }
  function fmtLiveDuration(ms){
    const total=Math.max(0,Math.floor((Number(ms)||0)/1000)),h=Math.floor(total/3600),m=Math.floor((total%3600)/60),sec=total%60;
    return h?`${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`:`${m}:${String(sec).padStart(2,'0')}`;
  }
  function fmtAgo(ts){
    const n=Number(ts)||0;
    if(!n)return 'Not synced';
    const diff=Math.max(0,Date.now()-n);
    if(diff<5000)return 'Synced just now';
    if(diff<60000)return `Synced ${Math.max(1,Math.floor(diff/1000))}s ago`;
    if(diff<3600000)return `Synced ${Math.floor(diff/60000)}m ago`;
    return `Synced ${Math.floor(diff/3600000)}h ago`;
  }
  function fmtLastSync(ts){
    const n=Number(ts)||0;
    if(!n)return 'Never synced';
    const diff=Math.max(0,Date.now()-n);
    if(diff<5000)return 'Last sync just now';
    if(diff<60000)return `Last sync ${Math.max(1,Math.floor(diff/1000))}s ago`;
    if(diff<3600000)return `Last sync ${Math.floor(diff/60000)}m ago`;
    return `Last sync ${Math.floor(diff/3600000)}h ago`;
  }
  function liveShiftSelected(){ return Boolean(state.activeShiftReportDate && state.activeShiftReportDate===state.date); }
  function prettyDate(date){
    const raw=String(date||phtDate());
    const parsed=new Date(`${raw}T12:00:00+08:00`);
    const formatted=Number.isNaN(parsed.getTime())?raw:new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Manila',month:'short',day:'numeric',year:'numeric'}).format(parsed);
    return liveShiftSelected()?`Active shift · ${formatted}`:raw===phtDate()?`Today · ${formatted}`:`${formatted} · Historical`;
  }
  function shellRoleHint(){
    // RC17: resolve the live shell role from several independent presentation bridges.
    // The executive strip is driven directly by TrinoTime's internal isAdmin state, so
    // it remains a reliable hint even if body[data-trino-role] or the lazy Admin profile
    // bridge has not caught up yet. This hint only chooses the authentication path; the
    // Worker still re-validates the real server-side role and rejects mismatches.
    try{
      const bodyRole=normalizedRole(document.body?.dataset?.trinoRole||'');
      if(['admin','team_leader','agent'].includes(bodyRole))return {role:bodyRole,source:'body'};
      const sessionRole=normalizedRole(document.getElementById('sessionIndicator')?.dataset?.role||'');
      if(['admin','team_leader','agent'].includes(sessionRole))return {role:sessionRole,source:'session-indicator'};
      const executiveRole=String(document.getElementById('executiveStatusRole')?.textContent||'').trim().toLowerCase();
      if(executiveRole==='executive admin'||executiveRole==='admin')return {role:'admin',source:'executive-strip'};
      if(executiveRole.startsWith('team leader'))return {role:'team_leader',source:'executive-strip'};
    }catch(_){}
    return {role:'',source:'none'};
  }
  function shellIdentityActor(){
    const shell=shellRoleHint();
    const role=normalizedRole(shell.role);
    if(!['agent','team_leader'].includes(role))return null;
    let name='',pod='';
    try{
      const profile=document.querySelector('#agentProfileHeaderBtn .tt-profile-header-copy');
      const profileName=String(profile?.querySelector('strong')?.textContent||'').trim();
      const roleLine=String(profile?.querySelector('.tt-profile-role')?.textContent||'').trim();
      if(profileName&&!/^my profile$/i.test(profileName)&&!/^administrator$/i.test(profileName))name=profileName;
      const podMatch=roleLine.match(/·\s*(.+)$/);
      if(podMatch)pod=String(podMatch[1]||'').trim();
    }catch(_){}
    try{
      const indicator=document.getElementById('sessionIndicator');
      const text=String(indicator?.textContent||'').replace(/\s+/g,' ').trim();
      if(role==='agent'&&text){
        const match=text.match(/AGENT\s*·\s*(.+?)(?:\s*·\s*(.+))?$/i);
        if(match){if(!name)name=String(match[1]||'').trim();if(!pod&&match[2])pod=String(match[2]||'').trim();}
      }else if(role==='team_leader'&&text){
        const match=text.match(/TL\s*-\s*(.+?)\s*-\s*(.+?)(?:\s*-\s*BACKUP)?$/i);
        if(match){if(!name)name=String(match[1]||'').trim();if(!pod)pod=String(match[2]||'').trim();}
      }
    }catch(_){}
    if(!name)return null;
    return {role,name,pod,_source:'premium-shell'};
  }
  function actor(){
    const shell=shellRoleHint();
    try{
      const verifiedAdminProfile=window.TrinoTimeAdminProfile?.current?.()||null;
      if(shell.role==='admin'||verifiedAdminProfile)return {role:'admin',name:'Admin',pod:'',_source:verifiedAdminProfile?'admin-profile':shell.source};
    }catch(_){
      if(shell.role==='admin')return {role:'admin',name:'Admin',pod:'',_source:shell.source};
    }
    try{
      const messaging=window.TrinoTimeMessagingSessionContext?.getActor?.()||null;
      if(messaging)return {...messaging,_source:'messaging'};
    }catch(_){}
    return shellIdentityActor();
  }
  function actorSig(a){ return a?`${a.role}|${a.name}|${a.pod}`:''; }
  function normalizedRole(value){
    const role=String(value||'').trim().toLowerCase().replace(/[\s-]+/g,'_');
    if(role==='teamleader'||role==='team_leader'||role==='tl')return 'team_leader';
    if(role==='datalabeler'||role==='data_labeler'||role==='agent')return 'agent';
    if(role==='administrator'||role==='admin')return 'admin';
    return role;
  }
  function assertDashboardViewerBinding(a,dashboard){
    const expected=normalizedRole(a?.role),actual=normalizedRole(dashboard?.viewer?.role);
    if(!['admin','team_leader','agent'].includes(actual)){
      throw Object.assign(new Error('Coverage returned an invalid viewer role. Refresh TrinoTime after the server update.'),{code:'COVERAGE_RESPONSE_INVALID'});
    }
    if(expected&&expected!==actual){
      throw Object.assign(new Error(`Coverage session identity mismatch (${expected} page / ${actual} server). Refresh TrinoTime or sign in again.`),{code:'COVERAGE_SESSION_BINDING_MISMATCH'});
    }
    const scopeForRole={admin:'all-pods',team_leader:'own-pod',agent:'self'};
    if(dashboard?.ok!==true||dashboard?.authority!=='workforce-coverage-v1'||dashboard?.scope!==scopeForRole[actual]||!Array.isArray(dashboard?.agents)||!Array.isArray(dashboard?.pods)){
      throw Object.assign(new Error('Coverage returned an invalid dashboard response. Retry after the server update.'),{code:'COVERAGE_RESPONSE_INVALID'});
    }
    if(expected==='agent'){
      const client=String(a?.name||'').trim().toLowerCase(),server=String(dashboard?.viewer?.name||'').trim().toLowerCase();
      if(client&&server&&client!==server)throw Object.assign(new Error('Coverage Agent identity changed. Refresh TrinoTime or sign in again.'),{code:'COVERAGE_SESSION_BINDING_MISMATCH'});
    }
  }
  function friendlyPodLabel(raw,preferred=''){
    const explicit=String(preferred||'').trim();
    if(explicit&&!/^tt-custom-pod:/i.test(explicit))return explicit;
    const pod=String(raw||'').trim();
    try{
      const resolved=String(window.TrinoTimePodDisplayLabel?.(pod)||'').trim();
      if(resolved&&!/^tt-custom-pod:/i.test(resolved)&&!/^assigned pod$/i.test(resolved)&&!/^unassigned$/i.test(resolved))return resolved;
    }catch(_){}
    const custom=pod.match(/^tt-custom-pod:([^:]+):/i);
    if(custom){
      const team=String(custom[1]||'').toLowerCase();
      if(team==='cwh')return 'CWH Team';
      if(team==='albertsons')return 'Albertsons Team';
      return 'Assigned Team';
    }
    return pod||'Unassigned';
  }

  async function authHeaders(method='GET'){
    const headers={Accept:'application/json'};
    if(!['GET','HEAD'].includes(method))headers['Content-Type']='application/json';
    const a=actor();
    const expectedRole=normalizedRole(a?.role);
    if(expectedRole)headers['X-TT-Coverage-Expected-Role']=expectedRole;
    // RC14: Admin pages must never send a remembered Agent/TL workforce
    // security token. That token is valid, but would intentionally scope the
    // server response to the old identity and make Admin appear as "My data".
    if(normalizedRole(a?.role)!=='admin'){
      const token=String(window.TrinoTimeMessagingSessionContext?.getSecuritySessionToken?.()||'');
      if(token)headers['X-TT-Security-Session']=token;
    }
    if(!headers['X-TT-Security-Session']){
      try{
        const user=window.firebase?.auth?.().currentUser;
        if(user&&!user.isAnonymous&&typeof user.getIdToken==='function')headers.Authorization=`Bearer ${await user.getIdToken(false)}`;
      }catch(_){}
    }
    if(!headers['X-TT-Security-Session']&&!headers.Authorization)throw Object.assign(new Error('Your secure TrinoTime session is not ready. Sign in again.'),{code:'COVERAGE_AUTH_REQUIRED'});
    return headers;
  }
  async function api(path,{method='GET',body}={}){
    method=String(method).toUpperCase();
    const headers=await authHeaders(method);
    const response=await fetch('/api/workforce/coverage/'+String(path||'').replace(/^\/+/,''),{
      method,headers,cache:'no-store',credentials:'same-origin',...(body===undefined?{}:{body:JSON.stringify(body)})
    });
    let data;
    try{data=await response.json();}
    catch(_){throw Object.assign(new Error(`Coverage returned a non-JSON response (HTTP ${response.status}). Retry or check the TrinoTime API deployment.`),{code:'COVERAGE_RESPONSE_INVALID',status:response.status});}
    if(!response.ok){
      const e=new Error(data?.message||`Coverage authority returned ${response.status}.`);
      e.code=data?.error||'COVERAGE_API_ERROR';e.status=response.status;throw e;
    }
    return data||{};
  }

  window.TrinoTimeCoverageBridge = Object.freeze({
    issueToken: async ({deviceId='',deviceName='Coverage Activity Tracker'}={}) => api('bridge-token',{method:'POST',body:{deviceId,deviceName}}),
    status: async () => api('bridge-status'),
    getActor: () => actor()
  });
  window.TrinoTimeCoverageDiagnostics = Object.freeze({
    snapshot: () => ({
      build:window.__ttCoverageDashboardBuild,
      shell:shellRoleHint(),
      clientActor:actor(),
      serverViewer:state.dashboard?.viewer||null,
      serverScope:state.dashboard?.scope||null,
      serverBuild:state.dashboard?.serverBuild||null,
      bodyRole:String(document.body?.dataset?.trinoRole||''),
      sessionRole:String(document.getElementById('sessionIndicator')?.dataset?.role||''),
      executiveRole:String(document.getElementById('executiveStatusRole')?.textContent||'').trim()
    })
  });

  function coverageIcon(){return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="7" height="7" rx="1.5"></rect><rect x="14" y="4" width="7" height="7" rx="1.5"></rect><rect x="3" y="15" width="7" height="5" rx="1.5"></rect><path d="M14 18h7M17.5 14.5V21.5"></path></svg>`;}
  function calendarIcon(){return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M16 3v4M8 3v4M3 10h18"></path></svg>`;}
  function ensureSidebarButton(){
    const nav=document.querySelector('#ttPremiumSidebar .tt-premium-nav');
    if(!nav)return null;
    let btn=nav.querySelector('[data-tt-nav="coverage"]');
    if(!btn){
      btn=document.createElement('button');
      btn.className='tt-premium-nav-btn';btn.type='button';btn.dataset.ttNav='coverage';btn.dataset.ttTooltip='Coverage';btn.setAttribute('aria-label','Coverage');
      btn.innerHTML=`${coverageIcon()}<span class="tt-nav-label">Coverage</span>`;
      const reports=nav.querySelector('[data-tt-nav="reports"]'),workforce=nav.querySelector('[data-tt-nav="workforce"]');
      if(reports)nav.insertBefore(btn,reports);else if(workforce)workforce.insertAdjacentElement('afterend',btn);else nav.appendChild(btn);
    }
    return btn;
  }
  function buildUi(){
    ensureSidebarButton();
    const mainContent=$('mainContent');if(!mainContent||!mainContent.parentNode)return;
    let nav=$('ttCoverageWorkspaceTabs');
    if(!nav){
      const anchor=$('teamTabsOuter')||mainContent;
      nav=document.createElement('div');
      nav.id='ttCoverageWorkspaceTabs';nav.className='tt-coverage-workspace-tabs';nav.hidden=true;
      nav.innerHTML=`<button type="button" class="tt-coverage-workspace-tab is-active" data-tt-workspace="workforce">Workforce</button><button type="button" class="tt-coverage-workspace-tab" data-tt-workspace="coverage">Coverage</button>`;
      anchor.parentNode.insertBefore(nav,anchor);
      nav.addEventListener('click',event=>{const btn=event.target.closest('[data-tt-workspace]');if(btn)setView(btn.dataset.ttWorkspace);});
    }
    if(!$('ttCoverageRoot')){
      const main=document.createElement('section');
      main.id='ttCoverageRoot';main.className='tt-coverage-root';main.hidden=true;
      main.innerHTML=`<div class="tt-coverage-shell"><div class="tt-coverage-loading">Coverage dashboard is ready when you are.</div></div>`;
      mainContent.parentNode.insertBefore(main,mainContent);
    }
    if(!$('ttCoverageDrawerBackdrop')){
      const drawer=document.createElement('div');
      drawer.id='ttCoverageDrawerBackdrop';drawer.className='tt-coverage-drawer-backdrop';drawer.hidden=true;
      drawer.innerHTML='<aside class="tt-coverage-drawer" id="ttCoverageDrawer" role="dialog" aria-modal="true" aria-label="Coverage agent details"></aside>';
      document.body.appendChild(drawer);
      drawer.addEventListener('click',event=>{if(event.target===drawer||event.target.closest('[data-coverage-close]'))closeDrawer();});
    }
  }
  const coverageSurfaceIds=['mainContent','teamTabsOuter','podTabsOuter','ttAdminCommandBar','ttPremiumRightRail'];
  function setView(view){
    buildUi();
    if(view==='coverage')document.dispatchEvent(new CustomEvent('trinotime:workspace-opening',{detail:'coverage'}));
    const next=view==='coverage',was=state.active,coverage=$('ttCoverageRoot');
    if(next&&!was){state.hiddenSnapshot={};state.followShift=true;state.date=phtDate();state.lastSignature='';for(const id of coverageSurfaceIds){const node=$(id);if(node)state.hiddenSnapshot[id]=node.hidden;}}
    state.active=next;
    document.documentElement.classList.toggle('tt-coverage-workspace-active',next);
    for(const btn of document.querySelectorAll('[data-tt-workspace]'))btn.classList.toggle('is-active',btn.dataset.ttWorkspace===(next?'coverage':'workforce'));
    for(const btn of document.querySelectorAll('[data-tt-nav]')){if(btn.dataset.ttNav==='coverage')btn.classList.toggle('is-active',next);else if(next)btn.classList.remove('is-active');}
    if(coverage)coverage.hidden=!next;
    if(next){for(const id of coverageSurfaceIds){const node=$(id);if(node)node.hidden=true;}}
    else if(was){for(const id of coverageSurfaceIds){const node=$(id);if(node)node.hidden=Boolean(state.hiddenSnapshot&&state.hiddenSnapshot[id]);}state.hiddenSnapshot=null;}
    if(next)refresh(true);
  }

  function metric(label,value,small='',extra=''){return `<article class="tt-coverage-metric ${extra}"><span>${esc(label)}</span><strong>${esc(value)}</strong>${small?`<small>${esc(small)}</small>`:''}</article>`;}
  function performanceView(row,agentCount=1){
    const isAggregate=row?.submittedConfirmed!==undefined&&row?.submittedDisplayTotal===undefined;
    const submitted=isAggregate?Math.max(0,Number(row?.submitted)||0):submittedTotal(row),activeMs=Math.max(0,Number(row?.activeMs)||0),count=Math.max(1,Number(agentCount)||1),target=DAILY_SUBMIT_TARGET*count;
    const activeHours=activeMs/3600000,pace=activeHours>=1/12?submitted/activeHours:null;
    const projection=pace===null?null:Math.round(pace*ACTIVE_DAY_HOURS*count);
    // M2.9.53: Daily target completion display tops out at 100%; submitted totals remain real.
    const progress=target?Math.min(100,Math.max(0,Math.round((submitted/target)*100))):0;
    return {submitted,activeMs,target,pace,projection,progress,onPace:projection!==null?projection>=target:null};
  }
  function statusLabel(row){
    if(!row?.connected||row?.shiftLocked===true||row?.shiftStatus==='completed'||!row?.timeInAtLastSync)return 'offline';
    const syncAt=Number(row.serverUpdatedAtMs)||0,syncAge=syncAt?Math.max(0,Date.now()-syncAt):Infinity;
    if(syncAge>180000)return 'offline';
    if(syncAge>90000)return 'stale';
    if(row.pendingSubmission===true)return 'submitting';
    const live=String(row.trackerState||'unknown').toLowerCase(),threshold=Math.max(60000,Number(row.idleThresholdMs)||DEFAULT_IDLE_THRESHOLD_MS),last=Number(row.lastActivityAt)||0;
    if(live==='active'&&row.currentJob&&last&&Date.now()-last>threshold+30000)return 'idle';
    return ['active','idle','away','paused','ready','unknown'].includes(live)?live:'unknown';
  }
  // UX18P35: server-authorized same-shift alternate workflow activity.
  // Never reuse it as a Coverage submission count or accepted Coverage ACK.
  function alternateWorkflowPresentation(row){
    if(row?.attendanceStatus!=='timed_in')return null;
    const other=row?.alternateWorkflow;
    if(other?.workflow!=='confirmation')return null;
    const accepted=Number(other.acceptedAtMs)||0,activity=Number(other.lastActivityAtMs)||0,now=Date.now();
    if(!accepted||accepted>now+30000||now-accepted>90000)return null;
    const working=other.trackerState==='active'&&other.hasJob===true&&activity>0&&activity<=now+30000&&now-activity<=90000;
    return {label:working?'CONFIRMATION ACTIVE':'CONFIRMATION SYNCED',acceptedAtMs:accepted,working};
  }
  function statusPresentation(row){
    const pv=presenceView(row),att=String(row?.attendanceStatus||'unverified');
    if(att==='timed_in') {
      const delayed=['stale','offline'].includes(pv.status),other=delayed?alternateWorkflowPresentation(row):null;
      return {status:'timed_in',label:'TIME IN',tracker:other?other.label:(delayed?'SYNC STALE':`TRACKER ${pv.status.toUpperCase()}`),
        trackerWarning:delayed&&!other,detail:other?`Time In · ${other.working?'Confirmation activity':'Confirmation sync'} server-accepted ${fmtLastSync(other.acceptedAtMs)} · Coverage last accepted ${fmtLastSync(row?.serverUpdatedAtMs)}. Coverage pending work is not confirmed.`:(delayed?`Time In confirmed · Coverage sync not current · ${fmtLastSync(row?.serverUpdatedAtMs)}. Check Tracker Sync Health; pending tasks may not be accepted.`:pv.detail)};
    }
    if(att==='timed_out')return {status:'timed_out',label:'TIME OUT',tracker:'HISTORICAL TRACKER',trackerWarning:false,
      detail:'Attendance Time Out confirmed · prior accepted Tracker activity retained.'};

    if(row?.dayOffStatus==='day_off')return {status:'day_off',label:'DAY OFF',tracker:'SCHEDULED DAY OFF',trackerWarning:false,
      detail:'Day off confirmed for the selected date · no active Attendance shift. Earlier accepted productivity is historical.'};
    if(row?.dayOffStatus==='not_scheduled')return {status:'offline',label:'OFFLINE',tracker:'TRACKER OFFLINE',trackerWarning:false,
      detail:'No Time In verified and no scheduled day off for this date · '+fmtLastSync(row?.serverUpdatedAtMs)};
    return {status:pv.status,label:pv.status.toUpperCase(),tracker:'ATTENDANCE UNVERIFIED',trackerWarning:false,
      detail:pv.status==='offline'?`Time In not verified · ${fmtLastSync(row?.serverUpdatedAtMs)}`:`Last Tracker sync reported Time In; current Attendance not independently verified · ${fmtLastSync(row?.serverUpdatedAtMs)}`};
  }
  function statusBucket(row){
    if(row?.attendanceStatus!=='timed_in'&&row?.attendanceStatus!=='timed_out'&&row?.dayOffStatus==='day_off')return 'day_off';
    const status=statusLabel(row);
    if(row?.attendanceStatus==='timed_in' && ['stale','offline'].includes(status))return 'time_in';
    if(status==='stale'||status==='offline')return 'offline';
    if(['active','idle','away'].includes(status))return status;
    return 'other';
  }
  function presenceView(row){
    const status=statusLabel(row),now=Date.now(),threshold=Math.max(60000,Number(row?.idleThresholdMs)||DEFAULT_IDLE_THRESHOLD_MS),last=Number(row?.lastActivityAt)||0;
    if(status==='idle'){
      const noInput=last?Math.max(0,now-last):0,idleSince=Number(row?.idleSinceAt)||((last||now)+threshold),idleNow=Math.max(0,now-idleSince);
      const noJob=!row?.currentJob;
      return {status,detail:'Time In verified · '+(noJob?`No job selected · ${fmtLiveDuration(idleNow)}`:(noInput?`No input ${fmtLiveDuration(noInput)}`:'Idle now')),idleNow:`Idle ${fmtLiveDuration(idleNow)}`,currentIdleMs:idleNow};
    }
    if(status==='away'){
      const since=Number(row?.awaySinceAt)||Number(row?.presenceUpdatedAt)||Number(row?.serverUpdatedAtMs)||now,awayMs=Math.max(0,now-since);
      return {status,detail:`Time In verified · Away ${fmtLiveDuration(awayMs)}`,idleNow:`Away ${fmtLiveDuration(awayMs)}`,currentIdleMs:awayMs};
    }
    if(status==='paused')return {status,detail:'Time In verified · Managed tracker paused',idleNow:'—',currentIdleMs:0};
    if(status==='submitting')return {status,detail:'Time In verified · Waiting for task transition',idleNow:'—',currentIdleMs:0};
    if(status==='stale')return {status,detail:`Time In verified at last sync · Tracker delayed · ${fmtLastSync(row?.serverUpdatedAtMs)}`,idleNow:'—',currentIdleMs:0};
    if(status==='offline')return {status,detail:row?.timeOutRecorded?'Time Out recorded · shift locked':row?.serverUpdatedAtMs?`Tracker offline · ${fmtLastSync(row.serverUpdatedAtMs)}`:'Not synced / Time In not verified',idleNow:'—',currentIdleMs:0};
    if(status==='ready')return {status,detail:'Time In verified · Ready · no open Coverage task',idleNow:'—',currentIdleMs:0};
    if(status==='active')return {status,detail:`Time In verified · Working · ${fmtDuration(row?.activeMs)} active today`,idleNow:'—',currentIdleMs:0};
    return {status,detail:'Waiting for tracker state',idleNow:'—',currentIdleMs:0};
  }
  function dashboardSignature(d,b){
    const rows=(d?.agents||[]).map(r=>[r.name,r.pod,r.submitted,r.submittedManualAdjustment,r.submittedDisplayTotal,r.created,r.blurred,r.deleted,r.noMatch,r.productMatched,r.activeMs,r.idleMs,r.awayMs,r.awayTimingAvailable,r.currentJob,r.currentTask,r.totalTasks,r.pendingSubmission,r.trackerState,r.lastActivityAt,r.idleSinceAt,r.awaySinceAt,r.presenceUpdatedAt,r.idleThresholdMs,r.shiftGeneration||0,r.shiftStatus||'',r.shiftLocked?1:0,r.liveNow?1:0,r.delayedNow?1:0,r.timeInAtLastSync?1:0,r.attendanceStatus||'',r.dayOffStatus||'',r.alternateWorkflow?.workflow||'',r.alternateWorkflow?.acceptedAtMs||0,r.alternateWorkflow?.trackerState||'',r.alternateWorkflow?.lastActivityAtMs||0,r.alternateWorkflow?.hasJob?1:0,r.serverUpdatedAtMs].join(':')).join('|');
    return [d?.date,d?.scope,d?.serverRevision,rows,b?.connected,b?.connections?.[0]?.lastSyncAt].join('~');
  }
  function streamState(d){
    if(state.date!==phtDate()&&!liveShiftSelected())return {label:'HISTORY',cls:'is-history',detail:'Selected date'};
    const rev=Number(d?.serverRevision)||0;
    if(!rev){
      const last=state.bridge?.connections?.find?.(c=>c.lastSyncAt)?.lastSyncAt;
      return {label:'WAITING',cls:'is-waiting',detail:last?'Tracker linked · no records for this date':'No tracker sync'};
    }
    const age=Math.max(0,Date.now()-rev);
    if(Number(d?.totals?.liveAgents)>0&&age<=90000)return {label:'LIVE',cls:'is-live',detail:fmtAgo(rev)};
    if(Number(d?.totals?.delayedAgents)>0&&age<=180000)return {label:'DELAYED',cls:'is-delayed',detail:fmtAgo(rev)};
    if(age<=180000)return {label:'UPDATED',cls:'is-waiting',detail:'No live Time In + Tracker confirmation'};
    return {label:'OFFLINE',cls:'is-offline',detail:fmtAgo(rev)};
  }
  function liveBadge(d){
    const st=streamState(d);
    return `<span class="tt-coverage-stream ${st.cls}" data-coverage-stream title="TrinoTime M2.9.49 · ${esc(state.date)} · ${esc(d?.dateSource||'unknown-date-source')}"><i></i><b data-coverage-stream-label>${esc(st.label)}</b><small data-coverage-live-age>${esc(st.detail)}</small></span>`;
  }
  function presenceCounts(d){
    const counts={all:0,active:0,idle:0,away:0,time_in:0,day_off:0,offline:0,other:0};
    for(const row of d?.agents||[]){counts.all++;counts[statusBucket(row)]++;}
    return counts;
  }
  function presenceSummary(d){
    const counts=presenceCounts(d);
    const items=[['all','All'],['active','Active'],['idle','Idle'],['away','Away'],['time_in','Time In · Sync Issue'],['day_off','Day Off'],['offline','Offline']];
    if(counts.other)items.push(['other','Other']);
    return `<div class="tt-coverage-presence-summary" aria-label="Coverage live status filter">${items.map(([key,label])=>`<button type="button" class="tt-coverage-presence-chip ${state.statusFilter===key?'is-selected':''}" data-coverage-filter="${key}"><span>${label}</span><b data-coverage-status-count="${key}">${fmtInt(counts[key])}</b></button>`).join('')}</div>`;
  }
  function dateControl(){
    return `<label class="tt-coverage-date-control" title="Choose Coverage date"><span class="tt-coverage-date-label">${esc(prettyDate(state.date))}</span><span class="tt-coverage-calendar">${calendarIcon()}</span><input class="tt-coverage-date" id="ttCoverageDate" type="date" value="${esc(state.date)}" aria-label="Coverage date"></label>`;
  }
  function submittedMetric(d){
    const t=d?.totals||{},manual=Math.trunc(Number(t.submittedManualAdjustment)||0),count=Math.max(1,(d?.agents||[]).length),perf=performanceView(t,count);
    const breakdown=manual?`${fmtInt(t.submittedConfirmed)} confirmed · ${fmtSigned(manual)} manual`:'Confirmed tasks';
    const pace=perf.pace===null?'Pace calculating':`${perf.pace.toFixed(1)}/hr`;
    const projection=state.date===phtDate()&&perf.projection!==null?` · projected ${fmtInt(perf.projection)} @ 8h active`:'';
    return `<article class="tt-coverage-metric tt-coverage-submitted-target"><span>Submitted</span><div class="tt-coverage-target-line"><strong>${fmtInt(t.submitted)}</strong><em>/ ${fmtInt(perf.target)}</em></div><div class="tt-coverage-progress" aria-label="${Math.max(0,perf.progress)} percent of daily target"><i style="width:${Math.max(0,Math.min(100,perf.progress))}%"></i></div><small>${esc(breakdown)}</small><small class="tt-coverage-pace">${Math.max(0,perf.progress)}% · ${esc(pace+projection)}</small></article>`;
  }
  function summaryCards(d){
    const t=d?.totals||{};
    const separateAway=(Number(t.connectedAgents)||0)===0||(Number(t.awayTimingAgents)||0)>=(Number(t.connectedAgents)||0);
    const idleValue=separateAway?fmtDuration(Math.max(0,(Number(t.idleMs)||0)-(Number(t.awayMs)||0))):fmtDuration(t.idleMs);
    const idleNote=separateAway?'Focused inactivity':'Includes Away · legacy Tracker';
    const awayValue=separateAway?fmtDuration(t.awayMs):'—';
    const awayNote=separateAway?'Hidden / unfocused':'Requires Tracker v2.0.12';
    const taskCards=`${submittedMetric(d)}${metric('Created',fmtInt(t.created),'Net HUMAN boxes','is-created')}${metric('Blurred',fmtInt(t.blurred),'Net Person boxes','is-blurred')}${metric('Deleted',fmtInt(t.deleted),'User deletions','is-deleted')}${metric('No Match',fmtInt(t.noMatch),'Explicit no-match','is-no-match')}${metric('Product Match',fmtInt(t.productMatched),'Net confirmed matches','is-product-match')}`;
    const presenceCards=`${metric('Active',fmtDuration(t.activeMs),'Tracker estimate','is-active')}${metric('Idle',idleValue,idleNote,'is-idle')}${metric('Away',awayValue,awayNote,'is-away')}`;
    return `<div class="tt-coverage-summary-stack"><section class="tt-coverage-metric-section tt-coverage-task-section"><div class="tt-coverage-metric-section-head"><div><span>Task activity</span><h3>Coverage counters</h3></div><small>Operational counts · retained state</small></div><div class="tt-coverage-metrics tt-coverage-task-metrics">${taskCards}</div></section><section class="tt-coverage-metric-section tt-coverage-presence-section"><div class="tt-coverage-metric-section-head"><div><span>Presence intelligence</span><h3>Tracker state</h3></div><small>Active · focused idle · away</small></div><div class="tt-coverage-metrics tt-coverage-presence-metrics">${presenceCards}</div></section></div>`;
  }
  function coverageAvatarMarkup(name){
    const canonical=String(name||'').trim();
    try{
      const profiles=window.TrinoTimeChatProfiles;
      if(profiles&&typeof profiles.avatarMarkup==='function'){
        const markup=profiles.avatarMarkup(canonical,'tt-coverage-avatar');
        if(markup)return markup;
      }
    }catch(_){}
    const initials=String(canonical||'?').split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase();
    return `<span class="tt-coverage-avatar" data-agent-avatar="${esc(canonical)}">${esc(initials)}</span>`;
  }
  function agentRow(row){
    const pv=presenceView(row),presentation=statusPresentation(row),podLabel=friendlyPodLabel(row.pod,row.podLabel),bucket=statusBucket(row);
    return `<tr tabindex="0" role="button" aria-label="Open Coverage details for ${esc(row.name)}" data-coverage-agent="${esc(row.name)}" data-coverage-status-bucket="${bucket}"><td><div class="tt-coverage-agent">${coverageAvatarMarkup(row.name)}<span><strong>${esc(row.name)}</strong><small>${esc(podLabel)}${Number(row.shiftGeneration||0)>0?` · Reset ${fmtInt(row.shiftGeneration)}×`:''}${row.shiftLocked?' · Final locked':''}</small></span></div></td><td><div class="tt-coverage-status-stack"><span class="tt-coverage-live" data-state="${esc(presentation.status)}">${esc(presentation.label)}</span><span class="tt-tracker-sync-pill${presentation.trackerWarning?' is-warning':''}" data-coverage-tracker-sync>${esc(presentation.tracker)}</span><small data-coverage-status-detail>${esc(presentation.detail)}</small></div></td><td class="tt-coverage-num"><div class="tt-coverage-submitted-cell"><strong>${fmtInt(submittedTotal(row))}</strong>${Number(row.submittedManualAdjustment)?`<small>${esc(submittedBreakdown(row))}</small>`:''}</div></td><td class="tt-coverage-num">${fmtInt(row.created)}</td><td class="tt-coverage-num">${fmtInt(row.blurred)}</td><td class="tt-coverage-num">${fmtInt(row.deleted)}</td><td class="tt-coverage-num">${fmtInt(row.noMatch)}</td><td class="tt-coverage-num">${fmtInt(row.productMatched)}</td><td class="tt-coverage-num">${esc(fmtDuration(row.activeMs))}</td><td class="tt-coverage-num"><div class="tt-coverage-idle-cell"><strong>${esc(fmtDuration(idleOnlyMs(row)))}</strong><small data-coverage-idle-now ${pv.status!=='idle'?'hidden':''}>${pv.status==='idle'?esc(pv.idleNow):''}</small>${row.connected&&!hasAwayTiming(row)?'<small class="tt-coverage-legacy-timing">Includes Away</small>':''}</div></td><td class="tt-coverage-num"><div class="tt-coverage-away-cell"><strong>${row.connected&&!hasAwayTiming(row)?'—':esc(fmtDuration(awayTotalMs(row)))}</strong><small data-coverage-away-now ${pv.status!=='away'?'hidden':''}>${pv.status==='away'?esc(pv.idleNow):''}</small>${row.connected&&!hasAwayTiming(row)?'<small class="tt-coverage-legacy-timing">Upgrade Tracker</small>':''}</div></td><td class="tt-coverage-job">${row.currentJob?`${esc(row.currentJob)} · ${fmtInt(row.currentTask)}/${fmtInt(row.totalTasks)}${row.currentStoreName?`<small class="tt-si-current-store">${esc(row.currentStoreName)}</small>`:''}`:'—'}</td><td class="tt-coverage-muted" data-coverage-last-sync>${esc(fmtAgo(row.serverUpdatedAtMs))}</td></tr>`;
  }
  function table(rows){
    if(!rows.length)return `<div class="tt-coverage-empty"><strong>No Agents in this scope</strong><p>TrinoTime did not find an active Agent roster entry for this Coverage view.</p></div>`;
    return `<div class="tt-coverage-table-wrap"><table class="tt-coverage-table"><thead><tr><th>Agent</th><th>Attendance / Tracker</th><th>Submitted</th><th>Created</th><th>Blurred</th><th>Deleted</th><th>No Match</th><th>Product Match</th><th>Active</th><th>Idle today</th><th>Away today</th><th>Current Job</th><th>Last Sync</th></tr></thead><tbody>${rows.map(agentRow).join('')}</tbody></table></div>`;
  }
  function adminPods(d){
    return (d.pods||[]).map(group=>{
      const separateAway=(Number(group.totals.connectedAgents)||0)===0||(Number(group.totals.awayTimingAgents)||0)>=(Number(group.totals.connectedAgents)||0);
      const idle=separateAway?Math.max(0,(Number(group.totals.idleMs)||0)-(Number(group.totals.awayMs)||0)):(Number(group.totals.idleMs)||0);
      return `<section class="tt-coverage-panel tt-coverage-pod" data-coverage-pod="${esc(group.pod)}"><div class="tt-coverage-pod-head"><div><h3>${esc(friendlyPodLabel(group.pod,group.podLabel))}</h3><span>${group.agents.length} Agent${group.agents.length===1?'':'s'} · ${group.totals.timedInAgents||0} Time In · ${group.totals.liveAgents||0} Coverage live · ${group.totals.otherWorkflowLiveAgents||0} Confirmation active · ${group.totals.connectedAgents||0} Coverage reporting</span></div><div class="tt-coverage-pod-summary"><span><b>${fmtInt(group.totals.submitted)}</b> submitted${Number(group.totals.submittedManualAdjustment)?` <small>(${esc(fmtSigned(group.totals.submittedManualAdjustment))} manual)</small>`:''}</span><span><b>${fmtDuration(group.totals.activeMs)}</b> active</span><span><b>${fmtDuration(idle)}</b> ${separateAway?'idle':'idle / away'}</span><span><b>${separateAway?fmtDuration(group.totals.awayMs):'—'}</b> away</span></div></div>${table(group.agents||[])}</section>`;
    }).join('');
  }
  function bridgePanel(a){
    if(a?.role!=='agent')return '';
    const b=state.bridge,connected=Boolean(b?.connected),latest=b?.connections?.[0];
    return `<section class="tt-coverage-panel"><div class="tt-coverage-bridge"><div class="tt-coverage-bridge-copy"><strong>Coverage Tracker connection</strong><p>${connected?`Connected to ${esc(latest?.deviceName||'Coverage Activity Tracker')}. ${latest?.lastSyncAt?`Last server sync ${esc(new Date(latest.lastSyncAt).toLocaleString())}.`:'Waiting for the first tracker sync.'}`:'Open the Coverage Activity Tracker extension while this TrinoTime tab is open, then choose Connect to TrinoTime.'}</p></div><div class="tt-coverage-bridge-actions"><span class="tt-coverage-bridge-state ${connected?'is-connected':''}">${connected?'Connected':'Not connected'}</span>${connected?'<button class="tt-coverage-btn danger" type="button" data-coverage-disconnect>Disconnect</button>':''}</div></div></section>`;
  }
  // UX18P34: linear lookup per live tick; unchanged DOM values stay untouched.
  function coverageAgentIndex(d){
    const index=new Map();
    for(const agent of d.agents||[])if(!index.has(agent.name))index.set(agent.name,agent);
    return index;
  }
  function setLiveText(node,value){
    if(node && node.textContent!==String(value))node.textContent=String(value);
  }
  function setLiveHidden(node,value){
    if(node && node.hidden!==value)node.hidden=value;
  }
  function setLiveData(node,key,value){
    if(node && node.dataset[key]!==value)node.dataset[key]=value;
  }
  function updatePresenceSummary(){
    const root=$('ttCoverageRoot'),d=state.dashboard;if(!root||!d)return;
    const counts=presenceCounts(d);
    for(const el of root.querySelectorAll('[data-coverage-status-count]')){
      const key=String(el.dataset.coverageStatusCount||'');
      setLiveText(el,fmtInt(counts[key]||0));
    }
  }
  function applyStatusFilter(agentIndex){
    const root=$('ttCoverageRoot'),d=state.dashboard;if(!root||!d)return;
    const filter=state.statusFilter||'all';
    agentIndex=agentIndex||coverageAgentIndex(d);
    for(const chip of root.querySelectorAll('[data-coverage-filter]'))chip.classList.toggle('is-selected',chip.dataset.coverageFilter===filter);
    for(const row of root.querySelectorAll('[data-coverage-agent]')){
      const name=String(row.dataset.coverageAgent||''),data=agentIndex.get(name),bucket=data?statusBucket(data):String(row.dataset.coverageStatusBucket||'other');
      setLiveData(row,'coverageStatusBucket',bucket);
      setLiveHidden(row,filter!=='all'&&bucket!==filter);
    }
    for(const panel of root.querySelectorAll('.tt-coverage-pod')){
      const rows=[...panel.querySelectorAll('[data-coverage-agent]')];
      setLiveHidden(panel,rows.length>0&&rows.every(row=>row.hidden));
    }
  }
  function updateLiveChrome(){
    const root=$('ttCoverageRoot'),d=state.dashboard;if(!root||!d)return;
    const agentIndex=coverageAgentIndex(d);
    const stream=root.querySelector('[data-coverage-stream]'),st=streamState(d);
    if(stream){
      const streamClass=`tt-coverage-stream ${st.cls}`;if(stream.className!==streamClass)stream.className=streamClass;
      const label=stream.querySelector('[data-coverage-stream-label]'),age=stream.querySelector('[data-coverage-live-age]');
      setLiveText(label,st.label);setLiveText(age,st.detail);
    }
    for(const row of root.querySelectorAll('[data-coverage-agent]')){
      const name=String(row.dataset.coverageAgent||''),data=agentIndex.get(name);if(!data)continue;
      const pv=presenceView(data),presentation=statusPresentation(data),badge=row.querySelector('.tt-coverage-live');
      if(badge){setLiveData(badge,'state',presentation.status);setLiveText(badge,presentation.label);}
      const tracker=row.querySelector('[data-coverage-tracker-sync]');if(tracker){setLiveText(tracker,presentation.tracker);tracker.classList.toggle('is-warning',presentation.trackerWarning);}
      const detail=row.querySelector('[data-coverage-status-detail]');setLiveText(detail,presentation.detail);
      const idleNow=row.querySelector('[data-coverage-idle-now]');if(idleNow){setLiveText(idleNow,pv.status==='idle'?pv.idleNow:'');setLiveHidden(idleNow,pv.status!=='idle');}
      const awayNow=row.querySelector('[data-coverage-away-now]');if(awayNow){setLiveText(awayNow,pv.status==='away'?pv.idleNow:'');setLiveHidden(awayNow,pv.status!=='away');}
      const sync=row.querySelector('[data-coverage-last-sync]');setLiveText(sync,fmtAgo(data.serverUpdatedAtMs));
      setLiveData(row,'coverageStatusBucket',statusBucket(data));
    }
    const drawer=$('ttCoverageDrawer'),drawerName=String(drawer?.dataset?.coverageOpenAgent||'');
    if(drawerName){
      const data=agentIndex.get(drawerName),el=drawer.querySelector('[data-coverage-current-state-time]'),detail=drawer.querySelector('[data-coverage-drawer-status-detail]');
      if(data&&el){
        const pv=presenceView(data);
        setLiveText(el,pv.status==='idle'?fmtLiveDuration(pv.currentIdleMs):pv.status==='away'?`Away ${fmtLiveDuration(pv.currentIdleMs)}`:'—');
        setLiveText(detail,statusPresentation(data).detail);
      }
    }
    updatePresenceSummary();
    applyStatusFilter(agentIndex);
  }
  function bindControls(root){
    root.querySelector('[data-coverage-refresh]')?.addEventListener('click',()=>refresh(true));
    root.querySelector('[data-coverage-follow-shift]')?.addEventListener('click',()=>{state.followShift=true;state.date=phtDate();state.lastSignature='';refresh(true);});
    root.querySelector('#ttCoverageDate')?.addEventListener('change',e=>{state.followShift=false;state.date=e.target.value||phtDate();state.statusFilter='all';refresh(true);});
    root.querySelector('[data-coverage-disconnect]')?.addEventListener('click',disconnectBridge);
    for(const chip of root.querySelectorAll('[data-coverage-filter]'))chip.addEventListener('click',()=>{state.statusFilter=String(chip.dataset.coverageFilter||'all');applyStatusFilter();});
    for(const row of root.querySelectorAll('[data-coverage-agent]')){
      row.addEventListener('click',()=>openAgent(row.dataset.coverageAgent));
      row.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();openAgent(row.dataset.coverageAgent);}});
    }
    applyStatusFilter();
  }
  function render(){
    const root=$('ttCoverageRoot'),d=state.dashboard,a=actor();if(!root||!d||!a)return;
    const ownPod=d.pods?.find?.(group=>String(group?.pod||'')===String(a.pod||''))||d.pods?.[0]||null;
    const ownAgent=(d.agents||[]).find(row=>String(row?.pod||'')===String(a.pod||''))||null;
    const scope=d.scope==='all-pods'?'All PODs':d.scope==='own-pod'?friendlyPodLabel(a.pod,ownPod?.podLabel||ownAgent?.podLabel||a.podLabel||''):'My data';
    let body='';
    if(a.role==='admin')body=adminPods(d)||`<section class="tt-coverage-panel"><div class="tt-coverage-empty"><strong>No Coverage data yet</strong><p>Agent rows will appear here as soon as the roster is available.</p></div></section>`;
    else body=`<section class="tt-coverage-panel"><div class="tt-coverage-panel-head"><div><h3>${a.role==='team_leader'?'My Agents':'My Coverage Activity'}</h3><p>${a.role==='team_leader'?'Only Agents assigned to your current TrinoTime POD are visible.':'Your own Coverage data only.'}</p></div><span class="tt-coverage-panel-hint">Select an Agent row for details</span></div>${table(d.agents||[])}</section>`;
    const scrollPositions = new Map([...root.querySelectorAll('.tt-coverage-table-wrap')].map(el => [el.closest('[data-coverage-pod]')?.dataset.coveragePod || 'own', [el.scrollLeft, el.scrollTop]]));
    root.innerHTML=`<div class="tt-coverage-shell"><header class="tt-coverage-hero"><div class="tt-coverage-hero-copy"><p class="tt-coverage-eyebrow">Coverage Activity</p><h2 class="tt-coverage-title">Coverage Dashboard</h2><p class="tt-coverage-subtitle">Live Coverage productivity, presence, task context, manual corrections, and synchronization health.</p></div><div class="tt-coverage-toolbar"><div class="tt-coverage-toolbar-primary">${liveBadge(d)}<span class="tt-coverage-scope">${esc(scope)}</span>${dateControl()}${a.role==='agent'&&!state.followShift?'<button type="button" class="tt-coverage-btn" data-coverage-follow-shift>Live shift</button>':''}<button class="tt-coverage-btn" type="button" data-coverage-refresh>Refresh</button></div>${presenceSummary(d)}</div></header>${summaryCards(d)}${bridgePanel(a)}${body}<div class="tt-coverage-policy"><strong>Attendance and Tracker are separate:</strong> Time In/Out comes from the server Attendance shift projection; LIVE requires recent accepted Tracker data. Stale or blocked sync does not mean an Agent timed out. Pending or rejected tasks are not counted as accepted. <strong>Presence policy:</strong> while a real Coverage task is open, no qualifying keyboard/pointer/scroll interaction for 5 minutes becomes <b>IDLE</b>; hidden or unfocused Augmoto becomes <b>AWAY</b> immediately. Idle and Away are reported separately in RC11 while the existing combined timing field remains backward-compatible. Live timers update locally every second without per-second backend calls. No typed content or screen images are collected. Approved breaks, coaching, and clock-out remain separate TrinoTime workforce states.</div></div>`;
    bindControls(root);
    for (const el of root.querySelectorAll('.tt-coverage-table-wrap')) {
      const pos = scrollPositions.get(el.closest('[data-coverage-pod]')?.dataset.coveragePod || 'own');
      if (pos) { el.scrollLeft = pos[0]; el.scrollTop = pos[1]; }
      globalThis.TrinoTimeWideTableScroll?.mount?.(el);
    }
  }
  function renderError(error){
    const root=$('ttCoverageRoot');
    if(root)root.innerHTML=`<div class="tt-coverage-shell"><div class="tt-coverage-error">${esc(error?.message||'Coverage dashboard could not load.')}</div><button class="tt-coverage-btn" type="button" data-coverage-refresh>Retry</button></div>`;
    root?.querySelector('[data-coverage-refresh]')?.addEventListener('click',()=>refresh(true));
  }
  async function refresh(force=false){
    if(!state.active)return;
    if(!force&&Date.now()<state.errorBackoffUntil){updateLiveChrome();return;}
    if(state.busy){state.refreshQueued=true;return;}
    const a=actor();if(!a)return;
    state.busy=true;state.lastPollAt=Date.now();if(!state.date)state.date=phtDate();
    const root=$('ttCoverageRoot');if(root&&!state.dashboard)root.innerHTML='<div class="tt-coverage-shell"><div class="tt-coverage-loading">Loading secure Coverage data…</div></div>';
    try{
      const [dashboard,bridge]=await Promise.all([api(`dashboard?date=${encodeURIComponent(state.followShift?phtDate():state.date)}&followActiveShift=${a.role==='agent'&&state.followShift?'1':'0'}`),a.role==='agent'?api('bridge-status').catch(()=>null):Promise.resolve(null)]);
      assertDashboardViewerBinding(a,dashboard);
      // Shift summaries are deliberately stored against Time In date, even
      // when work continues past midnight. Follow that day ONLY for the
      // authenticated Agent's active shift, unless a manual date was chosen.
      const liveDate=a.role==='agent' ? String(dashboard.activeShiftReportDate||'') : '';
      state.activeShiftReportDate=liveDate;
      // The server already selected the authorized shift date AND loaded rows
      // from that date. No second request/race can leave a misleading WAITING.
      if(state.followShift && dashboard.date && dashboard.date!==state.date){
        state.date=dashboard.date;
        state.lastSignature='';
      }
      const signature=dashboardSignature(dashboard,bridge),changed=force||!state.dashboard||signature!==state.lastSignature;
      state.dashboard=dashboard;state.bridge=bridge;state.errorBackoffUntil=0;
      if(changed){state.lastSignature=signature;render();}else updateLiveChrome();
      document.dispatchEvent(new CustomEvent('trinotime:store-context',{detail:{workflow:'coverage',date:state.date,viewer:dashboard.viewer,scope:dashboard.scope}}));
    }catch(error){state.errorBackoffUntil=Date.now()+10000;renderError(error);}
    finally{
      state.busy=false;
      if(state.refreshQueued){state.refreshQueued=false;setTimeout(()=>refresh(false),250);}
    }
  }
  async function disconnectBridge(){
    if(!confirm('Disconnect all Coverage Tracker connections for this Agent account?'))return;
    try{await api('bridge-revoke-all',{method:'POST',body:{}});state.bridge=null;await refresh(true);}catch(error){alert(error.message||'Could not disconnect Coverage Tracker.');}
  }
  function closeDrawer(){const back=$('ttCoverageDrawerBackdrop'),drawer=$('ttCoverageDrawer');if(back)back.hidden=true;if(drawer)drawer.dataset.coverageOpenAgent='';}
  function drawerMetric(label,value,attrs=''){return `<div class="tt-coverage-drawer-metric"><span>${esc(label)}</span><strong ${attrs}>${esc(value)}</strong></div>`;}
  async function openAgent(name){
    const back=$('ttCoverageDrawerBackdrop'),drawer=$('ttCoverageDrawer');if(!back||!drawer)return;
    back.hidden=false;drawer.dataset.coverageOpenAgent='';drawer.innerHTML='<div class="tt-coverage-loading">Loading Agent Coverage details…</div>';
    try{
      const data=await api(`agent?date=${encodeURIComponent(state.date)}&name=${encodeURIComponent(name)}`),s=data.summary||{},tasks=data.tasks||[],pv=presenceView(s),display=statusPresentation(s),perf=performanceView(s,1),idle=idleOnlyMs(s),away=awayTotalMs(s),separateAway=!s.connected||hasAwayTiming(s);
      const storeChoices=[...new Set(tasks.map(t=>String(t.storeName||'Unknown Store').trim()))].sort((a,b)=>a.localeCompare(b));
      const storeToolbar=tasks.length?`<label class="tt-si-drawer-filter">Group / filter by store <select data-tt-si-drawer-choice><option value="">All stores</option>${storeChoices.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('')}</select></label>`:'';
      const currentJob=s.currentJob?`${s.currentJob} · ${fmtInt(s.currentTask)}/${fmtInt(s.totalTasks)}`:'No open Coverage task';
      const pace=perf.pace===null?'Calculating':`${perf.pace.toFixed(1)} submissions/hr`;
      const projection=state.date===phtDate()&&perf.projection!==null?`${fmtInt(perf.projection)} @ ${ACTIVE_DAY_HOURS}h active`:'—';
      const paceState=perf.onPace===null?'Not enough active time':perf.onPace?'On pace':'Below target pace';
      drawer.dataset.coverageOpenAgent=String(s.name||name);
      drawer.innerHTML=`<div class="tt-coverage-drawer-head"><div><p class="tt-coverage-eyebrow">${esc(friendlyPodLabel(s.pod,s.podLabel)||'Coverage')}</p><h2>${esc(s.name||name)}</h2><p class="tt-coverage-subtitle">${esc(prettyDate(state.date))} · secure ${esc(actor()?.role||'')} scope · <span data-coverage-drawer-status-detail>${esc(display.detail)}</span></p></div><button type="button" class="tt-coverage-close" data-coverage-close aria-label="Close">×</button></div>
      <section class="tt-coverage-drawer-section"><div class="tt-coverage-drawer-section-head"><h3>Today</h3><span>Confirmed activity and timing</span></div><div class="tt-coverage-drawer-metrics">${drawerMetric('Submitted',fmtInt(submittedTotal(s)))}${drawerMetric('Confirmed',fmtInt(s.submitted))}${drawerMetric('Manual adjustment',fmtSigned(s.submittedManualAdjustment))}${drawerMetric('Created',fmtInt(s.created))}${drawerMetric('Blurred',fmtInt(s.blurred))}${drawerMetric('Deleted',fmtInt(s.deleted))}${drawerMetric('No Match',fmtInt(s.noMatch))}${drawerMetric('Product Match',fmtInt(s.productMatched))}${drawerMetric('Active',fmtDuration(s.activeMs))}${drawerMetric(separateAway?'Idle':'Idle / Away',fmtDuration(idle))}${drawerMetric('Away',separateAway?fmtDuration(away):'Requires Tracker v2.0.12')}</div></section>
      <section class="tt-coverage-drawer-section"><div class="tt-coverage-drawer-section-head"><h3>Current Work</h3><span>Live operational context</span></div><div class="tt-coverage-drawer-metrics tt-coverage-drawer-metrics-compact">${drawerMetric('Attendance',display.label)}${drawerMetric('Tracker sync',display.tracker)}${drawerMetric('Current job',currentJob)}${drawerMetric('Store',s.currentStoreName||'Unknown Store')}${drawerMetric('Current state timer',pv.status==='idle'?fmtLiveDuration(pv.currentIdleMs):pv.status==='away'?`Away ${fmtLiveDuration(pv.currentIdleMs)}`:'—','data-coverage-current-state-time')}${drawerMetric('Last sync',fmtAgo(s.serverUpdatedAtMs))}</div></section>
      <section class="tt-coverage-drawer-section"><div class="tt-coverage-drawer-section-head"><h3>Performance</h3><span>Professional pace view · ${DAILY_SUBMIT_TARGET} submissions / Agent target</span></div><div class="tt-coverage-drawer-metrics tt-coverage-drawer-metrics-compact">${drawerMetric('Daily target',fmtInt(perf.target))}${drawerMetric('Target progress',`${Math.max(0,perf.progress)}%`)}${drawerMetric('Current pace',pace)}${drawerMetric('Projected',projection)}${drawerMetric('Pace status',paceState)}</div><div class="tt-coverage-drawer-progress"><i style="width:${Math.max(0,Math.min(100,perf.progress))}%"></i></div></section>
      <section class="tt-coverage-panel tt-coverage-task-panel"><div class="tt-coverage-panel-head"><div><h3>Jobs & Task Activity</h3><p>${tasks.length} tracked task${tasks.length===1?'':'s'}</p></div></div>${storeToolbar}<div class="tt-coverage-task-wrap">${tasks.length?`<div class="tt-coverage-task-list">${tasks.map(t=>`<div class="tt-coverage-task" data-tt-si-task-store="${esc(t.storeName||'Unknown Store')}"><strong>${esc(t.jobId)} · ${fmtInt(t.taskIndex)}/${fmtInt(t.totalTasks)}</strong>${t.storeName?`<span class="tt-si-task-store">${esc(t.storeName)}</span>`:""}<span>C ${fmtInt(t.created)}</span><span>B ${fmtInt(t.blurred)}</span><span>D ${fmtInt(t.deleted)}</span><span>X ${fmtInt(t.noMatch)}</span><span>M ${fmtInt(t.productMatched)}</span><span>A ${esc(fmtDuration(t.activeMs))}</span><span>I ${esc(fmtDuration(t.awayTimingAvailable===true?Math.max(0,(Number(t.idleMs)||0)-(Number(t.awayMs)||0)):(Number(t.idleMs)||0)))}</span><span>W ${t.awayTimingAvailable===true?esc(fmtDuration(t.awayMs)):'—'}</span><span class="tt-coverage-task-state ${esc(t.status)}">${esc(t.status||'unknown')}</span></div>`).join('')}</div>`:'<div class="tt-coverage-empty"><strong>No task detail synced yet</strong><p>The tracker can still have a daily summary before per-task records arrive.</p></div>'}</div></section>`;
      drawer.querySelector('[data-tt-si-drawer-choice]')?.addEventListener('change',e=>{
        const chosen=e.target.value;for(const row of drawer.querySelectorAll('[data-tt-si-task-store]'))row.hidden=Boolean(chosen&&row.dataset.ttSiTaskStore!==chosen);
      });
      drawer.querySelector('[data-coverage-close]')?.addEventListener('click',closeDrawer);
    }catch(error){
      drawer.dataset.coverageOpenAgent='';
      drawer.innerHTML=`<div class="tt-coverage-error">${esc(error?.message||'Could not load Agent Coverage details.')}</div><button type="button" class="tt-coverage-btn" data-coverage-close>Close</button>`;
      drawer.querySelector('[data-coverage-close]')?.addEventListener('click',closeDrawer);
    }
  }

  function syncSession(){
    buildUi();
    const a=actor(),sig=actorSig(a),fallback=$('ttCoverageWorkspaceTabs'),sideBtn=ensureSidebarButton(),sidebar=$('ttPremiumSidebar');
    const sidebarVisible=Boolean(sidebar&&getComputedStyle(sidebar).display!=='none'&&!sidebar.hidden);
    const shellRole=normalizedRole(shellRoleHint().role);
    const shellSignedIn=['admin','team_leader','agent'].includes(shellRole);
    if(sideBtn)sideBtn.hidden=!(a||shellSignedIn);
    if(!a){if(fallback)fallback.hidden=true;if(state.active)setView('workforce');state.actorKey='';return;}
    if(fallback)fallback.hidden=sidebarVisible;
    if(sig!==state.actorKey){state.actorKey=sig;state.dashboard=null;state.bridge=null;state.lastSignature='';state.date=phtDate();state.statusFilter='all';state.followShift=true;state.activeShiftReportDate='';if(state.active)refresh(true);}
  }
  document.addEventListener('trinotime:workspace-opening',event=>{if(event.detail!=='coverage'&&state.active)setView('workforce');});
  document.addEventListener('click',event=>{
    const nav=event.target.closest('[data-tt-nav]');if(!nav)return;
    const action=String(nav.dataset.ttNav||'');
    if(action==='coverage'){event.preventDefault();setView('coverage');return;}
    if(state.active)setView('workforce');
  },true);
  document.addEventListener('keydown',event=>{const drawer=$('ttCoverageDrawerBackdrop');if(event.key==='Escape'&&drawer&&!drawer.hidden)closeDrawer();});
  buildUi();syncSession();
  setInterval(syncSession,1200);
  setInterval(()=>{if(state.active&&!document.hidden&&(state.date===phtDate()||liveShiftSelected()))refresh(false);else if(state.active&&!document.hidden)updateLiveChrome();},6000);
  document.addEventListener('visibilitychange',()=>{if(state.active&&!document.hidden)refresh(true);});
  setInterval(()=>{if(state.active&&!document.hidden&&!document.documentElement.classList.contains('tt-is-scrolling'))updateLiveChrome();},1000);
})();
