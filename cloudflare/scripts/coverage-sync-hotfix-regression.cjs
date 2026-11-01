const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const base=path.join(__dirname,'..');
const zip=path.join(base,'fixtures/TrinoTime-QC-Tracker-v2.2.32.zip');
const read=n=>{
 const data=fs.readFileSync(zip);
 for(let i=0;i<data.length-46;i++) if(data.readUInt32LE(i)===0x02014b50){
  const len=data.readUInt16LE(i+28),name=data.subarray(i+46,i+46+len).toString();
  if(name===n){const off=data.readUInt32LE(i+42),start=off+30+data.readUInt16LE(off+26)+data.readUInt16LE(off+28),raw=data.subarray(start,start+data.readUInt32LE(i+20));return (data.readUInt16LE(i+10)===8?require('node:zlib').inflateRawSync(raw):raw).toString();}
 }
 throw new Error('Missing archive entry: '+n);
};
const manifest=JSON.parse(read('manifest.json'));
assert.equal(manifest.version,'2.2.32');
assert.match(manifest.name,/STAGING QA/);
assert(manifest.host_permissions.includes('https://oostrinotime-staging-qa.trinoadmin.workers.dev/*'));
assert(!manifest.host_permissions.includes('https://oos.trinotime.com/*'));

const coverage=read('coverage.js');
assert(coverage.includes('reconcileStableCreatedCounter'), 'Coverage must reconcile Create from real Augmoto state');
assert(coverage.includes('reconcileStableCoverageCounters'), 'Coverage must reconcile Person/Delete from real Augmoto counters');
assert(coverage.includes('explicit No-Match actions only') || coverage.includes('explicit No-Match'), 'Coverage must keep explicit No-Match semantics');
const scanBody=coverage.slice(coverage.indexOf('function scan()'), coverage.indexOf("document.addEventListener('click'"));
assert(!/hudExpanded\s*===\s*false[\s\S]{0,100}(?:return|scan)/.test(scanBody), 'HUD minimization must not gate Coverage scanning');

const confirmation=read('confirmation.js');
assert(confirmation.includes("h.jobId!==pending.jobId") || confirmation.includes('h.jobId !== pending.jobId'), 'Confirmation must confirm a pending Submit on cross-job transition');
assert(confirmation.includes("label==='exit'||label==='skip'") || confirmation.includes("label === 'skip'"), 'Confirmation must preserve Skip exclusion');

(async()=>{
 let store={catShiftSessionV1:{sessionId:'shift-test',generation:0,status:'active',locked:false,reportDate:'2026-10-06'}};
 const chrome={storage:{local:{get:async keys=>{
  if(Array.isArray(keys)){const o={};for(const k of keys)o[k]=structuredClone(store[k]);return o;}
  if(typeof keys==='string')return {[keys]:structuredClone(store[keys])};
  return structuredClone(store);
 },set:async v=>{Object.assign(store,structuredClone(v));}}}};
 const b=vm.createContext({chrome,console,Date,Intl,URL,setTimeout:()=>1,clearTimeout(){},structuredClone});
 let bg=read('coverage-background.js');
 bg=bg.slice(0,bg.indexOf('chrome.runtime.onInstalled.addListener'))+'globalThis.test={applyEvent,readCore};})();';
 vm.runInContext(bg,b);
 const baseEvent={date:'2026-10-06',jobId:'JOB_TEST',taskIndex:1,totalTasks:10,timestamp:Date.now(),trackerState:'active'};
 await b.test.applyEvent({...baseEvent,eventId:'task-start',type:'task-start'});
 for(let i=1;i<=8;i++) await b.test.applyEvent({...baseEvent,eventId:'created-'+i,type:'created'});
 await b.test.applyEvent({...baseEvent,eventId:'nm-set',type:'no-match-set',area:'3'});
 await b.test.applyEvent({...baseEvent,eventId:'nm-set-dup',type:'no-match-set',area:'3'});
 await b.test.applyEvent({...baseEvent,eventId:'nm-clear',type:'no-match-clear',area:'3'});
 await b.test.applyEvent({...baseEvent,eventId:'submit-pending',type:'submit-pending'});
 await b.test.applyEvent({...baseEvent,eventId:'submit-confirmed',type:'submit-confirmed'});
 const core=await b.test.readCore();
 const day=core.data.dates['2026-10-06'];
 assert.equal(day.summary.created,8,'Eight confirmed Create events must be retained');
 assert.equal(day.summary.noMatch,0,'Explicit No-Match set/duplicate/clear must be idempotent');
 assert.equal(day.summary.submitted,1,'Confirmed Submit must increment once');
 console.log('PASS Tracker v2.2.29 shift-bound background counters: Create x8, No-Match idempotence, Submit confirmation');

 const dashboard=fs.readFileSync(path.join(base,'public/assets/js/j-coverage-dashboard-rc20.js'),'utf8');
 const render=dashboard.slice(dashboard.indexOf('  function render(){'),dashboard.indexOf('  function renderError('));
 const wrap=(pod,x,y)=>({scrollLeft:x,scrollTop:y,closest:()=>({dataset:{coveragePod:pod}})});
 let wraps=[wrap('pod1',630,25),wrap('pod2',145,0)];
 const root={querySelectorAll:()=>wraps,set innerHTML(v){wraps=[wrap('pod2',0,0),wrap('pod1',0,0)];}};
 const d=vm.createContext({$:()=>root,state:{dashboard:{pods:[],agents:[]}},actor:()=>({role:'admin'}),friendlyPodLabel:()=>'',adminPods:()=>'',liveBadge:()=>'',esc:x=>x,dateControl:()=>'',presenceSummary:()=>'',summaryCards:()=>'',bridgePanel:()=>'',bindControls:()=>{}});
 vm.runInContext(render+'render();',d);
 assert.equal(wraps[0].scrollLeft,145);assert.equal(wraps[1].scrollLeft,630);assert.equal(wraps[1].scrollTop,25);
 console.log('PASS dashboard: horizontal/vertical positions survive refresh and POD reorder');
 console.log('PASS — bundled QC Tracker v2.2.29 staging acceptance regression');
})().catch(e=>{console.error(e);process.exitCode=1;});
