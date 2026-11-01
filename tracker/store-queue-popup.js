/* TrinoTime Store Queue — verified read-only display, production.
 * UI label polish v2.2.44 — technical POD identifiers remain internal.
 * Never changes Coverage/Confirmation counters, job observations, or shift sync.
 */
(() => {
 'use strict';
 const $=id=>document.getElementById(id),lib=globalThis.TrinoTimeStoreQueue;
 if(!lib)return;
 const BASE='https://oostrinotime-staging-qa.trinoadmin.workers.dev';
 let state=null,plan=null,scope=null,selected=0,source='none',dispatchSnapshot=null,chatInstructionSnapshot=null,chatInstructionError=false,podName='';
 let busy=false,refreshQueued=false;
 // POD IDs are authority keys, not display names. Only use a label from a verified
 // server response; never synthesize a name from the ID or cache labels across logins.
 const friendlyName=value=>{
   const label=String(value||'').replace(/\s+/g,' ').trim();
   return label && label.length<=100 && !/^(?:tt[-_:]|custom[-_:]pod|pod[-_:][a-z0-9]{8})/i.test(label) && !/[:\x00-\x1f]/.test(label) ? label : '';
 };
 const visiblePod=()=>podName||'Your POD';
 const pht=value=>{
   if(!value)return '';
   const date=new Date(value);
   return Number.isFinite(date.getTime())?new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',hour12:true}).format(date)+' PHT':'';
 };
 const hint=(message,kind='info')=>{
   const node=$('rtaStatus');node.textContent=message;node.dataset.state=kind;
 };
 const clock=()=>new Date().toLocaleTimeString('en-GB',{hour12:false});
 async function timedGet(url,headers){
   const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),9000);
   try{return await fetch(url,{method:'GET',headers:{Accept:'application/json',...headers},cache:'no-store',signal:abort.signal});}
   finally{clearTimeout(timer);}
 }
 function safeCandidates(coverage,confirmation){
   const raw=[{context:coverage,header:'X-TT-Coverage-Bridge'},
     {context:confirmation,header:'X-TT-Confirmation-Bridge'}];
   const attached=raw.filter(x=>x.context?.bridge?.token);
   if(attached.some(x=>x.context.bridge.baseUrl!==BASE))throw Error('Unexpected Tracker connection origin. Reconnect production.');
   const candidates=attached.map(x=>({...x,owner:lib.scope(x.context)}));
   if(candidates.some(x=>!x.owner||!x.context.bridge.actor?.pod))throw Error('Agent/shift connection is not authorized. Reconnect Tracker.');
   const first=candidates[0];
   if(first&&candidates.some(x=>x.owner.key!==first.owner.key||
     String(x.context.bridge.actor.pod)!==String(first.context.bridge.actor.pod)))
     throw Error('Coverage and Confirmation identities, PODs, or shifts do not match. Reconnect Tracker.');
   return candidates;
 }
 // Stage V2.2.45: A TrinoChat text instruction takes display priority ONLY if it
 // was independently verified for the same bridge-authorized POD. The previous
 // workflow/store dispatch remains intact and visible whenever no chat note is active.
 function renderDispatch(){
   const title=$('podDispatchCurrent'),detail=$('podDispatchDetail');
   const note=chatInstructionSnapshot;
   if(!scope){
     title.textContent='Connect Tracker for POD instructions';
     detail.textContent='Connect an authorized signed-in Agent to read current instructions.';
     return;
   }
   if(note?.active && note.pod===scope.pod && typeof note.text==='string' && note.text.trim()){
     title.textContent=note.text;
     detail.textContent=`TrinoChat · ${visiblePod()} · From ${note.updatedBy||'your Team Leader'}${pht(note.updatedAt)?' · Updated '+pht(note.updatedAt):''}${pht(note.expiresAt)?' · Expires '+pht(note.expiresAt):''}`;
     return;
   }
   const item=dispatchSnapshot;
   title.textContent=item?.active?`${item.workflow.toUpperCase()} · ${item.store}`:'No active POD instruction';
   const originalDetail=item?.active?
     `${visiblePod()} · From ${item.updatedBy||'your supervisor'}${pht(item.updatedAt)?' · Updated '+pht(item.updatedAt):''}${pht(item.expiresAt)?' · Expires '+pht(item.expiresAt):''}`:
     item?.expired?'The previous workflow/store instruction expired. Wait for your TL/Admin.':'Ask your TL/Admin for the current POD instruction.';
   detail.textContent=chatInstructionError ? `TrinoChat instruction could not be verified. ${originalDetail}` : originalDetail;
 }
 function verifyChatInstruction(data,expectedPod){
   if(!data || data.ok!==true || data.authority!=='trinotime-pod-chat-instruction-v1' ||
       String(data.pod||'')!==expectedPod || typeof data.active!=='boolean' ||
       !Number.isSafeInteger(data.revision) || data.revision<0){
     throw Error('TrinoChat instruction scope or response invalid');
   }
   if(data.active){
     const until=Date.parse(data.expiresAt||'');
     if(!Number.isFinite(until)||until<=Date.now()||typeof data.text!=='string'||
        !data.text.trim()||data.text.length>500)throw Error('TrinoChat instruction expired or invalid');
   }
   return data;
 }
 function render(){
   const signed=Boolean(scope),box=$('rtaPanel');box.dataset.connected=String(signed);
   $('rtaIdentity').textContent=signed?`${scope.agent} · ${scope.date} · ${source==='server'?'Verified TrinoTime assignment':source==='local'?'Local CSV fallback':'No verified assignment'}`:'Connect your signed-in Agent first';
   $('rtaImport').disabled=!signed||source==='server';$('rtaClear').disabled=!signed||!plan||source==='server';
   $('rtaPrevious').disabled=!signed||!plan||selected===0;
   $('rtaNext').disabled=!signed||!plan||selected>=plan.length-1;
   if(!signed){$('rtaCurrent').textContent='Not connected';$('rtaNextStore').textContent='—';$('rtaProgress').textContent='Only a connected signed-in Agent can view a store plan.';$('rtaStoreList').replaceChildren();return;}
   if(!plan?.length){$('rtaCurrent').textContent='No verified store plan';$('rtaNextStore').textContent='—';$('rtaProgress').textContent='Ask Admin/TL to assign stores, or reconnect Tracker.';$('rtaStoreList').replaceChildren();return;}
   selected=Math.max(0,Math.min(selected,plan.length-1));
   const rows=lib.project(plan,state?.jobs),cur=rows[selected],next=rows[selected+1];
   $('rtaCurrent').textContent=cur.store;
   $('rtaNextStore').textContent=next?`${next.store} · ${next.plannedJobs} planned jobs`:'No more stores in this plan';
   $('rtaProgress').textContent=`Store ${selected+1} of ${rows.length} · ${cur.plannedJobs} planned · ${cur.observedJobs} observed Coverage job IDs · ${cur.submittedJobs} jobs with submissions`;
   $('rtaStoreList').replaceChildren();
   for(let i=0;i<rows.length;i++){
     const row=rows[i],li=document.createElement('li'),button=document.createElement('button');
     button.type='button';button.className=i===selected?'rtaQueueRow selected':'rtaQueueRow';
     button.textContent=`${row.order}. ${row.store} — ${row.observedJobs} observed / ${row.plannedJobs} planned`;
     button.setAttribute('aria-current',i===selected?'step':'false');button.onclick=()=>{selected=i;persist().then(render).catch(showError);};
     li.append(button);$('rtaStoreList').append(li);
   }
   const conflicts=rows.flatMap(r=>r.conflicts.map(id=>id+' → '+r.store));
   $('rtaConflicts').textContent=conflicts.length?`Mapping conflict · ${conflicts.slice(0,4).join(', ')}. Augmoto-observed store remains authoritative.`:'TL assignments never modify observed stores or task counts.';
 }
 function showError(e){hint(String(e?.message||e),'error');}
 async function persist(){
   if(!scope||!plan)throw Error('Connect a signed-in Agent first.');
   await chrome.storage.local.set({[scope.key]:{version:1,entries:plan,selected,source:source==='server'?'TrinoTime server':'RTA CSV — local display only'}});
 }
 async function invalidateServerPlan(message){
   // Fail closed: an unverified cached server plan must never appear current.
   if(source==='server'&&scope)await chrome.storage.local.remove(scope.key);
   if(source==='server'){plan=null;selected=0;source='none';}
   hint(message,'error');
 }
 async function refresh(){
   if(busy){refreshQueued=true;hint('Refresh queued — another store check is finishing…','pending');return;}
   busy=true;
   const refreshButton=$('rtaRefresh');
   refreshButton.disabled=true;refreshButton.textContent='Refreshing…';
   hint('Checking your assigned stores and live instruction…','pending');
   try{
     const [coverage,confirmation]=await Promise.all([
       chrome.runtime.sendMessage({type:'cat-context'}),
       chrome.runtime.sendMessage({type:'cft-context'})
     ]);
     const candidates=safeCandidates(coverage,confirmation);
     const nextScope=candidates[0]?.owner||null;
     const changed=scope?.key!==nextScope?.key ||
       String(scope?.pod||'')!==String(candidates[0]?.context?.bridge?.actor?.pod||'');
     if(changed){plan=null;source='none';selected=0;podName='';chatInstructionSnapshot=null;chatInstructionError=false;dispatchSnapshot=null;}
     scope=nextScope?{...nextScope,pod:String(candidates[0].context.bridge.actor.pod)}:null;
     state=coverage?.bridge?.token?coverage:confirmation;
     if(!scope){podName='';dispatchSnapshot=null;chatInstructionSnapshot=null;chatInstructionError=false;renderDispatch();hint('Connect Tracker to TrinoTime production to receive instructions.','info');return;}
     if(changed){
       const saved=(await chrome.storage.local.get(scope.key))[scope.key];
       if(saved?.version===1&&saved.source!=='TrinoTime server'&&Array.isArray(saved.entries)){
         try{
           const csv='order,store,plannedJobs,jobIds\n'+saved.entries.map(r=>[r.order,'"'+String(r.store).replaceAll('"','""')+'"',r.plannedJobs,'"'+(r.jobIds||[]).join('|')+'"'].join(',')).join('\n');
           plan=lib.parsePlan(csv);selected=Math.min(plan.length-1,Math.max(0,Math.floor(Number(saved.selected)||0)));source='local';
         }catch(_){plan=null;source='none';}
       }
     }
     const {context,header}=candidates[0];
     // Each request independently validates the server response against the current bridge.
     const requests=await Promise.allSettled([
       timedGet(context.bridge.baseUrl+'/api/workforce/store-plans/mine?date='+encodeURIComponent(scope.date),{[header]:context.bridge.token}),
       timedGet(context.bridge.baseUrl+'/api/workforce/store-plans/dispatch/mine',{[header]:context.bridge.token}),
       timedGet(context.bridge.baseUrl+'/api/workforce/store-plans/chat-instruction/mine',{[header]:context.bridge.token})
     ]);
     try{
       if(requests[0].status!=='fulfilled')throw Error('Network unavailable');
       const response=requests[0].value,data=await response.json().catch(()=>null);
       if(!response.ok||!data?.ok)throw Error(data?.message||'HTTP '+response.status);
       if(data.authority!=='workforce-store-plans-v1'||data.date!==scope.date||
         String(data.agent?.name||'').trim().toLowerCase()!==scope.agent.toLowerCase()||
         String(data.agent?.pod||'')!==scope.pod)throw Error('Server assignment scope mismatch');
       // Label is used ONLY for presentation after identity/POD/date checks above.
       // For individual Agent queues the response may have no podLabel.
       podName=friendlyName(data.podLabel)||friendlyName(data.agent?.podLabel)||'';
       if(data.assigned&&Array.isArray(data.entries)){
         const csv='order,store,plannedJobs,jobIds\n'+data.entries.map(r=>[r.order,'"'+String(r.store).replaceAll('"','""')+'"',r.plannedJobs,'"'+(r.jobIds||[]).join('|')+'"'].join(',')).join('\n');
         const verified=lib.parsePlan(csv);
         const modified=source!=='server'||JSON.stringify(verified)!==JSON.stringify(plan);
         plan=verified;source='server';if(modified)selected=0;
         if(modified)await persist();
         hint('Verified '+verified.length+' assigned store'+(verified.length===1?'':'s')+' · '+visiblePod()+' · Shift '+scope.date+' · Revision '+(data.revision??'—')+' · Checked '+clock()+'.','success');
       }else if(source==='server'){
         await invalidateServerPlan('Admin/TL cleared the server assignment.');
       }else hint(source==='local'?'Local QA queue only — not a saved Admin/TL assignment for '+scope.date+'.':'No saved store queue for '+visiblePod()+' on shift '+scope.date+' · Checked '+clock()+'. In Store Operations verify Entire POD / Team, the correct date, and a saved revision.','info');
     }catch(err){
       await invalidateServerPlan('Store queue could not be verified: '+String(err?.message||err)+'. Refresh/reconnect; do not use old instructions.');
     }
     try{
       if(requests[1].status!=='fulfilled')throw Error('Network unavailable');
       const response=requests[1].value,data=await response.json().catch(()=>null);
       if(!response.ok||!data?.ok||data.authority!=='workforce-store-plans-v1'||data.kind!=='pod-dispatch'||
          String(data.pod||'')!==scope.pod)throw Error('POD instruction cannot be verified');
       if(data.active&&!['coverage','confirmation','standby'].includes(data.workflow))throw Error('Unexpected POD workflow');
       dispatchSnapshot=data;renderDispatch();
     }catch(_){dispatchSnapshot=null;}
     // Separate verification: no fallback to another POD, another Agent, or stale
     // cached instructions. Reuses the EXISTING 25s queue refresh, no new timer.
     chatInstructionSnapshot=null;chatInstructionError=false;
     try{
       if(requests[2].status!=='fulfilled')throw Error('Network unavailable');
       const response=requests[2].value,data=await response.json().catch(()=>null);
       if(!response.ok)throw Error('Instruction HTTP '+response.status);
       chatInstructionSnapshot=verifyChatInstruction(data,scope.pod);
     }catch(_){chatInstructionSnapshot=null;chatInstructionError=true;}
     renderDispatch();
   }catch(err){
     await invalidateServerPlan('Store assignment verification failed: '+String(err?.message||err));
     scope=null;state=null;podName='';dispatchSnapshot=null;chatInstructionSnapshot=null;chatInstructionError=false;renderDispatch();
   }finally{
     busy=false;refreshButton.disabled=false;refreshButton.textContent='Refresh';render();
     if(refreshQueued){refreshQueued=false;queueMicrotask(()=>refresh().catch(showError));}
   }
 }
 $('rtaImport').addEventListener('click',async()=>{
   try{if(!scope)throw Error('Connect signed-in Agent first.');
     if(source==='server')throw Error('Only Admin/TL can change this server assignment.');
     const entries=lib.parsePlan($('rtaCsv').value);
     if(!confirm('Import '+entries.length+' local QA stores for '+scope.agent+'? Productivity data will not change.'))return;
     plan=entries;selected=0;source='local';await persist();$('rtaCsv').value='';hint('Local QA queue imported — not synced to server.','info');render();
   }catch(e){showError(e);}
 });
 $('rtaNext').addEventListener('click',()=>{if(!scope||!plan||selected>=plan.length-1)return;selected++;persist().then(render).catch(showError);});
 $('rtaPrevious').addEventListener('click',()=>{if(!scope||!plan||selected<=0)return;selected--;persist().then(render).catch(showError);});
 $('rtaClear').addEventListener('click',async()=>{if(!scope||!plan||source==='server'||!confirm('Clear local QA queue? Productivity data is untouched.'))return;
   try{await chrome.storage.local.remove(scope.key);plan=null;selected=0;source='none';render();}catch(e){showError(e);}
 });
 $('rtaRefresh').addEventListener('click',()=>refresh().catch(showError));
 refresh().catch(showError);
 setInterval(()=>refresh().catch(showError),25000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh().catch(showError);});
})();
