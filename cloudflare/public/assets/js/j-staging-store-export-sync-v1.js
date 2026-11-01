/* TrinoTime Store Operations: Excel export + secure per-POD Google Sheet status.
   Existing report exporter creates .xlsx; server is authoritative for every row. */
(()=>{'use strict';
 if(window.__ttStoreExportSyncV1)return;window.__ttStoreExportSyncV1=true;
 const rootId='ttPodDispatchRoot';let current=null,seq=0,activeReportDialog=null;
 const normalize=v=>String(v||'').trim().toLowerCase().replace(/[\s-]+/g,'_');
 const actor=()=>{const a=window.TrinoTimeMessagingSessionContext?.getActor?.();return a&&['admin','team_leader','teamleader','tl'].includes(normalize(a.role))?{...a,role:normalize(a.role)==='admin'?'admin':'team_leader'}:null;};
 // The UI's built-in Admin actor is displayed as 'Admin', while the Worker may
 // resolve a canonical profile name (including 'Administrator' for recovery Admin).
 // Firebase uid is the account identity; a display name is not an auth boundary.
 const firebaseUid=()=>{try{const u=window.firebase?.auth?.().currentUser;return u&&!u.isAnonymous?String(u.uid||''):'';}catch(_){return '';}};
 const identity=()=>{const a=actor();return a?`${a.role}|${String(a.name||'').toLowerCase()}|${a.pod||''}|${firebaseUid()}`:'';};
 function requireMatchingViewer(viewer,role){
   if(!viewer||viewer.role!==role||!String(viewer.uid||''))throw Error('Server identity cannot be verified; export cancelled.');
   const uid=firebaseUid();
   if(uid&&String(viewer.uid)!==uid)throw Error('Authenticated account changed. Sign in again.');
   if(!uid&&!String(window.TrinoTimeMessagingSessionContext?.getSecuritySessionToken?.()||''))throw Error('No authenticated workforce session. Sign in again.');
 };
 // POD identifiers are routing keys, not public-facing names. Never expose a raw
 // custom POD ID in workbook cells, download names or status text.
 const opaquePod=v=>/^(?:tt[-_:]?custom[-_:]?pod|custom[-_:]?pod|tt[-_:]?pod|pod[:_-])/i.test(String(v||'').trim());
 const publicPodName=v=>{const s=String(v||'').trim();return !s||opaquePod(s)||s.length>90?'Assigned POD':s;};
 const filePodName=v=>publicPodName(v).normalize('NFKD').replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').slice(0,48)||'Assigned-POD';
 const adminPODs=new WeakMap();
 function readablePodOptions(pods){
   const counts=new Map(),ordinals=new Map();
   for(const p of pods){const key=normalize(publicPodName(p.podLabel));counts.set(key,(counts.get(key)||0)+1);}
   return pods.map((p,i)=>{
     const label=publicPodName(p.podLabel),key=normalize(label),ordinal=(ordinals.get(key)||0)+1;ordinals.set(key,ordinal);
     const isRepeated=counts.get(key)>1,lead=String(p.teamLeader||'').trim();
     const display=label==='Assigned POD'?`Authorized team ${i+1}`:label;
     return {value:p.pod,text:`${display}${lead?` · TL ${lead}`:''}${isRepeated?` · Team ${ordinal}`:''} · ${Number(p.agentsCount)||0} agents`};
   });
 }
 function synchronizeToWorkControl(panel){
   if(actor()?.role!=='admin')return;
   const selected=panel.querySelector('[data-tt-store-export-admin-pod]')?.value||'';
   const work=panel.closest('#ttPodDispatchRoot')?.querySelector('[data-store-plan-pod]');
   if(!selected||!work||!adminPODs.get(panel)?.includes(selected)||![...work.options].some(o=>o.value===selected))return;
   if(work.value!==selected){work.value=selected;work.dispatchEvent(new Event('change',{bubbles:true}));}
 }
 function synchronizeFromWorkControl(panel){
   if(actor()?.role!=='admin')return;
   const work=panel.closest('#ttPodDispatchRoot')?.querySelector('[data-store-plan-pod]');
   const value=work?.value||'';
   const select=panel.querySelector('[data-tt-store-export-admin-pod]');
   if(value&&adminPODs.get(panel)?.includes(value)&&[...select.options].some(o=>o.value===value)&&select.value!==value){
     select.value=value;clearSheetLink(panel);closeReportViewer();void refresh(panel);
   }
 }
 const authorizedSheetLinks=new WeakMap();
 function clearSheetLink(panel){
   authorizedSheetLinks.delete(panel);
   const link=panel?.querySelector('[data-tt-store-google-sheet-link]');
   if(link){link.hidden=true;link.removeAttribute('href');link.setAttribute('aria-disabled','true');}
 }
 function verifiedSheetUrl(raw){
   try{const u=new URL(String(raw||''));return u.protocol==='https:'&&u.hostname==='docs.google.com'&&/^\/spreadsheets\/d\/[a-zA-Z0-9_-]+\/edit\/?$/.test(u.pathname)?u.href:null;}catch(_){return null;}
 }
 async function headers(method){
   const h={Accept:'application/json'};if(method==='POST')h['Content-Type']='application/json';
   const a=actor();if(!a)throw Error('Sign in as an authorized Team Leader or Admin.');
   const u=window.firebase?.auth?.().currentUser;
   if(u&&!u.isAnonymous&&typeof u.getIdToken==='function')h.Authorization='Bearer '+await u.getIdToken(false);
   if(!h.Authorization){const token=String(window.TrinoTimeMessagingSessionContext?.getSecuritySessionToken?.()||'');if(token)h['X-TT-Security-Session']=token;}
   if(!h.Authorization&&!h['X-TT-Security-Session'])throw Error('No verified TrinoTime session. Sign in again.');
   return h;
 }
 async function api(route,method='GET',body){
   const response=await fetch('/api/workforce/store-exports/'+route,{method,cache:'no-store',credentials:'same-origin',headers:await headers(method),body:body?JSON.stringify(body):undefined});
   const data=await response.json().catch(()=>({}));
   if(!response.ok||!data.ok)throw Error(data.message||data.error||`Store export service HTTP ${response.status}`);
   if(data.authority!=='workforce-store-ops-export-v1')throw Error('Unexpected export authority.');
   return data;
 }
 function getSelected(){
   const root=document.getElementById(rootId),a=actor();if(!root||root.hidden||!a)return null;
   const panel=root.querySelector('[data-tt-store-export-panel]');
   const pod=a.role==='admin'?panel?.querySelector('[data-tt-store-export-admin-pod]')?.value||'':root.querySelector('[data-store-plan-pod]')?.value||'';
   if(!pod)return null;
   if(a.role==='team_leader'&&normalize(a.pod)!==normalize(pod))return null;
   if(a.role==='admin'&&!adminPODs.get(panel)?.includes(pod))return null;
   const date=root.querySelector('[data-store-plan-date]')?.value||'';
   return {root,pod,date:/^\d{4}-\d{2}-\d{2}$/.test(date)?date:'',identity:identity()};
 }
 const statusText=(node,value)=>{node.textContent=value;};
 function newSection(root){
   let panel=root.querySelector('[data-tt-store-export-panel]');if(panel)return panel;
   const nav=root.querySelector('[data-tt-so-tabs]');if(!nav)return null;
   panel=document.createElement('section');panel.className='tt-so-export-panel';panel.dataset.ttStoreExportPanel='';panel.setAttribute('aria-label','Store Operations export and Google Sheets synchronization');
   const title=document.createElement('div');title.className='tt-so-export-heading';
   const heading=document.createElement('strong');heading.textContent='Export & Sync Center';
   const subtitle=document.createElement('small');subtitle.textContent='Server-authorized POD data · One-way TrinoTime → Google Sheets';title.append(heading,subtitle);
   const controls=document.createElement('div');controls.className='tt-so-export-controls';
   const adminLabel=document.createElement('label');adminLabel.dataset.ttStoreExportAdminLabel='';adminLabel.className='tt-so-export-admin-label';adminLabel.textContent='POD / Team';adminLabel.hidden=true;adminLabel.style.cssText='display:none;flex-direction:column;gap:3px;font-size:12px;font-weight:650;';
   const adminPod=document.createElement('select');adminPod.dataset.ttStoreExportAdminPod='';adminPod.setAttribute('aria-label','Select authorized POD for export');
   adminPod.append(new Option('Select an authorized POD',''));adminLabel.append(adminPod);controls.append(adminLabel);
   const period=document.createElement('select');period.dataset.ttStoreExportPeriod='';period.setAttribute('aria-label','Export reporting period');
   for(const [value,label] of [['day','Selected day'],['7d','Previous 7 days']]){const opt=document.createElement('option');opt.value=value;opt.textContent=label;period.append(opt);}period.value='7d';
   const excel=document.createElement('button');excel.type='button';excel.dataset.ttStoreExportExcel='';excel.textContent='Export Excel (.xlsx)';
   const sync=document.createElement('button');sync.type='button';sync.dataset.ttStoreExportSync='';sync.textContent='Sync now';
   // View report uses TrinoTime authorization; opening the actual private Google
   // Sheet still requires separate Google permission. Never make it public.
   const open=document.createElement('button');open.type='button';open.dataset.ttStoreExportLink='';open.textContent='View report';open.setAttribute('aria-label','View authorized POD report inside TrinoTime');
   const sheetLink=document.createElement('a');sheetLink.dataset.ttStoreGoogleSheetLink='';sheetLink.textContent='Open Google Sheet ↗';sheetLink.target='_blank';sheetLink.rel='noopener noreferrer';sheetLink.hidden=true;sheetLink.setAttribute('aria-disabled','true');sheetLink.setAttribute('aria-label','Open your authorized POD Google Sheet in a new tab; Google account access may be required');
   controls.append(period,excel,sync,open,sheetLink);
   sheetLink.addEventListener('click',event=>{
     const selected=getSelected(),authorized=authorizedSheetLinks.get(panel);
     if(!selected||!authorized||selected.pod!==authorized.pod||selected.identity!==authorized.identity||!verifiedSheetUrl(sheetLink.href)||sheetLink.href!==authorized.url){event.preventDefault();clearSheetLink(panel);}
   });
   const status=document.createElement('p');status.dataset.ttStoreExportStatus='';status.setAttribute('role','status');status.textContent='Choose an authorized POD to check export availability.';
   panel.append(title,controls,status);nav.insertAdjacentElement('afterend',panel);
   excel.addEventListener('click',()=>run(panel,'excel'));
   sync.addEventListener('click',()=>run(panel,'sync'));
   open.addEventListener('click',()=>run(panel,'viewer'));
   const changed=()=>{clearSheetLink(panel);closeReportViewer();refresh(panel);};
   period.addEventListener('change',changed);
   adminPod.addEventListener('change',()=>{synchronizeToWorkControl(panel);changed();});
   root.querySelector('[data-store-plan-pod]')?.addEventListener('change',()=>{synchronizeFromWorkControl(panel);changed();});
   root.querySelector('[data-store-plan-date]')?.addEventListener('change',changed);
   refresh(panel);return panel;
 }
 async function prepareAdminPods(panel){
   const admin=actor(),label=panel.querySelector('[data-tt-store-export-admin-label]'),select=panel.querySelector('[data-tt-store-export-admin-pod]');
   const show=admin?.role==='admin';label.hidden=!show;label.style.display=show?'inline-flex':'none';
   if(!show){panel.dataset.ttAdminPodIdentity='';adminPODs.delete(panel);select.replaceChildren(new Option('Select an authorized POD',''));return;}
   const key=identity();
   if(panel.dataset.ttAdminPodIdentity===key)return;
   panel.dataset.ttAdminPodIdentity=key;adminPODs.delete(panel);
   select.replaceChildren(new Option('Loading authorized PODs…',''));
   try{
     const result=await api('pods');
     if(identity()!==key||panel.dataset.ttAdminPodIdentity!==key)return;
     requireMatchingViewer(result.viewer,'admin');
     const pods=Array.isArray(result.pods)?result.pods:[];
     const valid=pods.filter(x=>typeof x?.pod==='string'&&x.pod&&x.pod.length<=120);
     adminPODs.set(panel,valid.map(x=>x.pod));
     const selectedBefore=select.value;
     select.replaceChildren(new Option('Select an authorized POD',''));
     for(const item of readablePodOptions(valid))select.add(new Option(item.text,item.value));
     const workPod=panel.closest('#ttPodDispatchRoot')?.querySelector('[data-store-plan-pod]')?.value||'';
     const preferred=[workPod,selectedBefore].find(id=>valid.some(x=>x.pod===id));
     if(preferred)select.value=preferred;
     if(!valid.length)statusText(panel.querySelector('[data-tt-store-export-status]'),'No authorized POD with active agents is available for export.');
     else statusText(panel.querySelector('[data-tt-store-export-status]'),preferred?'Selected POD is verified for export.':'Choose a verified POD / Team. Reports and Work Control share this selection.');
   }catch(error){
     if(identity()!==key)return;
     panel.dataset.ttAdminPodIdentity='';adminPODs.delete(panel);
     select.replaceChildren(new Option('Unable to load PODs — retry',''));
     statusText(panel.querySelector('[data-tt-store-export-status]'),`Admin POD list unavailable: ${error.message||'retry'}`);
   }
 }
 function reportFromSnapshot(s){
   const rows=s.performance?.jobs||[],stores=s.performance?.stores||[],trends=s.performance?.trends||[];
   const label=publicPodName(s.podLabel);
   const t=(headers,values)=>({headers,rows:values});
   const report={workflow:'Store Operations',date:s.date,period:s.period==='7d'?'Previous 7 days':'Selected day',scope:s.viewer.role==='admin'?'selected-authorized-pod':'own-pod',viewer:s.viewer.name,role:s.viewer.role,filter:`POD: ${label}`,generated:s.generatedAt,kpis:[['POD',label],['Confirmed submissions',stores.reduce((n,r)=>n+(Number(r.submitted)||0),0)]],tables:{
     activity:t(['Date','POD','Store','Agent','Workflow','Job ID','Submitted','Active ms','Mapping','Status'],rows.map(j=>[j.date,label,j.storeName,j.agent,j.workflow,j.jobId,j.submitted,j.activeMs,j.mappingStatus,j.status])),
     stores:t(['Store','Workflow','Unique jobs','Confirmed','Active ms','Agents','Mapping'],stores.map(r=>[r.storeName,r.workflow,r.jobs,r.submitted,r.activeMs,r.agents,r.mappingStatus])),
     storeJobs:t(['Date','Store','Job ID','Agent','Workflow','Submitted','Active ms','Mapping','Status'],rows.map(j=>[j.date,j.storeName,j.jobId,j.agent,j.workflow,j.submitted,j.activeMs,j.mappingStatus,j.status])),
     storeTrends:t(['Date','Store','Workflow','Jobs','Confirmed','Active ms','Mapping'],trends.map(r=>[r.date,r.storeName,r.workflow,r.jobs,r.submitted,r.activeMs,r.mappingStatus])),
     mappingReview:t(['Date','Store','Job ID','Agent','Mapping'],rows.filter(j=>j.mappingStatus!=='observed').map(j=>[j.date,j.storeName,j.jobId,j.agent,j.mappingStatus])),
     storeQueue:t(['Position','Store','Planned jobs','Job IDs'],(s.queue?.entries||[]).map((r,i)=>[r.order||i+1,r.store||'',r.plannedJobs||'',Array.isArray(r.jobIds)?r.jobIds.join(' | '):''])),
     storeStatus:`Published store: ${s.dispatch?.active?s.dispatch.store:'No active instruction'} · ${s.performance?.jobRowsTruncated?'PARTIAL job ledger':'Full loaded job ledger'}`,storePeriod:s.period
    },notes:['Data was fetched fresh from server-authorized TrinoTime store reports for this POD only.','Store Queue information is the selected day POD assignment; it is not proof that a job was completed.','Tracker store mappings are observed; unknown/conflicting mappings are not silently assigned.','Published store instructions and observed Augmoto tasks are independent authorities.','No Google Sheet edits can flow back to TrinoTime.',...(s.performance?.jobRowsTruncated?[`WARNING: The server returned ${rows.length} of ${s.performance.jobRowsTotal} authorized job rows. Export is partial.`]:[])]};
   return report;
 }

 // TT_IN_APP_REPORT_VIEWER_V1 — read-only, server-authorized snapshot. This is
 // NOT a public Google Sheet and never exposes Google service-account tokens.
 function closeReportViewer(){
   if(!activeReportDialog)return;
   const {backdrop,previousFocus,onKeydown}=activeReportDialog;
   document.removeEventListener('keydown',onKeydown,true);
   activeReportDialog=null;backdrop.remove();
   if(previousFocus?.isConnected)previousFocus.focus();
 }
 const readableActive=ms=>{const seconds=Math.max(0,Math.floor((Number(ms)||0)/1000));const h=Math.floor(seconds/3600),m=Math.floor(seconds%3600/60),sec=seconds%60;return h?`${h}h ${m}m ${sec}s`:m?`${m}m ${sec}s`:`${sec}s`;};
 const mappingLabel=value=>({observed:'Observed',recovered:'Recovered', 'shared-job':'Shared job',unknown:'Needs mapping',conflict:'Needs review'})[String(value||'')]||'Needs mapping';
 function reportTables(snapshot){
   const p=snapshot.performance||{},d=snapshot.dispatch||{},q=snapshot.queue||{};
   const jobs=Array.isArray(p.jobs)?p.jobs:[],stores=Array.isArray(p.stores)?p.stores:[],trends=Array.isArray(p.trends)?p.trends:[];
   const pod=publicPodName(snapshot.podLabel);
   const overview=[
     ['POD',pod],['Reporting date (PHT)',snapshot.date||''],
     ['Period',snapshot.period==='7d'?'Previous 7 days':'Selected day'],
     ['Generated at',snapshot.generatedAt||''],
     ['Current instruction',d.active?d.store||'':'No active instruction'],
     ['Workflow',d.active?d.workflow||'':'Standby'],
     ['Published by',d.updatedBy||''],
     ['Confirmed submissions',stores.reduce((n,r)=>n+(Number(r.submitted)||0),0)],
     ['Data source','Server-authorized TrinoTime Tracker observations'],
     ['Mapping','Only exact Job ID/store evidence resolves unknown jobs']
   ];
   return [
     {title:'Overview',headers:['Field','Value'],rows:overview},
     {title:'Store Queue',headers:['Position','Store','Planned jobs','Job IDs'],rows:(q.entries||[]).map((r,i)=>[r.order||i+1,r.store||'',r.plannedJobs||'',Array.isArray(r.jobIds)?r.jobIds.join(' | '):''])},
     {title:'Store Performance',headers:['Store','Workflow','Jobs','Submitted','Active time','Mapping','Agents'],rows:stores.map(r=>[r.storeName,r.workflow,r.jobs,r.submitted,readableActive(r.activeMs),mappingLabel(r.mappingStatus),r.agents])},
     {title:'Job Ledger',headers:['Date','Store','Agent','Workflow','Job ID','Submitted','Active time','Mapping','Status'],rows:jobs.map(j=>[j.date,j.storeName,j.agent,j.workflow,j.jobId,j.submitted,readableActive(j.activeMs),mappingLabel(j.mappingStatus),j.status])},
     {title:'History',headers:['Date','Store','Workflow','Jobs','Submitted','Active time','Mapping'],rows:trends.map(t=>[t.date,t.storeName,t.workflow,t.jobs,t.submitted,readableActive(t.activeMs),mappingLabel(t.mappingStatus)])}
   ];
 }
 function showReportViewer(snapshot,viewerIdentity){
   closeReportViewer();
   const previousFocus=document.activeElement;
   const backdrop=document.createElement('div');backdrop.className='tt-so-report-backdrop';backdrop.dataset.ttStoreReportBackdrop='';
   const dialog=document.createElement('section');dialog.className='tt-so-report-dialog';dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-label','TrinoTime authorized Store Operations report');
   const header=document.createElement('header');header.className='tt-so-report-header';
   const title=document.createElement('div'),h=document.createElement('h2'),desc=document.createElement('p');
   h.textContent=`${publicPodName(snapshot.podLabel)} · Store Operations Report`;
   desc.textContent='Read-only data from TrinoTime · No Google account required · Scope verified by server';
   title.append(h,desc);
   const close=document.createElement('button');close.type='button';close.className='tt-so-report-close';close.textContent='Close';close.addEventListener('click',closeReportViewer);
   header.append(title,close);
   const note=document.createElement('p');note.className='tt-so-report-note';
   note.textContent=snapshot.performance?.jobRowsTruncated?'Partial job ledger: the reporting server limited the job list. Do not treat this as a complete job audit.':'Store Queue is planned work; other activity is Tracker-observed. Mapping: Observed, Recovered, Shared job, or Needs mapping. No Google Sheet edits.';
   const nav=document.createElement('nav');nav.className='tt-so-report-tabs';nav.setAttribute('aria-label','Report sections');nav.setAttribute('role','tablist');
   const data=document.createElement('div');data.className='tt-so-report-data';data.setAttribute('role','tabpanel');data.setAttribute('aria-label','Selected Store Operations report');
   const tables=reportTables(snapshot);
   function render(tab){
     if(identity()!==viewerIdentity){closeReportViewer();return;}
     data.replaceChildren();
     const table=document.createElement('table');table.className='tt-so-report-table';
     const thead=document.createElement('thead'),headRow=document.createElement('tr');
     tab.headers.forEach(v=>{const th=document.createElement('th');th.scope='col';th.textContent=String(v);headRow.append(th);});
     thead.append(headRow);const tbody=document.createElement('tbody');
     if(!tab.rows.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=tab.headers.length;td.textContent='No authorized records for this period.';tr.append(td);tbody.append(tr);}
     else{const frag=document.createDocumentFragment();tab.rows.forEach(row=>{const tr=document.createElement('tr');row.forEach(v=>{const td=document.createElement('td');td.textContent=String(v??'');tr.append(td);});frag.append(tr);});tbody.append(frag);}
     table.append(thead,tbody);data.append(table);data.scrollTop=0;data.scrollLeft=0;
   }
   tables.forEach((tab,i)=>{const b=document.createElement('button');b.type='button';b.textContent=tab.title;b.setAttribute('role','tab');b.setAttribute('aria-selected',i===0?'true':'false');b.setAttribute('aria-pressed',i===0?'true':'false');b.addEventListener('click',()=>{if(identity()!==viewerIdentity){closeReportViewer();return;}nav.querySelectorAll('button').forEach(btn=>{btn.setAttribute('aria-pressed',String(btn===b));btn.setAttribute('aria-selected',String(btn===b));});render(tab);});nav.append(b);});
   dialog.append(header,note,nav,data);backdrop.append(dialog);document.body.append(backdrop);
   const onKeydown=e=>{if(e.key==='Escape'){e.preventDefault();closeReportViewer();}else if(e.key==='Tab'&&activeReportDialog){const focusables=[...dialog.querySelectorAll('button:not([disabled])')],first=focusables[0],last=focusables[focusables.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}};
   backdrop.addEventListener('click',e=>{if(e.target===backdrop)closeReportViewer();});
   activeReportDialog={backdrop,previousFocus,onKeydown};document.addEventListener('keydown',onKeydown,true);
   render(tables[0]);close.focus();
 }
 async function run(panel,kind){
   const selected=getSelected();if(!selected){statusText(panel.querySelector('[data-tt-store-export-status]'),actor()?.role==='admin'?'Admin: choose an authorized POD in Export POD before exporting.':'Choose your own POD in Work Control before exporting.');return;}
   const start=++seq,pod=selected.pod,identityKey=selected.identity,period=panel.querySelector('[data-tt-store-export-period]').value;
   const button=panel.querySelector(kind==='excel'?'[data-tt-store-export-excel]':kind==='viewer'?'[data-tt-store-export-link]':'[data-tt-store-export-sync]');button.disabled=true;
   const status=panel.querySelector('[data-tt-store-export-status]');statusText(status,kind==='excel'?'Preparing authorized Excel workbook…':kind==='viewer'?'Loading authorized in-app report…':'Sending authorized data to this POD’s Google Sheet…');
   try{
     let result;
     if(kind==='excel'){
       const x=new URLSearchParams({pod,period});if(selected.date)x.set('date',selected.date);
       result=await api('snapshot?'+x);
       if(start!==seq||identity()!==identityKey||getSelected()?.pod!==pod)return;
       if(result.pod!==pod)throw Error('Export POD scope changed; cancelled.');
       requireMatchingViewer(result.viewer,actor()?.role);
       const writer=window.TrinoTimeReportExports?.buildXlsx;if(typeof writer!=='function')throw Error('TrinoTime Excel report engine not available; refresh the page.');
       const bytes=writer(reportFromSnapshot(result),{includeDrawingParts:false}); // TT_STORE_EXCEL_DRAWING_COMPAT_V1
       const blob=new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`TrinoTime-Store-Operations-${filePodName(result.podLabel)}-${result.date}-${period}.xlsx`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);
       statusText(status,`Excel prepared for ${publicPodName(result.podLabel)}. ${result.performance?.jobRowsTruncated?'Warning: job ledger is partial.':'Includes all loaded authorized report rows.'}`);
     }else if(kind==='viewer'){
       const x=new URLSearchParams({pod,period});if(selected.date)x.set('date',selected.date);
       result=await api('snapshot?'+x);
       if(start!==seq||identity()!==identityKey||getSelected()?.pod!==pod)return;
       if(result.pod!==pod)throw Error('Report POD scope changed; cancelled.');
       requireMatchingViewer(result.viewer,actor()?.role);
       showReportViewer(result,identityKey);
       statusText(status,`Authorized report opened inside TrinoTime for ${publicPodName(result.podLabel)}.`);
     }else{
       result=await api('sync-now','POST',{pod,period,date:selected.date||undefined});
       if(start!==seq||identity()!==identityKey||getSelected()?.pod!==pod)return;
       statusText(status,'Google Sheet updated at '+result.lastSyncedAt+' · One-way only.');
       await refresh(panel);
     }
   }catch(error){if(start===seq)statusText(status,`Not completed: ${error.message||'Please retry.'}`);}
   finally{button.disabled=false;}
 }
 async function refresh(panel){
   const selected=getSelected(),open=panel.querySelector('[data-tt-store-export-link]'),sync=panel.querySelector('[data-tt-store-export-sync]'),status=panel.querySelector('[data-tt-store-export-status]');
   const ticket=++seq;clearSheetLink(panel);open.disabled=!selected;sync.disabled=true;
   if(actor()?.role==='admin')void prepareAdminPods(panel);
   else if(panel.dataset.ttAdminPodIdentity)void prepareAdminPods(panel);
   if(!selected){statusText(status,actor()?.role==='admin'?'Admin: choose a POD in Export POD first.':'Select your authorized POD. No other POD data is displayed.');return;}
   statusText(status,'Checking Google Sheets connection for this POD…');
   try{
     const d=await api('status?'+new URLSearchParams({pod:selected.pod}));
     if(ticket!==seq||identity()!==selected.identity||getSelected()?.pod!==selected.pod)return;
     if(d.pod!==selected.pod)throw Error('Google Sheet POD scope mismatch.');
     if(d.noActiveAgents===true){
       open.disabled=true;excel.disabled=true;sync.disabled=true;
       statusText(status,'Your POD currently has no active Agents in the authorized roster. Excel and reports are paused until the roster refreshes.');return;
     }
     if(!d.configured){statusText(status,'Google Sheets: Not connected. Excel export is available; an Admin must configure the service account and POD Sheet mapping.');return;}
     const authorizedUrl=verifiedSheetUrl(d.spreadsheetUrl);
     if(authorizedUrl){
       const link=panel.querySelector('[data-tt-store-google-sheet-link]');
       authorizedSheetLinks.set(panel,{pod:selected.pod,identity:selected.identity,url:authorizedUrl});
       link.href=authorizedUrl;link.hidden=false;link.setAttribute('aria-disabled','false');
     }
     sync.disabled=d.manualEnabled!==true; // Opening a private Sheet never authorizes sync or changes Google sharing.
     if(d.manualEnabled!==true){statusText(status,'Google Sheets mapped, but manual sync is paused. Admin must explicitly approve the pilot before any workforce data is sent.');return;}
     const recentFailure=d.lastErrorAt&&(!d.lastSyncedAt||Date.parse(d.lastErrorAt)>Date.parse(d.lastSyncedAt));
     const cadence=d.automaticEnabled===true?'Automatic sync enabled (every 5 minutes).':'Automatic sync paused (manual only).';
     statusText(status,recentFailure?`Google Sheets sync failed at ${d.lastErrorAt}. Last successful sync: ${d.lastSyncedAt||'none'}. ${cadence}`:d.lastSyncedAt?`Google Sheets configured · Last successful sync: ${d.lastSyncedAt}. ${cadence}`:`Google Sheets configured; awaiting first verified manual sync. ${cadence}`);
   }catch(error){if(ticket===seq)statusText(status,`Google status unavailable: ${error.message||'Please retry.'}`);}
 }
 function maskOpaquePodOptions(root){
   // Display-only: preserve the original option.value for authorization and writes.
   const select=root.querySelector('[data-store-plan-pod]');if(!select)return;
   [...select.options].forEach((option,i)=>{
     if(!option.value)return;
     const raw=option.textContent||'',label=raw.split(' · ')[0].trim();
     if(!opaquePod(label))return;
     const agents=raw.match(/ · (\d+) agents?$/);
     option.textContent=`POD ${i}${agents?` · ${agents[1]} agents`:''}`;
   });
 }
 function discover(){const root=document.getElementById(rootId);if(!root||root.hidden||!root.classList.contains('tt-so-hub')||!actor())return;maskOpaquePodOptions(root);const panel=newSection(root);if(panel&&current!==root){current=root;refresh(panel);}}
 document.addEventListener('click',e=>{if(e.target.closest?.('[data-tt-nav="pod-work"]'))setTimeout(()=>{discover();const panel=document.querySelector('#'+rootId+' [data-tt-store-export-panel]');if(panel)refresh(panel);},95);});
 document.addEventListener('trinotime:store-context',()=>setTimeout(()=>{discover();const panel=document.querySelector('#'+rootId+' [data-tt-store-export-panel]');if(panel)refresh(panel);},0));
 document.addEventListener('trinotime:store-pods-verified',()=>{
   const panel=document.querySelector('#'+rootId+' [data-tt-store-export-panel]');
   if(panel){synchronizeFromWorkControl(panel);void refresh(panel);}
 });
 document.addEventListener('trinotime:workspace-opening',()=>{seq++;closeReportViewer();const p=current?.querySelector('[data-tt-store-export-panel]');if(p){clearSheetLink(p);p.querySelector('[data-tt-store-export-link]').disabled=true;}if(current){current.dataset.ttAdminPodIdentity='';adminPODs.delete(p);}});
 // UX18P34: clocks and other dashboards must not trigger Store Operations discovery.
 let discoveryFrame=0,observedRoot=null;
 function scheduleDiscovery(){
   if(discoveryFrame)return;
   discoveryFrame=requestAnimationFrame(()=>{discoveryFrame=0;discover();});
 }
 const rootObserver=new MutationObserver(scheduleDiscovery);
 // Review fix: observe only the root's direct parent for replacement. Without
 // this, an AJAX workspace rebuild can leave the observer on a detached root.
 const parentObserver=new MutationObserver(()=>{if(!connectDiscovery())watchForRoot();});
 const finder=new MutationObserver(()=>{if(connectDiscovery())finder.disconnect();});
 function watchForRoot(){
   rootObserver.disconnect();parentObserver.disconnect();observedRoot=null;
   finder.disconnect();finder.observe(document.body,{childList:true,subtree:true});
 }
 function connectDiscovery(){
   const root=document.getElementById(rootId);if(!root)return false;
   if(root!==observedRoot){
     finder.disconnect();rootObserver.disconnect();parentObserver.disconnect();observedRoot=root;
     rootObserver.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','class']});
     if(root.parentNode)parentObserver.observe(root.parentNode,{childList:true});
     scheduleDiscovery();
   }
   return true;
 }
 if(!connectDiscovery())watchForRoot();
 document.addEventListener('trinotime:workspace-opening',()=>{if(!connectDiscovery())watchForRoot();scheduleDiscovery();});
 discover();
})();
