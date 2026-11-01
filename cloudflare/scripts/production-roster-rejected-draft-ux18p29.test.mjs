import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../public/assets/js/j-5a9b0d9aeabc.js',import.meta.url),'utf8');
const chunk=(a,b)=>{const i=source.indexOf(a),j=source.indexOf(b,i);assert(i>=0&&j>i,a);return source.slice(i,j)};
const helpers=chunk('        function isProtectedQaRosterRejection(', '        function getLocalKeysWithPrefix(');
const rosterApply=chunk('        function applyRosterAuthorityDocument(', '        async function rosterAuthoritySnapshot(');
const appGet=chunk('            async get(k) {','            async set(k, v) {');
const pending=chunk('        async function flushPendingBlob(', '            if (isScheduleBlobAuthorityKey(realKey)');
assert.match(source,/if\(isDefinitiveRosterDraftRejection\(error\)\)\{const blocked=await quarantineRejectedQaRosterDraft/);
assert.match(pending,/isDefinitiveRosterDraftRejection\(error\)/);
assert.match(pending,/preserveRejectedRosterDraft\(storedRaw,REJECTED_INVALID_ROSTER_DRAFT_KEY\)/);
assert.match(rosterApply,/doc\.verified===true\|\|!canUseEmployeeRosterDraft\(\)/);
const kv=new Map(),calls=[];
const roster={verified:true,version:'canonical-v55',entries:[{name:'Real agent',pod:'POD 2'},{name:'Protected QA',pod:'OOS Coverage Beta QAs'}]};
let applied=[];
const c={
 REJECTED_QA_ROSTER_DRAFT_KEY:'trinotime:rejected-qa-roster-draft-v1',
 REJECTED_INVALID_ROSTER_DRAFT_KEY:'trinotime:rejected-invalid-roster-draft-v1',
 safeLocalGet:k=>kv.get(k)||null,
 safeLocalSet:(k,v)=>{kv.set(k,v);return true},
 safeLocalRemove:k=>kv.delete(k),
 markPendingMutation:()=>calls.push('mutation'),
 rosterAuthoritySnapshot:async()=>({employees:roster}),
 applyRosterAuthorityDocument:(kind,doc)=>{applied.push({kind,doc})},
 appendSyncAudit:(kind,message,detail)=>calls.push(detail.code),
 updatePendingSyncUi:()=>calls.push('ui'),
 showToast:()=>{},
 refreshRosterDependentViews:()=>calls.push('refresh')
};
vm.createContext(c);vm.runInContext(helpers,c);
const qaError={status:403,code:'OOS_QA_TEAM_MEMBERSHIP_LOCKED'};
const invalidError={status:400,code:'ROSTER_EMPLOYEES_INVALID'};
for(const e of [qaError,invalidError]) assert.equal(c.isDefinitiveRosterDraftRejection(e),true);
for(const e of [{status:403,code:'AUTH_FORBIDDEN'},{status:403,code:'ROSTER_INTENTS_REJECTED'},{status:401,code:'OOS_QA_TEAM_MEMBERSHIP_LOCKED'},{status:429,code:'ROSTER_EMPLOYEES_INVALID'},{status:503,code:'ROSTER_EMPLOYEES_INVALID'}])assert.equal(c.isDefinitiveRosterDraftRejection(e),false);
const q1='qa rejected draft ONE',q2='qa rejected draft TWO',bad='unknown pod/duplicate draft';
kv.set('pending:att:2026-10-29','KEEP PUNCH');
kv.set('pending:employees',q1);
assert.equal(await c.quarantineRejectedQaRosterDraft('pending:employees',q1,roster,qaError),true);
assert.equal(kv.get(c.REJECTED_QA_ROSTER_DRAFT_KEY),q1);
kv.set('pending:employees',q2);
assert.equal(await c.quarantineRejectedQaRosterDraft('pending:employees',q2,roster,qaError),true);
assert.equal(kv.get(c.REJECTED_QA_ROSTER_DRAFT_KEY+':slot1'),q2);
kv.set('pending:employees',bad);
assert.equal(await c.quarantineRejectedQaRosterDraft('pending:employees',bad,roster,invalidError),true);
assert.equal(kv.get(c.REJECTED_INVALID_ROSTER_DRAFT_KEY),bad);
assert.equal(kv.has('pending:employees'),false);
assert.equal(kv.get('pending:att:2026-10-29'),'KEEP PUNCH');
assert.equal(applied.length,3,'verified canonical roster shown after quarantine');
assert.equal(calls.filter(x=>x==='refresh').length,3);
kv.set('pending:employees','new edit');
assert.equal(await c.quarantineRejectedQaRosterDraft('pending:employees','old edit',roster,invalidError),false);
assert.equal(kv.get('pending:employees'),'new edit','race-safe pending key');
// A full archive must never drop a rejected draft or silently clear pending state.
for(let i=0;i<16;i++)kv.set(c.REJECTED_INVALID_ROSTER_DRAFT_KEY+(i?':slot'+i:''),'other-'+i);
assert.equal(await c.quarantineRejectedQaRosterDraft('pending:employees','new edit',roster,invalidError),false);
assert.equal(kv.get('pending:employees'),'new edit');
// Verified roster must take precedence in display even when a rejected local draft is pending.
const ui={
 employees:[{name:'local invalid',pod:'POD 0'}],employeesVersion:'local',
 rosterSecureVerified:{employees:true,pod:false,teamLeader:false},rosterSecureReadActive:true,
 rosterAuthoritySnapshotIdentity:'admin-uid-1',workspaceReadIdentity:()=> 'admin-uid-1',
 canUseEmployeeRosterDraft:()=>true,
 hasPendingWrite:()=>true,
 pendingWritePayload:()=>JSON.stringify([{name:'local invalid',pod:'POD 0'}]),
 sanitizeEmployeeRoster:x=>x,
 setLocalMirrorForKey:(k,v)=>kv.set('mirror:'+k,v),safeLocalSet:(k,v)=>kv.set(k,v),
 fbKvCache:{},safeLocalGet:()=>null,safeLocalRemove:()=>{},
 isCredentialStorageKey:()=>false,hasPendingDelete:()=>false,isProfileStorageKey:()=>false,
 appStorageLocalReadDepth:0
};
vm.createContext(ui);vm.runInContext(rosterApply+';globalThis.storage={'+appGet+'};',ui);
ui.applyRosterAuthorityDocument('employees',roster);
assert.equal(ui.employees.length,2);
assert.equal(JSON.parse(await ui.storage.get('employees'))[0].name,'Real agent');
ui.rosterAuthoritySnapshotIdentity='different-admin';
assert.equal(JSON.parse(await ui.storage.get('employees'))[0].name,'local invalid','never expose stale verified roster to another account');
ui.rosterAuthoritySnapshotIdentity='admin-uid-1';
assert.equal(ui.employeesVersion,'canonical-v55');
// A non-verified legacy fallback cannot override a pending draft in an authenticated Admin workspace.
ui.rosterSecureVerified.employees=false;
ui.applyRosterAuthorityDocument('employees',{verified:false,version:'old',entries:[]});
assert.equal(ui.employees.length,2);
console.log('PASS UX18P29: definitive 400/403 archived separately, multiple drafts preserved, stale editor cannot hide verified roster, nondefinitive auth and transient errors untouched, attendance queue intact, canonical roster read-only.');
