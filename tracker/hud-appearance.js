/* Presentation only. Tracking and synchronization stay in their existing modules. */
(() => {
  'use strict';
  if (window.TrinoTimeHudAppearance) return;
  const KEY='ttHudAppearanceV1',panels=new Set();
  let prefs={theme:'white',position:null},changed=false;
  const valid=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
  const save=()=>{changed=true;try{chrome.storage.local.set({[KEY]:prefs});}catch(_){}};
  function place(root){
    if(!valid(prefs.position)||root.hidden||root.style.display==='none')return;
    const r=root.getBoundingClientRect(),gap=6;
    Object.assign(root.style,{left:Math.max(gap,Math.min(prefs.position.x,innerWidth-r.width-gap))+'px',top:Math.max(gap,Math.min(prefs.position.y,innerHeight-r.height-gap))+'px',right:'auto',bottom:'auto'});
  }
  function apply(){panels.forEach(root=>{root.dataset.ttTheme=prefs.theme;root.querySelectorAll('[data-theme-choice]').forEach(b=>b.setAttribute('aria-checked',String(b.dataset.themeChoice===prefs.theme)));place(root);});}
  try{chrome.storage.local.get(KEY,r=>{if(!changed&&r?.[KEY]){const p=r[KEY];prefs={theme:['white','glass','transparent'].includes(p.theme)?p.theme:'white',position:valid(p.position)?p.position:null};apply();}});}catch(_){}
  window.TrinoTimeHudAppearance={attach(root){
    if(panels.has(root)){place(root);return;}
    for(const old of panels)if(!old.isConnected)panels.delete(old);
    panels.add(root);root.dataset.ttHud='';
    const style=document.createElement('style');style.textContent=`
      [data-tt-hud]{padding:0!important;height:auto!important;min-height:44px;overflow:visible!important;border-radius:12px!important;box-shadow:0 4px 16px #0f234516!important;transition:none!important;}
      [data-tt-hud]>[data-tt-body]{border-radius:inherit;overflow:hidden;}
      [data-tt-hud]>button{position:absolute!important;top:6px!important;right:6px!important;width:22px!important;height:22px!important;border-radius:7px!important;border:1px solid #94a3b82b!important;box-shadow:none!important;background:#ffffff85!important;color:#334155!important;padding:0!important;display:flex!important;align-items:center;justify-content:center;cursor:pointer;z-index:2;font:600 14px/1 system-ui;}
      [data-tt-hud]>[data-tt-theme-toggle]{right:31px!important;}
      [data-tt-hud]>[data-tt-drag]{left:5px!important;right:auto!important;width:12px!important;background:transparent!important;border:0!important;color:#7b8ba2!important;cursor:grab;touch-action:none;}
      [data-tt-title]{cursor:grab;touch-action:none;margin-left:10px;letter-spacing:.055em!important;font-size:10px!important;white-space:nowrap;}
      [data-tt-hud]>button:hover{background:#ffffffc9!important;color:#0f2e6d!important;}
      [data-tt-hud] button:focus-visible{outline:2px solid #3b82f6;outline-offset:2px;}
      [data-tt-hud][data-tt-theme="white"]{background:#fff!important;backdrop-filter:none!important;}
      [data-tt-hud][data-tt-theme="glass"]{background:rgba(234,243,252,.16)!important;backdrop-filter:blur(5px) saturate(125%)!important;border-color:#ffffff75!important;box-shadow:inset 0 1px 0 #ffffff80,0 4px 16px #0f23451a!important;}
      [data-tt-hud][data-tt-theme="glass"] [data-tt-body] div{background:transparent!important;}
      [data-tt-hud][data-tt-theme="glass"] [data-tt-body]{text-shadow:0 1px 2px #ffffff80;}
      [data-tt-hud][data-tt-theme="transparent"]{background:transparent!important;backdrop-filter:none!important;box-shadow:none!important;border-color:#64748b33!important;}
      [data-tt-hud][data-tt-theme="transparent"] [data-tt-body] div{background:transparent!important;}
      [data-tt-hud][data-tt-theme="transparent"] [data-tt-body]{text-shadow:0 0 2px #fff,0 0 4px #ffffffaa;}
      [data-tt-menu]{position:absolute;top:32px;right:6px;z-index:5;width:164px;padding:7px;background:#fffffff5;border:1px solid #e2e8f0;border-radius:10px;box-shadow:0 8px 28px #0f234526;box-sizing:border-box;color:#334155;text-shadow:none;font:600 11px system-ui;}
      [data-tt-menu][hidden]{display:none!important;}
      [data-tt-menu] small{display:block;padding:3px 6px 6px;font:700 9px system-ui;color:#7b8ba2;letter-spacing:.08em;}
      [data-tt-menu] button{display:flex;align-items:center;gap:8px;width:100%;padding:7px 6px;border:0;border-radius:6px;background:transparent;color:#334155;text-align:left;font:600 11px system-ui;cursor:pointer;}
      [data-tt-menu] button:hover{background:#f1f5f9;}
      [data-tt-menu] button[aria-checked="true"]{background:#edf3fc;color:#16448b;}
      [data-tt-menu] button[aria-checked="true"]::after{content:'✓';margin-left:auto;}
      [data-tt-menu] i{width:12px;height:12px;border:1px solid #b9c5d5;border-radius:4px;box-sizing:border-box;background:#fff;}
      [data-theme-choice="glass"] i{background:linear-gradient(135deg,#d7e5f5aa,#ffffff22);}
      [data-theme-choice="transparent"] i{background:repeating-linear-gradient(45deg,#e2e8f0 0 3px,#fff 3px 6px);}
    `;
    const dragButton=document.createElement('button');dragButton.type='button';dragButton.dataset.ttDrag='';dragButton.textContent='⠿';dragButton.setAttribute('aria-label','Move tracker. Use arrow keys to move; Home to reset.');dragButton.title='Drag tracker · Arrow keys to move · Home to reset';
    const theme=document.createElement('button');theme.type='button';theme.dataset.ttThemeToggle='';theme.setAttribute('aria-label','Tracker appearance');theme.setAttribute('aria-haspopup','menu');theme.setAttribute('aria-expanded','false');theme.title='Theme: White, Liquid Glass, Full Transparent';theme.innerHTML='<svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="5.4" stroke="currentColor" stroke-width="1.2"/><path d="M8 2.6a5.4 5.4 0 0 0 0 10.8Z" fill="currentColor" opacity=".6"/></svg>';
    const menu=document.createElement('div');menu.dataset.ttMenu='';menu.hidden=true;menu.setAttribute('role','menu');menu.setAttribute('aria-label','Tracker theme');menu.innerHTML='<small>APPEARANCE</small>'+[['white','White'],['glass','Liquid Glass'],['transparent','Full Transparent']].map(([v,t])=>`<button type="button" role="menuitemradio" data-theme-choice="${v}" aria-checked="false"><i aria-hidden="true"></i>${t}</button>`).join('');
    root.append(style,dragButton,theme,menu);
    const close=()=>{menu.hidden=true;theme.setAttribute('aria-expanded','false');};
    theme.onclick=()=>{const open=menu.hidden;panels.forEach(p=>{const m=p.querySelector('[data-tt-menu]');if(m)m.hidden=true;p.querySelector('[data-tt-theme-toggle]')?.setAttribute('aria-expanded','false');});menu.hidden=!open;theme.setAttribute('aria-expanded',String(open));if(open){const r=root.getBoundingClientRect();menu.style.top=r.top+32+140>innerHeight?'auto':'32px';menu.style.bottom=r.top+32+140>innerHeight?'32px':'auto';}};
    menu.onclick=e=>{const b=e.target.closest('[data-theme-choice]');if(!b)return;prefs.theme=b.dataset.themeChoice;save();apply();close();theme.focus();theme.blur();};
    menu.onkeydown=e=>{const items=[...menu.querySelectorAll('button')];const i=items.indexOf(document.activeElement);if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();e.stopPropagation();items[e.key==='Home'?0:e.key==='End'?2:(i+(e.key==='ArrowDown'?1:2))%3].focus();}};
    root.addEventListener('keydown',e=>{if(e.key==='Escape'&&!menu.hidden){e.stopPropagation();close();theme.focus();}});
    document.addEventListener('pointerdown',e=>{if(!root.contains(e.target))close();},true);
    let drag=null;
    root.addEventListener('pointerdown',e=>{
      if(e.button!==0||e.target.closest('[data-tt-menu]'))return;
      const r=root.getBoundingClientRect(),control=e.target.closest('button,select,input,a,label');
      if(control!==dragButton&&(control||e.clientY-r.top>29))return;
      e.preventDefault();e.stopPropagation();close();drag={id:e.pointerId,dx:e.clientX-r.left,dy:e.clientY-r.top};root.setPointerCapture(e.pointerId);dragButton.style.cursor='grabbing';
    });
    root.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;e.stopPropagation();prefs.position={x:e.clientX-drag.dx,y:e.clientY-drag.dy};panels.forEach(place);});
    const finish=()=>{if(!drag)return;drag=null;dragButton.style.cursor='grab';const r=root.getBoundingClientRect();prefs.position={x:r.left,y:r.top};save();dragButton.blur();};
    for(const ev of ['pointerup','pointercancel','lostpointercapture'])root.addEventListener(ev,finish);
    dragButton.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home'].includes(e.key))return;e.preventDefault();e.stopPropagation();const r=root.getBoundingClientRect(),n=e.shiftKey?20:5;prefs.position=e.key==='Home'?{x:12,y:innerHeight-r.height-12}:{x:r.left+(e.key==='ArrowLeft'?-n:e.key==='ArrowRight'?n:0),y:r.top+(e.key==='ArrowUp'?-n:e.key==='ArrowDown'?n:0)};panels.forEach(place);save();};
    new ResizeObserver(()=>place(root)).observe(root);apply();
  },place};
  addEventListener('resize',()=>panels.forEach(place));
})();
