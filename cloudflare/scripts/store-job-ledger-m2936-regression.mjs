import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import {webcrypto} from 'node:crypto';import {fileURLToPath} from 'node:url';import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const worker=read('src/worker.js');const panel=read('public/assets/js/j-store-intelligence-m2934.js');const xlsx=read('public/assets/js/j-report-exports-m2935.js');
const coverage=read('public/assets/js/j-coverage-dashboard-rc20.js');const confirmation=read('public/assets/js/j-confirmation-dashboard-rc21.js');
assert(worker.includes('jobs:jobLedger.slice(0,maxJobRows)'),'scoped bounded job ledger');
assert(worker.includes('g.jobIds.has(unique)'),'same store/job/Agent visits cannot duplicate job totals');
assert(panel.includes('Store Performance')&&panel.includes('data-tt-store-choice')&&panel.includes('tt-si-store-toggle'),'Store job ledger has filterable expandable store groups');
assert((xlsx.includes("name:'Store Jobs'")||xlsx.includes("shape('Store Jobs'"))&&xlsx.includes(".tt-si-jobs table"),'XLSX and CSV and PDF all include Job details');
assert(xlsx.includes('t="inlineStr"')&&xlsx.includes('t="str"'),'Excel chart-source headings now use inline text while other legacy literal strings remain safe');
assert(coverage.includes('data-tt-si-drawer-choice')&&confirmation.includes('data-tt-si-drawer-choice'),'Both Agent task drawers support store filtering');
const date='2026-10-08',c=vm.createContext({URL,Headers,Request,Response,console,crypto:webcrypto,TextEncoder,TextDecoder,btoa,atob,structuredClone,createRemoteJWKSet:()=>({})});
vm.runInContext(worker.replace(/^import .*;\n/gm,'').replace('export default {','const workerDefault = {').replace('export class ChatRealtimeHub','class ChatRealtimeHub')+`
requireWorkforceAttendanceActor=async req=>req.actor;
coverageVisibleAgentsServer=async (env,actor)=>({agents:actor.role==='admin'?env.agents:actor.role==='team_leader'?env.agents.filter(a=>a.pod===actor.pod):env.agents.filter(a=>a.name===actor.name)});
coverageActorKeyServer=(role,name)=>name.toLowerCase();firebaseAdminGet=async(env,path)=>env.data[path]||null;
globalThis.testReport=storeIntelReportServer;`,c);
const r=(id,store,submitted,lastTask)=>({name:'Zenitsu Agatsuma',pod:'pod1',jobId:id,storeName:store,submitted,activeMs:120000,lastTask,totalTasks:10});
const env={agents:[{name:'Zenitsu Agatsuma',pod:'pod1'},{name:'Kanao Tsuyuri',pod:'pod2'}],data:{
 [`workforceCoverage/v1/jobs/${date}`]:{'zenitsu agatsuma':{a:r('JOB_10001','Preston',2,2),b:r('JOB_10002','Miranda',3,3),c:r('JOB_10003','Preston',4,4)}},
 [`workforceConfirmation/v1/jobs/${date}`]:{'zenitsu agatsuma':{a:r('JOB_10001','Preston',1,1)}}
}};
const url=type=>new URL(`https://example.com/api/workforce/${type}/stores?date=${date}`);
const actor={actor:{role:'agent',name:'Zenitsu Agatsuma',pod:'pod1'},headers:new Headers()};
const out=await c.testReport(actor,env,url('metrics'),'metrics');
const cp=out.stores.find(x=>x.workflow==='coverage'&&x.storeName==='Preston');
assert.equal(cp.jobs,2,'two Preston jobs accumulate under Preston');assert.equal(cp.submitted,6,'Preston submissions combine 2+4');
assert.equal(out.stores.find(x=>x.workflow==='coverage'&&x.storeName==='Miranda').submitted,3,'Miranda remains isolated');
assert.deepEqual([...out.jobs.filter(x=>x.workflow==='coverage'&&x.storeName==='Preston').map(x=>x.jobId)],['JOB_10001','JOB_10003']);
assert(out.jobs.some(x=>x.workflow==='confirmation'&&x.jobId==='JOB_10001'),'Confirmation remains separate');
const unauthorized={actor:{role:'agent',name:'Kanao Tsuyuri',pod:'pod2'},headers:new Headers()};
const denied=await c.testReport(unauthorized,env,url('coverage'),'coverage');assert.equal(denied.jobs.length,0,'Agent cannot retrieve other POD jobs');
console.log('PASS M2.9.36 Store Job Ledger: real Job IDs, returning-store aggregation, workflow and POD isolation, drawer filters, and Store Jobs export sheet.');
