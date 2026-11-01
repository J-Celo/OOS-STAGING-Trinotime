/* Popup-only guided QA recovery. Download first, then authenticated handoff; no automated deletion. */
(() => {
'use strict';
const panel=document.getElementById('qaRecoveryPanel');
if(!panel)return;
const $=id=>document.getElementById(id);
const configs=[
 {name:'Coverage',data:'catCoverageDataV2',pending:'catPendingTaskKeysV2',shift:'catShiftSessionV1',sync:'catSyncStateV2',recent:'catRecentEventsV2',stores:'catStoreNamesV1'},
 {name:'Confirmation',data:'cftConfirmationDataV2',pending:'cftPendingTaskKeysV2',shift:'cftShiftSessionV1',sync:'cftSyncStateV2',recent:'cftRecentEventsV2',stores:'cftStoreNamesV1'}
];
const keys=[...new Set(configs.flatMap(x=>[x.data,x.pending,x.shift,x.sync,x.recent,x.stores]))];
let exported=false,running=false;
function message(text){$('qaRecoveryMessage').textContent=text;}
function safe(o){return o&&typeof o==='object'&&!Array.isArray(o)?o:{};}
async function state(){
 const data=await chrome.storage.local.get(keys);
 const counts=configs.map(c=>{
   const shift=safe(data[c.shift]),day=safe(safe(data[c.data]).dates)[shift.reportDate],pending=safe(data[c.pending])[shift.reportDate];
   return {workflow:c.name,shift:shift.status||'unknown',date:shift.reportDate||'',jobs:Object.keys(safe(day?.jobs)).length,tasks:Object.keys(safe(day?.tasks)).length,pending:Array.isArray(pending)?pending.length:0,sync:safe(data[c.sync]).state||'unknown'};
 });
 return {data,counts};
}
async function refresh(){
 if(running)return;
 try{const r=await state();$('qaRecoveryCounts').textContent=r.counts.map(c=>`${c.workflow}: ${c.jobs} local jobs · ${c.tasks} tasks · ${c.pending} pending`).join('\n');
 const [c,f]=await Promise.all([chrome.runtime.sendMessage({type:'cat-context'}),chrome.runtime.sendMessage({type:'cft-context'})]);
 const conflict=[c?.sync,f?.sync].some(s=>/another browser|recovery pending|finish shift recovery/i.test(s?.lastError||''));
 $('qaRecoveryState').textContent=conflict?'Previous-device conflict detected. The server history is protected.': 'If a previous Tracker owned your shift, connect both workflows and tap Sync both now; then use recovery if a conflict appears.';
 $('qaRecoveryConsent').disabled=!exported;
 $('qaRecoveryRun').disabled=!exported||!$('qaRecoveryConsent').checked;
 }catch(e){message('Cannot read local status: '+e.message);}
}
$('qaRecoveryBackup').onclick=async()=>{
 try{
  const {data,counts}=await state();
  const file={type:'TrinoTime PRODUCTION Tracker local backup (no bridge tokens)',savedAt:new Date().toISOString(),extensionVersion:'2.3.10',counts,storage:data};
  const blob=new Blob([JSON.stringify(file,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='TrinoTime-Tracker-PRODUCTION-private-backup-'+Date.now()+'.json';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
  exported=true;$('qaRecoveryConsent').disabled=false;
  message('Private backup download requested ('+blob.size+' bytes). Verify the file is saved before checking the QA-only consent box.');
 }catch(e){message('Backup failed: '+e.message);}
};
$('qaRecoveryConsent').onchange=()=>{$('qaRecoveryRun').disabled=!exported||!$('qaRecoveryConsent').checked||running;};
$('qaRecoveryRun').onclick=async()=>{
 if(!exported||!$('qaRecoveryConsent').checked||running)return;
 if(!confirm('PRODUCTION ONLY: Archive local unsynced QA activity privately (do NOT submit those records), then restore the existing server shift and transfer device ownership? This cannot recover discarded QA work automatically. Confirm the private backup exists before continuing.'))return;
 running=true;$('qaRecoveryRun').disabled=true;$('qaRecoveryBackup').disabled=true;
 const older=$('recoverShift');if(older)older.disabled=true;
 try{
   message('Verifying both shifts and archiving QA-only local activity…');
   const prepared=await chrome.runtime.sendMessage({type:'tt-qa-quarantine'});
   if(!prepared?.ok)throw Error(prepared?.error||'Safe QA archive rejected.');
   message('QA archive verified. Recovering Coverage and Confirmation from the existing server…');
   const coverage=await chrome.runtime.sendMessage({type:'cat-recover-shift'});
   if(!coverage?.ok)throw Error('Coverage: '+(coverage?.error||'Recovery failed.'));
   const confirmation=await chrome.runtime.sendMessage({type:'cft-recover-shift'});
   if(!confirmation?.ok)throw Error('Confirmation: '+(confirmation?.error||'Recovery failed.'));
   const verified=await chrome.runtime.sendMessage({type:'tt-qa-recovery-unfreeze'});
   if(!verified?.ok)throw Error('Recovery pending verification: '+(verified?.error||'Unknown status'));
   message('✓ Both workflows recovered. Server history was preserved; archived QA-only local records were not uploaded.');
 }catch(e){message('RECOVERY STOPPED: '+e.message+'\nKeep the backup and this extension. You may retry after checking the problem; do not reset your shift.');}
 finally{running=false;$('qaRecoveryBackup').disabled=false;if(older)older.disabled=false;await refresh();}
};
$('qaRecoveryDetails').addEventListener('toggle',()=>{if($('qaRecoveryDetails').open)refresh();});
refresh();
})();
