'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const source=fs.readFileSync(path.resolve(__dirname,'../tracker/store-intelligence.js'),'utf8');
class N {
 constructor(tag='',text='',attrs={},kids=[]){this.tagName=tag.toUpperCase();this.nodeType=tag?1:3;this.attrs=attrs;this.parentElement=null;this.children=[];this.childNodes=[];this._text=text;this.nextElementSibling=null;this.add(...kids)}
 add(...kids){for(const child of kids){child.parentElement=this;this.childNodes.push(child);if(child.nodeType===1)this.children.push(child)}for(let i=0;i<this.children.length-1;i++)this.children[i].nextElementSibling=this.children[i+1]}
 get textContent(){return this.nodeType===3?this._text:this.childNodes.map(x=>x.textContent).join('')}
 getAttribute(name){return this.attrs[name]??null}
 matches(selector){return selector.split(',').some(x=>x.trim().toUpperCase()===this.tagName || (x.trim()==='[role="row"]'&&this.attrs.role==='row'))}
 closest(tag){for(let n=this;n;n=n.parentElement)if(n.tagName===tag.toUpperCase())return n;return null}
 all(){return [this,...this.children.flatMap(x=>x.all())]}
 querySelector(selector){if(selector==='thead tr'){const h=this.all().find(n=>n.tagName==='THEAD');return h?.all().find(n=>n.tagName==='TR')||null;}return null}
 querySelectorAll(selector){
  if(selector==='[data-label],[data-column],[aria-label],dt')return this.all().slice(1).filter(n=>n.attrs['data-label']||n.attrs['data-column']||n.attrs['aria-label']||n.tagName==='DT');
  if(selector==='th,[role="columnheader"]')return this.all().slice(1).filter(n=>n.tagName==='TH'||n.attrs.role==='columnheader');
  if(selector.includes(':scope >'))return this.children.filter(n=>['TD','TH'].includes(n.tagName)||n.attrs.role==='cell');
  return [];
 }
}
const txt=s=>new N('',s),el=(tag,kids=[],attrs={})=>new N(tag,'',attrs,kids);
const link=id=>el('a',[txt(id)]);
const wrapped=(id,name)=>el('tr',[el('td',[link(id),el('span',[txt(name)])]),el('td',[txt('NEEDS REVIEW')])]);
const labelCell=(id,name)=>el('tr',[el('td',[link(id)]),el('td',[txt(name)],{'data-label':'Store'})]);
const labeledCard=(id,name)=>el('div',[el('div',[link(id)]),el('span',[txt(name)],{'aria-label':'Store'})],{role:'row'});
const tableWithHeader=(id,name)=>el('table',[el('thead',[el('tr',[el('th',[txt('Job ID')]),el('th',[txt('Store Name')])])]),el('tbody',[el('tr',[el('td',[link(id)]),el('td',[txt(name)])])])]);
const nativeTableRow=tableWithHeader('JOB_282425969','Chemist Warehouse - Portside Branch');
const rows=[wrapped('JOB_276147062','Chemist Warehouse - Pimpama City Shopping Centre'),labelCell('JOB_282426431','Chemist Warehouse - North Garden'),labeledCard('JOB_282427550','Chemist Warehouse - South Garden'),...nativeTableRow.all().filter(n=>n.tagName==='TR'&&n.closest('TBODY')),el('tr',[el('td',[link('JOB_282429458')]),el('td',[txt('Chemist Warehouse - Selected Filter')])]),labelCell('JOB_282430000','Unknown Store')];
const doc={readyState:'complete',documentElement:el('html'),addEventListener(){},querySelectorAll(q){const all=rows.flatMap(n=>n.all());if(q==='a,[role="link"]')return all.filter(n=>n.tagName==='A');if(q==='tr,[role="row"]')return rows;return []}};
const scheduled=[],sent=[];const sandbox={document:doc,globalThis:null,window:{addEventListener(){}},chrome:{runtime:{sendMessage:async msg=>{sent.push(msg);return {ok:true}}}},MutationObserver:class{observe(){}},setTimeout(f){scheduled.push(f);return scheduled.length},setInterval(){},console};sandbox.globalThis=sandbox;
vm.runInNewContext(source,sandbox);
async function flush(){for(const f of scheduled.splice(0))f();for(let i=0;i<5;i++)await new Promise(setImmediate)}
flush().then(()=>{
 assert.equal(sent.length,2,'Coverage and Confirmation receive the same verified job rows');
 for(const msg of sent){const map=Object.fromEntries(msg.stores.map(s=>[s.jobId,s.storeName]));
 assert.equal(map.JOB_276147062,'Chemist Warehouse - Pimpama City Shopping Centre');
 assert.equal(map.JOB_282426431,'Chemist Warehouse - North Garden');
 assert.equal(map.JOB_282427550,'Chemist Warehouse - South Garden');
 assert.equal(map.JOB_282425969,'Chemist Warehouse - Portside Branch');
 assert(!('JOB_282429458' in map),'unlabeled adjacent column must not be guessed');
 assert(!('JOB_282430000' in map),'unknown placeholder must not be accepted');
 assert(msg.stores.every(x=>x.source==='augmoto-job-row'));
 }
 console.log('PASS store name mapping: inline job cell, explicit responsive data-label, accessible grid row, table header; no guessing from unlabeled column, no Unknown placeholder, both workflows');
}).catch(e=>{console.error(e);process.exitCode=1});
