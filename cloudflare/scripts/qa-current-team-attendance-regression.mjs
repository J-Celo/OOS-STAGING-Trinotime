import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const app=fs.readFileSync(new URL('../public/assets/js/j-5a9b0d9aeabc.js',import.meta.url),'utf8');
const premium=fs.readFileSync(new URL('../public/assets/js/j-d91d2b3b0f5b.js',import.meta.url),'utf8');
const calendar=fs.readFileSync(new URL('../public/assets/js/j-d6c6050115d7.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const QA='OOS Coverage Beta QAs';
function pickFunction(name){const pos=app.indexOf(`function ${name}(`);assert(pos>=0,`missing ${name}`);const open=app.indexOf('{',pos);let depth=0;
 for(let i=open;i<app.length;i++){if(app[i]==='{')depth++;else if(app[i]==='}'&&!--depth)return app.slice(pos,i+1);}
 throw Error(`unclosed ${name}`);
}
const entries=[{name:'Jhan Roi Celo',pod:'POD 2',active:true},{name:'March Sheen Jacildo',pod:'POD 0',active:true},{name:'Cabahug',pod:'POD 1',active:true},{name:'Normal Labeler',pod:'POD 3',active:true}];
const sandbox={employees:entries,agentSessionAuthenticated:true,isAdmin:false,isTeamLeader:false,agentSessionName:'Jhan Roi Celo',agentSessionPod:QA,lockedPod:QA,activePod:QA,ALL_PODS_LABEL:'All Pods',OOS_QA_TEAM_POD:QA,window:{},getShiftWindowForPod:pod=>pod===QA?{id:'qa-standard',start:'10:00',end:'19:00'}:{id:'pod',start:'13:00',end:'16:00'},getShiftWindowForRecord:rec=>({start:rec.shiftStart,end:rec.shiftEnd}),getEffectiveShiftOverrideForEmployee:()=>({shiftStart:'13:00',shiftEnd:'16:00'}),isValidShiftWindow:win=>!!(win?.start&&win?.end),getPendingTodayShiftChoice:()=> 'pod',getAlternateShiftWindow:()=>({start:'06:00',end:'12:00'}),todayKeyPart:()=> '10/20/2026'};
sandbox.podOf=name=>entries.find(e=>e.name===name)?.pod||'';
vm.createContext(sandbox);
for(const name of ['rosterEmployeeByName','currentRosterPodForName','isCurrentIndependentQaAttendanceSession','currentAttendanceTeamPod','getSelectedShiftWindowForToday'])vm.runInContext(pickFunction(name),sandbox);
for(const [name,oldPod] of [['Jhan Roi Celo','POD 2'],['March Sheen Jacildo','POD 0'],['Cabahug','POD 1']]){
 sandbox.agentSessionName=name;
 assert.equal(sandbox.currentRosterPodForName(name),oldPod,'pre-migration cache fixture retained');
 assert.equal(sandbox.currentAttendanceTeamPod(name,{pod:oldPod}),QA,`${name} current UI uses verified QA sign-in`);
 assert.equal(sandbox.getSelectedShiftWindowForToday(name,{pod:oldPod},oldPod).start,'10:00',`${name} QA start`);
 assert.equal(sandbox.getSelectedShiftWindowForToday(name,{pod:oldPod},oldPod).end,'19:00',`${name} QA end`);
 const historical={pod:oldPod,timeIn:'2026-10-19T05:00:00Z',shiftStart:'13:00',shiftEnd:'16:00'};
 assert.equal(sandbox.getSelectedShiftWindowForToday(name,historical,oldPod).start,'13:00',`${name} historical shift remains stamped`);
 assert.equal(historical.pod,oldPod,`${name} old attendance record remains unchanged`);
}
sandbox.agentSessionName='Normal Labeler';sandbox.agentSessionPod='POD 3';sandbox.lockedPod='POD 3';
assert.equal(sandbox.currentAttendanceTeamPod('Normal Labeler',{pod:'POD 3'}),'POD 3','ordinary labeler stays POD 3');
assert.equal(sandbox.getSelectedShiftWindowForToday('Normal Labeler',{},'POD 3').start,'13:00','ordinary labeler schedule unchanged');
sandbox.isAdmin=true;sandbox.agentSessionAuthenticated=false;
entries[0].pod=QA;
assert.equal(sandbox.currentAttendanceTeamPod('Jhan Roi Celo',{pod:'POD 2'}),QA,'Admin sees verified current QA team, not historical stamp');
assert.equal(sandbox.currentAttendanceTeamPod('Normal Labeler',{pod:'POD 3'}),'POD 3','Admin sees normal labeler current POD');
assert(premium.includes('window.TrinoTimeCurrentQaTeamLabel?.()'),'Premium attendance heading respects authenticated QA');
assert(premium.includes('Signed-in QA'),'Premium attendance label respects QA role');
assert(app.includes("const rawDisplayPod = currentAttendanceTeamPod(name, rec)"),'Punch identity uses current team');
assert(app.includes('const pod = name ? currentAttendanceTeamPod(name, rec)'),'Hero shift uses current team');
assert(app.includes("field === 'timeIn' && !next.timeIn\n                ? currentAttendanceTeamPod(name, next)"),'New punch uses current team');
assert(app.includes('qa-standard'),'QA shift stamping is preserved');
assert(app.includes('QA_SHIFT_START;next.shiftEnd=QA_SHIFT_END'),'QA 10–19 punch policy is preserved');
assert(calendar.includes('if (role === \'agent\' && signedInQa) pod = signedInQa;'),'Calendar uses current QA team');
assert(html.includes('production-rollup=20261020'),'Updated production scripts are cache-busted');
console.log('PASS — all three current QA attendance labels, QA 10–19 pre-punch shift, preserved prior POD history, non-QA unchanged, Admin scope, Premium/calendar parity and cache-busting.');
