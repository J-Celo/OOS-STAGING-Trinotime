import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import path from 'node:path';
const read = p => fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const view=read('public/assets/js/j-1e287a103932.js');
const core=read('public/assets/js/j-5a9b0d9aeabc.js');
const html=read('public/index.html');
const begin=view.indexOf('        function reconciliationPodLabel(item) {');
const end=view.indexOf('\n        function renderAttendanceReconciliation(summary)',begin);
assert(begin>0 && end>begin,'Production-rendered Attendance reconciliation label helper must exist');
const code=view.slice(begin,end);
const names={
  'tt-custom-pod:cwh:mu5mnvf3-gv9fke':'Demon Slayer',
  'tt-custom-pod:cwh:mutxia54-ylwx7q':'Solo Leveling'
};
const ctx={window:{TrinoTimePodDisplayLabel:raw=>names[raw]||(/^tt-custom-pod:/i.test(raw)?'Assigned POD':raw)}};
vm.runInNewContext(code+'\nthis.label=reconciliationPodLabel',ctx);
const label=ctx.label;
assert.equal(label({pod:'tt-custom-pod:cwh:mu5mnvf3-gv9fke'}),'Demon Slayer');
assert.equal(label({pod:'tt-custom-pod:cwh:mutxia54-ylwx7q'}),'Solo Leveling');
assert.equal(label({pod:'tt-custom-pod:cwh:missing'}),'Assigned POD','Never show guessed custom ID');
assert.equal(label({pod:'tt-custom-pod:cwh:unknown',podLabel:'Active POD 9'}),'Active POD 9');
assert.equal(label({pod:'tt-custom-pod:cwh:unknown',podLabel:'tt-custom-pod:cwh:wrong'}),'Assigned POD');
assert.equal(label({pod:'POD 16'}),'POD 16');
assert.equal(label({pod:'',podLabel:''}),'Assigned POD');
ctx.window.TrinoTimePodDisplayLabel=()=>{throw Error('directory unavailable')};
assert.equal(label({pod:'tt-custom-pod:cwh:missing'}),'Assigned POD','Safe when directory unavailable');
assert(view.includes('reason.textContent=`${reconciliationPodLabel(item)} · ${String(item.status||\'Needs review\')}`;'));
assert(!view.includes("reason.textContent=`${String(item.pod||'Unknown POD')}"));
const start=core.indexOf('function getTodaySummaryForDashboard()');
const endCore=core.indexOf('function getAgentQuickStatusForDashboard(',start);
const source=core.slice(start,endCore);
assert(source.includes('podLabel:podDisplayName(emp.pod)'));
assert(source.includes('podLabel:podDisplayName(candidatePod)'));
assert(source.includes('if (reconciliation) summary.reconciliation = reconciliation'),'Reconciliation remains Admin-only');
assert(html.includes('prod-ux17p2=20261026'),'Core and table script browser caches must be busted');
assert(read('public/version.json').includes('production_ux17p2_port'));
// Audit exact website-distributed extension bytes against standalone staging Tracker.
const packaged=new URL('../public/downloads/TrinoTime-QC-Tracker-v2.3.10.zip',import.meta.url);
const standalone=new URL('../../tracker/manifest.json',import.meta.url);
assert(fs.existsSync(standalone));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
assert.equal(JSON.parse(fs.readFileSync(standalone,'utf8')).version,'2.3.10');
assert.equal(JSON.parse(read('public/downloads/qc-tracker-current.json')).sha256,sha(fs.readFileSync(packaged)),'Embedded Tracker must match published production checksum');
console.log('PASS UX17.1: named and missing custom PODs, safe role-scoped display, cache version, source summary names, byte-identical Tracker v2.2.60');
