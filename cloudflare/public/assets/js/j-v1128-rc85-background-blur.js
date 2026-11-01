/* TrinoTime v1.1.128 RC85 — Background Blur
   Uses the camera track's platform-native backgroundBlur capability when the browser/device exposes it.
   No camera frames are uploaded, stored, or routed through backend data services.
   No extra PeerConnection or WebRTC sender is created. Unsupported devices fall back to normal camera video. */
(function (global) {
  'use strict';

  function safeCall(fn, fallback) {
    try { return fn(); } catch (_) { return fallback; }
  }

  function normalizeBooleanCapabilities(value) {
    if (!Array.isArray(value)) return [];
    const out = [];
    for (const item of value) if (typeof item === 'boolean' && !out.includes(item)) out.push(item);
    return out;
  }

  function create(call, hooks = {}) {
    const isCurrent = typeof hooks.isCurrent === 'function' ? hooks.isCurrent : () => true;
    const changed = typeof hooks.changed === 'function' ? hooks.changed : () => {};
    let disposed = false;
    let track = null;
    let configurationListener = null;
    let endedListener = null;
    let pending = false;
    let requested = null;
    let notice = '';
    let errorCode = '';

    function emit() {
      if (!disposed && isCurrent()) changed();
    }

    function detach() {
      if (!track) return;
      if (configurationListener) track.removeEventListener?.('configurationchange', configurationListener);
      if (endedListener) track.removeEventListener?.('ended', endedListener);
      configurationListener = null;
      endedListener = null;
    }

    function read() {
      if (!track || track.readyState === 'ended') {
        return {
          bound: false,
          recognized: false,
          supported: false,
          controllable: false,
          active: false,
          pending,
          notice,
          errorCode
        };
      }
      const capabilities = safeCall(() => track.getCapabilities?.() || {}, {});
      const settings = safeCall(() => track.getSettings?.() || {}, {});
      const blurCapabilities = normalizeBooleanCapabilities(capabilities.backgroundBlur);
      const settingKnown = typeof settings.backgroundBlur === 'boolean';
      const canBlur = blurCapabilities.includes(true);
      const canDisableBlur = blurCapabilities.includes(false);
      // Per Media Capture and Streams: [false] means this source cannot blur;
      // [true] means blur exists but cannot be disabled; [false,true] is app-controllable.
      const supported = canBlur || settings.backgroundBlur === true;
      const controllable = Boolean(track.applyConstraints) && canBlur && canDisableBlur;
      const recognized = Boolean(safeCall(() => global.navigator?.mediaDevices?.getSupportedConstraints?.()?.backgroundBlur, false)) || blurCapabilities.length > 0 || settingKnown;
      const active = settingKnown ? settings.backgroundBlur : requested === true;
      return {
        bound: true,
        recognized,
        supported,
        controllable,
        active,
        pending,
        managedBySystem: supported && !controllable,
        capabilityValues: blurCapabilities.slice(),
        notice,
        errorCode
      };
    }

    function bind(nextTrack) {
      if (disposed) return read();
      const candidate = nextTrack?.kind === 'video' ? nextTrack : null;
      if (candidate === track) return read();
      detach();
      track = candidate;
      pending = false;
      requested = null;
      notice = '';
      errorCode = '';
      if (track) {
        configurationListener = () => emit();
        endedListener = () => emit();
        track.addEventListener?.('configurationchange', configurationListener);
        track.addEventListener?.('ended', endedListener, { once: true });
      }
      emit();
      return read();
    }

    async function setEnabled(enabled) {
      if (disposed || !isCurrent()) return false;
      const before = read();
      if (!before.bound || !before.controllable) {
        notice = before.supported
          ? 'Background blur is controlled by your device or operating system for this camera.'
          : 'Background blur is not available for this camera in this browser. Your video call is unchanged.';
        errorCode = before.supported ? 'system-managed' : 'unsupported';
        emit();
        return false;
      }
      if (pending) return false;
      const target = Boolean(enabled);
      if (before.active === target) return true;
      pending = true;
      notice = '';
      errorCode = '';
      requested = target;
      emit();
      try {
        // applyConstraints replaces the track's current custom constraint set, so preserve
        // its existing camera budget/facing constraints and add only backgroundBlur.
        const currentConstraints = safeCall(() => track.getConstraints?.() || {}, {});
        const nextConstraints = { ...currentConstraints, backgroundBlur: target };
        await track.applyConstraints(nextConstraints);
        const after = read();
        if (typeof safeCall(() => track.getSettings?.().backgroundBlur, undefined) === 'boolean' && after.active !== target) {
          throw new Error('background-blur-not-applied');
        }
        requested = after.active;
        return true;
      } catch (error) {
        requested = null;
        errorCode = String(error?.name || error?.message || 'apply-failed').slice(0, 80);
        notice = 'Background blur could not be changed. Your camera and call remain connected.';
        return false;
      } finally {
        pending = false;
        emit();
      }
    }

    async function toggle() {
      const view = read();
      return setEnabled(!view.active);
    }

    function clearNotice() {
      notice = '';
      errorCode = '';
      emit();
    }

    function dispose() {
      if (disposed) return;
      disposed = true;
      detach();
      track = null;
      pending = false;
      requested = null;
      notice = '';
      errorCode = '';
    }

    return { bind, setEnabled, toggle, snapshot: read, clearNotice, dispose };
  }

  global.TrinoTimeBackgroundBlur = Object.freeze({ create });
})(window);
