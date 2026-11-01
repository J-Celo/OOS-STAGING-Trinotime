import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const html=read('../public/index.html'),css=read('../public/assets/css/c-staging-portal-staff-shortcuts-20261019.css');
const main=read('../public/assets/js/j-5a9b0d9aeabc.js');
assert.doesNotMatch(html,/<details class="gate-staff-access"/,'Old oversized Staff Access accordion must be absent');
assert.doesNotMatch(html,/aria-label="Open Staff Access/,'No exposed Staff Access summary');
const start=html.indexOf('id="gateAccessShortcuts"'),end=html.indexOf('id="gatePodGrid"',start);
assert.ok(start>0&&end>start,'Shortcuts come after workstreams, before POD grid');
const body=html.slice(start,end);
for(const id of ['gateQaTeamCard','gateTlAttendanceBtn','gateAdminToggle']) {
 assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,'Stable handler ID: '+id);
 assert.ok(body.includes('id="'+id+'"'),'Shortcut in row: '+id);
}
for(const id of ['gateAdminBox','gateAdminSubmit','gateAdminEmail','gateAdminPass','gateTlSelect'])
 assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,'Preserve existing protected form: '+id);
assert.match(body,/OOS Coverage Beta QAs/);assert.match(body,/TL Attendance/);assert.match(body,/Admin \/ Owner/);
assert.match(body,/aria-controls="gateAdminBox" aria-expanded="false"/);
assert.match(main,/gateLaunchTarget = 'tlAttendance';/);
assert.match(main,/pendingTlAttendanceOpen = true;/);
assert.match(main,/\$\('gateAdminToggle'\)\.addEventListener\('click'/);
assert.match(main,/adminSlot.appendChild\(box\)/);
assert.match(main,/tlSlot.appendChild\(box\)/);
assert.match(main,/collapseGateStaffLogin\(\)/);
assert.match(main,/if \(gateQaLoginChoice\) \{ mostUsedEl.style.display='none'/);
assert.match(css,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
assert.match(css,/@media\(max-width:760px\)/);assert.match(css,/@media\(max-width:480px\)/);
const config=JSON.parse(read('../wrangler.jsonc'));
assert.equal(config.name,'oostrinotime');assert.equal(config.vars.FIREBASE_PROJECT_ID,'cwh-timeclock');assert.equal(config.vars.DEPLOYMENT_ENV,'production');assert.ok(!config.vars.ENABLE_OOS_QA_WORKGROUP);
assert.ok(html.indexOf('id="gateCwhWorkstreamSection"')<start);
assert.ok(html.indexOf('id="gateSelectionContinueBtn"')>end,'Continue stays at bottom');
// Exercise the shipped click and keyboard event callbacks against a controlled DOM.
const vm=await import('node:vm');
const begin=main.indexOf("        const gateTlAttendanceBtn = $('gateTlAttendanceBtn');");
const finish=main.indexOf('        function updateTeamLeaderGatePodHint()',begin);
assert.ok(begin>0&&finish>begin,'Staff handlers must remain present');
const handlers={},attrs={},moved=[],rolesChanged=[],focused=[];
let open=false;
const box={dataset:{},classList:{
 add(v){assert.equal(v,'open');open=true},
 remove(v){assert.equal(v,'open');open=false},
 toggle(v,n){assert.equal(v,'open');open=!!n},
 contains(v){return v==='open'&&open}
},contains(t){return t===mock.gateAdminPass||t===mock.gateTlSelect||t===mock.gateAdminEmail||t===mock.gateAdminSubmit}};
const tlRole={value:'teamleader',checked:false,dispatchEvent(){rolesChanged.push('tl')}};
const adminRole={value:'admin',checked:true,dispatchEvent(){rolesChanged.push('admin')}};
const checkedRole=()=>tlRole.checked?tlRole:adminRole;
const mkButton=name=>({
  addEventListener:(t,fn)=>handlers[name]=fn,
  setAttribute:(k,v)=>attrs[name+'_'+k]=v,
  contains(target){return target===this},
  focus(){focused.push(name)}
});
const mock={
 gateTlAttendanceBtn:mkButton('tl'),gateAdminToggle:mkButton('admin'),
 gateAdminBox:box,
 gateTlLoginSlot:{appendChild(n){assert.equal(n,box);moved.push('tl')}},
 gateAdminLoginSlot:{appendChild(n){assert.equal(n,box);moved.push('admin')}},
 gateTlSelect:{focus(){focused.push('tlSelect')}},
 gateAdminEmail:{focus(){focused.push('adminEmail')}},
 gateAdminSubmit:{},gateAdminPass:{value:''}
};
let docCapture=false;
const document={
 querySelector:q=>q.includes(':checked')?checkedRole():q.includes('teamleader')?tlRole:adminRole,
 addEventListener:(t,fn,capture)=>{handlers['doc_'+t]=fn;if(t==='keydown')docCapture=capture===true;}
};
const ctx=vm.createContext({$:id=>mock[id],document,Event:class{constructor(type){this.type=type}},
 gateLaunchTarget:null,pendingTlAttendanceOpen:false,gatePortalStep:'selection',gateAuthModalOpen:()=>false,
 refreshTeamLeaderGateOptions:()=>{}});
vm.runInContext(main.slice(begin,finish)+'\nglobalThis.getState=()=>({gateLaunchTarget,pendingTlAttendanceOpen});',ctx);
assert.equal(docCapture,true,'Escape handler intercepts earlier Escape-to-Welcome action');
const assertClosed=()=>{assert.equal(open,false);assert.equal(attrs['tl_aria-expanded'],'false');assert.equal(attrs['admin_aria-expanded'],'false');assert.equal(ctx.getState().gateLaunchTarget,null);assert.equal(ctx.getState().pendingTlAttendanceOpen,false)};
// TL open -> clicking inside should not dismiss; clicking TL again closes.
handlers.tl();
assert.equal(open,true);assert.equal(moved.at(-1),'tl');assert.equal(box.dataset.staffMode,'tl');
assert.equal(attrs['tl_aria-expanded'],'true');assert.equal(attrs['admin_aria-expanded'],'false');
assert.equal(ctx.getState().gateLaunchTarget,'tlAttendance');assert.equal(ctx.getState().pendingTlAttendanceOpen,true);
assert.equal(focused.at(-1),'tlSelect');assert.equal(tlRole.checked,true);
handlers.doc_click({target:mock.gateAdminPass});assert.equal(open,true,'typing in form must not dismiss');
handlers.doc_click({target:mock.gateTlAttendanceBtn});assert.equal(open,true,'shortcut click must not trigger outside dismissal');
mock.gateAdminPass.value='sensitive-placeholder';
handlers.tl();assertClosed();assert.equal(mock.gateAdminPass.value,'','Dismissed TL password cleared');
// Reopen TL and dismiss by outside pointer click.
handlers.tl();assert.equal(open,true);
mock.gateAdminPass.value='sensitive-placeholder';
handlers.doc_click({target:{}});assertClosed();assert.equal(mock.gateAdminPass.value,'');
// Admin open -> switching from TL moves the sole actual protected form.
handlers.tl();adminRole.checked=false;tlRole.checked=true;
handlers.admin();assert.equal(open,true);assert.equal(moved.at(-1),'admin');
assert.equal(box.dataset.staffMode,'admin');assert.equal(attrs['tl_aria-expanded'],'false');assert.equal(attrs['admin_aria-expanded'],'true');
assert.equal(ctx.getState().gateLaunchTarget,null);assert.equal(ctx.getState().pendingTlAttendanceOpen,false);
assert.equal(adminRole.checked,true);assert.equal(focused.at(-1),'adminEmail');
handlers.doc_click({target:mock.gateAdminEmail});assert.equal(open,true);
mock.gateAdminPass.value='sensitive-placeholder';handlers.admin();assertClosed();assert.equal(mock.gateAdminPass.value,'');
// Click elsewhere also dismisses Admin; Esc dismisses only the open staff panel.
handlers.admin();handlers.doc_click({target:{}});assertClosed();
handlers.tl();let prevented=0,stopped=0;
handlers.doc_keydown({key:'Escape',defaultPrevented:false,preventDefault(){prevented++},stopImmediatePropagation(){stopped++}});
assertClosed();assert.equal(prevented,1);assert.equal(stopped,1);assert.equal(focused.at(-1),'tl');
handlers.doc_keydown({key:'Escape',defaultPrevented:false,preventDefault(){prevented++},stopImmediatePropagation(){stopped++}});
assert.equal(prevented,1,'Existing Escape-to-Welcome must handle keys when panel closed');
handlers.admin();ctx.gatePortalStep='welcome';handlers.doc_click({target:{}});assert.equal(open,true,'Do not dismiss outside selection screen');
ctx.gatePortalStep='selection';handlers.admin();assertClosed();
assert.ok(rolesChanged.includes('tl')&&rolesChanged.includes('admin'));
assert.match(css,/data-staff-mode="tl"/);assert.match(css,/data-staff-mode="admin"/);
assert.match(body,/id="gateTlLoginSlot"/);assert.match(body,/id="gateAdminLoginSlot"/);
assert.match(body,/id="gateAdminBox"/);
assert.match(main,/document.addEventListener\('click', event =>/);
assert.match(main,/document.addEventListener\('keydown', event =>/);
assert.match(main,/event.stopImmediatePropagation\(\)/);
console.log('PASS production — TL/Admin card toggles, outside dismissal, inside-form protection, Escape, password clearing, one secure login form');
