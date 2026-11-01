import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const worker=readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
const script=readFileSync(new URL('../public/assets/js/j-5a9b0d9aeabc.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const section=(source,a,b)=>{const start=source.indexOf(a),end=source.indexOf(b,start);assert.ok(start>=0&&end>start,`Missing section ${a}`);return source.slice(start,end);};
assert.match(worker,/function qaManilaIsoDateServer\(/);
assert.match(worker,/const date=qaManilaIsoDateServer\(\),effectiveFrom=qaNextManilaDateServer\(\);/);
assert.match(index,/qa-self-dayoff=20261020c&qa-profile-modal=20261020/);
assert.match(script,/const roleLabel=document\.getElementById\('agentProfileHeaderRole'\)/);
assert.match(script,/Coverage Beta QA · OOS Coverage Beta QAs/);
const qaPod='OOS Coverage Beta QAs';
const elements={dayOffTableWrap:{innerHTML:''},dayOffEffective:{textContent:''},dayOffEditActions:{style:{display:''}}};
const note={textContent:''};
const members=[{name:'Jhan Roi Celo',pod:qaPod,active:true,employeeId:'qa_jhan001'},
{name:'March Sheen Jacildo',pod:qaPod,active:true,employeeId:'qa_march002'},
{name:'Test Cabahug',pod:qaPod,active:true,employeeId:'qa_cabahug003'}];
const current={qaSelfDayOffHistoryByEmployeeId:{qa_jhan001:[{effectiveFrom:'2026-10-21',days:[0,6],name:'Jhan Roi Celo'}]}};
const ctx={
 document:{querySelector:()=>note},
 DAY_OFF_HEADERS:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],
 OOS_QA_TEAM_POD:qaPod,
 dayOffSchedule:{[qaPod]:current},
 employees:members,
 isAdmin:false,isTeamLeader:false,agentSessionAuthenticated:true,agentSessionName:'Jhan Roi Celo',
 $:id=>elements[id]||null,
 escapeHtml:x=>String(x).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])),
 agentDisplayName:x=>x,
};
vm.createContext(ctx);
vm.runInContext(section(script,'function renderDayOffTable(podKey, edit = false) {','function renderTeamLeaderDayOffScheduleSection(')+
  '\nthis.renderQa=renderDayOffTable;',ctx);
ctx.renderQa(qaPod,true);
assert.match(elements.dayOffTableWrap.innerHTML,/Coverage Beta QA Days Off/);
assert.match(elements.dayOffTableWrap.innerHTML,/Jhan Roi Celo/);
assert.doesNotMatch(elements.dayOffTableWrap.innerHTML,/March Sheen Jacildo|Test Cabahug/,'QA must not see colleagues schedule');
assert.doesNotMatch(elements.dayOffTableWrap.innerHTML,/Labeler Days Off|Team Leader Days Off/);
assert.equal(elements.dayOffEditActions.style.display,'none','Old shared editor cannot write QA history');
assert.match(note.textContent,/each QA edits only their own/i);
ctx.isAdmin=true;ctx.renderQa(qaPod,false);
assert.match(elements.dayOffTableWrap.innerHTML,/March Sheen Jacildo|Test Cabahug/,'Admin can oversee QA members');
assert.doesNotMatch(elements.dayOffTableWrap.innerHTML,/Team Leader Days Off|Labeler Days Off/);
ctx.isAdmin=false;ctx.isTeamLeader=true;ctx.renderQa(qaPod,false);
assert.doesNotMatch(elements.dayOffTableWrap.innerHTML,/Jhan Roi Celo|March Sheen Jacildo|Test Cabahug/,'TL cannot read QA schedule member names');
console.log('PASS QA schedule UI: personal schedule scoped to signed-in member, read-only old view, no TL section, Admin overview, refreshed JS URL.');
