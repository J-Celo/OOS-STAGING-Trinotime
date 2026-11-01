/* Synthetic production-source regression: no backend requests or writes. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=file=>fs.readFileSync(new URL(file,import.meta.url),'utf8');
const worker=read('../src/worker.js');
const manager=read('../public/assets/js/j-store-plan-manager-phase1.js');
const exportsUI=read('../public/assets/js/j-staging-store-export-sync-v1.js');
const css=read('../public/assets/css/c-staging-store-operations-hub-v1.css');
const page=read('../public/index.html');
assert.match(worker,/if\(route==='\/directory'&&request.method==='GET'\)/);
assert.match(manager,/request\(state,'directory\?date='/);
assert(!manager.includes("request(state,'agents?date='"),'No duplicate browser roster read');
assert(!manager.includes("request(state,'pods?date='"),'No duplicate browser roster read');
assert(manager.includes('previouslySelectedPod=currentPod(state)'),'Refresh preserves the previous verified selection');
assert(manager.includes('state.pods.some(v=>v.pod===id)'),'Restored selection must match exact verified ID');
assert(manager.includes('data-store-plan-verify-status'),'Verification status is visible next to selector');
assert(exportsUI.includes('synchronizeToWorkControl(panel)')&&exportsUI.includes('synchronizeFromWorkControl(panel)'),'Export and Work Control use one synchronized POD selection');
assert(exportsUI.includes("adminPODs.get(panel)?.includes(selected)"),'Export selection must be verified');
assert(page.includes('production-admin-uid-identity-hotfix-20261022'),'Updated production assets get new cache keys');
assert(css.includes('body.dark-mode .tt-so-hub .tt-sp-current'),'Dark mode uses scoped card styling');
assert(css.includes('body.dark-mode .tt-so-hub :is(h2,h3,h4'),'Dark headings have explicit light contrast');
// Exercise actual server directory code with a synthetic authorized roster.
const start=worker.indexOf("  if(route==='/directory'&&request.method==='GET'){");
const end=worker.indexOf("\n  if(route==='/agents'&&request.method==='GET'){",start);
assert(start>0&&end>start,'directory handler located');
let calls=0;
const members=[
 {role:'agent',active:true,pod:'pod0_oos',podLabel:'POD 0',name:'Agent A'},
 {role:'agent',active:true,pod:'pod0_oos',podLabel:'POD 0',name:'Agent B'},
 {role:'agent',active:true,pod:'pod0_other',podLabel:'POD 0',name:'Agent C'},
 {role:'team_leader',active:true,pod:'pod0_oos',podLabel:'POD 0',name:'TL OOS'},
 {role:'team_leader',active:true,pod:'pod0_other',podLabel:'POD 0',name:'TL Other'},
 {role:'agent',active:false,pod:'pod0_other',podLabel:'POD 0',name:'Disabled Agent'}
];
const ctx=vm.createContext({
 calls:0,members,
 request:{method:'GET'},route:'/directory',date:'10/22/2026',env:{},
 actor:{role:'admin',name:'Administrator',pod:''},
 storePlanManagerServer:async (_request,_env)=>ctx.actor,
 canonicalWorkforceAuthorizationRosterServer:async (_env,options)=>{assert.equal(options.force,true);ctx.calls++;return {entries:Object.fromEntries(members.map((m,i)=>[i,m]))};},
 canManageStorePlan:(actor,target)=>target.active!==false&&target.role==='agent'&&(actor.role==='admin'||actor.pod===target.pod),
 normalizePersonName:name=>String(name).trim(),
 json:body=>body,
 fail:(_status,code)=>{throw Error(code)}
});
vm.runInContext(`globalThis.directory=async()=>{const actor=await storePlanManagerServer(request,env);${worker.slice(start,end)};}`,ctx);
const admin=await ctx.directory();
assert.equal(ctx.calls,1,'Single roster read for agents AND pods');
assert.equal(admin.agents.length,3,'Only active agents');
assert.equal(admin.pods.length,2,'Two different POD IDs with the same public name are both preserved');
assert.equal(admin.pods.find(p=>p.pod==='pod0_oos').teamLeader,'TL OOS');
assert.equal(admin.pods.find(p=>p.pod==='pod0_other').agentsCount,1);
ctx.actor={role:'team_leader',name:'TL OOS',pod:'pod0_oos'};
const tl=await ctx.directory();
assert.equal(tl.pods.length,1,'TL never receives another POD');
assert.equal(tl.agents.length,2,'TL agent list stays isolated');
// Test real label generators without changing identity keys.
const begin=manager.indexOf(' const storeLabel=entry=>'),stop=manager.indexOf(' function refreshPodStorePerformance',begin);
assert(begin>0&&stop>begin);
const labels=vm.createContext({norm:x=>String(x).trim().toLowerCase()});
vm.runInContext(manager.slice(begin,stop)+'\nglobalThis.getOptions=podOptions;',labels);
const list=labels.getOptions(admin.pods);
assert.equal(list.length,2);
assert.notEqual(list[0].text,list[1].text,'Duplicate public labels are disambiguated');
assert(list.every(x=>x.text.includes('POD 0')));
assert.equal(new Set(list.map(x=>x.value)).size,2,'Never merge canonical IDs');
const expStart=exportsUI.indexOf(' function readablePodOptions('),expEnd=exportsUI.indexOf(' function synchronizeToWorkControl',expStart);
const exp=vm.createContext({normalize:x=>String(x).toLowerCase(),publicPodName:x=>String(x)});
vm.runInContext(exportsUI.slice(expStart,expEnd)+'\nglobalThis.getOptions=readablePodOptions;',exp);
const expo=exp.getOptions(admin.pods);
assert.equal(expo.length,2);
assert.notEqual(expo[0].text,expo[1].text);
assert.equal(new Set(expo.map(x=>x.value)).size,2);
console.log('PASS production POD verification/dark UX: one canonical roster read, no writes, TL isolation, distinct duplicate POD keys, mirrored selectors, versioned assets, readable dark mode.');
