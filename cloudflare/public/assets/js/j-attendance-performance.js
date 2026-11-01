/* TrinoTime V2.0.1 RC66 — Admin Attendance source-level windowing.
   Admin desktop keeps the complete authorized/filtered Attendance model as plain
   data but only asks the legacy renderer to build HTML/DOM for the active 50-row
   page. This removes the RC65 cost of constructing thousands of detached rows.
   No authorization, writes, payroll math, Attendance calculations, or exports
   are changed here. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const PAGE_SIZE = 50;
  let page = 0, filterKey = '', scopeKey = '', units = [], control, status, previous, next;
  let virtualHost = null, virtualDividers = [];
  let sourceMode = false, sourceHost = null, sourceKey = '', sourceTotal = 0, sourceMeta = null, sourceVersion = 0;
  const media = window.matchMedia('(max-width:680px)');
  const markupCache = new WeakMap();
  const rowStores = new WeakMap();

  function isAdminDesktopHost(host) {
    if (!host || host.id !== 'desktopTbody' || media.matches) return false;
    try {
      const role = String(document.body?.dataset?.trinoRole || '').toLowerCase();
      if (role === 'admin' || role === 'administrator') return true;
      const bridge = window.trinoAttendanceBridge;
      return Boolean(bridge && typeof bridge.isAdmin === 'function' && bridge.isAdmin());
    } catch (_) { return false; }
  }

  function storeFor(host) {
    let store = rowStores.get(host);
    if (!store) {
      store = { byKey:new Map(), order:[], version:0 };
      rowStores.set(host, store);
    }
    return store;
  }

  function rowNodeFromHtml(host, html) {
    const template = document.createElement('template');
    template.innerHTML = host.tagName === 'TBODY' ? '<table><tbody>' + html + '</tbody></table>' : html;
    return host.tagName === 'TBODY' ? template.content.querySelector('tr') : template.content.firstElementChild;
  }

  function syncChildren(host, desiredNodes) {
    if (!host) return;
    const desired = desiredNodes.filter(Boolean);
    const current = Array.from(host.children);
    if (current.length === desired.length && current.every((node, index) => node === desired[index])) return;
    const fragment = document.createDocumentFragment();
    desired.forEach(node => fragment.appendChild(node));
    host.replaceChildren(fragment);
  }

  // Presentation-only gating; no network requests or pending writes are paused.
  function isVisible() {
    const view = document.body?.dataset?.ttAdminView;
    return document.visibilityState !== 'hidden' &&
      !(document.body?.dataset?.trinoRole === 'admin' && view && view !== 'attendance');
  }

  function legacyPatchRows(host, entries) {
    const existing = new Map(Array.from(host.children)
      .filter(node => node.dataset.ttRowKey !== undefined)
      .map(node => [node.dataset.ttRowKey, node]));
    const desired = new Set(entries.map(entry => String(entry.key)));
    for (const [key, node] of existing) if (!desired.has(key)) node.remove();
    Array.from(host.children).forEach(node => {
      if (node.dataset.ttRowKey === undefined && !node.matches('.attendance-date-divider,.attendance-search-empty')) node.remove();
    });
    let last = null;
    for (const entry of entries) {
      const key = String(entry.key);
      let node = existing.get(key);
      if (!node || markupCache.get(node) !== entry.html) {
        const replacement = rowNodeFromHtml(host, entry.html);
        if (!replacement) continue;
        replacement.dataset.ttRowKey = key;
        markupCache.set(replacement, entry.html);
        if (node?.parentNode === host) node.replaceWith(replacement);
        node = replacement;
      }
      let cursor = last ? last.nextElementSibling : host.firstElementChild;
      while (cursor && cursor.dataset.ttRowKey === undefined) cursor = cursor.nextElementSibling;
      if (cursor !== node) host.insertBefore(node, cursor);
      last = node;
    }
  }

  function patchRows(host, entries) {
    if (!host) return;

    // RC66 source mode receives only the active <=50 rows. Do not recreate the
    // RC65 detached-node store for the complete month — that was still expensive.
    if (sourceMode && host === sourceHost && isAdminDesktopHost(host)) {
      legacyPatchRows(host, entries);
      const store = rowStores.get(host);
      if (store) {
        store.byKey.clear();
        store.order = [];
        store.version += 1;
      }
      virtualHost = null;
      virtualDividers = [];
      sourceVersion += 1;
      return;
    }

    if (!isAdminDesktopHost(host)) {
      legacyPatchRows(host, entries);
      return;
    }

    // Compatibility fallback for non-source-window callers.
    const store = storeFor(host);
    const previousOrder = store.order;
    let changed = previousOrder.length !== entries.length;
    const wanted = new Set();
    const nextOrder = [];
    for (const entry of entries) {
      const key = String(entry.key);
      wanted.add(key);
      let node = store.byKey.get(key);
      if (!node || markupCache.get(node) !== entry.html) {
        const replacement = rowNodeFromHtml(host, entry.html);
        if (!replacement) continue;
        replacement.dataset.ttRowKey = key;
        markupCache.set(replacement, entry.html);
        if (node?.parentNode === host) node.replaceWith(replacement);
        node = replacement;
        store.byKey.set(key, node);
        changed = true;
      }
      nextOrder.push(node);
    }
    for (const [key, node] of Array.from(store.byKey.entries())) {
      if (wanted.has(key)) continue;
      if (node.parentNode === host) node.remove();
      store.byKey.delete(key);
      changed = true;
    }
    if (!changed && previousOrder.some((node,index) => node !== nextOrder[index])) changed = true;
    store.order = nextOrder;
    if (changed) store.version += 1;
    virtualHost = host;
  }

  function ensureControls() {
    if (control) return;
    const card = $('logTableCard');
    if (!card) return;
    control = document.createElement('nav');
    control.className = 'tt-attendance-pages';
    control.setAttribute('aria-label', 'Attendance pages and display');
    control.innerHTML = '<button type="button" data-page-prev>Previous</button><span role="status" aria-live="polite"></span><button type="button" data-page-next>Next</button><label><input type="checkbox" data-reduced-effects> Reduced effects</label>';
    card.before(control);
    status = control.querySelector('[role="status"]');
    previous = control.querySelector('[data-page-prev]');
    next = control.querySelector('[data-page-next]');
    previous.addEventListener('click', () => changePage(page - 1));
    next.addEventListener('click', () => changePage(page + 1));
    const reduced = control.querySelector('[data-reduced-effects]');
    try { reduced.checked = localStorage.getItem('ttReducedEffects') === 'true'; } catch (_) {}
    document.documentElement.classList.toggle('tt-reduced-effects', reduced.checked);
    reduced.addEventListener('change', () => {
      document.documentElement.classList.toggle('tt-reduced-effects', reduced.checked);
      try { localStorage.setItem('ttReducedEffects', String(reduced.checked)); } catch (_) {}
    });
  }

  function sourceInfo() {
    const totalPages = Math.max(1, Math.ceil(sourceTotal / PAGE_SIZE));
    const safePage = Math.max(0, Math.min(page, totalPages - 1));
    const from = sourceTotal ? safePage * PAGE_SIZE + 1 : 0;
    const to = sourceTotal ? Math.min(sourceTotal, (safePage + 1) * PAGE_SIZE) : 0;
    return {
      active: Boolean(sourceMode && sourceHost && isAdminDesktopHost(sourceHost)),
      total: sourceTotal,
      page: safePage,
      pageSize: PAGE_SIZE,
      totalPages,
      from,
      to,
      meta: sourceMeta ? { ...sourceMeta } : null,
      version: sourceVersion
    };
  }

  function paintSourceControls() {
    ensureControls();
    if (!control) return;
    const info = sourceInfo();
    page = info.page;
    control.hidden = $('logTableCard')?.style.display === 'none';
    status.textContent = info.total
      ? `Page ${info.page + 1} of ${info.totalPages} · ${info.from}–${info.to} of ${info.total} records · ${PAGE_SIZE} per page`
      : '0 attendance records';
    previous.disabled = info.page === 0 || !info.total;
    next.disabled = info.page >= info.totalPages - 1 || !info.total;
  }

  function sourceWindow(host, rows, key = '', meta = null) {
    if (!isAdminDesktopHost(host)) {
      if (sourceHost === host) disableSourceWindow(host);
      return Array.isArray(rows) ? rows : [];
    }
    const list = Array.isArray(rows) ? rows : [];
    const normalizedKey = String(key || '');
    if (!sourceMode || sourceHost !== host || sourceKey !== normalizedKey) {
      page = 0;
      sourceKey = normalizedKey;
    }
    sourceMode = true;
    sourceHost = host;
    sourceTotal = list.length;
    sourceMeta = meta && typeof meta === 'object' ? { ...meta } : null;
    virtualHost = null;
    virtualDividers = [];
    units = [];
    const totalPages = Math.max(1, Math.ceil(sourceTotal / PAGE_SIZE));
    page = Math.max(0, Math.min(page, totalPages - 1));
    paintSourceControls();
    return list.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  }

  function disableSourceWindow(host = sourceHost) {
    if (host && sourceHost && host !== sourceHost) return;
    sourceMode = false;
    sourceHost = null;
    sourceKey = '';
    sourceTotal = 0;
    sourceMeta = null;
    sourceVersion += 1;
  }

  function clearRows(host) {
    if (!host) return;
    const store = rowStores.get(host);
    if (store) {
      store.byKey.clear();
      store.order = [];
      store.version += 1;
    }
    if (virtualHost === host) {
      units = [];
      virtualDividers = [];
      virtualHost = null;
    }
    if (sourceHost === host) {
      sourceTotal = 0;
      sourceMeta = null;
      sourceVersion += 1;
      paintSourceControls();
    }
    host.replaceChildren();
  }

  function allRows(host) {
    if (sourceMode && host === sourceHost && isAdminDesktopHost(host)) {
      return Array.from(host.children).filter(node => node.dataset.ttRowKey !== undefined ||
        (node.tagName === 'TR' && !node.classList.contains('attendance-date-divider') && !node.classList.contains('attendance-search-empty')));
    }
    if (host && isAdminDesktopHost(host)) {
      const store = rowStores.get(host);
      if (store && store.order.length) return store.order.slice();
    }
    return host ? Array.from(host.children).filter(node => node.dataset.ttRowKey !== undefined ||
      (node.tagName === 'TR' && !node.classList.contains('attendance-date-divider') && !node.classList.contains('attendance-search-empty'))) : [];
  }

  function dataVersion(host) {
    if (sourceMode && host === sourceHost) return sourceVersion;
    const store = host ? rowStores.get(host) : null;
    return store ? Number(store.version || 0) : 0;
  }

  function allDividers(host) {
    if (host && virtualHost === host && isAdminDesktopHost(host)) return virtualDividers.slice();
    return host ? Array.from(host.querySelectorAll('.attendance-date-divider')) : [];
  }

  function isVirtualized(host) {
    if (sourceMode && host === sourceHost) return false;
    return Boolean(host && virtualHost === host && isAdminDesktopHost(host));
  }

  function desiredVirtualPageNodes() {
    const shown = units.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    const nodes = [], seenDividers = new Set();
    for (const unit of shown) {
      if (unit.divider && !seenDividers.has(unit.divider)) {
        seenDividers.add(unit.divider);
        nodes.push(unit.divider);
      }
      if (unit.node && unit.node !== unit.divider) nodes.push(unit.node);
      else if (unit.node && !unit.divider && !nodes.includes(unit.node)) nodes.push(unit.node);
    }
    return nodes;
  }

  function paintPage() {
    if (sourceMode) {
      paintSourceControls();
      return;
    }
    ensureControls();
    const totalPages = Math.max(1, Math.ceil(units.length / PAGE_SIZE));
    page = Math.max(0, Math.min(page, totalPages - 1));

    if (virtualHost && isVirtualized(virtualHost)) {
      syncChildren(virtualHost, desiredVirtualPageNodes());
    } else {
      const shown = new Set();
      units.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).forEach(unit => {
        shown.add(unit.node);
        if (unit.divider) shown.add(unit.divider);
      });
      const host = media.matches ? $('mobileCards') : $('desktopTbody');
      if (host) Array.from(host.children).forEach(node => {
        const hidden = !shown.has(node) && !node.matches('.attendance-search-empty');
        if (node.classList.contains('tt-page-hidden') !== hidden) node.classList.toggle('tt-page-hidden', hidden);
      });
    }

    if (!control) return;
    control.hidden = $('logTableCard')?.style.display === 'none';
    const totalLabel = units.length;
    status.textContent = `Page ${page + 1} of ${totalPages} · ${totalLabel} ${media.matches ? 'records' : 'rows / collapsed dates'} · up to ${PAGE_SIZE} per page`;
    previous.disabled = page === 0;
    next.disabled = page === totalPages - 1;
  }

  function paginate(key = filterKey) {
    if (sourceMode) {
      paintSourceControls();
      return;
    }
    if (virtualHost && isVirtualized(virtualHost)) {
      paintPage();
      return;
    }
    if (key !== filterKey) { page = 0; filterKey = key; }
    units = [];
    const desktop = $('desktopTbody'), mobile = $('mobileCards');
    const host = media.matches ? mobile : desktop;
    let divider = null, group = [];
    const finishGroup = () => {
      if (group.length) units.push(...group);
      else if (divider && !divider.hidden) units.push({node: divider});
      group = [];
    };
    if (host) Array.from(host.children).forEach(node => {
      if (node.matches('.attendance-date-divider')) { finishGroup(); divider = node; return; }
      if (!node.hidden && !node.matches('.attendance-search-empty') && node.style.display !== 'none') group.push({node, divider});
    });
    finishGroup();
    paintPage();
  }

  function virtualize(host, key, groups, emptyNode = null) {
    if (!host || !isAdminDesktopHost(host) || sourceMode) return false;
    virtualHost = host;
    if (key !== filterKey) { page = 0; filterKey = key; }
    units = [];
    virtualDividers = [];
    for (const group of Array.isArray(groups) ? groups : []) {
      const divider = group && group.divider;
      const rows = group && Array.isArray(group.rows) ? group.rows.filter(Boolean) : [];
      if (divider) virtualDividers.push(divider);
      if (rows.length) rows.forEach(node => units.push({node, divider}));
      else if (divider) units.push({node:divider, divider:null});
    }
    if (!units.length && emptyNode) units.push({node:emptyNode, divider:null});
    paintPage();
    return true;
  }

  function requestSourceRender() {
    const bridge = window.trinoAttendanceBridge;
    if (!bridge || typeof bridge.refreshTable !== 'function') return;
    const run = () => {
      if (document.documentElement.classList.contains('tt-is-scrolling') || document.documentElement.classList.contains('tt-admin-interacting')) {
        setTimeout(run, 180);
        return;
      }
      try { bridge.refreshTable(); } catch (_) {}
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
    else setTimeout(run, 0);
  }

  function changePage(value) {
    if (sourceMode) {
      const totalPages = Math.max(1, Math.ceil(sourceTotal / PAGE_SIZE));
      const nextPage = Math.max(0, Math.min(Number(value) || 0, totalPages - 1));
      if (nextPage === page) return;
      page = nextPage;
      paintSourceControls();
      requestSourceRender();
      control?.scrollIntoView({block:'nearest', behavior:'auto'});
      return;
    }
    page = value;
    paintPage();
    control?.scrollIntoView({block: 'nearest', behavior: 'auto'});
  }

  function attendanceDateKey(value) {
    const text=String(value || '').trim();
    const iso=/^(\d{4})-(\d{1,2})-(\d{1,2})(?:$|T)/.exec(text);
    const slash=/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(text);
    if(!iso&&!slash)return -1;
    let year=Number(iso?iso[1]:slash[3]);
    const month=Number(iso?iso[2]:slash[1]),day=Number(iso?iso[3]:slash[2]);
    if(!iso&&year<100)year+=2000;
    const leap=year%4===0&&(year%100!==0||year%400===0);
    const days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
    if(year<1||month<1||month>12||day<1||day>days[month-1])return -1;
    return year*10000+month*100+day;
  }

  function sortNewestFirst(rows) {
    const keys=new Map();
    for(const row of rows)if(!keys.has(row.date))keys.set(row.date,attendanceDateKey(row.date));
    return rows.sort((a,b)=>keys.get(b.date)-keys.get(a.date)||String(a.name||'').localeCompare(String(b.name||'')));
  }

  function setScope(key) {
    if (scopeKey !== key) {
      scopeKey = key;
      page = 0;
      sourceKey = '';
    }
  }

  function reveal(node) {
    if (sourceMode) {
      if (node && sourceHost?.contains(node)) node.scrollIntoView({block:'nearest', behavior:'auto'});
      return;
    }
    const index = units.findIndex(unit => unit.node === node || unit.divider === node);
    if (index >= 0) { page = Math.floor(index / PAGE_SIZE); paintPage(); }
  }

  media.addEventListener('change', () => {
    page = 0;
    if (media.matches && sourceMode) {
      disableSourceWindow();
      try { window.trinoAttendanceBridge?.refreshTable?.(); } catch (_) {}
    } else if (virtualHost && !media.matches) paintPage();
    else if (!virtualHost && !sourceMode) paginate();
  });

  window.TrinoTimeAttendancePerformance = Object.freeze({
    patchRows, paginate, virtualize, reveal, setScope, attendanceDateKey,
    sortNewestFirst, isVisible, isVirtualized, allRows, allDividers, clearRows, dataVersion,
    sourceWindow, sourceInfo, disableSourceWindow
  });
})();
