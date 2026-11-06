// Local view of one shared activity owner. Submission detection runs regardless.
(() => {
  'use strict';
  if (window.TrinoTimeWorkflowCoordinator) return;
  function create(workflow, changed) {
    let owned = false, busy = null, lastRequestAt = 0, generation = 0;
    const apply = (value, at = Date.now()) => {
      const next = value === true;
      if (next === owned) return;
      owned = next;
      try {changed?.(owned, at);} catch (_) {}
    };
    // Background can revoke ownership while this tab is hidden/throttled.
    chrome.runtime.onMessage.addListener(message => {
      if (message?.type !== 'tt-activity-owner-lost' || message.workflow !== workflow) return;
      generation++;
      apply(false, Math.min(Date.now(), Number(message.at) || Date.now()));
    });
    async function refresh(active, immediate = false) {
      const at = Date.now();
      if (!immediate && busy && at-lastRequestAt < 2000) return busy;
      if (!immediate && at-lastRequestAt < 1000) return {owned};
      const attempt = ++generation;
      lastRequestAt = at;
      // foreground means selected Augmoto tab, NOT general mouse movement.
      const foreground = active && !document.hidden && document.hasFocus();
      busy = chrome.runtime.sendMessage({type:'tt-activity-owner-request',workflow,active:Boolean(active),foreground})
        .then(result => {
          if (attempt === generation && typeof result?.owned === 'boolean') apply(result.owned, result.at);
          return result;
        }).catch(() => ({owned})).finally(() => { if (attempt === generation) busy = null; });
      return busy;
    }
    return {refresh,isOwner:() => owned};
  }
  window.TrinoTimeWorkflowCoordinator = Object.freeze({create});
})();
