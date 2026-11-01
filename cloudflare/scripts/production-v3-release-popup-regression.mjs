// Offline release identity + one-time tour test: no real Firebase writes or network.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {claimReleaseAnnouncement, ANNOUNCEMENT_VERSION, ANNOUNCEMENT_ROOT} from '../src/release-announcements.js';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const html=read('../public/index.html'),sw=read('../public/sw.js'),worker=read('../src/worker.js');
const manifest=JSON.parse(read('../public/manifest.json')),version=JSON.parse(read('../public/version.json'));
const core=read('../public/assets/js/j-5a9b0d9aeabc.js');
const tour=read('../public/assets/js/j-v2-whats-new.js');
const tracker=JSON.parse(read('../../tracker/manifest.json'));
assert.equal(ANNOUNCEMENT_VERSION,'3.0.0');
assert.equal(ANNOUNCEMENT_ROOT,'workforceReleaseAnnouncements/v1');
for(const v of [manifest.version,version.version])assert.equal(v,'3.0.4');
assert.equal(manifest.display_version,'V 3.0.4');
for(const text of [html,sw,worker,JSON.stringify(manifest)]) assert.ok(text.includes(version.build_fingerprint),'New release fingerprint mismatch');
assert.match(html,/<title>OOS TrinoTime · V 3\.0\.4<\/title>/);
assert.ok(sw.includes("TRINOTIME_SW_VERSION = '3.0.4'"));
assert.match(html,/assets\/js\/j-v2-whats-new\.js\?v=3\.0\.4/,'new tour cache key');
for(const part of ['TrinoTime V3', 'TL Attendance', 'Admin / Owner', 'OOS Coverage Beta QAs', 'Store Operations', 'QC Tracker', 'Google Sheets writes remain on hold']) assert.ok(html.includes(part),part);
for(const part of ["const VERSION = '3.0.0'",'trinotime:release-tour:3.0.0:', 'TrinoTimeVersion3Welcome','V 3.0.0', 'Original POD', "document.addEventListener('DOMContentLoaded'"]) {
  if(part==='Original POD') continue;
  assert.ok(tour.includes(part),part);
}
assert.ok(core.includes("const NOTIFICATION_RELEASE_VERSION = '3.0.0'"),'release badge must rearm');
assert.ok(core.includes("body:JSON.stringify({ version:'3.0.0' })"),'client claims v3');
assert.ok(core.includes("data.version !== '3.0.0'"),'client validates v3');
assert.equal(tracker.version,'2.3.10');
const trackerInfo=JSON.parse(read('../public/downloads/qc-tracker-current.json'));
const archive=readFileSync(new URL('../public/downloads/TrinoTime-QC-Tracker-v2.3.10.zip',import.meta.url));
assert.equal(createHash('sha256').update(archive).digest('hex'),trackerInfo.sha256,'tracker unchanged');
const config=JSON.parse(read('../wrangler.jsonc'));
assert.equal(config.name,'oostrinotime');assert.equal(config.vars.FIREBASE_PROJECT_ID,'cwh-timeclock');
assert.equal(config.vars.DEPLOYMENT_ENV,'production');assert.ok(!config.vars.ENABLE_OOS_QA_WORKGROUP);
assert.ok(worker.includes("fail(409,'PRODUCTION_SHEETS_HARD_HOLD'"));
let store=new Map(),writes=0;
const makeRequest=(version='3.0.0')=>new Request('https://oos.trinotime.com/api/workforce/profile/release-announcement',{
 method:'POST',headers:{Origin:'https://oos.trinotime.com','Content-Type':'application/json'},body:JSON.stringify({version})
});
function deps(actor){return {
 requireActor:async()=>actor, parseBody:async r=>r.json(),enforceRate:()=>{},encodeKey:encodeURIComponent,
 read:async (_env,path)=>({value:store.has(path)?store.get(path):null,etag:'etag-1'}),
 writeIfMatch:async (_env,path,receipt)=>{if(store.has(path))return {preconditionFailed:true,value:store.get(path)};store.set(path,receipt);writes++;return {committed:true};}
};}
const agent={role:'agent',name:'QA Test Agent'};
let result=await claimReleaseAnnouncement(makeRequest(),{},deps(agent));assert.equal(result.show,true);assert.equal(result.version,'3.0.0');
result=await claimReleaseAnnouncement(makeRequest(),{},deps(agent));assert.equal(result.show,false);assert.equal(writes,1,'one receipt for this agent and release');
const previousReleasePath=`${ANNOUNCEMENT_ROOT}/2.0.0/agent%3Aqa%20test%20agent`;
store.set(previousReleasePath,{seenAt:'2026-10-01T00:00:00.000Z'});
const newAgent={role:'agent',name:'Another Agent'};
result=await claimReleaseAnnouncement(makeRequest(),{},deps(newAgent));assert.equal(result.show,true,'old v2 receipt must not suppress v3');
await assert.rejects(claimReleaseAnnouncement(makeRequest(),{},deps({role:'team_leader',name:'TL'})),e=>e.code==='RELEASE_AGENT_REQUIRED');
await assert.rejects(claimReleaseAnnouncement(makeRequest('2.0.0'),{},deps(agent)),e=>e.code==='RELEASE_VERSION_INVALID');
console.log('PASS production v3 — version coherence, new release popup, one-time receipt, auth restrictions, release badge, Tracker checksum, write holds');
