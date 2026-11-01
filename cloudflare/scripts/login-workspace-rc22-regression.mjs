// M2.9.66 RC2.2: browser request builder behavioral tests. No live service.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const full=fs.readFileSync(new URL('../public/assets/js/j-b52f8ff97ca5.js',import.meta.url),'utf8');
const start=full.indexOf('        async function workspaceReadValuesUncached() {');
const end=full.indexOf('        function workspaceSnapshot(',start);
assert(start>0&&end>start);
const source=full.slice(start,end);
const pass=[];
function fixture(opts={}){
 let user=opts.user===undefined?{getIdToken:async()=>opts.firebaseToken||'anonymous-jwt'}:opts.user;
 let signedIn=Boolean(opts.admin||opts.tl||opts.agent), identity='stable', requests=[];
 const ctx={
   isAdmin:!!opts.admin,isTeamLeader:!!opts.tl,agentSessionAuthenticated:!!opts.agent,
   firebaseKvBindingEpoch:1,
   workspaceReadIdentity:()=>identity,
   firebase:{auth:()=>({currentUser:user})},
   ensureFirebaseReady:async()=>{if(opts.initialize)user={getIdToken:async()=>opts.firebaseToken||'initialized-anonymous-jwt'};},
   workforceSecuritySessionToken:()=>opts.admin?'':(opts.workforceToken||''),
   currentVerifiedWorkforceFirebaseToken:async()=>opts.verifiedToken||'',
   noteWorkforceAuthorityAuthenticationFailure:()=>{},
   // RC2.3 adds a separately tested public login-directory cache. This legacy
   // request-builder fixture supplies harmless stubs to isolate header tests.
   rememberGatePublicDirectoryRc23:()=>false,
   restoreGatePublicDirectoryRc23:()=>false,
   fetchAuthorityJson:async(url,options)=>{
     requests.push({url,options});
     if(opts.beforeReturn)opts.beforeReturn(()=>{identity='changed';});
     const guest=!signedIn;
     return {response:{ok:!opts.fail,status:opts.fail?401:200},data:opts.fail?{error:'AUTH_REQUIRED',message:'Unauthenticated'}:{ok:true,authority:guest?'login-directory-v1':'workforce-workspace-read-v1',values:{foo:'bar'},revision:'rev1'}};
   },
   Error
 };
 vm.createContext(ctx);vm.runInContext(source,ctx);
 return {ctx,requests};
}
async function test(label,fn){await fn();pass.push(label);console.log('PASS RC2.2:',label);}
await test('guest with remembered workforce token uses anonymous Firebase bearer, never workforce header',async()=>{
 const f=fixture({workforceToken:'stale-workforce-session'});await f.ctx.workspaceReadValuesUncached();assert.equal(f.requests[0].url,'/api/workforce/login-directory/bootstrap');assert.equal(f.requests[0].options.headers.Authorization,'Bearer anonymous-jwt');assert.equal(f.requests[0].options.headers['X-TT-Security-Session'],undefined);
});
await test('guest without workforce token still uses Firebase bearer',async()=>{
 const f=fixture();await f.ctx.workspaceReadValuesUncached();assert.equal(f.requests[0].options.headers.Authorization,'Bearer anonymous-jwt');
});
await test('guest waits for Firebase transport initialization before requesting directory',async()=>{
 const f=fixture({user:null,initialize:true});await f.ctx.workspaceReadValuesUncached();assert.equal(f.requests[0].options.headers.Authorization,'Bearer initialized-anonymous-jwt');
});
await test('guest with no Firebase identity fails closed without contacting server',async()=>{
 const f=fixture({user:null,workforceToken:'stale-workforce-session'});await assert.rejects(f.ctx.workspaceReadValuesUncached(),/verified workforce session/);assert.equal(f.requests.length,0);
});
await test('Agent with valid workforce security session keeps scoped workspace route',async()=>{
 const f=fixture({agent:true,workforceToken:'agent-session'});await f.ctx.workspaceReadValuesUncached();assert.equal(f.requests[0].url,'/api/workforce/workspace-read');assert.equal(f.requests[0].options.headers['X-TT-Security-Session'],'agent-session');assert.equal(f.requests[0].options.headers.Authorization,undefined);
});
await test('TL uses scoped workspace route with TL workforce session',async()=>{
 const f=fixture({tl:true,workforceToken:'tl-session'});await f.ctx.workspaceReadValuesUncached();assert.equal(f.requests[0].url,'/api/workforce/workspace-read');assert.equal(f.requests[0].options.headers['X-TT-Security-Session'],'tl-session');
});
await test('Agent without workforce session needs separately verified permanent Firebase token',async()=>{
 const f=fixture({agent:true,verifiedToken:'permanent-agent-jwt'});await f.ctx.workspaceReadValuesUncached();assert.equal(f.requests[0].options.headers.Authorization,'Bearer permanent-agent-jwt');assert.equal(f.requests[0].url,'/api/workforce/workspace-read');
});
await test('Agent without either authorized token fails closed without contacting server',async()=>{
 const f=fixture({agent:true});await assert.rejects(f.ctx.workspaceReadValuesUncached(),/verified workforce session/);assert.equal(f.requests.length,0);
});
await test('Admin never sends remembered Agent security session to admin read endpoint',async()=>{
 const f=fixture({admin:true,workforceToken:'old-agent-session',verifiedToken:'admin-jwt'});await f.ctx.workspaceReadValuesUncached();assert.equal(f.requests[0].url,'/api/workforce/workspace-read');assert.equal(f.requests[0].options.headers['X-TT-Security-Session'],undefined);assert.equal(f.requests[0].options.headers.Authorization,'Bearer admin-jwt');
});
await test('identity change during inflight workspace refresh rejects stale response',async()=>{
 const f=fixture({workforceToken:'stale',beforeReturn:cb=>cb()});await assert.rejects(f.ctx.workspaceReadValuesUncached(),e=>e.code==='live/read-cancelled');
});
await test('HTTP 401 rejects with explicit authorization failure instead of ReferenceError',async()=>{
 const f=fixture({fail:true,workforceToken:'stale'});await assert.rejects(f.ctx.workspaceReadValuesUncached(),e=>e.code==='AUTH_REQUIRED'&&e.status===401);
});
console.log(`RC2.2 workspace auth regression: ${pass.length} tests passed (synthetic browser function).`);
