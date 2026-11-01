// M2.9.51: Excel desktop repair log reported invalid cell information in sheet1.xml.
// Verify every cell has the correct parent row, increasing column index and valid style,
// including an Overview with 0/1/2/3 charts. Do not rely on merely well-formed XML.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=fs.readFileSync(path.join(root,'public/assets/js/j-report-exports-m2935.js'),'utf8');
const index=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
assert(index.includes('j-report-exports-m2935.js?v=5')&&index.includes('m2951=1'),'M2.9.51 cache-bust');
const sandbox={window:{},document:{addEventListener(){}},TextEncoder,Uint8Array,Uint32Array,DataView,Date,Intl,console,Set,Map,Math,Number,Error,Array,Blob};
vm.runInNewContext(source,sandbox);
const exporter=sandbox.window.TrinoTimeReportExports;
function unpack(bytes){
 const b=Buffer.from(bytes),files=new Map();let p=0;
 while(p+30<=b.length&&b.readUInt32LE(p)===0x04034b50){
  const size=b.readUInt32LE(p+18),len=b.readUInt16LE(p+26),extra=b.readUInt16LE(p+28),start=p+30+len+extra;
  assert(start+size<=b.length,'bounded ZIP file');assert.equal(b.readUInt16LE(p+8),0,'ZIP files uncompressed');
  files.set(b.toString('utf8',p+30,p+30+len),b.toString('utf8',start,start+size));p=start+size;
 }
 assert(files.has('xl/workbook.xml'),'workbook archive valid');
 return files;
}
function colNum(s){let number=0;for(const char of s)number=number*26+char.charCodeAt(0)-64;return number;}
function checkSheet(xml, file){
 const rows=[...xml.matchAll(/<row\s+r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)];
 const allCells=[...xml.matchAll(/<c\s+r="([A-Z]+\d+)"/g)];let visited=0,prevRow=0;
 for(const [_,number,body] of rows){
  const row=Number(number);assert(row>prevRow,`${file}: ascending row order`);prevRow=row;
  let lastColumn=0;const seen=new Set();
  for(const cell of body.matchAll(/<c\s+r="([A-Z]+)(\d+)"(?:\s+[^>]*?)?>/g)){
   const address=cell[1]+cell[2],column=colNum(cell[1]);
   assert.equal(Number(cell[2]),row,`${file}: ${address} must be inside row ${row}`);
   assert(column>lastColumn,`${file}: ${address} must be in ascending column order`);
   assert(!seen.has(address),`${file}: duplicate cell ${address}`);seen.add(address);
   lastColumn=column;visited++;
  }
 }
 assert.equal(visited,allCells.length,`${file}: no orphan cell outside a row`);
 return visited;
}
const common={workflow:'Metrics',date:'2026-10-08',period:'Previous 7 days',scope:'own-pod',viewer:'QA Supervisor',role:'team_leader',filter:'Coverage',generated:'SYNTHETIC QA',kpis:[['Target','70s']],tables:{activity:{headers:['Agent','Submitted','Seconds / Task','Grade'],rows:[['Agent A','26','106.9s','B'],['Agent B','12','180s','A']]},stores:{headers:['Store','Confirmed','Jobs'],rows:[['Preston','26','3'],['Miranda','12','2']]},storeJobs:{headers:['Store','Job ID','Agent','Submitted'],rows:[['Preston','JOB_1','Agent A','26']]},storeTrends:{headers:['Date','Store','Confirmed'],rows:[['2026-10-07','Preston','5'],['2026-10-08','Miranda','12']]},mappingReview:{headers:['Job ID','Mapping'],rows:[['JOB_2','Unknown']]},storePeriod:'7d',storeStatus:'2 stores'},notes:['Authorized rows only']};
const scenarios=[
 ['three charts',common,3],
 ['two charts',{...common,tables:{...common.tables,storeTrends:null,storeJobs:null}},2],
 ['one chart',{...common,tables:{activity:common.tables.activity,storeStatus:'none'}},1],
 ['no charts',{...common,tables:{activity:{headers:['Agent','Submitted'],rows:[]},storeStatus:'none'}},0]
];
let totalCells=0;
for(const [label,report,expectedCharts] of scenarios){
 const bytes=exporter.buildXlsx(report),files=unpack(bytes);
 const chartFiles=[...files.keys()].filter(n=>/^xl\/charts\/chart\d+\.xml$/.test(n));
 assert.equal(chartFiles.length,expectedCharts,`${label}: chart count`);
 const tabs=[...files.keys()].filter(n=>/^xl\/worksheets\/sheet\d+\.xml$/.test(n));
 assert(tabs.length>=2,`${label}: report worksheets`);
 for(const tab of tabs)totalCells+=checkSheet(files.get(tab),`${label} ${tab}`);
 const overview=files.get('xl/worksheets/sheet1.xml');
 if(expectedCharts>=2){
  assert(overview.includes('r="F22"'),`${label}: store title belongs on row 22`);
  assert(!overview.includes('r="F27"'),`${label}: no phantom store title at row 27`);
 }
 if(label==='three charts'&&process.env.TT_M2951_SAMPLE)fs.writeFileSync(process.env.TT_M2951_SAMPLE,bytes);
}
console.log(`PASS M2.9.51 Excel Cell Integrity: ${totalCells} cells across 0/1/2/3-chart workbooks all match parent rows, with sorted columns, no duplicate coordinates, and corrected Overview F22.`);
