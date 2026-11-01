// RC2.3: executable browser-function regression against scoped POD -> public gate transition.
// Synthetic data and VM only. No Firebase or Cloudflare network calls.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const client=fs.readFileSync(new URL('../public/assets/js/j-b52f8ff97ca5.js',import.meta.url),'utf8');
const slice=(first,last)=>{
 const a=client.indexOf('        '+first),b=client.indexOf('        '+last,a);
 assert(a>=0&&b>a,`Reviewed source missing ${first} -> ${last}`);
 return client.slice(a,b);
};
const publicSource=slice('function normalizePodDirectoryName(', 'function customPodDirectoryEntries(');
const guestSource=slice('function workspaceReadIdentity(', 'function workspaceSnapshot(');
const applySource=slice('function applyPodDirectoryState(', 'const PREMIUM_ACCESS_POLICY_KEY');
const sys=[{id:'POD 0',team:'CWH',name:'POD 0',system:true,active:true,shiftGroupId:null}];
const extra=(slug,name)=>({id:`tt-custom-pod:cwh:${slug}`,team:'CWH',name,active:true,system:false,shiftGroupId:null});
const demon=extra('demon-slayer','Demon Slayer'),solo=extra('solo-leveling','Solo Leveling'),other=extra('new-pod','Brand New');
const baseEntries=[...sys,demon,solo];
const encoded=v=>Buffer.from(v).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const makeValues=(pods=baseEntries,leaders=[{name:'TL Demon',pod:demon.id},{name:'TL Solo',pod:solo.id}])=>({
 [encoded('pod_directory_v1')]:JSON.stringify({schemaVersion:1,revision:7,entries:pods}),
 [encoded('team_leader_directory_v1')]:JSON.stringify({schemaVersion:1,revision:4,entries:leaders})
});
const fixture=(opts={})=>{
 let role='guest',uid='anonymous-uid',epoch=1,publicTLs=[],calls=[];
 const ctx={
  String,JSON,Object,Map,Set,Error,Promise,Date,Number,Boolean,Math,window:{},
  DEFAULT_POD_DIRECTORY:sys,SYSTEM_POD_IDS:['POD 0'],POD_DIRECTORY_SCHEMA_VERSION:1,TEAM_LEADER_DIRECTORY_SCHEMA_VERSION:1,
  TEAM_CWH:'CWH',TEAM_ALBERTSONS:'ALBERTSONS',CWH_POD_LIST:['POD 0'],ALBERTSONS_POD_LIST:[],POD_LIST:['POD 0'],
  POD_DIRECTORY_BY_ID:Object.create(null),podDirectory:sys.slice(),podDirectoryRevision:0,podDirectoryServerConfirmed:false,
  TEAM_GROUPS:[{id:'CWH',pods:['POD 0']},{id:'ALBERTSONS',pods:[]}],
  POD_DIRECTORY_KEY:'pod_directory_v1',TEAM_LEADER_DIRECTORY_KEY:'team_leader_directory_v1',
  isAdmin:false,isTeamLeader:false,agentSessionAuthenticated:false,agentSessionName:null,teamLeaderName:null,lockedPod:null,
  firebaseKvBindingEpoch:epoch,
  fbEncodeKey:encoded,
  ensureCustomPodRuntimeScheduleData:()=>{},refreshPodDirectoryDependentViews:()=>{},
  applyTeamLeaderDirectoryState:(v)=>{publicTLs=v.entries.map(x=>({...x}));return true;},
  workforceSecuritySessionToken:()=>role==='guest'?'stale-session':(role+'-workforce-session'),
  currentVerifiedWorkforceFirebaseToken:async()=> 'permanent-token',
  firebase:{auth:()=>({currentUser:{uid,getIdToken:async()=> 'anonymous-jwt'}})},
  ensureFirebaseReady:async()=>true,
  noteWorkforceAuthorityAuthenticationFailure:()=>{},
  fetchAuthorityJson:async(url,init)=>{
    calls.push({url,init});
    if(opts.request) return opts.request(url,init);
    const guest=role==='guest';
    return {response:{ok:true,status:200},data:{ok:true,authority:guest?'login-directory-v1':'workforce-workspace-read-v1',values:guest?makeValues():{},revision:'rev1'}};
  }
 };
 ctx.workspaceReadIdentity=()=>[uid,role,epoch].join('|');
 vm.createContext(ctx);
 vm.runInContext(publicSource,ctx);
 vm.runInContext(applySource,ctx);
 vm.runInContext(guestSource,ctx);
 const setRole=(next)=>{role=next;uid=next==='guest'?'anonymous-uid':next+'-uid';ctx.isAdmin=next==='admin';ctx.isTeamLeader=next==='tl';ctx.agentSessionAuthenticated=next==='agent';};
 const pods=()=>Array.from(ctx.CWH_POD_LIST).map(id=>ctx.POD_DIRECTORY_BY_ID[id]?.name||id);
 return {ctx,setRole,pods,leaders:()=>publicTLs.map(v=>v.name),calls,publicCache:()=>vm.runInContext('JSON.stringify(gatePublicDirectoryRc23)',ctx)};
};
let n=0;
const test=async(label,fn)=>{await fn();console.log('PASS RC2.3:',label);n++;};
await test('guest bootstrap caches only public POD/TL fields',async()=>{
 const x=fixture();await x.ctx.workspaceReadValuesUncached();assert(x.pods().includes('Solo Leveling'));assert(x.leaders().includes('TL Solo'));
 assert(!x.publicCache().includes('password'));assert.equal(x.calls[0].url,'/api/workforce/login-directory/bootstrap');
 assert.equal(x.calls[0].init.headers.Authorization,'Bearer anonymous-jwt');assert(!x.calls[0].init.headers['X-TT-Security-Session']);
});
await test('Demon Slayer Agent scoped roster cannot permanently erase Solo Leveling from gate',async()=>{
 const x=fixture();await x.ctx.workspaceReadValuesUncached();x.setRole('agent');
 x.ctx.applyPodDirectoryState({revision:9,entries:[demon]});assert(!x.pods().includes('Solo Leveling'));
 assert.equal(x.ctx.restoreGatePublicDirectoryRc23(),false,'Must not restore full public gate while Agent authenticated');
 x.setRole('guest');assert.equal(x.ctx.restoreGatePublicDirectoryRc23(),true);assert(x.pods().includes('Solo Leveling'));
 assert(x.leaders().includes('TL Solo'));
});
await test('TL scoped view restores all gate choices after sign out',async()=>{
 const x=fixture();await x.ctx.workspaceReadValuesUncached();x.setRole('tl');
 x.ctx.applyPodDirectoryState({entries:[demon]});x.setRole('guest');x.ctx.restoreGatePublicDirectoryRc23();
 assert(x.pods().includes('Solo Leveling'));assert(x.leaders().includes('TL Demon'));
});
await test('guest refresh includes a custom POD added during Agent session',async()=>{
 const x=fixture({request:async(url)=>({response:{ok:true,status:200},data:{ok:true,authority:'login-directory-v1',values:makeValues([...baseEntries,other]),revision:'new'}})});
 await x.ctx.workspaceReadValuesUncached();assert(x.pods().includes('Brand New'));
});
await test('a stale guest response cannot replace the current Agent scoped directory',async()=>{
 let release,signal;const requested=new Promise(r=>signal=r);const x=fixture({request:()=>new Promise(r=>{release=r;signal();})});
 const started=x.ctx.workspaceReadValuesUncached();await requested;x.setRole('agent');
 release({response:{ok:true,status:200},data:{ok:true,authority:'login-directory-v1',values:makeValues(),revision:'stale'}});
 await assert.rejects(started,e=>e.code==='live/read-cancelled');assert(!x.pods().includes('Solo Leveling'));
});
await test('invalid directory response never replaces verified cache',async()=>{
 const x=fixture();await x.ctx.workspaceReadValuesUncached();assert(x.pods().includes('Solo Leveling'));
 assert.equal(x.ctx.rememberGatePublicDirectoryRc23({[encoded('pod_directory_v1')]:'{broken',[encoded('team_leader_directory_v1')]:'{}'}),false);
 x.setRole('agent');x.ctx.applyPodDirectoryState({entries:[demon]});x.setRole('guest');x.ctx.restoreGatePublicDirectoryRc23();
 assert(x.pods().includes('Solo Leveling'));
});
await test('unexpected extra private login fields are dropped from cached directory',async()=>{
 const x=fixture();const raw=makeValues([...baseEntries.map(e=>({...e,passwordHash:'SECRET',salary:999}))],[{name:'TL Solo',pod:solo.id,personalEmail:'PRIVATE'}]);
 assert.equal(x.ctx.rememberGatePublicDirectoryRc23(raw),true);
 assert(!x.publicCache().includes('SECRET'));
 assert(!x.publicCache().includes('PRIVATE'));
});
await test('logout restores public PODs before rendering login grid and drops role cache',()=>{
 const start=client.indexOf('        async function leavePrivilegedSession() {');const end=client.indexOf('        let workforceAuthorityForcedReauthInFlight',start);
 const src=client.slice(start,end);
 assert(src.includes('rosterAuthoritySnapshotCache=null;'));
 assert(src.includes('rosterAuthoritySnapshotLoadedAt=0;'));
 assert(src.indexOf('restoreGatePublicDirectoryRc23();')<src.indexOf('renderGatePodGrid();'));
 assert(src.includes('void refreshGatePublicDirectoryAfterLogoutRc23();'));
});
await test('Agent/TL scoped response path cannot populate public gate cache',()=>{
 const call=client.slice(client.indexOf('        async function workspaceReadValuesUncached() {'),client.indexOf('        function workspaceSnapshot('));
 assert(call.includes('if(guest&&rememberGatePublicDirectoryRc23(data.values))restoreGatePublicDirectoryRc23();'));
 assert(call.includes("guest?'/api/workforce/login-directory/bootstrap':'/api/workforce/workspace-read'"));
});
console.log(`RC2.3 guest POD restoration: ${n} checks passed (synthetic browser functions; live staging separate).`);
