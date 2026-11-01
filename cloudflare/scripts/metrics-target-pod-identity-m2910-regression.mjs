import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';

const source=fs.readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
const c=vm.createContext({URL,Request,Response,Headers,console,crypto:webcrypto,TextEncoder,TextDecoder,btoa,atob,createRemoteJWKSet:()=>({})});
vm.runInContext(source.replace(/^import .*;\n/gm,'').replace('export default {','const workerDefault = {').replace('export class ChatRealtimeHub','class ChatRealtimeHub')+`
globalThis.test={qcMetricPodIdentityServer,qcMetricTargetServer,qcMetricsSnapshotServer,fbEncodeKeyServer};`,c);
const t=c.test;
const directory={entries:[{id:'demon',name:'Demon Slayer',team:'CWH',active:true},{id:'pod2',name:'POD 2',team:'CWH',active:true}]};
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());

assert.equal(t.qcMetricPodIdentityServer('Demon Slayer',directory).canonical,'demon','friendly POD label resolves to canonical POD id');
assert.equal(t.qcMetricPodIdentityServer('demon',directory).canonical,'demon','canonical POD id remains canonical');

const canonicalTargets={[t.fbEncodeKeyServer('demon')]:{coverage:{[today]:{secondsPerTask:60}}}};
assert.equal(t.qcMetricTargetServer(canonicalTargets,'Demon Slayer','coverage',today,directory).secondsPerTask,60,'Agent friendly POD representation finds canonical target');

const legacyTargets={[t.fbEncodeKeyServer('Demon Slayer')]:{coverage:{[today]:{secondsPerTask:55}}}};
assert.equal(t.qcMetricTargetServer(legacyTargets,'demon','coverage',today,directory).secondsPerTask,55,'Canonical Agent POD finds an older friendly-name target for backward compatibility');

const agent={name:'Zenitsu Agatsuma',pod:'Demon Slayer'};
const shift={sessionId:'s1',generation:0,status:'active',reportDate:'2026-10-06',startedAt:'2026-10-06T23:00:00+08:00',startedAtMs:1};
const coverage={shiftSessionId:'s1',shiftGeneration:0,submitted:26,efficiencyTaskCount:26,efficiencyActiveMs:2049320};
const snap=t.qcMetricsSnapshotServer(shift,agent,coverage,null,canonicalTargets,'Demon Slayer',directory);
assert.equal(snap.rows[0].target.secondsPerTask,60,'Active cross-midnight shift uses the currently effective target immediately');
assert.ok(Number(snap.rows[0].efficiencyPercent)>0,'Active shift becomes gradeable when its effective target is present');

const frozen=t.qcMetricsSnapshotServer({...shift,status:'completed'},agent,coverage,null,canonicalTargets,'Demon Slayer',directory,today);
assert.equal(frozen.rows[0].target.secondsPerTask,60,'Time Out finalization can capture the current effective target via explicit finalization date');

console.log('PASS M2.9.10 Metrics POD target identity: canonical/friendly POD aliases resolve one target, legacy target keys remain readable, and active cross-midnight shifts use the effective target immediately.');
