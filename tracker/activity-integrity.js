// Production activity integrity: distinguishes task work, work-tool transitions and unverifiable presence.
// No mouse coordinates, other-app names, key contents, screenshots or browsing history are collected.
(() => {
  'use strict';
  if (window.TrinoTimeActivityIntegrity) return;
  const GRACE_MS = 30_000;
  const WORK_EVIDENCE_MS = 300_000;
  const now = () => Date.now();
  const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
  function create(workflow) {
    const key = `tt-activity-integrity-v1-${workflow}`;
    let shiftKey = '', taskKey = '', lastVerifiedAt = 0, offSinceAt = 0, offUsedMs = 0;
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) || 'null');
      if (saved && Number(saved.savedAt) <= now() && now() - Number(saved.savedAt) < 86_400_000) {
        shiftKey = String(saved.shiftKey || '').slice(0, 180);
        taskKey = String(saved.taskKey || '').slice(0, 180);
        lastVerifiedAt = clamp(saved.lastVerifiedAt, 0, now());
        offSinceAt = clamp(saved.offSinceAt, 0, now());
        offUsedMs = clamp(saved.offUsedMs, 0, GRACE_MS);
      }
    } catch (_) {}
    function persist() {
      try { sessionStorage.setItem(key, JSON.stringify({shiftKey, taskKey, lastVerifiedAt, offSinceAt, offUsedMs, savedAt: now()})); } catch (_) {}
    }
    function reset() { shiftKey=''; taskKey=''; lastVerifiedAt=0; offSinceAt=0; offUsedMs=0; try {sessionStorage.removeItem(key);}catch(_){} }
    function verified(at=now()) {
      lastVerifiedAt=at;
      // Only real on-tool workflow interaction renews the off-tool allowance.
      offSinceAt=0; offUsedMs=0; persist();
    }
    function sync(hasTask, active, nextTaskKey='', nextShiftKey='') {
      if (!active) return; // boot may precede signed shift hydration; never erase saved evidence at boot.
      const token=String(nextShiftKey || '').slice(0,180);
      if (token && shiftKey && token!==shiftKey) reset();
      if (token) shiftKey=token;
      const next=hasTask ? String(nextTaskKey || '').slice(0,180) : '';
      if (next && next!==taskKey) {taskKey=next;verified();}
      else if (!hasTask && taskKey) {taskKey='';persist();}
    }
    function isMeaningful(event, hasTask) {
      if (!event || event.isTrusted !== true) return false;
      const kind=String(event.type||'');
      // Mouse motion, empty-area clicks, focus/blur and ordinary scrolling are NOT task evidence.
      const target=event.target;
      const el=target && typeof target.closest==='function' ? target : target?.parentElement;
      const selector='button,[role="button"],[role="checkbox"],[role="radio"],input,textarea,select,[contenteditable="true"],canvas,[aria-pressed],[aria-checked]';
      const interactive=Boolean(el && typeof el.closest==='function' && el.closest(selector));
      if (kind==='input'||kind==='change') return interactive;
      if (kind==='keydown') {
        const k=String(event.key||'').toLowerCase();
        return interactive && !event.repeat && !event.ctrlKey && !event.altKey && !event.metaKey;
      }
      if (kind==='pointerdown'||kind==='click'||kind==='touchstart') return interactive;
      return false;
    }
    function record(event, hasTask, active) {
      if (!active || !isMeaningful(event,hasTask)) return false;
      verified();return true;
    }
    function state(base, opts={}, at=now()) {
      if (base==='offline'||base==='paused')return base;
      if (base==='away'||opts.osAway===true)return 'away';
      const offTool=opts.focused===false || opts.visible===false;
      if (offTool) {
        if (!offSinceAt) {offSinceAt=at;persist();}
        if (!lastVerifiedAt || at-lastVerifiedAt>=WORK_EVIDENCE_MS)return 'unverified';
        return offUsedMs + Math.max(0,at-offSinceAt) < GRACE_MS ? 'grace' : 'unverified';
      }
      if (offSinceAt) {offUsedMs=clamp(offUsedMs+Math.max(0,at-offSinceAt),0,GRACE_MS);offSinceAt=0;persist();}
      if (base==='active' && opts.hasTask && (!lastVerifiedAt || at-lastVerifiedAt>=WORK_EVIDENCE_MS))return 'unverified';
      return base;
    }
    function graceDeadlineAt() { return offSinceAt ? offSinceAt + Math.max(0,GRACE_MS-offUsedMs) : 0; }
    function allowanceRemaining(at=now()){
      return Math.max(0,GRACE_MS-offUsedMs-(offSinceAt?Math.max(0,at-offSinceAt):0));
    }
    return {sync,record,state,reset,isMeaningful,allowanceRemaining,graceDeadlineAt,policy:{graceMs:GRACE_MS,workEvidenceMs:WORK_EVIDENCE_MS}};
  }
  window.TrinoTimeActivityIntegrity={create};
})();
