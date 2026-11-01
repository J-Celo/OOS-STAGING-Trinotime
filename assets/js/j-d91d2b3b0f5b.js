(() => {
  'use strict';

  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = value => String(value == null ? '' : value).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const setText = (node, value) => {
    if (!node) return;
    const next = String(value == null ? '' : value);
    if (node.textContent !== next) node.textContent = next;
  };
  const icon = (name, cls = '') => {
    const paths = {
      crown:'<path d="M3 7l4 4 5-7 5 7 4-4-2 10H5L3 7Z"></path><path d="M6 20h12"></path>',
      grid:'<rect x="3" y="3" width="7" height="7" rx="1"></rect><rect x="14" y="3" width="7" height="7" rx="1"></rect><rect x="3" y="14" width="7" height="7" rx="1"></rect><rect x="14" y="14" width="7" height="7" rx="1"></rect>',
      clock:'<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path>',
      calendar:'<rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M16 3v4M8 3v4M3 10h18"></path>',
      layers:'<rect x="3" y="3" width="18" height="18" rx="3"></rect><path d="M3 9h18M9 3v18"></path>',
      users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"></path>',
      bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path>',
      chart:'<rect x="3" y="3" width="18" height="18" rx="2"></rect><path d="M8 17v-5M12 17V7M16 17v-8"></path>',
      star:'<path d="M12 3l2.2 4.5 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5-3.6-3.5 5-.7L12 3Z"></path>',
      gear:'<circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1h.1a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"></path>',
      help:'<circle cx="12" cy="12" r="9"></circle><path d="M9.6 9a2.6 2.6 0 1 1 4.5 1.8c-1.3 1.1-2.1 1.6-2.1 3.2M12 18h.01"></path>',
      chevron:'<path d="m9 18 6-6-6-6"></path>',
      sun:'<circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path>',
      moon:'<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z"></path>',
      list:'<path d="M8 6h13M8 12h13M8 18h13"></path><path d="M3 6h.01M3 12h.01M3 18h.01"></path>',
      megaphone:'<path d="M3 11v2a2 2 0 0 0 2 2h2l4 4V5L7 9H5a2 2 0 0 0-2 2Z"></path><path d="M15 8a4 4 0 0 1 0 8M18 5a8 8 0 0 1 0 14"></path>',
      bolt:'<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"></path>',
      speed:'<path d="M4.9 19.1a10 10 0 1 1 14.2 0"></path><path d="M12 12l4-4"></path><circle cx="12" cy="12" r="2"></circle>',
      plane:'<path d="m22 2-7 20-4-9-9-4 20-7Z"></path><path d="M22 2 11 13"></path>',
      profile:'<rect x="4" y="3" width="16" height="18" rx="2"></rect><circle cx="12" cy="9" r="3"></circle><path d="M8 17a4 4 0 0 1 8 0"></path>',
      pin:'<path d="m15 4 5 5-4 1-4 4-1 5-2-2-4 4-1-1 4-4-2-2 5-1 4-4 1-5Z"></path>',
      collapse:'<path d="m14 18-6-6 6-6"></path>'
    };
    return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.grid}</svg>`;
  };

  const premiumEnabled = () => document.documentElement.getAttribute('data-trino-custom-workspace') === 'enabled';
  const currentRole = () => document.body.getAttribute('data-trino-role') || '';
  const currentPod = () => {
    const active = qs('.pod-tab.active');
    if (active && active.textContent.trim()) return active.textContent.trim();
    const primary = qs('#clockShiftPrimary')?.textContent || '';
    const match = primary.match(/\b(POD\s*\d+|ONBOARDING|TESCO|KROGER)\b/i);
    return match ? match[1].toUpperCase().replace(/\s+/g, ' ') : 'POD 2';
  };
  const workspaceLabel = () => (qs('#brandTeamEyebrow')?.textContent || 'OOS · Chemist Warehouse').trim();

  function buildSidebar() {
    if (qs('#ttPremiumSidebar')) return;
    const root = qs('#appRoot');
    if (!root) return;
    const sidebar = document.createElement('aside');
    sidebar.id = 'ttPremiumSidebar';
    sidebar.setAttribute('aria-label', 'Premium workspace navigation');
    sidebar.innerHTML = `
      <div class="tt-premium-badge">${icon('crown')}<span>Premium Workspace</span></div>
      <div class="tt-premium-brand" aria-label="TrinoTime"><span class="tt-brand-trino">Trino</span><span class="tt-brand-time">Time</span></div>
      <div class="tt-premium-mini-brand" aria-hidden="true"><span>Trino</span><strong>Time</strong></div>
      <div class="tt-workspace-chip"><span class="tt-workspace-dot" aria-hidden="true"></span><div class="tt-workspace-copy"><strong id="ttSidebarWorkspace">${esc(workspaceLabel())}</strong><span>Customized Premium</span></div></div>
      <nav class="tt-premium-nav">
        <button class="tt-premium-nav-btn is-active" type="button" data-tt-nav="dashboard" data-tt-tooltip="Dashboard" aria-label="Dashboard">${icon('grid')}<span class="tt-nav-label">Dashboard</span></button>
        <button class="tt-premium-nav-btn" type="button" data-tt-nav="attendance" data-tt-tooltip="My Attendance" aria-label="My Attendance">${icon('clock')}<span class="tt-nav-label">My Attendance</span></button>
        <button class="tt-premium-nav-btn" type="button" data-tt-nav="schedule" data-tt-tooltip="My Schedule" aria-label="My Schedule">${icon('calendar')}<span class="tt-nav-label">My Schedule</span></button>
        <button class="tt-premium-nav-btn" type="button" data-tt-nav="pod" data-tt-tooltip="POD Management" aria-label="POD Management">${icon('layers')}<span class="tt-nav-label">POD Management</span>${icon('chevron','tt-nav-chevron')}</button>
        <button class="tt-premium-nav-btn" type="button" data-tt-nav="workforce" data-tt-tooltip="Workforce" aria-label="Workforce">${icon('users')}<span class="tt-nav-label">Workforce</span>${icon('chevron','tt-nav-chevron')}</button>
        <button class="tt-premium-nav-btn" type="button" data-tt-nav="notifications" data-tt-tooltip="Notifications" aria-label="Notifications">${icon('bell')}<span class="tt-nav-label">Notifications</span><span class="tt-nav-count" id="ttSidebarNotifCount">0</span></button>
        <button class="tt-premium-nav-btn" type="button" data-tt-nav="reports" data-tt-tooltip="Reports" aria-label="Reports">${icon('chart')}<span class="tt-nav-label">Reports</span>${icon('chevron','tt-nav-chevron')}</button>
        <button class="tt-premium-nav-btn" type="button" data-tt-nav="premium" data-tt-tooltip="Premium" aria-label="Premium">${icon('star')}<span class="tt-nav-label">Premium</span>${icon('chevron','tt-nav-chevron')}</button>
        <button class="tt-premium-nav-btn" type="button" data-tt-nav="system" data-tt-tooltip="System" aria-label="System">${icon('gear')}<span class="tt-nav-label">System</span>${icon('chevron','tt-nav-chevron')}</button>
        <button class="tt-premium-nav-btn" type="button" data-tt-nav="support" data-tt-tooltip="Support" aria-label="Support">${icon('help')}<span class="tt-nav-label">Support</span></button>
      </nav>
      <div class="tt-sidebar-spacer"></div>
      <div class="tt-server-card" data-tt-tooltip="Server Status"><strong>Server Status</strong><span id="ttSidebarServerState">Checking secure sync…</span><small id="ttSidebarServerChecked">Waiting for verified time</small></div>
      <button class="tt-theme-switch" id="ttPremiumThemeSwitch" type="button" data-tt-tooltip="Theme" aria-label="Switch workspace theme">${icon('sun','tt-theme-icon')}<span id="ttPremiumThemeLabel">Light Mode</span>${icon('chevron','tt-nav-chevron')}</button>
    `;
    root.insertBefore(sidebar, root.firstChild);

    const toggle = document.createElement('button');
    toggle.id = 'ttPremiumSidebarToggle';
    toggle.type = 'button';
    toggle.setAttribute('aria-label', 'Use compact navigation');
    toggle.setAttribute('aria-pressed', 'false');
    toggle.setAttribute('title', 'Use compact navigation');
    toggle.innerHTML = icon('collapse');
    root.appendChild(toggle);
  }

  function buildRightRail() {
    if (qs('#ttPremiumRightRail')) return;
    const root = qs('#appRoot');
    if (!root) return;
    const rail = document.createElement('aside');
    rail.id = 'ttPremiumRightRail';
    rail.setAttribute('aria-label', 'Premium dashboard quick information');
    rail.innerHTML = `
      <section class="tt-right-card">
        <div class="tt-right-card-head">${icon('megaphone')}<strong>Announcements</strong><button type="button" data-tt-action="notifications">View all</button></div>
        <div class="tt-announcement-preview" id="ttAnnouncementPreview">
          <span class="tt-announcement-avatar" aria-hidden="true">${icon('profile')}</span>
          <strong class="tt-announcement-title">Welcome to TrinoTime</strong>
          <small class="tt-announcement-time">Latest</small>
          <span class="tt-announcement-meta">System Administrator</span>
          <p class="tt-announcement-msg">Your latest workspace announcements will appear here.</p>
          <span class="tt-announcement-pin" aria-hidden="true">${icon('pin')}</span>
        </div>
      </section>
      <section class="tt-right-card tt-upcoming-card">
        <div class="tt-right-card-head">${icon('calendar')}<strong>Upcoming Shift</strong><span class="tt-upcoming-date" id="ttUpcomingDate">Today</span></div>
        <div class="tt-upcoming">
          <div class="tt-upcoming-summary">
            <div class="tt-upcoming-copy"><strong id="ttUpcomingShift">Pod schedule — loading</strong><span id="ttUpcomingScope">Today · ${esc(currentPod())}</span></div>
            <span class="tt-upcoming-status" id="ttUpcomingStatus">Scheduled</span>
          </div>
          <div class="tt-upcoming-body">
            <div class="tt-upcoming-countdown-block">
              <span class="tt-upcoming-kicker" id="ttUpcomingKicker">Starts in</span>
              <span class="tt-upcoming-countdown" id="ttUpcomingCountdown">-- : -- : --<small>HRS &nbsp; MIN &nbsp; SEC</small></span>
              <span class="tt-upcoming-duration" id="ttUpcomingDuration">Shift length —</span>
            </div>
            <div class="tt-upcoming-ring" id="ttUpcomingRing" style="--tt-shift-progress:0%" aria-label="Shift progress 0 percent">
              <div class="tt-upcoming-ring-inner"><strong id="ttUpcomingProgressValue">0%</strong><span id="ttUpcomingProgressLabel">Shift</span></div>
            </div>
          </div>
          <div class="tt-upcoming-progress" aria-hidden="true"><span id="ttUpcomingProgressBar"></span></div>
          <div class="tt-premium-empty tt-premium-empty-upcoming" id="ttUpcomingEmpty" hidden>
            <span class="tt-premium-empty-icon" aria-hidden="true">${icon('calendar')}</span>
            <strong>No upcoming shift</strong>
            <span>Your next scheduled shift will appear here once it is available.</span>
          </div>
        </div>
      </section>
      <section class="tt-right-card">
        <div class="tt-right-card-head">${icon('bolt')}<strong>Quick Actions</strong></div>
        <div class="tt-quick-grid">
          <button class="tt-quick-btn" type="button" data-tt-action="attendance">${icon('profile')}<span>My Attendance</span></button>
          <button class="tt-quick-btn" type="button" data-tt-action="workforce">${icon('users')}<span>Team Roster</span></button>
          <button class="tt-quick-btn" type="button" data-tt-action="speedtest">${icon('speed')}<span>Speedtest</span></button>
          <button class="tt-quick-btn" type="button" data-tt-action="support">${icon('help')}<span>Support Ticket</span></button>
        </div>
      </section>
    `;
    root.appendChild(rail);
  }

  function placeRightRail() {
    const rail = qs('#ttPremiumRightRail');
    const root = qs('#appRoot');
    if (!rail || !root) return;
    if (innerWidth <= 1280) {
      const recent = qs('#ttPremiumRecentActivity');
      if (recent && rail.previousElementSibling !== recent) recent.insertAdjacentElement('afterend', rail);
    } else if (rail.parentElement !== root) {
      root.appendChild(rail);
    }
  }

  function buildMainPreview() {
    const main = qs('#mainContent');
    const punch = qs('#punchCard');
    if (!main || !punch) return;
    let heading = qs('#ttPremiumPodHeading');
    if (!heading) {
      heading = document.createElement('h2');
      heading.id = 'ttPremiumPodHeading';
      heading.textContent = currentPod();
    }
    if (heading.parentElement !== punch) punch.insertBefore(heading, punch.firstChild);
    if (!qs('#ttPremiumRecentActivity')) {
      const card = document.createElement('section');
      card.id = 'ttPremiumRecentActivity';
      card.setAttribute('aria-label', 'Recent activity preview');
      card.innerHTML = `
        <div class="tt-recent-head">${icon('list')}<strong>Recent Activity</strong><button type="button" data-tt-action="attendance">View all</button></div>
        <div id="ttRecentBody"></div>
      `;
      punch.insertAdjacentElement('afterend', card);
    }
  }

  function buildHeroProgress() {
    const clock = qs('.clock-box');
    const sync = qs('#timeSyncStatus');
    if (!clock || !sync) return;

    if (!qs('#ttHeroShiftProgress')) {
      const progress = document.createElement('div');
      progress.id = 'ttHeroShiftProgress';
      progress.className = 'tt-hero-progress';
      progress.setAttribute('role', 'group');
      progress.setAttribute('aria-label', 'Current shift progress');
      progress.innerHTML = `
        <div class="tt-hero-progress-caption">
          <span class="tt-hero-progress-state"><i aria-hidden="true"></i><strong id="ttHeroProgressState">Before Shift</strong></span>
          <span class="tt-hero-progress-hint" id="ttHeroProgressHint">Time In is next</span>
        </div>
        <div class="tt-hero-progress-track" aria-hidden="true">
          <span class="tt-hero-progress-fill" id="ttHeroProgressFill"></span>
          <span class="tt-hero-progress-dot" data-tt-stage="before"></span>
          <span class="tt-hero-progress-dot" data-tt-stage="working"></span>
          <span class="tt-hero-progress-dot" data-tt-stage="break"></span>
          <span class="tt-hero-progress-dot" data-tt-stage="complete"></span>
        </div>
        <div class="tt-hero-progress-labels">
          <span data-tt-stage-label="before">Before Shift</span>
          <span data-tt-stage-label="working">Working</span>
          <span data-tt-stage-label="break">Break</span>
          <span data-tt-stage-label="complete">Completed</span>
        </div>
      `;
      sync.insertAdjacentElement('beforebegin', progress);
    }

    if (!qs('#ttHeroSyncVerified', sync)) {
      const detail = document.createElement('span');
      detail.id = 'ttHeroSyncVerified';
      detail.className = 'tt-sync-verified';
      detail.textContent = 'Verification pending';
      sync.appendChild(detail);
    }

    if (!qs('#ttHeroSyncHelp', sync)) {
      const help = document.createElement('span');
      help.id = 'ttHeroSyncHelp';
      help.className = 'tt-sync-help';
      help.tabIndex = 0;
      help.setAttribute('aria-describedby', 'ttSyncTooltip');
      help.innerHTML = `<span class="tt-sync-help-mark" aria-hidden="true">i</span><span class="tt-sync-tooltip" id="ttSyncTooltip" role="tooltip">Secure time verification details are loading.</span>`;
      sync.appendChild(help);
    }
  }

  function parseProfileName(btn) {
    const title = (btn?.getAttribute('title') || '').trim();
    let match = title.match(/^My Profile\s*-\s*(.+)$/i);
    if (match) return match[1].trim();
    const aria = btn?.getAttribute('aria-label') || '';
    match = aria.match(/^Open\s+(.+?)'s\s+profile$/i);
    if (match) return match[1].trim();
    const selected = qs('#selectedEmployeeDisplay');
    if (selected) {
      const clone = selected.cloneNode(true);
      qsa('.avatar,.edit-name-btn', clone).forEach(n => n.remove());
      const text = clone.textContent.trim();
      if (text) return text.replace(/\s+(POD\s*\d+|ONBOARDING|TESCO|KROGER)$/i, '').trim();
    }
    return '';
  }

  // This module is a layout enhancement, not an identity authority.
  // The core signed-in profile renderer owns #agentProfileHeaderName/Role.
  // Earlier builds hard-coded Jhan as "Data Labeler · POD 2" and repeatedly
  // replaced the verified QA role, causing stale labels and repaint conflicts.
  function profileRoleLine(name) {
    const btn = qs('#agentProfileHeaderBtn');
    const primaryName = (qs('#agentProfileHeaderName', btn || document)?.textContent || '').trim();
    const qaIsVerified = currentRole() === 'agent' &&
      btn?.dataset.ttVerifiedQaRole === '1' &&
      primaryName.toLowerCase() === String(name || '').trim().toLowerCase();
    if (qaIsVerified) return 'Coverage Beta QA · OOS Coverage Beta QAs';
    const role = currentRole();
    if (role === 'teamleader') return `Team Leader · ${profileAssignmentPod(name)}`;
    if (role === 'admin') return 'Administration';
    return `Data Labeler · ${profileAssignmentPod(name)}`;
  }

  function syncProfileCard() {
    const btn = qs('#agentProfileHeaderBtn');
    if (!btn) return;
    let copy = qs('.tt-profile-header-copy', btn);
    if (!copy) {
      copy = document.createElement('span');
      copy.className = 'tt-profile-header-copy';
      copy.innerHTML = `<strong></strong><span class="tt-profile-role"></span><span class="tt-profile-workspace-chip">${icon('crown')}Premium Workspace</span>`;
      const status = qs('#agentProfileHeaderStatus', btn);
      if (status) btn.insertBefore(copy, status);
      else btn.appendChild(copy);
      const chev = document.createElement('span');
      chev.className = 'tt-profile-header-chevron';
      chev.innerHTML = icon('chevron');
      btn.appendChild(chev);
    }
    // Never race the core profile renderer: it derives the displayed team/role
    // from the authenticated session and current verified workforce roster.
    const coreManaged = !!(qs('#agentProfileHeaderName', copy) && qs('#agentProfileHeaderRole', copy));
    const role = currentRole();
    if (role === 'admin') {
      if (!coreManaged) {
        setText(qs('strong', copy), 'Administrator');
        setText(qs('.tt-profile-role', copy), 'Administration');
      }
      if (btn.dataset.ttPublicIdentity !== 'admin-session') btn.dataset.ttPublicIdentity = 'admin-session';
      btn.removeAttribute('data-tt-public-role');
      // The signed-in Admin profile also owns title and aria-label. Never
      // alternate those values with a second renderer on every mutation.
      if (!coreManaged) {
        if (btn.getAttribute('title') !== 'My TrinoTime - Admin Security') btn.setAttribute('title', 'My TrinoTime - Admin Security');
        if (btn.getAttribute('aria-label') !== 'Open Admin My TrinoTime security') btn.setAttribute('aria-label', 'Open Admin My TrinoTime security');
      }
      return;
    }
    const name = (qs('#agentProfileHeaderName', btn)?.textContent || '').trim() || parseProfileName(btn) || 'My Profile';
    const qa = role === 'agent' && btn.dataset.ttVerifiedQaRole === '1' && name !== 'My Profile';
    if (!coreManaged) {
      setText(qs('strong', copy), name);
      setText(qs('.tt-profile-role', copy), profileRoleLine(name));
    }
    const publicIdentity = qa ? 'verified-qa' : 'role-normalized';
    if (btn.dataset.ttPublicIdentity !== publicIdentity) btn.dataset.ttPublicIdentity = publicIdentity;
    // Old Jhan-only "Data Labeler · POD 2" override is intentionally removed.
    btn.removeAttribute('data-tt-public-role');
    qsa('[class*="developer"],[class*="admin-badge"],[class*="owner-badge"],[class*="privilege-badge"]', btn).forEach(n => n.classList.add('tt-profile-privileged-badge'));
  }

  function syncWorkspaceText() {
    const target = qs('#ttSidebarWorkspace');
    if (target) target.textContent = workspaceLabel();
    const heading = qs('#ttPremiumPodHeading');
    if (heading) heading.textContent = currentPod();
    const scope = qs('#ttUpcomingScope');
    if (scope) scope.textContent = `Today · ${currentPod()}`;
    const agentLabel = qs('label[for="empSearch"]');
    if (agentLabel && currentRole() === 'agent') agentLabel.textContent = 'Signed-in Agent';
  }

  function syncNotificationCount() {
    const raw = (qs('#notifBellBadge')?.textContent || '').trim();
    const count = Math.max(0, parseInt(raw, 10) || 0);
    const badge = qs('#ttSidebarNotifCount');
    if (!badge) return;
    badge.textContent = String(count);
    badge.classList.toggle('has-count', count > 0);
  }

  function ensureAnnouncementPreviewMarkup(preview) {
    if (!preview || qs('.tt-announcement-title', preview)) return;
    preview.innerHTML = `
      <span class="tt-announcement-avatar" aria-hidden="true">${icon('profile')}</span>
      <strong class="tt-announcement-title"></strong>
      <small class="tt-announcement-time"></small>
      <span class="tt-announcement-meta">System Administrator</span>
      <p class="tt-announcement-msg"></p>
      <span class="tt-announcement-pin" aria-hidden="true">${icon('pin')}</span>
    `;
  }

  function premiumEmptyMarkup(kind, title, message) {
    const iconName = kind === 'announcement' ? 'megaphone' : (kind === 'recent' ? 'list' : 'calendar');
    return `<div class="tt-premium-empty tt-premium-empty-${esc(kind)}"><span class="tt-premium-empty-icon" aria-hidden="true">${icon(iconName)}</span><strong>${esc(title)}</strong><span>${esc(message)}</span></div>`;
  }

  function syncAnnouncementPreview() {
    const preview = qs('#ttAnnouncementPreview');
    if (!preview) return;
    const item = qs('#announceList .announce-item');
    const announceText = (qs('#announceList')?.textContent || '').trim();
    const loading = /loading|fetching|connecting/i.test(announceText);
    if (!item) {
      if (!loading && preview.dataset.ttContentState !== 'empty') {
        preview.innerHTML = premiumEmptyMarkup('announcement', 'No announcements yet', 'You are all caught up. New workspace notices will appear here.');
        preview.dataset.ttContentState = 'empty';
      }
      return;
    }
    const author = qs('.announce-item-author', item)?.textContent?.trim() || 'Workspace announcement';
    const time = qs('.announce-item-time', item)?.textContent?.trim() || 'Latest';
    const msg = qs('.announce-item-msg', item)?.textContent?.trim() || 'Open Notification Center to review this update.';
    const signature = `${author}|${time}|${msg}`;
    if (preview.dataset.ttContentState !== signature) {
      ensureAnnouncementPreviewMarkup(preview);
      preview.dataset.ttContentState = signature;
    }
    setText(qs('.tt-announcement-title', preview), author);
    setText(qs('.tt-announcement-time', preview), time);
    setText(qs('.tt-announcement-msg', preview), msg);
  }

  function getPhtParts(date = new Date()) {
    const fmt = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
    const out = {};
    fmt.formatToParts(date).forEach(part => { if (part.type !== 'literal') out[part.type] = Number(part.value); });
    return out;
  }

  function time12To24(text) {
    const m = String(text || '').trim().match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
    if (!m) return null;
    let h = Number(m[1]) % 12;
    if (m[3].toUpperCase() === 'PM') h += 12;
    return {h, m:Number(m[2])};
  }

  let shiftCountdownTarget = 0;
  let shiftEndTarget = 0;
  let shiftDurationMs = 0;
  let shiftCountdownKey = '';

  function phtEpochForTime(time, dayOffset = 0) {
    const t = time12To24(time);
    if (!t) return 0;
    const pht = getPhtParts();
    return Date.UTC(pht.year, pht.month - 1, pht.day + dayOffset, t.h - 8, t.m, 0, 0);
  }

  function formatShiftDuration(ms) {
    if (!ms || ms <= 0) return 'Shift length —';
    const mins = Math.round(ms / 60_000);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `Shift length ${h ? `${h}h` : ''}${h && m ? ' ' : ''}${m ? `${m}m` : ''}`;
  }

  function syncUpcomingShift() {
    const primaryRaw = (qs('#clockShiftPrimary')?.textContent || '').trim();
    const secondaryRaw = (qs('#clockShiftSecondary')?.textContent || '').trim();
    const primary = primaryRaw.replace(/^Shift:\s*/i, '').trim();
    const targetText = qs('#ttUpcomingShift');
    if (targetText && primary) targetText.textContent = primary.replace(/\s*·\s*/g, ' · ');

    const times = Array.from(primary.matchAll(/(\d{1,2}:\d{2}\s*[AP]M)/ig), match => match[1]);
    const upcomingCard = qs('.tt-upcoming-card');
    const upcomingEmpty = qs('#ttUpcomingEmpty');
    const workspaceLoading = qs('#appRoot')?.dataset.ttDataLoading === 'true';
    const hasShift = times.length > 0;
    if (upcomingCard) upcomingCard.classList.toggle('tt-upcoming-is-empty', !hasShift && !workspaceLoading);
    if (upcomingEmpty) upcomingEmpty.hidden = hasShift || workspaceLoading;
    if (!hasShift) {
      shiftCountdownTarget = 0;
      shiftEndTarget = 0;
      shiftDurationMs = 0;
      shiftCountdownKey = '';
      if (!workspaceLoading) {
        if (targetText) setText(targetText, 'No shift scheduled');
        const status = qs('#ttUpcomingStatus');
        if (status) { setText(status, 'Open'); status.dataset.tone = 'pending'; }
      }
    }
    const pht = getPhtParts();
    const key = `${primary}|${pht.year}-${pht.month}-${pht.day}|${/starts in/i.test(secondaryRaw) ? 'future' : 'today'}`;
    if (times.length && key !== shiftCountdownKey) {
      let dayOffset = 0;
      let start = phtEpochForTime(times[0], 0);
      if (start < Date.now() - 60_000 && /starts in/i.test(secondaryRaw)) {
        dayOffset = 1;
        start = phtEpochForTime(times[0], 1);
      }
      let end = times[1] ? phtEpochForTime(times[1], dayOffset) : 0;
      if (end && end <= start) end += 86_400_000;
      shiftCountdownTarget = start;
      shiftEndTarget = end;
      shiftDurationMs = end > start ? end - start : 0;
      shiftCountdownKey = key;
    }

    const date = qs('#ttUpcomingDate');
    if (date) date.textContent = new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Manila',month:'short',day:'numeric'}).format(new Date(shiftCountdownTarget || Date.now()));
    const duration = qs('#ttUpcomingDuration');
    if (duration) duration.textContent = formatShiftDuration(shiftDurationMs);
    tickUpcomingCountdown();
  }

  function tickUpcomingCountdown() {
    const node = qs('#ttUpcomingCountdown');
    const kicker = qs('#ttUpcomingKicker');
    const status = qs('#ttUpcomingStatus');
    const ring = qs('#ttUpcomingRing');
    const ringValue = qs('#ttUpcomingProgressValue');
    const ringLabel = qs('#ttUpcomingProgressLabel');
    const bar = qs('#ttUpcomingProgressBar');
    if (!node) return;

    const now = Date.now();
    const pad = n => String(Math.max(0, n)).padStart(2, '0');
    const renderDuration = ms => {
      let remaining = Math.max(0, ms);
      const hours = Math.floor(remaining / 3_600_000);
      remaining -= hours * 3_600_000;
      const mins = Math.floor(remaining / 60_000);
      remaining -= mins * 60_000;
      const secs = Math.floor(remaining / 1000);
      return `${pad(hours)} : ${pad(mins)} : ${pad(secs)}`;
    };

    let progressPct = 0;
    let label = 'Shift';
    let statusText = 'Scheduled';
    if (shiftCountdownTarget && now < shiftCountdownTarget) {
      if (kicker) kicker.textContent = 'Starts in';
      node.innerHTML = `${renderDuration(shiftCountdownTarget - now)}<small>HRS &nbsp; MIN &nbsp; SEC</small>`;
      statusText = 'Scheduled';
    } else if (shiftEndTarget && now < shiftEndTarget) {
      if (kicker) kicker.textContent = 'Ends in';
      node.innerHTML = `${renderDuration(shiftEndTarget - now)}<small>HRS &nbsp; MIN &nbsp; SEC</small>`;
      progressPct = shiftDurationMs ? Math.max(0, Math.min(100, ((now - shiftCountdownTarget) / shiftDurationMs) * 100)) : 0;
      label = 'Done';
      statusText = /break/i.test((qs('#clockShiftSecondary')?.textContent || '')) ? 'On Break' : 'In Progress';
    } else if (shiftEndTarget && now >= shiftEndTarget) {
      if (kicker) kicker.textContent = 'Status';
      node.innerHTML = `Complete<small>SHIFT &nbsp; STATUS</small>`;
      progressPct = 100;
      label = 'Done';
      statusText = 'Completed';
    } else {
      const secondaryRaw = (qs('#clockShiftSecondary')?.textContent || '').trim();
      if (kicker) kicker.textContent = 'Status';
      node.innerHTML = `${esc(secondaryRaw.replace(/^.*?·\s*/, '').trim() || 'Pending')}<small>LIVE &nbsp; STATUS</small>`;
      statusText = 'Pending';
    }

    const rounded = Math.round(progressPct);
    if (status) {
      setText(status, statusText);
      status.dataset.tone = statusText === 'In Progress' ? 'active' : (statusText === 'On Break' ? 'break' : (statusText === 'Completed' ? 'complete' : (statusText === 'Pending' ? 'pending' : 'scheduled')));
    }
    if (ring) {
      ring.style.setProperty('--tt-shift-progress', `${rounded}%`);
      ring.setAttribute('aria-label', `Shift progress ${rounded} percent`);
    }
    if (ringValue) setText(ringValue, `${rounded}%`);
    if (ringLabel) setText(ringLabel, label);
    if (bar) bar.style.width = `${rounded}%`;
  }

  function syncShiftProgress() {
    const progress = qs('#ttHeroShiftProgress');
    const fill = qs('#ttHeroProgressFill');
    if (!progress || !fill) return;

    const stepTI = qs('#stepTimeIn');
    const stepSB = qs('#stepStartBreak');
    const stepEB = qs('#stepEndBreak');
    const stepLO = qs('#stepLogOut');
    const statusCopy = (qs('#statusText')?.textContent || '').trim();

    let stage = 'before';
    let fillPct = 0;
    let label = 'Before Shift';

    if (/voided/i.test(statusCopy)) {
      stage = 'voided';
      label = 'Attendance record voided';
    } else if (stepLO?.classList.contains('done')) {
      stage = 'complete';
      fillPct = 100;
      label = 'Completed';
    } else if (stepSB?.classList.contains('done') && stepEB?.classList.contains('active')) {
      stage = 'break';
      fillPct = 66;
      label = 'On Break';
    } else if (stepTI?.classList.contains('done')) {
      stage = 'working';
      fillPct = stepEB?.classList.contains('done') ? 82 : 34;
      label = stepEB?.classList.contains('done') ? 'Working · Break completed' : 'Working';
    } else if (stepTI?.classList.contains('active')) {
      stage = 'before';
      fillPct = 0;
      label = 'Before Shift';
    } else {
      stage = 'pending';
      label = 'Waiting for attendance state';
    }

    progress.dataset.stage = stage;
    progress.setAttribute('aria-label', `Current shift progress: ${label}`);
    fill.style.width = `${fillPct}%`;
    const stateText = qs('#ttHeroProgressState', progress);
    const hintText = qs('#ttHeroProgressHint', progress);
    const hints = {
      before: 'Time In is next',
      working: stepEB?.classList.contains('done') ? 'Break completed · Time Out is next' : 'Break Start is next',
      break: 'End Break is next',
      complete: 'Shift attendance recorded',
      voided: 'Attendance record requires review',
      pending: 'Waiting for the live attendance state'
    };
    if (stateText) setText(stateText, label);
    if (hintText) setText(hintText, hints[stage] || 'Attendance state updating');

    const ordered = ['before', 'working', 'break', 'complete'];
    qsa('[data-tt-stage]', progress).forEach(node => node.classList.remove('is-done', 'is-active'));
    qsa('[data-tt-stage-label]', progress).forEach(node => node.classList.remove('is-done', 'is-active'));

    const applyState = (key, cls) => {
      qs(`[data-tt-stage="${key}"]`, progress)?.classList.add(cls);
      qs(`[data-tt-stage-label="${key}"]`, progress)?.classList.add(cls);
    };

    if (stage === 'before') {
      applyState('before', 'is-active');
    } else if (stage === 'working') {
      applyState('before', 'is-done');
      if (stepEB?.classList.contains('done')) {
        applyState('working', 'is-active');
        applyState('break', 'is-done');
      } else {
        applyState('working', 'is-active');
      }
    } else if (stage === 'break') {
      applyState('before', 'is-done');
      applyState('working', 'is-done');
      applyState('break', 'is-active');
    } else if (stage === 'complete') {
      ordered.forEach(key => applyState(key, 'is-done'));
    }
  }

  function syncServerStatus() {
    const state = qs('#ttSidebarServerState');
    const checked = qs('#ttSidebarServerChecked');
    const sync = qs('#timeSyncStatus');
    const detail = qs('#ttHeroSyncVerified');
    const help = qs('#ttHeroSyncHelp');
    const tooltip = qs('#ttSyncTooltip');
    if (!state || !checked || !sync) return;

    const text = (qs('#timeSyncText')?.textContent || 'Verifying secure sync').trim();
    const p = getPhtParts();
    const hh = String(p.hour).padStart(2,'0');
    const mm = String(p.minute).padStart(2,'0');
    const ss = String(p.second).padStart(2,'0');
    const online = navigator.onLine !== false;
    const isOnline = online && sync.classList.contains('is-online');
    const isUnstable = online && sync.classList.contains('is-unstable');
    const isReconnecting = sync.classList.contains('is-reconnecting');
    let helpCopy = '';

    if (isOnline) {
      state.textContent = 'Verified Secure Time';
      state.style.color = '#2F9A5B';
      checked.textContent = `Trusted server time verified · ${hh}:${mm}:${ss} PHT`;
      if (detail) setText(detail, `Trusted time verified · ${hh}:${mm} PHT`);
      helpCopy = `TrinoTime reports live sync as online and the displayed PHT clock is verified against the trusted server-time state. Last checked ${hh}:${mm}:${ss} PHT.`;
      sync.dataset.ttSyncTone = 'verified';
    } else if (isUnstable) {
      state.textContent = 'Server Reachable · Sync Degraded';
      state.style.color = '#A46B12';
      checked.textContent = `Previously verified clock retained · ${hh}:${mm}:${ss} PHT`;
      if (detail) setText(detail, 'Trusted clock retained · sync degraded');
      helpCopy = 'Live sync is unstable. TrinoTime is retaining the trusted-time state already established by the secure runtime; attendance controls continue to follow the existing runtime safety rules.';
      sync.dataset.ttSyncTone = 'warning';
    } else if (isReconnecting) {
      state.textContent = 'Re-verifying Secure Time';
      state.style.color = '#A46B12';
      checked.textContent = `Secure verification in progress · ${hh}:${mm}:${ss} PHT`;
      const retained = /verified time|local backup/i.test(text);
      if (detail) setText(detail, retained ? 'Trusted time retained · re-verifying' : 'Secure time verification pending');
      helpCopy = retained
        ? 'The live connection is re-verifying while TrinoTime retains a previously verified time state. Existing attendance safeguards remain authoritative.'
        : 'TrinoTime is still verifying the live server and trusted time source. Punch controls remain governed by the existing secure readiness gates.';
      sync.dataset.ttSyncTone = 'pending';
    } else {
      state.textContent = 'Secure Sync Offline';
      state.style.color = '#B4534B';
      checked.textContent = `Trusted server verification unavailable · ${hh}:${mm}:${ss} PHT`;
      if (detail) setText(detail, 'Trusted server verification unavailable');
      helpCopy = 'The live trusted-time verification path is unavailable. TrinoTime continues to enforce the existing offline/local-continuity and attendance safety rules; this presentation layer does not override them.';
      sync.dataset.ttSyncTone = 'offline';
    }

    if (tooltip) setText(tooltip, helpCopy);
    if (help) help.setAttribute('aria-label', helpCopy);
  }

  function setPremiumSkeleton(target, loading, kind = 'card') {
    if (!target) return;
    let layer = Array.from(target.children || []).find(node => node.classList?.contains('tt-premium-skeleton-layer'));
    if (!layer) {
      layer = document.createElement('span');
      layer.className = 'tt-premium-skeleton-layer';
      layer.setAttribute('aria-hidden', 'true');
      layer.innerHTML = `<span class="tt-premium-skeleton-shape tt-premium-skeleton-avatar"></span><span class="tt-premium-skeleton-copy"><i></i><i></i><i></i></span>`;
      target.appendChild(layer);
    }
    target.classList.toggle('tt-premium-is-loading', !!loading);
    target.dataset.ttSkeletonKind = kind;
    layer.hidden = !loading;
  }

  function syncPremiumLoadingStates() {
    const root = qs('#appRoot');
    if (!root) return;
    const hour = (qs('#clockHour')?.textContent || '').trim();
    const date = (qs('#clockDateMain')?.textContent || '').trim();
    const clockBooting = !hour || hour === '--' || /loading date/i.test(date);
    const workspaceLoading = root.dataset.ttDataLoading === 'true';
    const profileBtn = qs('#agentProfileHeaderBtn');
    const profileReady = !!(profileBtn && profileBtn.offsetParent !== null && parseProfileName(profileBtn));
    const shiftPrimary = (qs('#clockShiftPrimary')?.textContent || '').trim();
    const shiftReady = /\d{1,2}:\d{2}\s*[AP]M/i.test(shiftPrimary);
    const announceText = (qs('#announceList')?.textContent || '').trim();
    const announcementsLoading = /loading|fetching|connecting/i.test(announceText);

    setPremiumSkeleton(qs('.clock-box'), clockBooting, 'clock');
    setPremiumSkeleton(qs('#headerProfileSlot'), !profileReady && (clockBooting || workspaceLoading), 'profile');
    setPremiumSkeleton(qs('.tt-upcoming-card'), (clockBooting || workspaceLoading) && !shiftReady, 'upcoming');
    setPremiumSkeleton(qs('#ttPremiumRecentActivity'), workspaceLoading, 'recent');
    const firstRightCard = qs('#ttPremiumRightRail .tt-right-card:first-child');
    setPremiumSkeleton(firstRightCard, announcementsLoading, 'announcement');
  }

  function syncRecentActivity() {
    const host = qs('#ttRecentBody');
    if (!host) return;
    const rows = qsa('#desktopTbody tr').filter(row => qsa('td', row).length >= 3);
    if (!rows.length) {
      if (host.dataset.ttContentState !== 'empty') {
        host.innerHTML = premiumEmptyMarkup('recent', 'No recent attendance activity', 'Your latest recorded attendance event will appear here after your first punch is available.');
        host.dataset.ttContentState = 'empty';
      }
      return;
    }
    const row = rows[0];
    const cells = qsa('td', row).map(cell => cell.textContent.replace(/\s+/g, ' ').trim());
    const date = cells[0] || 'Today';
    const pod = cells[1] || currentPod();
    const name = cells[2] || parseProfileName(qs('#agentProfileHeaderBtn')) || 'Signed-in user';
    const punches = cells.slice(3,7).filter(Boolean).filter(value => !/^[-—]+$/.test(value));
    const detail = punches.length ? `${punches.length} attendance event${punches.length === 1 ? '' : 's'} recorded` : 'Attendance record available';
    const signature = `${date}|${pod}|${name}|${detail}`;
    if (host.dataset.ttContentState === signature) return;
    host.innerHTML = `<table class="tt-recent-table"><thead><tr><th>Date</th><th>Agent</th><th>Activity</th><th>Details</th><th>POD</th><th>Status</th></tr></thead><tbody><tr><td>${esc(date)}</td><td>${esc(name)}</td><td>Attendance</td><td>${esc(detail)}</td><td>${esc(pod)}</td><td><span class="tt-recent-status">Recorded</span></td></tr></tbody></table>`;
    host.dataset.ttContentState = signature;
  }

  function setNavActive(action) {
    qsa('[data-tt-nav]').forEach(btn => btn.classList.toggle('is-active', btn.dataset.ttNav === action));
  }

  function clickIf(id) {
    const node = qs(id);
    if (node && !node.disabled) { node.click(); return true; }
    return false;
  }

  function scrollToNode(node) {
    if (!node) return;
    node.scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block:'start'});
  }

  function handleAction(action) {
    switch (action) {
      case 'dashboard':
        window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
        break;
      case 'attendance': {
        const role = document.body?.dataset?.trinoRole || '';
        const tlAttendance = window.TrinoTimeCore && window.TrinoTimeCore.teamLeaderAttendance;
        if (role === 'teamleader' && tlAttendance && typeof tlAttendance.open === 'function') {
          tlAttendance.open();
          break;
        }
        scrollToNode(qs('.log-section'));
        break;
      }
      case 'schedule':
      case 'dayoff':
        clickIf('#openDayOffBtn');
        break;
      case 'pod':
        scrollToNode(qs('#punchCard'));
        break;
      case 'workforce': {
        const roster = qs('#rosterTabBtn');
        if (roster && getComputedStyle(roster).display !== 'none') {
          roster.click();
          scrollToNode(qs('.log-section'));
        } else if (window.TrinoTimeHelp && typeof window.TrinoTimeHelp.open === 'function') {
          window.TrinoTimeHelp.open('roster');
        } else {
          scrollToNode(qs('.log-section'));
        }
        break;
      }
      case 'notifications':
        clickIf('#notifBellBtn');
        break;
      case 'reports': {
        const history = qs('.log-tab[data-tab="history"],#historyTabBtn');
        if (history && getComputedStyle(history).display !== 'none') history.click();
        scrollToNode(qs('.log-section'));
        break;
      }
      case 'premium':
        if (clickIf('#settingsGearBtn')) setTimeout(() => clickIf('#settingsPremiumAccessTabBtn'), 60);
        break;
      case 'system':
        clickIf('#settingsGearBtn');
        break;
      case 'support':
        if (clickIf('#settingsGearBtn')) setTimeout(() => qs('[data-settings-tab="tutorial"]')?.click(), 60);
        break;
      case 'speedtest':
        clickIf('#headerSpeedtestBtn');
        break;
      default:
        break;
    }
  }

  function bindUi() {
    document.addEventListener('click', event => {
      const nav = event.target.closest('[data-tt-nav]');
      if (nav) {
        const action = nav.dataset.ttNav;
        setNavActive(action);
        handleAction(action);
        if (innerWidth <= 980) document.body.classList.remove('tt-premium-mobile-nav-open');
        return;
      }
      const action = event.target.closest('[data-tt-action]');
      if (action) { handleAction(action.dataset.ttAction); return; }
      if (event.target.closest('#ttPremiumSidebarToggle')) {
        if (innerWidth <= 980) {
          document.body.classList.toggle('tt-premium-mobile-nav-open');
        } else {
          document.body.classList.toggle('tt-premium-sidebar-collapsed');
          try { localStorage.setItem('trinotime-premium-sidebar-collapsed', document.body.classList.contains('tt-premium-sidebar-collapsed') ? 'compact' : 'full'); } catch (_) {}
          syncSidebarMode();
        }
        return;
      }
      if (event.target.closest('#ttPremiumThemeSwitch')) {
        const dark = document.body.classList.contains('dark-mode');
        const target = dark ? qs('#themeLightBtn') : qs('#themeDarkBtn');
        if (target) target.click();
      }
    });
  }

  function syncThemeLabel() {
    const label = qs('#ttPremiumThemeLabel');
    const switcher = qs('#ttPremiumThemeSwitch');
    if (!label || !switcher) return;
    const dark = document.body.classList.contains('dark-mode');
    label.textContent = dark ? 'Obsidian Mode' : 'Pearl Mode';
    switcher.dataset.ttTooltip = dark ? 'Switch to Pearl Mode' : 'Switch to Obsidian Mode';
    switcher.setAttribute('aria-label', dark ? 'Switch to Pearl light theme' : 'Switch to Obsidian dark theme');
    const svg = qs('svg', switcher);
    if (svg) svg.outerHTML = icon(dark ? 'moon' : 'sun','tt-theme-icon');
    let meta = qs('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#0A0D12' : '#F8FAFC');
    document.documentElement.dataset.ttPremiumTheme = dark ? 'obsidian' : 'pearl';
  }

  function syncSidebarMode() {
    const toggle = qs('#ttPremiumSidebarToggle');
    const sidebar = qs('#ttPremiumSidebar');
    const compact = document.body.classList.contains('tt-premium-sidebar-collapsed') && innerWidth > 980;
    if (sidebar) sidebar.dataset.ttMode = compact ? 'compact' : 'full';
    if (toggle) {
      toggle.setAttribute('aria-pressed', compact ? 'true' : 'false');
      toggle.setAttribute('aria-label', compact ? 'Expand navigation sidebar' : 'Use compact navigation');
      toggle.setAttribute('title', compact ? 'Expand navigation' : 'Use compact navigation');
    }
  }

  function restoreSidebarState() {
    if (innerWidth <= 980) { document.body.classList.remove('tt-premium-sidebar-collapsed'); return; }
    let saved = '';
    try { saved = localStorage.getItem('trinotime-premium-sidebar-collapsed') || ''; } catch (_) {}
    if (saved === '1' || saved === 'compact') document.body.classList.add('tt-premium-sidebar-collapsed');
    else if (saved === '0' || saved === 'full') document.body.classList.remove('tt-premium-sidebar-collapsed');
    else document.body.classList.toggle('tt-premium-sidebar-collapsed', innerWidth <= 1180);
    syncSidebarMode();
  }

  function syncAll() {
    if (!premiumEnabled()) return;
    buildSidebar();
    buildRightRail();
    buildMainPreview();
    placeRightRail();
    buildHeroProgress();
    syncProfileCard();
    syncWorkspaceText();
    syncNotificationCount();
    syncAnnouncementPreview();
    syncUpcomingShift();
    syncShiftProgress();
    syncServerStatus();
    syncRecentActivity();
    syncPremiumLoadingStates();
    syncThemeLabel();
    syncSidebarMode();
  }

  let bound = false;
  function init() {
    if (!qs('#appRoot')) return;
    if (!bound) { bindUi(); restoreSidebarState(); bound = true; }
    syncAll();
  }

  const observer = new MutationObserver(() => syncAll());
  observer.observe(document.documentElement, {attributes:true,attributeFilter:['data-trino-custom-workspace']});
  observer.observe(document.body, {attributes:true,attributeFilter:['data-trino-role','class']});
  const appRoot = qs('#appRoot');
  if (appRoot) observer.observe(appRoot,{attributes:true,attributeFilter:['data-tt-data-loading']});
  const profileSlot = qs('#headerProfileSlot');
  if (profileSlot) observer.observe(profileSlot,{childList:true,subtree:true,attributes:true,attributeFilter:['title','aria-label']});
  const announceList = qs('#announceList');
  if (announceList) observer.observe(announceList,{childList:true,subtree:true,characterData:true});
  const clockShift = qs('#clockShiftStatus');
  if (clockShift) observer.observe(clockShift,{childList:true,subtree:true,characterData:true});
  const syncStatus = qs('#timeSyncStatus');
  if (syncStatus) observer.observe(syncStatus,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class']});
  const punchStepper = qs('#punchStepper');
  if (punchStepper) observer.observe(punchStepper,{subtree:true,attributes:true,attributeFilter:['class']});
  const notifBadge = qs('#notifBellBadge');
  if (notifBadge) observer.observe(notifBadge,{childList:true,subtree:true,characterData:true});
  const desktopTbody = qs('#desktopTbody');
  if (desktopTbody) observer.observe(desktopTbody,{childList:true,subtree:true,characterData:true});

  window.addEventListener('resize', () => {
    if (innerWidth > 980) document.body.classList.remove('tt-premium-mobile-nav-open');
    if (innerWidth <= 980) document.body.classList.remove('tt-premium-sidebar-collapsed');
    else {
      let saved = '';
      try { saved = localStorage.getItem('trinotime-premium-sidebar-collapsed') || ''; } catch (_) {}
      if (saved === '1' || saved === 'compact') document.body.classList.add('tt-premium-sidebar-collapsed');
      else if (saved === '0' || saved === 'full') document.body.classList.remove('tt-premium-sidebar-collapsed');
      else document.body.classList.toggle('tt-premium-sidebar-collapsed', innerWidth <= 1180);
    }
    if (premiumEnabled()) { placeRightRail(); syncSidebarMode(); }
  });
  setInterval(() => { if (premiumEnabled()) { tickUpcomingCountdown(); syncServerStatus(); syncPremiumLoadingStates(); } }, 1000);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
  setTimeout(init, 120);
  setTimeout(init, 650);
})();
