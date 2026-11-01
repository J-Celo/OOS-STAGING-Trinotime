(() => {
  'use strict';

  const PAGE_SIZE = 50;
  const state = { open:false, year:null, month:null, model:null, query:'', pod:'', renderToken:0, page:1, pageSize:PAGE_SIZE, pageRows:[], headerKey:'', filterTimer:0 };
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const bridge = () => window.TrinoTimeMonthlyTimesheetBridge || null;

  function decimalHours(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    const rounded = Math.round(Math.max(0, n) * 100) / 100;
    return `${rounded.toFixed(Math.abs(rounded * 10 - Math.round(rounded * 10)) < 0.001 ? 1 : 2)}h`;
  }

  function monthValue(year, month) {
    return `${String(year).padStart(4,'0')}-${String(month).padStart(2,'0')}`;
  }

  function parseMonthValue(value) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})$/);
    if (!match) return null;
    const year = Number(match[1]), month = Number(match[2]);
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
    return { year, month };
  }

  function monthOrdinal(year, month) {
    return (Number(year) * 12) + (Number(month) - 1);
  }

  function monthPartsFromOrdinal(ordinal) {
    const year = Math.floor(Number(ordinal) / 12);
    const month = (Number(ordinal) % 12) + 1;
    return { year, month };
  }

  function monthLabel(year, month) {
    return new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Manila',month:'long',year:'numeric'}).format(new Date(Date.UTC(Number(year),Number(month)-1,1,12)));
  }

  function currentMonthParts() {
    const current = bridge()?.currentMonth?.();
    if (current && Number.isInteger(Number(current.year)) && Number.isInteger(Number(current.month))) return {year:Number(current.year),month:Number(current.month)};
    const now = new Date();
    return {year:now.getFullYear(),month:now.getMonth()+1};
  }

  function syncMonthHistoryChrome() {
    if (!state.year || !state.month) return;
    const current = currentMonthParts();
    const selectedOrdinal = monthOrdinal(state.year,state.month);
    const currentOrdinal = monthOrdinal(current.year,current.month);
    if (selectedOrdinal > currentOrdinal) {
      state.year=current.year; state.month=current.month;
    }
    const selectedLabel = monthLabel(state.year,state.month);
    const isHistorical = monthOrdinal(state.year,state.month) < currentOrdinal;
    const input = $('monthlyTimesheetMonth');
    if (input) { input.max=monthValue(current.year,current.month); input.value=monthValue(state.year,state.month); }
    const next = $('monthlyTimesheetNext');
    if (next) { next.disabled=!isHistorical; next.title=isHistorical?'Next month':'Current month is the newest available month'; }
    const badge = $('monthlyTimesheetModeBadge');
    if (badge) {
      badge.dataset.mode=isHistorical?'historical':'current';
      badge.innerHTML=`<span>Viewing</span><strong>${esc(isHistorical?'Historical Month':'Current Month')} · ${esc(selectedLabel)}</strong>`;
    }
    const latestCompleted = monthPartsFromOrdinal(currentOrdinal-1);
    const previousLabel = $('monthlyTimesheetPreviousMonthLabel');
    if (previousLabel) previousLabel.textContent=monthLabel(latestCompleted.year,latestCompleted.month);
    const currentLabel = $('monthlyTimesheetCurrentMonthLabel');
    if (currentLabel) currentLabel.textContent=monthLabel(current.year,current.month);
    const previousButton = $('monthlyTimesheetPreviousMonthShortcut');
    if (previousButton) previousButton.setAttribute('aria-pressed', String(state.year===latestCompleted.year && state.month===latestCompleted.month));
    const currentButton = $('monthlyTimesheetCurrentMonthShortcut');
    if (currentButton) currentButton.setAttribute('aria-pressed', String(state.year===current.year && state.month===current.month));
  }

  function selectMonth(year, month, rebuild=true) {
    const current=currentMonthParts();
    if (monthOrdinal(year,month) > monthOrdinal(current.year,current.month)) { year=current.year; month=current.month; }
    state.year=Number(year); state.month=Number(month); state.page=1;
    closeDetail();
    syncMonthHistoryChrome();
    if (rebuild) render(true);
  }

  function shiftMonth(delta) {
    const next = monthPartsFromOrdinal(monthOrdinal(state.year,state.month)+Number(delta||0));
    selectMonth(next.year,next.month,true);
  }

  function filteredRows() {
    const model = state.model;
    if (!model) return [];
    const q = String(state.query || '').trim().toLocaleLowerCase();
    return model.rows.filter(row => {
      if (state.pod && row.pod !== state.pod) return false;
      if (!q) return true;
      return String(row.displayName || row.name || '').toLocaleLowerCase().includes(q) || String(row.name || '').toLocaleLowerCase().includes(q) || String(row.podLabel || row.pod || '').toLocaleLowerCase().includes(q);
    });
  }

  function renderSummary(rows) {
    const host = $('monthlyTimesheetSummary');
    if (!host || !state.model) return;
    const totals = rows.reduce((acc,row) => {
      acc.hours += Number(row.summary.totalHours || 0);
      acc.worked += Number(row.summary.workedDays || 0);
      acc.issues += Number(row.summary.issueDays || 0);
      acc.incomplete += Number(row.summary.incompleteCount || 0);
      return acc;
    }, {hours:0,worked:0,issues:0,incomplete:0});
    host.innerHTML = `
      <article><span>Agents</span><strong>${rows.length}</strong><small>${esc(state.model.scopeLabel)}</small></article>
      <article><span>Total credited</span><strong>${esc(decimalHours(totals.hours))}</strong><small>existing Attendance + approved OT math</small></article>
      <article><span>Worked days</span><strong>${totals.worked}</strong><small>completed, non-voided shifts</small></article>
      <article class="${totals.issues ? 'has-issues' : ''}"><span>Issue days</span><strong>${totals.issues}</strong><small>${totals.incomplete} incomplete</small></article>`;
  }

  function statusMeta(cell) {
    const classes = ['complete','late','early','late_early','incomplete','working','break','voided','leave','day_off','absent','not_in','future','no_record'];
    const kind = classes.includes(cell.status) ? cell.status : 'no_record';
    let primary = cell.statusLabel || '—';
    if (Number.isFinite(cell.hours)) primary = decimalHours(cell.hours);
    const badges = [];
    if (cell.status === 'late' || cell.status === 'late_early') badges.push('Late');
    if (cell.status === 'early' || cell.status === 'late_early') badges.push('Early');
    if (cell.corrected) badges.push('Corrected');
    return { kind, primary, badge: badges.join(' · ') };
  }

  function agentAvatarMarkup(row) {
    const name = String(row?.name || '').trim();
    const shown = String(row?.displayName || name || '?').trim();
    const src = bridge()?.avatarFor?.(name) || '';
    const initials = shown.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part.charAt(0)).join('').toUpperCase() || '?';
    return src
      ? `<span class="tt-mtg-avatar has-photo" aria-hidden="true"><img src="${esc(src)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"></span>`
      : `<span class="tt-mtg-avatar" aria-hidden="true">${esc(initials)}</span>`;
  }

  function openAgentProfile(agentName) {
    const api = bridge();
    const opened = api?.openProfile?.(String(agentName || '').trim());
    if (!opened) api?.notify?.('This profile is not available in your authorized directory scope.');
  }

  function renderTableHeader() {
    const head = $('monthlyTimesheetHead');
    if (!head || !state.model) return;
    const key = `${state.model.year}-${state.model.month}-${state.model.daysInMonth}`;
    if (state.headerKey === key && head.firstElementChild) return;
    const days = Array.from({length:state.model.daysInMonth}, (_,i) => i + 1);
    head.innerHTML = `<tr><th class="tt-mtg-agent-col">Agent</th><th class="tt-mtg-pod-col">POD</th>${days.map(day => {
      const first = state.model.rows[0]?.cells[day-1];
      return `<th class="tt-mtg-day-head"><strong>${day}</strong><span>${esc(first?.weekday || '')}</span></th>`;
    }).join('')}<th class="tt-mtg-total-col">Total Hours</th></tr>`;
    state.headerKey = key;
  }

  function renderTable(rows, filteredCount, startIndex) {
    const body = $('monthlyTimesheetBody'), status = $('monthlyTimesheetStatus');
    if (!body || !state.model) return;
    renderTableHeader();
    state.pageRows = rows;
    if (!filteredCount) {
      body.innerHTML = `<tr><td class="tt-mtg-empty" colspan="${state.model.daysInMonth + 3}"><strong>No matching Agents</strong><span>Try another Agent name or POD filter.</span></td></tr>`;
      if (status) status.textContent = `0 Agents shown for ${state.model.monthLabel}.`;
      return;
    }
    body.innerHTML = rows.map((row,rowIndex) => `<tr>
      <th scope="row" class="tt-mtg-agent-col"><button type="button" class="tt-mtg-agent-profile-link" data-profile-name="${esc(row.name)}" title="Open ${esc(row.displayName || row.name)} profile" aria-label="Open ${esc(row.displayName || row.name)} profile">${agentAvatarMarkup(row)}<span class="tt-mtg-agent-profile-copy"><strong>${esc(row.displayName || row.name)}</strong><small>${esc(row.name !== row.displayName ? row.name : '')}</small></span></button></th>
      <td class="tt-mtg-pod-col">${esc(row.podLabel || row.pod)}</td>
      ${row.cells.map((cell,dayIndex) => { const meta=statusMeta(cell); const title=`${cell.dateLabel} · ${cell.statusLabel}${Number.isFinite(cell.hours)?` · ${decimalHours(cell.hours)}`:''}`; return `<td class="tt-mtg-day-cell" data-status="${esc(meta.kind)}"><button type="button" data-row="${rowIndex}" data-day="${dayIndex}" title="${esc(title)}" aria-label="${esc((row.displayName||row.name)+' '+title)}"><strong>${esc(meta.primary)}</strong>${meta.badge?`<small>${esc(meta.badge)}</small>`:''}</button></td>`; }).join('')}
      <td class="tt-mtg-total-col"><strong>${esc(decimalHours(row.summary.totalHours))}</strong><small>${row.summary.workedDays} worked day${row.summary.workedDays===1?'':'s'}${row.summary.issueDays?` · ${row.summary.issueDays} issue${row.summary.issueDays===1?'':'s'}`:''}</small></td>
    </tr>`).join('');
    if (status) {
      const first=startIndex+1,last=startIndex+rows.length;
      status.textContent = filteredCount > rows.length
        ? `Showing ${first}–${last} of ${filteredCount} Agents · ${state.model.monthLabel}. Click a day for Attendance details.`
        : `${filteredCount} Agent${filteredCount===1?'':'s'} shown · ${state.model.monthLabel}. Click a day for Attendance details.`;
    }
  }

  function renderPodOptions() {
    const select = $('monthlyTimesheetPod');
    if (!select || !state.model) return;
    const previous = state.pod;
    select.innerHTML = `<option value="">All authorized PODs</option>${state.model.pods.map(pod => `<option value="${esc(pod.value)}">${esc(pod.label)}</option>`).join('')}`;
    state.pod = state.model.pods.some(p => p.value === previous) ? previous : '';
    select.value = state.pod;
    const singlePod = state.model.pods.length <= 1;
    select.disabled = singlePod;
    select.title = singlePod ? 'Your Attendance authority is limited to this POD.' : 'Narrow the authorized workforce scope.';
  }

  function renderPager(totalRows) {
    const pager=$('monthlyTimesheetPager'),label=$('monthlyTimesheetPageLabel'),prev=$('monthlyTimesheetPagePrev'),next=$('monthlyTimesheetPageNext');
    if(!pager||!label||!prev||!next)return;
    const totalPages=Math.max(1,Math.ceil(totalRows/state.pageSize));
    state.page=Math.min(Math.max(1,state.page),totalPages);
    pager.hidden=totalRows<=state.pageSize;
    label.textContent=`Page ${state.page} of ${totalPages} · ${state.pageSize} rows/page`;
    prev.disabled=state.page<=1;
    next.disabled=state.page>=totalPages;
  }

  function renderFiltered() {
    const rows = filteredRows();
    const totalPages=Math.max(1,Math.ceil(rows.length/state.pageSize));
    state.page=Math.min(Math.max(1,state.page),totalPages);
    const startIndex=(state.page-1)*state.pageSize;
    const pageRows=rows.slice(startIndex,startIndex+state.pageSize);
    renderSummary(rows);
    renderTable(pageRows,rows.length,startIndex);
    renderPager(rows.length);
  }

  function scheduleFilteredRender() {
    clearTimeout(state.filterTimer);
    state.filterTimer=setTimeout(()=>{state.filterTimer=0;renderFiltered();},90);
  }

  function changePage(delta) {
    const rows=filteredRows(),totalPages=Math.max(1,Math.ceil(rows.length/state.pageSize));
    const nextPage=Math.min(totalPages,Math.max(1,state.page+Number(delta||0)));
    if(nextPage===state.page)return;
    state.page=nextPage;
    renderFiltered();
    const scroll=$('monthlyTimesheetScroll');
    if(scroll)scroll.scrollTop=0;
  }

  async function render(rebuildModel) {
    if (!state.open) return;
    const token = ++state.renderToken;
    const status = $('monthlyTimesheetStatus');
    if (status) status.textContent = 'Loading monthly timesheet…';
    try {
      const api = bridge();
      if (!api || !api.canView()) throw new Error('Monthly Timesheet Grid is limited to Team Leaders and Admins.');
      if (rebuildModel || !state.model || state.model.year !== state.year || state.model.month !== state.month) {
        const model = await api.buildMonth(state.year, state.month);
        if (token !== state.renderToken || !state.open) return;
        state.model = model;
        state.page = 1;
        state.headerKey = '';
        const scope = $('monthlyTimesheetScope');
        const current=currentMonthParts();
        const historical=monthOrdinal(model.year,model.month)<monthOrdinal(current.year,current.month);
        if (scope) scope.textContent = `${historical?'Historical Month':'Current Month'} — ${model.monthLabel} · ${model.scopeLabel} · read-only credited Attendance`;
        syncMonthHistoryChrome();
        renderPodOptions();
      }
      renderFiltered();
    } catch (error) {
      if (token !== state.renderToken) return;
      const msg = error && error.message ? error.message : 'Unable to load the Monthly Timesheet Grid.';
      if (status) status.textContent = msg;
      const body = $('monthlyTimesheetBody');
      if (body) body.innerHTML = `<tr><td class="tt-mtg-empty" colspan="34"><strong>Unable to load timesheet</strong><span>${esc(msg)}</span></td></tr>`;
    }
  }

  function openDetail(rowIndex, dayIndex) {
    const rows = state.pageRows || [];
    const row = rows[Number(rowIndex)], cell = row && row.cells[Number(dayIndex)];
    if (!row || !cell) return;
    const overlay = $('monthlyTimesheetDetail'), title = $('monthlyTimesheetDetailTitle'), body = $('monthlyTimesheetDetailBody');
    if (!overlay || !title || !body) return;
    title.textContent = `${row.displayName || row.name} · ${cell.dateLabel}`;
    const flags = cell.flags && cell.flags.length ? cell.flags.join(' · ') : 'None';
    body.innerHTML = `
      <div class="tt-mtg-detail-status" data-status="${esc(cell.status)}"><strong>${esc(cell.statusLabel)}</strong><span>${esc(cell.pod || row.podLabel || row.pod)}</span></div>
      <div class="tt-mtg-detail-grid">
        <div><span>Time In</span><strong>${esc(cell.timeIn)}</strong></div>
        <div><span>Start Break</span><strong>${esc(cell.startBreak)}</strong></div>
        <div><span>End Break</span><strong>${esc(cell.endBreak)}</strong></div>
        <div><span>Time Out</span><strong>${esc(cell.timeOut)}</strong></div>
        <div><span>Regular credited</span><strong>${esc(decimalHours(cell.regularHours))}</strong></div>
        <div><span>Approved OT</span><strong>${esc(decimalHours(cell.approvedOtHours || 0))}</strong></div>
        <div><span>Total credited</span><strong>${esc(decimalHours(cell.hours))}</strong></div>
        <div><span>Break duration</span><strong>${esc(cell.breakDuration)}</strong></div>
      </div>
      <div class="tt-mtg-detail-note"><span>Schedule / availability</span><strong>${esc(cell.scheduleReason || '—')}</strong></div>
      <div class="tt-mtg-detail-note"><span>Flags</span><strong>${esc(flags)}</strong></div>
      ${cell.note ? `<div class="tt-mtg-detail-note"><span>Attendance note</span><strong>${esc(cell.note)}</strong></div>` : ''}`;
    overlay.hidden = false;
    requestAnimationFrame(() => $('monthlyTimesheetDetailClose')?.focus());
  }

  function closeDetail() {
    const overlay = $('monthlyTimesheetDetail');
    if (overlay) overlay.hidden = true;
  }

  function excelArgb(hex) {
    const clean = String(hex || '').replace(/[^0-9a-f]/gi,'').toUpperCase();
    return `FF${(clean.length === 6 ? clean : '000000')}`;
  }

  function excelSolid(hex) {
    return { type:'pattern', pattern:'solid', fgColor:{ argb:excelArgb(hex) } };
  }

  function excelPalette() {
    // RC60: Excel is an exported business report, not a screenshot of the current app theme.
    // Keep one stable, print-friendly visual system so the workbook looks intentional in
    // Excel, PDF preview, email attachments and printed copies regardless of Light/Dark/Pearl.
    return {
      dark:false,
      font:'Aptos',
      title:'#0B1F33',
      titleSoft:'#17324D',
      accent:'#C89B3C',
      accentSoft:'#FFF7E6',
      base:'#FFFFFF',
      surface:'#F8FAFC',
      surfaceAlt:'#F4F7FA',
      header:'#243B53',
      weekendHeader:'#334E68',
      identityHeader:'#102A43',
      totalHeader:'#6F5318',
      total:'#FFF8E8',
      totalText:'#7A4D00',
      border:'#E2E8F0',
      borderStrong:'#CBD5E1',
      text:'#172B4D',
      muted:'#64748B',
      headerText:'#FFFFFF',
      status:{
        complete:{fill:'#ECFDF3',text:'#027A48'},
        late:{fill:'#FFFAEB',text:'#B54708'},
        early:{fill:'#FFFAEB',text:'#B54708'},
        late_early:{fill:'#FFF4D6',text:'#9A5B00'},
        incomplete:{fill:'#FEF3F2',text:'#B42318'},
        absent:{fill:'#FFF7F6',text:'#C4320A'},
        leave:{fill:'#EFF8FF',text:'#175CD3'},
        day_off:{fill:'#F2F4F7',text:'#475467'},
        working:{fill:'#EEF4FF',text:'#3538CD'},
        break:{fill:'#EEF4FF',text:'#3538CD'},
        not_in:{fill:'#F4F3FF',text:'#5925DC'},
        voided:{fill:'#F8FAFC',text:'#667085'},
        future:{fill:'#FFFFFF',text:'#98A2B3'},
        no_record:{fill:'#FFFFFF',text:'#98A2B3'}
      }
    };
  }

  function excelBorder(palette, options={}) {
    const color = options.color || palette.border;
    const style = options.style || 'thin';
    const edge = { style, color:{ argb:excelArgb(color) } };
    return { top:edge, left:edge, bottom:edge, right:edge };
  }

  function styleExcelCell(cell, palette, options={}) {
    const fill = options.fill || palette.base;
    const color = options.color || palette.text;
    cell.fill = excelSolid(fill);
    cell.font = {
      name:options.font || palette.font,
      size:options.size || 10,
      bold:Boolean(options.bold),
      italic:Boolean(options.italic),
      color:{argb:excelArgb(color)}
    };
    cell.border = options.border === false ? {} : excelBorder(palette,{color:options.borderColor,style:options.borderStyle});
    cell.alignment = {
      vertical:options.vertical || 'middle',
      horizontal:options.horizontal || 'center',
      wrapText:options.wrapText !== false,
      indent:Number(options.indent||0)
    };
  }

  function excelDayText(cell) {
    const meta = statusMeta(cell);
    const lines = [];
    if (meta.primary && meta.primary !== '—') lines.push(meta.primary);
    if (meta.badge) lines.push(meta.badge);
    return lines.join('\n');
  }

  function excelFilterDescription() {
    const bits=[];
    if (String(state.query||'').trim()) bits.push(`Agent search: ${String(state.query).trim()}`);
    if (state.pod) {
      const label=state.model?.pods?.find(item=>item.value===state.pod)?.label || state.pod;
      bits.push(`POD: ${label}`);
    }
    return bits.length ? bits.join(' · ') : 'All visible Agents in the authorized scope';
  }

  function excelGeneratedAt() {
    return new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short'}).format(new Date());
  }

  function styleMergedCell(sheet, range, value, palette, options={}) {
    sheet.mergeCells(range);
    const first=String(range).split(':')[0];
    const cell=sheet.getCell(first);
    cell.value=value;
    styleExcelCell(cell,palette,options);
    return cell;
  }

  function buildExcelOverview(workbook, model, rows, totals, palette) {
    const overview=workbook.addWorksheet('Overview',{views:[{showGridLines:false,zoomScale:100}]});
    overview.properties.defaultRowHeight=20;
    overview.properties.tabColor={argb:excelArgb(palette.accent)};
    ['A','B','C','D','E','F','G','H'].forEach(letter=>{overview.getColumn(letter).width=16;});

    styleMergedCell(overview,'A1:H2','TrinoTime',palette,{fill:palette.title,color:'#FFFFFF',bold:true,size:25,horizontal:'left',border:false});
    styleMergedCell(overview,'A3:H3',`MONTHLY TIMESHEET REPORT  ·  ${String(model.monthLabel||'').toUpperCase()}`,palette,{fill:palette.titleSoft,color:'#FFFFFF',bold:true,size:11,horizontal:'left',border:false});
    overview.getRow(1).height=31;
    overview.getRow(2).height=18;
    overview.getRow(3).height=24;
    overview.getRow(4).height=8;
    for(let col=1;col<=8;col+=1) styleExcelCell(overview.getCell(4,col),palette,{fill:palette.base,color:palette.base,size:1,border:false});

    const cards=[
      {range:'A5:B5',valueRange:'A6:B7',label:'AGENTS',value:String(rows.length),fill:palette.surface,valueColor:palette.text},
      {range:'C5:D5',valueRange:'C6:D7',label:'TOTAL CREDITED',value:decimalHours(totals.hours),fill:palette.accentSoft,valueColor:palette.totalText},
      {range:'E5:F5',valueRange:'E6:F7',label:'WORKED DAYS',value:String(totals.worked),fill:'#F0FDF4',valueColor:'#166534'},
      {range:'G5:H5',valueRange:'G6:H7',label:'ISSUE DAYS',value:String(totals.issues),fill:totals.issues?'#FFF7F6':palette.surface,valueColor:totals.issues?'#B42318':palette.text}
    ];
    cards.forEach(card=>{
      styleMergedCell(overview,card.range,card.label,palette,{fill:card.fill,color:palette.muted,bold:true,size:9,horizontal:'left',borderColor:palette.borderStrong});
      styleMergedCell(overview,card.valueRange,card.value,palette,{fill:card.fill,color:card.valueColor,bold:true,size:20,horizontal:'left',borderColor:palette.borderStrong});
    });
    overview.getRow(5).height=19;
    overview.getRow(6).height=22;
    overview.getRow(7).height=22;

    styleMergedCell(overview,'A9:H9','REPORT DETAILS',palette,{fill:palette.surface,color:palette.text,bold:true,size:10,horizontal:'left',borderColor:palette.borderStrong});
    const detailRows=[
      ['A10:B10','C10:H10','Scope',model.scopeLabel || 'Authorized scope'],
      ['A11:B11','C11:H11','Visible data',excelFilterDescription()],
      ['A12:B12','C12:H12','Generated',`${excelGeneratedAt()} · Asia/Manila`],
      ['A13:B13','C13:H13','Report mode','Read-only credited Attendance · approved OT included where applicable']
    ];
    detailRows.forEach(([labelRange,valueRange,label,value])=>{
      styleMergedCell(overview,labelRange,label,palette,{fill:palette.surfaceAlt,color:palette.muted,bold:true,size:9,horizontal:'left',borderColor:palette.border});
      styleMergedCell(overview,valueRange,value,palette,{fill:palette.base,color:palette.text,size:9,horizontal:'left',borderColor:palette.border});
    });

    styleMergedCell(overview,'A15:H15','STATUS LEGEND · Colors mirror the Monthly Timesheet Grid',palette,{fill:palette.header,color:'#FFFFFF',bold:true,size:10,horizontal:'left',borderColor:palette.header});
    const legend=[
      ['A16:B17','Complete','complete'],['C16:D17','Late / Early','late'],['E16:F17','Leave','leave'],['G16:H17','Day off','day_off'],
      ['A18:B19','Absent','absent'],['C18:D19','Incomplete','incomplete'],['E18:F19','Working / Break','working'],['G18:H19','Voided','voided']
    ];
    legend.forEach(([range,label,key])=>{
      const visual=palette.status[key];
      styleMergedCell(overview,range,label,palette,{fill:visual.fill,color:visual.text,bold:true,size:10,borderColor:palette.borderStrong});
    });

    styleMergedCell(overview,'A21:H21','ABOUT THIS EXPORT',palette,{fill:palette.surface,color:palette.text,bold:true,size:10,horizontal:'left',borderColor:palette.borderStrong});
    styleMergedCell(overview,'A22:H23','This workbook is a presentation of the server-authorized Monthly Timesheet model. It does not recalculate Attendance, approve corrections, or widen Team Leader POD authority. Use the Monthly Timesheet sheet for day-level review.',palette,{fill:palette.base,color:palette.muted,size:9,horizontal:'left',borderColor:palette.border});
    overview.getRow(22).height=22;
    overview.getRow(23).height=22;
    overview.pageSetup={orientation:'landscape',paperSize:9,fitToPage:true,fitToWidth:1,fitToHeight:1,margins:{left:0.4,right:0.4,top:0.45,bottom:0.45,header:0.2,footer:0.2}};
    overview.pageSetup.horizontalCentered=true;
    overview.headerFooter={oddFooter:'&LTrinoTime · Internal workforce report&CPage &P of &N&RGenerated by TrinoTime'};
    return overview;
  }

  function buildExcelTimesheet(workbook, model, rows, totals, palette) {
    const days=Array.from({length:model.daysInMonth},(_,i)=>i+1);
    const headers = ['Agent','POD',...days.map(day=>{
      const source=model.rows[0]?.cells?.[day-1];
      return `${day}\n${String(source?.weekday||'').toUpperCase()}`;
    }),'Total Hours','Worked Days','Issue Days'];
    const lastCol=headers.length;
    const worksheet=workbook.addWorksheet('Monthly Timesheet',{
      views:[{state:'frozen',xSplit:2,ySplit:4,topLeftCell:'C5',activeCell:'C5',showGridLines:false,zoomScale:90}]
    });
    worksheet.properties.defaultRowHeight=19;
    worksheet.properties.tabColor={argb:excelArgb(palette.titleSoft)};
    worksheet.headerFooter={oddHeader:`&L&BTrinoTime&C${model.monthLabel} Monthly Timesheet&R${model.scopeLabel}`,oddFooter:'&LInternal workforce report&CPage &P of &N&RGenerated by TrinoTime'};

    styleMergedCell(worksheet,`A1:${worksheet.getColumn(lastCol).letter}1`,'TrinoTime Monthly Timesheet',palette,{fill:palette.title,color:'#FFFFFF',bold:true,size:18,horizontal:'left',border:false});
    worksheet.getRow(1).height=30;

    const summary=`${model.monthLabel} · ${model.scopeLabel} · ${rows.length} Agent${rows.length===1?'':'s'} · ${decimalHours(totals.hours)} credited · ${totals.worked} worked day${totals.worked===1?'':'s'} · ${totals.issues} issue day${totals.issues===1?'':'s'}`;
    styleMergedCell(worksheet,`A2:${worksheet.getColumn(lastCol).letter}2`,summary,palette,{fill:palette.titleSoft,color:'#E8EEF6',bold:true,size:9,horizontal:'left',border:false});
    worksheet.getRow(2).height=21;

    const generated=`${excelFilterDescription()} · Generated ${excelGeneratedAt()} · Asia/Manila`;
    styleMergedCell(worksheet,`A3:${worksheet.getColumn(lastCol).letter}3`,generated,palette,{fill:palette.surface,color:palette.muted,size:8,horizontal:'left',borderColor:palette.border});
    worksheet.getRow(3).height=19;

    const headerRow=worksheet.getRow(4);
    headers.forEach((header,index)=>{
      const cell=headerRow.getCell(index+1);
      cell.value=header;
      const isIdentity=index<2;
      const isSummary=index>=headers.length-3;
      const dayIndex=index-2;
      const weekday=dayIndex>=0&&dayIndex<model.daysInMonth?String(model.rows[0]?.cells?.[dayIndex]?.weekday||'').toUpperCase():'';
      const isWeekend=weekday==='SAT'||weekday==='SUN';
      const headerFill=isSummary?palette.totalHeader:(isIdentity?palette.identityHeader:(isWeekend?palette.weekendHeader:palette.header));
      styleExcelCell(cell,palette,{fill:headerFill,color:'#FFFFFF',bold:true,size:9,horizontal:isIdentity?'left':'center',borderColor:headerFill});
    });
    headerRow.height=34;

    const dataStart=5;
    rows.forEach((row,rowIndex)=>{
      const excelRow=worksheet.getRow(dataStart+rowIndex);
      excelRow.height=32;
      const identityFill=rowIndex%2?palette.surfaceAlt:palette.base;
      const agentCell=excelRow.getCell(1);
      agentCell.value=row.displayName||row.name;
      styleExcelCell(agentCell,palette,{fill:identityFill,color:palette.text,bold:true,size:10,horizontal:'left',borderColor:palette.borderStrong});
      const podCell=excelRow.getCell(2);
      podCell.value=row.podLabel||row.pod;
      styleExcelCell(podCell,palette,{fill:identityFill,color:palette.muted,bold:true,size:9,horizontal:'left',borderColor:palette.borderStrong});

      row.cells.forEach((dayCell,dayIndex)=>{
        const target=excelRow.getCell(dayIndex+3);
        target.value=excelDayText(dayCell);
        const meta=statusMeta(dayCell);
        const visual=palette.status[meta.kind] || {fill:palette.base,text:palette.text};
        styleExcelCell(target,palette,{fill:visual.fill,color:visual.text,bold:!['future','no_record','voided'].includes(meta.kind),size:8.5,borderColor:palette.border});
      });

      const totalCol=3+model.daysInMonth;
      const totalCell=excelRow.getCell(totalCol);
      totalCell.value=Number(row.summary.totalHours||0);
      totalCell.numFmt='0.0"h"';
      styleExcelCell(totalCell,palette,{fill:palette.total,color:palette.totalText,bold:true,size:11,borderColor:'#E7D39C'});
      const workedCell=excelRow.getCell(totalCol+1);
      workedCell.value=Number(row.summary.workedDays||0);
      styleExcelCell(workedCell,palette,{fill:identityFill,color:palette.text,bold:true,size:9,borderColor:palette.borderStrong});
      const issueCell=excelRow.getCell(totalCol+2);
      issueCell.value=Number(row.summary.issueDays||0);
      styleExcelCell(issueCell,palette,{fill:row.summary.issueDays?palette.status.absent.fill:identityFill,color:row.summary.issueDays?palette.status.incomplete.text:palette.muted,bold:true,size:9,borderColor:palette.borderStrong});
    });

    worksheet.getColumn(1).width=26;
    worksheet.getColumn(2).width=18;
    for(let col=3;col<3+model.daysInMonth;col+=1) worksheet.getColumn(col).width=8.8;
    worksheet.getColumn(3+model.daysInMonth).width=12.5;
    worksheet.getColumn(4+model.daysInMonth).width=11;
    worksheet.getColumn(5+model.daysInMonth).width=10;

    // Keep filtering useful without putting a distracting dropdown arrow on every day.
    if(rows.length) worksheet.autoFilter={from:'A4',to:'B4'};
    worksheet.pageSetup={orientation:'landscape',paperSize:9,fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'4:4',margins:{left:0.25,right:0.25,top:0.45,bottom:0.45,header:0.2,footer:0.2}};
    worksheet.pageSetup.horizontalCentered=true;

    const noteRowNumber=dataStart+rows.length+2;
    styleMergedCell(worksheet,`A${noteRowNumber}:${worksheet.getColumn(lastCol).letter}${noteRowNumber}`,'Read-only report · Credited hours reuse existing Attendance calculations and approved OT. Team Leader exports remain limited to the server-authorized home POD.',palette,{fill:palette.surface,color:palette.muted,size:8,horizontal:'left',borderColor:palette.border});
    worksheet.getRow(noteRowNumber).height=20;
    return worksheet;
  }

  async function exportExcel() {
    if (!state.model) return;
    const api=bridge();
    const button=$('monthlyTimesheetExport');
    const originalLabel=button?.textContent || 'Export Excel';
    try {
      if(button){button.disabled=true;button.textContent='Preparing Excel…';}
      const ready=await api?.ensureExcel?.();
      if(!ready||!window.ExcelJS?.Workbook) throw new Error('Excel export could not be loaded. Check your connection and try again.');

      const rows=filteredRows();
      const model=state.model;
      const palette=excelPalette();
      const totals=rows.reduce((acc,row)=>{
        acc.hours+=Number(row.summary.totalHours||0);
        acc.worked+=Number(row.summary.workedDays||0);
        acc.issues+=Number(row.summary.issueDays||0);
        return acc;
      },{hours:0,worked:0,issues:0});

      const workbook=new window.ExcelJS.Workbook();
      workbook.creator='TrinoTime';
      workbook.company='TrinoTime';
      workbook.subject=`${model.monthLabel} Monthly Timesheet`;
      workbook.title=`TrinoTime Monthly Timesheet · ${model.monthLabel}`;
      workbook.created=new Date();
      workbook.modified=new Date();

      buildExcelOverview(workbook,model,rows,totals,palette);
      buildExcelTimesheet(workbook,model,rows,totals,palette);

      const buffer=await workbook.xlsx.writeBuffer();
      const blob=new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
      const url=URL.createObjectURL(blob),link=document.createElement('a');
      link.href=url;
      link.download=`TrinoTime-Monthly-Timesheet-${monthValue(state.year,state.month)}.xlsx`;
      link.rel='noopener';link.style.display='none';
      document.body.appendChild(link);link.click();link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),1500);
      api?.notify?.(`Professional Excel timesheet ready · ${rows.length} Agent${rows.length===1?'':'s'} exported.`);
    } catch(error) {
      api?.notify?.(error?.message || 'Unable to export the Monthly Timesheet to Excel.');
    } finally {
      if (button) { button.disabled=false; button.textContent=originalLabel; }
    }
  }

  function close() {
    state.open = false;
    state.renderToken += 1;
    clearTimeout(state.filterTimer); state.filterTimer=0; state.pageRows=[];
    closeDetail();
    const overlay = $('monthlyTimesheetOverlay');
    if (overlay) { overlay.classList.remove('open'); overlay.setAttribute('aria-hidden','true'); }
    document.body.classList.remove('tt-month-grid-open');
    window.TrinoTimeRestoreLogTabActive?.();
  }

  async function open() {
    const api = bridge();
    if (!api || !api.canView()) { api?.notify?.('Only Team Leaders and Admins can view the Monthly Timesheet Grid.'); return; }
    if (!state.year || !state.month) {
      const current = api.currentMonth(); state.year = current.year; state.month = current.month;
    }
    state.open = true;
    const overlay = $('monthlyTimesheetOverlay');
    if (!overlay) return;
    overlay.classList.add('open'); overlay.setAttribute('aria-hidden','false'); document.body.classList.add('tt-month-grid-open');
    syncMonthHistoryChrome();
    requestAnimationFrame(() => $('monthlyTimesheetTitle')?.focus());
    await render(true);
  }

  function init() {
    $('monthlyTimesheetCloseBtn')?.addEventListener('click', close);
    $('monthlyTimesheetPrev')?.addEventListener('click', () => shiftMonth(-1));
    $('monthlyTimesheetNext')?.addEventListener('click', () => shiftMonth(1));
    $('monthlyTimesheetPreviousMonthShortcut')?.addEventListener('click', () => { const current=currentMonthParts(); const target=monthPartsFromOrdinal(monthOrdinal(current.year,current.month)-1); selectMonth(target.year,target.month,true); });
    $('monthlyTimesheetCurrentMonthShortcut')?.addEventListener('click', () => { const current=currentMonthParts(); selectMonth(current.year,current.month,true); });
    $('monthlyTimesheetMonth')?.addEventListener('change', event => { const parsed=parseMonthValue(event.target.value); if(!parsed)return; selectMonth(parsed.year,parsed.month,true); });
    $('monthlyTimesheetSearch')?.addEventListener('input', event => { state.query=event.target.value||''; state.page=1; scheduleFilteredRender(); });
    $('monthlyTimesheetPod')?.addEventListener('change', event => { state.pod=event.target.value||''; state.page=1; renderFiltered(); });
    $('monthlyTimesheetPagePrev')?.addEventListener('click', () => changePage(-1));
    $('monthlyTimesheetPageNext')?.addEventListener('click', () => changePage(1));
    $('monthlyTimesheetRefresh')?.addEventListener('click', () => render(true));
    $('monthlyTimesheetExport')?.addEventListener('click', () => { void exportExcel(); });
    $('monthlyTimesheetBody')?.addEventListener('click', event => {
      const profileButton=event.target.closest('button[data-profile-name]');
      if(profileButton){ openAgentProfile(profileButton.dataset.profileName); return; }
      const dayButton=event.target.closest('button[data-row][data-day]');
      if(dayButton)openDetail(dayButton.dataset.row,dayButton.dataset.day);
    });
    $('monthlyTimesheetDetailClose')?.addEventListener('click', closeDetail);
    $('monthlyTimesheetDetail')?.addEventListener('click', event => { if(event.target === $('monthlyTimesheetDetail'))closeDetail(); });
    $('monthlyTimesheetOverlay')?.addEventListener('click', event => { if(event.target === $('monthlyTimesheetOverlay'))close(); });
    document.addEventListener('keydown', event => { if(!state.open || event.key !== 'Escape')return; if(!$('monthlyTimesheetDetail')?.hidden){closeDetail();return;} close(); });
    let refreshTimer = 0;
    const scheduleRefresh = event => {
      if(!state.open)return;
      const selectedKey=monthValue(state.year,state.month);
      const current=currentMonthParts();
      const viewingCurrent=state.year===current.year && state.month===current.month;
      // RC70 performance guard: generic current-workforce projection churn must not
      // rebuild a historical month. A concrete backdated live Attendance change still
      // refreshes the selected historical month when its YYYY-MM matches exactly.
      if(event?.type==='trinotime:attendance-live-change') {
        const changedDate=String(event.detail?.date||'');
        if(changedDate && changedDate.slice(0,7)!==selectedKey)return;
        if(!changedDate && !viewingCurrent)return;
      } else if(!viewingCurrent) return;
      clearTimeout(refreshTimer); refreshTimer=setTimeout(()=>render(true),160);
    };
    window.addEventListener('trinotime:attendance-projection-change', scheduleRefresh);
    window.addEventListener('trinotime:attendance-live-change', scheduleRefresh);
  }

  window.TrinoTimeMonthlyTimesheet = Object.freeze({ open, close, refresh:() => render(true) });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true}); else init();
})();
