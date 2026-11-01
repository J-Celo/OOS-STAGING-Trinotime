import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {webcrypto, createHash} from 'node:crypto';

const worker=fs.readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
const coverage=fs.readFileSync(new URL('../../tracker/coverage-background.js',import.meta.url),'utf8');
const confirmation=fs.readFileSync(new URL('../../tracker/confirmation-background.js',import.meta.url),'utf8');
const relay=fs.readFileSync(new URL('../../tracker/trinotime-session-relay.js',import.meta.url),'utf8');
const manifest=JSON.parse(fs.readFileSync(new URL('../../tracker/manifest.json',import.meta.url),'utf8'));
const bundled=fs.readFileSync(new URL('../public/downloads/TrinoTime-QC-Tracker-v2.3.10.zip',import.meta.url));

const PRODUCTION='https://oos.trinotime.com';
const trackerMeta=JSON.parse(fs.readFileSync(new URL('../public/downloads/qc-tracker.json',import.meta.url),'utf8'));
assert.equal(manifest.version,'2.3.10');
assert(manifest.host_permissions.includes(`${PRODUCTION}/*`),'Tracker must be production-bound');
assert(!JSON.stringify(manifest).includes('oostrinotime-staging-qa'),'Tracker manifest must not target staging');
for(const source of [coverage,confirmation]){
  assert(source.includes(`const TRINOTIME = '${PRODUCTION}'`),'Tracker background must use production endpoint');
  assert(!source.includes('oostrinotime-staging-qa'),'Tracker background must not contain staging endpoint');
  assert(/const minGap\s*=\s*Math\.max\(0,\s*500\s*-\s*\(Date\.now\(\)\s*-\s*lastSyncAttemptAt\)\)/.test(source),'Sync must preserve 500ms minimum request spacing');
  assert(source.includes('shiftSessionId'),'Sync must bind to authoritative shift session');
  assert(source.includes('shiftGeneration'),'Sync must bind to reset generation');
  assert(source.includes('body?.stale===true'),'Client must preserve dirty data when server rejects stale sequence');
  assert(source.includes('syncFollowUpRequested'),'Changes during in-flight sync must schedule a follow-up');
}
assert(relay.includes("send('cat-pair-trinotime')")&&relay.includes("send('cft-pair-trinotime')"),'TrinoTime session relay must connect both workflows');
assert(relay.includes('trinotime:session-ending')&&relay.includes('trinotime:workforce-agent-ready'),'Relay must follow login/logout lifecycle');
assert.equal(createHash('sha256').update(bundled).digest('hex'),trackerMeta.sha256,'Bundled Tracker checksum must match current delivery metadata');

assert(worker.includes('workforceRetireSupersededDeviceBridgesServer(env, WORKFORCE_COVERAGE_BRIDGE_PATH, actor, deviceId)'),'Coverage pairing must retire superseded same-device bridge tokens');
assert(worker.includes('workforceRetireSupersededDeviceBridgesServer(env, WORKFORCE_CONFIRMATION_BRIDGE_PATH, actor, deviceId)'),'Confirmation pairing must retire superseded same-device bridge tokens');
assert((worker.match(/cleanText\(item\.pod \|\| '',120\) === cleanText\(actor\.pod \|\| '',120\)/g)||[]).length>=2,'Bridge status must be POD-bound for Coverage and Confirmation');
assert(worker.includes("revokeReason`] = 'superseded-device-token'"),'Retired duplicate bridge records must be auditable');

const c=vm.createContext({URL,Request,Response,Headers,console,crypto:webcrypto,TextEncoder,TextDecoder,btoa,atob,structuredClone,createRemoteJWKSet:()=>({})});
vm.runInContext(worker.replace(/^import .*;\n/gm,'').replace('export default {','const workerDefault = {').replace('export class ChatRealtimeHub','class ChatRealtimeHub')+`
const __bridgeStore={
 oldSame:{active:true,role:'agent',name:'Tanjiro Kamado',pod:'pod-1',deviceId:'browser-a'},
 inactiveSame:{active:false,role:'agent',name:'Tanjiro Kamado',pod:'pod-1',deviceId:'browser-a'},
 otherDevice:{active:true,role:'agent',name:'Tanjiro Kamado',pod:'pod-1',deviceId:'browser-b'},
 otherAgent:{active:true,role:'agent',name:'Zenitsu Agatsuma',pod:'pod-1',deviceId:'browser-a'}
};
let __patch={};
firebaseAdminGet=async()=>structuredClone(__bridgeStore);
firebaseAdminPatch=async(env,root,updates)=>{__patch=structuredClone(updates);};
globalThis.test={cleanup:workforceRetireSupersededDeviceBridgesServer,getPatch:()=>__patch};`,c);

const retired=await c.test.cleanup({},'workforceCoverage/v1/bridges',{role:'agent',name:'Tanjiro Kamado',pod:'pod-1'},'browser-a');
assert.equal(retired,1,'Exactly one active same-Agent/same-device bridge should be retired');
const patch=c.test.getPatch();
assert.equal(patch['workforceCoverage/v1/bridges/oldSame/active'],false);
assert.equal(patch['workforceCoverage/v1/bridges/oldSame/revokeReason'],'superseded-device-token');
assert.equal(patch['workforceCoverage/v1/bridges/otherDevice/active'],undefined,'Another browser must not be revoked');
assert.equal(patch['workforceCoverage/v1/bridges/otherAgent/active'],undefined,'Another Agent must not be revoked');

console.log('PASS M2.9.2 Tracker↔TrinoTime sync cleanup: production-only endpoints, current v2.3.10 Tracker checksum, session/generation + stale-sequence safeguards, lifecycle relay, POD-bound bridge status, and same-device bridge token rotation.');
