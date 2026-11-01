/* TrinoTime POD Work Control — UI-only replacement over established Phase 2+3 services. */
(() => {
 'use strict';
 const lib=window.TrinoTimeStoreQueue,states=new WeakMap();
 let pageActive=false,pageSnapshot={},lastServerContext=null,pageState=null;
 const norm=s=>String(s||'').trim().toLocaleLowerCase();
 // Same-role Admin account switches are not visible through getActor(), which
 // always returns the display name 'Admin'. Bind each open panel to the actual
 // authenticated account, not a role or presentation label.
 function currentAccountIdentity(){
   try{
     const user=window.firebase?.auth?.().currentUser;
     if(user&&!user.isAnonymous&&String(user.uid||'').trim())return 'firebase:'+String(user.uid).trim();
   }catch(_){}
   // TL sessions can start before Firebase is established. Preserve isolation
   // by comparing the opaque security session value IN MEMORY only: never log,
   // persist, expose in DOM, or transmit it to any endpoint beyond existing auth.
   try{
     const session=String(window.TrinoTimeMessagingSessionContext?.getSecuritySessionToken?.()||'');
     if(session)return 'security:'+session;
   }catch(_){}
   return '';
 }
 function sameAccount(state){
   const account=currentAccountIdentity();
   return !!account&&!!state?.accountIdentity&&account===state.accountIdentity;
 }
 // Never carry another TL's POD or saved edit state into the current session.
 function liveViewer(){
   let actor=null;
   try{actor=window.TrinoTimeMessagingSessionContext?.getActor?.()||null;}catch(_){}
   const role=String(actor?.role||'').trim().toLowerCase().replace(/[\s-]+/g,'_');
   if(role==='admin')return {role:'admin',name:String(actor.name||'Administrator'),pod:''};
   if(['team_leader','teamleader','tl'].includes(role)&&String(actor.name||'').trim()&&String(actor.pod||'').trim())
     return {role:'team_leader',name:String(actor.name).trim(),pod:String(actor.pod).trim()};
   return null;
 }
 function sameViewer(a,b){
   if(!a||!b||a.role!==b.role)return false;
   if(a.role==='admin')return true; // The shell calls this actor Admin; API may use Administrator.
   return norm(a.name)===norm(b.name)&&norm(a.pod)===norm(b.pod);
 }
 function ensureCurrentSession(state){
   if(state?.disposed||!sameViewer(liveViewer(),state?.viewer)||!sameAccount(state))
     throw Error('Signed-in Team Leader or POD changed. Reopen POD Work Control after signing in.');
 }
 function retirePanel(root){
   const store=root?.querySelector('[data-tt-store-panel]'),old=store&&states.get(store);
   if(old){old.disposed=true;old.rosterSequence++;old.rosterAbort?.abort();old.dispatchSequence++;old.coverageSequenceTicket++;old.coverageReviewTicket++;old.coverageAllStoresTicket++;old.panel.remove();states.delete(store);}
   if(pageState===old)pageState=null;
 }
 function invalidateSwitchedSession(){
   const root=document.getElementById('ttPodDispatchRoot');
   if(root&&pageState&&(!sameViewer(liveViewer(),pageState.viewer)||!sameAccount(pageState))){
     retirePanel(root);
     root.querySelector('[data-tt-store-panel]').textContent='Account changed. Reopen POD Work Control to load your own team.';
     if(pageActive)closePage();
   }
 }

 const $=(state,selector)=>state.panel.querySelector(selector);
 const txt=(state,selector,value)=>{$(state,selector).textContent=String(value??'');};
 const currentPod=state=>$(state,'[data-store-plan-pod]').value;
 const currentAgent=state=>$(state,'[data-store-plan-agent]').value;
 const planScope=state=>$(state,'[data-store-plan-scope]').value;
 const currentDate=state=>$(state,'[data-store-plan-date]').value;
 const validPod=state=>state.pods.find(p=>p.pod===currentPod(state));
 const validAgent=state=>state.agents.find(a=>a.name===currentAgent(state));
 // TT_QUEUE_SAVE_FEEDBACK_V1: report queue-save outcomes beside the action, not below CSV import.
 const podVerifyStatus=(state,msg,tone='info')=>{
   const node=$(state,'[data-store-plan-verify-status]');
   if(node){node.textContent=String(msg||'');node.dataset.status=tone;}
 };
 const showStatus=(state,msg,tone='info')=>{
   const node=$(state,'[data-store-plan-status]');
   if(!node)return;
   node.textContent=String(msg??'');
   node.dataset.ttQueueStatus=tone;
 };
 const dispatchNote=(state,msg)=>txt(state,'[data-dispatch-status]',msg);
 const storeLabel=entry=>entry?.podLabel||entry?.pod||'POD';
 function podOptions(pods){
   const counts=new Map(),positions=new Map();
   for(const p of pods){const key=norm(storeLabel(p));counts.set(key,(counts.get(key)||0)+1);}
   return pods.map(p=>{
     const key=norm(storeLabel(p)),number=(positions.get(key)||0)+1;positions.set(key,number);
     const duplicate=(counts.get(key)||0)>1;
     const lead=String(p.teamLeader||'').trim();
     return {value:p.pod,text:`${storeLabel(p)}${lead?` · TL ${lead}`:''}${duplicate?` · Team ${number}`:''} · ${Number(p.agentsCount)||0} agents`};
   });
 }
 function refreshPodStorePerformance(state){
   const pod=validPod(state);
   const host=document.getElementById('ttPodStorePerformanceHost');
   if(!host||!state.viewer?.name||!pod||!sameViewer(liveViewer(),state.viewer)){
     if(host)host.hidden=true;
     return;
   }
   host.hidden=false;
   // Store reports are OBSERVED job facts, not the TL's published instruction.
   // The server independently verifies both identity and POD authorization.
   document.dispatchEvent(new CustomEvent('trinotime:store-context',{detail:{
     workflow:'podwork',date:currentDate(state),viewer:{...state.viewer},
     scope:state.viewer.role==='admin'?'all-pods':'own-pod',
     pod:state.viewer.role==='admin'?pod.pod:''
   }}));
 }

 async function authorizedHeaders(role,method,mode='security'){
   const headers={Accept:'application/json'};
   if(method==='PUT')headers['Content-Type']='application/json';
   if(role!=='admin'&&mode!=='firebase'){
     const token=String(window.TrinoTimeMessagingSessionContext?.getSecuritySessionToken?.()||'');
     if(token)headers['X-TT-Security-Session']=token;
   }
   if(!headers['X-TT-Security-Session']){
     const user=window.firebase?.auth?.().currentUser;
     if(user&&!user.isAnonymous&&typeof user.getIdToken==='function')headers.Authorization='Bearer '+await user.getIdToken(false);
   }
   if(!headers['X-TT-Security-Session']&&!headers.Authorization)throw Error('Please sign in with an active Admin or Team Leader account.');
   return headers;
 }
 async function request(state,route,method='GET',payload,signal){
   ensureCurrentSession(state);
   const res=await fetch('/api/workforce/store-plans/'+route,{method,cache:'no-store',signal,
     headers:await authorizedHeaders(state.viewer.role,method,state.authMode),body:payload?JSON.stringify(payload):undefined});
   const data=await res.json().catch(()=>({}));
   ensureCurrentSession(state);
   if(!res.ok||!data.ok){
     const error=new Error(data.message||data.error?.message||data.error?.code||(typeof data.error==='string'?data.error:'')||`Store service HTTP ${res.status}`);
     error.status=res.status;throw error;
   }
   if(data.authority!=='workforce-store-plans-v1')throw Error('Unexpected store service response.');
   return data;
 }
 function setCurrent(state,data){
   const active=data.active===true,workflow=String(data.workflow||'standby');
   const label=workflow==='coverage'?'Coverage':workflow==='confirmation'?'Confirmation':'Standby';
   txt(state,'[data-current-workflow]',active?label: data.expired?'Expired':'No active instruction');
   txt(state,'[data-current-store]',active?(data.store||'No store'):'No current store');
   txt(state,'[data-current-details]',active?`Published by ${data.updatedBy||'supervisor'} · Updates reach Tracker when connected.`:
     data.expired?'The previous instruction has expired. Publish a new one.':'Choose a workflow and store to get started.');
   $(state,'[data-dispatch-current]').dataset.state=active?'active':'inactive';
 }
 function resetCurrent(state,msg){
   state.dispatchRevision=null;
   $(state,'[data-dispatch-publish]').disabled=true;
   $(state,'[data-dispatch-workflow]').value='coverage';
   $(state,'[data-dispatch-store]').value='';
   $(state,'[data-dispatch-store]').disabled=false;
   txt(state,'[data-current-workflow]','Select a POD');
   txt(state,'[data-current-store]','—');
   txt(state,'[data-current-details]','Each POD has its own current instruction.');
   dispatchNote(state,msg||'Choose a POD to see the current instruction.');
 }
 async function loadDispatch(state){
   ensureCurrentSession(state);
   const target=validPod(state);
   if(!target){resetCurrent(state);return;}
   const pod=target.pod,seq=++state.dispatchSequence;
   resetCurrent(state,'Loading the current POD instruction…');
   try{
     const data=await request(state,'dispatch?pod='+encodeURIComponent(pod));
     if(seq!==state.dispatchSequence||pod!==currentPod(state))return;
     if(data.pod!==pod||!Number.isSafeInteger(data.revision)||data.revision<0)
       throw Error('Server returned a different POD instruction. Nothing can be published.');
     state.dispatchRevision=data.revision;
     $(state,'[data-dispatch-publish]').disabled=false;
   $(state,'[data-dispatch-workflow]').value=data.workflow||'coverage';
   $(state,'[data-dispatch-store]').value=data.store||'';
   $(state,'[data-dispatch-store]').disabled=data.workflow==='standby';
   setCurrent(state,data);
     dispatchNote(state,data.active?'Ready to change the instruction.':'Ready to publish the first instruction.');
   }catch(error){
     if(seq===state.dispatchSequence&&pod===currentPod(state))resetCurrent(state,'Could not load your POD instruction: '+error.message);
     throw error;
   }
 }
 async function refreshTargets(state){
   ensureCurrentSession(state);
   const date=currentDate(state),seq=++state.rosterSequence;
   const previouslySelectedPod=currentPod(state);
   const previouslySelectedAgent=currentAgent(state);
   // A new Refresh supersedes any older, possibly hanging authorized roster GET.
   state.rosterAbort?.abort();
   // Never render the previous account's store while a new roster is loading.
   state.dispatchSequence++;
   state.pods=[];state.agents=[];
   // A fresh verified roster, not a presentation label, owns the Admin report identity.
   delete state.panel.dataset.ttVerifiedAdminName;
   const podSelect=$(state,'[data-store-plan-pod]'),agentSelect=$(state,'[data-store-plan-agent]');
   podSelect.replaceChildren(new Option('Verifying authorized POD…',''));
   podVerifyStatus(state,'Verifying authorized PODs…','pending');
   agentSelect.replaceChildren(new Option('Verifying Agents…',''));
   resetCurrent(state,'Verifying the signed-in TL and POD…');
   clearQueue(state);
   refreshPodStorePerformance(state);
   let agents,pods;
   const fetchRoster=async()=>{
     const controller=new AbortController();state.rosterAbort=controller;
     let timer;
     const deadline=new Promise((_,reject)=>{
       timer=setTimeout(()=>{controller.abort();reject(Error('POD verification timed out. Check the staging connection, then click Refresh.'));},15000);
     });
     try{
       // Race the entire request, including session token acquisition. An abort
       // alone cannot time out a stalled Firebase getIdToken() promise.
       const directory=await Promise.race([
         request(state,'directory?date='+encodeURIComponent(date),'GET',undefined,controller.signal),deadline]);
       return [directory,directory];
     }catch(error){
       if(controller.signal.aborted)throw Error('POD verification timed out. Check the staging connection, then click Refresh.');
       throw error;
     }finally{
       clearTimeout(timer);
       if(state.rosterAbort===controller)state.rosterAbort=null;
     }
   };
   try{[agents,pods]=await fetchRoster();}
   catch(error){
     if(![401,403].includes(error.status)||state.viewer.role!=='team_leader'||state.authMode==='firebase')throw error;
     // Recover only when a currently authenticated Firebase identity can be server-verified.
     // A stale security-session token can belong to the previous TL after account switching.
     const user=window.firebase?.auth?.().currentUser;
     if(!user||user.isAnonymous||typeof user.getIdToken!=='function')throw error;
     state.authMode='firebase';
     [agents,pods]=await fetchRoster();
   }
   if(seq!==state.rosterSequence||date!==currentDate(state))return;
   ensureCurrentSession(state);
   if((!sameViewer(state.viewer,agents.viewer)||!sameViewer(state.viewer,pods.viewer))&&state.authMode==='security'&&state.viewer.role==='team_leader'){
     // An old TL token may still be valid even when the browser shell now shows
     // the new TL. The Firebase retry is read-only and MUST return the new TL.
     const user=window.firebase?.auth?.().currentUser;
     if(user&&!user.isAnonymous&&typeof user.getIdToken==='function'){
       state.authMode='firebase';
       [agents,pods]=await fetchRoster();
       if(seq!==state.rosterSequence||date!==currentDate(state))return;
       ensureCurrentSession(state);
     }
   }
   if(!sameViewer(state.viewer,agents.viewer)||!sameViewer(state.viewer,pods.viewer))
     throw Error('Server identity/POD does not match the signed-in TL. Reauthenticate before publishing.');
   if(agents.viewer?.role!==pods.viewer?.role||norm(agents.viewer?.name)!==norm(pods.viewer?.name)||norm(agents.viewer?.pod)!==norm(pods.viewer?.pod))
     throw Error('Server identity mismatch. Sign in again.');
   // The Admin identity is the server-authenticated Firebase uid. A valid
   // legacy Admin may have no stored display name: the Worker supplies a
   // canonical label, but never treat that label as an auth credential.
   if(state.viewer.role==='admin'){
     const uid=String(window.firebase?.auth?.().currentUser?.uid||'').trim();
     const serverUid=String(agents.viewer?.uid||'').trim();
     if(!uid||!serverUid||serverUid!==uid||String(pods.viewer?.uid||'').trim()!==uid)
       throw Error('Verified Admin account does not match this session. Sign in again.');
     if(!norm(agents.viewer?.name))
       throw Error('Verified Admin name is missing from the authorized response. Refresh or sign in again.');
   }
   for(const data of [agents,pods]){
     if(data.viewer?.role!==state.viewer.role||
       // Admin display labels in the browser can differ from the verified
       // workforce identity name. The SERVER authenticates every request and
       // independently scopes the POD list, so do not reject its trusted admin
       // roster solely because the UI profile displays a different name.
       // TLs still need exact name and POD matching, fail-closed.
       (state.viewer.role!=='admin'&&norm(data.viewer?.name)!==norm(state.viewer.name)))
       throw Error('Your workforce identity has changed. Sign in again.');
   }
   // Both roster endpoints use requireWorkforceAttendanceActor, the same verified
   // identity source as Store Intelligence. The shell may only display 'Admin'.
   // Never relax Store Intelligence's viewer-name check or client POD isolation.
   if(state.viewer.role==='admin'){
     state.viewer.name=String(agents.viewer.name).trim();
     state.panel.dataset.ttVerifiedAdminName=state.viewer.name;
   }
   state.agents=agents.agents||[];state.pods=pods.pods||[];
   const p=$(state,'[data-store-plan-pod]'),a=$(state,'[data-store-plan-agent]');
   const priorPod=previouslySelectedPod,priorAgent=previouslySelectedAgent;
   p.replaceChildren(new Option('Choose your POD / Team',''));
   for(const item of podOptions(state.pods))p.add(new Option(item.text,item.value));
   if(state.viewer.role==='team_leader'){
     const own=state.pods.find(v=>norm(v.pod)===norm(state.viewer.pod));
     if(!own||state.pods.length!==1)throw Error('TL POD authorization differs from this account. Sign in again.');
     p.value=own.pod;
   }else if(state.pods.length===1)p.value=state.pods[0].pod;
   else {
     // Maintain one authenticated selection across Work Control and Export.
     // Never trust a label or an unverified POD: match the exact returned ID.
     const exportPod=state.panel.closest('#ttPodDispatchRoot')?.querySelector('[data-tt-store-export-admin-pod]')?.value||'';
     const preferred=[priorPod,exportPod].find(id=>state.pods.some(v=>v.pod===id));
     if(preferred)p.value=preferred;
   }
   a.replaceChildren(new Option('Choose an Agent',''));
   for(const item of state.agents)a.add(new Option(`${item.podLabel||item.pod} · ${item.name}`,item.name));
   if(state.agents.some(v=>v.name===priorAgent))a.value=priorAgent;
   const changed=p.value!==priorPod;
   if(changed)resetCurrent(state,'Loading the selected POD instruction…');
   resetCoverageSequence(state);state.coverageReviewTicket++;
   clearQueue(state);
   showStatus(state,`${state.pods.length} authorized PODs · ${state.agents.length} authorized agents.`);
   podVerifyStatus(state,`${state.pods.length} verified PODs · ${state.agents.length} agents`, 'success');
   if(p.value){await loadDispatch(state);try{await loadCoverageSequence(state);}catch(e){txt(state,'[data-coverage-sequence-status]','Coverage authorization unavailable: '+e.message);}}
   if(!p.value)resetCurrent(state,'Select the POD you want to manage.');
   refreshPodStorePerformance(state);
   document.dispatchEvent(new CustomEvent('trinotime:store-pods-verified',{detail:{role:state.viewer.role}}));
 }
 function clearQueue(state){
   state.planRevision=null;state.loadedAssigned=false;
   $(state,'[data-queue-rows]').replaceChildren();
 }
 function makeRow(entry={}){
   const row=document.createElement('div');row.className='tt-sp-store-row';row.dataset.queueRow='';
   row.innerHTML=`<div class="tt-sp-row-header"><strong data-row-index></strong><div class="tt-sp-row-buttons"><button type="button" data-row-up aria-label="Move store up" title="Move up">↑</button><button type="button" data-row-down aria-label="Move store down" title="Move down">↓</button><button type="button" data-row-remove aria-label="Remove store" title="Remove store">Remove</button></div></div>
   <div class="tt-sp-row-fields"><label>Store name<input data-row-store maxlength="160" placeholder="Chemist Warehouse - Cobram"></label><label>Planned jobs<input data-row-jobs type="number" min="1" max="9999" step="1" inputmode="numeric" placeholder="5"></label><label>Job IDs (optional)<input data-row-ids placeholder="JOB_101 | JOB_102"></label></div>`;
   row.querySelector('[data-row-store]').value=entry.store||'';
   row.querySelector('[data-row-jobs]').value=entry.plannedJobs||'';
   row.querySelector('[data-row-ids]').value=(entry.jobIds||[]).join(' | ');
   return row;
 }
 function renumber(state){
   const rows=[...$(state,'[data-queue-rows]').children];
   rows.forEach((row,i)=>{
     row.querySelector('[data-row-index]').textContent=`Store ${i+1}`;
     row.querySelector('[data-row-up]').disabled=i===0;
     row.querySelector('[data-row-down]').disabled=i===rows.length-1;
   });
   txt(state,'[data-queue-count]',rows.length?`${rows.length} store${rows.length===1?'':'s'} in this queue`:'No stores added yet');
 }
 function renderRows(state,entries){
   $(state,'[data-queue-rows]').replaceChildren(...entries.map(makeRow));renumber(state);
 }
 function formEntries(state){
   const rows=[...$(state,'[data-queue-rows]').children];
   if(!rows.length)return [];
   const entries=rows.map((r,i)=>({order:i+1,store:r.querySelector('[data-row-store]').value.trim(),
     plannedJobs:Number(r.querySelector('[data-row-jobs]').value),
     jobIds:r.querySelector('[data-row-ids]').value.split(/[|;\s]+/).filter(Boolean)}));
   // Reuse the exact Tracker input validator; errors do not silently change a plan.
   const csv=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
   const text='order,store,plannedJobs,jobIds\n'+entries.map(x=>[x.order,csv(x.store),x.plannedJobs,csv(x.jobIds.join('|'))].join(',')).join('\n');
   return lib.parsePlan(text);
 }
 async function loadQueue(state){
   ensureCurrentSession(state);
   const podMode=planScope(state)==='pod',target=podMode?validPod(state):validAgent(state);
   if(!target)throw Error(podMode?'Choose a POD first.':'Choose an authorized Agent first.');
   const date=currentDate(state),key=(podMode?'pod:'+target.pod:'agent:'+target.name)+'|'+date;
   const route=podMode?'pod?'+new URLSearchParams({date,pod:target.pod}):'agent?'+new URLSearchParams({date,agentName:target.name});
   const data=await request(state,route);
   if(key!==(planScope(state)==='pod'?'pod:'+currentPod(state):'agent:'+currentAgent(state))+'|'+currentDate(state))throw Error('Selection changed. Load the queue again.');
   if((podMode&&data.pod!==target.pod)||(!podMode&&(data.agent?.name!==target.name||data.agent?.pod!==target.pod)))throw Error('Queue target changed. Refresh and retry.');
   state.planRevision=data.revision;state.loadedAssigned=data.assigned===true;
   renderRows(state,data.entries||[]);
   showStatus(state,`${podMode?storeLabel(target):target.name} · ${data.assigned?'Queue loaded':'No saved queue'} · Revision ${data.revision}.`);
 }
 async function saveQueue(state){
   ensureCurrentSession(state);
   if(state.queueSaving)return;
   showStatus(state,'Checking the current queue before saving…','pending');
   if(state.planRevision===null)throw Error('Click Load queue first, then edit and save. Your changes are still in the editor.');
   const podMode=planScope(state)==='pod',target=podMode?validPod(state):validAgent(state);
   if(!target)throw Error('Choose an authorized POD or Agent before saving.');
   const entries=formEntries(state);
   if(!entries.length&&!state.loadedAssigned)throw Error('Add at least one store. There is no existing queue to clear.');
   if(!entries.length&&!confirm('Clear this existing queue? Previous assignments remain in its audit history.')){
     showStatus(state,'Save canceled. Your changes are still in the editor.','info');return;
   }
   const label=podMode?`the entire ${storeLabel(target)} POD`:`${target.name}'s individual fallback`;
   if(!confirm(`Save ${entries.length} stores for ${label}? This does not change job counts or productivity.`)){
     showStatus(state,'Save canceled. Your changes are still in the editor.','info');return;
   }
   const button=$(state,'[data-store-plan-save]');
   const originalLabel=button.textContent;
   const date=currentDate(state),pod=podMode?target.pod:'',agentName=podMode?'':target.name;
   const editGeneration=state.queueEditGeneration||0;
   state.queueSaving=true;
   button.disabled=true;button.textContent='Saving…';
   showStatus(state,`Saving ${entries.length} stores… waiting for TrinoTime confirmation.`,'pending');
   try{
     const data=await request(state,(podMode?'pod':'agent')+'?date='+encodeURIComponent(date),'PUT',{
       ...(podMode?{pod}:{agentName}),expectedRevision:state.planRevision,entries
     });
     // The Worker returned ok + the expected store-plan authority; do not assign this
     // acknowledgement to a different account, POD, agent, date or queue scope.
     ensureCurrentSession(state);
     const stillSame=date===currentDate(state)&&planScope(state)===(podMode?'pod':'agent')&&
       (podMode?pod===currentPod(state):agentName===currentAgent(state));
     if(!stillSame){
       showStatus(state,'Server responded, but your selection changed. Reload the queue to verify before editing further.','warning');
       return;
     }
     if(data.revision===undefined||data.revision===null)throw Error('Server did not confirm a new queue revision. Reload to verify before retrying.');
     state.planRevision=data.revision;state.loadedAssigned=data.assigned===true;
     if((state.queueEditGeneration||0)!==editGeneration){
       showStatus(state,'The server saved the queue, but you made more edits during the request. Those later edits are NOT saved. Click Save again.','warning');return;
     }
     showStatus(state,`Saved successfully: ${entries.length} store${entries.length===1?'':'s'} for ${label}. Server revision ${data.revision}.`,'success');
   }catch(e){
     showStatus(state,`Save not confirmed: ${e.message}. Your edited rows are still here; reload/check the queue before retrying if the network failed.`,'error');
   }finally{
     state.queueSaving=false;
     button.disabled=false;button.textContent=originalLabel;
   }
 }
 function markQueueEdited(state){
   if(state.queueSaving || !state.panel.isConnected)return;
   state.queueEditGeneration=(state.queueEditGeneration||0)+1;
   showStatus(state,state.planRevision===null
     ?'You have unsaved changes. Click Load queue to obtain the current revision, then review your entries before saving.'
     :'Unsaved changes in the queue editor. Click Save store queue to save them.','warning');
 }
 async function publish(state){
   ensureCurrentSession(state);
   const target=validPod(state);if(!target)throw Error('Choose a POD first.');
   if(state.dispatchRevision===null)throw Error('Loading the latest POD instruction failed. Select the POD again before publishing.');
   const workflow=$(state,'[data-dispatch-workflow]').value;
   const store=workflow==='standby'?'':$(state,'[data-dispatch-store]').value.trim();
   if(workflow!=='standby'&&!store)throw Error('Enter the store announced by your TL.');
   if(!confirm(`Publish ${workflow==='standby'?'STANDBY':workflow.toUpperCase()+' — '+store} to ${storeLabel(target)}?\n\nThis changes the instruction, not Augmoto job data.`))return;
   const pod=target.pod,revision=state.dispatchRevision;
   const button=$(state,'[data-dispatch-publish]');button.disabled=true;
   try{
     const data=await request(state,'dispatch','PUT',{pod,workflow,store,expectedRevision:revision});
     if(data.pod!==pod)throw Error('The server returned a different POD. Nothing was shown as published.');
     if(pod!==currentPod(state)){resetCurrent(state,'POD changed during publishing. Reload the current POD instruction.');return;}
     state.dispatchRevision=data.revision;
     setCurrent(state,data);
     dispatchNote(state,data.active?`Published to ${storeLabel(target)}. Agents will see it when Tracker refreshes.`:`${storeLabel(target)} set to Standby.`);
   }catch(e){
     state.dispatchRevision=null;
     dispatchNote(state,`Not published: ${e.message}. Reload the current instruction before trying again.`);
   }finally{button.disabled=state.dispatchRevision===null;}
 }
 // COVERAGE ONLY sequence authorization; independent of existing Coverage/Confirmation dispatch.
 function resetCoverageSequence(state,msg='Select an authorized POD to load Coverage stores.'){
   state.coverageSequenceRevision=null;state.coverageSequenceTicket=(state.coverageSequenceTicket||0)+1;
   const input=$(state,'[data-coverage-sequence-stores]'),publish=$(state,'[data-coverage-sequence-publish]');
   if(input)input.value='';if(publish)publish.disabled=true;
   txt(state,'[data-coverage-sequence-current]','Not loaded');
   txt(state,'[data-coverage-sequence-status]',msg);
   $(state,'[data-coverage-sequence-results]')?.replaceChildren();
   resetCoverageAllStores(state);
 }
 async function loadCoverageSequence(state){
   ensureCurrentSession(state);
   const pod=currentPod(state),target=validPod(state),ticket=++state.coverageSequenceTicket;
   if(!target){resetCoverageSequence(state);return;}
   txt(state,'[data-coverage-sequence-status]','Loading authorized Coverage stores…');
   const data=await request(state,'coverage-sequence?pod='+encodeURIComponent(pod));
   if(ticket!==state.coverageSequenceTicket||pod!==currentPod(state))return;
   if(data.kind!=='coverage-sequence-v1'||data.workflow!=='coverage'||data.pod!==pod||!Number.isSafeInteger(data.revision))throw Error('Coverage authorization scope changed. Reload the POD.');
   state.coverageSequenceRevision=data.revision;
   $(state,'[data-coverage-sequence-stores]').value=(data.stores||[]).join('\n');
   $(state,'[data-coverage-sequence-publish]').disabled=false;
   txt(state,'[data-coverage-sequence-current]',data.active?`${data.stores.length} authorized · ${data.stores.join(' · ')}`:'No active Coverage stores');
   txt(state,'[data-coverage-sequence-status]',data.active?'Current Coverage authorization loaded.':'No Coverage stores authorized. You can publish up to 12.');
 }
 async function publishCoverageSequence(state){
   ensureCurrentSession(state);
   const target=validPod(state),pod=currentPod(state),revision=state.coverageSequenceRevision;
   if(!target||revision===null)throw Error('Load your Coverage authorization before publishing.');
   const stores=$(state,'[data-coverage-sequence-stores]').value.split(/\r?\n/).map(v=>v.trim()).filter(Boolean);
   if(stores.length>12)throw Error('Maximum 12 authorized Coverage stores.');
   if(new Set(stores.map(v=>v.toLocaleLowerCase())).size!==stores.length)throw Error('Remove duplicate Coverage stores.');
   if(!confirm(stores.length?`Authorize ${stores.length} Coverage store(s) for ${storeLabel(target)}?\n\nThis does not affect Confirmation or Tracker counters.`:`Pause Coverage store authorization for ${storeLabel(target)}?\n\nConfirmation is unchanged.`))return;
   const button=$(state,'[data-coverage-sequence-publish]');button.disabled=true;
   try{
     const data=await request(state,'coverage-sequence','PUT',{pod,workflow:'coverage',stores,expectedRevision:revision});
     if(data.kind!=='coverage-sequence-v1'||data.pod!==pod||currentPod(state)!==pod)throw Error('POD changed while publishing; refresh and review.');
     state.coverageSequenceRevision=data.revision;
     txt(state,'[data-coverage-sequence-current]',data.active?`${data.stores.length} authorized · ${data.stores.join(' · ')}`:'No active Coverage stores');
     txt(state,'[data-coverage-sequence-status]',data.active?'Coverage stores published. Sequence review is read-only.':'Coverage authorization paused.');
     $(state,'[data-coverage-sequence-results]').replaceChildren();
     resetCoverageAllStores(state,'Authorization changed. Reload the Coverage dashboard to compare current stores.');
   }catch(e){state.coverageSequenceRevision=null;txt(state,'[data-coverage-sequence-status]','Not published: '+e.message+'. Reload Coverage authorization.');}
   finally{button.disabled=state.coverageSequenceRevision===null;}
 }
 async function reviewCoverageSequence(state){
   ensureCurrentSession(state);
   const target=validPod(state),pod=currentPod(state),date=currentDate(state),ticket=++state.coverageReviewTicket;
   if(!target)throw Error('Choose an authorized POD first.');
   const host=$(state,'[data-coverage-sequence-results]');host.replaceChildren();
   txt(state,'[data-coverage-sequence-status]','Reviewing submitted Coverage tasks only…');
   const data=await request(state,'coverage-sequence/review?pod='+encodeURIComponent(pod)+'&date='+encodeURIComponent(date));
   if(ticket!==state.coverageReviewTicket||pod!==currentPod(state)||date!==currentDate(state))return;
   if(data.kind!=='coverage-sequence-review-v1'||data.workflow!=='coverage'||data.pod!==pod||data.date!==date)throw Error('Sequence review scope changed. Reload it.');
   const count=data.summary||{},line=document.createElement('p');
   line.textContent=`In sequence: ${count['in-sequence']||0} · Transition allowed: ${count['authorized-transition']||0} · Review: ${count['review-needed']||0} · Mapping needed: ${count['mapping-required']||0} · Uncertain: ${(count['mapping-conflict']||0)+(count['insufficient-evidence']||0)}`;
   host.append(line);
   if(data.truncated){const hint=document.createElement('p');hint.textContent='Partial report: not enough evidence for a complete rate.';host.append(hint);}
   for(const item of (data.rows||[]).filter(r=>r.status!=='in-sequence').slice(0,40)){
     const row=document.createElement('div');row.className='tt-cov-seq-review-row';
     const title=document.createElement('strong');title.textContent=`${item.status.replaceAll('-',' ')} · ${item.agent} · ${item.jobId}`;
     const reason=document.createElement('small');reason.textContent=`${item.store} · ${item.reason}`;
     row.append(title,reason);host.append(row);
   }
   txt(state,'[data-coverage-sequence-status]','Coverage-only review loaded. No data or grades changed.');
 }
 // COVERAGE ONLY All Stores dashboard: reporting, not a live Augmoto backlog.
 function resetCoverageAllStores(state,message='Choose a POD, then load observed Coverage stores.'){
   state.coverageAllStoresTicket=(state.coverageAllStoresTicket||0)+1;
   const host=$(state,'[data-coverage-all-stores-content]');if(host)host.replaceChildren();
   txt(state,'[data-coverage-all-stores-status]',message);
 }
 function duration(ms){
   const seconds=Math.max(0,Math.floor((Number(ms)||0)/1000));
   if(seconds>=3600)return `${Math.floor(seconds/3600)}h ${Math.floor(seconds%3600/60)}m`;
   if(seconds>=60)return `${Math.floor(seconds/60)}m ${seconds%60}s`;
   return `${seconds}s`;
 }
 function node(tag,className,textValue){
   const element=document.createElement(tag);if(className)element.className=className;
   if(textValue!==undefined)element.textContent=String(textValue);return element;
 }
 function renderCoverageAllStores(state,data){
   const host=$(state,'[data-coverage-all-stores-content]');host.replaceChildren();
   const stats=node('div','tt-all-store-stats');
   for(const [title,value] of [
     ['Authorized now',data.overview.authorizedStores],['Stores observed',data.overview.observedStores],
     ['Unmapped jobs',data.overview.unmappedJobs],['Tasks for review',data.overview.reviewTasks]]){
     const card=node('div','tt-all-store-stat');card.append(node('small','',title),node('strong','',value));stats.append(card);
   }
   host.append(stats);
   const message=node('p','tt-sp-helper','Observed Coverage activity for the selected date—not all available Augmoto jobs. Authorization shown is current.');host.append(message);
   if(data.overview.partialReview)host.append(node('p','tt-all-store-warning','Partial task review: some job evidence was truncated. Do not use these totals as a complete off-sequence rate.'));
   const controls=node('div','tt-all-store-controls');
   const title=node('strong','','Store activity');
   const filter=document.createElement('select');filter.setAttribute('aria-label','Filter observed Coverage stores');
   for(const [value,label] of [['all','All stores'],['authorized','Authorized now'],['observed','Observed'],['review','Needs review']]){
     const option=document.createElement('option');option.value=value;option.textContent=label;filter.append(option);
   }
   controls.append(title,filter);host.append(controls);
   const rows=node('div','tt-all-store-list');host.append(rows);
   const renderList=()=>{
     rows.replaceChildren();const filtered=(data.stores||[]).filter(s=>filter.value==='all'||
       filter.value==='authorized'&&s.authorizedNow||filter.value==='observed'&&s.observed||filter.value==='review'&&s.reviewTasks>0);
     if(!filtered.length){rows.append(node('p','tt-sp-helper','No matching observed or authorized Coverage stores.'));return;}
     for(const store of filtered){
       const item=node('div','tt-all-store-item'),head=node('div','tt-all-store-item-head');
       const name=node('strong','',store.name),pill=node('span','tt-all-store-pill',store.authorizedNow?'Authorized now':store.observed?'Observed only':'No observed activity');
       head.append(name,pill);item.append(head);
       const detail=node('p','',`${store.jobs} jobs · ${store.submitted} submitted · ${store.agents} agents · ${duration(store.activeMs)} measured active`);
       item.append(detail);
       if(store.reviewTasks) item.append(node('p','tt-all-store-warning',`${store.reviewTasks} submitted task(s) need supervisor review based on historical authorization.`));
       if(!store.observed)item.append(node('small','','No observed Coverage activity for the selected date. This does not mean no jobs are available.'));
       rows.append(item);
     }
   };
   filter.addEventListener('change',renderList);renderList();
   if(data.incomplete?.length){
     const section=node('details','tt-all-store-unmapped'),summary=node('summary','',`Unidentified or conflicting jobs (${data.overview.unmappedJobs||0} unknown · ${data.overview.mappingConflicts||0} conflicting)`);
     section.append(summary);
     for(const entry of data.incomplete){section.append(node('p','',`${entry.label}: ${entry.jobs} jobs · ${entry.submitted} submissions`));}
     host.append(section);
   }
   const review=data.sequence;
   if(review?.rows?.length){
     const more=node('details','tt-all-store-unmapped');more.append(node('summary','','Task-level review details'));
     for(const item of review.rows){
       more.append(node('p','',`${item.agent} · ${item.jobId} · ${item.store} — ${item.reason}`));
     }host.append(more);
   }
 }
 async function loadCoverageAllStores(state){
   ensureCurrentSession(state);
   const pod=currentPod(state),date=$(state,'[data-coverage-all-stores-date]').value;
   const ticket=++state.coverageAllStoresTicket;
   if(!validPod(state))throw Error('Choose an authorized POD first.');
   if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('Choose a valid report date.');
   txt(state,'[data-coverage-all-stores-status]','Loading Coverage observations…');
   const data=await request(state,'coverage-sequence/all-stores?pod='+encodeURIComponent(pod)+'&date='+encodeURIComponent(date));
   if(ticket!==state.coverageAllStoresTicket||pod!==currentPod(state)||date!==$(state,'[data-coverage-all-stores-date]').value)return;
   if(data.kind!=='coverage-all-stores-v1'||data.workflow!=='coverage'||data.pod!==pod||data.date!==date)
     throw Error('Coverage report changed scope. Refresh your workspace.');
   renderCoverageAllStores(state,data);
   txt(state,'[data-coverage-all-stores-status]','Coverage observed activity loaded · '+date+'. Read-only.');
 }
 function onScopeChange(state){
   const agent=planScope(state)==='agent';
   $(state,'[data-store-plan-agent-label]').hidden=!agent;
   $(state,'[data-queue-target]').textContent=agent?'Individual Agent fallback queue':'POD-wide store queue';
   clearQueue(state);
   showStatus(state,agent?'Select an Agent and load their fallback queue.':'Load a POD queue to edit upcoming stores.');
 }
 function mount(root,context){
   if(!lib||!root||!['admin','team_leader'].includes(context.viewer.role))return;
   const store=root.querySelector('[data-tt-store-panel]');if(!store)return;
   const existing=states.get(store);
   if(existing){
     if(sameViewer(existing.viewer,context.viewer)&&sameAccount(existing)&&!existing.disposed){pageState=existing;return;}
     retirePanel(root);
   }
   store.textContent='';
   const panel=document.createElement('section');panel.className='tt-sp-panel';
   panel.innerHTML=`<div class="tt-sp-heading"><strong>Tell your POD what to work on</strong><span>Live store &amp; workflow instructions</span></div>
   <div class="tt-sp-content">
     <div class="tt-sp-intro"><strong>Tell your POD what to work on.</strong><span>Announce it in Discord as usual, then publish here for connected Tracker users.</span></div>
     <div class="tt-sp-pod-target"><label>POD / Team<select data-store-plan-pod><option value="">Loading authorized PODs…</option></select></label><button type="button" class="tt-sp-quiet-button" data-store-plan-roster title="Refresh authorized PODs">↻ Refresh</button></div>
     <p class="tt-sp-verify-status" data-store-plan-verify-status role="status" aria-live="polite">Verifying authorized PODs…</p>
     <section class="tt-sp-current" data-dispatch-current data-state="inactive" aria-label="Current POD assignment">
       <div class="tt-sp-current-label"><span class="tt-sp-pulse"></span> CURRENT POD INSTRUCTION <span class="tt-sp-readonly">Read-only status</span></div>
       <strong data-current-workflow>Select a POD</strong><div class="tt-sp-current-store" data-current-store>—</div>
       <div class="tt-sp-current-detail" data-current-details>Each POD has its own assignment.</div>
     </section>
     <section class="tt-sp-publish-section" data-dispatch-section aria-label="Publish a POD instruction">
       <h4>Change POD instruction</h4>
       <div class="tt-sp-publish-fields">
         <label>Workflow<select data-dispatch-workflow><option value="coverage">Coverage</option><option value="confirmation">Confirmation</option><option value="standby">Standby / Pause</option></select></label>
         <label>Store<input data-dispatch-store maxlength="160" autocomplete="off" placeholder="e.g. Chemist Warehouse - Cobram"></label>
         <button type="button" class="tt-sp-primary" data-dispatch-publish disabled>Publish to POD <span aria-hidden="true">→</span></button>
       </div><p class="tt-sp-helper">An instruction only. Agents still choose the store in Augmoto; Tracker measures actual work separately.</p>
       <p data-dispatch-status role="status" aria-live="polite">Choose a POD to begin.</p>
     </section>
     <section class="tt-sp-coverage-sequence" aria-label="Coverage Store Sequence Monitor" data-coverage-sequence>
       <div class="tt-sp-heading"><strong>Coverage · Flexible Store Sequence</strong><span>Multiple stores · TL/Admin only · Confirmation excluded</span></div>
       <p class="tt-sp-helper">One verified Augmoto store per line. Up to 12 Coverage stores may be active together. Queue entries are not authorization.</p>
       <div class="tt-sp-coverage-sequence-current"><strong data-coverage-sequence-current>Not loaded</strong></div>
       <label>Authorized Coverage stores<textarea data-coverage-sequence-stores rows="3" maxlength="1800" placeholder="Chemist Warehouse - Rooty Hill&#10;Chemist Warehouse - Charlestown"></textarea></label>
       <div class="tt-sp-queue-actions"><button type="button" data-coverage-sequence-load>Refresh Coverage</button><button type="button" class="tt-sp-primary" data-coverage-sequence-publish disabled>Publish Coverage stores</button><button type="button" data-coverage-sequence-review>Review activity</button></div>
       <p data-coverage-sequence-status role="status" aria-live="polite">Choose a POD to load Coverage authorization.</p>
       <div data-coverage-sequence-results aria-live="polite"></div>
       <p class="tt-sp-helper">Review uses verified Coverage task timestamps and mappings. Unknown or conflicting stores are never violations. Ten-minute transition allowance. Informational only; no grading or penalties.</p>
     </section>
     <section class="tt-sp-all-stores" aria-label="Coverage All Stores Dashboard" data-coverage-all-stores>
       <div class="tt-sp-all-stores-heading"><div><strong>Coverage · All Stores</strong><p>Authorized and observed stores · read-only</p></div><span class="tt-all-store-tag">Coverage only</span></div>
       <div class="tt-sp-all-stores-actions"><label>Date<input data-coverage-all-stores-date type="date"></label><button type="button" data-coverage-all-stores-refresh>Load dashboard</button></div>
       <p role="status" aria-live="polite" data-coverage-all-stores-status>Select a POD to load observed Coverage activity.</p>
       <div data-coverage-all-stores-content></div>
     </section>
     <details class="tt-sp-advanced"><summary>Manage upcoming store queue <small>Optional · individual fallback &amp; future stores</small></summary>
       <div class="tt-sp-advanced-body">
         <p>Optional: prepare a list of future stores. This does not automatically switch the live POD instruction.</p>
         <div class="tt-sp-controls">
           <label>Date<input data-store-plan-date type="date"></label>
           <label>Assignment type<select data-store-plan-scope><option value="pod">Entire POD / Team</option><option value="agent">Individual Agent (fallback)</option></select></label>
           <label data-store-plan-agent-label hidden>Agent<select data-store-plan-agent><option value="">Choose an Agent</option></select></label>
           <button type="button" data-store-plan-load>Load queue</button>
         </div>
         <h4 data-queue-target>POD-wide store queue</h4>
         <p class="tt-sp-helper" data-queue-count>No stores added yet</p>
         <div data-queue-rows class="tt-sp-queue-rows"></div>
         <div class="tt-sp-queue-actions"><button type="button" data-add-store>+ Add store</button><button type="button" class="tt-sp-primary" data-store-plan-save>Save store queue</button></div>
         <p data-store-plan-status role="status" aria-live="polite" data-tt-queue-status="info">Click Load queue before saving. Your changes will remain in the editor until TrinoTime confirms the save.</p>
         <details class="tt-sp-import"><summary>Import from CSV (optional)</summary><label>CSV text<textarea data-store-plan-csv rows="4" spellcheck="false" placeholder="order,store,plannedJobs,jobIds"></textarea></label><button type="button" data-import-csv>Preview imported stores</button></details>
       </div>
     </details>
   </div>`;
   $( {panel},'[data-store-plan-date]').value=context.date;
   $( {panel},'[data-coverage-all-stores-date]').value=context.date;
   store.append(panel);
   const state={panel,viewer:{...context.viewer},accountIdentity:currentAccountIdentity(),authMode:'security',disposed:false,planRevision:null,dispatchRevision:null,coverageSequenceRevision:null,coverageSequenceTicket:0,coverageReviewTicket:0,coverageAllStoresTicket:0,loadedAssigned:false,
     agents:[],pods:[],rosterSequence:0,rosterAbort:null,dispatchSequence:0};
   states.set(store,state);pageState=state;
   const attempt=(fn,status)=>fn().catch(e=>status(state,e.message));
   $(state,'[data-store-plan-roster]').addEventListener('click',()=>attemptRefresh(state));
   $(state,'[data-store-plan-pod]').addEventListener('change',()=>{state.dispatchSequence++;resetCurrent(state,'Loading the selected POD instruction…');resetCoverageSequence(state);state.coverageReviewTicket++;resetCoverageAllStores(state);clearQueue(state);attempt(()=>loadDispatch(state),dispatchNote);attempt(()=>loadCoverageSequence(state),(_s,m)=>txt(state,'[data-coverage-sequence-status]',m));refreshPodStorePerformance(state);});
   $(state,'[data-dispatch-publish]').addEventListener('click',()=>attempt(()=>publish(state),dispatchNote));
   $(state,'[data-coverage-sequence-load]').addEventListener('click',()=>attempt(()=>loadCoverageSequence(state),(_s,m)=>txt(state,'[data-coverage-sequence-status]','Could not refresh: '+m)));
   $(state,'[data-coverage-sequence-publish]').addEventListener('click',()=>attempt(()=>publishCoverageSequence(state),(_s,m)=>txt(state,'[data-coverage-sequence-status]','Not published: '+m)));
   $(state,'[data-coverage-sequence-review]').addEventListener('click',()=>attempt(()=>reviewCoverageSequence(state),(_s,m)=>txt(state,'[data-coverage-sequence-status]','Review unavailable: '+m)));
   $(state,'[data-coverage-all-stores-refresh]').addEventListener('click',()=>attempt(()=>loadCoverageAllStores(state),(_s,m)=>txt(state,'[data-coverage-all-stores-status]','Dashboard unavailable: '+m)));
   $(state,'[data-coverage-all-stores-date]').addEventListener('change',()=>resetCoverageAllStores(state,'Date changed. Load observed Coverage stores.'));
   $(state,'[data-dispatch-workflow]').addEventListener('change',()=>{
     const standby=$(state,'[data-dispatch-workflow]').value==='standby';
     $(state,'[data-dispatch-store]').disabled=standby;
     if(standby)$(state,'[data-dispatch-store]').value='';
   });
   $(state,'[data-store-plan-scope]').addEventListener('change',()=>onScopeChange(state));
   $(state,'[data-store-plan-agent]').addEventListener('change',()=>{clearQueue(state);showStatus(state,'Load this Agent’s fallback queue.');});
   $(state,'[data-store-plan-date]').addEventListener('change',()=>attempt(()=>refreshTargets(state),showStatus));
   $(state,'[data-store-plan-load]').addEventListener('click',()=>attempt(()=>loadQueue(state),showStatus));
   $(state,'[data-store-plan-save]').addEventListener('click',()=>attempt(()=>saveQueue(state),(_state,message)=>showStatus(state,`Not saved: ${message}`,'error')));
   $(state,'[data-add-store]').addEventListener('click',()=>{
     const rows=$(state,'[data-queue-rows]');if(rows.children.length>=80){showStatus(state,'Maximum 80 stores per queue.');return;}
     rows.append(makeRow());renumber(state);markQueueEdited(state);rows.lastElementChild.querySelector('[data-row-store]').focus();
   });
   $(state,'[data-queue-rows]').addEventListener('input',()=>markQueueEdited(state));
   $(state,'[data-queue-rows]').addEventListener('click',e=>{
     const button=e.target.closest('button'),row=button?.closest('[data-queue-row]');if(!row)return;
     const action=button.dataset;
     if('rowRemove'in action)row.remove();
     else if('rowUp'in action&&row.previousElementSibling)row.parentNode.insertBefore(row,row.previousElementSibling);
     else if('rowDown'in action&&row.nextElementSibling)row.parentNode.insertBefore(row.nextElementSibling,row);
     renumber(state);markQueueEdited(state);
   });
   $(state,'[data-import-csv]').addEventListener('click',()=>{
     try{const rows=lib.parsePlan($(state,'[data-store-plan-csv]').value);renderRows(state,rows);
       showStatus(state,`Imported ${rows.length} stores into the editor. Review them, then Save store queue.`);}
     catch(e){showStatus(state,e.message);}
   });
 }
 const style=document.createElement('style');style.textContent=`
 .tt-sp-panel{margin:16px 0;padding:16px;border:1px solid rgba(130,150,165,.3);border-radius:16px;background:var(--tt-panel-bg,transparent)}
 .tt-sp-panel *{box-sizing:border-box}.tt-sp-panel [hidden]{display:none!important}
 .tt-sp-heading{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}.tt-sp-heading strong{font-size:18px}.tt-sp-heading span{font-size:13px;color:var(--muted,#718096)}
 .tt-sp-content{display:grid;gap:16px;margin-top:16px}.tt-sp-intro{display:grid;gap:4px;line-height:1.45}.tt-sp-intro span,.tt-sp-helper{color:var(--muted,#718096);font-size:13px}
 .tt-sp-pod-target{display:flex;align-items:end;gap:10px}.tt-sp-pod-target label{flex:1;min-width:160px}
 .tt-sp-panel label{display:flex;flex-direction:column;gap:6px;font-size:12px;font-weight:650;color:var(--muted,#718096)}
 .tt-sp-panel input,.tt-sp-panel select,.tt-sp-panel textarea{min-width:0;width:100%;border:1px solid rgba(110,128,145,.38);background:var(--surface,#fff);color:var(--text,#1b2331);border-radius:10px;padding:11px 12px;font:inherit;font-size:14px;min-height:43px;outline-offset:2px}
 .tt-sp-panel input:focus,.tt-sp-panel select:focus{outline:2px solid #628bd0;outline-offset:1px}
 .tt-sp-panel button{border:1px solid rgba(110,128,145,.38);background:var(--surface,#fff);color:var(--text,#1b2331);border-radius:10px;padding:10px 15px;min-height:43px;cursor:pointer;font:inherit;font-size:13px;font-weight:650}
 .tt-sp-panel button:hover:not(:disabled){filter:brightness(.95)}.tt-sp-panel button:disabled{opacity:.48;cursor:not-allowed}
 .tt-sp-panel .tt-sp-primary{background:#184d88;color:#fff;border-color:#184d88;white-space:nowrap}.tt-sp-quiet-button{white-space:nowrap}
 .tt-sp-current{padding:17px;border:1px solid rgba(87,125,168,.27);border-radius:14px;background:rgba(105,140,189,.065)}
 .tt-sp-current[data-state="active"]{border-color:rgba(54,145,120,.55);background:rgba(72,152,124,.065)}
 .tt-sp-current-label{font-size:11px;letter-spacing:.045em;font-weight:700;display:flex;gap:8px;align-items:center;color:var(--muted,#718096)}
 .tt-sp-pulse{display:inline-block;height:8px;width:8px;border-radius:100%;background:#9ca3af}.tt-sp-current[data-state="active"] .tt-sp-pulse{background:#14a370}
 .tt-sp-readonly{margin-left:auto;letter-spacing:normal;font-weight:400}.tt-sp-current strong{font-size:14px;display:block;margin-top:10px}
 .tt-sp-current-store{font-size:21px;font-weight:750;line-height:1.3;margin:4px 0}.tt-sp-current-detail{font-size:12px;color:var(--muted,#718096)}
 .tt-sp-publish-section h4,.tt-sp-advanced h4{font-size:15px;margin:0 0 12px}.tt-sp-publish-fields{display:grid;grid-template-columns:minmax(130px,.7fr) minmax(220px,1.7fr) auto;align-items:end;gap:12px}
 .tt-sp-publish-fields .tt-sp-primary{font-size:14px}.tt-sp-publish-section p{margin:9px 0 0;line-height:1.45}
 .tt-sp-publish-section [data-dispatch-status],.tt-sp-advanced [data-store-plan-status]{font-size:13px;white-space:pre-wrap;color:var(--text,#1b2331)}
 .tt-sp-advanced [data-store-plan-status]{display:block!important;margin:8px 0 12px;padding:11px 13px;border-radius:10px;border:1px solid rgba(125,143,163,.32);background:rgba(125,143,163,.08);line-height:1.4;font-weight:650}
 .tt-sp-advanced [data-store-plan-status][data-tt-queue-status=success]{color:#166534;border-color:#86d0a4;background:rgba(43,170,96,.09)}
 .tt-sp-advanced [data-store-plan-status][data-tt-queue-status=error]{color:#a12222;border-color:#f1a5a5;background:rgba(228,74,74,.09)}
 .tt-sp-advanced [data-store-plan-status][data-tt-queue-status=pending]{color:#1c5a96;border-color:#a1c9ea;background:rgba(64,139,215,.08)}
 .tt-sp-advanced [data-store-plan-status][data-tt-queue-status=warning]{color:#895817;border-color:#e9c78d;background:rgba(198,135,41,.1)}
 body.dark-mode .tt-sp-advanced [data-store-plan-status][data-tt-queue-status=success]{color:#86efac}
 body.dark-mode .tt-sp-advanced [data-store-plan-status][data-tt-queue-status=error]{color:#fca5a5}
 body.dark-mode .tt-sp-advanced [data-store-plan-status][data-tt-queue-status=pending]{color:#93c5fd}
 body.dark-mode .tt-sp-advanced [data-store-plan-status][data-tt-queue-status=warning]{color:#fcd34d}
 .tt-sp-coverage-sequence{display:grid;gap:10px;border:1px solid rgba(35,147,133,.3);background:rgba(38,142,132,.045);border-radius:14px;padding:16px}
 .tt-sp-coverage-sequence .tt-sp-heading{display:flex!important}
 .tt-sp-coverage-sequence p{margin:0;font-size:12px;line-height:1.45}
 .tt-sp-coverage-sequence-current{font-size:13px;overflow-wrap:anywhere}
 .tt-cov-seq-review-row{display:grid;gap:3px;padding:8px 0;border-top:1px solid rgba(130,150,165,.25);font-size:12px}
 .tt-cov-seq-review-row small{color:var(--muted,#718096)}

 .tt-sp-all-stores{display:grid;gap:12px;border:1px solid rgba(91,137,161,.26);border-radius:14px;padding:16px;background:rgba(78,128,163,.035)}
 .tt-sp-all-stores-heading,.tt-sp-all-stores-actions,.tt-all-store-controls,.tt-all-store-item-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
 .tt-sp-all-stores-heading strong{font-size:16px}.tt-sp-all-stores-heading p{margin:4px 0 0;color:var(--muted,#718096);font-size:12px}
 .tt-all-store-tag,.tt-all-store-pill{font-size:11px;font-weight:700;border:1px solid rgba(58,149,139,.3);border-radius:20px;padding:4px 9px;background:rgba(56,158,140,.07)}
 .tt-sp-all-stores-actions label{flex:0 1 225px}.tt-sp-all-stores [data-coverage-all-stores-status]{margin:0;font-size:12px;color:var(--muted,#718096)}
 .tt-all-store-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.tt-all-store-stat{padding:12px;border:1px solid rgba(110,128,145,.25);border-radius:12px;background:var(--surface,#fff);display:grid;gap:5px}
 .tt-all-store-stat small{font-size:11px;color:var(--muted,#718096)}.tt-all-store-stat strong{font-size:23px;line-height:1.1;font-variant-numeric:tabular-nums}
 .tt-all-store-controls{margin:5px 0}.tt-all-store-controls select{width:auto;min-width:140px}.tt-all-store-list{display:grid;gap:8px}
 .tt-all-store-item{padding:12px;border:1px solid rgba(110,128,145,.24);border-radius:12px;background:var(--surface,#fff)}
 .tt-all-store-item-head strong{font-size:13px}.tt-all-store-item p{margin:7px 0 0;font-size:12px;color:var(--muted,#718096)}
 .tt-all-store-item small{color:var(--muted,#718096);font-size:11px}.tt-all-store-item .tt-all-store-warning,.tt-all-store-warning{color:#b7791f;font-size:12px}
 .tt-all-store-unmapped{padding:10px 12px;border:1px solid rgba(110,128,145,.26);border-radius:11px;font-size:12px}
 .tt-all-store-unmapped summary{cursor:pointer;font-weight:700}.tt-all-store-unmapped p{margin:10px 0 0;color:var(--muted,#718096)}
 @media(max-width:850px){.tt-all-store-stats{grid-template-columns:repeat(2,minmax(0,1fr))}}
 @media(max-width:550px){.tt-sp-all-stores{padding:12px}.tt-all-store-stats{gap:7px}.tt-all-store-stat{padding:10px}.tt-sp-all-stores-actions label{flex:1 1 100%}.tt-sp-all-stores-actions button{flex:1}}
 .tt-sp-advanced{border:1px solid rgba(130,150,165,.3);border-radius:12px;padding:12px}.tt-sp-advanced>summary,.tt-sp-import>summary{cursor:pointer;font-weight:680;font-size:14px}
 .tt-sp-advanced>summary small{font-weight:400;color:var(--muted,#718096);font-size:12px;margin-left:4px}
 .tt-sp-advanced-body{padding:15px 0 2px;display:grid;gap:12px}.tt-sp-advanced-body>p{margin:0;font-size:13px;line-height:1.5}
 .tt-sp-controls{display:flex;flex-wrap:wrap;gap:12px;align-items:end}.tt-sp-controls label{flex:1 1 165px}.tt-sp-queue-rows{display:grid;gap:10px}
 .tt-sp-store-row{border:1px solid rgba(130,150,165,.3);padding:11px;border-radius:11px}.tt-sp-row-header,.tt-sp-queue-actions{display:flex;justify-content:space-between;align-items:center;gap:9px;flex-wrap:wrap}
 .tt-sp-row-buttons{display:flex;gap:5px}.tt-sp-panel .tt-sp-row-buttons button{min-height:30px;padding:4px 10px;font-size:12px}
 .tt-sp-row-fields{display:grid;grid-template-columns:minmax(170px,1.5fr) minmax(90px,.65fr) minmax(150px,1.1fr);gap:10px;margin-top:10px}
 .tt-sp-import{padding:10px;background:rgba(130,150,165,.06);border-radius:10px}.tt-sp-import label{margin:12px 0 8px}.tt-sp-import textarea{min-height:90px;font-family:ui-monospace,SFMono-Regular,monospace;font-size:12px}
 @media(max-width:850px){.tt-sp-publish-fields{grid-template-columns:1fr 1fr}.tt-sp-publish-fields .tt-sp-primary{grid-column:1/-1}.tt-sp-row-fields{grid-template-columns:1fr 1fr}.tt-sp-row-fields label:first-child{grid-column:1/-1}}
 @media(max-width:550px){.tt-sp-panel{padding:12px}.tt-sp-panel summary small{display:block;margin:1px 0 0}.tt-sp-publish-fields,.tt-sp-row-fields{grid-template-columns:1fr}.tt-sp-publish-fields .tt-sp-primary{grid-column:auto}.tt-sp-row-fields label:first-child{grid-column:auto}.tt-sp-pod-target{flex-wrap:wrap}}
 .tt-pod-dispatch-root{max-width:none}.tt-pod-dispatch-root .tt-ops-shell{max-width:1320px;margin:0 auto}.tt-pod-dispatch-root .tt-sp-panel{margin:0;border:0;background:transparent;padding:0}.tt-pod-dispatch-root .tt-sp-content{gap:22px}
 .tt-pod-dispatch-root .tt-sp-heading{display:none}
 .tt-pod-dispatch-root .tt-pod-dispatch-hero{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 20px;padding:22px 24px;border:1px solid rgba(110,128,145,.25);border-radius:18px;background:rgba(102,145,195,.055)}
 .tt-pod-dispatch-root .tt-pod-dispatch-eyebrow{font-size:11px;font-weight:750;letter-spacing:.07em;color:var(--muted,#718096);text-transform:uppercase}
 .tt-pod-dispatch-root h2{margin:3px 0 5px;font-size:clamp(21px,2.5vw,30px);line-height:1.18;color:var(--text,#1b2331)}
 .tt-pod-dispatch-root .tt-pod-dispatch-hero p{color:var(--muted,#718096);font-size:13px;margin:0}
 .tt-pod-dispatch-root .tt-pod-dispatch-hero button{white-space:nowrap;padding:10px 14px;border:1px solid rgba(110,128,145,.3);border-radius:10px;background:var(--surface,#fff);color:var(--text,#1b2331);cursor:pointer;font:inherit}
 .tt-pod-dispatch-root [data-tt-store-panel]{padding:0 12px 25px}.tt-pod-dispatch-root .tt-sp-intro{display:none}
 .tt-pod-report-area{margin:12px 12px 30px}.tt-pod-report-area .tt-si-panel{margin:0}.tt-pod-store-reports-relocated #ttMetricsBody [data-tt-store-panel="metrics"]{display:none!important}
 @media(max-width:600px){.tt-pod-dispatch-root .tt-pod-dispatch-hero{padding:15px;flex-wrap:wrap}.tt-pod-dispatch-root [data-tt-store-panel]{padding:0 2px 18px}}
 `;document.head.append(style);
 const surfaces=['mainContent','teamTabsOuter','podTabsOuter','ttAdminCommandBar','ttPremiumRightRail'];
 const phtToday=()=>{
   const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
   const get=type=>parts.find(p=>p.type===type)?.value||'';
   return `${get('year')}-${get('month')}-${get('day')}`;
 };
 function roleHint(){
   const role=String(document.body?.dataset?.trinoRole||document.getElementById('sessionIndicator')?.dataset?.role||'').toLowerCase().trim().replace(/[\s-]+/g,'_');
   return role==='admin'?'admin':['teamleader','team_leader','tl'].includes(role)?'team_leader':'';
 }
 function ensureNav(){
   invalidateSwitchedSession();
   const role=roleHint();
   const shellRole=String(document.body?.dataset?.trinoRole||document.getElementById('sessionIndicator')?.dataset?.role||'').trim();
   // Momentary shell-role transitions during workspace refresh must not close this page.
   if(!role && !shellRole)return;
   const premium=document.querySelector('#ttPremiumSidebar .tt-premium-nav');
   const nav=premium||document.getElementById('ttCoverageWorkspaceTabs');
   const old=document.querySelector('[data-tt-nav="pod-work"]');
   if(!role){document.documentElement.classList.remove('tt-pod-store-reports-relocated');old?.remove();if(pageActive)closePage();return;}
   document.documentElement.classList.add('tt-pod-store-reports-relocated');
   if(!nav)return;
   const icon='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M7 9h10M7 13h6M15 13l2 2 3-3"/></svg>';
   let btn=old;
   if(!btn){
     btn=document.createElement('button');btn.type='button';btn.dataset.ttNav='pod-work';
     btn.setAttribute('aria-label','POD Work Control');btn.dataset.ttTooltip='POD Work Control';
   }
   // The fallback workspace tab can exist BEFORE the Premium sidebar is built.
   // An existing button must be MOVED when the visible sidebar is ready, not
   // left inside hidden #ttCoverageWorkspaceTabs (the old code only inserted
   // new buttons and never moved one between navigation containers).
   const inPremium=Boolean(premium);
   if(btn.parentElement!==nav || (inPremium&&!btn.classList.contains('tt-premium-nav-btn')) || (!inPremium&&!btn.classList.contains('tt-coverage-workspace-tab'))){
     if(inPremium){btn.className='tt-premium-nav-btn';btn.innerHTML=icon+'<span class="tt-nav-label">POD Work Control</span>';}
     else{btn.className='tt-coverage-workspace-tab';btn.textContent='POD Work Control';}
     const anchor=nav.querySelector('[data-tt-nav="metrics"]')||nav.querySelector('[data-tt-nav="confirmation"]')||nav.querySelector('[data-tt-nav="coverage"]');
     if(anchor)anchor.insertAdjacentElement('afterend',btn);else nav.append(btn);
   }
 }

 function buildPage(){
   let root=document.getElementById('ttPodDispatchRoot');
   if(root)return root;
   root=document.createElement('section');root.id='ttPodDispatchRoot';root.className='tt-coverage-root tt-ops-root tt-pod-dispatch-root';root.hidden=true;
   root.innerHTML='<div class="tt-ops-shell"><header class="tt-pod-dispatch-hero"><div><span class="tt-pod-dispatch-eyebrow">Team Operations</span><h2>POD Work Control</h2><p>Choose Coverage or Confirmation, enter the store, then publish to your POD.</p></div><button type="button" data-pod-work-close aria-label="Back to dashboard">← Dashboard</button></header><div data-tt-store-panel></div><section id="ttPodStorePerformanceHost" class="tt-pod-report-area" aria-label="Store Performance based on observed jobs" hidden></section></div>';
   (document.getElementById('ttMetricsRoot')?.parentElement||document.getElementById('ttCoverageRoot')?.parentElement||document.getElementById('mainContent')?.parentElement||document.body).append(root);
   root.querySelector('[data-pod-work-close]').addEventListener('click',()=>{
     closePage();document.querySelector('[data-tt-nav="dashboard"]')?.click();
   });
   return root;
 }
 function closePage(){
   if(!pageActive)return;
   pageActive=false;
   const root=document.getElementById('ttPodDispatchRoot');if(root)root.hidden=true;
   for(const id of surfaces){const el=document.getElementById(id);if(el&&Object.hasOwn(pageSnapshot,id))el.hidden=pageSnapshot[id];}
   document.documentElement.classList.remove('tt-coverage-workspace-active');
   document.querySelectorAll('[data-tt-nav="pod-work"]').forEach(b=>b.classList.remove('is-active'));
 }
 function openPage(){
   const role=roleHint();if(!role)return;
   document.dispatchEvent(new CustomEvent('trinotime:workspace-opening',{detail:'pod-work'}));
   const root=buildPage();
   if(!pageActive){pageSnapshot={};for(const id of surfaces){const el=document.getElementById(id);if(el)pageSnapshot[id]=el.hidden;}}
   pageActive=true;
   for(const id of surfaces){const el=document.getElementById(id);if(el)el.hidden=true;}
   root.hidden=false;
   document.documentElement.classList.add('tt-coverage-workspace-active');
   document.querySelectorAll('[data-tt-nav]').forEach(b=>b.classList.toggle('is-active',b.dataset.ttNav==='pod-work'));
   document.querySelectorAll('[data-tt-workspace]').forEach(b=>b.classList.remove('is-active'));
   const actor=liveViewer();
   if(!actor||actor.role!==role){
     retirePanel(root);
     root.querySelector('[data-tt-store-panel]').textContent='Your signed-in identity is not ready. Please sign in again before managing any POD store.';
     return;
   }
   const context={viewer:actor,date:phtToday()};
   mount(root,context);
   if(pageState)attemptRefresh(pageState);
   if(pageState)refreshPodStorePerformance(pageState);
   window.scrollTo({top:0,behavior:'instant'});
 }
 function attemptRefresh(state){
   // Keep every failure visible even when it occurs while loading the roster.
   // A stale response cannot update a new account or overwrite a later refresh.
   const seq=state.rosterSequence+1;
   const button=$(state,'[data-store-plan-roster]');
   if(button){button.disabled=true;button.textContent='Refreshing…';}
   showStatus(state,'Verifying authorized PODs. This can take up to 15 seconds…','pending');
   podVerifyStatus(state,'Verifying authorized PODs…','pending');
   refreshTargets(state).catch(e=>{
     if(state.disposed||seq!==state.rosterSequence)return;
     state.dispatchRevision=null;
     state.pods=[];state.agents=[];
     $(state,'[data-store-plan-pod]').replaceChildren(new Option('POD unavailable — see error below',''));
     $(state,'[data-store-plan-agent]').replaceChildren(new Option('Authorization unavailable',''));
     resetCurrent(state,'Cannot load your authorized POD: '+e.message);
     showStatus(state,'POD verification failed: '+e.message,'error');
     podVerifyStatus(state,'Verification failed: '+e.message,'error');
     clearQueue(state);
     refreshPodStorePerformance(state);
   }).finally(()=>{
     if(state.disposed||seq!==state.rosterSequence)return;
     if(button){button.disabled=false;button.textContent='↻ Refresh';}
   });
 }
 document.addEventListener('trinotime:store-context',e=>{
   const context=e.detail||{};
   if(!context.viewer||!['admin','team_leader'].includes(context.viewer.role))return;
   // Workspace events are not proof of the current signed-in identity.
   lastServerContext=context;ensureNav();
 });
 document.addEventListener('trinotime:workspace-opening',e=>{if(e.detail!=='pod-work')closePage();});
 window.addEventListener('click',e=>{
   const button=e.target?.closest?.('[data-tt-nav],[data-tt-workspace]');if(!button)return;
   if(button.dataset.ttNav==='pod-work'){e.preventDefault();openPage();}
   else if(pageActive)closePage();
 },true);
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ensureNav,{once:true});else ensureNav();
 // The premium sidebar is inserted after sign-in; keep shortcut in sync with current role.
 setInterval(()=>{if(!document.hidden)ensureNav();},2000);
})();
