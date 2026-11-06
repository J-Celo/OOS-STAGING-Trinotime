// Resilience-only wake gate: never marks an employee ACTIVE, awards task counts,
// clears retries, or bypasses the existing shift/device/server-ACK protections.
(() => {
  'use strict';
  if (globalThis.TrinoTimeAvailabilityCore) return;
  function create({readCore, refreshShift, sync, now = () => Date.now(), cooldownMs = 45000}) {
    let lastAt = 0;
    let inFlight = null;
    return function wake(reason = 'resume') {
      if (inFlight) return inFlight;
      const at = now();
      if (lastAt && at - lastAt >= 0 && at - lastAt < (reason === 'online' ? 5000 : cooldownMs)) {
        return Promise.resolve({ok:true, throttled:true});
      }
      inFlight = (async () => {
        const core = await readCore();
        // Never poll or fabricate a connection if this workflow was not paired.
        if (!core?.bridge?.token || !core?.bridge?.deviceId) return {ok:true, unpaired:true};
        lastAt = at;
        // Browser reconnect/focus is only a prompt to use EXISTING secure APIs.
        // An unreachable server cannot silently clear the authenticated queue.
        await refreshShift().catch(() => {});
        return sync();
      })().finally(() => { inFlight = null; });
      return inFlight;
    };
  }
  globalThis.TrinoTimeAvailabilityCore = Object.freeze({create});
})();
