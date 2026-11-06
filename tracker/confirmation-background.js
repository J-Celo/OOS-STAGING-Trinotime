(() => {
const CFT = Object.freeze({
  settings: 'cftSettingsV2',
  data: 'cftConfirmationDataV2',
  bridge: 'cftTrinoTimeBridgeV2',
  device: 'cftDeviceIdV2',
  sync: 'cftSyncStateV2',
  shift: 'cftShiftSessionV1',
  recent: 'cftRecentEventsV2',
  pendingTasks: 'cftPendingTaskKeysV2',
  storeNames: 'cftStoreNamesV1',
  migration: 'cftMigratedFromTscV132',
  diagnostics: 'cftDiagnosticsV2',
  owner: 'cftLocalOwnerV1',
  archivePrefix: 'cftAgentStateV1'
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
function intervalAdjustment(summary, index) {
  const confirmed = num(summary?.['interval' + index], 1000000);
  const raw = Number(summary?.['interval' + index + 'ManualAdjustment']);
  const adjustment = Number.isFinite(raw) ? Math.trunc(raw) : 0;
  return Math.max(-confirmed, Math.min(100000, adjustment));
}
function intervalDisplay(summary, index) {
  const confirmed = num(summary?.['interval' + index], 1000000);
  return Math.max(0, confirmed + intervalAdjustment(summary, index));
}
function normalizeIntervalAdjustments(summary) {
  const target = summary && typeof summary === 'object' ? summary : blankSummary();
  let manual = 0, display = 0;
  for (const index of [1,2,3]) {
    const adjustment = intervalAdjustment(target, index);
    target['interval' + index + 'ManualAdjustment'] = adjustment;
    target['interval' + index + 'DisplayTotal'] = intervalDisplay(target, index);
    manual += adjustment;
    display += target['interval' + index + 'DisplayTotal'];
  }
  target.submitted = num(target.interval1) + num(target.interval2) + num(target.interval3);
  target.submittedManualAdjustment = submittedManual(manual);
  target.submittedDisplayTotal = Math.max(0, display);
  return target;
}
function submittedDisplay(summary) {
  return normalizeIntervalAdjustments({ ...(summary || {}) }).submittedDisplayTotal;
}
function syncSummarySnapshot(summary, settings) {
  const source = normalizeIntervalAdjustments({ ...(summary && typeof summary === 'object' ? summary : blankSummary()) });
  return {
    ...source,
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
    reportDate: /^\d{4}-\d{2}-\d{2}$/.test(raw.reportDate||'') ? raw.reportDate : dateKey(),
    syncEnabled: true
  };
}
function blankSummary() {
  return {
    interval1: 0, interval2: 0, interval3: 0,
    interval1ManualAdjustment: 0, interval2ManualAdjustment: 0, interval3ManualAdjustment: 0,
    interval1DisplayTotal: 0, interval2DisplayTotal: 0, interval3DisplayTotal: 0,
    currentInterval: 1, submitted: 0, created: 0, blurred: 0, deleted: 0, noMatch: 0,
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
  d.summary = normalizeIntervalAdjustments({ ...blankSummary(), ...(d.summary || {}), idleThresholdMs: MANAGED_IDLE_MS });
  d.jobs = d.jobs && typeof d.jobs === 'object' ? d.jobs : {};
  d.tasks = d.tasks && typeof d.tasks === 'object' ? d.tasks : {};
  return d;
}
function ensureJob(day, jobId, totalTasks = 0, ts = Date.now()) {
  jobId = String(jobId || '');
  if (!jobId) return null;
  if (!day.jobs[jobId]) {
    day.jobs[jobId] = {
      jobId, submitted: 0, created: 0, blurred: 0, deleted: 0, noMatch: 0,
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
      created: 0, blurred: 0, deleted: 0, noMatch: 0,
      activeMs: 0, idleMs: 0, awayMs: 0, searchingMs: 0, graceMs: 0, unverifiedMs: 0, elapsedMs: 0,
      submitted: false, skipped: false, status: 'active',
      trackerState: 'active', lastActivityAt: ts, idleSinceAt: 0, awaySinceAt: 0, idleThresholdMs: MANAGED_IDLE_MS,
      startedAt: ts, endedAt: 0, updatedAt: ts
    };
  }
  const t = day.tasks[key];
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
    await chrome.storage.local.set({ [CFT.storeNames]: bounded });
    setTimeout(()=>syncStoreMappingMetadata().catch(()=>{}),350);
    if (shiftIsActive(core)) {
      await chrome.storage.local.set({ [CFT.data]: core.data, [CFT.pendingTasks]: core.pending });
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
    const token=String(bridge.token),url=`${bridge.baseUrl}/api/workforce/confirmation/store-observations`;
    const {response,body}=await trackerSyncRequest(url,{method:'POST',
      headers:{'Content-Type':'application/json',Accept:'application/json','X-TT-Confirmation-Bridge':token},
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
      await chrome.storage.local.set({[CFT.storeNames]:map});
    });
    return {ok:true,accepted:rows.length};
  })().catch(error=>({ok:false,error:String(error?.message||error)}))
     .finally(()=>{storeMappingSyncInFlight=null;});
  return storeMappingSyncInFlight;
}
async function readCore() {
  const r = await chrome.storage.local.get([CFT.settings, CFT.data, CFT.recent, CFT.pendingTasks, CFT.bridge, CFT.device, CFT.sync, CFT.shift, CFT.storeNames]);
  return {
    settings: cleanSettings(r[CFT.settings]),
    data: r[CFT.data] && typeof r[CFT.data] === 'object' ? r[CFT.data] : blankData(),
    recent: Array.isArray(r[CFT.recent]) ? r[CFT.recent] : [],
    pending: r[CFT.pendingTasks] && typeof r[CFT.pendingTasks] === 'object' ? r[CFT.pendingTasks] : {},
    bridge: r[CFT.bridge] && typeof r[CFT.bridge] === 'object' ? r[CFT.bridge] : null,
    device: String(r[CFT.device] || ''),
    sync: r[CFT.sync] && typeof r[CFT.sync] === 'object' ? r[CFT.sync] : {},
    shift: cleanShift(r[CFT.shift]),
    storeNames: r[CFT.storeNames] && typeof r[CFT.storeNames] === 'object' ? r[CFT.storeNames] : {}
  };
}

function cleanShift(raw){const source=raw&&typeof raw==='object'?raw:{},status=['active','completed','not_clocked_in'].includes(String(source.status||''))?String(source.status):'not_clocked_in';return{sessionId:String(source.sessionId||'').slice(0,80),generation:Math.max(0,Math.floor(Number(source.generation)||0)),status,locked:status!=='active',reportDate:/^\d{4}-\d{2}-\d{2}$/.test(String(source.reportDate||''))?String(source.reportDate):'',startedAt:source.startedAt?String(source.startedAt):null,startedAtMs:epochMs(source.startedAtMs),endedAt:source.endedAt?String(source.endedAt):null,endedAtMs:epochMs(source.endedAtMs),lockedAt:source.lockedAt?String(source.lockedAt):null,resetAt:source.resetAt?String(source.resetAt):null,resetBy:source.resetBy?String(source.resetBy):null};}
function shiftIsActive(core){return core?.shift?.status==='active'&&Boolean(core.shift.sessionId);}
function reportDateForCore(core){return core?.shift?.reportDate||core?.settings?.reportDate||dateKey();}
function localSummaryHasActivity(summary){const s=summary||{};return ['interval1','interval2','interval3','submitted','activeMs','idleMs','awayMs','searchingMs','graceMs','unverifiedMs','elapsedMs'].some(k=>num(s[k])>0);}
function applyAuthoritativeConfirmationSummary(day,remote){if(!remote||typeof remote!=='object')return;const s=day.summary={...blankSummary(),...day.summary};for(const key of ['interval1','interval2','interval3','activeMs','idleMs','awayMs','searchingMs','graceMs','unverifiedMs','elapsedMs','currentTask','totalTasks','lastActivityAt','idleSinceAt','awaySinceAt','presenceUpdatedAt','clientSequence'])if(remote[key]!==undefined)s[key]=num(remote[key],Number.MAX_SAFE_INTEGER);for(const i of [1,2,3])s[`interval${i}ManualAdjustment`]=Number.isFinite(Number(remote[`interval${i}ManualAdjustment`]))?Math.trunc(Number(remote[`interval${i}ManualAdjustment`])):0;s.currentInterval=[1,2,3].includes(Number(remote.currentInterval))?Number(remote.currentInterval):1;s.currentJob=String(remote.currentJob||'');s.pendingSubmission=remote.pendingSubmission===true;s.trackerState=trackerState(remote.trackerState,'offline');normalizeIntervalAdjustments(s);}
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

function adoptShiftIntoConfirmationCore(core,rawShift,authoritativeSummary=null){const previous=cleanShift(core.shift),next=cleanShift(rawShift);const date=next.reportDate||previous.reportDate||core.settings.reportDate||dateKey();next.reportDate=date;const identityChanged=previous.sessionId!==next.sessionId||Number(previous.generation)!==Number(next.generation);core.settings.reportDate=date;if(identityChanged){preserveUnackedShiftSnapshot(core,previous,previous.reportDate||date,'shift-identity-changed');if((previous.reportDate||date)!==date&&core.pending[date]?.length)preserveUnackedShiftSnapshot(core,{...previous,sessionId:'pre-existing-day'},date,'date-slot-replaced');core.data.dates[date]=blankDate();core.pending[date]=[];}const day=ensureDate(core.data,date);if(next.status!=='active'&&!identityChanged)preserveUnackedShiftSnapshot(core,previous,date,'shift-locked');if(authoritativeSummary&&(identityChanged||next.status!=='active'||!localSummaryHasActivity(day.summary)))applyAuthoritativeConfirmationSummary(day,authoritativeSummary);if(next.status!=='active'){day.summary.pendingSubmission=false;day.summary.trackerState='offline';day.summary.currentJob='';day.summary.currentTask=0;day.summary.totalTasks=0;core.pending[date]=[];}core.shift=next;return{shift:next,date,day,identityChanged};}
async function persistConfirmationShiftCore(core){await chrome.storage.local.set({[CFT.shift]:core.shift,[CFT.settings]:core.settings,[CFT.data]:core.data,[CFT.pendingTasks]:core.pending});}

function localOwnerIdentity(value){return String(value||'').trim().toLowerCase();}
function identityArchiveKey(identity){return `${CFT.archivePrefix}:${encodeURIComponent(localOwnerIdentity(identity)).slice(0,160)}`;}
async function archiveConfirmationIdentity(owner,core){
  const identity=localOwnerIdentity(owner);if(!identity)return;
  await chrome.storage.local.set({[identityArchiveKey(identity)]:{schemaVersion:1,owner:identity,savedAt:Date.now(),data:core.data,recent:core.recent,pending:core.pending,shift:core.shift,sync:core.sync}});
}
async function prepareConfirmationIdentity(core,nextIdentity){
  const identity=localOwnerIdentity(nextIdentity);if(!identity)throw new Error('TrinoTime did not return a valid Agent identity.');
  const r=await chrome.storage.local.get(CFT.owner),previousOwner=localOwnerIdentity(r[CFT.owner]);
  const ownerChanged=Boolean(previousOwner&&previousOwner!==identity);
  if(ownerChanged){
    await archiveConfirmationIdentity(previousOwner,core);
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
  return{identity,previousOwner,ownerChanged};
}

function queue(fn) { writeChain = writeChain.then(fn, fn); return writeChain; }
function pendingAdd(pending, date, key) {
  const set = new Set(Array.isArray(pending[date]) ? pending[date] : []);
  if (key) set.add(key);
  pending[date] = [...set].slice(-5000);
}
function prune(data) {
  const keys = Object.keys(data.dates || {}).sort().reverse();
  for (const k of keys.slice(MAX_DAYS)) delete data.dates[k];
}
async function diag(state, message, extra = {}) {
  const r = await chrome.storage.local.get(CFT.diagnostics);
  const m = r[CFT.diagnostics] && typeof r[CFT.diagnostics] === 'object' ? r[CFT.diagnostics] : {};
  m.last = { state, message, timestamp: Date.now(), ...extra };
  await chrome.storage.local.set({ [CFT.diagnostics]: m });
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
    if(!shiftIsActive(core))return {ok:true,frozen:true,shift:core.shift};
    const eventId = String(event.eventId || '');
    if (/^submit-(pending|confirmed|cancelled)$/.test(String(event.type||'')) &&
        event.shiftSessionId &&
        (String(event.shiftSessionId)!==String(core.shift.sessionId||'') ||
         Number(event.shiftGeneration)!==Number(core.shift.generation)||
         String(event.date||'')!==String(reportDateForCore(core))))
      return {ok:false,frozen:true,error:'Submission belongs to a different shift; no task was changed.'};
    if (eventId && core.recent.includes(eventId)) return { ok: true, duplicate: true };

    const ts = epochMs(event.timestamp) || Date.now();
    const date = reportDateForCore(core);
    const day = ensureDate(core.data, date);
    const s = day.summary;
    const jobId = String(event.jobId || s.currentJob || '');
    const ti = num(event.taskIndex || s.currentTask, 100000);
    const tt = num(event.totalTasks || s.totalTasks, 100000);

    const eventType = String(event.type || '');
    // Late receipts for an earlier task update that task's totals, not the
    // currently displayed task header. The active task comes from task-start.
    const delayedReceipt = eventType === 'submit-pending' || eventType === 'submit-cancelled' || eventType === 'submit-confirmed';
    if (jobId && !delayedReceipt) { s.currentJob = jobId; s.currentTask = ti; s.totalTasks = tt || s.totalTasks; }
    const presenceNeutral = eventType === 'job-open' || eventType === 'job-clear';
    // Job visibility events must not reset the inactivity boundary. Confirmation
    // presence is driven by explicit cft-presence/cft-time messages, just like Coverage.
    if (!presenceNeutral) applyPresenceFields(s, { ...event, lastActivityAt: event.lastActivityAt || ts }, ts);

    const job = jobId ? ensureJob(day, jobId, tt, ts) : null;
    const task = jobId && ti ? ensureTask(day, jobId, ti, tt, ts) : null;
    if (task && !presenceNeutral) applyPresenceFields(task, event, ts);

    let deltaKey = '';
    switch (eventType) {
      case 'job-open':
        // Live Augmoto Confirmation header state. This updates Current Job/Task
        // without changing interval totals, presence timing, or submission history.
        break;
      case 'job-clear':
        s.currentJob = ''; s.currentTask = 0; s.totalTasks = 0;
        break;
      case 'task-start':
        if (task) {
          task.status = 'active'; task.updatedAt = ts;
          job.lastTask = Math.max(num(job.lastTask), ti); job.status = 'active';
          pendingAdd(core.pending, date, taskKey(jobId, ti));
        }
        break;
      case 'created': deltaKey = 'created'; break;
      case 'blurred': deltaKey = 'blurred'; break;
      case 'deleted': deltaKey = 'deleted'; break;
      case 'no-match-add': deltaKey = 'noMatch'; break;
      case 'no-match-remove':
        if (task && task.noMatch > 0) {
          task.noMatch--; if (job && job.noMatch > 0) job.noMatch--; if (s.noMatch > 0) s.noMatch--;
          pendingAdd(core.pending, date, taskKey(jobId, ti));
        }
        break;
      case 'submit-pending':
        if (task && !task.submitted) task.submitPending = true;
        s.pendingSubmission = Object.values(day.tasks).some(t=>t.submitPending===true);
        if (s.pendingSubmission) s.pendingSinceAt = ts;
        if (task) { if (!task.submitted) task.status = 'active'; task.interval = task.interval || s.currentInterval; task.updatedAt = ts; pendingAdd(core.pending, date, taskKey(jobId, ti)); }
        break;
      case 'submit-cancelled':
        if(task)task.submitPending=false;
        s.pendingSubmission = Object.values(day.tasks).some(t=>t.submitPending===true);
        if (task && !task.submitted) delete task.interval;
        if (task) { task.updatedAt = ts; pendingAdd(core.pending, date, taskKey(jobId, ti)); }
        break;
      case 'submit-confirmed':
        if (task && !task.submitted) {
          if(num(task.efficiencyMs)>0){s.efficiencyTaskCount=num(s.efficiencyTaskCount)+1;s.efficiencyActiveMs=num(s.efficiencyActiveMs)+num(task.efficiencyMs);}
          task.submitted = true; task.status = 'submitted'; task.endedAt = ts; task.updatedAt = ts;
          task.interval = task.interval || s.currentInterval;
          s['interval'+task.interval]++; normalizeIntervalAdjustments(s); if (job) job.submitted++;
        }
        if(task)task.submitPending=false;
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
        // Returning to the Confirmation jobs/queue page is immediate IDLE while
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
    prune(core.data);
    if (eventId) core.recent.push(eventId);
    core.recent = core.recent.slice(-MAX_RECENT_EVENTS);

    await chrome.storage.local.set({ [CFT.data]: core.data, [CFT.recent]: core.recent, [CFT.pendingTasks]: core.pending });


    const fastTypes = new Set(['job-open', 'job-clear', 'task-start', 'created', 'blurred', 'deleted', 'no-match-add', 'no-match-remove', 'submit-pending', 'submit-cancelled', 'submit-confirmed', 'skip-confirmed', 'task-exit']);
    scheduleSyncSoon(fastTypes.has(String(event.type || '')) ? 250 : 1200);
    return { ok: true, date, interval:task?.interval || s.currentInterval };
  });
}

async function leaveMode(){return queue(async()=>{const core=await readCore();if(!shiftIsActive(core))return{ok:true,frozen:true,shift:core.shift};const ts=Date.now(),date=reportDateForCore(core),day=ensureDate(core.data,date),s=day.summary,task=day.tasks[taskKey(s.currentJob,s.currentTask)];if(task&&!task.submitted){task.status='exited';task.updatedAt=ts;pendingAdd(core.pending,date,taskKey(s.currentJob,s.currentTask));}s.pendingSubmission=false;s.currentJob='';s.currentTask=0;s.totalTasks=0;applyPresenceFields(s,{trackerState:'paused',presenceUpdatedAt:ts},ts);s.clientSequence=num(s.clientSequence)+1;day.updatedAt=ts;pendingAdd(core.pending,date,SUMMARY_PENDING_KEY);await chrome.storage.local.set({[CFT.data]:core.data,[CFT.pendingTasks]:core.pending});scheduleSyncSoon(250);return{ok:true};});}
async function applyEfficiencyTime(payload){return queue(async()=>{const core=await readCore();if(!shiftIsActive(core))return{ok:true,frozen:true,shift:core.shift};const eventId=String(payload.eventId||'');if(!eventId||core.recent.includes(eventId))return{ok:true,duplicate:true};const date=reportDateForCore(core),ts=epochMs(payload.timestamp)||Date.now();if(!payload.jobId||!Number(payload.taskIndex))return{ok:false,error:'Invalid measured task.'};const day=ensureDate(core.data,date),task=ensureTask(day,String(payload.jobId),num(payload.taskIndex),num(payload.totalTasks),ts);if(!task.submitted)task.efficiencyMs=num(task.efficiencyMs)+num(payload.activeMs,5000);core.recent.push(eventId);core.recent=core.recent.slice(-MAX_RECENT_EVENTS);day.summary.clientSequence=num(day.summary.clientSequence)+1;pendingAdd(core.pending,date,taskKey(payload.jobId,payload.taskIndex));pendingAdd(core.pending,date,SUMMARY_PENDING_KEY);await chrome.storage.local.set({[CFT.data]:core.data,[CFT.recent]:core.recent,[CFT.pendingTasks]:core.pending});scheduleSyncSoon(1200);return{ok:true};});}

async function applyPresence(payload){return queue(async()=>{const core=await readCore();if(!shiftIsActive(core))return{ok:true,frozen:true,shift:core.shift};const ts=epochMs(payload.timestamp)||Date.now(),date=reportDateForCore(core),day=ensureDate(core.data,date),s=day.summary,jobId=payload.trackerState==='searching'?'':String(payload.jobId||s.currentJob||''),ti=num(payload.taskIndex||s.currentTask,100000),tt=num(payload.totalTasks||s.totalTasks,100000);if(jobId){s.currentJob=jobId;s.currentTask=ti;s.totalTasks=tt||s.totalTasks;}applyPresenceFields(s,payload,ts);const job=jobId?ensureJob(day,jobId,tt,ts):null,task=jobId&&ti?ensureTask(day,jobId,ti,tt,ts):null;if(job)job.lastSeenAt=ts;if(task){applyPresenceFields(task,payload,ts);task.updatedAt=ts;pendingAdd(core.pending,date,taskKey(jobId,ti));}pendingAdd(core.pending,date,SUMMARY_PENDING_KEY);day.updatedAt=ts;s.clientSequence=num(s.clientSequence)+1;await chrome.storage.local.set({[CFT.data]:core.data,[CFT.pendingTasks]:core.pending});scheduleSyncSoon(350);return{ok:true};});}

async function applyTime(payload){return queue(async()=>{const core=await readCore();if(!shiftIsActive(core))return{ok:true,frozen:true,shift:core.shift};const ts=epochMs(payload.timestamp)||Date.now(),date=reportDateForCore(core),day=ensureDate(core.data,date),s=day.summary,jobId=payload.trackerState==='searching'?'':String(payload.jobId||s.currentJob||''),ti=num(payload.taskIndex||s.currentTask,100000),tt=num(payload.totalTasks||s.totalTasks,100000),active=num(payload.activeMs,60000),idle=num(payload.idleMs,60000),away=num(payload.awayMs,60000),searching=num(payload.searchingMs,60000),grace=num(payload.graceMs,60000),unverified=num(payload.unverifiedMs,60000),elapsed=num(payload.elapsedMs,60000);if(jobId){s.currentJob=jobId;s.currentTask=ti;s.totalTasks=tt||s.totalTasks;}s.activeMs+=active;s.idleMs+=idle;s.awayMs+=away;s.searchingMs=num(s.searchingMs)+searching;s.graceMs=num(s.graceMs)+grace;s.unverifiedMs=num(s.unverifiedMs)+unverified;s.elapsedMs+=elapsed;applyPresenceFields(s,payload,ts);const j=jobId?ensureJob(day,jobId,tt,ts):null,t=jobId&&ti?ensureTask(day,jobId,ti,tt,ts):null;if(j){j.activeMs+=active;j.idleMs+=idle;j.awayMs+=away;j.searchingMs=num(j.searchingMs)+searching;j.graceMs=num(j.graceMs)+grace;j.unverifiedMs=num(j.unverifiedMs)+unverified;j.elapsedMs+=elapsed;j.lastTask=Math.max(num(j.lastTask),ti);j.lastSeenAt=ts;}if(t){t.activeMs+=active;t.idleMs+=idle;t.awayMs+=away;t.searchingMs=num(t.searchingMs)+searching;t.graceMs=num(t.graceMs)+grace;t.unverifiedMs=num(t.unverifiedMs)+unverified;t.elapsedMs+=elapsed;applyPresenceFields(t,payload,ts);t.updatedAt=ts;pendingAdd(core.pending,date,taskKey(jobId,ti));}pendingAdd(core.pending,date,SUMMARY_PENDING_KEY);day.updatedAt=ts;s.clientSequence=num(s.clientSequence)+1;await chrome.storage.local.set({[CFT.data]:core.data,[CFT.pendingTasks]:core.pending});scheduleSyncSoon(1200);return{ok:true};});}

async function ensureDevice() {
  // Keep the same bound device when Chrome preserves the bridge but loses the
  // redundant device-key entry. Never silently rebind existing work to a new id.
  const keys=await chrome.storage.local.get([CFT.device,CFT.bridge,CFT.data,CFT.pendingTasks]);
  const stored=String(keys[CFT.device]||'').trim();
  if(stored) return stored;
  const bridge=keys[CFT.bridge];
  const prior=String(bridge?.deviceId||'').trim();
  if(prior && prior.length<=120 && /^[a-zA-Z0-9_-]+$/.test(prior) && bridge?.token && bridge?.actor?.name) {
    await chrome.storage.local.set({[CFT.device]:prior});
    return prior;
  }
  const dates=Object.values(keys[CFT.data]?.dates||{});
  const hasHistory=dates.some(day=>
    Boolean(Object.keys(day?.tasks||{}).length||Object.keys(day?.jobs||{}).length||
      Number(day?.summary?.submitted)>0||Number(day?.summary?.activeMs)>0||
      Number(day?.summary?.elapsedMs)>0));
  const hasPending=Object.values(keys[CFT.pendingTasks]||{}).some(rows=>Array.isArray(rows)&&rows.length>0);
  if(hasHistory||hasPending) throw new Error('Original Tracker device identity is missing, while local work remains. Do not reset or reinstall. Contact Admin for verified recovery.');
  const device=crypto.randomUUID();
  await chrome.storage.local.set({[CFT.device]:device});
  return device;
}
async function pairTrinoTime(preferredTabId=0){
  const device=await ensureDevice(),initialCore=await readCore(),fallbackDate=initialCore.settings.reportDate||dateKey(),tabs=await chrome.tabs.query({}),candidates=tabs.filter(tab=>{try{return Boolean(tab?.id)&&new URL(String(tab.url||'')).origin===TRINOTIME;}catch(_){return false;}}),tab=candidates.find(t=>Number(t.id)===Number(preferredTabId))||candidates.find(t=>t.active)||candidates[0];
  if(!tab?.id)throw new Error('Open TrinoTime production in a tab and sign in as the QA Agent first.');
  const result=await chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',func:async(deviceId,expectedOrigin,defaultDate)=>{const wait=ms=>new Promise(r=>setTimeout(r,ms));if(location.origin!==expectedOrigin)throw new Error('The selected tab is not the TrinoTime production site.');const authHeaders=async()=>{const headers={Accept:'application/json','Content-Type':'application/json'},securityToken=String(window.TrinoTimeMessagingSessionContext?.getSecuritySessionToken?.()||'');if(securityToken)headers['X-TT-Security-Session']=securityToken;else{try{const user=window.firebase?.auth?.().currentUser;if(user&&!user.isAnonymous&&typeof user.getIdToken==='function')headers.Authorization=`Bearer ${await user.getIdToken(false)}`;}catch(_){}}return headers;};let pair=null;for(let i=0;i<16;i++){if(window.TrinoTimeConfirmationBridge?.issueToken){pair=await window.TrinoTimeConfirmationBridge.issueToken({deviceId,deviceName:'Confirmation Activity Tracker · production · Chrome'});break;}await wait(250);}const headers=await authHeaders();if(!pair){if(!headers['X-TT-Security-Session']&&!headers.Authorization)throw new Error('The TrinoTime production secure session is not ready yet. Refresh the production tab, wait for the QA Agent profile to load, then try Connect again.');const response=await fetch('/api/workforce/confirmation/bridge-token',{method:'POST',headers,credentials:'same-origin',cache:'no-store',body:JSON.stringify({deviceId,deviceName:'Confirmation Activity Tracker · production · Chrome'})});pair=await response.json().catch(()=>({}));if(!response.ok)throw new Error(pair?.message||`Confirmation pairing returned ${response.status}.`);}const date=pair?.shift?.reportDate||defaultDate;let snapshot=null;try{if(headers['X-TT-Security-Session']||headers.Authorization){const response=await fetch(`/api/workforce/confirmation/agent?date=${encodeURIComponent(date)}`,{method:'GET',headers,credentials:'same-origin',cache:'no-store'});const data=await response.json().catch(()=>({}));if(response.ok&&data?.ok)snapshot=data;}}catch(_){}return{pair,snapshot};},args:[device,TRINOTIME,fallbackDate]});
  const bundle=result?.[0]?.result||{},value=bundle.pair||bundle;if(!value?.ok||!value.bridgeToken)throw new Error(value?.message||'TrinoTime production did not issue a Confirmation bridge token.');
  const bridge={baseUrl:TRINOTIME,token:String(value.bridgeToken),expiresAt:String(value.expiresAt||''),expiresAtMs:epochMs(value.expiresAtMs),actor:value.actor||null,deviceId:device,connectedAt:Date.now(),lastSyncAt:0},snapshot=bundle.snapshot&&typeof bundle.snapshot==='object'?bundle.snapshot:null;
  let shift=value.shift||{status:'not_clocked_in',reportDate:fallbackDate},authoritativeSummary=snapshot?.summary||null;
  if(!authoritativeSummary){try{const response=await fetch(`${bridge.baseUrl}/api/workforce/confirmation/shift-state`,{method:'GET',headers:{Accept:'application/json','X-TT-Confirmation-Bridge':bridge.token},cache:'no-store'}),body=await response.json().catch(()=>({}));if(response.ok&&body?.ok){shift=body.shift||shift;authoritativeSummary=body.summary||null;}}catch(_){}}
  const {adopted,identityState}=await queue(async()=>{
  const core=await readCore(),identityState=await prepareConfirmationIdentity(core,value.actor?.name);
  const adopted=adoptShiftIntoConfirmationCore(core,shift,authoritativeSummary),day=adopted.day,localHasActivity=localSummaryHasActivity(day.summary)||Object.keys(day.tasks||{}).length>0||Object.keys(day.jobs||{}).length>0;
  if(!localHasActivity&&snapshot?.summary){applyAuthoritativeConfirmationSummary(day,snapshot.summary);day.jobs={};for(const job of Array.isArray(snapshot.jobs)?snapshot.jobs:[])if(job?.jobId)day.jobs[String(job.jobId)]={...job};day.tasks={};for(const task of Array.isArray(snapshot.tasks)?snapshot.tasks:[])if(task?.jobId&&task?.taskIndex)day.tasks[taskKey(task.jobId,task.taskIndex)]={...task};}
  core.bridge=bridge;if(adopted.shift.status==='active')core.pending[adopted.date]=[...Object.keys(day.tasks),SUMMARY_PENDING_KEY];else core.pending[adopted.date]=[];
  await chrome.storage.local.set({[CFT.data]:core.data,[CFT.settings]:core.settings,[CFT.bridge]:bridge,[CFT.pendingTasks]:core.pending,[CFT.shift]:adopted.shift,[CFT.recent]:core.recent,[CFT.sync]:core.sync,[CFT.owner]:identityState.identity});
  return {adopted,identityState};
  });
  await diag(identityState.ownerChanged?'identity-handoff':'connected',`Connected to TrinoTime production as ${value.actor?.name||'Agent'}.`,{actor:value.actor||null,previousOwner:identityState.previousOwner||null,shift:adopted.shift});
  if(adopted.shift.status==='active')await syncDirty(true);
  return{ok:true,bridge,shift:adopted.shift,restoredFromServer:Boolean(authoritativeSummary),identityChanged:identityState.ownerChanged};
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
  },args:['confirmation',stage,bridge.deviceId,bridge.token,shift.sessionId,shift.generation,recoveryId,TRINOTIME]});
  const response=result?.[0]?.result;
  if(!response?.ok)throw new Error(response?.message||'The recovery response could not be verified.');
  return response;
}
function trackerRecoveryHasLocalWork(day){
  const s=day?.summary||{};
  const counters=['interval1','interval2','interval3','submitted','created','blurred','deleted','noMatch'];
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
    const checkpoint=(await chrome.storage.local.get('cftRecoveryCheckpointV1'))['cftRecoveryCheckpointV1'];
    if(checkpoint?.recoveryId&&checkpoint.shiftSessionId===core.shift.sessionId&&checkpoint.deviceId===core.bridge.deviceId){
      const tabs=await chrome.tabs.query({});
      const tab=tabs.find(t=>{try{return t.id&&new URL(String(t.url||'')).origin===TRINOTIME;}catch(_){return false;}});
      if(!tab?.id)throw new Error('Open TrinoTime production and sign in to complete the pending recovery acknowledgment.');
      await trackerRecoveryCall(tab.id,'ack',core,checkpoint.recoveryId);
      await chrome.storage.local.remove('cftRecoveryCheckpointV1');
      syncBackoffUntil=0;syncFailureCount=0;syncFollowUpRequested=false;
      await chrome.storage.local.set({[CFT.sync]:{state:'ok',lastSyncAt:Date.now(),lastMessage:'Shift safely recovered',lastError:''}});
      return {ok:true,resumedPendingRecovery:true};
    }
    // A previous click can finish one workflow while the other still needs recovery.
    // Verify the server still recognizes this device before treating that workflow as done.
    if(core.sync?.state==='ok'&&core.sync?.lastMessage==='Shift safely recovered'){
      const response=await fetch(`${core.bridge.baseUrl}/api/workforce/confirmation/shift-state`,{headers:{Accept:'application/json','X-TT-Confirmation-Bridge':core.bridge.token},cache:'no-store'});
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
      await chrome.storage.local.set({[`cftPreRecoveryBackupV1`]:{savedAt:Date.now(),shift:latest.shift,data:latest.data,pending:latest.pending}});
      latest.data.dates[date]=blankDate();
      const restored=ensureDate(latest.data,date);
      if(result.summary)applyAuthoritativeConfirmationSummary(restored,result.summary);
      if(result.summary){
        // Restore metric baselines that the regular shift-state lightweight adoption
        // intentionally does not hydrate. This prevents post-handoff metric resets.
        for(const key of ['efficiencyTaskCount','efficiencyActiveMs','created','blurred','deleted','noMatch','awayTimingAvailable']){
          if(result.summary[key]!==undefined)restored.summary[key]=key==='awayTimingAvailable'?result.summary[key]===true:num(result.summary[key]);
        }
        if(result.summary.currentStoreName)restored.summary.currentStoreName=String(result.summary.currentStoreName);
      }
      for(const job of jobs){if(job?.jobId)restored.jobs[String(job.jobId)]={...job};}
      for(const task of tasks){if(task?.jobId&&task?.taskIndex)restored.tasks[taskKey(task.jobId,task.taskIndex)]={...task};}
      restored.summary.pendingSubmission=false;
      restored.summary.trackerState='ready';
      restored.summary.currentJob='';restored.summary.currentTask=0;restored.summary.totalTasks=0;
      // Pending server-job rewrites are forbidden: these rows already exist server-side.
      latest.pending[date]=[];
      latest.shift=remoteShift;
      await chrome.storage.local.set({[CFT.data]:latest.data,[CFT.pendingTasks]:latest.pending,[CFT.shift]:latest.shift,[CFT.sync]:{state:'recovering',lastMessage:'Restored, awaiting server handoff confirmation',lastError:''}});
      if(result.recoveryId)await chrome.storage.local.set({'cftRecoveryCheckpointV1':{recoveryId:result.recoveryId,shiftSessionId:remoteShift.sessionId,deviceId:core.bridge.deviceId,at:Date.now()}});
      return {restoredJobs:jobs.length,restoredTasks:tasks.length};
    });
    if(result.recoveryId){await trackerRecoveryCall(tab.id,'ack',core,result.recoveryId);}
    await chrome.storage.local.remove('cftRecoveryCheckpointV1');
    syncBackoffUntil=0;syncFailureCount=0;syncFollowUpRequested=false;
    await chrome.storage.local.set({[CFT.sync]:{state:'ok',lastSyncAt:Date.now(),lastMessage:'Shift safely recovered',lastError:''}});
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
  const {response,body}=await trackerSyncRequest(`${bridge.baseUrl}/api/workforce/confirmation/shift-state`,{
    method:'GET',headers:{Accept:'application/json','X-TT-Confirmation-Bridge':bridge.token},cache:'no-store'});
  if(!response.ok){const error=new Error(body?.message||`Shift state returned ${response.status}.`);error.status=response.status;throw error;}
  if(body?.ok!==true||!body.shift||!['active','completed','not_clocked_in'].includes(body.shift.status))throw new Error('Invalid shift state response; local work preserved.');
  return queue(async()=>{
    const latest=await readCore();assertSyncContext(latest,core);
    const adopted=adoptShiftIntoConfirmationCore(latest,body.shift,body.summary||null);
    await persistConfirmationShiftCore(latest);
    return {ok:true,shift:adopted.shift,summary:adopted.day.summary,sessionChanged:adopted.identityChanged};
  });
}
async function handleTrinoTimeSessionEnding(){
  const syncResult=await syncDirty(true).catch(error=>({ok:false,error:String(error?.message||error)}));
  return queue(async()=>{
    const core=await readCore(),owner=localOwnerIdentity((await chrome.storage.local.get(CFT.owner))[CFT.owner]);
    const date=reportDateForCore(core),day=ensureDate(core.data,date);
    day.summary.pendingSubmission=false;day.summary.trackerState='offline';day.summary.currentJob='';day.summary.currentTask=0;day.summary.totalTasks=0;
    if(core.shift.status==='active')core.shift={...core.shift,status:'not_clocked_in',locked:true};
    core.bridge=null;
    await archiveConfirmationIdentity(owner,core);
    await chrome.storage.local.set({[CFT.data]:core.data,[CFT.settings]:core.settings,[CFT.shift]:core.shift,[CFT.pendingTasks]:core.pending,[CFT.sync]:{...(core.sync||{}),state:'idle',lastMessage:'TrinoTime signed out · connection cleared',lastError:''}});
    await chrome.storage.local.remove(CFT.bridge);
    await diag('session-ended','TrinoTime Agent signed out. Confirmation tracking was frozen and the local bridge was cleared.',{owner:owner||null,syncBeforeDisconnect:Boolean(syncResult?.ok)});
    return{ok:true,frozen:true,owner:owner||null,syncBeforeDisconnect:Boolean(syncResult?.ok)};
  });
}

async function disconnectLocal() {

  await chrome.storage.local.remove(CFT.bridge);
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
    await chrome.storage.local.set({[CFT.data]:latest.data,[CFT.pendingTasks]:latest.pending});
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
    await chrome.storage.local.set({[CFT.sync]:{...latest.sync,sequenceProofCheckedAt:Date.now()}});
  });
  const {response,body}=await trackerSyncRequest(`${bridge.baseUrl}/api/workforce/confirmation/sequence-resume-proof`,{
    method:'POST',headers:{Accept:'application/json','Content-Type':'application/json','X-TT-Confirmation-Bridge':bridge.token},
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
    await chrome.storage.local.set({[CFT.data]:latest.data,[CFT.pendingTasks]:latest.pending,
      [CFT.sync]:{...latest.sync,state:'pending',errorCode:'',lastError:'',
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
    if((await chrome.storage.local.get('cftRecoveryCheckpointV1'))['cftRecoveryCheckpointV1'])return {ok:false,recovering:true};
    let core=await readCore();attemptContext=core;
    if(!core.bridge?.token||core.settings.syncEnabled===false)return {ok:false,skipped:true};
    if(!shiftIsActive(core)) {
      const refreshed=await refreshShiftState().catch(()=>null);
      core=await readCore();attemptContext=core;
      if(!shiftIsActive(core))return {ok:true,locked:true,shift:core.shift,refreshed:Boolean(refreshed)};
      if(!core.bridge?.token)return {ok:false,skipped:true};
    }
    if(['TRACKER_SEQUENCE_CONFLICT','TRACKER_SEQUENCE_RESUME_CHANGED','CONFIRMATION_DEVICE_CONFLICT','TRACKER_RECOVERY_PENDING'].includes(core.sync?.errorCode) &&
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
    if(expiry&&expiry<Date.now()+5000){const error=new Error('TrinoTime Confirmation bridge expired. Reconnect from the extension popup.');error.status=401;throw error;}
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
    const {response,body}=await trackerSyncRequest(`${bridge.baseUrl}/api/workforce/confirmation/sync`,{
      method:'POST',headers:{Accept:'application/json','Content-Type':'application/json','X-TT-Confirmation-Bridge':bridge.token},
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
        adoptShiftIntoConfirmationCore(latest,body.shift,body.summary||null);await persistConfirmationShiftCore(latest);
        await chrome.storage.local.set({[CFT.sync]:{state:'ok',lastAttemptAt:Date.now(),
          lastMessage:body.locked?'Shift locked; verify archived pending work':'New shift detected; verify archived pending work',lastError:''}});
      });
      return {ok:true,locked:Boolean(body.locked),sessionChanged:Boolean(body.sessionChanged),shift:body.shift};
    }
    if(body?.stale===true){
      const resumed=await trackerSequenceResumeSafe(core).catch(()=>false);
      if(resumed){syncFollowUpRequested=true;return {ok:false,sequenceResumePending:true};}
      const error=new Error('TrinoTime reports a conflicting Confirmation sequence. Local pending work is preserved; reconcile this shift before retrying.');
      error.code='TRACKER_SEQUENCE_CONFLICT';throw error;
    }
    if(body?.ok!==true||body?.accepted!==true||Number(body.acceptedSequence)!==num(day.summary.clientSequence)||
       body.shift?.sessionId!==core.shift.sessionId||Number(body.shift?.generation)!==Number(core.shift.generation)||body.shift?.status!=='active' ||
       (!body.duplicate&&(Number(body.tasksAccepted)!==tasks.length||Number(body.jobsAccepted)!==jobs.length)))
      throw new Error('Unverified Confirmation sync acknowledgment. Local pending records preserved.');
    await queue(async()=>{
      const latest=await readCore();assertSyncContext(latest,core);
      const pending=latest.pending,latestDay=ensureDate(latest.data,date),remove=new Set(keys);
      pending[date]=(Array.isArray(pending[date])?pending[date]:[]).filter(k=>{
        if(!remove.has(k))return true;
        if(k===SUMMARY_PENDING_KEY)return JSON.stringify(syncSummarySnapshot(latestDay.summary,latest.settings))!==summaryVersion;
        return JSON.stringify(latestDay.tasks?.[k]||null)!==taskVersions[k];
      });
      const syncedAt=Date.now();
      await chrome.storage.local.set({[CFT.pendingTasks]:pending,[CFT.bridge]:{...latest.bridge,lastSyncAt:syncedAt},
        [CFT.sync]:{state:'ok',lastSyncAt:syncedAt,lastAttemptAt:syncedAt,lastMessage:`Live sync ${date}`,lastError:'',acceptedSequence:Number(body.acceptedSequence),verifiedAckAt:syncedAt,verifiedAckSessionId:core.shift.sessionId,verifiedAckGeneration:core.shift.generation}});
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
      const deviceConflict=failureCode==='CONFIRMATION_DEVICE_CONFLICT';
      const conflict=['TRACKER_SEQUENCE_CONFLICT','TRACKER_SEQUENCE_RESUME_CHANGED','CONFIRMATION_DEVICE_CONFLICT','TRACKER_RECOVERY_PENDING'].includes(failureCode);
      const blocked=authFailure||conflict;
      syncFailureCount=blocked?0:Math.min(6,syncFailureCount+1);
      const retryDelay=blocked?0:Math.min(60000,2500*Math.pow(2,Math.max(0,syncFailureCount-1)));
      syncBackoffUntil=retryDelay?Date.now()+retryDelay:0;
      await chrome.storage.local.set({[CFT.sync]:{state:'error',lastAttemptAt:Date.now(),
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

async function adjustInterval(interval,delta){return queue(async()=>{const core=await readCore();if(!shiftIsActive(core))return{ok:false,frozen:true,error:'Time In is required. Completed shift totals are locked.',shift:core.shift};const index=Number(interval),step=Math.trunc(Number(delta)||0);if(![1,2,3].includes(index)||![-1,1].includes(step))throw new Error('Choose Interval 1, 2, or 3 and use + or − one.');const date=reportDateForCore(core),day=ensureDate(core.data,date),s=day.summary,key=`interval${index}ManualAdjustment`,confirmed=num(s[`interval${index}`],1000000),current=intervalAdjustment(s,index),next=Math.max(-confirmed,Math.min(100000,current+step));s[key]=next;normalizeIntervalAdjustments(s);s.clientSequence=num(s.clientSequence)+1;day.updatedAt=Date.now();pendingAdd(core.pending,date,SUMMARY_PENDING_KEY);await chrome.storage.local.set({[CFT.data]:core.data,[CFT.pendingTasks]:core.pending});scheduleSyncSoon(250);return{ok:true,interval:index,adjustment:next,confirmed,total:intervalDisplay(s,index),eod:s.submittedDisplayTotal};});}

async function selectReport(date,interval){return queue(async()=>{const core=await readCore();if(![1,2,3].includes(Number(interval)))throw new Error('Choose Interval 1, 2 or 3.');const authoritativeDate=reportDateForCore(core);if(core.shift?.sessionId&&date!==authoritativeDate)throw new Error('The EOD date is locked to the current TrinoTime shift.');if(!shiftIsActive(core))return{ok:false,frozen:true,error:'Time In is required before changing the active interval.',shift:core.shift};if(Object.values(core.data.dates||{}).some(d=>d.summary?.pendingSubmission&&Date.now()-(d.summary.pendingSinceAt||0)<120000))throw new Error('Wait for the pending submission to finish before switching.');core.settings.reportDate=authoritativeDate;const day=ensureDate(core.data,authoritativeDate);day.summary.currentInterval=Number(interval);day.summary.clientSequence++;pendingAdd(core.pending,authoritativeDate,SUMMARY_PENDING_KEY);await chrome.storage.local.set({[CFT.settings]:core.settings,[CFT.data]:core.data,[CFT.pendingTasks]:core.pending});scheduleSyncSoon(350);return{ok:true,date:authoritativeDate};});}

async function importConfirmationBackup(backup) {
  return queue(async () => {
    if(syncInFlight) throw new Error('Wait for the current sync to finish, then import again.');
    if(backup?.format!=='trinotime-confirmation-local-v1'||!backup.data?.dates||typeof backup.device!=='string'||!backup.device||backup.device.length>120) throw new Error('Choose a valid Confirmation backup.');
    const core=await readCore();
    if(Object.values(core.data.dates||{}).some(d=>Number(d.summary?.submitted)>0)) throw new Error('This tracker already has Confirmation counts. Import is blocked to avoid replacing them.');
    const owner=(await chrome.storage.local.get(CFT.owner))[CFT.owner];
    if(owner&&backup.owner&&owner!==backup.owner) throw new Error('This backup belongs to another Agent. Use their Chrome profile.');
    const entries=Object.entries(backup.data.dates);
    if(entries.length>MAX_DAYS) throw new Error('Backup exceeds the local history limit.');
    const pending={};
    for(const [date,day] of entries){
      if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!day?.summary||!day.tasks||!day.jobs) throw new Error('Invalid report in backup.');
      const s=day.summary;
      if(![s.interval1,s.interval2,s.interval3,s.submitted].every(n=>Number.isSafeInteger(n)&&n>=0)||s.interval1+s.interval2+s.interval3!==s.submitted) throw new Error('Backup interval totals do not match EOD.');
      if(![1,2,3].includes(s.currentInterval)) throw new Error('Invalid saved interval.');
      s.pendingSubmission=false;
      pending[date]=[...Object.keys(day.tasks),SUMMARY_PENDING_KEY];
    }
    await chrome.storage.local.set({[CFT.data]:backup.data,[CFT.settings]:cleanSettings(backup.settings),[CFT.device]:backup.device,[CFT.recent]:Array.isArray(backup.recent)?backup.recent.slice(-MAX_RECENT_EVENTS):[],[CFT.pendingTasks]:pending,[CFT.sync]:{},[CFT.owner]:String(backup.owner||'')});
    await chrome.storage.local.remove(CFT.bridge);
    return {ok:true};
  });
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

async function context(){const core=await readCore(),today=reportDateForCore(core),day=ensureDate(core.data,today);return{origin:AUGMOTO,settings:core.settings,today,summary:normalizeIntervalAdjustments({...day.summary}),jobs:day.jobs,tasks:day.tasks,bridge:core.bridge,sync:{...core.sync,unresolvedShiftArchives:Object.values(core.data.shiftArchivesV1||{}).filter(a=>a?.requiresManualReconciliation).length},shift:core.shift,trackingLocked:!shiftIsActive(core),managedIdlePolicy:{minutes:MANAGED_IDLE_MINUTES,milliseconds:MANAGED_IDLE_MS},diagnostics:(await chrome.storage.local.get(CFT.diagnostics))[CFT.diagnostics]||null,syncHealth:syncHealthSnapshot(core)};}

async function updateSettings(patch) {
  return queue(async () => {
    const r = await chrome.storage.local.get(CFT.settings);
    const next = cleanSettings({...cleanSettings(r[CFT.settings]), ...(typeof patch?.hudExpanded === 'boolean' ? {hudExpanded:patch.hudExpanded} : {})});
    await chrome.storage.local.set({[CFT.settings]:next});
    return next;
  });
}

async function clearToday() {
  return { ok: false, error: 'Managed Confirmation mode does not allow Agents to clear today’s tracked activity.' };
}

// Re-check the fallback alarm whenever Chrome revives the extension worker.
// Chrome may clear alarms across some browser restarts; a one-minute fallback
// limits network load while normal event-driven uploads remain much faster.
chrome.alarms.get('cft-sync').then(existing => {
  if (!existing) return chrome.alarms.create('cft-sync', {periodInMinutes:1});
}).catch(() => {});

const availabilityWake = TrinoTimeAvailabilityCore.create({
  readCore, refreshShift: refreshShiftState, sync: () => syncDirty(false)
});

chrome.runtime.onInstalled.addListener(async () => {
  await ensureDevice();
  const r = await chrome.storage.local.get(CFT.settings);
  await chrome.storage.local.set({ [CFT.settings]: cleanSettings(r[CFT.settings] || defaultSettings()) });

  chrome.alarms.create('cft-sync', { periodInMinutes: 1 });
  refreshShiftState().then(()=>syncDirty(false)).catch(() => {});
  syncStoreMappingMetadata().catch(()=>{});
  try {
    const tabs = await chrome.tabs.query({ url: `${AUGMOTO}/*` });
    await Promise.allSettled(tabs.filter(t => t.id).map(t => chrome.scripting.executeScript({ target: { tabId: t.id }, files: ['tracker-availability.js','search-presence.js','activity-integrity.js','workflow-coordinator.js','job-mode.js','task-efficiency.js','hud-appearance.js','store-intelligence.js','coverage.js','confirmation.js'] })));
  } catch (_) {}
});
chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create('cft-sync', { periodInMinutes: 1 });
  refreshShiftState().then(()=>syncDirty(false)).catch(() => {});
  syncStoreMappingMetadata().catch(()=>{});

  chrome.storage.local.get(CFT.settings).then(r => chrome.storage.local.set({ [CFT.settings]: cleanSettings(r[CFT.settings] || defaultSettings()) })).catch(() => {});
});
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === 'cft-sync') { refreshShiftState().then(()=>syncDirty(false)).catch(() => {}); syncStoreMappingMetadata().catch(()=>{}); } });
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !String(message.type || '').startsWith('cft-')) return;
  const run = async () => {
    switch (message.type) {
      case 'cft-availability-resume':
        if (!sender?.tab?.id || !String(sender.url || '').startsWith(`${AUGMOTO}/`)) return {ok:false, denied:true};
        return availabilityWake(message.reason === 'online' ? 'online' : 'resume');
      case 'cft-context': return context();
      case 'cft-mode-leave': return leaveMode();
      case 'cft-efficiency-time': return applyEfficiencyTime(message.payload||{});
      case 'cft-import-backup': return importConfirmationBackup(message.backup);
      case 'cft-store-observed': return rememberObservedStores(message.stores);
      case 'cft-event': return applyEvent(message.event || {});
      case 'cft-presence': return applyPresence(message.payload || {});
      case 'cft-time': return applyTime(message.payload || {});
      case 'cft-settings': return { ok: true, settings: await updateSettings(message.patch || {}) };
      case 'cft-pair-trinotime': return pairTrinoTime(Number(message.preferredTabId)||Number(sender?.tab?.id)||0);
      case 'cft-session-ending': return handleTrinoTimeSessionEnding();
      case 'cft-recover-shift': return recoverCurrentShift();
      case 'cft-sync-now': await refreshShiftState().catch(()=>{}); return syncDirty(true);
      case 'cft-refresh-shift': return refreshShiftState();
      case 'cft-select-report': return selectReport(message.date, message.interval);
      case 'cft-adjust-interval': return adjustInterval(message.interval, message.delta);
      case 'cft-disconnect-local': return disconnectLocal();
      case 'cft-clear-today': return clearToday();
      case 'cft-diagnostic': await diag(message.state || 'info', message.message || '', message.extra || {}); return { ok: true };
      default: return { ok: false, error: 'Unknown Confirmation Tracker message.' };
    }
  };
  run().then(sendResponse).catch(error => sendResponse({ ok: false, error: String(error.message || error) }));
  return true;
});

})();
