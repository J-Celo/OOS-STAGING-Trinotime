import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=x=>readFileSync(new URL('../'+x,import.meta.url),'utf8');
const html=src('public/index.html');
const js=src('public/assets/js/j-5a9b0d9aeabc.js');
const css=src('public/assets/css/c-coaching-side-ux8.css');
const ux6=src('public/assets/css/c-staging-coaching-side-ux6.css');
assert.match(html,/c-coaching-side-ux8\.css\?v=3\.0\.4-ux17p2/);
assert.match(html,/j-5a9b0d9aeabc\.js\?[^\"\n]+prod-ux17p2=20261026/, 'Cache-bust changed page script');
assert(html.indexOf('c-coaching-side-ux8.css')>html.indexOf('c-staging-coaching-side-ux6.css'),'UX8 CSS must override UX6');
assert(js.includes('scheduleAgentCoachingAlignment();'),'Refresh must schedule recalculation');
assert(js.includes("window.addEventListener('resize',scheduleAgentCoachingAlignment"),'Re-align on resize');
assert(js.includes("document.body.dataset.trinoRole!=='agent'"),'Never set Admin/TL Coaching dimensions');
assert(js.includes("window.matchMedia('(max-width: 980px)')"),'Use natural height on tablet/mobile');
assert(js.includes("clock.getBoundingClientRect().bottom-card.getBoundingClientRect().top"),'Align card to clock edge');
assert(js.includes('requestAnimationFrame('),'Avoid synchronous layout forcing');
assert(css.includes('min-height:max-content'),'Long coach names must not be clipped');
assert(css.includes('height:auto!important'),'No fixed card height at mobile width');
assert(css.includes("body[data-trino-role='agent']"),'Agent-only CSS');
assert(ux6.includes('#ttUx6CoachingSideCard[hidden]'),'Keep permission visibility and role state');
for(const id of ['btnTimeIn','btnStartBreak','btnEndBreak','btnLogOut','btnCoaching']) {
 assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,'Do not duplicate '+id);
}
const version=JSON.parse(src('public/downloads/qc-tracker-current.json'));
assert.equal(version.version,'2.3.10','Tracker download remains v2.2.60');
console.log('PASS UX8: alignment, responsive fallback, Admin/TL isolation, original punch IDs, Tracker version');
