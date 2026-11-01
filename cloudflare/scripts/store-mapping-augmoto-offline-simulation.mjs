/**
 * TrinoTime STAGING QA - Augmoto Jobs-list layout simulation.
 * Synthetic in-memory DOM only: NO Augmoto requests, NO worker deployment,
 * NO Firebase, NO actual jobs, NO extension mutation or task submissions.
 * Layout modeled on Oct 21 screenshots/video: combined Job ID / Store cell,
 * store filter, table loading transition, paginated jobs, workflow changes.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const observer=fs.readFileSync(new URL('../../tracker/store-intelligence.js',import.meta.url),'utf8');
const text=value=>({nodeType:3,textContent:String(value),childNodes:[],parentElement:null});
function el(tag,children=[],attrs={}){
  const node={nodeType:1,tagName:tag.toUpperCase(),childNodes:[],parentElement:null,
    attrs, getAttribute(name){return Object.hasOwn(this.attrs,name)?this.attrs[name]:null;},
    matches(selector){return selector.split(',').some(s=>s.trim()==='tr'&&this.tagName==='TR'||s.trim()==='[role="row"]'&&this.attrs.role==='row');},
    closest(selector){let cur=this;while(cur){if(selector==='table'&&cur.tagName==='TABLE')return cur;
      if(selector==='[aria-busy="true"]'&&cur.attrs['aria-busy']==='true')return cur;cur=cur.parentElement;}return null;},
    querySelector(sel){if(sel==='thead')return descend(this,n=>n.tagName==='THEAD')[0]||null;
      if(sel==='thead tr')return descend(this,n=>n.tagName==='THEAD').flatMap(n=>descend(n,k=>k.tagName==='TR'))[0]||null;
      return this.querySelectorAll(sel)[0]||null;},
    querySelectorAll(sel){if(sel===':scope > td, :scope > [role="cell"]')return this.childNodes.filter(n=>n.tagName==='TD'||n.attrs?.role==='cell');
      if(sel===':scope > th,:scope > td,:scope > [role="cell"]')return this.childNodes.filter(n=>n.tagName==='TD'||n.tagName==='TH'||n.attrs?.role==='cell');
      if(sel==='th,[role="columnheader"]')return descend(this,n=>n.tagName==='TH'||n.attrs?.role==='columnheader');
      if(sel==='[data-label],[data-column],[aria-label],dt')return descend(this,n=>Boolean(n.attrs?.['data-label']||n.attrs?.['data-column']||n.attrs?.['aria-label']||n.tagName==='DT'));
      return [];}
  };
  node.childNodes=children.map(c=>typeof c==='string'?text(c):c);
  for(const child of node.childNodes)child.parentElement=node;
  Object.defineProperty(node,'textContent',{get(){return node.childNodes.map(c=>c.textContent).join('');}});
  return node;
}
function descend(root,predicate){const result=[];function visit(node){if(node.nodeType!==1)return;if(predicate(node))result.push(node);for(const c of node.childNodes||[])visit(c);}visit(root);return result;}
const makeRow=(id,store,status='NEEDS REVIEW')=>el('tr',[
  el('td',[el('a',[id]),el('span',[` ${store}`])]),el('td',[status]),el('td',['10/21/2026 10:08 PM'])
]);
function makeTable(rows){return el('table',[
  el('thead',[el('tr',[el('th',['Job ID / Store']),el('th',['Status']),el('th',['Created Date'])])]),
  el('tbody',rows)
]);}
function scenario(initialTab='coverage'){
  const state={tab:initialTab,mode:initialTab,rows:[],busy:false,hasTable:true,selector:'Chemist Warehouse - Rooty Hill',sent:[],intervals:[],queue:[],rejectNext:false};
  const document={readyState:'complete',documentElement:{},addEventListener(){},querySelectorAll(selector){
    if(!state.hasTable)return [];
    const table=makeTable(state.rows.map(r=>makeRow(...r)));
    if(selector==='table,[role="table"]')return [table];
    if(selector==='a,[role="link"]')return descend(table,n=>n.tagName==='A');
    if(selector==='tr,[role="row"]')return descend(table,n=>n.tagName==='TR');
    return [];
  },querySelector(selector){
    if(selector==='[aria-busy="true"] [role="progressbar"]')return state.busy?{nodeType:1}:null;
    return null;
  }};
  const timers=[];
  const location={pathname:'/labeling',search:`?tab=${initialTab}&store=S_196`};
  const runtime={sendMessage:async msg=>{
    state.sent.push(JSON.parse(JSON.stringify(msg)));
    if(state.rejectNext){state.rejectNext=false;return {ok:false};}
    return {ok:true};
  }};
  const sandbox={console,document,location,URLSearchParams,
    chrome:{runtime},MutationObserver:class{constructor(fn){state.mutation=fn;}observe(){}},
    window:{TrinoTimeQCMode:{get:()=>state.mode},addEventListener(){}},Promise,
    setTimeout(fn){timers.push(fn);return timers.length;},clearTimeout(){},
    setInterval(fn){state.intervals.push(fn);return state.intervals.length;}
  };
  vm.runInNewContext(observer,sandbox);
  state.scan=async()=>{const fn=timers.shift();if(fn)fn();await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve));};
  state.update=(tab,rows)=>{state.tab=tab;state.mode=tab;location.search=`?tab=${tab}&store=S_196`;state.rows=rows;state.mutation?.();};
  state.pop=()=>{location.pathname='/labeling/job/JOB_999999';state.mutation?.();};
  state.back=()=>{location.pathname='/labeling';state.mutation?.();};
  return state;
}
const pair=(id,store,status='NEEDS REVIEW')=>[id,store,status];
const rooty=[pair('JOB_288769097','Chemist Warehouse - Rooty Hill','IN PROGRESS'),
  pair('JOB_288768903','Chemist Warehouse - Rooty Hill')];
const charlestown=[pair('JOB_288139431','Chemist Warehouse - Charlestown'),
  pair('JOB_288139892','Chemist Warehouse - Charlestown')];
const s=scenario('coverage');
s.update('coverage',rooty);await s.scan();
assert.equal(s.sent.length,1,'Coverage observer sends an observation for visible loaded rows');
assert.equal(s.sent[0].type,'cat-store-observed');
assert.deepEqual(s.sent[0].stores.map(r=>r.jobId),rooty.map(r=>r[0]));
assert(s.sent[0].stores.every(r=>r.storeName==='Chemist Warehouse - Rooty Hill'&&r.source==='augmoto-job-row'));
// Changing the selected store while retaining old DOM rows must not attribute
// those stale rows to the new store when a loading signal is present.
s.busy=true;s.update('coverage',charlestown);await s.scan();
assert.equal(s.sent.length,1,'Loading overlay suppresses observations while rows transition');
s.busy=false;s.mutation();await s.scan();
assert.equal(s.sent.length,2,'Fully loaded store switch emits its exact new rows');
assert.deepEqual(s.sent[1].stores.map(r=>r.jobId),charlestown.map(r=>r[0]));
// Virtual pagination sends only visible rows and deduplicates already acked ids.
s.update('coverage',[pair('JOB_288128845','Chemist Warehouse - Box Hill')]);await s.scan();
assert.equal(s.sent.length,3);assert.equal(s.sent[2].stores[0].storeName,'Chemist Warehouse - Box Hill');
s.mutation();await s.scan();assert.equal(s.sent.length,3,'Re-render does not send acknowledged rows twice');
// Empty/filter-only and ambiguous multi-ID rows must not produce mappings.
s.update('coverage',[]);s.selector='Chemist Warehouse - Bogus Selected Store';await s.scan();
assert.equal(s.sent.length,3,'Filter alone cannot fabricate a store mapping');
s.update('coverage',[pair('JOB_288139431 JOB_288139892','Chemist Warehouse - Wrong Pair')]);await s.scan();
assert.equal(s.sent.length,3,'Multi-job rows are never assigned guessed stores');
// Distinct Confirmation route must only use the Confirmation background event.
s.update('confirmation',[pair('JOB_999355131','Chemist Warehouse - Salisbury')]);await s.scan();
assert.equal(s.sent.length,4);assert.equal(s.sent[3].type,'cft-store-observed');
assert.equal(s.sent[3].stores[0].jobId,'JOB_999355131');
s.pop();await s.scan();assert.equal(s.sent.length,4,'Job detail route is not Jobs-list evidence');
s.back();s.mode='coverage';s.mutation();await s.scan();assert.equal(s.sent.length,4,'Mode mismatch is not accepted');
s.mode='confirmation';
// A failed background acknowledgement cannot permanently drop a mapping.
s.update('confirmation',[pair('JOB_287444444','Chemist Warehouse - Miranda')]);s.rejectNext=true;await s.scan();
assert.equal(s.sent.length,5);s.mutation();await s.scan();
assert.equal(s.sent.length,6,'Unacknowledged mapping gets retried');
assert.equal(s.sent[5].type,'cft-store-observed');
// Wrong route or invisible table never sends a new observation.
s.hasTable=false;s.update('confirmation',[pair('JOB_287555555','Chemist Warehouse - Essendon')]);await s.scan();
assert.equal(s.sent.length,6,'Observer refuses missing Jobs-table evidence');
console.log('PASS Augmoto Jobs-list offline simulation: row-based Coverage and Confirmation, loading transition, pagination, filters never treated as proof, repeated rows, ambiguous job rows, route isolation, failed ACK retry; ZERO live requests and ZERO task counters written.');
