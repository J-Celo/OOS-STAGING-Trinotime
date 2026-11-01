import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {getOosCoverageBetaQasForActor,OOS_QA_INDEPENDENT_POD} from '../src/oos-coverage-beta-qas.js';
const worker=readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
const client=readFileSync(new URL('../public/assets/js/j-5a9b0d9aeabc.js',import.meta.url),'utf8');
const scoped=readFileSync(new URL('../src/scoped-roster-m2962.js',import.meta.url),'utf8');
function section(start,end){const a=worker.indexOf(start),b=worker.indexOf(end,a);assert.ok(a>=0&&b>a,`${start} missing`);return worker.slice(a,b);}
const roster={employees:{verified:true,entries:[
  {name:'Jhan Roi Celo',pod:OOS_QA_INDEPENDENT_POD,employeeId:'tt_emp_jhan_roi_celo_p2_001',active:true},
  {name:'March Sheen Jacildo',pod:OOS_QA_INDEPENDENT_POD,employeeId:'tt_emp_internal_aabbccddeeff00112233445566778899',active:true},
  {name:'Test Cabahug',pod:OOS_QA_INDEPENDENT_POD,employeeId:'tt_emp_internal_ff00112233445566778899aabbccddee',active:true}
]}};
const initial={
  'POD 0':{effective:'',rows:[['A','','','','','','']]},
  [OOS_QA_INDEPENDENT_POD]:{effective:'',rows:[['','','','','','','']],qaSelfDayOffHistoryByEmployeeId:{'tt_emp_jhan_roi_celo_p2_001':[{effectiveFrom:'2026-10-01',days:[0,6],name:'Jhan Roi Celo'}]}}
};
let db={payload:JSON.stringify(initial),version:'schedule-version-1'},writes=0,mirrors=0;
let actor={role:'agent',pod:OOS_QA_INDEPENDENT_POD,name:'March Sheen Jacildo',uid:'employee-march'};
const failures=[];
const fail=(status,code,message)=>{const e=new Error(message||code);e.status=status;e.code=code;throw e;};
const ctx={
  console,JSON,Date,crypto:globalThis.crypto||{randomUUID:()=> 'generated'},
  OOS_QA_INDEPENDENT_POD,getOosCoverageBetaQasForActor,
  manilaDateKeyServer:()=> '10/20/2026',
  requireWorkforceAttendanceActor:async()=>actor,
  rosterResolvedStateServer:async()=>roster,
  cleanText:(v,len)=>String(v??'').trim().slice(0,len),
  normalizePersonName:v=>String(v??'').trim().replace(/\s+/g,' '),
  scheduleDeepEqualServer:(a,b)=>JSON.stringify(a)===JSON.stringify(b),
  parseJsonString:(x,def)=>{try{return JSON.parse(x);}catch{return def;}},
  parseBody:async req=>req.mockBody||{},
  readScheduleBlobStateServer:async()=>({payload:db.payload,version:db.version}),
  secureScheduleBlobPathServer:()=> 'workforceSchedule/v1/blobs/dayoff_schedule',
  firebaseAdminGetWithEtag:async()=>({value:db,etag:'ETAG-'+db.version}),
  firebaseAdminSetIfMatch:async(_env,_path,next,etag)=>{
    assert.equal(etag,'ETAG-'+db.version);writes++;db=next;return {preconditionFailed:false};
  },
  firebaseAdminGet:async()=>db,
  scheduleBlobPostCommitServer:async()=>{mirrors++;return {legacyMirrored:true,metadataConfirmed:true};},
  safeIso:()=> '2026-10-20T00:00:00Z',
  fbEncodeKeyServer:x=>x, delegatedTlScopeServer:async()=>({active:true}),
  fail
};
vm.createContext(ctx);
vm.runInContext(section('function parseAttendanceDatePartsServer','function manilaDateKeyServer')+
'\n'+section('function leaveIsoPartsServer','function leaveIsoToMdyServer')+
'\n'+section('function validScheduleClockServer','function validateScheduleShiftSettingsBlobServer')+
'\n'+section('function qaDayOffEffectiveDaysServer','async function handleWorkforceScheduleApi')+
'\n'+section('async function scheduleActorCanManagePodServer','async function scheduleAttendanceStartedServer')+
'\n'+section('function filterDayOffScheduleForActorServer','async function collectResolvedScheduleServer')+
'\nthis.testApi=handleQaSelfDayOffServer;this.testAuthorize=scheduleActorCanManagePodServer;this.testFilter=filterDayOffScheduleForActorServer;this.testManilaDate=qaManilaIsoDateServer;this.testNextManilaDate=qaNextManilaDateServer;',ctx);
const api=ctx.testApi;
assert.equal(ctx.testManilaDate(),'2026-10-20','A real M/D/YYYY attendance date must become ISO YYYY-MM-DD');
assert.equal(ctx.testNextManilaDate(),'2026-10-21','Tomorrow must be computed from parsed date components');
ctx.manilaDateKeyServer=()=> '12/31/2026';
assert.equal(ctx.testNextManilaDate(),'2027-01-01','Year boundary must not fail or shift time zones');
ctx.manilaDateKeyServer=()=> '10/20/2026';
const get=await api({method:'GET'},{});
assert.equal(get.name,'March Sheen Jacildo');assert.equal(get.version,'schedule-version-1');assert.equal(get.effectiveFrom,'2026-10-21');assert.equal(writes,0);
const data={days:[1,4],baseVersion:get.version,confirm:'SAVE_MY_QA_DAY_OFF',employeeId:'tt_emp_jhan_roi_celo_p2_001'};
const receipt=await api({method:'POST',mockBody:data},{});
assert.equal(receipt.saved,true);assert.equal(receipt.name,'March Sheen Jacildo');assert.equal(receipt.rosterUntouched,true);
assert.equal(writes,1);assert.equal(mirrors,1);
const after=JSON.parse(db.payload);
assert.deepEqual(after['POD 0'],initial['POD 0']);
assert.deepEqual(after[OOS_QA_INDEPENDENT_POD].qaSelfDayOffHistoryByEmployeeId['tt_emp_jhan_roi_celo_p2_001'],initial[OOS_QA_INDEPENDENT_POD].qaSelfDayOffHistoryByEmployeeId['tt_emp_jhan_roi_celo_p2_001']);
assert.equal(after[OOS_QA_INDEPENDENT_POD].qaSelfDayOffHistoryByEmployeeId['tt_emp_internal_aabbccddeeff00112233445566778899'][0].name,'March Sheen Jacildo');
assert.deepEqual(after[OOS_QA_INDEPENDENT_POD].qaSelfDayOffHistoryByEmployeeId['tt_emp_internal_aabbccddeeff00112233445566778899'][0].days,[1,4]);
async function reject(fn,code){await assert.rejects(fn,e=>e.code===code);}
await reject(()=>api({method:'POST',mockBody:data},{}),'QA_SELF_DAYOFF_VERSION_CHANGED');
actor={role:'team_leader',name:'TL Example',pod:'POD 0'};
await reject(()=>api({method:'GET'},{}),'QA_SELF_SCHEDULE_ONLY');
await reject(()=>ctx.testAuthorize({},actor,OOS_QA_INDEPENDENT_POD,'2026-10-20'),'OOS_QA_ADMIN_ONLY');
actor={role:'agent',name:'Unlisted QA',pod:OOS_QA_INDEPENDENT_POD};
await reject(()=>api({method:'GET'},{}),'QA_SELF_IDENTITY_NOT_VERIFIED');
actor={role:'agent',name:'March Sheen Jacildo',pod:OOS_QA_INDEPENDENT_POD,rosterMember:{employeeId:'tt_emp_internal_aabbccddeeff00112233445566778899'}};
const visible=ctx.testFilter(actor,db.payload);
assert.equal(Object.keys(visible).length,1);
assert.deepEqual(Object.keys(visible[OOS_QA_INDEPENDENT_POD].qaSelfDayOffHistoryByEmployeeId),['tt_emp_internal_aabbccddeeff00112233445566778899']);
assert.equal(writes,1,'unauthorized/conflicting actions must not write');
assert.match(worker,/targetPod===OOS_QA_INDEPENDENT_POD\) return \{active:false/,'TL delegation must never cover QA');
assert.match(scoped,/normalized\(p.id\)!=='OOS Coverage Beta QAs'/,'TL transfer choices must exclude QA');
assert.match(client,/Coverage Beta QA · OOS Coverage Beta QAs/);
assert.match(client,/My QA Days Off/);
assert.match(client,/qa-self-dayoff/);
assert.match(worker,/QA_SELF_DAYOFF_HISTORY_PROTECTED/);
console.log('PASS independent QA self-dayoff: name/ID-bound, forward-effective, concurrent-guarded, no TL access, scoped read, unchanged unrelated schedules and roster.');
