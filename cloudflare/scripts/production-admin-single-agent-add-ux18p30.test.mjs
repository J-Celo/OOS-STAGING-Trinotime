import assert from 'node:assert/strict';
import fs from 'node:fs';
import {planAdminRosterAdd,AdminRosterAddError} from '../src/admin-roster-add.js';
const base={
 podDirectory:{verified:true,entries:[{id:'POD 0',active:true},{id:'POD 1',active:true},{id:'POD 2',active:true},{id:'OOS Coverage Beta QAs',active:true}]},
 teamLeaderDirectory:{verified:true,entries:[{name:'TL Tester',pod:'POD 1',active:true}]},
 employees:{verified:true,version:'v-srv-281',entries:[{name:'Existing Agent',pod:'POD 2',employeeId:'agent-1',active:true,passwordHash:'KEEP'},{name:'QA Member',pod:'OOS Coverage Beta QAs',employeeId:'qa-1',role:'qa',active:true},{name:'Other Person',pod:'POD 1',employeeId:'agent-2',active:true}]}
};
const admin={role:'admin',uid:'verified-admin-uid'};
const data={name:'New Agent',pod:'POD 1',mutationId:'token-0123456789'};
const plan=planAdminRosterAdd(base,admin,data);
assert.equal(plan.alreadyAssigned,false);
assert.equal(plan.baseVersion,'v-srv-281');
assert.equal(plan.entries.length,4);
assert.deepEqual(plan.entries.slice(0,3),base.employees.entries);
assert.deepEqual(plan.entries.at(-1),{name:'New Agent',pod:'POD 1'});
assert.equal(base.employees.entries.length,3,'source roster must never be mutated');
function fails(status,code,st=base,user=admin,req=data){assert.throws(()=>planAdminRosterAdd(st,user,req),e=>e instanceof AdminRosterAddError && e.status===status&&e.code===code);}
fails(403,'ROSTER_ADMIN_REQUIRED',base,{role:'team_leader',pod:'POD 1'},data);
fails(403,'ROSTER_ADMIN_REQUIRED',base,{role:'agent',pod:'POD 1'},data);
fails(400,'ROSTER_ADD_INVALID',base,admin,{...data,entries:[]});
fails(400,'ROSTER_ADD_INVALID',base,admin,{...data,name:'  '});
fails(400,'ROSTER_ADD_INVALID',base,admin,{...data,mutationId:''});
fails(400,'ROSTER_ADD_INVALID_POD',base,admin,{...data,pod:'POD 99'});
fails(400,'ROSTER_ADD_INVALID_POD',base,admin,{...data,pod:'OOS Coverage Beta QAs'});
fails(409,'ROSTER_ADD_TL_COLLISION',base,admin,{...data,name:'TL Tester'});
fails(409,'ROSTER_ADD_EXISTS_OTHER_POD',base,admin,{...data,name:'Existing Agent'});
assert.deepEqual(planAdminRosterAdd(base,admin,{...data,name:'Existing Agent',pod:'POD 2'}),{alreadyAssigned:true,name:'Existing Agent',pod:'POD 2',version:'v-srv-281'});
const unverified=structuredClone(base);unverified.employees.verified=false;fails(503,'ROSTER_ADD_UNVERIFIED',unverified);
const stalePods=structuredClone(base);stalePods.podDirectory.verified=false;fails(503,'ROSTER_ADD_UNVERIFIED',stalePods);
const staleTl=structuredClone(base);staleTl.teamLeaderDirectory.verified=false;fails(503,'ROSTER_ADD_UNVERIFIED',staleTl);
const noVersion=structuredClone(base);noVersion.employees.version='';fails(503,'ROSTER_ADD_UNVERIFIED',noVersion);
const inactive=structuredClone(base);inactive.employees.entries[0].active=false;fails(409,'ROSTER_ADD_EXISTS_OTHER_POD',inactive,admin,{...data,name:'Existing Agent',pod:'POD 2'});
const server=fs.readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
const client=fs.readFileSync(new URL('../public/assets/js/j-5a9b0d9aeabc.js',import.meta.url),'utf8');
const page=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
assert.match(server,/if\(path==='\/employees\/add'&&request\.method==='POST'\)/);
assert.match(server,/rosterWriteEmployeesServer\(env,actor,\{entries:plan\.entries,baseVersion:plan\.baseVersion,targetVersion:plan\.targetVersion,mutationId:plan\.mutationId\}\)/);
assert.match(server,/if\(receipt\.conflict\)return \{remoteSaved:false,conflict:true/);
assert.match(client,/async function addAdminAgentConfirmedUX18P30/);
const addStart=client.indexOf("$('assignSaveBtn').addEventListener('click', () => {");
const addEnd=client.indexOf("$('rosterAddBtn').addEventListener",addStart);
const addBody=client.slice(addStart,addEnd);
assert.match(addBody,/await addAdminAgentConfirmedUX18P30\(name,pod,\{separateAgentRole\}\)/);
assert.doesNotMatch(addBody,/employees\.push\(\{ name, pod \}\)/);
assert.doesNotMatch(addBody,/await saveEmployees\(\)/);
assert.match(client,/await rosterAuthoritySnapshot\(true\)/);
assert.match(client,/rosterAuthorityFetch\('employees\/add',\{method:'POST',admin:true/);
assert.match(page,/admin-roster-add-ux18p30=20261029/);
console.log('PASS UX18P30: admin single-add canonical merge, protected QA/TL rosters, duplicate/POD checks, verified readback, no local full-roster PUT.');
