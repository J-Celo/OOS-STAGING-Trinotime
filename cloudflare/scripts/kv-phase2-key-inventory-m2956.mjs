#!/usr/bin/env node
// Offline-only optional key NAME audit: accepts a JSON array of Firebase /kv child key names.
// It never connects to Firebase, accepts no data values, and emits aggregate counts only.
import fs from 'node:fs';
import { summarizeFirebaseKvKeys } from './kv-phase2-helpers-m2956.mjs';
function fail(message) { console.error(`M2.9.56 key inventory: ${message}`); process.exitCode=1; }
const args=process.argv.slice(2);
if (args.length!==2 || args[0]!=='--local-keys-json') {
  console.log('Usage: node scripts/kv-phase2-key-inventory-m2956.mjs --local-keys-json PATH_TO_LOCAL_KEYS_ARRAY.json');
  console.log('The file must contain a JSON array of /kv child KEY NAMES only. Do not supply a database export, passwords, or key values.');
  process.exit(1);
}
try {
  const raw=fs.readFileSync(args[1],'utf8');
  if(Buffer.byteLength(raw,'utf8')>5_000_000) throw new Error('File exceeds 5 MB key-name-only limit');
  const keys=JSON.parse(raw);
  if(!Array.isArray(keys)) throw new Error('Input must be a JSON array of key NAMES only, not a database export');
  const summary=summarizeFirebaseKvKeys(keys);
  console.log(JSON.stringify(summary,null,2));
} catch(e){ fail(String(e?.message||e).replaceAll(/[^\x20-\x7e]/g,'?').slice(0,180)); }
