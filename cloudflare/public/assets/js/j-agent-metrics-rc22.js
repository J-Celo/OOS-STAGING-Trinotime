(() => {
'use strict';
if(window.__ttMetricsDashboardBuild)return;
window.__ttMetricsDashboardBuild='RC28';
// UX18P41: focused, beginner-friendly performance overview; no change to metrics authority.
window.__ttMetricsIdentityAvatarBuild='M2.3';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const phtDate=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
let active=false,snapshot={},date=phtDate(),identity='',generation=0,busy=false;
let metricsSearchTimer=null;
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
      throw Object.assign(new Error('Metrics returned an invalid viewer role. Refresh TrinoTime after the server update.'),{code:'COVERAGE_RESPONSE_INVALID'});
    }
    if(expected&&expected!==actual){
      throw Object.assign(new Error(`Metrics session identity mismatch (${expected} page / ${actual} server). Refresh TrinoTime or sign in again.`),{code:'COVERAGE_SESSION_BINDING_MISMATCH'});
    }
    const scopeForRole={admin:'all-pods',team_leader:'own-pod',agent:'self'};
    if(dashboard?.ok!==true||dashboard?.authority!=='workforce-metrics-v1'||dashboard?.scope!==scopeForRole[actual]||!Array.isArray(dashboard?.agents)||!Array.isArray(dashboard?.pods)){
      throw Object.assign(new Error('Metrics returned an invalid dashboard response. Retry after the server update.'),{code:'COVERAGE_RESPONSE_INVALID'});
    }
    if(expected==='agent'){
      const client=String(a?.name||'').trim().toLowerCase(),server=String(dashboard?.viewer?.name||'').trim().toLowerCase();
      if(client&&server&&client!==server)throw Object.assign(new Error('Metrics Agent identity changed. Refresh TrinoTime or sign in again.'),{code:'COVERAGE_SESSION_BINDING_MISMATCH'});
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

  async function authHeaders(method='GET'){
    const headers={Accept:'application/json'};
    if(!['GET','HEAD'].includes(method))headers['Content-Type']='application/json';
    const a=actor();
    const expectedRole=normalizedRole(a?.role);
    if(expectedRole)headers['X-TT-Metrics-Expected-Role']=expectedRole;
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
    const response=await fetch('/api/workforce/metrics/'+String(path||'').replace(/^\/+/,''),{
      method,headers,cache:'no-store',credentials:'same-origin',...(body===undefined?{}:{body:JSON.stringify(body)})
    });
    let data;
    try{data=await response.json();}
    catch(_){throw Object.assign(new Error(`Metrics returned a non-JSON response (HTTP ${response.status}). Retry or check the TrinoTime API deployment.`),{code:'COVERAGE_RESPONSE_INVALID',status:response.status});}
    if(!response.ok){
      const e=new Error(data?.message||`Metrics authority returned ${response.status}.`);
      e.code=data?.error||'COVERAGE_API_ERROR';e.status=response.status;throw e;
    }
    return data||{};
  }


// Overview V2: self-profile Coverage letter from the existing authorized metrics authority.
// Does not infer a grade when the authoritative target/score is unavailable.
let profileGradeCache=null;
window.TrinoTimeMetricsProfileGradeMount=async function(host,expectedName){
 if(!host?.isConnected||!expectedName)return;
 const viewer=actor();
 if(normalizedRole(viewer?.role)!=='agent'||String(viewer?.name||'').trim().toLowerCase()!==String(expectedName).trim().toLowerCase())return;
 const heading=host.querySelector('.rc15-profile-hero .rc15-name-row');
 if(!heading)return;
 const marker=document.createElement('span');
 marker.className='tt-v2-self-profile-grade';marker.setAttribute('role','status');
 marker.textContent='Coverage grade · Loading';heading.append(marker);
 const identityKey=String(viewer.name).toLowerCase()+'|'+String(viewer.pod||'').toLowerCase();
 try{
  let grade='NA';
  if(profileGradeCache&&profileGradeCache.key===identityKey&&Date.now()-profileGradeCache.at<45000){grade=profileGradeCache.grade;}
  else{
   const d=await api('shifts?range=current&offset=0');
   const now=actor();
   if(d.ok!==true||d.authority!=='workforce-metrics-v1'||normalizedRole(d.viewer?.role)!=='agent'||d.scope!=='self'||!Array.isArray(d.rows)||String(d.viewer?.name||'').trim().toLowerCase()!==identityKey.split('|')[0]||normalizedRole(now?.role)!=='agent'||String(now?.name||'').trim().toLowerCase()!==identityKey.split('|')[0])throw Error('Metrics session is not verified');
   const coverage=d.rows.filter(r=>String(r.job||'').toLowerCase()==='coverage'&&String(r.name||'').trim().toLowerCase()===identityKey.split('|')[0]);
   grade=coverage.length?summarize(coverage).grade:'NA';
   profileGradeCache={key:identityKey,at:Date.now(),grade};
  }
  if(!marker.isConnected||!host.isConnected)return;
  marker.dataset.grade=grade;
  marker.textContent=grade==='NA'?'Coverage grade · Not graded':'Coverage grade · '+grade;
 }catch(_){if(marker.isConnected)marker.textContent='Coverage grade · Unavailable';}
};
// Admin Inspector is already a verified Admin-only workspace. Query the same
// authorized current-shift metrics for the selected agent; do not use public
// profile-directory records or attendance-reward letters as productivity grades.
window.TrinoTimeMetricsInspectorGradeMount=async function(host,expectedName){
 if(!host?.isConnected||!expectedName||normalizedRole(actor()?.role)!=='admin')return;
 const key=String(expectedName).trim().toLowerCase();
 const existing=host.querySelector('[data-tt-inspector-coverage-grade]');
 if(existing?.dataset?.agent===key)return;
 const chip=document.createElement('span');chip.dataset.ttInspectorCoverageGrade='';chip.dataset.agent=key;
 chip.className='tt-v2-inspector-grade';chip.setAttribute('role','status');chip.textContent='Coverage grade · Loading';
 const chips=host.querySelector('.tt-admin-inspector-profile-chips');
 if(!chips)return;chips.append(chip);
 try{
  const d=await api('shifts?range=current&offset=0&agent='+encodeURIComponent(expectedName));
  if(d.ok!==true||d.authority!=='workforce-metrics-v1'||normalizedRole(d.viewer?.role)!=='admin'||d.scope!=='all-pods'||!Array.isArray(d.rows)||normalizedRole(actor()?.role)!=='admin')throw Error('Metrics authority unavailable');
  const rows=d.rows.filter(r=>String(r.name||'').trim().toLowerCase()===key&&String(r.job||'').toLowerCase()==='coverage');
  const grade=rows.length?summarize(rows).grade:'NA';
  if(!chip.isConnected||!host.isConnected||chip.dataset.agent!==key)return;
  chip.dataset.grade=grade;chip.textContent=grade==='NA'?'Coverage grade · Not graded':'Coverage grade · '+grade;
 }catch(_){if(chip.isConnected)chip.textContent='Coverage grade · Unavailable';}
};
let lastData=null,lastRenderSignature='',agentQuery='',shiftRange='current',shiftOffset=0,requestedAgent='',metricsPod='',metricsPodInitialized=false,lastRefreshAt=0,pendingRefresh=false,shiftScorecardsCollapsed=true;
window.__ttAgentMetricsBuild='RC28';
window.__ttAgentMetricsPresenceBuild='RC29';
window.__ttMetricsPodScopeBuild='M2.9.3';
window.__ttMetricsTlCleanupBuild='M2.9.5';
window.__ttMetricsHistoricalSyncBuild='M2.9.5';
window.__ttMetricsTargetRefreshBuild='M2.9.8';
window.__ttMetricsTargetReadbackBuild='M2.9.15';
window.__ttMetricsDefaultTargetBuild='M2.9.16';
window.__ttMetricsQaRosterBuild='UX18P40';
const DEFAULT_TARGET_SECONDS=70;
function metricsIcon(){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 19V9"></path><path d="M12 19V5"></path><path d="M19 19v-7"></path><path d="M3 19h18"></path></svg>';}
function icon(name){
 const paths={speed:'<path d="M4 15a8 8 0 1 1 16 0"></path><path d="m12 15 4-4"></path><path d="M6.5 18.5h11"></path>',tasks:'<path d="M9 5h10"></path><path d="M9 12h10"></path><path d="M9 19h10"></path><path d="m4 5 1 1 2-2"></path><path d="m4 12 1 1 2-2"></path><path d="m4 19 1 1 2-2"></path>',clock:'<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path>',target:'<circle cx="12" cy="12" r="8"></circle><circle cx="12" cy="12" r="4"></circle><path d="M12 2v3"></path><path d="M12 19v3"></path><path d="M2 12h3"></path><path d="M19 12h3"></path>',pulse:'<path d="M3 12h4l2-5 4 10 2-5h6"></path>',users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>'};
 return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.pulse}</svg>`;
}
function ensureNavButton(){
 const premium=document.querySelector('#ttPremiumSidebar .tt-premium-nav');
 const nav=premium||$('ttCoverageWorkspaceTabs');
 if(!nav)return null;
 let btn=nav.querySelector('[data-tt-nav="metrics"]');
 if(!btn){btn=document.createElement('button');btn.type='button';btn.dataset.ttNav='metrics';btn.setAttribute('aria-label','Agent Metrics');btn.dataset.ttTooltip='Agent Metrics';nav.append(btn);}
 if(premium){
  if(btn.dataset.ttNavMode!=='premium'){btn.className='tt-premium-nav-btn';btn.innerHTML=metricsIcon()+'<span class="tt-nav-label">Agent Metrics</span>';btn.dataset.ttNavMode='premium';}
  const anchor=nav.querySelector('[data-tt-nav="confirmation"]')||nav.querySelector('[data-tt-nav="coverage"]');
  if(anchor&&btn.previousElementSibling!==anchor)anchor.insertAdjacentElement('afterend',btn);
 }else{
  if(btn.dataset.ttNavMode!=='fallback'){btn.className='tt-coverage-workspace-tab';btn.textContent='Agent Metrics';btn.dataset.ttNavMode='fallback';}
  const anchor=nav.querySelector('[data-tt-nav="confirmation"]')||nav.querySelector('[data-tt-workspace="coverage"],[data-tt-nav="coverage"]');
  if(anchor&&btn.previousElementSibling!==anchor)anchor.insertAdjacentElement('afterend',btn);
 }
 return btn;
}
function build(){
 if(!$('ttMetricsRoot')){
  const root=document.createElement('section');root.id='ttMetricsRoot';root.className='tt-coverage-root tt-ops-root tt-metrics-root tt-metrics-rc25';root.hidden=true;
  root.innerHTML='<div class="tt-ops-shell"><header class="tt-ops-hero tt-mx-hero"><div class="tt-ops-hero-copy"><p class="tt-ops-eyebrow">Workforce Intelligence</p><h2 class="tt-ops-title">Agent Metrics</h2><p class="tt-ops-subtitle">Your teams, grades, and measured work—all in one place.</p></div><div class="tt-ops-toolbar"><span id="ttMetricsScope" class="tt-coverage-scope"></span><label id="ttMetricsPodScopeField" class="tt-ops-field tt-pod-scope-field" hidden><span>Team</span><select id="ttMetricsPodScope" class="tt-coverage-select" aria-label="Choose POD or team metrics"></select></label><label id="ttMetricsAgentField" class="tt-ops-field tt-mx-agent-field" hidden><span>Agent</span><div class="tt-mx-agent-picker"><input id="ttMetricsAgent" class="tt-coverage-select" type="search" list="ttMetricsAgentList" autocomplete="off" placeholder="All agents" aria-label="Find agent performance"><button id="ttMetricsAgentClear" class="tt-mx-agent-clear" type="button" title="Show all agents">All</button><datalist id="ttMetricsAgentList"></datalist></div></label><details class="tt-mx-advanced-filters"><summary>More options <span aria-hidden="true">⌄</span></summary><div class="tt-mx-advanced-body"><p>View a previous day or a selected agent&#39;s locked shift history.</p><label class="tt-ops-field"><span>Period</span><select id="ttMetricsRange" class="tt-coverage-select"><option value="current">Current / latest shift</option><option value="7">Last 7 locked shifts</option><option value="30">Last 30 locked shifts</option><option value="date">Historical date</option></select></label><label id="ttMetricsDateField" class="tt-ops-field" hidden><span>Date</span><input id="ttMetricsDate" class="tt-coverage-date" type="date"></label></div></details><label class="tt-ops-field"><span>Work type</span><select id="ttMetricsJob" class="tt-coverage-select"><option value="coverage" selected>Coverage</option><option value="confirmation">Confirmation</option><option value="all">Both workflows</option></select></label><button id="ttMetricsRefresh" class="tt-coverage-btn tt-ops-refresh">Refresh</button></div></header><details class="tt-mx-method-help"><summary>How grades work</summary><div class="tt-mx-trust-note"><span class="tt-mx-trust-icon">'+icon('pulse')+'</span><div><strong>Measured performance, not quality scoring</strong><p>Based on measured tasks and active POD targets. Idle and Away never reduce the grade.</p></div></div></details><details id="ttMetricsSettings" class="tt-ops-settings tt-mx-settings" hidden><summary><span>POD efficiency targets</span><small>Admin configuration</small></summary><div class="tt-ops-settings-body"><p>Automatic default: 70 seconds/task for every team and both workflows (effective October 28, 2026). Save a POD-specific target only to override it. Saved targets apply from their effective date. Original locked scorecards never change; eligible missing grades may be shown as retrospective projections.</p><form id="ttMetricsForm"><label>POD <select id="ttMetricsPod" required></select></label><label>Job <select id="ttMetricsTargetJob"><option value="coverage">Coverage</option><option value="confirmation">Confirmation</option></select></label><label>Target seconds/task <input id="ttMetricsTarget" type="number" min="0.1" max="86400" step="0.01" value="70" required></label><label>Applies from <input id="ttMetricsEffective" type="date" required></label><button class="tt-coverage-btn" type="submit">Save target</button></form><p id="ttMetricsTargetSource" class="tt-ops-save-status" role="status"></p><p id="ttMetricsSaveStatus" class="tt-ops-save-status" role="status"></p></div></details><div id="ttMetricsBody" class="tt-ops-body"><div class="tt-coverage-loading">Loading Agent Metrics…</div></div></div>';
  ($('ttCoverageRoot')?.parentElement||$('mainContent')?.parentElement||document.body).append(root);
  $('ttMetricsDate').value=date;$('ttMetricsDate').max=phtDate();$('ttMetricsEffective').value=date;
  $('ttMetricsDate').onchange=e=>{const today=phtDate();date=String(e.target.value||today);if(date>today){date=today;e.target.value=today;}generation++;lastRefreshAt=0;lastData=null;lastRenderSignature='';$('ttMetricsBody').innerHTML='<div class="tt-coverage-loading">Loading historical metrics…</div>';refresh(true);};
  $('ttMetricsRange').onchange=e=>{shiftRange=e.target.value;shiftOffset=0;requestedAgent=agentQuery;shiftScorecardsCollapsed=true;setShiftScorecardsCollapsed(true);generation++;lastRefreshAt=0;const dateField=$('ttMetricsDateField');if(dateField)dateField.hidden=shiftRange!=='date';if(shiftRange==='date'){const today=phtDate();$('ttMetricsDate').max=today;if(!date||date>today){date=today;$('ttMetricsDate').value=today;}}lastData=null;lastRenderSignature='';$('ttMetricsBody').innerHTML='<div class="tt-coverage-loading">'+(shiftRange==='date'?'Loading historical metrics…':'Loading Agent Metrics…')+'</div>';refresh(true);};
  $('ttMetricsRefresh').onclick=()=>manualMetricsRefresh();$('ttMetricsJob').onchange=()=>{lastRenderSignature='';renderRows(true);};
  // UX18P42: coalesce search keystrokes so large authorized team summaries are not re-rendered on every character.

 $('ttMetricsAgent').oninput=e=>{agentQuery=String(e.target.value||'').trim();clearTimeout(metricsSearchTimer);metricsSearchTimer=setTimeout(()=>{metricsSearchTimer=null;lastRenderSignature='';if(active)renderRows(true);},140);};
  $('ttMetricsAgent').onchange=e=>{agentQuery=String(e.target.value||'').trim();requestedAgent=agentQuery;shiftOffset=0;generation++;lastRenderSignature='';refresh(true);};
  $('ttMetricsAgentClear').onclick=()=>{agentQuery='';$('ttMetricsAgent').value='';requestedAgent='';shiftOffset=0;generation++;lastRenderSignature='';refresh(true);};
  $('ttMetricsPodScope').onchange=e=>{metricsPod=String(e.target.value||'__all__');metricsPodInitialized=true;agentQuery='';requestedAgent='';shiftOffset=0;generation++;lastRenderSignature='';if($('ttMetricsAgent'))$('ttMetricsAgent').value='';refresh(true);};
  $('ttMetricsPod').onchange=fillTarget;$('ttMetricsTargetJob').onchange=fillTarget;
  $('ttMetricsForm').onsubmit=async e=>{e.preventDefault();const button=e.submitter;button.disabled=true;try{
   const savedJob=$('ttMetricsTargetJob').value,saved=await api('targets',{method:'POST',body:{pod:$('ttMetricsPod').value,job:savedJob,secondsPerTask:Number($('ttMetricsTarget').value),effectiveDate:$('ttMetricsEffective').value}});
   if(!saved?.resolvedTarget||Number(saved.resolvedTarget.secondsPerTask)!==Number($('ttMetricsTarget').value))throw new Error('Target save could not be verified for grading. Retry the save.');
   lastRefreshAt=0;lastRenderSignature='';await refresh(true);fillTarget();
   const combined=$('ttMetricsJob')?.value==='all';
   $('ttMetricsSaveStatus').textContent=`Target saved and verified for ${savedJob==='coverage'?'Coverage':'Confirmation'}.`+(combined?' Combined grading requires targets for every measured workflow.':'');
  }catch(error){$('ttMetricsSaveStatus').textContent=error.message;}finally{button.disabled=false;}};
 }
 ensureNavButton();
}
function fillTarget(){const p=lastData?.pods?.find(p=>p.pod===$('ttMetricsPod').value),t=p?.[$('ttMetricsTargetJob').value],saved=Number(t?.secondsPerTask);$('ttMetricsTarget').value=Number.isFinite(saved)&&saved>0?saved:DEFAULT_TARGET_SECONDS;const status=$('ttMetricsTargetSource');if(status)status.textContent=t?.source==='saved'?`Saved custom target: ${number(t.secondsPerTask)}s/task (effective ${t.effectiveDate}).`:t?.source==='default'?`Automatic policy: 70s/task since October 28, 2026. No manual save needed.`:'Default policy applies to new/current shifts; older dates without saved targets remain ungraded.';}
function close(){clearTimeout(metricsSearchTimer);metricsPaintPending=false;clearTimeout(metricsPaintTimer);if(!active)return;active=false;generation++;$('ttMetricsRoot').hidden=true;for(const id of surfaces)if($(id))$(id).hidden=Boolean(snapshot[id]);document.documentElement.classList.remove('tt-coverage-workspace-active');document.querySelectorAll('[data-tt-nav="metrics"]').forEach(b=>b.classList.remove('is-active'));}
function open(){build();document.dispatchEvent(new CustomEvent('trinotime:workspace-opening',{detail:'metrics'}));if(!active){snapshot={};for(const id of surfaces)if($(id))snapshot[id]=$(id).hidden;shiftScorecardsCollapsed=true;setShiftScorecardsCollapsed(true);}active=true;for(const id of surfaces)if($(id))$(id).hidden=true;$('ttMetricsRoot').hidden=false;document.documentElement.classList.add('tt-coverage-workspace-active');document.querySelectorAll('[data-tt-nav]').forEach(b=>b.classList.toggle('is-active',b.dataset.ttNav==='metrics'));document.querySelectorAll('[data-tt-workspace]').forEach(b=>b.classList.remove('is-active'));refresh(true);}
const number=v=>v===null||v===undefined||!Number.isFinite(Number(v))?'—':Number(v).toLocaleString(undefined,{maximumFractionDigits:2});
const whole=v=>v===null||v===undefined||!Number.isFinite(Number(v))?'—':Math.round(Number(v)).toLocaleString();
function gradeFor(score){if(score===null||!Number.isFinite(score))return 'NA';return score>=100?'A':score>=80?'B':score>=60?'C':score>=40?'D':'F';}
// Display safety for older immutable snapshots created before M2.9.53.
function capScore(value){const n=Number(value);return value===null||value===undefined||!Number.isFinite(n)?null:Math.max(0,Math.min(100,n));}
function gradeLabel(grade,summary={}){if(grade!=='NA')return ({A:'Meets or exceeds target',B:'Near target',C:'Developing pace',D:'Below target',F:'Critical pace gap'})[grade]||'Measured performance';if(Number(summary.totalMeasured)>0&&Array.isArray(summary.missingTargetJobs)&&summary.missingTargetJobs.length)return 'Target required';return 'Awaiting measured data';}
function summarize(rows){
 const totalSubmitted=rows.reduce((n,r)=>n+(Number(r.submitted)||0),0),totalMeasured=rows.reduce((n,r)=>n+(Number(r.measuredTasks)||0),0),totalActiveMs=rows.reduce((n,r)=>n+(Number(r.measuredActiveMs)||0),0);
 const totalPresenceActiveMs=rows.reduce((n,r)=>n+(Number(r.presenceActiveMs)||0),0),totalFocusedIdleMs=rows.reduce((n,r)=>n+(Number(r.focusedIdleMs)||0),0),totalAwayMs=rows.reduce((n,r)=>n+(Number(r.awayMs)||0),0),timingAvailable=rows.some(r=>Number(r.lastSyncAtMs)>0);
 const valid=rows.filter(r=>Number(r.measuredTasks)>0&&r.efficiencyPercent!==null&&Number.isFinite(Number(r.efficiencyPercent))),targeted=rows.filter(r=>Number(r.measuredTasks)>0&&Number(r.target?.secondsPerTask)>0);
 // Cap each workflow's earned time before scope averaging (not the raw measured durations).
 const scoredMs=valid.reduce((n,r)=>n+Number(r.measuredActiveMs),0),earnedMs=valid.reduce((n,r)=>n+Math.min(Number(r.measuredActiveMs),Number(r.measuredTasks)*Number(r.target.secondsPerTask)*1000),0);
 const missingTargetJobs=[...new Set(rows.filter(r=>Number(r.measuredTasks)>0&&!Number(r.target?.secondsPerTask)).map(r=>String(r.job||'').toLowerCase()).filter(Boolean))];
 const retrospectiveCount=rows.filter(r=>r.gradeSource==='retrospective').length;
 const incomplete=rows.some(r=>Number(r.measuredTasks)>0&&(r.efficiencyPercent===null||!r.target));
 const efficiency=scoredMs&&!incomplete?capScore(earnedMs/scoredMs*100):null;
 const targetWeight=targeted.reduce((n,r)=>n+Number(r.measuredTasks),0),targetPace=targetWeight?targeted.reduce((n,r)=>n+Number(r.target.secondsPerTask)*Number(r.measuredTasks),0)/targetWeight:null;
 const pace=totalMeasured&&totalActiveMs?totalActiveMs/totalMeasured/1000:null,measurementCoverage=totalSubmitted?Math.min(100,totalMeasured/totalSubmitted*100):null;
 return {totalSubmitted,totalMeasured,totalActiveMs,totalPresenceActiveMs,totalFocusedIdleMs,totalAwayMs,timingAvailable,efficiency,targetPace,pace,measurementCoverage,agents:new Set(rows.map(r=>r.name)).size,grade:gradeFor(efficiency),missingTargetJobs,retrospectiveCount};
}
function duration(ms){const sec=Math.max(0,Math.floor((Number(ms)||0)/1000)),h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60);return h?`${h}h ${m}m`:`${m}m`;}
function paceStatus(s){
 if(s.pace===null||s.targetPace===null)return {text:'Target comparison unavailable',tone:'neutral'};
 const pct=(s.targetPace-s.pace)/s.targetPace*100;
 if(Math.abs(pct)<1)return {text:'On target pace',tone:'good'};
 return pct>0?{text:`${Math.abs(pct).toFixed(0)}% faster than target`,tone:'good'}:{text:`${Math.abs(pct).toFixed(0)}% slower than target`,tone:'warn'};
}
// UX18P41: overview cards summarize verified server data without inventing grades.
function podStatus(m){
 const measured=Number(m?.totalMeasured||0),score=capScore(m?.efficiency);
 if(measured<=0)return {kind:'empty',title:'No measured work',detail:'No verified task timing for this period'};
 if(score===null){
  const reason=String(m?.gradeReason||'');
  const detail=/no effective target/i.test(reason)?'No target for these recorded shifts':/incomplete/i.test(reason)?'Incomplete task timing':'Grade unavailable for this period';
  return {kind:'review',title:'Grade unavailable',detail};
 }
 return {kind:'graded',title:gradeFor(score)+' · '+Math.round(score)+'%',detail:'Measured productivity grade'};
}
function podOverview(items){
 const withWork=items.filter(x=>Number(x.summary?.totalMeasured||0)>0),withoutWork=items.filter(x=>Number(x.summary?.totalMeasured||0)<=0);
 const graded=withWork.filter(x=>podStatus(x.summary).kind==='graded').length;
 const needsReview=withWork.length-graded;
 withWork.sort((a,b)=>Number(b.summary?.totalMeasured||0)-Number(a.summary?.totalMeasured||0));
 const card=({name,summary})=>{
  const state=podStatus(summary),tasks=Number(summary?.totalSubmitted||0),measured=Number(summary?.totalMeasured||0);
  return `<article class="tt-mx-team-card is-${state.kind}"><div class="tt-mx-team-card-top"><strong>${esc(name)}</strong><span class="tt-mx-team-status">${esc(state.title)}</span></div><p>${whole(tasks)} submitted <span aria-hidden="true">·</span> ${whole(measured)} measured</p><small title="${esc(summary?.gradeReason||'')}">${esc(state.detail)}${Number(summary?.retrospectiveCount)>0?' · Retrospective grade included':''}</small></article>`;
 };
 return `<section class="tt-mx-section tt-mx-team-overview" aria-label="Team performance overview"><div class="tt-mx-section-head"><div><span>TEAM OVERVIEW</span><h3>Teams at a glance</h3></div><small>All authorized Agents · independent of roster page</small></div><p class="tt-mx-team-summary"><strong>${withWork.length}</strong> with measured work <span>·</span> <strong>${graded}</strong> graded <span>·</span> <strong>${needsReview}</strong> need review</p>${withWork.length?`<div class="tt-mx-team-grid">${withWork.map(card).join('')}</div>`:'<p class="tt-mx-team-empty">No measured work in this view yet. Try another date or work type.</p>'}${withoutWork.length?`<details class="tt-mx-no-work"><summary>${withoutWork.length} team${withoutWork.length===1?'':'s'} without measured work <span>Show teams</span></summary><div class="tt-mx-team-grid is-muted">${withoutWork.map(card).join('')}</div></details>`:''}</section>`;
}
function statCard(iconName,label,value,sub,tone=''){return `<article class="tt-mx-stat ${tone?'is-'+tone:''}"><span class="tt-mx-stat-icon">${icon(iconName)}</span><div><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(sub)}</small></div></article>`;}
function jobCard(job,rowsOrSummary){
 const s=Array.isArray(rowsOrSummary)?summarize(rowsOrSummary):(rowsOrSummary||summarize([])),label=job==='coverage'?'Coverage':'Confirmation',status=paceStatus(s),score=capScore(s.efficiency)===null?'—':Math.round(capScore(s.efficiency))+'%',grade=s.grade||'NA';
 return `<article class="tt-mx-job-card" data-grade="${grade}"><div class="tt-mx-job-head"><div><span>${label}</span><strong>${score}</strong><small>Efficiency index</small></div><span class="tt-mx-grade-badge" data-grade="${grade}">${grade==='NA'?'N/A':grade}</span></div><div class="tt-mx-progress"><i style="width:${s.efficiency===null?0:Math.min(100,Math.max(0,s.efficiency))}%"></i></div><div class="tt-mx-job-metrics"><div><span>Pace</span><strong>${s.pace===null?'—':number(s.pace)+'s'}</strong></div><div><span>Target</span><strong>${s.targetPace===null?'—':number(s.targetPace)+'s'}</strong></div><div><span>Measured</span><strong>${whole(s.totalMeasured)}</strong></div><div><span>Submitted</span><strong>${whole(s.totalSubmitted)}</strong></div><div><span>Idle</span><strong>${s.timingAvailable?duration(s.totalFocusedIdleMs):'—'}</strong></div><div><span>Away</span><strong>${s.timingAvailable?duration(s.totalAwayMs):'—'}</strong></div></div><p class="tt-mx-job-status is-${status.tone}">${esc(status.text)}</p></article>`;
}

function shiftDetails(rows,coverageScopeSummary=null){
 const stamp=value=>value?new Date(value).toLocaleString(): '—';
 if(!Array.isArray(lastData?.shifts)){
  if(lastData?.range==='date'){
   const revision=Number(lastData.serverRevision)||rows.reduce((n,r)=>Math.max(n,Number(r.lastSyncAtMs)||0),0);
   const selectedDate=String(lastData.date||date||'');
   return `<section class="tt-ops-panel tt-mx-history-snapshot"><div class="tt-ops-panel-head"><div><span>Historical daily snapshot</span><h3>${esc(selectedDate||'Selected date')}</h3></div><small>${revision?'Last Tracker sync · '+esc(stamp(revision)):'No Tracker sync recorded for this date'}</small></div><p class="tt-mx-history-copy">Coverage and Confirmation metrics are loaded from the selected Philippine-date record. Changing the date or pressing Refresh requests that exact date again with cache disabled.</p></section>`;
  }
  return '<p class="tt-mx-trust-note">Historical report unavailable for this response.</p>';
 }
 const names=new Set(rows.map(r=>r.name)),shifts=lastData.shifts.filter(s=>names.has(s.name));
 const flags=s=>{
  const f=[];
  if(s.locked)f.push('Time Out lock');
  if(s.generation>0)f.push('Manual reset used ('+s.generation+')'+(s.resetAt?' · '+stamp(s.resetAt):''));
  if(s.targetSnapshot===false&&!s.rows.some(r=>r.gradeSource==='retrospective'))f.push('Legacy target not frozen · ungraded');
  if(s.rows.some(r=>r.gradeSource==='retrospective'))f.push('Retrospective grade · original lock unchanged');
  if(s.rows.some(r=>!r.lastSyncAtMs))f.push('Missing Tracker telemetry');
  if(!s.locked&&s.status==='active'&&s.rows.some(r=>r.lastSyncAtMs&&Date.now()-r.lastSyncAtMs>300000))f.push('Telemetry older than 5 minutes');
  if(s.rows.some(r=>r.manualAdjustment))f.push('Manual submission adjustment');
  return f.length?f.join(' · '):'No recorded flags';
 };
 const activity=rows.filter(r=>r.job==='coverage');
 const sum=k=>coverageScopeSummary?Number(coverageScopeSummary[k]||0):activity.reduce((n,r)=>n+(Number(r[k])||0),0);
 const breakdown=activity.length?`<details class="tt-mx-section tt-mx-activity-section tt-v2-disclosure"><summary><span><small>Coverage intelligence</small><strong>Activity breakdown</strong></span><span class="tt-v2-detail-hint">6 counters · not graded <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" fill="none" stroke="currentColor" stroke-width="2"/></svg></span></summary><div class="tt-mx-stat-grid tt-mx-activity-grid">${[['created','Retained Create','cyan'],['blurred','Retained Person','violet'],['productMatched','Product Match','green'],['deleted','Delete','rose'],['noMatch','No Match','amber'],['submitted','Submitted','gold']].map(([k,label,tone])=>statCard(k==='productMatched'?'target':'tasks',label,whole(sum(k)),k==='deleted'?'Informational only':'Retained counter',tone)).join('')}</div></details>`:'';
 const paceGroups=new Map();for(const r of rows){const k=r.name+'|'+r.job;if(!paceGroups.has(k))paceGroups.set(k,[]);paceGroups.get(k).push(r);}
 const paceRows=Array.from(paceGroups.values()).map(group=>{const m=summarize(group);return {name:group[0].name,job:group[0].job,measuredTasks:m.totalMeasured,secondsPerTask:m.pace,target:m.efficiency===null?null:{secondsPerTask:m.targetPace}};});
 const reach=paceRows.filter(r=>r.measuredTasks>0&&r.target?.secondsPerTask>0&&r.secondsPerTask>0).map(r=>{
  const target=3600/r.target.secondsPerTask,pace=3600/r.secondsPerTask;
  return `<p><strong>${esc(r.name)} · ${esc(r.job)}</strong> — ${number(pace)} tasks/hr · target ${number(target)}/hr · ${pace>=target?'A pace reached':number(target-pace)+' more tasks/hr to reach A'}</p>`;
 }).join('');
 const history=shifts.map(s=>{
  const filtered=(s.rows||[]).filter(r=>rows.some(x=>x.name===r.name&&x.job===r.job)),m=summarize(filtered.length?filtered:s.rows||[]);
  const podLabel=friendlyPodLabel(s.pod,s.podLabel||s.pod);
  return `<tr><td><div class="tt-ops-agent"><span class="tt-ops-agent-avatar">${profileAvatarMarkup(s.name)}</span><div class="tt-ops-agent-copy"><strong>${esc(s.name)}</strong><small class="tt-grade-reason">${esc(podLabel)}</small></div></div></td><td>${s.locked?'FINAL · LOCKED 🔒':s.status==='active'?'ACTIVE SHIFT':'NOT CLOCKED IN'}</td><td>${esc(stamp(s.startedAt))}</td><td>${esc(stamp(s.endedAt))}</td><td>${m.grade==='NA'?'—':m.grade+' · '+number(capScore(m.efficiency))+'%'}</td><td>${whole(m.totalSubmitted)}</td><td>${duration(m.totalActiveMs)}</td><td>${esc(flags(s))}${s.generation>0?`<button class="tt-coverage-btn" data-mx-audit="${esc(s.sessionId)}" data-agent="${esc(s.name)}">Reset audit</button>`:''}</td></tr>`;
 }).join('');
 const panelLabel=lastData.range==='current'?'Shift scorecards':'Locked shift history';
 const expanded=!shiftScorecardsCollapsed;
 return `<section id="ttMetricsShiftScorecards" class="tt-ops-panel tt-mx-shifts${shiftScorecardsCollapsed?' is-collapsed':''}"><div class="tt-ops-panel-head"><h3>${panelLabel}</h3><div class="tt-mx-panel-actions"><small>Times shown in your browser timezone</small><button id="ttMetricsShiftScorecardsToggle" class="tt-mx-collapse-btn" type="button" aria-expanded="${expanded?'true':'false'}" aria-controls="ttMetricsShiftScorecardsBody" title="${expanded?'Collapse':'Expand'} ${panelLabel}" aria-label="${expanded?'Collapse':'Expand'} ${panelLabel}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m7 10 5 5 5-5"></path></svg></button></div></div><div id="ttMetricsShiftScorecardsBody" class="tt-mx-shift-scorecards-body" ${shiftScorecardsCollapsed?'hidden':''}><div class="tt-ops-table-scroll"><table class="tt-ops-table"><thead><tr><th>Agent</th><th>Shift status</th><th>Time In</th><th>Time Out</th><th>Grade / efficiency</th><th>Submitted / confirmed</th><th>Measured active</th><th>Integrity / QA flags</th></tr></thead><tbody>${history}</tbody></table></div><p>${esc(lastData.historyNote||'')}</p><div class="tt-ops-toolbar"><button id="ttMetricsPreviousPage" class="tt-coverage-btn" ${!lastData.offset?'disabled':''}>Previous agents</button><button id="ttMetricsNextPage" class="tt-coverage-btn" ${lastData.nextOffset===null?'disabled':''}>Next agents</button><small>${lastData.range==='current'?'Shift cards and roster are paginated; top summaries cover the full authorized scope.':'Selected Agent history.'}</small></div></div></section>${breakdown}<details class="tt-mx-section tt-mx-reach-section tt-v2-disclosure"><summary><span><small>Performance goal</small><strong>Path to grade A</strong></span><span class="tt-v2-detail-hint">View details <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" fill="none" stroke="currentColor" stroke-width="2"/></svg></span></summary><div class="tt-mx-reach-body">${reach||'<p>Measured tasks and a configured target are required.</p>'}</div></details>`;
}
function setShiftScorecardsCollapsed(collapsed){
 shiftScorecardsCollapsed=Boolean(collapsed);
 const panel=$('ttMetricsShiftScorecards'),body=$('ttMetricsShiftScorecardsBody'),button=$('ttMetricsShiftScorecardsToggle');
 if(!panel||!body||!button)return;
 panel.classList.toggle('is-collapsed',shiftScorecardsCollapsed);
 body.hidden=shiftScorecardsCollapsed;
 const expanded=!shiftScorecardsCollapsed,label=String(panel.querySelector('h3')?.textContent||'Shift scorecards').trim();
 button.setAttribute('aria-expanded',expanded?'true':'false');
 button.title=`${expanded?'Collapse':'Expand'} ${label}`;
 button.setAttribute('aria-label',button.title);
}
function bindShiftScorecardsToggle(){
 const button=$('ttMetricsShiftScorecardsToggle');
 if(!button)return;
 setShiftScorecardsCollapsed(shiftScorecardsCollapsed);
 button.addEventListener('click',()=>setShiftScorecardsCollapsed(!shiftScorecardsCollapsed));
}


let metricsRefreshFeedbackTimer=0;
function setMetricsRefreshFeedback(text,disabled=false){
 const button=$('ttMetricsRefresh');if(!button)return;
 button.textContent=text;button.disabled=Boolean(disabled);button.setAttribute('aria-busy',disabled?'true':'false');
}
async function manualMetricsRefresh(){
 const button=$('ttMetricsRefresh');if(!button)return;
 if(busy){pendingRefresh=true;setMetricsRefreshFeedback('Refresh queued',true);return;}
 requestedAgent=agentQuery;
 if(metricsHistoryNeedsAgent(actor()?.role)){
  showMetricsHistoryAgentPrompt();
  clearTimeout(metricsRefreshFeedbackTimer);setMetricsRefreshFeedback('Choose an Agent',false);
  metricsRefreshFeedbackTimer=setTimeout(()=>setMetricsRefreshFeedback('Refresh',false),1600);
  return;
 }
 const before=lastRefreshAt;requestedAgent=agentQuery;shiftOffset=0;generation++;lastRefreshAt=0;lastRenderSignature='';
 clearTimeout(metricsRefreshFeedbackTimer);setMetricsRefreshFeedback('Refreshing…',true);
 await refresh(true);
 const ok=lastRefreshAt>before;
 setMetricsRefreshFeedback(ok?'Refreshed ✓':'Refresh failed',false);
 metricsRefreshFeedbackTimer=setTimeout(()=>setMetricsRefreshFeedback('Refresh',false),1400);
}
// UX18P37: The server's locked-shift endpoint authorizes one supervisor-selected
// Agent per history request. Guard this in the UI rather than sending repeated
// all-agent HTTP 400s; current-shift aggregates and paging remain unchanged.
function metricsHistoryNeedsAgent(role){
 return (shiftRange==='7'||shiftRange==='30')&&['admin','team_leader'].includes(normalizedRole(role))&&!String(requestedAgent||'').trim();
}
function showMetricsHistoryAgentPrompt(){
 const body=$('ttMetricsBody');if(!body)return;
 const label=shiftRange==='30'?'Last 30':'Last 7';
 body.innerHTML=`<section class="tt-ops-panel tt-mx-history-selection" role="status" aria-live="polite"><span class="tt-ops-eyebrow">Historical Agent Metrics</span><h3>Select one Agent to view ${label} locked shifts</h3><p>Locked-shift history is available for one authorized Agent at a time. All agents can still be viewed with Current / latest shift using the paginated performance roster. No report was requested yet.</p><div class="tt-mx-history-actions"><button id="ttMetricsChooseHistoryAgent" class="tt-coverage-btn" type="button">Choose an Agent</button><button id="ttMetricsCurrentAllAgents" class="tt-coverage-btn" type="button">Show all agents · Current shift</button></div></section>`;
 const agentField=$('ttMetricsAgentField');if(agentField){agentField.hidden=false;agentField.setAttribute('aria-hidden','false');}
 $('ttMetricsChooseHistoryAgent')?.addEventListener('click',()=>{$('ttMetricsAgent')?.focus();});
 $('ttMetricsCurrentAllAgents')?.addEventListener('click',()=>{const select=$('ttMetricsRange');if(!select)return;select.value='current';select.dispatchEvent(new Event('change',{bubbles:true}));});
}
function targetJobLabel(job){return job==='coverage'?'Coverage':job==='confirmation'?'Confirmation':String(job||'Target');}
function configuredPodTargetMeta(role,selectedPod,personalAgent,rows){
 let pod='';
 if(role==='admin')pod=selectedPod||String(rows.find(r=>personalAgent&&r.name===personalAgent)?.pod||'');
 else if(role==='team_leader')pod=String(lastData?.viewer?.pod||'');
 else pod=String(rows[0]?.pod||lastData?.viewer?.pod||'');
 return (lastData?.pods||[]).find(item=>String(item.pod||'')===pod)||null;
}
// STAGING smooth-scroll: do not destroy the Admin Metrics table during
// scrolling. Refresh/fetch, authorization and reporting remain unchanged.
let metricsScrollAt=0,metricsPaintPending=false,metricsPaintTimer=null,metricsDetailColumns=false;
function scheduleMetricsPaint(){
 clearTimeout(metricsPaintTimer);
 metricsPaintTimer=setTimeout(()=>{
  metricsPaintTimer=null;
  if(!active||!metricsPaintPending||!lastData)return;
  if(Date.now()-metricsScrollAt<330){scheduleMetricsPaint();return;}
  metricsPaintPending=false;
  if(identity===actorSig(actor()))renderRows();
 },380);
}
document.addEventListener('scroll',event=>{
 if(!active)return;
 const target=event.target,root=$('ttMetricsRoot');
 if(target===document||target===document.documentElement||root?.contains(target)){
  metricsScrollAt=Date.now();
  if(metricsPaintPending)scheduleMetricsPaint();
 }
},true);
function renderRows(force=false){
 if(!lastData)return;
 if(!force&&Date.now()-metricsScrollAt<330){
  metricsPaintPending=true;scheduleMetricsPaint();return;
 }
 metricsPaintPending=false;clearTimeout(metricsPaintTimer);
 const filter=$('ttMetricsJob').value,role=normalizedRole(lastData.viewer?.role),canDrill=role==='admin'||role==='team_leader',query=canDrill?String(agentQuery||'').trim():'';
 const selectedPod=role==='admin'?String(lastData.selectedPod||''):'';
 const selectedPodMeta=selectedPod?(lastData.pods||[]).find(p=>p.pod===selectedPod):null,selectedPodLabel=selectedPodMeta?friendlyPodLabel(selectedPodMeta.pod,selectedPodMeta.label):'';
 const allNames=[...new Set(lastData.rows.map(r=>String(r.name||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
 const queryLower=query.toLowerCase();
 const exactName=query?allNames.find(name=>name.toLowerCase()===queryLower)||'':'';
 let rows=lastData.rows.filter(r=>filter==='all'||r.job===filter);
 if(query)rows=rows.filter(r=>exactName?String(r.name||'').toLowerCase()===exactName.toLowerCase():String(r.name||'').toLowerCase().includes(queryLower));
 const matchedNames=[...new Set(rows.map(r=>String(r.name||'').trim()).filter(Boolean))];
 const personalAgent=exactName||(query&&matchedNames.length===1?matchedNames[0]:'');
 const personalPod=personalAgent?(rows.find(r=>String(r.name||'')===personalAgent)?.podLabel||rows.find(r=>String(r.name||'')===personalAgent)?.pod||''):'';
 const signature=JSON.stringify([metricsDetailColumns,lastData.shifts,lastData.aggregate,lastData.range,lastData.nextOffset,selectedPod,filter,query,personalAgent,rows.map(r=>[r.name,r.podLabel,r.job,r.submitted,r.measuredTasks,r.measuredActiveMs,r.secondsPerTask,r.target?.secondsPerTask??null,r.efficiencyPercent,r.grade,r.reason,r.presenceActiveMs||0,r.focusedIdleMs||0,r.awayMs||0,r.trackerState||'',r.lastSyncAtMs||0])]);
 if(!force&&signature===lastRenderSignature)return;
 const oldScroll=$('ttMetricsTableScroll'),scrollLeft=oldScroll?.scrollLeft||0,scrollTop=oldScroll?.scrollTop||0;
 const deepDiveOpen=Boolean($('ttMetricsBody')?.querySelector('.tt-mx-deep-dive[open]'));
 const v2OpenDetails=new Set([...($('ttMetricsBody')?.querySelectorAll('details.tt-v2-disclosure[open]')||[])].map(el=>el.classList.contains('tt-mx-activity-section')?'activity':el.classList.contains('tt-v2-presence')?'presence':'goal'));
 const useScopeAggregate=!query&&(lastData.range==='current'||lastData.range==='date')&&lastData.aggregate?.overall;
 const scopeSummary=useScopeAggregate?(filter==='all'?lastData.aggregate.overall:lastData.aggregate.jobs?.[filter]):null;
 const summary=scopeSummary||summarize(rows),status=paceStatus(summary),grade=summary.grade||'NA',score=capScore(summary.efficiency)===null?'—':Math.round(capScore(summary.efficiency)),ring=Math.min(100,Math.max(0,Number(summary.efficiency)||0));
 const missingTargetJobs=Array.isArray(summary.missingTargetJobs)?summary.missingTargetJobs:[];
 const configuredPodMeta=configuredPodTargetMeta(role,selectedPod,personalAgent,rows);
 const configuredButFrozen=missingTargetJobs.filter(job=>Number(configuredPodMeta?.[job]?.secondsPerTask)>0);
 const trulyMissingTargets=missingTargetJobs.filter(job=>!Number(configuredPodMeta?.[job]?.secondsPerTask));
 const targetStateText=trulyMissingTargets.length?`Missing ${trulyMissingTargets.map(targetJobLabel).join(' + ')} target`:configuredButFrozen.length?`Locked shift captured before ${configuredButFrozen.map(targetJobLabel).join(' + ')} target`:(summary.targetPace===null?'Target not set':'Target '+number(summary.targetPace)+'s/task');
 const gradeHeadline=grade==='NA'&&configuredButFrozen.length&&!trulyMissingTargets.length?'Locked target unavailable':gradeLabel(grade,summary);
 const bodyRows=rows.map(r=>{const podLabel=friendlyPodLabel(r.pod,r.podLabel);return `<tr><td><div class="tt-ops-agent"><span class="tt-ops-agent-avatar">${profileAvatarMarkup(r.name)}</span><div class="tt-ops-agent-copy"><strong>${esc(r.name)}</strong><small>${esc(podLabel)}</small></div></div></td><td class="tt-mx-secondary tt-mx-job-col"><span class="tt-ops-job" data-job="${esc(r.job)}">${esc(r.job==='coverage'?'Coverage':'Confirmation')}</span></td><td class="tt-ops-num">${number(r.submitted)}</td><td class="tt-ops-num">${number(r.measuredTasks)}</td><td class="tt-ops-num tt-mx-secondary">${Number(r.measuredActiveMs)>0?duration(r.measuredActiveMs):'—'}</td><td class="tt-ops-num">${number(r.secondsPerTask)}</td><td class="tt-ops-num">${number(r.target?.secondsPerTask??null)}</td><td class="tt-ops-num tt-mx-secondary">${r.efficiencyPercent===null?'—':number(capScore(r.efficiencyPercent))+'%'}</td><td class="tt-ops-num tt-mx-secondary">${r.lastSyncAtMs?duration(r.focusedIdleMs):'—'}</td><td class="tt-ops-num tt-mx-secondary">${r.lastSyncAtMs?(r.awayTimingAvailable?duration(r.awayMs):'—'):'—'}</td><td><span class="tt-grade tt-mx-table-grade" data-grade="${esc(r.grade||'NA')}" title="${esc(r.reason||'')}">${esc(r.grade||'N/A')}</span>${r.reason?'<small class="tt-grade-reason">'+esc(r.reason)+'</small>':''}</td></tr>`;}).join('');
 const viewerPodLabel=lastData.scope==='own-pod'?friendlyPodLabel(lastData.viewer?.pod||'',rows[0]?.podLabel||''):'';
 const scopeText=personalAgent?`${personalAgent}${personalPod?' · '+personalPod:''}`:query?`${summary.agents} matching agent${summary.agents===1?'':'s'}`:selectedPod?`${summary.agents} agents in ${selectedPodLabel||'selected POD'}`:lastData.scope==='all-pods'?`${summary.agents} agents in scope`:lastData.scope==='own-pod'?`${summary.agents} agents in ${viewerPodLabel||'my POD'}`:'My measured performance';
 const performanceLabel=filter==='all'?'Combined work':filter==='coverage'?'Coverage':'Confirmation';
 const gradeDisplay=grade==='NA'?'—':grade;
 const gradeDetail=grade==='NA'?'Not graded':gradeLabel(grade,summary);
 const retrospectiveNotice=Number(summary.retrospectiveCount)>0?'Includes '+whole(summary.retrospectiveCount)+' retrospective workflow grade(s) · original locked scores unchanged':'';
 // Verified Admin-only data from the protected QA manifest + workforce roster.
 // This banner never changes or infers a user's workforce permissions.
 const qaNeedsReview=role==='admin'&&lastData.qaRosterAudit?.status==='promotion-review-required'
  ?lastData.qaRosterAudit.formerPodAssignments||[]:[];
 const qaNotice=qaNeedsReview.length?`<section class="tt-ops-panel tt-mx-qa-audit" role="status"><strong>Independent QA roster review needed</strong><p>${qaNeedsReview.map(member=>esc(member.name)+' is still assigned to '+esc(member.currentlyAssignedTo)).join('; ')}. Verify the existing protected Admin QA promotion before changing personnel records. Current labeler grading does not transfer QA membership.</p></section>`:'';
 const scorecard=`<section class="tt-mx-scorecard tt-v2-scorecard"><div class="tt-v2-profile-strip"><div class="tt-v2-profile-summary"><span class="tt-v2-eyebrow">${esc(personalAgent?'Agent performance':selectedPod?'Team performance':'Performance overview')} · ${esc(performanceLabel)}</span><h3>${esc(scopeText)}</h3><p>${esc(grade==='NA'?gradeHeadline:gradeDetail)}${retrospectiveNotice?' · '+esc(retrospectiveNotice):''}</p><div class="tt-mx-score-chips"><span data-tone="${status.tone}">${esc(status.text)}</span><span title="${esc(configuredButFrozen.length?'Locked Time Out scorecards are immutable. Use Historical date for effective-date comparisons without rewriting locked shifts.':'')}">${esc(targetStateText)}</span></div></div><div class="tt-v2-letter" data-grade="${esc(grade)}" aria-label="${esc(grade==='NA'?'Letter grade unavailable':'Letter grade '+grade+', '+score+'% efficiency')}" title="${esc(grade==='NA'?'Not graded':score+'% efficiency')}"><span>Grade</span><strong>${esc(gradeDisplay)}</strong></div></div><div class="tt-mx-stat-grid">${statCard('tasks','Submitted',whole(summary.totalSubmitted),'Completed tasks','gold')}${statCard('target','Measured',whole(summary.totalMeasured),summary.measurementCoverage===null?'No measured sample':number(summary.measurementCoverage)+'% tracked','violet')}${statCard('speed','Average pace',summary.pace===null?'—':number(summary.pace)+'s','Per measured task','cyan')}${statCard('clock','Active time',summary.totalActiveMs?duration(summary.totalActiveMs):'—','Task time','green')}</div></section>`;
 const trackedTotal=summary.totalPresenceActiveMs+summary.totalFocusedIdleMs+summary.totalAwayMs;
 const awayTimingAvailable=useScopeAggregate?summary.awayTimingAvailable===true:rows.every(r=>r.awayTimingAvailable);
 const utilization=awayTimingAvailable&&trackedTotal>0?number(summary.totalPresenceActiveMs/trackedTotal*100)+'%':'—';
 const presence=`<details class="tt-mx-section tt-v2-disclosure tt-v2-presence"><summary><span><small>Work presence</small><strong>Time &amp; utilization</strong></span><span class="tt-v2-detail-hint">Idle and away excluded from grade <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" fill="none" stroke="currentColor" stroke-width="2"/></svg></span></summary><div class="tt-mx-stat-grid tt-mx-presence-grid">${statCard('clock','Tracked active',duration(summary.totalPresenceActiveMs),'Presence time','green')}${statCard('clock','Idle',duration(summary.totalFocusedIdleMs),'Not graded','amber')}${statCard('clock','Away',awayTimingAvailable?duration(summary.totalAwayMs):'—','Not graded','rose')}${statCard('pulse','Utilization',utilization,'Not graded','violet')}</div></details>`;
 const jobs=filter==='all'?`<section class="tt-mx-section"><div class="tt-mx-section-head"><div><span>Job intelligence</span><h3>${personalAgent?esc(personalAgent)+' · Coverage vs Confirmation':selectedPod?esc(selectedPodLabel||'Selected POD')+' · Coverage vs Confirmation':'Coverage vs Confirmation'}</h3></div><small>${useScopeAggregate?(selectedPod?'Selected POD / Team · target index = 100%':'Full authorized scope · target index = 100%'):'Target index = 100%'}</small></div><div class="tt-mx-job-grid">${jobCard('coverage',useScopeAggregate?lastData.aggregate.jobs.coverage:rows.filter(r=>r.job==='coverage'))}${jobCard('confirmation',useScopeAggregate?lastData.aggregate.jobs.confirmation:rows.filter(r=>r.job==='confirmation'))}</div></section>`:'';
 const podGroups=new Map();for(const r of rows){if(!podGroups.has(r.pod))podGroups.set(r.pod,[]);podGroups.get(r.pod).push(r);}
 const podAggregateRows=useScopeAggregate&&Array.isArray(lastData.aggregate?.pods)?lastData.aggregate.pods:[];
 const podComparison=role==='admin'&&!selectedPod&&((useScopeAggregate&&podAggregateRows.length>1)||(!useScopeAggregate&&podGroups.size>1))?podOverview(useScopeAggregate?podAggregateRows.map(item=>({name:item.label||item.pod,summary:(filter==='all'?item.summary:item.jobs?.[filter])||{}})):Array.from(podGroups.values()).map(group=>({name:group[0].podLabel||group[0].pod,summary:summarize(group)}))):'';
 const isPagedRoster=lastData.range==='current'&&['admin','team_leader'].includes(role);
 const metricsPageOffset=Math.max(0,Number(lastData.offset??shiftOffset)||0);
 const rosterPageControls=isPagedRoster?`<nav class="tt-mx-roster-pagination" aria-label="Performance roster pages"><span>Agent page ${Math.floor(metricsPageOffset/10)+1} · 10 agents per page</span><div><button id="ttMetricsRosterPreviousPage" class="tt-coverage-btn" type="button" ${metricsPageOffset===0?'disabled':''}>Previous agents</button><button id="ttMetricsRosterNextPage" class="tt-coverage-btn" type="button" ${lastData.nextOffset===null||lastData.nextOffset===undefined?'disabled':''}>Next agents</button></div></nav>`:'';
 const empty=query?`<div class="tt-coverage-empty"><strong>No Agent matched “${esc(query)}”</strong><p>Choose a name from the Agent selector or clear it to return to all Agents.</p></div>`:'<div class="tt-coverage-empty"><strong>No metrics rows in this filter</strong><p>Try another job filter or wait for QC Tracker timing data.</p></div>';
 $('ttMetricsBody').innerHTML=`${qaNotice}${scorecard}${podComparison}<section class="tt-ops-panel tt-mx-roster${metricsDetailColumns?' is-detailed':''}" data-job-filter="${esc(filter)}"><div class="tt-ops-panel-head"><div><span>${personalAgent?'Personal performance':'Performance roster'}</span><h3>${personalAgent?esc(personalAgent)+' · '+(filter==='all'?'Measured task intelligence':filter==='coverage'?'Coverage performance':'Confirmation performance'):(filter==='all'?'Measured task intelligence':filter==='coverage'?'Coverage performance':'Confirmation performance')}</h3></div><div class="tt-mx-roster-actions"><small>${rows.length} row${rows.length===1?'':'s'} on this page</small><button id="ttMetricsColumnsToggle" type="button" aria-pressed="${metricsDetailColumns?'true':'false'}">${metricsDetailColumns?'Fewer columns':'More columns'}</button></div></div><div id="ttMetricsTableScroll" class="tt-ops-table-scroll"><table class="tt-ops-table tt-metrics-table"><thead><tr><th>Agent</th><th class="tt-mx-secondary tt-mx-job-col">Job</th><th>Submitted</th><th>Measured tasks</th><th class="tt-mx-secondary">Active time (h/m)</th><th>Seconds / task</th><th>Target sec / task</th><th class="tt-mx-secondary">Efficiency</th><th class="tt-mx-secondary">Idle</th><th class="tt-mx-secondary">Away</th><th>Grade</th></tr></thead><tbody>${bodyRows}</tbody></table></div>${rows.length?'':empty}${rosterPageControls}</section><details class="tt-mx-deep-dive"><summary>Detailed reports and shift history <span>Optional</span></summary><div class="tt-mx-deep-body">${shiftDetails(rows,useScopeAggregate?lastData.aggregate.jobs?.coverage:null)}${presence}${jobs}</div></details>`;
 const deepDive=$('ttMetricsBody')?.querySelector('.tt-mx-deep-dive');if(deepDive)deepDive.open=deepDiveOpen;
 $('ttMetricsColumnsToggle')?.addEventListener('click',()=>{metricsDetailColumns=!metricsDetailColumns;renderRows(true);});
 bindShiftScorecardsToggle();
 $('ttMetricsBody')?.querySelectorAll('details.tt-v2-disclosure').forEach(el=>{const key=el.classList.contains('tt-mx-activity-section')?'activity':el.classList.contains('tt-v2-presence')?'presence':'goal';el.open=v2OpenDetails.has(key);});
 $('ttMetricsBody').querySelectorAll('[data-mx-audit]').forEach(button=>button.onclick=async()=>{
  const requestIdentity=actorSig(actor());button.disabled=true;
  try{const d=await api('reset-audit?agent='+encodeURIComponent(button.dataset.agent)+'&session='+encodeURIComponent(button.dataset.mxAudit));
   if(!active||requestIdentity!==actorSig(actor())||!button.isConnected)return;
   const box=document.createElement('div');box.innerHTML='<p>'+esc(d.note)+'</p>'+d.resets.map(r=>'<p><strong>'+esc(r.resetAt)+' · '+esc(r.resetBy)+'</strong><br>Before reset: Coverage submitted '+whole(r.coverage.submitted)+', Create '+whole(r.coverage.created)+', Person '+whole(r.coverage.blurred)+', Match '+whole(r.coverage.productMatched)+'; Confirmation '+whole(r.confirmation.submitted)+'</p>').join('');button.replaceWith(box);
  }catch(e){if(button.isConnected){button.textContent=e.message;button.disabled=false;}}
 });
 for(const id of ['ttMetricsPreviousPage','ttMetricsRosterPreviousPage'])$(id)?.addEventListener('click',()=>{shiftOffset=Math.max(0,(Number(lastData?.offset??shiftOffset)||0)-10);generation++;refresh(true);});
 for(const id of ['ttMetricsNextPage','ttMetricsRosterNextPage'])$(id)?.addEventListener('click',()=>{if(lastData?.nextOffset===null||lastData?.nextOffset===undefined)return;shiftOffset=lastData.nextOffset;generation++;refresh(true);});
 const next=$('ttMetricsTableScroll');if(next){next.scrollLeft=scrollLeft;next.scrollTop=scrollTop;}
 $('ttMetricsBody')?.querySelectorAll('.tt-ops-table-scroll').forEach(el=>globalThis.TrinoTimeWideTableScroll?.mount?.(el));
 if($('ttMetricsScope'))$('ttMetricsScope').textContent=personalAgent?personalAgent:(selectedPodLabel|| (lastData.scope==='all-pods'?'All PODs':lastData.scope==='own-pod'?`My POD${viewerPodLabel?' · '+viewerPodLabel:''}`:'My data'));
 lastRenderSignature=signature;
}
async function refresh(force=false){
 if(!active)return;if(busy){if(force)pendingRefresh=true;return;}if(!force&&Date.now()-lastRefreshAt<30000)return;const a=actor(),sig=actorSig(a),ticket=generation;
 if(sig!==identity){identity=sig;agentQuery='';requestedAgent='';metricsPod='';metricsPodInitialized=false;shiftOffset=0;shiftScorecardsCollapsed=true;if($('ttMetricsAgent'))$('ttMetricsAgent').value='';if($('ttMetricsPodScope'))$('ttMetricsPodScope').innerHTML='';lastData=null;lastRenderSignature='';$('ttMetricsBody').innerHTML='<div class="tt-coverage-loading">Loading Agent Metrics…</div>';$('ttMetricsSettings').hidden=true;$('ttMetricsScope').textContent='';}
 if(!a){window.TrinoTimeDashboardFreshness?.reset('metrics');$('ttMetricsBody').innerHTML='<div class="tt-coverage-error">Sign in to view metrics.</div>';return;}
 if(metricsHistoryNeedsAgent(a.role)){
  // Keep the authorized Agent picker and its already loaded name suggestions.
  // Never send an invalid historical request or manufacture an all-Agent history.
  lastData=null;lastRenderSignature='';lastRefreshAt=Date.now();
  window.TrinoTimeDashboardFreshness?.reset('metrics');
  showMetricsHistoryAgentPrompt();
  return;
 }
 busy=true;
 const ttFreshnessKey=sig+'|'+shiftRange+'|'+date+'|'+shiftOffset+'|'+requestedAgent+'|'+metricsPod;
 window.TrinoTimeDashboardFreshness?.begin('metrics',ttFreshnessKey);
 try{
  const role=normalizedRole(a.role),podParam=role==='admin'&&metricsPod&&metricsPod!=='__all__'?'&pod='+encodeURIComponent(metricsPod):'';
  const d=await api(shiftRange==='date'?'dashboard?date='+encodeURIComponent(date)+podParam:'shifts?range='+shiftRange+'&offset='+shiftOffset+(requestedAgent?'&agent='+encodeURIComponent(requestedAgent):'')+podParam);
  if(!active||ticket!==generation||sig!==actorSig(actor()))return;
  lastRefreshAt=Date.now();
  if(d.ok!==true||d.authority!=='workforce-metrics-v1'||d.viewer?.role!==role||d.scope!==({admin:'all-pods',team_leader:'own-pod',agent:'self'})[role]||!Array.isArray(d.rows)||!Array.isArray(d.pods))throw Error('Metrics viewer or response mismatch. Refresh TrinoTime.');
  if(shiftRange==='date'&&String(d.date||'')!==String(date||''))throw Error('Historical metrics date mismatch. Refresh the selected date.');
  if(role==='agent'&&String(d.viewer.name).toLowerCase()!==String(a.name).toLowerCase())throw Error('Metrics Agent identity changed. Sign in again.');
  const viewerPodLabel=d.scope==='own-pod'?friendlyPodLabel(d.viewer?.pod||'',d.rows[0]?.podLabel||''):'';
  const podScopeField=$('ttMetricsPodScopeField'),podScopeSelect=$('ttMetricsPodScope');
  if(podScopeField){podScopeField.hidden=role!=='admin';podScopeField.setAttribute('aria-hidden',role==='admin'?'false':'true');}
  if(podScopeSelect)podScopeSelect.disabled=role!=='admin';
  if(role==='admin'&&podScopeSelect){
   const podOptions=Array.isArray(d.pods)?d.pods:[],validPods=podOptions.map(p=>String(p.pod||''));
   if(!metricsPodInitialized){const preferred=podOptions.find(p=>(d.agents||[]).some(a=>a.pod===p.pod))||podOptions[0]||null;metricsPod='__all__';metricsPodInitialized=true;}
   if(metricsPod!=='__all__'&&!validPods.includes(metricsPod))metricsPod=validPods[0]||'__all__';
   const scopeOptions='<option value="__all__">All PODs / Teams</option>'+podOptions.map(p=>`<option value="${esc(p.pod)}">${esc(friendlyPodLabel(p.pod,p.label))}</option>`).join('');
   if(podScopeSelect.innerHTML!==scopeOptions)podScopeSelect.innerHTML=scopeOptions;podScopeSelect.value=metricsPod;
   if(metricsPod!=='__all__'&&String(d.selectedPod||'')!==metricsPod){agentQuery='';requestedAgent='';shiftOffset=0;generation++;pendingRefresh=true;return;}
  }else{metricsPod='';metricsPodInitialized=false;if(podScopeSelect){podScopeSelect.value='';podScopeSelect.innerHTML='';}}
  lastData=d;
  const selectedPodMeta=role==='admin'&&d.selectedPod?(d.pods||[]).find(p=>p.pod===d.selectedPod):null,selectedPodLabel=selectedPodMeta?friendlyPodLabel(selectedPodMeta.pod,selectedPodMeta.label):'';
  $('ttMetricsScope').textContent=selectedPodLabel||(d.scope==='all-pods'?'All PODs':d.scope==='own-pod'?`My POD${viewerPodLabel?' · '+viewerPodLabel:''}`:'My data');$('ttMetricsSettings').hidden=role!=='admin';
  const canDrill=role==='admin'||role==='team_leader';$('ttMetricsAgentField').hidden=!canDrill;
  if(role==='admin'){
   const select=$('ttMetricsPod'),old=select.value,options=d.pods.map(p=>`<option value="${esc(p.pod)}">${esc(p.label)}</option>`).join('');
   if(select.innerHTML!==options){select.innerHTML=options;if(d.pods.some(p=>p.pod===old))select.value=old;fillTarget();}
  }
  if(canDrill){
   const names=[...new Set((d.agents||d.rows).map(r=>String(r.name||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
   const list=$('ttMetricsAgentList'),agentOptions=names.map(name=>`<option value="${esc(name)}"></option>`).join('');
   if(list.innerHTML!==agentOptions)list.innerHTML=agentOptions;
   const input=$('ttMetricsAgent'),clear=$('ttMetricsAgentClear'),adminPodLabel=role==='admin'&&d.selectedPod?friendlyPodLabel(d.selectedPod,(d.pods||[]).find(p=>p.pod===d.selectedPod)?.label||''):'';input.placeholder=role==='team_leader'?'All POD agents':adminPodLabel?'All selected POD agents':'All agents';input.setAttribute('aria-label',role==='team_leader'?`Filter ${viewerPodLabel||'my POD'} Agent Metrics by agent`:adminPodLabel?`Filter ${adminPodLabel} metrics by agent`:'Filter Agent Metrics by agent');clear.title=role==='team_leader'?'Show all POD agents':adminPodLabel?'Show selected POD metrics':'Show all agents';
   if(input.value!==agentQuery)input.value=agentQuery;
  }else{agentQuery='';if($('ttMetricsAgent'))$('ttMetricsAgent').value='';}
  renderRows(force);
  window.TrinoTimeDashboardFreshness?.success('metrics',ttFreshnessKey);
  document.dispatchEvent(new CustomEvent('trinotime:store-context',{detail:{workflow:'metrics',date:shiftRange==='date'?date:phtDate(),viewer:d.viewer,scope:d.scope,pod:role==='admin'&&metricsPod!=='__all__'?metricsPod:'',agent:requestedAgent&&String(requestedAgent).toLowerCase()===String((d.agents||[]).find(x=>x.name.toLowerCase()===requestedAgent.toLowerCase())?.name||'').toLowerCase()?requestedAgent:''}}));
 }catch(e){if(active&&ticket===generation&&sig===actorSig(actor())){lastData=null;lastRenderSignature='';$('ttMetricsBody').innerHTML='<div class="tt-coverage-error">'+esc(e.message)+'</div>';window.TrinoTimeDashboardFreshness?.fail('metrics',ttFreshnessKey);}}finally{busy=false;if(pendingRefresh){pendingRefresh=false;await refresh(true);}if($('ttMetricsRefresh')?.textContent==='Refresh queued'){setMetricsRefreshFeedback('Refreshed ✓',false);clearTimeout(metricsRefreshFeedbackTimer);metricsRefreshFeedbackTimer=setTimeout(()=>setMetricsRefreshFeedback('Refresh',false),1400);}}
}
document.addEventListener('trinotime:workspace-opening',e=>{if(e.detail!=='metrics')close();});
window.addEventListener('click',e=>{const b=e.target.closest('[data-tt-nav],[data-tt-workspace]');if(!b)return;if(b.dataset.ttNav==='metrics'){e.preventDefault();open();}else close();},true);
setInterval(()=>{build();const sig=actorSig(actor());if(active&&sig!==identity){identity=sig;agentQuery='';requestedAgent='';metricsPod='';metricsPodInitialized=false;shiftOffset=0;shiftScorecardsCollapsed=true;if($('ttMetricsAgent'))$('ttMetricsAgent').value='';if($('ttMetricsPodScope'))$('ttMetricsPodScope').innerHTML='';generation++;lastData=null;lastRenderSignature='';$('ttMetricsBody').innerHTML='<div class="tt-coverage-loading">Loading Agent Metrics…</div>';$('ttMetricsSettings').hidden=true;}if(!document.hidden)refresh();},3000);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',build);else build();
})();
