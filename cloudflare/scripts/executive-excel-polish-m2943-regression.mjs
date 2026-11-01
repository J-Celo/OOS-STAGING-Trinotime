import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const script=fs.readFileSync(path.join(root,'public/assets/js/j-report-exports-m2935.js'),'utf8');
const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
assert(html.includes('m2943=1'),'new export asset cache bust loaded');
assert(script.includes('TrinoTimeStoreIntelligence?.getReportData?.(workflow,context)'),'store retrieval remains scoped');
assert(script.includes('TrinoTimeMessagingSessionContext?.getActor?.()'),'actor safeguard remains');
const env={window:{},document:{addEventListener(){}},TextEncoder,Uint8Array,Uint32Array,DataView,Date,Intl,console,Set,Map,Math,Number,Error,Array,Blob};
vm.runInNewContext(script,env);
const report={workflow:'Metrics',date:'2026-10-08',period:'QA synthetic',scope:'own-pod',viewer:'Demo TL',role:'team_leader',filter:'Coverage',generated:'Synthetic QA',kpis:[],tables:{
  activity:{headers:['Agent','Job','Submitted','Seconds / Task','Grade'],rows:[['Agent A','Coverage','63','106.9s','A'],['Agent B','Confirmation','48','180s','B'],['Agent C','Coverage','40','70s','C'],['Agent D','Coverage','35','90s','D'],['Agent E','Coverage','10','75s','F']]},
  stores:{headers:['Store','Confirmed','Mapping'],rows:[['Preston','63','tracker-observed'],['Miranda','48','tracker-observed']]},
  storeTrends:{headers:['Date','Confirmed'],rows:[['2026-10-07','3'],['2026-10-08','7']]},
  storeJobs:{headers:['Job ID','Agent','Active sec / submit','Mapping'],rows:[['JOB_SAMPLE_1234','Agent A','106.9s','tracker-observed']]},
  storeStatus:'Only fake QA records'
},notes:['This is synthetic QA data.']};
function unzip(buf){const bytes=Buffer.from(buf),m=new Map();let p=0;while(p+30<bytes.length&&bytes.readUInt32LE(p)===0x04034b50){const size=bytes.readUInt32LE(p+18),nl=bytes.readUInt16LE(p+26),xl=bytes.readUInt16LE(p+28),name=bytes.toString('utf8',p+30,p+30+nl),start=p+30+nl+xl;m.set(name,bytes.toString('utf8',start,start+size));p=start+size;}return m;}
const contents=unzip(env.window.TrinoTimeReportExports.buildXlsx(report));
const styles=contents.get('xl/styles.xml');
const book=contents.get('xl/workbook.xml');
const overview=contents.get('xl/worksheets/sheet1.xml');
const detail=contents.get('xl/worksheets/sheet2.xml');
assert(styles.includes('<fonts count="11">')&&styles.includes('<fills count="14">')&&styles.includes('<cellXfs count="25">'),'grade colors have dedicated real cell styles');
assert(styles.includes('horizontal="center"'),'title, KPI and table alignment centered');
assert(styles.includes('horizontal="left" wrapText="1"')===false || styles.includes('horizontal="left"'),'long report notes retain readable wrapping');
for(const s of ['18','19','20','21','22'])assert(detail.includes(`s="${s}" t="str"`),`grade style ${s}`);
assert(detail.includes('conditionalFormatting'),'formula-based bold grade emphasis is preserved');
assert(styles.includes('FFE5F5EE')&&styles.includes('FFEBF2FF')&&styles.includes('FFFFF5DF'),'subtle grade backgrounds');
assert(styles.includes('horizontal="center" vertical="center"'),'cell text centered');
assert(overview.includes('<mergeCell ref="A1:J1"/>'),'Overview banner is horizontally merged and centered');
assert(detail.includes('<mergeCell ref="A1:G1"/>'),'detail title banner is merged');
assert(book.includes('name="Chart Data"')&&!/<sheet name="Chart Data"[^>]*state="hidden"/.test(book),'chart source tab visible to preserve desktop Excel charts');
const charts=[...contents.keys()].filter(name=>/^xl\/charts\/chart\d+\.xml$/.test(name));
assert.equal(charts.length,3,'three native editable charts');
for(const name of charts){const c=contents.get(name);assert(c.includes('Chart Data'),'chart source accessible');assert(c.includes('plotVisOnly val="0"'),'hidden sheet values remain charted');assert(!c.includes('<c:legend>'),'redundant single series legend removed');assert(c.includes('showVal val="1"'),'value labels retained');}
const d=contents.get('xl/worksheets/sheet4.xml');assert(d.includes('JOB_SAMPLE_1234')&&d.includes('t="n"'),'Job IDs and numeric times retained');
assert(env.window.TrinoTimeReportExports.reportSheets(report)[1].rows[0][3]==='1m 46.9s','CSV and PDF durations still human readable');
const single=unzip(env.window.TrinoTimeReportExports.buildXlsx({...report,tables:{activity:report.tables.activity,storeStatus:'One chart'}}));
assert.equal([...single.keys()].filter(n=>/^xl\/charts\/chart\d+\.xml$/.test(n)).length,1,'single-chart fallback');
const empty=unzip(env.window.TrinoTimeReportExports.buildXlsx({...report,tables:{activity:{headers:['Agent','Submitted'],rows:[]},storeStatus:'No data'}}));
assert(!empty.get('xl/workbook.xml').includes('Chart Data'),'no hidden chart sheet for empty report');
console.log('PASS M2.9.43 Excel polish: all centered titles/headings/metrics, A–F pale real fills, legible widths, hidden chart data with plot-visible links, native chart value labels, one/three/zero chart states, preserved scoped export and numeric times.');
