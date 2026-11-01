import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const index = read('public/index.html');
const css = read('public/assets/css/c-b9c19cd1cd0b.css');
const core = read('public/assets/js/j-b52f8ff97ca5.js');

const start = core.indexOf('function tlAttendanceAvatarMarkup');
const end = core.indexOf('function openTeamLeaderAttendance', start);
assert.ok(start >= 0 && end > start, 'TL attendance helper/render block found');
const block = core.slice(start, end);

assert.ok(index.includes('id="tlAttendancePreviousWarning"'), 'previous-shift warning element present');
assert.ok(css.includes('/* M2.9.32 — TL Attendance proportion + hierarchy cleanup */'), 'M2.9.32 polish CSS present');
assert.ok(css.includes('#tlStreakReviewControls[hidden]') && css.includes('display:none !important'), 'Admin-only review controls fail closed when hidden');
assert.ok(css.includes('border-radius:50%') && css.includes('.tl-attendance-avatar-image img'), 'TL avatar uses a true circular crop');
assert.ok(block.includes("profilePhotoMarkup(safeName, 'tl-attendance-avatar-image')"), 'TL avatar uses dedicated geometry class');
assert.ok(!block.includes('decorateAvatar?.'), 'TL Attendance avoids nested reward avatar wrappers');
assert.ok(block.includes('tlHomeStatusState(live.rec, null, selectedAvailability)'), 'current-shift KPI ignores prior incomplete-shift warning state');
assert.ok(block.includes('Previous shift needs review'), 'previous incomplete shift is shown separately');
assert.ok(block.includes("streakReviewControls.style.display = isAdmin ? '' : 'none'"), 'TL view explicitly hides Admin review controls');
assert.ok(index.includes('tl-attendance-polish-m2932=1'), 'TL Attendance M2.9.32 cache-bust present');

console.log('PASS M2.9.32 TL Attendance polish: circular avatars, current/prior status separation, Admin-control leak guard, and compact hierarchy.');
