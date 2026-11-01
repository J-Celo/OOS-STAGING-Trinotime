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
firebaseAdminGet=async(env,path)=>path.startsWith('roles/')?{...env.actor,active:env.roleActive!==false}:path===WORKFORCE_COVERAGE_DAILY_PATH+'/'+env.date?env.daily:path.startsWith(WORKFORCE_COVERAGE_DAILY_PATH+'/'+env.date+'/')?env.daily[path.split('/').at(-1)]||null:null;
globalThis.test={handleWorkforceCoverageApi,credentialRole,coverageActorKeyServer,coverageSyncServer};`,c);
assert.equal(c.test.credentialRole('admin'),'','Shared credential helper must continue excluding Admin');
const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const now=Date.now();
const key=c.test.coverageActorKeyServer('agent','Tanjiro Kamado');
const daily={[key]:{blurred:2,noMatch:1,submitted:7,created:12,idleMs:180000,awayMs:120000,awayTimingAvailable:true,trackerState:'away',serverUpdatedAtMs:now}};
const admin={role:'admin',name:'Administrator',pod:''};
const tl={role:'team_leader',name:'Gyomei Himejima',pod:'demon'};
const agent={role:'agent',name:'Tanjiro Kamado',pod:'demon'};
async function call(actor,{path='dashboard',expected=actor.role,auth='firebase',recovery=false,roleActive=true}={}){
 const url=new URL('https://fixture.test/api/workforce/coverage/'+path);url.searchParams.set('date',date);
 const headers={};if(auth==='firebase')headers.Authorization='Bearer fixture';if(auth==='security')headers['X-TT-Security-Session']='fixture';
 if(expected!==null)headers['X-TT-Coverage-Expected-Role']=expected;
 return (await c.test.handleWorkforceCoverageApi(new Request(url,{headers}),{actor,date,daily,recovery,roleActive},url)).json();
}
const d=await call(admin);
assert.equal(d.viewer.role,'admin','Admin role must survive server viewer serialization');
assert.equal(d.scope,'all-pods');assert.equal(d.agents.length,5);assert.equal(d.pods.length,2);
assert.equal(d.serverBuild,'RC18');
assert.equal(d.agents.find(x=>x.name==='Tanjiro Kamado').submitted,7);
assert.equal(d.agents.find(x=>x.name==='Tanjiro Kamado').trackerState,'away');
for(const r of d.agents.filter(x=>x.name!=='Tanjiro Kamado')){assert.equal(r.connected,false);assert.equal(r.trackerState,'offline');assert.equal(r.serverUpdatedAtMs,0);}
console.log('PASS Admin: all 5 active Agents across 2 teams; 1 synced and 4 never-synced; inactive/TL excluded');
for(const auth of ['firebase','security']){
 const t=await call(tl,{auth});assert.equal(t.viewer.role,'team_leader');assert.equal(t.scope,'own-pod');assert.equal(t.agents.length,4);assert(t.agents.every(x=>x.pod==='demon'));
 const a=await call(agent,{auth});assert.equal(a.scope,'self');assert.equal(a.agents.length,1);assert.equal(a.agents[0].name,'Tanjiro Kamado');
 await assert.rejects(call(tl,{auth,path:'agent?name=Other%20Team%20Agent'}),e=>e.code==='COVERAGE_AGENT_SCOPE_FORBIDDEN');
 await assert.rejects(call(agent,{auth,path:'agent?name=Nezuko%20Kamado'}),e=>e.code==='COVERAGE_AGENT_SCOPE_FORBIDDEN');
 await assert.rejects(call(tl,{auth,expected:'admin'}),e=>e.code==='COVERAGE_SESSION_BINDING_MISMATCH');
 await assert.rejects(call(agent,{auth,expected:'admin'}),e=>e.code==='COVERAGE_SESSION_BINDING_MISMATCH');
}
console.log('PASS TL/Agent: Firebase and security-session paths scoped; cross-scope details and spoofed Admin hints rejected');
assert.equal((await call(admin,{path:'agent?name=Other%20Team%20Agent'})).summary.name,'Other Team Agent');
assert.equal((await call(admin,{recovery:true})).scope,'all-pods');
assert.equal((await call(admin,{expected:null})).agents.length,5);
await assert.rejects(call(admin,{expected:'nonsense'}),e=>e.code==='COVERAGE_SESSION_BINDING_MISMATCH');
await assert.rejects(call(admin,{roleActive:false}),e=>e.code==='WORKFORCE_ROLE_REQUIRED');
await assert.rejects(call(admin,{auth:'none'}),e=>e.code==='AUTH_REQUIRED');
console.log('PASS Admin detail, owner recovery, no-hint compatibility, inactive role and unauthenticated denial');

let client=fs.readFileSync(new URL('../public/assets/js/j-coverage-dashboard-rc20.js',import.meta.url),'utf8');
client=client.slice(0,client.indexOf("  document.addEventListener('click',event=>{"))+"window.test={api,assertDashboardViewerBinding,render,state,agentRow};})();";
const root={innerHTML:'',querySelector:()=>null,querySelectorAll:()=>[]};
const frontend=vm.createContext({window:{firebase:{auth:()=>({currentUser:{isAnonymous:false,getIdToken:async()=> 'fixture'}})}},document:{addEventListener(){},body:{dataset:{trinoRole:'admin'}},getElementById:id=>id==='ttCoverageRoot'?root:null},Intl,Date,console,fetch:async()=>new Response(JSON.stringify(d),{status:200})});
vm.runInContext(client,frontend);const ui=frontend.window.test;
ui.assertDashboardViewerBinding(admin,d);ui.state.dashboard=d;ui.render();
for(const text of ['All PODs','Tanjiro Kamado','Other Team Agent','Not synced'])assert(root.innerHTML.includes(text),text);
assert(!root.innerHTML.includes('No Coverage data yet'));
for(const bad of [{},{...d,viewer:{role:''},scope:'self'},{...d,scope:'self'},{...d,agents:null}])assert.throws(()=>ui.assertDashboardViewerBinding(admin,bad),e=>e.code==='COVERAGE_RESPONSE_INVALID');
assert.throws(()=>ui.assertDashboardViewerBinding(admin,{...d,viewer:{role:'agent'}}),e=>e.code==='COVERAGE_SESSION_BINDING_MISMATCH');
frontend.fetch=async()=>new Response('<html>app shell</html>',{status:200});
await assert.rejects(ui.api('dashboard'),e=>e.code==='COVERAGE_RESPONSE_INVALID');
console.log('PASS actual frontend: renders Admin groups and Not synced rows; rejects blank viewer, wrong scope, malformed payload and HTML');

// Exercise actual sync ingestion using the extension's captured HTTP payload.
const payload=JSON.parse(fs.readFileSync(process.env.ACTION_PAYLOAD,'utf8'));
c.fixturePayload=payload;
vm.runInContext(`
coverageRequireBridgeActorServer=async()=>({role:'agent',name:'Tanjiro Kamado',pod:'demon',uid:'fixture-user',tokenId:'fixture',bridge:{deviceId:fixturePayload.deviceId}});
globalThis.persisted={};
firebaseAdminPatch=async(env,path,updates)=>Object.assign(persisted,updates);
`,c);
const synced=await c.test.coverageSyncServer(new Request('https://fixture.test/api/workforce/coverage/sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),{date,daily:{}});
assert.equal(synced.ok,true);
const persisted=Object.values(c.persisted).find(x=>x&&x.actorKey===key&&x.clientSequence);
assert(persisted);assert.equal(persisted.blurred,2);assert.equal(persisted.noMatch,1);
daily[key]=persisted;
for(const viewer of [admin,tl,agent]){
 const response=await call(viewer);const row=response.agents.find(x=>x.name==='Tanjiro Kamado');
 assert.equal(row.blurred,2);assert.equal(row.noMatch,1);assert.equal(response.totals.blurred,2);assert.equal(response.totals.noMatch,1);
 const html=ui.agentRow(row);
 assert(html.includes('<td class="tt-coverage-num">2</td><td class="tt-coverage-num">0</td><td class="tt-coverage-num">1</td>'),'Blurred/Deleted/No Match render in their table cells');
}
console.log('PASS actual tracker payload -> Worker sync persistence -> Admin/TL/Agent dashboard JSON: Blurred=2, No Match=1');
