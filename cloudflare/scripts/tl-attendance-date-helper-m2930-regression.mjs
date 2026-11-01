import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const core = read('public/assets/js/j-b52f8ff97ca5.js');
const index = read('public/index.html');

const helperStart = core.indexOf('function tlAttendanceAvatarMarkup(name)');
const renderStart = core.indexOf('function renderTeamLeaderAttendance()');
const renderEnd = core.indexOf('function openTeamLeaderAttendance()', renderStart);
assert.ok(helperStart >= 0 && renderStart > helperStart && renderEnd > renderStart, 'TL Attendance helper/render block located');
const tlBlock = core.slice(helperStart, renderEnd);

assert.ok(core.includes('function tlAttendanceDateLabel(dateStr)'), 'TL Attendance owns a local date label helper');
assert.ok(core.includes("return d.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric', timeZone:'UTC' });"), 'TL date helper formats dates without external module dependency');
assert.ok(tlBlock.includes('tlAttendanceDateLabel(live.date)'), 'TL identity uses local date helper');
assert.ok(tlBlock.includes('tlAttendanceDateLabel(live.date || todayKeyPart())'), 'TL KPI date uses local date helper');
assert.ok(!tlBlock.includes('prettyDate('), 'TL Attendance does not reference out-of-scope prettyDate');
assert.ok(!tlBlock.includes('cachedAvatarMarkup('), 'TL Attendance does not reference out-of-scope cachedAvatarMarkup');
assert.ok(index.includes('tl-attendance-m2930=1'), 'TL Attendance JS/CSS cache bust advanced to M2.9.30');

console.log('PASS M2.9.30 TL attendance runtime helper hardening: local avatar/date helpers only; no out-of-scope helper references.');
