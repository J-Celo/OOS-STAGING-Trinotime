/* M2.9.35 — Client-side, scoped operations reporting.
   Pure browser export of the already-authorized dashboard view. No remote library,
   no privileged export endpoint, no changes to calculations or write authority. */
(() => {
  'use strict';
  if (window.TrinoTimeReportExports) return;
  const enc = new TextEncoder();
  const rootIds = {coverage:'ttCoverageRoot',confirmation:'ttConfirmationRoot',metrics:'ttMetricsRoot'};
  const contexts = Object.create(null);
  const nowText = () => new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short'}).format(new Date())+' PHT';
  const safe = v => String(v??'').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g,'').slice(0,32700).trim();
  const xml = v => safe(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
  const csvSafe = v => {const s=safe(v);return /^[\s]*[=+@\-\t\r]/.test(s)?"'"+s:s;};
  const csvLine = values => values.map(v=>'"'+csvSafe(v).replace(/"/g,'""')+'"').join(',');
  const fromCell = cell => safe(cell?.innerText||cell?.textContent||'').replace(/\s+/g,' ').trim();
  const visible = el => Boolean(el && !el.hidden && !el.closest('[hidden]') && (typeof getComputedStyle!=='function'||getComputedStyle(el).display!=='none'));
  const selected = id => {const el=document.getElementById(id);return el?.selectedOptions?.[0]?.textContent?.trim()||el?.value||'';};
  const getText = sel => safe(document.querySelector(sel)?.textContent).replace(/\s+/g,' ').trim();
  const pad = n => String(n).padStart(2,'0');
  const fileName = (report,ext)=>`TrinoTime-${report.workflow}-${String(report.date||'current').replace(/[^\w-]/g,'-')}-${new Date().toISOString().slice(0,10)}.${ext}`;
  function tableData(table,prepend=''){
    if (!table) return null;
    const headers=[...table.querySelectorAll('thead th')].map(fromCell);
    if(!headers.length)return null;
    const rows=[...table.querySelectorAll('tbody tr')].filter(visible).map(row=>[...row.querySelectorAll('td')].map(fromCell)).filter(a=>a.length===headers.length && a.some(Boolean));
    if(prepend){headers.unshift('POD / Group');for(const r of rows)r.unshift(prepend);}
    return {headers,rows};
  }
  function collectTables(root,workflow,context){
    const t={};
    if(workflow==='coverage'){
      const all=[...root.querySelectorAll('table.tt-coverage-table')];
      const combined=[];let headers=[];
      for(const table of all){
        const group=table.closest('[data-coverage-pod]');
        const label=group?.querySelector('.tt-coverage-pod-title,.tt-coverage-pod-head h3,.tt-coverage-panel-head h3')?.textContent?.trim()||getText('.tt-coverage-scope')||'Authorized scope';
        const part=tableData(table,label);if(!part)continue;
        headers=part.headers;combined.push(...part.rows);
      }
      if(headers.length)t.activity={headers,rows:combined};
    } else if(workflow==='confirmation'){
      t.activity=tableData(root.querySelector('table.tt-confirmation-table'));
    } else {
      t.activity=tableData(root.querySelector('table.tt-metrics-table'));
      t.history=tableData(root.querySelector('#ttMetricsShiftScorecardsBody table.tt-ops-table'));
    }
    const panel=root.querySelector('[data-tt-store-panel]');
    const storeStatus=safe(panel?.querySelector('.tt-si-status')?.textContent||'Store report has not loaded.');
    t.storeStatus=storeStatus;
    // The store accordion is collapsed by default. Export only the most recent
    // scoped, server-authorized dataset, not whatever table happens to be open.
    const secure=window.TrinoTimeStoreIntelligence?.getReportData?.(workflow,context);
    if(secure){
      t.stores=secure.stores;
      t.storeJobs=secure.storeJobs;
      if(secure.period==='7d')t.storeTrends=secure.trends;
      if(secure.mappingReview.rows.length)t.mappingReview=secure.mappingReview;
      if(secure.truncated)t.storeStatus+=` · PARTIAL JOB LEDGER: ${secure.storeJobs.rows.length} of ${secure.total} rows loaded`;
      t.storePeriod=secure.period;
    }else if(!window.TrinoTimeStoreIntelligence){
      // Compatibility with older deployments without a secure Store client.
      const storeReady=!/^(refreshing|loading|store data unavailable)/i.test(storeStatus);
      t.stores=storeReady?tableData(panel?.querySelector('.tt-si-list table')):null;
      t.storeJobs=storeReady?tableData(panel?.querySelector('.tt-si-jobs table')):null;
    }
    return t;
  }
  function collectKpis(root,workflow){
    const selector=workflow==='coverage'?'.tt-coverage-metric':workflow==='confirmation'?'.tt-ops-stat':'.tt-mx-stat';
    const seen=new Set();const kpis=[];
    for(const card of root.querySelectorAll(selector)){
      if(!visible(card))continue;
      const label=fromCell(card.querySelector('span:not([class]),.tt-mx-stat-label,small:first-child'))||fromCell(card.querySelector('span'));
      const value=fromCell(card.querySelector('strong,.tt-coverage-metric-value'));
      if(!label||!value||seen.has(label))continue;
      seen.add(label);kpis.push([label,value]);
      if(kpis.length>=20)break;
    }
    return kpis;
  }
  function capture(workflow){
    const context=contexts[workflow];const outer=document.getElementById(rootIds[workflow]);
    if(!context?.viewer?.role||!outer||!visible(outer))throw Error('The secure dashboard is not ready. Open the dashboard and refresh first.');
    if(outer.querySelector('.tt-coverage-error,.tt-ops-body>.tt-coverage-error'))throw Error('Dashboard data is unavailable. Refresh before exporting.');
    const role=safe(context.viewer.role),name=safe(context.viewer.name);
    if(!['admin','team_leader','agent'].includes(role)||!name||!['all-pods','own-pod','self'].includes(context.scope))throw Error('Authorized report scope is unavailable.');
    const currentActor=window.TrinoTimeMessagingSessionContext?.getActor?.();
    if(currentActor?.role && role!=='admin'){
      const normalized=s=>String(s||'').toLowerCase().replace(/[\s-]/g,'_');
      if(normalized(currentActor.role)!==normalized(role)||String(currentActor.name||'').toLowerCase()!==name.toLowerCase())throw Error('Your TrinoTime account changed. Refresh before exporting.');
    }
    const period=workflow==='metrics'?selected('ttMetricsRange')||'Current/latest shift':'Selected Philippine date';
    const selectedDate=workflow==='coverage'?document.getElementById('ttCoverageDate')?.value:workflow==='confirmation'?document.getElementById('ttConfirmationDate')?.value:document.getElementById('ttMetricsDate')?.value;
    if(workflow!=='metrics'||document.getElementById('ttMetricsRange')?.value==='date'){
      if(context.date && selectedDate && selectedDate!==context.date)throw Error('The selected date is still loading. Refresh before exporting.');
    }
    const root=workflow==='coverage'?outer:outer.querySelector(workflow==='metrics'?'#ttMetricsBody':'#ttConfirmationBody');
    if(!root)throw Error('Dashboard detail is not loaded.');
    const tables=collectTables(root,workflow,context);
    if(!tables.activity)throw Error('Agent activity is not loaded yet. Refresh before exporting.');
    let filter='All visible records';
    if(workflow==='coverage')filter=safe(outer.querySelector('[data-coverage-filter].is-active,[data-coverage-filter][aria-pressed="true"]')?.textContent||'All statuses');
    else if(workflow==='confirmation')filter=selected('ttConfirmationPod')||'All PODs / Teams';
    else filter=[selected('ttMetricsJob'),selected('ttMetricsAgent')||'All agents',selected('ttMetricsPodScope')].filter(Boolean).join(' · ');
    const report={workflow:workflow[0].toUpperCase()+workflow.slice(1),date:context.date||'current',period,scope:context.scope,viewer:name,role,filter,generated:nowText(),kpis:collectKpis(root,workflow),tables,notes:[
      'Exports contain the currently authorized, displayed dashboard rows and applied UI filters; paginated Metrics rosters include only the loaded page.',
      'Store Activity, Store Jobs and Store Trends reflect the Store Intelligence reporting period (Selected day or 7 days), independently of collapsed panels. Metrics shift range may differ.',
      'Store mappings may be Tracker-observed, Unknown, or Needs review. Conflicts are not automatically assigned. Store pace is active seconds per confirmed submission, never an Agent efficiency grade.',
      'PDF may use several column bands to preserve every wide-table column. XLSX retains separate styled worksheets and editable native charts linked to the Chart Data tab (when source values exist).'
    ]};
    return report;
  }
  function reportSheets(report){
    const rows=[['Metric','Value'],['Dashboard',report.workflow],['Period',report.period],['Reference date (PHT)',report.date],['Scope',report.scope],['Viewed by',`${report.viewer} (${report.role})`],['Filters',report.filter],['Generated',report.generated],['Exported activity rows',report.tables.activity?.rows.length||0],['Store report status',report.tables.storeStatus],['Store reporting period',report.tables.storePeriod||'Not loaded'],...report.kpis];
    const shape=(name,table,type='data')=>({name,headers:table.headers,rows:prettifyRows(table.headers,table.rows),type});
    return [
      {name:'Overview',headers:['Field','Result'],rows:rows.slice(1),type:'overview'},
      shape('Agent Activity',report.tables.activity||{headers:['Status'],rows:[['No rows displayed']]}),
      ...(report.tables.stores?[shape('Store Activity',report.tables.stores)]:[]),
      ...(report.tables.storeJobs?[shape('Store Jobs',report.tables.storeJobs)]:[]),
      ...(report.tables.storeQueue?[shape('Store Queue',report.tables.storeQueue)]:[]),
      ...(report.tables.storeTrends?[shape('Store Trends',report.tables.storeTrends)]:[]),
      ...(report.tables.mappingReview?[shape('Mapping Review',report.tables.mappingReview)]:[]),
      ...(report.tables.history?[shape('Shift History',report.tables.history)]:[]),
      {name:'Report Notes',headers:['#','Methodology / scope note'],rows:report.notes.map((n,i)=>[i+1,n]),type:'notes'}
    ];
  }
  function buildCsv(report){
    const chunks=[];
    for(const sheet of reportSheets(report)){
      chunks.push(csvLine([sheet.name]));chunks.push(csvLine(sheet.headers));
      for(const row of sheet.rows)chunks.push(csvLine(row));
      chunks.push('');
    }
    return '\uFEFF'+chunks.join('\r\n');
  }
  function normalizeHeader(value){return safe(value).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
  function findHeader(headers, patterns){
    const normalized=headers.map(normalizeHeader);
    for(const pattern of patterns){
      const index=normalized.findIndex(h=>pattern.test(h));
      if(index>=0)return index;
    }
    return -1;
  }
  function numberish(value){
    const direct=asNum(value);
    if(direct!==null)return direct;
    const str=safe(value).replace(/,/g,'').trim();
    const match=str.match(/-?\d+(?:\.\d+)?/);
    if(!match)return null;
    const n=Number(match[0]);
    return Number.isFinite(n)?n:null;
  }
  function formatSecondsHuman(seconds){
    const n=Number(seconds);
    if(!Number.isFinite(n))return '';
    const sign=n<0?'-':'';
    let remaining=Math.abs(n);
    const hours=Math.floor(remaining/3600);remaining-=hours*3600;
    const minutes=Math.floor(remaining/60);remaining-=minutes*60;
    const secText=(Math.round(remaining*10)/10).toFixed(Number.isInteger(Math.round(remaining*10)/10)?0:1).replace(/\.0$/,'')+'s';
    const parts=[];
    if(hours)parts.push(hours+'h');
    if(hours||minutes)parts.push(minutes+'m');
    parts.push(secText);
    return sign+parts.join(' ');
  }
  function maybeFormatSecondsCell(header, value){
    const raw=safe(value);
    if(!raw || raw==='—' || raw==='-')return raw||'—';
    const normalized=normalizeHeader(header);
    const looksSecondMetric=/(sec|second|pace)/.test(normalized);
    if(!looksSecondMetric)return raw;
    const exactSeconds=raw.match(/^(-?\d+(?:\.\d+)?)\s*s$/i);
    if(exactSeconds)return formatSecondsHuman(Number(exactSeconds[1]));
    if(/^[-+]?\d+(?:\.\d+)?$/.test(raw) && /(sec|second|pace)/.test(normalized))return formatSecondsHuman(Number(raw));
    return raw;
  }
  function prettifyRows(headers, rows){
    return (rows||[]).map(row=>headers.map((header,index)=>maybeFormatSecondsCell(header,row[index]??'')));
  }
  function shortLabel(value, max=26){
    const text=safe(value).replace(/\s+/g,' ').trim();
    return text.length>max?text.slice(0,Math.max(8,max-1)).trimEnd()+'…':text;
  }
  function chartPalette(){
    return {navy:'#10223B', blue:'#1D3A5A', accent:'#2F6FDB', soft:'#EAF1F8', grid:'#D8E3F0', text:'#253650', muted:'#6A778B', success:'#2A7F62', warning:'#CC8A00', danger:'#C84C5A'};
  }
  function xmlText(value){return xml(String(value??''));}
  function collectOverviewCharts(report){
    const charts=[];
    const activity=report.tables.activity;
    if(activity?.headers?.length && activity?.rows?.length){
      const agentIndex=findHeader(activity.headers,[/^agent$/, /labeler/, /name/]);
      const submittedIndex=findHeader(activity.headers,[/^submitted$/, /^confirmed$/, /task/]);
      if(agentIndex>=0 && submittedIndex>=0){
        const byAgent=new Map();
        for(const row of activity.rows){
          const label=safe(row[agentIndex]);
          const value=numberish(row[submittedIndex]);
          if(!label || value===null || value<=0)continue;
          byAgent.set(label,(byAgent.get(label)||0)+value);
        }
        const data=[...byAgent.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8).map(([label,value])=>({label:shortLabel(label,28),value}));
        if(data.length)charts.push({kind:'bar',title:'Submitted tasks by agent',subtitle:'Top visible agents in the current authorized export scope',data,series:'Submitted'});
      }
    }
    const stores=report.tables.stores;
    if(stores?.headers?.length && stores?.rows?.length){
      const storeIndex=findHeader(stores.headers,[/^store$/]);
      const volumeIndex=findHeader(stores.headers,[/^confirmed$/, /^submitted$/, /jobs/]);
      if(storeIndex>=0 && volumeIndex>=0){
        const grouped=new Map();
        for(const row of stores.rows){const key=safe(row[storeIndex]);const value=numberish(row[volumeIndex]);if(!key||value===null||value<0)continue;grouped.set(key,(grouped.get(key)||0)+value);}
        const data=[...grouped.entries()].map(([key,value])=>({label:shortLabel(key,24),value})).filter(item=>item.value>0).sort((a,b)=>b.value-a.value).slice(0,8);
        if(data.length)charts.push({kind:'bar',title:'Store activity by store',subtitle:'Visible store totals in the current report',data,series:safe(stores.headers[volumeIndex])||'Volume'});
      }
    }
    const trends=report.tables.storeTrends;
    if(trends?.headers?.length && trends?.rows?.length){
      const dateIndex=findHeader(trends.headers,[/^date$/]);
      const valueIndex=findHeader(trends.headers,[/^confirmed$/, /^submitted$/, /jobs/]);
      if(dateIndex>=0 && valueIndex>=0){
        const byDate=new Map();
        for(const row of trends.rows){
          const date=safe(row[dateIndex]);const value=numberish(row[valueIndex]);
          if(!date || value===null)continue;
          byDate.set(date,(byDate.get(date)||0)+value);
        }
        const data=[...byDate.entries()].sort((a,b)=>String(a[0]).localeCompare(String(b[0]))).slice(-7).map(([label,value])=>({label:label.slice(5),value}));
        if(data.length>=2)charts.push({kind:'line',title:'Seven-day activity trend',subtitle:'Aggregated visible store activity by date',data,series:safe(trends.headers[valueIndex])||'Activity'});
      }
    }
    if(charts.length<3){
      const storeJobs=report.tables.storeJobs;
      if(storeJobs?.headers?.length && storeJobs?.rows?.length){
        const mappingIndex=findHeader(storeJobs.headers,[/^mapping$/, /mapping state/, /mapping status/]);
        if(mappingIndex>=0){
          const counts={Observed:0,Unknown:0,'Needs review':0};
          for(const row of storeJobs.rows){
            const value=normalizeHeader(row[mappingIndex]);
            if(!value)continue;
            if(/unknown/.test(value))counts.Unknown++;
            else if(/review|conflict/.test(value))counts['Needs review']++;
            else counts.Observed++;
          }
          const data=Object.entries(counts).filter(([,value])=>value>0).map(([label,value])=>({label,value}));
          if(data.length)charts.push({kind:'donut',title:'Store mapping quality',subtitle:'Observed vs Unknown vs Needs review',data});
        }
      }
    }
    return charts.slice(0,3);
  }
  // Native DrawingML charts (NOT static SVGs). Data lives on a user-editable
  // Chart Data worksheet. Native charts can be edited in Excel and reflect edits
  // to the linked numeric/chart-label cells in that worksheet.
  function workbookCharts(report){
    const specs=collectOverviewCharts(report);
    const rows=[];
    const charts=[];
    let cursor=8;
    for(const spec of specs){
      const start=cursor;
      rows.push({at:start-2,label:spec.title});
      rows.push({at:start-1,label:'Category',value:spec.series||'Count'});
      for(let i=0;i<spec.data.length;i++){
        const item=spec.data[i];
        rows.push({at:cursor+i,label:safe(item.label),value:Number(item.value)});
      }
      charts.push({...spec,first:start,last:cursor+spec.data.length-1});
      cursor+=spec.data.length+5;
    }
    return {charts,rows};
  }
  function chartCellReferences(chart){
    const sheet="'Chart Data'!";
    return {categories:`${sheet}$A$${chart.first}:$A$${chart.last}`,values:`${sheet}$B$${chart.first}:$B$${chart.last}`};
  }
  function chartXml(spec,index){
    const xmlns='xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
    const refs=chartCellReferences(spec),count=spec.data.length;
    const categoryCache=spec.data.map((item,i)=>`<c:pt idx="${i}"><c:v>${xml(item.label)}</c:v></c:pt>`).join('');
    const numericCache=spec.data.map((item,i)=>`<c:pt idx="${i}"><c:v>${Number(item.value)}</c:v></c:pt>`).join('');
    const series=`<c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:v>${xml(spec.series||'Volume')}</c:v></c:tx><c:spPr><a:solidFill><a:srgbClr val="3272CE"/></a:solidFill></c:spPr><c:cat><c:strRef><c:f>${xml(refs.categories)}</c:f><c:strCache><c:ptCount val="${count}"/>${categoryCache}</c:strCache></c:strRef></c:cat><c:val><c:numRef><c:f>${xml(refs.values)}</c:f><c:numCache><c:formatCode>#,##0</c:formatCode><c:ptCount val="${count}"/>${numericCache}</c:numCache></c:numRef></c:val></c:ser>`;
    const labels=`<c:dLbls><c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1000"><a:solidFill><a:srgbClr val="233955"/></a:solidFill></a:defRPr></a:pPr><a:endParaRPr lang="en-US"/></a:p></c:txPr><c:dLblPos val="${spec.kind==='bar'?'outEnd':'t'}"/><c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/></c:dLbls>`;
    const axisText=`<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1000"><a:solidFill><a:srgbClr val="44566D"/></a:solidFill></a:defRPr></a:pPr><a:endParaRPr lang="en-US"/></a:p></c:txPr>`;
    const idCat=45000+index*2,idVal=idCat+1;
    const axes=`<c:catAx><c:axId val="${idCat}"/><c:scaling><c:orientation val="${spec.kind==='bar'?'maxMin':'minMax'}"/></c:scaling><c:delete val="0"/><c:axPos val="${spec.kind==='line'?'b':'l'}"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="D8E3F0"/></a:solidFill></a:ln></c:spPr>${axisText}<c:crossAx val="${idVal}"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblOffset val="100"/></c:catAx><c:valAx><c:axId val="${idVal}"/><c:scaling><c:orientation val="minMax"/><c:min val="0"/></c:scaling><c:delete val="0"/><c:axPos val="${spec.kind==='line'?'l':'b'}"/><c:numFmt formatCode="#,##0" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="D8E3F0"/></a:solidFill></a:ln></c:spPr>${axisText}<c:crossAx val="${idCat}"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>`;
    let plot;
    if(spec.kind==='line'){
      plot=`<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${series}${labels}<c:marker val="1"/><c:smooth val="0"/><c:axId val="${idCat}"/><c:axId val="${idVal}"/></c:lineChart>${axes}`;
    }else if(spec.kind==='donut'){
      plot=`<c:doughnutChart><c:varyColors val="1"/>${series}<c:dLbls><c:dLblPos val="bestFit"/><c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="1"/><c:separator> · </c:separator></c:dLbls><c:firstSliceAng val="270"/><c:holeSize val="65"/></c:doughnutChart>`;
    }else{
      plot=`<c:barChart><c:barDir val="bar"/><c:grouping val="clustered"/><c:varyColors val="0"/>${series}${labels}<c:gapWidth val="85"/><c:axId val="${idCat}"/><c:axId val="${idVal}"/></c:barChart>${axes}`;
    }
    const title=`<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1100" b="1"/></a:pPr><a:r><a:rPr lang="en-US" sz="1100" b="1"><a:solidFill><a:srgbClr val="142B47"/></a:solidFill></a:rPr><a:t>${xml(spec.title)}</a:t></a:r><a:endParaRPr lang="en-US"/></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>`;
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><c:chartSpace ${xmlns}><c:lang val="en-US"/><c:chart>${title}<c:autoTitleDeleted val="0"/><c:plotArea>${plot}</c:plotArea><c:plotVisOnly val="0"/><c:dispBlanksAs val="gap"/></c:chart></c:chartSpace>`;
  }
  function drawingXml(charts){
    const count=charts.length;
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">${charts.map((chart,index)=>{
      // The first charts must be visible immediately below the KPI strip,
      // not 40–70 rows down. Report metadata is placed BELOW the charts.
      const layout=count===1?[0,9,9,21]:index===0?[0,9,4,21]:index===1?[5,9,9,21]:[0,25,9,34];
      const [left,top,right,bottom]=layout;
      const marker=(tag,col,row)=>`<xdr:${tag}><xdr:col>${col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:${tag}>`;
      return `<xdr:twoCellAnchor editAs="oneCell">${marker('from',left,top)}${marker('to',right,bottom)}<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${index+2}" name="TrinoTime ${xml(chart.title)}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId${index+1}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`;
    }).join('')}</xdr:wsDr>`;
  }
  // Minimal interoperable ZIP writer for native, formatted Office Open XML;
  // compression method 0 is supported by Excel and LibreOffice. No network dependency.
  const crcTable=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?(0xEDB88320^(c>>>1)):(c>>>1);t[n]=c>>>0;}return t;})();
  const crc32=data=>{let c=0xFFFFFFFF;for(const b of data)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0;};
  function zip(files){
    const sections=[],central=[];let offset=0;
    const u16=(dv,p,v)=>dv.setUint16(p,v,true),u32=(dv,p,v)=>dv.setUint32(p,v>>>0,true);
    for(const [name,content] of files){
      const filename=enc.encode(name),data=typeof content==='string'?enc.encode(content):content,crc=crc32(data);
      const local=new Uint8Array(30+filename.length),d=new DataView(local.buffer);u32(d,0,0x04034B50);u16(d,4,20);u16(d,6,0x0800);u16(d,8,0);u32(d,14,crc);u32(d,18,data.length);u32(d,22,data.length);u16(d,26,filename.length);local.set(filename,30);
      const cd=new Uint8Array(46+filename.length),v=new DataView(cd.buffer);u32(v,0,0x02014B50);u16(v,4,20);u16(v,6,20);u16(v,8,0x0800);u32(v,16,crc);u32(v,20,data.length);u32(v,24,data.length);u16(v,28,filename.length);u32(v,42,offset);cd.set(filename,46);
      sections.push(local,data);central.push(cd);offset+=local.length+data.length;
    }
    const start=offset;for(const c of central){sections.push(c);offset+=c.length;}
    const end=new Uint8Array(22),dv=new DataView(end.buffer);u32(dv,0,0x06054B50);u16(dv,8,files.length);u16(dv,10,files.length);u32(dv,12,offset-start);u32(dv,16,start);sections.push(end);
    const joined=new Uint8Array(offset+end.length);let p=0;for(const s of sections){joined.set(s,p);p+=s.length;}return joined;
  }
  function colName(index){let s='';for(let n=index+1;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;}
  function asNum(value){const str=safe(value);if(!/^[-+]?\d[\d,]*(\.\d+)?$/.test(str))return null;const n=Number(str.replace(/,/g,''));return Number.isFinite(n)&&Math.abs(n)<1e14?n:null;}
  function parseDurationSeconds(value){
    const v=safe(value).toLowerCase().trim();
    if(/^\d+(?:\.\d+)?$/.test(v))return Number(v);
    if(/^\d+(?:\.\d+)?s$/.test(v))return Number(v.slice(0,-1));
    if(!/^(?:\d+(?:\.\d+)?h\s*)?(?:\d+(?:\.\d+)?m\s*)?(?:\d+(?:\.\d+)?s)?$/.test(v)||!/[hms]/.test(v))return null;
    const chunks=[...v.matchAll(/(\d+(?:\.\d+)?)([hms])/g)];
    return chunks.length?chunks.reduce((sum,m)=>sum+Number(m[1])*({h:3600,m:60,s:1}[m[2]]),0):null;
  }
  const durationHeader=header=>/\b(sec|secs|seconds|second)\b/i.test(header)||/sec\s*\//i.test(header)||/\/\s*sec/i.test(header)||/\bpace\b/i.test(header);
  const gradeHeader=header=>/^(grade(?:\s*\(a.?f\))?|performance grade|agent grade|overall grade)$/i.test(safe(header));
  const efficiencyHeader=header=>/^(efficiency|efficiency %|efficiency percent|eff %)$/i.test(safe(header));
  const cellNumeric=(address,value,style)=>`<c r="${address}" s="${style}" t="n"><v>${value}</v></c>`;
  function xCell(row,col,value,style=4,header=''){
    const address=colName(col)+(row+1);
    const raw=safe(value);
    if(durationHeader(header)){
      const seconds=parseDurationSeconds(raw);
      if(seconds!==null && Number.isFinite(seconds) && seconds>=0)return cellNumeric(address,seconds/86400,style%2===0?10:11);
    }
    // Export-time exact grade palette: real cell fills, not unpredictable CF fills.
    // Retain formula-based grade emphasis below without allowing it to paint backgrounds black.
    if(gradeHeader(header)){
      const gradeIndex=['A','B','C','D','F'].indexOf(raw.toUpperCase());
      if(gradeIndex>=0)return `<c r="${address}" s="${18+gradeIndex}" t="str"><v>${xml(raw.toUpperCase())}</v></c>`;
    }
    const number=asNum(raw);
    if(number!==null)return cellNumeric(address,number,style===15?15:style%2===0?8:9);
    const pct=efficiencyHeader(header)&&raw.match(/^(\d+(?:\.\d+)?)\s*%$/);
    if(pct)return cellNumeric(address,Number(pct[1]),style%2===0?12:13);
    // Compact identity columns: center-wrap only when the visible label exceeds the
    // bounded column width. This avoids clipping long Chemist Warehouse store names.
    if(/^(store|store name|agent|agent name|job id)$/i.test(safe(header)) && raw.length>(/store/i.test(header)?26:/job id/i.test(header)?19:25)){
      const wrappedStyle=style%2===0?23:24;
      return `<c r="${address}" s="${wrappedStyle}" t="str"><v>${xml(raw)}</v></c>`;
    }
    // Always string, not formula. Untrusted report content must not become executable formulas.
    return `<c r="${address}" s="${style}" t="str"><v>${xml(raw)}</v></c>`;
  }
  const fill=(hex)=>`<fill><patternFill patternType="solid"><fgColor rgb="FF${hex}"/><bgColor indexed="64"/></patternFill></fill>`;
  const styles=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="2"><numFmt numFmtId="164" formatCode="[m]&quot;m &quot;ss.0&quot;s&quot;"/><numFmt numFmtId="165" formatCode="0.0&quot;%&quot;"/></numFmts>
  <fonts count="11"><font><sz val="10"/><color rgb="FF253650"/><name val="Aptos"/></font><font><b/><sz val="15"/><color rgb="FFFFFFFF"/><name val="Aptos Display"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Aptos"/></font><font><b/><sz val="10"/><color rgb="FF10223B"/><name val="Aptos"/></font><font><b/><sz val="10"/><color rgb="FF10223B"/><name val="Aptos"/></font><font><b/><sz val="17"/><color rgb="FF10223B"/><name val="Aptos Display"/></font>${['186347','2059A0','805912','A23A40','556174'].map(c=>`<font><b/><sz val="10"/><color rgb="FF${c}"/><name val="Aptos"/></font>`).join('')}</fonts>
  <fills count="14"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>${fill('101C30')}${fill('1D3A5A')}${fill('F4F8FC')}${fill('FFFFFF')}${fill('EAF1FB')}${fill('DFEBF9')}${fill('E9F4EF')}${['E5F5EE','EBF2FF','FFF5DF','FFEBEB','F1F2F5'].map(fill).join('')}</fills>
  <borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="hair"><color rgb="FFDDE6EF"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="25">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFill="1" applyFont="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="3" fillId="4" borderId="0" xfId="0" applyFill="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFill="1" applyFont="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFill="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyFill="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="4" fillId="6" borderId="1" xfId="0"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="4" fillId="7" borderId="1" xfId="0"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="3" fontId="0" fillId="4" borderId="1" xfId="0"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="3" fontId="0" fillId="5" borderId="1" xfId="0"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="164" fontId="0" fillId="4" borderId="1" xfId="0" applyNumberFormat="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="164" fontId="0" fillId="5" borderId="1" xfId="0" applyNumberFormat="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="165" fontId="0" fillId="4" borderId="1" xfId="0" applyNumberFormat="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="165" fontId="0" fillId="5" borderId="1" xfId="0" applyNumberFormat="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="3" fillId="6" borderId="0" xfId="0"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="5" fillId="6" borderId="0" xfId="0"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="3" fillId="4" borderId="0" xfId="0"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>
  ${['9','10','11','12','13'].map((fillId,index)=>`<xf numFmtId="0" fontId="${6+index}" fillId="${fillId}" borderId="1" xfId="0" applyFont="1" applyFill="1"><alignment horizontal="center" vertical="center"/></xf>`).join('')}
  <xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFill="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
  <xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyFill="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
  </cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
  <dxfs count="5">${['186347','2059A0','805912','A23A40','556174'].map(color=>`<dxf><font><b/><color rgb="FF${color}"/></font></dxf>`).join('')}</dxfs></styleSheet>`;
  function sheetXml(sheet,report,{hasDrawing=false,chartMeta=null}={}){
    const isOverview=sheet.type==='overview',isChartData=sheet.type==='chartData',isNotes=sheet.type==='notes';
    const count=Math.max(2,sheet.headers.length),last=colName(count-1),bannerLast=isOverview?'J':colName(Math.max(6,count-1));
    const rows=[],merges=[],post=[];
    const row=(r,height,cells)=>rows.push(`<row r="${r}" ht="${height}" customHeight="1">${cells.join('')}</row>`);
    const stringCell=(r,c,value,style)=>`<c r="${colName(c)}${r}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
    const merge=(r,a,b)=>merges.push(`${colName(a)}${r}:${colName(b)}${r}`);
    row(1,30,[stringCell(1,0,'TRINOTIME   /   '+sheet.name.toUpperCase(),1)]);merge(1,0,isOverview?9:Math.max(6,count-1));
    row(3,22,[stringCell(3,0,`${report.workflow}  •  ${report.period}  •  ${report.date}  •  ${report.scope}`,2)]);merge(3,0,isOverview?9:Math.max(6,count-1));
    let end=5,headersRow=5;
    if(isOverview){
      const headers=['VISIBLE AGENT ROWS','SUBMITTED TASKS','STORE GROUPS','JOB LEDGER ROWS','MAPPING REVIEW'];
      const data=report.tables.activity||{headers:[],rows:[]};
      const submitted=findHeader(data.headers,[/^submitted$/, /^confirmed$/]);
      const total=submitted<0?'—':data.rows.reduce((acc,record)=>{const n=numberish(record[submitted]);return n===null?acc:acc+n;},0);
      const cards=[data.rows.length,total,report.tables.stores?.rows?.length??'—',report.tables.storeJobs?.rows?.length??'—',report.tables.mappingReview?.rows?.length??0];
      // Keep label + number together when scrolling: the Overview has NO frozen panes.
      row(5,19,headers.map((v,i)=>stringCell(5,i*2,v,14)));
      row(6,32,cards.map((v,i)=>xCell(5,i*2,v,15)));
      for(let i=0;i<5;i++){merge(5,i*2,i*2+1);merge(6,i*2,i*2+1);}
      row(8,20,[stringCell(8,0,'PERFORMANCE SNAPSHOT  /  VISIBLE AUTHORIZED DATA',14)]);merge(8,0,9);
      const charts=chartMeta?.charts||[];
      if(!charts.length){row(12,26,[stringCell(12,0,(chartMeta?.omittedForCompatibility?'Native charts omitted for Excel compatibility. All authorized data remains in the report tabs.':'No measured activity available for charting in this selection.'),2)]);merge(12,0,9);}
      if(charts.length){
        // A single, concise takeaway per primary chart is enough as a fallback
        // when an Excel installation hides native chart category labels.
        const first=charts[0]?.data?.[0], second=charts[1]?.data?.[0];
        row(22,20,[stringCell(22,0,`TOP ${charts[0]?.kind==='bar'?'AGENT':'RESULT'}  /  VISIBLE RECORDS`,14),...(charts[1]?[stringCell(22,5,`TOP ${charts[1].kind==='bar'?'STORE':'RESULT'}  /  VISIBLE RECORDS`,14)]:[])]);
        merge(22,0,4);
        if(charts[1])merge(22,5,9);
        row(23,22,[stringCell(23,0,first?.label||'—',4),xCell(22,3,first?.value??'—',4),...(charts[1]?[stringCell(23,5,second?.label||'—',4),xCell(22,8,second?.value??'—',4)]:[])]);
        merge(23,0,2);merge(23,3,4);
        if(charts[1]){merge(23,5,7);merge(23,8,9);}
      }
      const third=charts[2];
      if(third){row(24,20,[stringCell(24,0,third.kind==='line'?'SEVEN-DAY ACTIVITY TREND  /  VISIBLE STORE DATA':'STORE MAPPING QUALITY  /  VISIBLE JOBS',14)]);merge(24,0,9);}
      const infoHeader=third?37:charts.length?26:13;
      row(infoHeader,22,[stringCell(infoHeader,0,'REPORT DETAILS  /  AUTHORIZED SCOPE',14)]);merge(infoHeader,0,9);
      row(infoHeader+2,22,[stringCell(infoHeader+2,0,'FIELD',3),stringCell(infoHeader+2,3,'RESULT',3)]);
      merge(infoHeader+2,0,2);merge(infoHeader+2,3,9);
      const summary=[['Dashboard',report.workflow],['Period',report.period],['Reference date (PHT)',report.date],['Scope',report.scope],['Viewed by',`${report.viewer} (${report.role})`],['Filters',report.filter],['Generated',report.generated],['Exported activity rows',data.rows.length],['Store report status',report.tables.storeStatus],['Store reporting period',report.tables.storePeriod||'Not loaded'],...report.kpis];
      summary.forEach(([label,val],i)=>{
        const r=infoHeader+3+i;
        row(r,safe(val).length>90?38:22,[stringCell(r,0,label,i%2?5:4),xCell(r-1,3,maybeFormatSecondsCell(label,val),16,label)]);
        merge(r,0,2);merge(r,3,9);
      });
      end=infoHeader+2+summary.length;
    }else if(isChartData){
      row(5,24,[stringCell(5,0,'CATEGORY',3),stringCell(5,1,'VALUE',3)]);
      for(const line of chartMeta.rows){
        const r=line.at;
        if(line.value!==undefined){row(r,20,[stringCell(r,0,line.label,4),xCell(r-1,1,line.value,4)]);}
        else row(r,20,[stringCell(r,0,line.label,14)]);
        end=Math.max(end,r);
      }
    }else{
      if(!isNotes){row(4,18,[stringCell(4,0,`AUTHORIZED DATA  ·  ${sheet.rows.length} EXPORTED ROWS`,2)]);merge(4,0,Math.max(6,count-1));}
      else{row(4,21,[stringCell(4,0,'REPORT METHODOLOGY  /  AUTHORIZED DATA · READ BEFORE SHARING',2)]);merge(4,0,Math.max(6,count-1));}
      row(5,30,sheet.headers.map((h,i)=>stringCell(5,i,h,3)));
      const max=1048500;
      sheet.rows.slice(0,max).forEach((record,i)=>{
        const r=i+6,style=i%2?5:4;
        const longIdentity=sheet.headers.some((heading,j)=>/^(store|store name|agent|agent name|job id)$/i.test(safe(heading))&&safe(record[j]).length>(/store/i.test(heading)?26:/job id/i.test(heading)?19:25));
        const height=isNotes?34:longIdentity?30:22;
        row(r,height,sheet.headers.map((heading,j)=>xCell(r-1,j,record[j]??'',isNotes?17:style,heading)));
        if(isNotes)merge(r,1,Math.max(6,count-1));
      });
      end=Math.min(sheet.rows.length,max)+5;
      if(!isNotes&&!sheet.rows.length){
        // A deliberate empty state is easier to interpret than a blank spreadsheet.
        row(6,26,[stringCell(6,0,'No authorized records for this report selection.',16)]);
        merge(6,0,Math.max(6,count-1));end=6;
      }
      if(!isNotes&&sheet.rows.length){
        sheet.headers.forEach((header,i)=>{
          if(!gradeHeader(header))return;
          const cell=colName(i),range=`${cell}6:${cell}${end}`;
          const grades=['A','B','C','D','F'];
          post.push(`<conditionalFormatting sqref="${range}">${grades.map((grade,k)=>`<cfRule type="expression" dxfId="${k}" priority="${k+1}"><formula>EXACT(${cell}6,&quot;${grade}&quot;)</formula></cfRule>`).join('')}</conditionalFormatting>`);
        });
      }
    }
    // M2.9.50: compact, predictable 100%-zoom proportions across every report tab.
    // Headers wrap in row 5; identity columns retain more width than numbers.
    const compactWidth=(header)=>{
      const key=normalizeHeader(header);
      if(/^job id$/.test(key))return 19;
      if(/^(agent|agent name|labeler|name)$/.test(key))return 25;
      if(/^(store|store name)$/.test(key))return 26;
      if(/^(pod|pod group|pod \/ group)$/.test(key))return 15;
      if(/^(workflow|job)$/.test(key))return 14;
      if(/^(date|reference date)$/.test(key))return 15;
      if(/^(grade|performance grade)$/.test(key))return 9;
      if(/^(status|mapping)$/.test(key)||/mapping (status|state)/.test(key))return 17;
      if(/^(submitted|confirmed|unique jobs|jobs|agents|created|blurred|deleted|no match|product match)$/.test(key))return 12;
      if(/(seconds|sec \/|sec\/|pace|target sec)/.test(key))return 17;
      if(/(active time|idle time|away time|active \(min\))/.test(key))return 15;
      if(/(efficiency|measured tasks|task position|task progress)/.test(key))return 16;
      return 16;
    };
    const widths=isOverview?Array.from({length:10},()=>10.8):isNotes?[7,57,...Array.from({length:Math.max(5,count-2)},()=>10)]:isChartData?[29,14,...Array.from({length:5},()=>12)]:sheet.headers.map(compactWidth);
    const columns=widths.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('');
    const maxRow=Math.max(end,5);
    const filters=!isOverview&&!isNotes&&!isChartData&&sheet.rows.length?`<autoFilter ref="A5:${last}${maxRow}"/>`:'';
    const drawingTag=hasDrawing?'<drawing xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId1"/>':'';
    const mergesXml=merges.length?`<mergeCells count="${merges.length}">${merges.map(ref=>`<mergeCell ref="${ref}"/>`).join('')}</mergeCells>`:'';
    const dimension=isOverview?'A1:J'+Math.max(end,(chartMeta?.charts?.length||0)===3?39:28):`A1:${bannerLast}${maxRow}`;
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="${dimension}"/><sheetViews><sheetView workbookViewId="0" showGridLines="0">${isOverview||isNotes||isChartData?'':`<pane ySplit="5" topLeftCell="A6" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A6" sqref="A6"/>`}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="20"/><cols>${columns}</cols><sheetData>${rows.sort((a,b)=>Number(a.match(/ r="(\d+)"/)[1])-Number(b.match(/ r="(\d+)"/)[1])).join('')}</sheetData>${filters}${mergesXml}${post.join('')}<printOptions horizontalCentered="1"/><pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="0"/>${drawingTag}</worksheet>`;
  }
  function buildXlsx(report,options={}){
    // TT_STORE_EXCEL_DRAWING_COMPAT_V1: Store Operations can request chart-free XLSX without altering other reports.
    const includeDrawingParts=options?.includeDrawingParts!==false;
    const reportData=reportSheets(report),visual=includeDrawingParts?workbookCharts(report):{charts:[],rows:[],omittedForCompatibility:true};
    const withCharts=visual.charts.length>0;
    const sheets=withCharts?[...reportData,{name:'Chart Data',headers:['Category','Value'],rows:[],type:'chartData'}]:reportData;
    const ct=['<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>','<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>',...sheets.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)];
    if(withCharts){ct.push('<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>');visual.charts.forEach((_,i)=>ct.push(`<Override PartName="/xl/charts/chart${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`));}
    const parts=[['[Content_Types].xml',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${ct.join('')}</Types>`],['_rels/.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],['xl/workbook.xml',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${sheets.map((sheet,i)=>`<sheet name="${xml(sheet.name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`],['xl/_rels/workbook.xml.rels',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],['xl/styles.xml',styles]];
    sheets.forEach((sheet,i)=>{
      parts.push([`xl/worksheets/sheet${i+1}.xml`,sheetXml(sheet,report,{hasDrawing:withCharts&&i===0,chartMeta:visual})]);
      if(withCharts&&i===0)parts.push(['xl/worksheets/_rels/sheet1.xml.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>']);
    });
    if(withCharts){
      parts.push(['xl/drawings/drawing1.xml',drawingXml(visual.charts)]);
      parts.push(['xl/drawings/_rels/drawing1.xml.rels',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${visual.charts.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${i+1}.xml"/>`).join('')}</Relationships>`]);
      visual.charts.forEach((chart,i)=>parts.push([`xl/charts/chart${i+1}.xml`,chartXml(chart,i)]));
    }
    return zip(parts);
  }
  // Small multi-page vector PDF generator, with column banding for wide tables.
  const ascii=v=>safe(v).replace(/[\u2013\u2014]/g,'-').replace(/[\u2022]/g,'/').replace(/[\u2713\u2714]/g,'OK').replace(/[^\x20-\x7E]/g,'?');
  const ptEscape=v=>ascii(v).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
  function buildPdf(report){
    const W=842,H=595,margin=40,contentW=W-2*margin;const pages=[];
    function page(title,subtitle){const commands=[];const add=s=>commands.push(s);add('1 1 1 rg 0 0 842 595 re f');add('0.063 0.11 0.19 rg 0 532 842 63 re f');add(`BT /F2 17 Tf 1 1 1 rg 40 558 Td (${ptEscape(title)}) Tj ET`);add(`BT /F1 9 Tf 0.78 0.86 0.95 rg 40 540 Td (${ptEscape(subtitle)}) Tj ET`);pages.push(commands);return {add,commands};}
    const drawText=(p,x,y,text,size=9,bold=false,color=[.13,.19,.28])=>p.add(`BT /${bold?'F2':'F1'} ${size} Tf ${color.join(' ')} rg ${x.toFixed(1)} ${y.toFixed(1)} Td (${ptEscape(text)}) Tj ET`);
    const fit=(v,width,size)=>{const limit=Math.max(3,Math.floor(width/(size*.54)));const s=ascii(v);return s.length>limit?s.slice(0,Math.max(1,limit-3))+'...':s;};
    let p=page('TRINOTIME  |  '+report.workflow.toUpperCase(),'EXECUTIVE OPERATIONS REPORT  /  '+report.generated);
    drawText(p,40,500,report.period+'  |  '+report.date+'  |  '+report.scope,11,true);
    let y=468;for(const [k,v] of [['Viewed by',`${report.viewer} (${report.role})`],['Filters',report.filter],['Exported activity rows',report.tables.activity?.rows.length||0],['Store status',report.tables.storeStatus],...report.kpis]){
      if(y<75){p=page(report.workflow+' / Overview (continued)','Report summary  /  '+report.date);y=500;}
      if(Math.floor(y/26)%2===0)p.add(`.96 .975 .993 rg 38 ${y-9} 766 24 re f`);
      drawText(p,48,y-1,fit(k,195,10),10,true);drawText(p,245,y-1,fit(v,550,10),10);y-=26;
    }
    for(const sheet of reportSheets(report).filter(s=>s.type==='data')){
      const head=sheet.headers,rows=sheet.rows,groupSize=7;
      const fixed=head.length>groupSize?1:0;
      const segments=[];
      if(!fixed)segments.push(head.map((_,i)=>i));
      else for(let start=1;start<head.length;start+=groupSize-1)segments.push([0,...head.slice(start,start+groupSize-1).map((_,i)=>i+start)]);
      for(let band=0;band<segments.length;band++){
        const indices=segments[band],headers=indices.map(i=>head[i]),columnW=contentW/Math.max(1,headers.length);
        for(let first=0;first<Math.max(rows.length,1);first+=23){
          p=page(report.workflow+' / '+sheet.name,`${report.period}  /  ${report.date}  /  Columns ${band+1} of ${segments.length}  /  Rows ${first+1}-${Math.min(rows.length,first+23)}`);
          const top=503;p.add('.115 .225 .35 rg 40 477 762 29 re f');headers.forEach((h,j)=>drawText(p,44+j*columnW,488,fit(h,columnW-8,8.7),8.7,true,[1,1,1]));
          if(!rows.length)drawText(p,48,452,'No rows in current authorized selection.',10);
          rows.slice(first,first+23).forEach((row,i)=>{
            const yy=452-i*17;if(i%2===0)p.add(`.95 .97 .99 rg 40 ${yy-6} 762 17 re f`);
            indices.forEach((col,j)=>drawText(p,44+j*columnW,yy,fit(row[col]??'',columnW-8,8),8));
          });
        }
      }
    }
    p=page(report.workflow+' / Methodology','Source: current authenticated TrinoTime dashboard view');let yy=487;
    for(const note of report.notes){const words=ascii(note).split(/\s+/);let line='';for(const word of words){if((line+' '+word).length>100){drawText(p,42,yy,line,9);yy-=15;line='';}line+=(line?' ':'')+word;}if(line){drawText(p,42,yy,line,9);yy-=27;}}
    const obj=[null];const push=str=>{obj.push(str);return obj.length-1;};
    const font=push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');const fontBold=push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');const pageIds=[],streams=[];
    const pagesRoot=push('');
    for(let i=0;i<pages.length;i++){
      pages[i].push('0.47 0.55 0.65 rg 40 25 762 0.65 re f');
      pages[i].push(`BT /F1 8 Tf 0.38 0.44 0.54 rg 40 15 Td (TrinoTime  |  Authorized report  |  Page ${i+1} of ${pages.length}) Tj ET`);
      const stream=pages[i].join('\n')+'\n',len=enc.encode(stream).length;
      const streamId=push(`<< /Length ${len} >>\nstream\n${stream}endstream`);streams.push(streamId);
      pageIds.push(push(`<< /Type /Page /Parent ${pagesRoot} 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 ${font} 0 R /F2 ${fontBold} 0 R >> >> /Contents ${streamId} 0 R >>`));
    }
    obj[pagesRoot]=`<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map(id=>id+' 0 R').join(' ')}] >>`;
    const catalog=push(`<< /Type /Catalog /Pages ${pagesRoot} 0 R >>`);
    // Entire content intentionally ASCII, safe for byte offsets in PDF 1.4.
    const blocks=['%PDF-1.4\n%TRINOTIME\n'],offsets=[0];let length=enc.encode(blocks[0]).length;
    for(let i=1;i<obj.length;i++){offsets[i]=length;const part=`${i} 0 obj\n${obj[i]}\nendobj\n`;blocks.push(part);length+=enc.encode(part).length;}
    const start=length;blocks.push(`xref\n0 ${obj.length}\n0000000000 65535 f \n`);
    for(let i=1;i<obj.length;i++)blocks.push(String(offsets[i]).padStart(10,'0')+' 00000 n \n');
    blocks.push(`trailer\n<< /Size ${obj.length} /Root ${catalog} 0 R >>\nstartxref\n${start}\n%%EOF\n`);
    return enc.encode(blocks.join(''));
  }
  function download(filename,content,mime){
    const blob=new Blob([content],{type:mime});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
  }
  function mount(workflow){
    const root=document.getElementById(rootIds[workflow]);if(!root||root.hidden)return;
    const target=workflow==='coverage'?root.querySelector('.tt-coverage-toolbar-primary'):root.querySelector('.tt-ops-toolbar');
    if(!target||target.querySelector('[data-tt-report-actions]'))return;
    const group=document.createElement('div');group.className='tt-export-actions';group.dataset.ttReportActions=workflow;
    group.innerHTML='<span class="tt-export-label">Export report</span><button type="button" data-tt-export="xlsx" aria-label="Download styled Excel report">Excel</button><button type="button" data-tt-export="csv" aria-label="Download CSV report">CSV</button><button type="button" data-tt-export="pdf" aria-label="Download PDF report">PDF</button>';
    group.addEventListener('click',e=>{
      const button=e.target.closest('[data-tt-export]');if(!button)return;
      const format=button.dataset.ttExport,old=button.textContent;button.disabled=true;button.textContent='Preparing…';
      try{
        const report=capture(workflow);
        if(format==='xlsx')download(fileName(report,'xlsx'),buildXlsx(report),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        else if(format==='csv')download(fileName(report,'csv'),buildCsv(report),'text/csv;charset=utf-8');
        else if(format==='pdf')download(fileName(report,'pdf'),buildPdf(report),'application/pdf');
      }catch(error){window.alert(`Report export unavailable: ${error?.message||'Please refresh the dashboard.'}`);}
      finally{button.textContent=old;button.disabled=false;}
    });
    target.append(group);
  }
  document.addEventListener('trinotime:store-context',e=>{
    const context=e.detail||{},workflow=context.workflow;
    if(!rootIds[workflow]||!context.viewer?.role)return;
    const signature=[context.date,context.viewer.role,context.viewer.name,context.viewer.pod||'',context.pod||'',context.agent||'',context.scope].join('|');
    contexts[workflow]={...context,signature};mount(workflow);
  });
  document.addEventListener('trinotime:workspace-opening',e=>{for(const key of Object.keys(contexts))if(key!==e.detail)delete contexts[key];});
  window.TrinoTimeReportExports=Object.freeze({buildXlsx,buildCsv,buildPdf,reportSheets,capture});
})();
