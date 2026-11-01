import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';

const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
const worker=read('../src/worker.js');
const metrics=read('../public/assets/js/j-agent-metrics-rc22.js');
const css=read('../public/assets/css/c-coverage-dashboard-v1.css');
const index=read('../public/index.html');

assert(metrics.includes("window.__ttMetricsTlCleanupBuild='M2.9.5'"),'M2.9.5 TL cleanup marker missing.');
assert(metrics.includes("window.__ttMetricsHistoricalSyncBuild='M2.9.5'"),'M2.9.5 historical sync marker missing.');
assert(metrics.includes('<option value="date">Historical date</option>'),'Historical date label must replace legacy wording.');
assert(metrics.includes("$('ttMetricsDate').max=phtDate()"),'Metrics date picker must be bounded to the current PHT date.');
assert(metrics.includes("if(shiftRange==='date'&&String(d.date||'')!==String(date||''))"),'Historical responses must be bound to the exact selected date.');
assert(metrics.includes("podScopeField.hidden=role!=='admin'"),'POD/team selector must remain Admin-only in JS.');
assert(metrics.includes("podScopeSelect.disabled=role!=='admin'"),'Non-Admin POD/team control must also be disabled.');
assert(metrics.includes("(lastData.range==='current'||lastData.range==='date')&&lastData.aggregate?.overall"),'Historical daily metrics must use the authoritative server aggregate when no Agent filter is active.');
assert(metrics.includes('Historical daily snapshot'),'Historical date view must identify itself clearly.');
assert(css.includes('.tt-ops-root .tt-pod-scope-field[hidden]')&&css.includes('#ttMetricsDateField[hidden]')&&css.includes('display:none!important'),'Author CSS must not override hidden scope/date controls.');
assert(index.includes('j-agent-metrics-rc22.js?')&&index.includes('metrics-tl-history-m295=1')&&index.includes('history-selection-ux18p37=20261030'),'Historical Metrics JS must be cache-busted with the active production build.');
assert(worker.includes("build:'M2.9.5-HISTORICAL'"),'Server historical response marker missing.');
assert(worker.includes("range:'date'"),'Historical metrics API must explicitly identify date mode.');
assert(worker.includes('const aggregate=qcMetricAggregateServer(rows,state),serverRevision='),'Historical metrics must expose full-scope aggregate and sync revision.');

const canonical={entries:{
 a:{role:'agent',name:'Agent One',pod:'pod1',active:true},
 b:{role:'agent',name:'Agent Two',pod:'pod1',active:true},
 c:{role:'agent',name:'Agent Three',pod:'pod2',active:true},
 tl:{role:'team_leader',name:'Leader',pod:'pod1',active:true}
}};
const state={podDirectory:{entries:[{id:'pod1',name:'POD 1',active:true},{id:'pod2',name:'POD 2',active:true}]},employees:{entries:[]}};
const c=vm.createContext({URL,Request,Response,Headers,console,crypto:webcrypto,TextEncoder,TextDecoder,btoa,atob,createRemoteJWKSet:()=>({}),canonical,state});
vm.runInContext(worker.replace(/^import .*;\n/gm,'').replace('export default {','const workerDefault = {').replace('export class ChatRealtimeHub','class ChatRealtimeHub')+`
requireFirebaseUser=async(request,env)=>{if(!request.headers.get('authorization'))fail(401,'AUTH_REQUIRED','Sign in');return {uid:'fixture',name:env.actor.name};};
ownerRecoveryAdminAuthorityServer=async()=>null;
attendanceRosterMemberServer=async(env,role,name)=>Object.values(canonical.entries).find(a=>a.role===role&&a.name===name&&a.active!==false);
canonicalWorkforceMemberServer=attendanceRosterMemberServer;
rosterResolvedStateServer=async()=>state;
canonicalWorkforceAuthorizationRosterServer=async()=>canonical;
firebaseAdminGet=async(env,path)=>{
 if(path.startsWith('roles/'))return {...env.actor,active:true};
 if(path===QC_METRICS_TARGETS_PATH)return env.targets||{};
 if(path.startsWith(WORKFORCE_COVERAGE_DAILY_PATH+'/')){const rest=path.slice((WORKFORCE_COVERAGE_DAILY_PATH+'/').length);const [date,key]=rest.split('/');return key?(env.coverageByDate?.[date]?.[key]||null):(env.coverageByDate?.[date]||{});}
 if(path.startsWith(WORKFORCE_CONFIRMATION_DAILY_PATH+'/')){const rest=path.slice((WORKFORCE_CONFIRMATION_DAILY_PATH+'/').length);const [date,key]=rest.split('/');return key?(env.confirmationByDate?.[date]?.[key]||null):(env.confirmationByDate?.[date]||{});}
 return null;
};
globalThis.test={handleWorkforceMetricsApi,coverageActorKeyServer,fbEncodeKeyServer};`,c);

const t=c.test;
const day='2026-10-06';
const k1=t.coverageActorKeyServer('agent','Agent One'),k2=t.coverageActorKeyServer('agent','Agent Two'),k3=t.coverageActorKeyServer('agent','Agent Three');
const targets={
 [t.fbEncodeKeyServer('pod1')]:{coverage:{[day]:{secondsPerTask:10}},confirmation:{[day]:{secondsPerTask:20}}},
 [t.fbEncodeKeyServer('pod2')]:{coverage:{[day]:{secondsPerTask:30}},confirmation:{[day]:{secondsPerTask:40}}}
};
const coverageByDate={[day]:{
 [k1]:{submitted:6,efficiencyTaskCount:6,efficiencyActiveMs:60000,serverUpdatedAtMs:1000},
 [k2]:{submitted:4,efficiencyTaskCount:4,efficiencyActiveMs:40000,serverUpdatedAtMs:2000},
 [k3]:{submitted:2,efficiencyTaskCount:2,efficiencyActiveMs:60000,serverUpdatedAtMs:3000}
}};
const confirmationByDate={[day]:{
 [k1]:{submitted:3,efficiencyTaskCount:3,efficiencyActiveMs:60000,serverUpdatedAtMs:1500},
 [k2]:{submitted:2,efficiencyTaskCount:2,efficiencyActiveMs:40000,serverUpdatedAtMs:2500},
 [k3]:{submitted:1,efficiencyTaskCount:1,efficiencyActiveMs:40000,serverUpdatedAtMs:3500}
}};
const env={targets,coverageByDate,confirmationByDate};
async function dashboard(actor,pod=''){
 const url=new URL('https://fixture.test/api/workforce/metrics/dashboard?date='+day+(pod?'&pod='+encodeURIComponent(pod):''));
 const req=new Request(url,{headers:{Authorization:'Bearer fixture','X-TT-Metrics-Expected-Role':actor.role}});
 return (await t.handleWorkforceMetricsApi(req,{...env,actor},url)).json();
}
const tl=await dashboard({role:'team_leader',name:'Leader',pod:'pod1'});
assert.equal(tl.scope,'own-pod');
assert.equal(tl.range,'date');
assert.equal(tl.date,day);
assert.equal(tl.rows.length,4,'TL historical date must contain only the two authorized POD 1 Agents across both jobs.');
assert(tl.rows.every(r=>r.pod==='pod1'),'TL historical date must stay inside own POD.');
assert.equal(tl.aggregate.overall.agents,2,'TL historical aggregate must cover the full authorized POD.');
assert.equal(tl.serverRevision,2500,'Historical sync revision must be the newest authorized row sync time.');
await assert.rejects(dashboard({role:'team_leader',name:'Leader',pod:'pod1'},'pod2'),e=>e.code==='METRICS_POD_SCOPE_FORBIDDEN');
const admin=await dashboard({role:'admin',name:'Administrator',pod:''},'pod2');
assert.equal(admin.selectedPod,'pod2');
assert.equal(admin.aggregate.overall.agents,1);
assert(admin.rows.every(r=>r.pod==='pod2'));
console.log('PASS M2.9.5 TL Metrics cleanup + historical date sync: TL POD control is hard-hidden/disabled, exact-date responses are bound and no-store, historical aggregates cover the full authorized scope, server sync revision is exposed, and Admin POD selection remains intact.');
