// Offline structure and SOURCE equivalence ONLY; not a Firebase Emulator test.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const base = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const r = JSON.parse(fs.readFileSync(path.join(base,'firebase-rtdb-rules-PRODUCTION-REVIEWED-COMPATIBILITY-20261018.json'),'utf8')).rules;
assert.equal(r['.read'],false); assert.equal(r['.write'],false);
assert.equal(r.kv['.read'],'auth != null'); assert.equal(r.kv['.write'],false);
assert.equal(r.agentPresence['.read'],'auth != null'); assert.equal(r.agentPresence['.write'],false);
assert.equal(r.securePremiumEntitlements.tt_emp_bebless_velasco_p0_001['.read'],'auth != null');
assert.equal(r.securePremiumEntitlements.tt_emp_bebless_velasco_p0_001['.write'],false);
assert.deepEqual(r.serverTimeAudit,{'.read':false,'.write':false});
assert.deepEqual(r.workforceIdentity,{'.read':false,'.write':false});
assert.equal(r.auditEvents['$eventId']['.write'],false);
assert.equal(r.secureCredentials['.read'],false); assert.equal(r.secureCredentials['.write'],false);
assert.equal(r.securityConfig['.read'],false); assert.equal(r.securityConfig['.write'],false);
assert.equal(r.identityMigrationRequests['.read'],false); assert.equal(r.identityMigrationRequests['.write'],false);
assert.equal(r.roles['$uid']['.read'],'auth != null && auth.uid === $uid');
function checkWrites(node,p='') {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return;
  for(const [key,val] of Object.entries(node)) {
    if(key==='.write')assert.equal(val,false,'Unexpected client write grant at '+p);
    else if (!key.startsWith('.'))checkWrites(val,p+'/'+key);
  }
}
checkWrites(r);
console.log('PASS: reviewed production policy is default-deny, no client writes, documented read-only exceptions.');
console.log('NOT VERIFIED: Firebase Emulator, actual published Firebase rules, live end-to-end production browser workflows.');
