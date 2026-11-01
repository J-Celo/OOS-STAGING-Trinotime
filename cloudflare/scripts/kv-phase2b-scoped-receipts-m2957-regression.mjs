// Staging-only client migration regression. It deliberately does NOT assert /kv lockdown.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const client=fs.readFileSync(path.join(root,'public/assets/js/j-b52f8ff97ca5.js'),'utf8');
const worker=fs.readFileSync(path.join(root,'src/worker.js'),'utf8');
const version=JSON.parse(fs.readFileSync(path.join(root,'public/version.json'),'utf8'));
let count=0;
const check=(label,test)=>{test();count++;console.log('PASS M2957:',label);};
const body=(start,end)=>{const a=client.indexOf(start);assert.ok(a>=0,`Missing function ${start}`);const b=client.indexOf(end,a+start.length);assert.ok(b>a,`Missing function boundary ${end}`);return client.slice(a,b);};
const premium=body('async function loadPremiumAccessPolicy()', 'async function setPremiumAccessForPod(');
const versions=body('async function verifyVersionedPayloadOnServer(', 'async function verifyAttendancePayloadOnServer(');
const attendance=body('async function verifyAttendancePayloadOnServer(', 'function parseAttendanceRecordRaw(');
const punch=body('async function verifyPunchReceiptOnServer(', 'function acknowledgePunchEventsForRecord(');
check('Premium policy never read directly from client kv',()=>{
  assert.ok(!/\.ref\(\s*['"`]kv\//.test(premium));
  assert.ok(!/firebase-kv/.test(premium));
  assert.match(premium,/governanceAuthorityFetch\('premium-policy'/);
});
check('Premium failures retain fail-closed trust marking',()=>{
  assert.match(premium,/markPremiumPodPolicyTrust\('unverified'/);
  assert.match(premium,/markPremiumPodPolicyTrust\('missing'/);
  assert.match(client,/status === 'server-confirmed'/);
});
check('Shift receipts use scoped Schedule authority',()=>{
  assert.match(versions,/isScheduleRecordAuthorityKey\(key\)/);
  assert.match(versions,/await scheduleAuthorityReadRecord\(key\)/);
  assert.ok(!/\.ref\(\s*['"`]kv\//.test(versions));
});
check('Attendance versioned receipts use scoped Attendance authority',()=>{
  assert.match(attendance,/shouldUseAttendanceAuthority\(key\)/);
  assert.match(attendance,/await attendanceAuthorityReadRecord\(key\)/);
  assert.ok(!/\.ref\(\s*['"`]kv\//.test(attendance));
});
check('Punch receipts use scoped Attendance authority and event correlation',()=>{
  assert.match(punch,/shouldUseAttendanceAuthority\(key\)/);
  assert.match(punch,/await attendanceAuthorityReadRecord\(key\)/);
  assert.match(punch,/punchReceiptMatches\(remote, field, timestamp, eventId\)/);
  assert.ok(!/\.ref\(\s*['"`]kv\//.test(punch));
});
check('Existing Worker authorization checks POD and workforce identity',()=>{
  assert.match(worker,/async function handleWorkforceAttendanceRead\(request,env,url\)/);
  assert.match(worker,/authorizeAttendanceReadServer\(env,actor,parsedKey,authRecord\)/);
  assert.match(worker,/async function handleScheduleReadRecord\(request,env,url\)/);
  assert.match(worker,/scheduleRecordReadableServer\(env,actor,rec\)/);
  assert.match(worker,/async function handleGovernancePremiumGetServer\(request,env\)/);
  assert.match(worker,/await requireGovernanceActorServer\(request,env\)/);
});
check('Published rules unchanged; compatibility listeners use authorized Worker values',()=>{
  assert.match(client,/const liveKvRef = secureWorkspaceRef\('kv'\)/);
  assert.match(client,/liveKvRef.on\('child_added'/);
  assert.match(client,/Direct browser shared \/kv writes are disabled/);
});
check('Build remains staging-only and versioned without changing portal version',()=>{
  assert.equal(version.version,'2.0.3');
  assert.equal(version.production_release,false);
  assert.match(version.build_fingerprint,/M2\.9\.(?:57-SCOPED-READ-RECEIPTS|58-UNIFIED-PREMIUM-WORKSPACE|59-KV-SHALLOW-RISK-INVENTORY|60-VAULT-CUTOVER-GUARD|61-LEGACY-CREDENTIAL-READINESS|62-ROLE-SCOPED-ROSTER-WAVE1|63-SCOPED-ROSTER-PATCH-WAVE2|64-SCOPED-TL-TRANSFER-WAVE3|66-CONSOLIDATED-SECURITY-RC2)-STAGING/);
});
console.log(`M2957: ${count} scoped-read checks passed. Client reads use the Worker adapter; published /kv rule still requires separately approved cutover.`);
