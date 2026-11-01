// Actual Durable Object methods against SQLite, using Node's built-in adapter.
// This does not emulate Cloudflare scheduling, sockets or service bindings.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {webcrypto} from 'node:crypto';
const source=fs.readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
const code=source.replace(/^import[\s\S]*?from ['"][^'"]+['"];\s*/gm,'').replace('export class ChatRealtimeHub','class ChatRealtimeHub').replace('export default {','const workerEntry = {');
const context={console,TextEncoder,TextDecoder,URL,Request,Response,Headers,crypto:webcrypto,atob,btoa,structuredClone,createRemoteJWKSet:()=>({})};
vm.createContext(context);vm.runInContext(code,context);
const prototype=vm.runInContext('ChatRealtimeHub.prototype',context);
const uid='legacy_agent_c3RhYmxlLTE';
function fixture(){
  const db=new DatabaseSync(':memory:');
  db.exec('CREATE TABLE chat_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE chat_conversations(conversation_id TEXT PRIMARY KEY,data TEXT,last_message_at INTEGER,updated_at INTEGER); CREATE TABLE evidence(id TEXT PRIMARY KEY,data TEXT);');
  const original=[{conversationId:'dm-one',type:'direct',memberIds:[uid,'other-1'],memberNames:{[uid]:'Old Agent','other-1':'Other One'},title:'Old Agent',createdAt:'2026-10-10T00:00:00Z'},{conversationId:'dm-two',type:'direct',memberIds:[uid,'other-2'],memberNames:{[uid]:'Old Agent','other-2':'Other Two'},title:'Other Two',createdAt:'2026-10-10T00:00:00Z'},{conversationId:'unrelated',type:'direct',memberIds:['a','b'],memberNames:{a:'A',b:'B'},title:'B'}];
  for(const c of original)db.prepare('INSERT INTO chat_conversations VALUES(?,?,0,0)').run(c.conversationId,JSON.stringify(c));
  for(const kind of ['messages','replies','receipts','attachments','mentions','preferences'])db.prepare('INSERT INTO evidence VALUES(?,?)').run(kind,JSON.stringify({uid,kind,content:'Original historical data'}));
  let failure=0,updates=0;
  const hub=Object.create(prototype);
  hub.sql={exec(sql,...bindings){if(/INSERT INTO chat_conversations/.test(sql)){updates++;if(failure&&updates===failure)throw Error('synthetic SQL failure');}const statement=db.prepare(sql);if(/^\s*(SELECT|WITH|PRAGMA)/i.test(sql))return {toArray:()=>statement.all(...bindings)};statement.run(...bindings);return {toArray:()=>[]};}};
  hub.state={storage:{transactionSync(fn){db.exec('BEGIN');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}}};
  return {db,hub,original,fail:n=>{failure=n;updates=0;},read:id=>JSON.parse(db.prepare('SELECT data FROM chat_conversations WHERE conversation_id=?').get(id).data),evidence:()=>db.prepare('SELECT * FROM evidence ORDER BY id').all().map(r=>({...r})),receipt:()=>db.prepare('SELECT * FROM chat_meta').all()};
}
const body={operationId:'synthetic-rename-001',uid,oldName:'Old Agent',newName:'New Agent'};
let passed=0;
async function test(name,fn){const f=fixture();try{await fn(f);passed++;console.log('PASS',name);}finally{f.db.close();}}
await test('actual SQLite method updates references while preserving membership and history',f=>{const evidence=f.evidence();const r=f.hub._renameIdentityReferences(body);assert.equal(r.ok,true);assert.equal(r.updatedConversations,2);assert.equal(f.read('dm-one').memberNames[uid],'New Agent');assert.equal(f.read('dm-one').title,'New Agent');assert.equal(f.read('dm-two').title,'Other Two');assert.deepEqual(f.read('dm-one').memberIds,f.original[0].memberIds);assert.deepEqual(f.evidence(),evidence);assert.deepEqual(f.read('unrelated'),f.original[2]);});
await test('duplicate receipt is idempotent',f=>{f.hub._renameIdentityReferences(body);assert.equal(f.hub._renameIdentityReferences(body).alreadyCommitted,true);assert.equal(f.receipt().length,1);});
await test('receipt ID cannot be reused for another identity or name',f=>{f.hub._renameIdentityReferences(body);const r=f.hub._renameIdentityReferences({...body,newName:'Different Agent'});assert.equal(r.status,409);assert.equal(f.read('dm-one').memberNames[uid],'New Agent');});
await test('partial SQL failure rolls back all conversation updates and receipt',f=>{f.fail(2);assert.throws(()=>f.hub._renameIdentityReferences(body));for(const c of f.original)assert.deepEqual(f.read(c.conversationId),c);assert.equal(f.receipt().length,0);f.fail(0);assert.equal(f.hub._renameIdentityReferences(body).ok,true);});
await test('invalid stable UID is rejected without changing storage',f=>{assert.equal(f.hub._renameIdentityReferences({...body,uid:'forged'}).status,400);assert.equal(f.receipt().length,0);});
console.log(`${passed} actual SQLite identity projection tests passed; no external services.`);
