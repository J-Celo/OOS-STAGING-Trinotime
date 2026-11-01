import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const core = read('public/assets/js/j-b52f8ff97ca5.js');
const index = read('public/index.html');

const start = core.indexOf('function renderTeamLeaderAttendance()');
const end = core.indexOf('function openTeamLeaderAttendance()', start);
assert.ok(start >= 0 && end > start, 'TL Attendance render function located');
const tlRender = core.slice(start, end);
assert.ok(core.includes('function tlAttendanceAvatarMarkup(name)'), 'TL Attendance owns a dedicated avatar helper');
assert.ok(core.includes("profilePhotoMarkup(safeName, 'tl-attendance-avatar-image')") || core.includes("const base = profilePhotoMarkup(safeName, 'avatar');"), 'TL avatar helper uses the shared profile-photo authority');
assert.ok(tlRender.includes('tlAttendanceAvatarMarkup(selectedName)'), 'Current shift hero uses the TL-scoped avatar helper');
assert.ok(tlRender.includes('tlAttendanceAvatarMarkup(row.name)'), 'TL Attendance history uses the TL-scoped avatar helper');
assert.ok(!tlRender.includes('cachedAvatarMarkup('), 'TL Attendance no longer references the attendance-local cachedAvatarMarkup helper');
assert.ok(index.includes('tl-attendance-m2930=1'), 'TL Attendance JS/CSS cache bust advanced beyond M2.9.29');

console.log('PASS M2.9.29 TL attendance avatar hotfix: no out-of-scope cachedAvatarMarkup reference; profile photos render through TL-scoped helper.');
