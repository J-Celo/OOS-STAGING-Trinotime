/** UX18P43 Attendance Log navigation: isolated DOM regression, no private data access. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=p=>readFileSync(new URL(p, import.meta.url),'utf8');
const js=read('../public/assets/js/j-5229c23916de.js');
const canonical=read('../../assets/js/07-attendance-workspace.js');
const css=read('../public/assets/css/c-v1193-production-polish.css');
const html=read('../public/index.html');
const start=js.lastIndexOf('/* UX18P43 — Attendance Log navigation presentation only.');
assert.ok(start>0,'new navigation augments the existing application script');
assert.ok(canonical.includes('UX18P43 — Attendance Log navigation'),'retained source also reflects current script');
assert.match(css,/#logTabs.*?\{[\s\S]*?flex-wrap:wrap/);
for(const term of ['#logFilters[style*="display: none"]','grid-template-columns:repeat(2,minmax(0,1fr))','tt-log-more-menu','body.dark-mode','attendance-density-control'])assert.ok(css.includes(term),term);
assert.ok(html.includes('attendance-log-ux18p44=20261031'),'production cache-bust is present');
assert.ok(css.includes('UX18P44 — More tools dropdown stacking fix'));
assert.ok(css.includes('.log-section.tt-log-clean.tt-log-menu-open .log-head'));
assert.match(css, /tt-log-menu-open #logTabs[\s\S]*?overflow:visible !important/);
assert.ok(js.includes("section.classList.toggle('tt-log-menu-open', open)"));
assert.ok(js.includes("section.classList.remove('tt-log-menu-open')"));
for(const id of ['logTabBtn','coachingReportTabBtn','rosterTabBtn','moveAgentsTabBtn','networkTabBtn','exportMenuBtn','clearFilters','filterEmp','filterDate','filterDateTo','attendanceStreakReviewBtn']) assert.ok(html.includes(`id="${id}"`),`existing control ${id} retained`);
class Element {
 constructor(tag='div', cls='',tab=''){
  this.tagName=tag;this.names=new Set(cls.split(' ').filter(Boolean));Object.defineProperty(this,'className',{set(v){this.names=new Set(String(v).split(' ').filter(Boolean))},get(){return [...this.names].join(' ' )}});this.children=[];this.parentElement=null;this.dataset=tab?{tab}:{};this.style={display:''};this.attributes={};this.hidden=false;this.listeners={};this.focused=false;
  this.classList={add:(v)=>this.names.add(v),remove:(v)=>this.names.delete(v),contains:(v)=>this.names.has(v),toggle:(v,force)=>{if(force)this.names.add(v);else this.names.delete(v);}};
 }
 append(...els){for(const e of els){if(e.parentElement)e.parentElement.children=e.parentElement.children.filter(c=>c!==e);this.children.push(e);e.parentElement=this;}}
 setAttribute(k,v){this.attributes[k]=v;}
 getAttribute(k){return this.attributes[k];}
 querySelectorAll(selector){let ret=[];for(const e of this.children){if(selector.includes('.log-tab') && e.names.has('log-tab') && !(selector.includes(':not([hidden])')&&e.hidden))ret.push(e);ret.push(...e.querySelectorAll(selector));}return ret;}
 querySelector(sel){if(sel==='.tt-log-more')return this.children.find(e=>e.names.has('tt-log-more'))??null;return this.querySelectorAll(sel)[0]??null;}
 closest(sel){if(sel==='.log-section')return section;return null;}
 addEventListener(k,f){(this.listeners[k]??=[]).push(f);}
 click(){for(const f of this.listeners.click??[])f({target:this});}
 focus(){this.focused=true;}
 contains(node){for(let p=node;p;p=p.parentElement)if(p===this)return true;return false;}
}
const section=new Element('section','log-section');
const tabs=new Element('div','log-tabs');
const names=['log','status','coaching-report','bio-break','history','notes','roster','moveagents','backup-tl','overtime','network','totals','audit','monthly-grid'];
const elements=new Map(names.map(n=>[n,new Element('button','log-tab',n)]));
elements.get('roster').style.display='none';
elements.get('network').style.display='none';
for(const n of names)tabs.append(elements.get(n));
let oldClicks=0;elements.get('notes').addEventListener('click',()=>oldClicks++);
let observer;
const context={
 document:{readyState:'complete',getElementById:id=>id==='logTabs'?tabs:null,createElement:tag=>new Element(tag),addEventListener(){}},
 getComputedStyle:e=>({display:e.style.display||'block'}),
 MutationObserver:class {constructor(f){observer=f}observe(){}},
};
vm.runInNewContext(js.slice(start),context,{filename:'attendance-ux18p43.js'});
assert.ok(section.names.has('tt-log-clean'));
assert.ok(elements.get('log').parentElement===tabs && elements.get('status').parentElement===tabs);
const wrap=tabs.querySelector('.tt-log-more'); assert.ok(wrap);
const trigger=wrap.children[0],menu=wrap.children[1];
assert.ok(!wrap.hidden && menu.hidden,'More is available but closed by default');
for(const n of ['notes','roster','moveagents','backup-tl','overtime','network','totals','audit','monthly-grid']) assert.equal(elements.get(n).parentElement,menu,n+' is in More');
assert.equal(elements.get('network').style.display,'none','hidden protected tool remains hidden');
trigger.click(); assert.equal(menu.hidden,false);
assert.ok(section.names.has('tt-log-menu-open'), 'navigation parent lifts above Attendance filters while menu is open');
assert.equal(trigger.getAttribute('aria-expanded'),'true');
elements.get('notes').click();
assert.equal(oldClicks,1,'the existing notes handler survives moving the tab');
for(const f of menu.listeners.click??[])f({target:{closest:()=>elements.get('notes')}});
assert.equal(menu.hidden,true,'opening a tool closes More');
assert.ok(!section.names.has('tt-log-menu-open'), 'closing menu restores original stacking context');
// Late role authorization + newly registered tab retains its original element.
elements.get('roster').style.display='';observer([{type:'attributes',target:elements.get('roster')}]);
const later=new Element('button','log-tab','later-authorized');tabs.append(later);observer([{type:'childList',target:tabs}]);
assert.equal(later.parentElement,menu,'late-added tools are still reachable');
assert.equal(elements.get('roster').style.display,'','role update is never overwritten');
trigger.click();assert.equal(menu.hidden,false);
assert.ok(section.names.has('tt-log-menu-open'));
for(const f of (context.document.listeners?.pointerdown||[]))f({target:tabs});
assert.equal(js.includes('chrome.storage.local.clear'),false);
console.log('PASS UX18P43: navigation grouping and dynamic authorized tools, original handlers, accessible More menu, compact responsive filter CSS, unchanged core IDs');
