import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const dirname = path.dirname(fileURLToPath(import.meta.url));
const base = path.resolve(dirname, '../..');
const worker = fs.readFileSync(path.join(base, 'cloudflare/src/worker.js'), 'utf8');
const client = fs.readFileSync(path.join(base, 'cloudflare/public/assets/js/j-b52f8ff97ca5.js'), 'utf8');
const rules = JSON.parse(fs.readFileSync(path.join(base, 'firebase/RTDB-M2955-STAGING-REVIEW-ONLY.json'), 'utf8')).rules;
const baseline = JSON.parse(fs.readFileSync(path.join(base, 'firebase/RTDB-STAGING-OWNER-SUPPLIED-20261010-BACKUP-NOT-LIVE-EXPORT.json'), 'utf8')).rules;

const deniesNestedWrite = x => x['.write'] === false && Object.entries(x).every(([k,v]) => !k.startsWith('.') && v && typeof v === 'object' && !Array.isArray(v) ? (v['.write'] === false || !('.write' in v)) && Object.entries(v).every(([c,w]) => !c.startsWith('.') && w && typeof w === 'object' && !Array.isArray(w) ? deniesNestedWrite(w) : true) : true);
assert.equal(deniesNestedWrite(rules.auditEvents), true, 'auditEvents must have no permissive descendant writes');
assert.equal(deniesNestedWrite(rules.serverTimeAudit), true, 'serverTimeAudit must have no permissive descendant writes');
assert.equal(rules.serverTimeAudit['.read'], false, 'time diagnostics must not be directly visible to clients');
assert.match(String(rules.auditEvents['.read']), /'admin'/);
assert.doesNotMatch(String(rules.auditEvents['.read']), /premium_manager/, 'keep staging audit reads admin-only');
assert.equal(rules.kv['.read'], baseline.kv['.read'], 'do not silently break legacy kv synchronization in this phase');
assert.equal(rules.agentPresence['.read'], baseline.agentPresence['.read'], 'do not silently break presence listeners in this phase');
assert.equal(rules.roles['$uid']['.read'], baseline.roles['$uid']['.read']);
assert.equal(rules.securePremiumEntitlements['tt_emp_bebless_velasco_p0_001']['.write'], false, 'preserve already-denied premium entitlement writes');
assert.deepEqual(rules.auditEvents, baseline.auditEvents, 'do not rewrite current staging auditEvents at all');
for (const k of Object.keys(baseline)) if(k !== 'serverTimeAudit') assert.deepEqual(rules[k], baseline[k], `unexpected changes at ${k}`);
assert.doesNotMatch(client, /fbDb\.ref\(['"]serverTimeAudit['"]\)\.push\(/, 'client must not write time diagnostics directly');
assert.doesNotMatch(client, /fbDb\.ref\(['"]serverTimeAudit['"]\).*?\.once\(/, 'client must not read all time diagnostics directly');
assert.match(client, /workforceOperationalAuthorityFetch\('audit', 'time'/, 'browser calls server-authorized time endpoint');
assert.match(worker, /const WORKFORCE_TIME_AUDIT_ROOT = 'serverTimeAudit'/);
assert.match(worker, /url\.pathname==='\/api\/workforce\/audit\/time'/);
assert.match(worker, /requireWorkforceAttendanceActor\(request,env\)/);

// Execute the actual audit endpoint implementations inside a mocked, offline Worker context.
const start=worker.indexOf('// M2.9.55: Server-owned time diagnostics.');
const end=worker.indexOf('function presenceSessionIdServer(',start);
assert(start!==-1 && end>start);
const snippet=worker.slice(start,end);
const db = {};
const ctx={
 crypto, Date, Number, String, Object, Array, Boolean,
 WORKFORCE_TIME_AUDIT_ROOT:'serverTimeAudit',
 requireWorkforceAttendanceActor:async request=>{if(!request.actor)throw Object.assign(Error('not authenticated'),{status:401});return request.actor;},
 auditActorRecordServer:actor=>actor,
 enforceRate:()=>{},
 parseBody:async request=>request.body||{},
 auditClientTsServer:value=>{const parsed=new Date(value);return Number.isFinite(parsed.getTime())?parsed.toISOString():new Date().toISOString();},
 fail:(status,code)=>{const err=Error(code);err.status=status;err.code=code;throw err;},
 firebaseAdminSet:async (_env,key,value)=>{db[key]=value;},
 firebaseAdminGet:async (_env,key)=>{if(key!=='serverTimeAudit')throw Error('wrong path');return Object.fromEntries(Object.entries(db).filter(([p])=>p.startsWith('serverTimeAudit/')).map(([p,v])=>[p.split('/').at(-1),v]));},
 handleAuditAppendServer:async()=>({}),
 handleAuditListServer:async()=>({}),
 json:x=>x
};
vm.createContext(ctx);vm.runInContext(snippet,ctx);
const api=ctx.handleWorkforceAuditApi;
assert.equal(typeof api,'function');
const agent={uid:'agent1',name:'Test Agent',pod:'POD 1',role:'agent',kind:'workforce'};
const another={uid:'agent2',name:'Other Agent',pod:'POD 2',role:'agent',kind:'workforce'};
const leader={uid:'leader1',name:'Test Team Lead',pod:'POD 1',role:'teamleader',kind:'workforce'};
const admin={uid:'admin1',name:'Test Admin',pod:'',role:'admin',kind:'firebase'};
const makeReq=(actor,body,method='POST')=>({actor,body,method});
const endpoint='/api/workforce/audit/time';
await assert.rejects(()=>api(makeReq(null,{action:'punch',field:'timeIn'}),{},new URL('https://staging.test'+endpoint)),e=>e.status===401,'anonymous must be denied');
await assert.rejects(()=>api(makeReq(agent,{action:'erase_log',field:'timeIn'}),{},new URL('https://staging.test'+endpoint)),e=>e.status===400,'unsupported action must be denied');
await assert.rejects(()=>api(makeReq(agent,{action:'tl_punch',field:'timeIn'}),{},new URL('https://staging.test'+endpoint)),e=>e.status===403,'agent cannot forge team lead punch');
await assert.rejects(()=>api(makeReq(agent,{action:'punch',field:'adminRole'}),{},new URL('https://staging.test'+endpoint)),e=>e.status===400,'unexpected punch field must be denied');
for(const actor of [agent,another,leader]){
  const action=actor.role==='teamleader'?'tl_punch':'punch';
  const answer=await api(makeReq(actor,{action,field:'timeIn',clientTs:'2026-10-09T10:00:00.000Z',name:'FAKE ADMIN',role:'admin'}),{},new URL('https://staging.test'+endpoint));
  assert.equal(answer.saved,true);
}
const records=Object.values(db);
assert.equal(records.length,3);
assert(records.every(r=>r.name!=='FAKE ADMIN'&&r.role!=='admin'), 'server binds actor, not user-submitted name/role');
const list = actor=>api(makeReq(actor,{},'GET'),{},new URL('https://staging.test'+endpoint));
assert.equal((await list(agent)).rows.length,1,'Agent sees only own timing diagnostics');
assert.equal((await list(leader)).rows.length,1,'TL sees only own timing diagnostics');
assert.equal((await list(admin)).rows.length,3,'Admin can see all recent time diagnostics');
await assert.rejects(()=>list(null),e=>e.status===401,'unauthenticated reads must fail');
console.log('security-audit-authority-m2955-regression: PASS (staging rules + 14 offline code/API checks)');
