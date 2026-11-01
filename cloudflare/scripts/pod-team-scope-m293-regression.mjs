import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';

const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
const worker=read('../src/worker.js');
const metrics=read('../public/assets/js/j-agent-metrics-rc22.js');
const confirmation=read('../public/assets/js/j-confirmation-dashboard-rc21.js');
const css=read('../public/assets/css/c-coverage-dashboard-v1.css');
const index=read('../public/index.html');

for(const marker of ['__ttConfirmationPodScopeBuild','ttConfirmationPodField','ttConfirmationPod','All PODs / Teams','selectedGroup?.totals','selectedGroup?.agents']){
  assert(confirmation.includes(marker),`Confirmation POD/team scope marker missing: ${marker}`);
}
assert(confirmation.includes("podField.hidden=role!=='admin'"),'Confirmation POD/team selector must remain Admin-only.');
assert(confirmation.includes("friendlyPodLabel(p.pod,p.podLabel)"),'Confirmation selector must use friendly POD/team labels.');

for(const marker of ['__ttMetricsPodScopeBuild','ttMetricsPodScopeField','ttMetricsPodScope','All PODs / Teams','Selected POD / Team','POD metrics','selectedPod']){
  assert(metrics.includes(marker),`Metrics POD/team scope marker missing: ${marker}`);
}
assert(metrics.includes("podScopeField.hidden=role!=='admin'"),'Metrics POD selector must remain Admin-only.');
assert(metrics.includes("metricsPod=preferred?String(preferred.pod):'__all__'"),'Admin Metrics must default to the first authorized POD with Agents instead of All PODs.');
assert(metrics.includes("podParam=role==='admin'&&metricsPod&&metricsPod!=='__all__'"),'Selected Admin POD must be sent to the authoritative Metrics API.');
assert(metrics.includes("adminPodLabel?'All selected POD agents':'All agents'"),'Admin Agent drill-down must be narrowed to the selected POD when applicable.');
assert(css.includes('M2.9.3 — clean Team / POD scope controls'),'M2.9.3 POD/team scope styling marker missing.');
assert(index.includes('pod-team-scope-m293=1'),'M2.9.3 assets must be cache-busted.');

const canonical={entries:{
 a:{role:'agent',name:'Agent One',pod:'pod1',active:true},
 b:{role:'agent',name:'Agent Two',pod:'pod2',active:true},
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
 if(path===WORKFORCE_TRACKER_SHIFT_CURRENT_PATH)return env.currentRoot||{};
 if(path.startsWith(WORKFORCE_COVERAGE_DAILY_PATH+'/')){const rest=path.slice((WORKFORCE_COVERAGE_DAILY_PATH+'/').length);const [date,key]=rest.split('/');return key?(env.coverageByDate?.[date]?.[key]||null):(env.coverageByDate?.[date]||{});}
 if(path.startsWith(WORKFORCE_CONFIRMATION_DAILY_PATH+'/')){const rest=path.slice((WORKFORCE_CONFIRMATION_DAILY_PATH+'/').length);const [date,key]=rest.split('/');return key?(env.confirmationByDate?.[date]?.[key]||null):(env.confirmationByDate?.[date]||{});}
 return null;
};
globalThis.test={handleWorkforceMetricsApi,qcMetricsShiftsServer,coverageActorKeyServer,fbEncodeKeyServer};`,c);

const t=c.test;
const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const admin={role:'admin',name:'Administrator',pod:''},tl={role:'team_leader',name:'Leader',pod:'pod1'};
const k1=t.coverageActorKeyServer('agent','Agent One'),k2=t.coverageActorKeyServer('agent','Agent Two');
const targets={
 [t.fbEncodeKeyServer('pod1')]:{coverage:{[date]:{secondsPerTask:10}},confirmation:{[date]:{secondsPerTask:20}}},
 [t.fbEncodeKeyServer('pod2')]:{coverage:{[date]:{secondsPerTask:30}},confirmation:{[date]:{secondsPerTask:40}}}
};
const coverageByDate={[date]:{
 [k1]:{shiftSessionId:'s1',shiftGeneration:0,submitted:6,efficiencyTaskCount:6,efficiencyActiveMs:60000,serverUpdatedAtMs:Date.now()},
 [k2]:{shiftSessionId:'s2',shiftGeneration:0,submitted:8,efficiencyTaskCount:8,efficiencyActiveMs:120000,serverUpdatedAtMs:Date.now()}
}};
const confirmationByDate={[date]:{
 [k1]:{shiftSessionId:'s1',shiftGeneration:0,submitted:4,interval1:4,efficiencyTaskCount:4,efficiencyActiveMs:80000,serverUpdatedAtMs:Date.now()},
 [k2]:{shiftSessionId:'s2',shiftGeneration:0,submitted:5,interval1:5,efficiencyTaskCount:5,efficiencyActiveMs:100000,serverUpdatedAtMs:Date.now()}
}};
const currentRoot={
 [k1]:{sessionId:'s1',pod:'pod1',generation:0,status:'active',reportDate:date,startedAt:new Date().toISOString(),startedAtMs:Date.now()-3600000},
 [k2]:{sessionId:'s2',pod:'pod2',generation:0,status:'active',reportDate:date,startedAt:new Date().toISOString(),startedAtMs:Date.now()-3600000}
};
const env={actor:admin,targets,coverageByDate,confirmationByDate,currentRoot};
const agents=[canonical.entries.a,canonical.entries.b],allPods=['pod1','pod2'];

const currentUrl=new URL('https://fixture.test/api/workforce/metrics/shifts?range=current&pod=pod1');
const current=await t.qcMetricsShiftsServer(env,currentUrl,admin,'admin',state,agents,allPods);
assert.equal(current.selectedPod,'pod1');
assert.deepEqual(current.agents.map(a=>a.name),['Agent One']);
assert.equal(current.aggregate.overall.agents,1,'Selected POD aggregate must cover only the selected POD.');
assert(current.rows.every(r=>r.pod==='pod1'),'Visible current rows must stay inside the selected POD.');
assert.equal(current.pods.length,2,'Admin must retain the full authorized POD selector list.');

async function dashboard(actor,pod=''){
 const url=new URL('https://fixture.test/api/workforce/metrics/dashboard?date='+date+(pod?'&pod='+encodeURIComponent(pod):''));
 const req=new Request(url,{headers:{Authorization:'Bearer fixture','X-TT-Metrics-Expected-Role':actor.role}});
 const out=await t.handleWorkforceMetricsApi(req,{...env,actor},url);return out.json();
}
const all=await dashboard(admin);
assert.equal(all.rows.length,4,'Admin all-POD API remains backward compatible when no POD is requested.');
const selected=await dashboard(admin,'pod1');
assert.equal(selected.selectedPod,'pod1');
assert.equal(selected.rows.length,2);
assert(selected.rows.every(r=>r.pod==='pod1'));
assert.deepEqual(selected.agents.map(a=>a.name),['Agent One']);
await assert.rejects(dashboard(admin,'invented'),e=>e.code==='METRICS_POD_OUT_OF_SCOPE');
await assert.rejects(dashboard(tl,'pod1'),e=>e.code==='METRICS_POD_SCOPE_FORBIDDEN');

console.log('PASS M2.9.3 POD/Team scope: Confirmation has Admin team/POD filtering; Metrics defaults Admin to a real POD, provides full POD aggregates + POD-scoped Agent drill-down, retains All PODs on demand, and preserves TL/Agent server authorization.');
