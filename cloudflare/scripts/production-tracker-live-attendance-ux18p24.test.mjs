/**
 * UX18P24: read-only dashboard freshness and attendance-binding regression.
 * Does not access Firebase, Cloudflare, Augmoto, or real Agent records.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
const home=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const worker=readFileSync(resolve(home,'src/worker.js'),'utf8');
const coverage=readFileSync(resolve(home,'public/assets/js/j-coverage-dashboard-rc20.js'),'utf8');
const confirmation=readFileSync(resolve(home,'public/assets/js/j-confirmation-dashboard-rc21.js'),'utf8');
function expect(text,needle,ctx){assert.ok(text.includes(needle),`Missing ${ctx}: ${needle.slice(0,80)}`);}
const start=worker.indexOf('const WORKFORCE_TRACKER_LIVE_MS =');
const end=worker.indexOf('function coverageDashboardRowServer(',start);
assert.ok(start>0 && end>start,'server live evidence helper is present');
const helper=new Function(worker.slice(start,end)+'\nreturn trackerDashboardLiveEvidenceServer;')();
const now=1793214000000;
const row={shiftStatus:'active',shiftLocked:false,shiftSessionId:'test-shift-only',shiftStartedAt:'2026-10-28T01:00:00.000Z',serverUpdatedAtMs:now-10_000};
assert.deepEqual(helper(row,now),{timeInAtLastSync:true,liveNow:true,delayedNow:false,timeOutRecorded:false});
assert.equal(helper({...row,serverUpdatedAtMs:now-100_000},now).delayedNow,true,'slow tracker is delayed not live');
assert.equal(helper({...row,serverUpdatedAtMs:now-240_000},now).liveNow,false,'old accepted sync not live');
assert.equal(helper({...row,serverUpdatedAtMs:now-240_000},now).delayedNow,false,'old accepted sync not delayed');
assert.equal(helper({...row,shiftStatus:'completed',shiftLocked:true,serverUpdatedAtMs:now},now).liveNow,false,'fresh Time Out finalization never live');
assert.equal(helper({...row,shiftStatus:'completed',shiftLocked:true,serverUpdatedAtMs:now},now).timeOutRecorded,true,'time-out is clearly identified');
assert.equal(helper({...row,shiftStatus:'not_clocked_in',serverUpdatedAtMs:now},now).liveNow,false,'not clocked in never live');
assert.equal(helper({...row,shiftSessionId:'',serverUpdatedAtMs:now},now).liveNow,false,'not bound to verified shift never live');
assert.equal(helper({...row,shiftStartedAt:null,serverUpdatedAtMs:now},now).liveNow,false,'missing Time In evidence never live');
assert.equal(helper(null,now).liveNow,false,'no record never live');
function getFunction(source,name){
  const pos=source.indexOf('function '+name+'(');assert.ok(pos>=0,'missing '+name);
  const open=source.indexOf('{',pos),stop=source.indexOf('\n  function ',open+1);
  assert.ok(open>pos&&stop>open,'missing end for '+name);
  return source.slice(pos,stop);
}
// Dynamic UI status tests independently verify stale/timed-out/active logic.
const coverageStatus=new Function('const DEFAULT_IDLE_THRESHOLD_MS=300000;'+getFunction(coverage,'statusLabel')+'\nreturn statusLabel;')();
const confirmationState=new Function('const DEFAULT_IDLE_THRESHOLD_MS=300000;'+getFunction(confirmation,'liveState')+'\nreturn liveState;')();
const actualNow=Date.now();
const cases=[
 [{...row,connected:true,timeInAtLastSync:true,serverUpdatedAtMs:actualNow-5_000,trackerState:'active',currentJob:'JOB_123'},'active'],
 [{...row,connected:true,timeInAtLastSync:true,serverUpdatedAtMs:actualNow-110_000,trackerState:'active'},'stale'],
 [{...row,connected:true,timeInAtLastSync:true,serverUpdatedAtMs:actualNow-210_000,trackerState:'active'},'offline'],
 [{...row,connected:true,timeInAtLastSync:false,shiftStatus:'completed',shiftLocked:true,serverUpdatedAtMs:actualNow,trackerState:'active'},'offline'],
 [{...row,connected:false,timeInAtLastSync:false,serverUpdatedAtMs:0},'offline']
];
for (const [sample,want] of cases){assert.equal(coverageStatus(sample),want,'Coverage UI '+want);assert.equal(confirmationState(sample),want,'Confirmation UI '+want);}
for(const flow of ['coverage','confirmation']){
 const start=worker.indexOf(`async function ${flow}DashboardServer(`);
 const end=worker.indexOf('\nasync function ',start+20);
 const section=worker.slice(start,end);
 expect(section,'if (row.liveNow) sum.liveAgents++;',flow+' live totals');
 expect(section,'if(row.liveNow)group.totals.liveAgents++;',flow+' pod live totals');
 expect(section,'generatedAtMs:Date.now(), liveFreshnessMs:',flow+' freshness metadata');
 expect(section,'if (row.connected) { sum.connectedAgents++;',flow+' preserve reporting totals');
 const rowName=flow==='coverage'?'coverageDashboardRowServer':'confirmationDashboardRowServer';
 const rowStart=worker.indexOf('function '+rowName+'('),rowEnd=worker.indexOf('\n}',rowStart);
 expect(worker.slice(rowStart,rowEnd),'...trackerDashboardLiveEvidenceServer(row)',flow+' row evidence');
}
expect(coverage,"${group.totals.liveAgents||0} Coverage live",'Coverage POD live indicator');
expect(coverage,"if(Number(d?.totals?.liveAgents)>0&&age<=90000)",'Coverage global LIVE only with verified live agent');
expect(coverage,'},6000);','Coverage polling budget');
expect(confirmation,'},6000);','Confirmation polling budget');
expect(confirmation,"r.liveNow?'is-live':''",'Confirmation interval styling');
assert.equal(worker.includes('if(shift.status!==\'active\'||!shift.sessionId)'),true,'Coverage server keeps active shift gate');
assert.equal(worker.includes("if(shift.status!=='active'||!shift.sessionId)"),true,'Confirmation and Coverage retain active shift gate');
const mixed=[row,{...row,shiftStatus:'completed',shiftLocked:true,serverUpdatedAtMs:now},{...row,serverUpdatedAtMs:now-240_000}];
assert.equal(mixed.filter(x=>helper(x,now).liveNow).length,1,'only one genuine live Tracker out of mixed historical records');
console.log('PASS UX18P24: server active shift evidence + fresh sync, stale/suspended/Time Out detection, both dashboards, POD reporting totals preserved, reduced polling, no Firebase writes');
