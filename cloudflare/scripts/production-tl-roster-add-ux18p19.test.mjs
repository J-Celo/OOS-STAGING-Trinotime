import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { mergeRosterIntents } from '../src/roster-intents.js';
const code = readFileSync(new URL('../public/assets/js/j-5a9b0d9aeabc.js', import.meta.url),'utf8');
const index = readFileSync(new URL('../public/index.html', import.meta.url),'utf8');
const start = code.indexOf('async function addTeamLeaderAgentConfirmedUX18P19(');
const end = code.indexOf("$('assignSaveBtn').addEventListener",start);
assert.ok(start>0 && end>start, 'real browser-side TL add function must be present');
const fn = code.slice(start,end);
function fixture(options={}) {
  const calls=[];
  let reads=0;
  const originals=[{name:'Existing Agent',pod:'POD 9'}];
  const ctx={
    isTeamLeader: options.isTeamLeader ?? true, isAdmin:options.isAdmin ?? false,
    lockedPod:options.lockedPod ?? 'POD 9',
    hasPendingWrite:()=>options.pending ?? false,
    hasPendingDelete:()=>false,
    workspaceReadIdentity:()=>options.identity || 'signed-in-TL',
    rosterAuthoritySnapshot:async()=>{
      reads++;
      if(reads===1)return options.first ?? {employees:{verified:true,version:'v1',entries:originals}};
      if(options.secondError)throw Error('Network unavailable');
      return options.second ?? {employees:{verified:true,version:'v2',entries:[...originals,{name:'Added Agent',pod:'POD 9'}]}};
    },
    createBlobVersion:()=> 'v2',
    rosterAuthorityFetch:async(path,arg)=>{
      calls.push({path,arg});
      return options.reply ?? {remoteSaved:true,version:'v2'};
    }
  };
  runInNewContext(fn + '\nthis.addTL = addTeamLeaderAgentConfirmedUX18P19;',ctx);
  return {add:(name='Added Agent',pod='POD 9')=>ctx.addTL(name,pod),calls,reads:()=>reads};
}
test('server-confirmed TL addition uses only own-POD intent without full roster replacement',async()=>{
 const fx=fixture();
 assert.equal((await fx.add()).remoteSaved,true);
 assert.equal(fx.calls.length,1);
 assert.equal(fx.calls[0].path,'employees/intents');
 assert.equal(fx.calls[0].arg.method,'PATCH');
 assert.deepEqual(JSON.parse(JSON.stringify(fx.calls[0].arg.body.operations)),[{operation:'add',newName:'Added Agent'}]);
 assert.equal(fx.calls[0].arg.body.baseVersion,'v1');
});
test('out-of-POD add blocked before network',async()=>{const f=fixture();await assert.rejects(f.add('Someone','POD 8'),/verified Team Leader POD/);assert.equal(f.calls.length,0);});
test('non-TL add rejected',async()=>{const f=fixture({isTeamLeader:false});await assert.rejects(f.add(),/verified Team Leader POD/);assert.equal(f.calls.length,0);});
test('pending local draft does not block independent version-checked TL add',async()=>{const f=fixture({pending:true});const r=await f.add();assert.equal(r.remoteSaved,true);assert.equal(r.localDraftPreserved,true);assert.equal(f.calls.length,1);});
test('unverified roster refuses server mutation',async()=>{const f=fixture({first:{employees:{verified:false,version:'v1',entries:[]}}});await assert.rejects(f.add(),/could not be verified/);assert.equal(f.calls.length,0);});
test('same-POD existing agent does not create duplicate',async()=>{const f=fixture();const r=await f.add('Existing Agent');assert.equal(r.alreadyAssigned,true);assert.equal(f.calls.length,0);});
test('concurrent version conflict does not claim add succeeded',async()=>{const f=fixture({reply:{conflict:true}});await assert.rejects(f.add(),/Another roster update/);assert.equal(f.calls.length,1);});
test('no positive server receipt does not claim success',async()=>{const f=fixture({reply:{remoteSaved:false}});await assert.rejects(f.add(),/not confirmed/);});
test('post-commit unconfirmed readback fails closed with reconciliation warning',async()=>{const f=fixture({second:{employees:{verified:true,version:'v2',entries:[{name:'Existing Agent',pod:'POD 9'}]}}});await assert.rejects(f.add(),error=>error.outcomeUnknown===true && /could not confirm/.test(error.message));});
test('post-commit network failure fails closed and discourages blind retry',async()=>{const f=fixture({secondError:true});await assert.rejects(f.add(),error=>error.outcomeUnknown===true);});
test('TL picker explicitly uses locked POD instead of activeTeam',()=>{
 const p=code.indexOf('function getPodScoped()'); const q=code.slice(p,p+350);
 assert.match(q,/tlAgentRosterViewUX18P19\(\)/);assert.match(q,/lockedPod/);
 assert.match(code,/const verifiedTlScope = tlAgentRosterViewUX18P19\(\)/);
});
test('Admin Add Agent cannot claim success without server receipt',()=>{
 assert.match(code,/const receipt = await addAdminAgentConfirmedUX18P30\(name,pod,\{separateAgentRole\}\)/);
 assert.match(code,/rosterAuthorityFetch\('employees\/add',\{method:'POST',admin:true/);
 assert.match(code,/const preservedLocalRosterDraft = hasPendingWrite\('employees'\)/);
 assert.match(index,/tl-add-receipt-ux18p19-production=20261028/);
});
test('Worker merges TL add into canonical cross-POD roster, retaining all other agents',()=>{
 const state={
 employees:{verified:true,version:'v1',entries:[{name:'POD 9 Existing',pod:'POD 9'},{name:'POD 2 Existing',pod:'POD 2'}]},
 podDirectory:{verified:true,entries:[{id:'POD 9',team:'CWH',active:true},{id:'POD 2',team:'CWH',active:true}]},
 teamLeaderDirectory:{verified:true,entries:[{name:'TL Nine',pod:'POD 9'}]}
 };
 const intent=mergeRosterIntents(state,{role:'team_leader',pod:'POD 9',name:'TL Nine'},{operations:[{operation:'add',newName:'Added Agent'}],baseVersion:'v1',targetVersion:'v2',mutationId:'v2'});
 assert.equal(intent.entries.length,3);
 assert.ok(intent.entries.some(x=>x.name==='POD 2 Existing'&&x.pod==='POD 2'));
 assert.ok(intent.entries.some(x=>x.name==='POD 9 Existing'&&x.pod==='POD 9'));
 assert.ok(intent.entries.some(x=>x.name==='Added Agent'&&x.pod==='POD 9'));
});

test('server-reported same name under different POD is not a successful own-POD add',async()=>{
 const f=fixture({first:{employees:{verified:true,version:'v1',entries:[{name:'Existing Agent',pod:'POD 2'}]}}});
 await assert.rejects(f.add('Existing Agent'),/already belongs to another POD/);
 assert.equal(f.calls.length,0);
});

test('verified session-bound POD snapshot rescues TL list from an empty local roster draft',()=>{
 const start=code.indexOf('function tlAgentRosterViewUX18P19()');
 const end=code.indexOf('function populateEmployeeSelects()',start);
 assert.ok(start>0&&end>start);
 const snippet=code.slice(start,end);
 const ctx={isTeamLeader:true,isAdmin:false,lockedPod:'POD 9',
  rosterAuthoritySnapshotIdentity:'session-nine',workspaceReadIdentity:()=> 'session-nine',
  rosterAuthoritySnapshotCache:{employees:{verified:true,entries:[{name:'POD 9 Alice',pod:'POD 9'}, {name:'Other POD Agent',pod:'POD 2'}]}},
  isLabelerRosterEmployee:()=>true,labelerRosterEmployees:()=>[]};
 runInNewContext(snippet+'\nthis.tlView=tlAgentRosterViewUX18P19;',ctx);
 assert.deepEqual(JSON.parse(JSON.stringify(ctx.tlView())),[{name:'POD 9 Alice',pod:'POD 9'}]);
 ctx.rosterAuthoritySnapshotIdentity='stale-session';
 assert.deepEqual(JSON.parse(JSON.stringify(ctx.tlView())),[]);
});
