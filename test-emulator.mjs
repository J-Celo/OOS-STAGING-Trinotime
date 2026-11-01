import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';

// Runs ONLY against 127.0.0.1 database Emulator + fake demo project.
const dir = path.dirname(fileURLToPath(import.meta.url));
const id = 'demo-trinotime-staging-qa';
const host = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
if (host !== '127.0.0.1:9009' && host !== 'localhost:9009') {
  console.error('STOP: start using npm run test:emulator; requires local RTDB Emulator at 127.0.0.1:9009.');
  process.exit(1);
}
const rules = fs.readFileSync(path.join(dir,'candidate.rules.json'),'utf8');
let env;
let passed=0;
async function test(label, action) {
  await action();
  passed++;
  console.log(`PASS ${String(passed).padStart(3,'0')}: ${label}`);
}
try {
  env = await initializeTestEnvironment({
    projectId:id,
    database:{host:'127.0.0.1',port:9009,rules},
  });
  await env.clearDatabase();
  await env.withSecurityRulesDisabled(async ctx => {
    await ctx.database().ref('/').set({
      kv:{samplePrivateKey:{secret:'synthetic-only'}, nested:{child:{item:'synthetic-only'}}},
      serverTimeAudit:{test:{actor:'synthetic-only'}},
      workforceIdentity:{test:{name:'synthetic-only'}},
      workforceAttendance:{synthetic:{state:'synthetic-only'}},
      roles:{
        'admin-active':{role:'admin',active:true},
        'admin-inactive':{role:'admin',active:false},
        'agent-one':{role:'agent',active:true},
        'agent-inactive':{role:'agent',active:false},
        'tl-one':{role:'tl',active:true},
        'agent-different-pod':{role:'agent',active:true},
        'revoked-one':{role:'agent',active:false},
      },
      auditEvents:{synthetic:{serverTs:1234}},
      agentPresence:{synthetic:{status:'test'}},
      securePremiumEntitlements:{synthetic:{enabled:false}},
    });
  });
  // Positive control: fixture really contains protected synthetic data. This uses a
  // rules-disabled TEST context, NOT a test of actual Cloudflare Worker service access.
  await env.withSecurityRulesDisabled(async ctx=>{
    const snap=await ctx.database().ref('/kv/samplePrivateKey/secret').once('value');
    if(snap.val()!=='synthetic-only')throw Error('Protected test data not seeded.');
  });
  await test('synthetic protected data exists under bypassed test-fixture context',async()=>{});

  const callers={
    guest:env.unauthenticatedContext(),
    anon:env.authenticatedContext('anonymous-test',{firebase:{sign_in_provider:'anonymous'}}),
    agent:env.authenticatedContext('agent-one'),
    inactiveAgent:env.authenticatedContext('agent-inactive'),
    tl:env.authenticatedContext('tl-one'),
    wrongPod:env.authenticatedContext('agent-different-pod'),
    revoked:env.authenticatedContext('revoked-one'),
    inactiveAdmin:env.authenticatedContext('admin-inactive'),
    activeAdmin:env.authenticatedContext('admin-active'),
  };
  const protectedBranches=['/kv','/serverTimeAudit','/workforceIdentity'];
  for (const [name,who] of Object.entries(callers)) {
    for (const target of protectedBranches) {
      await test(`${name}: deny reading ${target}`,
        ()=>assertFails(who.database().ref(target).once('value')));
      await test(`${name}: deny reading ${target}/nested`,
        ()=>assertFails(who.database().ref(`${target}/nested`).once('value')));
      await test(`${name}: deny writing ${target}/new`,
        ()=>assertFails(who.database().ref(`${target}/new`).set({synthetic:true})));
      await test(`${name}: deny deleting ${target}`,
        ()=>assertFails(who.database().ref(target).remove()));
      await test(`${name}: deny update within ${target}`,
        ()=>assertFails(who.database().ref(target).update({new:{synthetic:true}})));
      await test(`${name}: deny query over ${target}`,
        ()=>assertFails(who.database().ref(target).orderByKey().limitToFirst(1).once('value')));
    }
    await test(`${name}: deny reading /kv/samplePrivateKey/secret`,
      ()=>assertFails(who.database().ref('/kv/samplePrivateKey/secret').once('value')));
    await test(`${name}: deny writing nested secret`,
      ()=>assertFails(who.database().ref('/kv/samplePrivateKey/secret').set('invalid-write')));
    await test(`${name}: deny reading workforceAttendance parent`,
      ()=>assertFails(who.database().ref('/workforceAttendance').once('value')));
    await test(`${name}: deny reading database root`,
      ()=>assertFails(who.database().ref('/').once('value')));
    await test(`${name}: deny root write containing /kv`,
      ()=>assertFails(who.database().ref('/').update({kv:{malicious:true}})));
    await test(`${name}: deny root multi-location update`,
      ()=>assertFails(who.database().ref('/').update({'kv/samplePrivateKey/secret':'malicious'})));
  }
  // Expected permission boundaries from the previously described staging rules;
  // if positive controls fail, inspect the actual baseline schema rather than
  // weakening access or skipping the test. This suite does not certify every branch.
  await test('Agent can read own role record',
    ()=>assertSucceeds(callers.agent.database().ref('/roles/agent-one').once('value')));
  await test('Agent cannot read a different user role',
    ()=>assertFails(callers.agent.database().ref('/roles/admin-active').once('value')));
  await test('Agent cannot read auditEvents',
    ()=>assertFails(callers.agent.database().ref('/auditEvents').once('value')));
  await test('Inactive Admin cannot read auditEvents',
    ()=>assertFails(callers.inactiveAdmin.database().ref('/auditEvents').once('value')));
  await test('Active Admin can read auditEvents',
    ()=>assertSucceeds(callers.activeAdmin.database().ref('/auditEvents').once('value')));
  await test('Guest cannot read agentPresence',
    ()=>assertFails(callers.guest.database().ref('/agentPresence').once('value')));
  const parsed=JSON.parse(rules).rules;
  if (parsed.agentPresence?.['.read']==='auth != null') {
    await test('WARNING: anonymous Firebase session CAN read agentPresence',
      ()=>assertSucceeds(callers.anon.database().ref('/agentPresence').once('value')));
    console.log('REMAINING ISSUE: /agentPresence permits authenticated anonymous transport sessions.');
  }
  const explicit=Object.entries(parsed.securePremiumEntitlements||{})
    .find(([k,v])=>!k.startsWith('.')&&!k.startsWith('$')&&v?.['.read']==='auth != null');
  if (explicit) {
    await test('WARNING: anonymous Firebase session CAN read premium entitlement record',
      ()=>assertSucceeds(callers.anon.database().ref(`/securePremiumEntitlements/${explicit[0]}`).once('value')));
    console.log('REMAINING ISSUE: an entitlement branch permits Firebase-anonymous sessions.');
  }
  console.log(`\nPASS: ${passed} live LOCAL FIREBASE RTDB EMULATOR assertions.`);
  console.log('NOT VERIFIED: actual published staging rules, application source, Worker/Admin SDK, production, live identity migrations.');
} catch(err) {
  console.error('FAIL: RTDB Emulator permission tests:',err?.stack||err);
  process.exitCode=1;
} finally {
  if(env)await env.cleanup();
}
