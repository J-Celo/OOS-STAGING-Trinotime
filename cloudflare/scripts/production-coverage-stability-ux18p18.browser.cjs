const fs=require('fs'),path=require('path'),assert=require('assert');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const base=path.resolve(__dirname,'../public');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE,args:['--no-sandbox'],headless:true});
 const page=await browser.newPage({viewport:{width:Number(process.env.QA_WIDTH||1670),height:946}});
 await page.setContent('<html><head></head><body data-trino-role="admin"><div id="ttCoverageRoot"></div></body></html>');
 const css=fs.readFileSync(base+'/assets/css/c-coverage-dashboard-v1.css','utf8');
 await page.addStyleTag({content:css+' body{margin:0} #ttCoverageRoot{display:block!important; margin:0 20px!important;width:auto!important} .tt-coverage-table{min-width:1800px} .tt-wide-table-navigation{height:20px}'});
 await page.addScriptTag({content:fs.readFileSync(base+'/assets/js/j-wide-table-top-scroll-m297.js','utf8')});
 let source=fs.readFileSync(process.env.QA_BASELINE||base+'/assets/js/j-coverage-dashboard-rc20-rc2-ui3-3e92d149a5b8.js','utf8');
 source=source.slice(0,source.indexOf("  document.addEventListener('trinotime:workspace-opening'"))+'window.qa={state,render,updateLiveChrome,bindCoverageEvent:ttBindOnce};})();';
 await page.addScriptTag({content:source});
 await page.evaluate(()=>{
 const pods=Array.from({length:17},(_,p)=>({pod:'POD '+p,totals:{},agents:Array.from({length:15},(_,i)=>({name:'Agent '+p+'-'+i,pod:'POD '+p,submitted:1,connected:false,activeMs:10000}))}));
 qa.state.dashboard={scope:'all-pods',pods,agents:pods.flatMap(p=>p.agents),totals:{},date:'2026-10-28'};
 qa.state.date='2026-10-28';qa.render();
 const extra=document.createElement('section');extra.dataset.ttStorePanel='coverage';extra.style.height='1800px';extra.innerHTML='<input value="preserved"><details open><summary>Store jobs</summary>Details</details>';document.getElementById('ttCoverageRoot').append(extra);
 window.refs={store:extra,row:document.querySelector('[data-coverage-agent="Agent 2-5"]'),wrap:document.querySelector('[data-coverage-pod="POD 2"] .tt-coverage-table-wrap'),nav:document.querySelector('[data-coverage-pod="POD 2"] .tt-wide-table-navigation')};
 refs.wrap.scrollLeft=310;refs.row.focus({preventScroll:true});refs.row.scrollIntoView({block:'center'});
 });
 await page.waitForTimeout(100);
 const before=await page.evaluate(()=>({y:scrollY,top:refs.row.getBoundingClientRect().top,x:refs.wrap.scrollLeft}));
 for(let i=0;i<20;i++) await page.evaluate(i=>{qa.state.dashboard.agents.forEach(r=>r.submitted=i+2);qa.render();qa.updateLiveChrome();},i);
 await page.waitForTimeout(200);
 const after=await page.evaluate(()=>({y:scrollY,top:refs.row.getBoundingClientRect().top,x:refs.wrap.scrollLeft,sameRow:refs.row===document.querySelector('[data-coverage-agent="Agent 2-5"]'),sameStore:refs.store===document.querySelector('[data-tt-store-panel]'),sameNav:refs.nav===document.querySelector('[data-coverage-pod="POD 2"] .tt-wide-table-navigation'),focused:document.activeElement===refs.row,count:refs.row.cells[2].textContent}));
 assert(Math.abs(before.y-after.y)<1,JSON.stringify({before,after}));
 assert(Math.abs(before.top-after.top)<1);assert.equal(before.x,after.x);
 assert(after.sameRow&&after.sameStore&&after.sameNav&&after.focused);assert.equal(after.count,'21');
 // Scroll to Store Performance and leave it idle across more updates.
 await page.evaluate(()=>refs.store.scrollIntoView({block:'start'}));
 const storeBefore=await page.evaluate(()=>scrollY);
 await page.evaluate(()=>{for(let i=0;i<12;i++)qa.render();});
 await page.waitForTimeout(150);
 assert.equal(await page.evaluate(()=>scrollY),storeBefore);
 // Keyed reconciliation removes/introduces only actual roster changes.
 const changes=await page.evaluate(()=>{
 const pod=qa.state.dashboard.pods[2];const retained=refs.row;
 pod.agents=pod.agents.filter(a=>a.name!=='Agent 2-0');pod.agents.push({name:'New Agent',pod:'POD 2',submitted:2});
 qa.state.dashboard.agents=qa.state.dashboard.pods.flatMap(p=>p.agents);qa.render();
 const button=document.createElement('button');let clicks=0;for(let i=0;i<10;i++)qa.bindCoverageEvent(button,'click',()=>clicks++);button.click();
 return {removed:!document.querySelector('[data-coverage-agent="Agent 2-0"]'),added:!!document.querySelector('[data-coverage-agent="New Agent"]'),retained:retained===document.querySelector('[data-coverage-agent="Agent 2-5"]'),clicks};
 });
 assert(changes.removed&&changes.added&&changes.retained);assert.equal(changes.clicks,1);
 console.log(JSON.stringify({result:'PASS',updates:32,before,after,rosterChanges:changes,notes:'Chromium fixture running production Coverage renderer and scrollbar code; not authenticated live production.'},null,2));

 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
