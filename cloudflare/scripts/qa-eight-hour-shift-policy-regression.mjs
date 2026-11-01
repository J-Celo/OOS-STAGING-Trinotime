import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { QA_SHIFT_POLICY,qaShiftStamp,qaShiftMetrics } from '../src/qa-shift-policy.js';
const app=fs.readFileSync(new URL('../public/assets/js/j-5a9b0d9aeabc.js',import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const shift=(ti='2026-10-20T02:00:00.000Z',br='2026-10-20T05:00:00.000Z',eb='2026-10-20T06:00:00.000Z',out='2026-10-20T11:00:00.000Z')=>({name:'QA EXAMPLE',pod:QA_SHIFT_POLICY.team,date:'10/20/2026',timeIn:ti,...(br?{startBreak:br}:{}),...(eb?{endBreak:eb}:{}),...(out?{logOut:out}:{}),...qaShiftStamp()});
const cases=[
  ['standard 10-19 one hour break',shift(),{grossMinutes:540,breakMinutes:60,netWorkedMinutes:480,regularCreditMinutes:480,remainingMinutes:0}],
  ['30-minute break counts as 30 not 60',shift(undefined,'2026-10-20T05:00:00Z','2026-10-20T05:30:00Z'),{grossMinutes:540,breakMinutes:30,netWorkedMinutes:510,regularCreditMinutes:480,extraWorkedMinutes:30}],
  ['90-minute break reduces work time',shift(undefined,'2026-10-20T05:00:00Z','2026-10-20T06:30:00Z'),{grossMinutes:540,breakMinutes:90,netWorkedMinutes:450,regularCreditMinutes:450,remainingMinutes:30,breakOverageMinutes:30}],
  ['short shift under target',shift(undefined,'2026-10-20T05:00:00Z','2026-10-20T06:00:00Z','2026-10-20T10:00:00Z'),{grossMinutes:480,breakMinutes:60,netWorkedMinutes:420,remainingMinutes:60}],
  ['no break is recorded rather than fabricated',shift(undefined,null,null),{grossMinutes:540,breakMinutes:0,netWorkedMinutes:540,regularCreditMinutes:480,breakNotRecorded:true}],
  ['incomplete break when clocked out',shift(undefined,'2026-10-20T05:00:00Z',null),{grossMinutes:540,breakMinutes:360,netWorkedMinutes:180,incompleteBreak:true}],
  ['break still running and clock-out pending',shift(undefined,'2026-10-20T05:00:00Z',null,null),{grossMinutes:240,breakMinutes:60,netWorkedMinutes:180,breakInProgress:true,finished:false}],
];
for(const [label,record,expected] of cases){const m=qaShiftMetrics(record,{nowMs:Date.parse('2026-10-20T06:00:00Z')});assert(m,label);for(const [key,value] of Object.entries(expected))assert.equal(m[key],value,`${label}: ${key}`);}
assert.equal(qaShiftMetrics({...shift(),timekeepingPolicy:'agent-standard-v1'}),null,'legacy must never change');
assert.equal(qaShiftMetrics({...shift(),voided:true}),null,'voided excluded');
assert.equal(QA_SHIFT_POLICY.start,'10:00');assert.equal(QA_SHIFT_POLICY.end,'19:00');
// Test the actual browser's credited-hour functions, not a second invented formula.
function pickFunction(name){const pos=app.indexOf(`function ${name}(`);assert(pos>=0,`missing ${name}`);let open=app.indexOf('{',pos),depth=0;
 for(let i=open;i<app.length;i++){if(app[i]==='{')depth++;if(app[i]==='}'&&!--depth)return app.slice(pos,i+1);}
 throw Error(`unclosed ${name}`);
}
const names=['isQaShiftAttendanceRecord','qaShiftSummaryClient','clampRegularCredit','getAttendancePolicyBreakdown','computeProjectedRegularHours','computeBaseRegularHours','computeAutomaticRegularHours','computeRegularHours','getBreakPolicyMinutes','breakDurationMs','getExcessBreakMinutes','getExcessBreakHours','getEffectiveBreakEndMs'];
const sandbox={QA_SHIFT_POLICY_ID:QA_SHIFT_POLICY.id,QA_SHIFT_TARGET_MINUTES:480,QA_SHIFT_BREAK_MINUTES:60,QA_SHIFT_START:'10:00',QA_SHIFT_END:'19:00',REGULAR_SHIFT_CREDIT_HOURS:6,BREAK_ALLOWANCE_MINUTES:30,ALL_PODS_LABEL:'All Pods',MS_PER_HOUR:3600000, getTrueNowMs:()=>Date.parse('2026-10-20T06:00:00Z'),isVoidedAttendanceRecord:rec=>Boolean(rec?.voided),podOf:name=>QA_SHIFT_POLICY.team, getShiftWindowForRecord:()=>({start:'10:00',end:'19:00'}), getShiftBoundaryRangeMs:()=>({startMs:Date.parse('2026-10-20T02:00:00Z'),endMs:Date.parse('2026-10-20T11:00:00Z')}),getManualDeductionHours:()=>0,getManualCreditOverrideHours:()=>null};
vm.createContext(sandbox);
for(const n of names){vm.runInContext(pickFunction(n),sandbox)}
for(const [label,record,expected] of cases){if(!record.logOut)continue;
 const expectedCredit=(expected.regularCreditMinutes??Math.min(480,expected.netWorkedMinutes))/60;
 assert.equal(sandbox.computeRegularHours(record,'10/20/2026',QA_SHIFT_POLICY.team),expectedCredit,`${label} frontend final credit`);
 assert.equal(sandbox.computeProjectedRegularHours(record,'10/20/2026',QA_SHIFT_POLICY.team),expectedCredit,`${label} frontend projected credit`);
}
const old={timeIn:'2026-10-20T02:00:00Z',startBreak:'2026-10-20T05:00:00Z',endBreak:'2026-10-20T05:45:00Z',logOut:'2026-10-20T11:00:00Z',pod:'POD 1'};
assert.equal(sandbox.getBreakPolicyMinutes(old),30,'legacy 30-minute allowance intact');
assert.equal(sandbox.computeRegularHours(old,'10/20/2026','POD 1'),5.75,'legacy 6h credit subtracts only excess break');
assert.equal(sandbox.getBreakPolicyMinutes(shift()),60,'QA break allowance is 60');
assert(worker.includes('const mealAllowance=isQaShiftRecord(record)?QA_SHIFT_POLICY.breakAllowanceMinutes:30;'),'chat meal uses correct QA break');
assert(worker.includes('QA_SHIFT_POLICY_IMMUTABLE'),'server rejects tampering');
assert(worker.includes('QA_SHIFT_POLICY_REQUIRED'),'server requires QA stamp');
assert(worker.includes('QA_SHIFT_POLICY_RETROACTIVE'),'server protects historical records');
assert(worker.includes("isQaShiftRecord(authRecord)?{qaShift:qaShiftMetrics(authRecord)}"),'server record read returns authoritative QA metrics');
assert(app.includes("select.innerHTML='<option value=\"qa-standard\">"),'QA cannot choose early Labeler shift');
assert(app.includes("next.timekeepingPolicy=QA_SHIFT_POLICY_ID"),'QA clock-in stamps shift policy');
assert(html.includes('production-rollup=20261020'),'QA production rollup cache busting included');
console.log('PASS: Production QA 8h net/60m flexible break, historical 6h/30m, server enforcement, QA selection, 7 scenarios.');
