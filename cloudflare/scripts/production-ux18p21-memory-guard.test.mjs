// Synthetic-only test of the real Worker memory guard. No live network or data.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {ReadableStream} from 'node:stream/web';
const source=fs.readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
const code=source.replace(/^import[\s\S]*?from ['"][^'"]+['"];\s*/gm,'').replace('export class ChatRealtimeHub','class ChatRealtimeHub').replace('export default {','const workerEntry = {');
const c={console,TextEncoder,TextDecoder,URL,Request,Response,Headers,crypto:webcrypto,atob,btoa,setTimeout,clearTimeout,structuredClone,ReadableStream};
vm.createContext(c);
// Test the actual helper code in isolation; no Worker startup side effects.
const segment=code.slice(code.indexOf('const IDENTITY_RENAME_ROOT_MAX_BYTES ='),code.indexOf('async function firebaseAdminSet(env, path, value)'));
// Avoid unrelated code / variables: evaluate just the isolated bounded helper.
const start=segment.indexOf('const IDENTITY_RENAME_ROOT_MAX_BYTES =');
const end=segment.indexOf('async function firebaseAdminGetWithEtag');
// In source, helper is after firebaseAdminGet(), so take its exact helper body up to firebaseAdminGetWithEtag.
const helperStart=code.indexOf('const IDENTITY_RENAME_ROOT_MAX_BYTES =');
const helperEnd=code.indexOf('async function firebaseAdminGetWithEtag',helperStart);
assert.ok(helperStart>0 && helperEnd>helperStart);
c.fail=(status,code,message)=>{throw Object.assign(new Error(message),{status,code});};
vm.runInContext(code.slice(helperStart,helperEnd),c);
async function test(name,fn){await fn();console.log('PASS',name);}
const limited=(response,n)=>vm.runInContext('readBoundedFirebaseJsonServer',c)(response,n);
await test('allows small valid JSON without changing values',async()=>{
 const r=new Response(JSON.stringify({ok:true,items:[1,2,3]}),{headers:{'content-type':'application/json'}});
 const value=await limited(r,2048);assert.equal(value.ok,true);assert.equal(value.items.length,3);
});
await test('rejects oversized Content-Length before consuming',async()=>{
 let cancelled=false,read=false;
 const fake={headers:new Headers({'content-length':'9999999'}),body:{cancel:async()=>{cancelled=true;},getReader(){read=true;}}};
 await assert.rejects(limited(fake,1024),e=>e.status===413&&e.code==='IDENTITY_PARTITIONED_MIGRATION_REQUIRED');
 assert.equal(cancelled,true);assert.equal(read,false);
});
await test('rejects unknown-length oversized streams and cancels them',async()=>{
 let cancelCount=0;
 const rs=new ReadableStream({start(ctrl){ctrl.enqueue(new Uint8Array(700));ctrl.enqueue(new Uint8Array(700));},cancel(){cancelCount++;}});
 const fake={headers:new Headers(),body:rs};
 await assert.rejects(limited(fake,1024),e=>e.status===413&&e.code==='IDENTITY_PARTITIONED_MIGRATION_REQUIRED');
 assert.equal(cancelCount,1);
});
await test('invalid short JSON cannot be committed',async()=>{
 await assert.rejects(limited(new Response('{bad'),1024),e=>e.code==='IDENTITY_ROOT_INVALID_JSON');
});
await test('root CAS uses no-echo Firebase option and treats 412 as a conflict',async()=>{
 const marker='async function firebaseAdminSetIfMatch';
 const first=code.indexOf(marker);const last=code.indexOf('function normalizePremiumExpiryServer',first);
 vm.runInContext(code.slice(first,last),c);
 let seen=[];
 c.getGoogleAccessToken=async()=> 'synthetic-access-token';
 c.fetch=async(url,options)=>{seen.push({url,method:options.method,match:options.headers['if-match']});return new Response(null,{status:204});};
 let committed=await vm.runInContext('firebaseAdminSetIfMatch',c)({FIREBASE_DATABASE_URL:'https://synthetic.invalid'},'',{small:'test'},'etag-a');
 assert.equal(committed.committed,true);assert.equal(seen[0].url,'https://synthetic.invalid/.json?print=silent');assert.equal(seen[0].match,'etag-a');
 c.fetch=async()=>new Response(JSON.stringify({ignored:'root'}),{status:412});
 const raced=await vm.runInContext('firebaseAdminSetIfMatch',c)({FIREBASE_DATABASE_URL:'https://synthetic.invalid'},'',{small:'test'},'etag-b');
 assert.equal(raced.preconditionFailed,true);assert.equal(raced.committed,false);
});
console.log('5/5 UX18P21 memory safety tests passed');
