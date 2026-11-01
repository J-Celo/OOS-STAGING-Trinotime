import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=(f)=>readFileSync(new URL('../'+f,import.meta.url),'utf8');
const html=read('public/index.html');
const coaching=read('public/assets/js/j-5a9b0d9aeabc.js');
const css=read('public/assets/css/c-staging-attendance-compact-ux5.css');
const ux4=read('public/assets/js/j-staging-attendance-hero-ux4.js');
for(const id of ['btnTimeIn','btnStartBreak','btnEndBreak','btnLogOut','btnCoaching','coachingActionRow','attendanceTopActions']){
 assert.equal((html.match(new RegExp(`id="${id}"`,'g'))||[]).length,1,`Control ${id} must have exactly one node`);
}
assert.match(html,/c-staging-attendance-compact-ux5\.css\?v=prod-301-ux5/);
assert.match(html,/j-5a9b0d9aeabc\.js\?[^"\n]+prod-301-ux6=1/);
assert.equal((coaching.match(/if\(row\)row\.hidden=isGuest\|\|isAgent;/g)||[]).length,1,'Agent management tile is replaced by separate read-only status; TL/Admin still have control');
assert(coaching.includes("btn.disabled=true;") && coaching.includes('if(isAgent){'),'Existing role-aware coaching read-only semantics preserved');
assert(coaching.includes("sub.textContent='TL / Admin managed'"),'Read-only status is informative');
assert(coaching.includes("if(!active){"),'Agent inactive coaching must stay disabled');
assert(css.includes('width:21px !important')&&css.includes('height:21px !important'),'Explicit SVG bounds for all roles');
assert(css.includes('#punchCard #attendanceTopActions .punch-grid:has(> #coachingActionRow:not([hidden]))'),'Coaching must participate in Admin/TL grid');
assert(ux4.includes('slot.appendChild(panel)')&&ux4.includes("home.insertAdjacentElement('afterend',panel)"),'Original live controls still move by role');
assert(!ux4.includes('cloneNode('),'Never clone live punch handlers');
const tracker=JSON.parse(read('public/downloads/qc-tracker-current.json'));
const bytes=readFileSync(new URL('../public/downloads/'+tracker.file,import.meta.url));
assert.equal(tracker.version,'2.3.10');
assert.equal(createHash('sha256').update(bytes).digest('hex'),tracker.sha256);
console.log('PASS UX5: Admin/TL compact icons, read-only Agent Coaching tile, no duplicate controls, cached asset refreshed, Tracker SHA identical');
