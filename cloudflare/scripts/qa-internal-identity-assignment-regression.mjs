import assert from 'node:assert/strict';
import { resolveOosCoverageBetaQas, buildOosQaActivation, planOosQaInternalIds, OOS_QA_INTERNAL_ID_CONFIRM } from '../src/oos-coverage-beta-qas.js';

const fixture=()=>{
  const entries=[
    {name:'Jhan Roi Celo',pod:'POD 2',employeeId:'tt_emp_jhan_roi_celo_p2_001',hourlyRate:119},
    {name:'March Sheen Jacildo',pod:'POD 0',hourlyRate:119},
    {name:'Cabahug',pod:'POD 1',hourlyRate:119}
  ];
  for(let i=3;i<281;i++)entries.push({name:`Fixture Worker ${i}`,pod:`POD ${i%13}`,hourlyRate:119});
  return {employees:{verified:true,version:'verified-recovery',entries}};
};
const old=fixture();
assert.equal(buildOosQaActivation(old),null,'QA must remain inactive without stable IDs');
assert.equal(resolveOosCoverageBetaQas(old).members.every(x=>x.status==='verified'),true);
const preflight=planOosQaInternalIds(old);
assert.equal(preflight.ready,true);
assert.equal(preflight.pending.length,2);
assert.equal(preflight.entries[1].employeeId,undefined,'preview must not mint identities');
const oldJson=JSON.stringify(old);
const ids=['tt_emp_internal_'+('a'.repeat(32)),'tt_emp_internal_'+('b'.repeat(32))];
const plan=planOosQaInternalIds(old,()=>ids.shift());
assert.equal(plan.ready,true);
assert.equal(plan.entries.length,281);
assert.equal(plan.entries[0].employeeId,'tt_emp_jhan_roi_celo_p2_001');
assert.equal(plan.entries[1].employeeId,'tt_emp_internal_'+('a'.repeat(32)));
assert.equal(plan.entries[2].employeeId,'tt_emp_internal_'+('b'.repeat(32)));
assert.equal(plan.entries[1].pod,'POD 0');
assert.equal(plan.entries[2].name,'Cabahug');
assert.equal(JSON.stringify(old),oldJson,'planning cannot modify original roster');
for(let i=0;i<281;i++){
  const a={...old.employees.entries[i]},b={...plan.entries[i]};
  delete a.employeeId;delete b.employeeId;
  assert.deepEqual(b,a,'all preexisting attributes must be preserved');
}
const final={employees:{...old.employees,entries:plan.entries}};
assert.equal(planOosQaInternalIds(final).pending.length,0,'repeat must be no-op');
assert.equal(buildOosQaActivation(final).members.length,3,'activation becomes possible only after IDs persist');
const duplicate=fixture();duplicate.employees.entries[5].employeeId='DUP';duplicate.employees.entries[6].employeeId='dup';
assert.equal(planOosQaInternalIds(duplicate).ready,false,'existing duplicate IDs must halt');
const conflict=fixture();conflict.employees.entries[4].name='Cabahug';conflict.employees.entries[4].pod='POD 1';
assert.equal(planOosQaInternalIds(conflict).ready,false,'duplicate POD1 surname must halt');
const unverified=fixture();unverified.employees.verified=false;
assert.equal(planOosQaInternalIds(unverified).ready,false);
const incomplete=fixture();incomplete.employees.entries.pop();
assert.equal(planOosQaInternalIds(incomplete).ready,false,'partial roster must halt');
assert.equal(OOS_QA_INTERNAL_ID_CONFIRM,'ISSUE_TRINOTIME_QA_IDS');
console.log('QA internal identity assignment: 11 guarded scenarios passed. No network requests or live writes.');
