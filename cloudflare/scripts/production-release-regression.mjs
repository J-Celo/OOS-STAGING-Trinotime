import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
const root=path.resolve(new URL('..',import.meta.url).pathname);const read=p=>fs.readFileSync(path.join(root,p),'utf8');const json=p=>JSON.parse(read(p));
const fp='TT-2.0.3-SHIFT-METRICS-M2.9.5-PRODUCTION-20261007';
const worker=read('src/worker.js'),core=read('public/assets/js/j-b52f8ff97ca5.js'),index=read('public/index.html'),sw=read('public/sw.js');const version=json('public/version.json'),manifest=json('public/manifest.json');
for(const surface of [worker,index,sw])assert(surface.includes(fp),'fingerprint surface mismatch');assert.equal(version.build_fingerprint,fp);assert.equal(manifest.build_fingerprint,fp);assert.equal(version.production_release,true);assert.equal(manifest.production_release,true);
assert(worker.includes("validateProductionDeployment"));assert(worker.includes("qc-tracker-v2.2.25-production"));assert(!worker.includes('Workspace Contact · QA'));
assert(core.includes("origin: 'https://oos.trinotime.com'"));assert(core.includes('await refreshPremiumEntitlementsFromServer(\'manual-app-refresh\')'));assert(core.includes('renderTeamLeaderTemporaryAccess()'));
assert(index.includes('pod-team-scope-m293=1'),'M2.9.3 cache marker missing');assert(index.includes('m294-refresh-access=1'),'M2.9.4 cache marker missing');assert(index.includes('metrics-tl-history-m295=1'),'M2.9.5 cache marker missing');assert(worker.includes("build:'M2.9.5-HISTORICAL'"),'M2.9.5 historical API marker missing');
console.log('PASS production release regression: M2.9.5 fingerprint, production authority, POD scope, refresh/TL access, and historical metrics markers');
