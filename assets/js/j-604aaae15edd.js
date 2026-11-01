(() => {
  'use strict';

  // TrinoTime v1.1.6 Standard UX Completion.
  // IMPORTANT: this module never initializes, configures, or calls Firebase,
  // App Check, reCAPTCHA, Auth, database APIs, security rules, or API keys.
  const VERSION = '1.1.6';
  const PREF_KEY = 'trinotime-standard-ui-prefs-v116';
  const LEGACY_PREF_KEY = 'trinotime-standard-ui-prefs-v115';
  const ACTIVITY_KEY = 'trinotime-standard-session-activity-v116';
  const MAX_ACTIVITY = 5;
  const MONTHS = 'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec';

  const $ = (id) => document.getElementById(id);
  const q = (selector, root = document) => root.querySelector(selector);
  const qa = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  let systemThemeMedia = null;
  let notificationBaseline = null;
  let notificationReady = false;
  let landingApplied = false;
  let activeLeaveFilter = 'all';
  let liveClockSyncQueued = false;
  let overviewSyncFrame = 0;
  const overviewDateFormatter = (() => { try { return new Intl.DateTimeFormat('en-US', { timeZone:'Asia/Manila', weekday:'long', month:'short', day:'numeric', year:'numeric' }); } catch (_) { return null; } })();
  let recentActivity = readActivity();
  const observedValues = new Map();

  function isPremium() {
    const html = document.documentElement;
    return html.dataset.trinoTier === 'premium' || html.getAttribute('data-trino-custom-workspace') === 'enabled';
  }

  function safeJson(raw, fallback = {}) {
    try { return raw ? JSON.parse(raw) : fallback; } catch (_) { return fallback; }
  }

  function readPrefs() {
    let saved = {};
    let legacy = {};
    let storedTheme = '';
    try {
      saved = safeJson(localStorage.getItem(PREF_KEY), {});
      legacy = safeJson(localStorage.getItem(LEGACY_PREF_KEY), {});
      storedTheme = String(localStorage.getItem('oosTimeClockTheme') || '').toLowerCase();
    } catch (_) {}
    const theme = ['light', 'dark', 'system'].includes(saved.theme) ? saved.theme : (['light', 'dark', 'system'].includes(storedTheme) ? storedTheme : 'light');
    return {
      compact: saved.compact !== undefined ? !!saved.compact : !!legacy.compact,
      reducedMotion: saved.reducedMotion !== undefined ? !!saved.reducedMotion : !!legacy.reducedMotion,
      theme,
      notificationSound: !!saved.notificationSound,
      timeFormat: saved.timeFormat === '24' ? '24' : '12',
      landing: ['dashboard', 'status', 'history'].includes(saved.landing) ? saved.landing : 'dashboard'
    };
  }

  function savePrefs(next) {
    const merged = { ...readPrefs(), ...next };
    try { localStorage.setItem(PREF_KEY, JSON.stringify(merged)); } catch (_) {}
    return merged;
  }

  function readActivity() {
    try {
      const parsed = safeJson(sessionStorage.getItem(ACTIVITY_KEY), []);
      return Array.isArray(parsed) ? parsed.slice(0, MAX_ACTIVITY) : [];
    } catch (_) { return []; }
  }

  function saveActivity() {
    try { sessionStorage.setItem(ACTIVITY_KEY, JSON.stringify(recentActivity.slice(0, MAX_ACTIVITY))); } catch (_) {}
  }

  function toneFor(text) {
    const value = String(text || '').toLowerCase();
    if (/break/.test(value)) return 'break';
    if (/complete|clocked out|time out|synced|all clear|approved/.test(value)) return 'complete';
    if (/working|clocked in|online|active|ready/.test(value)) return 'active';
    if (/late|issue|warning|error|offline|unavailable|blocked|reconnecting/.test(value)) return 'warning';
    return 'neutral';
  }

  function phtNow() {
    return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
  }

  function activityTime(iso) {
    const d = new Date(iso || Date.now());
    const prefs = readPrefs();
    try {
      return new Intl.DateTimeFormat(prefs.timeFormat === '24' ? 'en-GB' : 'en-US', {
        timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit', hour12: prefs.timeFormat !== '24'
      }).format(d);
    } catch (_) { return 'now'; }
  }

  function pushActivity(label, tone = 'neutral') {
    const clean = String(label || '').replace(/\s+/g, ' ').trim().slice(0, 110);
    if (!clean) return;
    if (recentActivity[0] && recentActivity[0].label === clean) return;
    recentActivity.unshift({ label: clean, tone, at: new Date().toISOString() });
    recentActivity = recentActivity.slice(0, MAX_ACTIVITY);
    saveActivity();
    renderActivity();
  }

  function renderActivity() {
    const list = $('ttV116ActivityList');
    if (!list) return;
    if (!recentActivity.length) {
      list.innerHTML = '<div class="tt-v116-empty"><strong>No recent activity yet</strong><span>Attendance and sync updates from this browser session will appear here.</span></div>';
      return;
    }
    list.innerHTML = recentActivity.map(item => `
      <div class="tt-v116-activity-item" data-tone="${String(item.tone || 'neutral').replace(/[^a-z-]/g, '')}">
        <i class="tt-v116-activity-dot" aria-hidden="true"></i>
        <span class="tt-v116-activity-copy">${escapeText(item.label)}</span>
        <time class="tt-v116-activity-time" datetime="${escapeAttr(item.at)}">${escapeText(activityTime(item.at))}</time>
      </div>`).join('');
  }

  function escapeText(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
  }

  function escapeAttr(value) { return escapeText(value); }

  function ensureSystemThemeButton() {
    const row = q('#settingsPanelAppearance .theme-choice-row');
    if (!row) return;
    let btn = $('themeSystemBtn');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'themeSystemBtn';
      btn.type = 'button';
      btn.className = 'theme-choice-btn';
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2"></rect><path d="M8 20h8M12 16v4"></path></svg>System';
      row.appendChild(btn);
      btn.addEventListener('click', () => {
        savePrefs({ theme: 'system' });
        try { localStorage.setItem('oosTimeClockTheme', 'system'); } catch (_) {}
        applyThemePreference('system');
      });
    }
    btn.hidden = isPremium();

    ['themeLightBtn', 'themeDarkBtn'].forEach(id => {
      const el = $(id);
      if (!el || el.dataset.v116Bound === 'true') return;
      el.dataset.v116Bound = 'true';
      el.addEventListener('click', () => {
        const theme = id === 'themeDarkBtn' ? 'dark' : 'light';
        savePrefs({ theme });
        try { localStorage.setItem('oosTimeClockTheme', theme); } catch (_) {}
        applyThemePreference(theme);
      });
    });
  }

  function applyThemePreference(theme = readPrefs().theme) {
    let actual = theme;
    if (theme === 'system') {
      systemThemeMedia = systemThemeMedia || window.matchMedia?.('(prefers-color-scheme: dark)') || null;
      actual = systemThemeMedia && systemThemeMedia.matches ? 'dark' : 'light';
    }
    document.body.classList.toggle('dark-mode', actual === 'dark');
    $('themeLightBtn')?.classList.toggle('active', theme === 'light');
    $('themeDarkBtn')?.classList.toggle('active', theme === 'dark');
    $('themeSystemBtn')?.classList.toggle('active', theme === 'system');
    const meta = q('meta[name="theme-color"]');
    if (meta) meta.content = actual === 'dark' ? '#0F172A' : '#F8FAFC';
  }

  function applyExistingComfortPrefs(prefs = readPrefs()) {
    document.body.classList.toggle('tt-standard-compact', !!prefs.compact);
    document.body.classList.toggle('tt-user-reduced-motion', !!prefs.reducedMotion);
    const compact = $('ttStdCompactToggle');
    const motion = $('ttStdMotionToggle');
    if (compact) compact.checked = !!prefs.compact;
    if (motion) motion.checked = !!prefs.reducedMotion;
  }

  function ensureWorkflowPreferences() {
    const section = $('ttStandardPreferences');
    if (!section || $('ttV116WorkflowDivider')) return;
    const note = q('.tt-standard-preferences-note', section);
    const host = document.createDocumentFragment();

    const divider = document.createElement('div');
    divider.id = 'ttV116WorkflowDivider';
    divider.className = 'tt-v116-preferences-divider';
    divider.textContent = 'Workflow';
    host.appendChild(divider);

    const sound = document.createElement('label');
    sound.className = 'tt-standard-setting-row';
    sound.htmlFor = 'ttV116NotificationSound';
    sound.innerHTML = '<span><strong>Notification sound</strong><small>Play a subtle local chime when the unread notification count increases.</small></span><input id="ttV116NotificationSound" type="checkbox" role="switch" aria-label="Play a sound for new notifications">';
    host.appendChild(sound);

    const time = document.createElement('label');
    time.className = 'tt-standard-setting-row tt-v116-select-row';
    time.htmlFor = 'ttV116TimeFormat';
    time.innerHTML = '<span><strong>Clock format</strong><small>Choose how the live PHT header clock and this overview display time.</small></span><select id="ttV116TimeFormat" class="tt-v116-setting-control" aria-label="Clock format"><option value="12">12-hour</option><option value="24">24-hour</option></select>';
    host.appendChild(time);

    const landing = document.createElement('label');
    landing.className = 'tt-standard-setting-row tt-v116-select-row';
    landing.htmlFor = 'ttV116Landing';
    landing.innerHTML = '<span><strong>Open after sign-in</strong><small>Choose the first Standard workspace view shown after a fresh sign-in.</small></span><select id="ttV116Landing" class="tt-v116-setting-control" aria-label="Open after sign-in"><option value="dashboard">Dashboard</option><option value="status">Today\'s Status</option><option value="history">History</option></select>';
    host.appendChild(landing);

    const freeze = document.createElement('p');
    freeze.className = 'tt-standard-preferences-note';
    freeze.innerHTML = '<strong>Device-only preferences.</strong> These options do not change permissions, Firebase, authentication, App Check, reCAPTCHA Enterprise, or database security.';
    host.appendChild(freeze);

    if (note) {
      note.textContent = 'Compact Workspace and Reduce Motion are saved on this device.';
      note.insertAdjacentElement('afterend', divider);
      divider.insertAdjacentElement('afterend', sound);
      sound.insertAdjacentElement('afterend', time);
      time.insertAdjacentElement('afterend', landing);
      landing.insertAdjacentElement('afterend', freeze);
    } else {
      section.appendChild(host);
    }

    const prefs = readPrefs();
    $('ttV116NotificationSound').checked = !!prefs.notificationSound;
    $('ttV116TimeFormat').value = prefs.timeFormat;
    $('ttV116Landing').value = prefs.landing;

    $('ttV116NotificationSound').addEventListener('change', event => {
      const enabled = !!event.currentTarget.checked;
      savePrefs({ notificationSound: enabled });
      updateSoundState();
      if (enabled) playNotificationChime(true);
    });
    $('ttV116TimeFormat').addEventListener('change', event => {
      savePrefs({ timeFormat: event.currentTarget.value === '24' ? '24' : '12' });
      applyTimePreference();
      syncOverview();
      renderActivity();
    });
    $('ttV116Landing').addEventListener('change', event => {
      savePrefs({ landing: ['status', 'history'].includes(event.currentTarget.value) ? event.currentTarget.value : 'dashboard' });
    });

    ['ttStdCompactToggle', 'ttStdMotionToggle'].forEach(id => {
      const el = $(id);
      if (!el || el.dataset.v116Bound === 'true') return;
      el.dataset.v116Bound = 'true';
      el.addEventListener('change', () => {
        savePrefs({
          compact: !!$('ttStdCompactToggle')?.checked,
          reducedMotion: !!$('ttStdMotionToggle')?.checked
        });
        applyExistingComfortPrefs();
      });
    });
    updateSoundState();
  }

  function updateSoundState() {
    const input = $('ttV116NotificationSound');
    if (!input) return;
    input.checked = !!readPrefs().notificationSound;
    const row = input.closest('.tt-standard-setting-row');
    let state = row && q('.tt-v116-setting-state', row);
    if (!state && row) {
      state = document.createElement('span');
      state.className = 'tt-v116-setting-state';
      input.insertAdjacentElement('beforebegin', state);
    }
    if (state) state.textContent = input.checked ? 'On' : 'Off';
  }

  function playNotificationChime(isTest = false) {
    if (!isTest && !readPrefs().notificationSound) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const gain = ctx.createGain();
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(660, ctx.currentTime);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.055, ctx.currentTime + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + 0.24);
      osc.addEventListener('ended', () => { try { ctx.close(); } catch (_) {} }, { once: true });
    } catch (_) {}
  }

  function badgeNumber() {
    const badge = $('notifBellBadge');
    if (!badge || !badge.classList.contains('show')) return 0;
    const raw = String(badge.textContent || '').trim();
    if (raw === '99+') return 99;
    const value = parseInt(raw, 10);
    return Number.isFinite(value) ? Math.max(0, value) : 0;
  }

  function syncNotificationBadge() {
    const count = badgeNumber();
    const quick = $('ttV116NotifCount');
    if (quick) {
      quick.textContent = count > 99 ? '99+' : String(count);
      quick.hidden = count <= 0;
    }
    if (!notificationReady) {
      notificationBaseline = count;
      return;
    }
    if (notificationBaseline !== null && count > notificationBaseline) {
      playNotificationChime(false);
      pushActivity(`${count - notificationBaseline} new notification${count - notificationBaseline === 1 ? '' : 's'} received`, 'active');
    }
    notificationBaseline = count;
  }

  function parse12Hour(value) {
    const match = /^(\d{1,2}):(\d{2})\s*([AP]M)$/i.exec(String(value || '').trim());
    if (!match) return null;
    let hour = Number(match[1]) % 12;
    const minute = Number(match[2]);
    if (match[3].toUpperCase() === 'PM') hour += 12;
    return hour * 60 + minute;
  }

  function minutesLabel(totalMinutes) {
    const mins = Math.max(0, Math.round(totalMinutes));
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (!h) return `${m}m`;
    if (!m) return `${h}h`;
    return `${h}h ${m}m`;
  }

  function formatShiftClock(value) {
    if (readPrefs().timeFormat !== '24') return String(value || '—');
    const minutes = parse12Hour(value);
    if (minutes === null) return String(value || '—');
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  }

  function parseShiftHeader() {
    const primary = String($('clockShiftPrimary')?.textContent || '').replace(/\s+/g, ' ').trim();
    const secondary = String($('clockShiftSecondary')?.textContent || '').replace(/\s+/g, ' ').trim();
    const regex = /^Shift:\s*(\d{1,2}:\d{2}\s*[AP]M)\s*[–-]\s*(\d{1,2}:\d{2}\s*[AP]M)(?:\s*·\s*(Early))?\s*·\s*(.+)$/i;
    const match = regex.exec(primary);
    if (!match) return { primary, secondary, start: '', end: '', pod: '', early: false, duration: null };
    const startM = parse12Hour(match[1]);
    const endM = parse12Hour(match[2]);
    let duration = null;
    if (startM !== null && endM !== null) {
      let adjustedEnd = endM;
      if (adjustedEnd <= startM) adjustedEnd += 1440;
      duration = adjustedEnd - startM;
    }
    return { primary, secondary, start: match[1], end: match[2], pod: match[4].trim(), early: !!match[3], duration };
  }

  function noShiftModel(shift) {
    const secondary = String(shift.secondary || '');
    if (!shift.start && /select an agent|select your name/i.test(shift.primary + ' ' + secondary)) {
      return { kind: 'unselected', title: 'Select an agent', detail: 'Your scheduled shift, POD, countdown, and worked hours will appear here.' };
    }
    if (/day off|scheduled off/i.test(secondary)) {
      return { kind: 'dayoff', title: 'No working shift today', detail: secondary || 'Today is a scheduled day off.' };
    }
    if (/sick leave|vacation leave|emergency leave|bereavement leave|personal leave|unpaid leave|\bleave\b/i.test(secondary)) {
      return { kind: 'leave', title: 'Leave is active today', detail: secondary };
    }
    return null;
  }

  function overviewStatus(shift) {
    const secondary = String(shift.secondary || '');
    if (/starts in/i.test(secondary)) return secondary.replace(/^.*?·\s*/, '');
    if (/currently working/i.test(secondary)) return 'In progress';
    if (/on break/i.test(secondary)) return 'On break';
    if (/shift completed/i.test(secondary)) return 'Completed';
    if (/not clocked in/i.test(secondary)) return 'Awaiting Time In';
    if (/waiting for verified server time/i.test(secondary)) return 'Verifying time';
    return secondary || 'Ready';
  }

  function ensureOverview() {
    const punch = $('punchCard');
    const main = $('mainContent');
    if (!punch || !main || $('ttV116Overview')) return;
    const section = document.createElement('section');
    section.id = 'ttV116Overview';
    section.className = 'tt-v116-overview';
    section.setAttribute('aria-label', 'Standard dashboard overview');
    section.innerHTML = `
      <div class="tt-v116-overview-head">
        <div class="tt-v116-overview-title"><span>Standard workspace</span><h2>Today at TrinoTime</h2></div>
        <time class="tt-v116-overview-date" id="ttV116OverviewDate"></time>
      </div>
      <div class="tt-v116-dashboard-grid">
        <article class="tt-v116-card tt-v116-today-card">
          <div class="tt-v116-card-head"><div><span class="tt-v116-card-kicker">Today</span><strong>Your shift at a glance</strong><small>Mirrors the existing attendance session; no separate attendance record is created.</small></div><span class="tt-v116-live-pill">Live</span></div>
          <div class="tt-v116-no-shift" id="ttV116NoShift" hidden><span class="tt-v116-no-shift-icon" aria-hidden="true">◷</span><div class="tt-v116-no-shift-copy"><strong id="ttV116NoShiftTitle">No shift today</strong><span id="ttV116NoShiftDetail"></span></div></div>
          <div class="tt-v116-shift-metrics" id="ttV116ShiftMetrics">
            <div class="tt-v116-shift-metric"><span>Shift window</span><strong id="ttV116ShiftWindow">Loading…</strong></div>
            <div class="tt-v116-shift-metric"><span>POD</span><strong id="ttV116Pod">—</strong></div>
            <div class="tt-v116-shift-metric"><span>Scheduled</span><strong id="ttV116ScheduledHours">—</strong></div>
            <div class="tt-v116-shift-metric" id="ttV116StateMetric"><span>Next / status</span><strong id="ttV116ShiftState">Loading…</strong></div>
            <div class="tt-v116-shift-metric"><span>Worked hours</span><strong id="ttV116WorkedHours">—</strong></div>
          </div>
        </article>
        <article class="tt-v116-card">
          <div class="tt-v116-card-head"><div><span class="tt-v116-card-kicker">Quick actions</span><strong>Common tools</strong><small>Basic Standard navigation stays available.</small></div></div>
          <div class="tt-v116-quick-grid">
            <button class="tt-v116-quick-btn" type="button" data-v116-action="schedule"><strong>My Schedule</strong><span>Day off &amp; schedule</span></button>
            <button class="tt-v116-quick-btn" type="button" data-v116-action="notifications"><strong>Notifications <b class="tt-v116-quick-count" id="ttV116NotifCount" hidden>0</b></strong><span>Admin &amp; TL notices</span></button>
            <button class="tt-v116-quick-btn" type="button" data-v116-action="roster"><strong>Team Roster</strong><span>Find your team</span></button>
            <button class="tt-v116-quick-btn" type="button" data-v116-action="support"><strong>Support Ticket</strong><span>Help &amp; guidance</span></button>
          </div>
        </article>
        <article class="tt-v116-card">
          <div class="tt-v116-card-head"><div><span class="tt-v116-card-kicker">Recent activity</span><strong>Session updates</strong><small>Device-local, current browser session only.</small></div></div>
          <div class="tt-v116-activity-list" id="ttV116ActivityList"></div>
        </article>
      </div>`;
    punch.insertAdjacentElement('beforebegin', section);
    syncOverview();
    renderActivity();
    syncNotificationBadge();
  }

  function setTextIfChanged(node, value) {
    if (!node) return;
    const next = String(value ?? '');
    if (node.textContent !== next) node.textContent = next;
  }

  function scheduleOverviewSync() {
    if (overviewSyncFrame) return;
    overviewSyncFrame = requestAnimationFrame(() => {
      overviewSyncFrame = 0;
      syncOverview();
    });
  }

  function syncOverview() {
    const overview = $('ttV116Overview');
    if (!overview) return;
    overview.hidden = isPremium();
    if (overview.hidden) return;

    const dateEl = $('ttV116OverviewDate');
    if (dateEl) {
      let dateLabel = 'Today · PHT';
      try { if (overviewDateFormatter) dateLabel = overviewDateFormatter.format(new Date()) + ' · PHT'; } catch (_) {}
      setTextIfChanged(dateEl, dateLabel);
    }

    const shift = parseShiftHeader();
    const noShift = noShiftModel(shift);
    const noShiftEl = $('ttV116NoShift');
    const metrics = $('ttV116ShiftMetrics');
    if (noShift) {
      if (noShiftEl) noShiftEl.hidden = false;
      if (metrics) metrics.hidden = true;
      setTextIfChanged($('ttV116NoShiftTitle'), noShift.title);
      setTextIfChanged($('ttV116NoShiftDetail'), noShift.detail);
      return;
    }
    if (noShiftEl) noShiftEl.hidden = true;
    if (metrics) metrics.hidden = false;

    const windowLabel = shift.start ? `${formatShiftClock(shift.start)}–${formatShiftClock(shift.end)}${shift.early ? ' · Early' : ''}` : (shift.primary || 'Loading…');
    setTextIfChanged($('ttV116ShiftWindow'), windowLabel);
    setTextIfChanged($('ttV116Pod'), shift.pod || '—');
    setTextIfChanged($('ttV116ScheduledHours'), shift.duration !== null ? minutesLabel(shift.duration) : '—');
    const state = overviewStatus(shift);
    setTextIfChanged($('ttV116ShiftState'), state);
    const worked = String($('liveHoursBigValue')?.textContent || $('liveHoursValue')?.textContent || '').trim();
    setTextIfChanged($('ttV116WorkedHours'), worked || '—');
    const stateMetric = $('ttV116StateMetric');
    if (stateMetric) stateMetric.dataset.tone = toneFor(state + ' ' + shift.secondary);
  }

  function handleQuickAction(action) {
    if (action === 'schedule') { $('openDayOffBtn')?.click(); return; }
    if (action === 'notifications') { $('notifBellBtn')?.click(); return; }
    if (action === 'roster') {
      const roster = $('rosterTabBtn');
      if (roster && getComputedStyle(roster).display !== 'none') {
        roster.click(); q('.log-section')?.scrollIntoView({ block:'start', behavior: readPrefs().reducedMotion ? 'auto' : 'smooth' });
      } else if (window.TrinoTimeHelp && typeof window.TrinoTimeHelp.open === 'function') {
        try { window.TrinoTimeHelp.open('roster'); } catch (_) {}
      } else {
        $('settingsGearBtn')?.click(); setTimeout(() => q('[data-settings-tab="tutorial"]')?.click(), 60);
      }
      return;
    }
    if (action === 'support') {
      $('settingsGearBtn')?.click();
      setTimeout(() => {
        q('[data-settings-tab="tutorial"]')?.click();
        setTimeout(() => q('#settingsPanelTutorial [data-help-item], #settingsPanelTutorial')?.scrollIntoView({ block:'start', behavior:'auto' }), 60);
      }, 60);
    }
  }

  function ensureLeaveFilters() {
    const list = $('leaveRecentList');
    if (!list) return;
    let filters = $('ttV116LeaveFilters');
    if (!filters) {
      filters = document.createElement('div');
      filters.id = 'ttV116LeaveFilters';
      filters.className = 'tt-v116-leave-filters';
      filters.setAttribute('role', 'group');
      filters.setAttribute('aria-label', 'Filter leave request history');
      const labels = [['all','All'],['upcoming','Upcoming'],['pending','Pending'],['approved','Approved'],['declined','Declined'],['past','Past']];
      filters.innerHTML = labels.map(([key,label]) => `<button class="tt-v116-leave-filter" type="button" data-v116-leave-filter="${key}" aria-pressed="${key === activeLeaveFilter ? 'true' : 'false'}">${label}<b data-v116-leave-count="${key}">0</b></button>`).join('');
      list.insertAdjacentElement('beforebegin', filters);
      filters.addEventListener('click', event => {
        const btn = event.target.closest('[data-v116-leave-filter]');
        if (!btn) return;
        activeLeaveFilter = btn.dataset.v116LeaveFilter || 'all';
        qa('[data-v116-leave-filter]', filters).forEach(item => item.setAttribute('aria-pressed', String(item === btn)));
        applyLeaveFilter();
      });
    }
    applyLeaveFilter();
  }

  function phtTodayMs() {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Manila', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date()).split('-').map(Number);
    return parts.length === 3 ? Date.UTC(parts[0], parts[1] - 1, parts[2]) : Date.now();
  }

  function leaveCardEndMs(card) {
    const text = String(q('.leave-request-card-title', card)?.textContent || card.textContent || '').replace(/\s+/g, ' ');
    const re = new RegExp(`(?:${MONTHS})\\s+\\d{1,2},\\s+\\d{4}`, 'g');
    const matches = text.match(re) || [];
    if (!matches.length) return NaN;
    const last = new Date(matches[matches.length - 1] + ' 00:00:00 UTC').getTime();
    return Number.isFinite(last) ? last : NaN;
  }

  function leaveCardCategory(card, todayMs) {
    const text = String(card.textContent || '').toLowerCase();
    const pending = card.classList.contains('pending') || /\bpending\b/.test(text);
    const approved = card.classList.contains('approved') || /\bapproved\b/.test(text);
    const declined = card.classList.contains('rejected') || /\brejected\b|\bdeclined\b|\bwithdrawn\b|\bcancelled\b|\bcanceled\b/.test(text);
    const endMs = leaveCardEndMs(card);
    const past = Number.isFinite(endMs) && endMs < todayMs;
    const upcoming = Number.isFinite(endMs) ? endMs >= todayMs && !declined : (!past && (pending || approved));
    return { pending, approved, declined, past, upcoming };
  }

  function applyLeaveFilter() {
    const list = $('leaveRecentList');
    if (!list) return;
    const cards = qa(':scope > .leave-request-card', list);
    const today = phtTodayMs();
    const counts = { all: cards.length, upcoming:0, pending:0, approved:0, declined:0, past:0 };
    let visible = 0;
    cards.forEach(card => {
      const category = leaveCardCategory(card, today);
      Object.keys(category).forEach(key => { if (category[key]) counts[key] += 1; });
      const show = activeLeaveFilter === 'all' || !!category[activeLeaveFilter];
      card.hidden = !show;
      if (show) visible += 1;
    });
    Object.entries(counts).forEach(([key,value]) => {
      const el = q(`[data-v116-leave-count="${key}"]`);
      if (el) el.textContent = String(value);
    });
    let empty = $('ttV116LeaveEmpty');
    if (!empty) {
      empty = document.createElement('div');
      empty.id = 'ttV116LeaveEmpty';
      empty.className = 'tt-v116-empty';
      empty.innerHTML = '<strong>No requests in this view</strong><span>Choose another filter to review your leave history.</span>';
      list.appendChild(empty);
    }
    const nativeEmpty = q(':scope > .leave-empty', list);
    if (nativeEmpty) nativeEmpty.hidden = cards.length > 0 || activeLeaveFilter !== 'all';
    empty.hidden = visible > 0 || (cards.length === 0 && activeLeaveFilter === 'all');
  }

  function applyTimePreference() {
    const prefs = readPrefs();
    document.documentElement.dataset.trinoTimeFormat = prefs.timeFormat;
    const select = $('ttV116TimeFormat');
    if (select) select.value = prefs.timeFormat;
    scheduleLiveClockSync();
  }

  function scheduleLiveClockSync() {
    if (liveClockSyncQueued) return;
    liveClockSyncQueued = true;
    queueMicrotask(() => {
      liveClockSyncQueued = false;
      syncLiveClockFormat();
    });
  }

  function syncLiveClockFormat() {
    if (readPrefs().timeFormat !== '24') return;
    const hourEl = $('clockHour');
    const periodEl = $('clockPeriod');
    if (!hourEl || !periodEl) return;
    const raw = String(hourEl.textContent || '').trim();
    const period = String(periodEl.textContent || '').trim().toUpperCase();
    let hour = parseInt(raw, 10);
    if (!Number.isFinite(hour) || hour > 12 || !/^(AM|PM)$/.test(period)) return;
    if (period === 'AM') hour = hour === 12 ? 0 : hour;
    else if (hour !== 12) hour += 12;
    const next = String(hour).padStart(2, '0');
    if (hourEl.textContent !== next) hourEl.textContent = next;
  }

  function applyLandingPreference() {
    if (landingApplied || isPremium()) return;
    const role = String(document.body?.dataset?.trinoRole || '');
    if (!role || role === 'gate') return;
    landingApplied = true;
    const landing = readPrefs().landing;
    setTimeout(() => {
      if (landing === 'dashboard') {
        const target = $('ttV116Overview') || $('mainContent');
        target?.scrollIntoView({ block:'start', behavior:'auto' });
        return;
      }
      const tab = q(`#logTabs .log-tab[data-tab="${landing}"]`);
      if (tab && getComputedStyle(tab).display !== 'none') tab.click();
      q('.log-section')?.scrollIntoView({ block:'start', behavior:'auto' });
    }, 250);
  }

  function observeValue(id, labeler) {
    const el = $(id);
    if (!el) return;
    const sync = () => {
      const value = String(el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!value) return;
      const previous = observedValues.get(id);
      observedValues.set(id, value);
      if (previous === undefined || previous === value) return;
      const model = labeler(value, previous);
      if (model && model.label) pushActivity(model.label, model.tone || toneFor(value));
    };
    observedValues.set(id, String(el.textContent || '').replace(/\s+/g, ' ').trim());
    new MutationObserver(() => { sync(); scheduleOverviewSync(); }).observe(el, { childList:true, subtree:true, characterData:true });
  }

  function wireObservers() {
    ['clockShiftPrimary','clockShiftSecondary','liveHoursBigValue','liveHoursValue','agentQuickStatus'].forEach(id => {
      const el = $(id);
      if (el) new MutationObserver(scheduleOverviewSync).observe(el, { childList:true, subtree:true, characterData:true });
    });

    const badge = $('notifBellBadge');
    if (badge) new MutationObserver(syncNotificationBadge).observe(badge, { childList:true, subtree:true, characterData:true, attributes:true, attributeFilter:['class'] });

    observeValue('statusText', value => ({ label: `Attendance: ${value}`, tone: toneFor(value) }));
    observeValue('timeSyncText', value => ({ label: `Sync: ${value}`, tone: toneFor(value) }));
    observeValue('punchSaveState', value => ({ label: value, tone: toneFor(value) }));

    const leave = $('leaveRecentList');
    if (leave) new MutationObserver(() => setTimeout(() => { ensureLeaveFilters(); applyLeaveFilter(); }, 0)).observe(leave, { childList:true, subtree:true });

    const roleObserver = new MutationObserver(() => {
      if (String(document.body?.dataset?.trinoRole || '') === 'gate') landingApplied = false;
      else applyLandingPreference();
    });
    roleObserver.observe(document.body, { attributes:true, attributeFilter:['data-trino-role'] });

    new MutationObserver(() => {
      ensureSystemThemeButton();
      const system = $('themeSystemBtn');
      if (system) system.hidden = isPremium();
      const prefs = $('ttStandardPreferences');
      if (prefs) prefs.hidden = isPremium();
      const overview = $('ttV116Overview');
      if (overview) overview.hidden = isPremium();
    }).observe(document.documentElement, { attributes:true, attributeFilter:['data-trino-tier','data-trino-custom-workspace'] });

    const clock = $('liveClock');
    if (clock) new MutationObserver(scheduleLiveClockSync).observe(clock, { childList:true, subtree:true, characterData:true });
  }

  function wireUi() {
    document.addEventListener('click', event => {
      const quick = event.target.closest('[data-v116-action]');
      if (quick) handleQuickAction(quick.dataset.v116Action);
      if (event.target.closest('#settingsGearBtn')) setTimeout(() => { ensureSystemThemeButton(); ensureWorkflowPreferences(); applyUiPreferences(); }, 60);
      if (event.target.closest('#leaveRequestFloater, [aria-controls="leaveRequestOverlay"]')) setTimeout(() => { ensureLeaveFilters(); applyLeaveFilter(); }, 80);
    }, true);
  }

  function stampVersion() {
    qa('[data-trinotime-version-display]').forEach(el => { el.textContent = VERSION; });
    const build = $('gateReadinessBuildValue');
    if (build) build.textContent = `v${VERSION}`;
    document.documentElement.dataset.trinoUiRelease = VERSION;
  }

  function applyUiPreferences() {
    const prefs = readPrefs();
    applyExistingComfortPrefs(prefs);
    ensureSystemThemeButton();
    applyThemePreference(prefs.theme);
    applyTimePreference();
    if ($('ttV116NotificationSound')) $('ttV116NotificationSound').checked = !!prefs.notificationSound;
    if ($('ttV116Landing')) $('ttV116Landing').value = prefs.landing;
    updateSoundState();
  }

  function init() {
    stampVersion();
    ensureSystemThemeButton();
    ensureWorkflowPreferences();
    ensureOverview();
    ensureLeaveFilters();
    applyUiPreferences();
    wireUi();
    wireObservers();
    syncOverview();
    renderActivity();
    syncNotificationBadge();
    setTimeout(() => { notificationReady = true; notificationBaseline = badgeNumber(); }, 1600);
    setTimeout(() => { ensureLeaveFilters(); applyLeaveFilter(); applyLandingPreference(); scheduleOverviewSync(); }, 500);
    setInterval(() => { if (document.visibilityState !== 'hidden' && !document.documentElement.classList.contains('tt-is-scrolling')) scheduleOverviewSync(); scheduleLiveClockSync(); }, 5000);

    if (window.matchMedia) {
      systemThemeMedia = window.matchMedia('(prefers-color-scheme: dark)');
      systemThemeMedia.addEventListener?.('change', () => { if (readPrefs().theme === 'system') applyThemePreference('system'); });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
