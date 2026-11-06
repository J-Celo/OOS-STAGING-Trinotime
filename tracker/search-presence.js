// Production-only queue-search fairness and computer-wide idle probe.
// Search windows are per tab and workflow, not claimed as task-processing time.
(() => {
  'use strict';
  if (window.TrinoTimeSearchPresence) return;
  const GRACE_MS = 120000;           // two-minute initial buffer
  const MAX_WINDOW_MS = 300000;      // five-minute maximum per queue visit
  const OS_IDLE_SECONDS = 300;       // same five-minute managed idle policy
  const QUERY_INTERVAL_MS = 5000;
  const now = () => Date.now();
  function create(workflow) {
    const key = `tt-search-window-v1-${workflow}`;
    let startAt=0,lastActionAt=0,systemState='unknown',lastQueryAt=0,inFlight=null;
    try {
      const old = JSON.parse(sessionStorage.getItem(key)||'null');
      if(old && Number(old.startAt)>0 && Number(old.startAt)<=now() && now()-Number(old.startAt)<86400000){
        startAt=Number(old.startAt);lastActionAt=Math.max(startAt,Number(old.lastActionAt)||startAt);
      }
    } catch (_) {}
    function persist(){try{if(startAt)sessionStorage.setItem(key,JSON.stringify({startAt,lastActionAt}));else sessionStorage.removeItem(key);}catch(_){}}
    function reset(){startAt=0;lastActionAt=0;persist();}
    function sync(hasTask,shiftActive){
      if(hasTask || !shiftActive){if(startAt)reset();return false;}
      if(!startAt){startAt=now();lastActionAt=startAt;persist();}
      return true;
    }
    function record(event,hasTask,shiftActive){
      if(!shiftActive||hasTask||event?.isTrusted===false)return;
      if(!['click','pointerdown','scroll','touchstart','keydown','input'].includes(String(event?.type||'')))return;
      sync(false,true);lastActionAt=now();persist();
    }
    function idleSince(at=now()){
      if(!startAt)return at;
      return Math.min(at,Math.min(startAt+MAX_WINDOW_MS,Math.max(startAt+GRACE_MS,lastActionAt+GRACE_MS)));
    }
    function state(at=now()){
      if(!startAt || systemState==='idle' || systemState==='locked')return 'idle';
      const elapsed=at-startAt;
      if(elapsed<0 || elapsed>=MAX_WINDOW_MS)return 'idle';
      // Initial allowance, then only genuinely recent Augmoto queue interactions.
      return elapsed<GRACE_MS || at-lastActionAt<GRACE_MS ? 'searching':'idle';
    }
    async function poll(force=false){
      const at=now();
      if(!force && at-lastQueryAt<QUERY_INTERVAL_MS)return systemState;
      if(inFlight)return inFlight;
      lastQueryAt=at;
      inFlight=(async()=>{
        try{
          const r=await chrome.runtime.sendMessage({type:'tt-system-presence'});
          if(r && ['active','idle','locked'].includes(r.state))systemState=r.state;
        }catch(_){/* Unknown system state: never assume AWAY from blur. */}
        finally{inFlight=null;}
        return systemState;
      })();
      return inFlight;
    }
    return {sync,record,state,idleSince,poll,reset,getSystemState:()=>systemState,
      isAway:()=>systemState==='idle'||systemState==='locked',
      policy:{graceMs:GRACE_MS,maxMs:MAX_WINDOW_MS,osIdleSeconds:OS_IDLE_SECONDS}};
  }
  window.TrinoTimeSearchPresence={create};
})();
