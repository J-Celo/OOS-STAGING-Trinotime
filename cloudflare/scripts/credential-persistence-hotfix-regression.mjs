import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import { assessCredentialCutover, classifyCredentialRiskNames } from '../src/credential-cutover-guard.js';
const source=fs.readFileSync(process.argv[2]||new URL('../src/worker.js',import.meta.url),'utf8');
const store=new Map(),versions=new Map();let now=Date.now(),vaultOutage=false,beforeWrite=null;
const clone=x=>x===undefined?null:structuredClone(x);
const put=(path,value)=>{store.set(path,clone(value));versions.set(path,(versions.get(path)||0)+1);};
const tag=path=>store.get(path)==null?'null_etag':`"v${versions.get(path)||0}"`;
const get=async(env,path)=>{if(vaultOutage&&path.startsWith('secureCredentials/'))throw new Error('simulated storage outage');return clone(store.get(path));};
class Clock extends Date {constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
const members=[{role:'agent',name:'Fixture Agent',pod:'pod1',uid:'fixture-agent'}, {role:'team_leader',name:'Fixture Leader',pod:'pod1',uid:'fixture-leader'}];
function runtime(){
 const c=vm.createContext({URL,Request,Response,Headers,crypto:webcrypto,TextEncoder,TextDecoder,btoa,atob,console,Date:Clock,assessCredentialCutover,classifyCredentialRiskNames,createRemoteJWKSet:()=>({}),members,
 io:{get,set:async(env,p,v)=>put(p,v),getTag:async(env,p)=>({value:await get(env,p),etag:tag(p)}),setTag:async(env,p,v,t)=>{if(beforeWrite){const hook=beforeWrite;beforeWrite=null;await hook(p);}if(t!==tag(p))return {preconditionFailed:true};put(p,v);return {committed:true,value:clone(v)};}}});
 vm.runInContext(source.replace(/^import .*;\n/gm,'').replace('export default {','const workerDefault = {').replace('export class ChatRealtimeHub','class ChatRealtimeHub')+`
 firebaseAdminGet=io.get;firebaseAdminSet=io.set;firebaseAdminPatch=async(env,path,values)=>{for(const [key,value] of Object.entries(values)){if(key.startsWith('secureCredentials/'))throw new Error('Unconditional migration credential overwrite');await io.set(env,key,value);}};firebaseAdminGetWithEtag=io.getTag;firebaseAdminSetIfMatch=io.setTag;
 requireActiveAdminUser=async()=>({user:{uid:'fixture-admin'}});
 readDirectory=async()=>members;
 canonicalWorkforceMemberServer=async(env,role,name)=>members.find(m=>m.role===role&&m.name===name);
 requireSecuritySession=async(req,env)=>env.actor;
 requireCurrentSecurityActor=async(env,actor)=>({member:actor});
 issueSecuritySession=async()=>({token:'fixture-session',expiresAt:new Date(Date.now()+86400000).toISOString()});
 verifyIssuedSecuritySessionServer=async()=>({});
 securityCredentialViewer=async(req,env)=>({kind:'security-session',actor:env.actor});
 chatRevokeSessionsServer=async(env,uid,op,cutoff)=>({ok:true,revokedBefore:cutoff});
 enforceRate=()=>{};
 globalThis.test={handleSecurityCredentialMigration,handleSecurityCredentialIssueTemp,handleSecurityCredentialLogin,handleSecurityCredentialChange,handleSecurityCredentialMetadata,readAuthoritativeCredential,writeAuthoritativeCredential,credentialVaultPath,credentialLegacyPath,verifyLegacyCredentialPassword};`,c);
 return c.test;
}
const req=(body)=>new Request('https://fixture.test/',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
let api=runtime();
for(const member of members){
 const env={actor:member},target={role:member.role,name:member.name,pod:member.pod};
 const issued=await api.handleSecurityCredentialIssueTemp(req(target),env);assert.equal(issued.credential.isDefault,true);
 const temp=issued.temporaryPassword;
 assert.equal((await api.handleSecurityCredentialLogin(req({...target,password:temp}),env)).ok,true);
 const delayed=(await api.readAuthoritativeCredential(env,member.role,member.name)).record;
 const password='Private fixture password 2026!';
 assert.equal((await api.handleSecurityCredentialChange(req({password}),env)).credential.isDefault,false);
 // Delayed metadata/login requests that read the old temporary hash must be rejected.
 await assert.rejects(()=>api.writeAuthoritativeCredential(env,member.role,member.name,{...delayed,firebaseIdentityState:'approved'}));
 await assert.rejects(()=>api.writeAuthoritativeCredential(env,member.role,member.name,{...delayed,failedAttempts:1}));
 await api.handleSecurityCredentialMetadata(req({...target,patch:{firebaseIdentityState:'approved'}}),env);
 now+=24*60*60*1000;api=runtime(); // fresh worker with no in-memory/browser cache, next day
 assert.equal((await api.handleSecurityCredentialLogin(req({...target,password}),env)).ok,true);
 assert.equal((await api.handleSecurityCredentialLogin(req({...target,password:temp}),env)).incorrect,true);
 const persisted=(await api.readAuthoritativeCredential(env,member.role,member.name)).record;
 assert.equal(await api.verifyLegacyCredentialPassword(password,persisted),true);
 assert.equal(persisted.isDefault,false);
 // ETag changes after read but before write must also prevent a stale overwrite.
 const first={...persisted};beforeWrite=async p=>put(p,{...store.get(p),updatedAt:'concurrent change'});
 await assert.rejects(()=>api.writeAuthoritativeCredential(env,member.role,member.name,{...first,failedAttempts:0}));
 assert.equal(await api.verifyLegacyCredentialPassword(password,store.get(api.credentialVaultPath(member.role,member.name))),true);
 console.log(`PASS ${member.role}: issue temporary, first login, change, stale writer rejection, identity metadata, next-day fresh-worker login, old password rejected, in-flight write race`);
}
const m=members[0],vp=api.credentialVaultPath(m.role,m.name),lp=api.credentialLegacyPath(m.role,m.name),saved=clone(store.get(vp));
put(lp,{...saved,hash:'retired-legacy-hash'});
vaultOutage=true;await assert.rejects(()=>api.readAuthoritativeCredential({},m.role,m.name,{migrateLegacy:true}));vaultOutage=false;
assert.equal(store.get(vp).hash,saved.hash);
console.log('PASS vault outage cannot trigger legacy fallback or overwrite');
// A concurrent login/password write wins over delayed legacy migration.
put(vp,null);beforeWrite=async p=>put(p,saved);
const migrated=await api.readAuthoritativeCredential({},m.role,m.name,{migrateLegacy:true});assert.equal(migrated.record.hash,saved.hash);assert.equal(store.get(vp).hash,saved.hash);
console.log('PASS delayed legacy migration cannot overwrite a newly populated vault');
// Ordinary migration remains supported.
put(vp,null);put(lp,saved);const cleanMigration=await api.readAuthoritativeCredential({},m.role,m.name,{migrateLegacy:true});assert.equal(cleanMigration.record.hash,saved.hash);assert(cleanMigration.record._vaultReadEtag);
console.log('PASS ordinary legacy migration remains compatible');

// Admin Prepare Vault must not reintroduce the same unconditional write race.
put(vp,null);put('secureCredentials',null);put('kv',{[lp.slice(3)]:saved});
const dry=await api.handleSecurityCredentialMigration(req({dryRun:true}),{});assert.equal(dry.dryRun,true);assert.equal(store.get(vp),null);
beforeWrite=async p=>put(p,saved);
await api.handleSecurityCredentialMigration(req({dryRun:false}),{});assert.equal(store.get(vp).hash,saved.hash);
console.log('PASS administrative Prepare Vault: dry run has no writes and concurrent credentials are preserved');
