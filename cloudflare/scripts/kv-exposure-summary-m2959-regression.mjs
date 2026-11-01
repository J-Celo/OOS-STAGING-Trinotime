// M2.9.59 offline staging security boundary checks; no Firebase network connection.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {summarizeShallowKvKeys} from '../src/kv-exposure-summary.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const worker=fs.readFileSync(path.join(root,'src/worker.js'),'utf8');
const source=worker.slice(worker.indexOf('// M2.9.59 STAGING ONLY:'),worker.indexOf('async function readLegacyKvDecodedServer(env) {'));
assert.match(source,/readShallowKvKeysForRiskSummaryServer/);
const encoded=text=>Buffer.from(text,'utf8').toString('base64url');
const privateKey=encoded('agentauth:TEST-NAME');
const rosterKey=encoded('employees');
const attendanceKey=encoded('attendance:TEST-NAME');
let tests=0;
const check=(description,fn)=>{fn();tests++;console.log('PASS M2959:',description);};
check('Key-name classifier returns counts and never identifiers',()=>{
  const result=summarizeShallowKvKeys([privateKey,rosterKey,attendanceKey]);
  assert.equal(result.totalKeys,3);
  assert.equal(result.credentialNamedKeysDetected,true);
  assert.equal(result.categories['legacy-credential-risk'],1);
  assert.equal(result.categories['personnel-and-roster'],1);
  assert.equal(result.categories['attendance-and-time'],1);
  const serialized=JSON.stringify(result);
  for(const leaked of [privateKey,rosterKey,attendanceKey,'TEST-NAME','agentauth:','employees','attendance:']) assert.ok(!serialized.includes(leaked),`Identifier leaked: ${leaked}`);
});
check('Empty and malformed names cannot add data values',()=>{
  assert.equal(summarizeShallowKvKeys([]).totalKeys,0);
  assert.throws(()=>summarizeShallowKvKeys({sensitive:'password'}),TypeError);
  assert.throws(()=>summarizeShallowKvKeys([{password:'secret'}]),TypeError);
  assert.throws(()=>summarizeShallowKvKeys(Array(50001).fill(privateKey)),TypeError);
});
check('Production rejects endpoint even for Admin before DB access',()=>{
  assert.match(source,/String\(env\.DEPLOYMENT_ENV \|\| ''\).*staging/);
  assert.match(worker,/url\.pathname==='\/api\/security\/kv-exposure-summary'&&request\.method==='GET'/);
});
check('No generic /kv proxy or app UI changes',()=>{
  assert.doesNotMatch(source.slice(source.indexOf("async function handleSecurityKvExposureSummaryServer")),/return .*keys|return .*raw/);
  assert.match(source,/shallow=true/);
  assert.match(source,/value !== true/);
  assert.match(source,/const \{user\} = await requireActiveAdminUser\(request,env\);/);
  assert.match(source,/enforceRate\(user.uid,'staging-kv-risk-summary'/);
  assert.match(source,/ruleCutoverReady:false/);
});
let fetchCalls=0,authCalls=0, lastRequest;
let shallowPayload={[privateKey]:true,[rosterKey]:true,[attendanceKey]:true};
const ctx={
  URL,AbortSignal,Number,String,Object,Array,Promise,Date,
  summarizeShallowKvKeys,
  getGoogleAccessToken:async()=> 'OFFLINE_TEST_ACCESS_TOKEN',
  fetch:async(uri,options)=>{fetchCalls++;lastRequest={uri,options};return {ok:true,headers:{get:()=>String(JSON.stringify(shallowPayload).length)},text:async()=>JSON.stringify(shallowPayload)};},
  requireActiveAdminUser:async request=>{authCalls++;if(!request.actor)throw Object.assign(Error('unauthenticated'),{status:401});if(request.actor.role!=='admin')throw Object.assign(Error('forbidden'),{status:403});return {user:{uid:'ADMIN_TEST_UID'}};},
  enforceRate:()=>{},
  fail:(status,code)=>{const error=Object.assign(Error(code),{status,code});throw error;}
};
vm.createContext(ctx);
vm.runInContext(source,ctx);
const req=actor=>({actor});
const staging={DEPLOYMENT_ENV:'staging',FIREBASE_DATABASE_URL:'https://example.test'};
await assert.rejects(()=>ctx.handleSecurityKvExposureSummaryServer(req({role:'admin'}),{...staging,DEPLOYMENT_ENV:'production'}),e=>e.status===404);
check('Production blocked before privileged Firebase read',()=>assert.equal(fetchCalls,0));
for(const role of [null,'agent','team_leader']) await assert.rejects(()=>ctx.handleSecurityKvExposureSummaryServer(req(role?{role}:null),staging),e=>e.status=== (role?403:401));
check('Anonymous, Agent, and TL cannot enumerate /kv names',()=>assert.equal(fetchCalls,0));
const out=await ctx.handleSecurityKvExposureSummaryServer(req({role:'admin'}),staging);
check('Admin receives shallow key counts with no raw values/keys',()=>{
  assert.equal(fetchCalls,1);
  assert.equal(out.totalKeys,3);
  assert.equal(out.ruleCutoverReady,false);
  assert.equal(out.rootClientListenersRemaining,true);
  assert.equal(out.containsOnlyCounts,true);
  assert.ok(lastRequest.uri.endsWith('/kv.json?shallow=true'));
  assert.ok(lastRequest.options.headers.authorization.startsWith('Bearer '));
  const body=JSON.stringify(out);
  for(const leaked of [privateKey,rosterKey,attendanceKey,'TEST-NAME','agentauth:','employees'])assert.ok(!body.includes(leaked));
});
shallowPayload={[privateKey]:{hash:'SECRET'}};
await assert.rejects(()=>ctx.handleSecurityKvExposureSummaryServer(req({role:'admin'}),staging),e=>e.status===503&&e.code==='KV_RISK_INVALID_RESPONSE');
check('Non-shallow Firebase values cause fail-closed response',()=>assert.equal(fetchCalls,2));
console.log(`M2.9.59: ${tests} offline metadata-only admin authorization checks passed. FIREBASE /kv READ EXPOSURE REMAINS OPEN.`);
