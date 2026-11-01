import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const source=read('src/worker.js');
const coverage=read('public/assets/js/j-coverage-dashboard-rc20.js');
const confirmation=read('public/assets/js/j-confirmation-dashboard-rc21.js');
const html=read('public/index.html');
const start=source.indexOf('async function trackerLiveReportDateForDashboardServer(');
const end=source.indexOf('async function coverageDashboardServer(', start);
assert(start>0&&end>start, 'trusted Agent overnight-shift presentation helper');
let current={status:'active',name:'Inosuke Hashibira',pod:'legacy-pod-label',sessionId:'test-shift',reportDate:'2026-10-08'};
const ctx={
 credentialRole:v=>v,
 coverageActorKeyServer:(_,name)=>name.toLowerCase(),
 firebaseAdminGet:async(_,key)=>key==='workforceTrackerShift/v1/current/inosuke hashibira'?current:null,
 WORKFORCE_TRACKER_SHIFT_CURRENT_PATH:'workforceTrackerShift/v1/current',
 normalizePersonName:v=>String(v||'').trim(),
 cleanText:(v,max)=>String(v||'').slice(0,max),
 manilaDateKeyServer:()=> '2026-10-09',
 trackerShiftResolveForActorServer:async()=>null,
 Date, Math, String, Number,
};
vm.runInNewContext(source.slice(start,end)+'\nglobalThis.liveDateTest=trackerLiveReportDateForDashboardServer;',ctx);
const actor={role:'agent',name:'Inosuke Hashibira',pod:'pod1',rosterMember:{pod:'pod1'}};
assert.equal(await ctx.liveDateTest(null,actor),'2026-10-08','overnight shift uses the original shift report date');
assert.equal(await ctx.liveDateTest(null,{...actor,role:'team_leader'}),'','TL not exposed Agent shift metadata');
assert.equal(await ctx.liveDateTest(null,{...actor,role:'admin'}),'','Admin not exposed Agent shift metadata');
assert.equal(await ctx.liveDateTest(null,{...actor,name:'Tanjiro Kamado'}),'','cross-Agent shift metadata denied');
assert.equal(await ctx.liveDateTest(null,{...actor,pod:'pod2'}),'','authenticated roster mismatch denies shift metadata');
current={...current,status:'completed'};
assert.equal(await ctx.liveDateTest(null,actor),'','completed shift not marked live');
current={...current,status:'active',reportDate:'2026-10-01'};
assert.equal(await ctx.liveDateTest(null,actor),'','stale dates outside limited reporting window ignored');
assert(source.includes("date, requestedDate, dateSource, activeShiftReportDate, generatedAtMs:Date.now()"),'Coverage and Confirmation advertise authorized active shift date');
assert(coverage.includes('state.followShift=true')&&coverage.includes('state.followShift=false'),'Coverage automated date selection honors manual choices');
assert(coverage.includes('state.date=dashboard.date')&&coverage.includes('liveShiftSelected()'),'Coverage follows active shift and updates status badge');
assert(coverage.includes("state.date===phtDate()||liveShiftSelected()"),'Live polling continues overnight');
assert(confirmation.includes('date=d.date')&&confirmation.includes('followShift=false'),'Confirmation follows active shift and honors date choices');
assert(html.includes('overnight-shift-m2949=1'),'Updated Coverage/Confirmation scripts cache-busted');
console.log('PASS M2.9.48: overnight Oct 8 shift visible on Oct 9, private Agent/POD metadata, manual date preserved, active polling enabled, no ingest changes.');
