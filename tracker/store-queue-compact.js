/* Live, read-only store queue ribbon in Coverage/Confirmation QA popups.
 * Never modifies job metrics, shift state, or Augmoto observations.
 */
(() => {
 'use strict';
 const api=globalThis.TrinoTimeStoreQueue;
 const label=document.getElementById('rtaCompactCurrent');
 const next=document.getElementById('rtaCompactNext');
 if(!api||!label||!next)return;
 const BASE='https://oostrinotime-staging-qa.trinoadmin.workers.dev';
 let inFlight=false;
 async function timedGet(url,headers){
   const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),9000);
   try{return await fetch(url,{headers:{Accept:'application/json',...headers},cache:'no-store',signal:abort.signal});}
   finally{clearTimeout(timer);}
 }
 async function refresh(){
  if(inFlight)return;
  inFlight=true;
  try{
   const [coverage,confirmation]=await Promise.all([
     chrome.runtime.sendMessage({type:'cat-context'}),
     chrome.runtime.sendMessage({type:'cft-context'})
   ]);
   const valid=[{context:coverage,header:'X-TT-Coverage-Bridge'},
     {context:confirmation,header:'X-TT-Confirmation-Bridge'}].filter(x=>x.context?.bridge?.token);
   if(valid.some(x=>x.context.bridge.baseUrl!==BASE))throw Error('Wrong Tracker origin');
   const agents=valid.map(x=>({...x,owner:api.scope(x.context)}));
   if(agents.some(x=>!x.owner||!x.context.bridge.actor?.pod))throw Error('Unauthorized Tracker session');
   if(agents[0]&&agents.some(x=>x.owner.key!==agents[0].owner.key||
     x.context.bridge.actor.pod!==agents[0].context.bridge.actor.pod))throw Error('Mismatched Tracker identity');
   const actor=agents[0];
   if(!actor){label.textContent='Connect Tracker';next.textContent='No verified Agent assignment';return;}
   const {context,header,owner}=actor;
   const response=await timedGet(context.bridge.baseUrl+'/api/workforce/store-plans/mine?date='+encodeURIComponent(owner.date),{[header]:context.bridge.token});
   const data=await response.json().catch(()=>null);
   if(!response.ok||!data?.ok||data.authority!=='workforce-store-plans-v1'||data.date!==owner.date||
     String(data.agent?.name||'').trim().toLowerCase()!==owner.agent.toLowerCase()||
     String(data.agent?.pod||'')!==String(context.bridge.actor.pod))throw Error('Server scope/assignment not verified');
   let plan=null,source='none',selected=0;
   const previous=(await chrome.storage.local.get(owner.key))[owner.key];
   if(data.assigned&&Array.isArray(data.entries)){
     const csv='order,store,plannedJobs,jobIds\n'+data.entries.map(r=>[r.order,'"'+String(r.store).replaceAll('"','""')+'"',r.plannedJobs,'"'+(r.jobIds||[]).join('|')+'"'].join(',')).join('\n');
     plan=api.parsePlan(csv);source='server';
     const changed=previous?.source!=='TrinoTime server'||JSON.stringify(previous?.entries)!==JSON.stringify(plan);
     selected=changed?0:Math.max(0,Math.min(plan.length-1,Math.trunc(Number(previous.selected)||0)));
     if(changed)await chrome.storage.local.set({[owner.key]:{version:1,source:'TrinoTime server',entries:plan,selected}});
   }else{
     if(previous?.source==='TrinoTime server')await chrome.storage.local.remove(owner.key);
     else if(previous?.version===1&&Array.isArray(previous.entries)){
       try{
         const csv='order,store,plannedJobs,jobIds\n'+previous.entries.map(r=>[r.order,'"'+String(r.store).replaceAll('"','""')+'"',r.plannedJobs,'"'+(r.jobIds||[]).join('|')+'"'].join(',')).join('\n');
         plan=api.parsePlan(csv);source='local';selected=Math.max(0,Math.min(plan.length-1,Math.trunc(Number(previous.selected)||0)));
       }catch(_){/* Never trust malformed cached plans. */}
     }
   }
   if(!plan?.length){label.textContent='No assigned store queue';next.textContent='Ask TL/Admin to assign stores';return;}
   const row=plan[selected],subsequent=plan[selected+1];
   const observed=api.project(plan,coverage?.jobs)[selected];
   label.textContent=row.store+(source==='server'?' · Verified':' · Local QA only');
   next.textContent=`${observed?.observedJobs||0} Coverage jobs observed / ${row.plannedJobs} planned · Next: ${subsequent?subsequent.store:'None'}`;
  }catch(_){
    // Do not show a cached server queue as current after failed verification.
    label.textContent='Cannot verify assigned store';next.textContent='Reconnect/refresh Tracker; do not use cached instructions';
  }finally{inFlight=false;}
 }
 refresh();
 setInterval(refresh,25000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
})();
