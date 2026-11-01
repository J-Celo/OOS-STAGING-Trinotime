(() => {
  'use strict';

  const state = {
    authorized: false,
    profile: null,
    directory: null,
    directoryError: '',
    directoryLoading: false,
    tab: 'profile',
    editing: false,
    busy: false,
    pendingPhoto: undefined,
    allowCoreOnce: false,
    authHooked: false,
    authUid: '',
    deniedUid: '',
    selfLoadingUid: '',
    authEpoch: 0,
    noticeTimer: 0,
    selfRetryTimer: 0,
    selfRetryAttempt: 0,
    openRequested: false,
    requestedTab: 'profile',
    openError: ''
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const initials = value => String(value || 'AD').trim().split(/\s+/).filter(Boolean).slice(0,2).map(x => x.charAt(0)).join('').toUpperCase() || 'AD';
  const profileName = () => state.profile?.displayName || 'Administrator';
  const roleLabel = () => state.profile?.accessLabel || 'Admin';
  const currentAuthUser = () => window.firebase?.auth?.().currentUser || null;
  const currentAuthUid = () => String(currentAuthUser()?.uid || '');
  const currentRoleHint = () => String(document.body?.dataset?.trinoRole || '').trim().toLowerCase().replace(/[ -]+/g, '_');
  const roleHintIsAdmin = () => ['admin','owner'].includes(currentRoleHint());
  const roleHintIsKnownNonAdmin = () => {
    const hint = currentRoleHint();
    return Boolean(hint && !['admin','owner'].includes(hint));
  };
  const adminHeaderIsApplied = () => Boolean(state.authorized || $('#agentProfileHeaderBtn')?.dataset?.adminPersonalProfile === 'true');
  const headerLooksAdmin = () => {
    const btn = $('#agentProfileHeaderBtn');
    const name = String($('#agentProfileHeaderName')?.textContent || '').trim().toLowerCase();
    const role = String($('#agentProfileHeaderRole')?.textContent || '').trim().toLowerCase();
    const title = String(btn?.getAttribute('title') || '').trim().toLowerCase();
    const aria = String(btn?.getAttribute('aria-label') || '').trim().toLowerCase();
    return Boolean(roleHintIsAdmin() || state.authorized || name === 'administrator' || role.includes('administration') || title.includes('admin') || aria.includes('admin'));
  };

  function closeCoreProfileOverlay() {
    const core = $('#agentProfileOverlay');
    if (!core) return;
    core.classList.remove('open');
    core.setAttribute('aria-hidden', 'true');
  }

  function cancelSelfRetry({resetAttempt = true} = {}) {
    if (state.selfRetryTimer) clearTimeout(state.selfRetryTimer);
    state.selfRetryTimer = 0;
    if (resetAttempt) state.selfRetryAttempt = 0;
  }

  function scheduleSelfRetry(uid) {
    const expectedUid = String(uid || '');
    if (!expectedUid || state.authorized || state.selfRetryTimer || state.deniedUid === expectedUid || currentAuthUid() !== expectedUid || roleHintIsKnownNonAdmin()) return;
    const delays = [1500, 5000];
    const attempt = Math.max(0, Number(state.selfRetryAttempt) || 0);
    if (attempt >= delays.length) return;
    state.selfRetryAttempt = attempt + 1;
    state.selfRetryTimer = setTimeout(() => {
      state.selfRetryTimer = 0;
      if (currentAuthUid() !== expectedUid || state.authorized || state.deniedUid === expectedUid || roleHintIsKnownNonAdmin()) return;
      void loadSelf({silent:true});
    }, delays[attempt]);
  }

  function resetHeaderIdentityNeutral() {
    const btn = $('#agentProfileHeaderBtn');
    const avatar = $('#agentProfileHeaderAvatar');
    const name = $('#agentProfileHeaderName');
    const role = $('#agentProfileHeaderRole');
    const status = $('#agentProfileHeaderStatus');
    if (btn) {
      btn.removeAttribute('data-admin-personal-profile');
      btn.title = 'My Profile';
      btn.setAttribute('aria-label', 'Open my profile');
    }
    if (avatar) {
      avatar.style.backgroundImage = '';
      avatar.style.backgroundSize = '';
      avatar.style.backgroundPosition = '';
      avatar.classList.remove('tt-admin-profile-header-avatar-photo');
      avatar.textContent = 'PR';
    }
    if (name) name.textContent = 'My Profile';
    if (role) role.textContent = 'Workforce profile';
    if (status) status.className = 'agent-profile-header-status is-unavailable';
  }

  function beginIdentityTransition(uid) {
    const hadAdminIdentity = adminHeaderIsApplied();
    state.authEpoch += 1;
    cancelSelfRetry();
    state.authorized = false;
    state.profile = null;
    state.directory = null;
    state.directoryError = '';
    state.directoryLoading = false;
    state.editing = false;
    state.busy = false;
    state.pendingPhoto = undefined;
    state.deniedUid = '';
    state.selfLoadingUid = '';
    state.openRequested = false;
    state.requestedTab = 'profile';
    state.openError = '';
    state.authUid = String(uid || '');
    closeUi();
    if (hadAdminIdentity) resetHeaderIdentityNeutral();
    return state.authEpoch;
  }

  function markNonAdminIdentity(uid) {
    const nextUid = String(uid || '');
    if (!state.authorized && state.deniedUid === nextUid && state.authUid === nextUid) return;
    const hadAdminIdentity = adminHeaderIsApplied();
    state.authEpoch += 1;
    cancelSelfRetry();
    state.authorized = false;
    state.profile = null;
    state.directory = null;
    state.directoryError = '';
    state.directoryLoading = false;
    state.editing = false;
    state.busy = false;
    state.pendingPhoto = undefined;
    state.selfLoadingUid = '';
    state.openRequested = false;
    state.requestedTab = 'profile';
    state.openError = '';
    state.authUid = nextUid;
    state.deniedUid = nextUid;
    closeUi();
    if (hadAdminIdentity) resetHeaderIdentityNeutral();
  }

  function ensureUi() {
    if ($('#ttAdminProfileOverlay')) return;
    document.body.insertAdjacentHTML('beforeend', `
      <div class="tt-admin-profile-overlay" id="ttAdminProfileOverlay" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="ttAdminProfileTitle">
        <div class="tt-admin-profile-modal" role="document">
          <header class="tt-admin-profile-head">
            <div>
              <span class="tt-admin-profile-kicker">ADMIN WORKSPACE</span>
              <h2 id="ttAdminProfileTitle">My TrinoTime</h2>
              <p>Your personal Admin identity, Admin accounts &amp; security.</p>
            </div>
            <button type="button" class="tt-admin-profile-close" data-admin-profile-close aria-label="Close Admin profile">×</button>
          </header>
          <nav class="tt-admin-profile-tabs" aria-label="Admin profile sections" role="tablist">
            <button type="button" role="tab" data-admin-profile-tab="profile">My Profile</button>
            <button type="button" role="tab" data-admin-profile-tab="directory">Admin Accounts</button>
            <button type="button" role="tab" data-admin-profile-tab="security">Security</button>
          </nav>
          <main class="tt-admin-profile-body" id="ttAdminProfileBody" aria-live="polite"></main>
        </div>
      </div>`);
  }

  function showOverlay() {
    ensureUi();
    closeCoreProfileOverlay();
    const overlay = $('#ttAdminProfileOverlay');
    overlay?.classList.add('open');
    overlay?.setAttribute('aria-hidden', 'false');
    document.body.classList.add('tt-admin-profile-open');
  }

  function renderOpenLoading(message = 'Loading your Admin account…') {
    ensureUi();
    const body = $('#ttAdminProfileBody');
    if (body) body.innerHTML = `<div class="tt-admin-profile-loading"><span class="tt-admin-profile-spinner"></span><strong>${esc(message)}</strong><p>TrinoTime is verifying the currently authenticated Admin identity.</p></div>`;
    document.querySelectorAll('[data-admin-profile-tab]').forEach(button => {
      const active = button.dataset.adminProfileTab === state.requestedTab;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
      button.tabIndex = active ? 0 : -1;
    });
  }

  function renderOpenError(message) {
    ensureUi();
    const body = $('#ttAdminProfileBody');
    if (body) body.innerHTML = `<div class="tt-admin-profile-empty tt-admin-profile-directory-error"><strong>Admin profile could not be opened</strong><p>${esc(message || 'The Admin identity could not be verified yet.')}</p><div class="tt-admin-profile-form-actions compact"><button type="button" class="tt-admin-btn primary" data-admin-open-retry>Retry</button><button type="button" class="tt-admin-btn" data-admin-open-core-security>Open security only</button></div></div>`;
  }

  function openUi(tab = 'profile') {
    if (!state.authorized || !state.profile) return false;
    ensureUi();
    state.openRequested = false;
    state.openError = '';
    state.tab = tab;
    state.requestedTab = tab;
    state.editing = false;
    state.pendingPhoto = undefined;
    render();
    showOverlay();
    requestAnimationFrame(() => $('.tt-admin-profile-close', $('#ttAdminProfileOverlay'))?.focus({preventScroll:true}));
    return true;
  }

  async function requestOpen(tab = 'profile') {
    state.requestedTab = ['profile','directory','security'].includes(tab) ? tab : 'profile';
    closeCoreProfileOverlay();
    if (openUi(state.requestedTab)) {
      if (state.requestedTab === 'directory') void loadDirectory();
      return true;
    }
    if (!headerLooksAdmin()) return false;
    state.openRequested = true;
    state.openError = '';
    showOverlay();
    renderOpenLoading();
    if (state.selfLoadingUid && state.selfLoadingUid === currentAuthUid()) return true;
    const ok = await loadSelf({silent:false});
    if (ok && state.authorized && state.profile) {
      openUi(state.requestedTab);
      if (state.requestedTab === 'directory') void loadDirectory();
      return true;
    }
    if (state.openRequested) {
      state.openError = 'TrinoTime could not verify this Admin profile. Confirm the signed-in Firebase account still has an active Admin role, then retry.';
      renderOpenError(state.openError);
    }
    return false;
  }

  function closeUi() {
    const overlay = $('#ttAdminProfileOverlay');
    overlay?.classList.remove('open');
    overlay?.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('tt-admin-profile-open');
    state.openRequested = false;
    state.openError = '';
    state.editing = false;
    state.pendingPhoto = undefined;
  }

  async function authToken() {
    const user = window.firebase?.auth?.().currentUser;
    if (!user || user.isAnonymous) throw Object.assign(new Error('Admin sign-in required.'), {status:401});
    return user.getIdToken(false);
  }

  async function api(path, options = {}) {
    const token = await authToken();
    const headers = new Headers(options.headers || {});
    headers.set('Authorization', `Bearer ${token}`);
    headers.set('Accept', 'application/json');
    if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json; charset=utf-8');
    const response = await fetch(path, {...options, headers, cache:'no-store'});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.message || 'Admin profile request failed.');
      error.status = response.status;
      error.code = data.error || '';
      throw error;
    }
    return data;
  }

  function headerAvatarPhoto(avatar, photo) {
    if (!avatar) return;
    if (photo) {
      avatar.textContent = '';
      avatar.style.backgroundImage = `url("${photo}")`;
      avatar.style.backgroundSize = 'cover';
      avatar.style.backgroundPosition = 'center';
      avatar.classList.add('tt-admin-profile-header-avatar-photo');
    } else {
      avatar.style.backgroundImage = '';
      avatar.style.backgroundSize = '';
      avatar.style.backgroundPosition = '';
      avatar.textContent = initials(profileName());
      avatar.classList.remove('tt-admin-profile-header-avatar-photo');
    }
  }

  function applyHeaderIdentity() {
    if (!state.authorized || !state.profile) return;
    const btn = $('#agentProfileHeaderBtn');
    const avatar = $('#agentProfileHeaderAvatar');
    const name = $('#agentProfileHeaderName');
    const role = $('#agentProfileHeaderRole');
    const status = $('#agentProfileHeaderStatus');
    if (!btn || !avatar || !name || !role) return;
    btn.style.display = 'inline-flex';
    btn.dataset.adminPersonalProfile = 'true';
    btn.title = 'My Admin Profile';
    btn.setAttribute('aria-label', `Open Admin profile for ${profileName()}`);
    name.textContent = profileName();
    role.textContent = state.profile.jobTitle || (roleLabel() === 'Owner' ? 'Owner · Administration' : `${roleLabel()} · Administration`);
    if (status) status.className = 'agent-profile-header-status is-online';
    headerAvatarPhoto(avatar, state.profile.photoDataUrl || '');
  }

  function applyHeaderIdentityBounded() {
    applyHeaderIdentity();
    [250, 1000, 3000].forEach(delay => setTimeout(applyHeaderIdentity, delay));
  }

  function clearAdminIdentity() {
    const hadAdminIdentity = adminHeaderIsApplied();
    state.authEpoch += 1;
    cancelSelfRetry();
    state.authorized = false;
    state.profile = null;
    state.directory = null;
    state.directoryError = '';
    state.directoryLoading = false;
    state.editing = false;
    state.busy = false;
    state.pendingPhoto = undefined;
    state.deniedUid = '';
    state.selfLoadingUid = '';
    state.openRequested = false;
    state.requestedTab = 'profile';
    state.openError = '';
    state.authUid = '';
    closeUi();
    if (hadAdminIdentity) resetHeaderIdentityNeutral();
  }

  async function loadSelf({silent = true} = {}) {
    const user = currentAuthUser();
    if (!user || user.isAnonymous) { clearAdminIdentity(); return false; }
    const uid = String(user.uid || '');
    if (!uid) { clearAdminIdentity(); return false; }
    if (roleHintIsKnownNonAdmin()) { markNonAdminIdentity(uid); return false; }
    if (state.deniedUid === uid && !roleHintIsAdmin()) return false;
    if (state.authUid !== uid) beginIdentityTransition(uid);
    if (roleHintIsAdmin()) state.deniedUid = '';
    if (state.selfLoadingUid === uid) return false;
    const epoch = state.authEpoch;
    state.selfLoadingUid = uid;
    try {
      const data = await api('/api/workforce/profile/admin-self', {method:'GET'});
      if (epoch !== state.authEpoch || currentAuthUid() !== uid) return false;
      if (!data?.profile || String(data.profile.uid || '') !== uid) {
        if (!silent) showMessage('The Admin profile response could not be verified for this signed-in account.', 'error');
        return false;
      }
      cancelSelfRetry();
      state.authorized = true;
      state.authUid = uid;
      state.profile = data.profile;
      state.directory = null;
      state.directoryError = '';
      state.directoryLoading = false;
      applyHeaderIdentityBounded();
      window.dispatchEvent(new CustomEvent('trinotime:admin-profile-ready', {detail:{profile:{...state.profile}}}));
      if (state.openRequested) {
        const requested = state.requestedTab || 'profile';
        queueMicrotask(() => { if (state.authorized && state.profile) { openUi(requested); if (requested === 'directory') void loadDirectory(); } });
      }
      return true;
    } catch (error) {
      if (epoch !== state.authEpoch || currentAuthUid() !== uid) return false;
      if (error.status === 401 || error.status === 403) { markNonAdminIdentity(uid); return false; }
      scheduleSelfRetry(uid);
      if (!silent) showMessage(error.message || 'Could not load the Admin profile.', 'error');
      return false;
    } finally {
      if (epoch === state.authEpoch && state.selfLoadingUid === uid) state.selfLoadingUid = '';
    }
  }

  function heroMarkup(profile) {
    const photo = profile.photoDataUrl ? `<img src="${esc(profile.photoDataUrl)}" alt="">` : `<span>${esc(initials(profile.displayName))}</span>`;
    return `<section class="tt-admin-profile-hero">
      <div class="tt-admin-profile-avatar">${photo}</div>
      <div class="tt-admin-profile-identity">
        <span class="tt-admin-profile-eyebrow">MY TRINOTIME IDENTITY</span>
        <h3>${esc(profile.displayName || 'Administrator')}</h3>
        <div class="tt-admin-profile-chips"><span>${esc(profile.accessLabel || 'Admin')}</span><span>All PODs</span></div>
        <p>${esc(profile.jobTitle || 'Administration')}</p>
      </div>
      <button type="button" class="tt-admin-btn primary" data-admin-profile-edit>Edit Profile</button>
    </section>`;
  }

  function profileMarkup() {
    const p = state.profile;
    return `${heroMarkup(p)}
      <section class="tt-admin-profile-grid">
        <article><span>Email</span><strong>${esc(p.email || 'Admin account')}</strong><small>Bound to the authenticated Firebase account</small></article>
        <article><span>Admin title</span><strong>${esc(p.jobTitle || 'Administration')}</strong><small>Your professional role inside TrinoTime</small></article>
        <article><span>Contact</span><strong>${esc(p.contact || 'Not added')}</strong><small>Optional internal contact information</small></article>
        <article><span>Account role</span><strong>${esc(p.accessLabel || 'Admin')}</strong><small>Server-authoritative Admin access</small></article>
      </section>
      <section class="tt-admin-profile-account-callout"><div><span>ADMIN ACCOUNTS</span><strong>Manage separate Admin sign-ins</strong><p>View the Admin accounts registered in this environment and switch safely by signing out.</p></div><button type="button" class="tt-admin-btn" data-admin-open-accounts>View Admin Accounts</button></section>
      <section class="tt-admin-profile-about"><span>ABOUT</span><p>${esc(p.bio || 'Add a short professional description for your Admin profile.')}</p></section>`;
  }

  function editMarkup() {
    const p = state.profile;
    const photo = state.pendingPhoto === undefined ? (p.photoDataUrl || '') : state.pendingPhoto;
    const avatar = photo ? `<img src="${esc(photo)}" alt="Profile preview">` : `<span>${esc(initials(p.displayName))}</span>`;
    return `<form class="tt-admin-profile-edit" id="ttAdminProfileForm">
      <div class="tt-admin-profile-edit-avatar-row">
        <div class="tt-admin-profile-avatar large">${avatar}</div>
        <div>
          <strong>Profile photo</strong><p>Square photos work best. TrinoTime compresses the image before saving.</p>
          <div class="tt-admin-profile-form-actions compact"><label class="tt-admin-btn" for="ttAdminProfilePhoto">Choose Photo</label><input id="ttAdminProfilePhoto" type="file" accept="image/png,image/jpeg,image/webp" hidden><button type="button" class="tt-admin-btn" data-admin-photo-remove>Remove</button></div>
        </div>
      </div>
      <div class="tt-admin-profile-form-grid">
        <label><span>Display name</span><input name="displayName" maxlength="80" required value="${esc(p.displayName || '')}" autocomplete="name"></label>
        <label><span>Admin title</span><input name="jobTitle" maxlength="80" value="${esc(p.jobTitle || '')}" placeholder="e.g. Operations Administrator"></label>
        <label><span>Email</span><input value="${esc(p.email || '')}" readonly aria-readonly="true"><small>Managed by your Firebase sign-in.</small></label>
        <label><span>Contact</span><input name="contact" maxlength="80" value="${esc(p.contact || '')}" placeholder="Optional phone or internal contact"></label>
        <label class="wide"><span>About</span><textarea name="bio" maxlength="280" rows="4" placeholder="Short professional description">${esc(p.bio || '')}</textarea><small>Up to 280 characters.</small></label>
      </div>
      <div class="tt-admin-profile-form-actions"><button type="button" class="tt-admin-btn" data-admin-profile-cancel>Cancel</button><button type="submit" class="tt-admin-btn primary" ${state.busy?'disabled':''}>${state.busy?'Saving…':'Save Profile'}</button></div>
    </form>`;
  }

  function directoryMarkup() {
    if (state.directoryError) return `<div class="tt-admin-profile-empty tt-admin-profile-directory-error"><strong>Admin Accounts are temporarily unavailable</strong><p>${esc(state.directoryError)}</p><button type="button" class="tt-admin-btn primary" data-admin-directory-retry>Retry Admin Accounts</button></div>`;
    if (state.directoryLoading || state.directory === null) return `<div class="tt-admin-profile-loading"><span class="tt-admin-profile-spinner"></span><strong>Loading Admin Accounts…</strong><p>Only server-authorized Admin identities are shown.</p></div>`;
    if (!state.directory.length) return `<div class="tt-admin-profile-empty"><strong>No active Admin accounts found</strong><p>No server-authorized Admin identities were returned for this environment.</p></div>`;
    const oneOnly = state.directory.length === 1 ? `<aside class="tt-admin-directory-single" aria-label="Second Admin setup help">
      <div class="tt-admin-directory-single-copy"><strong>Only 1 Admin is configured in this environment.</strong><span>This is not an error. Your current account is valid; there simply is no Admin B to switch to yet.</span></div>

    </aside>` : '';
    const cards = state.directory.map((item, index) => {
      const avatar = item.photoDataUrl ? `<img src="${esc(item.photoDataUrl)}" alt="">` : `<span>${esc(initials(item.displayName))}</span>`;
      const accountLabel = item.isSelf ? 'CURRENT SESSION' : `ADMIN ACCOUNT ${index + 1}`;
      const profileState = item.profileReady ? 'Profile ready' : 'Profile not completed';
      const action = item.isSelf
        ? `<button type="button" class="tt-admin-account-action current" disabled aria-disabled="true">Current account</button>`
        : `<button type="button" class="tt-admin-account-action" data-admin-switch-account data-admin-switch-email="${esc(item.email || '')}">Sign out &amp; switch</button>`;
      return `<article class="tt-admin-directory-card ${item.isSelf?'is-self':''}">
        <div class="tt-admin-directory-card-top"><span class="tt-admin-account-slot">${esc(accountLabel)}</span>${item.isSelf?'<em class="tt-admin-you-chip">YOU</em>':''}</div>
        <div class="tt-admin-directory-main"><div class="tt-admin-profile-avatar small">${avatar}</div><div class="tt-admin-directory-copy"><div class="tt-admin-directory-name"><strong>${esc(item.displayName || 'Administrator')}</strong></div><span>${esc(item.jobTitle || `${item.accessLabel || 'Admin'} · Administration`)}</span><small>${esc(item.email || 'Admin email not available')}</small></div></div>
        <div class="tt-admin-directory-card-foot"><span>${esc(item.accessLabel || 'Admin')} · ${esc(profileState)}</span>${action}</div>
      </article>`;
    }).join('');
    return `<section class="tt-admin-directory-intro"><div><span>ADMIN ACCOUNTS</span><h3>${state.directory.length} active Admin account${state.directory.length===1?'':'s'}</h3><p>Each card is a separate Firebase sign-in. TrinoTime never impersonates one Admin from another Admin session.</p></div><button type="button" class="tt-admin-btn" data-admin-directory-retry>Refresh</button></section><div class="tt-admin-directory-grid">${cards}</div>${oneOnly}`;
  }

  function securityMarkup() {
    const p = state.profile;
    return `<section class="tt-admin-security-head"><span>SESSION &amp; PROTECTION</span><h3>Your Admin security</h3><p>Password and session controls remain on TrinoTime's existing authenticated Admin security layer.</p></section>
      <section class="tt-admin-profile-grid security">
        <article><span>Signed in as</span><strong>${esc(p.email || 'Admin account')}</strong></article>
        <article><span>Identity</span><strong>${esc(p.displayName || 'Administrator')}</strong></article>
        <article><span>Authorization</span><strong>${esc(p.accessLabel || 'Admin')}</strong><small>Rechecked by the server</small></article>
        <article><span>Profile storage</span><strong>Secure Admin profile</strong><small>UID-bound and revision protected</small></article>
      </section>
      <div class="tt-admin-security-actions"><button type="button" class="tt-admin-btn primary" data-admin-open-security>Open Password &amp; Session Controls</button><button type="button" class="tt-admin-btn danger" data-admin-signout>Switch / Sign Out</button></div>`;
  }

  function render() {
    ensureUi();
    const body = $('#ttAdminProfileBody');
    if (!body || !state.profile) return;
    document.querySelectorAll('[data-admin-profile-tab]').forEach(button => {
      const active = button.dataset.adminProfileTab === state.tab;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
      button.tabIndex = active ? 0 : -1;
    });
    if (state.tab === 'directory') body.innerHTML = directoryMarkup();
    else if (state.tab === 'security') body.innerHTML = securityMarkup();
    else body.innerHTML = state.editing ? editMarkup() : profileMarkup();
  }

  async function loadDirectory({force = false} = {}) {
    if (!state.authorized || !state.profile) return;
    if (state.directoryLoading) return;
    if (!force && state.directory !== null && !state.directoryError) return;
    const uid = state.authUid;
    const epoch = state.authEpoch;
    state.directoryLoading = true;
    state.directoryError = '';
    if (state.tab === 'directory') render();
    try {
      const data = await api('/api/workforce/profile/admin-directory', {method:'GET'});
      if (epoch !== state.authEpoch || currentAuthUid() !== uid) return;
      if (!Array.isArray(data?.items)) throw new Error('The Admin Accounts response was incomplete.');
      state.directory = data.items;
      state.directoryError = '';
    } catch (error) {
      if (epoch !== state.authEpoch || currentAuthUid() !== uid) return;
      state.directory = null;
      state.directoryError = error.message || 'Could not load the Admin Accounts.';
    } finally {
      if (epoch === state.authEpoch && currentAuthUid() === uid) {
        state.directoryLoading = false;
        if (state.tab === 'directory') render();
      }
    }
  }

  function showMessage(message, tone = 'info') {
    ensureUi();
    const overlay = $('#ttAdminProfileOverlay');
    let node = $('.tt-admin-profile-notice', overlay);
    if (!node) {
      node = document.createElement('div');
      node.className = 'tt-admin-profile-notice';
      overlay?.querySelector('.tt-admin-profile-modal')?.appendChild(node);
    }
    node.dataset.tone = tone;
    node.textContent = String(message || '');
    node.classList.add('show');
    if (state.noticeTimer) clearTimeout(state.noticeTimer);
    state.noticeTimer = setTimeout(() => {
      node.classList.remove('show');
      state.noticeTimer = 0;
    }, 3200);
  }

  async function compressPhoto(file) {
    if (!file || !/^image\/(?:png|jpeg|webp)$/i.test(file.type || '')) throw new Error('Choose a JPG, PNG, or WebP image.');
    if (file.size > 8 * 1024 * 1024) throw new Error('Choose an image smaller than 8 MB.');
    const objectUrl = URL.createObjectURL(file);
    let img;
    try {
      img = await new Promise((resolve, reject) => {
        const image = new Image();
        image.decoding = 'async';
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Could not decode that image.'));
        image.src = objectUrl;
      });
      const width = Number(img.naturalWidth) || 0, height = Number(img.naturalHeight) || 0;
      if (!width || !height) throw new Error('Could not read that image size.');
      if (width > 8192 || height > 8192 || width * height > 24000000) throw new Error('That photo has extremely large dimensions. Choose a photo up to 24 megapixels.');
      const side = Math.max(1, Math.min(width, height));
      const sx = Math.max(0, (width - side) / 2), sy = Math.max(0, (height - side) / 2);
      const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 256;
      const ctx = canvas.getContext('2d', {alpha:false}); if (!ctx) throw new Error('Image processing is not available in this browser.');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, sx, sy, side, side, 0, 0, 256, 256);
      let result = '';
      for (const quality of [.82,.72,.62,.52]) {
        result = canvas.toDataURL('image/webp', quality);
        if (result.length <= 90000) break;
      }
      if (!result || result.length > 95000) throw new Error('That photo is still too large after compression. Choose another image.');
      return result;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  async function saveForm(form) {
    if (state.busy || !state.authorized || !state.profile) return;
    const uid = state.authUid;
    const epoch = state.authEpoch;
    const data = new FormData(form);
    const payload = {
      displayName: String(data.get('displayName') || '').trim(),
      jobTitle: String(data.get('jobTitle') || '').trim(),
      contact: String(data.get('contact') || '').trim(),
      bio: String(data.get('bio') || '').trim(),
      photoDataUrl: state.pendingPhoto === undefined ? (state.profile.photoDataUrl || '') : (state.pendingPhoto || '')
    };
    if (payload.displayName.length < 2) { showMessage('Enter the Admin display name.', 'error'); return; }
    const expectedRevision = Number(state.profile.revision) || 0;
    state.busy = true; render();
    try {
      const result = await api('/api/workforce/profile/admin-self', {method:'POST', body:JSON.stringify({expectedRevision, profile:payload})});
      if (epoch !== state.authEpoch || currentAuthUid() !== uid) return;
      if (result.conflict) {
        if (!result.profile || String(result.profile.uid || '') !== uid) throw new Error('The conflicting Admin profile could not be verified for this account.');
        state.profile = result.profile;
        state.editing = true;
        state.pendingPhoto = undefined;
        showMessage('This Admin profile changed in another session. The newest version was loaded.', 'error');
        return;
      }
      if (result?.saved !== true || !result?.profile || String(result.profile.uid || '') !== uid) throw new Error('The saved Admin profile could not be verified for this account.');
      state.profile = result.profile;
      state.directory = null;
      state.directoryError = '';
      state.editing = false;
      state.pendingPhoto = undefined;
      applyHeaderIdentityBounded();
      window.dispatchEvent(new CustomEvent('trinotime:admin-profile-updated', {detail:{profile:{...state.profile}}}));
      showMessage('Admin profile saved.', 'success');
    } catch (error) {
      if (epoch !== state.authEpoch || currentAuthUid() !== uid) return;
      showMessage(error.message || 'Could not save the Admin profile.', 'error');
    } finally {
      if (epoch === state.authEpoch && currentAuthUid() === uid) {
        state.busy = false;
        render();
      }
    }
  }

  document.addEventListener('click', event => {
    const header = event.target.closest?.('#agentProfileHeaderBtn');
    if (!header) return;
    if (state.allowCoreOnce) { state.allowCoreOnce = false; return; }
    if (!headerLooksAdmin()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (state.authorized) applyHeaderIdentity();
    void requestOpen('profile');
  }, true);

  document.addEventListener('click', event => {
    const close = event.target.closest?.('[data-admin-profile-close]');
    if (close) { closeUi(); return; }
    const overlay = $('#ttAdminProfileOverlay');
    if (event.target === overlay) { closeUi(); return; }
    if (event.target.closest?.('[data-admin-open-retry]')) { state.openRequested=true; showOverlay(); renderOpenLoading('Retrying Admin verification…'); void requestOpen(state.requestedTab || 'profile'); return; }
    if (event.target.closest?.('[data-admin-open-core-security]')) { const headerBtn=$('#agentProfileHeaderBtn'); closeUi(); if(headerBtn){state.allowCoreOnce=true; headerBtn.click(); if(state.allowCoreOnce)state.allowCoreOnce=false;} return; }
    if (!state.authorized) return;
    const tab = event.target.closest?.('[data-admin-profile-tab]');
    if (tab) {
      state.tab = tab.dataset.adminProfileTab || 'profile'; state.editing = false; state.pendingPhoto = undefined; render();
      if (state.tab === 'directory') void loadDirectory();
      return;
    }
    if (event.target.closest?.('[data-admin-directory-retry]')) { void loadDirectory({force:true}); return; }
    if (event.target.closest?.('[data-admin-open-accounts]')) { state.tab='directory'; state.editing=false; state.pendingPhoto=undefined; render(); void loadDirectory(); return; }
    const switchAccount = event.target.closest?.('[data-admin-switch-account]');
    if (switchAccount) {
      const email = String(switchAccount.dataset.adminSwitchEmail || '').trim();
      const logout = $('#sessionLogoutBtn');
      if (!logout) { showMessage('Sign-out controls are still loading. Try again in a moment.', 'error'); return; }
      if (email) {
        try { sessionStorage.setItem('trinotime:admin-switch-email:v1', email); } catch (_) {}
        const gateEmail = $('#gateAdminEmail');
        if (gateEmail) gateEmail.value = email;
      }
      closeUi();
      logout.click();
      return;
    }
    if (event.target.closest?.('[data-admin-profile-edit]')) { state.tab='profile'; state.editing=true; state.pendingPhoto=undefined; render(); return; }
    if (event.target.closest?.('[data-admin-profile-cancel]')) { state.editing=false; state.pendingPhoto=undefined; render(); return; }
    if (event.target.closest?.('[data-admin-photo-remove]')) { state.pendingPhoto=''; render(); return; }
    if (event.target.closest?.('[data-admin-open-security]')) {
      const headerBtn = $('#agentProfileHeaderBtn');
      if (!headerBtn) { showMessage('Admin security controls are still loading. Try again in a moment.', 'error'); return; }
      closeUi();
      state.allowCoreOnce = true;
      headerBtn.click();
      if (state.allowCoreOnce) state.allowCoreOnce = false;
      return;
    }
    if (event.target.closest?.('[data-admin-signout]')) {
      const logout = $('#sessionLogoutBtn');
      if (!logout) { showMessage('Sign-out controls are still loading. Try again in a moment.', 'error'); return; }
      closeUi(); logout.click(); return;
    }
  });

  document.addEventListener('change', async event => {
    if (event.target?.id !== 'ttAdminProfilePhoto') return;
    const file = event.target.files?.[0]; if (!file) return;
    const uid = state.authUid, epoch = state.authEpoch;
    try {
      const prepared = await compressPhoto(file);
      if (epoch !== state.authEpoch || currentAuthUid() !== uid || !state.authorized || !state.editing) return;
      state.pendingPhoto = prepared;
      render();
    } catch (error) {
      if (epoch !== state.authEpoch || currentAuthUid() !== uid) return;
      showMessage(error.message || 'Could not prepare that photo.', 'error');
      if (event.target?.isConnected) event.target.value='';
    }
  });

  document.addEventListener('submit', event => {
    if (event.target?.id !== 'ttAdminProfileForm') return;
    event.preventDefault(); void saveForm(event.target);
  });

  document.addEventListener('keydown', event => {
    const overlay = $('#ttAdminProfileOverlay');
    if (!overlay?.classList.contains('open')) return;
    if (event.key === 'Escape') { event.preventDefault(); closeUi(); return; }
    const tab = event.target.closest?.('[data-admin-profile-tab]');
    if (!tab || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault();
    const tabs = Array.from(document.querySelectorAll('[data-admin-profile-tab]'));
    const index = tabs.indexOf(tab);
    const next = event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
    tabs[next]?.click(); tabs[next]?.focus({preventScroll:true});
  });

  function hookAuth() {
    if (state.authHooked) return true;
    const auth = window.firebase?.auth?.();
    if (!auth?.onAuthStateChanged) return false;
    state.authHooked = true;
    auth.onAuthStateChanged(user => {
      if (!user || user.isAnonymous) { clearAdminIdentity(); return; }
      const uid = String(user.uid || '');
      if (roleHintIsKnownNonAdmin()) { markNonAdminIdentity(uid); return; }
      if (uid !== state.authUid) { beginIdentityTransition(uid); void loadSelf({silent:true}); }
      else if ((!state.authorized || !state.profile) && state.deniedUid !== uid) void loadSelf({silent:true});
      else applyHeaderIdentityBounded();
    });
    return true;
  }

  function recoverAuthHook() {
    if (!hookAuth()) return false;
    const user = currentAuthUser();
    if (user && !user.isAnonymous) {
      const uid = String(user.uid || '');
      if (roleHintIsKnownNonAdmin()) { markNonAdminIdentity(uid); return true; }
      if (roleHintIsAdmin()) {
        state.deniedUid = '';
        if ((!state.authorized || state.authUid !== uid) && state.deniedUid !== uid) void loadSelf({silent:true});
      }
      // Unknown/transitional roles wait for the RC82 server-authoritative bootstrap
      // instead of probing the Admin-only endpoint and creating harmless 403 noise.
    }
    return true;
  }

  function init() {
    ensureUi();
    recoverAuthHook();
    // Bounded startup recovery only (not polling): catches the short gate → Admin role transition
    // and late Firebase initialization without adding a background loop.
    [250, 1000, 2500, 5000].forEach(delay => setTimeout(recoverAuthHook, delay));
  }

  window.addEventListener('focus', applyHeaderIdentity);
  window.addEventListener('load', recoverAuthHook, {once:true});
  document.addEventListener('visibilitychange', () => { if (!document.hidden) applyHeaderIdentity(); });
  window.addEventListener('trinotime:admin-profile-updated', applyHeaderIdentity);
  window.addEventListener('trinotime:profile-display-name-updated', applyHeaderIdentity);
  window.addEventListener('trinotime:reward-projections-updated', applyHeaderIdentity);
  document.addEventListener('trinotime:admin-view-change', applyHeaderIdentity);
  window.addEventListener('trinotime:attendance-projection-change', applyHeaderIdentity);
  window.addEventListener('trinotime:attendance-live-change', applyHeaderIdentity);
  window.addEventListener('trinotime:workforce-auth-ready', () => {
    if (!recoverAuthHook()) return;
    if (state.authorized) applyHeaderIdentityBounded();
  });
  window.addEventListener('trinotime:admin-authority-ready', event => {
    const detail = event?.detail || {};
    const uid = String(detail.uid || '');
    if (!uid || uid !== currentAuthUid()) return;
    if (detail.isAdmin !== true) { markNonAdminIdentity(uid); return; }
    const profile = detail.profile && typeof detail.profile === 'object' ? detail.profile : null;
    if (!profile || String(profile.uid || '') !== uid) return;
    if (state.authUid !== uid) beginIdentityTransition(uid);
    state.deniedUid = '';
    state.authorized = true;
    state.authUid = uid;
    state.profile = profile;
    state.directory = null;
    state.directoryError = '';
    state.directoryLoading = false;
    applyHeaderIdentityBounded();
    try { window.dispatchEvent(new CustomEvent('trinotime:admin-profile-ready', {detail:{profile:{...profile}}})); } catch (_) {}
    if (state.openRequested) {
      const requested = state.requestedTab || 'profile';
      queueMicrotask(() => { if (state.authorized && state.profile) { openUi(requested); if (requested === 'directory') void loadDirectory(); } });
    }
  }, {passive:true});
  window.TrinoTimeAdminProfile = Object.freeze({open:(tab='profile') => requestOpen(tab), refresh:() => loadSelf({silent:false}), refreshAccounts:() => loadDirectory({force:true}), current:() => state.profile ? {...state.profile} : null, accounts:() => state.directory ? state.directory.map(item => ({...item})) : null});

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true}); else init();
})();
