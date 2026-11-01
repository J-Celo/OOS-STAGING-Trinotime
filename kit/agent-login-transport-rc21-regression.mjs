// RC2.1: Real Worker login-directory handler against synthetic roster/JWT validator.
// Never grants anonymous callers access to workforce, chat or Admin APIs.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {mergeRosterIntents} from '../src/roster-intents.js';
import {scopeRosterSnapshotM2962,redactRosterSecretsM2966,preserveRosterSecretsM2966} from '../src/scoped-roster-m2962.js';
import {scopedRosterPatchReceiptM2963,scopedRosterEmployeePatchM2963} from '../src/scoped-roster-patch-m2963.js';
import {workspaceReadModel} from '../src/workspace-read-model.js';
const worker=fs.readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
const code=worker.replace(/^import[\s\S]*?from ['"][^'"]+['"];\s*/gm,'').replace('export class ChatRealtimeHub','class ChatRealtimeHub').replace('export default {','const workerEntry = {');
const c={console,TextEncoder,TextDecoder,URL,Request,Response,Headers,crypto:webcrypto,atob,btoa,setTimeout,clearTimeout,structuredClone,mergeRosterIntents,scopeRosterSnapshotM2962,redactRosterSecretsM2966,preserveRosterSecretsM2966,scopedRosterPatchReceiptM2963,scopedRosterEmployeePatchM2963,workspaceReadModel,createRemoteJWKSet:()=>({})};
vm.createContext(c);vm.runInContext(code,c);
const roster={
 podDirectory:{revision:1,entries:[{id:'Demon Slayer',name:'Demon Slayer',team:'CWH',active:true},{id:'Private POD',name:'Private POD',team:'CWH',active:false}]},
 teamLeaderDirectory:{revision:1,entries:[{name:'Lead One',pod:'Demon Slayer',active:true,secret:'HIDDEN'}]},
 employees:{entries:[{name:'Agent One',pod:'Demon Slayer',active:true,secret:'HIDDEN',salary:950},{name:'Agent Two',pod:'Demon Slayer',active:true},{name:'Other',pod:'Private POD',active:true}]}
};
let rosterReads=0,rateUid='';
c.rosterResolvedStateServer=async()=>{rosterReads++;return roster;};
c.enforceRate=(uid)=>{rateUid=uid;};
const env={FIREBASE_PROJECT_ID:'trinotime-staging-qa'};
let count=0;
const test=async(label,fn)=>{await fn();count++;console.log('PASS RC2.1:',label);};
const request=(path,token='anonymous',method='GET')=>new Request('https://staging.test'+path,{method,headers:token?{Authorization:'Bearer '+token}:{}});
const actual=async(path,token='anonymous',method='GET')=>{const req=request(path,token,method);return c.handleLoginDirectory(req,env,new URL(req.url));};
let jwtCalls=0;
c.jwtVerify=async(token,jwks,opts)=>{
 jwtCalls++;
 assert.equal(opts.issuer,'https://securetoken.google.com/trinotime-staging-qa');
 assert.equal(opts.audience,'trinotime-staging-qa');
 assert.deepEqual(Array.from(opts.algorithms),['RS256']);
 if(token==='anonymous')return {payload:{sub:'anon-uid-1',firebase:{sign_in_provider:'anonymous'}}};
 if(token==='permanent')return {payload:{sub:'permanent-uid-1',email:'test@example.invalid',firebase:{sign_in_provider:'password'}}};
 if(token==='missing-sub')return {payload:{firebase:{sign_in_provider:'anonymous'}}};
 throw Error('bad signature');
};
await test('verified anonymous Firebase transport can load health',async()=>{
 rosterReads=0;const res=await actual('/api/workforce/login-directory/health');assert.equal(res.status,200);const body=await res.json();assert.equal(body.authority,'login-directory-v1');assert.equal(body.loginTransportPatch,'M2966-RC2.1');assert.equal(rosterReads,0);assert.equal(rateUid,'anon-uid-1');
});
await test('verified anonymous Firebase transport can load minimal bootstrap',async()=>{
 const res=await actual('/api/workforce/login-directory/bootstrap'),data=await res.json();assert.equal(data.ok,true);assert(data.revision);const values=Object.values(data.values).join(' ');assert(values.includes('Lead One'));assert(!values.includes('HIDDEN'));assert(!values.includes('Agent One'));assert(!values.includes('Private POD'));
});
await test('verified anonymous bearer sees only active chosen POD names',async()=>{
 const res=await actual('/api/workforce/login-directory?pod=Demon%20Slayer');const rows=JSON.parse(await res.json());assert.equal(rows.length,2);assert.deepEqual(rows.map(x=>x.name),['Agent One','Agent Two']);assert(!JSON.stringify(rows).includes('HIDDEN'));assert(!JSON.stringify(rows).includes('salary'));
});
await test('verified permanent Firebase bearer can also use directory',async()=>{const res=await actual('/api/workforce/login-directory/health','permanent');assert.equal(res.status,200);});
await test('anonymous remains forbidden for privileged Firebase identity helper',async()=>{
 await assert.rejects(c.requireFirebaseUser(request('/api/chat/foo'),env),e=>e.status===403&&e.code==='IDENTITY_REQUIRED');
});
await test('permanent identity is still accepted by privileged Firebase identity helper',async()=>{
 const user=await c.requireFirebaseUser(request('/api/chat/foo','permanent'),env);assert.equal(user.uid,'permanent-uid-1');
});
await test('unsigned directory request fails closed',async()=>{await assert.rejects(actual('/api/workforce/login-directory/bootstrap',''),e=>e.status===401);});
await test('invalid signed token fails closed',async()=>{await assert.rejects(actual('/api/workforce/login-directory/health','bad'),e=>e.status===401);});
await test('JWT without sub fails closed',async()=>{await assert.rejects(actual('/api/workforce/login-directory/bootstrap','missing-sub'),e=>e.status===401);});
await test('inactive or unknown POD denies selector',async()=>{await assert.rejects(actual('/api/workforce/login-directory?pod=Private%20POD'),e=>e.status===400);});
await test('directory remains read-only',async()=>{await assert.rejects(actual('/api/workforce/login-directory','anonymous','POST'),e=>e.status===405);});
await test('only login-directory uses anonymous-capable helper',async()=>{
 assert.equal((worker.match(/await requireFirebaseTransportUser\(request,env\)/g)||[]).length,1);
 assert(worker.includes("const actor=await requireWorkforceAttendanceActor(request,env)"));
 assert(worker.includes("const user=await requireFirebaseTransportUser(request,env);"));
 assert(worker.includes("const user = await requireFirebaseTransportUser(request, env);"));
});
console.log(`RC2.1 agent login transport: ${count} regression checks passed; signed Firebase JWT cryptography and live staging remain separate.`);
