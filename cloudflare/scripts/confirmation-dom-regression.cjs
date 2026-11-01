const {JSDOM}=require('jsdom'),fs=require('fs'),assert=require('node:assert/strict'),path=require('path');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const dom=new JSDOM('<html><head></head><body data-trino-role="admin"><aside id="ttPremiumSidebar"><nav class="tt-premium-nav"><button data-tt-nav="coverage">Coverage</button><button data-tt-nav="dashboard">Dashboard</button></nav></aside><main id="mainContent"></main><div id="teamTabsOuter" hidden></div><div id="podTabsOuter"></div><div id="ttAdminCommandBar"></div><div id="ttPremiumRightRail"></div></body></html>',{url:'https://oos.trinotime.com',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window;let ticks=[];w.setInterval=fn=>{ticks.push(fn);return ticks.length;};
 w.TrinoTimeAdminProfile={current:()=>({name:'Admin'})};w.firebase={auth:()=>({currentUser:{isAnonymous:false,getIdToken:async()=>'fixture'}})};
 let response={ok:true,authority:'workforce-confirmation-v1',viewer:{role:'admin',name:'Admin'},scope:'all-pods',totals:{interval1:200,interval2:201,interval3:204},pods:[],agents:[{name:'Tanjiro Kamado',pod:'demon',podLabel:'Demon Slayer',interval1:200,interval2:201,interval3:204,currentInterval:3,connected:true,serverUpdatedAtMs:Date.now()},{name:'Nezuko Kamado',pod:'demon',interval1:0,interval2:0,interval3:0,connected:false}]};
 w.fetch=async(url,opts)=>{assert.equal(opts.headers['X-TT-Confirmation-Expected-Role'],'admin');assert(!opts.headers['X-TT-Security-Session']);return {ok:true,json:async()=>response};};
 w.eval(fs.readFileSync(path.join(__dirname,'../public/assets/js/j-confirmation-dashboard-rc21.js'),'utf8'));await delay(10);
 w.document.querySelector('[data-tt-nav="confirmation"]').click();await delay(10);
 const body=w.document.querySelector('#ttConfirmationBody');for(const text of ['605','Tanjiro Kamado','OFFLINE / Not synced'])assert(body.textContent.includes(text),text);assert.equal(w.document.querySelector('#ttConfirmationScope').textContent,'All PODs');assert(w.document.querySelector('#mainContent').hidden);
 // Admin command center stops propagation at document capture. Window must restore first.
 w.document.addEventListener('click',e=>{if(e.target.dataset.ttNav==='dashboard')e.stopImmediatePropagation();},true);
 w.document.querySelector('[data-tt-nav="dashboard"]').click();assert(w.document.querySelector('#ttConfirmationRoot').hidden);assert.equal(w.document.querySelector('#mainContent').hidden,false);assert.equal(w.document.querySelector('#teamTabsOuter').hidden,true);
 response={...response,viewer:{role:'agent'},scope:'self'};w.document.querySelector('[data-tt-nav="confirmation"]').click();await delay(10);assert(body.textContent.includes('identity mismatch'));assert(!body.textContent.includes('Tanjiro'));
 dom.window.close();console.log('PASS Confirmation frontend: Admin totals and unsynced rows; valid auth headers; navigation restores original hidden states despite Admin interception; wrong-role response rejected');
})().catch(e=>{console.error(e);process.exitCode=1});
