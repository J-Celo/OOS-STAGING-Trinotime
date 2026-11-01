/* Focused offline safeguard for five Store Operations tabs and export date status.
   Synthetic only. Never contacts Firebase, Cloudflare, or Augmoto. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const read = path=>fs.readFileSync(fileURLToPath(new URL(path,import.meta.url)),'utf8');
const css=read('../public/assets/css/c-staging-store-operations-hub-v1.css');
const hub=read('../public/assets/js/j-staging-store-operations-hub-v1.js');
const intelligence=read('../public/assets/js/j-store-intelligence-m2934-rc2-ui3-c3e0e3e8c587.js');
const worker=read('../src/worker.js');
assert(css.includes('.tt-so-hub[data-tt-store-hub-tab="performance"] > .tt-ops-shell > [data-tt-store-panel]'));
assert(css.includes('.tt-so-hub[data-tt-store-hub-tab="history"] > .tt-ops-shell > [data-tt-store-panel]'));
assert(!css.includes('.tt-so-hub[data-tt-store-hub-tab="performance"] [data-tt-store-panel]'));
assert(!css.includes('.tt-so-hub[data-tt-store-hub-tab="history"] [data-tt-store-panel]'));
assert(hub.includes("['overview','Overview']")&&hub.includes("['work','Work Control']")&&hub.includes("['queue','Store Queue']")&&hub.includes("['performance','Performance']")&&hub.includes("['history','History']"));
assert(hub.includes("id === 'history' ? '7d' : 'day'"));
assert(hub.includes("[data-tt-store-refresh]')?.click()"));
assert(intelligence.includes("/api/workforce/${apiWorkflow}/stores?")&&intelligence.includes('data.scope!==s.scope'));
assert(intelligence.includes("const key=[d.date,d.viewer.role,d.viewer.name"));
assert(intelligence.includes('period===\'7d\''));
assert(worker.includes("if(pod&&role!=='admin')fail(403,'STORE_INTEL_POD_FILTER_FORBIDDEN'"));
const iso=worker.match(/function storeOpsTodayIsoServer\(\)\{[\s\S]*?\n\}/)?.[0];
const start=worker.indexOf('async function handleStoreOpsExportApi(');
const end=worker.indexOf('async function scheduledStoreSheetsSync(',start);
assert(iso&&start>0&&end>start);
const api=worker.slice(start,end);
assert(api.indexOf("if(route==='/status'")<api.indexOf('const date=coverageDateKeyServer('),'Status must not require report date validation');
const calls=[];
const test=vm.createContext({
 URL,Request,Response,console,
 manilaDateKeyServer:()=> '10/18/2026',
 fail:(_code,_kind,message)=>{throw Error(message)},
 coverageDateKeyServer:date=>{assert.match(date,/^\d{4}-\d{2}-\d{2}$/);return date;},
 storePlanManagerServer:async()=>({role:'team_leader',name:'Sample TL',pod:'test-pod',uid:'fake'}),
 storePlanPodTargetServer:async(_env,_actor,pod)=>({pod,podLabel:'Sample POD'}),
 googleConfigured:()=>false,
 json:value=>value,
 storeOpsSnapshotServer:async(_req,_env,pod,date,period)=>{calls.push({pod,date,period});return {ok:true,authority:'workforce-store-ops-export-v1'};},
 storeOpsSyncSheetServer:async()=>{throw Error('must remain disabled')},
});
vm.runInContext(iso+'\n'+api+'\nglobalThis.handler=handleStoreOpsExportApi;',test);
const input=(path,method='GET')=>({method,url:new URL('https://staging.invalid/api/workforce/store-exports'+path)});
const status=input('/status?pod=test-pod');
// Status must be read-only even without date and without a Google Sheet connection.
const s=await test.handler({method:'GET'}, {}, status.url);
assert.equal(s.ok,true);assert.equal(s.configured,false);
assert.equal(calls.length,0);
const snap=input('/snapshot?pod=test-pod');
await test.handler({method:'GET'}, {}, snap.url);
assert.equal(calls[0].date,'2026-10-18');assert.equal(calls[0].period,'7d');
await assert.rejects(test.handler({method:'POST'}, {}, new URL('https://staging.invalid/api/workforce/store-exports/sync-now?pod=test-pod')));
assert.equal(calls.length,1,'Google Sheets disabled: no write path can run');
console.log('PASS — five-tab display selectors, POD-scoped report wiring, seven-day selection, read-only Google status, ISO report dates, sync still disabled.');
