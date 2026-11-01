import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const script=fs.readFileSync(new URL('../public/assets/js/j-5a9b0d9aeabc.js',import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
const begin=script.indexOf('        function isProtectedQaRosterRejection(');
const end=script.indexOf('        function getLocalKeysWithPrefix(',begin);
assert.ok(begin>=0 && end>begin,'protected rejected-roster helper must exist');
const pendingBranch=script.slice(script.indexOf('        async function flushPendingBlob('),script.indexOf('            if (isScheduleBlobAuthorityKey(realKey)',script.indexOf('        async function flushPendingBlob(')));
assert.match(pendingBranch,/isDefinitiveRosterDraftRejection\(error\)/,'pending replay handles definitive server denial');
assert.match(pendingBranch,/quarantineRejectedQaRosterDraft\(storageKey,storedRaw,doc,error\)/);
assert.match(script,/\.catch\(async error=>\{if\(isDefinitiveRosterDraftRejection\(error\)\)/,'initial roster write also handles permanent denial');
assert.doesNotMatch(script,/if \(usedDefaultEmployees && isAdmin\) await saveEmployees\(\)/,'initial Admin login must not seed a fallback roster');
assert.match(worker,/OOS_QA_TEAM_MEMBERSHIP_LOCKED/,'server QA team lock remains enforced');
assert.match(worker,/ROSTER_BULK_REMOVAL_BLOCKED/,'server mass deletion lock remains enforced');

const kv = new Map();
const calls = [];
const draft=JSON.stringify({payload:JSON.stringify([{name:'Test agent',pod:'OOS Coverage Beta QAs'}]),baseVersion:'v1',targetVersion:'v2'});
kv.set('pending:employees',draft);
kv.set('pending:att:unrelated','protected attendance queue');
const verified={verified:true,entries:[{name:'Real QA',pod:'OOS Coverage Beta QAs'}],version:'server'};
const c={
  REJECTED_QA_ROSTER_DRAFT_KEY:'trinotime:rejected-qa-roster-draft-v1',
  safeLocalGet:k=>kv.has(k)?kv.get(k):null,
  safeLocalSet:(k,v)=>{kv.set(k,v);return true;},
  safeLocalRemove:k=>{kv.delete(k);return true;},
  markPendingMutation:()=>calls.push('mark'),
  rosterAuthoritySnapshot:async()=>{calls.push('read');return {employees:verified}},
  applyRosterAuthorityDocument:(kind,doc,source)=>calls.push(['apply',kind,doc.version,source]),
  appendSyncAudit:(kind,_,info)=>calls.push(['audit',kind,info.code]),
  updatePendingSyncUi:()=>calls.push('ui'),
  showToast:message=>calls.push(['toast',message])
};
vm.createContext(c);
vm.runInContext(script.slice(begin,end),c);
assert.equal(c.isProtectedQaRosterRejection({status:403,code:'OOS_QA_TEAM_MEMBERSHIP_LOCKED'}),true);
for(const e of [{status:403,code:'UNRELATED'},{status:429,code:'OOS_QA_TEAM_MEMBERSHIP_LOCKED'},{status:503,code:'OOS_QA_TEAM_MEMBERSHIP_LOCKED'}])assert.equal(c.isProtectedQaRosterRejection(e),false);
assert.equal(await c.quarantineRejectedQaRosterDraft('pending:employees',draft,verified),true);
assert.equal(kv.get('pending:employees'),undefined,'definitively rejected roster must leave active retry queue');
assert.equal(kv.get('pending:att:unrelated'),'protected attendance queue','attendance queue remains intact');
assert.equal(kv.get('trinotime:rejected-qa-roster-draft-v1'),draft,'draft is preserved exactly without exporting it');
assert.equal(calls.filter(x=>Array.isArray(x)&&x[0]==='apply').length,1,'verified secure roster is reapplied once');
assert.equal(await c.quarantineRejectedQaRosterDraft('pending:employees',draft,verified),false,'never clears newer pending mutation');
kv.set('pending:employees','new draft');
assert.equal(await c.quarantineRejectedQaRosterDraft('pending:employees','new draft',verified),true,'second rejected draft gets separate archival slot');
assert.equal(kv.get('pending:employees'),undefined,'second rejected draft is retired after verified archival');
assert.equal(kv.get('trinotime:rejected-qa-roster-draft-v1:slot1'),'new draft','second draft preserved separately');
assert.equal(kv.get('trinotime:rejected-qa-roster-draft-v1'),draft,'first draft remains intact');
assert.ok(calls.every(x=>!(Array.isArray(x)&&x[0]==='write')),'no server writes during quarantine');
console.log('PASS production rejected QA roster replay: 403-only guard, read-only roster restore, preserved local draft, no repeated pending write, no attendance queue mutation, server membership/deletion safeguards intact.');
