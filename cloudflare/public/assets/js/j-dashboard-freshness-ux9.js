/* TrinoTime UX9 — dashboard fetch freshness, not Tracker receipt status.
 * UI only. No APIs, credentials, local storage, attendance or Tracker counters.
 */
(() => {
 'use strict';
 if (window.TrinoTimeDashboardFreshness) return;
 const config={
   coverage:{root:'ttCoverageRoot',target:'.tt-coverage-hero-copy',stale:90000},
   confirmation:{root:'ttConfirmationRoot',target:'.tt-ops-hero-copy',stale:90000},
   metrics:{root:'ttMetricsRoot',target:'.tt-ops-hero-copy',stale:180000},
   store:{root:'ttPodDispatchRoot',target:'.tt-pod-dispatch-hero > div',stale:300000}
 };
 const states=Object.create(null);
 const now=()=>Date.now();
 function timeAgo(ts){
   const delta=Math.max(0,now()-ts);
   if(delta<60000)return 'just now';
   if(delta<3600000)return `${Math.floor(delta/60000)}m ago`;
   return `${Math.floor(delta/3600000)}h ago`;
 }
 function freshState(name){
   const s=states[name];if(!s)return ['waiting',name==='store'?'No verified Store report loaded':'Waiting for dashboard data','Dashboard fetch status only; does not confirm Tracker delivery.'];
   if(s.phase==='loading')return ['loading',s.lastSuccessAt?'Refreshing · last fetched '+timeAgo(s.lastSuccessAt):'Refreshing dashboard…','Request in progress; prior results are not a new server acknowledgment.'];
   if(s.phase==='failed')return ['failed',s.lastSuccessAt?'Refresh failed · last fetched '+timeAgo(s.lastSuccessAt):'Refresh failed · no snapshot','Check connection or session; existing data may be outdated.'];
   if(s.phase==='waiting')return ['waiting',s.lastSuccessAt?'Waiting for report · last fetched '+timeAgo(s.lastSuccessAt):'Waiting for verified Store report','Store data is only refreshed through the authorized report viewer.'];
   if(s.lastSuccessAt && now()-s.lastSuccessAt>=config[name].stale)return ['delayed','Data aging · fetched '+timeAgo(s.lastSuccessAt),'Dashboard snapshot is aging; refresh to check for newer data.'];
   return ['fresh',`Dashboard fetched ${timeAgo(s.lastSuccessAt)}`,'Verified dashboard response was received. Does not verify any pending Tracker submissions.'];
 }
 function paint(name){
   const cfg=config[name],root=document.getElementById(cfg.root);
   if(!root||root.hidden)return;
   const target=root.querySelector(cfg.target);
   if(!target)return;
   let el=target.querySelector('[data-tt-freshness]');
   if(!el){el=document.createElement('div');el.className='tt-dashboard-freshness';el.dataset.ttFreshness=name;el.setAttribute('role','status');el.setAttribute('aria-live','off');
      // Never insert into a toolbar: it must not affect filters or button listeners.
      target.append(el);
   }
   const [phase,message,hint]=freshState(name);
   if(el.dataset.state!==phase)el.dataset.state=phase;
   if(el.textContent!==message)el.textContent=message;
   if(el.title!==hint)el.title=hint;
 }
 function mark(name, phase, key){
   if(!config[name])return;
   let s=states[name]||(states[name]={key:'',phase:'waiting',lastSuccessAt:0});
   const nextKey=String(key||'');
   if(nextKey&&s.key!==nextKey){s={key:nextKey,phase:'waiting',lastSuccessAt:0};states[name]=s;}
   if(phase==='fresh')s.lastSuccessAt=now();
   s.phase=phase;
   paint(name);
 }
 const api=Object.freeze({
   begin:(name,key)=>mark(name,'loading',key),
   success:(name,key)=>mark(name,'fresh',key),
   fail:(name,key)=>mark(name,'failed',key),
   waiting:(name,key)=>mark(name,'waiting',key),
   reset:name=>{if(config[name]){delete states[name];paint(name);}},
   repaint:paint
 });
 window.TrinoTimeDashboardFreshness=api;
 // A light 5-second repaint reinstalls the indicator when Coverage re-renders its
 // shell, and advances the stale timer. No API calls or full DOM observers.
 setInterval(()=>{for(const name of Object.keys(config))paint(name);},5000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)for(const name of Object.keys(config))paint(name);});
 document.addEventListener('trinotime:workspace-opening',()=>{for(const name of Object.keys(config))paint(name);});
})();
