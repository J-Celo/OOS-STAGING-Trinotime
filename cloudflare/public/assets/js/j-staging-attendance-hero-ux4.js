/* STAGING UX4 — move existing authenticated controls only; never clone/click them. */
(() => {
  'use strict';
  const ids = ['btnTimeIn','btnStartBreak','btnEndBreak','btnLogOut','btnCoaching'];
  const icons = {
    btnTimeIn:'<path d="M10 17l5-5-5-5M15 12H3M21 19V5a2 2 0 0 0-2-2h-6"/>',
    btnStartBreak:'<path d="M4 9h13v4a6 6 0 0 1-6 6H9a5 5 0 0 1-5-5V9zM17 10h2a3 3 0 0 1 0 6h-2M7 3v3M12 3v3"/>',
    btnEndBreak:'<circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4V8z"/>',
    btnLogOut:'<path d="M10 17l5-5-5-5M15 12H3M21 19V5a2 2 0 0 0-2-2h-6"/>',
    btnCoaching:'<path d="M8 15c-3 0-5 1.5-5 4v1h10v-1c0-2.5-2-4-5-4ZM8 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM16 9h5M16 13h5M17 17h4"/>'
  };
  function init(){
    const slot=document.getElementById('ttAttendanceHeroSlot');
    const home=document.getElementById('ttAttendanceHomeSlot');
    const panel=document.getElementById('attendanceTopActions');
    const card=document.getElementById('punchCard');
    if(!slot||!home||!panel||!card)return;
    // Existing IDs, click handlers and server-acknowledged save logic remain authoritative.
    ids.forEach(id=>{
      const btn=document.getElementById(id);
      if(!btn||btn.querySelector('.tt-ux4-icon'))return;
      const el=document.createElement('span');el.className='tt-ux4-icon';el.setAttribute('aria-hidden','true');
      el.innerHTML='<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">'+icons[id]+'</svg>';
      btn.insertBefore(el,btn.firstChild);
    });
    function sync(){
      const agent=document.body.dataset.trinoRole==='agent';
      if(agent){
        if(panel.parentElement!==slot)slot.appendChild(panel);
        slot.hidden=false;
        slot.setAttribute('aria-hidden','false');
      }else{
        slot.hidden=true;slot.setAttribute('aria-hidden','true');
        if(panel.parentElement!==card)home.insertAdjacentElement('afterend',panel);
      }
    }
    new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['data-trino-role']});
    sync();
    window.TrinoTimeAttendanceUX4={sync};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
