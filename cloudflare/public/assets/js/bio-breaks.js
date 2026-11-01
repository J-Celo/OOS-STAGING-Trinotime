(() => {
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const duration=ms=>{const totalSeconds=Math.floor(Math.max(0,ms)/1000),hours=Math.floor(totalSeconds/3600),minutes=Math.floor((totalSeconds%3600)/60),seconds=totalSeconds%60,parts=[];if(hours)parts.push(`${hours} hr${hours===1?'':'s'}`);if(hours||minutes)parts.push(`${minutes} min${minutes===1?'':'s'}`);parts.push(`${seconds} sec${seconds===1?'':'s'}`);return parts.join(' ');};
  const bioDateLabel=value=>{const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value||''));if(!match)return String(value||'—');const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];return `${months[Number(match[2])-1]} ${Number(match[3])}, ${match[1]}`;};
  let dialog,request,refreshTimer,sequence=0,rows=[],receivedAt=0,serverNow=0,busy=false;
  const clockOrigins=new WeakMap();
  const friendlyPod=value=>{
    const raw=String(value??'').trim();
    try{
      const resolved=window.TrinoTimePodDisplayLabel?.(raw);
      if(resolved&&!/^tt-custom-pod:/i.test(String(resolved)))return String(resolved);
    }catch(_){}
    return /^tt-custom-pod:/i.test(raw)?'Assigned POD':(raw||'Unassigned');
  };
  function message(m){
    const b=m.bioBreak; if(!clockOrigins.has(b))clockOrigins.set(b,Date.now()); const origin=clockOrigins.get(b),done=b.endedAt!=null,unknown=b.statusUnavailable;
    const elapsed=Math.max(0,(b.endedAt??b.serverNow??Date.now())-b.startedAt);
    return `<div class="tt-wm-bubble tt-bio-message${done?' is-complete':''}"><strong>${esc(m.text)}</strong><span class="tt-bio-timer" ${!done&&!unknown?`data-bio-message="${esc(m.messageId)}" data-bio-running="${Number(b.startedAt)}" data-bio-clock="${Number(b.serverNow||Date.now())}" data-bio-received="${origin}"`:''}>${unknown?'Status unavailable':`${duration(elapsed)}${done?' · total':' · running'}`}</span></div>`;
  }
  function tick(){
    if(dialog?.open){const app=document.getElementById('appRoot'),gate=document.getElementById('gateOverlay');if(!app||app.hidden||app.inert||getComputedStyle(app).display==='none'||(gate&&getComputedStyle(gate).display!=='none')){close();return;}}
    if(document.hidden)return;
    document.querySelectorAll('[data-bio-running]').forEach(el=>{const now=Number(el.dataset.bioClock)+Date.now()-Number(el.dataset.bioReceived);el.textContent=duration(now-Number(el.dataset.bioRunning))+' · running';});
    if(dialog?.open&&!busy&&rows.some(row=>row.active))renderRows();
  }
  function unlockPageScroll(){document.documentElement.classList.remove('tt-bio-modal-open');document.body.classList.remove('tt-bio-modal-open');}
  function close(){sequence++;busy=false;clearInterval(refreshTimer);rows=[];if(dialog?.open)dialog.close();unlockPageScroll();document.getElementById('bioBreakTabBtn')?.classList.remove('active');try{window.TrinoTimeRestoreLogTabActive?.();}catch(_){}}
  function ensure(){
    if(dialog)return;
    dialog=document.createElement('dialog');dialog.className='tt-bio-dialog';dialog.setAttribute('aria-labelledby','ttBioTitle');
    dialog.innerHTML=`<header><div><span class="tt-bio-eyebrow">ATTENDANCE LOG</span><h2 id="ttBioTitle">Bio Break</h2></div><button type="button" class="tt-bio-close" data-close aria-label="Close Bio Break" title="Close">×</button></header><div class="tt-bio-body"><p>Agents and Team Leaders can type <strong>Biobreak</strong> in their POD/team channel to start and <strong>Bioback</strong> there to finish. Direct messages treat these words as normal chat text. Bio breaks are tracked separately from your standard 30-minute break.</p><div class="tt-bio-filters"><label>From<input type="date" data-from></label><label>To<input type="date" data-to></label><label>Search member or Pod<input type="search" data-search placeholder="Name or Pod"></label><button type="button" data-refresh>Refresh</button></div><p class="tt-bio-note">Dates use Philippine time. Each break belongs to its start date and Pod. Totals include running breaks. Only records within your access are shown.</p><div data-status role="status" aria-live="polite"></div><div class="tt-bio-table-wrap"><table><thead><tr><th>Date (PHT)</th><th>Pod</th><th>Workforce member</th><th>Bio breaks</th><th>Total duration</th><th>Status</th></tr></thead><tbody></tbody></table></div><p data-updated class="tt-bio-note"></p></div>`;
    document.body.append(dialog);
    dialog.querySelector('[data-close]').addEventListener('click',close);
    dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
    dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close();}});
    dialog.querySelector('[data-refresh]').addEventListener('click',()=>load());
    for(const key of ['from','to'])dialog.querySelector(`[data-${key}]`).addEventListener('change',()=>load());
    dialog.querySelector('[data-search]').addEventListener('input',renderRows);
  }
  function renderRows(){
    if(!dialog?.open)return;
    const query=dialog.querySelector('[data-search]').value.trim().toLowerCase();
    const visible=rows.filter(r=>(String(r.date||'')+' '+r.name+' '+friendlyPod(r.pod)).toLowerCase().includes(query)).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||friendlyPod(a.pod).localeCompare(friendlyPod(b.pod),undefined,{numeric:true})||String(a.name||'').localeCompare(String(b.name||'')));
    const delta=Math.max(0,Date.now()-receivedAt);
    dialog.querySelector('tbody').innerHTML=visible.map(r=>`<tr><td data-label="Date (PHT)"><strong>${esc(bioDateLabel(r.date))}</strong></td><td data-label="Pod">${esc(friendlyPod(r.pod))}</td><td data-label="Workforce member"><strong>${esc(r.name)}</strong></td><td data-label="Bio breaks">${Number(r.count)}</td><td data-label="Total duration">${duration(Number(r.totalMs)+Number(r.active)*delta)}</td><td data-label="Status"><span class="tt-bio-status${r.active?' is-running':''}">${r.active?'Running':'Completed'}</span></td></tr>`).join('')||'<tr><td colspan="6">No bio breaks found for this date range and search.</td></tr>';
  }
  async function load(){
    if(!dialog?.open)return;
    const token=++sequence;busy=true;
    const status=dialog.querySelector('[data-status]');status.textContent='Loading bio breaks…';
    const from=dialog.querySelector('[data-from]').value,to=dialog.querySelector('[data-to]').value;
    rows=[];dialog.querySelector('tbody').replaceChildren();dialog.querySelector('[data-updated]').textContent='';
    try{
      if(!from||!to||from>to)throw new Error('Choose a valid From and To date.');
      const data=await request('bio-breaks?'+new URLSearchParams({from,to}));
      if(token!==sequence||!dialog.open)return;
      rows=data.rows||[];serverNow=data.serverNow;receivedAt=Date.now();status.textContent='';renderRows();
      dialog.querySelector('[data-updated]').textContent='Last synced '+new Date(serverNow).toLocaleTimeString()+'. Server data refreshes every 60 seconds while open; running timers update locally.';
    }catch(error){if(token===sequence&&dialog.open)status.textContent=error.message||'Could not load bio breaks. Select Refresh to retry.';}
    finally{if(token===sequence)busy=false;}
  }
  function open(fetcher){
    ensure();request=fetcher;
    const today=new Date(Date.now()+8*3600000).toISOString().slice(0,10);
    dialog.querySelector('[data-from]').value=today;dialog.querySelector('[data-to]').value=today;
    dialog.querySelector('[data-search]').value='';if(!dialog.open){document.documentElement.classList.add('tt-bio-modal-open');document.body.classList.add('tt-bio-modal-open');dialog.showModal();}
    load();clearInterval(refreshTimer);refreshTimer=setInterval(()=>{if(dialog.open&&!document.hidden&&!busy)load();},60000);
  }
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&dialog?.open)load();});
  window.addEventListener('pagehide',close);
  setInterval(tick,1000);
  window.TrinoTimeBioBreaks=Object.freeze({open,close,message});
})();
