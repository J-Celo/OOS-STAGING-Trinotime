/* TrinoTime v1.1.128 RC89 CDN hotfix over RC88 — Person-Aware Background Blur
   RC85 native camera blur remains first choice. If the browser/camera cannot
   control native blur, RC87 starts immediately as a bounded local fallback so
   the call never waits on a model download. In the background, RC88 loads
   pinned TensorFlow.js + BodyPix and atomically upgrades the SAME existing
   camera RTCRtpSender to a real person-segmentation bokeh track. Camera frames
   remain on-device and are never uploaded or stored. */
(function (global) {
  'use strict';

  const baseFactory = global.TrinoTimeBackgroundBlur && global.TrinoTimeBackgroundBlur.create;
  const TF_URL = 'https://cdnjs.cloudflare.com/ajax/libs/tensorflow/4.22.0/tf.es2017.min.js';
  const BODYPIX_URL = 'https://cdn.jsdelivr.net/npm/@tensorflow-models/body-pix@2.2.1/dist/body-pix.min.umd.js';
  const BODYPIX_MODEL_URL = 'https://storage.googleapis.com/tfjs-models/savedmodel/bodypix/mobilenet/quant2/050/model-stride16.json';
  const SCRIPT_TIMEOUT_MS = 8000;
  const MODEL_TIMEOUT_MS = 12000;
  const FIRST_FRAME_TIMEOUT_MS = 5000;
  const FRAME_TIMEOUT_MS = 2500;
  const TARGET_FPS = 12;
  const MAX_WIDTH = 640;
  const safe = (fn, fallback) => { try { return fn(); } catch (_) { return fallback; } };
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

  let librariesPromise = null;
  let modelPromise = null;

  function withTimeout(promise, ms, code) {
    let timer = 0;
    return Promise.race([
      Promise.resolve(promise),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(code || 'timeout')), ms); })
    ]).finally(() => clearTimeout(timer));
  }

  // RC89: UMD builds may expose the package name rather than bodyPix.
  // Check callable APIs, not a truthy placeholder left by a failed load.
  function tensorFlowReady() {
    return Boolean(global.tf && typeof global.tf.ready === 'function' &&
      typeof global.tf.loadGraphModel === 'function');
  }

  function bodyPixReady() {
    const api = [global.bodyPix, global['body-pix']].find(candidate =>
      candidate && typeof candidate.load === 'function' &&
      typeof candidate.drawBokehEffect === 'function');
    if (!api) return false;
    global.bodyPix = api;
    return true;
  }

  // Share in-flight requests. A failed or timed-out tag must not be reused:
  // its load/error event has already fired and would strand the next attempt.
  const scriptLoads = new Map();
  function loadScriptOnce(id, src, ready) {
    if (ready()) return Promise.resolve(true);
    if (scriptLoads.has(id)) return scriptLoads.get(id);
    if (!global.document || !global.document.head) {
      return Promise.reject(new Error('blur-document-unavailable'));
    }
    const pending = new Promise((resolve, reject) => {
      const doc = global.document;
      const stale = doc.getElementById(id);
      if (stale) stale.remove();
      const script = doc.createElement('script');
      let timer = 0;
      let settled = false;
      const finish = error => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        script.removeEventListener('load', onLoad);
        script.removeEventListener('error', onError);
        if (error) {
          script.remove();
          reject(error);
        } else {
          resolve(true);
        }
      };
      const onLoad = () => {
        try { finish(ready() ? null : new Error(`${id}-not-ready`)); }
        catch (error) { finish(error); }
      };
      const onError = () => finish(new Error(`${id}-load-failed`));
      script.id = id;
      script.src = src;
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.referrerPolicy = 'no-referrer';
      script.addEventListener('load', onLoad);
      script.addEventListener('error', onError);
      timer = setTimeout(() => finish(new Error(`${id}-timeout`)), SCRIPT_TIMEOUT_MS);
      try { doc.head.appendChild(script); }
      catch (error) { finish(error); }
    });
    scriptLoads.set(id, pending);
    const forget = () => {
      if (scriptLoads.get(id) === pending) scriptLoads.delete(id);
    };
    pending.then(forget, forget);
    return pending;
  }

  function ensureLibraries() {
    if (!librariesPromise) {
      librariesPromise = (async () => {
        await loadScriptOnce('ttTensorFlowJs', TF_URL, tensorFlowReady);
        await loadScriptOnce('ttBodyPixJs', BODYPIX_URL, bodyPixReady);
        if (!tensorFlowReady() || !bodyPixReady()) throw new Error('person-segmentation-libraries-unavailable');
        await withTimeout(global.tf.ready(), SCRIPT_TIMEOUT_MS, 'person-segmentation-backend-timeout');
        return true;
      })().catch(error => { librariesPromise = null; throw error; });
    }
    return librariesPromise;
  }

  function ensureModel() {
    if (!modelPromise) {
      modelPromise = (async () => {
        await ensureLibraries();
        return withTimeout(global.bodyPix.load({
          architecture: 'MobileNetV1',
          outputStride: 16,
          multiplier: 0.50,
          quantBytes: 2,
          modelUrl: BODYPIX_MODEL_URL
        }), MODEL_TIMEOUT_MS, 'person-segmentation-model-timeout');
      })().catch(error => { modelPromise = null; throw error; });
    }
    return modelPromise;
  }

  function environmentSupported(hooks) {
    if (!global.document || !global.MediaStream || typeof hooks.replaceTrack !== 'function') return false;
    const canvas = safe(() => document.createElement('canvas'), null);
    const ctx = safe(() => canvas && canvas.getContext('2d'), null);
    return Boolean(canvas && ctx && typeof canvas.captureStream === 'function' && 'filter' in ctx);
  }

  function create(call, hooks = {}) {
    const isCurrent = typeof hooks.isCurrent === 'function' ? hooks.isCurrent : () => true;
    const changed = typeof hooks.changed === 'function' ? hooks.changed : () => {};
    let wrapper = null;
    const base = baseFactory ? baseFactory(call, { ...hooks, changed: () => wrapper?.emit?.() }) : null;

    let disposed = false;
    let sourceTrack = null;
    let requested = false;
    let enhancementLoading = false;
    let enhancedActive = false;
    let notice = '';
    let errorCode = '';
    let video = null;
    let canvas = null;
    let inputCanvas = null;
    let outputStream = null;
    let outputTrack = null;
    let renderToken = 0;
    let processing = false;
    let internalResolution = 'medium';
    let slowFrames = 0;

    const emit = () => { if (!disposed && isCurrent()) changed(); };
    wrapper = { emit };
    const supported = () => environmentSupported(hooks);
    const baseView = () => base?.snapshot?.() || {};
    const nativeMode = (view = baseView()) => view.mode === 'native' || view.managedBySystem === true;

    function snapshot() {
      const fb = baseView();
      if (nativeMode(fb)) return { ...fb, notice:notice || fb.notice || '', errorCode:errorCode || fb.errorCode || '' };
      if (enhancedActive || outputTrack) return {
        ...fb,
        recognized:true,
        supported:true,
        controllable:true,
        managedBySystem:false,
        active:Boolean(enhancedActive),
        pending:false,
        mode:enhancedActive ? 'person-segmentation' : 'person-segmentation-ready',
        previewStream:enhancedActive ? outputStream : null,
        notice,
        errorCode,
        quality:'person-aware'
      };
      return {
        ...fb,
        recognized:Boolean(fb.recognized || supported()),
        supported:Boolean(fb.supported || supported()),
        controllable:Boolean(fb.controllable || supported()),
        active:Boolean(fb.active),
        // RC87 is already active while the model warms up, so model loading is
        // never exposed as a blocking "Preparing…" state.
        pending:Boolean(fb.pending),
        mode:fb.active ? 'basic-fallback' : (fb.mode || 'person-segmentation-ready'),
        previewStream:fb.previewStream || null,
        notice:notice || fb.notice || '',
        errorCode:errorCode || fb.errorCode || '',
        quality:fb.active ? 'basic-fallback' : 'person-aware-ready',
        enhancing:Boolean(enhancementLoading)
      };
    }

    async function waitForVideoFrame(target, timeoutMs = 2500) {
      const started = Date.now();
      while (!disposed && isCurrent() && Date.now() - started < timeoutMs) {
        if (target.videoWidth > 0 && target.videoHeight > 0 && target.readyState >= 2) return true;
        await delay(50);
      }
      return false;
    }

    async function restoreSource(previousOutput = outputTrack) {
      if (!sourceTrack || sourceTrack.readyState === 'ended' || typeof hooks.replaceTrack !== 'function') return;
      try { await hooks.replaceTrack(sourceTrack, previousOutput || sourceTrack); } catch (_) {}
    }

    async function stopEnhanced({ restore = false } = {}) {
      const previous = outputTrack;
      ++renderToken;
      processing = false;
      enhancedActive = false;
      enhancementLoading = false;
      if (restore) await restoreSource(previous);
      try { outputTrack?.stop?.(); } catch (_) {}
      try { outputStream?.getTracks?.().forEach(track => track !== outputTrack && track.stop?.()); } catch (_) {}
      try { if (video) { video.pause?.(); video.srcObject = null; video.remove?.(); } } catch (_) {}
      try { canvas?.remove?.(); } catch (_) {}
      try { inputCanvas?.remove?.(); } catch (_) {}
      video = null;
      canvas = null;
      inputCanvas = null;
      outputStream = null;
      outputTrack = null;
      slowFrames = 0;
      internalResolution = 'medium';
    }

    async function fallbackAfterEnhancementFailure(reason) {
      // While the model is warming up, RC87 already owns the sender with its
      // basic local blur. Do not restore the raw source track unless RC88 had
      // actually installed its own segmented output; otherwise a failed model
      // load would silently remove the working RC87 blur while its controller
      // still reported active.
      const hadEnhancedOutput = Boolean(outputTrack || enhancedActive);
      await stopEnhanced({ restore:hadEnhancedOutput });
      if (!requested || disposed || !isCurrent()) return false;
      const before = baseView();
      if (!hadEnhancedOutput && before.active) {
        notice = 'Background blur is on using the standard local fallback. Person-aware blur could not finish loading on this device.';
        errorCode = String(reason || 'person-segmentation-unavailable').slice(0, 100);
        emit();
        return true;
      }
      const ok = await base?.setEnabled?.(true);
      const view = baseView();
      if (ok && view.active) {
        notice = 'Background blur is on using the standard local fallback. Person-aware blur could not finish loading on this device.';
        errorCode = String(reason || 'person-segmentation-unavailable').slice(0, 100);
        emit();
        return true;
      }
      notice = 'Background blur could not start. Your normal camera and call remain connected.';
      errorCode = String(reason || 'person-segmentation-unavailable').slice(0, 100);
      emit();
      return false;
    }

    async function prepareEnhanced(model, tokenAtStart) {
      if (!sourceTrack || sourceTrack.readyState === 'ended' || !supported()) throw new Error('person-segmentation-unsupported');
      if (!requested || disposed || !isCurrent() || tokenAtStart !== renderToken) throw new Error('call-changed');

      video = document.createElement('video');
      video.muted = true;
      video.defaultMuted = true;
      video.playsInline = true;
      video.autoplay = true;
      video.style.cssText = 'position:fixed;left:-10000px;top:-10000px;width:1px;height:1px;opacity:0;pointer-events:none';
      video.srcObject = new global.MediaStream([sourceTrack]);
      document.body.appendChild(video);
      await withTimeout(Promise.resolve(video.play()), 2500, 'camera-play-timeout');
      if (!(await waitForVideoFrame(video))) throw new Error('camera-frame-timeout');

      const sourceW = Math.max(1, video.videoWidth || 640);
      const sourceH = Math.max(1, video.videoHeight || 360);
      const width = Math.max(320, Math.min(MAX_WIDTH, sourceW));
      const height = Math.max(180, Math.round(width * sourceH / sourceW));
      canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.style.cssText = video.style.cssText;
      inputCanvas = document.createElement('canvas');
      inputCanvas.width = width;
      inputCanvas.height = height;
      inputCanvas.style.cssText = video.style.cssText;
      document.body.appendChild(canvas);
      document.body.appendChild(inputCanvas);
      const ctx = canvas.getContext('2d', { alpha:false, desynchronized:true });
      const inputCtx = inputCanvas.getContext('2d', { alpha:false, desynchronized:true });
      if (!ctx || !inputCtx || !('filter' in ctx)) throw new Error('canvas-filter-unsupported');

      const drawFrame = async () => {
        const started = performance.now();
        // Downscale the live camera to the bounded processing canvas first so
        // BodyPix segmentation and bokeh compositing operate on matching
        // dimensions and never silently jump back to the full camera size.
        inputCtx.filter = 'none';
        inputCtx.drawImage(video, 0, 0, width, height);
        const segmentation = await withTimeout(model.segmentPerson(inputCanvas, {
          flipHorizontal:false,
          internalResolution,
          segmentationThreshold:0.66,
          maxDetections:1,
          scoreThreshold:0.30,
          nmsRadius:20
        }), FRAME_TIMEOUT_MS, 'person-segmentation-frame-timeout');
        if (!requested || disposed || !isCurrent()) throw new Error('call-changed');
        global.bodyPix.drawBokehEffect(canvas, inputCanvas, segmentation, 20, 6, false);
        const elapsed = performance.now() - started;
        if (elapsed > 180) slowFrames += 1;
        else slowFrames = Math.max(0, slowFrames - 1);
        if (slowFrames >= 3) internalResolution = 'low';
        return elapsed;
      };

      // Prove a real person-segmented frame before touching the WebRTC sender.
      await withTimeout(drawFrame(), FIRST_FRAME_TIMEOUT_MS, 'person-segmentation-first-frame-timeout');
      if (!requested || disposed || !isCurrent() || tokenAtStart !== renderToken) throw new Error('call-changed');

      outputStream = canvas.captureStream(TARGET_FPS);
      outputTrack = outputStream.getVideoTracks?.()[0] || null;
      if (!outputTrack) throw new Error('canvas-track-unavailable');
      try { outputTrack.contentHint = 'motion'; } catch (_) {}
      outputTrack.enabled = sourceTrack.enabled;

      // RC87 may currently own the camera sender. Stop that compositor first,
      // then atomically install this person-aware track on the same sender.
      await base?.setEnabled?.(false);
      if (!requested || disposed || !isCurrent()) throw new Error('call-changed');
      await hooks.replaceTrack(outputTrack, sourceTrack);
      if (!requested || disposed || !isCurrent()) throw new Error('call-changed');

      enhancedActive = true;
      enhancementLoading = false;
      notice = 'Person-aware background blur is running locally on this device.';
      errorCode = '';
      emit();

      const token = ++renderToken;
      processing = true;
      const frameMs = 1000 / TARGET_FPS;
      while (processing && requested && !disposed && isCurrent() && token === renderToken && video && inputCanvas && outputTrack) {
        const started = performance.now();
        if (sourceTrack?.enabled === false) {
          ctx.filter = 'none';
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, width, height);
        } else {
          await drawFrame();
        }
        const elapsed = performance.now() - started;
        await delay(Math.max(12, frameMs - elapsed));
      }
      return true;
    }

    async function startEnhancement() {
      if (enhancementLoading || enhancedActive || disposed || !requested || !sourceTrack || nativeMode()) return;
      enhancementLoading = true;
      notice = 'Background blur is on. Improving person/background separation locally…';
      errorCode = '';
      emit();
      const token = renderToken;
      try {
        const model = await ensureModel();
        if (!requested || disposed || !isCurrent() || token !== renderToken) return;
        await prepareEnhanced(model, token);
      } catch (error) {
        if (requested && !disposed && isCurrent()) {
          await fallbackAfterEnhancementFailure(String(error?.message || error?.name || 'person-segmentation-failed'));
        }
      } finally {
        enhancementLoading = false;
        emit();
      }
    }

    function bind(nextTrack) {
      const candidate = nextTrack?.kind === 'video' ? nextTrack : null;
      if (candidate === sourceTrack) {
        base?.bind?.(candidate);
        return snapshot();
      }
      const wasRequested = requested;
      ++renderToken; // invalidate any model/load loop still bound to the prior camera track
      requested = false;
      if (enhancedActive || outputTrack) void stopEnhanced({ restore:false });
      sourceTrack = candidate;
      base?.bind?.(candidate);
      notice = '';
      errorCode = '';
      requested = Boolean(wasRequested && candidate);
      if (requested) void setEnabled(true);
      emit();
      return snapshot();
    }

    async function setEnabled(enabled) {
      if (disposed || !isCurrent()) return false;
      requested = Boolean(enabled);
      notice = '';
      errorCode = '';

      if (!requested) {
        if (enhancedActive || outputTrack) await stopEnhanced({ restore:true });
        const ok = await base?.setEnabled?.(false);
        notice = '';
        errorCode = '';
        emit();
        return ok !== false;
      }

      if (!sourceTrack || sourceTrack.readyState === 'ended') {
        notice = 'Background blur is waiting for an active camera.';
        errorCode = 'camera-track-unavailable';
        emit();
        return false;
      }
      if (enhancedActive) return true;

      // Native blur or RC87's basic local blur becomes active immediately.
      // Person segmentation upgrades it asynchronously without blocking the call.
      const ok = await base?.setEnabled?.(true);
      const view = baseView();
      if (!ok && !view.active) {
        notice = view.notice || 'Background blur could not start. Your normal camera and call remain connected.';
        errorCode = view.errorCode || 'background-blur-unavailable';
        emit();
        return false;
      }
      if (nativeMode(view)) {
        notice = view.notice || '';
        emit();
        return true;
      }

      notice = 'Background blur is on. Improving person/background separation locally…';
      emit();
      void startEnhancement();
      return true;
    }

    async function toggle() { return setEnabled(!snapshot().active); }

    function setCameraEnabled(enabled) {
      try {
        if (sourceTrack) sourceTrack.enabled = Boolean(enabled);
        if (outputTrack) outputTrack.enabled = Boolean(enabled);
      } catch (_) {}
      base?.setCameraEnabled?.(enabled);
    }

    function clearNotice() {
      notice = '';
      errorCode = '';
      base?.clearNotice?.();
      emit();
    }

    function dispose() {
      if (disposed) return;
      disposed = true;
      requested = false;
      ++renderToken;
      processing = false;
      void stopEnhanced({ restore:false });
      base?.dispose?.();
      sourceTrack = null;
    }

    return { bind, setEnabled, toggle, snapshot, clearNotice, setCameraEnabled, dispose };
  }

  global.TrinoTimeBackgroundBlur = Object.freeze({
    create,
    personSegmentation:true,
    nativeFirst:true,
    immediateFallback:true,
    localProcessingOnly:true
  });
})(window);
