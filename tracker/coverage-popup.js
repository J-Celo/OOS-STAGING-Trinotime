const $=id=>document.getElementById(id);
let ctx=null,busy=false,timer=null;
function fmt(ms){const total=Math.floor((Number(ms)||0)/1000),h=Math.floor(total/3600),m=Math.floor((total%3600)/60),s=total%60;return h?`${h}h ${String(m).padStart(2,'0')}m`:`${m}m`;}
function fmtLive(ms){const total=Math.max(0,Math.floor((Number(ms)||0)/1000)),h=Math.floor(total/3600),m=Math.floor((total%3600)/60),s=total%60;return h?`${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`:`${m}:${String(s).padStart(2,'0')}`;}
function status(text){$('status').textContent=text;}

function submittedView(summary){
  const confirmed=Math.max(0,Number(summary?.submitted)||0);
  const manualRaw=Number(summary?.submittedManualAdjustment);
  const manual=Number.isFinite(manualRaw)?Math.trunc(manualRaw):0;
  return {confirmed,manual,total:Math.max(0,confirmed+manual)};
}
async function msg(type,extra={}){return await chrome.runtime.sendMessage({type,...extra});}
function refreshLiveIdle(){const s=ctx?.summary||{},state=String(s.trackerState||'').toLowerCase(),idleSince=Number(s.idleSinceAt)||0,awaySince=Number(s.awaySinceAt)||0,box=$('liveIdle'),val=$('liveIdleValue');if(state==='idle'&&idleSince){box.hidden=false;box.firstChild.textContent='Live idle ';val.textContent=fmtLive(Date.now()-idleSince);}else if(state==='away'&&awaySince){box.hidden=false;box.firstChild.textContent='Away ';val.textContent=fmtLive(Date.now()-awaySince);}else box.hidden=true;}

function setPopupCompact(compact){
  const on=!!compact;
  document.documentElement.classList.toggle('compact',on);
  document.body.classList.toggle('compact',on);
  const summary=$('compactSummary');
  if(summary) summary.hidden=!on;
  const btn=$('popupToggle');
  if(btn){
    btn.title=on?'Expand tracker panel':'Minimize tracker panel';
    btn.setAttribute('aria-label',btn.title);
    btn.textContent=on?'+':'−';
  }
  const secondary=$('popupToggleSecondary');
  if(secondary) secondary.textContent=on?'Expand panel':'Minimize panel';
  // Force an immediate popup reflow so Chromium/Brave recalculates the action-popup size.
  document.documentElement.style.width=on?'300px':'390px';
  document.body.style.width=on?'300px':'390px';
  void document.body.offsetHeight;
  try{localStorage.setItem('catPopupCompact',on?'1':'0')}catch(_){}
}
function popupCompact(){try{return localStorage.getItem('catPopupCompact')==='1'}catch(_){return false}}
async function load(){ctx=await msg('cat-context');if(!ctx)return;const s=ctx.summary||{},set=ctx.settings||{},bridge=ctx.bridge,sync=ctx.sync||{},shift=ctx.shift||{status:'not_clocked_in'};const shiftStatus=String(shift.status||'not_clocked_in'),shiftActive=shiftStatus==='active';const audit=await chrome.storage.local.get('catUnverifiedSubmissionsV1').catch(()=>({}));const qaRows=(Array.isArray(audit.catUnverifiedSubmissionsV1)?audit.catUnverifiedSubmissionsV1:[]).filter(e=>e.reportDate===shift.reportDate && (e.reviewStatus||'unverified')==='unverified').slice(-20);const n=qaRows.length;const qa=$('unverifiedQa');if(qa){qa.hidden=n===0;$('unverifiedQaCount').textContent=n;const list=$('unverifiedQaList');if(list){list.replaceChildren();for(const entry of qaRows.slice(-10).reverse()){const li=document.createElement('li');const when=Number(entry.pressedAt)>0?new Date(entry.pressedAt).toLocaleString():'unknown time';li.textContent=`${String(entry.jobId||'Unknown job').slice(0,55)} · task ${Number(entry.taskIndex)||'?'} / ${Number(entry.totalTasks)||'?'} · ${when}`;list.append(li);}}}window.__coverageUnverifiedQaRows=qaRows;$('shiftState').textContent=shiftActive?'ACTIVE SHIFT':shiftStatus==='completed'?'SHIFT COMPLETE · LOCKED':'TIME IN REQUIRED';$('shiftMeta').textContent=shiftActive?`${shift.reportDate||'Current shift'} · tracking continues through OT until Time Out`:shiftStatus==='completed'?`${shift.reportDate||'Completed shift'} · final totals frozen; next Time In starts at 0`:'Tracker waits for TrinoTime Time In.';const submitted=submittedView(s);$('created').textContent=s.created||0;$('blurred').textContent=s.blurred||0;$('deleted').textContent=s.deleted||0;$('noMatch').textContent=s.noMatch||0;$('submitted').textContent=submitted.total;$('goalText').textContent=set.dailyGoal||300;$('submitMeta').textContent=`Confirmed ${submitted.confirmed} · Manual ${submitted.manual>0?`+${submitted.manual}`:submitted.manual}`;$('active').textContent=fmt(s.activeMs);$('idle').textContent=fmt(Math.max(0,(Number(s.idleMs)||0)-(Number(s.awayMs)||0)));$('away').textContent=fmt(s.awayMs);$('progress').style.width=`${Math.min(100,Math.round((Number(submitted.total)||0)/(Number(set.dailyGoal)||300)*100))}%`;$('job').textContent=s.currentJob?`${s.currentJob} · ${s.currentTask||0}/${s.totalTasks||0}`:'No active job';$('trackerState').textContent=`${String(s.trackerState||'idle').toUpperCase()} · Search ${fmt(s.searchingMs||0)} · Grace ${fmt(s.graceMs||0)} · Unverified ${fmt(s.unverifiedMs||0)} · ${s.pendingSubmission?'submission pending':'managed confirmed-state tracking'}`;$('siteState').textContent=shiftActive?'TRACKING':shiftStatus==='completed'?'LOCKED':'WAITING';$('siteState').classList.toggle('on',shiftActive);$('dailyGoal').value=set.dailyGoal||300;$('hudPosition').value=set.hudPosition||'bottom-left';if($('hudToggle'))$('hudToggle').textContent=set.hudExpanded===false?'Expand HUD':'Minimize HUD';$('submittedMinus').disabled=!shiftActive||(submitted.total<=0 && submitted.manual<=-submitted.confirmed);$('submittedPlus').disabled=!shiftActive;if(bridge?.token){const agentName=String(bridge.actor?.name||'Agent').trim()||'Agent';$('bridgeState').textContent='Connected';$('bridgeIdentity').hidden=false;$('bridgeAgentName').textContent=agentName;$('bridgeMeta').textContent=bridge.lastSyncAt?`Last sync ${Math.max(0,Math.floor((Date.now()-Number(bridge.lastSyncAt))/1000))}s ago. Token expires ${bridge.expiresAt?new Date(bridge.expiresAt).toLocaleDateString():'later'}.`:'Connected. Waiting for the first sync.';$('connect').textContent='Reconnect';$('sync').disabled=false;$('disconnect').hidden=false}else{$('bridgeState').textContent='Not connected';$('bridgeIdentity').hidden=true;$('bridgeAgentName').textContent='Agent';$('bridgeMeta').textContent='Open TrinoTime production, sign in as the QA Agent, then connect this tracker.';$('connect').textContent='Connect to TrinoTime';$('sync').disabled=true;$('disconnect').hidden=true}$('syncState').className='dot '+(sync.state==='ok'?'ok':sync.state==='error'?'bad':'');if(sync.lastError)status(sync.lastError);if($('compactState'))$('compactState').textContent=String(s.trackerState||'ready').toUpperCase();if($('compactBridge'))$('compactBridge').textContent=bridge?.token?String(bridge.actor?.name||'Connected'):'Not connected';refreshLiveIdle();}
async function update(patch){await msg('cat-settings',{patch});await load();}
$('dailyGoal').addEventListener('change',()=>update({dailyGoal:Number($('dailyGoal').value)||300}));
$('hudPosition').addEventListener('change',()=>update({hudPosition:$('hudPosition').value}));
$('hudToggle').addEventListener('click',async()=>{const expanded=ctx?.settings?.hudExpanded!==false;await update({hudExpanded:!expanded});});
$('popupToggle').addEventListener('click',()=>setPopupCompact(!document.body.classList.contains('compact')));
$('popupToggleSecondary')?.addEventListener('click',()=>setPopupCompact(!document.body.classList.contains('compact')));
setPopupCompact(popupCompact());
$('connect').addEventListener('click',async()=>{if(busy)return;busy=true;$('connect').disabled=true;status('Connecting to your signed-in TrinoTime production tab…');const r=await msg('cat-pair-trinotime');if(r?.ok){status('Connected to TrinoTime production ✓');}else{const err=r?.error||'Connection failed.';status(err);$('bridgeMeta').textContent=`Pairing failed: ${err}`;}busy=false;$('connect').disabled=false;await load();});
$('sync').addEventListener('click',async()=>{status('Syncing…');const r=await msg('cat-sync-now');status(r?.ok?'TrinoTime production sync complete ✓':r?.error||'Sync failed.');await load();});
$('disconnect').addEventListener('click',async()=>{if(!confirm('Remove the TrinoTime connection from this browser? You can also revoke active connections from the TrinoTime Coverage tab.'))return;await msg('cat-disconnect-local');status('Local TrinoTime connection removed.');await load();});
$('unverifiedQaCopy')?.addEventListener('click',async()=>{const rows=window.__coverageUnverifiedQaRows||[];if(!rows.length)return;
 const report=['TrinoTime Coverage production — unverified Submit attempts (NOT accepted counts)',
  ...rows.map(e=>`${String(e.reportDate||'').slice(0,16)} | ${String(e.jobId||'').slice(0,55)} | task ${Number(e.taskIndex)||'?'} / ${Number(e.totalTasks)||'?'} | ${Number(e.pressedAt)>0?new Date(e.pressedAt).toISOString():'unknown'} | ${String(e.reason||'no-acceptance-evidence').slice(0,85)}`)].join('\n');
 try{await navigator.clipboard.writeText(report);status('QA evidence copied. Confirm task acceptance independently before requesting any correction.');}
 catch(_){status('Clipboard unavailable; review the task IDs in the list.');}
});

$('submittedPlus').addEventListener('click',async()=>{if(busy)return;busy=true;$('submittedPlus').disabled=true;$('submittedMinus').disabled=true;const r=await msg('cat-adjust-submitted',{delta:1});status(r?.ok?'Submitted manual adjustment +1 applied.':r?.error||'Unable to adjust submitted total.');busy=false;await load();});
$('submittedMinus').addEventListener('click',async()=>{if(busy)return;busy=true;$('submittedPlus').disabled=true;$('submittedMinus').disabled=true;const r=await msg('cat-adjust-submitted',{delta:-1});status(r?.ok?'Submitted manual adjustment −1 applied.':r?.error||'Unable to adjust submitted total.');busy=false;await load();});
chrome.storage.onChanged.addListener(()=>load().catch(()=>{}));
msg('cat-refresh-shift').catch(()=>{}).finally(()=>load().catch(e=>status(String(e.message||e))));
timer=setInterval(refreshLiveIdle,1000);
