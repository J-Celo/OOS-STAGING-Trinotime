// M2.9.60: offline cutover-safety tests; NO live database/API requests.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {assessCredentialCutover,classifyCredentialRiskNames} from '../src/credential-cutover-guard.js';
const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=fs.readFileSync(path.join(base,'src/worker.js'),'utf8');
const frontend=fs.readFileSync(path.join(base,'public/assets/js/j-b52f8ff97ca5.js'),'utf8');
const enc=s=>Buffer.from(s,'utf8').toString('base64url');
let passed=0;
const check=(label,fn)=>{fn();passed++;console.log('PASS M2960:',label);};
const counts={activeMembers:2,alreadySecure:2,candidates:0,invalidLegacy:0,missing:0,unreviewedCredentialRisk:0};
check('Healthy active roster can pass readiness without exposing names',()=>{
  const result=assessCredentialCutover(counts);assert.equal(result.ready,true);
  assert.deepEqual(result.blockers,[]);
  assert.ok(!JSON.stringify(result).includes('Test User'));
});
for (const [field,blocker] of [['candidates','PREPARE_VAULT_REQUIRED'],['invalidLegacy','INVALID_ACTIVE_CREDENTIALS'],['missing','MISSING_ACTIVE_CREDENTIALS']]) {
  check(`No vault-only cutover with ${field}`,()=>{
    const modified={...counts,alreadySecure:1,[field]:1};
    const result=assessCredentialCutover(modified);
    assert.equal(result.ready,false);assert.ok(result.blockers.includes(blocker));
  });
}
check('Missing/unclassified credential namespaces independently block cutover',()=>{
  const result=assessCredentialCutover({...counts,unreviewedCredentialRisk:3});
  assert.equal(result.ready,false);assert.ok(result.blockers.includes('UNREVIEWED_CREDENTIAL_PATTERN_KEYS'));
  assert.equal(assessCredentialCutover({...counts,activeMembers:0,alreadySecure:0}).ready,false);
});
check('Malformed and impossible counts never give a false green light',()=>{
  assert.throws(()=>assessCredentialCutover({...counts,missing:-1}),TypeError);
  assert.throws(()=>assessCredentialCutover({...counts,alreadySecure:3}),TypeError);
  assert.throws(()=>assessCredentialCutover({...counts,activeMembers:1.5}),TypeError);
});
check('Legacy key category count is privacy-safe and recognizes unknown risks',()=>{
  const names=['agentauth:QA Agent','tlauth:QA TL','adminauth:old','employee_password_fallback','employees'];
  const result=classifyCredentialRiskNames(names.map(enc));
  assert.equal(result.recognizedLegacy,2);assert.equal(result.unreviewed,2);
  for(const item of names)assert.ok(!JSON.stringify(result).includes(item));
  assert.throws(()=>classifyCredentialRiskNames([{secret:'do not inspect'}]),TypeError);
});
const start=source.indexOf('async function handleSecurityCredentialMigration(request, env) {');
const end=source.indexOf('async function authorizeCredentialLifecycle(',start);
assert.ok(start>0&&end>start);
const handler=source.slice(start,end);
check('UI refuses missing, unreviewed or server-failed cutover preflight',()=>{
  const start=frontend.indexOf('async function runSecureCredentialVaultCutover(button) {');
  const end=frontend.indexOf('function setupFirebaseIdentityMigrationPanel()',start);
  assert.ok(start>0&&end>start);
  const fn=frontend.slice(start,end);
  assert.match(fn,/const unreviewed = /);
  assert.match(fn,/if \(missing > 0\)/);
  assert.match(fn,/if \(unreviewed > 0\)/);
  assert.match(fn,/preview\.cutoverReady !== true/);
});
check('Backend rejects cutover without relying on UI confirmation',()=>{
  for(const expected of ['SECURITY_MIGRATION_MISSING_CREDENTIALS','SECURITY_MIGRATION_UNREVIEWED_CREDENTIAL_KEYS','SECURITY_MIGRATION_EMPTY_ROSTER','SECURITY_MIGRATION_PREPARE_REQUIRED','SECURITY_MIGRATION_INVALID_LEGACY'])
    assert.ok(handler.includes(expected),`${expected} must be enforced server side`);
  assert.match(handler,/assessCredentialCutover\(/);
  assert.match(handler,/requireActiveAdminUser\(request,env\)/);
  assert.match(handler,/deleteLegacy&&body\.confirm!=='MIGRATE_CREDENTIALS'/);
});
let externalWrites=0,externalReads=0;
const member={name:'QA Example',role:'agent',pod:'QA POD'};
const vaultId=enc('qa example');
const kvId=enc('agentauth:QA Example');
const snapshot={members:[member],kv:{},secure:{agent:{[vaultId]:{hash:'FAKE_HASH',salt:'FAKE_SALT'}}},policy:null};
const context={
  String,Number,Math,Object,Array,Promise,Boolean,Date,
  assessCredentialCutover,classifyCredentialRiskNames,
  SECURE_CREDENTIAL_ROOT:'secureCredentials', RELEASE:'2.0.3',
  requireActiveAdminUser:async r=>{if(r.actor!=='admin')throw Object.assign(new Error('unauthorized'),{status:403});return {user:{uid:'OFFLINE_ADMIN'}};},
  enforceRate:()=>{},parseBody:async r=>r.body,
  readDirectory:async()=>snapshot.members,
  firebaseAdminGet:async(_env,path)=>{externalReads++;if(path==='kv')return snapshot.kv;if(path==='secureCredentials')return snapshot.secure;throw Error('Unexpected test path');},
  credentialVaultPolicy:async()=>snapshot.policy,
  credentialRole:r=>['agent','team_leader'].includes(r)?r:'',
  normalizePersonName:n=>String(n||'').trim(),
  fbEncodeKeyServer:enc,
  credentialLegacyStorageKey:(role,name)=>`${role==='team_leader'?'tlauth:':'agentauth:'}${name}`,
  credentialRecord:(raw)=>raw&&raw.hash&&raw.salt?raw:null,
  safeIso:()=> '2026-10-10T00:00:00Z',
  readAuthoritativeCredential:async()=>{throw Error('Should never migrate on guarded paths');},
  firebaseAdminPatch:async()=>{externalWrites++;},
  fail:(status,code,message)=>{throw Object.assign(new Error(message||code),{status,code});}
};
vm.createContext(context);vm.runInContext(handler,context);
const request=(body,actor='admin')=>({body,actor});
const action={dryRun:false,deleteLegacy:true,confirm:'MIGRATE_CREDENTIALS'};
async function denyCase(label,setup,expected){
  snapshot.members=[member];snapshot.kv={};snapshot.secure={agent:{[vaultId]:{hash:'FAKE_HASH',salt:'FAKE_SALT'}}};snapshot.policy=null;
  setup();const before=externalWrites;
  await assert.rejects(()=>context.handleSecurityCredentialMigration(request(action),{}),e=>e.status===409&&e.code===expected);
  assert.equal(externalWrites,before,`No mutation allowed for ${expected}`);
  passed++;console.log('PASS M2960:',label);
}
await denyCase('Missing active credential blocks final cutover',()=>{snapshot.secure={agent:{}};},'SECURITY_MIGRATION_MISSING_CREDENTIALS');
await denyCase('Unknown credential-pattern key blocks final cutover',()=>{snapshot.kv={[enc('backup_password_record')]: 'IGNORE_VALUES'};},'SECURITY_MIGRATION_UNREVIEWED_CREDENTIAL_KEYS');
await denyCase('No active roster blocks final cutover',()=>{snapshot.members=[];},'SECURITY_MIGRATION_EMPTY_ROSTER');
await denyCase('Unprepared legacy credential blocks final cutover',()=>{snapshot.secure={agent:{}};snapshot.kv={[kvId]:{hash:'LEGACY_FAKE',salt:'LEGACY_FAKE'}};},'SECURITY_MIGRATION_PREPARE_REQUIRED');
await denyCase('Malformed active legacy record blocks cutover',()=>{snapshot.secure={agent:{}};snapshot.kv={[kvId]:'BAD_RECORD'};},'SECURITY_MIGRATION_INVALID_LEGACY');
await assert.rejects(()=>context.handleSecurityCredentialMigration(request(action,'agent'),{}),e=>e.status===403);
passed++;console.log('PASS M2960: Non-admin has no cutover authority');
snapshot.members=[member];snapshot.kv={[kvId]:{hash:'LEGACY_FAKE',salt:'LEGACY_FAKE'}};snapshot.secure={agent:{[vaultId]:{hash:'VAULT_FAKE',salt:'VAULT_FAKE'}}};
const report=await context.handleSecurityCredentialMigration(request({dryRun:true,deleteLegacy:false}),{});
assert.equal(report.cutoverReady,true);assert.equal(report.summary.unreviewedCredentialRisk,0);assert.deepEqual(Array.from(report.sample),[]);
passed++;console.log('PASS M2960: Readiness report has counts, no credential names or values');
const before=externalWrites;
const ok=await context.handleSecurityCredentialMigration(request(action),{});
assert.equal(ok.cutoverReady,true);assert.equal(externalWrites,before+1);
passed++;console.log('PASS M2960: Valid cutover retains explicit confirmation and guarded atomic patch');
console.log(`M2.9.60: ${passed} offline safety tests passed. No Firebase calls made. Broad /kv READ EXPOSURE NOT FIXED.`);
