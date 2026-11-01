import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {
  resolveOosCoverageBetaQas,buildOosQaActivation,oosQaActorAuthorized,
  oosQaManifestCurrent,planIndependentOosQaPromotion,OOS_QA_INDEPENDENT_POD,
  OOS_QA_PROMOTE_CONFIRM,OOS_COVERAGE_BETA_QA_DB_PATH
} from '../src/oos-coverage-beta-qas.js';
const records = [
  {name:'Jhan Roi Celo',pod:'POD 2',role:'agent',employeeId:'tt_emp_jhan_roi_celo_p2_001',active:true},
  {name:'March Sheen Jacildo',pod:'POD 0',role:'agent',employeeId:'tt_emp_internal_aabbccddeeff00112233445566778899',active:true},
  {name:'Test Cabahug',pod:'POD 1',role:'agent',employeeId:'tt_emp_internal_ff00112233445566778899aabbccddee',active:true},
  ...Array.from({length:278},(_,i)=>({name:`Other Agent ${i}`,pod:`POD ${i%13}`,role:'agent',employeeId:`employee-${i}`,active:true}))
];
const original=structuredClone(records);
const roster={employees:{verified:true,version:'v-restored',entries:records},podDirectory:{verified:true,revision:20,entries:[...Array.from({length:13},(_,i)=>({id:`POD ${i}`,team:'CWH',active:true})),{id:'TESCO',team:'CWH',active:true},{id:'KROGER',team:'CWH',active:true}]},teamLeaderDirectory:{entries:[]}};
const manifest=buildOosQaActivation(roster,{byUid:'admin',at:'2026-10-20T00:00:00Z'});
assert.ok(manifest);
const plan=planIndependentOosQaPromotion(roster,manifest);
assert.equal(plan.ready,true);
assert.equal(plan.transfers.length,3);
assert.deepEqual(plan.transfers.map(x=>x.from).sort(),['POD 0','POD 1','POD 2']);
assert.equal(plan.entries.length,281);
for(let i=0;i<plan.entries.length;i++){
  assert.equal(plan.entries[i].employeeId,original[i].employeeId);
  assert.equal(plan.entries[i].name,original[i].name);
  if(i<3){assert.equal(plan.entries[i].pod,OOS_QA_INDEPENDENT_POD);assert.equal(plan.entries[i].role,'qa');assert.equal(plan.entries[i].jobTitle,'Quality Assurance');}
  else assert.deepEqual(plan.entries[i],original[i]);
}
const moved={...roster,employees:{...roster.employees,entries:plan.entries}};
assert.equal(oosQaManifestCurrent(manifest,moved),true);
assert.equal(oosQaActorAuthorized(manifest,moved,{name:'Jhan Roi Celo',role:'agent',pod:OOS_QA_INDEPENDENT_POD}),true);
assert.equal(oosQaActorAuthorized(manifest,moved,{name:'Jhan Roi Celo',role:'agent',pod:'POD 2'}),false);
assert.equal(planIndependentOosQaPromotion(moved,manifest).alreadyPromoted,true);
const ambiguous=structuredClone(roster);ambiguous.employees.entries[3]={...ambiguous.employees.entries[3],name:'Other Cabahug',pod:'POD 1'};
assert.equal(planIndependentOosQaPromotion(ambiguous,manifest).ready,false);
const broken=structuredClone(roster);broken.employees.entries[1].employeeId='';
assert.equal(planIndependentOosQaPromotion(broken,manifest).ready,false);
const noManifest=planIndependentOosQaPromotion(roster,null);assert.equal(noManifest.ready,false);

// Validate the actual server route with fake Firebase and no real network/writes.
let admin={role:'admin',uid:'admin-uid',name:'Admin'}, directoryWrites=0, rosterWrites=0, mirrorCalled=0;
let dbRoster=structuredClone(roster), dbManifest=structuredClone(manifest);
const allText=readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
const start=allText.indexOf('async function handleGuardedOosQaTeamApi('),end=allText.indexOf('\nexport default {',start);
assert.ok(start>0 && end>start);
const ctx=vm.createContext({
  URL,console,crypto:globalThis.crypto,JSON,
  OOS_QA_INDEPENDENT_POD,OOS_QA_PROMOTE_CONFIRM,OOS_COVERAGE_BETA_QA_DB_PATH,
  resolveOosCoverageBetaQas,planIndependentOosQaPromotion,oosQaManifestCurrent,oosQaActorAuthorized,
  requireWorkforceAttendanceActor:async()=>admin,requireActiveAdminUser:async()=>({user:{uid:'admin-uid',email:'admin@example.test'}}),
  rosterResolvedStateServer:async()=>dbRoster,
  firebaseAdminGet:async(_e,path)=>path===OOS_COVERAGE_BETA_QA_DB_PATH?dbManifest:null,
  parseBody:async r=>r.mockBody||{},
  readAuthoritativeCredential:async()=>({record:{active:true}}),
  rosterWritePodServer:async(_e,_user,body)=>{directoryWrites++; assert.equal(body.entries.at(-1).id,OOS_QA_INDEPENDENT_POD);dbRoster.podDirectory.entries.push({...body.entries.at(-1)});return {remoteSaved:true};},
  rosterWriteEmployeesServer:async(_e,actor,body)=>{assert.equal(actor.role,'admin');assert.equal(actor.__qaPromotionAuthorized,true);assert.equal(body.entries.length,281);rosterWrites++;dbRoster.employees={...dbRoster.employees,entries:body.entries,version:body.targetVersion};return {remoteSaved:true,legacyMirrored:true,attendanceRosterSynced:true};},
  cleanText:x=>x,safeIso:()=>new Date().toISOString(),
  fail:(status,code,message)=>{const e=new Error(message);e.status=status;e.code=code;throw e;},
  json:(data,status)=>({...data,http:status}),
  // Route only touches these helpers, all remaining names are runtime-resolved.
});
vm.runInContext(allText.slice(start,end)+'\nglobalThis.call=handleGuardedOosQaTeamApi;',ctx);
const route=body=>ctx.call({method:'POST',mockBody:body},{ENABLE_OOS_QA_WORKGROUP:'true'},new URL('https://oos.trinotime.com/api/workforce/qa-team/promote'));
const dry=await route({dryRun:true});assert.equal(dry.ready,true);assert.equal(dry.noWrites,true);assert.equal(dry.credentialsVerified,3);assert.equal(directoryWrites,0);assert.equal(rosterWrites,0);
await assert.rejects(()=>route({confirm:'wrong'}),e=>e.code==='OOS_QA_PROMOTION_CONFIRM_REQUIRED');
admin={role:'agent',name:'Jhan Roi Celo',pod:'POD 2'};
await assert.rejects(()=>route({dryRun:true}),e=>e.code==='OOS_QA_ADMIN_REQUIRED');
admin={role:'admin',uid:'admin-uid',name:'Admin'};
const prod=await route({confirm:OOS_QA_PROMOTE_CONFIRM,expectedVersion:dry.rosterVersion});assert.equal(prod.promoted,true);assert.equal(prod.rosterCount,281);assert.equal(directoryWrites,1);assert.equal(rosterWrites,1);
assert.equal(planIndependentOosQaPromotion(dbRoster,dbManifest).alreadyPromoted,true);
const rerun=await route({confirm:OOS_QA_PROMOTE_CONFIRM,expectedVersion:dbRoster.employees.version});assert.equal(rerun.alreadyPromoted,true);assert.equal(rosterWrites,1);
console.log('PASS — 281 retained, exactly three promoted, immutable IDs/passwords intact, QA team no TL, old POD scopes revoked, dry-run/unauthorized/confirmation/idempotence. No live writes.');
