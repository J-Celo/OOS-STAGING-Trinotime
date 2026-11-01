// M2.9.52: Two-factor desktop Microsoft Excel chart compatibility.
// User-confirmed: A (visible Chart Data only) fails, B (inline text only) fails,
// C (visible Chart Data + inline text) displays all three native charts.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const source=read('public/assets/js/j-report-exports-m2935.js');
const html=read('public/index.html');
assert(html.includes('j-report-exports-m2935.js?v=5')&&html.includes('m2952=1'),'new asset revision reaches staging browsers');
const context={window:{},document:{addEventListener(){}},TextEncoder,Uint8Array,Uint32Array,DataView,Date,Intl,console,Set,Map,Math,Number,Error,Array,Blob};
vm.runInNewContext(source,context);
const api=context.window.TrinoTimeReportExports;
assert(typeof api?.buildXlsx==='function'&&typeof api?.buildCsv==='function'&&typeof api?.buildPdf==='function');
function unpack(bytes){
 const b=Buffer.from(bytes),m=new Map();let p=0;
 while(p+30<=b.length&&b.readUInt32LE(p)===0x04034b50){
  assert.equal(b.readUInt16LE(p+8),0,'test helper expects ZIP method STORE');
  const size=b.readUInt32LE(p+18),n=b.readUInt16LE(p+26),x=b.readUInt16LE(p+28);
  const name=b.toString('utf8',p+30,p+30+n),start=p+30+n+x;
  assert(start+size<=b.length,'no truncated workbook records');
  assert(!m.has(name),`no duplicate file path ${name}`);
  m.set(name,b.toString('utf8',start,start+size));p=start+size;
 }
 assert(m.has('xl/workbook.xml'),'XLSX structure exists');return m;
}
const common={workflow:'Metrics',date:'2026-10-08',period:'Previous 7 days',scope:'own-pod',viewer:'QA Supervisor',role:'team_leader',filter:'Coverage',generated:'SYNTHETIC QA',kpis:[['Target','70s']],tables:{activity:{headers:['Agent','Submitted','Seconds / Task','Grade'],rows:[['Agent A','26','106.9s','B'],['Agent B','12','180s','A']]},stores:{headers:['Store','Confirmed','Jobs'],rows:[['Preston','26','3'],['Miranda','12','2']]},storeJobs:{headers:['Store','Job ID','Agent','Submitted'],rows:[['Preston','JOB_1','Agent A','26']]},storeTrends:{headers:['Date','Store','Confirmed'],rows:[['2026-10-07','Preston','5'],['2026-10-08','Miranda','12']]},mappingReview:{headers:['Job ID','Mapping'],rows:[['JOB_2','Unknown']]},storePeriod:'7d',storeStatus:'2 stores'},notes:['Authorized rows only']};
const cases=[
 ['three charts',common,3],
 ['two charts',{...common,tables:{...common.tables,storeTrends:null,storeJobs:null}},2],
 ['one chart',{...common,tables:{activity:common.tables.activity,storeStatus:'none'}},1],
 ['zero charts',{...common,tables:{activity:{headers:['Agent','Submitted'],rows:[]},storeStatus:'none'}},0]
];
let checked=0;
for(const [label,report,count] of cases){
 const before=JSON.stringify(report),raw=api.buildXlsx(report),files=unpack(raw);
 assert.equal(JSON.stringify(report),before,`${label}: source measurements unchanged`);
 const book=files.get('xl/workbook.xml');
 const chartEntries=[...files.keys()].filter(k=>/^xl\/charts\/chart\d+\.xml$/.test(k));
 assert.equal(chartEntries.length,count,`${label}: native editable chart count`);
 const sheetTag=book.match(/<sheet name="Chart Data"[^>]*\/>/)?.[0];
 assert.equal(Boolean(sheetTag),count>0,`${label}: chart source only added when graphs exist`);
 if(count){
  assert(!/state="(?:hidden|veryHidden)"/.test(sheetTag),`${label}: chart source must be visible`);
  const data=files.get(`xl/worksheets/sheet${[...book.matchAll(/<sheet name="/g)].length}.xml`);
  assert(data,`${label}: Chart Data XML exists`);
  assert(data.includes('t="inlineStr"><is><t xml:space="preserve">'),`${label}: chart text uses inlineStr`);
  assert(data.includes('<v>26</v>'),`${label}: chart source contains actual numeric data`);
  assert(/<c r="A8"[^>]*t="inlineStr"><is><t xml:space="preserve">/.test(data),`${label}: first chart category is inline text`);
  for(const name of chartEntries){
   const chart=files.get(name);
   assert(chart.includes('Chart Data')&&chart.includes('<c:f>'),`${label}: chart references remain linked to editable source`);
   assert(chart.includes('<c:strCache>')&&chart.includes('<c:numCache>'),`${label}: populated caches`);
   assert(chart.includes('<c:plotVisOnly val="0"/>'),`${label}: plot-visible setting preserved`);
  }
  assert(files.has('xl/drawings/drawing1.xml')&&files.has('xl/drawings/_rels/drawing1.xml.rels'),`${label}: workbook chart drawing links exist`);
 }else{
  assert(!files.has('xl/drawings/drawing1.xml'),`${label}: no spurious drawing`);
 }
 if(label==='three charts'&&process.env.TT_M2952_SAMPLE)fs.writeFileSync(process.env.TT_M2952_SAMPLE,raw);
 checked++;
}
const csv=api.buildCsv(common);assert(csv.includes('1m 46.9s'),'CSV remains human-readable and unchanged');
const pdf=api.buildPdf(common);assert(pdf.length>500,'PDF generation remains available');
console.log(`PASS M2.9.52: ${checked} 0/1/2/3-chart scenarios, visible source + inlineStr chart labels, numeric sources, live chart formulas/caches, drawing links, unchanged source data, CSV/PDF exports.`);
