import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';

const source=fs.readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
const c=vm.createContext({URL,Request,Response,Headers,console,crypto:webcrypto,TextEncoder,TextDecoder,btoa,atob,createRemoteJWKSet:()=>({})});
vm.runInContext(source.replace(/^import .*;\n/gm,'').replace('export default {','const workerDefault = {').replace('export class ChatRealtimeHub','class ChatRealtimeHub')+`\nglobalThis.test={qcMetricPodIdentityServer,qcMetricTargetServer,fbEncodeKeyServer};`,c);
const t=c.test;
const today='2026-10-07';
const directory={entries:[{id:'tt-custom-pod:cwh:demon-slayer',name:'Demon Slayer',team:'CWH',active:true}]};

// M2.9.15 writes the same target through every live POD representation used by grading.
const record={pod:'tt-custom-pod:cwh:demon-slayer',podLabel:'Demon Slayer',aliases:['tt-custom-pod:cwh:demon-slayer','Demon Slayer','legacy-demon-agent-pod'],job:'coverage',secondsPerTask:60,effectiveDate:today};
const targets={};
for(const alias of record.aliases)targets[t.fbEncodeKeyServer(alias)]={coverage:{[today]:record}};

for(const podValue of record.aliases){
  const resolved=t.qcMetricTargetServer(targets,podValue,'coverage',today,directory);
  assert.equal(resolved?.secondsPerTask,60,`target must resolve for live Agent POD value: ${podValue}`);
}
assert.match(source,/const livePodValues=agents\.filter/,'save path gathers actual live Agent POD values');
assert.match(source,/targetUpdates\[.*fbEncodeKeyServer\(alias\)/s,'save path writes target aliases for live grading identities');
assert.match(source,/unresolvedPodValues:failures\.slice\(0,20\)/,'save verification fails closed when any live POD identity cannot resolve');
console.log('PASS M2.9.15 live Agent target aliases: target save is mirrored to live POD representations and verified through the grading resolver.');
