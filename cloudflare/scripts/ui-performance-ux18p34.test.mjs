import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const source=readFileSync(new URL('../public/assets/js/j-coverage-dashboard-rc20-rc2-ui3-3e92d149a5b8.js',import.meta.url),'utf8');
function harness(){
 let writes=0;
 const node=(data={})=>{
  let text='',hidden=false;
  return {dataset:new Proxy(data,{set(t,k,v){writes++;t[k]=v;return true;}}),
   get textContent(){return text;},set textContent(v){writes++;text=v;},
   get hidden(){return hidden;},set hidden(v){writes++;hidden=v;},
   classList:{toggle(){}},querySelector(){return null;}};
 };
 const agents=Array.from({length:281},(_,i)=>({name:`Agent ${i}`,status:i%2?'idle':'live',serverUpdatedAtMs:10}));
 // Calling Array.find anywhere in the tick would reintroduce the quadratic scan.
 agents.find=()=>{throw Error('Full roster scan');};
 const rows=agents.map(a=>{const n=node({coverageAgent:a.name}),parts={};
  for(const key of ['.tt-coverage-live','[data-coverage-tracker-sync]','[data-coverage-status-detail]','[data-coverage-idle-now]','[data-coverage-away-now]','[data-coverage-last-sync]'])parts[key]=node();
  n.querySelector=k=>parts[k];n.parts=parts;return n;});
 const root={querySelector:()=>null,querySelectorAll:s=>s==='[data-coverage-agent]'?rows:[]};
 const state={dashboard:{agents},statusFilter:'all'};
 const ctx={Map,String,state,$:id=>id==='ttCoverageRoot'?root:null,
  presenceCounts:()=>({}),fmtInt:String,fmtAgo:String,fmtLiveDuration:String,
  streamState:()=>({}),presenceView:a=>({status:a.status,idleNow:'2m'}),
  statusPresentation:a=>({status:a.status,label:a.status,tracker:'Connected',trackerWarning:false,detail:'Current'}),statusBucket:a=>a.status};
 vm.createContext(ctx);
 vm.runInContext(source.slice(source.indexOf('  function coverageAgentIndex('),source.indexOf('  function bindControls(')),ctx);
 return {ctx,rows,agents,state,get writes(){return writes;},reset(){writes=0;}};
}
test('281-agent live tick avoids repeated full-roster scans and unchanged DOM writes',()=>{
 const h=harness();h.ctx.updateLiveChrome();assert.ok(h.writes>0);h.reset();h.ctx.updateLiveChrome();assert.equal(h.writes,0);
 h.agents[0].status='away';h.ctx.updateLiveChrome();assert.equal(h.rows[0].parts['.tt-coverage-live'].textContent,'away');assert.ok(h.writes>0);
});
test('status filters, empty groups and duplicate-name first-match behavior survive',()=>{
 const h=harness();h.state.statusFilter='idle';h.ctx.updateLiveChrome();assert.equal(h.rows[0].hidden,true);assert.equal(h.rows[1].hidden,false);
 h.state.statusFilter='all';h.ctx.applyStatusFilter();assert.ok(h.rows.every(r=>!r.hidden));
 const a={name:'Same',status:'live'},b={name:'Same',status:'idle'};assert.equal(h.ctx.coverageAgentIndex({agents:[a,b]}).get('Same'),a);
 assert.equal(h.ctx.coverageAgentIndex({}).size,0);
});
test('cosmetic timer pauses while hidden or scrolling and resumes without changing network timers',()=>{
 const callbacks=[];let calls=0;const classes=new Set();const document={hidden:false,documentElement:{classList:{contains:k=>classes.has(k)}}};
 const code=source.match(/setInterval\(\(\)=>\{if\(state.active[^\n]+\},1000\);/)[0];
 const ctx={state:{active:true},document,updateLiveChrome:()=>calls++,setInterval:fn=>callbacks.push(fn)};
 vm.runInNewContext(code,ctx);callbacks[0]();assert.equal(calls,1);document.hidden=true;callbacks[0]();assert.equal(calls,1);
 document.hidden=false;classes.add('tt-is-scrolling');callbacks[0]();assert.equal(calls,1);classes.clear();callbacks[0]();assert.equal(calls,2);
});
test('Store Operations discovery detaches global observer, coalesces bursts and rebinds replaced roots',()=>{
 const s=readFileSync(new URL('../public/assets/js/j-staging-store-export-sync-v1.js',import.meta.url),'utf8');
 const observers=[],frames=[];let root=null,discoveries=0;
 class Observer{constructor(cb){this.cb=cb;observers.push(this);}observe(target){this.target=target;}disconnect(){this.target=null;}}
 const body={},parent={};const ctx={rootId:'ttPodDispatchRoot',MutationObserver:Observer,requestAnimationFrame:fn=>(frames.push(fn),frames.length),document:{body,getElementById:()=>root,addEventListener(){}},discover:()=>discoveries++};
 vm.runInNewContext(s.slice(s.indexOf(' let discoveryFrame='),s.lastIndexOf('})();')),ctx);
 const [rootObserver,parentObserver,finder]=observers;
 assert.equal(finder.target,body);
 root={parentNode:parent};finder.cb();assert.equal(finder.target,null);assert.equal(rootObserver.target,root);assert.equal(parentObserver.target,parent);
 rootObserver.cb();rootObserver.cb();assert.equal(frames.length,1);frames[0]();assert.equal(discoveries,2);
 const replacement={parentNode:parent};root=replacement;parentObserver.cb();assert.equal(rootObserver.target,replacement);assert.equal(parentObserver.target,parent);
 root=null;parentObserver.cb();assert.equal(rootObserver.target,null);assert.equal(finder.target,body);
 root={parentNode:parent};finder.cb();assert.equal(finder.target,null);assert.equal(rootObserver.target,root);
});
// Minimal DOM model exercises reconciliation identity/order independently of rendering.
class Element {
 constructor(tag,key='',text=''){this.nodeType=1;this.tagName=tag;this.attrs=new Map(key?[['data-coverage-agent',key]]:[]);this.childNodes=[];this.parentNode=null;this.classList={0:'',contains:k=>this.attrs.get('class')===k};if(text)this.append(new TextNode(text));}
 get attributes(){return [...this.attrs].map(([name,value])=>({name,value}));}
 hasAttribute(k){return this.attrs.has(k);}getAttribute(k){return this.attrs.get(k)??null;}setAttribute(k,v){this.attrs.set(k,v);}removeAttribute(k){this.attrs.delete(k);}
 get firstChild(){return this.childNodes[0]||null;}get nextSibling(){if(!this.parentNode)return null;return this.parentNode.childNodes[this.parentNode.childNodes.indexOf(this)+1]||null;}
 append(n){this.insertBefore(n,null);}insertBefore(n,before){if(n===before)return;n.remove();const i=before?this.childNodes.indexOf(before):this.childNodes.length;assert.ok(i>=0);this.childNodes.splice(i,0,n);n.parentNode=this;}
 remove(){if(this.parentNode){const p=this.parentNode;p.childNodes.splice(p.childNodes.indexOf(this),1);this.parentNode=null;}}
 cloneNode(deep){const n=new Element(this.tagName);n.attrs=new Map(this.attrs);if(deep)for(const c of this.childNodes)n.append(c.cloneNode(true));return n;}
}
class TextNode extends Element{constructor(text){super('#text');this.nodeType=3;this.nodeValue=text;}cloneNode(){return new TextNode(this.nodeValue);}}
test('reconcile preserves row objects/listeners and independent scrollbar during reorder/add/remove',()=>{
 const ctx={Map,Set};vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf('  function ttCoverageKey('),source.indexOf('  function bindControls(')),ctx);
 const table=new Element('TBODY');const rows=['a','b','c'].map(k=>new Element('TR',k,k));rows.forEach(r=>table.append(r));
 const rail=new Element('DIV');rail.setAttribute('class','tt-wide-table-navigation');table.insertBefore(rail,rows[1]);rows[1].listener=()=>42;
 const next=new Element('TBODY');['c','b','d'].forEach(k=>next.append(new Element('TR',k,k+' updated')));
 ctx.ttReconcileCoverageNode(table,next);
 const actual=table.childNodes.filter(n=>n!==rail);assert.deepEqual(actual.map(n=>n.getAttribute('data-coverage-agent')),['c','b','d']);
 assert.equal(actual[0],rows[2]);assert.equal(actual[1],rows[1]);assert.equal(actual[1].listener(),42);assert.equal(actual[1].firstChild.nodeValue,'b updated');assert.equal(rows[0].parentNode,null);assert.equal(rail.parentNode,table);
});
test('reconcile handles 281 rows, duplicate keys and empty replacements',()=>{
 const ctx={Map,Set};vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf('  function ttCoverageKey('),source.indexOf('  function bindControls(')),ctx);
 const current=new Element('TBODY'),next=new Element('TBODY');const rows=Array.from({length:281},(_,i)=>new Element('TR',String(i),'old'));rows.forEach(r=>current.append(r));
 [...rows].reverse().forEach(r=>next.append(new Element('TR',r.getAttribute('data-coverage-agent'),'new')));ctx.ttReconcileCoverageNode(current,next);assert.deepEqual(current.childNodes,[...rows].reverse());
 const dup=new Element('DIV'),wanted=new Element('DIV');const first=new Element('SPAN'),second=new Element('SPAN');dup.append(first);dup.append(second);wanted.append(new Element('SPAN'));wanted.append(new Element('SPAN'));ctx.ttReconcileCoverageNode(dup,wanted);assert.deepEqual(dup.childNodes,[first,second]);
 ctx.ttReconcileCoverageNode(current,new Element('TBODY'));assert.equal(current.childNodes.length,0);
});
