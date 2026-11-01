/** UX18P39: offline verified QA-labeler separation and grade explanations.
 * Uses synthetic names/IDs; no Firebase, production calls or data mutations. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {oosQaManifestCurrent,resolveOosCoverageBetaQas,buildOosQaActivation,OOS_QA_INDEPENDENT_POD,OOS_COVERAGE_BETA_QA_DB_PATH} from '../src/oos-coverage-beta-qas.js';
const worker=fs.readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../public/assets/js/j-agent-metrics-rc22.js',import.meta.url),'utf8');
const cleanText=(v,max)=>String(v||'').trim().slice(0,max||500);
const c=vm.createContext({console,URL,URLSearchParams,TextEncoder,TextDecoder,Buffer,fetch:async()=>{},crypto:globalThis.crypto,atob,btoa,createRemoteJWKSet:()=>({}),oosQaManifestCurrent,resolveOosCoverageBetaQas,OOS_QA_INDEPENDENT_POD,OOS_COVERAGE_BETA_QA_DB_PATH});
vm.runInContext(worker.replace(/^import .*;\n/gm,'').replace('export default {','const workerDefault = {').replace('export class ChatRealtimeHub','class ChatRealtimeHub')+`
globalThis.t={filter:qcMetricsActiveLabelerRosterServer,audit:qcMetricsQaRosterAuditServer,summary:qcMetricSummaryServer,aggregate:qcMetricAggregateServer};`,c,{timeout:10000});
const member=(name,pod,id)=>({name,pod,employeeId:id,role:'agent',identityKind:'legacy-agent',active:true});
const state={employees:{verified:true,entries:[
 member('Jhan Roi Celo',OOS_QA_INDEPENDENT_POD,'id-jhan'),
 member('March sheen Jacildo',OOS_QA_INDEPENDENT_POD,'id-march'),
 member('Test Cabahug',OOS_QA_INDEPENDENT_POD,'id-cabahug'),
 member('Another Labeler','POD 1','id-labeler')
]}};
const agents=[
 member('Test Cabahug','POD 1','id-cabahug'), // stale canonical POD but same stable verified QA ID
 member('Jhan Roi Celo',OOS_QA_INDEPENDENT_POD,'id-jhan'),
 member('Another Labeler','POD 1','id-labeler'),
 member('Another Cabahug','POD 1','different-id')
];
assert.deepEqual([...c.t.filter(agents,state)].map(x=>x.name),['Another Labeler','Another Cabahug'], 'filter independent QA by unique employee ID, not surname');
assert.equal(c.t.filter(agents,{employees:{...state.employees,verified:false}}).length,3,'unverified roster must not allow a surname-based QA ID suppression');
assert.equal(agents.length,4,'never modify source roster projection');
const manifest=buildOosQaActivation(state,{byUid:'synthetic',at:'2026-10-30T00:00:00Z'});
assert(manifest&&oosQaManifestCurrent(manifest,state),'three distinct verified IDs activate QA manifest');
// Audit the same validated IDs while one promotion remains in former POD.
const transitional=structuredClone(state);transitional.employees.entries[2].pod='POD 1';
assert(oosQaManifestCurrent(manifest,transitional),'manifest alone cannot confer QA roster membership');
// Existing snapshot may have an activated manifest while protected promotion is incomplete.
vm.runInContext('firebaseAdminGet=async()=>globalThis.mockManifest;',c);
c.mockManifest=manifest;
const audit=await c.t.audit({},transitional,'admin');
assert.equal(audit.status,'promotion-review-required');
assert.equal(audit.formerPodAssignments.length,1);
assert.equal(audit.formerPodAssignments[0].name,'Test Cabahug');
assert.equal(audit.formerPodAssignments[0].currentlyAssignedTo,'POD 1');
assert.equal(await c.t.audit({},transitional,'team_leader'),null,'do not expose Admin QA audit to TL');
const complete=await c.t.audit({},state,'admin');
assert.equal(complete.status,'verified');assert.equal(complete.formerPodAssignments.length,0);
const invalid={...manifest,members:[...manifest.members.slice(0,2)]};
c.mockManifest=invalid;
assert.equal(await c.t.audit({},transitional,'admin'),null,'invalid QA manifest must not imply promotion');
const measured={name:'Agent',pod:'POD 1',job:'coverage',submitted:5,measuredTasks:5,measuredActiveMs:350000,efficiencyPercent:null,target:null};
const ungraded=c.t.summary([measured]);
assert.equal(ungraded.grade,null);
assert.match(ungraded.gradeReason,/No effective target for coverage/);
const noTasks=c.t.summary([{...measured,submitted:0,measuredTasks:0,measuredActiveMs:0}]);
assert.match(noTasks.gradeReason,/No verified measured tasks/);
const graded=c.t.summary([{...measured,efficiencyPercent:100,target:{secondsPerTask:70}}]);
assert.equal(graded.grade,'A');assert.equal(graded.gradeReason,'');
assert.match(ui,/Independent QA roster review needed/);
assert.match(ui,/summary\?\.gradeReason/,'POD comparison preserves authority reasons in accessible tooltips');
assert.match(worker,/Locked shift: no applicable target when finalized/);
console.log('PASS UX18P39: verified QA identity isolation, correct former POD diagnostics, Admin-only manifest audit, no membership writes, explicit ungraded reasons, locked history remains immutable');
