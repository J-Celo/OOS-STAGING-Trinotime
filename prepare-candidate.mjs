import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

// Local-only staging rules proposal generator. Never publishes or accesses Firebase.
const dir = path.dirname(fileURLToPath(import.meta.url));
const input = process.argv[2] ? path.resolve(process.argv[2]) : path.join(dir, 'CURRENT-STAGING-RULES.json');
const output = path.join(dir, 'candidate.rules.json');
const protectedBranches = ['kv', 'serverTimeAudit', 'workforceIdentity'];

function stop(message) { console.error('STOP:', message); process.exit(1); }
if (!fs.existsSync(input)) stop(`Missing fresh, manually verified staging Rules JSON: ${input}`);
if (input === output) stop('Candidate cannot be used as its own baseline.');
if (/propos|m295|owner-supplied|historical|backup|reference|candidate|fixture/i.test(path.basename(input))) {
  stop('Input file name looks like a proposal, fixture, backup, or historical snapshot. Use CURRENT-STAGING-RULES.json.');
}
const raw = fs.readFileSync(input, 'utf8').replace(/^\uFEFF/, '');
let before;
try { before = JSON.parse(raw); } catch (err) { stop(`Input is not valid JSON: ${err.message}`); }
if (!before || typeof before !== 'object' || !before.rules || typeof before.rules !== 'object') {
  stop('Input is not a Firebase RTDB rules document with a rules object.');
}
const isLiteralDeny = (value) => value === false || value === 'false';
if (!isLiteralDeny(before.rules['.read']) || !isLiteralDeny(before.rules['.write'])) {
  stop('Root .read and .write must both be unconditionally false. An ancestor allow cannot be revoked by a child rule.');
}
for (const name of ['kv', 'secureCredentials', 'workforceRoster', 'workforceAttendance']) {
  if (!before.rules[name] || typeof before.rules[name] !== 'object') stop(`Expected baseline branch missing or malformed: /${name}`);
}
const after = structuredClone(before);
for (const name of protectedBranches) after.rules[name] = { '.read': false, '.write': false };
const expected = structuredClone(before);
for (const name of protectedBranches) expected.rules[name] = { '.read': false, '.write': false };
assert.deepEqual(after, expected, 'Generator attempted an unapproved change.');

const fingerprint = createHash('sha256').update(raw).digest('hex');
const warnings = [];
if (fingerprint === '91a37cf3cac711dd0ab2b280b85f087942d2c52872ed8cdb487815599f05a08d') {
  warnings.push('Baseline bytes match the older RC2 rules reference. Verify these really came from the current published staging Rules tab; hash alone does not prove provenance.');
}
for (const name of protectedBranches) {
  const oldRule = before.rules[name];
  if (oldRule && typeof oldRule === 'object' && (oldRule['.indexOn'] !== undefined || Object.values(oldRule).some(v => v && typeof v === 'object' && v['.indexOn'] !== undefined))) {
    warnings.push(`/${name} has an existing .indexOn declaration. The proposed whole-node lockdown will remove that index; review query/Worker compatibility before any cutover.`);
  }
}
function findBroadRead(value, prefix = '', hits = []) {
  if (!value || typeof value !== 'object') return hits;
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${prefix}/${key}`;
    if (key === '.read' && typeof child === 'string' && /auth\s*!=\s*null/.test(child)) hits.push(prefix || '/');
    else if (typeof child === 'object') findBroadRead(child, childPath, hits);
  }
  return hits;
}
for (const name of ['agentPresence', 'securePremiumEntitlements']) {
  const matches = findBroadRead(before.rules[name], `/${name}`);
  if (matches.length) warnings.push(`Existing authenticated-client read expressions remain at ${matches.join(', ')}. Anonymous Firebase Auth may qualify; review separately. No rules in this branch were changed.`);
}
if (!warnings.length) warnings.push('No specific legacy warning pattern detected. This is NOT a comprehensive Firebase authorization audit.');
const review = [
  'TrinoTime M2.9.66 RC2.3 — Firebase STAGING RTDB rules proposal',
  'Candidate scope: LOCAL EMULATOR TEST ONLY. No live access, deployment, or publication.',
  `Input SHA256: ${fingerprint}`,
  'SOURCE PROVENANCE REQUIRES HUMAN CONFIRMATION: trinotime-staging-qa > Realtime Database > Rules (currently published).',
  'Approved scope: replace only the /kv, /serverTimeAudit, /workforceIdentity rule objects with {.read:false, .write:false}.',
  'All other rules branches, metadata, and root keys are preserved exactly.',
  'IMPORTANT: replacing a branch also removes existing nested rules and index declarations under it.',
  'Worker service access and staging integration are NOT validated by Firebase client emulator tests.',
  'Do not publish without fresh baseline verification, reviewed diff, meaningful emulator PASS, integration acceptance, rollback plan, and owner approval.',
  ...warnings.map(x => `REMAINING ISSUE: ${x}`),
];
const diff = [
  'RULES DIFF REVIEW — LOCAL / NOT A FIREBASE PUBLISH COMMAND',
  `Baseline SHA256: ${fingerprint}`,
  ...protectedBranches.flatMap(name => [
    '', `Path: /rules/${name}`,
    'BEFORE:', JSON.stringify(before.rules[name] ?? null, null, 2),
    'AFTER:', JSON.stringify(after.rules[name], null, 2),
    JSON.stringify(before.rules[name] ?? null) === JSON.stringify(after.rules[name]) ? 'NO CHANGE at this path.' : 'CHANGED: whole branch replaced.',
  ]),
].join('\n') + '\n';
fs.writeFileSync(output, JSON.stringify(after, null, 2) + '\n', { mode: 0o600 });
fs.writeFileSync(path.join(dir, 'RULES-REVIEW.txt'), review.join('\n') + '\n', { mode: 0o600 });
fs.writeFileSync(path.join(dir, 'RULES-DIFF.txt'), diff, { mode: 0o600 });
console.log(review.join('\n'));
console.log('PASS: local candidate generated. Run node static-guard.mjs, then npm run test:emulator.');
