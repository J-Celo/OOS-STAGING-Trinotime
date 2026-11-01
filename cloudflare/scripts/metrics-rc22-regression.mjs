import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import {webcrypto} from 'node:crypto';
const source=fs.readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
const canonical={entries:{a:{role:'agent',name:'Agent One',pod:'pod1',active:true},b:{role:'agent',name:'Agent Two',pod:'pod2',active:true},tl:{role:'team_leader',name:'Leader',pod:'pod1',active:true}}};
const state={podDirectory:{entries:[{id:'pod1',name:'POD 1',active:true},{id:'pod2',name:'POD 2',active:true}]},employees:{entries:[]}};
const c=vm.createContext({URL,Request,Response,Headers,console,crypto:webcrypto,TextEncoder,TextDecoder,btoa,atob,createRemoteJWKSet:()=>({}),canonical,state});
vm.runInContext(source.replace(/^import .*;\n/gm,'').replace('export default {','const workerDefault = {').replace('export class ChatRealtimeHub','class ChatRealtimeHub')+`
requireFirebaseUser=async(request,env)=>{if(!request.headers.get('authorization'))fail(401,'AUTH_REQUIRED','Sign in');return {uid:'test-user',name:env.actor.name};};
ownerRecoveryAdminAuthorityServer=async()=>null;
attendanceRosterMemberServer=async(env,role,name)=>Object.values(canonical.entries).find(a=>a.role===role&&a.name===name);
canonicalWorkforceMemberServer=attendanceRosterMemberServer;
rosterResolvedStateServer=async()=>state;
canonicalWorkforceAuthorizationRosterServer=async()=>canonical;
firebaseAdminGet=async(env,path)=>{if(env.readFailure&&!path.startsWith('roles/'))throw Error('storage unavailable');return path.startsWith('roles/')?{...env.actor,active:true}:path===QC_METRICS_TARGETS_PATH?(env.targetReadback||env.targets):path.startsWith(WORKFORCE_COVERAGE_DAILY_PATH)?env.coverage:path.startsWith(WORKFORCE_CONFIRMATION_DAILY_PATH)?env.confirmation:null;};
firebaseAdminPatch=async(env,path,updates)=>{env.updates=updates;env.targetReadback=JSON.parse(JSON.stringify(env.targets||{}));for(const [updatePath,value] of Object.entries(updates||{})){if(!updatePath.startsWith(QC_METRICS_TARGETS_PATH+'/'))continue;const parts=updatePath.slice((QC_METRICS_TARGETS_PATH+'/').length).split('/');let node=env.targetReadback;for(let i=0;i<parts.length-1;i++)node=node[parts[i]]||(node[parts[i]]={});node[parts.at(-1)]=JSON.parse(JSON.stringify(value));}};
globalThis.test={handleWorkforceMetricsApi,qcMetricRowServer,qcMetricTargetServer,coverageActorKeyServer,fbEncodeKeyServer,coverageSanitizeSummaryServer,confirmationSanitizeSummaryServer};`,c);
const t=c.test,date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const admin={role:'admin',name:'Administrator',pod:''},tl={role:'team_leader',name:'Leader',pod:'pod1'},agent={role:'agent',name:'Agent One',pod:'pod1'};
const targets={[t.fbEncodeKeyServer('pod1')]:{coverage:{[date]:{secondsPerTask:10}},confirmation:{[date]:{secondsPerTask:20}}},[t.fbEncodeKeyServer('pod2')]:{coverage:{[date]:{secondsPerTask:30}}}};
const coverage={[t.coverageActorKeyServer('agent','Agent One')]:{submitted:5,efficiencyTaskCount:4,efficiencyActiveMs:60000}};
const confirmation={[t.coverageActorKeyServer('agent','Agent One')]:{submitted:5,efficiencyTaskCount:4,efficiencyActiveMs:60000}};
async function call(actor,{path='dashboard',body,auth=true,...extra}={}){const env={actor,targets,coverage,confirmation,...extra};const url=new URL('https://test/api/workforce/metrics/'+path+'?date='+date);const r=await t.handleWorkforceMetricsApi(new Request(url,{method:body?'POST':'GET',headers:{...(auth?{Authorization:'Bearer fixture'}:{}),'content-type':'application/json','x-tt-metrics-expected-role':actor.role},...(body?{body:JSON.stringify(body)}:{})}),env,url);return {data:await r.json(),env};}
const d=(await call(admin)).data;assert.equal(d.scope,'all-pods');assert.equal(d.rows.length,4);assert.equal(d.rows[0].secondsPerTask,15);assert.equal(d.rows[0].grade,'C');assert.equal(d.rows[1].grade,'A');assert.equal(d.rows[2].grade,null);
assert.equal((await call(tl)).data.rows.length,2);assert((await call(tl)).data.rows.every(r=>r.pod==='pod1'));assert((await call(agent)).data.rows.every(r=>r.name==='Agent One'));
const body={pod:'pod1',job:'coverage',secondsPerTask:12,effectiveDate:date};
const saved=await call(admin,{path:'targets',body});assert(Object.values(saved.env.updates).length>=1);assert(Object.values(saved.env.updates).every(v=>v.secondsPerTask===12));assert(Object.keys(saved.env.updates).some(k=>k.includes(t.fbEncodeKeyServer('pod1'))),'canonical target alias written');
for(const role of [tl,agent])await assert.rejects(call(role,{path:'targets',body}),e=>e.code==='METRICS_ADMIN_REQUIRED');
await assert.rejects(call(admin,{path:'targets',body:{...body,pod:'invented'}}),e=>e.code==='METRICS_TARGET_INVALID');
for(const secondsPerTask of [0,-5,Infinity,90000])await assert.rejects(call(admin,{path:'targets',body:{...body,secondsPerTask}}),e=>e.code==='METRICS_TARGET_INVALID');
await assert.rejects(call(admin,{auth:false}),e=>e.code==='AUTH_REQUIRED');await assert.rejects(call(admin,{readFailure:true}),/storage unavailable/);
for(const [ms,grade] of [[10000,'A'],[12500,'B'],[15000,'C'],[25000,'D'],[26000,'F']])assert.equal(t.qcMetricRowServer(agent,'coverage',{submitted:1,efficiencyTaskCount:1,efficiencyActiveMs:ms},{secondsPerTask:10},'POD1').grade,grade);
for(const raw of [null,{submitted:0},{submitted:1,efficiencyTaskCount:1,efficiencyActiveMs:0},{submitted:1,efficiencyTaskCount:2,efficiencyActiveMs:5000}])assert.equal(t.qcMetricRowServer(agent,'coverage',raw,{secondsPerTask:10},'POD1').grade,null);
assert.equal(t.qcMetricRowServer(agent,'coverage',{submitted:1,efficiencyTaskCount:1,efficiencyActiveMs:10000},null,'POD1').grade,null);
const h={[t.fbEncodeKeyServer('pod1')]:{coverage:{'2026-01-01':{secondsPerTask:10},'2026-10-01':{secondsPerTask:20}}}};
assert.equal(t.qcMetricTargetServer(h,'pod1','coverage','2026-09-01').secondsPerTask,10);assert.equal(t.qcMetricTargetServer(h,'pod1','coverage','2026-10-05').secondsPerTask,20);
console.log('PASS metrics: canonical Admin/TL/Agent scopes; per-POD/per-job targets; A/B/C/D/F boundaries; missing timing/target ungraded; only Admin writes; invalid POD/target denied; errors fail closed; effective-date target selection');

for(const sanitize of [t.coverageSanitizeSummaryServer,t.confirmationSanitizeSummaryServer]){const s=sanitize({submitted:4,interval1:4,efficiencyTaskCount:4,efficiencyActiveMs:60000});assert.equal(s.efficiencyTaskCount,4);assert.equal(s.efficiencyActiveMs,60000);}
console.log("PASS both ingest sanitizers preserve measured task counts and active time");
