import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
const src=read('../src/worker.js');
const ctx=vm.createContext({URL,Headers,Request,Response,console,crypto:webcrypto,TextEncoder,TextDecoder,btoa,atob,structuredClone,createRemoteJWKSet:()=>({})});
vm.runInContext(src.replace(/^import .*;\n/gm,'').replace('export default {','const workerDefault = {').replace('export class ChatRealtimeHub','class ChatRealtimeHub')+`
// Synthetic authenticated Agent bridges, with canonical POD/role asserted.
coverageRequireBridgeActorServer=async req=>req.bridge;
confirmationRequireBridgeActorServer=async req=>req.bridge;
requireWorkforceAttendanceActor=async req=>req.actor;
coverageVisibleAgentsServer=async(env,actor)=>({agents:actor.role==='admin'?env.agents:actor.role==='team_leader'?env.agents.filter(a=>a.pod===actor.pod):env.agents.filter(a=>a.name===actor.name)});
coverageActorKeyServer=(_,name)=>name.toLowerCase();
fbEncodeKeyServer=s=>String(s);
parseBody=async req=>req.body;
firebaseAdminGet=async(env,path)=>{if(Object.hasOwn(env.data,path))return env.data[path];const records=Object.entries(env.data).filter(([key])=>key.startsWith(path+'/'));return records.length?Object.fromEntries(records.map(([key,value])=>[key.slice(path.length+1),value])):null;};
firebaseAdminGetWithEtag=async(env,path)=>({value:env.data[path]||null,etag:'mock-etag'});
firebaseAdminSetIfMatch=async(env,path,value,etag)=>{assertMockEtags.push(etag);env.data[path]=value;return {preconditionFailed:false};};
const assertMockEtags=[];
globalThis.v2={ingest:storeObservedV2IngestServer,report:storeIntelReportServer,path:storeObservedV2Path};`,ctx);
const d='2026-10-21';
const rows=(name,pod,jobId,submitted,storeName='')=>({name,pod,jobId,storeName,submitted,activeMs:submitted*15000,status:'active'});
const env={agents:[{name:'Anthony Antipatia',pod:'POD 11'},{name:'Agent Two',pod:'POD 11'},{name:'Agent Other',pod:'POD 12'}],data:{
 [`workforceCoverage/v1/jobs/${d}`]:{'anthony antipatia':{a:rows('Anthony Antipatia','POD 11','JOB_286153999',1)},'agent two':{b:rows('Agent Two','POD 11','JOB_286153999',3)},'agent other':{c:rows('Agent Other','POD 12','JOB_286153999',9)}},
 [`workforceConfirmation/v1/jobs/${d}`]:{'anthony antipatia':{a:rows('Anthony Antipatia','POD 11','JOB_287355131',4)}}
}};
const bridge={name:'Anthony Antipatia',pod:'POD 11',uid:'u-11'};
const observer=(workflow,observations,who=bridge)=>({bridge:who,body:{observations}});
const evidence=(id,name)=>({jobId:id,storeName:name,source:'augmoto-job-row'});
const view=(role='team_leader',pod='POD 11',name='TL')=>({actor:{role,pod,name},headers:new Headers()});
const url=new URL(`https://example.test/api/workforce/metrics/stores?date=${d}`);
const before=await ctx.v2.report(view(),env,url,'metrics');
assert.equal(before.unknownJobs,3);
const orig=JSON.stringify(env.data[`workforceCoverage/v1/jobs/${d}`]);
assert.equal((await ctx.v2.ingest(observer('coverage',[evidence('JOB_286153999','Chemist Warehouse - Rooty Hill')]),env,'coverage')).accepted,1);
const after=await ctx.v2.report(view(),env,url,'metrics');
const cov=after.jobs.filter(j=>j.workflow==='coverage'&&j.pod==='POD 11');
assert.equal(cov.length,2);
assert(cov.every(j=>j.mappingStatus==='recovered'&&j.storeName==='Chemist Warehouse - Rooty Hill'));
assert(after.jobs.some(j=>j.workflow==='confirmation'&&j.mappingStatus==='unknown'),'Coverage cannot create a Confirmation mapping');
assert(!after.jobs.some(j=>j.pod==='POD 12'),'TL cannot see a different POD');
assert.equal(after.jobs.reduce((s,j)=>s+j.submitted,0),before.jobs.reduce((s,j)=>s+j.submitted,0));
assert.equal(JSON.stringify(env.data[`workforceCoverage/v1/jobs/${d}`]),orig,'Never write historical job records');
assert.equal((await ctx.v2.ingest(observer('confirmation',[evidence('JOB_287355131','Chemist Warehouse - Charlestown')]),env,'confirmation')).accepted,1);
const recovered=await ctx.v2.report(view(),env,url,'metrics');
assert.equal(recovered.jobs.find(j=>j.workflow==='confirmation').storeName,'Chemist Warehouse - Charlestown');
// A conflicting later exact-ID/store observation never overwrites attribution.
await ctx.v2.ingest(observer('coverage',[evidence('JOB_286153999','Chemist Warehouse - Brisbane')]),env,'coverage');
const clash=await ctx.v2.report(view(),env,url,'metrics');
assert(clash.jobs.filter(j=>j.workflow==='coverage').every(j=>j.mappingStatus==='conflict'&&j.storeName==='Needs review'));
assert.equal(clash.jobs.reduce((s,j)=>s+j.submitted,0),before.jobs.reduce((s,j)=>s+j.submitted,0));
await assert.rejects(ctx.v2.ingest(observer('coverage',[evidence('JOB_286153999','Unknown Store')]),env,'coverage'));
await assert.rejects(ctx.v2.ingest(observer('coverage',[{...evidence('JOB_286153999','Chemist Warehouse - Rooty Hill'),source:'filter'}]),env,'coverage'));
await assert.rejects(ctx.v2.ingest(observer('coverage',[evidence('JOB_286153999','Store One'),evidence('JOB_286153999','Store Two')]),env,'coverage'));
assert.equal((await ctx.v2.report(view('admin','','Admin'),env,url,'metrics')).jobs.length,4,'Admin can inspect authorized roster-wide jobs');
const u=new URL(url);u.searchParams.set('pod','POD 12');await assert.rejects(ctx.v2.report(view(),env,u,'metrics'),'TL cannot choose another POD');
// The observer only transmits the currently rendered /labeling workflow.
const observerSrc=read('../../tracker/store-intelligence.js');
assert(observerSrc.includes("for(const type of [active==='coverage'?'cat-store-observed':'cft-store-observed'])"));
assert(observerSrc.includes('activeJobsWorkflow()')&&observerSrc.includes('listReady()'));
for(const workflow of ['coverage','confirmation']){
 const bg=read(`../../tracker/${workflow}-background.js`);
 assert(bg.includes('syncStoreMappingMetadata()'));
 assert(bg.includes('v.observedFor===owner'),'Evidence must remain account/POD scoped between browser sessions');
 assert(bg.includes(`/api/workforce/${workflow}/store-observations`));
}
console.log('PASS Store Mapping Recovery V2: Coverage/Confirmation separation, exact-ID evidence, completed-shift report overlay, two-agent shared jobs, role/POD isolation, conflict quarantine, payload validation, zero counter/history mutations.');
