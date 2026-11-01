import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'../..');
for(const [workflow,tag] of [['coverage','CAT'],['confirmation','CFT']]){
 const src=fs.readFileSync(path.join(root,'tracker',`${workflow}-background.js`),'utf8');
 const begin=src.indexOf('async function trackerSequenceResumeSafe(core)');
 const end=src.indexOf('async function syncDirty(force=false)',begin);
 assert(begin>=0&&end>begin);
 let requests=0, writes=[],accepted=true;
 let core={bridge:{token:'secure-bridge',deviceId:'same-device',baseUrl:'https://oos.trinotime.com'},
  shift:{status:'active',sessionId:'session-22',generation:3,reportDate:'2026-10-29'},
  sync:{state:'error',errorCode:'TRACKER_SEQUENCE_CONFLICT'},settings:{},
  data:{'2026-10-29':{summary:{clientSequence:8,submitted:3},jobs:{'JOB_8':{jobId:'JOB_8'}},tasks:{'JOB_8|1':{jobId:'JOB_8',taskIndex:1}}}},
  pending:{'2026-10-29':['JOB_8|1']}};
 const clone=()=>structuredClone(core);
 const keys={data:'data',sync:'sync',pendingTasks:'pendingTasks'};
 const fakeChrome={storage:{local:{set:async patch=>{writes.push(structuredClone(patch));
  if(patch[keys.data])core.data=patch[keys.data];
  if(patch[keys.pendingTasks])core.pending=patch[keys.pendingTasks];
  if(patch[keys.sync])core.sync=patch[keys.sync];
 }}}};
 const ctx={Date,JSON,Number,Math,Map,Object,Set,Boolean,String,console,chrome:fakeChrome,
  [tag]:keys,
  reportDateForCore:c=>c.shift.reportDate,
  ensureDate:(data,date)=>data[date],
  shiftIsActive:c=>c.shift.status==='active',
  queue:async fn=>fn(),
  readCore:async()=>clone(),
  assertSyncContext:(latest,old)=>{if(latest.shift.sessionId!==old.shift.sessionId)throw Error('context changed')},
  trackerSyncRequest:async(url,options)=>{
   requests++;
   assert.match(url,new RegExp(`/api/workforce/${workflow}/sequence-resume-proof`));
   assert.equal(options.headers[`X-TT-${workflow==='coverage'?'Coverage':'Confirmation'}-Bridge`],'secure-bridge');
   const body=JSON.parse(options.body);
   assert.equal(body.shiftGeneration,3);
   assert.equal(body.tasks.length,1);
   return {response:{ok:true},body:accepted?{ok:true,safeToResume:true,acceptedSequence:31,acceptedDigest:'c'.repeat(64),shiftSessionId:'session-22',shiftGeneration:3}:{ok:true,safeToResume:false,reason:'LEDGER_REVIEW_REQUIRED'}};
  },
  syncSummarySnapshot:s=>s,
  pendingAdd:(pending,date,key)=>{pending[date]??=[];if(!pending[date].includes(key))pending[date].push(key)},
  SUMMARY_PENDING_KEY:'__summary__',num:v=>Number(v)||0,
 };
 vm.createContext(ctx);
 vm.runInContext(src.slice(begin,end),ctx);
 const ok=await ctx.trackerSequenceResumeSafe(clone());
 assert.equal(ok,true,`${workflow}: verified server proof resumes`);
 assert(core.data['2026-10-29'].summary.clientSequence>=32,`${workflow}: local sequence raised above server`);
 assert.deepEqual(core.pending['2026-10-29'],['JOB_8|1','__summary__'],`${workflow}: pending task preserved`);
 assert.equal(core.sync.sequenceResumeExpected,31,`${workflow}: next sync bound to server sequence`);
 assert.equal(core.sync.sequenceResumeDigest,'c'.repeat(64));
 assert.equal(core.sync.errorCode,'',`${workflow}: sequence block cleared only after proof`);
 assert.equal(requests,1);
 assert.equal(await ctx.trackerSequenceResumeSafe(clone()),false,`${workflow}: repeated proof throttled`);
 assert.equal(requests,1);
 // Separate local instance: server says ledger doesn't match. Absolutely no rebase or count changes.
 core.sync.sequenceProofCheckedAt=0;core.sync.errorCode='TRACKER_SEQUENCE_CONFLICT';
 accepted=false;
 const before=JSON.stringify(core.data);
 assert.equal(await ctx.trackerSequenceResumeSafe(clone()),false);
 assert.equal(JSON.stringify(core.data),before,`${workflow}: rejected proof preserves all counts`);
 assert.deepEqual(core.pending['2026-10-29'],['JOB_8|1','__summary__']);
 console.log(`PASS ${workflow}: authenticated server proof, pending retention, sequence guard, throttle, fail-closed rejection`);
}
