(() => {
'use strict';
if(window.__ttConfirmationDashboardBuild)return;
window.__ttConfirmationDashboardBuild='RC24';
window.__ttConfirmationIdentityAvatarBuild='M2.3';
window.__ttConfirmationCurrentJobBuild='RC26';
window.__ttConfirmationPresenceBuild='RC29';
window.__ttConfirmationPodScopeBuild='M2.9.3';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const phtDate=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
let active=false,snapshot={},date=phtDate(),followShift=true,activeShiftReportDate='',identity='',generation=0,busy=false,confirmationPod='',drawerRequestSeq=0,drawerReturnFocus=null;
const surfaces=['mainContent','teamTabsOuter','podTabsOuter','ttAdminCommandBar','ttPremiumRightRail'];
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
      throw Object.assign(new Error('Confirmation returned an invalid viewer role. Refresh TrinoTime after the server update.'),{code:'COVERAGE_RESPONSE_INVALID'});
    }
    if(expected&&expected!==actual){
      throw Object.assign(new Error(`Confirmation session identity mismatch (${expected} page / ${actual} server). Refresh TrinoTime or sign in again.`),{code:'COVERAGE_SESSION_BINDING_MISMATCH'});
    }
    const scopeForRole={admin:'all-pods',team_leader:'own-pod',agent:'self'};
    if(dashboard?.ok!==true||dashboard?.authority!=='workforce-confirmation-v1'||dashboard?.scope!==scopeForRole[actual]||!Array.isArray(dashboard?.agents)||!Array.isArray(dashboard?.pods)){
      throw Object.assign(new Error('Confirmation returned an invalid dashboard response. Retry after the server update.'),{code:'COVERAGE_RESPONSE_INVALID'});
    }
    if(expected==='agent'){
      const client=String(a?.name||'').trim().toLowerCase(),server=String(dashboard?.viewer?.name||'').trim().toLowerCase();
      if(client&&server&&client!==server)throw Object.assign(new Error('Confirmation Agent identity changed. Refresh TrinoTime or sign in again.'),{code:'COVERAGE_SESSION_BINDING_MISMATCH'});
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
  function profileAvatarMarkup(name,className='tt-coverage-avatar'){
    const canonical=String(name||'').trim();
    try{
      const profiles=window.TrinoTimeChatProfiles;
      if(profiles&&typeof profiles.avatarMarkup==='function'){
        const markup=profiles.avatarMarkup(canonical,className);
        if(markup)return markup;
      }
    }catch(_){}
    const initials=String(canonical||'?').split(/\s+/).map(part=>part[0]).join('').slice(0,2).toUpperCase();
    return `<span class="${className}" data-agent-avatar="${esc(canonical)}">${esc(initials)}</span>`;
  }
  const fmtDuration=ms=>{const total=Math.max(0,Math.floor((Number(ms)||0)/1000)),h=Math.floor(total/3600),m=Math.floor((total%3600)/60),sec=total%60;return h?`${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`:`${m}:${String(sec).padStart(2,'0')}`;};
  const fmtLiveDuration=ms=>{const total=Math.max(0,Math.floor((Number(ms)||0)/1000)),h=Math.floor(total/3600),m=Math.floor((total%3600)/60),sec=total%60;return h?`${h}h ${m}m`:(m?`${m}m ${sec}s`:`${sec}s`);};
  const hasAwayTiming=row=>row?.awayTimingAvailable===true;
  const focusedIdleMs=row=>hasAwayTiming(row)?Math.max(0,(Number(row?.idleMs)||0)-(Number(row?.awayMs)||0)):Math.max(0,Number(row?.idleMs)||0);
  const fmtInt=value=>Math.max(0,Number(value)||0).toLocaleString();
  const fmtSigned=value=>{const n=Math.trunc(Number(value)||0);return n>0?`+${n.toLocaleString()}`:n.toLocaleString();};
  const fmtAgo=value=>{const ms=Math.max(0,Number(value)||0);if(!ms)return 'Not synced';const age=Math.max(0,Date.now()-ms),s=Math.floor(age/1000);if(s<60)return `${s}s ago`;const m=Math.floor(s/60);if(m<60)return `${m}m ago`;const h=Math.floor(m/60);if(h<24)return `${h}h ${m%60}m ago`;return new Date(ms).toLocaleString();};
  const prettyDate=value=>{try{return new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Manila',month:'short',day:'numeric',year:'numeric'}).format(new Date(`${value}T12:00:00+08:00`));}catch(_){return String(value||'');}};
  function liveState(row){
    if(!row?.connected||row?.shiftLocked===true||row?.shiftStatus==='completed'||!row?.timeInAtLastSync)return 'offline';
    const syncAt=Number(row.serverUpdatedAtMs)||0,age=syncAt?Math.max(0,Date.now()-syncAt):Infinity;if(age>180000)return 'offline';if(age>90000)return 'stale';if(row.pendingSubmission===true)return 'submitting';
    const state=String(row.trackerState||'unknown').toLowerCase(),threshold=Math.max(60000,Number(row.idleThresholdMs)||300000),last=Number(row.lastActivityAt)||0;
    if(state==='active'&&row.currentJob&&last&&Date.now()-last>threshold+30000)return 'idle';
    return ['active','idle','away','paused','ready'].includes(state)?state:'unknown';
  }
  function liveDetail(row){
    const state=liveState(row),now=Date.now();
    if(state==='idle'){const since=Number(row.idleSinceAt)||(Number(row.lastActivityAt)||now)+(Number(row.idleThresholdMs)||300000);return `Time In verified · Idle ${fmtLiveDuration(Math.max(0,now-since))}`;}
    if(state==='away'){const since=Number(row.awaySinceAt)||Number(row.presenceUpdatedAt)||now;return `Time In verified · Away ${fmtLiveDuration(Math.max(0,now-since))}`;}
    if(state==='active')return `Time In verified · Working · ${fmtDuration(row.activeMs)} active`;
    if(state==='submitting')return 'Time In verified · Submitting';if(state==='stale')return 'Time In verified at last sync · Tracker delayed';if(state==='paused')return 'Time In verified · Tracker paused';if(state==='ready')return 'Time In verified · Ready';if(row?.timeOutRecorded)return 'Time Out recorded · shift locked';return row?.serverUpdatedAtMs?'Tracker offline':'Not synced / Time In not verified';
  }

  // UX18P35: separate accepted Coverage activity from Confirmation counters.
  function alternateWorkflowPresentation(row){
    if(row?.attendanceStatus!=='timed_in')return null;
    const other=row?.alternateWorkflow;
    if(other?.workflow!=='coverage')return null;
    const accepted=Number(other.acceptedAtMs)||0,activity=Number(other.lastActivityAtMs)||0,now=Date.now();
    if(!accepted||accepted>now+30000||now-accepted>90000)return null;
    const working=other.trackerState==='active'&&other.hasJob===true&&activity>0&&activity<=now+30000&&now-activity<=90000;
    return {label:working?'COVERAGE ACTIVE':'COVERAGE SYNCED',acceptedAtMs:accepted,working};
  }
  function confirmationStatusPresentation(row){
    const status=liveState(row),att=String(row?.attendanceStatus||'unverified');
    if(att==='timed_in'){
      const delayed=['stale','offline'].includes(status),other=delayed?alternateWorkflowPresentation(row):null;
      return {state:'timed_in',label:'TIME IN',tracker:other?other.label:(delayed?'SYNC STALE':`TRACKER ${status.toUpperCase()}`),
        warning:delayed&&!other,detail:other?`Time In · ${other.working?'Coverage activity':'Coverage sync'} server-accepted ${fmtAgo(other.acceptedAtMs)} · Confirmation last accepted ${fmtAgo(row?.serverUpdatedAtMs)}. Confirmation pending work is not confirmed.`:(delayed?`Time In confirmed · Confirmation sync not current · ${fmtAgo(row?.serverUpdatedAtMs)}. Check the Tracker; no pending activity is assumed accepted.`:liveDetail(row))};
    }
    if(att==='timed_out')return {state:'timed_out',label:'TIME OUT',tracker:'HISTORICAL TRACKER',warning:false,
      detail:'Attendance Time Out confirmed · historical accepted intervals retained.'};

    if(row?.dayOffStatus==='day_off')return {state:'day_off',label:'DAY OFF',tracker:'SCHEDULED DAY OFF',warning:false,
      detail:'Day off confirmed for the selected date · no active Attendance shift. Earlier accepted Confirmation totals remain historical.'};
    if(row?.dayOffStatus==='not_scheduled')return {state:'offline',label:'OFFLINE',tracker:'TRACKER OFFLINE',warning:false,
      detail:'No Time In verified and no scheduled day off for this date · '+(row?.serverUpdatedAtMs?fmtAgo(row.serverUpdatedAtMs):'Tracker not synced')};
    return {state:status,label:status.toUpperCase(),tracker:'ATTENDANCE UNVERIFIED',warning:false,
      detail:'Current Attendance not independently verified · '+(row?.serverUpdatedAtMs?fmtAgo(row.serverUpdatedAtMs):'Tracker not synced')};
  }
  async function authHeaders(method='GET'){
    const headers={Accept:'application/json'};
    if(!['GET','HEAD'].includes(method))headers['Content-Type']='application/json';
    const a=actor();
    const expectedRole=normalizedRole(a?.role);
    if(expectedRole)headers['X-TT-Confirmation-Expected-Role']=expectedRole;
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
    const response=await fetch('/api/workforce/confirmation/'+String(path||'').replace(/^\/+/,''),{
      method,headers,cache:'no-store',credentials:'same-origin',...(body===undefined?{}:{body:JSON.stringify(body)})
    });
    let data;
    try{data=await response.json();}
    catch(_){throw Object.assign(new Error(`Confirmation returned a non-JSON response (HTTP ${response.status}). Retry or check the TrinoTime API deployment.`),{code:'COVERAGE_RESPONSE_INVALID',status:response.status});}
    if(!response.ok){
      const e=new Error(data?.message||`Confirmation authority returned ${response.status}.`);
      e.code=data?.error||'COVERAGE_API_ERROR';e.status=response.status;throw e;
    }
    return data||{};
  }


window.TrinoTimeConfirmationBridge=Object.freeze({getActor:actor,issueToken:async({deviceId='',deviceName='Confirmation Submission Tracker'}={})=>{
  const current=actor();
  if(normalizedRole(current?.role)==='agent' &&
    (String(current?.pod||'')==='OOS Coverage Beta QAs'||
     (!document.getElementById('qaSelfDayOffButton')?.hidden &&
       Boolean(document.getElementById('qaSelfDayOffButton'))))){
    const error=new Error('Coverage Beta QAs do not pair as Labelers. Use the independent QA workspace.');
    error.code='OOS_QA_NOT_LABELER';throw error;
  }
  return api('bridge-token',{method:'POST',body:{deviceId,deviceName}});
} });
let lastDashboard=null,lastRenderSignature='';
function confirmationIcon(){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4"></rect><path d="m8 12 2.4 2.4L16 9"></path></svg>';}
function ensureNavButton(){
 const premium=document.querySelector('#ttPremiumSidebar .tt-premium-nav');
 const nav=premium||$('ttCoverageWorkspaceTabs');
 if(!nav)return null;
 let btn=nav.querySelector('[data-tt-nav="confirmation"]');
 if(!btn){btn=document.createElement('button');btn.type='button';btn.dataset.ttNav='confirmation';btn.setAttribute('aria-label','Confirmation');btn.dataset.ttTooltip='Confirmation';nav.append(btn);}
 if(premium){
  if(btn.dataset.ttNavMode!=='premium'){btn.className='tt-premium-nav-btn';btn.innerHTML=confirmationIcon()+'<span class="tt-nav-label">Confirmation</span>';btn.dataset.ttNavMode='premium';}
  const anchor=nav.querySelector('[data-tt-nav="coverage"]');
  if(anchor&&btn.previousElementSibling!==anchor)anchor.insertAdjacentElement('afterend',btn);
 }else{
  if(btn.dataset.ttNavMode!=='fallback'){btn.className='tt-coverage-workspace-tab';btn.textContent='Confirmation';btn.dataset.ttNavMode='fallback';}
  const anchor=nav.querySelector('[data-tt-workspace="coverage"],[data-tt-nav="coverage"]');
  if(anchor&&btn.previousElementSibling!==anchor)anchor.insertAdjacentElement('afterend',btn);
 }
 return btn;
}
function build(){
 if(!$('ttConfirmationRoot')){
  const root=document.createElement('section');root.id='ttConfirmationRoot';root.className='tt-coverage-root tt-ops-root tt-confirmation-root';root.hidden=true;
  root.innerHTML='<div class="tt-ops-shell"><header class="tt-ops-hero"><div class="tt-ops-hero-copy"><p class="tt-ops-eyebrow">Quality Operations</p><h2 class="tt-ops-title">Confirmation</h2><p class="tt-ops-subtitle">Track live Confirmation job/task context, three review intervals, and the combined end-of-day submission total without leaving your TrinoTime workspace.</p></div><div class="tt-ops-toolbar"><span id="ttConfirmationScope" class="tt-coverage-scope"></span><label id="ttConfirmationPodField" class="tt-ops-field tt-pod-scope-field" hidden><span>Team / POD</span><select id="ttConfirmationPod" class="tt-coverage-select" aria-label="Filter Confirmation by team or POD"><option value="">All PODs / Teams</option></select></label><label class="tt-ops-field"><span>EOD date</span><input type="date" id="ttConfirmationDate" class="tt-coverage-date"></label><button id="ttConfirmationFollowShift" class="tt-coverage-btn" hidden>Live shift</button><button id="ttConfirmationRefresh" class="tt-coverage-btn tt-ops-refresh">Refresh</button></div></header><div class="tt-ops-note"><strong>Interval workflow</strong><span>Interval 1 + Interval 2 + Interval 3 = End of Day. Unsynced Agents remain visible so Team Leaders and Admins can distinguish zero activity from an offline tracker.</span></div><div id="ttConfirmationBody" class="tt-ops-body"><div class="tt-coverage-loading">Loading Confirmation…</div></div></div>';
  const target=$('ttCoverageRoot');(target?.parentElement||$('mainContent')?.parentElement||document.body).append(root);
  if(!$('ttConfirmationDrawerBackdrop')){
    const drawer=document.createElement('div');drawer.id='ttConfirmationDrawerBackdrop';drawer.className='tt-coverage-drawer-backdrop tt-confirmation-drawer-backdrop';drawer.hidden=true;
    drawer.innerHTML='<aside class="tt-coverage-drawer tt-confirmation-drawer" id="ttConfirmationDrawer" role="dialog" aria-modal="true" aria-label="Confirmation agent details" tabindex="-1"></aside>';
    document.body.append(drawer);
    drawer.addEventListener('click',event=>{if(event.target===drawer)closeAgentDrawer();});
  }
  $('ttConfirmationDate').value=date;
  $('ttConfirmationDate').onchange=e=>{followShift=false;if($('ttConfirmationFollowShift'))$('ttConfirmationFollowShift').hidden=false;date=e.target.value;generation++;lastRenderSignature='';closeAgentDrawer();$('ttConfirmationBody').innerHTML='<div class="tt-coverage-loading">Loading Confirmation…</div>';refresh();};
  $('ttConfirmationRefresh').onclick=()=>{closeAgentDrawer({restoreFocus:false});refresh(true);};
  $('ttConfirmationFollowShift').onclick=()=>{followShift=true;date=phtDate();$('ttConfirmationFollowShift').hidden=true;generation++;lastRenderSignature='';refresh(true);};
  $('ttConfirmationPod').onchange=e=>{confirmationPod=String(e.target.value||'');lastRenderSignature='';closeAgentDrawer();if(lastDashboard)renderDashboard(lastDashboard,{force:true});};
 }
 ensureNavButton();
}
function closeAgentDrawer({restoreFocus=true}={}){
 drawerRequestSeq++;
 const back=$('ttConfirmationDrawerBackdrop'),drawer=$('ttConfirmationDrawer'),returnFocus=drawerReturnFocus,openName=String(drawer?.dataset?.confirmationOpenAgent||'').trim();
 drawerReturnFocus=null;
 if(back)back.hidden=true;
 if(drawer){drawer.dataset.confirmationOpenAgent='';drawer.removeAttribute('aria-busy');drawer.innerHTML='';}
 document.documentElement.classList.remove('tt-confirmation-drawer-open');
 if(restoreFocus)requestAnimationFrame(()=>{
  let target=returnFocus?.isConnected?returnFocus:null;
  if(!target&&openName)target=[...document.querySelectorAll('[data-confirmation-agent]')].find(btn=>String(btn.dataset.confirmationAgent||'').trim().toLowerCase()===openName.toLowerCase())||null;
  try{target?.focus({preventScroll:true});}catch(_){target?.focus?.();}
 });
}
function drawerMetric(label,value,attrs=''){return `<div class="tt-coverage-drawer-metric"><span>${esc(label)}</span><strong ${attrs}>${esc(value)}</strong></div>`;}
function confirmationScopedAgents(){
 const d=lastDashboard;if(!d)return [];
 const role=normalizedRole(d.viewer?.role),selectedGroup=role==='admin'&&confirmationPod?(d.pods||[]).find(p=>p.pod===confirmationPod):null;
 return selectedGroup?.agents||d.agents||[];
}
async function openAgentDrawer(name,trigger=null){
 const targetName=String(name||'').trim(),back=$('ttConfirmationDrawerBackdrop'),drawer=$('ttConfirmationDrawer');if(!targetName||!back||!drawer||!active)return;
 if(!confirmationScopedAgents().some(agent=>String(agent?.name||'').trim().toLowerCase()===targetName.toLowerCase()))return;
 const requestedDate=date,requestedActorSig=actorSig(actor()),requestId=++drawerRequestSeq;
 drawerReturnFocus=trigger||document.activeElement;
 back.hidden=false;document.documentElement.classList.add('tt-confirmation-drawer-open');
 drawer.dataset.confirmationOpenAgent=targetName;drawer.setAttribute('aria-busy','true');drawer.innerHTML='<div class="tt-coverage-loading">Loading Agent Confirmation details…</div>';requestAnimationFrame(()=>drawer.focus({preventScroll:true}));
 try{
  const data=await api(`agent?date=${encodeURIComponent(requestedDate)}&name=${encodeURIComponent(targetName)}`);
  if(requestId!==drawerRequestSeq||back.hidden||!active||requestedDate!==date||requestedActorSig!==actorSig(actor()))return;
  const s=data.summary||{},tasks=Array.isArray(data.tasks)?data.tasks:[];
  if(data?.ok!==true||data?.authority!=='workforce-confirmation-v1'||String(data?.date||'')!==requestedDate||!s||String(s.name||'').trim().toLowerCase()!==targetName.toLowerCase())throw new Error('Confirmation returned an invalid Agent detail response. Refresh and try again.');
  if(!confirmationScopedAgents().some(agent=>String(agent?.name||'').trim().toLowerCase()===targetName.toLowerCase())){closeAgentDrawer({restoreFocus:false});return;}
  const state=liveState(s),present=confirmationStatusPresentation(s),detail=present.detail,idle=focusedIdleMs(s),separateAway=!s.connected||hasAwayTiming(s);
  const intervalEod=Number(s.interval1||0)+Number(s.interval2||0)+Number(s.interval3||0),eod=Number.isFinite(Number(s.submittedDisplayTotal))?Math.max(0,Number(s.submittedDisplayTotal)):intervalEod;
  const storeChoices=[...new Set(tasks.map(t=>String(t.storeName||'Unknown Store').trim()))].sort((a,b)=>a.localeCompare(b));
  const storeToolbar=tasks.length?`<label class="tt-si-drawer-filter">Group / filter by store <select data-tt-si-drawer-choice><option value="">All stores</option>${storeChoices.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('')}</select></label>`:'';
  const currentJob=s.currentJob?`${s.currentJob} · ${fmtInt(s.currentTask)}/${fmtInt(s.totalTasks)}`:'No open Confirmation task';
  const currentInterval=s.connected?`Interval ${Number(s.currentInterval)||1}`:'—';
  const podLabel=friendlyPodLabel(s.pod,s.podLabel)||'Confirmation',dailyHeading=requestedDate===phtDate()?'Today':'Daily Summary';
  drawer.dataset.confirmationOpenAgent=String(s.name||targetName);drawer.removeAttribute('aria-busy');
  drawer.innerHTML=`<div class="tt-coverage-drawer-head"><div><p class="tt-coverage-eyebrow">${esc(podLabel)}</p><h2>${esc(s.name||targetName)}</h2><p class="tt-coverage-subtitle">${esc(prettyDate(requestedDate))} · secure ${esc(actor()?.role||'')} scope · ${esc(detail)}</p></div><button type="button" class="tt-coverage-close" data-confirmation-close aria-label="Close Confirmation details">×</button></div>
  <section class="tt-coverage-drawer-section tt-confirmation-drawer-today"><div class="tt-coverage-drawer-section-head"><h3>${dailyHeading}</h3><span>Confirmation interval + presence activity</span></div><div class="tt-coverage-drawer-metrics">${drawerMetric('Interval 1',fmtInt(s.interval1))}${drawerMetric('Interval 2',fmtInt(s.interval2))}${drawerMetric('Interval 3',fmtInt(s.interval3))}${drawerMetric('End of Day',fmtInt(eod))}${drawerMetric('Active',fmtDuration(s.activeMs))}${drawerMetric(separateAway?'Idle':'Idle / Away',fmtDuration(idle))}${drawerMetric('Away',separateAway?fmtDuration(s.awayMs):'Requires current Tracker')}</div></section>
  <section class="tt-coverage-drawer-section"><div class="tt-coverage-drawer-section-head"><h3>Current Work</h3><span>Live Confirmation context</span></div><div class="tt-coverage-drawer-metrics tt-coverage-drawer-metrics-compact">${drawerMetric('Attendance',present.label)}${drawerMetric('Tracker sync',present.tracker)}${drawerMetric('Current job',currentJob)}${drawerMetric('Store',s.currentStoreName||'Unknown Store')}${drawerMetric('Current interval',currentInterval)}${drawerMetric('Current task',s.currentJob?`${fmtInt(s.currentTask)} / ${fmtInt(s.totalTasks)}`:'—')}${drawerMetric('Last sync',fmtAgo(s.serverUpdatedAtMs))}</div></section>
  <section class="tt-coverage-drawer-section"><div class="tt-coverage-drawer-section-head"><h3>Review Activity</h3><span>Confirmation task actions</span></div><div class="tt-coverage-drawer-metrics tt-coverage-drawer-metrics-compact">${drawerMetric('Confirmed EOD',fmtInt(s.submitted))}${drawerMetric('Manual adjustment',fmtSigned(s.submittedManualAdjustment))}${drawerMetric('Created',fmtInt(s.created))}${drawerMetric('Blurred',fmtInt(s.blurred))}${drawerMetric('Deleted',fmtInt(s.deleted))}${drawerMetric('No Match',fmtInt(s.noMatch))}</div></section>
  <section class="tt-coverage-panel tt-coverage-task-panel tt-confirmation-task-panel"><div class="tt-coverage-panel-head"><div><h3>Jobs & Task Activity</h3><p>${tasks.length} Confirmation task${tasks.length===1?'':'s'}</p></div></div>${storeToolbar}<div class="tt-coverage-task-wrap">${tasks.length?`<div class="tt-coverage-task-list">${tasks.map(t=>`<div class="tt-coverage-task tt-confirmation-task" data-tt-si-task-store="${esc(t.storeName||'Unknown Store')}"><strong>${esc(t.jobId)} · ${fmtInt(t.taskIndex)}/${fmtInt(t.totalTasks)}</strong>${t.storeName?`<span class="tt-si-task-store">${esc(t.storeName)}</span>`:""}<span>INT ${Number(t.interval)||'—'}</span><span>C ${fmtInt(t.created)}</span><span>B ${fmtInt(t.blurred)}</span><span>D ${fmtInt(t.deleted)}</span><span>X ${fmtInt(t.noMatch)}</span><span>A ${esc(fmtDuration(t.activeMs))}</span><span>I ${esc(fmtDuration(t.awayTimingAvailable===true?Math.max(0,(Number(t.idleMs)||0)-(Number(t.awayMs)||0)):(Number(t.idleMs)||0)))}</span><span>W ${t.awayTimingAvailable===true?esc(fmtDuration(t.awayMs)):'—'}</span><span class="tt-coverage-task-state ${esc(t.status)}">${esc(t.status||'unknown')}</span></div>`).join('')}</div>`:'<div class="tt-coverage-empty"><strong>No Confirmation task detail synced yet</strong><p>The daily interval summary can exist before per-task records arrive.</p></div>'}</div></section>`;
  drawer.querySelector('[data-tt-si-drawer-choice]')?.addEventListener('change',e=>{
        const chosen=e.target.value;for(const row of drawer.querySelectorAll('[data-tt-si-task-store]'))row.hidden=Boolean(chosen&&row.dataset.ttSiTaskStore!==chosen);
      });
      drawer.querySelector('[data-confirmation-close]')?.addEventListener('click',()=>closeAgentDrawer());
  requestAnimationFrame(()=>drawer.querySelector('[data-confirmation-close]')?.focus({preventScroll:true}));
 }catch(error){
  if(requestId!==drawerRequestSeq||back.hidden||!active)return;
  drawer.dataset.confirmationOpenAgent=targetName;drawer.removeAttribute('aria-busy');drawer.innerHTML=`<div class="tt-coverage-error">${esc(error?.message||'Could not load Agent Confirmation details.')}</div><button type="button" class="tt-coverage-btn" data-confirmation-close>Close</button>`;
  drawer.querySelector('[data-confirmation-close]')?.addEventListener('click',()=>closeAgentDrawer());
  requestAnimationFrame(()=>drawer.querySelector('[data-confirmation-close]')?.focus({preventScroll:true}));
 }
}
function close(){
 confirmationPaintPending=false;clearTimeout(confirmationPaintTimer);
 closeAgentDrawer({restoreFocus:false});if(!active)return;active=false;generation++;$('ttConfirmationRoot').hidden=true;
 for(const id of surfaces){if($(id))$(id).hidden=Boolean(snapshot[id]);}
 document.documentElement.classList.remove('tt-coverage-workspace-active');
 document.querySelectorAll('[data-tt-nav="confirmation"]').forEach(b=>b.classList.remove('is-active'));
}
function open(){
 build();document.dispatchEvent(new CustomEvent('trinotime:workspace-opening',{detail:'confirmation'}));
 if(!active){snapshot={};followShift=true;date=phtDate();lastRenderSignature='';if($('ttConfirmationDate'))$('ttConfirmationDate').value=date;if($('ttConfirmationFollowShift'))$('ttConfirmationFollowShift').hidden=true;for(const id of surfaces)if($(id))snapshot[id]=$(id).hidden;}
 active=true;for(const id of surfaces)if($(id))$(id).hidden=true;
 $('ttConfirmationRoot').hidden=false;document.documentElement.classList.add('tt-coverage-workspace-active');
 document.querySelectorAll('[data-tt-nav]').forEach(b=>b.classList.toggle('is-active',b.dataset.ttNav==='confirmation'));
 document.querySelectorAll('[data-tt-workspace]').forEach(b=>b.classList.remove('is-active'));
 refresh(true);
}
// STAGING smooth-scroll: data continues synchronizing while the visible
// Admin table waits until scrolling has settled before replacing its DOM.
let confirmationScrollAt=0,confirmationPaintTimer=null,confirmationPaintPending=false;
function scheduleConfirmationPaint(){
 clearTimeout(confirmationPaintTimer);
 confirmationPaintTimer=setTimeout(()=>{
  confirmationPaintTimer=null;
  if(!active||!confirmationPaintPending||!lastDashboard)return;
  if(Date.now()-confirmationScrollAt<330){scheduleConfirmationPaint();return;}
  confirmationPaintPending=false;
  if(identity===actorSig(actor()))renderDashboard(lastDashboard);
 },380);
}
document.addEventListener('scroll',event=>{
 if(!active)return;
 const target=event.target,root=$('ttConfirmationRoot');
 if(target===document||target===document.documentElement||root?.contains(target)){
  confirmationScrollAt=Date.now();
  if(confirmationPaintPending)scheduleConfirmationPaint();
 }
},true);
// UX18P42: avoid recreating the entire Confirmation workspace during periodic polls.
// Preserve its scroll container, its wide-table navigation and unaffected rows.
const confirmationBoundAgentButtons=new WeakSet();
function bindConfirmationAgentButtons(){
 const body=$('ttConfirmationBody');if(!body)return;
 body.querySelectorAll('[data-confirmation-agent]').forEach(btn=>{
  if(confirmationBoundAgentButtons.has(btn))return;
  confirmationBoundAgentButtons.add(btn);
  btn.addEventListener('click',()=>openAgentDrawer(btn.dataset.confirmationAgent||'',btn));
 });
}
function paintConfirmationSnapshot(markup){
 const body=$('ttConfirmationBody'),existing=$('ttConfirmationTableScroll');
 if(!body||!existing||!body.querySelector('.tt-ops-stat-grid')){
  if(body)body.innerHTML=markup;
  bindConfirmationAgentButtons();
  return;
 }
 const buffer=document.createElement('div');buffer.innerHTML=markup;
 const nextScroll=buffer.querySelector('#ttConfirmationTableScroll');
 if(!nextScroll){body.innerHTML=markup;bindConfirmationAgentButtons();return;}
 for(const selector of ['.tt-ops-stat-grid','.tt-ops-panel-head']){
  const current=body.querySelector(selector),next=buffer.querySelector(selector);
  if(current&&next&&current.innerHTML!==next.innerHTML)current.replaceWith(next);
 }
 const currentBody=existing.querySelector('tbody'),nextBody=nextScroll.querySelector('tbody');
 if(currentBody&&nextBody){
  const previous=[...currentBody.children],incoming=[...nextBody.children];
  if(previous.length!==incoming.length){currentBody.replaceChildren(...incoming);}
  else for(let i=0;i<previous.length;i++){
   if(previous[i].outerHTML!==incoming[i].outerHTML)previous[i].replaceWith(incoming[i]);
  }
 }
 const oldEmpty=body.querySelector('.tt-coverage-empty'),nextEmpty=buffer.querySelector('.tt-coverage-empty');
 if(oldEmpty&&!nextEmpty)oldEmpty.remove();
 else if(!oldEmpty&&nextEmpty)existing.closest('.tt-ops-panel')?.append(nextEmpty);
 else if(oldEmpty&&nextEmpty&&oldEmpty.innerHTML!==nextEmpty.innerHTML)oldEmpty.replaceWith(nextEmpty);
 bindConfirmationAgentButtons();
}
function renderDashboard(d,{force=false}={}){
 if(!force&&Date.now()-confirmationScrollAt<330){
  confirmationPaintPending=true;scheduleConfirmationPaint();return;
 }
 confirmationPaintPending=false;clearTimeout(confirmationPaintTimer);
 const role=normalizedRole(d.viewer?.role),selectedGroup=role==='admin'&&confirmationPod?(d.pods||[]).find(p=>p.pod===confirmationPod):null;
 const totals=selectedGroup?.totals||d.totals||{};
 const agents=selectedGroup?.agents||d.agents||[];
 const selectedPodLabel=selectedGroup?friendlyPodLabel(selectedGroup.pod,selectedGroup.podLabel):'';
 const openDrawerName=String($('ttConfirmationDrawer')?.dataset?.confirmationOpenAgent||'').trim();
 if(openDrawerName&&!agents.some(agent=>String(agent?.name||'').trim().toLowerCase()===openDrawerName.toLowerCase()))closeAgentDrawer({restoreFocus:false});
 const signature=JSON.stringify({pod:confirmationPod,totals:[totals.interval1||0,totals.interval2||0,totals.interval3||0,totals.submitted||0,totals.activeMs||0,totals.idleMs||0,totals.awayMs||0],agents:agents.map(r=>[r.name,r.podLabel||r.pod,r.connected?1:0,r.currentJob||'',r.currentTask||0,r.totalTasks||0,r.currentInterval||0,r.interval1||0,r.interval2||0,r.interval3||0,r.submittedDisplayTotal||0,r.activeMs||0,r.idleMs||0,r.awayMs||0,r.trackerState||'',r.lastActivityAt||0,r.idleSinceAt||0,r.awaySinceAt||0,r.shiftGeneration||0,r.shiftStatus||'',r.shiftLocked?1:0,r.liveNow?1:0,r.delayedNow?1:0,r.timeInAtLastSync?1:0,r.attendanceStatus||'',r.alternateWorkflow?.workflow||'',r.alternateWorkflow?.acceptedAtMs||0,r.alternateWorkflow?.trackerState||'',r.alternateWorkflow?.lastActivityAtMs||0,r.alternateWorkflow?.hasJob?1:0,r.serverUpdatedAtMs||0])});
 if(!force&&signature===lastRenderSignature)return;
 const oldScroll=$('ttConfirmationTableScroll');
 const scrollLeft=oldScroll?.scrollLeft||0,scrollTop=oldScroll?.scrollTop||0;
 const separateAway=(Number(totals.connectedAgents)||0)===0||(Number(totals.awayTimingAgents)||0)>=(Number(totals.connectedAgents)||0);
 const focusedIdle=separateAway?Math.max(0,(Number(totals.idleMs)||0)-(Number(totals.awayMs)||0)):(Number(totals.idleMs)||0);
 const cards=[1,2,3].map(i=>`<article class="tt-ops-stat"><span>Interval ${i}</span><strong>${Number(totals['interval'+i]||0).toLocaleString()}</strong><small>Submitted in interval ${i}</small></article>`).join('')+`<article class="tt-ops-stat is-primary"><span>End of Day</span><strong>${Number(totals.submitted??[1,2,3].reduce((n,i)=>n+Number(totals['interval'+i]||0),0)).toLocaleString()}</strong><small>Combined submitted total</small></article><article class="tt-ops-stat"><span>Active</span><strong>${fmtDuration(totals.activeMs)}</strong><small>Confirmation task work</small></article><article class="tt-ops-stat"><span>Idle</span><strong>${fmtDuration(focusedIdle)}</strong><small>${separateAway?'Focused inactivity':'Idle / Away on legacy timing'}</small></article><article class="tt-ops-stat"><span>Away</span><strong>${separateAway?fmtDuration(totals.awayMs):'—'}</strong><small>${separateAway?'Hidden / unfocused':'Requires current Tracker'}</small></article>`;
 const rows=agents.map(r=>{const job=r.currentJob?`${esc(r.currentJob)}${Number(r.currentTask)?` · ${Number(r.currentTask)}/${Number(r.totalTasks)||0}`:''}`:'—',state=liveState(r),present=confirmationStatusPresentation(r),idle=focusedIdleMs(r),podLabel=friendlyPodLabel(r.pod,r.podLabel);return `<tr><td><button type="button" class="tt-confirmation-agent-trigger" data-confirmation-agent="${esc(r.name)}" aria-label="Open Confirmation details for ${esc(r.name)}"><span class="tt-ops-agent"><span class="tt-ops-agent-avatar">${profileAvatarMarkup(r.name)}</span><span class="tt-ops-agent-copy"><strong>${esc(r.name)}</strong><small>${esc(podLabel)}${Number(r.shiftGeneration||0)>0?` · Reset ${Number(r.shiftGeneration||0).toLocaleString()}×`:``}${r.shiftLocked?` · Final locked`:``}</small></span></span></button></td><td><div class="tt-coverage-status-stack"><span class="tt-coverage-live" data-state="${esc(present.state)}">${esc(present.label)}</span><span class="tt-tracker-sync-pill${present.warning?' is-warning':''}">${esc(present.tracker)}</span><small>${esc(present.detail)}</small></div></td><td>${r.currentJob?`<span class="tt-ops-job" title="${job}">${job}${r.currentStoreName?`<small class="tt-si-current-store">${esc(r.currentStoreName)}</small>`:""}</span>`:'<span class="tt-ops-job">—</span>'}</td><td>${r.connected?`<span class="tt-ops-badge ${r.liveNow?'is-live':''}">Interval ${Number(r.currentInterval)||1}</span>`:'<span class="tt-ops-badge">Offline</span>'}</td><td class="tt-ops-num">${Number(r.interval1||0).toLocaleString()}</td><td class="tt-ops-num">${Number(r.interval2||0).toLocaleString()}</td><td class="tt-ops-num">${Number(r.interval3||0).toLocaleString()}</td><td class="tt-ops-num tt-ops-eod">${Number(r.submittedDisplayTotal??((r.interval1||0)+(r.interval2||0)+(r.interval3||0))).toLocaleString()}</td><td class="tt-ops-num">${fmtDuration(r.activeMs)}</td><td class="tt-ops-num">${fmtDuration(idle)}</td><td class="tt-ops-num">${r.connected&&!hasAwayTiming(r)?'—':fmtDuration(r.awayMs)}</td><td class="tt-ops-sync">${r.serverUpdatedAtMs?esc(new Date(r.serverUpdatedAtMs).toLocaleString()):'OFFLINE / Not synced'}</td></tr>`;}).join('');
 const confirmationMarkup=`<div class="tt-ops-stat-grid">${cards}</div><section class="tt-ops-panel"><div class="tt-ops-panel-head"><div><span>${selectedGroup?'Selected Team / POD':'Authorized roster'}</span><h3>Agent interval + presence activity</h3></div><small>${agents.length} Agent${agents.length===1?'':'s'} · ${Number(totals.timedInAgents)||0} Time In · ${Number(totals.liveAgents)||0} Confirmation live · ${Number(totals.otherWorkflowLiveAgents)||0} Coverage active${selectedPodLabel?' · '+esc(selectedPodLabel):' in scope'}</small></div><div id="ttConfirmationTableScroll" class="tt-ops-table-scroll"><table class="tt-ops-table tt-confirmation-table"><thead><tr><th>Agent</th><th>Attendance / Tracker</th><th>Current job</th><th>Current interval</th><th>Interval 1</th><th>Interval 2</th><th>Interval 3</th><th>EOD</th><th>Active</th><th>Idle today</th><th>Away today</th><th>Last sync</th></tr></thead><tbody>${rows}</tbody></table></div>${rows?'':'<div class="tt-coverage-empty"><strong>No active Agents in this scope</strong><p>TrinoTime did not find an active Agent roster entry for this Confirmation view.</p></div>'}</section>`;
 paintConfirmationSnapshot(confirmationMarkup);
 const next=$('ttConfirmationTableScroll');if(next){next.scrollLeft=scrollLeft;next.scrollTop=scrollTop;globalThis.TrinoTimeWideTableScroll?.mount?.(next);}
 if($('ttConfirmationScope'))$('ttConfirmationScope').textContent=selectedPodLabel?selectedPodLabel:(d.scope==='all-pods'?'All PODs':d.scope==='own-pod'?'My POD':'My data');
 lastRenderSignature=signature;
}
async function refresh(force=false){
 if(!active||busy)return;
 const a=actor(),sig=actorSig(a),ticket=generation,requestedDate=date;
 if(sig!==identity){closeAgentDrawer({restoreFocus:false});identity=sig;followShift=true;activeShiftReportDate='';date=phtDate();if($('ttConfirmationDate'))$('ttConfirmationDate').value=date;confirmationPod='';lastDashboard=null;lastRenderSignature='';$('ttConfirmationBody').innerHTML='<div class="tt-coverage-loading">Loading Confirmation…</div>';$('ttConfirmationScope').textContent='';if($('ttConfirmationPod'))$('ttConfirmationPod').value='';}
 if(!a){closeAgentDrawer({restoreFocus:false});$('ttConfirmationBody').innerHTML='<div class="tt-coverage-error">Sign in to view Confirmation.</div>';return;}
 busy=true;
 const ttFreshnessKey=sig+'|'+requestedDate+'|'+String(followShift);
 window.TrinoTimeDashboardFreshness?.begin('confirmation',ttFreshnessKey);
 try{
  const d=await api('dashboard?date='+encodeURIComponent(followShift?phtDate():date)+'&followActiveShift='+(normalizedRole(a.role)==='agent'&&followShift?'1':'0'));
  if(!active||ticket!==generation||sig!==actorSig(actor())||requestedDate!==date)return;
  assertDashboardViewerBinding(a,d);
  activeShiftReportDate=normalizedRole(d.viewer?.role)==='agent'?String(d.activeShiftReportDate||''):'';
  if(followShift && d.date && d.date!==date){
    // Dashboard response already includes the correct shift-day records.
    date=d.date;
    lastRenderSignature='';
    if($('ttConfirmationDate'))$('ttConfirmationDate').value=date;
  }
  const label=$('ttConfirmationDate')?.closest('label')?.querySelector('span');
  if(label)label.textContent=activeShiftReportDate&&date===activeShiftReportDate?'Active shift date':'EOD date';
  const role=normalizedRole(d.viewer?.role),podField=$('ttConfirmationPodField'),podSelect=$('ttConfirmationPod');
  if(podField)podField.hidden=role!=='admin';
  if(role==='admin'&&podSelect){
   const validPods=(d.pods||[]).map(p=>String(p.pod||''));if(confirmationPod&&!validPods.includes(confirmationPod))confirmationPod='';
   const options='<option value="">All PODs / Teams</option>'+(d.pods||[]).map(p=>`<option value="${esc(p.pod)}">${esc(friendlyPodLabel(p.pod,p.podLabel))} · ${Number(p.agents?.length||0)} agent${Number(p.agents?.length||0)===1?'':'s'}</option>`).join('');
   if(podSelect.innerHTML!==options)podSelect.innerHTML=options;podSelect.value=confirmationPod;
  }else confirmationPod='';
  lastDashboard=d;
  renderDashboard(d,{force});
  window.TrinoTimeDashboardFreshness?.success('confirmation',ttFreshnessKey);
  document.dispatchEvent(new CustomEvent('trinotime:store-context',{detail:{workflow:'confirmation',date,viewer:d.viewer,scope:d.scope,pod:confirmationPod}}));
 }catch(e){if(active&&ticket===generation&&sig===actorSig(actor())){closeAgentDrawer({restoreFocus:false});$('ttConfirmationBody').innerHTML='<div class="tt-coverage-error">'+esc(e.message)+'</div>';lastRenderSignature='';window.TrinoTimeDashboardFreshness?.fail('confirmation',ttFreshnessKey);}}finally{busy=false;}
}
document.addEventListener('trinotime:workspace-opening',e=>{if(e.detail!=='confirmation')close();});
document.addEventListener('keydown',event=>{
 const back=$('ttConfirmationDrawerBackdrop'),drawer=$('ttConfirmationDrawer');if(!back||back.hidden||!drawer)return;
 if(event.key==='Escape'){event.preventDefault();closeAgentDrawer();return;}
 if(event.key==='Tab'){
  const focusable=[...drawer.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(el=>!el.hidden&&el.getClientRects().length);
  if(!focusable.length){event.preventDefault();drawer.focus?.();return;}
  const first=focusable[0],last=focusable[focusable.length-1];
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
 }
});
window.addEventListener('click',e=>{const btn=e.target.closest('[data-tt-nav],[data-tt-workspace]');if(!btn)return;if(btn.dataset.ttNav==='confirmation'){e.preventDefault();open();}else close();},true);
setInterval(()=>{build();const sig=actorSig(actor());if(sig!==identity&&active){generation++;closeAgentDrawer({restoreFocus:false});identity=sig;lastRenderSignature='';$('ttConfirmationBody').innerHTML='<div class="tt-coverage-loading">Loading Confirmation…</div>';$('ttConfirmationScope').textContent='';}if(!document.hidden)refresh();},6000);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',build);else build();
})();
