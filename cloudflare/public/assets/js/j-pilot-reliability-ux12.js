/* TrinoTime UX12 + UX16 — Admin Pilot Reliability / read-only submission reconciliation.
 * Read-only; consumes existing server-authorized workforce endpoints.
 * IMPORTANT: per-device Chrome pending queues and receipts are NOT centrally observable.
 */
(() => {
  'use strict';
  if (window.__ttPilotReliabilityUX12) return;
  window.__ttPilotReliabilityUX12 = true;
  const ROOT='ttPilotReliabilityRoot', NAV='pilot-reliability';
  const $=id=>document.getElementById(id);
  const surfaces=['mainContent','teamTabsOuter','podTabsOuter','ttAdminCommandBar','ttPremiumRightRail'];
  const icon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 17l5-5 4 4 8-9"/><path d="M14 7h6v6"/><path d="M3 21h18"/></svg>';
  let active=false, previous=null, generation=0, mappingGeneration=0, busy=false, day='',lastLoad=0,pod='',podOptions=[],refreshTimer=null,authFingerprint='',deliveryRows=[],deliveryVerified=false;
  const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const n=v=>Math.max(0,Number(v)||0).toLocaleString('en-US');
  const role=()=>String(document.body?.dataset.trinoRole||'').toLowerCase().replace(/[\s-]/g,'_');
  function isAdmin(){return role()==='admin'||role()==='administrator';}
  function phtDate(){const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const d=Object.fromEntries(parts.map(p=>[p.type,p.value]));return `${d.year}-${d.month}-${d.day}`;}
  function time(ts){return ts?new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',hour:'numeric',minute:'2-digit',hour12:true}).format(new Date(ts))+' PHT':'Unavailable';}
  function currentUid(){try{return String(window.firebase?.auth?.().currentUser?.uid||'');}catch(_){return '';}}
  function fingerprint(){return role()+'|'+currentUid()+'|'+String(window.TrinoTimeMessagingSessionContext?.getSecuritySessionToken?.()||'').slice(0,24);}
  function clearPrivate(){generation++;mappingGeneration++;busy=false;lastLoad=0;pod='';podOptions=[];authFingerprint='';deliveryRows=[];deliveryVerified=false;const root=$(ROOT);if(root){root.querySelector('[data-tt-pilot-metrics]').replaceChildren();root.querySelector('[data-tt-pilot-mapping]').replaceChildren();root.querySelector('[data-tt-pilot-delivery]').replaceChildren();root.querySelector('[data-tt-pilot-pod]').replaceChildren(new Option('Choose an authorized POD',''));setStatus('Awaiting verified Admin data.');}}
  async function headers(){const h={Accept:'application/json','X-TT-Metrics-Expected-Role':'admin'};
    // Match the existing Admin Metrics path: NEVER attach a remembered TL/Agent
    // workforce security token. Authorize with the current Firebase Admin user.
    const user=window.firebase?.auth?.().currentUser;
    if(user&&!user.isAnonymous&&typeof user.getIdToken==='function')h.Authorization=`Bearer ${await user.getIdToken(false)}`;
    if(!h.Authorization)throw Error('Secure Admin session unavailable. Sign in again.');
    return h;
  }
  async function read(url){const response=await fetch(url,{method:'GET',credentials:'same-origin',cache:'no-store',headers:await headers()});const data=await response.json();if(!response.ok)throw Error(data?.message||`Request failed (HTTP ${response.status})`);return data;}
  function setStatus(message,state='waiting'){const el=$(ROOT)?.querySelector('[data-tt-pilot-status]');if(el){el.textContent=message;el.dataset.state=state;}}
  function tile(label,value,description,kind='neutral'){return `<article class="tt-pilot-tile" data-kind="${kind}"><span>${escape(label)}</span><strong>${escape(value)}</strong><small>${escape(description)}</small></article>`;}
  function build(){if(!$(ROOT)){
    const target=$('mainContent');if(!target?.parentNode)return false;
    const root=document.createElement('section');root.id=ROOT;root.className='tt-coverage-root tt-ops-root tt-pilot-root';root.hidden=true;
    root.setAttribute('aria-label','Pilot Reliability Dashboard');
    root.innerHTML=`<div class="tt-ops-shell tt-pilot-shell"><header class="tt-ops-hero tt-pilot-hero"><div class="tt-ops-hero-copy"><p class="tt-ops-eyebrow">Admin · Pilot QA</p><h2 class="tt-ops-title">Pilot Reliability</h2><p class="tt-ops-subtitle">Read-only reporting diagnostics for TrinoTime and QC Tracker.</p></div><div class="tt-pilot-header-actions"><button type="button" class="tt-coverage-btn" data-tt-pilot-refresh>Refresh verified data</button></div></header>
    <p class="tt-pilot-status" role="status" data-tt-pilot-status data-state="waiting">Awaiting verified Admin data.</p>
    <section class="tt-pilot-section" aria-label="Daily authorized server metrics"><div class="tt-pilot-section-title"><h3>Server-reported work · <span data-tt-pilot-day></span></h3><small>TrinoTime daily Coverage and Confirmation metrics; not a Chrome queue inspection</small></div><div class="tt-pilot-grid" data-tt-pilot-metrics></div></section>
    <section class="tt-pilot-section" aria-label="Store mapping quality"><div class="tt-pilot-section-title"><div><h3>Store mapping · selected POD</h3><p>Choose a POD to load its authorized Job ID/store evidence. No cross-POD guessing.</p></div><label class="tt-pilot-selector">POD <select data-tt-pilot-pod aria-label="Select a POD for mapping diagnostics"><option value="">Choose an authorized POD</option></select></label></div><div class="tt-pilot-grid" data-tt-pilot-mapping><article class="tt-pilot-instruction">Choose a POD to load mapping data.</article></div></section>
    <section class="tt-pilot-section tt-pilot-delivery-section" aria-label="Submission reconciliation">
      <div class="tt-pilot-section-title"><div><h3>Submission reconciliation · selected scope</h3><p>Server-reported work compared with device-only Submit evidence. Follows the POD selected above; no new Tracker data collection.</p></div></div>
      <div class="tt-pilot-delivery" data-tt-pilot-delivery role="status" aria-live="polite"><p class="tt-pilot-instruction">Refresh verified data to inspect server reporting.</p></div>
    </section>
    <section class="tt-pilot-section"><div class="tt-pilot-section-title"><h3>Tracker delivery &amp; receipts</h3><small>Evidence boundary</small></div><div class="tt-pilot-grid tt-pilot-info">${tile('Unsent device submissions','Not centrally available','Inspect Tracker → Sync Health on the labeler’s device.','caution')}${tile('Pending store acknowledgments','Not centrally available','Device queue is not a server reporting total.','caution')}${tile('Per-task receipt verification','Check device Sync Health','Server-reported totals cannot prove every attempted Submit reached the server.','caution')}</div><p class="tt-pilot-note">“Dashboard fetched” means the read-only report loaded, NOT that a Chrome extension synchronized. Do not clear queues or correct totals from these reports.</p></section>
    <div class="tt-pilot-footer"><button type="button" class="tt-coverage-btn" data-tt-pilot-open="coverage">Open Coverage</button><button type="button" class="tt-coverage-btn" data-tt-pilot-open="confirmation">Open Confirmation</button><button type="button" class="tt-coverage-btn" data-tt-pilot-open="metrics">Open Agent Metrics</button><button type="button" class="tt-coverage-btn" data-tt-pilot-open="pod-work">Open Store Operations</button></div></div>`;
    target.parentNode.insertBefore(root,target);
    root.querySelector('[data-tt-pilot-refresh]').addEventListener('click',()=>load(true));
    root.querySelector('[data-tt-pilot-pod]').addEventListener('change',e=>{pod=e.target.value;renderDelivery();loadMapping(generation,++mappingGeneration);});
    root.querySelectorAll('[data-tt-pilot-open]').forEach(btn=>btn.addEventListener('click',()=>document.querySelector('#ttPremiumSidebar [data-tt-nav="'+btn.dataset.ttPilotOpen+'"]')?.click()));
  }return true;}
  // UX16: reconciliation is read-only. No Chrome extension storage can be queried
  // by an Admin website. The server's daily totals are NOT per-click receipts.
  function deliveryReport(rows,selectedPod){
    const selected=String(selectedPod||'');
    const result={};
    for(const workflow of ['coverage','confirmation']){
      const subset=rows.filter(r=>r&&String(r.job||'').toLowerCase()===workflow&&(!selected||String(r.pod||'')===selected));
      const reported=subset.reduce((sum,r)=>{
        const value=Number(r.submitted);
        return sum+(Number.isFinite(value)&&value>=0?Math.min(100000,value):0);
      },0);
      const latest=subset.reduce((max,r)=>Math.max(max,Number(r.lastSyncAtMs)||0),0);
      result[workflow]={reported,latest,rows:subset.length};
    }
    return result;
  }
  function renderDelivery(){
    const root=$(ROOT),node=root?.querySelector('[data-tt-pilot-delivery]');if(!node)return;
    if(!active||!isAdmin()||!deliveryVerified){node.replaceChildren();node.textContent='Awaiting verified Admin reporting. Device Submit states cannot be inferred.';return;}
    const selection=pod&&podOptions.some(item=>item.pod===pod)?pod:'';
    const selectionLabel=selection?(podOptions.find(item=>item.pod===selection)?.label||selection):'All authorized PODs';
    const totals=deliveryReport(deliveryRows,selection);
    const ageText=ts=>!ts?'No server activity timestamp':Date.now()-ts>300000?'Older than 5 minutes':'Within 5 minutes';
    const line=(name,item)=>`<tr><th scope="row">${escape(name)}</th><td>${escape(n(item.reported))}</td><td>${escape(item.latest?time(item.latest):'Not reported')}</td><td>${escape(ageText(item.latest))}</td></tr>`;
    node.innerHTML=`<p class="tt-pilot-delivery-scope"><strong>Scope:</strong> ${escape(selectionLabel)} · ${escape(day)} PHT · Admin-authorized snapshot</p>
      <div class="tt-pilot-delivery-stages">
        ${tile('1 · Submit captured','Device-only','Trusted click; not yet a completed task.','caution')}
        ${tile('2 · Completion verified','Device-only','Tracker confirmed a task transition or completion evidence.','caution')}
        ${tile('3 · Pending delivery','Device-only','Inspect Tracker Sync Health pending queues and errors.','caution')}
        ${tile('4 · Server reporting','Available below','Daily totals are not a per-task delivery receipt.','neutral')}
      </div>
      <div class="tt-pilot-delivery-table-wrap"><table class="tt-pilot-delivery-table"><caption>Server-reported task totals only; never inferred from a Submit click</caption><thead><tr><th scope="col">Workflow</th><th scope="col">Reported submissions</th><th scope="col">Latest server activity</th><th scope="col">Freshness</th></tr></thead><tbody>${line('Coverage',totals.coverage)}${line('Confirmation',totals.confirmation)}</tbody></table></div>
      <details class="tt-pilot-reconcile-steps"><summary>How to reconcile a missed Submit safely</summary><ol><li>On the affected agent’s device, open the existing TrinoTime QC Tracker → Sync Health during an authorized shift.</li><li>Check Coverage and Confirmation separately: captured, verified, pending, acknowledged, and unverified evidence where available.</li><li>Compare the same date, POD, workflow and agent with the authorized server report. A server total alone does not verify individual completion receipts.</li><li>For unresolved or delayed delivery, keep the pending queue and diagnostic details intact; do not reset the shift or fabricate a submission.</li></ol></details>
      <p class="tt-pilot-note">A zero server-reported count means none are in this report, not that nobody clicked Submit. No device queues, credentials, or task payloads are uploaded from this view.</p>`;
  }
  function ensureNav(){const nav=document.querySelector('#ttPremiumSidebar .tt-premium-nav');const old=document.querySelector('#ttPremiumSidebar [data-tt-nav="'+NAV+'"]');
    if(!isAdmin()){old?.remove();if(active)close();return;}
    if(!nav)return;let btn=old;
    if(!btn){btn=document.createElement('button');btn.type='button';btn.className='tt-premium-nav-btn';btn.dataset.ttNav=NAV;btn.dataset.ttTooltip='Pilot Reliability';btn.setAttribute('aria-label','Pilot Reliability');btn.innerHTML=icon+'<span class="tt-nav-label">Pilot Reliability</span>';const after=nav.querySelector('[data-tt-nav="metrics"]')||nav.querySelector('[data-tt-nav="confirmation"]');if(after)after.insertAdjacentElement('afterend',btn);else nav.append(btn);}
    btn.classList.toggle('is-active',active);
  }
  function close(){if(!active)return;active=false;generation++;clearTimeout(refreshTimer);refreshTimer=null;const root=$(ROOT);if(root)root.hidden=true;
    for(const id of surfaces){const el=$(id);if(el&&previous)el.hidden=Boolean(previous[id]);}
    previous=null;document.documentElement.classList.remove('tt-coverage-workspace-active');document.querySelectorAll('#ttPremiumSidebar [data-tt-nav="'+NAV+'"]').forEach(b=>b.classList.remove('is-active'));clearPrivate();}
  function open(){if(!isAdmin()||!build())return;document.dispatchEvent(new CustomEvent('trinotime:workspace-opening',{detail:NAV}));
    if(!active){previous={};for(const id of surfaces){const el=$(id);if(el)previous[id]=el.hidden;}}
    active=true;for(const id of surfaces){const el=$(id);if(el)el.hidden=true;}$(ROOT).hidden=false;document.documentElement.classList.add('tt-coverage-workspace-active');
    document.querySelectorAll('[data-tt-nav]').forEach(b=>b.classList.toggle('is-active',b.dataset.ttNav===NAV));
    document.querySelectorAll('[data-tt-workspace]').forEach(b=>b.classList.remove('is-active'));
    ensureNav();if(lastLoad&&Date.now()-lastLoad<15000&&authFingerprint===fingerprint())return;load(true);
  }
  async function load(force){if(!active||!isAdmin()||busy)return;if(!force&&Date.now()-lastLoad<60000)return;
    const myKey=fingerprint();if(!myKey.includes('|')||myKey==='admin||')return;
    if(authFingerprint&&authFingerprint!==myKey)clearPrivate();authFingerprint=myKey;
    const ticket=++generation,requestedDay=phtDate();day=requestedDay;busy=true;deliveryVerified=false;renderDelivery();setStatus('Loading authenticated Admin reporting…','loading');
    $(ROOT).querySelector('[data-tt-pilot-day]').textContent=requestedDay;
    try{const qs=new URLSearchParams({date:requestedDay});const data=await read('/api/workforce/metrics/dashboard?'+qs);
      if(!active||ticket!==generation||!isAdmin()||fingerprint()!==myKey)return;
      if(data?.ok!==true||data.authority!=='workforce-metrics-v1'||data.viewer?.role!=='admin'||data.scope!=='all-pods'||data.date!==requestedDay||!Array.isArray(data.rows)||!Array.isArray(data.pods)||!Array.isArray(data.agents))throw Error('Server returned an unverified Admin scope or date.');
      const rows=data.rows.filter(r=>['coverage','confirmation'].includes(String(r.job||'').toLowerCase()));
      const byJob=job=>rows.filter(r=>String(r.job||'').toLowerCase()===job);
      const confirmed=rs=>rs.reduce((total,r)=>total+Math.max(0,Number(r.submitted)||0),0);
      const latest=rows.reduce((t,r)=>Math.max(t,Number(r.lastSyncAtMs)||0),0);
      const c=confirmed(byJob('coverage')),f=confirmed(byJob('confirmation'));
      const elapsed=latest?Date.now()-latest:Infinity;
      const last=latest?time(latest):'Not reported';
      $(ROOT).querySelector('[data-tt-pilot-metrics]').innerHTML=
        tile('Coverage · reported submitted',n(c),'Daily server-reported submission totals; excludes manual adjustment.')+
        tile('Confirmation · reported submitted',n(f),'Daily server-reported submission totals; excludes manual adjustment.')+
        tile('Visible authorized agents',n(data.agents.length),'Current server roster scope, not a count of active extensions.')+
        tile('Latest agent activity snapshot',last,latest?(elapsed<300000?'Recent server activity':'Old or delayed snapshot'):'No sync timestamp available',elapsed<300000?'neutral':'caution');
      const select=$(ROOT).querySelector('[data-tt-pilot-pod]'),before=pod;
      podOptions=data.pods.filter(p=>p&&typeof p.pod==='string'&&p.pod&&data.agents.some(a=>a.pod===p.pod));
      select.replaceChildren(new Option('Choose an authorized POD',''),...podOptions.map(p=>new Option(String(p.label||p.pod),p.pod)));
      pod=podOptions.some(p=>p.pod===before)?before:'';select.value=pod;deliveryRows=rows;deliveryVerified=true;renderDelivery();
      lastLoad=Date.now();setStatus('Authorized Admin report fetched at '+time(lastLoad)+' · Tracker device queues not verified.','fresh');
      if(pod)await loadMapping(ticket,++mappingGeneration);else $(ROOT).querySelector('[data-tt-pilot-mapping]').innerHTML='<article class="tt-pilot-instruction">Choose an authorized POD to load mapping diagnostics.</article>';
    }catch(err){if(active&&ticket===generation){deliveryRows=[];deliveryVerified=false;renderDelivery();$(ROOT).querySelector('[data-tt-pilot-metrics]').replaceChildren();setStatus('Reporting unavailable: '+String(err?.message||'Connection failed').slice(0,200),'failed');}}
    finally{if(ticket===generation)busy=false;}
  }
  async function loadMapping(ticket,mapTicket){const node=$(ROOT)?.querySelector('[data-tt-pilot-mapping]');if(!node)return;node.innerHTML='<article class="tt-pilot-instruction">Loading verified POD mapping report…</article>';
    const selected=pod,expectedKey=authFingerprint;if(!selected||!podOptions.some(p=>p.pod===selected)){node.innerHTML='<article class="tt-pilot-instruction">Choose an authorized POD to load mapping diagnostics.</article>';return;}
    try{const qs=new URLSearchParams({date:day||phtDate(),period:'day',pod:selected});const data=await read('/api/workforce/metrics/stores?'+qs);
      if(!active||ticket!==generation||mapTicket!==mappingGeneration||pod!==selected||authFingerprint!==fingerprint()||authFingerprint!==expectedKey)return;
      if(data?.ok!==true||data.authority!=='workforce-store-intelligence-v1'||data.viewer?.role!=='admin'||data.scope!=='all-pods'||data.selectedPod!==selected||data.date!==(day||phtDate())||data.period!=='day')throw Error('Store report viewer, POD, or date is not verified.');
      node.innerHTML=tile('Exact store-mapped jobs',n(data.knownJobs),'Jobs with observed mapping evidence.')+
        tile('Unknown Store jobs',n(data.unknownJobs),'Not enough exact Job ID/store evidence.',Number(data.unknownJobs)>0?'caution':'neutral')+
        tile('Mapping conflicts',n(data.conflictJobs),'Conflicting evidence held for review.',Number(data.conflictJobs)>0?'caution':'neutral')+
        tile('Job ledger coverage',data.jobRowsTruncated?'Partial ledger':'Report loaded',data.jobRowsTruncated?'Loaded job rows are truncated; open Store Operations.':'Scoped POD report loaded without altering records.',data.jobRowsTruncated?'caution':'neutral');
    }catch(err){if(active&&ticket===generation&&mapTicket===mappingGeneration&&pod===selected)node.textContent='POD mapping report unavailable: '+String(err?.message||'Retry').slice(0,180);}
  }
  document.addEventListener('click',event=>{const b=event.target?.closest?.('#ttPremiumSidebar [data-tt-nav],#ttCoverageWorkspaceTabs [data-tt-nav]');if(!b)return;
    if(b.dataset.ttNav===NAV){event.preventDefault();if(isAdmin())open();}else if(active)close();},true);
  document.addEventListener('trinotime:workspace-opening',event=>{if(event.detail!==NAV&&active)close();});
  document.addEventListener('visibilitychange',()=>{if(active&&!document.hidden&&Date.now()-lastLoad>60000)load(false);});
  // Hide any previously loaded Admin report immediately when the shell switches
  // to a non-Admin role. Worker still authorizes every request independently.
  if (typeof MutationObserver!=='undefined' && document.body){
    new MutationObserver(()=>{if(!isAdmin()&&active)close();ensureNav();}).observe(document.body,{attributes:true,attributeFilter:['data-trino-role']});
  }
  setInterval(()=>{if(document.hidden)return;ensureNav();if(active){if(!isAdmin()||fingerprint()!==authFingerprint)close();else if(Date.now()-lastLoad>120000&&!busy)load(false);}},1200);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ensureNav,{once:true});else ensureNav();
})();
