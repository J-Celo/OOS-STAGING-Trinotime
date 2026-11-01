/* TrinoTime Staging — Smart Floating Dock v2 / Frosted Teal Glass.
 * Layout only: the real feature launchers, listeners and server permissions are unchanged.
 * The QA launcher appears only after the existing QA API grants it and unhides it.
 */
(()=>{
 'use strict';
 if(window.__ttStagingSmartDockV2)return;
 window.__ttStagingSmartDockV2=true;
 const doc=document.documentElement;
 const key='trinotime.staging.smartdock.v2';
 const items=[
  {id:'leaveRequestFloater',label:'Leave requests'},
  {id:'aiChatFloater',label:'TrinoTime AI'},
  {id:'workspaceChatBtn',label:'Messages'},
  {id:'profileDirectorySearchFab',label:'Search profiles'},
  {id:'oosQaDock',label:'QA dashboard'}
 ];
 const byId=id=>document.getElementById(id);
 const clip=(v,a,b)=>Math.min(Math.max(Number.isFinite(v)?v:0,a),b);
 const saved=(()=>{try{return JSON.parse(localStorage.getItem(key)||'{}')}catch(_){return {}}})();
 let collapsed=saved.collapsed===true;
 let shift=clip(Number(saved.shift)||0,0,2000);
 let activePointer=null,suppressClick=false,scheduled=false;
 const persist=()=>{try{localStorage.setItem(key,JSON.stringify({collapsed,shift}))}catch(_){}};
 const glass=document.createElement('div');glass.id='ttSmartDockGlass';glass.hidden=true;glass.setAttribute('aria-hidden','true');
 const controller=document.createElement('button');controller.id='ttSmartDockControl';controller.type='button';controller.hidden=true;
 controller.setAttribute('aria-controls',items.map(x=>x.id).join(' '));
 controller.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg><span class="tt-smartdock-attention" hidden aria-hidden="true"></span>';
 document.body.append(glass,controller);
 function dimensions(){
  if(window.matchMedia('(max-height:430px)').matches)return {size:36,step:40,pad:7,control:32,gap:4};
  if(window.matchMedia('(max-width:480px)').matches)return {size:40,step:45,pad:10,control:36,gap:5};
  return {size:44,step:50,pad:12,control:38,gap:6};
 }
 function appActive(){const root=byId('appRoot');return !!root&&!root.hidden&&!root.hasAttribute('inert')&&root.getAttribute('aria-hidden')!=='true';}
 function authorizedVisible(el){
  if(!el||el.hidden||el.hasAttribute('inert')||el.getAttribute('aria-hidden')==='true')return false;
  if(el.style.display==='none'||el.style.visibility==='hidden')return false;
  return true; // Original authenticated workspace determines eligibility. Never override its hidden flags.
 }
 function badgeCount(el){
  if(!el||el.hidden||!el.textContent)return 0;
  const n=Number.parseInt(el.textContent.trim(),10);
  if(!Number.isFinite(n)||n<=0)return 0;
  if(el.id==='leaveRequestFloaterBadge'&&!el.classList.contains('show'))return 0;
  return n;
 }
 function updateBadge(){
  const unread=badgeCount(byId('workspaceChatBadge'));
  const pending=badgeCount(byId('leaveRequestFloaterBadge'));
  controller.querySelector('.tt-smartdock-attention').hidden=!(unread||pending);
  controller.setAttribute('aria-description',[unread?unread+' unread messages':'',pending?pending+' leave notifications':''].filter(Boolean).join('; ')||'No pending notifications');
 }
 function applyPosition(n){
  const {size,step,pad,control}=dimensions();
  const height=pad*2+control+(n?8+n*size+(n-1)*(step-size):0);
  shift=clip(shift,0,Math.max(0,window.innerHeight-height-22));
  doc.style.setProperty('--tt-smartdock-y',Math.round(shift)+'px');
  doc.style.setProperty('--tt-glass-height',height+'px');
  doc.style.setProperty('--tt-glass-controller-offset',(pad+(n?n*step+2:0))+'px');
 }
 function sync(){
  const active=appActive();
  let idx=0;
  for(const item of items){
   const el=byId(item.id);
   if(!el)continue;
   const available=active&&authorizedVisible(el);
   el.classList.toggle('tt-glass-item',available);
   if(available){el.dataset.ttDockSlot=String(idx++);}else delete el.dataset.ttDockSlot;
   const btn=item.id==='oosQaDock'?byId('oosQaToggle'):el;
   if(btn){btn.dataset.ttSmartdockLabel=item.label;btn.title=item.label;}
  }
  applyPosition(collapsed?0:idx);
  doc.classList.add('tt-glass-ready');
  doc.classList.toggle('tt-smartdock-collapsed',collapsed);
  const show=active&&idx>0;
  glass.hidden=!show;
  controller.hidden=!show;
  controller.setAttribute('aria-expanded',String(!collapsed));
  controller.setAttribute('aria-label',collapsed?'Expand floating apps':'Collapse floating apps');
  controller.dataset.ttSmartdockLabel=collapsed?'Expand floating apps • drag to move':'Collapse floating apps • drag to move';
  updateBadge();
 }
 function queueSync(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;sync();});}
 controller.addEventListener('pointerdown',event=>{
  if(event.button!==0||controller.hidden)return;
  activePointer={id:event.pointerId,start:event.clientY,base:shift,moved:false};
  if(controller.setPointerCapture)controller.setPointerCapture(event.pointerId);
 });
 controller.addEventListener('pointermove',event=>{
  if(!activePointer||event.pointerId!==activePointer.id)return;
  if(Math.abs(event.clientY-activePointer.start)>=6)activePointer.moved=true;
  if(!activePointer.moved)return;
  const elCount=items.filter(item=>byId(item.id)?.classList.contains('tt-glass-item')).length;
  const {size,step,pad,control}=dimensions();
  const height=pad*2+control+(elCount?8+elCount*size+(elCount-1)*(step-size):0);
  shift=clip(activePointer.base+(activePointer.start-event.clientY),0,Math.max(0,window.innerHeight-height-22));
  doc.style.setProperty('--tt-smartdock-y',Math.round(shift)+'px');
 });
 function finishDrag(event){
  if(!activePointer||activePointer.id!==event.pointerId)return;
  if(activePointer.moved){suppressClick=true;persist();}
  activePointer=null;
 }
 controller.addEventListener('pointerup',finishDrag);
 controller.addEventListener('pointercancel',event=>{if(activePointer?.id===event.pointerId){activePointer=null;queueSync();}});
 controller.addEventListener('click',event=>{
  if(suppressClick){suppressClick=false;event.preventDefault();return;}
  collapsed=!collapsed;
  sync();persist();
 });
 controller.addEventListener('keydown',event=>{
  if((event.altKey||event.ctrlKey)&&['ArrowUp','ArrowDown'].includes(event.key)){
   event.preventDefault();shift=clip(shift+(event.key==='ArrowUp'?16:-16),0,2000);sync();persist();
  }
 });
 window.addEventListener('resize',queueSync,{passive:true});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)queueSync();});
 const root=byId('appRoot');
 if(root)new MutationObserver(queueSync).observe(root,{attributes:true,attributeFilter:['inert','aria-hidden','hidden']});
 for(const {id} of items){
  const el=byId(id);
  if(!el)continue;
  new MutationObserver(queueSync).observe(el,{attributes:true,attributeFilter:['hidden','aria-hidden','style','inert']});
 }
 const connectQa=()=>{
  const qa=byId('oosQaDock');
  if(!qa)return false;
  new MutationObserver(queueSync).observe(qa,{attributes:true,attributeFilter:['hidden','aria-hidden','style','inert']});
  queueSync();return true;
 };
 if(!byId('oosQaDock')){
  const qaWatcher=new MutationObserver(()=>{if(connectQa())qaWatcher.disconnect()});
  qaWatcher.observe(document.body,{childList:true,subtree:true});
 }else connectQa();
 for(const id of ['workspaceChatBadge','leaveRequestFloaterBadge']){
  const el=byId(id);if(el)new MutationObserver(updateBadge).observe(el,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['hidden','class']});
 }
 sync();
})();
