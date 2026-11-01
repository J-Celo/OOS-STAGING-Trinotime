/* RC53: small bounded UI adapter; the server owns all identities and decisions. */
(function () {
  'use strict';
  window.createTrinoTimeoutUI = function (a) {
    let context='', lastScan=0, lastRead=0, busy=false, rows=[], candidates=[], page=0, signature='', dialog=null;
    let scanning=false;
    let deferred=new Set(), errorText='', previousFocus=null, writeBusy=false;
    const esc=a.escape, pageSize=50;
    const time=value=>value?new Date(value).toLocaleString('en-PH',{timeZone:'Asia/Manila',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}):'Unavailable';
    function close() { if(writeBusy)return;dialog?.remove();dialog=null;previousFocus?.focus?.(); }
    function mount(id, anchor) {
      let el=document.getElementById(id);
      if(!el && anchor){el=document.createElement('section');el.id=id;el.className='tt-timeout-card';anchor.insertAdjacentElement('beforebegin',el);}
      return el;
    }
    function clear() {
      writeBusy=false;close();rows=[];candidates=[];page=0;signature='';lastScan=lastRead=0;busy=false;errorText='';deferred=new Set();
      ['ttTimeoutAgent','ttTimeoutAdmin','ttTimeoutTL'].forEach(id=>{const el=document.getElementById(id);if(el){el.replaceChildren();el.hidden=true;}});
    }
    function filteredRows() {return rows.filter(r=>r.unresolved && a.stillOpen(r.key));}
    function render() {
      const role=a.role(), visible=filteredRows();
      const agent=mount('ttTimeoutAgent',document.getElementById('btnTimeIn')?.closest('.punch-card') || document.getElementById('btnTimeIn')?.parentElement?.parentElement);
      if(agent){agent.hidden=role!=='agent'||(!candidates.length&&!errorText);if(role==='agent'){
        const row=visible[0],request=row?.request,pending=['pending','approving'].includes(request?.status);
        agent.innerHTML=`<strong>${pending?'Time Out correction pending':'Incomplete shift found'}</strong><p>${esc(errorText || (row ? (pending?'Submitted for TL/Admin review. Attendance remains unresolved until approved.':`No Time Out was recorded for ${row.date}. Submit the time your shift actually ended.`):'Checking the secure Attendance record…'))}</p>${row&&!pending?'<button type="button" class="modal-btn save" data-propose>Submit correction</button>':''}`;
        agent.querySelector('[data-propose]')?.addEventListener('click',()=>openDialog(row,false));
        if(row&&!pending&&!errorText&&!deferred.has(row.key)&&!dialog){deferred.add(row.key);openDialog(row,false);}
      }}
      [['ttTimeoutAdmin','adminReviewList','admin'],['ttTimeoutTL','tlAttendanceNeedsAttentionWrap','team_leader']].forEach(([id,anchor,forRole])=>{
        const el=mount(id,document.getElementById(anchor));if(!el)return;el.hidden=role!==forRole;if(el.hidden)return;
        const today=candidates.filter(r=>r.date===a.today()&&a.stillOpen(r.key));
        const pending=visible.filter(r=>['pending','approving'].includes(r.request?.status));
        const current=pending.filter(r=>!a.carryover(r.date)),prior=pending.filter(r=>a.carryover(r.date));
        const draw=(label,items)=>`<h5>${label} · ${items.length}</h5>${items.map(r=>`<div class="tt-timeout-row"><div><strong>${esc(a.name(r.name))}</strong><small>${esc(a.pod(r.pod))} · ${esc(r.date)}</small><small>Proposed Time Out: ${esc(time(r.request.proposedTimeOut))}</small></div><button type="button" class="modal-btn save" data-review="${esc(r.key)}">Review request</button></div>`).join('')}`;
        el.innerHTML=`<strong>Open shifts · today</strong><p>${today.length} need review · 30-minute grace after scheduled end and approved overtime.</p>${today.slice(0,12).map(r=>`<div class="tt-timeout-row"><div><strong>${esc(a.name(r.name))}</strong><small>${esc(a.pod(r.pod))} · Time In ${esc(time(r.timeIn))}</small><small>Expected end ${esc(time(r.timing.expectedEndMs))} · Open ${Math.floor(r.timing.ageMs/3600000)}h ${Math.floor(r.timing.ageMs/60000)%60}m</small></div><button type="button" class="modal-btn" data-nudge="${esc(r.key)}">Review Attendance</button></div>`).join('')}${today.length>12?'<p>More open shifts are available in Attendance Needs Attention.</p>':''}<div class="tt-timeout-head"><strong>Time Out correction requests</strong><button type="button" class="modal-btn" data-refresh>Refresh</button></div>${errorText?`<p role="status">${esc(errorText)}</p>`:''}${draw('This month',current)}${prior.length?draw('Prior-period carryover',prior):''}${!pending.length?'<p>No pending requests in this group of open records.</p>':''}${candidates.length>pageSize?`<div class="tt-timeout-head"><button type="button" class="modal-btn" data-prev ${page===0?'disabled':''}>Previous</button><small>Open records ${page*pageSize+1}–${Math.min((page+1)*pageSize,candidates.length)} of ${candidates.length}</small><button type="button" class="modal-btn" data-next ${(page+1)*pageSize>=candidates.length?'disabled':''}>Next</button></div>`:''}`;
        el.querySelectorAll('[data-nudge]').forEach(b=>b.addEventListener('click',()=>a.manual(today.find(r=>r.key===b.dataset.nudge))));
        el.querySelector('[data-refresh]')?.addEventListener('click',()=>tick(true));
        el.querySelector('[data-prev]')?.addEventListener('click',()=>{page--;lastRead=0;tick(true);});
        el.querySelector('[data-next]')?.addEventListener('click',()=>{page++;lastRead=0;tick(true);});
        el.querySelectorAll('[data-review]').forEach(b=>b.addEventListener('click',()=>openDialog(visible.find(r=>r.key===b.dataset.review),true)));
      });
    }
    function openDialog(row,review) {
      if(!row||dialog)return;
      const openingContext=context;previousFocus=document.activeElement;
      const request=row.request;dialog=document.createElement('div');dialog.className='tt-timeout-overlay';
      dialog.innerHTML=`<div class="tt-timeout-dialog" role="dialog" aria-modal="true" aria-labelledby="ttTimeoutTitle" tabindex="-1"><h3 id="ttTimeoutTitle">${review?'Review Time Out correction':'Incomplete shift found'}</h3><p>${esc(a.name(row.name))} · ${esc(row.date)} · ${esc(a.pod(row.pod))}</p><dl><dt>Time In</dt><dd>${esc(time(row.timeIn))}</dd><dt>Time Out</dt><dd>Missing / invalid</dd><dt>Scheduled shift end</dt><dd>${esc(time(row.expectedEnd))}</dd>${review?`<dt>Proposed Time Out</dt><dd>${esc(time(request.proposedTimeOut))}</dd><dt>Agent’s reason</dt><dd>${esc(request.reason)}</dd>${request.note?`<dt>Note</dt><dd>${esc(request.note)}</dd>`:''}<dt>Submitted by</dt><dd>${esc(request.submittedBy?.name)} · ${esc(time(request.submittedAt))}</dd>`:''}</dl>${!review?`<p>Enter when your shift actually ended. A Team Leader or Admin will review your proposal.</p>${request?.status==='rejected'?`<p>Previous request rejected: ${esc(request.reviewReason)}</p>`:''}<label>Actual Time Out (Philippines time)<input id="ttTimeoutActual" type="datetime-local" required></label><label>Reason<select id="ttTimeoutReason"><option>Forgot to clock out</option><option>Browser/device issue</option><option>Internet/power issue</option><option>Other</option></select></label><label>Note (required for Other)<textarea id="ttTimeoutNote" maxlength="1000"></textarea></label>`:`<label>Review reason<textarea id="ttTimeoutReviewReason" maxlength="1000" required placeholder="Explain the approval or rejection"></textarea></label><p>Approval corrects Attendance and records the audit. Rejection leaves the shift unresolved. Open-break or changed records need manual review.</p>`}<p class="tt-timeout-error" role="status"></p><div class="tt-timeout-actions"><button type="button" class="modal-btn" data-close>${review?'Close':'Remind me later'}</button>${review?'<button type="button" class="modal-btn" data-manual>Open Attendance</button><button type="button" class="modal-btn" data-reject>Reject</button>':''}<button type="button" class="modal-btn save" data-send>${review?'Approve correction':'Submit correction'}</button></div></div>`;
      document.body.append(dialog);dialog.querySelector('[role=dialog]').focus();
      dialog.querySelector('[data-close]').onclick=close;
      dialog.addEventListener('keydown',e=>{
        if(e.key==='Escape'){e.preventDefault();close();}
        if(e.key==='Tab'){const fields=[...dialog.querySelectorAll('button:not(:disabled),input,select,textarea')],first=fields[0],last=fields.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
      });
      dialog.querySelector('[data-manual]')?.addEventListener('click',()=>{close();a.manual(row);});
      // Keep one operation ID for retries after a lost response.
      const operationId='timeout_'+crypto.randomUUID().replaceAll('-','');
      const send=async decision=>{
        if(writeBusy||openingContext!==a.context())return;
        const container=dialog,status=container.querySelector('.tt-timeout-error');
        let body={action:review?'review':'submit',key:row.key,operationId};
        if(review){body={...body,requestId:request.id,decision,reason:container.querySelector('#ttTimeoutReviewReason').value.trim()};if(body.reason.length<5){status.textContent='Enter a review reason of at least 5 characters.';return;}}
        else {const actual=container.querySelector('#ttTimeoutActual').value,note=container.querySelector('#ttTimeoutNote').value.trim(),reason=container.querySelector('#ttTimeoutReason').value;
          if(!actual||!Number.isFinite(Date.parse(actual+'+08:00'))){status.textContent='Enter the actual date and Time Out.';return;}
          if(reason==='Other'&&note.length<5){status.textContent='Explain the reason in the note (at least 5 characters).';return;}
          body={...body,proposedTimeOut:new Date(actual+'+08:00').toISOString(),reason:reason==='Other'?note:reason,note};}
        writeBusy=true;container.querySelectorAll('button').forEach(b=>b.disabled=true);status.textContent='Waiting for server confirmation…';
        try {const result=await a.fetch(body);if(openingContext!==a.context())return;
          if(!result.ok)throw new Error('The server did not confirm this operation.');
          await a.reload(row.key);writeBusy=false;close();lastRead=0;await tick(true);
          a.toast(review?(decision==='approve'?'Correction approved and audited.':'Request rejected; Attendance remains unresolved.'):'Time Out proposal submitted for review.');
        }catch(e){if(openingContext===a.context())status.textContent=e.message||'Unable to confirm. Retry this same request.';}
        finally {writeBusy=false;container.querySelectorAll('button').forEach(b=>b.disabled=false);}
      };
      dialog.querySelector('[data-send]').onclick=()=>send('approve');
      dialog.querySelector('[data-reject]')?.addEventListener('click',()=>send('reject'));
    }
    async function tick(force=false) {
      const next=a.context();if(next!==context){clear();context=next;}
      if(!next||document.hidden)return;
      const now=Date.now();
      if(dialog&&!writeBusy&&rows.some(r=>!a.stillOpen(r.key)))close();
      if(!force&&now-lastScan<15000){if(rows.some(r=>!a.stillOpen(r.key))){rows=filteredRows();render();}return;}
      lastScan=now;
      if(scanning)return;scanning=true;const scanContext=context;
      try{candidates=await a.candidates();}finally{scanning=false;}
      if(scanContext!==a.context())return;
      page=Math.min(page,Math.max(0,Math.ceil(candidates.length/pageSize)-1));
      const keys=candidates.slice(page*pageSize,(page+1)*pageSize).map(r=>r.key),sig=JSON.stringify(keys);
      render();
      if(!keys.length){rows=[];render();return;}
      if(busy||(!force&&sig===signature&&now-lastRead<60000))return;
      busy=true;signature=sig;lastRead=now;const pendingContext=context;
      try {const result=await a.fetch({action:'list',keys});if(pendingContext!==a.context())return;
        rows=result.rows||[];errorText='';render();
      }catch(e){if(pendingContext===a.context()){errorText=e.message||'Correction status is unavailable. Refresh to retry.';render();}}
      finally {if(pendingContext===context)busy=false;}
    }
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)void tick(true);});
    // Reuse the application's existing refresh hooks; no additional interval or subscription.
    return {tick,clear};
  };
})();
