// TrinoTime production 3.0.4 UX18P16: Agent login vs pending supervisor roster draft.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const s=fs.readFileSync(new URL('../public/assets/js/j-5a9b0d9aeabc.js',import.meta.url),'utf8');
const between=(a,b)=>s.slice(s.indexOf(a),s.indexOf(b,s.indexOf(a)));
const guard=between('        function canUseEmployeeRosterDraft()', '        function rosterClientIntents');
const flush=between('        async function flushPendingBlob(', '        function getStorageHash');
const apply=between('        function applyRosterAuthorityDocument(', '        async function rosterAuthoritySnapshot');
const snapshot=between('        async function rosterAuthoritySnapshot(', '        async function rosterAuthorityWritePod');
const get=between('            async get(k) {','            async set(k, v) {');
const draft='[{"name":"Another Agent","pod":"POD 5"}]';
const live=[{name:'Elmer Ravina',pod:'POD 2'}];
for(const role of ['gate','agent-pending','agent']){
 const stored=new Map([['pending:employees',draft],['pending:att:test','attendance-unmodified']]);
 const c=vm.createContext({isAdmin:false,isTeamLeader:false,document:{body:{dataset:{trinoRole:role}},getElementById:()=>({style:{display:'flex'}})},employees:live,
  safeLocalRemove:()=>{throw Error('Deleted pending data');},
  safeLocalSet:(k,v)=>stored.set(k,v),setLocalMirrorForKey:(k,v)=>stored.set(k,v),
  hasPendingWrite:()=>true,sanitizeEmployeeRoster:x=>x,
  rosterSecureVerified:{},rosterSecureReadActive:false,fbKvCache:{},employeesVersion:'',
  rosterAuthoritySnapshot:()=>{throw Error('Agent replay requested authority');}});
 vm.runInContext(guard+flush+apply+';globalThis.storage={'+get+'};',c);
 assert.equal(await c.flushPendingBlob('pending:employees','employees','invalid-json'),false);
 assert.equal(await c.storage.get('employees'),JSON.stringify(live));
 c.applyRosterAuthorityDocument('employees',{entries:live,version:'server-v2',verified:true});
 assert.equal(c.employees[0].name,'Elmer Ravina');
 assert.equal(stored.get('pending:employees'),draft);
 assert.equal(stored.get('pending:att:test'),'attendance-unmodified');
}
for(const [role,admin,tl] of [['admin',true,true],['teamleader',false,true]]){
 const c=vm.createContext({isAdmin:admin,isTeamLeader:tl,document:{body:{dataset:{trinoRole:role}},getElementById:()=>({style:{display:'none'}})},employees:live,
 hasPendingWrite:()=>true,pendingWritePayload:()=>draft,hasPendingDelete:()=>false,isCredentialStorageKey:()=>false,
 isProfileStorageKey:()=>false,appStorageLocalReadDepth:0});
 vm.runInContext(guard+';globalThis.storage={'+get+'};',c);
 assert.equal(await c.storage.get('employees'),draft,'Supervisor draft preserved');
}
const pending=[];let identity='agent-A';const applied=[];
const c=vm.createContext({workspaceReadIdentity:()=>identity,Date,
 rosterAuthoritySnapshotCache:null,rosterAuthoritySnapshotIdentity:'',rosterAuthoritySnapshotLoadedAt:0,
 rosterAuthoritySnapshotPromise:null,rosterAuthoritySnapshotPromiseIdentity:'',
 FIREBASE_READ_TIMEOUT_MS:100,rosterAuthorityFetch:()=>new Promise(resolve=>pending.push(resolve)),
 applyRosterAuthorityDocument:(k,d)=>{if(k==='employees')applied.push(d.entries[0].name);},
 refreshPodDirectoryDependentViews:()=>{}});
vm.runInContext(snapshot,c);
const first=c.rosterAuthoritySnapshot(true).catch(e=>e.code);
identity='agent-B';
const second=c.rosterAuthoritySnapshot(true);
assert.equal(pending.length,2,'Never share an in-flight roster across identities');
pending[0]({employees:{entries:[{name:'A'}]}});
assert.equal(await first,'live/read-cancelled');
pending[1]({employees:{entries:[{name:'B'}]}});
await second;
assert.deepEqual(applied,['B']);
identity='agent-A';
const third=c.rosterAuthoritySnapshot(false);
assert.equal(pending.length,3,'Never reuse another identity cache');
pending[2]({employees:{entries:live}});
await third;
assert.deepEqual(applied,['B','Elmer Ravina']);
console.log('PASS UX18P16: preserved drafts and attendance; Agent/gate replay blocked; supervisor editing retained; cross-account roster cache and stale responses isolated.');

// Login must require a forced roster authority read before deciding live membership.
const agentLoginCode=s.slice(s.indexOf('authenticatedAgentName:name'),s.indexOf('// v1.1.70: provision/restore',s.indexOf('authenticatedAgentName:name')));
assert(agentLoginCode.includes('const loginRoster = await rosterAuthoritySnapshot(true);'));
assert(agentLoginCode.includes('!Array.isArray(loginRoster.employees.entries)'));
assert(agentLoginCode.includes('sanitizeEmployeeRoster(loginRoster.employees.entries)'));
assert(!agentLoginCode.includes('const liveEmployee = employees.find('));
// Production-only release invariant: no staging credentials, Tracker or Worker migrations.
const prodCfg=JSON.parse(fs.readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
const ver=JSON.parse(fs.readFileSync(new URL('../public/version.json',import.meta.url),'utf8'));
const page=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const {createHash}=await import('node:crypto');
const tracker=JSON.parse(fs.readFileSync(new URL('../public/downloads/qc-tracker-current.json',import.meta.url),'utf8'));
const trackerBytes=fs.readFileSync(new URL('../public/downloads/TrinoTime-QC-Tracker-v2.3.10.zip',import.meta.url));
assert.equal(prodCfg.name,'oostrinotime');
assert.equal(prodCfg.vars.DEPLOYMENT_ENV,'production');
assert.equal(prodCfg.vars.FIREBASE_PROJECT_ID,'cwh-timeclock');
assert.equal(ver.build_fingerprint,'TT-3.0.4-PRODUCTION-UX18P46-SYNC-GUARDIAN-READONLY-2.3.10-20261031');
assert(page.includes('&agent-login-ux18p16=20261028'));
assert.equal(tracker.version,'2.3.10');
assert.equal(tracker.sha256,createHash('sha256').update(trackerBytes).digest('hex'));
assert(!page.includes('oostrinotime-staging-qa.trinoadmin.workers.dev'));
console.log('PASS production UX18P16: Agent login policy, immutable production environment, Tracker v2.3.10 integrity, release metadata');
