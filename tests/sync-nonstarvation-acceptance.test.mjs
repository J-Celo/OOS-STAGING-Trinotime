import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'tracker/manifest.json'),'utf8'));
assert.equal(manifest.version,'2.2.63');
let checks=0;
const check=(condition,label)=>{assert.ok(condition,label);console.log(`PASS ${++checks} ${label}`);};
for(const flow of ['coverage','confirmation']){
  const source=fs.readFileSync(path.join(root,`tracker/${flow}-background.js`),'utf8');
  const start=source.indexOf('function scheduleSyncSoon(delayMs=900) {');
  const end=source.indexOf('\n}',start);
  assert.ok(start>=0&&end>start,`${flow}: scheduler found`);
  const scheduler=source.slice(start,end+2);
  function harness(){
    let clock=10000,nextId=0;
    const timers=new Map(),fired=[];
    const FakeDate={now:()=>clock};
    const context=vm.createContext({Date:FakeDate,Math,Number,
      setTimeout:(fn,ms)=>{const id=++nextId;timers.set(id,{at:clock+ms,fn});return id;},
      clearTimeout:(id)=>timers.delete(id),
      syncWakeTimer:null,syncWakeDueAt:0,syncInFlight:null,
      syncFollowUpRequested:false,syncBackoffUntil:0,lastSyncAttemptAt:0,
      syncDirty:async force=>{fired.push({at:clock,force});return {ok:true};}
    });
    vm.runInContext(scheduler+'\nglobalThis.schedule=scheduleSyncSoon;',context);
    return {ctx:context,fired,now:()=>clock,due:()=>Math.min(Infinity,...[...timers.values()].map(t=>t.at)),
      advance:(delta)=>{clock+=delta;},
      run:()=>{let executed=0;for(let i=0;i<50;i++){
        const entry=[...timers.entries()].filter(([id,t])=>t.at<=clock).sort((a,b)=>a[1].at-b[1].at)[0];
        if(!entry)break;timers.delete(entry[0]);entry[1].fn();executed++;
      }return executed;},timerCount:()=>timers.size};
  }
  let s=harness();s.ctx.schedule(1200);
  check(s.due()===11200,`${flow}: initial slow event schedules expected wake`);
  for(let i=0;i<10;i++){s.advance(100);s.ctx.schedule(1200);}
  check(s.due()===11200&&s.timerCount()===1,`${flow}: continuous events cannot starve a scheduled upload`);
  s.advance(200);s.run();
  check(s.fired.length===1&&s.fired[0].at===11200,`${flow}: busy stream fires sync on original deadline`);
  s=harness();s.ctx.schedule(1200);s.advance(100);s.ctx.schedule(200);
  check(s.due()===10300&&s.timerCount()===1,`${flow}: urgent submission expedites existing sync`);
  s.advance(200);s.run();check(s.fired.length===1,`${flow}: expedited sync still fires once`);
  s=harness();s.ctx.syncInFlight={};s.ctx.schedule(200);
  check(s.ctx.syncFollowUpRequested===true&&s.timerCount()===0,`${flow}: in-flight sync receives follow-up signal, not parallel timer`);
  s=harness();s.ctx.lastSyncAttemptAt=10000;s.ctx.schedule(200);
  check(s.due()===10500,`${flow}: existing minimum sync gap preserved`);
  s=harness();s.ctx.syncBackoffUntil=17000;s.ctx.schedule(200);s.advance(2000);s.ctx.schedule(200);
  check(s.due()===17000,`${flow}: retry backoff cannot be bypassed by new activity`);
  s.advance(5000);s.run();check(s.fired.length===1&&s.fired[0].at===17000,`${flow}: retry happens after backoff`);
  s=harness();s.ctx.syncBackoffUntil=14000;s.ctx.schedule(200);
  s.advance(2000);s.ctx.syncBackoffUntil=18000;s.advance(2000);s.run();
  check(s.fired.length===0&&s.due()===18000,`${flow}: increased backoff during wait prevents premature upload`);
  s.advance(4000);s.run();
  check(s.fired.length===1&&s.fired[0].at===18000,`${flow}: postponed backoff eventually fires once`);
  check(source.includes('syncWakeDueAt=0;')&&source.includes('chrome.alarms.create'),`${flow}: explicit sync cancellation and minute-alarm fallback retained`);
  check(!source.includes('chrome.storage.local.clear('),`${flow}: no destructive storage reset`);
  check(source.includes('acceptedSequence')&&source.includes('TRACKER_SEQUENCE_CONFLICT'),`${flow}: verified-ACK and guarded sequence transport retained`);
}
console.log(`PASS non-starving sync scheduling: ${checks} synthetic checks; no production network`);
