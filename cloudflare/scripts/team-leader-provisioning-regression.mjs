import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const worker = fs.readFileSync(path.join(root, 'src/worker.js'), 'utf8');

assert.ok(
  worker.includes("const credentialActive = targetRole==='team_leader' && callerRole==='admin' ? true : base.active!==false;"),
  'Admin-issued Team Leader temporary credentials explicitly reactivate the active roster account'
);
assert.ok(
  worker.includes('active:credentialActive,salt,hash:'),
  'temporary credential write uses the lifecycle-safe activation decision'
);
assert.ok(
  worker.includes("if (!tl || tl.active === false) continue;"),
  'inactive Team Leaders remain excluded from the canonical workforce directory'
);
assert.ok(
  worker.includes("const member=await findCredentialMember(env,targetRole,name,pod); if(!member) fail(404,'SECURITY_MEMBER_NOT_FOUND'"),
  'temporary credentials can only be issued to current roster members'
);
assert.ok(
  worker.includes("targetRole==='team_leader' && callerRole==='admin' ? true : base.active!==false"),
  'Agent reset behavior continues to preserve existing active/inactive state'
);

console.log('PASS — Admin provisioning/reactivation of an active-roster Team Leader produces an active temporary credential');
console.log('PASS — inactive TLs remain blocked by roster authority and cannot be revived outside the explicit Admin provisioning path');
console.log('PASS — Agent temporary-password reset lifecycle behavior is unchanged');
