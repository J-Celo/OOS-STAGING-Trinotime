// Production Google Sheets pilot adapter. No data writes are possible by default.
// This module intentionally does not create Store Queue/Dispatch records.
// RC2 Store Operations export subset: authorized POD list, status and Excel snapshot.
// Manual Google Sheets writes are disabled unless explicitly approved in
// server-side environment configuration. No automatic production Cron is wired.
// Production pilot is limited to OOS POD 11 and uses the existing server roster.
const PILOT_POD='POD 11';
function canManageStorePlan(actor,member){
  return !!actor && member?.role==='agent' && member?.active!==false &&
    member?.pod===PILOT_POD &&
    (actor.role==='admin'||(actor.role==='team_leader'&&actor.pod===PILOT_POD));
}
import {podSheetEnabled,podSheetUrl,writePodSheet} from './rc2-google-sheets-pod.js';
export function createRc2StoreExportsApi(deps) {
  const {requireWorkforceAttendanceActor,canonicalWorkforceMemberServer,
    canonicalWorkforceAuthorizationRosterServer,fbEncodeKeyServer,
    firebaseAdminGet,firebaseAdminSet,storeIntelReportServer,coverageDateKeyServer,
    manilaDateKeyServer,parseBody,enforceRate,fail,json}=deps;
  const planRoot='workforceStorePlans/v1/podDates';
  const dispatchRoot='workforceStorePlans/v1/podDispatch';
  async function manager(request,env) {
    const actor=await requireWorkforceAttendanceActor(request,env);
    if(!['admin','team_leader'].includes(actor.role))
      fail(403,'STORE_PLAN_MANAGER_REQUIRED','An authorized supervisor is required.');
    if(actor.role==='team_leader') {
      if(actor.pod!==PILOT_POD)
        fail(403,'PRODUCTION_PILOT_POD_SCOPE','Only the OOS POD 11 Team Leader may use this pilot.');
      const current=await canonicalWorkforceMemberServer(env,'team_leader',actor.name,{force:true});
      if(!current || current.role!=='team_leader' || current.active===false ||
         !actor.pod || String(current.pod)!==String(actor.pod))
        fail(403,'STORE_PLAN_MANAGER_POD_CHANGED','Your Team Leader role or POD assignment has changed.');
    }
    return actor;
  }
  async function listPods(env,actor) {
    const roster=await canonicalWorkforceAuthorizationRosterServer(env,{force:true});
    const pods=new Map();
    for(const member of Object.values(roster.entries||{})){
      if(!canManageStorePlan(actor,member))continue;
      const pod=String(member.pod||'').trim();
      if(!pod||pod.length>120)continue;
      const item=pods.get(pod)||{pod,podLabel:String(member.podLabel||pod),agentsCount:0};
      item.agentsCount++;pods.set(pod,item);
    }
    return [...pods.values()].sort((a,b)=>a.podLabel.localeCompare(b.podLabel)||a.pod.localeCompare(b.pod));
  }
  async function targetPod(env,actor,value){
    const pod=String(value||'').trim();
    if(!pod||pod.length>120)fail(400,'STORE_PLAN_POD_REQUIRED','Choose a valid POD.');
    const target=(await listPods(env,actor)).find(p=>p.pod===pod);
    if(!target)fail(403,'STORE_PLAN_POD_SCOPE_FORBIDDEN','POD is outside your authorized scope.');
    return target;
  }
  const queueView=(rec,target,date)=>{
    const valid=rec?.schemaVersion===1&&String(rec.pod)===String(target.pod)&&
      (!rec.scope||rec.scope==='pod')&&!rec.agentName;
    const assigned=valid&&rec.active===true&&Array.isArray(rec.entries)&&rec.entries.length>0;
    return {ok:true,authority:'workforce-store-plans-v1',date,pod:target.pod,
      podLabel:target.podLabel,agentsCount:target.agentsCount,
      revision:valid?Number(rec.revision)||0:0,entries:assigned?rec.entries:[],
      updatedAt:assigned?rec.updatedAt||null:null,
      updatedBy:assigned?rec.updatedByName||null:null,assigned,source:assigned?'pod':'none'};
  };
  const dispatchView=(rec,pod)=>{
    const valid=rec?.schemaVersion===1&&String(rec.pod)===String(pod)&&
      ['coverage','confirmation','standby'].includes(rec.workflow)&&Number.isSafeInteger(rec.revision);
    const active=Boolean(valid&&rec.workflow!=='standby'&&String(rec.store||'').trim()&&
      Number(rec.expiresAtMs||0)>Date.now());
    return {ok:true,authority:'workforce-store-plans-v1',kind:'pod-dispatch',pod,
      revision:valid?rec.revision:0,active,workflow:active?rec.workflow:'standby',
      store:active?rec.store:'',updatedAt:valid?rec.updatedAt||null:null,
      updatedBy:valid?rec.updatedByName||null:null,
      expiresAt:active?new Date(rec.expiresAtMs).toISOString():null,
      expired:Boolean(valid&&rec.workflow!=='standby'&&!active),
      history:valid&&Array.isArray(rec.history)?rec.history.slice(-15):[]};
  };
  return async function handleExports(request,env,url){
    if(request.method==='OPTIONS')return new Response(null,{status:204});
    const route=url.pathname.slice('/api/workforce/store-exports'.length)||'/';
    if(!['GET','POST'].includes(request.method))
      fail(405,'STORE_EXPORT_METHOD','Unsupported export method.');
    const actor=await manager(request,env);
    // FIRST PRODUCTION RELEASE: read-only by construction, regardless of env flags.
    // A separately reviewed release is required to introduce ANY Google write.
    if(route==='/sync-now')
      fail(409,'PRODUCTION_POD11_SYNC_HOLD','This production release is read-only; Google Sheets synchronization is disabled.');
    // Manual writes require a separate production release approval, not a request field.
    if(route==='/sync-now' && (actor.role!=='admin' || env.DEPLOYMENT_ENV!=='production' ||
        env.TT_PRODUCTION_POD11_RELEASE_APPROVED!=='approved'))
      fail(409,'PRODUCTION_POD11_SYNC_HOLD','Production POD 11 sync is on hold pending approval.');
    if(route==='/pods'&&request.method==='GET') {
      const pods=await listPods(env,actor);
      return json({ok:true,authority:'workforce-store-ops-export-v1',
        viewer:{role:actor.role,name:actor.name,uid:String(actor.uid||'')},
        pods:pods.map(p=>({pod:p.pod,podLabel:p.podLabel,agentsCount:p.agentsCount}))},
        200,{'Cache-Control':'no-store'});
    }
    // No Cron or automatic production writes are wired. Manual sync is explicit.
    // Remains fully inert in production until an explicit server-only opt-in.
    if(route==='/sync-now'&&env.TT_GOOGLE_SHEETS_MANUAL_SYNC_ENABLED!=='approved')
      fail(409,'STORE_SHEET_UNCONFIGURED','Google Sheet sync is disabled pending approval.');
    const payload=route==='/sync-now'&&request.method==='POST'?await parseBody(request):null;
    const target=await targetPod(env,actor,payload?.pod||url.searchParams.get('pod'));
    if(target.pod!==PILOT_POD)fail(403,'PRODUCTION_PILOT_POD_SCOPE','Only OOS POD 11 is authorized.');
    const date=coverageDateKeyServer(payload?.date||url.searchParams.get('date')||manilaDateKeyServer());
    const period=route==='/sync-now'?'7d':String(url.searchParams.get('period')||'7d');
    if(!['day','7d'].includes(period))
      fail(400,'STORE_EXPORT_PERIOD','Choose day or 7d.');
    if(route==='/status'&&request.method==='GET') {
      const configured=podSheetEnabled(env,target.pod);
      // The private Sheet link is a separate read-only navigation feature:
      // manual write approval must never be required just to reveal the mapped
      // sheet to an already server-authorized POD 11 Admin/TL viewer.
      const spreadsheetUrl=podSheetUrl(env,target.pod);
      const status=await firebaseAdminGet(env,
        'workforceStoreSheetSync/v1/status/'+fbEncodeKeyServer('pod:'+target.pod));
      return json({ok:true,authority:'workforce-store-ops-export-v1',pod:target.pod,
        configured,mapped:Boolean(spreadsheetUrl),spreadsheetUrl,
        lastSyncedAt:status?.lastSyncedAt||null,lastErrorAt:status?.lastErrorAt||null,
        cadence:'manual only; scheduled sync requires separate approval',
        mode:'TrinoTime to Google Sheets only'},200,{'Cache-Control':'no-store'});
    }
    if((route==='/snapshot'&&request.method==='GET')||
       (route==='/sync-now'&&request.method==='POST')) {
      const isSync=route==='/sync-now';
      if(isSync&&!podSheetEnabled(env,target.pod))
        fail(409,'STORE_SHEET_UNCONFIGURED','Google Sheet sync is disabled or not approved for this POD.');
      if(isSync)enforceRate(String(actor.uid||actor.name)+':'+target.pod,
        'store-sheet-manual-sync',2,5*60*1000);
      const intelUrl=new URL('/api/workforce/metrics/stores',request.url);
      intelUrl.searchParams.set('date',date);
      intelUrl.searchParams.set('period',period);
      if(actor.role==='admin')intelUrl.searchParams.set('pod',target.pod);
      const podKey=fbEncodeKeyServer('pod:'+target.pod);
      const [report,queue,dispatch]=await Promise.all([
        storeIntelReportServer(request,env,intelUrl,'metrics'),
        firebaseAdminGet(env,`${planRoot}/${date}/${podKey}`),
        firebaseAdminGet(env,`${dispatchRoot}/${podKey}`)
      ]);
      // Reject a mismatched aggregate selector or any cross-team job row.
      if((actor.role==='admin' && report.selectedPod!==undefined && report.selectedPod!==target.pod) ||
         (actor.role==='team_leader' && report.viewer?.pod!==undefined && report.viewer.pod!==target.pod) ||
         (report.jobs||[]).some(j=>j.pod!==target.pod))
        fail(409,'STORE_SHEET_SCOPE_MISMATCH','Cross-POD job data detected. Export cancelled.');
      const snapshot={ok:true,authority:'workforce-store-ops-export-v1',pod:target.pod,
        podLabel:target.podLabel,date,period,generatedAt:new Date().toISOString(),
        viewer:{role:actor.role,name:actor.name,pod:actor.pod,uid:String(actor.uid||'')},
        queue:queueView(queue,target,date),dispatch:dispatchView(dispatch,target.pod),
        performance:report};
      if(!isSync)return json(snapshot,200,{'Cache-Control':'no-store'});
      const statusPath='workforceStoreSheetSync/v1/status/'+fbEncodeKeyServer('pod:'+target.pod);
      let synced;
      try {
        synced=await (deps.writePodSheet||writePodSheet)(env,target.pod,snapshot);
      } catch(error) {
        // Preserve last confirmed successful timestamp, never mark failure as success.
        try {
          const previous=await firebaseAdminGet(env,statusPath);
          await firebaseAdminSet(env,statusPath,{
            ...(previous&&typeof previous==='object'?previous:{}),
            schemaVersion:1,pod:target.pod,lastErrorAt:new Date().toISOString(),
            lastErrorCode:'SHEETS_SYNC_FAILED'
          });
        } catch {}
        fail(502,'STORE_SHEET_SYNC_FAILED','Spreadsheet synchronization failed; retry later.');
      }
      await firebaseAdminSet(env,statusPath,{
        schemaVersion:1,pod:target.pod,lastSyncedAt:synced.syncedAt,
        lastErrorAt:null,rows:synced.rows,period,date});
      return json({ok:true,authority:'workforce-store-ops-export-v1',
        pod:target.pod,lastSyncedAt:synced.syncedAt,
        spreadsheetUrl:podSheetUrl(env,target.pod),rows:synced.rows},
        200,{'Cache-Control':'no-store'});
    }
    fail(404,'STORE_EXPORT_NOT_FOUND','Store export route not found.');
  };
}
