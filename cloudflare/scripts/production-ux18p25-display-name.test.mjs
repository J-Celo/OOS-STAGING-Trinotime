// UX18P25: Test the real Admin display-label handler with synthetic Firebase
// data and no network. Do not bypass the original identity rename safeguards.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
const fnStart=source.indexOf('async function handleAdminProfileDisplayNameServer(request,env) {');
const fnEnd=source.indexOf('async function handleWorkforceProfileRename(request,env) {',fnStart);
assert(fnStart>0&&fnEnd>fnStart);
const handlerSource=source.slice(fnStart,fnEnd);
const createFixture=({admin=true,profileExists=true,rosterVerified=true}={})=>{
 let etag=3,writeLog=[], currentProfile={agentName:'DUGHO KRISHNA L.',fullName:'DUGHO KRISHNA L.',bio:'private existing biography',_rev:2,_mutationId:'prior-update',photoStoragePath:'safe/path'};
 let legacy={...currentProfile}, meta={verified:true};
 const employees={verified:rosterVerified,entries:[{name:'DUGHO KRISHNA L.',pod:'POD 2',employeeId:'stable-002',active:true},{name:'ANOTHER AGENT',pod:'POD 1',employeeId:'stable-003',active:true}]};
 const c={console,JSON,TextEncoder,Date,Number,String,Array,Object,RegExp,
  requireActiveAdminUser:async()=>{if(!admin)throw Object.assign(new Error('Admin required'),{status:403,code:'ADMIN_REQUIRED'});return {user:{uid:'admin-1'}}},
  enforceRate:()=>{},
  parseBody:async(req)=>req.body,
  normalizePersonName:v=>String(v||'').trim().replace(/\s+/g,' '),
  cleanText:(v,n)=>String(v||'').trim().slice(0,n||180),
  rosterResolvedStateServer:async()=>({employees}),
  profileSecurePathServer:(role,name)=>'workforceProfiles/v1/records/'+role+':'+name,
  firebaseAdminGetWithEtag:async(_env,path)=>{assert(!path.endsWith('/.json'));return {value:profileExists?JSON.stringify(currentProfile):null,etag:'etag-'+etag}},
  readProfileStateServer:async()=>({raw:JSON.stringify(legacy),meta}),
  parseJsonString:(raw,fallback)=>{try{return JSON.parse(raw)}catch{return fallback}},
  profileRevisionServer:o=>Number(o?._rev)||0,
  profileMutationServer:o=>String(o?._mutationId||''),
  safeIso:()=> '2026-10-29T00:00:00.000Z',
  firebaseAdminSetIfMatch:async(_env,path,payload,match)=>{assert.equal(match,'etag-'+etag);assert(path.startsWith('workforceProfiles/v1/records/'));writeLog.push({path,payload,match});currentProfile=JSON.parse(payload);profileExists=true;etag++;return {committed:true}},
  firebaseAdminGet:async(_env,path)=>{if(path.startsWith('workforceProfiles/'))return JSON.stringify(currentProfile);throw Error('Unexpected read '+path)},
  writeProfileMetaServer:async(_env,r,n,p)=>{meta={...meta,...p};return meta},
  mirrorProfileLegacyServer:async(_env,actor,raw)=>{legacy=JSON.parse(raw);return true},
  fail:(status,code,message)=>{throw Object.assign(new Error(message),{status,code})}
 };
 vm.createContext(c);vm.runInContext(handlerSource,c);
 const call=body=>vm.runInContext('handleAdminProfileDisplayNameServer',c)({body:{}},{}) // unused; overridden below
 const handler=vm.runInContext('handleAdminProfileDisplayNameServer',c);
 return {run:body=>handler({body},{}),writes:()=>writeLog,profile:()=>currentProfile,meta:()=>meta,legacy:()=>legacy,employees};
};
const req={oldName:'DUGHO KRISHNA L.',displayName:'Dugho Krishna L.',pod:'POD 2',employeeId:'stable-002',mutationId:'display-ux18p25-001'};
const cases=[];
async function test(name,fn){await fn();cases.push(name);console.log('PASS',name)}
await test('Admin can correct display label with targeted ETag write and preserved profile content',async()=>{const f=createFixture();const r=await f.run(req);assert.equal(r.ok,true);assert.equal(r.displayName,'Dugho Krishna L.');assert.equal(f.writes().length,1);assert.equal(f.profile().bio,'private existing biography');assert.equal(f.profile().photoStoragePath,'safe/path');assert.equal(f.profile().agentName,'DUGHO KRISHNA L.');assert.equal(f.legacy().fullName,'Dugho Krishna L.');assert.equal(f.meta().verified,true);assert(!JSON.stringify(r).includes('biography'))});
await test('Same mutation is idempotent with zero extra writes',async()=>{const f=createFixture();await f.run(req);const res=await f.run(req);assert.equal(res.alreadyCommitted,true);assert.equal(f.writes().length,1)});
await test('Non-Admin cannot edit display name',async()=>{const f=createFixture({admin:false});await assert.rejects(f.run(req),e=>e.status===403);assert.equal(f.writes().length,0)});
await test('Wrong employee ID fails without a write',async()=>{const f=createFixture();await assert.rejects(f.run({...req,employeeId:'different'}),e=>e.code==='PROFILE_DISPLAY_TARGET_CHANGED');assert.equal(f.writes().length,0)});
await test('Wrong POD fails without a write',async()=>{const f=createFixture();await assert.rejects(f.run({...req,pod:'POD 0'}),e=>e.code==='PROFILE_DISPLAY_TARGET_CHANGED');assert.equal(f.writes().length,0)});
await test('Unverified canonical roster fails closed',async()=>{const f=createFixture({rosterVerified:false});await assert.rejects(f.run(req),e=>e.code==='PROFILE_DISPLAY_ROSTER_UNVERIFIED');assert.equal(f.writes().length,0)});
await test('Display label equal to another account is blocked',async()=>{const f=createFixture();await assert.rejects(f.run({...req,displayName:'ANOTHER AGENT'}),e=>e.code==='PROFILE_DISPLAY_NAME_COLLISION');assert.equal(f.writes().length,0)});
await test('Invalid name and mutation fail before writes',async()=>{const f=createFixture();await assert.rejects(f.run({...req,displayName:'<script>'}),e=>e.code==='PROFILE_DISPLAY_NAME_INVALID');await assert.rejects(f.run({...req,mutationId:'bad'}),e=>e.code==='PROFILE_MUTATION_ID_INVALID');assert.equal(f.writes().length,0)});
await test('Fresh profile can be initialized without identity migration',async()=>{const f=createFixture({profileExists:false});const r=await f.run(req);assert.equal(r.ok,true);assert.equal(f.writes().length,1);assert.equal(f.profile().agentName,req.oldName)});
await test('Canonical roster, credential and attendance paths never written',async()=>{const f=createFixture();await f.run(req);assert(f.writes().every(x=>x.path.startsWith('workforceProfiles/v1/records/')))});
const js=fs.readFileSync(new URL('../../cloudflare/public/assets/js/j-5a9b0d9aeabc.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../../cloudflare/public/index.html',import.meta.url),'utf8');
await test('Admin UI uses safe display endpoint and preserves canonical identity',async()=>{assert(js.includes("securityApiRequest('identity/display-name'"));assert(js.includes('isAdmin ? await performAdminDisplayNameEdit(oldName,newName) : await performRename(oldName,newName)'));assert(js.includes('refreshAgentDisplayNameSurfaces(oldName)'));assert(html.includes('original attendance record keys remain unchanged'))});
await test('Original root memory guard and full identity rename remain unchanged',async()=>{assert(source.includes("IDENTITY_PARTITIONED_MIGRATION_REQUIRED"));assert(source.includes("url.pathname==='/api/security/identity/rename'"));assert(source.includes("url.pathname==='/api/security/identity/display-name'"))});
console.log(`${cases.length}/${cases.length} UX18P25 display-name synthetic tests passed (no live requests)`);
