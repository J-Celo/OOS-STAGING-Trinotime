(() => {
 'use strict';if(window!==window.top||window.TrinoTimeQCEfficiency)return;
 let previous=null,lastInput=Date.now(),chain=Promise.resolve(),sampling=false;
 const date=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 function snapshot(now){
  const mode=window.TrinoTimeQCMode?.get();
  if(!['coverage','confirmation'].includes(mode))return null;
  const explicit=location.pathname.match(/\/jobs\/JOB_[^/]+\/(confirmation|coverage(?:-beta)?)(?:\/|$)/i);
  if(explicit&&(explicit[1].toLowerCase().startsWith('coverage')?'coverage':'confirmation')!==mode)return null;
  const text=document.body?.innerText||document.body?.textContent||'';
  const m=[...text.matchAll(/(JOB_[A-Za-z0-9_-]+)\s*-?\s*tasks?\s*:\s*(\d+)\s*\/\s*(\d+)/ig)].at(-1);
  const report=mode==='coverage'?date():window.TrinoTimeConfirmationReportDate?.();
  if(!m||!report)return null;
  return {mode,date:report,jobId:m[1].toUpperCase(),taskIndex:Number(m[2]),totalTasks:Number(m[3]),at:now,focused:!document.hidden&&document.hasFocus()};
 }
 function flush(endingFocus=false){
  if(sampling)return chain;sampling=true;
  const now=Date.now(),next=snapshot(now);
  if(previous&&window.TrinoTimeQCMode?.get()===previous.mode&&previous.date===(previous.mode==='coverage'?date():window.TrinoTimeConfirmationReportDate?.())&&previous.focused&&(endingFocus||(!document.hidden&&document.hasFocus()))){
   const activeMs=Math.max(0,Math.min(now,lastInput+300000)-Math.max(previous.at,now-5000));
   if(activeMs>0){
    const payload={...previous,activeMs,eventId:crypto.randomUUID(),timestamp:now};
    chain=chain.catch(()=>{}).then(()=>chrome.runtime.sendMessage({type:(previousMode(payload)==='coverage'?'cat':'cft')+'-efficiency-time',payload}));
   }
  }
  previous=next;sampling=false;return chain;
 }
 function previousMode(payload){return payload.mode;}
 window.TrinoTimeQCEfficiency=Object.freeze({flush,prime:()=>{if(!previous)previous=snapshot(Date.now());}});
 for(const name of ['pointerdown','keydown','scroll','touchstart'])document.addEventListener(name,e=>{if(e.target?.closest?.('[id^="cat-staging-hud"],#cft-confirmation-staging-hud'))return;flush();lastInput=Date.now();},{capture:true,passive:true});
 window.addEventListener('focus',()=>flush(),true);window.addEventListener('blur',()=>flush(true),true);
 document.addEventListener('visibilitychange',()=>flush(document.hidden));
 document.addEventListener('tt-qc-mode-change',()=>flush());
 document.addEventListener('click',e=>{const b=e.target?.closest?.('button,[role="button"]');if(b&&/^(exit|skip)$/i.test(String(b.innerText||b.textContent||'').trim())){flush();previous=null;}},true);
 setInterval(flush,5000);flush();
})();
