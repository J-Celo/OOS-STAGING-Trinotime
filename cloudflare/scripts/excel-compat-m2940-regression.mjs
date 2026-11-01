import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root,'public/assets/js/j-report-exports-m2935.js'),'utf8');
const page = fs.readFileSync(path.join(root,'public/index.html'),'utf8');
assert(page.includes('j-report-exports-m2935.js?v=5&m2936=1&m2937=1&m2938=1&m2939=1&m2940=1'), 'hotfix export code is cache-busted');
const context={window:{}, document:{addEventListener(){}}, TextEncoder,Uint8Array,Uint32Array,DataView,Date,Intl,console,Set,Map,Math,Number,Error,Array,Blob};
vm.runInNewContext(source,context);
const build=context.window.TrinoTimeReportExports.buildXlsx;
const table={headers:['Agent','Submitted','Seconds / Task','Grade'],rows:[['Agent One','26','106.9s','B'],['Agent Two','3','180s','A']]};
const sample={workflow:'Metrics',date:'2026-10-08',period:'Historical date',scope:'own-pod',viewer:'Lead',role:'team_leader',filter:'Coverage only',generated:'Oct 8, 2026',kpis:[['Submitted','29']],tables:{activity:table,stores:{headers:['Store','Confirmed'],rows:[['Preston','2'],['Miranda','5']]},storeTrends:{headers:['Date','Confirmed'],rows:[['2026-10-07','2'],['2026-10-08','5']]},storeJobs:{headers:['Job ID','Mapping'],rows:[['JOB_1','unknown']]},storeStatus:'1 unknown'},notes:['Safe snapshot']};
function unzipStored(bytes){
  const b=Buffer.from(bytes),entries=new Map();let offset=0;
  while(offset+30<=b.length && b.readUInt32LE(offset)===0x04034b50){
    const method=b.readUInt16LE(offset+8),len=b.readUInt32LE(offset+18),nameLen=b.readUInt16LE(offset+26),extra=b.readUInt16LE(offset+28);
    assert.equal(method,0,'native writer stores uncompressed bytes');
    const name=b.toString('utf8',offset+30,offset+30+nameLen),start=offset+30+nameLen+extra;
    assert(start+len<=b.length,'ZIP entry fits');entries.set(name,b.toString('utf8',start,start+len));
    offset=start+len;
  }
  assert(entries.size>=8,'all workbook parts present');return entries;
}
function childTags(xml){
  // Distinguish actual top-level worksheet children from nested cells using depth.
  const tags=[];let depth=0;
  for(const match of xml.matchAll(/<\/?(?:[a-zA-Z][\w.:-]*)(?:\s[^<>]*?)?\s*\/?>/g)){
    const tag=match[0],close=tag.startsWith('</'),self=tag.endsWith('/>');
    const name=tag.match(/^<\/?([\w.:-]+)/)?.[1];
    if(close)depth--;else{if(depth===1)tags.push(name);if(!self)depth++;}
  }
  return tags;
}
function ordered(tags){
  const order=['dimension','sheetViews','sheetFormatPr','cols','sheetData','autoFilter','mergeCells','conditionalFormatting','printOptions','pageMargins','pageSetup','drawing'];
  let prev=-1;
  for(const tag of tags){
    assert(order.includes(tag),`unexpected worksheet top-level ${tag}`);
    const current=order.indexOf(tag);
    assert(current>=prev,`wrong element ordering: ${order[prev]} before ${tag}`);
    prev=current;
  }
}
function validate(report,shouldHaveCharts){
  const entries=unzipStored(build(report));
  const workbook=entries.get('xl/workbook.xml');
  assert(workbook?.includes('name="Overview"'),'Overview sheet exists');
  const worksheets=[...entries.keys()].filter(n=>/^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  for(const sheetName of worksheets){
    const tags=childTags(entries.get(sheetName));ordered(tags);
    assert(tags.includes('sheetData'),'worksheet has sheetData');
    assert(!/<drawing\b[\s\S]*?<printOptions/.test(entries.get(sheetName)),'drawing must not precede print options');
  }
  const charts=[...entries.keys()].filter(n=>/^xl\/charts\/chart\d+\.xml$/.test(n));
  assert.equal(charts.length,shouldHaveCharts?3:0,'expected charts follow measured data');
  if(shouldHaveCharts){
    const drawing=entries.get('xl/drawings/drawing1.xml');
    assert(drawing.includes('xdr:graphicFrame'),'native chart frames');
    assert(entries.get('xl/worksheets/_rels/sheet1.xml.rels').includes('Target="../drawings/drawing1.xml"'),'worksheet points to drawing');
    const drawingRel=entries.get('xl/drawings/_rels/drawing1.xml.rels');
    for(let i=1;i<=charts.length;i++){
      assert(drawingRel.includes(`Target="../charts/chart${i}.xml"`),'chart relationship points to existing part');
      const chart=entries.get(`xl/charts/chart${i}.xml`);
      assert(!chart.includes('<c:externalData'),'no invalid/unresolved chart externalData relationship');
      assert(chart.includes('Chart Data'),'chart references internal source');
      assert(chart.includes('<c:numRef>'),'values numeric');
    }
    assert(entries.get('xl/worksheets/sheet2.xml').includes('conditionalFormatting'),'grade formats retained');
    assert(entries.get('xl/worksheets/sheet2.xml').includes('t="n"'),'numeric time retained');
  }else assert(!workbook.includes('Chart Data'),'no synthetic chart table when empty');
  return {sheets:worksheets.length,charts:charts.length};
}
const full=validate(sample,true);
const empty=validate({...sample,tables:{activity:{headers:['Agent','Submitted'],rows:[]},storeStatus:'Nothing recorded'}},false);
console.log(`PASS M2.9.40 Excel repair regression — ${full.sheets} populated sheets, ${full.charts} valid native chart relations; ${empty.sheets} chart-free sheets; correct worksheet order; no externalData; numeric seconds and grades intact.`);
