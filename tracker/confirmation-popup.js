const $=id=>document.getElementById(id);
const send=(type,extra={})=>chrome.runtime.sendMessage({type,...extra});
async function refresh(){
  const c=await send('cft-context');
  $('date').value=c.today;
  $('interval').value=c.summary.currentInterval;
  const s=c.summary,shift=c.shift||{status:'not_clocked_in'},shiftStatus=String(shift.status||'not_clocked_in'),shiftActive=shiftStatus==='active';
  $('shiftState').textContent=shiftActive?'ACTIVE SHIFT':shiftStatus==='completed'?'SHIFT COMPLETE · LOCKED':'TIME IN REQUIRED';
  $('shiftMeta').textContent=shiftActive?`${shift.reportDate||c.today} · tracking continues through OT until Time Out`:shiftStatus==='completed'?`${shift.reportDate||c.today} · final totals frozen; next Time In starts at 0`:'Tracker waits for TrinoTime Time In.';
  $('date').disabled=true;$('interval').disabled=!shiftActive;$('apply').disabled=!shiftActive;
  const display=i=>Number(s[`interval${i}DisplayTotal`] ?? s[`interval${i}`] ?? 0)||0;
  const adjustment=i=>Number(s[`interval${i}ManualAdjustment`]||0);
  const total=display(1)+display(2)+display(3);
  $('i1').textContent=display(1);
  $('i2').textContent=display(2);
  $('i3').textContent=display(3);
  $('eodValue').textContent=total;
  for(const i of [1,2,3]){
    const a=adjustment(i), el=$(`i${i}Manual`);
    if(el){el.textContent=a?`${a>0?'+':''}${a}`:'±0';el.title=`Confirmed ${Number(s[`interval${i}`]||0)} · Manual ${a>0?'+':''}${a}`;}
    const minus=document.querySelector(`[data-adjust-interval="${i}"][data-delta="-1"]`);
    if(minus)minus.disabled=!shiftActive||display(i)<=0; const plus=document.querySelector(`[data-adjust-interval="${i}"][data-delta="1"]`); if(plus)plus.disabled=!shiftActive;
  }
  $('job').textContent=s.currentJob||'No active job';
  $('jobTask').textContent=s.currentJob?(s.currentTask?`Task ${s.currentTask}/${s.totalTasks||0}`:'Confirmation job detected'):'Waiting for an Augmoto Confirmation task';
  $('counts').textContent=`Interval 1: ${display(1)} · Interval 2: ${display(2)} · Interval 3: ${display(3)}`;
  $('eod').textContent=`EOD: ${total}`;
  const connected=Boolean(c.bridge?.token);
  const name=c.bridge?.actor?.name||'Agent';
  const error=c.sync?.lastError||'';
  $('bridgeAgent').textContent=connected?name:'Not connected';
  $('bridgeDot').className='bridgeDot'+(error?' bad':connected?' ok':'');
  $('status').textContent=error||(connected?'Connected to TrinoTime production.':'Open TrinoTime production, sign in as the QA Agent, then connect.');
  const connect=$('connect');
  connect.textContent=connected?'Connected · production':'Connect';
  connect.classList.toggle('isConnected',connected);
  connect.setAttribute('aria-pressed',connected?'true':'false');
  connect.title=connected?'Connected to TrinoTime production. Click to refresh this connection.':'Connect Confirmation to TrinoTime production.';
  $('sync').disabled=!connected;
}
async function action(type,extra){
  try{
    const r=await send(type,extra);
    if(r?.ok===false)throw Error(r.error||'Action failed');
    await refresh();
  }catch(e){
    $('status').textContent=e.message;
    $('bridgeDot').className='bridgeDot bad';
  }
}
$('apply').onclick=()=>action('cft-select-report',{date:$('date').value,interval:Number($('interval').value)});
$('connect').onclick=()=>action('cft-pair-trinotime');
$('sync').onclick=()=>action('cft-sync-now');

document.querySelectorAll('[data-adjust-interval]').forEach(button=>button.addEventListener('click',()=>action('cft-adjust-interval',{interval:Number(button.dataset.adjustInterval),delta:Number(button.dataset.delta)})));
send('cft-refresh-shift').catch(()=>{}).finally(()=>refresh().catch(e=>{$('status').textContent=e.message;$('bridgeDot').className='bridgeDot bad';}));
