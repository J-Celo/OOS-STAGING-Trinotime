(function(){
  'use strict';
  const root=document.documentElement;
  let timer=0;
  const CONTROL='button,a,[role="button"],[role="tab"],summary,.log-tab,.settings-tab-btn,.team-tab-btn,.pod-tab,.pod-tab-solo,.nav-item,.sidebar-item,[data-route],[data-tab]';
  function isAdmin(){return document.body?.dataset?.trinoRole==='admin';}
  function mark(){
    if(!isAdmin())return;
    root.classList.add('tt-admin-interacting');
    if(timer)clearTimeout(timer);
    timer=setTimeout(()=>{timer=0;root.classList.remove('tt-admin-interacting');},360);
  }
  document.addEventListener('pointerdown',e=>{if(e.button===0&&e.target?.closest?.(CONTROL))mark();},{capture:true,passive:true});
  document.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target?.closest?.(CONTROL))mark();},true);
  window.addEventListener('trinotime:settings-opened',mark,{passive:true});
  window.addEventListener('pagehide',()=>{if(timer)clearTimeout(timer);timer=0;root.classList.remove('tt-admin-interacting');},{passive:true});
  window.TrinoTimeAdminInteractionPriority=Object.freeze({version:'2.0.0-rc19',mark});
})();
