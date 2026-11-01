// Offline generator only. Never deploys, authenticates, or changes records.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
export function prepareIdentityRules(before){
  assert.equal(before?.rules?.['.read'],false,'Root reads must already be denied.');
  assert.equal(before?.rules?.['.write'],false,'Root writes must already be denied.');
  for(const key of ['kv','secureCredentials','workforceRoster','workforceAttendance'])assert(before.rules[key],`Missing expected staging rules node: ${key}`);
  const after=structuredClone(before);
  for(const key of ['kv','serverTimeAudit','workforceIdentity'])after.rules[key]={'.read':false,'.write':false};
  for(const key of Object.keys(before.rules))if(!['kv','serverTimeAudit','workforceIdentity'].includes(key))assert.deepEqual(after.rules[key],before.rules[key]);
  return after;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [input,output]=process.argv.slice(2);
  assert(input&&output,'Usage: node prepare-identity-staging-rules.mjs <verified-current-staging-export.json> <new-output.json>');
  assert.notEqual(path.resolve(input),path.resolve(output),'Never overwrite the export');
  const raw=fs.readFileSync(input,'utf8'),after=prepareIdentityRules(JSON.parse(raw));
  fs.writeFileSync(output,JSON.stringify(after,null,2)+'\n',{flag:'wx'});
  console.log('Prepared locally; NOT PUBLISHED. Source SHA256:',createHash('sha256').update(raw).digest('hex'));
}
