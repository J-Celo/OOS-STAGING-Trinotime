(() => {
  'use strict';
  if (window !== window.top || window.__confirmationTrackerV1) return;
  window.__confirmationTrackerV1 = true;

  const ID='cft-confirmation-staging-hud', PENDING='cft-pending-submit-v1', BACKLOG='cft-submit-ledger-v1', BACKLOG_LIMIT=48;
  const EXT_VERSION = '2.2.63', MANAGED_IDLE_MINUTES=5, MANAGED_IDLE_MS=MANAGED_IDLE_MINUTES*60*1000;
  let context=null, shiftState={status:'not_clocked_in',locked:true,reportDate:''}, pending=null, receiptBacklog=[], backlogProcessing=false, skipIntent=null, busy=false, root, body, toggle, message='', expanded=true, liveHeader=null, lastAnnouncedJob='', missingHeaderSince=0;
  let current={jobId:'',taskIndex:0,totalTasks:0};
  // A confirmed Submit intent can outlive its first page when Augmoto makes
  // a full-document return to the queue. Re-send only its stable pending ID
  // after a same-tab navigation AND after the actual queue is visible.
  // This never awards a task for a click alone.
  let queueReceiptRecoveryAt=0,queueReceiptRecoveryBusy=false;
  // Per-document marker distinguishes a genuine same-page task transition
  // from a restored/reloaded click. It never authorizes a count on its own.
  const PAGE_INSTANCE_ID=crypto.randomUUID();
  let transitionReceiptRecoveryAt=0,transitionReceiptRecoveryBusy=false;
  // A live server/storage refresh is needed for changes, not every DOM poll.
  // Storage onChanged and explicit Submit paths still refresh promptly.
  let lastContextRefreshAt=0;
  const searchPresence = window.TrinoTimeSearchPresence?.create('confirmation');
  const integrity = window.TrinoTimeActivityIntegrity?.create('confirmation');
  let lastInteraction=Date.now(), lastTick=Date.now(), idleBoundaryTimer=null, presenceState='idle', awaySinceAt=0, queueIdleSinceAt=Date.now(), resumePresence=null, presenceInitialized=false, lastPresenceSentAt=0, lastPresenceSentState='';
  let activityOwned=false;
  // Only the shared activity owner records elapsed time. All Submit receipts
  // still travel through their original workflow independently.
  const activityCoordinator=window.TrinoTimeWorkflowCoordinator?.create('confirmation',(owned,at)=>{
    if(owned===activityOwned)return;
    if(!owned){recordPresenceTime(Math.min(Date.now(),at),presenceState);activityOwned=false;lastTick=Date.now();updateLocalPresence('paused');}
    else {activityOwned=true;lastTick=Date.now();emitPresence(computePresenceState(),true);}
  });
  const updateActivityOwner=(urgent=false)=>activityCoordinator?.refresh(shiftState?.status==='active'&&route(),urgent).catch(()=>{});


  // A browser restart must not upgrade an unacknowledged Submit into verified evidence.
  try { pending=JSON.parse(sessionStorage.getItem(PENDING)||'null'); } catch (_) {}
  try { const saved=JSON.parse(sessionStorage.getItem(BACKLOG)||'[]'); receiptBacklog=Array.isArray(saved)?saved.slice(0,BACKLOG_LIMIT):[]; } catch (_) {}
  window.TrinoTimeConfirmationReportDate=()=>context?.today;
  const send=(type,extra={})=>chrome.runtime.sendMessage({type,...extra});
  const route=()=>! /\/jobs\/JOB_[^/]+\/coverage(?:-beta)?(?:\/|$)/i.test(location.pathname)&&window.TrinoTimeQCMode?.get()==='confirmation';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const phtDate=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const reportDate=()=>context?.today||phtDate();


  async function hydrateLocalConfirmationSnapshot(){
    try{
      const r=await chrome.storage.local.get(['cftSettingsV2','cftConfirmationDataV2','cftSyncStateV2','cftTrinoTimeBridgeV2','cftShiftSessionV1']);
      const st=r.cftSettingsV2&&typeof r.cftSettingsV2==='object'?r.cftSettingsV2:{};
      shiftState=r.cftShiftSessionV1&&typeof r.cftShiftSessionV1==='object'?r.cftShiftSessionV1:shiftState;
      const date=/^\d{4}-\d{2}-\d{2}$/.test(String(shiftState?.reportDate||''))?String(shiftState.reportDate):(/^\d{4}-\d{2}-\d{2}$/.test(String(st.reportDate||''))?String(st.reportDate):phtDate());
      const day=r.cftConfirmationDataV2?.dates?.[date];
      if(day?.summary){
        context={
          origin:'https://labeling-tools.augmoto.com', settings:st, today:date,
          summary:{...day.summary}, jobs:day.jobs||{}, tasks:day.tasks||{},
          bridge:r.cftTrinoTimeBridgeV2||null, sync:r.cftSyncStateV2||{}, shift:shiftState, trackingLocked:shiftState?.status!=='active'
        };
        expanded=st.hudExpanded!==false;
        initPresenceFromContext();
        render();
      }
      return true;
    }catch(_){return false;}
  }

  function getHudMaxWidthPx(targetWidth){
    return Math.max(160, Math.min(targetWidth, window.innerWidth - 12));
  }
  const intervalShown=(s,i)=>Number(s?.[`interval${i}DisplayTotal`] ?? s?.[`interval${i}`] ?? 0)||0;

  function header(){
    if(!route())return null;
    const text=document.body?.innerText||document.body?.textContent||'';
    const matches=[...text.matchAll(/(JOB_[A-Za-z0-9_-]+)\s*-?\s*tasks?\s*:\s*(\d+)\s*\/\s*(\d+)/ig)];
    const m=matches.at(-1);
    return m?{jobId:m[1].toUpperCase(),taskIndex:Number(m[2]),totalTasks:Number(m[3])}:null;
  }
  function hasOpenTask(){return Boolean(current.jobId&&current.taskIndex);}
  function isAwayNow(){return searchPresence?.isAway()===true;}
  function computePresenceState(now=Date.now()){
    if(shiftState?.status!=='active')return 'offline';
    if(!route()||!activityOwned)return 'paused';
    searchPresence?.sync(hasOpenTask(),true);
    integrity?.sync(hasOpenTask(),true,hasOpenTask()?`${current.jobId}|${current.taskIndex}`:'',`${shiftState?.sessionId||''}|${shiftState?.generation||''}`);
    const base=isAwayNow()?'away':!hasOpenTask()?(searchPresence?.state(now)||'idle'):now-lastInteraction>=MANAGED_IDLE_MS?'unverified':'active';
    return integrity?.state(base,{hasTask:hasOpenTask(),visible:!document.hidden,focused:document.hasFocus(),osAway:isAwayNow()},now)||base;
  }
  function presencePayload(state=computePresenceState(),now=Date.now()){
    return {
      timestamp:now,date:reportDate(),jobId:current.jobId,taskIndex:current.taskIndex,totalTasks:current.totalTasks,
      trackerState:state,lastActivityAt:lastInteraction,
      idleSinceAt:state==='idle'?(hasOpenTask()?Math.max(0,lastInteraction+MANAGED_IDLE_MS):Math.max(0,searchPresence?.idleSince(now)||queueIdleSinceAt||now)):0,
      awaySinceAt:state==='away'?(awaySinceAt||now):0,presenceUpdatedAt:now,idleThresholdMs:MANAGED_IDLE_MS,
      pageVisible:!document.hidden,pageFocused:document.hasFocus()
    };
  }
  function updateLocalPresence(state,now=Date.now(),paint=true){
    presenceState=state;
    if(context?.summary){
      const s=context.summary;s.trackerState=state;s.lastActivityAt=lastInteraction;
      s.idleSinceAt=state==='idle'?(hasOpenTask()?Math.max(0,lastInteraction+MANAGED_IDLE_MS):Math.max(0,searchPresence?.idleSince(now)||queueIdleSinceAt||now)):0;
      s.awaySinceAt=state==='away'?(awaySinceAt||now):0;s.presenceUpdatedAt=now;s.idleThresholdMs=MANAGED_IDLE_MS;
    }
    if(paint)render();
  }
  function emitPresence(state=computePresenceState(),force=false){
    if(!route()||!context)return;
    const now=Date.now();
    if(!force&&state===lastPresenceSentState&&now-lastPresenceSentAt<1800){updateLocalPresence(state,now,false);return;}
    updateLocalPresence(state,now);lastPresenceSentState=state;lastPresenceSentAt=now;
    send('cft-presence',{payload:presencePayload(state,now)}).catch(()=>{});
  }
  function clearIdleBoundary(){if(idleBoundaryTimer)clearTimeout(idleBoundaryTimer);idleBoundaryTimer=null;}
  function scheduleIdleBoundary(){
    clearIdleBoundary();if(!route()||!hasOpenTask()||isAwayNow())return;
    const remaining=lastInteraction+MANAGED_IDLE_MS-Date.now();
    if(remaining<=0){if(computePresenceState()==='idle')emitPresence('idle',true);return;}
    idleBoundaryTimer=setTimeout(()=>{idleBoundaryTimer=null;if(route()&&hasOpenTask()&&computePresenceState()==='idle')emitPresence('idle',true);},Math.min(remaining+25,2147480000));
  }
  function isHudEvent(event){return event?.target instanceof Element&&Boolean(event.target.closest('#'+ID));}
  function noteActivity(event){
    if(!route()||isHudEvent(event)||event?.isTrusted===false)return;
    updateActivityOwner();
    const was=computePresenceState();if(['grace','unverified'].includes(presenceState)&&integrity?.isMeaningful(event,hasOpenTask()))recordPresenceTime(Date.now(),presenceState);searchPresence?.record(event,hasOpenTask(),shiftState?.status==='active');if(integrity?.record(event,hasOpenTask(),shiftState?.status==='active'))lastInteraction=Date.now();awaySinceAt=0;const next=computePresenceState();
    if(next!==was||next!==presenceState)emitPresence(next,true);
    else updateLocalPresence(next,Date.now(),false);
    scheduleIdleBoundary();
  }
  function handleVisibilityOrFocus(){
    recordPresenceTime(Date.now(),presenceState);
    updateActivityOwner(true);
    if(!route()){clearIdleBoundary();return;}
    if(!document.hidden)scan().catch(()=>{});
    searchPresence?.poll(true).then(()=>emitPresence(computePresenceState(),true)).catch(()=>{});
    if(isAwayNow()){if(!awaySinceAt)awaySinceAt=Date.now();clearIdleBoundary();emitPresence('away',true);return;}
    awaySinceAt=0;if(!hasOpenTask()&&(presenceState==='away'||!queueIdleSinceAt))queueIdleSinceAt=Date.now();
    emitPresence(computePresenceState(),true);scheduleIdleBoundary();
  }
  function recordPresenceTime(at,state){
    const start=lastTick,delta=Math.min(60000,Math.max(0,at-start));lastTick=at;
    if(delta<250||shiftState?.status!=='active'||!context||!activityOwned)return;
    const deadline=state==='grace'?integrity?.graceDeadlineAt():0;
    const grace=state==='grace'?(deadline?Math.min(delta,Math.max(0,Math.min(at,deadline)-Math.max(start,at-60000))):delta):0;
    const unverified=state==='unverified'?delta:(state==='grace'?delta-grace:0);
    send('cft-time',{payload:{...presencePayload(state,at),elapsedMs:delta,
      activeMs:state==='active'?delta:0,idleMs:state==='idle'||state==='away'?delta:0,
      awayMs:state==='away'?delta:0,searchingMs:state==='searching'?delta:0,
      graceMs:grace,unverifiedMs:unverified}}).catch(()=>{});
  }

  function tick(){
    const now=Date.now();
    updateActivityOwner();
    if(!route()||!context||!activityOwned){lastTick=now;return;}
    // Work-tool transitions are settled separately to preserve short GRACE periods.

    if(!hasOpenTask()&&!queueIdleSinceAt)queueIdleSinceAt=now;
    if(isAwayNow()){if(!awaySinceAt)awaySinceAt=now;}else awaySinceAt=0;
    searchPresence?.poll().then(s=>{if(s==='idle'||s==='locked')emitPresence(computePresenceState(),true);}).catch(()=>{});
    const state=computePresenceState(now);
    recordPresenceTime(now,presenceState==='grace'?'grace':state);
    updateLocalPresence(state,now);if(state==='active')scheduleIdleBoundary();
  }
  function initPresenceFromContext(){
    if(presenceInitialized||!context?.summary)return;
    const s=context.summary,preservedJob=String(s.currentJob||''),preservedTask=Number(s.currentTask)||0;
    presenceState=String(s.trackerState||'idle').toLowerCase();
    lastInteraction=Math.max(0,Number(s.lastActivityAt)||Date.now());
    current={jobId:preservedJob,taskIndex:preservedTask,totalTasks:Number(s.totalTasks)||0};
    if(preservedJob&&preservedTask){
      resumePresence={...current,trackerState:presenceState,lastActivityAt:lastInteraction,idleSinceAt:Math.max(0,Number(s.idleSinceAt)||0),awaySinceAt:Math.max(0,Number(s.awaySinceAt)||0)};
      lastAnnouncedJob=`${preservedJob}|${preservedTask}|${Number(s.totalTasks)||0}`;
      awaySinceAt=isAwayNow()?Math.max(0,Number(s.awaySinceAt)||Date.now()):0;queueIdleSinceAt=0;
    }else{
      current={jobId:'',taskIndex:0,totalTasks:0};
      queueIdleSinceAt=presenceState==='idle'&&Number(s.idleSinceAt)>0?Number(s.idleSinceAt):Date.now();
      awaySinceAt=presenceState==='away'&&Number(s.awaySinceAt)>0?Number(s.awaySinceAt):0;
    }
    lastTick=Date.now();presenceInitialized=true;
  }

  function fmt(ms){
    const totalSeconds=Math.floor((Number(ms)||0)/1000),h=Math.floor(totalSeconds/3600),m=Math.floor((totalSeconds%3600)/60),sec=totalSeconds%60;
    return h?`${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`:`${m}:${String(sec).padStart(2,'0')}`;
  }
  function storePending(){
    // Synchronous persistence before a new Submit can replace an older intent.
    // Existing v2.3.x single-pending storage remains readable for upgrades.
    try {
      if(pending)sessionStorage.setItem(PENDING,JSON.stringify(pending));else sessionStorage.removeItem(PENDING);
      if(receiptBacklog.length)sessionStorage.setItem(BACKLOG,JSON.stringify(receiptBacklog));
      else sessionStorage.removeItem(BACKLOG);
      return true;
    }catch(error){message='Submit ledger storage unavailable; counts unchanged.';return false;}
  }
  function matchingShiftIntent(intent,now=Date.now(),maxAge=120000){
    const started=Number(intent?.startedAt||0), age=now-started;
    return Boolean(intent?.id && intent?.jobId && Number(intent.taskIndex)>0 &&
      Number(intent.totalTasks)>=Number(intent.taskIndex) && Number.isFinite(started) &&
      age>=0 && age<=maxAge && shiftState?.status==='active' &&
      String(intent.date||'')===String(reportDate()) &&
      String(intent.shiftSessionId||'')===String(shiftState?.sessionId||'') &&
      Number(intent.shiftGeneration)===Number(shiftState?.generation));
  }
  function taskAdvancedAfterSubmit(intent,next){
    return Boolean(next?.jobId && intent?.jobId &&
      ((String(next.jobId)===String(intent.jobId) && Number(next.taskIndex)>Number(intent.taskIndex)) ||
       String(next.jobId)!==String(intent.jobId)));
  }
  function canQueuePreviousSubmit(intent,next,now=Date.now()){
    if(!matchingShiftIntent(intent,now) || !next ||
       intent.pageInstanceId!==PAGE_INSTANCE_ID || !taskAdvancedAfterSubmit(intent,next) ||
       now-Number(intent.startedAt)<150 ||
       (skipIntent && String(skipIntent.jobId)===String(intent.jobId) && Number(skipIntent.taskIndex)===Number(intent.taskIndex)))return false;
    const text=document.body?.innerText||document.body?.textContent||'';
    return !/submission failed|unable to submit|required field|failed to submit/i.test(text);
  }
  async function drainSubmissionLedger(){
    if(backlogProcessing || !receiptBacklog.length || !context || shiftState?.status!=='active')return;
    backlogProcessing=true;
    try{
      // One acknowledged item at a time. Never drop a record on a message error,
      // background restart or failed chrome.storage.local write.
      for(const intent of [...receiptBacklog]){
        if(!receiptBacklog.includes(intent))continue;
        if(!matchingShiftIntent(intent,Date.now(),Infinity) || !intent.observedNext ||
           !taskAdvancedAfterSubmit(intent,intent.observedNext)){
          // Old-shift entries remain quarantined, not replayed into a new shift.
          if(String(intent.shiftSessionId||'')!==String(shiftState?.sessionId||'') ||
             Number(intent.shiftGeneration)!==Number(shiftState?.generation) ||
             String(intent.date||'')!==String(reportDate()))continue;
          // An observed successful transition must NOT be discarded because
          // the network was unavailable for several minutes. Retain it until
          // the same shift safely acknowledges it; other-shift data is inert.
          continue;
        }
        try{
          if(intent.ready!==true){
            const ack=await event('submit-pending',intent);
            if(!ack?.ok || ack.frozen)continue;
            intent.date=ack.date||intent.date;intent.ready=true;
            if(!storePending())continue;
          }
          await event('submit-confirmed',{...intent,confirmedBy:'queued-verified-task-transition'});
          receiptBacklog=receiptBacklog.filter(x=>x!==intent);
          storePending();
          message='Submission counted.';
        }catch(_){/* Keep original ID for guarded automatic retry. */}
      }
    }finally{backlogProcessing=false;}
  }
  // An accepted Confirmation Submit can return to Jobs (even before the last
  // numbered task when other labelers took the rest). That is not Exit/Skip.
  // Only a recent, explicitly captured and background-accepted Submit can count.
  // Pure task advances are not proof of task submission (Skip, reload, navigation).
  function verifiedConfirmationIntent(intent,now=Date.now()) {
    const started=Number(intent?.startedAt||0),age=now-started;
    return Boolean(intent && intent.ready===true && intent.id && intent.jobId &&
      Number(intent.taskIndex)>0 && Number(intent.totalTasks)>0 &&
      Number.isFinite(started) && age>=0 && age<=120000 &&
      String(intent.date||'')===String(reportDate()) &&
      String(intent.shiftSessionId||'')===String(shiftState?.sessionId||'') &&
      Number(intent.shiftGeneration)===Number(shiftState?.generation));
  }
  function verifiedConfirmationTaskAdvance(intent,prior,next) {
    return Boolean(verifiedConfirmationIntent(intent) && prior && next &&
      String(intent.jobId)===String(prior.jobId) && Number(intent.taskIndex)===Number(prior.taskIndex) &&
      ((next.jobId===intent.jobId && Number(next.taskIndex)>Number(intent.taskIndex)) ||
       (next.jobId && next.jobId!==intent.jobId)));
  }
  function recentConfirmationSubmitPending() {
    return Boolean(verifiedConfirmationIntent(pending) && pending.jobId &&
      Number(pending.taskIndex) > 0 && Number(pending.totalTasks) > 0 &&
      // Augmoto may return to the Jobs list before the final numbered task
      // when concurrent labelers have already taken the remaining tasks.
      Date.now() - Number(pending.startedAt || 0) < 90000 &&
      (!pending.shiftSessionId || pending.shiftSessionId === shiftState?.sessionId) &&
      (!pending.shiftGeneration || Number(pending.shiftGeneration) === Number(shiftState?.generation)));
  }
  function confirmationLandingVisible(text) {
    const body=String(text||'').replace(/\s+/g,' ').trim();
    if(!body || /JOB_[A-Za-z0-9_-]+\s*-?\s*tasks?\s*:\s*\d+\s*\/\s*\d+/i.test(body))return false;
    const taskButtons=[...document.querySelectorAll('button,[role="button"]')].some(el=>
      ['submit','skip','exit'].includes(String(el.innerText||el.textContent||'').trim().toLowerCase()) &&
      !el.disabled && el.getBoundingClientRect().width > 0);
    return !taskButtons && /\bFilters\b/i.test(body) && /\bStore\b/i.test(body) &&
      /\bJobs\b/i.test(body) && /\bConfirmation Jobs\b/i.test(body);
  }
  function canRestoreConfirmationQueueReceipt(now=Date.now()) {
    const p=pending;
    if(!p || p.ready===true || !context || shiftState?.status!=='active')return false;
    // A refresh/back-forward into the queue is not evidence of a new Submit.
    let navType='';
    try{navType=performance.getEntriesByType('navigation')[0]?.type||'';}catch(_){}
    if(navType!=='navigate')return false;
    const started=Number(p.startedAt||0),age=now-started;
    if(!p.id || !p.jobId || !Number.isInteger(Number(p.taskIndex)) || Number(p.taskIndex)<1 ||
       !Number.isInteger(Number(p.totalTasks)) || Number(p.totalTasks)<1 ||
       !Number.isFinite(started) || age<450 || age>=90000 ||
       String(p.date||'')!==String(reportDate()) ||
       String(p.shiftSessionId||'')!==String(shiftState?.sessionId||'') ||
       Number(p.shiftGeneration)!==Number(shiftState?.generation))return false;
    const text=document.body?.innerText||document.body?.textContent||'';
    if(/submission failed|unable to submit|required field|failed to submit/i.test(text))return false;
    return confirmationLandingVisible(text);
  }
  async function restoreConfirmationQueueReceipt(){
    if(queueReceiptRecoveryBusy || !canRestoreConfirmationQueueReceipt())return false;
    const now=Date.now();
    if(now-queueReceiptRecoveryAt<1500)return false;
    queueReceiptRecoveryAt=now;queueReceiptRecoveryBusy=true;
    const intent=pending;
    try{
      // This is an idempotent *pending* event using the original Submit ID,
      // not a submit-confirmed event. It closes the acknowledgement-loss race
      // after a full page navigation, without bypassing background authority.
      const receipt=await event('submit-pending',intent);
      if(pending!==intent || !receipt?.ok || receipt.frozen)return false;
      intent.date=receipt.date||intent.date;
      intent.ready=true;storePending();
      return true;
    }catch(_){return false;}
    finally{queueReceiptRecoveryBusy=false;}
  }
  function canRestoreConfirmationTransitionReceipt(prior,next,now=Date.now()) {
    const p=pending;
    const age=now-Number(p?.startedAt||0);
    if(!p || p.ready===true || !context || shiftState?.status!=='active' ||
       !p.id || !p.jobId || !p.pageInstanceId || p.pageInstanceId!==PAGE_INSTANCE_ID ||
       !Number.isFinite(age) || age<150 || age>=90000 ||
       String(p.date||'')!==String(reportDate()) ||
       String(p.shiftSessionId||'')!==String(shiftState?.sessionId||'') ||
       Number(p.shiftGeneration)!==Number(shiftState?.generation))return false;
    if(skipIntent && String(skipIntent.jobId)===String(p.jobId) &&
       Number(skipIntent.taskIndex)===Number(p.taskIndex))return false;
    const text=document.body?.innerText||document.body?.textContent||'';
    if(/submission failed|unable to submit|required field|failed to submit/i.test(text))return false;
    // Require a real observed task change after an explicit trusted Submit.
    // A click without an advancing task or new job is never a count.
    return Boolean(prior && next && String(prior.jobId)===String(p.jobId) &&
       Number(prior.taskIndex)===Number(p.taskIndex) && Number(p.taskIndex)>0 &&
       Number(p.totalTasks)>=Number(p.taskIndex) &&
       ((String(next.jobId)===String(p.jobId) && Number(next.taskIndex)>Number(p.taskIndex)) ||
        (next.jobId && String(next.jobId)!==String(p.jobId))));
  }
  async function restoreConfirmationTransitionReceipt(prior,next){
    if(transitionReceiptRecoveryBusy || !canRestoreConfirmationTransitionReceipt(prior,next))return false;
    const now=Date.now();
    if(now-transitionReceiptRecoveryAt<650)return false;
    transitionReceiptRecoveryAt=now;transitionReceiptRecoveryBusy=true;
    const intent=pending;
    try{
      // Re-send the original pending ID. Background must durably accept it
      // before we can submit a corresponding verified completion event.
      const receipt=await event('submit-pending',intent);
      if(pending!==intent || !receipt?.ok || receipt.frozen)return false;
      intent.date=receipt.date||intent.date;
      intent.ready=true;storePending();
      return true;
    }catch(_){return false;}
    finally{transitionReceiptRecoveryBusy=false;}
  }
  async function verifyConfirmationQueueLanding(){
    if(!recentConfirmationSubmitPending())return false;
    // Exit / Skip is never a completed task, even if the page reaches Jobs.
    if(skipIntent && skipIntent.jobId===pending.jobId && Number(skipIntent.taskIndex)===Number(pending.taskIndex))return false;
    const text=document.body?.innerText||document.body?.textContent||'';
    if(/submission failed|unable to submit|required field|failed to submit/i.test(text)) {
      await event('submit-cancelled',pending).catch(()=>{});pending=null;storePending();return false;
    }
    if(Date.now()-Number(pending.startedAt||0)<450 || !confirmationLandingVisible(text))return false;
    const intent=pending;
    await event('submit-confirmed',{...intent,confirmedBy:'verified-confirmation-queue'});
    if(pending===intent){pending=null;storePending();message='Queue-return submission counted.';}
    if(!route())await send('cft-mode-leave').catch(()=>{});
    return true;
  }
  async function event(type,p){if(type==='submit-confirmed' && p?.confirmedBy!=='queued-verified-task-transition'){try{Promise.resolve(window.TrinoTimeQCEfficiency?.flush()).catch(()=>{});}catch(_){}}const r=await send('cft-event',{event:{...p,type,eventId:p.id+'-'+type,timestamp:Date.now()}});if(!r?.ok||r?.frozen)throw new Error(r?.error||(r?.frozen?'Shift not active; submission not accepted.':'Counter unavailable'));return r;}
  function build(){
    if(root||!document.body)return;
    root=document.createElement('aside');root.id=ID;root.setAttribute('aria-label','Confirmation Activity Tracker');
    root.style.cssText='position:fixed;bottom:12px;left:12px;max-width:calc(100vw - 24px);box-sizing:border-box;z-index:2147483646;background:rgba(255,255,255,.97);color:#142033;border:1px solid rgba(15,23,42,.12);border-radius:16px;box-shadow:0 10px 24px rgba(15,23,42,.14);padding:0;font:600 11px/1.35 system-ui,-apple-system,"Segoe UI",sans-serif;transition:width .14s ease,height .14s ease;overflow:hidden;backdrop-filter:blur(8px);user-select:none';
    const title=document.createElement('strong');title.textContent='Confirmation';title.style.cssText='display:none';
    toggle=document.createElement('button');toggle.type='button';toggle.style.cssText='position:absolute;top:9px;right:9px;z-index:1;border:1px solid rgba(15,23,42,.10);background:#fff;color:#0F2E6D;border-radius:10px;width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;padding:0;font:800 14px/1 system-ui;cursor:pointer;box-shadow:0 2px 6px rgba(15,23,42,.10)';
    toggle.onclick=()=>{expanded=!expanded;render();send('cft-settings',{patch:{hudExpanded:expanded}}).catch(()=>{});requestAnimationFrame(()=>{try{toggle.blur();}catch(_){}try{window.focus();}catch(_){}});};
    body=document.createElement('div');body.dataset.ttBody='';root.append(title,toggle,body);document.body.append(root);
    body.addEventListener('change',async e=>{if(!e.target.matches('[data-interval]'))return;try{const r=await send('cft-select-report',{date:context.today,interval:Number(e.target.value)});if(!r?.ok)throw Error(r?.error);message='';}catch(error){message=error.message;}await refresh();});
  }
  function render(){
    build();if(!root)return;root.hidden=!route();root.dataset.ttCompact=expanded?'false':'true';root.style.width=`${getHudMaxWidthPx(expanded?216:168)}px`;root.style.height=expanded?'auto':'44px';toggle.textContent=expanded?'−':'+';toggle.setAttribute('aria-label',expanded?'Minimize Confirmation':'Expand Confirmation');toggle.setAttribute('aria-expanded',String(expanded));
    window.TrinoTimeHudAppearance?.attach(root);
    window.TrinoTimeHudAppearance?.place(root);
    if(!context){body.innerHTML=`<div style="padding:10px 43px 10px 10px;color:#64748b;font:700 10px system-ui">${esc(message||'Loading counter…')}</div>`;return;}const s=context.summary;if(body.contains(document.activeElement))return;
    const total=intervalShown(s,1)+intervalShown(s,2)+intervalShown(s,3),activeJob=liveHeader?.jobId?liveHeader:(current.jobId?current:(s.currentJob?{jobId:s.currentJob,taskIndex:s.currentTask||0,totalTasks:s.totalTasks||0}:null));
    const jobLabel=activeJob?.jobId?`${activeJob.jobId}${activeJob.taskIndex?` · ${activeJob.taskIndex}/${activeJob.totalTasks||0}`:''}`:'No active job';
    const shiftStatus=String(shiftState?.status||context.shift?.status||'not_clocked_in');
    const bridgeName=context.bridge?.actor?.name||'Agent',status=shiftStatus==='completed'?'Final totals locked · Time In again to start a new session':shiftStatus==='not_clocked_in'?'Tracker waits for TrinoTime Time In':message||(pending?'Waiting for submission…':context.sync?.lastError||(context.bridge?`Connected · ${bridgeName}`:'Not connected'));
    const state=shiftStatus==='active'?String(s.trackerState||presenceState||'idle').toLowerCase():'offline',focusedIdle=Math.max(0,(Number(s.idleMs)||0)-(Number(s.awayMs)||0));
    const stateTone=state==='grace'?{bg:'#E9F4FF',fg:'#1C5AA6',dot:'#2B8CEE'}:state==='unverified'?{bg:'#FFF4DB',fg:'#9A6700',dot:'#F0B429'}:state==='searching'?{bg:'#E9F4FF',fg:'#1C5AA6',dot:'#2B8CEE'}:state==='active'?{bg:'#E7F6EE',fg:'#177245',dot:'#1CA86A'}:state==='idle'?{bg:'#FFF4DB',fg:'#9A6700',dot:'#F0B429'}:state==='away'?{bg:'#EEF2F7',fg:'#445269',dot:'#94A3B8'}:{bg:'#EEF2F7',fg:'#445269',dot:'#94A3B8'};
    const stateLabel=shiftStatus==='completed'?'SHIFT COMPLETE':shiftStatus==='not_clocked_in'?'TIME IN REQUIRED':state==='active'?'ACTIVE':state==='idle'?'IDLE':state==='away'?'AWAY':state.toUpperCase();
    const syncAge=context.sync?.lastSyncAt?Math.max(0,Date.now()-Number(context.sync.lastSyncAt)):Infinity;
    const syncLabel=context.bridge?(context.sync?.lastError?'SYNC ERROR':syncAge<30000?'LIVE':'SYNC'):'LOCAL';
    const syncTone=syncLabel==='SYNC ERROR'?{bg:'#FDECEC',fg:'#B42318',dot:'#F04438'}:syncLabel==='LIVE'?{bg:'#E7F6EE',fg:'#177245',dot:'#1CA86A'}:{bg:'#EEF2F7',fg:'#445269',dot:'#94A3B8'};
    if(!expanded){
      const miniState=stateLabel==='TIME IN REQUIRED'?'TIME IN':stateLabel==='SHIFT COMPLETE'?'DONE':stateLabel;
      const miniSync=syncLabel==='SYNC ERROR'?'ERROR':syncLabel;
      const fullLabel=`Confirmation · ${esc(bridgeName)} · ${esc(miniState)} · ${esc(miniSync)}`;
      root.title=fullLabel;
      body.innerHTML=`
        <div data-tt-micro-content style="height:44px;box-sizing:border-box;display:flex;align-items:center;padding:5px 66px 5px 8px;background:linear-gradient(180deg,#ffffff 0%,#f7f9fc 100%);">
          <div style="display:flex;flex-direction:column;justify-content:center;gap:5px;min-width:0;width:100%;overflow:hidden;">
            <span data-tt-title title="${fullLabel}" style="display:block;overflow:hidden;text-overflow:ellipsis;font:850 10px/1 system-ui,-apple-system,Segoe UI,sans-serif;letter-spacing:.03em;color:#0F2E6D;">CONFIRM <span style="color:#C2410C;font-size:7px;letter-spacing:0">PROD</span></span>
            <span style="display:flex;align-items:center;gap:4px;min-width:0;white-space:nowrap;font:750 9px/1 system-ui,-apple-system,Segoe UI,sans-serif;color:${stateTone.fg};">
              <span style="width:6px;height:6px;flex:0 0 6px;border-radius:50%;background:${stateTone.dot};"></span>
              <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;">${esc(miniState)} · ${esc(miniSync)}</span>
            </span>
          </div>
        </div>`;
      return;
    }
    root.removeAttribute('title');
    body.innerHTML=`
      <div style="padding:9px 9px 7px;background:linear-gradient(180deg,#ffffff 0%,#f7f9fc 100%);border-bottom:1px solid rgba(15,23,42,.08)">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:7px;padding-right:0;">
          <div style="min-width:0;display:flex;flex-direction:column;gap:5px;">
            <span data-tt-title style="font:800 11px/1 system-ui,-apple-system,Segoe UI,sans-serif;letter-spacing:.09em;color:#0F2E6D;white-space:nowrap;">CONFIRMATION <span style="color:#c2410c;font-size:8px;letter-spacing:.04em">PROD</span></span>
            <div style="display:flex;gap:5px;align-items:center;">
              <span style="display:inline-flex;align-items:center;gap:5px;padding:3px 6px;border-radius:999px;background:${stateTone.bg};color:${stateTone.fg};font:800 9px/1.1 system-ui,-apple-system,Segoe UI,sans-serif;"><span style="width:6px;height:6px;border-radius:999px;background:${stateTone.dot};"></span>${stateLabel}</span>
              <span style="display:inline-flex;align-items:center;gap:5px;padding:3px 6px;border-radius:999px;background:${syncTone.bg};color:${syncTone.fg};font:800 9px/1.1 system-ui,-apple-system,Segoe UI,sans-serif;"><span style="width:6px;height:6px;border-radius:999px;background:${syncTone.dot};"></span>${syncLabel}</span>
            </div>
          </div>
        </div>
        ${context.bridge?.actor?.name?`<div title="${esc(context.bridge.actor.name)}" style="margin-top:5px;max-width:168px;color:#334155;font:800 9px/1.2 system-ui,-apple-system,Segoe UI,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Agent · ${esc(context.bridge.actor.name)}</div>`:''}
        <div style="display:flex;align-items:center;justify-content:space-between;gap:7px;margin-top:5px;min-width:0;">
          <span style="min-width:0;color:#667085;font:600 8px/1.2 system-ui,-apple-system,Segoe UI,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">EOD ${esc(context.today)}</span>
          <label style="display:inline-flex;align-items:center;gap:4px;flex:none;color:#64748B;font:800 7px/1 system-ui,-apple-system,Segoe UI,sans-serif;letter-spacing:.05em;text-transform:uppercase;">Interval <select data-interval ${(pending||shiftStatus!=='active')?'disabled':''} aria-label="Current Confirmation interval" style="width:34px;height:19px;padding:0 3px;border:1px solid rgba(15,23,42,.10);border-radius:6px;background:#fff;color:#334155;font:800 9px/1 system-ui;outline:none">${[1,2,3].map(i=>`<option value="${i}" ${s.currentInterval===i?'selected':''}>${i}</option>`).join('')}</select></label>
        </div>
        <div title="${esc(jobLabel)}" style="margin-top:3px;color:#475569;font:700 8px/1.2 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(jobLabel)}</div>
      </div>
      <div style="padding:7px 9px 8px;background:#ffffff;display:flex;flex-direction:column;gap:6px;">
        <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:3px;">${[['I1',intervalShown(s,1)],['I2',intervalShown(s,2)],['I3',intervalShown(s,3)],['EOD',total]].map(([label,value],idx)=>`<div style="padding:4px 4px;border-radius:8px;background:${idx===3?'#F7F7FF':'#F8FAFC'};border:1px solid ${idx===3?'#D9DDFE':'rgba(15,23,42,.06)'};text-align:left"><div style="color:#64748B;font:700 8px/1 system-ui,-apple-system,Segoe UI,sans-serif;letter-spacing:.04em;">${label}</div><div style="margin-top:2px;color:${idx===3?'#4338CA':'#0F172A'};font:800 11px/1 system-ui,-apple-system,Segoe UI,sans-serif;">${value}</div></div>`).join('')}</div>
        <div style="font:650 8px/1.2 system-ui;color:#64748b" title="Automatic verified submissions and separate manual adjustment; neither is a server receipt">Auto verified ${Number(s.submitted)||0} · Manual adjustment ${Number(s.submittedManualAdjustment)>0?'+':''}${Number(s.submittedManualAdjustment)||0}</div>
        <div data-confirmation-presence style="display:flex;justify-content:space-between;gap:8px;align-items:flex-end;min-width:0;">
          <div style="min-width:0;">
            <div style="color:#64748B;font:700 7px/1.1 system-ui,-apple-system,Segoe UI,sans-serif;letter-spacing:.04em;">SYNC</div>
            <div title="${esc(status)}" style="margin-top:3px;max-width:118px;color:${context.sync?.lastError?'#B42318':context.bridge?'#177245':'#64748B'};font:800 8px/1.2 system-ui,-apple-system,Segoe UI,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(status)}</div>
          </div>
          <div style="text-align:right;flex:none;">
            <div style="color:#334155;font:700 8px/1.15 system-ui,-apple-system,Segoe UI,sans-serif;">Active ${fmt(s.activeMs||0)}</div>
            <div style="margin-top:2px;color:#1C5AA6;font:700 8px/1.15 system-ui,-apple-system,Segoe UI,sans-serif;">Search ${fmt(s.searchingMs||0)}</div>
            <div style="margin-top:2px;color:#1C5AA6;font:700 8px/1.15 system-ui,-apple-system,Segoe UI,sans-serif;">Grace ${fmt(s.graceMs||0)}</div>
            <div style="margin-top:2px;color:#9A6700;font:700 8px/1.15 system-ui,-apple-system,Segoe UI,sans-serif;" title="Not verified by Augmoto interactions; not proof of misconduct">Unverified ${fmt(s.unverifiedMs||0)}</div>
            <div style="margin-top:2px;color:#64748B;font:700 8px/1.15 system-ui,-apple-system,Segoe UI,sans-serif;">Idle ${fmt(focusedIdle)}</div>
            <div style="margin-top:2px;color:#64748B;font:700 8px/1.15 system-ui,-apple-system,Segoe UI,sans-serif;">Away ${fmt(s.awayMs||0)}</div>
          </div>
        </div>
      </div>`;
  }
  async function refresh(){context=await send('cft-context');if(!context?.summary)throw Error('Counter unavailable');lastContextRefreshAt=Date.now();shiftState=context.shift||shiftState;if(shiftState?.status!=='active'){pending=null;skipIntent=null;storePending();presenceState='offline';}initPresenceFromContext();window.TrinoTimeQCEfficiency?.prime();render();}
  async function scan(){
    if(busy)return;busy=true;
    // Keep the fast Submit/transition paths but don't continuously fetch and
    // repaint an unchanged context on every heartbeat or DOM mutation.
    const taskSignatureBeforeScan=lastAnnouncedJob;
    const hadPendingReceipt=Boolean(pending||receiptBacklog.length);
    try{
      if(receiptBacklog.length)await drainSubmissionLedger();
      if(pending?.jobId && !pending.ready)await restoreConfirmationQueueReceipt();
      if(pending?.jobId && recentConfirmationSubmitPending() && !header()){
        await verifyConfirmationQueueLanding();
      }
      if(!route()){
        // An unverified queue return is kept only for its bounded evidence
        // window. Do not let a failed navigation block future submissions.
        if(pending && Date.now()-Number(pending.startedAt||0)>=90000){
          await event('submit-cancelled',pending).catch(()=>{});
          pending=null;storePending();
        }
        lastTick=Date.now();clearIdleBoundary();
        if(root&&!root.hidden)render();
        return;
      }
      if(shiftState?.status!=='active'){pending=null;skipIntent=null;liveHeader=null;lastAnnouncedJob='';missingHeaderSince=0;resumePresence=null;current={jobId:'',taskIndex:0,totalTasks:0};presenceState='offline';lastTick=Date.now();clearIdleBoundary();storePending();render();return;}
      const h=header();
      if(h){
        const previous={...current};
        // If the pending receipt's first acknowledgment was interrupted,
        // re-acknowledge it automatically only after a verified task change.
        if(pending?.ready===false)await restoreConfirmationTransitionReceipt(
          pending?.pageInstanceId===PAGE_INSTANCE_ID ? {jobId:pending.jobId,taskIndex:pending.taskIndex} : previous,h);
        liveHeader=h;missingHeaderSince=0;const signature=`${h.jobId}|${h.taskIndex}|${h.totalTasks}`;
        const sameJobAdvanced=previous.jobId&&previous.taskIndex&&previous.jobId===h.jobId&&Number(h.taskIndex)>Number(previous.taskIndex);
        const pendingMatchesCurrent=Boolean(verifiedConfirmationIntent(pending)&&
          ((String(pending.jobId)===String(previous.jobId)&&Number(pending.taskIndex)===Number(previous.taskIndex)) ||
           (pending.pageInstanceId===PAGE_INSTANCE_ID && taskAdvancedAfterSubmit(pending,h))));
        const pendingAdvancedSameJob=pendingMatchesCurrent&&h.jobId===pending.jobId&&Number(h.taskIndex)>Number(pending.taskIndex);
        const pendingAdvancedToNewJob=pendingMatchesCurrent&&Boolean(h.jobId)&&h.jobId!==pending.jobId;
        const skipWasExplicit=skipIntent&&skipIntent.jobId===previous.jobId&&Number(skipIntent.taskIndex)===Number(previous.taskIndex)&&Date.now()-Number(skipIntent.at||0)<15000;

        // A real Confirmation Submit can advance either to the next task in the
        // same job OR directly to a different job. Augmoto frequently shows a
        // loading gap between those states, so the explicit pending Submit is
        // authoritative here; HUD expansion/minimization is irrelevant.
        if(pendingMatchesCurrent&&(pendingAdvancedSameJob||pendingAdvancedToNewJob)){
          const intent=pending;
          if(skipWasExplicit){
            await event('submit-cancelled',intent).catch(()=>{});
            await event('skip-confirmed',{...previous,date:reportDate(),id:crypto.randomUUID(),trackerState:computePresenceState(),lastActivityAt:lastInteraction,idleThresholdMs:MANAGED_IDLE_MS}).catch(()=>{});
            skipIntent=null;
          }else{
            await event('submit-confirmed',{...intent,confirmedBy:pendingAdvancedToNewJob?'new-job-transition':'task-advance'});
            message='Submission counted.';
          }
          if(pending===intent){pending=null;storePending();}
        }else if(sameJobAdvanced&&!pending){
          if(skipWasExplicit){
            await event('skip-confirmed',{...previous,date:reportDate(),id:crypto.randomUUID(),trackerState:computePresenceState(),lastActivityAt:lastInteraction,idleThresholdMs:MANAGED_IDLE_MS}).catch(()=>{});
            skipIntent=null;
          }else{
            // Do not inflate counts from navigation, Skip, page restore, or job reload.
            // The change is unverified unless an explicit Submit was captured.
            message='Task advanced without a verified Submit; counter unchanged.';
          }
        }
        const resumed=resumePresence&&resumePresence.jobId===h.jobId&&Number(resumePresence.taskIndex)===Number(h.taskIndex);
        if(resumed){current={...h};lastInteraction=Math.max(0,Number(resumePresence.lastActivityAt)||Date.now());awaySinceAt=isAwayNow()?Math.max(0,Number(resumePresence.awaySinceAt)||Date.now()):0;queueIdleSinceAt=0;resumePresence=null;emitPresence(computePresenceState(),true);scheduleIdleBoundary();}
        if(signature!==lastAnnouncedJob){
          current={...h};queueIdleSinceAt=0;
          if(!resumed){lastInteraction=Date.now();awaySinceAt=isAwayNow()?Date.now():0;}
          const startState=computePresenceState();
          await event('job-open',{...h,date:reportDate(),id:crypto.randomUUID()});
          if(!resumed)await event('task-start',{...h,date:reportDate(),id:crypto.randomUUID(),trackerState:startState,lastActivityAt:lastInteraction,idleSinceAt:0,awaySinceAt:awaySinceAt||0,idleThresholdMs:MANAGED_IDLE_MS});
          lastAnnouncedJob=signature;emitPresence(startState,true);scheduleIdleBoundary();
        }else current={...h};
      }else{
        liveHeader=null;
        if((lastAnnouncedJob||hasOpenTask())&&route()){
          if(!missingHeaderSince)missingHeaderSince=Date.now();
          // Do not clear the previous Confirmation task while an explicit Submit
          // is pending. Augmoto can spend several seconds on a blank/loading
          // screen before revealing the next task or even the next job. Keeping
          // the old task here is what lets us verify that transition reliably.
          if(!pending&&context&&Date.now()-missingHeaderSince>=1200){
            const old={...current};const exitAt=Date.now();current={jobId:'',taskIndex:0,totalTasks:0};queueIdleSinceAt=exitAt;if(isAwayNow()&&!awaySinceAt)awaySinceAt=exitAt;const exitState=computePresenceState(exitAt);
            await event('task-exit',{...old,date:reportDate(),id:crypto.randomUUID(),trackerState:exitState,lastActivityAt:lastInteraction,idleSinceAt:exitState==='idle'?queueIdleSinceAt:0,awaySinceAt:exitState==='away'?(awaySinceAt||exitAt):0,idleThresholdMs:MANAGED_IDLE_MS});
            await event('job-clear',{date:reportDate(),id:crypto.randomUUID()});
            lastAnnouncedJob='';missingHeaderSince=0;resumePresence=null;emitPresence(exitState,true);
          }
        }else missingHeaderSince=0;
      }
      // The same-tab queue may render after a full navigation. Do not erase
      // its unacknowledged click before the strict queue check can complete.
      // The bounded intent expires naturally and can never count by itself.
      if(pending&&!route()&&!recentConfirmationSubmitPending()){
        let navType='';try{navType=performance.getEntriesByType('navigation')[0]?.type||'';}catch(_){}
        const awaitingQueue=navType==='navigate' && pending.ready!==true &&
          shiftState?.status==='active' &&
          String(pending.shiftSessionId||'')===String(shiftState?.sessionId||'') &&
          Number(pending.shiftGeneration)===Number(shiftState?.generation) &&
          Date.now()-Number(pending.startedAt||0)<90000;
        if(!awaitingQueue){await event('submit-cancelled',pending);pending=null;storePending();message='';}
      }
      if(pending&&pending.ready===true){
        const text=document.body?.innerText||document.body?.textContent||'';const success=verifiedConfirmationTaskAdvance(pending,{jobId:pending.jobId,taskIndex:pending.taskIndex},h);const finalSuccess=verifiedConfirmationIntent(pending)&&pending.taskIndex===pending.totalTasks&&!h&&/successfully submitted|job completed|all tasks completed/i.test(text);const failed=/submission failed|unable to submit|required field|failed to submit/i.test(text);
        if(success||finalSuccess){await event('submit-confirmed',pending);pending=null;storePending();message='Submission counted.';}
        else if(failed||Date.now()-pending.startedAt>120000){await event('submit-cancelled',pending);pending=null;storePending();message=failed?'Submission failed; count unchanged.':'Submission could not be verified; count unchanged.';}
      }
      // A changed task, Submit receipt, or real storage update always wins.
      // Otherwise a bounded refresh keeps the HUD fresh without hammering
      // chrome.storage, DOM layout, and the background worker every 500ms.
      if(!context || hadPendingReceipt || pending || receiptBacklog.length ||
         lastAnnouncedJob!==taskSignatureBeforeScan ||
         Date.now()-lastContextRefreshAt>=4000) await refresh();
    }catch(error){message=error.message;render();}finally{busy=false;}
  }
  function confirmationControlLabel(button){
    if(!button)return '';
    const labels=[button.innerText,button.textContent,button.value,button.getAttribute?.('aria-label'),button.getAttribute?.('title')];
    for(const raw of labels){const label=String(raw||'').replace(/\s+/g,' ').trim().toLowerCase();if(label)return label;}
    return '';
  }
  function isConfirmationSubmitControl(button){
    if (!button) return false;
    // Visible child icons/badges can override an exact accessible "Submit"
    // label; check each source rather than returning the first nonempty text.
    const labels=[button.innerText,button.textContent,button.value,
      button.getAttribute?.('aria-label'),button.getAttribute?.('title')];
    return labels.some(raw => /^(?:submit|submit task|submit job|submit confirmation|submit & next|submit and next)(?:\s*\(enter\))?$/i.test(
      String(raw||'').replace(/\s+/g,' ').trim()));
  }
  document.addEventListener('click',async e=>{
    // As with Coverage, only genuine user actions may arm a Submit receipt.
    // Script-dispatched clicks or HUD events cannot produce a task count.
    if(e?.isTrusted===false)return;
    noteActivity(e);if(e.target.closest('#'+ID)||!route())return;const button=e.target.closest('button,[role="button"],input[type="submit"]');if(!button||button.disabled||button.getAttribute('aria-disabled')==='true')return;
    const label=confirmationControlLabel(button);if(label==='exit'||label==='skip'){const h=header();if(label==='skip'&&h)skipIntent={...h,at:Date.now()};else if(label==='exit')skipIntent=null;if(pending){const p=pending;pending=null;storePending();await event('submit-cancelled',p).catch(()=>{});}return;}
    if(!isConfirmationSubmitControl(button)||button.closest('[role="dialog"],dialog'))return;
    await captureExplicitConfirmationSubmit();
  },true);
  async function captureExplicitConfirmationSubmit(){
    if(!context||!route()||shiftState?.status!=='active')return;
    const h=header();if(!h)return;
    if(pending){
      // A second click on the SAME task is not a new submission. Only a
      // different task visibly reached after a trusted Submit can proceed.
      if(String(pending.jobId)===String(h.jobId) && Number(pending.taskIndex)===Number(h.taskIndex))return;
      if(receiptBacklog.length>=BACKLOG_LIMIT || !canQueuePreviousSubmit(pending,h)){
        message='Previous Submit still verifying; no new count recorded.';render();return;
      }
      const previous=pending;
      receiptBacklog.push({...previous,observedNext:{...h},transitionObservedAt:Date.now()});
      pending=null;
      if(!storePending()){
        // No silent loss on storage failure; revert to the original receipt.
        receiptBacklog.pop();pending=previous;storePending();return;
      }
      // Do not await a slow old task acknowledgment before capturing the next.
      setTimeout(()=>drainSubmissionLedger().catch(()=>{}),0);
    }
    const intent={...h,date:reportDate(),id:crypto.randomUUID(),pageInstanceId:PAGE_INSTANCE_ID,startedAt:Date.now(),ready:false,
      shiftSessionId:shiftState?.sessionId||'',shiftGeneration:Number(shiftState?.generation)||0};
    pending=intent;
    if(!storePending()){pending=null;storePending();return;}
    render();
    try{
      const p=intent,r=await event('submit-pending',p);
      if(pending===p){pending.date=r.date||pending.date;pending.ready=Boolean(r.ok);storePending();setTimeout(()=>scan().catch(()=>{}),0);}
    }catch(error){
      // A service-worker restart or interrupted message can occur even if
      // the original intent was saved. Keep it bounded and unverified; only
      // positive UI completion plus background acknowledgment can count.
      message='Submit awaiting verification';
      if(pending && shiftState?.status==='active'){pending.ready=false;storePending();}
    }
  }
  // A keyboard Enter/form submit may not produce a click on custom workflows.
  // This captures the same explicit user intent without double-counting it.
  document.addEventListener('submit',e=>{
    if(e?.isTrusted===false||!route()||!context)return;
    const button=e.submitter;
    if(!button||button.closest('[role="dialog"],dialog')||!isConfirmationSubmitControl(button))return;
    captureExplicitConfirmationSubmit().catch(()=>{});
  },true);
  document.addEventListener('keydown',noteActivity,true);
  for(const e of ['input','change'])document.addEventListener(e,noteActivity,true);
  for(const name of ['pointerdown','scroll','touchstart'])document.addEventListener(name,noteActivity,{capture:true,passive:true});
  document.addEventListener('visibilitychange',handleVisibilityOrFocus);
  window.addEventListener('pagehide',()=>{recordPresenceTime(Date.now(),presenceState);},true);
  window.addEventListener('focus',handleVisibilityOrFocus,true);window.addEventListener('focus',()=>send('cft-refresh-shift').then(()=>refresh()).catch(()=>{}),true);window.addEventListener('blur',handleVisibilityOrFocus,true);
  (async()=>{
    // Same continuity rule as Coverage: restore persisted state before the first
    // DOM scan so refresh never paints or tracks from a blank local session.
    await hydrateLocalConfirmationSnapshot();
    searchPresence?.poll(true).catch(()=>{});
    try{const c=await send('cft-context');if(c?.summary){context=c;shiftState=c.shift||shiftState;expanded=c?.settings?.hudExpanded!==false;presenceInitialized=false;initPresenceFromContext();}}catch(_){}
    await scan();
    updateActivityOwner(true);
    setTimeout(()=>{if(route()&&!hasOpenTask())emitPresence(computePresenceState(),true);},350);
  })().catch(()=>{});
  document.addEventListener('tt-qc-mode-change',e=>{
    recordPresenceTime(Date.now(),presenceState);
    updateActivityOwner(true);
    if(e.detail?.previous==='confirmation'&&e.detail.mode!=='confirmation'){
      // Leave the final Submit armed until a verified queue transition. A
      // routine route change must not silently discard a submitted last task.
      const awaitingQueue=Boolean(e.detail?.mode==='none' && pending?.ready!==true &&
        shiftState?.status==='active' && pending?.id && pending?.jobId &&
        String(pending.shiftSessionId||'')===String(shiftState?.sessionId||'') &&
        Number(pending.shiftGeneration)===Number(shiftState?.generation) &&
        Date.now()-Number(pending.startedAt||0)>=0 &&
        Date.now()-Number(pending.startedAt||0)<90000);
      if(!recentConfirmationSubmitPending()&&!awaitingQueue){tick();pending=null;skipIntent=null;liveHeader=null;lastAnnouncedJob='';missingHeaderSince=0;resumePresence=null;presenceInitialized=false;current={jobId:'',taskIndex:0,totalTasks:0};clearIdleBoundary();storePending();send('cft-mode-leave').catch(()=>{});}
    }
    if(e.detail?.mode==='confirmation'){presenceInitialized=false;lastTick=Date.now();refresh().then(()=>scan()).catch(()=>{});}else{render();scan();}
  });
  // DOM changes are the fast path. Coalesce bursts without resetting the
  // deadline on each React mutation (which could starve a real transition).
  let scanWake=null, lastMutationScanAt=0;
  try{
    const observer=new MutationObserver(muts=>{
      if(!route())return;
      if(document.hidden&&!pending&&!receiptBacklog.length)return;
      // Avoid inspecting a second mutation batch while one scan is queued.
      if(scanWake!==null)return;
      if(muts.some(m=>!(m.target instanceof Element&&m.target.closest?.('#'+ID)))){
        const delay=Math.max(90,300-(Date.now()-lastMutationScanAt));
        scanWake=setTimeout(()=>{scanWake=null;lastMutationScanAt=Date.now();scan();},delay);
      }
    });
    observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['disabled','aria-disabled','class','style']});
  }catch(_){}
  // Safety fallback for pages that change without observer-visible mutations.
  // Submit verification still gets the immediate event and mutation scans.
  setInterval(()=>{
    if((document.hidden||!route())&&!pending&&!receiptBacklog.length)return;
    scan();
  },1500);
  setInterval(tick,15000);
  chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&(changes.cftSettingsV2||changes.cftConfirmationDataV2||changes.cftSyncStateV2||changes.cftTrinoTimeBridgeV2||changes.cftShiftSessionV1))refresh().then(()=>scan()).catch(()=>{});});
})();
