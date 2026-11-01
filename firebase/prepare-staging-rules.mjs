#!/usr/bin/env node
// Offline, no-network generator. Changes *only* serverTimeAudit on an exported
// current staging rules file. Never publishes rules or accesses credentials.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const [inputName, outputName] = process.argv.slice(2);
if (!inputName || !outputName) {
  console.error('Usage: node prepare-staging-rules.mjs <current-staging-rules.json> <new-staging-rules.json>');
  process.exit(2);
}
const input = path.resolve(inputName);
const output = path.resolve(outputName);
if (input === output) throw Error('Refusing to overwrite your current rules backup.');
if (!fs.existsSync(input)) throw Error(`Rules source not found: ${input}`);
if (fs.existsSync(output)) throw Error(`Refusing to overwrite existing file: ${output}`);
const before = JSON.parse(fs.readFileSync(input, 'utf8'));
assert(before && typeof before === 'object' && before.rules && typeof before.rules === 'object', 'Invalid Realtime Database rules export');
const rules = before.rules;
assert.equal(rules['.read'], false, 'FAIL CLOSED: database root must deny reads');
assert.equal(rules['.write'], false, 'FAIL CLOSED: database root must deny writes');
// Required staging-only markers are intentional: protect against applying this
// staging patch blindly to the older production rules snapshot.
assert(rules.secureCredentials && rules.workforceAuthorization && rules.workforceAttendance,
  'FAIL CLOSED: required current staging tree markers absent (may be wrong snapshot).');
assert(rules.serverTimeAudit && typeof rules.serverTimeAudit === 'object', 'Missing serverTimeAudit rules');
assert(rules.auditEvents && typeof rules.auditEvents === 'object', 'Missing auditEvents rules');
assert.equal(rules.auditEvents['.write'], false, 'FAIL CLOSED: auditEvents root must already deny client writes');
assert.equal(rules.auditEvents['$eventId']?.['.write'], false, 'FAIL CLOSED: auditEvents descendants must deny client writes');
assert.equal(rules.securePremiumEntitlements?.tt_emp_bebless_velasco_p0_001?.['.write'], false,
  'FAIL CLOSED: expected deny-write premium entitlement path differs; review manually.');
const old = JSON.stringify(before.rules.serverTimeAudit);
const after = structuredClone(before);
after.rules.serverTimeAudit = { '.read': false, '.write': false };
for (const k of Object.keys(before.rules)) {
  if (k === 'serverTimeAudit') continue;
  assert.deepEqual(after.rules[k], before.rules[k], `Unrelated rules node changed: ${k}`);
}
assert.deepEqual(Object.keys(after.rules), Object.keys(before.rules), 'Rules top-level keys changed');
fs.writeFileSync(output, JSON.stringify(after, null, 2)+'\n', { flag: 'wx' });
console.log('PASS: Only /serverTimeAudit changed; direct reads and writes denied.');
console.log('PASS: Existing /auditEvents, /kv, /agentPresence, premium and workforce access unchanged.');
console.log(`PREVIOUS serverTimeAudit: ${old}`);
console.log(`OUTPUT (NOT PUBLISHED): ${output}`);
console.log('IMPORTANT: Confirm M2.9.55 Worker is actually deployed and test in Firebase Rules Playground before publishing.');
