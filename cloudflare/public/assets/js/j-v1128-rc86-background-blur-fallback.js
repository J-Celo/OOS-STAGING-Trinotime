/* TrinoTime v1.1.128 RC86 — Background Blur Fallback
   Preserves RC85 native camera backgroundBlur when available. When native blur
   is unavailable, a pinned BodyPix/TensorFlow.js path performs person
   segmentation locally and sends a canvas-captured camera track through the
   existing camera RTCRtpSender. No camera frames are uploaded or stored. */
(function (global) {
  'use strict';

  const nativeFactory = global.TrinoTimeBackgroundBlur && global.TrinoTimeBackgroundBlur.create;
  const TF_URL = 'https://cdnjs.cloudflare.com/ajax/libs/tensorflow/4.22.0/tf.es2017.min.js';
  const BODYPIX_URL = 'https://cdn.jsdelivr.net/npm/@tensorflow-models/body-pix@2.2.1/dist/body-pix.min.umd.js';
  const SCRIPT_TIMEOUT_MS = 8000;
  let librariesPromise = null;
  let modelPromise = null;

  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const safe = (fn, fallback) => { try { return fn(); } catch (_) { return fallback; } };

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
  function loadScript(id, src, ready) {
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

  async function ensureLibraries() {
    if (tensorFlowReady() && bodyPixReady()) return;
    if (!librariesPromise) librariesPromise=(async()=>{
      await loadScript('ttTfjsBlurRuntime', TF_URL, tensorFlowReady);
      await loadScript('ttBodyPixBlurRuntime', BODYPIX_URL, bodyPixReady);
      if (global.tf?.ready) await global.tf.ready();
    })().catch(error=>{ librariesPromise=null; throw error; });
    return librariesPromise;
  }

  async function ensureModel() {
    await ensureLibraries();
    if (!modelPromise) modelPromise=global.bodyPix.load({
      architecture:'MobileNetV1', outputStride:16, multiplier:0.50, quantBytes:2
    }).catch(error=>{ modelPromise=null; throw error; });
    return modelPromise;
  }

  function softwareEnvironmentSupported(hooks) {
    if (!global.document || !global.MediaStream) return false;
    const canvas = safe(() => document.createElement('canvas'), null);
    return Boolean(canvas && typeof canvas.captureStream === 'function' && typeof hooks.replaceTrack === 'function');
  }

  function create(call, hooks={}) {
    const isCurrent=typeof hooks.isCurrent==='function'?hooks.isCurrent:()=>true;
    const changed=typeof hooks.changed==='function'?hooks.changed:()=>{};
    const native=nativeFactory?nativeFactory(call,{isCurrent,changed:()=>emit()}):null;
    let disposed=false, track=null, pending=false, active=false, notice='', errorCode='';
    let video=null, canvas=null, outputStream=null, outputTrack=null, loopToken=0;

    const emit=()=>{ if(!disposed&&isCurrent()) changed(); };
    const swSupported=()=>softwareEnvironmentSupported(hooks);

    function softwareSnapshot() {
      return {
        active, pending, supported:swSupported(), controllable:swSupported(),
        managedBySystem:false, previewStream:active?outputStream:null,
        mode:active?'software':'software-ready', notice, errorCode
      };
    }

    function snapshot() {
      const nv=native?.snapshot?.()||{};
      if (nv.active || nv.controllable || nv.managedBySystem) {
        return {...nv,mode:'native',previewStream:null,notice:notice||nv.notice||'',errorCode:errorCode||nv.errorCode||''};
      }
      const sw=softwareSnapshot();
      return {
        ...nv, ...sw,
        recognized:Boolean(nv.recognized||sw.supported),
        supported:Boolean(nv.supported||sw.supported),
        controllable:Boolean(sw.controllable),
        active:Boolean(active),
        pending:Boolean(pending),
        notice:notice||'', errorCode:errorCode||''
      };
    }

    function bind(nextTrack) {
      const candidate=nextTrack?.kind==='video'?nextTrack:null;
      if (candidate===track) { native?.bind?.(candidate); return snapshot(); }
      if (active) void disableSoftware();
      track=candidate; native?.bind?.(candidate); notice=''; errorCode=''; emit();
      return snapshot();
    }

    function stopSoftwareMedia() {
      ++loopToken;
      try { outputTrack?.stop?.(); } catch (_) {}
      try { if(video){ video.pause?.(); video.srcObject=null; video.remove?.(); } } catch (_) {}
      try { canvas?.remove?.(); } catch (_) {}
      video=null; canvas=null; outputStream=null; outputTrack=null;
    }

    async function disableSoftware() {
      if (!active && !outputTrack) return true;
      const oldOutput=outputTrack;
      active=false;
      try {
        if (track && typeof hooks.replaceTrack==='function') await hooks.replaceTrack(track, oldOutput||track);
      } catch (_) {}
      stopSoftwareMedia(); notice=''; errorCode=''; emit(); return true;
    }

    async function prepareSoftware() {
      if (!track || track.readyState==='ended' || !swSupported()) throw new Error('software-unsupported');
      await ensureModel();
      if (!isCurrent() || disposed) throw new Error('call-changed');

      video=document.createElement('video');
      video.muted=true; video.defaultMuted=true; video.playsInline=true; video.autoplay=true;
      video.style.cssText='position:fixed;left:-10000px;top:-10000px;width:1px;height:1px;opacity:0;pointer-events:none';
      video.srcObject=new global.MediaStream([track]);
      document.body.appendChild(video);
      await video.play();
      for(let i=0;i<20 && !(video.videoWidth>0&&video.videoHeight>0);i++) await delay(50);
      if (!(video.videoWidth>0&&video.videoHeight>0)) throw new Error('camera-frame-unavailable');

      canvas=document.createElement('canvas');
      canvas.width=video.videoWidth; canvas.height=video.videoHeight;
      canvas.style.cssText='position:fixed;left:-10000px;top:-10000px;width:1px;height:1px;opacity:0;pointer-events:none';
      document.body.appendChild(canvas);
      outputStream=canvas.captureStream(20);
      outputTrack=outputStream.getVideoTracks?.()[0]||null;
      if(!outputTrack) throw new Error('canvas-track-unavailable');
      try { outputTrack.contentHint='motion'; } catch (_) {}
      outputTrack.enabled=track.enabled;

      const model=await ensureModel();
      const myToken=++loopToken;
      active=true;
      const process=async()=>{
        while(active&&!disposed&&isCurrent()&&myToken===loopToken){
          const started=performance.now();
          try {
            if(!track.enabled){
              const ctx=canvas.getContext('2d');ctx.fillStyle='#000';ctx.fillRect(0,0,canvas.width,canvas.height);
            } else {
              const segmentation=await model.segmentPerson(video,{internalResolution:'low',segmentationThreshold:0.70});
              if(!active||disposed||myToken!==loopToken)break;
              global.bodyPix.drawBokehEffect(canvas,video,segmentation,9,3,false);
            }
          } catch(error){
            if(active&&myToken===loopToken){ notice='Background blur stopped because local processing failed. Your normal camera is being restored.'; errorCode='software-processing-failed'; void disableSoftware(); }
            break;
          }
          const elapsed=performance.now()-started;
          await delay(Math.max(20,90-elapsed));
        }
      };
      void process();
      await hooks.replaceTrack(outputTrack, track);
      if(!isCurrent()||disposed) throw new Error('call-changed');
      emit();
      return true;
    }

    async function setEnabled(enabled) {
      if(disposed||!isCurrent()) return false;
      const target=Boolean(enabled), nv=native?.snapshot?.()||{};
      notice=''; errorCode='';
      if(nv.controllable){
        pending=true;emit();
        try{return await native.setEnabled(target);}finally{pending=false;emit();}
      }
      if(nv.managedBySystem){
        notice='Background blur is controlled by your device or operating system for this camera.';errorCode='system-managed';emit();return false;
      }
      if(!target) return disableSoftware();
      if(active) return true;
      if(!swSupported()){
        notice='Background blur is not available for this camera/browser. Your video call is unchanged.';errorCode='unsupported';emit();return false;
      }
      pending=true;notice='Preparing local background blur…';emit();
      try{
        const ok=await prepareSoftware();
        notice=ok?'Background blur is running locally on this device.':'';errorCode='';return ok;
      }catch(error){
        await disableSoftware();
        errorCode=String(error?.message||error?.name||'software-load-failed').slice(0,80);
        notice='Software background blur could not start. Your normal camera and call remain connected.';
        return false;
      }finally{pending=false;emit();}
    }

    async function toggle(){const v=snapshot();return setEnabled(!v.active);}
    function setCameraEnabled(enabled){try{if(track)track.enabled=Boolean(enabled);if(outputTrack)outputTrack.enabled=Boolean(enabled);}catch(_){} }
    function clearNotice(){notice='';errorCode='';native?.clearNotice?.();emit();}
    function dispose(){if(disposed)return;disposed=true;active=false;++loopToken;stopSoftwareMedia();native?.dispose?.();track=null;}

    return {bind,setEnabled,toggle,snapshot,clearNotice,setCameraEnabled,dispose};
  }

  global.TrinoTimeBackgroundBlur=Object.freeze({create,softwareFallback:true});
})(window);
