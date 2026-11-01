import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const script=fs.readFileSync(path.join(root,'public/assets/js/j-report-exports-m2935.js'),'utf8');
const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
assert(html.includes('j-report-exports-m2935.js?v=5')&&html.includes('m2950=1'),'new source cache bust');
assert(script.includes('TrinoTimeStoreIntelligence?.getReportData?.(workflow,context)'),'store data still authorized');
assert(script.includes('TrinoTimeMessagingSessionContext?.getActor?.()'),'export actor auth preserved');
const context={window:{},document:{addEventListener(){}},TextEncoder,Uint8Array,Uint32Array,DataView,Date,Intl,console,Set,Map,Math,Number,Error,Array,Blob};
vm.runInNewContext(script,context);
const api=context.window.TrinoTimeReportExports;
const report={
  workflow:'Metrics',date:'2026-10-08',period:'Previous 7 days',scope:'own-pod',viewer:'QA Supervisor',role:'team_leader',filter:'Coverage only · All agents',generated:'SYNTHETIC QA',
  kpis:[['Active Time','2h 14m'],['Target','70s']],
  tables:{
    activity:{headers:['Agent','Job','Submitted','Measured Tasks','Active Time (min)','Seconds / Task','Target sec / task','Efficiency %','Grade'],rows:[
      ['Agent One Demo','Coverage','56','56','70','75s','70s','93.3%','B'],['Agent Two Demo','Coverage','42','42','61','87.1s','70s','80.4%','C'],['Agent Three Demo','Coverage','21','21','35','100s','70s','70.0%','D'],['Agent Four Demo','Coverage','10','10','18','108s','70s','64.8%','F']]},
    stores:{headers:['Store','Workflow','Unique jobs','Confirmed','Active','Active sec / submit','Agents','Mapping'],rows:[['Chemist Warehouse Preston Home Co','coverage','18','56','1h 10m','75s','2','tracker-observed'],['Chemist Warehouse Miranda','coverage','12','42','1h 4m','91.4s','2','tracker-observed']]},
    storeJobs:{headers:['Date','Store','Job ID','Agent','Workflow','Task position','Submitted','Active','Active sec / submit','Mapping'],rows:[['2026-10-08','Chemist Warehouse Preston Home Co','JOB_266338219','Agent One Demo','coverage','7 / 9','12','12m','60s','tracker-observed'],['2026-10-08','Chemist Warehouse Miranda','JOB_266338220','Agent Two Demo','coverage','8 / 12','7','10m','85.7s','tracker-observed']]},
    storeTrends:{headers:['Date','Store','Workflow','Unique jobs','Confirmed','Active'],rows:[['2026-10-07','Chemist Warehouse Preston Home Co','coverage','10','31','47m'],['2026-10-08','Chemist Warehouse Miranda','coverage','12','42','1h 4m']]},
    mappingReview:{headers:['Date','Store','Job ID','Agent','Workflow','Task position','Submitted','Active','Mapping'],rows:[['2026-10-08','Unknown Store','JOB_266338221','Agent Three Demo','coverage','3 / 11','0','1m','Unknown']]},
    storeStatus:'2 linked groups · 1 unknown job',storePeriod:'7d'
  },notes:['This is a synthetic QA file, not real TrinoTime activity.','Data visibility follows the authorized Agent/POD/report scope.','Period is selected day or previous seven days; missing or disputed mappings are never assigned to an arbitrary store.']
};
const before=JSON.stringify(report),bytes=api.buildXlsx(report);
assert.equal(JSON.stringify(report),before,'source unchanged');
assert(bytes instanceof Uint8Array&&bytes.length>10000,'valid XLSX bytes');
const entries=new Map(),buf=Buffer.from(bytes);let pos=0;
while(pos+30<=buf.length&&buf.readUInt32LE(pos)===0x04034b50){
  const method=buf.readUInt16LE(pos+8),len=buf.readUInt32LE(pos+18),fn=buf.readUInt16LE(pos+26),extra=buf.readUInt16LE(pos+28),start=pos+30+fn+extra;
  assert.equal(method,0,'no unsupported compression');assert(start+len<=buf.length,'bounded ZIP record');
  entries.set(buf.toString('utf8',pos+30,pos+30+fn),buf.toString('utf8',start,start+len));pos=start+len;
}
const sheetXml=i=>entries.get(`xl/worksheets/sheet${i}.xml`);
assert.equal([...entries.keys()].filter(k=>/^xl\/worksheets\/sheet\d+\.xml$/.test(k)).length,8,'all 7 report tabs + hidden chart data');
const widthMatches=s=>[...s.matchAll(/<col min="\d+" max="\d+" width="([\d.]+)"/g)].map(m=>Number(m[1]));
const overview=sheetXml(1),agent=sheetXml(2),stores=sheetXml(3),jobs=sheetXml(4),notes=sheetXml(7);
assert(widthMatches(overview).every(w=>w===10.8),'Overview uniform compact columns');
assert.deepEqual(widthMatches(agent).slice(0,2),[25,14],'identity and workflow not oversized');
assert(widthMatches(stores)[0]===26&&widthMatches(stores)[3]===12,'Store identities stay legible, numeric fields compact');
assert(widthMatches(jobs)[2]===19,'Job IDs get dedicated bounded column');
assert(stores.includes('s="23"')&&stores.includes('ht="30"'),'long store names center-wrap without large columns');
assert(widthMatches(agent).every(w=>w<=26),'no huge detail columns');
assert(widthMatches(notes)[1]===57,'long methodology notes readable in a single merged column');
assert(agent.includes('<row r="5" ht="30"'),'compact wrapped header rows');
assert(agent.includes('<row r="6" ht="22"'),'compact detail rows');
assert(notes.includes('<row r="6" ht="34"'),'notes rows no longer huge');
assert(overview.includes('<row r="6" ht="32"'),'compact KPI values');
assert(overview.includes('r="A37"'),'metadata directly below chart area');
const drawing=entries.get('xl/drawings/drawing1.xml');
assert(drawing.includes('<xdr:row>9</xdr:row>')&&drawing.includes('<xdr:row>25</xdr:row>'),'charts moved into compact space');
assert(!drawing.includes('<xdr:row>41</xdr:row>'),'no former massive chart region');
assert(entries.get('xl/workbook.xml').includes('name="Chart Data"')&&!/<sheet name="Chart Data"[^>]*state="hidden"/.test(entries.get('xl/workbook.xml')),'chart data visible for desktop Excel compatibility');
assert(['19','20','21','22'].every(style=>agent.includes(`s="${style}"`)),'B/C/D/F grade light fills preserved');
assert(agent.includes('s="10" t="n"'),'time stays numeric and editable');
assert(entries.get('xl/styles.xml').includes('<sz val="10"/>'),'body font 10pt');
assert(entries.get('xl/styles.xml').includes('<sz val="15"/>'),'title font 15pt');
for(let i=1;i<=3;i++){
  const chart=entries.get(`xl/charts/chart${i}.xml`);
  assert(chart?.includes('Chart Data'),'editable native charts remain linked');
  assert(!chart.includes('<c:externalData')&&!chart.includes('<c:printSettings>'),'no invalid external data or redundant chart print settings');
}
const short=api.buildXlsx({...report,tables:{activity:report.tables.activity,storeStatus:'No store data'}});
assert(short.length>0,'agent-only report exports');
const csv=api.buildCsv(report);assert(csv.includes('1m 15s'),'readable CSV timing preserved');
if(process.env.TT_COMPACT_XLSX_SAMPLE)fs.writeFileSync(process.env.TT_COMPACT_XLSX_SAMPLE,bytes);
console.log('PASS M2.9.50 Compact Executive Excel: <=26-width detail columns, 22pt rows, 30pt headers, compact KPI/charts, notes layout, 8 sheets/3 linked native charts, numeric times, grade fills, scoped unchanged source.');
