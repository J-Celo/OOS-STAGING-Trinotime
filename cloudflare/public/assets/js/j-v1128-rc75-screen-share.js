/* RC75: screen media on the existing call PeerConnection. No recording/storage. */
(function (global) {
  'use strict';
  const LIMITS = Object.freeze({width:1280, height:720, frameRate:60, maxBitrate:1800000});
  const phases = new Set(['idle','requesting','starting','active','stopping','cancelled','unsupported','error','ended']);
  const stopTracks = stream => { for (const track of stream?.getTracks?.() || []) { try { track.stop(); } catch (_) {} } };
  const settingsOf = track => { const s=track?.getSettings?.() || {}; return {width:s.width, height:s.height, frameRate:s.frameRate}; };
  function withinLimits(s) {
    return Number.isFinite(s.width) && s.width>0 && s.width<=LIMITS.width &&
      Number.isFinite(s.height) && s.height>0 && s.height<=LIMITS.height &&
      Number.isFinite(s.frameRate) && s.frameRate>0 && s.frameRate<=LIMITS.frameRate;
  }
  function create(call, hooks) {
    let phase='idle', disposed=false, token=0, pending=false, stopPromise=null;
    let localStream=null, pendingStream=null, localTrack=null, localEnded=null;
    let transceiver=null, remoteStream=null, remoteTrack=null, remoteListeners=[];
    let remoteSupported=false, remoteActive=false, remoteSequence=-1, sequence=0, remoteMid=null;
    let captured=null, senderParameters=null, notice='';
    const current=()=>!disposed && hooks.isCurrent();
    const emit=()=>{ if(current()) hooks.changed(); };
    function transition(next, text='') {
      if(!phases.has(next)) throw new Error('Invalid screen-share state');
      phase=next; notice=text; emit();
    }
    function videoTransceivers() { return (call.pc?.getTransceivers?.() || []).filter(t=>t.receiver?.track?.kind==='video'); }
    function prepare(answering=false) {
      if(disposed || call.media!=='video' || !call.pc || transceiver) return;
      if(answering) {
        // The existing camera is first. Reuse only the additional video m-line offered by RC75.
        transceiver=videoTransceivers()[1] || null;
        if(transceiver && !transceiver.stopped) transceiver.direction='sendrecv';
      } else if(call.pc.addTransceiver) {
        transceiver=call.pc.addTransceiver('video',{direction:'sendrecv'});
      }
    }
    function sendState() {
      if(!current()) return false;
      const active=phase==='active';
      return hooks.signal({active,sequence:++sequence,mid:active?String(transceiver?.mid??''):''});
    }
    function receive(signal) {
      if(!current() || typeof signal?.active!=='boolean' || !Number.isSafeInteger(signal.sequence) || signal.sequence<0) return;
      if(signal.sequence<=remoteSequence) return;
      if(signal.active && !/^[A-Za-z0-9_-]{1,64}$/.test(String(signal.mid||''))) return;
      const expected=videoTransceivers()[1]?.mid;
      if(signal.active && expected!=null && String(expected)!==String(signal.mid)) return;
      remoteSequence=signal.sequence; remoteSupported=true; remoteActive=signal.active;
      remoteMid=signal.active?String(signal.mid):null;
      emit();
    }
    function removeRemoteListeners() {
      for(const [type,fn] of remoteListeners) remoteTrack?.removeEventListener?.(type,fn);
      remoteListeners=[];
    }
    function routeTrack(event) {
      if(disposed || call.media!=='video' || event.track?.kind!=='video') return false;
      const share=transceiver || videoTransceivers()[1];
      if(!share || (event.transceiver!==share && event.track!==share.receiver?.track)) return false;
      if(remoteMid!=null && share.mid!=null && String(share.mid)!==remoteMid) return false;
      if(remoteTrack!==event.track) {
        removeRemoteListeners();
        remoteTrack=event.track;
        remoteStream=new global.MediaStream([remoteTrack]);
        const changed=()=>emit();
        const ended=()=>{remoteActive=false;emit();};
        remoteListeners=[['unmute',changed],['mute',changed],['ended',ended]];
        for(const [type,fn] of remoteListeners) remoteTrack.addEventListener?.(type,fn);
      }
      emit(); return true;
    }
    function available() {
      const direction=transceiver?.currentDirection;
      return current() && call.status==='connected' && remoteSupported &&
        !!transceiver?.sender?.replaceTrack && !transceiver.stopped &&
        (direction==='sendrecv' || direction==='sendonly');
    }
    function supported() { return global.isSecureContext!==false && !!global.navigator?.mediaDevices?.getDisplayMedia; }
    async function applyBudget(track) {
      const sender=transceiver.sender;
      if(!sender.getParameters || !sender.setParameters) return;
      try {
        const params=sender.getParameters();
        if(!params.encodings?.length) return;
        for(const encoding of params.encodings) {
          encoding.maxFramerate=Math.min(encoding.maxFramerate ?? LIMITS.frameRate,LIMITS.frameRate);
          encoding.maxBitrate=Math.min(encoding.maxBitrate ?? LIMITS.maxBitrate,LIMITS.maxBitrate);
          const s=settingsOf(track);
          encoding.scaleResolutionDownBy=Math.max(1,encoding.scaleResolutionDownBy||1,s.width/LIMITS.width,s.height/LIMITS.height);
        }
        await sender.setParameters(params);
        senderParameters=sender.getParameters().encodings.map(e=>({maxFramerate:e.maxFramerate,maxBitrate:e.maxBitrate,scaleResolutionDownBy:e.scaleResolutionDownBy}));
      } catch (_) {
        // Capture constraints are mandatory. Sender parameters are a second, browser-dependent ceiling.
        senderParameters=null;
      }
    }
    function detachLocalListeners() {
      if(localEnded) localTrack?.removeEventListener?.('ended',localEnded);
      localEnded=null;
    }
    async function stop(reason='idle') {
      if(disposed) return;
      if(stopPromise) return stopPromise;
      ++token;
      const sender=transceiver?.sender;
      detachLocalListeners();
      // End capture before awaiting WebRTC work, including call-end/failed-start races.
      stopTracks(localStream); stopTracks(pendingStream);
      localStream=null; pendingStream=null; localTrack=null; captured=null;
      transition('stopping');
      sendState();
      stopPromise=(async()=>{
        try { if(sender?.track) await sender.replaceTrack(null); } catch (_) {}
        if(current()) transition(reason, reason==='ended'?'Screen sharing ended.':'');
      })();
      try { await stopPromise; } finally { stopPromise=null; }
    }
    async function start() {
      if(!current() || pending || stopPromise || phase==='active') return;
      if(!supported()) { transition('unsupported','Screen sharing is unavailable in this browser. You can still view a shared screen.'); return; }
      if(!available()) { transition('unsupported','Both people must open the updated app and connect a new video call before sharing.'); return; }
      pending=true; const request=++token; let stream=null;
      transition('requesting');
      try {
        // Called directly from the click; never trigger capture on timers or reconnect.
        stream=await global.navigator.mediaDevices.getDisplayMedia({audio:false,video:{width:{ideal:1280,max:1280},height:{ideal:720,max:720},frameRate:{ideal:60,max:60}}});
        if(!current() || request!==token) { stopTracks(stream); return; }
        pendingStream=stream;
        const track=stream.getVideoTracks()[0];
        if(!track || track.readyState==='ended') throw new Error('capture-ended');
        localTrack=track;
        localEnded=()=>{stop('ended').catch(()=>{});};
        track.addEventListener('ended',localEnded);
        // Defensive: display audio is never mixed with the existing microphone.
        for(const audio of stream.getAudioTracks()) {audio.stop();stream.removeTrack(audio);}
        transition('starting');
        if(!track.applyConstraints) throw new Error('capture-cap');
        await track.applyConstraints({width:{max:LIMITS.width},height:{max:LIMITS.height},frameRate:{max:LIMITS.frameRate}});
        if(!current() || request!==token || track.readyState==='ended') {stopTracks(stream);return;}
        captured=settingsOf(track);
        if(!withinLimits(captured)) throw new Error('capture-cap');
        try { track.contentHint='detail'; } catch (_) {}
        await transceiver.sender.replaceTrack(track);
        if(!current() || request!==token || track.readyState==='ended') {
          stopTracks(stream);
          if(transceiver?.sender?.track===track) {try{await transceiver.sender.replaceTrack(null);}catch(_){}}
          return;
        }
        await applyBudget(track);
        if(!current() || request!==token || track.readyState==='ended') {stopTracks(stream);return;}
        localStream=stream;pendingStream=null;
        transition('active');
        if(!sendState()) throw new Error('signal');
      } catch(error) {
        stopTracks(stream);
        if(!current() || request!==token) return;
        await stop();
        if(!current()) return;
        const code=String(error?.name||'');
        if(code==='NotAllowedError' || code==='AbortError') {
          // Browsers may use the same error for cancellation and permission denial.
          transition('cancelled','Screen sharing was cancelled or permission was not granted. Your call is still connected.');
        } else if(error?.message==='capture-cap' || code==='OverconstrainedError') {
          transition('error','This source could not be limited to 1280 x 720 at up to 60 fps. Choose another source.');
        } else {
          transition('error','Screen sharing could not start. Your camera and microphone are unchanged. Please try again.');
        }
      } finally {pending=false;emit();}
    }
    function monitor() {
      // Reuse the existing call render tick; no additional polling timer or frame processing.
      if(phase==='active' && localTrack) {
        captured=settingsOf(localTrack);
        if(!withinLimits(captured)) {stop('error').then(()=>{if(current())transition('error','Sharing stopped because the source exceeded the quality limit.');});}
      }
    }
    function snapshot() {
      return {phase,pending,notice,available:available(),supported:supported(),remoteSupported,
        active:phase==='active',localStream,remoteStream,remoteActive,
        remoteWaiting:remoteActive && (!remoteTrack || remoteTrack.muted || remoteTrack.readyState==='ended'),
        requested:LIMITS,captured:captured?{...captured}:null,senderParameters};
    }
    function dispose() {
      if(disposed) return;
      disposed=true; ++token;
      detachLocalListeners();removeRemoteListeners();
      stopTracks(localStream);stopTracks(pendingStream);stopTracks(remoteStream);
      if(transceiver?.sender?.track) {try{Promise.resolve(transceiver.sender.replaceTrack(null)).catch(()=>{});}catch(_){}}
      localStream=null;pendingStream=null;localTrack=null;remoteStream=null;remoteTrack=null;phase='idle';
    }
    return {prepare,receive,routeTrack,start,stop,publish:sendState,snapshot,monitor,dispose};
  }
  global.TrinoTimeScreenShare=Object.freeze({create,limits:LIMITS});
})(window);
