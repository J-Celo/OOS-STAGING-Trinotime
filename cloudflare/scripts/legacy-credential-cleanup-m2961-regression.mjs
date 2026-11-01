// M2.9.61 — offline, synthetic tests ONLY. No Firebase/Cloudflare traffic.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {summarizeLegacyCredentialCleanup} from '../src/legacy-credential-cleanup-m2961.js';
const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const worker=fs.readFileSync(path.join(base,'src/worker.js'),'utf8');
const enc=s=>Buffer.from(s,'utf8').toString('base64url');
let passed=0;
const check=(name,fn)=>{fn();passed++;console.log('PASS M2961:',name);};
const names=['agentauth:QA Agent','tlauth:QA Lead','agentauth:Old QA',
  'adminauth:old-admin','legacy_password_note','employees','shift_settings'];
const active=new Set([enc(names[0]),enc(names[1])]);
const keys=names.map(enc);
check('Known current vs unmatched namespaces, unclassified risks kept distinct',()=>{
  const out=summarizeLegacyCredentialCleanup(keys,active);
  assert.equal(out.totalKeys,7);
  assert.equal(out.credentialPatternKeys,5);
  assert.equal(out.recognizedActiveLegacy,2);
  assert.equal(out.recognizedUnmatchedLegacy,1);
  assert.equal(out.recognizedAgentLegacy,2);
  assert.equal(out.recognizedTeamLeaderLegacy,1);
  assert.equal(out.otherCredentialPatterns,2);
  assert.equal(out.reviewRequired,true);
  assert.equal(out.deletionAuthorized,false);
  assert.equal(out.rulesCutoverReady,false);
  for (const sensitive of [...names,...keys]) assert.ok(!JSON.stringify(out).includes(sensitive),`Name must not leak: ${sensitive}`);
});
check('Never claims arbitrary risk-name count proves credentials exist',()=>{
  const out=summarizeLegacyCredentialCleanup([enc('password_hint')],new Set());
  assert.equal(out.otherCredentialPatterns,1);
  assert.equal(out.deletionAuthorized,false);
});
check('Encoded names must be valid, canonical, and bounded; bad names flagged',()=>{
  const out=summarizeLegacyCredentialCleanup(['invalid+base64', 'Zg===', '%%%%', enc('employees')],new Set());
  assert.equal(out.invalidEncodedNames,3);
  assert.equal(out.totalKeys,4);
  assert.equal(out.reviewRequired,true);
  assert.throws(()=>summarizeLegacyCredentialCleanup([{hash:'SECRET'}],new Set()),TypeError);
  assert.throws(()=>summarizeLegacyCredentialCleanup(keys,['not a set']),TypeError);
  assert.throws(()=>summarizeLegacyCredentialCleanup(Array(50001).fill(enc('x')),new Set()),TypeError);
});
check('Empty collection is safe to inventory, never authorizes deletion',()=>{
  const out=summarizeLegacyCredentialCleanup([],new Set());
  assert.equal(out.credentialPatternKeys,0);
  assert.equal(out.reviewRequired,false);
  assert.equal(out.deletionAuthorized,false);
});
const start=worker.indexOf('// M2.9.61 — counts-only legacy credential cleanup READINESS');
const end=worker.indexOf('async function readLegacyKvDecodedServer(env)',start);
assert.ok(start>0&&end>start);
const handler=worker.slice(start,end);
check('New route is GET-only and not a generic data-return endpoint',()=>{
  assert.match(worker,/url\.pathname==='\/api\/security\/credential\/legacy-cleanup-readiness'&&request\.method==='GET'/);
  assert.match(handler,/readShallowKvKeysForRiskSummaryServer\(env\)/);
  assert.match(handler,/rosterResolvedStateServer\(env\)/);
  assert.doesNotMatch(handler,/firebaseAdminPatch\(|firebaseAdminSet\(|await readDirectory\(/);
  assert.match(handler,/String\(env\.DEPLOYMENT_ENV \|\| ''\).*staging/);
  assert.match(handler,/requireActiveAdminUser\(request,env\)/);
});
let privilegedReads=0, totalWrites=0, rateCalls=0;
let shallow=keys;let reportedPolicy={mode:'vault-only'};
const fixture={employees:{entries:[{name:'QA Agent',active:true}]},teamLeaderDirectory:{entries:[{name:'QA Lead',active:true}]}};
const ctx={
  String,Number,Object,Array,Promise,Boolean,Set,
  summarizeLegacyCredentialCleanup,
  requireActiveAdminUser:async r=>{
    if(!r.role)throw Object.assign(Error('unauthenticated'),{status:401});
    if(r.role!=='admin')throw Object.assign(Error('forbidden'),{status:403});
    return {user:{uid:'STAGING_TEST_ADMIN'}};
  },
  enforceRate:()=>{rateCalls++;},
  readShallowKvKeysForRiskSummaryServer:async()=>{privilegedReads++;return shallow;},
  rosterResolvedStateServer:async()=>{privilegedReads++;return fixture;},
  credentialVaultPolicy:async()=>{privilegedReads++;return reportedPolicy;},
  legacyEmployeeIsActive:r=>r.active!==false,
  normalizePersonName:n=>String(n||'').trim(),
  fbEncodeKeyServer:enc,
  credentialLegacyStorageKey:(role,name)=>role==='team_leader'?`tlauth:${name}`:`agentauth:${name}`,
  fail:(status,code)=>{throw Object.assign(Error(code),{status,code});},
  firebaseAdminPatch:()=>{totalWrites++;throw Error('No writes allowed');}
};
vm.createContext(ctx);vm.runInContext(handler,ctx);
for(const mode of ['production','', 'PRODUCTION'])await assert.rejects(
  ()=>ctx.handleSecurityCredentialLegacyCleanupReadinessServer({role:'admin'}, {DEPLOYMENT_ENV:mode}),
  err=>err.status===404);
check('Production deployment rejects request before privileged reads',()=>assert.equal(privilegedReads,0));
for(const role of [null,'agent','team_leader'])await assert.rejects(
  ()=>ctx.handleSecurityCredentialLegacyCleanupReadinessServer({role},{DEPLOYMENT_ENV:'staging'}),
  err=>err.status===(role?403:401));
check('Unauthenticated, Agent, and TL cannot enumerate staging names',()=>assert.equal(privilegedReads,0));
const result=await ctx.handleSecurityCredentialLegacyCleanupReadinessServer({role:'admin'},{DEPLOYMENT_ENV:'staging'});
check('Active Admin receives counts only, with no names and no write actions',()=>{
  assert.equal(privilegedReads,3);
  assert.equal(rateCalls,1);
  assert.equal(totalWrites,0);
  assert.equal(result.vaultOnlyReported,true);
  assert.equal(result.credentialPatternKeys,5);
  assert.equal(result.recognizedActiveLegacy,2);
  assert.equal(result.recognizedUnmatchedLegacy,1);
  assert.equal(result.otherCredentialPatterns,2);
  assert.equal(result.activeRosterCredentialSlots,2);
  assert.equal(result.containsOnlyCounts,true);
  assert.equal(result.deletionAuthorized,false);
  for(const secret of [...names,...keys,'QA Lead','QA Agent','SECRET_HASH','PASSWORD'])assert.ok(!JSON.stringify(result).includes(secret));
});
reportedPolicy={mode:'migration'};
const nonVault=await ctx.handleSecurityCredentialLegacyCleanupReadinessServer({role:'admin'},{DEPLOYMENT_ENV:'staging'});
check('Does not falsely claim vault-only status',()=>assert.equal(nonVault.vaultOnlyReported,false));
shallow=[{key: 'BAD'}];
await assert.rejects(()=>ctx.handleSecurityCredentialLegacyCleanupReadinessServer({role:'admin'},{DEPLOYMENT_ENV:'staging'}),TypeError);
check('Malformed key response fails closed, no database mutation',()=>assert.equal(totalWrites,0));
console.log(`M2.9.61: ${passed} synthetic read-only security tests passed; /kv READ exposure remains open.`);
