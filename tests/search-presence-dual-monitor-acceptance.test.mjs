import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const src=fs.readFileSync(path.join(root,'tracker/search-presence.js'),'utf8');
const test=(name,ok)=>{assert.ok(ok,name);console.log('PASS',name);};
let time=1_800_000_000_000,os='active';
const store=new Map();
const clock=class extends Date {static now(){return time;}};
function context(){
 const page={window:{},Date:clock,JSON,Number,String,Math,console,
  sessionStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},
  chrome:{runtime:{sendMessage:async()=>({state:os})}}};
 vm.runInNewContext(src,page);
 return page.window.TrinoTimeSearchPresence.create;
}
const make=context();
let searching=make('coverage');
test('no active shift does not grant search allowance',searching.sync(false,false)===false&&searching.state()==='idle');
searching.sync(false,true);
test('active Coverage queue gets two-minute SEARCHING grace',searching.state()==='searching');
time+=110_000;
test('initial grace available before two-minute boundary',searching.state()==='searching');
searching.record({type:'scroll',isTrusted:true},false,true);
time+=30_000;
test('genuine store-list interaction extends allowance',searching.state()==='searching');
const stateBefore=searching.state();searching.record({type:'scroll',isTrusted:false},false,true);
time+=121_000;
test('untrusted/synthetic events cannot extend search allowance',stateBefore==='searching'&&searching.state()==='idle');
searching.record({type:'pointerdown',isTrusted:true},false,true);
test('new trusted store interaction resumes within bounded visit',searching.state()==='searching');
time+=40_000;
test('hard five-minute queue cap prevents indefinite searching',searching.state()==='idle');
const fresh=context()('coverage');
test('same-tab reload cannot reset queue cap',fresh.state()==='idle');
fresh.sync(true,true);
fresh.sync(false,true);
test('new task followed by queue return starts a new search window',fresh.state()==='searching');
// Dual monitor behavior: the OS is active even when the Augmoto tab lacks focus.
os='active';await fresh.poll(true);
test('second-monitor use does not count as AWAY',!fresh.isAway());
os='idle';await fresh.poll(true);
test('five-minute OS inactivity is AWAY and never SEARCHING',fresh.isAway()&&fresh.state()==='idle');
os='locked';await fresh.poll(true);
test('locked screen counts as AWAY',fresh.isAway());
os='active';await fresh.poll(true);
test('OS input restores non-AWAY without any tab-focus requirement',!fresh.isAway());
fresh.sync(false,false);
test('Time Out clears per-tab search state',fresh.state()==='idle');
let confirmation=context()('confirmation');confirmation.sync(false,true);
test('Confirmation has independent searching allowance',confirmation.state()==='searching');
// Verify scoped production packages and preservation of separate time buckets.
const manifest=JSON.parse(fs.readFileSync(path.join(root,'tracker/manifest.json'),'utf8'));
test('Chrome OS-idle permission is present',manifest.permissions.includes('idle'));
test('searching helper precedes content scripts',manifest.content_scripts[0].js.indexOf('search-presence.js') < manifest.content_scripts[0].js.indexOf('coverage.js'));
test('new OS-idle permission does not broaden website access',JSON.stringify(manifest.host_permissions)===JSON.stringify(['https://labeling-tools.augmoto.com/*','https://oostrinotime-staging-qa.trinoadmin.workers.dev/*']));
const bg=fs.readFileSync(path.join(root,'tracker/background.js'),'utf8');
test('worker uses OS idle query, not browser focus',bg.includes('chrome.idle.queryState(300)')&&bg.includes("message?.type!=='tt-system-presence'"));
for(const flow of ['coverage','confirmation']){
 const f=fs.readFileSync(path.join(root,'tracker',flow+'.js'),'utf8');
 const b=fs.readFileSync(path.join(root,'tracker',flow+'-background.js'),'utf8');
 test(`${flow} keeps SEARCHING separate from task ACTIVE and IDLE`,f.includes("searchingMs: state === 'searching' ? delta : 0")||f.includes("searchingMs:state==='searching'?delta:0"));
 test(`${flow} persists SEARCHING time without overwriting historical records`,b.includes('s.searchingMs=num(s.searchingMs)+searching')&&b.includes("'searchingMs','graceMs','unverifiedMs','elapsedMs'"));
 test(`${flow} recognizes SEARCHING as a valid presence state`,b.includes("'searching', 'grace', 'unverified', 'paused'"));
}
console.log('PASS production search buffer and dual-monitor offline acceptance');
