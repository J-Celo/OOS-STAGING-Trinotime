/* RC9: on-demand Admin modules and explicit, local-only performance capture.
   No telemetry, record payloads, identity strings, tokens or URLs are collected. */
(() => {
  'use strict';
  if (window.TrinoTimeRuntimeDiagnostics) return;
  const modules = new Map();
  let panel, output, status, captureButton, loadError;
  let capture = null, lastCapture = null, owner = '', lastOwner = '';
  let initialized = false, loading = null;
  const byId = id => document.getElementById(id);
  function adminActor() {
    try {
      const permissions = window.TrinoTimeCore?.permissions;
      const actor = permissions?.actor?.();
      return actor?.role === 'admin' && actor.authenticated && permissions.can('system.health.view') ? actor : null;
    } catch (_) { return null; }
  }
  function numeric(value) { const n=Number(value); return Number.isFinite(n) && n>=0 ? n : 0; }
  function snapshot() {
    const actor=adminActor();
    if(!actor)return null;
    const raw=window.TrinoTimeCore?.runtimeHealthSnapshot?.();
    if(!raw)return null;
    if(lastOwner && lastOwner!==String(actor.id||''))lastCapture=null;
    const assets=performance.getEntriesByType('resource').filter(entry => {
      try { const url=new URL(entry.name);return url.origin===location.origin && /\/assets\/js\//.test(url.pathname); } catch (_) { return false; }
    });
    // Whitelist fields. Never copy error messages, resource URLs or the full core.
    return {
      build:String(raw.build||''), sampledAt:new Date().toISOString(),
      connection:{online:!!raw.online,socketConnected:!!raw.socketConnected,workforceReadVerified:!!raw.workforceReadVerified,replayInProgress:!!raw.replayInProgress},
      lastHeartbeatAt:numeric(raw.lastHeartbeatAt), lastServerConfirmedWriteAt:numeric(raw.lastServerConfirmedWriteAt),
      lastAttendanceSnapshotAt:numeric(raw.lastAttendanceSnapshotAt),
      pending:{changes:numeric(raw.pending?.changes),punches:numeric(raw.pending?.punches)},
      subscriptions:{workspaceChild:numeric(raw.subscriptions?.workspaceChild),bootstrap:numeric(raw.subscriptions?.bootstrap),socket:numeric(raw.subscriptions?.socket),boundedReads:numeric(raw.subscriptions?.boundedReads),queuedRecords:numeric(raw.subscriptions?.queuedRecords)},
      retry:{reason:['authentication-blocked','app-check-blocked','access-denied','read-timeout','browser-offline','recovery-in-progress','connection-check-required','none'].includes(raw.retry?.reason)?raw.retry.reason:'connection-check-required',attempts:numeric(raw.retry?.attempts)},
      attendance:{snapshotRequests:numeric(raw.attendance?.snapshotRequests),snapshotJoins:numeric(raw.attendance?.snapshotJoins),lastSnapshotMs:raw.attendance?.lastSnapshotMs===null?null:numeric(raw.attendance?.lastSnapshotMs),tableRenders:numeric(raw.attendance?.tableRenders),hiddenTableSkips:numeric(raw.attendance?.hiddenTableSkips)},
      assets:{observedJavaScriptRequests:assets.length,observedTransferBytes:assets.reduce((n,e)=>n+numeric(e.transferSize),0)},
      modules:Array.from(modules,([name,item])=>({name,state:item.state})),
      performanceCapture:capture?{state:'recording'}:lastCapture
    };
  }
  function refreshPanel() {
    const allowed=!!adminActor();
    if(panel)panel.hidden=!allowed;
    if(!allowed){if(output)output.textContent='';return;}
    if(output && panel?.open && byId('settingsOverlay')?.classList.contains('open') && !document.hidden)output.textContent=JSON.stringify(snapshot(),null,2);
    if(captureButton)captureButton.disabled=!!capture;
  }
  const timedCoreNames = new Set(['renderTable','getFilteredRows','getAttendancePriorPeriodCarryoverForDashboard','renderTodayStatus','updateAdminUI','populateEmployeeSelects','getTlAdminOverviewSnapshot','refreshPunchCard','tickClock','getAdminReviewSnapshot']);
  function measureCoreWork(name, fn, receiver, args) {
    const active = capture;
    if (!active || !timedCoreNames.has(name)) return fn.apply(receiver, args);
    const started = performance.now();
    try { return fn.apply(receiver, args); }
    finally {
      if (capture === active) {
        const duration = Math.max(0, performance.now() - started);
        const item = active.coreWork[name] || (active.coreWork[name] = { calls:0, totalMs:0, maxMs:0 });
        item.calls++; item.totalMs += duration; item.maxMs = Math.max(item.maxMs, duration);
      }
    }
  }
  function stopCapture(discard=false) {
    if(!capture)return;
    const active=capture;capture=null;
    clearTimeout(active.timer);
    for(const observer of active.observers)observer.disconnect();
    const actor=adminActor();
    if(discard || !actor || String(actor.id||'')!==active.owner){lastCapture=null;lastOwner='';}
    else {
      lastOwner=active.owner;
      lastCapture={state:'complete',durationMs:Math.round(performance.now()-active.started),longTaskSupported:active.longTaskSupported,eventTimingSupported:active.eventTimingSupported,longTaskCount:active.longTaskCount,longTaskTotalMs:Math.round(active.longTaskTotalMs),longestTaskMs:Math.round(active.longestTaskMs),observedInteractionEventCount:active.interactionCount,maxObservedInteractionMs:Math.round(active.maxInteractionMs),coreWork:Object.entries(active.coreWork).map(([name,item])=>({name,calls:item.calls,totalMs:Math.round(item.totalMs),maxMs:Math.round(item.maxMs)})).sort((a,b)=>b.totalMs-a.totalMs)};
    }
    if(status)status.textContent=lastCapture?'Capture complete. Refresh or copy the snapshot.':'Capture cleared.';
    refreshPanel();
  }
  function startCapture() {
    const actor=adminActor();if(!actor||capture)return false;
    const active={owner:String(actor.id||''),started:performance.now(),observers:[],timer:null,longTaskSupported:false,eventTimingSupported:false,longTaskCount:0,longTaskTotalMs:0,longestTaskMs:0,interactionCount:0,maxInteractionMs:0,coreWork:Object.create(null)};
    capture=active;
    const supported=typeof PerformanceObserver==='function'?PerformanceObserver.supportedEntryTypes||[]:[];
    function observe(type,consume,options={}) {
      if(!supported.includes(type))return false;
      try {
        const observer=new PerformanceObserver(list=>{
          if(capture!==active || !adminActor() || String(adminActor().id||'')!==active.owner)return;
          for(const entry of list.getEntries())if(entry.startTime>=active.started)consume(entry);
        });
        observer.observe({type,buffered:false,...options});active.observers.push(observer);return true;
      } catch (_) { return false; }
    }
    active.longTaskSupported=observe('longtask',e=>{active.longTaskCount++;active.longTaskTotalMs+=e.duration;active.longestTaskMs=Math.max(active.longestTaskMs,e.duration);});
    active.eventTimingSupported=observe('event',e=>{if(e.interactionId){active.interactionCount++;active.maxInteractionMs=Math.max(active.maxInteractionMs,e.duration);}},{durationThreshold:16});
    active.timer=setTimeout(()=>stopCapture(),15000);
    if(status)status.textContent='Recording for 15 seconds. Close Settings, switch tabs and scroll, then return here.';
    refreshPanel();return true;
  }
  function ensurePanel() {
    if(panel)return;
    const host=byId('settingsPanelSync');if(!host)return;
    panel=document.createElement('details');panel.id='ttRuntimeDiagnostics';panel.className='production-diagnostics-details';panel.hidden=true;
    panel.innerHTML='<summary>Admin runtime health and performance</summary><p class="settings-hint">Read-only counters for this browser. Capture runs only when requested and stops after 15 seconds. It does not run the separate database write probe.</p><div class="sync-diagnostics-actions"><button type="button" class="modal-btn cancel" data-runtime-refresh>Refresh Snapshot</button><button type="button" class="modal-btn cancel" data-runtime-capture>Capture 15 Seconds</button><button type="button" class="modal-btn cancel" data-runtime-copy>Copy Safe Snapshot</button></div><p role="status" aria-live="polite" data-runtime-status>No capture running.</p><pre data-runtime-output style="white-space:pre-wrap;overflow-wrap:anywhere;max-height:360px;overflow:auto;font-size:12px"></pre>';
    host.insertBefore(panel,byId('productionDiagnosticsPanel'));
    output=panel.querySelector('[data-runtime-output]');status=panel.querySelector('[data-runtime-status]');captureButton=panel.querySelector('[data-runtime-capture]');
    panel.addEventListener('toggle',refreshPanel);
    panel.querySelector('[data-runtime-refresh]').addEventListener('click',refreshPanel);
    captureButton.addEventListener('click',startCapture);
    panel.querySelector('[data-runtime-copy]').addEventListener('click',async()=>{
      const data=snapshot();if(!data)return;
      const text=JSON.stringify(data,null,2);
      try { await navigator.clipboard.writeText(text);if(adminActor())status.textContent='Safe snapshot copied.'; }
      catch (_) {if(adminActor()){output.textContent=text;status.textContent='Clipboard unavailable. Select and copy the snapshot below.';}}
    });
  }
  function moduleLoad(marker) {
    const name=marker.dataset.ttAdminModule;
    const existing=modules.get(name);if(existing && existing.state!=='failed')return existing.promise;
    const item={state:'loading',promise:null};
    item.promise=new Promise((resolve,reject)=>{
      const script=document.createElement('script');let settled=false;
      const finish=error=>{if(settled)return;settled=true;clearTimeout(timer);script.onload=script.onerror=null;if(error){item.state='failed';script.remove();reject(error);}else{item.state='loaded';resolve();}};
      const timer=setTimeout(()=>finish(new Error('Admin module loading timed out.')),15000);
      const url=new URL(marker.dataset.ttSrc,location.href);
      if(url.origin!==location.origin || !url.pathname.includes('/assets/js/')){finish(new Error('Invalid Admin module location.'));return;}
      script.src=url.href;script.async=true;script.dataset.ttLoadedModule=name;
      script.onload=()=>finish();script.onerror=()=>finish(new Error('Admin module could not be loaded.'));
      document.head.appendChild(script);
    });
    modules.set(name,item);return item.promise;
  }
  function showLoadFailure() {
    if(!adminActor())return;
    if(!loadError){
      loadError=document.createElement('div');loadError.className='settings-hint';loadError.setAttribute('role','status');
      loadError.innerHTML='Additional Admin tools could not load. Your attendance data has not been cleared. <button type="button" class="modal-btn cancel">Retry Admin Tools</button>';
      (byId('mainContent')||document.body).prepend(loadError);
      loadError.querySelector('button').addEventListener('click',()=>{loadError.hidden=true;void ensureAdminModules();});
    }
    loadError.hidden=false;
  }
  function ensureAdminModules() {
    if(!adminActor())return Promise.resolve(false);
    if(loading)return loading;
    loading=(async()=>{
      try {
        // Ordered dependency loading. Login, live sync and attendance writes are
        // deliberately NOT part of this deferred set.
        for(const marker of document.querySelectorAll('script[data-tt-admin-module]')){
          if(!adminActor())return false;
          await moduleLoad(marker);
        }
        if(loadError)loadError.hidden=true;
        return true;
      } catch (_) {showLoadFailure();return false;}
      finally {loading=null;refreshPanel();}
    })();
    return loading;
  }
  function syncRole() {
    const actor=adminActor(),next=actor?String(actor.id||''):'';
    if(owner!==next){stopCapture(true);lastCapture=null;lastOwner='';if(output)output.textContent='';owner=next;}
    if(!actor){if(panel){panel.open=false;panel.hidden=true;}if(loadError)loadError.hidden=true;return;}
    ensurePanel();refreshPanel();
    // Failed loads require the explicit Retry action, not a mutation-driven loop.
    if(!Array.from(modules.values()).some(item=>item.state==='failed'))void ensureAdminModules();
  }
  function init() {
    if(initialized)return;initialized=true;
    ensurePanel();syncRole();
    new MutationObserver(syncRole).observe(document.body,{attributes:true,attributeFilter:['data-trino-role']});
    window.addEventListener('pagehide',()=>stopCapture(true));
    window.addEventListener('trinotime:attendance-projection-change',()=>{if(panel?.open && byId('settingsOverlay')?.classList.contains('open') && !document.hidden)refreshPanel();});
  }
  window.TrinoTimeRuntimeDiagnostics=Object.freeze({snapshot,startCapture,measureCoreWork,stopCapture:()=>stopCapture(),refresh:refreshPanel,loadAdminModules:ensureAdminModules,version:'2.0.1-rc68'});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
