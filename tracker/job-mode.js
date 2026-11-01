(() => {
  'use strict';
  if(window!==window.top||window.TrinoTimeQCMode)return;
  let mode='none',intent=null,lastUrl=location.href;
  const label=el=>String(el?.innerText||el?.textContent||'').replace(/\s+/g,' ').trim().toLowerCase();
  const type=el=>label(el)==='coverage'?'coverage':label(el)==='confirmation jobs'?'confirmation':null;
  function selectedScore(el){
    let score=0;
    for(let n=el,depth=0;n&&depth<3;n=n.parentElement,depth++){
      if(n.getAttribute('aria-current')&&n.getAttribute('aria-current')!=='false'||n.getAttribute('aria-selected')==='true'||n.dataset.state==='active')score=Math.max(score,10);
      const cls=String(n.className||'');
      if(/(?:^|\s)(?:active|selected|is-active|is-selected)(?:\s|$)/i.test(cls))score=Math.max(score,9);
      if(/(?:^|\s)(?:text|bg|border)-(?:blue|indigo)-(?:50|100|500|600|700)(?:\s|$)/i.test(cls))score=Math.max(score,6);
      const color=getComputedStyle(n).color.match(/[\d.]+/g)?.map(Number)||[];
      if(color.length>=3&&color[2]>color[0]+65&&color[2]>color[1]+35)score=Math.max(score,4);
    }
    const href=el.closest('a[href]')?.href;
    if(href){try{const u=new URL(href);if(u.pathname===location.pathname&&u.search===location.search)score=Math.max(score,3);}catch(_){}}
    return score;
  }
  function detect(){
    if(intent&&Date.now()-intent.at<5000&&location.href===intent.url)return intent.mode;
    intent=null;
    const route=location.pathname.match(/\/jobs\/JOB_[^/]+\/(confirmation|coverage(?:-beta)?)(?:\/|$)/i);
    if(route)return route[1].toLowerCase().startsWith('coverage')?'coverage':'confirmation';
    if(/^\/labeling\/?$/.test(location.pathname)){const tab=new URLSearchParams(location.search).get('tab');if(tab==='coverage')return 'coverage';if(tab===null||tab==='confirmation')return 'confirmation';return 'none';}
    const candidates=[...document.querySelectorAll('a,button,[role="menuitem"],[role="tab"],nav li,aside li')].filter(el=>type(el)&&!el.closest('[id^="cat-staging-hud"],#cft-confirmation-staging-hud'));
    let best=0,result='none';
    for(const el of candidates){if(el.hidden||getComputedStyle(el).display==='none')continue;const score=selectedScore(el);if(score>best){best=score;result=type(el);}else if(score===best&&score>0&&result!==type(el))result='none';}
    return result;
  }
  function refresh(){const next=detect();if(next!==mode){const previous=mode;mode=next;document.dispatchEvent(new CustomEvent('tt-qc-mode-change',{detail:{mode,previous}}));}return mode;}
  window.TrinoTimeQCMode=Object.freeze({get:refresh});
  document.addEventListener('click',e=>{const el=e.target.closest('a,button,[role="menuitem"],[role="tab"],nav li,aside li');const selected=type(el);if(selected){intent={mode:selected,url:location.href,at:Date.now()};refresh();}},true);
  window.addEventListener('popstate',()=>{intent=null;refresh();});
  chrome.runtime.onMessage.addListener((message,sender,reply)=>{if(message?.type==='tt-qc-mode'){reply({mode:refresh()});return false;}});
  setInterval(()=>{if(location.href!==lastUrl){lastUrl=location.href;intent=null;refresh();}},100);
  setInterval(refresh,500);
})();
