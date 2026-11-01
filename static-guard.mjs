import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const before = JSON.parse(fs.readFileSync(path.join(dir, 'CURRENT-STAGING-RULES.json'), 'utf8'));
const candidate = JSON.parse(fs.readFileSync(path.join(dir, 'candidate.rules.json'), 'utf8'));
const isDeny = x => x === false || x === 'false';
assert.ok(isDeny(before.rules['.read']) && isDeny(before.rules['.write']), 'Source root rules are not unconditionally denied.');
const expected = structuredClone(before);
for (const name of ['kv', 'serverTimeAudit', 'workforceIdentity']) {
  expected.rules[name] = { '.read': false, '.write': false };
  assert.deepEqual(candidate.rules[name], expected.rules[name], `Protected branch /${name} must be denied without descendants.`);
}
assert.deepEqual(candidate, expected, 'Unauthorized change outside three protected rule branches (including root metadata).');
console.log('PASS: protected nodes deny client reads and writes; all other rules and metadata unchanged.');
console.log('CAUTION: structural checks do not replace real Firebase Emulator rule evaluation.');
