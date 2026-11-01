/* M2.9.37 Store Intelligence executive: authorized store accordion, 7-day trend,
   mapping review flags and deduplicated job ledger. No counting or grading writes. */
(() => {
 'use strict';
 if(window.__ttStoreIntelligenceM2934)return;
 window.__ttStoreIntelligenceM2934=true;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const containers={coverage:'ttCoverageRoot',confirmation:'ttConfirmationBody',metrics:'ttMetricsBody',podwork:'ttPodStorePerformanceHost'};
 const state=Object.create(null);
 const n=v=>Math.max(0,Number(v)||0).toLocaleString();
 const duration=ms=>{const m=Math.floor(Math.max(0,Number(ms)||0)/60000);return m>=60?`${Math.floor(m/60)}h ${m%60}m`:`${m}m`;};
 const pace=x=>x?.paceSec==null?'—':`${n(x.paceSec)}s`;
 const isMapped=r=>['observed','recovered','shared-job'].includes(r.mappingStatus);
 const groupId=r=>`${r.workflow}|${isMapped(r)?r.storeName.toLowerCase():r.mappingStatus}`;
 const jobMatches=(j,r)=>j.workflow===r.workflow&&(isMapped(j)&&isMapped(r)?j.storeName.toLowerCase()===r.storeName.toLowerCase():j.mappingStatus===r.mappingStatus);
 const textColumns=['Date','Store','Job ID','Agent','Workflow','Task position','Submitted','Active','Active sec / submit','Mapping','Status'];
 const jobCells=j=>[j.date,j.storeName,j.jobId,j.agent,j.workflow,`${n(j.lastTask)} / ${n(j.totalTasks)}`,n(j.submitted),duration(j.activeMs),pace(j),j.mappingStatus,j.status];
 const storeColumns=['Store','Workflow','Unique jobs','Confirmed','Active','Active sec / submit','Agents','Mapping'];
 const storeCells=r=>[r.storeName,r.workflow,n(r.jobs),n(r.submitted),duration(r.activeMs),pace(r),n(r.agents),r.mappingStatus];
 const trendColumns=['Date','Store','Workflow','Jobs','Confirmed','Active','Active sec / submit','Mapping'];
 const trendCells=t=>[t.date,t.storeName,t.workflow,n(t.jobs),n(t.submitted),duration(t.activeMs),pace(t),t.mappingStatus];
 const badge=kind=>kind==='conflict'?'<span class="tt-si-badge is-warning">Needs review</span>':kind==='observed'?'<span class="tt-si-badge is-observed">Observed</span>':kind==='recovered'?'<span class="tt-si-badge is-observed">Recovered</span>':kind==='shared-job'?'<span class="tt-si-badge is-observed">Shared job</span>':'<span class="tt-si-badge">Needs mapping</span>';
 function table(headers,rows){return `<div class="tt-si-table-wrap"><table><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;}
 function panelFor(workflow){
   const root=document.getElementById(containers[workflow]);
   if(!root||root.hidden||root.closest('[hidden]'))return null;
   let panel=root.querySelector('[data-tt-store-panel]');
   if(panel)return panel;
   panel=document.createElement('section');panel.className='tt-si-panel';panel.dataset.ttStorePanel=workflow;
   panel.innerHTML=`<div class="tt-si-head"><div><small>Operations Intelligence</small><h3>Store Performance</h3><p>Job IDs, agents and confirmed activity · observed Augmoto job rows</p></div>
    <div class="tt-si-actions"><label>Reporting period <select data-tt-store-period><option value="day">Selected day</option><option value="7d">Previous 7 days</option></select></label><label>Store <select data-tt-store-choice><option value="">All stores</option></select></label><button type="button" data-tt-store-refresh>Refresh</button></div></div>
    <div class="tt-si-tools"><label><span>Find store, job or agent</span><input data-tt-store-search type="search" autocomplete="off" placeholder="Search Job ID / store / agent" /></label><label><span>Mapping status</span><select data-tt-store-status><option value="">All mappings</option><option value="observed">Observed</option><option value="recovered">Recovered mapping</option><option value="shared-job">Shared job</option><option value="unknown">Needs mapping</option><option value="conflict">Needs review</option><option value="unmapped">All unmapped</option></select></label><label><span>Sort stores</span><select data-tt-store-sort><option value="volume">Most submissions</option><option value="jobs">Most jobs</option><option value="name">Store A–Z</option></select></label></div>
    <p class="tt-si-status" role="status">Loading authorized store activity…</p><p class="tt-si-freshness" aria-live="polite">Waiting for an authorized report…</p><div class="tt-si-kpis"></div>
    <div class="tt-si-unmapped"></div><div class="tt-si-agents"></div><div class="tt-si-history-summary"></div><div class="tt-si-list"></div><div class="tt-si-jobs"></div><div class="tt-si-trends"></div><div class="tt-si-review"></div>
    <p class="tt-si-method">Active sec/submission = recorded job active seconds ÷ confirmed job submissions; it is not the Agent efficiency grade. Manual adjustments are not assigned to stores. Store observations are captured by Tracker, not independently verified by Augmoto.</p>`;
   root.append(panel);
   panel.querySelector('[data-tt-store-period]').addEventListener('change',()=>{const s=state[workflow];if(!s)return;s.period=panel.querySelector('[data-tt-store-period]').value;s.data=null;load(workflow,true);});
   for(const selector of ['[data-tt-store-choice]','[data-tt-store-status]','[data-tt-store-sort]','[data-tt-store-search]']){
     panel.querySelector(selector).addEventListener(selector.includes('search')?'input':'change',()=>paint(workflow));
   }
   panel.querySelector('[data-tt-store-refresh]').addEventListener('click',()=>load(workflow,true));
   panel.addEventListener('click',e=>{
     if(e.target.closest('[data-tt-si-show-unmapped]')) {
       panel.querySelector('[data-tt-store-status]').value='unmapped';
       panel.querySelector('[data-tt-store-choice]').value='';
       paint(workflow);
       panel.querySelector('.tt-si-list')?.scrollIntoView?.({block:'nearest',behavior:'smooth'});
       return;
     }
     const toggle=e.target.closest('[data-tt-si-toggle]');if(!toggle)return;
     const s=state[workflow];if(!s)return;const id=toggle.dataset.ttSiToggle;
     if(s.expanded.has(id))s.expanded.delete(id);else s.expanded.add(id);paint(workflow);
   });
   return panel;
 }
 function paint(workflow){
   const s=state[workflow],panel=panelFor(workflow);if(!s||!panel||!s.data)return;
   const data=s.data,select=panel.querySelector('[data-tt-store-choice]'),selection=select.value;
   const choices=[...new Map((data.stores||[]).map(r=>[groupId(r),r])).values()];
   const options='<option value="">All stores</option>'+choices.map(r=>`<option value="${esc(groupId(r))}">${esc(r.workflow+' · '+r.storeName)}</option>`).join('');
   if(select.innerHTML!==options){select.innerHTML=options;select.value=choices.some(r=>groupId(r)===selection)?selection:'';}
   const chosen=select.value,filter=panel.querySelector('[data-tt-store-status]').value,
     search=panel.querySelector('[data-tt-store-search]').value.trim().toLowerCase().slice(0,120),sort=panel.querySelector('[data-tt-store-sort]').value;
   const matches=r=>(!chosen||groupId(r)===chosen)&&(!filter||(filter==='unmapped'?!isMapped(r):r.mappingStatus===filter))&&(!search||[r.storeName,r.workflow,...(data.jobs||[]).filter(j=>jobMatches(j,r)).flatMap(j=>[j.jobId,j.agent])].some(x=>String(x||'').toLowerCase().includes(search)));
   const rows=(data.stores||[]).filter(matches).sort((a,b)=>sort==='jobs'?b.jobs-a.jobs||b.submitted-a.submitted:sort==='name'?a.storeName.localeCompare(b.storeName):b.submitted-a.submitted||b.jobs-a.jobs);
   const k=panel.querySelector('.tt-si-kpis');k.innerHTML=[['Stores',new Set(rows.map(r=>r.storeName.toLowerCase())).size],['Job/workflow links',rows.reduce((total,r)=>total+r.jobs,0)],['Confirmed',rows.reduce((total,r)=>total+r.submitted,0)],['Needs review',(data.conflictJobs||0)]].map(([label,value])=>`<div class="tt-si-kpi"><small>${esc(label)}</small><strong>${n(value)}</strong></div>`).join('');
   panel.querySelector('.tt-si-status').textContent=`${esc(data.fromDate||data.date)}${data.period==='7d'?' → '+esc(data.toDate):''} · ${n(data.knownJobs)} observed · ${n(data.unknownJobs)} unknown · ${n(data.conflictJobs)} mapping conflicts`;
   // Unmapped counts always come from the authoritative full server aggregation,
   // even when the job ledger is truncated or the current display is filtered.
   const unmapped=Number(data.unknownJobs||0)+Number(data.conflictJobs||0);
   panel.querySelector('.tt-si-unmapped').innerHTML=unmapped
     ? `<div class="tt-si-unmapped-banner"><div><strong>${n(unmapped)} unmapped job/date records</strong><small>${n(data.unknownJobs)} unknown · ${n(data.conflictJobs)} conflicting · these submissions stay counted, never guessed into a store.</small></div><button type="button" data-tt-si-show-unmapped>Review mappings</button></div>`
     : '<p class="tt-si-clear">No unmapped records reported for this authorized period.</p>';
   // Agent breakdown is computed ONLY from authorized returned ledger rows. The
   // server caps its job ledger: explicitly disclose incomplete agent totals.
   const filteredJobs=(data.jobs||[]).filter(j=>rows.some(r=>jobMatches(j,r)))
     .filter(j=>!search||[j.jobId,j.agent,j.storeName].some(v=>String(v||'').toLowerCase().includes(search)));
   const agentGroups=new Map();
   if(data.period==='day')for(const job of filteredJobs){
     const label=String(job.agent||'Unknown Agent');const key=label.toLowerCase();
     if(!agentGroups.has(key))agentGroups.set(key,{name:label,coverage:0,confirmation:0,activeMs:0,unmapped:0,ids:new Set()});
     const a=agentGroups.get(key);const count=Math.max(0,Number(job.submitted)||0);
     if(job.workflow==='coverage')a.coverage+=count;
     if(job.workflow==='confirmation')a.confirmation+=count;
     a.activeMs+=Math.max(0,Number(job.activeMs)||0);
     a.ids.add(`${job.date}|${job.workflow}|${job.jobId}`);
     if(!isMapped(job))a.unmapped++;
   }
   const agents=[...agentGroups.values()].sort((a,b)=>a.name.localeCompare(b.name));
   panel.querySelector('.tt-si-agents').innerHTML=data.period!=='day'?'':
     `<section class="tt-si-focus"><div class="tt-si-focus-head"><h4>Agent activity — selected day</h4><p>${data.jobRowsTruncated?`Partial ledger: ${n(data.jobs.length)} of ${n(data.jobRowsTotal)} job/date records loaded. Agent totals below are incomplete.`:'From authorized observed job records. Not a performance grade or a count of completed assigned queues.'}</p></div>`+
     (agents.length?table(['Agent','Coverage confirmed','Confirmation confirmed','Total confirmed','Job/workflow links','Recorded active time','Unmapped records'],agents.map(a=>[a.name,n(a.coverage),n(a.confirmation),n(a.coverage+a.confirmation),n(a.ids.size),duration(a.activeMs),n(a.unmapped)])):'<p class="tt-si-empty">No matching authorized agent job records for this day.</p>')+'</section>';
   // History uses the server's daily trend aggregates, not a daily sum of
   // rounded rates, a guessed assignment count, or the capped job ledger.
   const trendRows=(data.trends||[]).filter(t=>rows.some(r=>jobMatches(t,r)));
   const dates=new Map();
   if(data.period==='7d')for(const trend of trendRows){
     const day=String(trend.date||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(day))continue;
     const d=dates.get(day)||{date:day,coverage:0,confirmation:0,activeMs:0,jobLinks:0};
     d[trend.workflow==='confirmation'?'confirmation':'coverage']+=Math.max(0,Number(trend.submitted)||0);
     d.activeMs+=Math.max(0,Number(trend.activeMs)||0);
     d.jobLinks+=Math.max(0,Number(trend.jobs)||0);
     dates.set(day,d);
   }
   const days=[...dates.values()].sort((a,b)=>a.date.localeCompare(b.date));
   const max=Math.max(1,...days.map(d=>d.coverage+d.confirmation));
   const bars=days.map(d=>`<div class="tt-si-day-row"><time>${esc(d.date)}</time><div class="tt-si-day-track"><span style="width:${Math.round((d.coverage+d.confirmation)/max*100)}%"></span></div><strong>${n(d.coverage+d.confirmation)}</strong></div>`).join('');
   panel.querySelector('.tt-si-history-summary').innerHTML=data.period!=='7d'?'':
     `<section class="tt-si-focus"><div class="tt-si-focus-head"><h4>POD activity — previous seven days</h4><p>Observed work only · includes the selected reporting date · no historical instruction audit.</p></div>`+
     (days.length?`<div class="tt-si-daily-chart" aria-label="Confirmed submissions by day">${bars}</div>`+table(['Date','Coverage confirmed','Confirmation confirmed','Total confirmed','Job/workflow links','Recorded active time'],days.map(d=>[d.date,n(d.coverage),n(d.confirmation),n(d.coverage+d.confirmation),n(d.jobLinks),duration(d.activeMs)])):'<p class="tt-si-empty">No authorized daily trends for the selected stores.</p>')+'</section>';
   // Store rows work as accordions; the full ledger remains available separately for exports.
   const list=panel.querySelector('.tt-si-list');
   list.innerHTML=rows.length?rows.map((r,i)=>{
     const id=groupId(r),open=s.expanded.has(id),jobs=(data.jobs||[]).filter(j=>jobMatches(j,r));
     const hits=search?jobs.filter(j=>[j.jobId,j.agent,j.storeName].some(v=>String(v||'').toLowerCase().includes(search))):jobs;
     const limit=hits.slice(0,150);
     return `<section class="tt-si-store-card" data-mapping="${esc(r.mappingStatus)}"><button class="tt-si-store-toggle" type="button" data-tt-si-toggle="${esc(id)}" aria-expanded="${open?'true':'false'}"><span class="tt-si-chevron">${open?'▾':'▸'}</span><span class="tt-si-store-title"><strong>${esc(r.storeName)}</strong><small>${esc(r.workflow)} · ${n(r.jobs)} job${r.jobs===1?'':'s'} · ${n(r.agents)} agent${r.agents===1?'':'s'}</small></span><span class="tt-si-store-mapping">${badge(r.mappingStatus)}</span><span class="tt-si-store-stats"><span class="tt-si-store-numbers"><strong>${n(r.submitted)}</strong><small>submitted</small></span><span class="tt-si-store-numbers"><strong>${esc(duration(r.activeMs))}</strong><small>active</small></span></span></button>${open?`<div class="tt-si-store-details"><p>Active pace: ${esc(pace(r))} / confirmed submission. ${r.mappingStatus==='conflict'?'Store observations conflict; activity is held in Needs review, not assigned to another store.':''}</p>${table(textColumns,limit.map(jobCells))}${hits.length>limit.length?`<small>Showing ${limit.length} of ${hits.length} job records. Export includes the authorized loaded job ledger.</small>`:''}</div>`:''}</section>`;
   }).join(''):'<div class="tt-si-empty">No matching stores or jobs in this authorized reporting period. New jobs need an Augmoto Jobs-row observation from Tracker.</div>';
   const visibleJobs=(data.jobs||[]).filter(j=>rows.some(r=>jobMatches(j,r))).filter(j=>!search||[j.jobId,j.agent,j.storeName].some(v=>String(v||'').toLowerCase().includes(search)));
   const incomplete=data.jobRowsTruncated?` · ${n(data.jobRowsTotal)} total authorized job records; only ${n(data.jobs.length)} loaded` : '';
   panel.querySelector('.tt-si-jobs').innerHTML=`<details class="tt-si-full-ledger"><summary>Full job ledger · ${n(visibleJobs.length)} loaded records${incomplete}</summary>${visibleJobs.length?table(textColumns,visibleJobs.map(jobCells)):'<p class="tt-si-empty">No matching job records</p>'}</details>`;
   const trends=(data.trends||[]).filter(t=>rows.some(r=>jobMatches(t,r)));
   if(data.period==='7d'){
     const totals=new Map();for(const t of trends)totals.set(t.date,(totals.get(t.date)||0)+t.submitted);
     const days=[...totals.entries()].sort((a,b)=>a[0].localeCompare(b[0]));const max=Math.max(1,...days.map(([,count])=>count));
     const bars=`<div class="tt-si-trend-bars" aria-label="Store submissions by day">${days.map(([d,total])=>`<div class="tt-si-trend-row"><small>${esc(d)}</small><span class="tt-si-trend-track"><i style="width:${Math.round(total/max*100)}%"></i></span><strong>${n(total)}</strong></div>`).join('')}</div>`;
     panel.querySelector('.tt-si-trends').innerHTML=`<details class="tt-si-full-ledger"><summary>Seven-day activity trends · ${n(trends.length)} store/date entries</summary>${bars}${trends.length?table(trendColumns,trends.map(trendCells)):'<p class="tt-si-empty">No trend records</p>'}</details>`;
   }else panel.querySelector('.tt-si-trends').innerHTML='';
   const review=(data.jobs||[]).filter(j=>!isMapped(j));
   panel.dataset.ttStorePaintedKey=s.key;
   panel.querySelector('.tt-si-review').innerHTML=review.length?`<details class="tt-si-full-ledger"><summary>Store mapping review · ${n(review.length)} uncertain job record${review.length===1?'':'s'}</summary><p class="tt-si-review-note">Unknown stores need a verified Augmoto Jobs row containing this exact Job ID and store. A TL instruction or selected Store filter is not proof. Open the matching Augmoto Jobs list with Tracker running, then refresh. Conflicts remain held for review; no automatic reassignment or Agent-side override.</p>${table(textColumns,review.map(jobCells))}</details>`:'';
 }
 async function headersFor(viewer,workflow){
   const h={Accept:'application/json'};
   h['X-TT-'+(workflow==='coverage'?'Coverage':workflow==='confirmation'?'Confirmation':'Metrics')+'-Expected-Role']=viewer.role;
   if(viewer.role!=='admin'){const token=String(window.TrinoTimeMessagingSessionContext?.getSecuritySessionToken?.()||'');if(token)h['X-TT-Security-Session']=token;}
   if(!h['X-TT-Security-Session']){const user=window.firebase?.auth?.().currentUser;if(user&&!user.isAnonymous&&typeof user.getIdToken==='function')h.Authorization=`Bearer ${await user.getIdToken(false)}`;}
   return h;
 }
 async function load(workflow,force=false){
   const s=state[workflow],panel=panelFor(workflow);if(!s||!panel)return;
   if(s.loading){s.pendingRefresh=force||s.pendingRefresh;return;}
   if(!force&&s.data&&Date.now()-s.lastLoad<45000){if(panel.dataset.ttStorePaintedKey!==s.key)paint(workflow);return;}
   s.loading=true;const ticket=++s.ticket,key=s.key,viewer=s.viewer;
   const ttStoreRefreshButton=force?panel.querySelector('[data-tt-store-refresh]'):null;
   if(ttStoreRefreshButton){ttStoreRefreshButton.disabled=true;ttStoreRefreshButton.textContent='Refreshing…';}
   panel.querySelector('.tt-si-status').textContent='Refreshing authorized store activity…';
   try{
     const qs=new URLSearchParams({date:s.date,period:s.period});if(s.pod)qs.set('pod',s.pod);if(s.agent)qs.set('agent',s.agent);
     const apiWorkflow=workflow==='podwork'?'metrics':workflow;
     const response=await fetch(`/api/workforce/${apiWorkflow}/stores?${qs}`,{method:'GET',credentials:'same-origin',headers:await headersFor(viewer,apiWorkflow),cache:'no-store'});
     const data=await response.json();if(!response.ok)throw Error(data.message||`Store Intelligence HTTP ${response.status}`);
     if(!state[workflow]||state[workflow].key!==key||state[workflow].ticket!==ticket)return;
     if(data.authority!=='workforce-store-intelligence-v1'||data.date!==s.date||data.period!==s.period||data.viewer?.role!==viewer.role||String(data.viewer?.name||'').toLowerCase()!==String(viewer.name||'').toLowerCase()||data.scope!==s.scope)throw Error('Store Intelligence scope or identity mismatch.');
     s.data=data;s.lastLoad=Date.now();paint(workflow);
     const fresh=panel.querySelector('.tt-si-freshness');
     if(fresh)fresh.textContent='Report received '+new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',hour:'numeric',minute:'2-digit',hour12:true}).format(new Date(s.lastLoad))+' PHT · source: authorized TrinoTime report';
     if(workflow==='podwork')document.dispatchEvent(new CustomEvent('trinotime:store-report-updated',{detail:{
       viewer:{role:data.viewer.role,name:data.viewer.name,pod:data.viewer.pod||''},
       selectedPod:data.selectedPod||'',date:data.date,period:data.period,scope:data.scope,
       knownJobs:data.knownJobs||0,unknownJobs:data.unknownJobs||0,conflictJobs:data.conflictJobs||0,
       confirmed:(data.stores||[]).reduce((sum,r)=>sum+Math.max(0,Number(r.submitted)||0),0),
       receivedAt:s.lastLoad
     }}));
   }catch(err){if(state[workflow]?.key===key){
     s.data=null;
     const target=panelFor(workflow);
     if(target){
       for(const sel of ['.tt-si-kpis','.tt-si-unmapped','.tt-si-agents','.tt-si-history-summary','.tt-si-list','.tt-si-jobs','.tt-si-trends','.tt-si-review'])target.querySelector(sel)?.replaceChildren();
       target.querySelector('.tt-si-freshness').textContent='Report unavailable — no current data shown';
       target.querySelector('.tt-si-status').textContent=`Store data unavailable: ${err?.message||'Please refresh'}`;
     }
   }}
   finally{
     if(ttStoreRefreshButton && ttStoreRefreshButton.isConnected){
       ttStoreRefreshButton.disabled=false;
       ttStoreRefreshButton.textContent=s.data?'Updated ✓':'Retry';
       if(s.data)setTimeout(()=>{if(ttStoreRefreshButton.isConnected&&ttStoreRefreshButton.textContent==='Updated ✓')ttStoreRefreshButton.textContent='Refresh';},1500);
     }
     if(state[workflow]?.key===key){s.loading=false;if(s.pendingRefresh){s.pendingRefresh=false;load(workflow,true);}}
   }
 }
 document.addEventListener('trinotime:store-context',e=>{
   const d=e.detail||{},wf=d.workflow;if(!containers[wf]||!d.date||!d.viewer?.role||!d.viewer?.name)return;
   const key=[d.date,d.viewer.role,d.viewer.name,d.viewer.pod||'',d.pod||'',d.agent||'',d.scope||''].join('|');
   if(state[wf]?.key!==key){
     state[wf]={key,viewer:d.viewer,date:d.date,pod:d.pod||'',agent:d.agent||'',scope:d.scope||'',period:'day',data:null,lastLoad:0,ticket:0,loading:false,pendingRefresh:false,expanded:new Set()};
     // A manager changing POD must never briefly see the previous POD's cached report.
     const panel=panelFor(wf);
     if(panel){
       for(const sel of ['.tt-si-kpis','.tt-si-unmapped','.tt-si-agents','.tt-si-history-summary','.tt-si-list','.tt-si-jobs','.tt-si-trends','.tt-si-review'])panel.querySelector(sel)?.replaceChildren();
       const select=panel.querySelector('[data-tt-store-choice]');if(select)select.innerHTML='<option value="">All stores</option>';
       const status=panel.querySelector('.tt-si-status');if(status)status.textContent='Loading observed job-to-store records for this POD…';
       const fresh=panel.querySelector('.tt-si-freshness');if(fresh)fresh.textContent='Waiting for this POD’s authorized report…';
     }
   }
   load(wf);
 });
 document.addEventListener('trinotime:workspace-opening',e=>{for(const wf of Object.keys(state))if(e.detail!==wf){state[wf].ticket++;delete state[wf];}});
 // Report exports never scrape a collapsed accordion. Return precisely the
 // loaded, authorized scope, independent of UI expansion and with explicit truncation.
 window.TrinoTimeStoreIntelligence=Object.freeze({getReportData:(workflow,context)=>{
   const s=state[workflow];if(!s||!s.data||s.loading||s.date!==context.date||s.scope!==context.scope||s.viewer.role!==context.viewer.role||s.viewer.name.toLowerCase()!==context.viewer.name.toLowerCase()||s.pod!==(context.pod||'')||s.agent!==(context.agent||''))return null;
   return {period:s.data.period,truncated:Boolean(s.data.jobRowsTruncated),total:s.data.jobRowsTotal,
     stores:{headers:storeColumns,rows:(s.data.stores||[]).map(storeCells)},
     storeJobs:{headers:textColumns,rows:(s.data.jobs||[]).map(jobCells)},
     trends:{headers:trendColumns,rows:(s.data.trends||[]).map(trendCells)},
     mappingReview:{headers:textColumns,rows:(s.data.jobs||[]).filter(j=>!isMapped(j)).map(jobCells)}};
 }});
})();
