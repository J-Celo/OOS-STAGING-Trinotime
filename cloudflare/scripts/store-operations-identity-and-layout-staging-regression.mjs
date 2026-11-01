/* TrinoTime staging Store Operations regression. Synthetic only: no network,
   no Firebase requests, no Tracker writes, no production interaction. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read = path => fs.readFileSync(new URL(path,import.meta.url),'utf8');
const manager=read('../public/assets/js/j-store-plan-manager-phase1.js');
const hub=read('../public/assets/js/j-staging-store-operations-hub-v1.js');
const css=read('../public/assets/css/c-staging-store-operations-hub-v1.css');
const report=read('../public/assets/js/j-store-intelligence-m2934-rc2-ui3-c3e0e3e8c587.js');
const worker=read('../src/worker.js');
const tracker=JSON.parse(read('../../tracker/manifest.json'));
const tag='[data-tt-store-hub-tab="queue"]';
assert(css.includes(`${tag} .tt-sp-coverage-sequence,`),'Coverage sequence editor hidden in Store Queue');
assert(css.includes(`${tag} .tt-sp-all-stores{display:none!important}`),'All Stores dashboard hidden in Store Queue');
assert(css.includes('[data-tt-store-hub-tab="work"] .tt-sp-advanced{display:none!important}'),'Existing Work Control layout remains');
assert(!css.includes('[data-tt-store-hub-tab="work"] .tt-sp-coverage-sequence{display:none'),'Coverage editor remains in Work Control');
assert(manager.includes('state.viewer.name=String(agents.viewer.name).trim()'),'Manager adopts server-verified Admin identity');
assert(manager.includes('state.panel.dataset.ttVerifiedAdminName=state.viewer.name'),'Manager marks canonical verified Admin identity');
assert(manager.includes('delete state.panel.dataset.ttVerifiedAdminName;'),'No stale verified Admin identity during refresh');
assert(manager.indexOf('if(!sameViewer(state.viewer,agents.viewer)')<manager.indexOf('state.panel.dataset.ttVerifiedAdminName=state.viewer.name'),'Never trust Admin name without roster verification');
assert(report.includes('data.viewer?.role!==viewer.role')&&report.includes('String(data.viewer?.name||\'\').toLowerCase()!==String(viewer.name||\'\').toLowerCase()'),'Strict report identity validation remains');
assert(worker.includes('const actor=await requireWorkforceAttendanceActor(request,env);'),'Server still authenticates workforce identity');
assert(manager.includes('currentAccountIdentity()')&&manager.includes('ensureCurrentSession(state)'),'Client account switch guard preserved');
assert(manager.includes("coverage-sequence/all-stores?pod="),'All Stores remains POD scoped');
assert.equal(tracker.version,'2.3.10','Tracker package/version unchanged');
// Execute actual viewer-matching function from the hub in an isolated VM.
const start=hub.indexOf('  function matchesVerifiedViewer(');
const stop=hub.indexOf('\n  function renameExistingNav()',start);
assert(start>=0&&stop>start);
const test=vm.createContext({
 normalize:s=>String(s??'').trim().toLowerCase().replace(/[\s-]+/g,'_'),
 $:(_root,selector)=>selector==='.tt-sp-panel'?testPanel:null,
});
let testPanel={dataset:{ttVerifiedAdminName:'Administrator'}};
vm.runInContext(hub.slice(start,stop)+'\nglobalThis.matchesVerifiedViewer=matchesVerifiedViewer;',test);
const admin={role:'admin',name:'Admin'};
const tl={role:'team_leader',name:'Demon Slayer TL'};
assert.equal(test.matchesVerifiedViewer(null,admin,{role:'admin',name:'Administrator'}),true,'Admin alias resolves only through verified roster');
assert.equal(test.matchesVerifiedViewer(null,admin,{role:'admin',name:'Different Administrator'}),false,'Wrong canonical account name fails');
assert.equal(test.matchesVerifiedViewer(null,admin,{role:'team_leader',name:'Administrator'}),false,'Role mismatch fails');
assert.equal(test.matchesVerifiedViewer(null,tl,{role:'team_leader',name:'Demon Slayer TL'}),true,'TL strict check preserved');
assert.equal(test.matchesVerifiedViewer(null,tl,{role:'team_leader',name:'Solo Leveling TL'}),false,'Cross-TL identity denied');
testPanel={dataset:{}};
assert.equal(test.matchesVerifiedViewer(null,admin,{role:'admin',name:'Administrator'}),false,'Unverified Admin never accepts report');
assert(hub.includes("lastReportPanel!==$(root,'.tt-sp-panel')"),'Old report cannot survive panel rebuild / account switch');
assert(hub.includes("lastReportPanel=$(root,'.tt-sp-panel')"),'Report snapshot is bound to current panel');
console.log('PASS Store Operations staging: one Coverage editor in Work Control, server-verified Admin report identity, TL scope, cross-account cache guard, unchanged Tracker, and unchanged report authorization. No live requests or record writes.');
