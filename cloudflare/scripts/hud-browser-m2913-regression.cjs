const {chromium}=require('playwright'),fs=require('fs'),assert=require('node:assert/strict'),path=require('path');
(async()=>{
process.chdir(path.resolve(__dirname,'../..'));
const manifest=JSON.parse(fs.readFileSync('tracker/manifest.json'));
for(const file of ['coverage-background.js','confirmation-background.js']){
 const s=fs.readFileSync('tracker/'+file,'utf8');const list=JSON.parse(s.match(/files: (\[[^\]]+\])/)[1].replaceAll("'",'"'));
 assert.deepEqual(list,manifest.content_scripts[0].js,'install injection must match manifest');
}
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1000,height:700}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('https://labeling-tools.augmoto.com/**',r=>r.fulfill({body:'<html><body style="margin:0;background:repeating-linear-gradient(110deg,#9eb9d1 0px,#9eb9d1 80px,#dbcca1 80px,#dbcca1 160px)"><h1>Tracker QA</h1><div style="position:absolute;left:490px;top:130px;font:16px system-ui;line-height:32px">JOB_26458541 &nbsp; Chemist Warehouse<br>JOB_26458542 &nbsp; In progress<br>JOB_26458543 &nbsp; Needs review<br>JOB_26458544 &nbsp; Ready<br>JOB_26458545 &nbsp; In progress<br>JOB_26458546 &nbsp; Ready</div><main style="margin:50px 280px;font:20px system-ui">Jobs table • Background visible through glass</main></body></html>',contentType:'text/html'}));
await page.goto('https://labeling-tools.augmoto.com/jobs');
await page.evaluate(()=>{
 window.mode='coverage';window.TrinoTimeQCMode={get:()=>window.mode};window.saved={};window.listeners=[];
 window.mockContext={settings:{enabled:true,hudExpanded:true},today:'2026-10-07',summary:{submitted:12,created:6,blurred:2,deleted:1,noMatch:3,productMatched:2,interval1:100,interval2:101,interval3:102,currentInterval:1},sync:{},shift:{status:'not_clocked_in'}};
 window.chrome={runtime:{sendMessage:async m=>{if(m.type.endsWith('-context'))return structuredClone(mockContext);if(m.type.endsWith('-settings')){mockContext.settings={...mockContext.settings,...m.patch};return {ok:true,settings:mockContext.settings}}return {ok:true}}},storage:{local:{get:(k,cb)=>{const r=structuredClone(saved);if(cb)cb(r);return Promise.resolve(r)},set:async p=>{Object.assign(saved,p)}},onChanged:{addListener:f=>listeners.push(f)}}};
});
for(const f of ['hud-appearance.js','coverage.js','confirmation.js'])await page.addScriptTag({path:'tracker/'+f});
const cov=page.locator('#cat-staging-hud-v2212'),cft=page.locator('#cft-confirmation-staging-hud');await cov.locator('[data-tt-drag]').waitFor();
const handle=cov.getByRole('button',{name:/Move tracker/});const r=await handle.boundingBox();await page.mouse.move(r.x+15,r.y+10);await page.mouse.down();await page.mouse.move(530,180,{steps:8});await page.mouse.up();let pos=await cov.boundingBox();assert(pos.x>450&&pos.y<220,'drag moved');const savedPos={x:pos.x,y:pos.y};
await page.waitForTimeout(1100);pos=await cov.boundingBox();assert(Math.abs(pos.x-savedPos.x)<1,'scan does not reset drag');
for(const theme of ['white','glass','transparent']){await cov.getByRole('button',{name:'Tracker appearance'}).click();await cov.locator('[data-theme-choice='+theme+']').click();assert.equal(await cov.getAttribute('data-tt-theme'),theme);await page.screenshot({path:'/tmp/trinotime-qa-'+theme+'.png'});}
await cov.locator('[data-cat-toggle]').click();await page.waitForTimeout(220);assert.equal(await cov.locator('[data-cat-toggle]').getAttribute('aria-expanded'),'false');assert((await cov.boundingBox()).height<65,'compact collapsed');await cov.getByRole('button',{name:'Tracker appearance'}).click();await cov.locator('[data-theme-choice=glass]').click();await page.screenshot({path:'/tmp/trinotime-qa-collapsed.png'});await cov.locator('[data-cat-toggle]').click();
await page.evaluate(()=>{window.mode='confirmation';document.dispatchEvent(new CustomEvent('tt-qc-mode-change',{detail:{previous:'coverage',mode:'confirmation'}}))});await cft.waitFor({state:'visible'});await page.waitForTimeout(800);assert.equal(await cft.getAttribute('data-tt-theme'),'glass');pos=await cft.boundingBox();assert(Math.abs(pos.x-savedPos.x)<1,'mode switch preserves position');
await page.screenshot({path:'/tmp/trinotime-qa-confirmation.png'});assert((await cft.boundingBox()).height<190,'compact confirmation');
const hr=await cft.getByRole('button',{name:/Move tracker/}).boundingBox();await page.mouse.move(hr.x+10,hr.y+10);await page.mouse.down();await page.mouse.move(930,610,{steps:8});await page.mouse.up();await page.setViewportSize({width:360,height:440});await page.waitForTimeout(250);pos=await cft.boundingBox();assert(pos.x>=0&&pos.x+pos.width<=360&&pos.y>=0&&pos.y+pos.height<=440,'clamp');
await cft.getByRole('button',{name:/Move tracker/}).focus();await page.keyboard.press('Home');await page.screenshot({path:'/tmp/trinotime-qa-small.png'});await cft.getByRole('button',{name:'Tracker appearance'}).click();const menu=cft.getByRole('menu');assert(await menu.isVisible());const mr=await menu.boundingBox();assert(mr.y>=0&&mr.y+mr.height<=440,'menu stays on screen');await page.screenshot({path:'/tmp/trinotime-qa-menu.png'});await page.keyboard.press('Escape');assert(!(await menu.isVisible()),'Escape closes menu');
await page.addScriptTag({path:'tracker/hud-appearance.js'});assert.equal(await cft.locator('[data-tt-drag]').count(),1,'duplicate injection safe');
assert.deepEqual(errors,[]);console.log('PASS: both install paths match manifest; actual Coverage/Confirmation render controls; pointer drag survives scans; three themes; collapse/expand; shared mode position; resize clamp; keyboard reset; duplicate injection; no browser errors.');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
