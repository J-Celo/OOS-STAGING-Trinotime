(() => {
  'use strict';
  if (window.__coverageActivityTrackerV2 || window.__coverageActivityTrackerV213 || window.__coverageActivityTrackerV212 || window.__coverageActivityTrackerV211) return;
  window.__coverageActivityTrackerV2 = true;
  window.__coverageActivityTrackerV2100 = true;
  if (window !== window.top) return;

  const HUD_ID = 'cat-staging-hud-v2212';
  const EXT_VERSION = '2.2.63';
  const BUILD_CHANNEL = 'production';
  const MANAGED_IDLE_MINUTES = 5;
  const MANAGED_IDLE_MS = MANAGED_IDLE_MINUTES * 60 * 1000;

  let settings = { enabled: true, dailyGoal: 300, idleMinutes: MANAGED_IDLE_MINUTES, hudPosition: 'bottom-left', hudExpanded: true };
  let hudPreferenceRevision = 0;
  let hudPreferencePending = false;
  let syncState = {};
  let bridgeState = null;
  let shiftState = { status:'not_clocked_in', locked:true, reportDate:'' };
  let summary = {
    submitted: 0, created: 0, blurred: 0, deleted: 0, noMatch: 0, productMatched: 0,
    activeMs: 0, idleMs: 0, awayMs: 0, searchingMs: 0, graceMs: 0, unverifiedMs: 0, elapsedMs: 0,
    currentJob: '', currentTask: 0, totalTasks: 0,
    pendingSubmission: false, trackerState: 'offline', lastActivityAt: 0,
    idleSinceAt: 0, awaySinceAt: 0, presenceUpdatedAt: 0, idleThresholdMs: MANAGED_IDLE_MS
  };
  let current = { jobId: '', taskIndex: 0, totalTasks: 0, emptyArea: null, humanEmpty: null, persons: null, deleted: null, productMatched: null, noMatchState: null };
  let pending = { create: null, blur: null, del: null, noMatch: null, submit: null, skip: null };
  let lastNoMatchToggle = { key: '', at: 0 };
  let noMatchDomCandidate = { taskKey: '', signature: '', at: 0 };
  let noMatchDomLastSent = { taskKey: '', signature: '' };
  let counterDomCandidate = { taskKey: '', persons: null, deleted: null, at: 0 };
  let createDomCandidate = { taskKey: '', empty: null, human: null, at: 0 };
  let productMatchDomCandidate = { taskKey: '', matched: null, at: 0 };
  let lastInteraction = Date.now();
  let lastTick = Date.now();
  let scanTimer = null;
  let observer = null;
  let tickTimer = null;
  let idleBoundaryTimer = null;
  let lastTaskSignature = '';
  let missingHeaderSince = 0;
  let presenceState = 'idle';
  let awaySinceAt = 0;
  const searchPresence = window.TrinoTimeSearchPresence?.create('coverage');
  const integrity = window.TrinoTimeActivityIntegrity?.create('coverage');
  let queueIdleSinceAt = Date.now();
  let resumePresence = null;
  let lastPresenceSentAt = 0;
  let lastPresenceSentState = '';
  // One shared owner for activity TIME only; Submit events remain independent.
  let activityOwned = false;
  const activityCoordinator = window.TrinoTimeWorkflowCoordinator?.create('coverage', (owned,at) => {
    if (owned === activityOwned) return;
    if (!owned) {
      // Settle the previous owner's final interval before the new tab starts.
      recordPresenceTime(Math.min(Date.now(),at),presenceState);
      activityOwned = false;
      lastTick = Date.now();
      updateLocalPresence('paused');
    } else {
      activityOwned = true;
      lastTick = Date.now();
      emitPresence(computePresenceState(),true);
    }
  });
  const updateActivityOwner = (urgent = false) => activityCoordinator?.refresh(
    shiftState?.status === 'active' && settings.enabled && !confirmationRoute(), urgent
  ).catch(()=>{});


  // Augmoto permits several agents in one job; even task 2/6 may be the
  // last *available* task for this agent. Save each explicit Submit intent
  // synchronously in the current tab and asynchronously in extension storage.
  // A checkpoint alone is NOT proof of Augmoto acceptance.
  const SUBMIT_CHECKPOINT = 'catPendingSubmitCheckpointV2';
  const COVERAGE_BACKLOG_KEY = 'catVerifiedSubmitLedgerV1';
  const COVERAGE_BACKLOG_LIMIT = 48;
  const PAGE_INSTANCE_ID = crypto.randomUUID();
  let coverageBacklog = [], coverageBacklogBusy = false;
  try {
    const saved = JSON.parse(sessionStorage.getItem(COVERAGE_BACKLOG_KEY) || '[]');
    if (Array.isArray(saved)) coverageBacklog = saved.slice(0, COVERAGE_BACKLOG_LIMIT);
  } catch (_) {}
  const LEGACY_SUBMIT_CHECKPOINT = 'catFinalSubmitCheckpointV1';
  const SUBMIT_MAX_AGE_MS = 90 * 1000;
  // Some accepted Augmoto tasks transition slowly. Keep the task/shift-bound
  // click checkpoint longer, but never award a count for a bare button click.
  const ACCEPTANCE_WINDOW_MS = 45 * 1000;
  // Observe explicit, newly-rendered Augmoto success notices only. A
  // spinner, disappearing Submit button, or job-status change is not enough.
  // v2.2.49 also recognizes a guarded automatic Submit-to-Jobs transition.
  const ACCEPTED_NOTICE = /\b(?:task\s+(?:was\s+|has\s+been\s+)?submitted(?:\s+successfully)?|(?:task\s+)?successfully\s+submitted|submission\s+(?:successful|accepted|succeeded|complete(?:d)?)|submit(?:ted)?\s+successfully|task\s+(?:completed\s+successfully|successfully\s+completed)|(?:task\s+)?successfully\s+completed)\b/i;
  const REJECTED_NOTICE = /\b(?:submission\s+failed|unable\s+to\s+submit|failed\s+to\s+submit|required\s+field|not\s+submitted|submit\s+rejected)\b/i;
  let submitCheckpoint = null;
  let submitCheckpointWrite = Promise.resolve();
  // This is an ATTEMPT receipt, never a submitted-task count. Keep feedback
  // separate from acceptance evidence and authenticated server acknowledgment.
  let submitFeedback = { id:'', stage:'', at:0 };
  const SUBMIT_FEEDBACK_TEXT = {
    captured:'Submit captured · verifying completion',
    confirmed_pending_sync:'Completion verified · syncing',
    acknowledged:'Server acknowledged · counted',
    unverified:'Submit not verified · check Sync Health',
    cancelled:'Submit cancelled · not counted',
    capture_problem:'Submit capture needs review'
  };
  function feedback(stage, id='', at=Date.now()) {
    if (submitFeedback.id && id && id !== submitFeedback.id && stage !== 'captured') return;
    submitFeedback={id:id||submitFeedback.id,stage,at};
    refreshHud();
  }
  function postAttemptStatus(p, status) {
    if (!p?.id) return;
    chrome.runtime.sendMessage({type:'cat-submit-attempt-status', id:p.id, status}).catch(()=>{});
  }


  function checkpointMatchesShift(cp) {
    return Boolean(cp && cp.schemaVersion === 2 && cp.kind === 'explicit-coverage-submit' &&
      Number(cp.taskIndex) > 0 && Number(cp.totalTasks) >= Number(cp.taskIndex) &&
      /^JOB_[A-Z0-9_-]+$/i.test(String(cp.jobId || '')) &&
      cp.date === shiftState?.reportDate && shiftState?.status === 'active' &&
      cp.sessionId && cp.sessionId === shiftState?.sessionId &&
      Number(cp.generation) === Number(shiftState?.generation) &&
      cp.deviceId && cp.deviceId === bridgeState?.deviceId &&
      cp.id && Number(cp.pressedAt) > 0 && Date.now() - Number(cp.pressedAt) <= SUBMIT_MAX_AGE_MS &&
      Date.now() >= Number(cp.pressedAt));
  }

  function saveSubmitCheckpoint(p) {
    if (!(p?.jobId && Number(p.taskIndex) > 0 && Number(p.taskIndex) <= Number(p.totalTasks))) return;
    const cp = { schemaVersion: 2, kind: 'explicit-coverage-submit', id:p.id,
      jobId:p.jobId, taskIndex:p.taskIndex, totalTasks:p.totalTasks,
      pressedAt:p.at, acknowledgedAt:Number(p.acceptedAt)||0,
      queueEligible:p.queueEligible===true, queueConfirmedAt:Number(p.queueConfirmedAt)||0,
      sessionId:shiftState?.sessionId || '', generation:Number(shiftState?.generation)||0,
      date:shiftState?.reportDate || '', deviceId:bridgeState?.deviceId || '' };
    if (!checkpointMatchesShift(cp)) return;
    submitCheckpoint = cp;
    // sessionStorage survives normal in-tab page navigation without requiring
    // a service worker or delaying Augmoto's own click handler.
    try { sessionStorage.setItem(SUBMIT_CHECKPOINT, JSON.stringify(cp)); } catch (_) {}
    submitCheckpointWrite = submitCheckpointWrite.catch(() => {}).then(() =>
      chrome.storage.local.set({ [SUBMIT_CHECKPOINT]: cp }));
  }

  function clearSubmitCheckpoint() {
    submitCheckpoint = null;
    try { sessionStorage.removeItem(SUBMIT_CHECKPOINT); } catch (_) {}
    submitCheckpointWrite = submitCheckpointWrite.catch(() => {}).then(() =>
      chrome.storage.local.remove(SUBMIT_CHECKPOINT));
  }

  function resumeSubmitCheckpoint(cp, day, sameTab=false) {
    if (!checkpointMatchesShift(cp)) return false;
    const task = day?.tasks?.[`${cp.jobId}|${cp.taskIndex}`];
    if (task?.submitted === true) { clearSubmitCheckpoint(); return false; }
    submitCheckpoint = cp;
    pending.submit = { id:cp.id, at:cp.pressedAt, jobId:cp.jobId,
      taskIndex:cp.taskIndex, totalTasks:cp.totalTasks, acceptedAt:cp.acknowledgedAt||0,
      recovered:true, checkpoint:true,
      queueEligible:sameTab && cp.queueEligible===true &&
        !['reload','back_forward'].includes(performance.getEntriesByType('navigation')[0]?.type),
      queueConfirmedAt:sameTab ? Number(cp.queueConfirmedAt)||0 : 0 };
    return true;
  }

  // Every trusted Submit on a NEW Coverage task gets its own receipt. The
  // previous task must have visibly advanced after its captured Submit, and a
  // bounded same-tab ledger retains that earlier receipt until background ACK.
  // Never turn a click, Skip, reload, or validation error into a count.
  function persistCoverageBacklog() {
    try {
      if (coverageBacklog.length) sessionStorage.setItem(COVERAGE_BACKLOG_KEY, JSON.stringify(coverageBacklog));
      else sessionStorage.removeItem(COVERAGE_BACKLOG_KEY);
      return true;
    } catch (_) { feedback('capture_problem',pending.submit?.id||''); return false; }
  }
  function coverageTaskAdvanced(before, after) {
    return Boolean(before?.jobId && after?.jobId && Number(after.taskIndex)>0 &&
      (before.jobId!==after.jobId || Number(after.taskIndex)>Number(before.taskIndex)));
  }
  function canPromoteCoverageSubmit(p, after, now=Date.now()) {
    const age=now-Number(p?.at||0);
    return Boolean(p?.id && p.pageInstanceId===PAGE_INSTANCE_ID && !p.recovered &&
      Number.isFinite(age) && age>=150 && age<=ACCEPTANCE_WINDOW_MS &&
      shiftState?.status==='active' && p.sessionId===shiftState.sessionId &&
      Number(p.generation)===Number(shiftState.generation) &&
      p.date===shiftState.reportDate && p.deviceId===bridgeState?.deviceId &&
      submitCheckpoint?.id===p.id && checkpointMatchesShift(submitCheckpoint) &&
      coverageTaskAdvanced(p,after) &&
      !(pending.skip?.jobId===p.jobId && Number(pending.skip.taskIndex)===Number(p.taskIndex)) &&
      !REJECTED_NOTICE.test(document.body?.innerText||document.body?.textContent||''));
  }
  async function drainCoverageSubmitLedger() {
    if(coverageBacklogBusy || !coverageBacklog.length || shiftState?.status!=='active')return;
    coverageBacklogBusy=true;
    try {
      for(const intent of [...coverageBacklog]) {
        if(!coverageBacklog.includes(intent) || !intent?.id || !coverageTaskAdvanced(intent,intent.observedNext) ||
           intent.sessionId!==shiftState.sessionId || Number(intent.generation)!==Number(shiftState.generation) ||
           intent.date!==shiftState.reportDate || intent.deviceId!==bridgeState?.deviceId)continue;
        try {
          const result=await send('cat-event',{event:{
            eventId:`submit-confirmed-${intent.id}`,type:'submit-confirmed',timestamp:Date.now(),
            date:intent.date,jobId:intent.jobId,taskIndex:intent.taskIndex,totalTasks:intent.totalTasks,
            confirmedBy:'coverage-queued-task-transition'
          }});
          if(!result?.ok || result.frozen || result.skipped)continue;
          coverageBacklog=coverageBacklog.filter(row=>row!==intent);
          // If session storage fails here, its old entry remains for an
          // idempotent replay on reload; the accepted task won't count twice.
          persistCoverageBacklog();
        }catch(_){/* Preserve the original receipt for automatic retry. */}
      }
    }finally{coverageBacklogBusy=false;}
  }

  function recordUnverifiedSubmit(p, reason='no-acceptance-evidence') {
    if (!p?.id || !p?.jobId || !p?.taskIndex) return;
    // Bounded QA-only evidence. No agent name, annotation content, or URL.
    postAttemptStatus(p,'unverified');
    feedback('unverified',p.id);
    chrome.storage.local.get('catUnverifiedSubmissionsV1').then(saved => {
      const items=Array.isArray(saved.catUnverifiedSubmissionsV1)?saved.catUnverifiedSubmissionsV1:[];
      if(items.some(item=>item.id===p.id))return;
      items.push({id:p.id,jobId:p.jobId,taskIndex:p.taskIndex,totalTasks:p.totalTasks,
        pressedAt:p.at,recordedAt:Date.now(),reason,
        reportDate:shiftState?.reportDate||'',shiftSessionId:shiftState?.sessionId||'',
        shiftGeneration:Number(shiftState?.generation)||0,reviewStatus:'unverified'});
      return chrome.storage.local.set({catUnverifiedSubmissionsV1:items.slice(-40)});
    }).catch(()=>{});
  }

  function captureAcceptedNoticeFromMutations(mutations) {
    const p=pending.submit;
    if(!p || p.confirming || p.recovered && !p.checkpoint ||
       Date.now()-Number(p.at)>ACCEPTANCE_WINDOW_MS) return;
    const candidates=[];
    for(const m of mutations){
      if(m.type==='characterData' && m.target.parentElement) candidates.push(m.target.parentElement);
      if(m.type==='childList') for(const n of m.addedNodes){
        if(n.nodeType===1)candidates.push(n);
        else if(n.nodeType===3 && n.parentElement)candidates.push(n.parentElement);
      }
    }
    for(const el of candidates.slice(0,30)){
      if(el.closest?.('#'+HUD_ID) || el.closest?.('[id^="cft-confirmation-staging-hud"]'))continue;
      const text=String(el.textContent||'').trim().slice(0,200);
      if(REJECTED_NOTICE.test(text)){cancelSubmitNavigation();return;}
      if(!ACCEPTED_NOTICE.test(text))continue;
      const isNotice=Boolean(el.closest?.('[role="status"],[role="alert"],[data-sonner-toast],.Toastify__toast,[class*="toast"],[class*="snackbar"],[class*="notification"]') ||
        el.querySelector?.('[role="status"],[role="alert"],[data-sonner-toast],.Toastify__toast'));
      if(!isNotice)continue; // Unrelated page text is not a receipt.
      p.acceptedAt=Date.now();
      saveSubmitCheckpoint(p);
      confirmPendingSubmit('augmoto-success-notice',confirmationRoute());
      return;
    }
  }

  const clean = v => String(v || '').replace(/\s+/g, ' ').trim();
  const esc = v => clean(v).replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
  const lower = v => clean(v).toLowerCase();
  const eventId = type => `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  function cleanupLegacyHudNodes() {
    // production uses its own DOM namespace so production and QA HUD nodes cannot collide.
    const all = document.querySelectorAll('[id^="cat-staging-hud"]');
    all.forEach(node => {
      if (node.id !== HUD_ID) node.remove();
    });
    const current = document.getElementById(HUD_ID);
    if (current && current.dataset.catVersion && current.dataset.catVersion !== EXT_VERSION) current.remove();
  }

  function getHudMaxWidthPx(targetWidth) {
    // Floating HUD follows the viewport, not the navigation divider.
    return Math.max(160, Math.min(targetWidth, window.innerWidth - 12));
  }


  const phtDate = () => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());


  // Reload continuity: hydrate the persisted local snapshot before any DOM scan.
  // This prevents a normal Augmoto refresh from briefly behaving like a fresh
  // tracker session while the MV3 background worker is waking up.
  async function hydrateLocalCoverageSnapshot() {
    try {
      const r = await chrome.storage.local.get(['catSettingsV2','catCoverageDataV2','catSyncStateV2','catTrinoTimeBridgeV2','catShiftSessionV1']);
      const localSettings = r.catSettingsV2 && typeof r.catSettingsV2 === 'object' ? r.catSettingsV2 : null;
      if (localSettings) settings = { ...settings, ...localSettings, enabled: true, idleMinutes: MANAGED_IDLE_MINUTES };
      shiftState = r.catShiftSessionV1 && typeof r.catShiftSessionV1 === 'object' ? r.catShiftSessionV1 : shiftState;
      const data = r.catCoverageDataV2 && typeof r.catCoverageDataV2 === 'object' ? r.catCoverageDataV2 : null;
      const operationalDate = /^\d{4}-\d{2}-\d{2}$/.test(String(shiftState?.reportDate||'')) ? String(shiftState.reportDate) : phtDate();
      const day = data?.dates?.[operationalDate];
      if (day?.summary && typeof day.summary === 'object') {
        summary = { ...summary, ...day.summary, idleThresholdMs: MANAGED_IDLE_MS };
        const savedJob = clean(summary.currentJob);
        const savedTask = Number(summary.currentTask) || 0;
        const savedState = String(summary.trackerState || '').toLowerCase();
        presenceState = savedState || presenceState;
        if (savedJob && savedTask) {
          resumePresence = {
            jobId: savedJob,
            taskIndex: savedTask,
            totalTasks: Number(summary.totalTasks) || 0,
            trackerState: savedState,
            lastActivityAt: Math.max(0, Number(summary.lastActivityAt) || 0),
            idleSinceAt: Math.max(0, Number(summary.idleSinceAt) || 0),
            awaySinceAt: Math.max(0, Number(summary.awaySinceAt) || 0)
          };
          if (resumePresence.lastActivityAt) lastInteraction = resumePresence.lastActivityAt;
          if (savedState === 'away' && resumePresence.awaySinceAt) awaySinceAt = resumePresence.awaySinceAt;
          // Pending counters are NOT evidence of a click. Only a shift-bound
          // checkpoint may restore a Submit after navigation.
        } else {
          if (savedState === 'idle' && Number(summary.idleSinceAt) > 0) queueIdleSinceAt = Number(summary.idleSinceAt);
          if (savedState === 'away' && Number(summary.awaySinceAt) > 0) awaySinceAt = Number(summary.awaySinceAt);
        }
      }
      syncState = r.catSyncStateV2 && typeof r.catSyncStateV2 === 'object' ? r.catSyncStateV2 : syncState;
      bridgeState = r.catTrinoTimeBridgeV2 && typeof r.catTrinoTimeBridgeV2 === 'object' ? r.catTrinoTimeBridgeV2 : bridgeState;
      const checkpointData = await chrome.storage.local.get([SUBMIT_CHECKPOINT,LEGACY_SUBMIT_CHECKPOINT]);
      let checkpoint = null;
      try { checkpoint=JSON.parse(sessionStorage.getItem(SUBMIT_CHECKPOINT)||'null'); } catch (_) {}
      const sameTab=checkpointMatchesShift(checkpoint);
      if (!sameTab) checkpoint=checkpointData[SUBMIT_CHECKPOINT];
      if (checkpoint && !resumeSubmitCheckpoint(checkpoint, day, sameTab)) clearSubmitCheckpoint();
      // Never migrate a legacy final-task click into a counted receipt.
      if (checkpointData[LEGACY_SUBMIT_CHECKPOINT])
        chrome.storage.local.remove(LEGACY_SUBMIT_CHECKPOINT).catch(()=>{});
      refreshHud();
      return true;
    } catch (_) { return false; }
  }

  function confirmationRoute() { return /\/jobs\/JOB_[^/]+\/confirmation(?:\/|$)/i.test(location.pathname) || window.TrinoTimeQCMode?.get() !== 'coverage'; }
  async function send(type, payload = {}) {
    const submitConfirmed=type==='cat-event'&&payload.event?.type==='submit-confirmed';
    const acceptedDuringNavigation=submitConfirmed&&['augmoto-success-notice','submit-to-jobs-transition'].includes(payload.event?.confirmedBy)&&submitPending();
    const verifiedSubmission=submitConfirmed&&(!confirmationRoute()||acceptedDuringNavigation);
    // Submit acceptance is higher priority than ancillary efficiency timing.
    // Do NOT await the efficiency queue here: Augmoto may destroy this document
    // immediately after navigation and strand the acceptance message. The
    // background reconciles a bounded late efficiency sample independently.
    if(verifiedSubmission){try{Promise.resolve(window.TrinoTimeQCEfficiency?.flush()).catch(()=>{});}catch(_) {}}
    // A single ownership/mode handoff may settle the prior Coverage interval
    // after Augmoto has already switched its visible route to Confirmation.
    // This exception applies ONLY to time accounting, never to Submit events.
    const settledCoverageTime=type==='cat-time'&&payload.activityHandoff===true;
    if (!verifiedSubmission && confirmationRoute() && ['cat-event','cat-presence','cat-time'].includes(type) && !settledCoverageTime) return Promise.resolve({ok:true, skipped:true});
    try { return chrome.runtime.sendMessage({ type, ...payload }); }
    catch (_) { return Promise.resolve(null); }
  }

  function hasOpenTask() {
    return Boolean(current.jobId && current.taskIndex);
  }

  function isAwayNow() {
    return searchPresence?.isAway() === true;
  }

  function computePresenceState(now = Date.now()) {
    if (shiftState?.status !== 'active') return 'offline';
    if (!settings.enabled || !activityOwned || confirmationRoute()) return 'paused';
    // Queue time is SEARCHING only inside a bounded, interaction-aware window.
    // It is never counted as productive task time or as idle/away.
    searchPresence?.sync(hasOpenTask(),true);
    integrity?.sync(hasOpenTask(), true, hasOpenTask()?`${current.jobId}|${current.taskIndex}`:'', `${shiftState?.sessionId||''}|${shiftState?.generation||''}`);
    const base = isAwayNow() ? 'away' : !hasOpenTask() ? (searchPresence?.state(now)||'idle') : now-lastInteraction>=MANAGED_IDLE_MS?'unverified':'active';
    return integrity?.state(base, {hasTask:hasOpenTask(),visible:!document.hidden,focused:document.hasFocus(),osAway:isAwayNow()},now) || base;
  }

  function presencePayload(state = computePresenceState(), now = Date.now()) {
    const idleSinceAt = state === 'idle'
      ? (hasOpenTask() ? Math.max(0, lastInteraction + MANAGED_IDLE_MS) : Math.max(0, searchPresence?.idleSince(now) || queueIdleSinceAt || now))
      : 0;
    const currentAwaySince = state === 'away' ? (awaySinceAt || now) : 0;
    return {
      timestamp: now,
      date: phtDate(),
      jobId: current.jobId,
      taskIndex: current.taskIndex,
      totalTasks: current.totalTasks,
      trackerState: state,
      lastActivityAt: lastInteraction,
      idleSinceAt,
      awaySinceAt: currentAwaySince,
      presenceUpdatedAt: now,
      idleThresholdMs: MANAGED_IDLE_MS,
      pageVisible: !document.hidden,
      pageFocused: document.hasFocus()
    };
  }

  function updateLocalPresence(state, now = Date.now(), renderHud = true) {
    presenceState = state;
    summary.trackerState = state;
    summary.lastActivityAt = lastInteraction;
    summary.idleSinceAt = state === 'idle'
      ? (hasOpenTask() ? Math.max(0, lastInteraction + MANAGED_IDLE_MS) : Math.max(0, searchPresence?.idleSince(now) || queueIdleSinceAt || now))
      : 0;
    summary.awaySinceAt = state === 'away' ? (awaySinceAt || now) : 0;
    summary.presenceUpdatedAt = now;
    summary.idleThresholdMs = MANAGED_IDLE_MS;
    if (renderHud) refreshHud();
  }

  function emitPresence(state = computePresenceState(), force = false) {
    const now = Date.now();
    if (!force && state === lastPresenceSentState && now - lastPresenceSentAt < 1800) {
      updateLocalPresence(state, now, false);
      return;
    }
    updateLocalPresence(state, now);
    lastPresenceSentState = state;
    lastPresenceSentAt = now;
    send('cat-presence', { payload: presencePayload(state, now) }).catch(() => {});
  }

  function clearIdleBoundary() {
    if (idleBoundaryTimer) clearTimeout(idleBoundaryTimer);
    idleBoundaryTimer = null;
  }

  function scheduleIdleBoundary() {
    clearIdleBoundary();
    if (!settings.enabled || !hasOpenTask() || isAwayNow()) return;
    const remaining = lastInteraction + MANAGED_IDLE_MS - Date.now();
    if (remaining <= 0) {
      if (computePresenceState() === 'idle') emitPresence('idle', true);
      return;
    }
    idleBoundaryTimer = setTimeout(() => {
      idleBoundaryTimer = null;
      if (hasOpenTask() && computePresenceState() === 'idle') emitPresence('idle', true);
    }, Math.min(remaining + 25, 2147480000));
  }

  function isHudEvent(event) {
    return event?.target instanceof Element && Boolean(event.target.closest('#' + HUD_ID));
  }

  function noteActivity(event) {
    if (isHudEvent(event)) return;
    if (event && event.isTrusted === false) return;
    updateActivityOwner();
    const was = computePresenceState();
    if(['grace','unverified'].includes(presenceState)&&integrity?.isMeaningful(event,hasOpenTask()))recordPresenceTime(Date.now(),presenceState);
    searchPresence?.record(event,hasOpenTask(),shiftState?.status==='active');
    if (integrity?.record(event,hasOpenTask(),shiftState?.status==='active')) lastInteraction = Date.now();
    awaySinceAt = 0;
    const next = computePresenceState();
    if (next !== was || next !== presenceState) {
      emitPresence(next, true);
    } else {
      // Queue/list interaction is still IDLE. Do not allow scrolling, clicking
      // filters, or moving around the jobs page to appear as ACTIVE work.
      updateLocalPresence(next, Date.now(), false);
    }
    scheduleIdleBoundary();
  }

  function handleVisibilityOrFocus() {
    recordPresenceTime(Date.now(),presenceState);
    updateActivityOwner(true);
    scheduleScan(100);
    searchPresence?.poll(true).then(()=>emitPresence(computePresenceState(),true)).catch(()=>{});
    if (isAwayNow()) {
      if (!awaySinceAt) awaySinceAt = Date.now();
      clearIdleBoundary();
      emitPresence('away', true);
      return;
    }
    awaySinceAt = 0;
    if (!hasOpenTask() && (presenceState === 'away' || !queueIdleSinceAt)) queueIdleSinceAt = Date.now();
    const next = computePresenceState();
    emitPresence(next, true);
    scheduleIdleBoundary();
  }

  function isTypingTarget(t) {
    return t instanceof Element && (t.matches('input,textarea,select,[contenteditable="true"]') || t.closest('input,textarea,select,[contenteditable="true"]'));
  }

  function interactiveFromEvent(event) {
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    for (const n of path) {
      if (!(n instanceof Element)) continue;
      const tag = n.tagName.toLowerCase();
      const role = lower(n.getAttribute('role'));
      const type = lower(n.getAttribute('type'));
      if (tag === 'button' || role === 'button' || (tag === 'input' && ['button', 'submit'].includes(type)) || n.hasAttribute('onclick') || (n.hasAttribute('tabindex') && Number(n.getAttribute('tabindex')) >= 0)) return n;
    }
    return event.target instanceof Element ? event.target : null;
  }

  function label(el) {
    if (!(el instanceof Element)) return '';
    return clean(el.getAttribute('aria-label') || el.getAttribute('title') || (el instanceof HTMLInputElement ? el.value : '') || el.textContent).slice(0, 160);
  }

  function disabled(el) {
    if (!(el instanceof Element)) return true;
    try { return el.matches(':disabled') || el.hasAttribute('disabled') || lower(el.getAttribute('aria-disabled')) === 'true'; }
    catch (_) { return false; }
  }

  function rememberIntent(kind, extra = {}) {
    if (kind === 'create' || kind === 'del') pending.blur = null;
    if (kind === 'blur' || kind === 'del') pending.create = null;
    if (kind === 'noMatch') extra = {
      noMatchBefore: noMatchState(),
      noMatchRowBefore: selectedNoMatchRowState(),
      noMatchMarkerCountBefore: noMatchMarkerCount(),
      area: selectedEmptyArea(),
      ...extra
    };
    pending[kind] = { at: Date.now(), jobId: current.jobId, taskIndex: current.taskIndex, before: { ...current }, ...extra };
    scheduleScan(120); scheduleScan(500); scheduleScan(1400); scheduleScan(3200);
  }

  function validIntent(intent, maxMs = 30000) {
    return intent && Date.now() - intent.at <= maxMs && intent.jobId === current.jobId && intent.taskIndex === current.taskIndex;
  }

  function emitAction(type) {
    if (!hasOpenTask()) return;
    const now = Date.now();
    send('cat-event', {
      event: {
        eventId: eventId(type), type, timestamp: now, date: phtDate(),
        jobId: current.jobId, taskIndex: current.taskIndex, totalTasks: current.totalTasks,
        trackerState: 'active', lastActivityAt: lastInteraction,
        idleSinceAt: 0, awaySinceAt: 0, idleThresholdMs: MANAGED_IDLE_MS,
        url: location.href, pageTitle: document.title
      }
    }).catch(() => {});
  }

  function visibleNoMatchFailure() {
    const text = lower(document.body?.innerText || '');
    return /unable to (?:apply|update).*no.?match|no.?match.*(?:failed|error)|failed to (?:apply|update).*no.?match/.test(text);
  }

  function emitNoMatchMark(area, source = 'click') {
    if (!hasOpenTask()) return false;
    area = String(area ?? '').trim();
    if (!area) return false;
    const jobId = current.jobId;
    const taskIndex = current.taskIndex;
    const totalTasks = current.totalTasks;
    const key = `${jobId}|${taskIndex}|${area}|mark`;
    const now = Date.now();
    if (lastNoMatchToggle.key === key && now - lastNoMatchToggle.at < 700) return true;
    lastNoMatchToggle = { key, at: now };
    pending.noMatch = null;
    // The live Augmoto rail's grey/green check is a confirmation state, NOT a
    // No-Match state. Only a trusted explicit No-Match action may add X.
    setTimeout(() => {
      if (!hasOpenTask() || current.jobId !== jobId || current.taskIndex !== taskIndex) return;
      if (visibleNoMatchFailure()) return;
      const ts = Date.now();
      send('cat-event', {
        event: {
          eventId: eventId('no-match-set'), type: 'no-match-set', timestamp: ts, date: phtDate(),
          jobId, taskIndex, totalTasks, area, source,
          trackerState: 'active', lastActivityAt: lastInteraction,
          idleSinceAt: 0, awaySinceAt: 0, idleThresholdMs: MANAGED_IDLE_MS,
          url: location.href, pageTitle: document.title
        }
      }).catch(() => {});
    }, 180);
    return true;
  }

  function emitNoMatchClear(area, source = 'clear-click') {
    if (!hasOpenTask()) return false;
    area = String(area ?? '').trim();
    if (!area) return false;
    const ts = Date.now();
    send('cat-event', {
      event: {
        eventId: eventId('no-match-clear'), type: 'no-match-clear', timestamp: ts, date: phtDate(),
        jobId: current.jobId, taskIndex: current.taskIndex, totalTasks: current.totalTasks, area, source,
        trackerState: 'active', lastActivityAt: lastInteraction,
        idleSinceAt: 0, awaySinceAt: 0, idleThresholdMs: MANAGED_IDLE_MS,
        url: location.href, pageTitle: document.title
      }
    }).catch(() => {});
    return true;
  }

  function headerState(text) {
    if (confirmationRoute()) return null;
    const matches = [...String(text || '').matchAll(/(JOB_[A-Za-z0-9_-]+)\s*-?\s*tasks?\s*:\s*(\d+)\s*\/\s*(\d+)/ig)];
    if (matches.length) {
      const m = matches[matches.length - 1];
      return { jobId: String(m[1]).toUpperCase(), taskIndex: Number(m[2]) || 0, totalTasks: Number(m[3]) || 0 };
    }
    const url = location.href.match(/\/jobs\/(JOB_[A-Za-z0-9_-]+)/i);
    return url ? { jobId: String(url[1]).toUpperCase(), taskIndex: 0, totalTasks: 0 } : null;
  }

  function coverageQueueVisible(text) {
    if (confirmationRoute()) return false;
    const body = clean(text || '');
    if (!body || headerState(body)) return false;
    // Augmoto's Coverage queue shows the Filters card plus a Jobs (N) list.
    // This positive queue signal is safer than relying on the URL because the
    // SPA can leave the old JOB id in history/location after the final Submit.
    const hasJobs = /\bJobs\s*\(\s*\d+\s*\)/i.test(body);
    const hasFilters = /\bFilters\b/i.test(body) && /\bStore\b/i.test(body);
    if (hasJobs && hasFilters) return true;
    // Fallback for a queue while its list count is still loading. Task controls
    // are gone and the QC navigation remains visible.
    const hasQcNav = /Confirmation Jobs/i.test(body) && /\bCoverage\b/i.test(body);
    const taskButtons = Array.from(document.querySelectorAll('button,[role="button"]')).some(el => {
      const name = lower(label(el));
      return ['submit','skip','exit'].includes(name) && !disabled(el) && el.getBoundingClientRect().width > 0;
    });
    return hasQcNav && !taskButtons && /\bJobs\b/i.test(body);
  }

  function countFrom(text, labelText) {
    const re = new RegExp(labelText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\((\\d+)\\)', 'i');
    const m = String(text || '').match(re);
    return m ? Number(m[1]) : null;
  }


  function reconcileStableCoverageCounters(persons, deleted) {
    if (!hasOpenTask()) {
      counterDomCandidate = { taskKey: '', persons: null, deleted: null, at: 0 };
      return;
    }
    const taskKeyNow = `${current.jobId}|${current.taskIndex}`;
    const p = Number.isFinite(persons) ? Number(persons) : null;
    const d = Number.isFinite(deleted) ? Number(deleted) : null;

    // First observation on a task is baseline only. Existing annotations must
    // never be counted as Agent actions.
    if (current.persons === null && p !== null) current.persons = p;
    if (current.deleted === null && d !== null) current.deleted = d;

    const changedPersons = p !== null && current.persons !== null && p !== current.persons;
    const changedDeleted = d !== null && current.deleted !== null && d !== current.deleted;
    if (!changedPersons && !changedDeleted) {
      counterDomCandidate = { taskKey: taskKeyNow, persons: p, deleted: d, at: Date.now() };
      return;
    }

    const now = Date.now();
    const sameCandidate = counterDomCandidate.taskKey === taskKeyNow &&
      counterDomCandidate.persons === p && counterDomCandidate.deleted === d;
    if (!sameCandidate) {
      counterDomCandidate = { taskKey: taskKeyNow, persons: p, deleted: d, at: now };
      // Require the same Augmoto state twice. This rejects brief React
      // intermediate renders while remaining independent of HUD expansion.
      scheduleScan(260);
      return;
    }
    if (now - counterDomCandidate.at < 180) { scheduleScan(220); return; }

    if (p !== null && current.persons !== null && p !== current.persons) {
      const before = current.persons;
      current.persons = p;
      if (p > before) {
        for (let n = before; n < p; n++) emitAction('blurred');
        pending.blur = null;
      } else if (p < before) {
        // Anti-inflation rule: W/Person is a NET surviving-annotation metric.
        // A stable Augmoto Unblurred Persons decrease means a Person box no
        // longer exists on this task. Retract only this task's Agent-attributed
        // Person count in the background; it is clamped at zero there, so
        // removals cannot make the metric negative or erase credit from a prior task.
        for (let n = p; n < before; n++) emitAction('blurred-remove');
        pending.blur = null;
      }
    }
    if (d !== null && current.deleted !== null && d !== current.deleted) {
      const before = current.deleted;
      current.deleted = d;
      if (d > before) {
        for (let n = before; n < d; n++) emitAction('deleted');
        pending.del = null;
      }
    }
    counterDomCandidate = { taskKey: taskKeyNow, persons: p, deleted: d, at: now };
  }



  function reconcileStableProductMatchCounter(matchedCount) {
    if (!hasOpenTask()) {
      productMatchDomCandidate = { taskKey: '', matched: null, at: 0 };
      return;
    }
    const taskKeyNow = `${current.jobId}|${current.taskIndex}`;
    const matched = Number.isFinite(matchedCount) ? Number(matchedCount) : null;
    if (matched === null) return;

    // The live Augmoto rail exposes "Out of Stock Confirmed (N)". The user's
    // recording confirms N is the number of annotation rows with the green
    // product-match check. Baseline the first stable task observation so
    // already-confirmed AUTO/HUMAN boxes are never credited to the Agent.
    if (current.productMatched === null) {
      current.productMatched = matched;
      productMatchDomCandidate = { taskKey: taskKeyNow, matched, at: Date.now() };
      return;
    }
    if (matched === current.productMatched) {
      productMatchDomCandidate = { taskKey: taskKeyNow, matched, at: Date.now() };
      return;
    }

    const now = Date.now();
    const sameCandidate = productMatchDomCandidate.taskKey === taskKeyNow &&
      productMatchDomCandidate.matched === matched;
    if (!sameCandidate) {
      productMatchDomCandidate = { taskKey: taskKeyNow, matched, at: now };
      scheduleScan(260);
      return;
    }
    if (now - productMatchDomCandidate.at < 180) { scheduleScan(220); return; }

    const before = current.productMatched;
    current.productMatched = matched;
    if (matched > before) {
      for (let n = before; n < matched; n++) emitAction('product-matched');
    } else if (matched < before) {
      // Anti-inflation rule: Product Match is NET surviving match credit for
      // this task. Unmatching a box or deleting a matched box retracts only
      // this task's Agent-attributed match credit; background clamps at zero.
      for (let n = matched; n < before; n++) emitAction('product-match-remove');
    }
    productMatchDomCandidate = { taskKey: taskKeyNow, matched, at: now };
  }

  function reconcileStableCreatedCounter(empty, rows) {
    if (!hasOpenTask()) {
      createDomCandidate = { taskKey: '', empty: null, human: null, at: 0 };
        productMatchDomCandidate = { taskKey: '', matched: null, at: 0 };
      return;
    }
    const taskKeyNow = `${current.jobId}|${current.taskIndex}`;
    const total = Number.isFinite(empty) ? Number(empty) : null;
    const human = Array.isArray(rows) ? rows.filter(row => row?.badge === 'HUMAN').length : null;
    // Do not baseline until Augmoto's rail is complete. This prevents existing
    // AUTO/HUMAN annotations that mount progressively from being counted as Q.
    if (total === null || human === null || rows.length < total) return;
    if (current.emptyArea === null || current.humanEmpty === null) {
      current.emptyArea = total;
      current.humanEmpty = human;
      createDomCandidate = { taskKey: taskKeyNow, empty: total, human, at: Date.now() };
      return;
    }
    if (total === current.emptyArea && human === current.humanEmpty) {
      createDomCandidate = { taskKey: taskKeyNow, empty: total, human, at: Date.now() };
      return;
    }
    const now = Date.now();
    const sameCandidate = createDomCandidate.taskKey === taskKeyNow && createDomCandidate.empty === total && createDomCandidate.human === human;
    if (!sameCandidate) {
      createDomCandidate = { taskKey: taskKeyNow, empty: total, human, at: now };
      scheduleScan(260);
      return;
    }
    if (now - createDomCandidate.at < 180) { scheduleScan(220); return; }
    const emptyDelta = total - current.emptyArea;
    const humanDelta = human - current.humanEmpty;
    if (emptyDelta > 0 && humanDelta > 0) {
      const created = Math.min(emptyDelta, humanDelta);
      for (let n = 0; n < created; n++) emitAction('created');
      pending.create = null;
    } else if (emptyDelta < 0 && humanDelta < 0) {
      // Anti-inflation rule: Q/Create is a NET surviving HUMAN-box metric.
      // Only stable HUMAN Empty Area removals retract Create. The background
      // clamps the current task's Agent-attributed count at zero, while the
      // independent Augmoto Deleted counter still records Delete +1.
      const removed = Math.min(Math.abs(emptyDelta), Math.abs(humanDelta));
      for (let n = 0; n < removed; n++) emitAction('created-remove');
      pending.create = null;
    }
    // Stable decreases become the new baseline so delete -> redraw can count.
    current.emptyArea = total;
    current.humanEmpty = human;
    createDomCandidate = { taskKey: taskKeyNow, empty: total, human, at: now };
  }

  function noMatchControl() {
    return Array.from(document.querySelectorAll('button,[role="button"],span,div')).find(el =>
      !el.closest('#' + HUD_ID) && /^no[ -]?match(?: found)?$/i.test(clean(el.textContent)) &&
      el.getBoundingClientRect().width > 0);
  }

  function noMatchState() {
    const el = noMatchControl();
    if (!el) return null;
    for (const key of ['aria-pressed', 'aria-checked']) {
      const value = el.getAttribute(key);
      if (value === 'true' || value === 'false') return value === 'true';
    }
    const hint = lower(`${el.getAttribute('title') || ''} ${el.getAttribute('aria-label') || ''}`);
    // Recorded Augmoto toggle: white text/dark grey when marked, grey text/light grey otherwise.
    // Read the actual control, never a possibly stale portal tooltip elsewhere on the page.
    // Augmoto also renders this toggle as a chip, with the label in a span
    // and the background on its wrapper. Transparent child backgrounds are
    // not evidence that the toggle is absent or unchanged.
    const rgb = value => {
      const m = String(value).match(/^rgba?\(([^)]+)\)/);
      if (!m) return null;
      const v = m[1].replace(/\//g, ' ').split(/[,\s]+/).filter(Boolean).map(Number);
      return v.length >= 3 && (v.length < 4 || v[3] > 0) ? v.slice(0,3) : null;
    };
    const labelNode = [...el.querySelectorAll('span')].find(n => /^no[ -]?match(?: found)?$/i.test(clean(n.textContent))) || el;
    const fg = rgb(getComputedStyle(labelNode).color);
    let bg = null;
    for (let node = labelNode; node && node !== document.body; node = node.parentElement) {
      bg = rgb(getComputedStyle(node).backgroundColor);
      if (bg) break;
    }
    if (fg && bg) {
      if (Math.min(...fg) >= 230 && Math.max(...bg) < 210) return true;
      if (Math.min(...bg) >= 210 && Math.max(...fg) < 210) return false;
    }
    if (/clear.*no.?match|remove.*no.?match/.test(hint)) return true;
    if (/mark this empty area|mark.*no.?match/.test(hint)) return false;
    return null;
  }

  function selectedEmptyArea() {
    return [...(document.body?.innerText || '').matchAll(/Empty area\s+(\d+)\b/ig)].at(-1)?.[1] ?? null;
  }

  // Augmoto's current live Coverage UI does not expose a reliable visual No-Match
  // state after the action. These DOM readers remain only as compatibility
  // fallbacks for builds that do expose state; trusted No-Match actions are
  // persisted per Job/Task/Empty-Area by the extension background.
  function annotationRows() {
    const vw = Math.max(1, window.innerWidth || 1);
    const rows = [];
    const byArea = new Map();
    for (const el of Array.from(document.querySelectorAll('div,li,tr,[role="row"]'))) {
      if (!(el instanceof Element) || el.closest('#' + HUD_ID)) continue;
      const r = el.getBoundingClientRect();
      if (!r || r.width < 170 || r.height < 24 || r.height > 90 || r.left > vw * 0.34) continue;
      const text = clean(el.textContent);
      // Augmoto's rail is flex-based: visually separated fields can be
      // concatenated in textContent (for example "3HUMAN"). Resolve the
      // area number and AUTO/HUMAN badge independently instead of requiring
      // literal whitespace between them.
      const areaMatch = text.match(/^\s*(\d+)/);
      const badgeNode = [el, ...Array.from(el.querySelectorAll('span,div'))].find(n => /^(AUTO|HUMAN)$/i.test(clean(n.textContent)));
      if (!areaMatch || !badgeNode) continue;
      const area = String(areaMatch[1]);
      const rawButtons = Array.from(el.querySelectorAll('button,[role="button"]')).filter(b => {
        if (b.closest('#' + HUD_ID)) return false;
        const br = b.getBoundingClientRect();
        return br.width > 0 && br.height > 0;
      });
      // Keep only the outermost interactive action when a UI library nests a
      // role=button node inside a native button. This preserves the real
      // Augmoto rail polarity: 3 actions unmarked, 2 actions marked.
      const buttons = rawButtons.filter((b, i) => !rawButtons.some((other, j) => i !== j && other.contains(b)));
      if (buttons.length < 2) continue;
      const item = { el, area, badge: clean(badgeNode.textContent).toUpperCase(), buttons: buttons.length, buttonEls: buttons, rect: r };
      const prev = byArea.get(item.area);
      if (!prev || item.buttons > prev.buttons || (item.buttons === prev.buttons && item.rect.width > prev.rect.width)) byArea.set(item.area, item);
    }
    rows.push(...byArea.values());
    return rows;
  }

  function selectedNoMatchRowState(area = selectedEmptyArea()) {
    if (area === null || area === undefined) return null;
    const row = annotationRows().find(x => x.area === String(area));
    if (!row) return null;
    // Verified against the live Augmoto Coverage UI (2026-10-06):
    // an UNMARKED row exposes the No-Match ban control + Eye + Delete (3 buttons).
    // once No Match is applied, Augmoto removes that ban control and the row
    // keeps only Eye + Delete (2 buttons). Treat the missing ban control as
    // the authoritative marked state.
    return row.buttons <= 2;
  }

  function noMatchMarkerCount() {
    const rows = annotationRows();
    if (!rows.length) return null;
    return rows.reduce((n, row) => n + (row.buttons <= 2 ? 1 : 0), 0);
  }

  function railNoMatchIntent(el) {
    if (!(el instanceof Element)) return null;
    const button = el.closest('button,[role="button"]') || el;
    for (const row of annotationRows()) {
      if (!row.el.contains(button)) continue;
      const buttons = Array.isArray(row.buttonEls) ? row.buttonEls : [];
      if (buttons.length < 3) return null;
      // Verified in the live Augmoto rail: for an unmarked Empty Area the
      // left-most action button after AUTO/HUMAN is the ban/No-Match action,
      // followed by Eye and Delete. Some builds expose no useful label/title
      // on the icon button, so capture the intent structurally as well.
      const first = buttons[0];
      if (first === button || (first instanceof Element && first.contains(button))) return { area: row.area };
      return null;
    }
    return null;
  }

  function reconcileNoMatchFromDom(rows = annotationRows()) {
    if (!hasOpenTask() || !rows.length) {
      noMatchDomCandidate = { taskKey: '', signature: '', at: 0 };
      return;
    }
    const taskKeyNow = `${current.jobId}|${current.taskIndex}`;
    const observedAreas = rows.map(row => String(row.area)).filter(Boolean).sort((a,b) => Number(a)-Number(b));
    const markedAreas = rows.filter(row => row.buttons <= 2).map(row => String(row.area)).filter(Boolean).sort((a,b) => Number(a)-Number(b));
    const markedSet = new Set(markedAreas);
    const signature = observedAreas.map(area => `${area}:${markedSet.has(area) ? 1 : 0}`).join(',');
    if (!signature) return;
    const now = Date.now();
    if (noMatchDomCandidate.taskKey !== taskKeyNow || noMatchDomCandidate.signature !== signature) {
      noMatchDomCandidate = { taskKey: taskKeyNow, signature, at: now };
      scheduleScan(320);
      return;
    }
    // Wait for the same rail state to survive a second scan so React's
    // intermediate render cannot create a false add/remove.
    if (now - noMatchDomCandidate.at < 220) { scheduleScan(240); return; }
    if (noMatchDomLastSent.taskKey === taskKeyNow && noMatchDomLastSent.signature === signature) return;
    noMatchDomLastSent = { taskKey: taskKeyNow, signature };
    send('cat-no-match-reconcile', { payload: {
      date: phtDate(), jobId: current.jobId, taskIndex: current.taskIndex, totalTasks: current.totalTasks,
      observedAreas, markedAreas, timestamp: now
    } }).then(result => {
      if (!result?.ok) noMatchDomLastSent = { taskKey: '', signature: '' };
    }).catch(() => { noMatchDomLastSent = { taskKey: '', signature: '' }; });
  }

  function submitPending() {
    const p=pending.submit;
    const task=Number(p?.taskIndex)||0, total=Number(p?.totalTasks)||0;
    return Boolean(p?.jobId && task>0 && total>=task &&
      Number(p.at)>0 && Date.now()-Number(p.at)<=SUBMIT_MAX_AGE_MS);
  }

  function coverageLandingVisible(text) {
    const body=clean(text||'');
    if(!body)return false;
    // Do not depend on TrinoTimeQCMode here. Augmoto can report the Home/Jobs
    // landing page as another mode immediately after the final Coverage Submit.
    if(/(JOB_[A-Za-z0-9_-]+)\s*-?\s*tasks?\s*:\s*\d+\s*\/\s*\d+/i.test(body))return false;
    const taskButtons=Array.from(document.querySelectorAll('button,[role="button"]')).some(el=>{
      const name=lower(label(el));
      return ['submit','skip','exit'].includes(name)&&!disabled(el)&&el.getBoundingClientRect().width>0;
    });
    if(taskButtons)return false;
    const hasFilters=/\bFilters\b/i.test(body)&&/\bStore\b/i.test(body);
    const hasJobs=/\bJobs(?:\s*\(\s*\d+\s*\))?\b/i.test(body);
    const hasQcNav=/Confirmation Jobs/i.test(body)&&/\bCoverage\b/i.test(body);
    const hasHome=/\bHome\b/i.test(body)&&/\bMy Tasks\b/i.test(body);
    return (hasFilters&&hasJobs)||(hasHome&&hasQcNav);
  }

  // User-confirmed Augmoto workflow: Submit returns to Jobs when no tasks
  // remain available to this agent, including intermediate task positions.
  // This is UI transition evidence, not a server acceptance receipt.
  function observeSubmitToJobs(text) {
    const p=pending.submit, now=Date.now();
    if (!p || !p.queueEligible || !submitPending() ||
        !settings.enabled || shiftState?.status!=='active' ||
        !checkpointMatchesShift(submitCheckpoint) || submitCheckpoint.id!==p.id ||
        REJECTED_NOTICE.test(text) ||
        /\/confirmation(?:\/|$)/i.test(location.pathname) || !coverageLandingVisible(text)) {
      if(p)p.queueSeenAt=0;
      return false;
    }
    if(p.queueConfirmedAt)return confirmPendingSubmit('submit-to-jobs-transition',confirmationRoute());
    if(now-p.at>ACCEPTANCE_WINDOW_MS)return false;
    if(!p.queueSeenAt)p.queueSeenAt=now;
    // Require the real Jobs screen to remain visible, not a transient spinner.
    if(now-p.queueSeenAt<750){scheduleScan(200);return false;}
    p.queueConfirmedAt=now;
    saveSubmitCheckpoint(p);
    return confirmPendingSubmit('submit-to-jobs-transition',confirmationRoute());
  }

  function cancelSubmitNavigation() {
    if(!pending.submit || pending.submit.confirming)return;
    const p=pending.submit;
    pending.submit=null;
    postAttemptStatus(p,'cancelled');
    feedback('cancelled',p.id);
    clearSubmitCheckpoint();
    chrome.runtime.sendMessage({type:'cat-event',event:{
      eventId:`submit-cancelled-${p.id}`,type:'submit-cancelled',timestamp:Date.now(),
      date:shiftState?.reportDate||phtDate(),jobId:p.jobId,
      taskIndex:p.taskIndex,totalTasks:p.totalTasks
    }}).catch(()=>{});
  }

  function confirmPendingSubmit(source, leaveModeAfter=false) {
    const p=pending.submit;
    if(!p||p.confirming)return false;
    // Require a fresh success notice or guarded transition after Submit.
    // Bare navigation and job status changes never count.
    if (!submitPending() || (p.recovered && !p.checkpoint)) return false;
    if (source==='augmoto-success-notice') {
      if (!(Number(p.acceptedAt)>=Number(p.at) &&
            Number(p.acceptedAt)-Number(p.at)<=ACCEPTANCE_WINDOW_MS)) return false;
    } else if (source==='submit-to-jobs-transition') {
      if (!p.queueEligible || !(p.queueConfirmedAt>=p.at &&
          p.queueConfirmedAt-p.at<=ACCEPTANCE_WINDOW_MS))return false;
    } else if (!['task-advance','new-job-transition'].includes(source) ||
               Date.now()-Number(p.at)>ACCEPTANCE_WINDOW_MS) return false;
    p.confirming=true;
    const payload={
      eventId:`submit-confirmed-${p.id || `${p.jobId}-${p.taskIndex}-${p.at}`}`,
      type:'submit-confirmed',timestamp:Date.now(),date:shiftState?.reportDate||phtDate(),
      jobId:p.jobId,taskIndex:p.taskIndex,totalTasks:p.totalTasks,
      trackerState:'active',lastActivityAt:lastInteraction,idleThresholdMs:MANAGED_IDLE_MS,
      url:location.href,pageTitle:document.title,confirmedBy:source
    };
    send('cat-event',{event:payload}).then(result=>{
      if(!result?.ok || result?.skipped || result?.frozen){p.confirming=false;scheduleScan(500);return;}
      feedback('confirmed_pending_sync',p.id);
      if(submitCheckpoint?.jobId===p.jobId && Number(submitCheckpoint.taskIndex)===Number(p.taskIndex)) clearSubmitCheckpoint();
      if(pending.submit===p)pending.submit=null;
      pending.skip=null;
      if(leaveModeAfter)chrome.runtime.sendMessage({type:'cat-mode-leave'}).catch(()=>{});
      scheduleScan(120);
    }).catch(()=>{p.confirming=false;scheduleScan(500);});
    return true;
  }

  document.addEventListener('tt-qc-mode-change', e => {
    recordPresenceTime(Date.now(),presenceState,true);
    updateActivityOwner(true);
    if(e.detail?.previous==='coverage'&&e.detail.mode!=='coverage'){
      clearIdleBoundary();
      // A final Coverage Submit can navigate straight to Augmoto Home/Jobs and
      // make job-mode temporarily report a non-Coverage mode. Do not clear the
      // persisted pending submission before that transition is verified.
      if(!submitPending()) chrome.runtime.sendMessage({type:'cat-mode-leave'}).catch(()=>{});
    }
    scan(); refreshHud();
  });
  function scan() {
    scanTimer = null;
    if(coverageBacklog.length)drainCoverageSubmitLedger().catch(()=>{});
    const routeMismatch=confirmationRoute();
    const earlyText=document.body?.innerText||document.body?.textContent||'';
    if(pending.submit && !coverageLandingVisible(earlyText))pending.submit.queueSeenAt=0;
    if (pending.submit && Date.now() - pending.submit.at > SUBMIT_MAX_AGE_MS) {
      // Record unresolved click for QA, never silently turn it into a count.
      recordUnverifiedSubmit(pending.submit,coverageLandingVisible(earlyText)
        ? 'submit-click-returned-to-jobs-without-acceptance-receipt'
        : 'submit-click-no-acceptance-receipt');
      pending.submit=null;clearSubmitCheckpoint();
      if(routeMismatch)chrome.runtime.sendMessage({type:'cat-mode-leave'}).catch(()=>{});
      else send('cat-event',{event:{eventId:eventId('submit-cancelled-unverified'),type:'submit-cancelled',
        timestamp:Date.now(),date:shiftState?.reportDate||phtDate()}}).catch(()=>{});
    }
    if(routeMismatch&&submitPending()){
      const hud=document.getElementById(HUD_ID);if(hud)hud.style.display='none';
      const now=Date.now();
      const failure=REJECTED_NOTICE.test(earlyText);
      if(failure&&now-pending.submit.at>500){
        chrome.runtime.sendMessage({type:'cat-event',event:{
          eventId:eventId('submit-cancelled-validation'),type:'submit-cancelled',timestamp:now,
          date:shiftState?.reportDate||phtDate(),jobId:pending.submit.jobId,
          taskIndex:pending.submit.taskIndex,totalTasks:pending.submit.totalTasks
        }}).catch(()=>{});
        pending.submit=null;clearSubmitCheckpoint();
        chrome.runtime.sendMessage({type:'cat-mode-leave'}).catch(()=>{});
      } else if(pending.submit.acceptedAt){
        confirmPendingSubmit('augmoto-success-notice',true);
      } else {
        observeSubmitToJobs(earlyText);
        scheduleScan(200);
      }
      return;
    }
    if (routeMismatch) { pending = {create:null,blur:null,del:null,noMatch:null,submit:null,skip:null}; current.jobId='';current.taskIndex=0;lastTaskSignature='';lastTick=Date.now();const hud=document.getElementById(HUD_ID);if(hud)hud.style.display='none';return; }
    const hud=document.getElementById(HUD_ID);if(hud)hud.style.display='';
    scanTimer = null;
    if (!settings.enabled || !document.body) return;
    if (shiftState?.status !== 'active') {
      pending={create:null,blur:null,del:null,noMatch:null,submit:null,skip:null};
      current={jobId:'',taskIndex:0,totalTasks:0,emptyArea:null,humanEmpty:null,persons:null,deleted:null,productMatched:null,noMatchState:null};
      lastTaskSignature=''; lastTick=Date.now(); clearIdleBoundary(); presenceState='offline'; summary.trackerState='offline'; refreshHud(); return;
    }
    const text = document.body.innerText || '';
    const h = headerState(text);
    if(h?.taskIndex)window.TrinoTimeQCEfficiency?.prime();

    if (h && h.jobId && h.taskIndex) {
      // Augmoto may reject a Submit without leaving the task page. A visible
      // validation error cancels only the unconfirmed click intent.
      if (pending.submit && Date.now()-pending.submit.at>500 &&
          /submission failed|unable to submit|failed to submit|required field/i.test(earlyText)) {
        send('cat-event',{event:{eventId:eventId('submit-cancelled-validation'),type:'submit-cancelled',
          timestamp:Date.now(),date:phtDate(),jobId:pending.submit.jobId,
          taskIndex:pending.submit.taskIndex,totalTasks:pending.submit.totalTasks}}).catch(()=>{});
        pending.submit=null;clearSubmitCheckpoint();
      }
      missingHeaderSince = 0;
      const signature = `${h.jobId}|${h.taskIndex}`;
      if (signature !== lastTaskSignature) {
        const old = { ...current };
        if (submitPending() && (!pending.submit.recovered || pending.submit.checkpoint) &&
            (old.jobId && old.taskIndex || pending.submit.checkpoint) &&
            (h.jobId !== pending.submit.jobId || h.taskIndex !== pending.submit.taskIndex)) {
          confirmPendingSubmit(h.jobId!==pending.submit.jobId?'new-job-transition':'task-advance');
        } else if (pending.skip && old.jobId && old.taskIndex && (h.jobId !== pending.skip.jobId || h.taskIndex > pending.skip.taskIndex)) {
          send('cat-event', { event: {
            eventId: eventId('skip-confirmed'), type: 'skip-confirmed', timestamp: Date.now(), date: phtDate(),
            jobId: pending.skip.jobId, taskIndex: pending.skip.taskIndex, totalTasks: pending.skip.totalTasks,
            trackerState: 'active', lastActivityAt: lastInteraction, idleThresholdMs: MANAGED_IDLE_MS
          } }).catch(() => {});
          pending.skip = null; pending.submit = null;
        }

        current = { jobId: h.jobId, taskIndex: h.taskIndex, totalTasks: h.totalTasks, emptyArea: null, humanEmpty: null, persons: null, deleted: null, productMatched: null, noMatchState: null };
        noMatchDomCandidate = { taskKey: '', signature: '', at: 0 };
        noMatchDomLastSent = { taskKey: '', signature: '' };
        counterDomCandidate = { taskKey: '', persons: null, deleted: null, at: 0 };
        createDomCandidate = { taskKey: '', empty: null, human: null, at: 0 };
        productMatchDomCandidate = { taskKey: '', matched: null, at: 0 };
        lastTaskSignature = signature;
        queueIdleSinceAt = 0;
        const canResume = resumePresence && resumePresence.jobId === h.jobId && Number(resumePresence.taskIndex) === Number(h.taskIndex);
        if (canResume) {
          lastInteraction = Math.max(0, Number(resumePresence.lastActivityAt) || Date.now());
          awaySinceAt = isAwayNow() ? Math.max(0, Number(resumePresence.awaySinceAt) || Date.now()) : 0;
          const startState = computePresenceState();
          updateLocalPresence(startState);
          emitPresence(startState, true);
          resumePresence = null;
        } else {
          lastInteraction = Date.now();
          awaySinceAt = isAwayNow() ? Date.now() : 0;
          const startState = computePresenceState();
          updateLocalPresence(startState);
          send('cat-event', { event: {
            eventId: eventId('task-start'), type: 'task-start', timestamp: Date.now(), date: phtDate(),
            jobId: h.jobId, taskIndex: h.taskIndex, totalTasks: h.totalTasks,
            trackerState: startState, lastActivityAt: lastInteraction,
            idleSinceAt: 0, awaySinceAt, idleThresholdMs: MANAGED_IDLE_MS
          } }).catch(() => {});
        }
        scheduleIdleBoundary();
      } else {
        current.jobId = h.jobId;
        current.taskIndex = h.taskIndex;
        current.totalTasks = h.totalTasks;
      }

      const empty = countFrom(text, 'Empty Area');
      const persons = countFrom(text, 'Unblurred Persons');
      const deleted = countFrom(text, 'Deleted');
      const productMatched = countFrom(text, 'Out of Stock Confirmed');
      const nm = noMatchState();
      const nmRow = selectedNoMatchRowState();
      const nmMarkers = noMatchMarkerCount();
      const nmRows = annotationRows();
      // Do NOT infer No Match from rail check/button counts. In live Augmoto
      // those controls reflect confirmation readiness and created phantom X values.
      // X is driven only by trusted explicit No-Match actions.
      // reconcileNoMatchFromDom(nmRows);
      reconcileStableCreatedCounter(empty, nmRows);
      reconcileStableProductMatchCounter(productMatched);
      // W/Person and D/Delete are confirmed from Augmoto's real counters, not
      // from HUD state or from whether a click/hotkey intent was captured.
      // This keeps tracking alive while the HUD is minimized and still avoids
      // counting pre-existing annotations because the first task observation is
      // baseline-only.
      reconcileStableCoverageCounters(persons, deleted);
      // No-Match DOM state is intentionally not auto-reconciled.
      if (nm !== null) current.noMatchState = nm;
    } else if (hasOpenTask() || submitPending()) {
      if (!missingHeaderSince) {
        missingHeaderSince = Date.now();
        // A successful Submit often leaves a stable queue DOM after one React
        // transition. Schedule our own confirmation scan so counting does not
        // depend on a second unrelated mutation or the 15-second timer.
        scheduleScan(pending.submit ? 760 : 1600);
      }
      const submitFailure = REJECTED_NOTICE.test(text);
      if (pending.submit && submitFailure && Date.now() - pending.submit.at > 500) {
        emitAction('submit-cancelled');
        pending.submit = null;
        clearSubmitCheckpoint();
      } else if (pending.submit && pending.submit.acceptedAt && !submitFailure) {
        confirmPendingSubmit('augmoto-success-notice');
      } else if (pending.submit && coverageLandingVisible(text)) {
        observeSubmitToJobs(text);
        scheduleScan(200);
      } else if (!pending.submit && !pending.skip && Date.now() - missingHeaderSince > 1500) {
        clearIdleBoundary();
        const exitAt = Date.now();
        current = { jobId: '', taskIndex: 0, totalTasks: 0, emptyArea: null, humanEmpty: null, persons: null, deleted: null, productMatched: null, noMatchState: null };
        noMatchDomCandidate = { taskKey: '', signature: '', at: 0 };
        noMatchDomLastSent = { taskKey: '', signature: '' };
        counterDomCandidate = { taskKey: '', persons: null, deleted: null, at: 0 };
        createDomCandidate = { taskKey: '', empty: null, human: null, at: 0 };
        productMatchDomCandidate = { taskKey: '', matched: null, at: 0 };
        lastTaskSignature = '';
        queueIdleSinceAt = exitAt;
        if (isAwayNow() && !awaySinceAt) awaySinceAt = exitAt;
        const exitState = computePresenceState(exitAt);
        presenceState = exitState;
        send('cat-event', { event: {
          eventId: eventId('task-exit'), type: 'task-exit', timestamp: exitAt, date: phtDate(),
          jobId: '', taskIndex: 0, totalTasks: 0,
          trackerState: exitState, lastActivityAt: lastInteraction,
          idleSinceAt: exitState === 'idle' ? queueIdleSinceAt : 0,
          awaySinceAt: exitState === 'away' ? (awaySinceAt || exitAt) : 0,
          idleThresholdMs: MANAGED_IDLE_MS
        } }).catch(() => {});
        emitPresence(exitState, true);
      }
    }
    refreshHud();
  }

  function scheduleScan(delay = 220) {
    if (scanTimer) return;
    scanTimer = setTimeout(scan, delay);
  }

  function nearbyHeaderControl(target, name) {
    const tr = target.getBoundingClientRect();
    const all = Array.from(document.querySelectorAll('button,[role="button"],input[type="button"],input[type="submit"]')).slice(0, 1000);
    return all.some(el => {
      if (lower(label(el)) !== name || disabled(el)) return false;
      const r = el.getBoundingClientRect();
      return Math.abs((r.top + r.height / 2) - (tr.top + tr.height / 2)) < 70 && r.right < tr.left + 30 && tr.left - r.left < 500;
    });
  }

  // Coverage Submit may have an accessible text variant or a duplicate
  // unrelated action elsewhere on the page. Only capture a unique real task
  // toolbar/header action; never use an arbitrary duplicate or a dialog.
  function coverageSubmitLabel(el) {
    if (!el) return false;
    const labels = [label(el), el.getAttribute?.('aria-label'), el.getAttribute?.('title'), el.value];
    return labels.some(raw => /^(?:submit|submit task|submit & next|submit and next)(?:\s*\(enter\))?$/i.test(clean(raw)));
  }
  function coverageSubmitLocation(el) {
    const r = el.getBoundingClientRect();
    const vw = Math.max(1, innerWidth), vh = Math.max(1, innerHeight);
    if (r.width < 20 || r.height < 16) return '';
    if (el.closest?.('[role="dialog"],[aria-modal="true"],.modal')) return '';
    if (el.closest?.('header,[role="toolbar"],[data-testid*="task"],[class*="task-header"],[class*="TaskHeader"]')) return 'toolbar';
    if (nearbyHeaderControl(el, 'skip') || nearbyHeaderControl(el, 'exit')) return 'near-actions';
    if (r.top <= Math.min(360, vh * .5) && r.left >= vw * .5) return 'header';
    return '';
  }
  function realHeaderAction(el, name) {
    if (!(el instanceof Element) || disabled(el)) return false;
    if (name === 'submit') {
      const activeHeader=headerState(document.body?.innerText||document.body?.textContent||'');
      if (!(activeHeader?.jobId && activeHeader?.taskIndex && shiftState?.status === 'active') || !coverageSubmitLabel(el)) return false;
      const loc = coverageSubmitLocation(el);
      if (!loc) return false;
      const all = Array.from(document.querySelectorAll('button,[role="button"],input[type="submit"]'))
        .filter(btn => !disabled(btn) && coverageSubmitLabel(btn) && coverageSubmitLocation(btn));
      if (!all.includes(el)) return false;
      // A single active Submit is authoritative. If multiple are visible,
      // require the clicked control to be the only one in a task-specific
      // toolbar or next to the real Skip/Exit task controls.
      if (all.length === 1) return true;
      const taskSpecific = all.filter(btn => ['toolbar','near-actions'].includes(coverageSubmitLocation(btn)));
      return taskSpecific.length === 1 && taskSpecific[0] === el;
    }
    if (lower(label(el)) !== name) return false;
    const r=el.getBoundingClientRect();
    return r.width >= 20 && r.height >= 16 && r.top <= Math.min(360,Math.max(1,innerHeight)*.5) && r.left >= Math.max(1,innerWidth)*.5;
  }

  function captureCoverageSubmit(el) {
    if (!realHeaderAction(el, 'submit')) return false;
    // Capture-phase DOM evidence is fresher than the previous scan's `current`.
    // A fast labeler may already see and Submit the next task before a scan.
    const observed=headerState(document.body?.innerText||document.body?.textContent||'');
    if(!observed?.jobId || !observed.taskIndex || !observed.totalTasks ||
       !shiftState?.sessionId || shiftState.status!=='active')return false;
    if (submitPending()) {
      const old=pending.submit;
      if(old.jobId===observed.jobId && Number(old.taskIndex)===Number(observed.taskIndex))return true;
      if(coverageBacklog.length>=COVERAGE_BACKLOG_LIMIT || !canPromoteCoverageSubmit(old,observed)){
        feedback('capture_problem',old.id);return false;
      }
      coverageBacklog.push({...old,observedNext:{...observed},transitionObservedAt:Date.now()});
      if(!persistCoverageBacklog()){
        coverageBacklog.pop();persistCoverageBacklog();return false;
      }
      // The older receipt is now independently durable in this tab, so a
      // previous background response cannot block capturing the next task.
      pending.submit=null;
      setTimeout(()=>drainCoverageSubmitLedger().catch(()=>{}),0);
    }
    current.jobId=observed.jobId;
    current.taskIndex=observed.taskIndex;
    current.totalTasks=observed.totalTasks;
    const attempt = {id:eventId('coverage-submit'), at:Date.now(),
      jobId:observed.jobId,taskIndex:observed.taskIndex,totalTasks:observed.totalTasks,
      queueEligible:true,pageInstanceId:PAGE_INSTANCE_ID,
      date:shiftState.reportDate,sessionId:shiftState.sessionId,
      generation:Number(shiftState.generation),deviceId:bridgeState?.deviceId||''};
    pending.submit=attempt;
    saveSubmitCheckpoint(attempt);
    feedback('captured',attempt.id,attempt.at);
    chrome.runtime.sendMessage({type:'cat-submit-attempt',attempt:{
      id:attempt.id,at:attempt.at,jobId:attempt.jobId,taskIndex:attempt.taskIndex,
      totalTasks:attempt.totalTasks,date:shiftState.reportDate,sessionId:shiftState.sessionId,
      generation:shiftState.generation,deviceId:bridgeState?.deviceId||''
    }}).then(result=>{if(!result?.ok)feedback('capture_problem',attempt.id);}).catch(()=>{
      feedback('capture_problem',attempt.id);
    });
    pending.skip=null;
    emitAction('submit-pending');
    scheduleScan(120);
    setTimeout(()=>{if(pending.submit)scheduleScan(0);},850);
    return true;
  }

  function clickIntent(event) {
    if (isHudEvent(event)) return;
    if (!event.isTrusted) return;
    // Cancel explicit navigation before scan can interpret its destination.
    const target=interactiveFromEvent(event);
    const action=lower(label(target));
    if(pending.submit && (['skip','exit','home','jobs','my tasks','back'].includes(action) ||
        target?.closest?.('a[href]')))cancelSubmitNavigation();
    noteActivity(event);
    const el = interactiveFromEvent(event);
    if (!el || disabled(el)) return;
    // Synchronous capture-phase handler: Augmoto may navigate immediately
    // after its own Submit handler. Never wait for the DOM scan, efficiency
    // queue, task transition, or service-worker acknowledgment to preserve intent.
    if (captureCoverageSubmit(el)) return;
    scan(); // Non-Submit annotation actions still flush prior DOM changes.
    const l = lower(label(el));
    const railNoMatch = railNoMatchIntent(el);
    if (railNoMatch) {
      emitNoMatchMark(railNoMatch.area, 'rail-click');
      return;
    }
    if (realHeaderAction(el, 'skip') || l === 'skip') {
      pending.skip = { at: Date.now(), jobId: current.jobId, taskIndex: current.taskIndex, totalTasks: current.totalTasks };
      pending.submit = null;
      clearSubmitCheckpoint();
      scheduleScan(200);
      return;
    }
    if ((/draw empty area|create box|empty area/.test(l) && /draw|create/.test(l)) || /^empty area(?: \(q\))?$/.test(l)) rememberIntent('create');
    else if (/draw person|unblurred person|person box|^person(?: \(w\))?$/.test(l)) rememberIntent('blur');
    else if (/delete|trash|remove box/.test(l)) rememberIntent('del');
    else if (/no.?match|no matching product/.test(l)) {
      const area = selectedEmptyArea();
      if (/clear|remove/.test(l)) { if (!emitNoMatchClear(area, 'detail-clear')) rememberIntent('noMatch'); }
      else if (!emitNoMatchMark(area, 'detail-click')) rememberIntent('noMatch');
    }
  }

  function keyIntent(event) {
    if (!event.isTrusted) return;
    const k = String(event.key || '').toLowerCase();
    if(k==='escape' || (event.altKey && k==='arrowleft')) cancelSubmitNavigation();
    const hudEvent = isHudEvent(event);
    const fromCollapsedToggle = hudEvent && settings.hudExpanded === false && event.target instanceof Element && Boolean(event.target.closest('[data-cat-toggle]')) && ['q','w','d','x'].includes(k);
    if (hudEvent && !fromCollapsedToggle) return;
    noteActivity(event);
    if (event.repeat || event.ctrlKey || event.altKey || event.metaKey || isTypingTarget(event.target)) return;
    scan(); // Preserve rapid consecutive toggle transitions.
    if (k === 'q') rememberIntent('create');
    else if (k === 'w') rememberIntent('blur');
    else if (k === 'd') rememberIntent('del');
    else if (k === 'x') {
      const area = selectedEmptyArea();
      if (!emitNoMatchMark(area, 'hotkey-x')) rememberIntent('noMatch');
    }
  }

  function recordPresenceTime(at, state, activityHandoff = false) {
    const start=lastTick;
    const delta=Math.min(60000,Math.max(0,at-start));
    lastTick=at;
    if(delta<250 || shiftState?.status!=='active' || !settings.enabled || !activityOwned)return;
    // When a hidden tab's timer is throttled, split a late sample at the
    // original 30s deadline rather than crediting the whole gap as GRACE.
    const deadline=state==='grace'?integrity?.graceDeadlineAt():0;
    const grace=state==='grace'?(deadline?Math.min(delta,Math.max(0,Math.min(at,deadline)-Math.max(start,at-60000))):delta):0;
    const unverified=state==='unverified'?delta:(state==='grace'?delta-grace:0);
    send('cat-time',{activityHandoff,payload:{...presencePayload(state,at),elapsedMs:delta,
      activeMs:state==='active'?delta:0,idleMs:state==='idle'||state==='away'?delta:0,
      awayMs:state==='away'?delta:0,searchingMs:state==='searching'?delta:0,
      graceMs:grace,unverifiedMs:unverified}}).catch(()=>{});
  }

  function tick() {
    if (!settings.enabled) return;
    // Recover missed React mutations while visible. Hidden tabs continue
    // processing pending Submits, but don't parse the whole page unnecessarily.
    if(!document.hidden || submitPending() || coverageBacklog.length) scheduleScan(0);
    const now = Date.now();
    updateActivityOwner();
    if (!activityOwned) {lastTick=now;return;}
    // Timing is settled separately on blur/focus so a 10-second Discord check
    // is not silently booked as verified ACTIVE work by a later 15s tick.

    if (!hasOpenTask() && !queueIdleSinceAt) queueIdleSinceAt = now;

    if (isAwayNow()) {
      if (!awaySinceAt) awaySinceAt = now;
    } else {
      awaySinceAt = 0;
    }
    searchPresence?.poll().then(s=>{ if(s==='idle'||s==='locked')emitPresence(computePresenceState(),true); }).catch(()=>{});
    const state = computePresenceState(now);
    recordPresenceTime(now, presenceState==='grace' ? 'grace' : state);
    updateLocalPresence(state, now);
    refreshContext(false);
    if (state === 'active') scheduleIdleBoundary();
  }

  function fmt(ms) {
    const totalSeconds = Math.floor((Number(ms) || 0) / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
  }


  function submittedTotal() {
    const confirmed = Math.max(0, Number(summary.submitted) || 0);
    const manualRaw = Number(summary.submittedManualAdjustment);
    const manual = Number.isFinite(manualRaw) ? Math.trunc(manualRaw) : 0;
    return Math.max(0, confirmed + manual);
  }

  function setHudExpanded(next) {
    const expanded = Boolean(next);
    const revision = ++hudPreferenceRevision;
    hudPreferencePending = true;
    settings.hudExpanded = expanded;
    // Repaint immediately so the Agent gets visual feedback before storage/network work.
    refreshHud();
    send('cat-settings', { patch: { hudExpanded: expanded } }).then(result => {
      if (revision !== hudPreferenceRevision) return;
      const stored = result?.settings?.hudExpanded;
      if (typeof stored === 'boolean' && stored !== settings.hudExpanded) {
        settings.hudExpanded = stored;
        refreshHud();
      }
    }).catch(() => {}).finally(() => {
      if (revision === hudPreferenceRevision) hudPreferencePending = false;
    });
  }

  function bindHudControls(hud) {
    if (!hud || hud.dataset.catToggleBound === '1') return;
    hud.dataset.catToggleBound = '1';
    // Capture on the HUD root so Augmoto/page handlers cannot swallow the +/- control.
    hud.addEventListener('click', event => {
      const target = event.target instanceof Element ? event.target.closest('[data-cat-toggle]') : null;
      if (!target || !hud.contains(target)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      const expanded = settings.hudExpanded !== false;
      setHudExpanded(!expanded);
      // The collapse button must never keep keyboard focus. Augmoto uses Q/W/D/X
      // hotkeys, and a focused tracker button made those keystrokes look like HUD
      // interaction even though the page still performed the action.
      requestAnimationFrame(() => { try { target.blur(); } catch (_) {} try { window.focus(); } catch (_) {} });
    }, true);
  }

  function refreshHud() {
    if (confirmationRoute()) { const old=document.getElementById(HUD_ID);if(old)old.style.display="none";return; }
    cleanupLegacyHudNodes();
    let hud = document.getElementById(HUD_ID);
    if (!settings.enabled) { hud?.remove(); return; }
    if (!hud) {
      hud = document.createElement('div');
      hud.id = HUD_ID;
      hud.setAttribute('role', 'complementary');
      hud.setAttribute('aria-label', 'Coverage Activity Tracker');
      Object.assign(hud.style, {
        position: 'fixed', zIndex: '2147483646', border: '1px solid rgba(15,46,109,.10)', borderRadius: '16px',
        padding: '0', background: 'rgba(255,255,255,.985)', color: '#142033',
        font: '600 11px/1.35 system-ui,-apple-system,Segoe UI,sans-serif', textAlign: 'left', cursor: 'default',
        boxShadow: '0 12px 28px rgba(15,23,42,.13), 0 2px 8px rgba(15,46,109,.05)', backdropFilter: 'blur(10px)', boxSizing: 'border-box',
        overflow: 'hidden', userSelect: 'none', transition: 'width .14s ease, height .14s ease'
      });
      hud.dataset.catVersion = EXT_VERSION;
      (document.documentElement || document.body).appendChild(hud);
    }
    // Keep the control mounted through scans, storage updates, and pointer down/up.
    let toggle = hud.querySelector('[data-cat-toggle]');
    if (!toggle) {
      toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.dataset.catToggle = 'collapse';
      toggle.style.cssText = 'position:absolute;top:9px;right:9px;z-index:1;border:1px solid #E4E9F0;background:rgba(255,255,255,.96);color:#0F2E6D;border-radius:9px;width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center;font:800 13px/1 system-ui;cursor:pointer;box-shadow:0 1px 3px rgba(15,23,42,.07)';
      hud.appendChild(toggle);
    }
    let content = hud.querySelector('[data-cat-content]');
    if (!content) {
      content = document.createElement('div');
      content.dataset.catContent = '';
      content.dataset.ttBody = '';
      hud.appendChild(content);
    }
    bindHudControls(hud);

    const pos = settings.hudPosition || 'bottom-left';
    hud.style.top = pos.startsWith('top') ? '12px' : 'auto';
    hud.style.bottom = pos.startsWith('bottom') ? '12px' : 'auto';
    hud.style.left = pos.endsWith('left') ? '12px' : 'auto';
    hud.style.right = pos.endsWith('right') ? '12px' : 'auto';

    window.TrinoTimeHudAppearance?.attach(hud);
    window.TrinoTimeHudAppearance?.place(hud);
    const job = current.jobId ? `${current.jobId} · ${current.taskIndex}/${current.totalTasks}` : 'No active job';
    const shiftStatus=String(shiftState?.status||'not_clocked_in');
    const state = shiftStatus==='active' ? (summary.trackerState || presenceState || 'ready') : 'offline';
    const syncAge = syncState.lastSyncAt ? Math.max(0, Date.now() - Number(syncState.lastSyncAt)) : Infinity;
    const syncLabel = bridgeState?.token ? (syncState.state === 'error' ? 'SYNC ERROR' : syncAge < 30000 ? 'LIVE' : 'SYNC') : 'LOCAL';
    const bridgeAgentName = esc(bridgeState?.actor?.name || '');
    const stateLabel = shiftStatus==='completed' ? 'SHIFT COMPLETE' : shiftStatus==='not_clocked_in' ? 'TIME IN REQUIRED' : String(state || 'ready').toUpperCase();
    const currentIdle = state === 'idle' ? Math.max(0, Date.now() - (Number(summary.idleSinceAt) || (lastInteraction + MANAGED_IDLE_MS))) : 0;
    const stateExtra = shiftStatus==='completed' ? 'Final totals locked · Time In again to start a new session' : shiftStatus==='not_clocked_in' ? 'Tracker waits for TrinoTime Time In' : state === 'idle' ? `Idle ${fmt(currentIdle)}` : state === 'away' ? 'Away' : state === 'searching' ? 'Finding a store · search allowance' : state === 'grace' ? 'Work-tool transition · 30s allowance' : state === 'unverified' ? 'Activity not verified · no automatic penalty' : state === 'active' ? 'Working' : stateLabel;
    const stateColors = {
      active: { bg: '#E7F6EE', fg: '#177245', dot: '#1CA86A' },
      idle: { bg: '#FFF4DB', fg: '#9A6700', dot: '#F0B429' },
      searching: { bg: '#E9F4FF', fg: '#1C5AA6', dot: '#2B8CEE' },
      grace: { bg: '#E9F4FF', fg: '#1C5AA6', dot: '#2B8CEE' },
      unverified: { bg: '#FFF4DB', fg: '#9A6700', dot: '#F0B429' },
      away: { bg: '#EEF2F7', fg: '#445269', dot: '#94A3B8' },
      ready: { bg: '#E8F0FF', fg: '#1F5FBF', dot: '#3B82F6' },
      submitting: { bg: '#E8F0FF', fg: '#1F5FBF', dot: '#3B82F6' },
      offline: { bg: '#F3F4F6', fg: '#4B5563', dot: '#9CA3AF' }
    };
    const tone = stateColors[state] || stateColors.offline;
    const syncTone = syncLabel === 'SYNC ERROR'
      ? { bg: '#FDECEC', fg: '#B42318', dot: '#F04438' }
      : syncLabel === 'LIVE'
        ? { bg: '#E7F6EE', fg: '#177245', dot: '#1CA86A' }
        : { bg: '#EEF2F7', fg: '#445269', dot: '#94A3B8' };
    const hudExpanded = settings.hudExpanded !== false;
    toggle.dataset.catToggle = hudExpanded ? 'collapse' : 'expand';
    toggle.textContent = hudExpanded ? '−' : '+';
    toggle.title = hudExpanded ? 'Minimize Coverage Tracker' : 'Expand Coverage Tracker';
    toggle.setAttribute('aria-label', toggle.title);
    toggle.setAttribute('aria-expanded', String(hudExpanded));

    hud.dataset.ttCompact = hudExpanded ? 'false' : 'true';
    if (!hudExpanded) {
      // Minimized-only micro HUD: retain the existing full-size expanded view.
      // Agent identity remains accessible through the tooltip and expanded card.
      hud.style.width = `${getHudMaxWidthPx(168)}px`;
      hud.style.height = '44px';
      hud.style.minWidth = '0';
      hud.style.maxWidth = 'calc(100vw - 24px)';
      const miniState=stateLabel === 'TIME IN REQUIRED' ? 'TIME IN' : stateLabel === 'SHIFT COMPLETE' ? 'DONE' : stateLabel;
      const miniSync=syncLabel === 'SYNC ERROR' ? 'ERROR' : syncLabel;
      const label=bridgeAgentName ? `Coverage · ${bridgeAgentName} · ${esc(miniState)} · ${esc(miniSync)}` : `Coverage · ${esc(miniState)} · ${esc(miniSync)}`;
      hud.title = label;
      content.innerHTML = `
        <div data-tt-micro-content style="height:44px;box-sizing:border-box;display:flex;align-items:center;padding:5px 66px 5px 8px;background:linear-gradient(180deg,#ffffff 0%,#f7f9fc 100%);">
          <div style="display:flex;flex-direction:column;justify-content:center;gap:5px;min-width:0;width:100%;overflow:hidden;">
            <span data-tt-title title="${label}" style="display:block;overflow:hidden;text-overflow:ellipsis;font:850 10px/1 system-ui,-apple-system,Segoe UI,sans-serif;letter-spacing:.035em;color:#0F2E6D;">COVERAGE <span style="color:#C2410C;font-size:7px;letter-spacing:0">PROD</span></span>
            <span style="display:flex;align-items:center;gap:4px;min-width:0;white-space:nowrap;font:750 9px/1 system-ui,-apple-system,Segoe UI,sans-serif;color:${tone.fg};">
              <span style="width:6px;height:6px;flex:0 0 6px;border-radius:50%;background:${tone.dot};"></span>
              <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;">${esc(miniState)} · ${esc(miniSync)}</span>
            </span>
          </div>
        </div>`;
    } else {
      hud.removeAttribute('title');
      // Keep the full HUD inside Augmoto's left navigation/work area. At the
      // normal Coverage layout this stops a few pixels before the vertical
      // divider instead of floating over the jobs table.
      hud.style.width = `${getHudMaxWidthPx(216)}px`;
      hud.style.height = 'auto';
      hud.style.minWidth = '0';
      hud.style.maxWidth = 'calc(100vw - 24px)';
      content.innerHTML = `
        <div style="padding:10px 10px 8px;background:linear-gradient(180deg,#ffffff 0%,#fbfcfe 100%);border-bottom:1px solid #EEF2F6;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:7px;padding-right:47px;">
            <div style="display:flex;align-items:center;gap:5px;min-width:0;">
              <span data-tt-title style="font:850 11px/1 system-ui,-apple-system,Segoe UI,sans-serif;letter-spacing:.095em;color:#0F2E6D;">COVERAGE</span>
              <span style="display:inline-flex;align-items:center;padding:2px 4px;border-radius:999px;background:#FFF7ED;color:#C2410C;font:850 7px/1 system-ui,-apple-system,Segoe UI,sans-serif;letter-spacing:.04em;">PROD</span>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:5px;margin-top:6px;">
            <span style="display:inline-flex;align-items:center;gap:5px;padding:4px 7px;border-radius:999px;background:${tone.bg};color:${tone.fg};font:850 9px/1 system-ui,-apple-system,Segoe UI,sans-serif;letter-spacing:.02em;">
              <span style="width:6px;height:6px;border-radius:999px;background:${tone.dot};flex:0 0 auto"></span>${stateLabel}
            </span>
            <span style="display:inline-flex;align-items:center;gap:5px;padding:4px 7px;border-radius:999px;background:${syncTone.bg};color:${syncTone.fg};font:850 9px/1 system-ui,-apple-system,Segoe UI,sans-serif;letter-spacing:.02em;">
              <span style="width:6px;height:6px;border-radius:999px;background:${syncTone.dot};flex:0 0 auto"></span>${syncLabel}
            </span>
          </div>
          ${bridgeAgentName ? `<div title="${bridgeAgentName}" style="margin-top:7px;max-width:196px;color:#1F2937;font:800 9.5px/1.15 system-ui,-apple-system,Segoe UI,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${bridgeAgentName}</div>` : ''}
          ${submitFeedback.stage && Date.now()-submitFeedback.at<120000 ? `<div data-tt-submit-feedback title="Submit attempts are not counted until completion is verified; only server receipts prove sync." style="margin-top:5px;color:${submitFeedback.stage==='acknowledged'?'#177245':submitFeedback.stage==='unverified'||submitFeedback.stage==='capture_problem'?'#B42318':'#445269'};font:750 9px/1.25 system-ui,-apple-system,Segoe UI,sans-serif;">${esc(SUBMIT_FEEDBACK_TEXT[submitFeedback.stage]||'Submit status pending')}</div>` : ''}
          <div style="display:flex;align-items:center;gap:5px;margin-top:5px;min-width:0;">
            <span style="min-width:0;flex:1;color:#526071;font:700 8.5px/1.2 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${job}</span>
            <span style="width:3px;height:3px;border-radius:999px;background:#CBD5E1;flex:0 0 auto"></span>
            <span style="max-width:76px;color:#7A8798;font:700 8px/1.2 system-ui,-apple-system,Segoe UI,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${stateExtra}</span>
          </div>
        </div>
        <div style="padding:7px 9px 8px;background:#ffffff;display:flex;flex-direction:column;gap:7px;">
          <div style="display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px;">
            <div style="min-width:0;padding:5px 2px 6px;border-radius:9px;background:#FBFCFE;border:1px solid #E7EBF1;text-align:left;"><div style="color:#7B8798;font:800 7.5px/1 system-ui,-apple-system,Segoe UI,sans-serif;letter-spacing:.05em;" title="Q hotkey — Net HUMAN boxes still present">Q</div><div style="margin-top:3px;color:#8793A3;font:750 5.8px/1 system-ui,-apple-system,Segoe UI,sans-serif;letter-spacing:.025em;white-space:nowrap;">CREATE</div><div style="margin-top:5px;color:#111827;font:850 15px/1 system-ui,-apple-system,Segoe UI,sans-serif;">${summary.created || 0}</div></div>
            <div style="min-width:0;padding:5px 2px 6px;border-radius:9px;background:#FBFCFE;border:1px solid #E7EBF1;text-align:left;"><div style="color:#7B8798;font:800 7.5px/1 system-ui,-apple-system,Segoe UI,sans-serif;letter-spacing:.05em;" title="W hotkey — Net Person boxes still present">W</div><div style="margin-top:3px;color:#8793A3;font:750 5.8px/1 system-ui,-apple-system,Segoe UI,sans-serif;letter-spacing:.025em;white-space:nowrap;">PERSON</div><div style="margin-top:5px;color:#111827;font:850 15px/1 system-ui,-apple-system,Segoe UI,sans-serif;">${summary.blurred || 0}</div></div>
            <div style="min-width:0;padding:5px 2px 6px;border-radius:9px;background:#FBFCFE;border:1px solid #E7EBF1;text-align:left;"><div style="color:#7B8798;font:800 7.5px/1 system-ui,-apple-system,Segoe UI,sans-serif;letter-spacing:.05em;" title="D hotkey — Delete box">D</div><div style="margin-top:3px;color:#8793A3;font:750 5.8px/1 system-ui,-apple-system,Segoe UI,sans-serif;letter-spacing:.025em;white-space:nowrap;">DELETE</div><div style="margin-top:5px;color:#111827;font:850 15px/1 system-ui,-apple-system,Segoe UI,sans-serif;">${summary.deleted || 0}</div></div>
            <div style="min-width:0;padding:5px 2px 6px;border-radius:9px;background:#FBFCFE;border:1px solid #E7EBF1;text-align:left;"><div style="color:#7B8798;font:800 7.5px/1 system-ui,-apple-system,Segoe UI,sans-serif;letter-spacing:.05em;" title="X hotkey — No match">X</div><div style="margin-top:3px;color:#8793A3;font:750 5.3px/1 system-ui,-apple-system,Segoe UI,sans-serif;letter-spacing:.005em;white-space:nowrap;">NO MATCH</div><div style="margin-top:5px;color:#111827;font:850 15px/1 system-ui,-apple-system,Segoe UI,sans-serif;">${summary.noMatch || 0}</div></div>
            <div style="min-width:0;padding:5px 2px 6px;border-radius:9px;background:#F3FBF6;border:1px solid #CFE9D8;text-align:left;"><div style="color:#238452;font:850 7.5px/1 system-ui,-apple-system,Segoe UI,sans-serif;" title="Net Product Matches confirmed in Augmoto">✓</div><div style="margin-top:3px;color:#3B8E60;font:800 5.8px/1 system-ui,-apple-system,Segoe UI,sans-serif;letter-spacing:.025em;white-space:nowrap;">MATCH</div><div style="margin-top:5px;color:#17663C;font:900 15px/1 system-ui,-apple-system,Segoe UI,sans-serif;">${summary.productMatched || 0}</div></div>
          </div>
          <div style="display:grid;grid-template-columns:auto 1fr;gap:8px;align-items:end;padding-top:7px;border-top:1px solid #EEF2F6;">
            <div style="min-width:64px;">
              <div style="color:#7B8798;font:800 7.5px/1 system-ui,-apple-system,Segoe UI,sans-serif;letter-spacing:.05em;">SUBMITTED</div>
              <div style="margin-top:4px;color:#111827;font:900 15px/1 system-ui,-apple-system,Segoe UI,sans-serif;">${submittedTotal()} <span style="color:#8A96A6;font:750 9px/1 system-ui,-apple-system,Segoe UI,sans-serif;">/ ${settings.dailyGoal || 300}</span></div>
            </div>
            <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:3px;text-align:right;">
              <div><div style="color:#8A96A6;font:750 6.5px/1 system-ui,-apple-system,Segoe UI,sans-serif;letter-spacing:.03em;">ACTIVE</div><div style="margin-top:3px;color:#374151;font:850 9px/1 system-ui,-apple-system,Segoe UI,sans-serif;font-variant-numeric:tabular-nums;">${fmt(summary.activeMs)}</div></div>
              <div><div style="color:#8A96A6;font:750 6.5px/1 system-ui,-apple-system,Segoe UI,sans-serif;letter-spacing:.03em;">IDLE</div><div style="margin-top:3px;color:#5E6B7B;font:850 9px/1 system-ui,-apple-system,Segoe UI,sans-serif;font-variant-numeric:tabular-nums;">${fmt(Math.max(0,(Number(summary.idleMs)||0)-(Number(summary.awayMs)||0)))}</div></div>
              <div><div style="color:#8A96A6;font:750 6.5px/1 system-ui,-apple-system,Segoe UI,sans-serif;letter-spacing:.03em;">AWAY</div><div style="margin-top:3px;color:#5E6B7B;font:850 9px/1 system-ui,-apple-system,Segoe UI,sans-serif;font-variant-numeric:tabular-nums;">${fmt(summary.awayMs)}</div></div>
            </div>
          </div>
        </div>`;
    }

  }

  async function refreshContext(force = true) {
    try {
      const preferenceRevision = hudPreferenceRevision;
      const ctx = await send('cat-context');
      if (!ctx) return;
      const localExpanded = settings.hudExpanded;
      settings = { ...settings, ...ctx.settings, enabled: true, idleMinutes: MANAGED_IDLE_MINUTES };
      if (hudPreferencePending || preferenceRevision !== hudPreferenceRevision) settings.hudExpanded = localExpanded;
      summary = { ...summary, ...ctx.summary, idleThresholdMs: MANAGED_IDLE_MS };
      syncState = ctx.sync || {};
      bridgeState = ctx.bridge || null;
      shiftState = ctx.shift || shiftState;
      const attemptStatus=ctx.latestSubmitAttempt;
      if(attemptStatus && Number(attemptStatus.at)>Date.now()-120000 &&
          (!submitFeedback.id || attemptStatus.id===submitFeedback.id || attemptStatus.at>submitFeedback.at)) {
        submitFeedback={id:attemptStatus.id,stage:attemptStatus.status,at:attemptStatus.at};
      }
      if (shiftState?.status !== 'active') { summary.trackerState='offline'; presenceState='offline'; pending={create:null,blur:null,del:null,noMatch:null,submit:null,skip:null}; }
      else if (summary.trackerState) presenceState = summary.trackerState;

      // Preserve the current presence session across a normal Augmoto reload.
      // Daily accumulated timing already lives in chrome.storage; this restores
      // the visible live streak boundary so refresh cannot reset an Agent's
      // queue-idle or in-task idle/away timer back to zero.
      if (shiftState?.status === 'active' && /^\d{4}-\d{2}-\d{2}$/.test(String(ctx.today||''))) {
        const savedJob = clean(summary.currentJob);
        const savedTask = Number(summary.currentTask) || 0;
        const savedState = String(summary.trackerState || '').toLowerCase();
        if (savedJob && savedTask) {
          // A Submit click is persisted immediately in the background. If
          // Augmoto performs a full navigation/reload before the next task/queue
          // renders, reconstruct the pending intent so the confirmed transition
          // is not lost with the old page's content-script memory.
          // Restoring a Submit from summary.pendingSubmission created stale
          // phantom intents; v2.2.42 restores only validated checkpoints.
          resumePresence = {
            jobId: savedJob,
            taskIndex: savedTask,
            totalTasks: Number(summary.totalTasks) || 0,
            trackerState: savedState,
            lastActivityAt: Math.max(0, Number(summary.lastActivityAt) || 0),
            idleSinceAt: Math.max(0, Number(summary.idleSinceAt) || 0),
            awaySinceAt: Math.max(0, Number(summary.awaySinceAt) || 0)
          };
          if (resumePresence.lastActivityAt) lastInteraction = resumePresence.lastActivityAt;
          if (savedState === 'away' && resumePresence.awaySinceAt) awaySinceAt = resumePresence.awaySinceAt;
        } else if (!savedJob) {
          resumePresence = null;
          if (savedState === 'idle' && Number(summary.idleSinceAt) > 0) queueIdleSinceAt = Number(summary.idleSinceAt);
          if (savedState === 'away' && Number(summary.awaySinceAt) > 0) awaySinceAt = Number(summary.awaySinceAt);
        }
      }

      refreshHud();
      if (force) scheduleScan(80);
    } catch (_) {}
  }

  function installObserver() {
    if (observer || !document.documentElement) return;
    observer = new MutationObserver(muts => {
      // Never skip a pending Submit: acceptance evidence is essential.
      // Otherwise a hidden/non-Coverage tab has no reason to rescan the DOM.
      if((document.hidden || confirmationRoute()) && !submitPending() && !coverageBacklog.length)return;
      captureAcceptedNoticeFromMutations(muts);
      for (const m of muts) {
        const node = m.target.nodeType === 1 ? m.target : m.target.parentElement;
        if (node?.closest?.('#' + HUD_ID)) continue;
        if (m.type === 'childList' && [...m.addedNodes, ...m.removedNodes].length &&
            [...m.addedNodes, ...m.removedNodes].every(n => n.nodeType === 1 && n.id === HUD_ID)) continue;
        if (m.type === 'characterData' || m.type === 'childList' || ['title', 'aria-label', 'disabled', 'aria-disabled', 'aria-pressed', 'aria-checked', 'class', 'style'].includes(m.attributeName)) {
          scheduleScan(220); break;
        }
      }
    });
    observer.observe(document.documentElement, {
      subtree: true, childList: true, characterData: true, attributes: true,
      attributeFilter: ['title', 'aria-label', 'disabled', 'aria-disabled', 'aria-pressed', 'aria-checked', 'class', 'style']
    });
  }

  // Augmoto's own successful Submit can change browser history on the way
  // back to Jobs. popstate alone is NOT a manual Exit or rejection: keep the
  // shift-bound Submit checkpoint until actual acceptance evidence is checked.
  // The trusted Skip/Exit/navigation click and Escape handlers still cancel.
  function handleCoverageHistoryChange() {
    if (submitPending()) scheduleScan(90);
  }
  window.addEventListener('popstate', handleCoverageHistoryChange, true);
  document.addEventListener('click', clickIntent, true);
  // Native keyboard/form submissions may bypass the button's click listener.
  // Require the browser's trusted submit event and its actual submitter. The
  // same-task guard above deduplicates click+submit from one user action.
  document.addEventListener('submit', event => {
    if (event?.isTrusted === false || !event.submitter || isHudEvent(event)) return;
    captureCoverageSubmit(event.submitter);
  }, true);
  document.addEventListener('keydown', keyIntent, true);
  for (const e of ['input','change']) document.addEventListener(e, noteActivity, true);
  for (const e of ['pointerdown', 'scroll', 'touchstart']) document.addEventListener(e, noteActivity, { capture: true, passive: true });
  document.addEventListener('visibilitychange', handleVisibilityOrFocus);
  window.addEventListener('pagehide',()=>{recordPresenceTime(Date.now(),presenceState,true);},true);
  window.addEventListener('focus', handleVisibilityOrFocus, true);
  window.addEventListener('focus', () => { send('cat-refresh-shift').then(()=>refreshContext(false)).catch(()=>{}); }, true);
  window.addEventListener('blur', handleVisibilityOrFocus, true);
  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden || submitPending() || coverageBacklog.length)scheduleScan(60);
  });

  const boot = async () => {
    installObserver();
    // Important ordering: persisted counters/state first, authoritative context
    // second, DOM scan last. Never let a page reload scan from an all-zero shell.
    await hydrateLocalCoverageSnapshot();
    await refreshContext(false);
    searchPresence?.poll(true).catch(()=>{});
    lastTick = Date.now();
    updateActivityOwner(true);
    tickTimer = setInterval(tick, 15000);
    setInterval(() => { if(coverageBacklog.length)drainCoverageSubmitLedger().catch(()=>{}); }, 2500);
    scheduleScan(100);
    setTimeout(() => { if (!hasOpenTask()) emitPresence(computePresenceState(), true); }, 350);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { boot().catch(()=>{}); }, { once: true });
  else boot().catch(()=>{});

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes.catSettingsV2 || changes.catCoverageDataV2 || changes.catSyncStateV2 || changes.catTrinoTimeBridgeV2 || changes.catShiftSessionV1 || changes.catSubmitAttemptsV2259)) refreshContext(false);
  });
})();
