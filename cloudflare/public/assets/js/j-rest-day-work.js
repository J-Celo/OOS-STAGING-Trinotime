(() => {
  'use strict';
  let row,input,note,identity='';
  const bridge=()=>window.TrinoTimeCore?.restDayWork;
  function refresh(){
    if(document.hidden)return;
    const app=document.querySelector('#appRoot');
    if(!app||app.hidden||getComputedStyle(app).display==='none'){bridge()?.clear();if(row)row.hidden=true;identity='';return;}
    const state=bridge()?.snapshot();
    const next=state?[state.name,state.pod,state.date].join('|'):'';
    if(identity&&identity!==next)bridge()?.clear();
    identity=next;
    if(!row)return;
    row.hidden=!state||!state.dayOff;
    if(row.hidden)return;
    input.checked=state.enabled;input.disabled=state.started||state.blocked;
    note.textContent=state.blocked?'Approved leave is active. Work on Day Off cannot override leave.':state.started?'This shift is recorded as Rest Day Work. Overtime still requires approval.':`For your own shift today (${state.date}). Records Rest Day Work; overtime still requires approval.`;
  }
  function init(){
    const host=document.querySelector('#settingsPanelAppearance');if(!host)return;
    row=document.createElement('label');row.id='ttRestDayWork';row.hidden=true;
    const copy=document.createElement('span'),title=document.createElement('strong');title.textContent='Work on Day Off';note=document.createElement('small');copy.append(title,note);
    input=document.createElement('input');input.type='checkbox';input.setAttribute('role','switch');input.setAttribute('aria-label','Work on Day Off for my shift today');row.append(copy,input);host.prepend(row);
    input.addEventListener('change',()=>{try{bridge().set(input.checked);refresh();}catch(error){input.checked=!input.checked;note.textContent=error.message;}});
    const observer=new MutationObserver(()=>{if(!['agent','teamleader'].includes(document.body.dataset.trinoRole))bridge()?.clear();refresh();});observer.observe(document.body,{attributes:true,attributeFilter:['data-trino-role']});
    const app=document.querySelector('#appRoot');if(app)observer.observe(app,{attributes:true,attributeFilter:['style','hidden']});
    const settings=document.querySelector('#settingsOverlay');if(settings)observer.observe(settings,{attributes:true,attributeFilter:['class']});
    document.addEventListener('visibilitychange',refresh);window.addEventListener('focus',refresh);
    setInterval(()=>{if(settings?.classList.contains('open'))refresh();},2000);refresh();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
