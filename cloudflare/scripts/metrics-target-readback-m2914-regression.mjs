import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';

const source=fs.readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
const metrics=fs.readFileSync(new URL('../public/assets/js/j-agent-metrics-rc22.js',import.meta.url),'utf8');
const c=vm.createContext({URL,Request,Response,Headers,console,crypto:webcrypto,TextEncoder,TextDecoder,btoa,atob,createRemoteJWKSet:()=>({})});
vm.runInContext(source.replace(/^import .*;\n/gm,'').replace('export default {','const workerDefault = {').replace('export class ChatRealtimeHub','class ChatRealtimeHub')+`
globalThis.test={qcMetricPodIdentityServer,qcMetricTargetServer,qcMetricsSnapshotServer,fbEncodeKeyServer};`,c);
const t=c.test;
const directory={entries:[{id:'tt-custom-pod:cwh:demon-slayer',name:'Demon Slayer',team:'CWH',active:true}]};
const today='2026-10-07';

// Reproduces the browser-reported failure: target exists and carries the correct
// POD metadata, but the Firebase bucket was created under an older/stale POD key.
const staleBucket=t.fbEncodeKeyServer('legacy-demon-slayer-key');
const targets={
  [staleBucket]:{
    coverage:{
      [today]:{pod:'tt-custom-pod:cwh:demon-slayer',podLabel:'Demon Slayer',job:'coverage',secondsPerTask:60,effectiveDate:today,updatedAt:'2026-10-07T12:00:00.000Z'}
    }
  }
};
const target=t.qcMetricTargetServer(targets,'tt-custom-pod:cwh:demon-slayer','coverage',today,directory);
assert.equal(target?.secondsPerTask,60,'grading resolver recovers a target by record POD metadata even when the bucket key is stale');

const agent={name:'Zenitsu Agatsuma',pod:'tt-custom-pod:cwh:demon-slayer'};
const shift={sessionId:'zenitsu-s1',generation:0,status:'active',reportDate:'10/7/2026',startedAt:'2026-10-07T10:00:00+08:00',startedAtMs:1};
const coverage={shiftSessionId:'zenitsu-s1',shiftGeneration:0,submitted:26,efficiencyTaskCount:26,efficiencyActiveMs:2049320};
const snap=t.qcMetricsSnapshotServer(shift,agent,coverage,null,targets,'Demon Slayer',directory,today);
assert.equal(snap.rows[0].target?.secondsPerTask,60,'active Agent snapshot receives the recovered Coverage target');
assert.ok(Number(snap.rows[0].efficiencyPercent)>0,'recovered target produces efficiency');
assert.notEqual(snap.rows[0].grade,null,'recovered target produces an A-F grade');

assert.match(source,/METRICS_TARGET_READBACK_FAILED/,'save endpoint verifies grading readback before reporting success');
assert.match(source,/const verifiedTargets=await firebaseAdminGet\(env,QC_METRICS_TARGETS_PATH\)/,'save endpoint reloads authoritative targets after write');
assert.match(metrics,/__ttMetricsTargetReadbackBuild='M2\.9\.15'/,'M2.9.15 client target readback marker');
assert.match(metrics,/Target saved and verified for/,'Admin UI only reports success after resolver verification');

console.log('PASS M2.9.15 Metrics target readback: stale target bucket recovery, record POD identity matching, active grading, and post-save readback verification.');
