(() => {
const CAT = Object.freeze({
  settings: 'catSettingsV2',
  data: 'catCoverageDataV2',
  bridge: 'catTrinoTimeBridgeV2',
  device: 'catDeviceIdV2',
  sync: 'catSyncStateV2',
  shift: 'catShiftSessionV1',
  recent: 'catRecentEventsV2',
  pendingTasks: 'catPendingTaskKeysV2',
  storeNames: 'catStoreNamesV1',
  migration: 'catMigratedFromTscV132',
  diagnostics: 'catDiagnosticsV2',
  noMatchExplicitOnlyMigration: 'catNoMatchExplicitOnlyV2219',
  owner: 'catLocalOwnerV1',
  archivePrefix: 'catAgentStateV1',
  submitAttempts: 'catSubmitAttemptsV2259'
});

const AUGMOTO = 'https://labeling-tools.augmoto.com';
const TRINOTIME = 'https://oostrinotime-staging-qa.trinoadmin.workers.dev';
const BUILD_CHANNEL = 'staging-qa';
const EXT_VERSION = '2.2.63';
const MAX_DAYS = 45;
const MAX_RECENT_EVENTS = 4000;
const MANAGED_IDLE_MINUTES = 5;
const MANAGED_IDLE_MS = MANAGED_IDLE_MINUTES * 60 * 1000;
const SUMMARY_PENDING_KEY = '__summary__';
const VALID_TRACKER_STATES = new Set(['active', 'idle', 'away', 'searching', 'grace', 'unverified', 'paused', 'ready', 'offline', 'unknown']);

let writeChain = Promise.resolve();
let syncInFlight = null;
let lastSyncAttemptAt = 0;
let syncWakeTimer = null;
let syncWakeDueAt = 0;
let syncFollowUpRequested = false;
let syncBackoffUntil = 0;
let syncFailureCount = 0;
let recoveryInProgress = false;

function dateKey(ts = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date(ts));
}
function id(prefix = 'evt') { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`; }
function num(v, max = 1e9) { v = Number(v); return Number.isFinite(v) ? Math.max(0, Math.min(max, Math.floor(v))) : 0; }
function epochMs(v) { v = Number(v); return Number.isFinite(v) ? Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(v))) : 0; }
function trackerState(v, fallback = 'unknown') {
  const state = String(v || '').toLowerCase();
  return VALID_TRACKER_STATES.has(state) ? state : fallback;
}

function submittedManual(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-100000, Math.min(100000, Math.trunc(n)));
}
function submittedDisplay(summary) {
  const confirmed = num(summary?.submitted, 1000000);
  return Math.max(0, confirmed + submittedManual(summary?.submittedManualAdjustment));
}
function syncSummarySnapshot(summary, settings) {
  const source = summary && typeof summary === 'object' ? summary : blankSummary();
  return {
    ...source,
    submittedManualAdjustment: submittedManual(source.submittedManualAdjustment),
    submittedDisplayTotal: submittedDisplay(source),
    idleThresholdMs: MANAGED_IDLE_MS,
    dailyGoal: settings?.dailyGoal || 300,
    extensionVersion: EXT_VERSION,
    buildChannel: BUILD_CHANNEL
  };
}
function defaultSettings() {
  return { enabled: true, dailyGoal: 300, idleMinutes: MANAGED_IDLE_MINUTES, hudPosition: 'bottom-left', hudExpanded: true, syncEnabled: true };
}
function cleanSettings(raw) {
  raw = raw && typeof raw === 'object' ? raw : {};
  return {
    enabled: true,
    dailyGoal: Math.max(1, Math.min(100000, Math.round(Number(raw.dailyGoal) || 300))),
    idleMinutes: MANAGED_IDLE_MINUTES,
    hudPosition: ['bottom-left', 'bottom-right', 'top-left', 'top-right'].includes(raw.hudPosition) ? raw.hudPosition : 'bottom-left',
    hudExpanded: raw.hudExpanded !== false,
    syncEnabled: true
  };
}
function blankSummary() {
  return {
    submitted: 0, created: 0, blurred: 0, deleted: 0, noMatch: 0, productMatched: 0,
    activeMs: 0, idleMs: 0, awayMs: 0, searchingMs: 0, graceMs: 0, unverifiedMs: 0, elapsedMs: 0,
    currentJob: '', currentTask: 0, totalTasks: 0,
    pendingSubmission: false, trackerState: 'offline',
    lastActivityAt: 0, idleSinceAt: 0, awaySinceAt: 0, presenceUpdatedAt: 0,
    idleThresholdMs: MANAGED_IDLE_MS, clientSequence: 0,
    submittedManualAdjustment: 0
  };
}
function blankDate() { return { summary: blankSummary(), jobs: {}, tasks: {}, updatedAt: 0 }; }
function blankData() { return { schemaVersion: 2, dates: {} }; }
function taskKey(jobId, taskIndex) { return `${String(jobId || '')}|${num(taskIndex, 100000)}`; }
function ensureDate(data, date) {
  if (!data.dates || typeof data.dates !== 'object') data.dates = {};
  if (!data.dates[date] || typeof data.dates[date] !== 'object') data.dates[date] = blankDate();
  const d = data.dates[date];
  d.summary = { ...blankSummary(), ...(d.summary || {}), idleThresholdMs: MANAGED_IDLE_MS };
  d.jobs = d.jobs && typeof d.jobs === 'object' ? d.jobs : {};
  d.tasks = d.tasks && typeof d.tasks === 'object' ? d.tasks : {};
  return d;
}
function ensureJob(day, jobId, totalTasks = 0, ts = Date.now()) {
  jobId = String(jobId || '');
  if (!jobId) return null;
  if (!day.jobs[jobId]) {
    day.jobs[jobId] = {
      jobId, submitted: 0, created: 0, blurred: 0, deleted: 0, noMatch: 0, productMatched: 0,
      activeMs: 0, idleMs: 0, awayMs: 0, searchingMs: 0, graceMs: 0, unverifiedMs: 0, elapsedMs: 0,
      lastTask: 0, totalTasks: num(totalTasks, 100000), status: 'active', firstSeenAt: ts, lastSeenAt: ts
    };
  }
  const j = day.jobs[jobId];
  j.awayMs = num(j.awayMs);
  j.searchingMs = num(j.searchingMs);
  j.graceMs = num(j.graceMs); j.unverifiedMs = num(j.unverifiedMs);
  j.totalTasks = Math.max(num(j.totalTasks, 100000), num(totalTasks, 100000));
  j.lastSeenAt = Math.max(epochMs(j.lastSeenAt), epochMs(ts));
  return j;
}
function ensureTask(day, jobId, taskIndex, totalTasks = 0, ts = Date.now()) {
  const key = taskKey(jobId, taskIndex);
  if (!jobId || !taskIndex) return null;
  if (!day.tasks[key]) {
    day.tasks[key] = {
      jobId, taskIndex: num(taskIndex, 100000), totalTasks: num(totalTasks, 100000),
      created: 0, blurred: 0, deleted: 0, noMatch: 0, productMatched: 0,
      activeMs: 0, idleMs: 0, awayMs: 0, searchingMs: 0, graceMs: 0, unverifiedMs: 0, elapsedMs: 0,
      submitted: false, skipped: false, status: 'active',
      trackerState: 'active', lastActivityAt: ts, idleSinceAt: 0, awaySinceAt: 0, idleThresholdMs: MANAGED_IDLE_MS,
      startedAt: ts, endedAt: 0, updatedAt: ts
    };
  }
  const t = day.tasks[key];
  t.noMatchAreas = t.noMatchAreas && typeof t.noMatchAreas === 'object' && !Array.isArray(t.noMatchAreas) ? t.noMatchAreas : {};
  t.awayMs = num(t.awayMs);
  t.searchingMs = num(t.searchingMs);
  t.graceMs = num(t.graceMs); t.unverifiedMs = num(t.unverifiedMs);
  t.totalTasks = Math.max(num(t.totalTasks, 100000), num(totalTasks, 100000));
  t.idleThresholdMs = MANAGED_IDLE_MS;
  t.updatedAt = Math.max(epochMs(t.updatedAt), epochMs(ts));
  return t;
}
function storeNameFromMap(core, jobId, fallback = '') {
  const id = String(jobId||'').toUpperCase();
  const known = core.storeNames?.[id]?.storeName;
  const name = String(known || fallback || '').replace(/\s+/g, ' ').trim();
  return name.length >= 4 && name.length <= 120 ? name : '';
}
async function rememberObservedStores(stores) {
  // Only job-row observations from Augmoto are accepted. Never change task totals.
  if (!Array.isArray(stores)) return {ok:false};
  return queue(async () => {
    const core = await readCore();
    const map = { ...(core.storeNames || {}) };
    const owner=core.bridge?.actor?.name&&core.bridge?.actor?.pod?`${core.bridge.actor.pod}|${core.bridge.actor.name}`:'';
    // Fail closed if the agent has not paired. Anonymous observations cannot
    // safely be assigned to a later account and otherwise remain unsyncable.
    if(!owner||!core.bridge?.token)return {ok:false,reason:'not-connected'};
    let changed = 0;
    const touched = new Set();
    for (const row of stores.slice(0, 80)) {
      if (row?.source !== 'augmoto-job-row') continue;
      const jobId=String(row.jobId||'').toUpperCase(),storeName=String(row.storeName||'').replace(/\s+/g,' ').trim();
      if (!/^JOB_[A-Z0-9_-]{4,64}$/.test(jobId) || storeName.length < 4 || storeName.length > 120 || /[<>\x00-\x1f]/.test(storeName)) continue;
      if (map[jobId]?.storeName === storeName && map[jobId]?.observedFor === owner) continue;
      // Job ID must resolve consistently. Do not silently overwrite a conflicting mapping.
      if (map[jobId]?.storeName && map[jobId].storeName !== storeName && map[jobId]?.observedFor === owner) continue;
      map[jobId] = {storeName, source:'augmoto-job-row', observedAt:Date.now(), observedFor:owner, serverAckAt:0};
      touched.add(jobId); changed++;
    }
    if (!changed) return {ok:true,changed:0};
    // V3: Never evict unacknowledged Augmoto Job ID/store evidence. Keep
    // at most 500 acknowledged observations for lightweight lookup; older
    // accepted mappings already live in the server's immutable evidence feed.
    // If browser storage fills, the write fails visibly rather than silently
    // deleting pending mapping records.
    const evidenceEntries=Object.entries(map);
    const waiting=evidenceEntries.filter(([,v])=>!v?.serverAckAt);
    const accepted=evidenceEntries.filter(([,v])=>Boolean(v?.serverAckAt))
      .sort((a,b)=>(b[1].observedAt||0)-(a[1].observedAt||0)).slice(0,500);
    const bounded=Object.fromEntries([...waiting,...accepted]);
    const date=reportDateForCore(core),day=ensureDate(core.data,date);
    if (shiftIsActive(core)) {
      for (const jobId of touched) {
        if (day.jobs[jobId]) day.jobs[jobId].storeName = bounded[jobId].storeName;
        for (const [key,task] of Object.entries(day.tasks)) if (task.jobId===jobId) {
          task.storeName=bounded[jobId].storeName;
          pendingAdd(core.pending,date,key);
        }
      }
      day.summary.clientSequence = num(day.summary.clientSequence) + 1;
      pendingAdd(core.pending,date,SUMMARY_PENDING_KEY);
    }
    await chrome.storage.local.set({ [CAT.storeNames]: bounded });
    setTimeout(()=>syncStoreMappingMetadata().catch(()=>{}),350);
    if (shiftIsActive(core)) {
      await chrome.storage.local.set({ [CAT.data]: core.data, [CAT.pendingTasks]: core.pending });
      scheduleSyncSoon(700);
    }
    return {ok:true,changed};
  });
}
// Mapping sync runs separately from task sync and is allowed after shift
// completion. It never sends counters, attendance, or mutable job payloads.
let storeMappingSyncInFlight=null;
async function syncStoreMappingMetadata() {
  if(storeMappingSyncInFlight)return storeMappingSyncInFlight;
  storeMappingSyncInFlight=(async()=>{
    const core=await readCore();
    const bridge=core.bridge;
    if(!bridge?.token||!bridge.actor?.name||!bridge.actor?.pod||core.settings.syncEnabled===false)return {ok:false,skipped:true};
    const owner=`${bridge.actor.pod}|${bridge.actor.name}`;
    const rows=Object.entries(core.storeNames||{}).filter(([id,v])=>
      /^JOB_[A-Z0-9_-]{4,64}$/.test(id)&&v?.source==='augmoto-job-row'&&v.observedFor===owner&&!v.serverAckAt)
      .sort((a,b)=>(a[1].observedAt||0)-(b[1].observedAt||0)).slice(0,40)
      .map(([jobId,v])=>({jobId,storeName:v.storeName,source:'augmoto-job-row',observedAt:v.observedAt}));
    if(!rows.length)return {ok:true,nothing:true};
    const token=String(bridge.token),url=`${bridge.baseUrl}/api/workforce/coverage/store-observations`;
    const {response,body}=await trackerSyncRequest(url,{method:'POST',
      headers:{'Content-Type':'application/json',Accept:'application/json','X-TT-Coverage-Bridge':token},
      body:JSON.stringify({observations:rows.map(({jobId,storeName,source})=>({jobId,storeName,source}))}),cache:'no-store'});
    if(!response.ok||body?.ok!==true||body?.authority!=='workforce-store-mapping-v2'||body.accepted!==rows.length)
      return {ok:false,error:body?.message||`Mapping update failed (${response.status})`};
    await queue(async()=>{
      const latest=await readCore();
      if(latest.bridge?.token!==token||latest.bridge?.deviceId!==bridge.deviceId)return;
      const map={...latest.storeNames};
      const ackAt=Date.now();
      for(const row of rows){
        const v=map[row.jobId];
        if(v?.storeName===row.storeName&&v?.observedAt===row.observedAt)
          map[row.jobId]={...v,serverAckAt:ackAt};
      }
      await chrome.storage.local.set({[CAT.storeNames]:map});
    });
    return {ok:true,accepted:rows.length};
  })().catch(error=>({ok:false,error:String(error?.message||error)}))
     .finally(()=>{storeMappingSyncInFlight=null;});
  return storeMappingSyncInFlight;
}
async function readCore() {
  const r = await chrome.storage.local.get([CAT.settings, CAT.data, CAT.recent, CAT.pendingTasks, CAT.bridge, CAT.device, CAT.sync, CAT.shift, CAT.storeNames]);
  return {
    settings: cleanSettings(r[CAT.settings]),
    data: r[CAT.data] && typeof r[CAT.data] === 'object' ? r[CAT.data] : blankData(),
    recent: Array.isArray(r[CAT.recent]) ? r[CAT.recent] : [],
    pending: r[CAT.pendingTasks] && typeof r[CAT.pendingTasks] === 'object' ? r[CAT.pendingTasks] : {},
    bridge: r[CAT.bridge] && typeof r[CAT.bridge] === 'object' ? r[CAT.bridge] : null,
    device: String(r[CAT.device] || ''),
    sync: r[CAT.sync] && typeof r[CAT.sync] === 'object' ? r[CAT.sync] : {},
    shift: cleanShift(r[CAT.shift]),
    storeNames: r[CAT.storeNames] && typeof r[CAT.storeNames] === 'object' ? r[CAT.storeNames] : {}
  };
}

function cleanShift(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const status = ['active','completed','not_clocked_in'].includes(String(source.status||'')) ? String(source.status) : 'not_clocked_in';
  return {
    sessionId: String(source.sessionId||'').slice(0,80),
    generation: Math.max(0, Math.floor(Number(source.generation)||0)),
    status,
    locked: status !== 'active',
    reportDate: /^\d{4}-\d{2}-\d{2}$/.test(String(source.reportDate||'')) ? String(source.reportDate) : '',
    startedAt: source.startedAt ? String(source.startedAt) : null,
    startedAtMs: epochMs(source.startedAtMs),
    endedAt: source.endedAt ? String(source.endedAt) : null,
    endedAtMs: epochMs(source.endedAtMs),
    lockedAt: source.lockedAt ? String(source.lockedAt) : null,
    resetAt: source.resetAt ? String(source.resetAt) : null,
    resetBy: source.resetBy ? String(source.resetBy) : null
  };
}
function shiftIsActive(core) { return core?.shift?.status === 'active' && Boolean(core.shift.sessionId); }
function reportDateForCore(core, ts = Date.now()) { return core?.shift?.reportDate || dateKey(ts); }
function localSummaryHasActivity(summary) {
  const s=summary||{};
  return ['submitted','created','blurred','deleted','noMatch','productMatched','activeMs','idleMs','awayMs','searchingMs','graceMs','unverifiedMs','elapsedMs'].some(k=>num(s[k])>0);
}
function applyAuthoritativeCoverageSummary(day, remote) {
  if (!remote || typeof remote !== 'object') return;
  const s=day.summary={...blankSummary(),...day.summary};
  for (const key of ['submitted','created','blurred','deleted','noMatch','productMatched','activeMs','idleMs','awayMs','searchingMs','graceMs','unverifiedMs','elapsedMs','currentTask','totalTasks','lastActivityAt','idleSinceAt','awaySinceAt','presenceUpdatedAt','clientSequence']) {
    if (remote[key] !== undefined) s[key]=num(remote[key],Number.MAX_SAFE_INTEGER);
  }
  s.submittedManualAdjustment=Number.isFinite(Number(remote.submittedManualAdjustment))?Math.trunc(Number(remote.submittedManualAdjustment)):0;
  s.currentJob=String(remote.currentJob||'');
  s.pendingSubmission=remote.pendingSubmission===true;
  s.trackerState=trackerState(remote.trackerState,'offline');
}
// QA SYNC HARDENING v2.2.42 — retain old-shift state and unacknowledged
// records before replacing the day slot. No auto replay across shift identity.
function preserveUnackedShiftSnapshot(core,previous,sourceDate,reason){
  const day=core.data?.dates?.[sourceDate];
  const pending=Array.isArray(core.pending?.[sourceDate])?core.pending[sourceDate].slice():[];
  if(!day&&!pending.length)return;
  const hasActivity=Boolean(day&&(localSummaryHasActivity(day.summary)||Object.keys(day.jobs||{}).length||Object.keys(day.tasks||{}).length));
  if(!pending.length&&!hasActivity)return;
  const archive=core.data.shiftArchivesV1 && typeof core.data.shiftArchivesV1==='object'
    ? core.data.shiftArchivesV1 : (core.data.shiftArchivesV1={});
  const identity=String(previous.sessionId||'unbound').replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,90);
  const key=sourceDate+':'+identity+':'+Number(previous.generation||0);
  // A locked shift may be observed repeatedly. Never replace a prior archive
  // that still contains unresolved records with an empty/partial later copy.
  const old=archive[key];
  if(!old || (!old.unacknowledgedKeys?.length && pending.length)) {
    archive[key]={schemaVersion:1,savedAt:Date.now(),reason,
      shift:{...previous},date:sourceDate,day:day?JSON.parse(JSON.stringify(day)):null,
      unacknowledgedKeys:pending,requiresManualReconciliation:pending.length>0};
  }
}

function adoptShiftIntoCoverageCore(core, rawShift, authoritativeSummary = null) {
  const previous=cleanShift(core.shift), next=cleanShift(rawShift);
  const date=next.reportDate || previous.reportDate || dateKey();
  next.reportDate=date;
  const identityChanged=previous.sessionId!==next.sessionId || Number(previous.generation)!==Number(next.generation);
  if (identityChanged) {
    preserveUnackedShiftSnapshot(core,previous,previous.reportDate||date,'shift-identity-changed');
    // Retain displaced same-date history even if the earlier shift ID was blank.
    if((previous.reportDate||date)!==date && core.pending[date]?.length)
      preserveUnackedShiftSnapshot(core,{...previous,sessionId:'pre-existing-day'},date,'date-slot-replaced');
    core.data.dates[date]=blankDate();
    core.pending[date]=[];
  }
  const day=ensureDate(core.data,date);
  if(next.status!=='active'&&!identityChanged)preserveUnackedShiftSnapshot(core,previous,date,'shift-locked');
  if(authoritativeSummary && (identityChanged || next.status!=='active' || !localSummaryHasActivity(day.summary))) applyAuthoritativeCoverageSummary(day,authoritativeSummary);
  if(next.status!=='active'){
    day.summary.pendingSubmission=false;
    day.summary.trackerState='offline';
    day.summary.currentJob='';day.summary.currentTask=0;day.summary.totalTasks=0;
    core.pending[date]=[];
  }
  core.shift=next;
  return {shift:next,date,day,identityChanged};
}
async function persistCoverageShiftCore(core){
  await chrome.storage.local.set({[CAT.shift]:core.shift,[CAT.data]:core.data,[CAT.pendingTasks]:core.pending});
}

function localOwnerIdentity(value){ return String(value||'').trim().toLowerCase(); }
function identityArchiveKey(identity){ return `${CAT.archivePrefix}:${encodeURIComponent(localOwnerIdentity(identity)).slice(0,160)}`; }
async function archiveCoverageIdentity(owner, core){
  const identity=localOwnerIdentity(owner); if(!identity)return;
  await chrome.storage.local.set({[identityArchiveKey(identity)]:{
    schemaVersion:1,owner:identity,savedAt:Date.now(),data:core.data,recent:core.recent,
    pending:core.pending,shift:core.shift,sync:core.sync
  }});
}
async function prepareCoverageIdentity(core, nextIdentity){
  const identity=localOwnerIdentity(nextIdentity); if(!identity)throw new Error('TrinoTime did not return a valid Agent identity.');
  const r=await chrome.storage.local.get(CAT.owner), previousOwner=localOwnerIdentity(r[CAT.owner]);
  const ownerChanged=Boolean(previousOwner && previousOwner!==identity);
  if(ownerChanged){
    await archiveCoverageIdentity(previousOwner,core);
    const saved=(await chrome.storage.local.get(identityArchiveKey(identity)))[identityArchiveKey(identity)];
    if(saved&&localOwnerIdentity(saved.owner)===identity){
      core.data=saved.data&&typeof saved.data==='object'?saved.data:blankData();
      core.recent=Array.isArray(saved.recent)?saved.recent.slice(-MAX_RECENT_EVENTS):[];
      core.pending=saved.pending&&typeof saved.pending==='object'?saved.pending:{};
      core.shift=cleanShift(saved.shift);
      core.sync=saved.sync&&typeof saved.sync==='object'?saved.sync:{};
    }else{
      core.data=blankData();core.recent=[];core.pending={};core.shift=cleanShift(null);core.sync={};
    }
    core.bridge=null;
  }
  return {identity,previousOwner,ownerChanged};
}

function queue(fn) { writeChain = writeChain.then(fn, fn); return writeChain; }
// Unconfirmed attempts are a forensic record, not a productivity event.
// Keep the owner and active shift bound to the receipt to avoid cross-agent
// bleed when one browser switches Accounts/PODs.
const SUBMIT_ATTEMPT_LIMIT = 100;
function retainSubmitAttempts(list) {
  // Pending/unverified task attempts are protected evidence. Never silently discard
  // them when the last-N diagnostic window fills during a sync outage.
  const archived = list.filter(x=>['acknowledged','cancelled'].includes(x?.status));
  const keepArchive = new Set(archived.slice(-SUBMIT_ATTEMPT_LIMIT));
  return list.filter(x=>!['acknowledged','cancelled'].includes(x?.status) || keepArchive.has(x));
}
function activeAttemptOwner(core) {
  const actor=core.bridge?.actor;
  return actor?.name && actor?.pod && core.bridge?.token
    ? `${actor.pod}|${actor.name}` : '';
}
function checkedSubmitAttempt(core, attempt) {
  const id=String(attempt?.id||'');
  const jobId=String(attempt?.jobId||'').toUpperCase();
  const taskIndex=num(attempt?.taskIndex,100000), totalTasks=num(attempt?.totalTasks,100000);
  const at=epochMs(attempt?.at);
  if(!shiftIsActive(core)||!activeAttemptOwner(core)||!core.bridge?.deviceId||
     !/^coverage-submit-[a-zA-Z0-9-]{6,100}$/.test(id)||
     !/^JOB_[A-Z0-9_-]{3,64}$/.test(jobId)||
     !taskIndex||taskIndex>totalTasks||
     Math.abs(Date.now()-at)>10000||
     attempt.date!==core.shift.reportDate||attempt.sessionId!==core.shift.sessionId||
     Number(attempt.generation)!==Number(core.shift.generation)||
     attempt.deviceId!==core.bridge.deviceId)return null;
  return {id,jobId,taskIndex,totalTasks,at,date:core.shift.reportDate,
    sessionId:core.shift.sessionId,generation:core.shift.generation,
    owner:activeAttemptOwner(core),deviceId:core.bridge.deviceId,status:'captured',updatedAt:Date.now()};
}
async function recordSubmitAttempt(attempt,sender) {
  // Only our Augmoto content script may initiate a captured click receipt.
  if(!sender?.tab?.id || !String(sender.url||'').startsWith(`${AUGMOTO}/`))
    return {ok:false,error:'Invalid Augmoto sender'};
  return queue(async()=>{
    const core=await readCore(),entry=checkedSubmitAttempt(core,attempt);
    if(!entry)return {ok:false,error:'Submit is not bound to a verified active Agent shift'};
    const raw=(await chrome.storage.local.get(CAT.submitAttempts))[CAT.submitAttempts];
    const list=Array.isArray(raw)?raw:[];
    if(list.some(x=>x.id===entry.id&&x.owner===entry.owner))return {ok:true,duplicate:true};
    // Check a completed task first, but do not use a bare click to mark complete.
    const task=core.data.dates?.[entry.date]?.tasks?.[taskKey(entry.jobId,entry.taskIndex)];
    if(task?.submitted===true)entry.status='confirmed_pending_sync';
    list.push(entry);
    await chrome.storage.local.set({[CAT.submitAttempts]:retainSubmitAttempts(list)});
    return {ok:true,status:entry.status};
  });
}
async function setSubmitAttemptStatus(id,status) {
  if(!['cancelled','unverified'].includes(status))return {ok:false};
  return queue(async()=>{
    const core=await readCore(),raw=(await chrome.storage.local.get(CAT.submitAttempts))[CAT.submitAttempts];
    const list=Array.isArray(raw)?raw:[],owner=activeAttemptOwner(core);
    const entry=list.find(x=>x.id===id&&x.owner===owner&&x.sessionId===core.shift.sessionId);
    if(!entry)return {ok:false,missing:true};
    if(['acknowledged','confirmed_pending_sync'].includes(entry.status))return {ok:true,unchanged:true};
    entry.status=status;entry.updatedAt=Date.now();
    await chrome.storage.local.set({[CAT.submitAttempts]:list});return {ok:true};
  });
}
function pendingAdd(pending, date, key) {
  const set = new Set(Array.isArray(pending[date]) ? pending[date] : []);
  if (key) set.add(key);
  pending[date] = [...set]; // Preserve ALL unacknowledged task keys until verified server acceptance.
}
function prune(data, pending = {}) {
  const keys = Object.keys(data.dates || {}).sort().reverse();
  // Retention must never destroy task payloads still waiting for a verified
  // server ACK (including records from a multi-day connectivity outage).
  for (const k of keys.slice(MAX_DAYS)) {
    if (Array.isArray(pending[k]) && pending[k].length) continue;
    delete data.dates[k];
  }
}
async function diag(state, message, extra = {}) {
  const r = await chrome.storage.local.get(CAT.diagnostics);
  const m = r[CAT.diagnostics] && typeof r[CAT.diagnostics] === 'object' ? r[CAT.diagnostics] : {};
  m.last = { state, message, timestamp: Date.now(), ...extra };
  await chrome.storage.local.set({ [CAT.diagnostics]: m });
}

function applyPresenceFields(target, source, ts) {
  // A delayed outgoing-tab packet may still carry its final elapsed time,
  // but must not overwrite a newer foreground tab's presence header.
  const incomingAt = epochMs(source.presenceUpdatedAt || ts);
  if (epochMs(target.presenceUpdatedAt) > incomingAt) return;
  const state = trackerState(source.trackerState, target.trackerState || 'unknown');
  const lastActivityAt = epochMs(source.lastActivityAt || target.lastActivityAt || ts);
  const explicitIdleSinceAt = epochMs(source.idleSinceAt);
  target.trackerState = state;
  target.lastActivityAt = Math.max(epochMs(target.lastActivityAt), lastActivityAt);
  target.idleThresholdMs = MANAGED_IDLE_MS;
  target.idleSinceAt = state === 'idle'
    ? (explicitIdleSinceAt || (target.lastActivityAt ? target.lastActivityAt + MANAGED_IDLE_MS : epochMs(ts)))
    : 0;
  target.awaySinceAt = state === 'away' ? epochMs(source.awaySinceAt || target.awaySinceAt || ts) : 0;
  target.presenceUpdatedAt = epochMs(source.presenceUpdatedAt || ts);
}

async function applyEvent(event) {
  return queue(async () => {
    const core = await readCore();
    if (!shiftIsActive(core)) return { ok:true, frozen:true, shift:core.shift };
    const eventId = String(event.eventId || '');
    if (eventId && core.recent.includes(eventId)) return { ok: true, duplicate: true };

    const ts = epochMs(event.timestamp) || Date.now();
    const date = reportDateForCore(core, ts);
    const day = ensureDate(core.data, date);
    const s = day.summary;
    const jobId = String(event.jobId || s.currentJob || '');
    const ti = num(event.taskIndex || s.currentTask, 100000);
    const tt = num(event.totalTasks || s.totalTasks, 100000);

    // An older queued receipt must update its OWN task, never rewind the
    // active header or turn a delayed acknowledgment into fresh activity.
    const receiptEvent = ['submit-pending','submit-cancelled','submit-confirmed'].includes(String(event.type||''));
    if (jobId && !receiptEvent) { s.currentJob = jobId; s.currentTask = ti; s.totalTasks = tt || s.totalTasks; }
    if (!receiptEvent) applyPresenceFields(s, { ...event, lastActivityAt: event.lastActivityAt || ts }, ts);

    const job = jobId ? ensureJob(day, jobId, tt, ts) : null;
    const task = jobId && ti ? ensureTask(day, jobId, ti, tt, ts) : null;
    if (task && !receiptEvent) applyPresenceFields(task, event, ts);

    let countedSubmission = false;
    let deltaKey = '';
    switch (String(event.type || '')) {
      case 'task-start':
        if (task) {
          // A delayed task-start must not reopen an already submitted task.
          if (!task.submitted) task.status = 'active'; task.updatedAt = ts;
          job.lastTask = Math.max(num(job.lastTask), ti); job.status = 'active';
          pendingAdd(core.pending, date, taskKey(jobId, ti));
        }
        break;
      case 'created': deltaKey = 'created'; break;
      case 'blurred': deltaKey = 'blurred'; break;
      case 'product-matched': deltaKey = 'productMatched'; break;
      case 'created-remove':
        // Q/Create is NET surviving Agent-created HUMAN boxes for this task.
        // Never subtract from a previous task/job and never go below zero.
        if (task && num(task.created) > 0) {
          task.created = num(task.created) - 1;
          if (job && num(job.created) > 0) job.created = num(job.created) - 1;
          if (num(s.created) > 0) s.created = num(s.created) - 1;
          task.updatedAt = ts;
          pendingAdd(core.pending, date, taskKey(jobId, ti));
        }
        break;
      case 'blurred-remove':
        // W/Person follows the same NET surviving-annotation rule.
        if (task && num(task.blurred) > 0) {
          task.blurred = num(task.blurred) - 1;
          if (job && num(job.blurred) > 0) job.blurred = num(job.blurred) - 1;
          if (num(s.blurred) > 0) s.blurred = num(s.blurred) - 1;
          task.updatedAt = ts;
          pendingAdd(core.pending, date, taskKey(jobId, ti));
        }
        break;
      case 'product-match-remove':
        // Product Match is NET surviving Agent-confirmed matches on this task.
        // Retract only this task's credited match and clamp at zero.
        if (task && num(task.productMatched) > 0) {
          task.productMatched = num(task.productMatched) - 1;
          if (job && num(job.productMatched) > 0) job.productMatched = num(job.productMatched) - 1;
          if (num(s.productMatched) > 0) s.productMatched = num(s.productMatched) - 1;
          task.updatedAt = ts;
          pendingAdd(core.pending, date, taskKey(jobId, ti));
        }
        break;
      case 'deleted': deltaKey = 'deleted'; break;
      case 'no-match-add': deltaKey = 'noMatch'; break;
      case 'no-match-remove':
        if (task && task.noMatch > 0) {
          task.noMatch--; if (job && job.noMatch > 0) job.noMatch--; if (s.noMatch > 0) s.noMatch--;
          pendingAdd(core.pending, date, taskKey(jobId, ti));
        }
        break;
      case 'no-match-set': {
        const area = String(event.area ?? '').trim().slice(0, 64);
        if (task && area) {
          task.noMatchAreas = task.noMatchAreas && typeof task.noMatchAreas === 'object' && !Array.isArray(task.noMatchAreas) ? task.noMatchAreas : {};
          // Explicit No-Match is idempotent per Job/Task/Area. Do not treat
          // Augmoto's confirmation check state as a toggle signal.
          if (task.noMatchAreas[area] !== true) {
            task.noMatchAreas[area] = true;
            task.noMatch = num(task.noMatch) + 1;
            if (job) job.noMatch = num(job.noMatch) + 1;
            s.noMatch = num(s.noMatch) + 1;
            task.updatedAt = ts;
            pendingAdd(core.pending, date, taskKey(jobId, ti));
          }
        }
        break;
      }
      case 'no-match-clear': {
        const area = String(event.area ?? '').trim().slice(0, 64);
        if (task && area) {
          task.noMatchAreas = task.noMatchAreas && typeof task.noMatchAreas === 'object' && !Array.isArray(task.noMatchAreas) ? task.noMatchAreas : {};
          if (task.noMatchAreas[area] === true) {
            delete task.noMatchAreas[area];
            if (task.noMatch > 0) task.noMatch--;
            if (job && job.noMatch > 0) job.noMatch--;
            if (s.noMatch > 0) s.noMatch--;
            task.updatedAt = ts;
            pendingAdd(core.pending, date, taskKey(jobId, ti));
          }
        }
        break;
      }
      case 'no-match-toggle': {
        // Backward-compatibility for an already queued v2.2.18 event: treat it
        // as an explicit mark, never as a blind toggle.
        const area = String(event.area ?? '').trim().slice(0, 64);
        if (task && area) {
          task.noMatchAreas = task.noMatchAreas && typeof task.noMatchAreas === 'object' && !Array.isArray(task.noMatchAreas) ? task.noMatchAreas : {};
          if (task.noMatchAreas[area] !== true) {
            task.noMatchAreas[area] = true;
            task.noMatch = num(task.noMatch) + 1;
            if (job) job.noMatch = num(job.noMatch) + 1;
            s.noMatch = num(s.noMatch) + 1;
            task.updatedAt = ts;
            pendingAdd(core.pending, date, taskKey(jobId, ti));
          }
        }
        break;
      }
      case 'submit-pending':
        // A delayed pending receipt must never reopen a verified task.
        if (task && !task.submitted) task.submitPending = true;
        s.pendingSubmission = Object.values(day.tasks).some(t=>t.submitPending===true);
        if (task) { if (!task.submitted) task.status = 'active'; task.updatedAt = ts; pendingAdd(core.pending, date, taskKey(jobId, ti)); }
        break;
      case 'submit-cancelled':
        if (task) task.submitPending = false;
        s.pendingSubmission = Object.values(day.tasks).some(t=>t.submitPending===true);
        if (task) { task.updatedAt = ts; pendingAdd(core.pending, date, taskKey(jobId, ti)); }
        break;
      case 'submit-confirmed':
        if (task && !task.submitted) {
          if(num(task.efficiencyMs)>0){s.efficiencyTaskCount=num(s.efficiencyTaskCount)+1;s.efficiencyActiveMs=num(s.efficiencyActiveMs)+num(task.efficiencyMs);}
          task.submitted = true; task.status = 'submitted'; task.endedAt = ts; task.updatedAt = ts;
          s.submitted++; if (job) job.submitted++;
          countedSubmission = true;
        }
        if (task) task.submitPending = false;
        s.pendingSubmission = Object.values(day.tasks).some(t=>t.submitPending===true);
        pendingAdd(core.pending, date, taskKey(jobId, ti));
        break;
      case 'skip-confirmed':
        if (task && !task.submitted) { task.skipped = true; task.status = 'skipped'; task.endedAt = ts; task.updatedAt = ts; }
        s.pendingSubmission = false;
        pendingAdd(core.pending, date, taskKey(jobId, ti));
        break;
      case 'task-exit':
        if (task && task.status === 'active') { task.status = 'exited'; task.endedAt = ts; task.updatedAt = ts; pendingAdd(core.pending, date, taskKey(jobId, ti)); }
        if (job) job.status = 'exited';
        s.pendingSubmission = false; s.currentJob = ''; s.currentTask = 0; s.totalTasks = 0;
        // Returning to the Coverage jobs/queue page is immediate IDLE while
        // focused, or AWAY if the Augmoto tab is hidden/unfocused.
        applyPresenceFields(s, event, ts);
        break;
      case 'status':
        break;
    }

    if (deltaKey && task) {
      task[deltaKey] = num(task[deltaKey]) + 1;
      job[deltaKey] = num(job?.[deltaKey]) + 1;
      s[deltaKey] = num(s[deltaKey]) + 1;
      task.updatedAt = ts;
      pendingAdd(core.pending, date, taskKey(jobId, ti));
    }
    if (job) { job.lastTask = Math.max(num(job.lastTask), ti); job.lastSeenAt = ts; }

    pendingAdd(core.pending, date, SUMMARY_PENDING_KEY);
    day.updatedAt = ts;
    s.clientSequence = num(s.clientSequence) + 1;
    prune(core.data, core.pending);
    if (eventId) core.recent.push(eventId);
    core.recent = core.recent.slice(-MAX_RECENT_EVENTS);

    // Correlate the accepted completion to its earlier click receipt.
    // The eventID can be replayed; the task itself remains idempotent.
    const attemptId=String(event.eventId||'').startsWith('submit-confirmed-')
      ? String(event.eventId).slice('submit-confirmed-'.length):'';
    let attemptUpdates=null;
    if(event.type==='submit-confirmed' && attemptId) {
      const existing=(await chrome.storage.local.get(CAT.submitAttempts))[CAT.submitAttempts];
      const owner=activeAttemptOwner(core);
      const rows=Array.isArray(existing)?existing:[];
      const receipt=rows.find(x=>x.id===attemptId&&x.owner===owner&&x.date===date&&
        x.sessionId===core.shift.sessionId&&x.jobId===jobId&&x.taskIndex===ti);
      if(receipt && task?.submitted && receipt.status!=='acknowledged') {
        receipt.status='confirmed_pending_sync';receipt.updatedAt=Date.now();attemptUpdates=rows;
      }
    }
    await chrome.storage.local.set({ [CAT.data]: core.data, [CAT.recent]: core.recent,
      [CAT.pendingTasks]: core.pending, ...(attemptUpdates?{[CAT.submitAttempts]:attemptUpdates}:{}) });
    if (countedSubmission) await appendLegacySubmission(date, event, ts);

    const fastTypes = new Set(['task-start', 'created', 'blurred', 'product-matched', 'created-remove', 'blurred-remove', 'product-match-remove', 'deleted', 'no-match-add', 'no-match-remove', 'no-match-set', 'no-match-clear', 'no-match-toggle', 'submit-pending', 'submit-cancelled', 'submit-confirmed', 'skip-confirmed', 'task-exit']);
    scheduleSyncSoon(fastTypes.has(String(event.type || '')) ? 250 : 1200);
    return { ok: true };
  });
}

async function reconcileNoMatchState(payload) {
  return queue(async () => {
    payload = payload && typeof payload === 'object' ? payload : {};
    const jobId = String(payload.jobId || '');
    const ti = num(payload.taskIndex, 100000);
    if (!jobId || !ti) return { ok: false, error: 'No active Coverage task.' };
    const ts = epochMs(payload.timestamp) || Date.now();
    const observed = [...new Set((Array.isArray(payload.observedAreas) ? payload.observedAreas : []).map(v => String(v).trim().slice(0,64)).filter(Boolean))];
    const marked = new Set((Array.isArray(payload.markedAreas) ? payload.markedAreas : []).map(v => String(v).trim().slice(0,64)).filter(Boolean));
    if (!observed.length) return { ok: true, changed: false };

    const core = await readCore();
    if (!shiftIsActive(core)) return { ok:true, frozen:true, shift:core.shift };
    const operationalDate=reportDateForCore(core,ts);
    const day = ensureDate(core.data, operationalDate);
    const date=operationalDate;
    const s = day.summary;
    const job = ensureJob(day, jobId, num(payload.totalTasks, 100000), ts);
    const task = ensureTask(day, jobId, ti, num(payload.totalTasks, 100000), ts);
    const map = task.noMatchAreas && typeof task.noMatchAreas === 'object' && !Array.isArray(task.noMatchAreas) ? task.noMatchAreas : {};
    let changed = false;
    for (const area of observed) {
      const want = marked.has(area);
      const had = map[area] === true;
      if (want === had) continue;
      changed = true;
      if (want) map[area] = true;
      else delete map[area];
    }
    if (!changed) return { ok: true, changed: false, noMatch: num(task.noMatch) };

    task.noMatchAreas = map;
    task.noMatch = Object.values(map).filter(Boolean).length;
    task.updatedAt = ts;
    // Recompute aggregate No-Match counts from task state so reconciliation can
    // repair a previously missed click instead of compounding stale deltas.
    job.noMatch = Object.values(day.tasks).filter(t => t && String(t.jobId || '') === jobId).reduce((n,t) => n + num(t.noMatch), 0);
    s.noMatch = Object.values(day.tasks).reduce((n,t) => n + num(t?.noMatch), 0);
    s.currentJob = jobId; s.currentTask = ti; s.totalTasks = Math.max(num(s.totalTasks,100000), num(payload.totalTasks,100000));
    s.clientSequence = num(s.clientSequence) + 1;
    day.updatedAt = ts; job.lastSeenAt = ts; job.lastTask = Math.max(num(job.lastTask), ti);
    pendingAdd(core.pending, date, taskKey(jobId, ti));
    pendingAdd(core.pending, date, SUMMARY_PENDING_KEY);
    await chrome.storage.local.set({ [CAT.data]: core.data, [CAT.pendingTasks]: core.pending });
    scheduleSyncSoon(250);
    return { ok: true, changed: true, noMatch: task.noMatch, summaryNoMatch: s.noMatch };
  });
}


async function migrateNoMatchToExplicitOnly() {
  try {
    const r = await chrome.storage.local.get([CAT.noMatchExplicitOnlyMigration, CAT.data, CAT.pendingTasks]);
    if (r[CAT.noMatchExplicitOnlyMigration]) return;
    const data = r[CAT.data] && typeof r[CAT.data] === 'object' ? r[CAT.data] : blankData();
    const pending = r[CAT.pendingTasks] && typeof r[CAT.pendingTasks] === 'object' ? r[CAT.pendingTasks] : {};
    let changed = false;
    for (const [date, rawDay] of Object.entries(data.dates || {})) {
      const day = ensureDate(data, date);
      // v2.2.13-v2.2.18 could manufacture X from AUTO confirmation rows.
      // Clear only still-open/unsubmitted task No-Match state; submitted task
      // history remains untouched.
      for (const task of Object.values(day.tasks || {})) {
        if (!task || task.submitted) continue;
        if (num(task.noMatch) > 0 || Object.keys(task.noMatchAreas || {}).length) {
          task.noMatch = 0;
          task.noMatchAreas = {};
          task.updatedAt = Date.now();
          pendingAdd(pending, date, taskKey(task.jobId, task.taskIndex));
          changed = true;
        }
      }
      for (const job of Object.values(day.jobs || {})) {
        if (!job) continue;
        job.noMatch = Object.values(day.tasks || {}).filter(t => t && String(t.jobId || '') === String(job.jobId || '')).reduce((n,t) => n + num(t.noMatch), 0);
      }
      day.summary.noMatch = Object.values(day.tasks || {}).reduce((n,t) => n + num(t?.noMatch), 0);
      if (changed) pendingAdd(pending, date, SUMMARY_PENDING_KEY);
    }
    await chrome.storage.local.set({ [CAT.data]: data, [CAT.pendingTasks]: pending, [CAT.noMatchExplicitOnlyMigration]: true });
    if (changed) scheduleSyncSoon(250);
  } catch (_) {}
}

async function leaveMode(){
 return queue(async()=>{
  const core=await readCore(); if(!shiftIsActive(core))return {ok:true,frozen:true,shift:core.shift};
  const ts=Date.now(),date=reportDateForCore(core,ts);
  const day=ensureDate(core.data,date),s=day.summary;
  const task=day.tasks[taskKey(s.currentJob,s.currentTask)];
  if(task&&!task.submitted){task.status='exited';task.updatedAt=ts;pendingAdd(core.pending,date,taskKey(s.currentJob,s.currentTask));}
  s.pendingSubmission=false;s.currentJob='';s.currentTask=0;s.totalTasks=0;
  applyPresenceFields(s,{trackerState:'paused',presenceUpdatedAt:ts},ts);
  s.clientSequence=num(s.clientSequence)+1;day.updatedAt=ts;
  pendingAdd(core.pending,date,SUMMARY_PENDING_KEY);
  await chrome.storage.local.set({[CAT.data]:core.data,[CAT.pendingTasks]:core.pending});
  scheduleSyncSoon(250);return {ok:true};
 });
}
async function applyEfficiencyTime(payload){
 return queue(async()=>{
  const core=await readCore(); if(!shiftIsActive(core))return {ok:true,frozen:true,shift:core.shift};
  const eventId=String(payload.eventId||'');
  if(!eventId||core.recent.includes(eventId))return {ok:true,duplicate:true};
  const date=reportDateForCore(core),ts=epochMs(payload.timestamp)||Date.now();
  if(!payload.jobId||!Number(payload.taskIndex))return {ok:false,error:'Invalid measured task.'};
  const day=ensureDate(core.data,date);
  const task=ensureTask(day,String(payload.jobId),num(payload.taskIndex),num(payload.totalTasks),ts);
  const activeMs=num(payload.activeMs,5000), priorMs=num(task.efficiencyMs);
  if(!task.submitted) task.efficiencyMs=priorMs+activeMs;
  else if(activeMs>0 && !task.skipped && Number(task.endedAt)>0 &&
          ts>=epochMs(task.startedAt) && ts<=epochMs(task.endedAt)+2000){
    // The acceptance receipt can now safely race ahead of this final sampled
    // efficiency event. Attribute only a measured, near-contemporaneous sample
    // to an already submitted task; event IDs prevent replay inflation.
    task.efficiencyMs=priorMs+activeMs;
    if(priorMs===0) day.summary.efficiencyTaskCount=num(day.summary.efficiencyTaskCount)+1;
    day.summary.efficiencyActiveMs=num(day.summary.efficiencyActiveMs)+activeMs;
  }
  core.recent.push(eventId);core.recent=core.recent.slice(-MAX_RECENT_EVENTS);
  day.summary.clientSequence=num(day.summary.clientSequence)+1;
  pendingAdd(core.pending,date,taskKey(payload.jobId,payload.taskIndex));pendingAdd(core.pending,date,SUMMARY_PENDING_KEY);
  await chrome.storage.local.set({[CAT.data]:core.data,[CAT.recent]:core.recent,[CAT.pendingTasks]:core.pending});
  scheduleSyncSoon(1200);return {ok:true};
 });
}

async function applyPresence(payload) {
  return queue(async () => {
    const core = await readCore(); if(!shiftIsActive(core))return {ok:true,frozen:true,shift:core.shift};
    const ts = epochMs(payload.timestamp) || Date.now(), date=reportDateForCore(core,ts);
    const day = ensureDate(core.data, date), s = day.summary;
    const jobId=payload.trackerState==='searching'?'':String(payload.jobId||s.currentJob||''),ti=num(payload.taskIndex||s.currentTask,100000),tt=num(payload.totalTasks||s.totalTasks,100000);
    if(jobId){s.currentJob=jobId;s.currentTask=ti;s.totalTasks=tt||s.totalTasks;} applyPresenceFields(s,payload,ts);
    const job=jobId?ensureJob(day,jobId,tt,ts):null,task=jobId&&ti?ensureTask(day,jobId,ti,tt,ts):null;
    if(job)job.lastSeenAt=ts;if(task){applyPresenceFields(task,payload,ts);task.updatedAt=ts;pendingAdd(core.pending,date,taskKey(jobId,ti));}
    pendingAdd(core.pending,date,SUMMARY_PENDING_KEY);day.updatedAt=ts;s.clientSequence=num(s.clientSequence)+1;
    await chrome.storage.local.set({[CAT.data]:core.data,[CAT.pendingTasks]:core.pending});scheduleSyncSoon(350);return {ok:true};
  });
}

async function applyTime(payload) {
  return queue(async () => {
    const core=await readCore();if(!shiftIsActive(core))return {ok:true,frozen:true,shift:core.shift};
    const ts=epochMs(payload.timestamp)||Date.now(),date=reportDateForCore(core,ts),day=ensureDate(core.data,date),s=day.summary;
    const jobId=payload.trackerState==='searching'?'':String(payload.jobId||s.currentJob||''),ti=num(payload.taskIndex||s.currentTask,100000),tt=num(payload.totalTasks||s.totalTasks,100000);
    const active=num(payload.activeMs,60000),idle=num(payload.idleMs,60000),away=num(payload.awayMs,60000),searching=num(payload.searchingMs,60000),grace=num(payload.graceMs,60000),unverified=num(payload.unverifiedMs,60000),elapsed=num(payload.elapsedMs,60000);
    if(jobId){s.currentJob=jobId;s.currentTask=ti;s.totalTasks=tt||s.totalTasks;}s.activeMs+=active;s.idleMs+=idle;s.awayMs+=away;s.searchingMs=num(s.searchingMs)+searching;s.graceMs=num(s.graceMs)+grace;s.unverifiedMs=num(s.unverifiedMs)+unverified;s.elapsedMs+=elapsed;applyPresenceFields(s,payload,ts);
    const j=jobId?ensureJob(day,jobId,tt,ts):null,t=jobId&&ti?ensureTask(day,jobId,ti,tt,ts):null;
    if(j){j.activeMs+=active;j.idleMs+=idle;j.awayMs+=away;j.searchingMs=num(j.searchingMs)+searching;j.graceMs=num(j.graceMs)+grace;j.unverifiedMs=num(j.unverifiedMs)+unverified;j.elapsedMs+=elapsed;j.lastTask=Math.max(num(j.lastTask),ti);j.lastSeenAt=ts;}
    if(t){t.activeMs+=active;t.idleMs+=idle;t.awayMs+=away;t.searchingMs=num(t.searchingMs)+searching;t.graceMs=num(t.graceMs)+grace;t.unverifiedMs=num(t.unverifiedMs)+unverified;t.elapsedMs+=elapsed;applyPresenceFields(t,payload,ts);t.updatedAt=ts;pendingAdd(core.pending,date,taskKey(jobId,ti));}
    pendingAdd(core.pending,date,SUMMARY_PENDING_KEY);day.updatedAt=ts;s.clientSequence=num(s.clientSequence)+1;
    await chrome.storage.local.set({[CAT.data]:core.data,[CAT.pendingTasks]:core.pending});scheduleSyncSoon(1200);return {ok:true};
  });
}

async function appendLegacySubmission(date, event, ts) {
  try {
    const r = await chrome.storage.local.get('tscRecords');
    const rows = Array.isArray(r.tscRecords) ? r.tscRecords : [];
    rows.push({
      id: id('coverage-submit'), timestamp: ts, date, origin: AUGMOTO,
      url: event.url || '', pageTitle: event.pageTitle || '',
      confirmationMethod: 'coverage-task-transition',
      confirmationMessage: `${event.jobId || ''} ${event.taskIndex || ''}/${event.totalTasks || ''}`,
      localOnly: true, sessionId: 'coverage-v2'
    });
    await chrome.storage.local.set({ tscRecords: rows.slice(-20000) });
  } catch (_) {}
}

async function migrateLegacy() {
  const r = await chrome.storage.local.get([CAT.migration, 'tscRecords', CAT.data]);
  if (r[CAT.migration]) return;
  const rows = Array.isArray(r.tscRecords) ? r.tscRecords : [];
  const data = r[CAT.data] && typeof r[CAT.data] === 'object' ? r[CAT.data] : blankData();
  const grouped = {};
  for (const row of rows) {
    if (row?.origin !== AUGMOTO) continue;
    const d = String(row.date || dateKey(row.timestamp));
    grouped[d] = (grouped[d] || 0) + 1;
  }
  for (const [d, count] of Object.entries(grouped)) {
    const day = ensureDate(data, d);
    day.summary.submitted = Math.max(num(day.summary.submitted), count);
    day.summary.clientSequence = num(day.summary.clientSequence) + 1;
  }
  prune(data);
  await chrome.storage.local.set({ [CAT.data]: data, [CAT.migration]: true });
}

async function ensureDevice() {
  // Keep the same bound device when Chrome preserves the bridge but loses the
  // redundant device-key entry. Never silently rebind existing work to a new id.
  const keys=await chrome.storage.local.get([CAT.device,CAT.bridge,CAT.data,CAT.pendingTasks]);
  const stored=String(keys[CAT.device]||'').trim();
  if(stored) return stored;
  const bridge=keys[CAT.bridge];
  const prior=String(bridge?.deviceId||'').trim();
  if(prior && prior.length<=120 && /^[a-zA-Z0-9_-]+$/.test(prior) && bridge?.token && bridge?.actor?.name) {
    await chrome.storage.local.set({[CAT.device]:prior});
    return prior;
  }
  const dates=Object.values(keys[CAT.data]?.dates||{});
  const hasHistory=dates.some(day=>
    Boolean(Object.keys(day?.tasks||{}).length||Object.keys(day?.jobs||{}).length||
      Number(day?.summary?.submitted)>0||Number(day?.summary?.activeMs)>0||
      Number(day?.summary?.elapsedMs)>0));
  const hasPending=Object.values(keys[CAT.pendingTasks]||{}).some(rows=>Array.isArray(rows)&&rows.length>0);
  if(hasHistory||hasPending) throw new Error('Original Tracker device identity is missing, while local work remains. Do not reset or reinstall. Contact Admin for verified recovery.');
  const device=crypto.randomUUID();
  await chrome.storage.local.set({[CAT.device]:device});
  return device;
}
async function pairTrinoTime(preferredTabId = 0) {
  const device=await ensureDevice(), fallbackDate=dateKey();
  const tabs=await chrome.tabs.query({});
  const candidates=tabs.filter(tab=>{try{return Boolean(tab?.id)&&new URL(String(tab.url||'')).origin===TRINOTIME;}catch(_){return false;}});
  const tab=candidates.find(t=>Number(t.id)===Number(preferredTabId))||candidates.find(t=>t.active)||candidates[0];
  if(!tab?.id)throw new Error('Open TrinoTime production in a tab and sign in as the QA Agent first.');
  const result=await chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',func:async(deviceId,expectedOrigin,defaultDate)=>{
    const wait=ms=>new Promise(r=>setTimeout(r,ms));if(location.origin!==expectedOrigin)throw new Error('The selected tab is not the TrinoTime production site.');
    const authHeaders=async()=>{const headers={Accept:'application/json','Content-Type':'application/json'};const securityToken=String(window.TrinoTimeMessagingSessionContext?.getSecuritySessionToken?.()||'');if(securityToken)headers['X-TT-Security-Session']=securityToken;else{try{const user=window.firebase?.auth?.().currentUser;if(user&&!user.isAnonymous&&typeof user.getIdToken==='function')headers.Authorization=`Bearer ${await user.getIdToken(false)}`;}catch(_){}}return headers;};
    let pair=null;for(let i=0;i<16;i++){if(window.TrinoTimeCoverageBridge?.issueToken){pair=await window.TrinoTimeCoverageBridge.issueToken({deviceId,deviceName:'Coverage Activity Tracker · production · Chrome'});break;}await wait(250);}const headers=await authHeaders();
    if(!pair){if(!headers['X-TT-Security-Session']&&!headers.Authorization)throw new Error('The TrinoTime production secure session is not ready yet. Refresh the production tab, wait for the QA Agent profile to load, then try Connect again.');const response=await fetch('/api/workforce/coverage/bridge-token',{method:'POST',headers,credentials:'same-origin',cache:'no-store',body:JSON.stringify({deviceId,deviceName:'Coverage Activity Tracker · production · Chrome'})});pair=await response.json().catch(()=>({}));if(!response.ok)throw new Error(pair?.message||`Coverage pairing returned ${response.status}.`);}
    const reportDate=pair?.shift?.reportDate||defaultDate;let snapshot=null;try{if(headers['X-TT-Security-Session']||headers.Authorization){const response=await fetch(`/api/workforce/coverage/agent?date=${encodeURIComponent(reportDate)}`,{method:'GET',headers,credentials:'same-origin',cache:'no-store'});const data=await response.json().catch(()=>({}));if(response.ok&&data?.ok)snapshot=data;}}catch(_){}
    return {pair,snapshot};
  },args:[device,TRINOTIME,fallbackDate]});
  const bundle=result?.[0]?.result||{},value=bundle.pair||bundle;if(!value?.ok||!value.bridgeToken)throw new Error(value?.message||'TrinoTime production did not issue a Coverage bridge token.');
  const bridge={baseUrl:TRINOTIME,token:String(value.bridgeToken),expiresAt:String(value.expiresAt||''),expiresAtMs:epochMs(value.expiresAtMs),actor:value.actor||null,deviceId:device,connectedAt:Date.now(),lastSyncAt:0};
  const snapshot=bundle.snapshot&&typeof bundle.snapshot==='object'?bundle.snapshot:null;
  let shift=value.shift||{status:'not_clocked_in',reportDate:fallbackDate}, authoritativeSummary=snapshot?.summary||null;
  if(!authoritativeSummary){
    try{const response=await fetch(`${bridge.baseUrl}/api/workforce/coverage/shift-state`,{method:'GET',headers:{Accept:'application/json','X-TT-Coverage-Bridge':bridge.token},cache:'no-store'}),body=await response.json().catch(()=>({}));if(response.ok&&body?.ok){shift=body.shift||shift;authoritativeSummary=body.summary||null;}}catch(_){}
  }
  const {adopted,identityState}=await queue(async()=>{
  const core=await readCore(),identityState=await prepareCoverageIdentity(core,value.actor?.name);
  const adopted=adoptShiftIntoCoverageCore(core,shift,authoritativeSummary),day=adopted.day;
  const localHasActivity=localSummaryHasActivity(day.summary)||Object.keys(day.tasks||{}).length>0||Object.keys(day.jobs||{}).length>0;
  if(!localHasActivity&&snapshot?.summary){applyAuthoritativeCoverageSummary(day,snapshot.summary);day.jobs={};for(const job of Array.isArray(snapshot.jobs)?snapshot.jobs:[])if(job?.jobId)day.jobs[String(job.jobId)]={...job};day.tasks={};for(const task of Array.isArray(snapshot.tasks)?snapshot.tasks:[])if(task?.jobId&&task?.taskIndex)day.tasks[taskKey(task.jobId,task.taskIndex)]={...task,noMatchAreas:task.noMatchAreas||{}};}
  core.bridge=bridge;if(adopted.shift.status==='active')core.pending[adopted.date]=[...Object.keys(day.tasks),SUMMARY_PENDING_KEY];else core.pending[adopted.date]=[];
  await chrome.storage.local.set({[CAT.data]:core.data,[CAT.bridge]:bridge,[CAT.pendingTasks]:core.pending,[CAT.shift]:adopted.shift,[CAT.recent]:core.recent,[CAT.sync]:core.sync,[CAT.owner]:identityState.identity});
  return {adopted,identityState};
  });
  await diag(identityState.ownerChanged?'identity-handoff':'connected',`Connected to TrinoTime production as ${value.actor?.name||'Agent'}.`,{actor:value.actor||null,previousOwner:identityState.previousOwner||null,shift:adopted.shift});
  if(adopted.shift.status==='active')await syncDirty(true);
  return {ok:true,bridge,shift:adopted.shift,restoredFromServer:Boolean(authoritativeSummary),identityChanged:identityState.ownerChanged};
}

// Explicit two-factor shift recovery: authenticated TrinoTime tab + signed bridge.
// Never perform this implicitly at startup or on ordinary Connect.
async function trackerRecoveryCall(tabId,stage,core,recoveryId=''){
  const bridge=core.bridge,shift=core.shift;
  const result=await chrome.scripting.executeScript({target:{tabId},world:'MAIN',func:async(workflow,stage,deviceId,bridgeToken,sessionId,generation,recoveryId,expectedOrigin)=>{
    if(location.origin!==expectedOrigin)throw new Error('Recovery must be initiated from the TrinoTime production tab.');
    const headers={Accept:'application/json','Content-Type':'application/json'};
    const security=String(window.TrinoTimeMessagingSessionContext?.getSecuritySessionToken?.()||'');
    if(security)headers['X-TT-Security-Session']=security;
    else{try{const user=window.firebase?.auth?.().currentUser;if(user&&!user.isAnonymous&&typeof user.getIdToken==='function')headers.Authorization=`Bearer ${await user.getIdToken(false)}`;}catch(_){}}
    if(!headers['X-TT-Security-Session']&&!headers.Authorization)throw new Error('Sign in to your TrinoTime signed-in Agent account and retry recovery.');
    headers[workflow==='coverage'?'X-TT-Coverage-Bridge':'X-TT-Confirmation-Bridge']=bridgeToken;
    const endpoint=stage==='ack'?'recover-ack':'recover-current-shift';
    const payload=stage==='ack'?{deviceId,recoveryId}:{deviceId,shiftSessionId:sessionId,shiftGeneration:generation,confirmation:'RECOVER_MY_ACTIVE_SHIFT'};
    const response=await fetch(`/api/workforce/${workflow}/${endpoint}`,{method:'POST',headers,credentials:'same-origin',cache:'no-store',body:JSON.stringify(payload)});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data?.message||`Shift recovery returned ${response.status}.`);
    return data;
  },args:['coverage',stage,bridge.deviceId,bridge.token,shift.sessionId,shift.generation,recoveryId,TRINOTIME]});
  const response=result?.[0]?.result;
  if(!response?.ok)throw new Error(response?.message||'The recovery response could not be verified.');
  return response;
}
function trackerRecoveryHasLocalWork(day){
  const s=day?.summary||{};
  const counters=['submitted','created','blurred','deleted','noMatch','productMatched'];
  return counters.some(key=>num(s[key])>0)||Object.keys(day?.jobs||{}).length>0||Object.keys(day?.tasks||{}).length>0;
}
async function recoverCurrentShift(){
  if(recoveryInProgress)return {ok:false,error:'Recovery is already running.'};
  recoveryInProgress=true;
  if(syncWakeTimer){clearTimeout(syncWakeTimer);syncWakeTimer=null;}
  syncWakeDueAt=0;
  try{
    if(syncInFlight)await syncInFlight.catch(()=>{});
    const core=await readCore();
    if(!core.bridge?.token||!shiftIsActive(core))throw new Error('Connect the Tracker and Time In before recovering this shift.');
    const checkpoint=(await chrome.storage.local.get('catRecoveryCheckpointV1'))['catRecoveryCheckpointV1'];
    if(checkpoint?.recoveryId&&checkpoint.shiftSessionId===core.shift.sessionId&&checkpoint.deviceId===core.bridge.deviceId){
      const tabs=await chrome.tabs.query({});
      const tab=tabs.find(t=>{try{return t.id&&new URL(String(t.url||'')).origin===TRINOTIME;}catch(_){return false;}});
      if(!tab?.id)throw new Error('Open TrinoTime production and sign in to complete the pending recovery acknowledgment.');
      await trackerRecoveryCall(tab.id,'ack',core,checkpoint.recoveryId);
      await chrome.storage.local.remove('catRecoveryCheckpointV1');
      syncBackoffUntil=0;syncFailureCount=0;syncFollowUpRequested=false;
      await chrome.storage.local.set({[CAT.sync]:{state:'ok',lastSyncAt:Date.now(),lastMessage:'Shift safely recovered',lastError:''}});
      return {ok:true,resumedPendingRecovery:true};
    }
    // A previous click can finish one workflow while the other still needs recovery.
    // Verify the server still recognizes this device before treating that workflow as done.
    if(core.sync?.state==='ok'&&core.sync?.lastMessage==='Shift safely recovered'){
      const response=await fetch(`${core.bridge.baseUrl}/api/workforce/coverage/shift-state`,{headers:{Accept:'application/json','X-TT-Coverage-Bridge':core.bridge.token},cache:'no-store'});
      const body=await response.json().catch(()=>({}));
      if(response.ok&&body.ok&&body.shift?.sessionId===core.shift.sessionId&&Number(body.shift?.generation||0)===Number(core.shift.generation||0)&&body.summary?.deviceId===core.bridge.deviceId&&!body.summary?.recoveryPending){
        return {ok:true,alreadyRecovered:true,shift:body.shift};
      }
    }
    const date=reportDateForCore(core),day=ensureDate(core.data,date);
    if(trackerRecoveryHasLocalWork(day))throw new Error('This new Tracker already has task/job counts. Recovery cannot replace unsynced local work. Keep this installation and ask the administrator to reconcile it safely.');
    const tabs=await chrome.tabs.query({});
    const tab=tabs.find(t=>{try{return t.id&&new URL(String(t.url||'')).origin===TRINOTIME;}catch(_){return false;}});
    if(!tab?.id)throw new Error('Open TrinoTime production, sign in as this Agent, then click Recover This Shift again.');
    const result=await trackerRecoveryCall(tab.id,'recover',core);
    const remoteShift=cleanShift(result.shift);
    if(remoteShift.sessionId!==core.shift.sessionId||remoteShift.generation!==core.shift.generation||remoteShift.status!=='active')throw new Error('The shift changed during recovery. No local work was cleared.');
    const jobs=Array.isArray(result.jobs)?result.jobs:[],tasks=Array.isArray(result.tasks)?result.tasks:[];
    // Durable backup before rehydration. Restore only after server explicitly confirms ownership.
    const prepared=await queue(async()=>{
      const latest=await readCore(),candidate=ensureDate(latest.data,date);
      if(latest.bridge?.token!==core.bridge.token||latest.shift.sessionId!==core.shift.sessionId||trackerRecoveryHasLocalWork(candidate))throw new Error('Local Tracker state changed during recovery. Server recovery remains pending; stop counting and retry.');
      await chrome.storage.local.set({[`catPreRecoveryBackupV1`]:{savedAt:Date.now(),shift:latest.shift,data:latest.data,pending:latest.pending}});
      latest.data.dates[date]=blankDate();
      const restored=ensureDate(latest.data,date);
      if(result.summary)applyAuthoritativeCoverageSummary(restored,result.summary);
      if(result.summary){
        // Restore metric baselines that the regular shift-state lightweight adoption
        // intentionally does not hydrate. This prevents post-handoff metric resets.
        for(const key of ['efficiencyTaskCount','efficiencyActiveMs','productMatched','created','blurred','deleted','noMatch','awayTimingAvailable']){
          if(result.summary[key]!==undefined)restored.summary[key]=key==='awayTimingAvailable'?result.summary[key]===true:num(result.summary[key]);
        }
        if(result.summary.currentStoreName)restored.summary.currentStoreName=String(result.summary.currentStoreName);
      }
      for(const job of jobs){if(job?.jobId)restored.jobs[String(job.jobId)]={...job};}
      for(const task of tasks){if(task?.jobId&&task?.taskIndex)restored.tasks[taskKey(task.jobId,task.taskIndex)]={...task,noMatchAreas:task.noMatchAreas||{}};}
      restored.summary.pendingSubmission=false;
      restored.summary.trackerState='ready';
      restored.summary.currentJob='';restored.summary.currentTask=0;restored.summary.totalTasks=0;
      // Pending server-job rewrites are forbidden: these rows already exist server-side.
      latest.pending[date]=[];
      latest.shift=remoteShift;
      await chrome.storage.local.set({[CAT.data]:latest.data,[CAT.pendingTasks]:latest.pending,[CAT.shift]:latest.shift,[CAT.sync]:{state:'recovering',lastMessage:'Restored, awaiting server handoff confirmation',lastError:''}});
      if(result.recoveryId)await chrome.storage.local.set({'catRecoveryCheckpointV1':{recoveryId:result.recoveryId,shiftSessionId:remoteShift.sessionId,deviceId:core.bridge.deviceId,at:Date.now()}});
      return {restoredJobs:jobs.length,restoredTasks:tasks.length};
    });
    if(result.recoveryId){await trackerRecoveryCall(tab.id,'ack',core,result.recoveryId);}
    await chrome.storage.local.remove('catRecoveryCheckpointV1');
    syncBackoffUntil=0;syncFailureCount=0;syncFollowUpRequested=false;
    await chrome.storage.local.set({[CAT.sync]:{state:'ok',lastSyncAt:Date.now(),lastMessage:'Shift safely recovered',lastError:''}});
    await diag('shift-recovery','Verified same-Agent, same-shift Tracker handoff without resetting server totals.',prepared);
    return {ok:true,shift:remoteShift,...prepared,alreadyOwned:Boolean(result.alreadyOwned)};
  }catch(error){
    await diag('shift-recovery-blocked',String(error?.message||error));
    return {ok:false,error:String(error?.message||error)};
  }finally{recoveryInProgress=false;}
}
async function refreshShiftState(){
  if((await chrome.storage.local.get('ttQaRecoveryFreezeV1')).ttQaRecoveryFreezeV1)return {ok:false,recovering:true,qaHandoff:true};
  const core=await readCore(),bridge=core.bridge;
  if(!bridge?.token)return {ok:false,skipped:true,shift:core.shift};
  const {response,body}=await trackerSyncRequest(`${bridge.baseUrl}/api/workforce/coverage/shift-state`,{
    method:'GET',headers:{Accept:'application/json','X-TT-Coverage-Bridge':bridge.token},cache:'no-store'});
  if(!response.ok){const error=new Error(body?.message||`Shift state returned ${response.status}.`);error.status=response.status;throw error;}
  if(body?.ok!==true||!body.shift||!['active','completed','not_clocked_in'].includes(body.shift.status))throw new Error('Invalid shift state response; local work preserved.');
  return queue(async()=>{
    const latest=await readCore();assertSyncContext(latest,core);
    const adopted=adoptShiftIntoCoverageCore(latest,body.shift,body.summary||null);
    await persistCoverageShiftCore(latest);
    return {ok:true,shift:adopted.shift,summary:adopted.day.summary,sessionChanged:adopted.identityChanged};
  });
}
async function resetCurrentShift(){
  const core=await readCore(),bridge=core.bridge;if(!bridge?.token)throw new Error('Connect the Tracker to TrinoTime first.');
  if(!shiftIsActive(core))throw new Error('Reset Current Shift is available only while you are Timed In.');
  const response=await fetch(`${bridge.baseUrl}/api/workforce/coverage/reset-current-shift`,{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json','X-TT-Coverage-Bridge':bridge.token},body:JSON.stringify({deviceId:bridge.deviceId,reason:'agent_manual_tracker_reset'}),cache:'no-store'});
  const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body?.message||`Reset returned ${response.status}.`);
  return queue(async()=>{const latest=await readCore();const adopted=adoptShiftIntoCoverageCore(latest,body.shift,null);latest.data.dates[adopted.date]=blankDate();latest.pending[adopted.date]=[];latest.shift=cleanShift(body.shift);await persistCoverageShiftCore(latest);await diag('manual-reset','Current shift Coverage + Confirmation totals were reset from TrinoTime.',{reset:body.reset||null,shift:latest.shift});return {ok:true,shift:latest.shift,reset:body.reset||null};});
}

async function handleTrinoTimeSessionEnding() {
  const syncResult=await syncDirty(true).catch(error=>({ok:false,error:String(error?.message||error)}));
  return queue(async()=>{
    const core=await readCore(), owner=localOwnerIdentity((await chrome.storage.local.get(CAT.owner))[CAT.owner]);
    const date=reportDateForCore(core),day=ensureDate(core.data,date);
    day.summary.pendingSubmission=false;day.summary.trackerState='offline';day.summary.currentJob='';day.summary.currentTask=0;day.summary.totalTasks=0;
    if(core.shift.status==='active')core.shift={...core.shift,status:'not_clocked_in',locked:true};
    core.bridge=null;
    await archiveCoverageIdentity(owner,core);
    await chrome.storage.local.set({[CAT.data]:core.data,[CAT.shift]:core.shift,[CAT.pendingTasks]:core.pending,[CAT.sync]:{...(core.sync||{}),state:'idle',lastMessage:'TrinoTime signed out · connection cleared',lastError:''}});
    await chrome.storage.local.remove(CAT.bridge);
    await diag('session-ended','TrinoTime Agent signed out. Coverage tracking was frozen and the local bridge was cleared.',{owner:owner||null,syncBeforeDisconnect:Boolean(syncResult?.ok)});
    return {ok:true,frozen:true,owner:owner||null,syncBeforeDisconnect:Boolean(syncResult?.ok)};
  });
}

async function disconnectLocal() {
  await chrome.storage.local.remove(CAT.bridge);
  await diag('disconnected', 'TrinoTime bridge removed from this browser.');
  return { ok: true };
}

// Sync transport v2.2.50: each immutable upload snapshot gets a durable sequence.
// Metrics are absolute snapshots; retrying them never adds counts server-side.
function sameSyncContext(a,b) {
  return Boolean(a?.bridge?.token && a.bridge.token===b?.bridge?.token &&
    a.bridge.deviceId===b.bridge.deviceId && a.bridge.baseUrl===b.bridge.baseUrl &&
    a.shift.sessionId===b.shift.sessionId && Number(a.shift.generation)===Number(b.shift.generation) &&
    a.shift.reportDate===b.shift.reportDate && a.shift.status===b.shift.status);
}
function assertSyncContext(latest,expected) {
  if(!sameSyncContext(latest,expected)) {
    const error=new Error('Tracker connection or shift changed during sync; pending work preserved.');
    error.code='TRACKER_CONTEXT_CHANGED';throw error;
  }
}
async function trackerSyncRequest(url,options) {
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),20000);
  try {
    const response=await fetch(url,{...options,signal:controller.signal});
    const body=await response.json().catch(()=>({}));
    return {response,body};
  } finally {clearTimeout(timer);}
}
function selectSyncKeys(core,date) {
  const day=ensureDate(core.data,date),keys=[],jobs=new Set();
  for(const key of Array.isArray(core.pending[date])?core.pending[date]:[]) {
    if(keys.length>=150)break;
    if(key!==SUMMARY_PENDING_KEY) {
      const task=day.tasks?.[key];
      if(!task?.jobId)throw new Error('Pending task record is missing; synchronization preserved it for review.');
      if(!jobs.has(task.jobId)&&jobs.size>=80)break;
      jobs.add(task.jobId);
    }
    keys.push(key);
  }
  return keys;
}
async function reserveSyncSnapshot(expected,force) {
  return queue(async()=>{
    const latest=await readCore();assertSyncContext(latest,expected);
    const date=reportDateForCore(latest),day=ensureDate(latest.data,date);
    if(!selectSyncKeys(latest,date).length&&!force)return null;
    // Persist before transport. Next batch/retry cannot reuse a sequence with
    // different task rows or store metadata, even after worker suspension.
    day.summary.clientSequence=num(day.summary.clientSequence)+1;
    pendingAdd(latest.pending,date,SUMMARY_PENDING_KEY);
    await chrome.storage.local.set({[CAT.data]:latest.data,[CAT.pendingTasks]:latest.pending});
    return latest;
  });
}
// Coalesce fast task events without repeatedly postponing synchronization.
// The earliest scheduled wake wins; newer events may expedite it, never starve it.
// A failed transport still obeys existing retry backoff. Chrome's minute alarm
// remains the fallback if the service worker is suspended.
function scheduleSyncSoon(delayMs=900) {
  const delay=Math.max(200,Math.min(60000,Number(delayMs)||700));
  if(syncInFlight){syncFollowUpRequested=true;return;}
  const now=Date.now();
  const minGap=Math.max(0,500-(now-lastSyncAttemptAt));
  const backoff=Math.max(0,syncBackoffUntil-now);
  const dueAt=now+Math.max(delay,minGap,backoff);
  if(syncWakeTimer && syncWakeDueAt && syncWakeDueAt<=dueAt)return;
  if(syncWakeTimer)clearTimeout(syncWakeTimer);
  syncWakeDueAt=dueAt;
  syncWakeTimer=setTimeout(()=>{
    syncWakeTimer=null;syncWakeDueAt=0;
    if(Date.now()<syncBackoffUntil){scheduleSyncSoon(200);return;}
    syncDirty(false).catch(()=>{});
  },Math.max(0,dueAt-Date.now()));
}
// v2.3.8: One guarded, read-only server proof for same-device sequence repair.
// A proof never acknowledges local tasks. The next ordinary sync must still
// receive a verified server ACK before the pending queue can be cleared.
async function trackerSequenceResumeSafe(core) {
  const date=reportDateForCore(core),day=ensureDate(core.data,date),bridge=core.bridge;
  if(!bridge?.token||!shiftIsActive(core))return false;
  const tasks=Object.values(day.tasks||{}),jobs=Object.values(day.jobs||{});
  if(tasks.length>350||jobs.length>120)return false;
  const syncState=core.sync||{};
  if(Date.now()-(Number(syncState.sequenceProofCheckedAt)||0)<5*60*1000)return false;
  await queue(async()=>{
    const latest=await readCore();assertSyncContext(latest,core);
    await chrome.storage.local.set({[CAT.sync]:{...latest.sync,sequenceProofCheckedAt:Date.now()}});
  });
  const {response,body}=await trackerSyncRequest(`${bridge.baseUrl}/api/workforce/coverage/sequence-resume-proof`,{
    method:'POST',headers:{Accept:'application/json','Content-Type':'application/json','X-TT-Coverage-Bridge':bridge.token},
    body:JSON.stringify({deviceId:bridge.deviceId,shiftSessionId:core.shift.sessionId,shiftGeneration:core.shift.generation,
      summary:syncSummarySnapshot(day.summary,core.settings),jobs,tasks}),cache:'no-store'
  });
  if(!response.ok||body?.ok!==true||body.safeToResume!==true||
     !Number.isSafeInteger(body.acceptedSequence)||body.acceptedSequence<0||
     !/^[0-9a-f]{64}$/.test(String(body.acceptedDigest||''))||
     body.shiftSessionId!==core.shift.sessionId||Number(body.shiftGeneration)!==Number(core.shift.generation))return false;
  await queue(async()=>{
    const latest=await readCore();assertSyncContext(latest,core);
    const latestDay=ensureDate(latest.data,date);
    latestDay.summary.clientSequence=Math.max(num(latestDay.summary.clientSequence),body.acceptedSequence)+1;
    pendingAdd(latest.pending,date,SUMMARY_PENDING_KEY);
    await chrome.storage.local.set({[CAT.data]:latest.data,[CAT.pendingTasks]:latest.pending,
      [CAT.sync]:{...latest.sync,state:'pending',errorCode:'',lastError:'',
        lastMessage:'Server sequence verified; awaiting fresh delivery acknowledgment',
        sequenceResumeExpected:body.acceptedSequence,sequenceResumeDigest:body.acceptedDigest,
        sequenceProofCheckedAt:Date.now()}});
  });
  return true;
}

async function syncDirty(force=false) {
  if(recoveryInProgress)return {ok:false,recovering:true};
  if((await chrome.storage.local.get('ttQaRecoveryFreezeV1')).ttQaRecoveryFreezeV1)return {ok:false,recovering:true,qaHandoff:true};
  if(syncInFlight){syncFollowUpRequested=true;return syncInFlight;}
  if(syncWakeTimer){clearTimeout(syncWakeTimer);syncWakeTimer=null;}
  syncWakeDueAt=0;
  let attemptContext=null;
  syncInFlight=(async()=>{
    lastSyncAttemptAt=Date.now();
    if((await chrome.storage.local.get('catRecoveryCheckpointV1'))['catRecoveryCheckpointV1'])return {ok:false,recovering:true};
    let core=await readCore();attemptContext=core;
    if(!core.bridge?.token||core.settings.syncEnabled===false)return {ok:false,skipped:true};
    if(!shiftIsActive(core)) {
      const refreshed=await refreshShiftState().catch(()=>null);
      core=await readCore();attemptContext=core;
      if(!shiftIsActive(core))return {ok:true,locked:true,shift:core.shift,refreshed:Boolean(refreshed)};
      if(!core.bridge?.token)return {ok:false,skipped:true};
    }
    if(['TRACKER_SEQUENCE_CONFLICT','TRACKER_SEQUENCE_RESUME_CHANGED','COVERAGE_DEVICE_CONFLICT','TRACKER_RECOVERY_PENDING'].includes(core.sync?.errorCode) &&
       core.sync.shiftSessionId===core.shift.sessionId && Number(core.sync.shiftGeneration)===Number(core.shift.generation) &&
       core.sync.deviceId===core.bridge.deviceId){
      if(core.sync.errorCode==='TRACKER_SEQUENCE_CONFLICT'){
        const resumed=await trackerSequenceResumeSafe(core).catch(()=>false);
        if(resumed)core=await readCore();
        else return {ok:false,conflict:true,error:core.sync.lastError};
      }else return {ok:false,conflict:true,error:core.sync.lastError};
    }
    const bridge=core.bridge;
    const parsedExpiryMs=Date.parse(String(bridge.expiresAt||''));
    const expiry=epochMs(bridge.expiresAtMs)>=1000000000000?epochMs(bridge.expiresAtMs):(Number.isFinite(parsedExpiryMs)?epochMs(parsedExpiryMs):epochMs(bridge.expiresAtMs));
    if(expiry&&expiry<Date.now()+5000){const error=new Error('TrinoTime Coverage bridge expired. Reconnect from the extension popup.');error.status=401;throw error;}
    core=await reserveSyncSnapshot(core,force);
    if(!core)return {ok:true,nothing:true};
    attemptContext=core;
    const date=reportDateForCore(core),day=ensureDate(core.data,date),keys=selectSyncKeys(core,date);
    const taskKeys=keys.filter(k=>k!==SUMMARY_PENDING_KEY);
    const taskVersions=Object.fromEntries(taskKeys.map(k=>[k,JSON.stringify(day.tasks[k])]));
    const tasks=taskKeys.map(k=>({...day.tasks[k],storeName:storeNameFromMap(core,day.tasks[k].jobId,day.tasks[k].storeName)}));
    // Send the jobs belonging to THIS batch, not the oldest 80 jobs all day.
    const jobIds=new Set(tasks.map(t=>t.jobId));
    if(day.summary.currentJob && jobIds.size<80)jobIds.add(day.summary.currentJob);
    const jobs=[...jobIds].map(id=>day.jobs?.[id]).filter(Boolean).map(j=>({...j,storeName:storeNameFromMap(core,j.jobId,j.storeName)}));
    const summary={...syncSummarySnapshot(day.summary,core.settings),currentStoreName:storeNameFromMap(core,day.summary.currentJob,day.summary.currentStoreName)};
    const summaryVersion=JSON.stringify(syncSummarySnapshot(day.summary,core.settings));
    const {response,body}=await trackerSyncRequest(`${bridge.baseUrl}/api/workforce/coverage/sync`,{
      method:'POST',headers:{Accept:'application/json','Content-Type':'application/json','X-TT-Coverage-Bridge':bridge.token},
      body:JSON.stringify({schemaVersion:1,date,deviceId:bridge.deviceId,clientUpdatedAt:new Date().toISOString(),
        clientSequence:num(day.summary.clientSequence),shiftSessionId:core.shift.sessionId,shiftGeneration:core.shift.generation,
        ...(core.sync?.sequenceResumeDigest?{sequenceResumeExpected:core.sync.sequenceResumeExpected,sequenceResumeDigest:core.sync.sequenceResumeDigest}:{}),summary,jobs,tasks}),cache:'no-store'
    });
    if(!response.ok){
      // Diagnostic only: preserve all pending work and the existing retry/ACK rules.
      const workerLimit=Number(response.status)===503 && Number(body?.error_code)===1102 && body?.cloudflare_error===true;
      const error=new Error(workerLimit
        ? 'TrinoTime Worker exceeded resources (Cloudflare 1102). Pending activity is preserved; contact your Admin.'
        : (body?.message||`TrinoTime sync returned ${response.status}.`));
      error.status=response.status;
      error.code=workerLimit?'CLOUDFLARE_WORKER_1102':body?.error||`TRINOTIME_SYNC_HTTP_${response.status}`;
      throw error;
    }
    if(body?.ok===true&&(body.locked===true||body.sessionChanged===true)) {
      if(!body.shift||!['active','completed','not_clocked_in'].includes(body.shift.status))throw new Error('Invalid shift response; pending records preserved.');
      await queue(async()=>{
        const latest=await readCore();assertSyncContext(latest,core);
        adoptShiftIntoCoverageCore(latest,body.shift,body.summary||null);await persistCoverageShiftCore(latest);
        await chrome.storage.local.set({[CAT.sync]:{state:'ok',lastAttemptAt:Date.now(),
          lastMessage:body.locked?'Shift locked; verify archived pending work':'New shift detected; verify archived pending work',lastError:''}});
      });
      return {ok:true,locked:Boolean(body.locked),sessionChanged:Boolean(body.sessionChanged),shift:body.shift};
    }
    if(body?.stale===true){
      const resumed=await trackerSequenceResumeSafe(core).catch(()=>false);
      if(resumed){syncFollowUpRequested=true;return {ok:false,sequenceResumePending:true};}
      const error=new Error('TrinoTime reports a conflicting Coverage sequence. Local pending work is preserved; reconcile this shift before retrying.');
      error.code='TRACKER_SEQUENCE_CONFLICT';throw error;
    }
    if(body?.ok!==true||body?.accepted!==true||Number(body.acceptedSequence)!==num(day.summary.clientSequence)||
       body.shift?.sessionId!==core.shift.sessionId||Number(body.shift?.generation)!==Number(core.shift.generation)||body.shift?.status!=='active' ||
       (!body.duplicate&&(Number(body.tasksAccepted)!==tasks.length||Number(body.jobsAccepted)!==jobs.length)))
      throw new Error('Unverified Coverage sync acknowledgment. Local pending records preserved.');
    await queue(async()=>{
      const latest=await readCore();assertSyncContext(latest,core);
      const pending=latest.pending,latestDay=ensureDate(latest.data,date),remove=new Set(keys);
      pending[date]=(Array.isArray(pending[date])?pending[date]:[]).filter(k=>{
        if(!remove.has(k))return true;
        if(k===SUMMARY_PENDING_KEY)return JSON.stringify(syncSummarySnapshot(latestDay.summary,latest.settings))!==summaryVersion;
        return JSON.stringify(latestDay.tasks?.[k]||null)!==taskVersions[k];
      });
      const syncedAt=Date.now();
      const attemptRaw=(await chrome.storage.local.get(CAT.submitAttempts))[CAT.submitAttempts];
      const attempts=Array.isArray(attemptRaw)?attemptRaw:[];
      const acknowledged=new Set(taskKeys.filter(k=>!pending[date]?.includes(k) &&
        latestDay.tasks?.[k]?.submitted===true));
      let changedAttempt=false;
      for(const item of attempts) {
        if(item.status==='confirmed_pending_sync' && item.owner===activeAttemptOwner(latest) &&
          item.date===date && item.sessionId===latest.shift.sessionId &&
          Number(item.generation)===Number(latest.shift.generation) &&
          acknowledged.has(taskKey(item.jobId,item.taskIndex))) {
          item.status='acknowledged';item.serverAckAt=syncedAt;item.updatedAt=syncedAt;changedAttempt=true;
        }
      }
      await chrome.storage.local.set({[CAT.pendingTasks]:pending,
        ...(changedAttempt?{[CAT.submitAttempts]:attempts}:{}),
        [CAT.bridge]:{...latest.bridge,lastSyncAt:syncedAt},
        [CAT.sync]:{state:'ok',lastSyncAt:syncedAt,lastAttemptAt:syncedAt,lastMessage:`Live sync ${date}`,lastError:'',acceptedSequence:Number(body.acceptedSequence),verifiedAckAt:syncedAt,verifiedAckSessionId:core.shift.sessionId,verifiedAckGeneration:core.shift.generation}});
      if(pending[date].length)syncFollowUpRequested=true;
    });
    syncBackoffUntil=0;syncFailureCount=0;
    return {ok:true,synced:1,shift:body.shift};
  })().catch(async error=>{
    // A delayed response must never restore a disconnected bridge or alter
    // the new account/shift's pending queue or connection status.
    return queue(async()=>{
      const latest=await readCore();
      if(attemptContext&&!sameSyncContext(latest,attemptContext))return {ok:false,contextChanged:true};
      const authFailure=[401,403].includes(Number(error?.status));
      const failureCode=String(error?.code||'');
      const deviceConflict=failureCode==='COVERAGE_DEVICE_CONFLICT';
      const conflict=['TRACKER_SEQUENCE_CONFLICT','TRACKER_SEQUENCE_RESUME_CHANGED','COVERAGE_DEVICE_CONFLICT','TRACKER_RECOVERY_PENDING'].includes(failureCode);
      const blocked=authFailure||conflict;
      syncFailureCount=blocked?0:Math.min(6,syncFailureCount+1);
      const retryDelay=blocked?0:Math.min(60000,2500*Math.pow(2,Math.max(0,syncFailureCount-1)));
      syncBackoffUntil=retryDelay?Date.now()+retryDelay:0;
      await chrome.storage.local.set({[CAT.sync]:{state:'error',lastAttemptAt:Date.now(),
        lastMessage:authFailure?'Reconnect required':deviceConflict?'Device conflict: verified shift recovery required':conflict?'Shift reconciliation required':`Sync retry in ${Math.round(retryDelay/1000)}s`,
        lastError:String(error.message||error),errorCode:String(error.code||''),retryAt:retryDelay?Date.now()+retryDelay:0,
        sequenceProofCheckedAt:Number(latest.sync?.sequenceProofCheckedAt)||0,
        verifiedAckAt:epochMs(latest.sync?.verifiedAckAt),verifiedAckSessionId:String(latest.sync?.verifiedAckSessionId||''),verifiedAckGeneration:Number(latest.sync?.verifiedAckGeneration)||0,
        shiftSessionId:latest.shift.sessionId,shiftGeneration:latest.shift.generation,deviceId:latest.bridge?.deviceId||''}});
      syncFollowUpRequested=!blocked;
      return {ok:false,error:String(error.message||error),errorCode:String(error.code||''),retryInMs:retryDelay};
    });
  }).finally(()=>{
    syncInFlight=null;
    if(syncFollowUpRequested){syncFollowUpRequested=false;scheduleSyncSoon(300);}
  });
  return syncInFlight;
}

async function adjustSubmitted(delta) {
  return queue(async()=>{const step=Number(delta);if(!Number.isFinite(step)||![1,-1].includes(Math.trunc(step)))return {ok:false,error:'Invalid submitted adjustment.'};const core=await readCore();if(!shiftIsActive(core))return {ok:false,frozen:true,error:'Time In is required. Completed shift totals are locked.',shift:core.shift};const date=reportDateForCore(core),day=ensureDate(core.data,date),s=day.summary,confirmed=num(s.submitted,1000000),current=submittedManual(s.submittedManualAdjustment),next=Math.max(-confirmed,Math.min(100000,current+Math.trunc(step)));s.submittedManualAdjustment=next;s.clientSequence=num(s.clientSequence)+1;day.updatedAt=Date.now();pendingAdd(core.pending,date,SUMMARY_PENDING_KEY);await chrome.storage.local.set({[CAT.data]:core.data,[CAT.pendingTasks]:core.pending});scheduleSyncSoon(350);return {ok:true,confirmed,manual:next,total:submittedDisplay(s)};});
}

// Read-only diagnostic counters. A queued summary marker is NOT an unsent task.
function syncHealthSnapshot(core) {
  const queue=core?.pending && typeof core.pending==='object' ? core.pending : {};
  let pendingTasks=0,pendingSummaries=0,pendingDates=0;
  for(const [date,items] of Object.entries(queue)) {
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Array.isArray(items)||!items.length)continue;
    pendingDates++;
    const unique=new Set(items.filter(item=>typeof item==='string'));
    if(unique.delete(SUMMARY_PENDING_KEY))pendingSummaries++;
    pendingTasks+=unique.size;
  }
  // Store mapping evidence has a SEPARATE server acknowledgement, including
  // after Time Out. Never call mapping delivery complete using task ACK alone.
  const actor=core?.bridge?.actor;
  const owner=actor?.pod&&actor?.name?`${actor.pod}|${actor.name}`:'';
  const mappingEvidence=Object.values(core?.storeNames||{}).filter(v=>
    owner && v?.observedFor===owner && v?.source==='augmoto-job-row');
  const mappingPending=mappingEvidence.filter(v=>!v.serverAckAt).length;
  const mappingAckAt=mappingEvidence.reduce((max,v)=>Math.max(max,Number(v.serverAckAt)||0),0);
  const s=core?.sync||{},shift=core?.shift||{};
  const ackValid=Boolean(s.verifiedAckAt && s.verifiedAckSessionId &&
    s.verifiedAckSessionId===shift.sessionId && Number(s.verifiedAckGeneration)===Number(shift.generation));
  return {pendingTasks,pendingSummaries,pendingDates,mappingPending,mappingAckAt,
    lastVerifiedAckAt:ackValid?epochMs(s.verifiedAckAt):0,
    retryAt:epochMs(s.retryAt),
    unresolvedArchives:Object.values(core?.data?.shiftArchivesV1||{}).filter(a=>a?.requiresManualReconciliation).length};
}

async function context() {
  const core=await readCore(),today=reportDateForCore(core),day=ensureDate(core.data,today);
  const seen=(await chrome.storage.local.get(CAT.submitAttempts))[CAT.submitAttempts];
  const owner=activeAttemptOwner(core),list=Array.isArray(seen)?seen:[];
  const latestSubmitAttempt=list.filter(x=>x.owner===owner&&x.sessionId===core.shift.sessionId&&
    x.date===today&&Number(x.generation)===Number(core.shift.generation))
    .sort((a,b)=>b.at-a.at)[0]||null;
  return {latestSubmitAttempt,origin:AUGMOTO,settings:core.settings,today,summary:{...day.summary,submittedManualAdjustment:submittedManual(day.summary.submittedManualAdjustment),submittedDisplayTotal:submittedDisplay(day.summary)},jobs:day.jobs,tasks:day.tasks,bridge:core.bridge,sync:{...core.sync,unresolvedShiftArchives:Object.values(core.data.shiftArchivesV1||{}).filter(a=>a?.requiresManualReconciliation).length},shift:core.shift,trackingLocked:!shiftIsActive(core),managedIdlePolicy:{minutes:MANAGED_IDLE_MINUTES,milliseconds:MANAGED_IDLE_MS},diagnostics:(await chrome.storage.local.get(CAT.diagnostics))[CAT.diagnostics]||null,syncHealth:syncHealthSnapshot(core)};
}

async function updateSettings(patch) {
  const r = await chrome.storage.local.get(CAT.settings);
  const next = cleanSettings({ ...cleanSettings(r[CAT.settings]), ...(patch || {}) });
  await chrome.storage.local.set({ [CAT.settings]: next });
  return next;
}

async function clearToday() {
  return { ok: false, error: 'Managed Coverage mode does not allow Agents to clear today’s tracked activity.' };
}

// Re-check the fallback alarm whenever Chrome revives the extension worker.
// Chrome may clear alarms across some browser restarts; a one-minute fallback
// limits network load while normal event-driven uploads remain much faster.
chrome.alarms.get('cat-sync').then(existing => {
  if (!existing) return chrome.alarms.create('cat-sync', {periodInMinutes:1});
}).catch(() => {});

const availabilityWake = TrinoTimeAvailabilityCore.create({
  readCore, refreshShift: refreshShiftState, sync: () => syncDirty(false)
});

chrome.runtime.onInstalled.addListener(async () => {
  await ensureDevice();
  const r = await chrome.storage.local.get(CAT.settings);
  await chrome.storage.local.set({ [CAT.settings]: cleanSettings(r[CAT.settings] || defaultSettings()) });
  await migrateLegacy();
  chrome.alarms.create('cat-sync', { periodInMinutes: 1 });
  refreshShiftState().then(()=>syncDirty(false)).catch(() => {});
  syncStoreMappingMetadata().catch(()=>{});
  try {
    const tabs = await chrome.tabs.query({ url: `${AUGMOTO}/*` });
    await Promise.allSettled(tabs.filter(t => t.id).map(t => chrome.scripting.executeScript({ target: { tabId: t.id }, files: ['tracker-availability.js','search-presence.js','activity-integrity.js','workflow-coordinator.js','job-mode.js','task-efficiency.js','hud-appearance.js','store-intelligence.js','coverage.js','confirmation.js'] })));
  } catch (_) {}
});
chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create('cat-sync', { periodInMinutes: 1 });
  refreshShiftState().then(()=>syncDirty(false)).catch(() => {});
  syncStoreMappingMetadata().catch(()=>{});
  migrateLegacy().catch(() => {});
  chrome.storage.local.get(CAT.settings).then(r => chrome.storage.local.set({ [CAT.settings]: cleanSettings(r[CAT.settings] || defaultSettings()) })).catch(() => {});
});
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === 'cat-sync') { refreshShiftState().then(()=>syncDirty(false)).catch(() => {}); syncStoreMappingMetadata().catch(()=>{}); } });
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !String(message.type || '').startsWith('cat-')) return;
  const run = async () => {
    switch (message.type) {
      case 'cat-availability-resume':
        if (!sender?.tab?.id || !String(sender.url || '').startsWith(`${AUGMOTO}/`)) return {ok:false, denied:true};
        return availabilityWake(message.reason === 'online' ? 'online' : 'resume');
      case 'cat-context': return context();
      case 'cat-mode-leave': return leaveMode();
      case 'cat-efficiency-time': return applyEfficiencyTime(message.payload||{});
      case 'cat-store-observed': return rememberObservedStores(message.stores);
      case 'cat-submit-attempt': return recordSubmitAttempt(message.attempt||{},sender);
      case 'cat-submit-attempt-status':
        if(!sender?.tab?.id||!String(sender.url||'').startsWith(`${AUGMOTO}/`))return {ok:false};
        return setSubmitAttemptStatus(String(message.id||''),String(message.status||''));
      case 'cat-event': return applyEvent(message.event || {});
      case 'cat-no-match-reconcile': return { ok: true, ignored: true, reason: 'v2.2.19 explicit No-Match actions only' };
      case 'cat-presence': return applyPresence(message.payload || {});
      case 'cat-time': return applyTime(message.payload || {});
      case 'cat-settings': return { ok: true, settings: await updateSettings(message.patch || {}) };
      case 'cat-pair-trinotime': return pairTrinoTime(Number(message.preferredTabId)||Number(sender?.tab?.id)||0);
      case 'cat-session-ending': return handleTrinoTimeSessionEnding();
      case 'cat-recover-shift': return recoverCurrentShift();
      case 'cat-sync-now': await refreshShiftState().catch(()=>{}); return syncDirty(true);
      case 'cat-refresh-shift': return refreshShiftState();
      case 'cat-reset-current-shift': return resetCurrentShift();
      case 'cat-adjust-submitted': return adjustSubmitted(message.delta);
      case 'cat-disconnect-local': return disconnectLocal();
      case 'cat-clear-today': return clearToday();
      case 'cat-diagnostic': await diag(message.state || 'info', message.message || '', message.extra || {}); return { ok: true };
      default: return { ok: false, error: 'Unknown Coverage Tracker message.' };
    }
  };
  run().then(sendResponse).catch(error => sendResponse({ ok: false, error: String(error.message || error) }));
  return true;
});

// One-time repair for phantom No-Match values created by pre-v2.2.19 rail inference.
migrateNoMatchToExplicitOnly().catch(()=>{});

})();
