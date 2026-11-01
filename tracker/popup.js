const $=id=>document.getElementById(id);
const CONNECT_LABEL='Connect both to TrinoTime';
const CONNECTED_LABEL='Reconnect both';
try { const manifestVersion=chrome.runtime?.getManifest?.().version; if(manifestVersion) $('trackerVersion').textContent='v'+manifestVersion; } catch (_) { /* Fallback label stays visible. */ }

function setMode(mode){
 const card=$('modeCard'),pill=$('modePill');
 card.dataset.mode=mode||'none';
 if(mode==='coverage'){$('mode').textContent='Coverage';pill.textContent='ACTIVE';return;}
 if(mode==='confirmation'){$('mode').textContent='Confirmation';pill.textContent='ACTIVE';return;}
 if(mode==='none'){$('mode').textContent='Select a QC task in Augmoto';pill.textContent='PAUSED';return;}
 $('mode').textContent='Open Augmoto to detect the selected job';pill.textContent='READY';
}


function fmtAgo(ms){
 const n=Number(ms)||0;if(!n)return 'not synced';const sec=Math.max(0,Math.round((Date.now()-n)/1000));if(sec<5)return 'just now';if(sec<60)return sec+'s ago';return Math.round(sec/60)+'m ago';
}
function fmtHealthTime(ts){const n=Number(ts);return Number.isFinite(n)&&n>0?fmtAgo(n):'not confirmed';}
function trackerConflictRequiresReview(sync){
 const code=String(sync?.errorCode||'');
 return sync?.state==='recovering'||['COVERAGE_DEVICE_CONFLICT','CONFIRMATION_DEVICE_CONFLICT','TRACKER_RECOVERY_PENDING','TRACKER_SEQUENCE_CONFLICT','TRACKER_SEQUENCE_RESUME_CHANGED'].includes(code)||
  /another browser|recovery pending|finish shift recovery/i.test(String(sync?.lastError||''));
}
function healthLine(workflow,ctx){
 const s=ctx?.sync||{},h=ctx?.syncHealth;
 if(!h)return {state:'unknown',pending:'Pending unknown',lastAck:'Last accepted: unknown',detail:'No local status returned'};
 const pending=Number(h.pendingTasks)||0,meta=Number(h.pendingSummaries)||0,archives=Number(h.unresolvedArchives)||0,mappingPending=Number(h.mappingPending)||0;
 const connected=Boolean(ctx?.bridge?.token);
 const error=s.state==='error'||s.state==='recovering';
 const state=error?'error':!connected?'disconnected':pending||meta||mappingPending?'pending':h.lastVerifiedAckAt?'synced':'waiting';
 const stateLabel=error?'Attention':!connected?'Not connected':pending||meta||mappingPending?'Pending':h.lastVerifiedAckAt?'Accepted':'Awaiting sync';
 const lastAck='Last accepted: '+fmtHealthTime(h.lastVerifiedAckAt);
 const pendingLabel=`${pending} task${pending===1?'':'s'} pending${meta?' · '+meta+' summary update'+(meta===1?'':'s'):''}${mappingPending?' · '+mappingPending+' store mapping'+(mappingPending===1?'':'s')+' awaiting server ACK':''}`;
 let detail=workflow+': '+stateLabel+'; '+pendingLabel+'.';
 if(h.mappingAckAt)detail+=' Latest accepted store mapping: '+fmtHealthTime(h.mappingAckAt)+'.';
 if(error){
   const errorCode=String(s.errorCode||'').replace(/[^A-Z0-9_-]/gi,'').slice(0,64);
   if(errorCode)detail+=' Code: '+errorCode+'.';
   detail+=' '+String(s.lastError||s.lastMessage||'Sync requires attention').slice(0,180);
   if(trackerConflictRequiresReview(s))detail+=' Automatic retries paused for this shift/device. Do not reset or reinstall; verify pending work before authenticated recovery.';
 }
 if(h.pendingDates>1)detail+=' Includes '+h.pendingDates+' report dates.';
 if(archives)detail+=' '+archives+' archived shift'+(archives===1?' needs':'s need')+' reconciliation.';
 if(h.retryAt&&h.retryAt>Date.now())detail+=' Automatic retry scheduled.';
 return {state,stateLabel,pending:pendingLabel,lastAck,detail};
}
function renderSyncHealth(coverage,confirmation){
 const cSync=coverage?.sync||{},fSync=confirmation?.sync||{};
 const c=healthLine('Coverage',coverage),f=healthLine('Confirmation',confirmation);
 const mismatch=Boolean(coverage?.bridge?.token && confirmation?.bridge?.token && String(coverage.bridge.actor?.name||'').trim().toLowerCase()!==String(confirmation.bridge.actor?.name||'').trim().toLowerCase());
 const state=(!coverage||!confirmation||mismatch)?'error':[c,f].some(x=>x.state==='error')?'error':[c,f].some(x=>x.state==='pending')?'pending':[c,f].every(x=>x.state==='synced')?'synced':'waiting';
 const titles={error:'CHECK',pending:'PENDING',synced:'ACCEPTED',waiting:'WAITING'};
 const panel=$('syncHealthPanel');if(panel)panel.dataset.state=state;
 const deviceConflict=[cSync,fSync].some(item=>['COVERAGE_DEVICE_CONFLICT','CONFIRMATION_DEVICE_CONFLICT'].includes(String(item?.errorCode||'')));
 $('syncHealthPill').textContent=titles[state];
 $('syncHealthOverview').textContent=mismatch?'Coverage and Confirmation are linked to different accounts. Reconnect both.':state==='synced'?'No pending local work; server acknowledged both workflows.':state==='pending'?'Local submissions await verified TrinoTime acknowledgement.':state==='error'?'Sync requires attention. Local pending records are preserved.':'Connection and server acknowledgement are separate checks.';
 if(deviceConflict)$('syncHealthOverview').textContent='Device conflict: the server rejected sync for an active shift. Pending work stays local. Do not reset or reinstall. Recovery may need administrator reconciliation.';
 $('coverageSync').textContent=c.stateLabel;$('confirmationSync').textContent=f.stateLabel;
 $('coveragePending').textContent=c.pending;$('confirmationPending').textContent=f.pending;
 $('coverageAck').textContent=c.lastAck;$('confirmationAck').textContent=f.lastAck;
 $('syncHealthDetails').textContent=c.detail+'\n'+f.detail+'\nSource: local Tracker queues and verified sync responses; no live Augmoto job inventory.';
 const conflict=[cSync,fSync].some(trackerConflictRequiresReview);
 const recover=$('recoverShift'),help=$('recoveryHelp');if(recover){recover.hidden=!conflict;help.hidden=!conflict;}
}


function renderShift(coverage,confirmation){
 const shift=coverage?.shift||confirmation?.shift||{status:'not_clocked_in'};
 const state=String(shift.status||'not_clocked_in');
 const card=$('shiftCard'),pill=$('shiftPill'),reset=$('resetShift');if(!card)return;card.dataset.state=state;
 if(state==='active'){ $('shiftTitle').textContent='Shift tracking active'; pill.textContent='ACTIVE'; const started=shift.startedAt?new Date(shift.startedAt).toLocaleString():''; $('shiftMeta').textContent=`${shift.reportDate||'Current shift'}${started?` · Time In ${started}`:''} · OT continues until Time Out`; }
 else if(state==='completed'){ $('shiftTitle').textContent='Shift completed · totals locked';pill.textContent='LOCKED';const ended=shift.endedAt?new Date(shift.endedAt).toLocaleString():'';$('shiftMeta').textContent=`${shift.reportDate||'Completed shift'}${ended?` · Time Out ${ended}`:''} · Next Time In starts at 0`; }
 else{$('shiftTitle').textContent='Time In required';pill.textContent='WAITING';$('shiftMeta').textContent='Tracker will begin a fresh session after TrinoTime Time In.';}
 if(reset){const conflict=[coverage?.sync,confirmation?.sync].some(trackerConflictRequiresReview);reset.disabled=state!=='active'||!coverage?.bridge?.token||conflict;reset.textContent=state==='completed'?'Shift Locked':'Reset Current Shift';reset.title=conflict?'Disabled during device conflict. Use Recover This Shift instead of resetting counters.':'';}
}

function setConnectionVisual(state,title,pill,detail){
 const panel=$('connectionPanel');if(!panel)return;
 panel.dataset.state=state;
 $('connectionTitle').textContent=title;
 $('connectionPill').textContent=pill;
 $('connectionSubtitle').textContent=detail;
}
function setConnectState(connected){
 const button=$('connect');
 const label=$('connectLabel');
 button.dataset.connected=connected?'true':'false';
 button.classList.toggle('isConnected',connected);
 label.textContent=connected?CONNECTED_LABEL:CONNECT_LABEL;
 button.title=connected?'Reconnect both STAGING QA bridges when needed.':'Connect Coverage and Confirmation to TrinoTime STAGING QA.';
 setConnectionVisual(connected?'connected':'disconnected',connected?'Connected to both':'Not connected',connected?'CONNECTED':'CONNECT', 'Coverage + Confirmation · STAGING QA');
}

async function refreshConnectionState({announce=true}={}){
 try{
  const [coverage,confirmation]=await Promise.all([
   chrome.runtime.sendMessage({type:'cat-context'}),
   chrome.runtime.sendMessage({type:'cft-context'})
  ]);
  const coverageConnected=Boolean(coverage?.bridge?.token);
  const confirmationConnected=Boolean(confirmation?.bridge?.token);
  const coverageAgent=String(coverage?.bridge?.actor?.name||'').trim();
  const confirmationAgent=String(confirmation?.bridge?.actor?.name||'').trim();
  const identitiesMatch=!coverageConnected||!confirmationConnected||coverageAgent.toLowerCase()===confirmationAgent.toLowerCase();
  const both=coverageConnected&&confirmationConnected&&identitiesMatch;
  setConnectState(both);
  if(both){
   setConnectionVisual('connected','Connected to both','CONNECTED',`Agent · ${coverageAgent||confirmationAgent||'signed in'} · STAGING QA`);
  }else if(coverageConnected&&confirmationConnected&&!identitiesMatch){
   setConnectionVisual('error','Account mismatch','CHECK', 'Reconnect both workflows with the same TrinoTime Agent account');
  }else if(coverageConnected||confirmationConnected){
   setConnectionVisual('partial','Connection incomplete','PARTIAL',`Coverage ${coverageConnected?'connected':'not connected'} · Confirmation ${confirmationConnected?'connected':'not connected'}`);
  }
  renderSyncHealth(coverage,confirmation);
  // STAGING QA Submit journey: captured clicks are not completed tasks.
  // Only per-task, verified server receipts may be labeled acknowledged.
  try {
   const key='catSubmitAttemptsV2259';
   const entries=(await chrome.storage.local.get(key))[key];
   const shift=coverage?.shift||{},actor=coverage?.bridge?.actor||{};
   const owner=actor.pod&&actor.name?`${actor.pod}|${actor.name}`:'';
   const myAttempts=(Array.isArray(entries)?entries:[]).filter(x=>owner&&
     x.owner===owner&&x.sessionId===shift.sessionId&&x.date===shift.reportDate&&
     Number(x.generation)===Number(shift.generation));
   const captured=myAttempts.filter(x=>x.status==='captured').length;
   const pending=myAttempts.filter(x=>x.status==='confirmed_pending_sync').length;
   const accepted=myAttempts.filter(x=>x.status==='acknowledged').length;
   const unverified=myAttempts.filter(x=>x.status==='unverified').length;
   if(myAttempts.length) {
    $('syncHealthDetails').textContent+=`\nCoverage Submit journey (this shift): ${captured} captured / awaiting evidence · ${pending} completion verified / waiting for server · ${accepted} server acknowledged · ${unverified} unverified. A captured click does not count as a completed task.`;
   }
   if(captured||unverified){
    const panel=$('syncHealthPanel');
    if(panel && panel.dataset.state==='synced'){
      panel.dataset.state=captured?'pending':'error';
      $('syncHealthPill').textContent=captured?'REVIEW':'CHECK';
      $('syncHealthOverview').textContent='Submit attempts need verification. Sync success does not prove every click was accepted.';
    }
   }
  }catch(_) { /* read-only status display cannot block connections */ }
  // QA-only local diagnostics for explicit Coverage Submit clicks which could
  // not be verified. Never treat these as completed submissions or sync ACKs.
  try {
   const raw=await chrome.storage.local.get('catUnverifiedSubmissionsV1');
   const shift=coverage?.shift||{};
   const unresolved=(Array.isArray(raw.catUnverifiedSubmissionsV1)?raw.catUnverifiedSubmissionsV1:[])
    .filter(item=>item.reviewStatus==='unverified' && item.shiftSessionId &&
       item.shiftSessionId===shift.sessionId && item.reportDate===shift.reportDate).length;
   if(unresolved){
    $('syncHealthDetails').textContent+='\nCoverage: '+unresolved+' Submit attempt'+(unresolved===1?'':'s')+' could not be verified in this shift. These are NOT counted submissions; report for QA review.';
    const panel=$('syncHealthPanel'); if(panel && panel.dataset.state==='synced'){
     panel.dataset.state='error';$('syncHealthPill').textContent='REVIEW';
     $('syncHealthOverview').textContent='Submission detection needs review. A successful sync does not verify every Submit attempt.';
    }
   }
  } catch (_) { /* diagnostics must not block connection status */ }
  renderShift(coverage,confirmation);
  if(announce){
   if(both)$('status').textContent='Both workflows linked to the same Agent.';
   else if(coverageConnected&&confirmationConnected&&!identitiesMatch)$('status').textContent=`Identity mismatch blocked: Coverage ${coverageAgent||'unknown'} · Confirmation ${confirmationAgent||'unknown'}. Reconnect from the current TrinoTime Agent session.`;
   else if(coverageConnected||confirmationConnected)$('status').textContent=`Coverage ${coverageConnected?'connected':'not connected'} · Confirmation ${confirmationConnected?'connected':'not connected'}.`;
  }
  return both;
 }catch(_){
  setConnectState(false);
  setConnectionVisual('error','Unable to check connection','RETRY','Open TrinoTime STAGING QA and try Connect both');
  renderSyncHealth(null,null);
  if(announce)$('status').textContent='Connection check failed. Your local Tracker data is preserved.';
  return false;
 }
}

(async()=>{
 try{
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  const r=tab?.id?await chrome.tabs.sendMessage(tab.id,{type:'tt-qc-mode'}):null;
  setMode(r?.mode||'none');
 }catch(_){setMode('ready');}
})();
Promise.allSettled([chrome.runtime.sendMessage({type:'cat-refresh-shift'}),chrome.runtime.sendMessage({type:'cft-refresh-shift'})]).finally(()=>refreshConnectionState().catch(()=>{}));

$('connect').onclick=async()=>{
 const button=$('connect');
 const wasConnected=button.dataset.connected==='true';
 button.disabled=true;
 $('status').textContent=wasConnected?'Refreshing both TrinoTime STAGING QA connections…':'Connecting Coverage and Confirmation to TrinoTime STAGING QA…';
 try{
  const a=await chrome.runtime.sendMessage({type:'cat-pair-trinotime'});if(!a?.ok)throw Error(a?.error||'Coverage connection failed');
  const b=await chrome.runtime.sendMessage({type:'cft-pair-trinotime'});if(!b?.ok)throw Error('STAGING QA Coverage connected. Confirmation: '+(b?.error||'connection failed'));
  await refreshConnectionState({announce:true});
 }catch(e){
  $('status').textContent=e.message;
  await refreshConnectionState({announce:false});
 }finally{
  button.disabled=false;
 }
};


const recoverButton=$('recoverShift');
if(recoverButton)recoverButton.onclick=async()=>{
 if(!confirm('Recover this active TrinoTime shift using your authenticated signed-in Agent account? This transfers ownership to the new Tracker and restores the server-recorded counts and jobs. Do not work in Augmoto during recovery. Unsubmitted local task/job work cannot be merged automatically. No shift reset will occur.'))return;
 recoverButton.disabled=true;$('status').textContent='Verifying identity and recovering Coverage and Confirmation…';
 try{
  const coverage=await chrome.runtime.sendMessage({type:'cat-recover-shift'});
  if(!coverage?.ok)throw new Error('Coverage recovery: '+(coverage?.error||'Failed.'));
  const confirmation=await chrome.runtime.sendMessage({type:'cft-recover-shift'});
  if(!confirmation?.ok)throw new Error('Coverage recovered. Confirmation recovery: '+(confirmation?.error||'Failed. You can retry safely.'));
  $('status').textContent='Shift recovered: both workflows restored without resetting server totals. ✓';
  await refreshConnectionState({announce:false});
 }catch(error){$('status').textContent=String(error.message||error);await refreshConnectionState({announce:false});}
 finally{recoverButton.disabled=false;}
};

const resetShiftButton=$('resetShift');
if(resetShiftButton)resetShiftButton.onclick=async()=>{
 if(resetShiftButton.disabled)return;
 if(!confirm('Reset Current Shift tracking? This clears the live Coverage + Confirmation counters for this active shift. The reset is recorded in TrinoTime audit history and does NOT Time Out the Agent.'))return;
 if(!confirm('Confirm Reset Current Shift? The current shift counters will restart from zero.'))return;
 resetShiftButton.disabled=true;$('status').textContent='Resetting current shift…';
 try{const r=await chrome.runtime.sendMessage({type:'cat-reset-current-shift'});if(!r?.ok)throw Error(r?.error||'Reset failed.');await chrome.runtime.sendMessage({type:'cft-refresh-shift'}).catch(()=>{});await chrome.runtime.sendMessage({type:'cat-refresh-shift'}).catch(()=>{});$('status').textContent='Current shift reset to zero. Reset was recorded in TrinoTime audit history.';}catch(e){$('status').textContent=e.message;}finally{await refreshConnectionState({announce:false});}
};

$('backup').onchange=async()=>{
 try{
  const file=$('backup').files[0];if(!file)return;if(file.size>20*1024*1024)throw Error('Backup is too large.');
  const r=await chrome.runtime.sendMessage({type:'cft-import-backup',backup:JSON.parse(await file.text())});
  if(!r?.ok)throw Error(r?.error||'Import failed');
  $('status').textContent='Confirmation history imported. Disable the separate Confirmation extension, then connect both trackers.';
  await refreshConnectionState({announce:false});
 }catch(e){$('status').textContent=e.message;}
};


const syncBothButton=$('syncBoth');
if(syncBothButton)syncBothButton.onclick=async()=>{
 const b=syncBothButton;b.disabled=true;$('status').textContent='Syncing Coverage and Confirmation…';
 try{
  const [coverage,confirmation]=await Promise.all([
   chrome.runtime.sendMessage({type:'cat-sync-now'}),
   chrome.runtime.sendMessage({type:'cft-sync-now'})
  ]);
  if(!coverage?.ok||!confirmation?.ok)throw Error(`Coverage: ${coverage?.error||'OK'} · Confirmation: ${confirmation?.error||'OK'}`);
  $('status').textContent=coverage?.synced===1&&confirmation?.synced===1?'Both workflows received verified TrinoTime acknowledgments.':coverage?.locked||confirmation?.locked?'Shift locked; no new work was uploaded. Check Sync Health.':'Sync check complete. See Sync Health for pending work and server acceptance.';
  await refreshConnectionState({announce:false});
 }catch(e){$('status').textContent=e.message;await refreshConnectionState({announce:false});}
 finally{b.disabled=false;}
};
if(typeof setInterval==='function')setInterval(()=>refreshConnectionState({announce:false}).catch(()=>{}),5000);
