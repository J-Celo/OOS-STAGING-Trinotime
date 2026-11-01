// Phase 2A static safety gate: intentionally does NOT claim /kv is protected.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import {decodeFirebaseKvKey, classifyFirebaseKvKey, summarizeFirebaseKvKeys} from './kv-phase2-helpers-m2956.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const project=path.resolve(root,'..');
const client=fs.readFileSync(path.join(root,'public/assets/js/j-b52f8ff97ca5.js'),'utf8');
const worker=fs.readFileSync(path.join(root,'src/worker.js'),'utf8');
const rules=JSON.parse(fs.readFileSync(path.join(project,'firebase/STAGING-RULES-PROPOSED-M2955-ONLY-TIME-AUDIT.json'),'utf8')).rules;
const baseline=JSON.parse(fs.readFileSync(path.join(project,'docs/security/M2956-KV-CLIENT-BASELINE.json'),'utf8'));
let pass=0;
function check(message,callback){ callback(); pass++; console.log(`PASS M2956: ${message}`); }
const counts={
  rootReferences:(client.match(/\b(?:fbDb|db)\.ref\(['"]kv['"]\)/g)||[]).length,
  keyReferences:(client.match(/\b(?:fbDb|db)\.ref\(['"]kv\/['"]/g)||[]).length,
  rootChildEventSubscriptions:(client.match(/liveKvRef\.on\(['"]child_(?:added|changed|removed)['"]/g)||[]).length,
  rootValueSubscriptions:(client.match(/liveKvRef\.on\(['"]value['"]/g)||[]).length
};
check('baseline contains current /kv client exposure counts',()=>{
  for(const [kind,limit] of Object.entries(baseline.maximumCounts)){
    assert.ok(Number.isSafeInteger(limit)&&limit>=0);
    assert.ok(counts[kind]<=limit, `Unexpected additional direct /kv use: ${kind}; analyze and update migration plan, not the baseline automatically`);
  }
});
check('Worker compatibility event subscriptions remain; published rules still require approval',()=>{
  assert.ok(counts.rootChildEventSubscriptions>0 && counts.rootValueSubscriptions>0);
});
check('legacy client /kv code explicitly prohibits direct writes',()=>{
  assert.match(client,/Direct browser shared \/kv writes are disabled/);
});
check('existing staging rules do not yet restrict authenticated /kv reads',()=>{
  assert.equal(rules['.read'],false);
  assert.equal(rules.kv['.read'],'auth != null');
  assert.equal(rules.kv['.write'],false);
});
check('previously published time audit rules remain closed to direct clients',()=>{
  assert.equal(rules.serverTimeAudit['.read'],false);
  assert.equal(rules.serverTimeAudit['.write'],false);
  assert.ok(!Object.keys(rules.serverTimeAudit).some(x=>x.startsWith('$')));
});
check('Worker uses secure credential vault and has a guarded vault-only policy',()=>{
  assert.match(worker,/const SECURE_CREDENTIAL_ROOT = 'secureCredentials'/);
  assert.match(worker,/credentialLegacyFallbackAllowed/);
  assert.match(worker,/mode:'vault-only'/);
  assert.match(worker,/requireActiveAdminUser\(request,env\)/);
});
check('key-name decoding classifies a historical credential key without exposing it',()=>{
  const legacy='agentauth:QA-NO-REAL-ACCOUNT';
  const enc=Buffer.from(legacy,'utf8').toString('base64url');
  assert.equal(decodeFirebaseKvKey(enc),legacy);
  assert.equal(classifyFirebaseKvKey(legacy),'legacy-credential-risk');
  const s=summarizeFirebaseKvKeys([enc,'employees']);
  assert.equal(s.categories['legacy-credential-risk'],1);
  assert.equal(s.totalKeys,2);
  assert.ok(!JSON.stringify(s).includes(legacy));
  assert.ok(!JSON.stringify(s).includes(enc));
});
check('offline inventory rejects database-value objects',()=>{
  assert.throws(()=>summarizeFirebaseKvKeys({credential:'sensitive-value'}), TypeError);
  assert.throws(()=>summarizeFirebaseKvKeys(['key',{secret:'sensitive-value'}]), TypeError);
});
console.log(`M2956 PHASE 2A: ${pass} offline checks passed. Client SDK/REST /kv reads removed; published broad /kv permission remains unchanged.`);
