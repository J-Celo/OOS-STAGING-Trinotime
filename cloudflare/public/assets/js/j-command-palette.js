(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const NAV='Tabs & Navigation', ADMIN='Security & Admin Controls', AGENTS='Agents';
  const normalize = value => String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  function score(query,text) {
    const q=normalize(query),hay=normalize(text);
    if(!q)return 1;
    let total=0;
    for(const token of q.split(' ')){
      const index=hay.indexOf(token);
      if(index>=0){total+=100+(index===0?30:hay[index-1]===' '?15:0);continue;}
      let pos=-1,gaps=0;
      for(const ch of token){const next=hay.indexOf(ch,pos+1);if(next<0)return 0;gaps+=next-pos-1;pos=next;}
      total+=Math.max(1,30-gaps);
    }
    return total;
  }
  function actor(){return window.TrinoTimeCore?.permissions?.actor?.()||{};}
  function allowed(){const a=actor(),app=$('#appRoot');return a.authenticated===true&&['admin','team_leader'].includes(a.role)&&!!app&&!app.hidden&&getComputedStyle(app).display!=='none';}
  function usable(node){
    if(!node||node.disabled||node.hidden||node.style.display==='none'||node.getAttribute('aria-disabled')==='true')return false;
    // Premium moves these controls to the sidebar; CSS hides only their duplicate header buttons.
    return getComputedStyle(node).display!=='none'||node.hasAttribute('data-tt-sidebar-tool');
  }
  let dialog,input,list,status,trigger,results=[],active=0,returnFocus=null,refreshFrame=0;
  function permitted(permission){return !permission||window.TrinoTimeCore?.permissions?.can?.(permission,{pod:actor().pod})===true;}
  const tools=[
    ['settingsGearBtn','Settings','Preferences appearance theme',NAV],
    ['openShiftSettingsBtn','Shift Times','Shift settings hours',NAV],
    ['addEmpBtn','Add / Assign Agent','New roster member',NAV],
    ['openDayOffBtn','Schedule & Days Off','Calendar recurring schedule leave',NAV],
    ['openPodTeamManagementBtn','POD & Role Management','Teams assignments roster',ADMIN,'admin.authenticated'],
    ['tlAdminOverviewBtn','Team Leader Status','TL live status',NAV],
    ['exportMenuBtn','Export Center','CSV Excel download payroll',NAV],
    ['systemHealthDiagnosticsBtn','System Status','Diagnostics health sync',ADMIN,'system.health.view'],
    ['workspaceChatBtn','Workspace Messaging','Chat messages conversations',NAV],
    ['notifBellBtn','Notifications','Announcements mentions',NAV],
    ['headerSpeedtestBtn','Speedtest','Network connection',NAV],
    ['openShiftGuidelinesBtn','Shift Guidelines','Help rules',NAV],
    ['leaveRequestFloater','Leave Requests','Leave calendar approvals',NAV]
  ];
  function clickNode(node){if(!allowed()||!usable(node))return false;node.click();return true;}
  function catalog(){
    if(!allowed())return [];
    const entries=[],seen=new Set();
    const add=(id,label,group,keywords,run,valid)=>{if(seen.has(id)||!label)return;seen.add(id);entries.push({id,label,group,keywords,run,valid});};
    const admin=actor().role==='admin';
    if(admin)$$('#ttAdminCommandBar [data-admin-view]').forEach(node=>{
      const view=node.dataset.adminView;
      add('view:'+view,node.textContent.trim(),NAV,'workspace '+view,()=>window.TrinoTimeAdminCommandCenter?.setView(view),()=>allowed()&&actor().role==='admin');
    });
    $$('.log-tab[data-tab]').forEach(node=>{
      if(!usable(node))return;
      const tab=node.dataset.tab;
      add('log:'+tab,tab==='roster'?'Roster Management':node.textContent.trim(),NAV,'attendance history '+tab,()=>clickNode(node),()=>usable(node));
    });
    for(const [id,label,keywords,group,permission] of tools){
      const node=$('#'+id);if(!usable(node)||!permitted(permission))continue;
      add(id,label,group,keywords,()=>clickNode(node),()=>usable(node)&&permitted(permission));
    }
    $$('.settings-tab-btn[data-settings-tab]').forEach(node=>{
      if(!usable(node)||!usable($('#settingsGearBtn')))return;
      add('settings:'+node.dataset.settingsTab,'Settings · '+node.textContent.trim(),ADMIN,'preferences '+node.dataset.settingsTab,()=>{
        if($('#settingsOverlay')?.classList.contains('open')||clickNode($('#settingsGearBtn')))clickNode(node);
      },()=>usable(node));
    });
    if(!admin){
      const log=$('.log-section');
      if(log)add('attendance','Attendance',NAV,'time log records',()=>log.scrollIntoView({block:'start'}),()=>allowed());
      const panel=$('#agentSecurityPanel');
      if(usable(panel)&&permitted('security.agent.password.reset'))add('account-security','Account Security',ADMIN,'password reset identity',()=>panel.scrollIntoView({block:'start'}),()=>usable(panel)&&permitted('security.agent.password.reset'));
    }
    if(admin){
      const adminTools=$('[data-admin-action="tools"]');
      if(adminTools)add('admin-tools','Admin Tools',ADMIN,'tools control center',()=>{window.TrinoTimeAdminCommandCenter?.closeInspector?.();adminTools.click();},()=>actor().role==='admin');
      const security=$('[data-admin-workforce="security"]');
      if(usable(security))add('account-security','Account Security',ADMIN,'password identity accounts',()=>clickNode(security),()=>actor().role==='admin'&&usable(security));
      const rates=$('#totalsTabBtn');
      if(usable(rates)&&permitted('finance.hourly_rate.edit'))add('rates','Rate Overrides',ADMIN,'hourly rate pesos payroll credited hours',()=>clickNode(rates),()=>permitted('finance.hourly_rate.edit')&&usable(rates));
      const inspector=$('[data-admin-action="inspector"]');
      if(usable(inspector))add('inspector','Selected Agent Inspector',AGENTS,'profile attendance schedule access',()=>clickNode(inspector),()=>actor().role==='admin'&&usable(inspector));
    }
    const directory=window.TrinoTimeProfileDirectory;
    for(const person of directory?.commandCandidates?.()||[]){
      const label=person.displayName||person.name;
      add('agent:'+person.name,label,AGENTS,person.name+' '+person.pod+' '+person.role,()=>directory.open(person.name),()=>directory.canOpen(person.name));
      entries[entries.length-1].detail=person.pod+' · '+person.role;
    }
    return entries;
  }
  function select(index){
    active=results.length?(index+results.length)%results.length:0;
    [...list.querySelectorAll('[role="option"]')].forEach((node,i)=>node.setAttribute('aria-selected',String(i===active)));
    if(results.length){input.setAttribute('aria-activedescendant','ttCommandResult'+active);$('#ttCommandResult'+active)?.scrollIntoView({block:'nearest'});}
    else input.removeAttribute('aria-activedescendant');
  }
  function render(){
    if(!dialog.open)return;
    if(!allowed()){close();return;}
    const ranked=catalog().map(entry=>({...entry,rank:score(input.value,entry.label+' '+entry.keywords)})).filter(entry=>entry.rank>0).sort((a,b)=>b.rank-a.rank||a.label.localeCompare(b.label));
    const selectedId=results[active]?.id;
    results=[];list.replaceChildren();
    for(const group of [NAV,ADMIN,AGENTS]){
      const matches=ranked.filter(entry=>entry.group===group).slice(0,20);if(!matches.length)continue;
      const section=document.createElement('div');section.setAttribute('role','group');section.setAttribute('aria-label',group);
      const title=document.createElement('div');title.className='tt-command-group';title.textContent=group;title.setAttribute('aria-hidden','true');section.append(title);
      for(const entry of matches){
        const index=results.length;results.push(entry);
        const row=document.createElement('div');row.className='tt-command-result';row.id='ttCommandResult'+index;row.setAttribute('role','option');row.setAttribute('aria-selected','false');
        const label=document.createElement('strong');label.textContent=entry.label;row.append(label);
        if(entry.detail){const detail=document.createElement('small');detail.textContent=entry.detail;row.append(detail);}
        row.addEventListener('pointerdown',event=>event.preventDefault());row.addEventListener('click',()=>execute(index));section.append(row);
      }
      list.append(section);
    }
    status.textContent=results.length?`${results.length} results${ranked.length>results.length?' · refine your search for more':''}.`:'No matches. Try a tool, agent name, or POD.';
    select(Math.max(0,results.findIndex(entry=>entry.id===selectedId)));
  }
  function close(){if(!dialog?.open)return;dialog.close();input.value='';results=[];list.replaceChildren();trigger.setAttribute('aria-expanded','false');if(returnFocus?.isConnected&&returnFocus.getClientRects().length)returnFocus.focus({preventScroll:true});returnFocus=null;}
  function open(){if(!allowed()||dialog.open)return;returnFocus=document.activeElement;dialog.showModal();trigger.setAttribute('aria-expanded','true');input.value='';render();input.focus();}
  function execute(index){const entry=results[index];if(!entry)return;if(!allowed()||!entry.valid()){render();return;}close();entry.run();}
  function refresh(){if(refreshFrame)return;refreshFrame=requestAnimationFrame(()=>{refreshFrame=0;trigger.hidden=!allowed();if(dialog.open)render();});}
  function init(){
    const rail=$('#settingsGearBtn')?.parentElement;if(!rail)return;
    trigger=document.createElement('button');trigger.id='ttCommandTrigger';trigger.type='button';trigger.hidden=true;trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-expanded','false');trigger.setAttribute('aria-controls','ttCommandPalette');trigger.setAttribute('aria-label','Search tabs, tools, settings');
    trigger.innerHTML='<span aria-hidden="true">⌕</span><span class="tt-command-trigger-label">Search tabs…</span><kbd>Ctrl K</kbd>';
    if(/Mac|iPhone|iPad/.test(navigator.platform))trigger.querySelector('kbd').textContent='⌘ K';
    rail.prepend(trigger);trigger.addEventListener('click',open);
    dialog=document.createElement('dialog');dialog.id='ttCommandPalette';dialog.setAttribute('aria-label','Search tabs, tools, settings and agents');
    dialog.innerHTML='<div class="tt-command-head"><label class="tt-command-sr" for="ttCommandInput">Search tabs, tools, settings and agents</label><input id="ttCommandInput" type="text" placeholder="Search tabs, tools, settings…" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls="ttCommandResults"><button type="button" aria-label="Close command palette">Esc</button></div><div id="ttCommandStatus" role="status" aria-live="polite"></div><div id="ttCommandResults" role="listbox" aria-label="Commands and agents"></div><div class="tt-command-footer">↑ ↓ Navigate · Enter Open · Esc Close</div>';
    document.body.append(dialog);input=$('#ttCommandInput');list=$('#ttCommandResults');status=$('#ttCommandStatus');
    input.addEventListener('input',render);dialog.querySelector('button').addEventListener('click',close);dialog.addEventListener('cancel',event=>{event.preventDefault();close();});dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();}});
    // Capture at window level so older modal keyboard handlers cannot act behind the palette.
    window.addEventListener('keydown',event=>{
      if((event.ctrlKey||event.metaKey)&&!event.altKey&&event.key.toLowerCase()==='k'&&allowed()){event.preventDefault();event.stopImmediatePropagation();dialog.open?close():open();return;}
      if(!dialog.open)return;
      event.stopImmediatePropagation();if(event.isComposing)return;
      if(event.key==='Escape'){event.preventDefault();close();}
      else if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();select(active+(event.key==='ArrowDown'?1:-1));}
      else if(event.key==='Enter'&&document.activeElement===input){event.preventDefault();execute(active);}
      else if(event.key==='Tab'){event.preventDefault();const button=dialog.querySelector('button');(document.activeElement===input?button:input).focus();}
    },true);
    const observer=new MutationObserver(refresh);observer.observe(document.body,{attributes:true,attributeFilter:['data-trino-role']});
    const app=$('#appRoot');if(app)observer.observe(app,{attributes:true,attributeFilter:['style','hidden','data-tt-data-loading']});
    const selectNode=$('#empSelect');if(selectNode)observer.observe(selectNode,{childList:true,subtree:true});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)close();else refresh();});window.addEventListener('focus',refresh);refresh();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
