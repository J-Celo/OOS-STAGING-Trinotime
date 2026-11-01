import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
const dir = path.dirname(fileURLToPath(import.meta.url));
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'trinotime-rc23-offline-'));
let count = 0;
function pass(msg){ count++; console.log(`PASS ${String(count).padStart(2, '0')}: ${msg}`); }
function run(script, expectOk){
  const r = spawnSync(process.execPath, [script], {cwd:scratch, encoding:'utf8', timeout:12000});
  assert.equal(r.status === 0, expectOk, `${script}: ${r.stdout}\n${r.stderr}`);
  return r;
}
const sourcePath = path.join(scratch, 'CURRENT-STAGING-RULES.json');
const makeSource = () => ({
  rules: {
    '.read': false, '.write': false,
    kv: {'.read':'auth != null', '.write':false, legacy:{'.read':'auth != null'}},
    serverTimeAudit:{'.read':'auth != null', '.write':false},
    workforceIdentity:{'.read':'auth != null', '.write':false},
    secureCredentials:{'.read':false, '.write':false},
    workforceRoster:{'.read':false, '.write':false},
    workforceAttendance:{'.read':false, '.write':false},
    roles: {'$uid':{'.read': 'auth != null && auth.uid === $uid'}},
    auditEvents:{'.read':false},
    agentPresence:{'.read':'auth != null'},
    securePremiumEntitlements:{sample:{'.read':'auth != null'}},
  },
  auxiliaryMetadata: {fixtureMarker:'synthetic-only'},
});
const write = data => fs.writeFileSync(sourcePath, JSON.stringify(data,null,2));
try {
  for (const name of ['prepare-candidate.mjs','static-guard.mjs']) fs.copyFileSync(path.join(dir,name),path.join(scratch,name));
  assert.equal(run('prepare-candidate.mjs',false).status===0,false); pass('missing current rules fails closed');
  let source = makeSource(); source.rules['.read']='auth != null'; write(source);
  run('prepare-candidate.mjs',false); pass('broad root read rejected');
  source=makeSource(); source.rules['.write']='auth != null'; write(source);
  run('prepare-candidate.mjs',false); pass('broad root write rejected');
  source=makeSource(); delete source.rules.workforceRoster; write(source);
  run('prepare-candidate.mjs',false); pass('missing required baseline branch rejected');
  source=makeSource(); write(source);
  const result=run('prepare-candidate.mjs',true);pass('candidate generator runs on synthetic fixture');
  assert.match(result.stdout,/REMAINING ISSUE: .*agentPresence/);
  assert.match(result.stdout,/REMAINING ISSUE: .*securePremiumEntitlements/);
  pass('anonymous-auth exposure warnings are reported');
  const generated=JSON.parse(fs.readFileSync(path.join(scratch,'candidate.rules.json'),'utf8'));
  const expected=structuredClone(source);
  for(const name of ['kv','serverTimeAudit','workforceIdentity']) expected.rules[name]={'.read':false,'.write':false};
  assert.deepEqual(generated,expected);pass('only three exact paths changed; all other fields preserved');
  assert.ok(fs.readFileSync(path.join(scratch,'RULES-DIFF.txt'),'utf8').includes('Path: /rules/kv'));
  pass('human-readable exact rules diff generated');
  run('static-guard.mjs',true);pass('static guard accepts valid candidate');
  generated.rules.roles['$uid']['.read']='auth != null';
  fs.writeFileSync(path.join(scratch,'candidate.rules.json'),JSON.stringify(generated));
  run('static-guard.mjs',false);pass('static guard rejects unrelated privilege expansion');
  source=makeSource();source.rules['.read']='false';source.rules['.write']='false';write(source);
  run('prepare-candidate.mjs',true);run('static-guard.mjs',true);pass('unconditional string-false root values accepted');
  console.log(`\nPASS: ${count} OFFLINE STRUCTURAL SELF-TESTS. These are NOT Firebase Emulator tests.`);
} catch(err){console.error('FAIL: Offline structural self-test:',err.stack||err);process.exitCode=1;}
finally{fs.rmSync(scratch,{recursive:true,force:true});}
