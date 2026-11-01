(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const pad = n => String(n).padStart(2,'0');
  const ord = (y,m) => Number(y) * 12 + Number(m) - 1;
  const partsFromOrd = value => ({ year:Math.floor(Number(value)/12), month:(Number(value)%12)+1 });
  const monthValue = (y,m) => `${String(y).padStart(4,'0')}-${pad(m)}`;
  const parseMonth = value => {
    const match=String(value||'').match(/^(\d{4})-(\d{2})$/);
    if(!match) return null;
    const year=Number(match[1]),month=Number(match[2]);
    return Number.isInteger(year)&&Number.isInteger(month)&&month>=1&&month<=12?{year,month}:null;
  };
  const parseIsoMonth = value => {
    const match=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match ? {year:Number(match[1]),month:Number(match[2]),day:Number(match[3])} : null;
  };
  const manilaCurrent = () => {
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit'}).formatToParts(new Date());
    const map=Object.fromEntries(parts.filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
    return {year:Number(map.year),month:Number(map.month)};
  };
  const label = (y,m) => new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Manila',month:'long',year:'numeric'}).format(new Date(Date.UTC(Number(y),Number(m)-1,1,12)));
  const rangeFor = (y,m) => {
    const last=new Date(Number(y),Number(m),0).getDate();
    return {from:`${y}-${pad(m)}-01`,to:`${y}-${pad(m)}-${pad(last)}`};
  };

  function init(){
    const month=$('attendanceLogMonth'),prev=$('attendanceLogMonthPrev'),next=$('attendanceLogMonthNext'),currentBtn=$('attendanceLogMonthCurrent'),mode=$('attendanceLogMonthMode');
    const from=$('filterDate'),to=$('filterDateTo'),preset=$('payPeriodPreset');
    if(!month||!prev||!next||!currentBtn||!mode||!from||!to) return;
    let selected=manilaCurrent();
    let internal=false;

    const current=()=>manilaCurrent();
    const syncChrome=(kind='month')=>{
      const now=current();
      const selectedOrd=ord(selected.year,selected.month),currentOrd=ord(now.year,now.month);
      if(selectedOrd>currentOrd) selected={...now};
      month.max=monthValue(now.year,now.month);
      month.value=monthValue(selected.year,selected.month);
      next.disabled=selectedOrd>=currentOrd;
      next.title=next.disabled?'Current month is the newest available month':'Next month';
      const historical=selectedOrd<currentOrd;
      mode.dataset.mode=kind==='custom'?'custom':(historical?'historical':'current');
      mode.textContent=kind==='custom'?'Custom range':(historical?'Historical':'Current');
      mode.title=kind==='custom'?'The From/To filters span a custom range.':`${historical?'Historical':'Current'} attendance · ${label(selected.year,selected.month)}`;
      const tableWrap=$('tableWrap');
      if(tableWrap) tableWrap.dataset.attendanceMonthMode=kind==='custom'?'custom':(historical?'historical':'current');
      currentBtn.disabled=!historical && kind!=='custom';
      currentBtn.title=currentBtn.disabled?'Already viewing the current month':'Return to the current operational month';
    };

    const refreshTable=()=>{
      const controls=window.trinoAttendanceFilterControls;
      if(controls&&typeof controls.refresh==='function') controls.refresh();
      else from.dispatchEvent(new Event('change',{bubbles:true}));
    };

    const applyMonth=(year,monthNumber)=>{
      const now=current();
      let target={year:Number(year),month:Number(monthNumber)};
      if(ord(target.year,target.month)>ord(now.year,now.month)) target=now;
      selected=target;
      const range=rangeFor(selected.year,selected.month);
      internal=true;
      from.value=range.from;
      to.value=range.to;
      if(preset) preset.value='';
      internal=false;
      syncChrome('month');
      refreshTable();
    };

    const syncFromBaseFilters=()=>{
      if(internal) return;
      const a=parseIsoMonth(from.value),b=parseIsoMonth(to.value);
      if(!a&&!b){ selected=current(); syncChrome('month'); return; }
      if(a&&b&&a.year===b.year&&a.month===b.month){ selected={year:a.year,month:a.month}; syncChrome('month'); return; }
      if(a){ selected={year:a.year,month:a.month}; syncChrome('custom'); return; }
      if(b){ selected={year:b.year,month:b.month}; syncChrome('custom'); return; }
      syncChrome('custom');
    };

    prev.addEventListener('click',()=>{ const p=partsFromOrd(ord(selected.year,selected.month)-1); applyMonth(p.year,p.month); });
    next.addEventListener('click',()=>{ const p=partsFromOrd(ord(selected.year,selected.month)+1); applyMonth(p.year,p.month); });
    currentBtn.addEventListener('click',()=>{ const p=current(); applyMonth(p.year,p.month); });
    month.addEventListener('change',()=>{ const p=parseMonth(month.value); if(p) applyMonth(p.year,p.month); else syncChrome('custom'); });
    ['input','change'].forEach(type=>{ from.addEventListener(type,syncFromBaseFilters); to.addEventListener(type,syncFromBaseFilters); if(preset) preset.addEventListener(type,()=>requestAnimationFrame(syncFromBaseFilters)); });
    $('clearFilters')?.addEventListener('click',()=>requestAnimationFrame(syncFromBaseFilters));
    syncFromBaseFilters();
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
