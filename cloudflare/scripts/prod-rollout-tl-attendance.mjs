import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=fs.readFileSync(path.join(root,'src/worker.js'),'utf8');
const extract=(start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a);assert(a>=0&&b>a,`missing function ${start}`);return source.slice(a,b);};
const allowed=['Alice Own','Moved QA','Moved Other','Backup Agent'];
const roster={
 'Alice Own':{pod:'POD-A',active:true,role:'agent'},
 'Moved QA':{pod:'OOS Coverage Beta QAs',active:true,role:'agent'},
 'Moved Other':{pod:'POD-B',active:true,role:'agent'},
 'Backup Agent':{pod:'POD-B',active:true,role:'agent'}
};
const day='10/24/2026';
const actor={role:'team_leader',name:'TL A',pod:'POD-A',uid:'tl-a'};
const qa='OOS Coverage Beta QAs';
const fail=(status,code)=>{throw Object.assign(new Error(code),{status,code});};
const ctx={console,Date,TextEncoder,Promise,Map,Set,JSON,String,Number,Object,Array,Boolean,
 OOS_QA_INDEPENDENT_POD:qa,cleanText:x=>String(x??'').trim(),normalizePersonName:x=>String(x??'').trim(),
 attendanceRosterMemberServer:async (_env,role,name)=>role==='agent'?roster[name]||null:null,
 attendanceTargetPodServer:async()=>{throw Error('Incorrectly using historical POD for authorization');},
 delegatedTlScopeServer:async (_env,_actor,pod,date)=>({active:pod==='POD-B'&&date===day&&_actor.backup===true}),
 fail};
vm.createContext(ctx);
vm.runInContext(extract('async function authorizeAttendanceMutationServer(', 'async function writeAttendanceMetaServer('),ctx);
const mutate=ctx.authorizeAttendanceMutationServer,read=ctx.authorizeAttendanceReadServer;
const parsed=(name,date=day)=>({family:'agent',name,date,key:`att:${date}|${name}`});
const denied=fn=>assert.rejects(fn,e=>e.status===403&&e.code==='ATTENDANCE_SCOPE_FORBIDDEN');
assert.equal((await read(null,actor,parsed('Alice Own'),{})).scope,'team-leader-pod');
assert.equal((await mutate(null,actor,parsed('Alice Own'),{pod:'POD-A'})).scope,'team-leader-pod');
await denied(()=>read(null,actor,parsed('Moved QA'),{pod:'POD-A'}));
await denied(()=>mutate(null,actor,parsed('Moved QA'),{pod:'POD-A'}));
await denied(()=>read(null,actor,parsed('Moved Other'),{pod:'POD-A'}));
await denied(()=>mutate(null,actor,parsed('Moved Other'),{pod:'POD-A'}));
await denied(()=>mutate(null,actor,parsed('Unknown'),{}));
await denied(()=>mutate(null,actor,parsed('Backup Agent'),{}));
assert.equal((await mutate(null,{...actor,backup:true},parsed('Backup Agent'),{})).scope,'delegated-team-leader');
await denied(()=>mutate(null,{...actor,backup:true},parsed('Backup Agent','10/23/2026'),{}));
assert.equal((await read(null,{role:'admin',name:'Admin'},parsed('Moved QA'),{})).scope,'admin-read');
assert.equal((await read(null,{role:'agent',name:'Agent A',pod:'POD-A'},parsed('Alice Own'),{})).scope,'agent-pod-read');
await denied(()=>read(null,{role:'agent',name:'Agent A',pod:'POD-A'},parsed('Moved QA'),{pod:'POD-A'}));
assert.match(source,/ATTENDANCE_HISTORICAL_POD_ADMIN_REVIEW/g);
assert.ok(source.includes('if(actor.role===\'team_leader\'&&parsedKey.family===\'agent\'&&remoteRecord?.pod&&'),'transaction must guard previous POD');
assert.ok(source.includes('if(actor.role===\'team_leader\'&&parsedKey.family===\'agent\'&&remote?.pod&&'),'deletion must guard previous POD');

// Run the actual Snapshot implementation with synthetic historical stamps. Neither
// legacy meta nor client-provided scoping may grant a former TL access.
const encode=s=>Buffer.from(s).toString('base64url');
const decode=s=>Buffer.from(s,'base64url').toString();
const dates=[parsed('Alice Own'),parsed('Moved QA'),parsed('Moved Other')];
const att={};const meta={};
for(const item of dates){const encoded=encode(item.key);att[encoded]=JSON.stringify({timeIn:'09:00',pod:'POD-A'});meta[encoded]={verified:true,authorizedPod:'POD-A'};}
const c={...ctx,WORKFORCE_ATTENDANCE_ROOT:'attRoot',WORKFORCE_ATTENDANCE_META_ROOT:'metaRoot',WORKFORCE_ATTENDANCE_DELEGATION_PATH:'delegations',
 fbEncodeKeyServer:encode,base64UrlDecodeText:decode,
 attendanceRosterIdentityKeyServer:(role,name)=>`${role}:${name.toLowerCase()}`,
 parseAttendanceStorageKeyServer:key=>{const m=/^att:(\d+\/\d+\/\d+)\|(.+)$/.exec(key);return m?{key,family:'agent',date:m[1],name:m[2]}:null;},
 manilaDateKeyServer:()=>day,
 attendanceMigrationPolicyServer:async()=>({mode:'secure-read-first'}),
 readAttendanceSnapshotFamilyServer:async (_env,root,prefix)=>{const rows=root==='attRoot'?att:root==='metaRoot'?meta:{};return Object.fromEntries(Object.entries(rows).filter(([k])=>decode(k).startsWith(prefix)));},
 canonicalWorkforceAuthorizationRosterServer:async()=>({entries:Object.fromEntries(Object.entries(roster).map(([name,member])=>[encode(`agent:${name.toLowerCase()}`),{...member,name}]))}),
 firebaseAdminGet:async()=>null,
 readAttendanceStateServer:async (_env,key)=>({raw:att[encode(key)],source:'secure',comparison:'match',fallback:false,mismatch:false}),
 credentialRole:x=>x,
 WORKFORCE_ATTENDANCE_MIGRATION_VERSION:2
};
vm.createContext(c);vm.runInContext(extract('async function handleWorkforceAttendanceSnapshot(', 'function forceLogoutIntentServer('),c);
// Bind actor separately; request acts as a synthetic security context.
c.requireWorkforceAttendanceActor=async request=>request.actor;
const url=scope=>new URL('https://staging.example/api/workforce/attendance/snapshot?family=agent'+(scope?'&scope='+scope:''));
const tl=await c.handleWorkforceAttendanceSnapshot({actor}, {},url('home_pod'));
assert.deepEqual(Object.keys(tl.records),[parsed('Alice Own').key]);
assert.deepEqual(tl.rosterEmployees.map(x=>x.name),['Alice Own']);
const tlDefault=await c.handleWorkforceAttendanceSnapshot({actor},{},url(''));
assert.deepEqual(Object.keys(tlDefault.records),[parsed('Alice Own').key]);
const agent=await c.handleWorkforceAttendanceSnapshot({actor:{role:'agent',pod:'POD-A',name:'Alice Own'}},{},url(''));
assert.deepEqual(Object.keys(agent.records),[parsed('Alice Own').key]);
const admin=await c.handleWorkforceAttendanceSnapshot({actor:{role:'admin',name:'Admin'}},{},url(''));
assert.equal(Object.keys(admin.records).length,3);
console.log('PASS TL current attendance access, safe historical scope, QA isolation, backup-TL, Admin, and snapshot fixtures');
