// STAGING UX16: offline read-only Admin/Tracker submission-evidence reconciliation.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const asset=p=>readFileSync(new URL('../public/'+p,import.meta.url),'utf8');
const js=asset('assets/js/j-pilot-reliability-ux12.js');
const html=asset('index.html');
const css=asset('assets/css/c-pilot-reliability-ux12.css');
const start=js.indexOf('  function deliveryReport(rows,selectedPod){');
const end=js.indexOf('  function renderDelivery(){',start);
assert(start>0&&end>start,'Pure read-only reconciliation helper exists');
const sandbox={};vm.runInNewContext(js.slice(start,end)+'\nthis.report=deliveryReport;',sandbox);
const rows=[
 {job:'coverage',pod:'POD 0',submitted:3,lastSyncAtMs:100},
 {job:'coverage',pod:'POD 1',submitted:7,lastSyncAtMs:900},
 {job:'confirmation',pod:'POD 0',submitted:5,lastSyncAtMs:200},
 {job:'confirmation',pod:'POD 1',submitted:4,lastSyncAtMs:700},
 {job:'coverage',pod:'POD 0',submitted:-18,lastSyncAtMs:0},
 {job:'coverage',pod:'POD 0',submitted:'invalid',lastSyncAtMs:0},
 {job:'other',pod:'POD 0',submitted:999,lastSyncAtMs:800}
];
const own=sandbox.report(rows,'POD 0');
assert.equal(own.coverage.reported,3,'Only server-reported valid Coverage submissions in selected POD');
assert.equal(own.confirmation.reported,5,'Separate Confirmation counts');
assert.equal(own.coverage.latest,100);
const all=sandbox.report(rows,'');
assert.equal(all.coverage.reported,10,'All authorized server rows preserved when no POD selected');
assert.equal(all.confirmation.reported,9);
assert.equal(sandbox.report(rows,'OTHER POD').coverage.reported,0,'No cross-POD data bleed');
assert.match(js,/if\(!isAdmin\(\)\|\|!build\(\)\)return/,'Admin-only render');
assert.match(js,/data\.viewer\?\.role!==['"]admin['"]/,'Server Admin role verified');
assert.match(js,/data\.authority!==['"]workforce-metrics-v1['"]/,'Metrics response authority verified');
assert.match(js,/authFingerprint!==fingerprint\(\)/,'Account-change cleanup preserved');
assert.match(js,/deliveryRows=\[\];deliveryVerified=false/,'Role switch and failed requests erase data');
assert.match(js,/deliveryVerified=false;renderDelivery\(\);setStatus/,'Pending refresh cannot masquerade as fresh');
assert.match(js,/podOptions\.some\(item=>item\.pod===pod\)/,'Selection must match verified Admin POD list');
assert.match(js,/Number\.isFinite\(value\)&&value>=0/,'Malformed counts do not inflate totals');
assert.match(js,/Server-reported task totals only; never inferred from a Submit click/,'No click counted as server verified');
assert.match(js,/No device queues, credentials, or task payloads are uploaded/,'Device-local privacy boundary');
assert.match(js,/role="status" aria-live="polite"/,'Accessible refresh feedback');
assert(!/\blocalStorage\b|\bsessionStorage\b|\bchrome\.storage\b/.test(js),'Admin must not read client extension state');
assert(!/method:\s*['"]POST|method:\s*['"]PUT|method:\s*['"]DELETE/.test(js),'Read-only requests');
assert.equal((js.match(/fetch\(/g)||[]).length,1,'No additional API access beyond the existing request helper');
assert(html.includes('j-pilot-reliability-ux12.js?v=3.0.4-ux17p2')&&html.includes('c-pilot-reliability-ux12.css?v=3.0.4-ux17p2'),'Versioned resources updated');
assert(css.includes('@media(max-width:580px)')&&css.includes('overflow-x:auto'),'Safe responsive narrow-screen table');
const packageJson=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
assert(packageJson.scripts.check.includes('qa:production:ux17p2'),'UX16 regression part of complete application checks');
console.log('PASS UX16: trusted Admin scope, workflow/POD filtering, zero or malformed counts, verified refresh, local device evidence boundary, role cleanup, read-only responsive UI');
