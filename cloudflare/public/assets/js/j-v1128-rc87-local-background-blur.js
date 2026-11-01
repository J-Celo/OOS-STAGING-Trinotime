/* TrinoTime v1.1.128 RC87 — Reliable Local Background Blur
   Keeps RC85 native camera backgroundBlur as first choice. When the active
   browser/camera cannot control native blur, this module uses a dependency-free
   local portrait/background blur compositor and replaces only the existing
   camera RTCRtpSender track. No camera frames are uploaded or stored. */
(function (global) {
  'use strict';

  const nativeFactory = global.TrinoTimeBackgroundBlur && global.TrinoTimeBackgroundBlur.create;
  const safe = (fn, fallback) => { try { return fn(); } catch (_) { return fallback; } };
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

  function environmentSupported(hooks) {
    if (!global.document || !global.MediaStream || typeof hooks.replaceTrack !== 'function') return false;
    const canvas = safe(() => document.createElement('canvas'), null);
    const ctx = safe(() => canvas && canvas.getContext('2d'), null);
    return Boolean(canvas && ctx && typeof canvas.captureStream === 'function' && 'filter' in ctx);
  }

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

  function create(call, hooks = {}) {
    const isCurrent = typeof hooks.isCurrent === 'function' ? hooks.isCurrent : () => true;
    const changed = typeof hooks.changed === 'function' ? hooks.changed : () => {};
    const native = nativeFactory ? nativeFactory(call, { isCurrent, changed: () => emit() }) : null;

    let disposed = false;
    let sourceTrack = null;
    let pending = false;
    let active = false;
    let notice = '';
    let errorCode = '';
    let video = null;
    let canvas = null;
    let sharpLayer = null;
    let outputStream = null;
    let outputTrack = null;
    let renderToken = 0;
    let faceDetector = null;
    let faceDetectPending = false;
    let lastFaceDetectAt = 0;
    let subject = { x: 0.5, y: 0.43, radius: 0.34, yScale: 1.42 };

    const emit = () => { if (!disposed && isCurrent()) changed(); };
    const localSupported = () => environmentSupported(hooks);

    function localSnapshot() {
      return {
        active,
        pending,
        recognized: localSupported(),
        supported: localSupported(),
        controllable: localSupported(),
        managedBySystem: false,
        previewStream: active ? outputStream : null,
        mode: active ? 'local-portrait' : 'local-ready',
        notice,
        errorCode
      };
    }

    function snapshot() {
      const nv = native?.snapshot?.() || {};
      if (nv.active || nv.controllable || nv.managedBySystem) {
        return {
          ...nv,
          mode: 'native',
          previewStream: null,
          pending: Boolean(pending || nv.pending),
          notice: notice || nv.notice || '',
          errorCode: errorCode || nv.errorCode || ''
        };
      }
      const local = localSnapshot();
      return {
        ...nv,
        ...local,
        recognized: Boolean(nv.recognized || local.recognized),
        supported: Boolean(nv.supported || local.supported),
        controllable: Boolean(local.controllable),
        active: Boolean(active),
        pending: Boolean(pending),
        notice: notice || '',
        errorCode: errorCode || ''
      };
    }

    async function restoreOriginalTrack(previousOutput = outputTrack) {
      if (!sourceTrack || sourceTrack.readyState === 'ended' || typeof hooks.replaceTrack !== 'function') return;
      try { await hooks.replaceTrack(sourceTrack, previousOutput || sourceTrack); } catch (_) {}
    }

    function stopLocalMedia() {
      ++renderToken;
      try { outputTrack?.stop?.(); } catch (_) {}
      try { if (video) { video.pause?.(); video.srcObject = null; video.remove?.(); } } catch (_) {}
      try { canvas?.remove?.(); } catch (_) {}
      try { sharpLayer?.remove?.(); } catch (_) {}
      video = null;
      canvas = null;
      sharpLayer = null;
      outputStream = null;
      outputTrack = null;
      faceDetector = null;
      faceDetectPending = false;
    }

    async function disableLocal() {
      const priorOutput = outputTrack;
      if (!active && !priorOutput) return true;
      active = false;
      await restoreOriginalTrack(priorOutput);
      stopLocalMedia();
      notice = '';
      errorCode = '';
      emit();
      return true;
    }

    function bind(nextTrack) {
      const candidate = nextTrack?.kind === 'video' ? nextTrack : null;
      if (candidate === sourceTrack) { native?.bind?.(candidate); return snapshot(); }
      if (active || outputTrack) void disableLocal();
      sourceTrack = candidate;
      native?.bind?.(candidate);
      notice = '';
      errorCode = '';
      emit();
      return snapshot();
    }

    async function waitForVideoFrame(target, timeoutMs = 2500) {
      const started = Date.now();
      while (isCurrent() && !disposed && Date.now() - started < timeoutMs) {
        if (target.videoWidth > 0 && target.videoHeight > 0 && target.readyState >= 2) return true;
        await delay(50);
      }
      return false;
    }

    function updateSubjectFromFace(face, width, height) {
      const box = face?.boundingBox;
      if (!box || !(box.width > 0) || !(box.height > 0)) return;
      const cx = clamp((box.x + box.width / 2) / width, 0.2, 0.8);
      const cy = clamp((box.y + box.height * 1.65) / height, 0.25, 0.68);
      const radius = clamp(Math.max(box.width * 3.2 / width, 0.29), 0.29, 0.46);
      subject.x += (cx - subject.x) * 0.22;
      subject.y += (cy - subject.y) * 0.22;
      subject.radius += (radius - subject.radius) * 0.18;
    }

    function maybeDetectFace(width, height) {
      if (!faceDetector || faceDetectPending || !video) return;
      const now = performance.now();
      if (now - lastFaceDetectAt < 650) return;
      lastFaceDetectAt = now;
      faceDetectPending = true;
      Promise.resolve(faceDetector.detect(video)).then(faces => {
        if (Array.isArray(faces) && faces[0]) updateSubjectFromFace(faces[0], width, height);
      }).catch(() => {
        faceDetector = null;
      }).finally(() => { faceDetectPending = false; });
    }

    function drawPortraitBlur(ctx, sharpCtx, width, height) {
      if (!video || !sourceTrack) return;
      const pad = Math.max(12, Math.round(Math.min(width, height) * 0.035));

      // Blurred background. Slight overscan avoids transparent blur edges.
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.filter = 'blur(16px) saturate(0.94) brightness(0.98)';
      ctx.drawImage(video, -pad, -pad, width + pad * 2, height + pad * 2);
      ctx.restore();

      // Sharp foreground portrait area with a soft feathered edge. FaceDetector
      // nudges this region when the browser exposes it; otherwise it stays
      // centered so the fallback has no network/model dependency.
      sharpCtx.clearRect(0, 0, width, height);
      sharpCtx.globalCompositeOperation = 'source-over';
      sharpCtx.filter = 'none';
      sharpCtx.drawImage(video, 0, 0, width, height);
      sharpCtx.globalCompositeOperation = 'destination-in';
      sharpCtx.save();
      const cx = width * subject.x;
      const cy = height * subject.y;
      const r = width * subject.radius;
      sharpCtx.translate(cx, cy);
      sharpCtx.scale(1, subject.yScale);
      const gradient = sharpCtx.createRadialGradient(0, 0, r * 0.54, 0, 0, r);
      gradient.addColorStop(0, 'rgba(0,0,0,1)');
      gradient.addColorStop(0.72, 'rgba(0,0,0,0.98)');
      gradient.addColorStop(0.90, 'rgba(0,0,0,0.56)');
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      sharpCtx.fillStyle = gradient;
      sharpCtx.fillRect(-width * 2, -height * 2, width * 4, height * 4);
      sharpCtx.restore();
      sharpCtx.globalCompositeOperation = 'source-over';
      ctx.drawImage(sharpLayer, 0, 0);
      maybeDetectFace(width, height);
    }

    async function prepareLocal() {
      if (!sourceTrack || sourceTrack.readyState === 'ended' || !localSupported()) throw new Error('local-blur-unsupported');
      if (!isCurrent() || disposed) throw new Error('call-changed');

      video = document.createElement('video');
      video.muted = true;
      video.defaultMuted = true;
      video.playsInline = true;
      video.autoplay = true;
      video.style.cssText = 'position:fixed;left:-10000px;top:-10000px;width:1px;height:1px;opacity:0;pointer-events:none';
      video.srcObject = new global.MediaStream([sourceTrack]);
      document.body.appendChild(video);
      await Promise.race([
        Promise.resolve(video.play()),
        delay(2500).then(() => { throw new Error('camera-play-timeout'); })
      ]);
      if (!(await waitForVideoFrame(video))) throw new Error('camera-frame-timeout');

      const sourceW = Math.max(1, video.videoWidth || 640);
      const sourceH = Math.max(1, video.videoHeight || 360);
      const maxWidth = 640;
      const width = Math.max(320, Math.min(maxWidth, sourceW));
      const height = Math.max(180, Math.round(width * sourceH / sourceW));

      canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.style.cssText = 'position:fixed;left:-10000px;top:-10000px;width:1px;height:1px;opacity:0;pointer-events:none';
      sharpLayer = document.createElement('canvas');
      sharpLayer.width = width;
      sharpLayer.height = height;
      sharpLayer.style.cssText = canvas.style.cssText;
      document.body.appendChild(canvas);
      document.body.appendChild(sharpLayer);

      const ctx = canvas.getContext('2d', { alpha:false, desynchronized:true });
      const sharpCtx = sharpLayer.getContext('2d', { alpha:true, desynchronized:true });
      if (!ctx || !sharpCtx || !('filter' in ctx)) throw new Error('canvas-filter-unsupported');

      if (typeof global.FaceDetector === 'function') {
        try { faceDetector = new global.FaceDetector({ fastMode:true, maxDetectedFaces:1 }); } catch (_) { faceDetector = null; }
      }

      drawPortraitBlur(ctx, sharpCtx, width, height);
      outputStream = canvas.captureStream(15);
      outputTrack = outputStream.getVideoTracks?.()[0] || null;
      if (!outputTrack) throw new Error('canvas-track-unavailable');
      try { outputTrack.contentHint = 'motion'; } catch (_) {}
      outputTrack.enabled = sourceTrack.enabled;

      await hooks.replaceTrack(outputTrack, sourceTrack);
      if (!isCurrent() || disposed) throw new Error('call-changed');

      active = true;
      const token = ++renderToken;
      const frameMs = 1000 / 15;
      let nextAt = performance.now();
      const loop = now => {
        if (!active || disposed || !isCurrent() || token !== renderToken || !video || !canvas || !sharpLayer) return;
        if (now >= nextAt) {
          nextAt = now + frameMs;
          try {
            if (!sourceTrack.enabled) {
              ctx.filter = 'none';
              ctx.fillStyle = '#000';
              ctx.fillRect(0, 0, width, height);
            } else {
              drawPortraitBlur(ctx, sharpCtx, width, height);
            }
          } catch (_) {
            notice = 'Local background blur stopped. Your normal camera is being restored.';
            errorCode = 'local-render-failed';
            void disableLocal();
            return;
          }
        }
        global.requestAnimationFrame(loop);
      };
      global.requestAnimationFrame(loop);
      emit();
      return true;
    }

    async function setEnabled(enabled) {
      if (disposed || !isCurrent()) return false;
      const target = Boolean(enabled);
      const nv = native?.snapshot?.() || {};
      notice = '';
      errorCode = '';

      if (nv.controllable) {
        pending = true; emit();
        try { return await native.setEnabled(target); }
        finally { pending = false; emit(); }
      }
      if (nv.managedBySystem) {
        notice = 'Background blur is controlled by your device or operating system for this camera.';
        errorCode = 'system-managed'; emit(); return false;
      }
      if (!target) return disableLocal();
      if (active) return true;
      if (!localSupported()) {
        notice = 'Background blur is not available for this camera/browser. Your video call is unchanged.';
        errorCode = 'unsupported'; emit(); return false;
      }

      pending = true;
      notice = 'Preparing local background blur…';
      emit();
      try {
        const ok = await prepareLocal();
        notice = ok ? 'Background blur is running locally on this device.' : '';
        errorCode = '';
        return ok;
      } catch (error) {
        const priorOutput = outputTrack;
        active = false;
        await restoreOriginalTrack(priorOutput);
        stopLocalMedia();
        errorCode = String(error?.message || error?.name || 'local-blur-failed').slice(0, 80);
        notice = 'Background blur could not start. Your normal camera and call remain connected.';
        return false;
      } finally {
        pending = false;
        emit();
      }
    }

    async function toggle() { const view = snapshot(); return setEnabled(!view.active); }
    function setCameraEnabled(enabled) {
      try { if (sourceTrack) sourceTrack.enabled = Boolean(enabled); if (outputTrack) outputTrack.enabled = Boolean(enabled); } catch (_) {}
    }
    function clearNotice() { notice = ''; errorCode = ''; native?.clearNotice?.(); emit(); }
    function dispose() {
      if (disposed) return;
      disposed = true;
      active = false;
      ++renderToken;
      stopLocalMedia();
      native?.dispose?.();
      sourceTrack = null;
    }

    return { bind, setEnabled, toggle, snapshot, clearNotice, setCameraEnabled, dispose };
  }

  global.TrinoTimeBackgroundBlur = Object.freeze({ create, localFallback:true, dependencyFree:true });
})(window);
