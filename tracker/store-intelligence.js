/* Store Intelligence v2.1 — evidence-based Augmoto Job ID / Store observation.
 * Never infer a Job ID's actual store from the selected dropdown filter,
 * TL dispatch, pathname, task page, or a guessed name.
 * Does not modify task/productivity counts or submit historical corrections.
 */
(() => {
  'use strict';
  if (globalThis.__ttStoreIntelligenceV2) return;
  globalThis.__ttStoreIntelligenceV2 = true;
  // Prevent an old observer instance from competing after an extension update.
  // (Chrome normally unloads old content scripts on full page reload.)
  const JOB_RE = /\bJOB_[A-Z0-9_-]{4,64}\b/ig;
  const STATUS_RE = /\b(?:NEEDS REVIEW|COMPLETED|IN PROGRESS|PENDING|CREATED DATE|REVIEWED|CANCELLED|SUBMITTED|NOT STARTED)\b/i;
  const STORE_REJECT = /^(?:unknown(?: store)?|select a store(?: to filter)?|all stores|all|job id\s*\/\s*store|store|status|created date|\d{1,2}\/\d{1,2}\/\d{2,4})$/i;
  const clean = value => String(value || '').replace(/\s+/g, ' ').replace(/^[\s\-–|:]+|[\s\-–|:]+$/g,'').trim();
  const exactIds = text => [...clean(text).matchAll(JOB_RE)].map(m=>m[0].toUpperCase());
  function composedText(node) {
    // textContent concatenates adjacent <a>JOB_123</a><span>Store</span>
    // into JOB_123Store, which the Job-ID regex then misidentifies.
    // Reconstruct text boundaries from individual DOM text nodes instead.
    const parts=[],stack=[node];let visited=0;
    while(stack.length&&visited++<180){
      const item=stack.pop();
      if(!item)continue;
      if(item.nodeType===3){const part=clean(item.textContent);if(part)parts.push(part);continue;}
      if(item.nodeType!==1)continue;
      if(['SCRIPT','STYLE','OPTION'].includes(item.tagName))continue;
      const children=item.childNodes||[];
      for(let k=children.length-1;k>=0;k--)stack.push(children[k]);
    }
    return parts.join(' ').slice(0,1800);
  }
  function parseCandidate(text, id) {
    // Only text from a job-list *row/cell*. Not selected filters or job detail headings.
    const normalized=clean(text), jobs=exactIds(normalized);
    if(jobs.length!==1 || jobs[0]!==id)return '';
    const pos=normalized.toUpperCase().indexOf(id);
    if(pos<0)return '';
    // Extract only text immediately after the Job ID, before status/metadata.
    const after=normalized.slice(pos+id.length).split(STATUS_RE)[0];
    const store=clean(after).replace(/^store(?: name)?\s*[:：]\s*/i,'').trim();
    if(store.length<4||store.length>120||STORE_REJECT.test(store) ||
       /[<>\x00-\x1f]/.test(store)||exactIds(store).length||
       /\b(?:SUBMITTED|STATUS|CREATED DATE|TASKS?:\s*\d+|\d{1,2}:\d{2}:\d{2})\b/i.test(store))return '';
    return store;
  }
  // Jobs tables can render "Job ID" and "Store" as separate columns. Only
  // accept a distinct column when the row is one exact Job ID and a visible
  // heading or cell explicitly identifies the field as Store/Store Name.
  // Never use a selected filter, unlabeled adjacent column, or task page.
  const STORE_FIELD_RE = /^store(?: name)?$/i;
  function safeStore(value) {
    const name=clean(value).replace(/^store(?: name)?\s*[:：]\s*/i,'').trim();
    if(name.length<4||name.length>120||STORE_REJECT.test(name)||
       /[<>\x00-\x1f]/.test(name)||exactIds(name).length||
       /\b(?:NEEDS REVIEW|IN PROGRESS|CREATED DATE|SUBMITTED|TASKS?:\s*\d+)\b/i.test(name))return '';
    return name;
  }
  function verifiedRowStore(row,id) {
    if(!row?.matches?.('tr,[role="row"]'))return '';
    const ids=exactIds(composedText(row));
    if(ids.length!==1||ids[0]!==id)return '';
    const candidates=[];
    const add=v=>{const name=safeStore(v);if(name)candidates.push(name);};
    // Explicit per-cell labels in accessible/responsive Job lists.
    const fields=row.querySelectorAll?.('[data-label],[data-column],[aria-label],dt')||[];
    for(const el of [...fields].slice(0,80)) {
      const label=clean(el.getAttribute?.('data-label')||el.getAttribute?.('data-column')||'');
      const aria=clean(el.getAttribute?.('aria-label')||'');
      if(STORE_FIELD_RE.test(label))add(composedText(el));
      if(STORE_FIELD_RE.test(aria))add(composedText(el));
      else if(/^store(?: name)?\s*[:：]/i.test(aria))add(aria);
      // Definition-list presentations: <dt>Store</dt><dd>actual store</dd>.
      if(el.tagName==='DT'&&STORE_FIELD_RE.test(composedText(el))&&el.nextElementSibling?.tagName==='DD')add(composedText(el.nextElementSibling));
    }
    // Real table column header is stronger evidence than cell position.
    const table=row.closest?.('table');
    const header=table?.querySelector?.('thead tr');
    const headers=header?.querySelectorAll?.('th,[role="columnheader"]')||[];
    const cells=row.querySelectorAll?.(':scope > th,:scope > td,:scope > [role="cell"]')||[];
    for(let i=0;i<headers.length&&i<cells.length;i++){
      if(STORE_FIELD_RE.test(composedText(headers[i])))add(composedText(cells[i]));
    }
    // Conflicting explicit labels are not evidence for either Store.
    const unique=[...new Map(candidates.map(name=>[name.toLowerCase(),name])).values()];
    return unique.length===1?unique[0]:'';
  }
  function fromJobLink(link, id) {
    // For Augmoto variants that render rows as divs instead of table <tr>.
    // Walk only a few ancestors of an exact Job ID link, stopping before a
    // container holding several Job IDs. This avoids reading a Store filter.
    let node=link;
    for(let depth=0; node && depth<6;node=node.parentElement,depth++){
      const txt=composedText(node);
      if(exactIds(txt).length>1)break;
      if(node.matches?.('tr,[role="row"]')){
        const labeled=verifiedRowStore(node,id);
        if(labeled)return labeled;
        break;
      }
      const store=parseCandidate(txt,id);
      if(store)return store;
    }
    return '';
  }
  function activeJobsWorkflow() {
    // Augmoto SPA: /labeling?tab=coverage and /labeling?tab=confirmation.
    // Refuse job detail pages and ambiguous/unrecognized sections; this
    // protects independent Coverage and Confirmation Job ID namespaces.
    if (!/^\/labeling\/?$/.test(location.pathname)) return '';
    const tab=new URLSearchParams(location.search).get('tab');
    const workflow=tab==='coverage'?'coverage':(tab==='confirmation'||tab===null?'confirmation':'');
    const live=window.TrinoTimeQCMode?.get?.();
    return workflow && (!live || live===workflow) ? workflow : '';
  }
  function listReady() {
    // A loading overlay may retain stale previous-store rows during a SPA
    // transition; do not report them as newly observed mappings.
    const tables=[...document.querySelectorAll('table,[role="table"]')];
    return tables.some(table=>/Job ID\s*\/\s*Store/i.test(composedText(table.querySelector('thead')||table).slice(0,200)) &&
      !table.closest('[aria-busy="true"]')) &&
      !document.querySelector('[aria-busy="true"] [role="progressbar"]');
  }
  function collectVisibleMappings() {
    const discovered=new Map(),conflicts=new Set();
    if(!activeJobsWorkflow() || !listReady())return discovered;
    // Anchor-first handles native table rows AND modern div-based job lists.
    const links=document.querySelectorAll('a,[role="link"]');
    for(const link of [...links].slice(0,1600)){
      const ids=exactIds(link.textContent);
      if(ids.length!==1)continue;
      const id=ids[0];
      const name=fromJobLink(link,id);
      if(!name)continue;
      if(discovered.has(id)&&discovered.get(id).toLowerCase()!==name.toLowerCase())conflicts.add(id);
      else discovered.set(id,name);
    }
    // Some Augmoto pages render the Job ID as plain text, without an anchor.
    // Restrict fallback to a genuine row with exactly one Job ID.
    const rows=document.querySelectorAll('tr,[role="row"]');
    for(const row of [...rows].slice(0,600)){
      const ids=exactIds(composedText(row));
      if(ids.length!==1)continue;
      const id=ids[0];
      const cells=[...row.querySelectorAll(':scope > td, :scope > [role="cell"]')];
      const cell=cells.find(c=>exactIds(composedText(c)).length===1 && exactIds(composedText(c))[0]===id);
      const name=verifiedRowStore(row,id)||(cell?parseCandidate(composedText(cell),id):'');
      if(!name)continue;
      if(discovered.has(id)&&discovered.get(id).toLowerCase()!==name.toLowerCase())conflicts.add(id);
      else discovered.set(id,name);
    }
    for(const id of conflicts)discovered.delete(id);
    return discovered;
  }
  let timer=0,inFlight=false;
  const acked={ 'cat-store-observed':new Map(), 'cft-store-observed':new Map() };
  function sendOne(type,items) {
    try {
      return Promise.resolve(chrome.runtime.sendMessage({type,stores:items}))
        .then(reply=>Boolean(reply&&reply.ok===true))
        .catch(()=>false);
    } catch(_) {return Promise.resolve(false);}
  }
  async function scan() {
    timer=0;
    if(inFlight)return;
    inFlight=true;
    try {
      const active=activeJobsWorkflow();
      if(!active)return;
      const found=collectVisibleMappings();
      if(!found.size)return;
      for(const type of [active==='coverage'?'cat-store-observed':'cft-store-observed']){
        const cache=acked[type];
        const rows=[];
        for(const [jobId,storeName] of found){
          if(cache.get(jobId)===storeName)continue;
          rows.push({jobId,storeName,source:'augmoto-job-row'});
          if(rows.length===80)break;
        }
        if(!rows.length)continue;
        const ok=await sendOne(type,rows);
        if(!ok)continue; // Never mark delivered until background acknowledges.
        for(const row of rows)cache.set(row.jobId,row.storeName);
        if(cache.size>1200){
          const oldest=cache.keys().next().value;
          if(oldest)cache.delete(oldest);
        }
      }
    }catch(_){/* SPA transitions can detach nodes mid-scan; retry. */}
    finally {inFlight=false;}
  }
  // Agents can enter a Job immediately after the list appears. A normal 500ms
  // mutation scan may never run before a client-side route change unmounts the
  // Jobs table. Capture the exact same row evidence at the earliest entry
  // gesture, without blocking or modifying Augmoto navigation/submissions.
  const entryInFlight=new Map();
  function entryLink(target) {
    let node=target;
    for(let depth=0;node && depth<8;depth++,node=node.parentElement){
      if(node.matches?.('a,[role="link"]'))return node;
      if(node===document.documentElement)break;
    }
    return null;
  }
  function captureEntryRow(event) {
    const workflow=activeJobsWorkflow();
    if(!workflow || !listReady())return;
    const link=entryLink(event?.target);
    if(!link)return;
    const ids=exactIds(composedText(link));
    if(ids.length!==1)return;
    const jobId=ids[0],storeName=fromJobLink(link,jobId);
    if(!storeName)return;
    const type=workflow==='coverage'?'cat-store-observed':'cft-store-observed';
    if(acked[type].get(jobId)===storeName)return;
    const key=`${type}|${jobId}|${storeName}`;
    if(entryInFlight.has(key))return;
    const promise=sendOne(type,[{jobId,storeName,source:'augmoto-job-row'}])
      .then(ok=>{if(ok)acked[type].set(jobId,storeName);return ok;})
      .finally(()=>{if(entryInFlight.get(key)===promise)entryInFlight.delete(key);});
    entryInFlight.set(key,promise);
  }

  function schedule() {if(!timer)timer=setTimeout(scan,500);}
  function watch(){
    schedule();
    // Chrome may inject at document_start before the root element exists.
    const root=document.documentElement;
    if(!root){document.addEventListener('DOMContentLoaded',watch,{once:true});return;}
    const obs=new MutationObserver(schedule);
    obs.observe(root,{childList:true,subtree:true,characterData:true});
    // pointerdown gets ahead of normal click navigation; click also supports
    // keyboard and programmatic accessible-link activation.
    document.addEventListener('pointerdown',captureEntryRow,true);
    document.addEventListener('click',captureEntryRow,true);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',watch,{once:true});
  else watch();
  // Retry when MV3 background was asleep/unavailable, and on SPA navigation.
  // Interval does not fabricate evidence: it only re-reads visible Job list rows.
  setInterval(schedule,12000);
  window.addEventListener('popstate',schedule);
  window.addEventListener('pageshow',schedule);
})();
