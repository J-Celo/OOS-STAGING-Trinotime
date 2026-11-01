import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
const file=process.argv[2]||new URL('../src/worker.js',import.meta.url);
const source=fs.readFileSync(file,'utf8');
const canonical={entries:{
 tanjiro:{role:'agent',name:'Tanjiro Kamado',pod:'demon',active:true},
 nezuko:{role:'agent',name:'Nezuko Kamado',pod:'demon',active:true},
 inosuke:{role:'agent',name:'Inosuke Hashibira',pod:'demon',active:true},
 zenitsu:{role:'agent',name:'Zenitsu Agatsuma',pod:'demon',active:true},
 other:{role:'agent',name:'Other Team Agent',pod:'other',active:true},
 inactive:{role:'agent',name:'Inactive Agent',pod:'other',active:false},
 leader:{role:'team_leader',name:'Gyomei Himejima',pod:'demon',active:true}
}};
const roster={podDirectory:{entries:[{id:'demon',name:'Demon Slayer',team:'CWH',active:true},{id:'other',name:'POD 1',team:'ALBERTSONS',active:true}]},employees:{entries:[]}};
const c=vm.createContext({URL,Request,Response,Headers,console,crypto:webcrypto,TextEncoder,TextDecoder,btoa,atob,createRemoteJWKSet:()=>({}),canonical,roster});
// Load the WHOLE Worker so normalization/auth/viewer/scope/row code are the actual
// implementations. Replace only external identity verification and persistence I/O.
vm.runInContext(source.replace(/^import .*;\n/gm,'').replace('export default {','const workerDefault = {').replace('export class ChatRealtimeHub','class ChatRealtimeHub')+`
requireFirebaseUser=async(request,env)=>{if(!request.headers.get('authorization'))fail(401,'AUTH_REQUIRED','Sign in');return {uid:'fixture-user',name:env.actor.name};};
ownerRecoveryAdminAuthorityServer=async(env)=>env.recovery?{role:{role:'admin',active:true},grant:{}}:null;
verifyCompactToken=async(env)=>env.actor;
requireCurrentSecurityActor=async()=>({});
attendanceRosterMemberServer=async(env,role,name)=>Object.values(canonical.entries).find(x=>x.role===role&&x.name===name&&x.active!==false);
canonicalWorkforceMemberServer=attendanceRosterMemberServer;
rosterResolvedStateServer=async()=>roster;
canonicalWorkforceAuthorizationRosterServer=async()=>canonical;
firebaseAdminGet=async(env,path)=>path.startsWith('roles/')?{...env.actor,active:env.roleActive!==false}:path===WORKFORCE_CONFIRMATION_DAILY_PATH+'/'+env.date?env.daily:path.startsWith(WORKFORCE_CONFIRMATION_DAILY_PATH+'/'+env.date+'/')?env.daily[path.split('/').at(-1)]||null:null;
globalThis.test={handleWorkforceConfirmationApi,credentialRole,confirmationActorKeyServer,confirmationSanitizeSummaryServer};`,c);
assert.equal(c.test.credentialRole('admin'),'','Shared credential helper must continue excluding Admin');
const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const now=Date.now();
const key=c.test.confirmationActorKeyServer('agent','Tanjiro Kamado');
const daily={[key]:{interval1:200,interval2:201,interval3:204,submitted:605,created:12,idleMs:180000,awayMs:120000,awayTimingAvailable:true,trackerState:'away',serverUpdatedAtMs:now}};
const admin={role:'admin',name:'Administrator',pod:''};
const tl={role:'team_leader',name:'Gyomei Himejima',pod:'demon'};
const agent={role:'agent',name:'Tanjiro Kamado',pod:'demon'};
async function call(actor,{path='dashboard',expected=actor.role,auth='firebase',recovery=false,roleActive=true}={}){
 const url=new URL('https://fixture.test/api/workforce/confirmation/'+path);url.searchParams.set('date',date);
 const headers={};if(auth==='firebase')headers.Authorization='Bearer fixture';if(auth==='security')headers['X-TT-Security-Session']='fixture';
 if(expected!==null)headers['X-TT-Confirmation-Expected-Role']=expected;
 return (await c.test.handleWorkforceConfirmationApi(new Request(url,{headers}),{actor,date,daily,recovery,roleActive},url)).json();
}
const d=await call(admin);
assert.equal(d.viewer.role,'admin','Admin role must survive server viewer serialization');
assert.equal(d.scope,'all-pods');assert.equal(d.agents.length,5);assert.equal(d.pods.length,2);
assert.equal(d.serverBuild,'RC21');
assert.equal(d.agents.find(x=>x.name==='Tanjiro Kamado').submitted,605);
assert.equal(d.agents.find(x=>x.name==='Tanjiro Kamado').trackerState,'away');
for(const r of d.agents.filter(x=>x.name!=='Tanjiro Kamado')){assert.equal(r.connected,false);assert.equal(r.trackerState,'offline');assert.equal(r.serverUpdatedAtMs,0);}
console.log('PASS Admin: all 5 active Agents across 2 teams; 1 synced and 4 never-synced; inactive/TL excluded');
for(const auth of ['firebase','security']){
 const t=await call(tl,{auth});assert.equal(t.viewer.role,'team_leader');assert.equal(t.scope,'own-pod');assert.equal(t.agents.length,4);assert(t.agents.every(x=>x.pod==='demon'));
 const a=await call(agent,{auth});assert.equal(a.scope,'self');assert.equal(a.agents.length,1);assert.equal(a.agents[0].name,'Tanjiro Kamado');
 await assert.rejects(call(tl,{auth,path:'agent?name=Other%20Team%20Agent'}),e=>e.code==='CONFIRMATION_AGENT_SCOPE_FORBIDDEN');
 await assert.rejects(call(agent,{auth,path:'agent?name=Nezuko%20Kamado'}),e=>e.code==='CONFIRMATION_AGENT_SCOPE_FORBIDDEN');
 await assert.rejects(call(tl,{auth,expected:'admin'}),e=>e.code==='CONFIRMATION_SESSION_BINDING_MISMATCH');
 await assert.rejects(call(agent,{auth,expected:'admin'}),e=>e.code==='CONFIRMATION_SESSION_BINDING_MISMATCH');
}
console.log('PASS TL/Agent: Firebase and security-session paths scoped; cross-scope details and spoofed Admin hints rejected');
assert.equal((await call(admin,{path:'agent?name=Other%20Team%20Agent'})).summary.name,'Other Team Agent');
assert.equal((await call(admin,{recovery:true})).scope,'all-pods');
assert.equal((await call(admin,{expected:null})).agents.length,5);
await assert.rejects(call(admin,{expected:'nonsense'}),e=>e.code==='CONFIRMATION_SESSION_BINDING_MISMATCH');
await assert.rejects(call(admin,{roleActive:false}),e=>e.code==='WORKFORCE_ROLE_REQUIRED');
await assert.rejects(call(admin,{auth:'none'}),e=>e.code==='AUTH_REQUIRED');
console.log('PASS Admin detail, owner recovery, no-hint compatibility, inactive role and unauthenticated denial');


assert.equal(d.totals.interval1,200);assert.equal(d.totals.interval2,201);assert.equal(d.totals.interval3,204);assert.equal(d.totals.submitted,605);
const normalized=c.test.confirmationSanitizeSummaryServer({interval1:200,interval2:201,interval3:204,submitted:999,submittedManualAdjustment:99});
assert.equal(normalized.submitted,605);assert.equal(normalized.submittedDisplayTotal,605);assert.equal(normalized.submittedManualAdjustment,0);
console.log('PASS Confirmation interval totals: 200 + 201 + 204 = 605; client total override ignored');
