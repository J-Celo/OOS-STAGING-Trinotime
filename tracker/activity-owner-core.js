// Production-only one-owner activity lease. Does NOT gate Submit capture or syncing.
// State is session-scoped so Chrome service-worker suspension cannot create two owners.
(() => {
  'use strict';
  if (globalThis.TrinoTimeActivityOwnerCore) return;
  const KEY = 'tt-unified-workflow-owner-v1';
  const WORKFLOWS = new Set(['coverage', 'confirmation']);
  function create({storage, getTab, notify, now = () => Date.now()}) {
    let owner = null, initialized = false, serial = Promise.resolve();
    const safeTabId = id => Number.isInteger(id) && id >= 0;
    async function init() {
      if (initialized) return;
      const saved = await storage.get(KEY).catch(() => ({}));
      const value = saved?.[KEY];
      if (value && safeTabId(value.tabId) && WORKFLOWS.has(value.workflow)) {
        try {
          const tab = await getTab(value.tabId);
          if (String(tab?.url || '').startsWith('https://labeling-tools.augmoto.com/')) owner = { tabId: value.tabId, workflow: value.workflow, sinceAt: Number(value.sinceAt) || now() };
        } catch (_) { /* dead tab: cannot retain ownership */ }
      }
      initialized = true;
    }
    async function save() {
      // Never grant a new lease if its suspension-safe checkpoint was not stored.
      await storage.set({ [KEY]: owner });
    }
    function enqueue(fn) {
      const result = serial.catch(() => {}).then(fn);
      serial = result.catch(() => {});
      return result;
    }
    function request({tabId, workflow, active, foreground}) {
      return enqueue(async () => {
        await init();
        const at = now();
        if (!safeTabId(tabId) || !WORKFLOWS.has(workflow)) return {owned:false,at};
        const same = owner?.tabId === tabId && owner?.workflow === workflow;
        if (!active) {
          if (same) {owner = null;await save();}
          return {owned:false,at};
        }
        if (foreground && !same) {
          const old = owner;
          owner = {tabId,workflow,sinceAt:at};
          try {await save();} catch (_) {owner=old;throw Error('activity-ownership-storage-unavailable');}
          if (old) {try {await notify(old,{type:'tt-activity-owner-lost',workflow:old.workflow,at});} catch (_) {}}
        }
        return {owned:owner?.tabId===tabId && owner?.workflow===workflow,at};
      });
    }
    function releaseTab(tabId) {
      return enqueue(async () => {
        await init();
        if (owner?.tabId === tabId) {owner=null;await save();}
      });
    }
    return {request,releaseTab,current:() => owner};
  }
  globalThis.TrinoTimeActivityOwnerCore = {create};
})();
