/* QA-only, explicit local archive. No secret export, no database writes, no shift reset. */
(() => {
'use strict';
const STAGING = 'https://oostrinotime-staging-qa.trinoadmin.workers.dev';
const FREEZE = 'ttQaRecoveryFreezeV1';
const ARCHIVE_PREFIX = 'ttQaOnlyShiftArchiveV1_';
const workflows = [
  {label:'Coverage',path:'coverage',data:'catCoverageDataV2',pending:'catPendingTaskKeysV2',shift:'catShiftSessionV1',bridge:'catTrinoTimeBridgeV2',recent:'catRecentEventsV2',sync:'catSyncStateV2',header:'X-TT-Coverage-Bridge'},
  {label:'Confirmation',path:'confirmation',data:'cftConfirmationDataV2',pending:'cftPendingTaskKeysV2',shift:'cftShiftSessionV1',bridge:'cftTrinoTimeBridgeV2',recent:'cftRecentEventsV2',sync:'cftSyncStateV2',header:'X-TT-Confirmation-Bridge'}
];
const str = value => JSON.stringify(value);
const safeObj = value => value && typeof value==='object' && !Array.isArray(value)?value:{};
const allKeys = [...new Set([FREEZE,...workflows.flatMap(w=>[w.data,w.pending,w.shift,w.bridge,w.recent,w.sync])])];
async function verifyAndArchive(){
  const [augmotoTabs, signedTabs] = await Promise.all([
    chrome.tabs.query({url:'https://labeling-tools.augmoto.com/*'}),
    chrome.tabs.query({url:STAGING+'/*'})
  ]);
  if(augmotoTabs.length) throw Error('Close all Augmoto tabs first to prevent new activity during recovery.');
  if(!signedTabs.length)throw Error('Open TrinoTime PRODUCTION and sign in as the Agent first.');
  const initial=await chrome.storage.local.get(allKeys);
  const existing=initial[FREEZE];
  if(existing){
    const key=ARCHIVE_PREFIX+existing.sessionId;
    const saved=await chrome.storage.local.get(key);
    if(!saved[key]||saved[key].reportDate!==existing.reportDate)throw Error('Recovery archive missing. Stop; do not discard QA records.');
    for(const w of workflows){
      const sh=safeObj(initial[w.shift]),bridge=safeObj(initial[w.bridge]);
      const day=safeObj(safeObj(initial[w.data]).dates)[existing.reportDate];
      const pending=safeObj(initial[w.pending])[existing.reportDate];
      if(sh.sessionId!==existing.sessionId || sh.status!=='active')throw Error('Local shift has changed since archive. Stop and inspect.');
      if(Object.keys(safeObj(day?.jobs)).length||Object.keys(safeObj(day?.tasks)).length||pending?.length){
        // One workflow may already have recovered while the other failed. Accept only
        // server-restored records proven to belong to this same current bridge.
        const sync=safeObj(initial[w.sync]);
        if(sync.state!=='ok'||sync.lastMessage!=='Shift safely recovered'||!bridge.token||!bridge.deviceId)throw Error(w.label+': new local work appeared after archive. Do not discard it.');
        const response=await fetch(STAGING+'/api/workforce/'+w.path+'/shift-state',{headers:{Accept:'application/json',[w.header]:bridge.token},cache:'no-store'});
        const body=await response.json().catch(()=>({}));
        if(!response.ok||!body.ok||body.shift?.sessionId!==existing.sessionId||body.summary?.deviceId!==bridge.deviceId||body.summary?.recoveryPending)throw Error(w.label+': partial recovery has not been verified by the server.');
      }
    }
    return {ok:true,retry:true,archived:existing.archived};
  }
  let baseline=null;
  const summary=[];
  for(const w of workflows){
    const shift=safeObj(initial[w.shift]),bridge=safeObj(initial[w.bridge]);
    if(shift.status!=='active'||!shift.sessionId||!Number.isInteger(Number(shift.generation))||Number(shift.generation)<0||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(shift.reportDate||''))throw Error(w.label+': active shift information is incomplete.');
    if(!bridge.token||!bridge.deviceId||bridge.baseUrl!==STAGING)throw Error(w.label+': connect the production Agent bridge first.');
    const identity=String(bridge.actor?.name||'').trim().toLowerCase();
    if(!identity)throw Error(w.label+': authenticated Agent identity was not found.');
    if(!baseline)baseline={date:shift.reportDate,sessionId:shift.sessionId,generation:Number(shift.generation),identity};
    if(shift.sessionId!==baseline.sessionId||Number(shift.generation)!==baseline.generation||shift.reportDate!==baseline.date||identity!==baseline.identity)throw Error('Coverage and Confirmation must belong to the same authenticated Agent and active shift.');
    const day=safeObj(safeObj(initial[w.data]).dates)[shift.reportDate];
    const pending=safeObj(initial[w.pending])[shift.reportDate];
    if(!day || !Array.isArray(pending))throw Error(w.label+': local shift records are missing.');
    const jobs=Object.keys(safeObj(day.jobs)).length,tasks=Object.keys(safeObj(day.tasks)).length;
    if(Number(day.summary?.submitted||0)!==0||Number(day.summary?.submittedManualAdjustment||0)!==0||Number(day.summary?.interval1||0)!==0||Number(day.summary?.interval2||0)!==0||Number(day.summary?.interval3||0)!==0||Number(day.summary?.interval1ManualAdjustment||0)!==0||Number(day.summary?.interval2ManualAdjustment||0)!==0||Number(day.summary?.interval3ManualAdjustment||0)!==0)throw Error(w.label+': locally recorded submissions or manual adjustments exist. Automatic QA discard is not allowed.');
    const response=await fetch(STAGING+'/api/workforce/'+w.path+'/shift-state',{method:'GET',headers:{Accept:'application/json',[w.header]:bridge.token},cache:'no-store'});
    const server=await response.json().catch(()=>({}));
    if(!response.ok||!server.ok||server.shift?.status!=='active'||server.shift.sessionId!==shift.sessionId||Number(server.shift.generation)!==Number(shift.generation)||!server.summary?.deviceId||server.summary.deviceId===bridge.deviceId||server.summary.recoveryPending)throw Error(w.label+': shift ownership/state changed; no records archived.');
    summary.push({workflow:w.label,jobs,tasks,pending:pending.length});
  }
  const now=await chrome.storage.local.get(allKeys);
  for(const w of workflows){for(const k of [w.data,w.pending,w.shift,w.bridge])if(str(now[k])!==str(initial[k]))throw Error(w.label+': local records changed during verification. Stop Augmoto and retry.');}
  const key=ARCHIVE_PREFIX+baseline.sessionId;
  const existingArchive=(await chrome.storage.local.get(key))[key];
  if(existingArchive)throw Error('QA archive already exists for this shift; do not overwrite it.');
  const archive={savedAt:new Date().toISOString(),reportDate:baseline.date,sessionId:baseline.sessionId,generation:baseline.generation,workflowRecords:{}};
  const updates={};
  for(const w of workflows){
    archive.workflowRecords[w.label]={data:initial[w.data],pending:initial[w.pending],recent:initial[w.recent],shift:initial[w.shift],sync:initial[w.sync]};
    const original=initial[w.data];
    updates[w.data]={...original,dates:{...original.dates,[baseline.date]:{summary:{},jobs:{},tasks:{},updatedAt:0}}};
    updates[w.pending]={...initial[w.pending],[baseline.date]:[]};
  }
  const frozen={savedAt:Date.now(),sessionId:baseline.sessionId,reportDate:baseline.date,archived:summary};
  await chrome.storage.local.set({[key]:archive,[FREEZE]:frozen});
  const verify=(await chrome.storage.local.get(key))[key];
  if(str(verify)!==str(archive))throw Error('Local QA archive verification failed. Active records were NOT changed.');
  const last=await chrome.storage.local.get(allKeys);
  for(const w of workflows){for(const k of [w.data,w.pending,w.shift,w.bridge])if(str(last[k])!==str(initial[k]))throw Error('Local state changed before quarantine. Archive retained; nothing cleared.');}
  await chrome.storage.local.set(updates);
  const after=await chrome.storage.local.get(Object.keys(updates));
  for(const w of workflows){
    const day=safeObj(safeObj(after[w.data]).dates)[baseline.date];
    if(Object.keys(safeObj(day?.jobs)).length||Object.keys(safeObj(day?.tasks)).length||safeObj(after[w.pending])[baseline.date]?.length)throw Error('QA quarantine incomplete. Do not recover until reviewed.');
  }
  return {ok:true,archived:summary};
}
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  if(!message||!['tt-qa-quarantine','tt-qa-recovery-unfreeze'].includes(message.type))return;
  (async()=>{
    if(sender?.id!==chrome.runtime.id||sender?.url!==chrome.runtime.getURL('popup.html'))throw Error('Only this Tracker popup may request QA recovery.');
    if(message.type==='tt-qa-quarantine')return await verifyAndArchive();
    const data=await chrome.storage.local.get(FREEZE);
    const freeze=data[FREEZE];if(!freeze) return {ok:true,alreadyCleared:true};
    // Final server check. Never assume recovery succeeded solely because the popup received an OK.
    for(const w of workflows){
      const item=(await chrome.storage.local.get([w.shift,w.bridge]));const shift=item[w.shift],bridge=item[w.bridge];
      if(shift?.sessionId!==freeze.sessionId||!bridge?.token||!bridge?.deviceId)throw Error('Shift changed. Recovery remains frozen.');
      const response=await fetch(STAGING+'/api/workforce/'+w.path+'/shift-state',{headers:{Accept:'application/json',[w.header]:bridge.token},cache:'no-store'});
      const body=await response.json().catch(()=>({}));
      if(!response.ok||!body.ok||body.shift?.sessionId!==freeze.sessionId||body.summary?.deviceId!==bridge.deviceId||body.summary?.recoveryPending)throw Error(w.label+' has not confirmed ownership yet. Recovery remains frozen.');
    }
    await chrome.storage.local.remove(FREEZE);
    return {ok:true};
  })().then(respond).catch(e=>respond({ok:false,error:String(e.message||e)}));
  return true;
});
})();
