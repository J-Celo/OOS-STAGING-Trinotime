import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../public/assets/js/j-b52f8ff97ca5.js',import.meta.url),'utf8');
function fn(name){const start=source.indexOf('        function '+name+'(');assert(start>=0,name);const end=source.indexOf('\n        function ',start+1);return source.slice(start,end);}
for(const role of ['admin','tl','agent']){
 const storage=new Map([['lastEmployee','Tanjiro Kamado'],['attendance-record','untouched']]);
 const nodes=Object.fromEntries(['empSearch','empSelect','empSearchWrap','empSearchList','selectedEmployeeDisplay'].map(id=>[id,{value:'Tanjiro Kamado',style:{},classList:{remove(){},contains(){return false}}}]));
 const c=vm.createContext({isAdmin:role==='admin',isTeamLeader:role==='tl',currentEmployee:'Tanjiro Kamado',lastPunchCardRenderKey:'old',localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},$:id=>nodes[id],document:{querySelector:()=>null},window:{scrollY:0},activeTeam:'CWH',activePod:'Demon Slayer'});
 vm.runInContext([fn('saveLastEmployee'),fn('getLastEmployee'),fn('resetSupervisorEmployeeSearch'),fn('capturePersistentNavigation')].join('\n'),c);
 vm.runInContext("saveLastEmployee('Nezuko Kamado')",c);
 if(role!=='agent'){
  assert.equal(vm.runInContext('getLastEmployee()',c),null);
  assert.equal(vm.runInContext('capturePersistentNavigation().currentEmployee',c),'');
  vm.runInContext('resetSupervisorEmployeeSearch()',c);
  assert.equal(c.currentEmployee,null);assert.equal(nodes.empSearch.value,'');assert.equal(nodes.empSelect.value,'');assert(!storage.has('lastEmployee'));
 }else{
  assert.equal(storage.get('lastEmployee'),'Nezuko Kamado');
  vm.runInContext('resetSupervisorEmployeeSearch()',c);assert.equal(c.currentEmployee,'Tanjiro Kamado');assert.equal(nodes.empSearch.value,'Tanjiro Kamado');
 }
 assert.equal(storage.get('attendance-record'),'untouched');
}
assert(source.includes('isTeamLeader = teamLeader || admin;\n            resetSupervisorEmployeeSearch();'));
assert(source.includes('function restorePersistentNavigation(nav) {\n            resetSupervisorEmployeeSearch();'));
assert(source.includes("const desiredEmployee = (isAdmin || isTeamLeader) ? '' : (agentSessionAuthenticated ? agentSessionName : (nav.currentEmployee || ''));"));
console.log('PASS RC19: Admin/TL search not persisted or restored; stale input/selection cleared; Agent identity and unrelated storage preserved');
