// Production Admin has verified uid+role even when legacy display name is absent.
// Entirely synthetic; no network, Firebase data, writes or permissions bypass.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
const worker=read('../src/worker.js');
const manager=read('../public/assets/js/j-store-plan-manager-phase1.js');
const html=read('../public/index.html');
const start=worker.indexOf('async function requireWorkforceAttendanceActor(');
const end=worker.indexOf('\nasync function attendanceTargetPodServer(',start);
assert(start>0&&end>start,'Verified actor handler exists');
const actorCtx=vm.createContext({
  requireFirebaseUser:async()=>({uid:'real-admin-uid',name:''}),
  roleRecord:{role:'admin',active:true,name:''},
  firebaseAdminGet:async()=>actorCtx.roleRecord,
  ownerRecoveryAdminAuthorityServer:async()=>null,
  canonicalWorkforceMemberServer:async()=>null,
  normalizeRole:v=>v, normalizePersonName:v=>String(v||'').trim(), cleanText:v=>String(v||''),
  fail:(_status,code,message)=>{throw Object.assign(new Error(message),{code})}
});
vm.runInContext(worker.slice(start,end)+'\nglobalThis.check=requireWorkforceAttendanceActor;',actorCtx);
const actor=await actorCtx.check({headers:{get:()=>''}},{});
assert.equal(actor.role,'admin');
assert.equal(actor.uid,'real-admin-uid');
assert.equal(actor.name,'Administrator'); // display fallback, never new authority
actorCtx.roleRecord={role:'admin',active:false,name:''};
await assert.rejects(actorCtx.check({headers:{get:()=>''}},{}),e=>e.code==='WORKFORCE_ROLE_REQUIRED');
actorCtx.roleRecord={role:'agent',active:true,name:''};
await assert.rejects(actorCtx.check({headers:{get:()=>''}},{}),e=>e.code==='WORKFORCE_ROSTER_MISMATCH');
actorCtx.roleRecord={role:'admin',active:true,name:''};
const routeStart=worker.indexOf("  if(route==='/directory'&&request.method==='GET'){");
const routeEnd=worker.indexOf("\n  if(route==='/agents'&&request.method==='GET'){",routeStart);
assert(routeStart>0&&routeEnd>routeStart,'Authorized directory handler exists');
const dc=vm.createContext({
  actor,request:{method:'GET'},route:'/directory',date:'10/22/2026',env:{},
  canonicalWorkforceAuthorizationRosterServer:async()=>({entries:{a:{role:'agent',active:true,pod:'pod0a',podLabel:'POD 0',name:'A'},b:{role:'agent',active:true,pod:'pod0b',podLabel:'POD 0',name:'B'},tl:{role:'team_leader',active:true,pod:'pod0b',name:'Verified TL'}}}),
  canManageStorePlan:(a,m)=>a.role==='admin'&&m.role==='agent'&&m.active===true,
  normalizePersonName:v=>String(v||'').trim(), json:v=>v,
  fail:(_status,code)=>{throw Error(code)}
});
vm.runInContext(`globalThis.directory=async()=>{${worker.slice(routeStart,routeEnd)};}`,dc);
const response=await dc.directory();
assert.equal(response.viewer.uid,'real-admin-uid');
assert.equal(response.viewer.name,'Administrator');
assert.equal(response.pods.length,2,'Same-label different-ID PODs must remain separate');
assert.equal(response.pods.find(x=>x.pod==='pod0b').teamLeader,'Verified TL');
// Admin panel fails closed on uid mismatches and does not authorize from names.
assert(manager.includes('serverUid!==uid'),'UID mismatch must fail closed');
assert(manager.includes("String(pods.viewer?.uid||'').trim()!==uid"),'Both directory snapshots bound');
assert(html.includes('production-admin-uid-identity-hotfix-20261022'),'Cache must load corrected client');
console.log('PASS Admin blank-name fallback bound to active verified Firebase role/uid; invalid uid blocked; duplicate POD IDs preserved');
