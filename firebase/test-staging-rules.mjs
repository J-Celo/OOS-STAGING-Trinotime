import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const base = JSON.parse(fs.readFileSync(path.join(dir,'STAGING-RULES-USER-SUPPLIED-BACKUP.json'),'utf8'));
const result = JSON.parse(fs.readFileSync(path.join(dir,'STAGING-RULES-PROPOSED-M2955-ONLY-TIME-AUDIT.json'),'utf8'));
const isDenyWrite = node => node && node['.write'] === false && Object.entries(node).every(([k,v])=>
  !k.startsWith('.') && v && typeof v === 'object' && !Array.isArray(v) ? isDenyWrite(v) : true);

assert.equal(base.rules['.read'],false);
assert.equal(base.rules['.write'],false);
assert.deepEqual(result.rules.serverTimeAudit,{'.read':false,'.write':false});
assert(isDenyWrite(result.rules.serverTimeAudit));
assert(isDenyWrite(result.rules.auditEvents));
assert.match(result.rules.auditEvents['.read'],/admin/);
assert.doesNotMatch(result.rules.auditEvents['.read'],/premium_manager/); // cannot broaden existing admin-only audit view
for(const key of Object.keys(base.rules))if(key!=='serverTimeAudit')assert.deepEqual(result.rules[key],base.rules[key],`Changed unrelated branch ${key}`);
assert.deepEqual(Object.keys(result.rules),Object.keys(base.rules));
assert.equal(result.rules.securePremiumEntitlements.tt_emp_bebless_velasco_p0_001['.write'],false);
assert.equal(result.rules.securePremiumEntitlements.tt_emp_bebless_velasco_p0_001['.validate'],base.rules.securePremiumEntitlements.tt_emp_bebless_velasco_p0_001['.validate']);
assert.deepEqual(result.rules.kv,base.rules.kv);
assert.deepEqual(result.rules.agentPresence,base.rules.agentPresence);
assert.deepEqual(result.rules.roles,base.rules.roles);
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'trinotime-staging-rules-'));
const generator=path.join(dir,'prepare-staging-rules.mjs');
function run(doc,outName){const input=path.join(scratch,`${outName}-input.json`),out=path.join(scratch,`${outName}-output.json`);fs.writeFileSync(input,JSON.stringify(doc));return spawnSync(process.execPath,[generator,input,out],{encoding:'utf8'});}
try{
  assert.equal(run(base,'safe').status,0,'must accept supplied staging rules');
  const missing=structuredClone(base);delete missing.rules.secureCredentials;assert.notEqual(run(missing,'wrong-snapshot').status,0);
  const wrong=structuredClone(base);wrong.rules['.read']=true;assert.notEqual(run(wrong,'open-root').status,0);
  const badAudit=structuredClone(base);badAudit.rules.auditEvents['$eventId']['.write']='auth != null';assert.notEqual(run(badAudit,'open-audit').status,0);
  const badPremium=structuredClone(base);badPremium.rules.securePremiumEntitlements.tt_emp_bebless_velasco_p0_001['.write']='auth != null';assert.notEqual(run(badPremium,'open-premium').status,0);
}finally{fs.rmSync(scratch,{recursive:true,force:true});}
console.log('PASS: 18 staging rules invariants + negative/offline generator scenarios.');
console.log('CAVEAT: Not Firebase Emulator tests, not verification of published rules or live staging deployment.');
