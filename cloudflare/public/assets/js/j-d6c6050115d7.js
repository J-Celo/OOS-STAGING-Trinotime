(() => {
  'use strict';

  const VERSION = '1.1.89';
  const CARD_ID = 'ttPremiumEmbeddedCalendar';
  const SLOT_CLASS = 'tt-v1117-calendar-slot';
  const state = {
    year: null,
    month: null,
    identityKey: '',
    renderQueued: false,
    interval: 0,
    rootObserver: null,
    bodyObserver: null,
    profileObserver: null,
    observedProfile: null,
    observedStatus: null,
    observedSelection: null
  };

  const $ = id => document.getElementById(id);
  const qs = (selector, root = document) => root.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

  const monthFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC', month: 'long', year: 'numeric'
  });
  const ariaDateFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  });
  const phtPartsFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila', year: 'numeric', month: 'numeric', day: 'numeric'
  });

  function phtParts() {
    const result = { year: 0, month: 0, day: 0 };
    phtPartsFormatter.formatToParts(new Date()).forEach(part => {
      if (part.type === 'year' || part.type === 'month' || part.type === 'day') result[part.type] = Number(part.value);
    });
    return result;
  }

  function currentRole() {
    return String(document.body?.dataset?.trinoRole || '').trim().toLowerCase();
  }

  function premiumEnabled() {
    return document.documentElement?.dataset?.trinoCustomWorkspace === 'enabled';
  }

  function normalizeResolverRole(role) {
    return role === 'teamleader' || role === 'team_leader' ? 'teamleader' : 'labeler';
  }

  function parsePod(text) {
    const match = String(text || '').match(/\b(POD\s*\d+|ONBOARDING|TESCO|KROGER|ALBERTSONS|CWH)\b/i);
    return match ? match[1].replace(/\s+/g, ' ').toUpperCase() : '';
  }

  function displayPod(pod) {
    const raw = String(pod || '').trim();
    try {
      if (typeof window.TrinoTimePodDisplayLabel === 'function') return window.TrinoTimePodDisplayLabel(raw);
    } catch (_) {}
    if (/^tt-custom-pod:/i.test(raw)) return 'Assigned POD';
    return raw || 'Assigned POD';
  }

  function currentIdentity() {
    const signedInQa = typeof window.TrinoTimeCurrentQaTeamLabel === 'function'
      ? String(window.TrinoTimeCurrentQaTeamLabel() || '') : '';
    const core = window.TrinoTimeCore;
    let actor = null;
    try {
      if (core?.permissions?.actor && typeof core.permissions.actor === 'function') actor = core.permissions.actor();
    } catch (_) {}

    const bodyRole = currentRole();
    const actorRole = String(actor?.role || '').toLowerCase();
    const role = bodyRole || (actorRole === 'team_leader' ? 'teamleader' : actorRole);

    // Admin uses the same live Agent selection that drives the shift/attendance
    // header. This keeps the calendar read-only and synchronized with the
    // currently inspected employee without creating another source of truth.
    if (role === 'admin') {
      const name = String($('#empSelect')?.value || '').trim();
      const selectedMeta = qs('#selectedEmployeeDisplay small')?.textContent || '';
      const pod = parsePod(selectedMeta) || parsePod($('#clockShiftPrimary')?.textContent);
      return { role, name, pod, adminSelection: true };
    }

    let name = String(actor?.name || '').trim();
    let pod = String(actor?.pod || '').trim();

    if (!name || /^(agent|team leader|pod session)$/i.test(name)) {
      name = String($('#agentProfileHeaderName')?.textContent || qs('#agentProfileHeaderBtn .tt-profile-header-copy strong')?.textContent || '').trim();
    }
    if (!pod) {
      pod = parsePod($('#agentProfileHeaderRole')?.textContent)
        || parsePod(qs('#agentProfileHeaderBtn .tt-profile-role')?.textContent)
        || parsePod($('#clockShiftPrimary')?.textContent)
        || parsePod($('#executiveStatusScope')?.textContent)
        || parsePod($('#ttPremiumPodHeading')?.textContent);
    }

    // The current QA team's schedule must never use a pre-promotion POD 0/1/2.
    if (role === 'agent' && signedInQa) pod = signedInQa;
    return { role, name, pod, adminSelection: false };
  }

  function roleSupported(role) {
    return role === 'agent' || role === 'teamleader' || role === 'admin';
  }

  function ensureCard() {
    const slot = $('headerProfileSlot');
    if (!slot) return null;

    let card = $(CARD_ID);
    if (!card) {
      card = document.createElement('section');
      card.id = CARD_ID;
      card.className = 'tt-v1117-calendar-card';
      card.setAttribute('aria-label', 'My schedule calendar');
      card.innerHTML = `
        <div class="tt-v1117-cal-head">
          <div class="tt-v1117-cal-heading">
            <span>Schedule calendar</span>
            <strong id="ttV1117CalendarMonth">Month</strong>
          </div>
          <div class="tt-v1117-cal-nav" aria-label="Calendar month controls">
            <button type="button" data-v1117-cal-nav="prev" aria-label="Previous month" title="Previous month">‹</button>
            <button type="button" data-v1117-cal-nav="next" aria-label="Next month" title="Next month">›</button>
          </div>
        </div>
        <div class="tt-v1117-cal-context">
          <span id="ttV1117CalendarContext">Loading schedule…</span>
          <button type="button" data-v1117-cal-nav="today">Today</button>
        </div>
        <div class="tt-v1117-cal-weekdays" aria-hidden="true"><span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span></div>
        <div class="tt-v1117-cal-grid" id="ttV1117CalendarGrid" role="grid" aria-label="Monthly work schedule"></div>
        <div class="tt-v1117-cal-legend" aria-label="Calendar color legend">
          <span class="is-dayoff"><i></i>Day Off</span>
          <span class="is-leave"><i></i>Leave</span>
          <span class="is-today"><i></i>Today</span>
        </div>`;
      slot.appendChild(card);
      card.addEventListener('click', event => {
        const button = event.target.closest('[data-v1117-cal-nav]');
        if (!button) return;
        const action = button.dataset.v1117CalNav;
        const live = phtParts();
        if (action === 'today') {
          state.year = live.year;
          state.month = live.month - 1;
        } else if (action === 'prev' || action === 'next') {
          if (state.year === null || state.month === null) {
            state.year = live.year;
            state.month = live.month - 1;
          }
          const step = action === 'prev' ? -1 : 1;
          const date = new Date(Date.UTC(state.year, state.month + step, 1));
          state.year = date.getUTCFullYear();
          state.month = date.getUTCMonth();
        }
        queueRender();
      });
    }
    return card;
  }

  function availabilityFor(identity, year, monthZeroBased, day) {
    const core = window.TrinoTimeCore;
    if (!identity.name || !identity.pod || !core || typeof core.resolveEffectiveAvailability !== 'function') {
      return { kind: 'unknown', label: 'Schedule syncing' };
    }
    const dateStr = `${String(monthZeroBased + 1).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`;
    try {
      const availability = core.resolveEffectiveAvailability(identity.name, dateStr, identity.pod, {
        role: normalizeResolverRole(identity.role),
        includeAttendance: false
      }) || {};
      if (availability.sourceKind === 'leave') {
        const leaveType = String(availability.leaveRequest?.leaveType || '').trim();
        const partial = availability.code === 'partial_leave';
        return { kind: 'leave', label: leaveType || (partial ? 'Partial Leave' : 'Approved Leave') };
      }
      if (availability.sourceKind === 'day_off' || availability.code === 'scheduled_day_off') {
        return { kind: 'dayoff', label: 'Day Off' };
      }
      return { kind: 'work', label: availability.reason || 'Scheduled workday' };
    } catch (_) {
      return { kind: 'unknown', label: 'Schedule syncing' };
    }
  }

  function render() {
    state.renderQueued = false;
    const role = currentRole();
    const slot = $('headerProfileSlot');
    if (!slot) return;

    const enabled = premiumEnabled() && roleSupported(role);
    let card = $(CARD_ID);
    slot.classList.toggle(SLOT_CLASS, enabled);
    slot.classList.toggle('tt-v1117-calendar-agent', enabled && role === 'agent');
    slot.classList.toggle('tt-v1117-calendar-tl', enabled && role === 'teamleader');
    slot.classList.toggle('tt-v1117-calendar-admin', enabled && role === 'admin');
    if (!enabled) {
      if (card) card.hidden = true;
      return;
    }
    card = card || ensureCard();
    if (!card) return;
    card.hidden = false;

    const identity = currentIdentity();
    const live = phtParts();
    const identityKey = `${identity.role}|${identity.name}|${identity.pod}`;
    if (state.identityKey !== identityKey) {
      state.identityKey = identityKey;
      state.year = live.year;
      state.month = live.month - 1;
    }
    if (state.year === null || state.month === null) {
      state.year = live.year;
      state.month = live.month - 1;
    }

    const title = $('ttV1117CalendarMonth');
    const context = $('ttV1117CalendarContext');
    const grid = $('ttV1117CalendarGrid');
    if (!title || !context || !grid) return;

    title.textContent = monthFormatter.format(new Date(Date.UTC(state.year, state.month, 1)));
    const dataLoading = $('#appRoot')?.dataset?.ttDataLoading === 'true';
    const needsAdminSelection = identity.role === 'admin' && !identity.name;
    const loading = dataLoading || !identity.name || !identity.pod;
    card.dataset.loading = loading ? 'true' : 'false';
    card.dataset.adminSelection = identity.role === 'admin' ? 'true' : 'false';
    context.textContent = needsAdminSelection
      ? 'Select an Agent to view days off & leave'
      : dataLoading
        ? 'Syncing live schedule…'
        : identity.role === 'admin'
          ? `${identity.name} · ${displayPod(identity.pod)}`
          : `${displayPod(identity.pod)} · ${identity.role === 'teamleader' ? 'Team Leader' : 'My schedule'}`;

    const firstDow = new Date(Date.UTC(state.year, state.month, 1)).getUTCDay();
    const daysInMonth = new Date(Date.UTC(state.year, state.month + 1, 0)).getUTCDate();
    const previousMonthDays = new Date(Date.UTC(state.year, state.month, 0)).getUTCDate();
    const cells = [];

    for (let i = 0; i < 42; i += 1) {
      let year = state.year;
      let month = state.month;
      let day = i - firstDow + 1;
      let outside = false;
      if (day < 1) {
        outside = true;
        month -= 1;
        if (month < 0) { month = 11; year -= 1; }
        day = previousMonthDays + day;
      } else if (day > daysInMonth) {
        outside = true;
        day -= daysInMonth;
        month += 1;
        if (month > 11) { month = 0; year += 1; }
      }

      const classes = ['tt-v1117-cal-day'];
      let status = { kind: 'outside', label: '' };
      if (outside) {
        classes.push('is-outside');
      } else if (!loading) {
        status = availabilityFor(identity, state.year, state.month, day);
        if (status.kind === 'dayoff') classes.push('is-dayoff');
        if (status.kind === 'leave') classes.push('is-leave');
      }

      const isToday = year === live.year && month === live.month - 1 && day === live.day;
      if (isToday) classes.push('is-today');
      const dateLabel = ariaDateFormatter.format(new Date(Date.UTC(year, month, day)));
      const statusLabel = outside ? '' : `, ${status.label || 'Scheduled workday'}`;
      cells.push(`<span class="${classes.join(' ')}" role="gridcell" aria-label="${esc(dateLabel + statusLabel)}" title="${esc(dateLabel + statusLabel.replace(/^,\s*/, ' · '))}"><span>${day}</span></span>`);
    }

    grid.innerHTML = cells.join('');
    bindSmallObservers();
  }

  function queueRender() {
    if (state.renderQueued) return;
    state.renderQueued = true;
    requestAnimationFrame(render);
  }

  function bindSmallObservers() {
    const profile = $('agentProfileHeaderBtn');
    const status = $('tlHomeStatusBadge');
    const selection = $('selectedEmployeeDisplay');
    if (profile === state.observedProfile && status === state.observedStatus && selection === state.observedSelection) return;
    if (state.profileObserver) state.profileObserver.disconnect();
    state.observedProfile = profile;
    state.observedStatus = status;
    state.observedSelection = selection;
    state.profileObserver = new MutationObserver(mutations => {
      if (mutations.some(mutation => !mutation.target.closest?.(`#${CARD_ID}`))) queueRender();
    });
    if (profile) state.profileObserver.observe(profile, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['aria-label'] });
    if (status) state.profileObserver.observe(status, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'data-state'] });
    if (selection) state.profileObserver.observe(selection, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['style', 'hidden', 'data-render-key'] });
  }

  function boot() {
    queueRender();

    state.rootObserver = new MutationObserver(queueRender);
    state.rootObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-trino-custom-workspace'] });

    if (document.body) {
      state.bodyObserver = new MutationObserver(queueRender);
      state.bodyObserver.observe(document.body, { attributes: true, attributeFilter: ['data-trino-role'] });
    }

    window.addEventListener('focus', queueRender, { passive: true });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) queueRender(); }, { passive: true });
    document.addEventListener('change', event => { if (event.target?.id === 'empSelect') queueRender(); }, { passive: true });
    document.addEventListener('input', event => { if (event.target?.id === 'empSelect') queueRender(); }, { passive: true });
    window.addEventListener('resize', queueRender, { passive: true });
    state.interval = window.setInterval(queueRender, 30000);
    window.setTimeout(queueRender, 350);
    window.setTimeout(queueRender, 1200);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();

  window.TrinoTimePremiumCalendar = Object.freeze({
    version: VERSION,
    refresh: queueRender
  });
})();
