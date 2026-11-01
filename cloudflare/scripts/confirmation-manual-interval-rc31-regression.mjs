import fs from 'node:fs';import assert from 'node:assert/strict';
let c=fs.readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
const start=c.indexOf('function confirmationSafeCountServer');const end=c.indexOf('async function confirmationRequireBridgeActorServer');assert(start>=0&&end>start);
let chunk=c.slice(start,end).replaceAll('cleanText(', 'globalThis.cleanText(');
globalThis.cleanText=(v,max=1000)=>String(v??'').slice(0,max);globalThis.WORKFORCE_CONFIRMATION_IDLE_THRESHOLD_MS=300000;globalThis.storeIntelSafeNameServer=v=>String(v||'').trim().slice(0,120);
// eslint-disable-next-line no-eval
eval(chunk+'\n;globalThis.__san=confirmationSanitizeSummaryServer;');
const s=globalThis.__san({interval1:10,interval2:4,interval3:0,interval1ManualAdjustment:2,interval2ManualAdjustment:-1,interval3ManualAdjustment:3,submitted:999,submittedManualAdjustment:999});
assert.equal(s.interval1,10);assert.equal(s.interval1DisplayTotal,12);assert.equal(s.interval2DisplayTotal,3);assert.equal(s.interval3DisplayTotal,3);assert.equal(s.submitted,14);assert.equal(s.submittedManualAdjustment,4);assert.equal(s.submittedDisplayTotal,18);
const floor=globalThis.__san({interval1:2,interval1ManualAdjustment:-99});assert.equal(floor.interval1ManualAdjustment,-2);assert.equal(floor.interval1DisplayTotal,0);assert.equal(floor.submittedDisplayTotal,0);
for(const marker of ['interval1Confirmed:confirmationSafeCountServer(row.interval1)','interval1:Math.max(0,confirmationSafeCountServer(row.interval1)+confirmationSafeSignedCountServer(row.interval1ManualAdjustment','submittedDisplayTotal:Math.max(0,confirmationSafeCountServer(row.submittedDisplayTotal)'])assert(c.includes(marker),`dashboard contract missing ${marker}`);
console.log('PASS RC31 Confirmation manual interval correction: server preserves automatic counts, clamps manual corrections, exposes corrected I1/I2/I3/EOD, and retains audit breakdown.');
