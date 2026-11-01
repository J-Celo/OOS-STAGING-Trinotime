import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const index = read('public/index.html');
const css = read('public/assets/css/c-b9c19cd1cd0b.css');
const core = read('public/assets/js/j-b52f8ff97ca5.js');

assert.ok(index.includes('id="tlAttendanceLiveAvatar"'), 'TL attendance hero avatar container present');
assert.ok(index.includes('id="tlAttendanceLiveIdentity"'), 'TL attendance hero identity line present');
assert.ok(index.includes('id="tlAttendanceLiveKpis"'), 'TL attendance hero KPI strip present');
assert.ok(index.includes('<strong>Timekeeping policy</strong><span>Standard shift · 6 paid hours · 30-minute break · Team Leaders can record only their own live punches.</span>'), 'TL attendance policy summary compact copy present');
assert.ok(css.includes('/* M2.9.28 — TL Attendance executive refresh */'), 'TL attendance executive refresh CSS appended');
assert.ok(css.includes('.tl-attendance-live-avatar') && css.includes('.tl-attendance-row-identity') && css.includes('.tl-attendance-punch-card[data-shift-state='), 'hero avatar, row identity, and shift-state styling present');
assert.ok(core.includes("const liveAvatar = $('tlAttendanceLiveAvatar');"), 'TL attendance render caches avatar container');
assert.ok(core.includes("const selectedStatusSnapshot = selectedName ? getTeamLeaderHomeStatusSnapshot(selectedName, getTrueNowMs()) : null;"), 'TL attendance render uses authoritative status snapshot');
assert.ok(core.includes("liveAvatar.innerHTML = selectedName ? tlAttendanceAvatarMarkup(selectedName)"), 'TL attendance hero renders TL avatar');
assert.ok(core.includes("<div class=\"tl-attendance-row-identity\"><span class=\"tl-attendance-row-avatar\">${tlAttendanceAvatarMarkup(row.name)}</span>"), 'TL attendance history table renders TL avatar beside name');
assert.ok(core.includes("punchCard.dataset.shiftState = punchState;"), 'TL attendance hero exposes shift-state for premium action styling');

console.log('PASS M2.9.28 TL attendance executive refresh: premium hero, compact policy, TL profile photos, and refined punch card/table surfaces present.');
