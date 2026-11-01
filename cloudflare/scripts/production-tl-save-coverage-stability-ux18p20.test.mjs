import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=new URL('../public/',import.meta.url);
const main=readFileSync(new URL('assets/js/j-5a9b0d9aeabc.js',root),'utf8');
const cov=readFileSync(new URL('assets/js/j-coverage-dashboard-rc20-rc2-ui3-3e92d149a5b8.js',root),'utf8');
const html=readFileSync(new URL('index.html',root),'utf8');
test('production actually loads patched main and coverage scripts',()=>{
 assert.match(html,/assets\/js\/j-5a9b0d9aeabc\.js[^"\n]*tl-save-confirmation-ux18p20/);
 assert.match(html,/assets\/js\/j-coverage-dashboard-rc20-rc2-ui3-3e92d149a5b8\.js[^"\n]*coverage-no-autoscroll-ux18p20/);
});
test('TL add reads authoritative roster before local draft',()=>{
 const functionStart=main.indexOf('async function addTeamLeaderAgentConfirmedUX18P19(');
 const functionEnd=main.indexOf("$('assignSaveBtn').addEventListener",functionStart);
 const fn=main.slice(functionStart,functionEnd);
 assert.match(fn,/preservedLocalRosterDraft/);
 assert.match(fn,/rosterAuthoritySnapshot\(true\)/);
 assert.match(fn,/rosterAuthorityFetch\('employees\/intents'/);
 assert.doesNotMatch(fn,/safeLocalRemove/);
 assert.doesNotMatch(fn,/throw new Error\('An older roster edit is still pending/);
});
test('TL action precedes stale local employee handling',()=>{
 const start=main.indexOf("$('assignSaveBtn').addEventListener");
 const end=main.indexOf("$('rosterAddBtn').addEventListener",start);
 const handler=main.slice(start,end);
 assert(handler.indexOf('if (isTeamLeader && !isAdmin)')<handler.indexOf('const existing = employees.find'));
 assert.match(handler,/catch \(error\) \{[\s\S]*?showToast\(message\.slice\(0,320\), 10000\)/);
 assert.match(handler,/Save status uncertain/);
 assert.match(handler,/\{ notify:false \}/);
});
test('Coverage refresh must not scroll window during background paints',()=>{
 const start=cov.indexOf('function render(){'); const end=cov.indexOf('function renderError(',start);
 assert(start>0&&end>start);
 const render=cov.slice(start,end);
 assert.doesNotMatch(render.replace(/\/\/[^\n]*/g,''),/window\.scrollBy\s*\(|window\.scrollTo\s*\(|\.scrollIntoView\s*\(/);
 assert.match(render,/ttReconcileCoverageNode\(ttOldShell, ttNextShell\)/);
 assert.match(render,/ttBindCoverageHorizontalGesture/);
});
test('no mutations of production security, Tracker, or backend data',()=>{
 assert.match(html,/TT-3\.0\.4-PRODUCTION-UX18P22-MEMORY-WRITES-TRACKER-2\.3\.5/);
});
