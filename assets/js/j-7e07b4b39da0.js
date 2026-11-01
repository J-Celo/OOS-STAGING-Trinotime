(() => {
  'use strict';

  // TrinoTime v1.1.5 UI/UX layer only.
  // Deliberately does not initialize, configure, or call Firebase/App Check/Auth.
  const VERSION = '1.1.5';
  const PREF_KEY = 'trinotime-standard-ui-prefs-v115';
  let openingUnreadCount = 0;

  const $ = (id) => document.getElementById(id);
  const q = (selector, root = document) => root.querySelector(selector);
  const qa = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function isPremium() {
    const html = document.documentElement;
    return html.dataset.trinoTier === 'premium' || html.getAttribute('data-trino-custom-workspace') === 'enabled';
  }

  function readPrefs() {
    try {
      const parsed = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
      return {
        compact: !!parsed.compact,
        reducedMotion: !!parsed.reducedMotion
      };
    } catch (_) {
      return { compact: false, reducedMotion: false };
    }
  }

  function savePrefs(prefs) {
    try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (_) {}
  }

  function applyPrefs(prefs = readPrefs()) {
    document.body.classList.toggle('tt-standard-compact', !!prefs.compact);
    document.body.classList.toggle('tt-user-reduced-motion', !!prefs.reducedMotion);
    const compact = $('ttStdCompactToggle');
    const motion = $('ttStdMotionToggle');
    if (compact) compact.checked = !!prefs.compact;
    if (motion) motion.checked = !!prefs.reducedMotion;
  }

  function ensureTierBadge() {
    const rail = q('.action-rail');
    if (!rail) return;
    let badge = $('ttStandardTierBadge');
    if (!badge) {
      badge = document.createElement('span');
      badge.id = 'ttStandardTierBadge';
      badge.className = 'tt-standard-tier-badge';
      badge.setAttribute('role', 'status');
      badge.innerHTML = '<span class="tt-standard-tier-dot" aria-hidden="true"></span><span>Standard</span>';
      const divider = q('.action-rail-divider', rail);
      if (divider) rail.insertBefore(badge, divider);
      else rail.prepend(badge);
    }
    badge.hidden = isPremium();
    badge.setAttribute('aria-label', 'Standard workspace');
  }

  function safeText(el, fallback = '—') {
    const text = (el && el.textContent ? el.textContent : '').replace(/\s+/g, ' ').trim();
    return text || fallback;
  }

  function shiftText() {
    const primary = safeText($('clockShiftPrimary'), '');
    if (primary && !/^select an agent/i.test(primary) && !/^loading/i.test(primary)) return primary;
    const select = $('todayShiftSelect');
    if (select && select.offsetParent !== null && select.selectedIndex >= 0) {
      const selected = safeText(select.options[select.selectedIndex], '');
      if (selected) return selected;
    }
    return primary || 'No shift selected';
  }

  function attendanceText() {
    const status = safeText($('statusText'), '');
    if (status && !/^select your name/i.test(status)) return status;
    const quick = safeText($('agentQuickStatus'), '');
    return quick || status || 'Ready';
  }

  function hoursText() {
    const big = safeText($('liveHoursBigValue'), '');
    const small = safeText($('liveHoursValue'), '');
    return big || small || '—';
  }

  function toneFor(text) {
    const value = String(text || '').toLowerCase();
    if (/break/.test(value)) return 'break';
    if (/complete|time out|clocked out|done/.test(value)) return 'complete';
    if (/working|clocked in|in progress|time in/.test(value)) return 'active';
    if (/late|issue|warning|error|offline|unavailable/.test(value)) return 'warning';
    return 'neutral';
  }

  function ensureTodayRibbon() {
    const punch = $('punchCard');
    if (!punch) return;
    let ribbon = $('ttStandardTodayRibbon');
    if (!ribbon) {
      ribbon = document.createElement('section');
      ribbon.id = 'ttStandardTodayRibbon';
      ribbon.className = 'tt-standard-today-ribbon';
      ribbon.setAttribute('aria-label', 'Today summary');
      ribbon.innerHTML = `
        <div class="tt-standard-today-heading">
          <div><span>Today</span><strong>Shift snapshot</strong></div>
          <small>Live from your current session</small>
        </div>
        <div class="tt-standard-today-grid">
          <article class="tt-standard-today-metric" data-metric="shift"><span>Today's shift</span><strong id="ttStdShiftValue">Loading…</strong></article>
          <article class="tt-standard-today-metric" data-metric="status"><span>Attendance</span><strong id="ttStdStatusValue">Loading…</strong></article>
          <article class="tt-standard-today-metric" data-metric="hours"><span>Worked hours</span><strong id="ttStdHoursValue">—</strong></article>
        </div>`;
      punch.insertBefore(ribbon, punch.firstChild);
    }
    ribbon.hidden = isPremium();
    syncTodayRibbon();
  }

  function syncTodayRibbon() {
    const ribbon = $('ttStandardTodayRibbon');
    if (!ribbon) return;
    ribbon.hidden = isPremium();
    if (ribbon.hidden) return;
    const shift = shiftText();
    const status = attendanceText();
    const hours = hoursText();
    const shiftEl = $('ttStdShiftValue');
    const statusEl = $('ttStdStatusValue');
    const hoursEl = $('ttStdHoursValue');
    if (shiftEl) shiftEl.textContent = shift;
    if (statusEl) statusEl.textContent = status;
    if (hoursEl) hoursEl.textContent = hours;
    const statusCard = q('[data-metric="status"]', ribbon);
    if (statusCard) statusCard.dataset.tone = toneFor(status);
  }

  function ensureSettingsPreferences() {
    const panel = $('settingsPanelAppearance');
    if (!panel || $('ttStandardPreferences')) return;
    const section = document.createElement('section');
    section.id = 'ttStandardPreferences';
    section.className = 'tt-standard-preferences';
    section.innerHTML = `
      <div class="tt-standard-preferences-head">
        <div><span class="tt-standard-preferences-eyebrow">Standard preferences</span><strong>Comfort &amp; layout</strong></div>
        <span class="tt-standard-preferences-chip">Basic</span>
      </div>
      <label class="tt-standard-setting-row" for="ttStdCompactToggle">
        <span><strong>Compact workspace</strong><small>Tightens spacing on smaller laptops without hiding controls.</small></span>
        <input id="ttStdCompactToggle" type="checkbox" role="switch" aria-label="Use compact workspace spacing">
      </label>
      <label class="tt-standard-setting-row" for="ttStdMotionToggle">
        <span><strong>Reduce decorative motion</strong><small>Minimizes non-essential animation while keeping status updates active.</small></span>
        <input id="ttStdMotionToggle" type="checkbox" role="switch" aria-label="Reduce decorative motion">
      </label>
      <p class="tt-standard-preferences-note">Saved only on this device. These options do not change account permissions, Firebase, authentication, or App Check.</p>`;
    const hint = q('.settings-hint', panel);
    if (hint) hint.insertAdjacentElement('afterend', section);
    else panel.appendChild(section);

    const prefs = readPrefs();
    applyPrefs(prefs);
    $('ttStdCompactToggle')?.addEventListener('change', (event) => {
      const next = readPrefs();
      next.compact = !!event.currentTarget.checked;
      savePrefs(next);
      applyPrefs(next);
    });
    $('ttStdMotionToggle')?.addEventListener('change', (event) => {
      const next = readPrefs();
      next.reducedMotion = !!event.currentTarget.checked;
      savePrefs(next);
      applyPrefs(next);
    });
  }

  function badgeNumber() {
    const badge = $('notifBellBadge');
    if (!badge || !badge.classList.contains('show')) return 0;
    const raw = String(badge.textContent || '').trim();
    if (raw === '99+') return 99;
    const value = parseInt(raw, 10);
    return Number.isFinite(value) ? Math.max(0, value) : 0;
  }

  function ensureNotificationToolbar() {
    const panel = $('notificationPanelNotifications');
    if (!panel || $('ttNotificationToolbar')) return;
    const toolbar = document.createElement('div');
    toolbar.id = 'ttNotificationToolbar';
    toolbar.className = 'tt-notification-toolbar';
    toolbar.innerHTML = `
      <div class="tt-notification-toolbar-copy"><strong id="ttNotificationSummary">You're all caught up</strong><span>Opening the center marks visible notices as read on this device.</span></div>
      <button id="ttNotificationMarkRead" type="button">Mark all read</button>`;
    panel.insertBefore(toolbar, panel.firstChild);
    $('ttNotificationMarkRead')?.addEventListener('click', () => {
      openingUnreadCount = 0;
      qa('#announceList .announce-item.is-unread').forEach(item => item.classList.remove('is-unread'));
      if (window.TrinoTimeNotificationCenter && typeof window.TrinoTimeNotificationCenter.open === 'function') {
        try { void window.TrinoTimeNotificationCenter.open('notifications'); } catch (_) {}
      }
      setTimeout(() => {
        syncNotificationSummary();
        decorateNotificationItems(0);
      }, 80);
    });
  }

  function decorateNotificationItems(unreadCount = openingUnreadCount) {
    const items = qa('#announceList .announce-item');
    items.forEach((item, index) => {
      item.classList.toggle('is-unread', index < unreadCount);
      let pill = q('.tt-notification-new-pill', item);
      if (index < unreadCount) {
        if (!pill) {
          pill = document.createElement('span');
          pill.className = 'tt-notification-new-pill';
          pill.textContent = 'New';
          const head = q('.announce-item-head', item);
          if (head) head.appendChild(pill);
        }
      } else if (pill) {
        pill.remove();
      }
    });
    const empty = q('#announceList .announce-empty');
    if (empty && !empty.dataset.v115Polished && /no announcements|no notifications/i.test(empty.textContent || '')) {
      empty.dataset.v115Polished = '1';
      empty.innerHTML = '<strong>You\'re all caught up.</strong><span>No notifications yet. New Admin or Team Leader notices will appear here.</span>';
    }
    syncNotificationSummary();
  }

  function syncNotificationSummary() {
    const summary = $('ttNotificationSummary');
    const button = $('ttNotificationMarkRead');
    if (!summary || !button) return;
    const current = badgeNumber();
    const unread = Math.max(current, openingUnreadCount);
    summary.textContent = unread > 0 ? `${unread} unread notification${unread === 1 ? '' : 's'}` : "You're all caught up";
    button.disabled = unread === 0;
  }

  function polishLeaveUi() {
    const tabs = q('.leave-v2-tabs');
    if (tabs && !tabs.dataset.v115Polished) {
      tabs.dataset.v115Polished = '1';
      const history = q('[data-leave-filter="history"]', tabs);
      if (history) history.textContent = 'Closed';
      const legend = document.createElement('div');
      legend.className = 'tt-leave-status-legend';
      legend.innerHTML = '<span><i data-tone="pending"></i>Pending</span><span><i data-tone="approved"></i>Approved</span><span><i data-tone="closed"></i>Rejected / withdrawn / cancelled</span>';
      tabs.insertAdjacentElement('afterend', legend);
    }
    const title = $('dayOffTitle');
    if (title && !title.dataset.v115Polished) {
      title.dataset.v115Polished = '1';
      title.textContent = 'My Schedule · Day Off';
    }
  }

  function enforceStandardBasics() {
    if (isPremium()) return;
    ['notifBellBtn', 'settingsGearBtn', 'openDayOffBtn'].forEach((id) => {
      const el = $(id);
      if (!el) return;
      el.removeAttribute('aria-hidden');
    });
  }

  function syncTier() {
    ensureTierBadge();
    ensureTodayRibbon();
    enforceStandardBasics();
    const prefs = $('ttStandardPreferences');
    if (prefs) prefs.hidden = isPremium();
  }

  function observeLiveUi() {
    const syncTargets = ['clockShiftPrimary', 'clockShiftSecondary', 'statusText', 'agentQuickStatus', 'liveHoursValue', 'liveHoursBigValue', 'todayShiftSelect'];
    const observer = new MutationObserver(() => syncTodayRibbon());
    syncTargets.forEach((id) => {
      const el = $(id);
      if (el) observer.observe(el, { childList: true, subtree: true, characterData: true, attributes: true });
    });
    $('todayShiftSelect')?.addEventListener('change', syncTodayRibbon);

    const announcementList = $('announceList');
    if (announcementList) {
      new MutationObserver(() => setTimeout(() => decorateNotificationItems(openingUnreadCount), 0))
        .observe(announcementList, { childList: true, subtree: true, characterData: true });
    }

    new MutationObserver(() => syncTier()).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-trino-tier', 'data-trino-custom-workspace']
    });

    const leaveOverlay = $('leaveRequestOverlay');
    if (leaveOverlay) new MutationObserver(() => polishLeaveUi()).observe(leaveOverlay, { childList: true, subtree: true });
  }

  function wireNotificationCapture() {
    document.addEventListener('click', (event) => {
      if (event.target.closest('#notifBellBtn')) {
        openingUnreadCount = badgeNumber();
        setTimeout(() => {
          ensureNotificationToolbar();
          decorateNotificationItems(openingUnreadCount);
        }, 80);
      }
      if (event.target.closest('#announceCloseBtn')) {
        openingUnreadCount = 0;
      }
      if (event.target.closest('[data-notification-center-tab="notifications"]')) {
        setTimeout(() => decorateNotificationItems(openingUnreadCount), 40);
      }
    }, true);
  }

  function stampVersion() {
    qa('[data-trinotime-version-display]').forEach((el) => { el.textContent = VERSION; });
    const gate = $('gateReadinessBuildValue');
    if (gate) gate.textContent = `v${VERSION}`;
  }

  function init() {
    document.documentElement.dataset.trinoUiRelease = VERSION;
    stampVersion();
    ensureTierBadge();
    ensureTodayRibbon();
    ensureSettingsPreferences();
    ensureNotificationToolbar();
    polishLeaveUi();
    applyPrefs();
    syncTier();
    syncNotificationSummary();
    wireNotificationCapture();
    observeLiveUi();
    setTimeout(() => { polishLeaveUi(); syncTodayRibbon(); syncTier(); }, 500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
