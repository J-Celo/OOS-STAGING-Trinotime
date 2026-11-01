(() => {
  'use strict';

  const byId = id => document.getElementById(id);
  const state = {
    offsetMs: 0,
    offsetReady: false,
    presence: null,
    presenceReady: false,
    timeBound: false,
    presenceBound: false,
    presenceDeniedUid: null,
    retryTimer: null,
    calendarYear: null,
    calendarMonth: null,
    calendarLastDateKey: '',
    calendarLastContextKey: '',
    calendarAnimationTimer: null
  };

  const timeFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
  const dateFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
  const monthFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric'
  });
  const ariaDateFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
  const phtPartsFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric'
  });

  function currentMs() {
    return Date.now() + (state.offsetReady ? state.offsetMs : 0);
  }

  function phtDateParts(ms = currentMs()) {
    const parts = { year:0, month:0, day:0 };
    phtPartsFormatter.formatToParts(new Date(ms)).forEach(part => {
      if (part.type === 'year' || part.type === 'month' || part.type === 'day') parts[part.type] = Number(part.value);
    });
    return parts;
  }

  function calendarDateKey(parts) {
    return `${parts.year}-${String(parts.month).padStart(2,'0')}-${String(parts.day).padStart(2,'0')}`;
  }

  function renderClock() {
    const clock = byId('gateLiveShiftClock');
    const date = byId('gateLiveShiftDate');
    if (!clock || !date) return;
    const now = new Date(currentMs());
    clock.textContent = timeFormatter.format(now).replace(/\s/g, ' ');
    date.textContent = dateFormatter.format(now);

    const liveParts = phtDateParts();
    const nextKey = calendarDateKey(liveParts);
    if (nextKey !== state.calendarLastDateKey) {
      state.calendarLastDateKey = nextKey;
      if (state.calendarYear === null || state.calendarMonth === null) {
        state.calendarYear = liveParts.year;
        state.calendarMonth = liveParts.month - 1;
      }
      renderCalendar({ animate:false });
    }
  }

  function countOnlineAgents() {
    if (!state.presenceReady || !state.presence || typeof state.presence !== 'object') return null;
    const now = currentMs();
    const staleAfterMs = 120000;
    let count = 0;
    Object.values(state.presence).forEach(profileSessions => {
      if (!profileSessions || typeof profileSessions !== 'object') return;
      const online = Object.values(profileSessions).some(session => {
        if (!session || typeof session !== 'object' || session.online === false) return false;
        const updatedAt = Number(session.updatedAt);
        return !Number.isFinite(updatedAt) || updatedAt <= 0 || Math.abs(now - updatedAt) <= staleAfterMs;
      });
      if (online) count += 1;
    });
    return count;
  }

  function renderPresence() {
    const value = byId('gateLiveOnlineCount');
    const copy = byId('gateLiveOnlineCopy');
    if (!value || !copy) return;
    const count = countOnlineAgents();
    if (count === null) {
      value.textContent = '—';
      value.dataset.state = 'loading';
      copy.textContent = 'Secure presence sync';
      return;
    }
    value.textContent = String(count);
    value.dataset.state = 'ready';
    copy.textContent = count === 1 ? 'agent currently online' : 'agents currently online';
  }

  function renderSyncState() {
    const badge = byId('gateLiveSyncState');
    const value = byId('gateLiveTimeStatus');
    const copy = byId('gateLiveTimeCopy');
    if (!badge || !value || !copy) return;
    if (state.offsetReady) {
      badge.dataset.state = 'verified';
      badge.textContent = 'Server synced';
      value.textContent = 'Verified';
      value.dataset.state = 'ready';
      copy.textContent = 'trusted PHT offset';
    } else {
      badge.dataset.state = 'limited';
      badge.textContent = 'Syncing';
      value.textContent = 'PHT';
      value.dataset.state = 'loading';
      copy.textContent = 'live clock · verifying';
    }
  }

  function portalCalendarSnapshot(year, monthZeroBased) {
    const core = window.TrinoTimeCore;
    if (!core || typeof core.getPortalCalendarMonthSnapshot !== 'function') {
      return { contextReady:false, shiftDays:[], dayOffDays:[] };
    }
    try {
      const snapshot = core.getPortalCalendarMonthSnapshot(year, monthZeroBased + 1) || {};
      return {
        contextReady: snapshot.contextReady === true,
        shiftDays: Array.isArray(snapshot.shiftDays) ? snapshot.shiftDays : [],
        dayOffDays: Array.isArray(snapshot.dayOffDays) ? snapshot.dayOffDays : []
      };
    } catch (_) {
      return { contextReady:false, shiftDays:[], dayOffDays:[] };
    }
  }

  function monthAriaLabel(year, monthZeroBased, day, classes) {
    const base = ariaDateFormatter.format(new Date(Date.UTC(year, monthZeroBased, day)));
    const status = [];
    if (classes.includes('is-live-date')) status.push('live server date');
    if (classes.includes('is-day-off')) status.push('scheduled day off');
    if (classes.includes('is-shift')) status.push('scheduled shift');
    return status.length ? `${base}, ${status.join(', ')}` : base;
  }

  function renderCalendar(options = {}) {
    const grid = byId('gateCalendarGrid');
    const title = byId('gateCalendarMonthLabel');
    const serverDate = byId('gateCalendarServerDate');
    const context = byId('gateCalendarContext');
    const card = byId('gateCalendarCard');
    if (!grid || !title || !serverDate || !context || !card) return;

    const live = phtDateParts();
    if (state.calendarYear === null || state.calendarMonth === null) {
      state.calendarYear = live.year;
      state.calendarMonth = live.month - 1;
    }

    const year = state.calendarYear;
    const month = state.calendarMonth;
    const snapshot = portalCalendarSnapshot(year, month);
    const shiftDays = new Set(snapshot.shiftDays.map(Number));
    const dayOffDays = new Set(snapshot.dayOffDays.map(Number));
    const firstDow = new Date(Date.UTC(year, month, 1)).getUTCDay();
    const dayCount = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const prevDayCount = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const cells = [];

    for (let i = 0; i < 42; i += 1) {
      let cellYear = year;
      let cellMonth = month;
      let day = i - firstDow + 1;
      let outside = false;
      if (day < 1) {
        outside = true;
        cellMonth -= 1;
        if (cellMonth < 0) { cellMonth = 11; cellYear -= 1; }
        day = prevDayCount + day;
      } else if (day > dayCount) {
        outside = true;
        day -= dayCount;
        cellMonth += 1;
        if (cellMonth > 11) { cellMonth = 0; cellYear += 1; }
      }

      const classes = ['gate-calendar-day'];
      if (outside) classes.push('is-outside');
      const inViewedMonth = !outside;
      if (inViewedMonth && snapshot.contextReady && dayOffDays.has(day)) classes.push('is-day-off');
      if (inViewedMonth && snapshot.contextReady && shiftDays.has(day)) classes.push('is-shift');
      if (cellYear === live.year && cellMonth === live.month - 1 && day === live.day) classes.push('is-live-date');

      const label = monthAriaLabel(cellYear, cellMonth, day, classes);
      cells.push(`<span class="${classes.join(' ')}" role="gridcell" aria-label="${label}"><span>${day}</span></span>`);
    }

    title.textContent = monthFormatter.format(new Date(Date.UTC(year, month, 1)));
    serverDate.textContent = dateFormatter.format(new Date(currentMs()));
    context.textContent = snapshot.contextReady
      ? 'Last-used workspace schedule · live PHT'
      : 'Live PHT calendar · schedule highlights load from the last-used workspace';
    grid.innerHTML = cells.join('');

    const contextKey = `${year}-${month}-${snapshot.contextReady ? snapshot.dayOffDays.join('.') : 'none'}`;
    state.calendarLastContextKey = contextKey;

    if (options.animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      if (state.calendarAnimationTimer) window.clearTimeout(state.calendarAnimationTimer);
      card.classList.remove('is-page-next','is-page-prev');
      void card.offsetWidth;
      card.classList.add(options.direction === 'prev' ? 'is-page-prev' : 'is-page-next');
      state.calendarAnimationTimer = window.setTimeout(() => {
        card.classList.remove('is-page-next','is-page-prev');
        state.calendarAnimationTimer = null;
      }, 430);
    }
  }

  function changeCalendarMonth(delta) {
    if (!Number.isFinite(delta) || !delta) return;
    const d = new Date(Date.UTC(state.calendarYear, state.calendarMonth + delta, 1));
    state.calendarYear = d.getUTCFullYear();
    state.calendarMonth = d.getUTCMonth();
    renderCalendar({ animate:true, direction:delta < 0 ? 'prev' : 'next' });
  }

  function returnCalendarToToday() {
    const live = phtDateParts();
    const direction = (live.year * 12 + (live.month - 1)) < (state.calendarYear * 12 + state.calendarMonth) ? 'prev' : 'next';
    state.calendarYear = live.year;
    state.calendarMonth = live.month - 1;
    renderCalendar({ animate:true, direction });
  }

  function bindCalendar() {
    const previous = byId('gateCalendarPrev');
    const next = byId('gateCalendarNext');
    const today = byId('gateCalendarToday');
    if (!previous || !next) return;
    previous.addEventListener('click', () => changeCalendarMonth(-1));
    next.addEventListener('click', () => changeCalendarMonth(1));
    if (today) today.addEventListener('click', returnCalendarToToday);
    renderCalendar({ animate:false });

    window.addEventListener('storage', event => {
      if (!event || event.key === 'lastEmployee' || event.key === 'lastPod' || event.key === 'lastTeam') {
        renderCalendar({ animate:false });
      }
    });
    window.setInterval(() => {
      const snapshot = portalCalendarSnapshot(state.calendarYear, state.calendarMonth);
      const key = `${state.calendarYear}-${state.calendarMonth}-${snapshot.contextReady ? snapshot.dayOffDays.join('.') : 'none'}`;
      if (key !== state.calendarLastContextKey) renderCalendar({ animate:false });
    }, 5000);
  }

  function markPresenceUnavailable() {
    state.presenceReady = false;
    state.presence = null;
    renderPresence();
  }

  function scheduleFirebaseRetry(delay = 1000) {
    if (state.retryTimer) return;
    state.retryTimer = window.setTimeout(() => {
      state.retryTimer = null;
      bindFirebaseTelemetry();
    }, delay);
  }

  function bindFirebaseTelemetry() {
    const fb = window.firebase;
    if (!fb || typeof fb.database !== 'function' || !Array.isArray(fb.apps) || !fb.apps.length) {
      scheduleFirebaseRetry(600);
      return;
    }

    try {
      const db = fb.database();
      if (!state.timeBound) {
        state.timeBound = true;
        db.ref('.info/serverTimeOffset').on('value', snap => {
          const offset = Number(snap && snap.val ? snap.val() : NaN);
          if (Number.isFinite(offset)) {
            state.offsetMs = offset;
            state.offsetReady = true;
          }
          renderClock();
          renderPresence();
          renderSyncState();
          renderCalendar({ animate:false });
        }, () => {
          state.timeBound = false;
          state.offsetReady = false;
          renderSyncState();
          scheduleFirebaseRetry(1800);
        });
      }

      const uid = String((typeof fb.auth === 'function' && fb.auth().currentUser?.uid) || 'guest');
      // The login-gate online counter is optional: never hammer a protected
      // /agentPresence node after RTDB denies this Firebase identity.
      if (!state.presenceBound && state.presenceDeniedUid !== uid) {
        state.presenceBound = true;
        db.ref('agentPresence').on('value', snap => {
          state.presenceDeniedUid = null;
          state.presence = (snap && snap.val ? snap.val() : null) || {};
          state.presenceReady = true;
          renderPresence();
        }, error => {
          state.presenceBound = false;
          markPresenceUnavailable();
          if (/permission[-_ ]denied|unauthorized|invalid[-_ ]token/i.test(String(error?.code || '') + ' ' + String(error?.message || ''))) {
            state.presenceDeniedUid = uid;
            return;
          }
          scheduleFirebaseRetry(1800);
        });
      }
    } catch (_) {
      state.timeBound = false;
      state.presenceBound = false;
      scheduleFirebaseRetry(1200);
    }
  }

  function init() {
    if (!byId('gateLiveTelemetry')) return;
    renderClock();
    renderPresence();
    renderSyncState();
    bindCalendar();
    window.setInterval(renderClock, 1000);
    window.setInterval(renderPresence, 30000);
    bindFirebaseTelemetry();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
