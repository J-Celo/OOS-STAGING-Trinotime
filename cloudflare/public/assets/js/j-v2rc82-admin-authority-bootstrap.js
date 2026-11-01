(() => {
  'use strict';

  const MIN_PASSWORD = 10;
  const MAX_PASSWORD = 128;
  const SYNC_CHANNEL = 'trinotime-admin-security-sync-v1';
  const SYNC_STORAGE_KEY = 'trinotime:admin-security-sync:v1';
  const state = {
    uid: '',
    required: false,
    baselineProfile: null,
    baselineExists: true,
    saving: false,
    passwordUpdated: false,
    authHooked: false,
    authEpoch: 0,
    verifyUid: '',
    verifyPromise: null,
    gateRequested: false,
    checkOverlayMode: '',
    appLock: null,
    syncSource: '',
    syncChannel: null,
    securityUnresolved: false
  };

  const $ = id => document.getElementById(id);
  const currentUser = () => window.firebase?.auth?.().currentUser || null;
  const currentUid = () => String(currentUser()?.uid || '');
  const roleHint = () => String(document.body?.dataset?.trinoRole || '').trim().toLowerCase().replace(/[ -]+/g, '_');
  const roleHintIsAdmin = () => ['admin', 'owner'].includes(roleHint());
  const roleHintIsKnownNonAdmin = () => Boolean(roleHint() && !roleHintIsAdmin());
  const adminHeaderLooksReady = () => {
    const role = String($('agentProfileHeaderRole')?.textContent || '').toLowerCase();
    const name = String($('agentProfileHeaderName')?.textContent || '').trim().toLowerCase();
    return role.includes('administration') || name === 'administrator' || $('agentProfileHeaderBtn')?.dataset?.adminPersonalProfile === 'true';
  };
  const shouldGate = () => roleHintIsAdmin() || adminHeaderLooksReady();

  function randomSource() {
    try { return crypto.randomUUID(); } catch (_) { return `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
  }

  function ensurePolicyUi() {
    const newInput = $('adminPasswordNew');
    const confirmInput = $('adminPasswordConfirm');
    if (newInput) { newInput.minLength = MIN_PASSWORD; newInput.maxLength = MAX_PASSWORD; }
    if (confirmInput) { confirmInput.minLength = MIN_PASSWORD; confirmInput.maxLength = MAX_PASSWORD; }
    const box = $('adminPasswordOverlay')?.querySelector('.agent-password-box');
    if (!box) return;
    let note = box.querySelector('.tt-admin-password-policy-note');
    if (!note) {
      note = document.createElement('div');
      note.className = 'tt-admin-password-policy-note';
      note.textContent = `Use at least ${MIN_PASSWORD} characters. This password belongs only to the currently signed-in Admin account.`;
      const actions = box.querySelector('.agent-password-actions');
      if (actions) box.insertBefore(note, actions); else box.appendChild(note);
    } else {
      note.textContent = `Use at least ${MIN_PASSWORD} characters. This password belongs only to the currently signed-in Admin account.`;
    }
  }

  function setStatus(message, tone = 'info') {
    const box = $('adminPasswordOverlay')?.querySelector('.agent-password-box');
    if (!box) return;
    let status = box.querySelector('.tt-admin-password-policy-status');
    if (!status) {
      status = document.createElement('div');
      status.className = 'tt-admin-password-policy-status';
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      const actions = box.querySelector('.agent-password-actions');
      if (actions) box.insertBefore(status, actions); else box.appendChild(status);
    }
    status.dataset.tone = tone;
    status.textContent = String(message || '');
    status.hidden = !message;
  }

  function ensureCheckOverlay() {
    let overlay = $('ttAdminSecurityCheckOverlay');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'ttAdminSecurityCheckOverlay';
    overlay.className = 'tt-admin-security-check-overlay';
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `
      <div class="tt-admin-security-check-card" role="dialog" aria-modal="true" aria-labelledby="ttAdminSecurityCheckTitle">
        <span class="tt-admin-security-check-spinner" aria-hidden="true"></span>
        <h3 id="ttAdminSecurityCheckTitle">Checking Admin security…</h3>
        <p data-admin-security-check-message>Confirming this Admin account before the workspace becomes available.</p>
        <div class="tt-admin-security-check-actions" hidden>
          <button type="button" class="tt-admin-security-check-btn primary" data-admin-security-retry>Retry</button>
          <button type="button" class="tt-admin-security-check-btn" data-admin-security-signout>Sign Out</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    return overlay;
  }

  function lockAppBackground() {
    const app = $('appRoot');
    if (!app) return;
    state.appLock = {locked:true};
    app.dataset.ttAdminSecurityLock = '1';
    try { app.inert = true; } catch (_) { app.setAttribute('inert', ''); }
    app.setAttribute('inert', '');
    app.setAttribute('aria-hidden', 'true');
    document.body?.classList.add('tt-admin-security-gated');
  }

  function unlockAppBackground(expectedUid = state.uid) {
    const app = $('appRoot');
    const lockedByUs = Boolean(state.appLock || app?.dataset?.ttAdminSecurityLock === '1');
    state.appLock = null;
    document.body?.classList.remove('tt-admin-security-gated');
    if (!lockedByUs || !app) return;
    // Never override the core logout/login gate. Only restore a live authenticated workspace
    // after the core shell has identified a role or made the app visible.
    const sameLiveSession = Boolean(expectedUid && currentUid() === expectedUid);
    const coreWorkspaceReady = Boolean(roleHint() || app.style.visibility !== 'hidden');
    if (!sameLiveSession || !coreWorkspaceReady) return;
    delete app.dataset.ttAdminSecurityLock;
    try { app.inert = false; } catch (_) {}
    app.removeAttribute('inert');
    app.setAttribute('aria-hidden', 'false');
  }

  function showCheckingGate(mode = 'checking', message = '') {
    if (!shouldGate() && mode === 'checking') return;
    const overlay = ensureCheckOverlay();
    const title = overlay.querySelector('h3');
    const copy = overlay.querySelector('[data-admin-security-check-message]');
    const actions = overlay.querySelector('.tt-admin-security-check-actions');
    const spinner = overlay.querySelector('.tt-admin-security-check-spinner');
    state.checkOverlayMode = mode;
    lockAppBackground();
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    if (mode === 'error') {
      if (title) title.textContent = 'Admin security check needs attention';
      if (copy) copy.textContent = message || 'TrinoTime could not confirm this Admin account yet. Retry when the connection is available.';
      if (actions) actions.hidden = false;
      if (spinner) spinner.hidden = true;
      requestAnimationFrame(() => overlay.querySelector('[data-admin-security-retry]')?.focus({preventScroll:true}));
    } else {
      if (title) title.textContent = 'Checking Admin security…';
      if (copy) copy.textContent = message || 'Confirming this Admin account before the workspace becomes available.';
      if (actions) actions.hidden = true;
      if (spinner) spinner.hidden = false;
    }
  }

  function hideCheckingGate({unlock = true, expectedUid = state.uid} = {}) {
    const overlay = $('ttAdminSecurityCheckOverlay');
    if (overlay) {
      overlay.hidden = true;
      overlay.setAttribute('aria-hidden', 'true');
    }
    state.checkOverlayMode = '';
    if (unlock) unlockAppBackground(expectedUid);
  }

  function clearPasswordFields() {
    ['adminPasswordCurrent','adminPasswordNew','adminPasswordConfirm'].forEach(id => {
      const el = $(id);
      if (el) { el.value = ''; el.disabled = false; el.readOnly = false; }
    });
  }

  function closePasswordOverlayForIdentityReset({unlock = false, expectedUid = ''} = {}) {
    const overlay = $('adminPasswordOverlay');
    overlay?.classList.remove('open', 'tt-admin-first-login-required', 'tt-admin-setup-finish-only');
    overlay?.setAttribute('aria-hidden', 'true');
    clearPasswordFields();
    setStatus('');
    state.required = false;
    state.passwordUpdated = false;
    document.body?.classList.remove('tt-admin-first-login-password-required');
    if (unlock) unlockAppBackground(expectedUid);
  }

  function setForcedMode(required) {
    state.required = Boolean(required);
    const overlay = $('adminPasswordOverlay');
    const title = $('adminPasswordTitle');
    const sub = overlay?.querySelector('.agent-password-sub');
    const cancel = $('adminPasswordCancelBtn');
    if (!overlay) return;
    overlay.classList.toggle('tt-admin-first-login-required', state.required);
    if (!state.required) overlay.classList.remove('tt-admin-setup-finish-only');
    document.body?.classList.toggle('tt-admin-first-login-password-required', state.required);
    if (state.required) {
      if (title) title.textContent = 'Create Your Admin Password';
      if (sub) sub.textContent = `First sign-in setup: enter your current Firebase password, then create your own private password with at least ${MIN_PASSWORD} characters.`;
      if (cancel) cancel.textContent = 'Sign Out Instead';
    } else {
      if (title) title.textContent = 'Change Admin Password';
      if (sub) sub.textContent = 'Re-enter your current Firebase Admin password, then choose a new private password for this Admin account.';
      if (cancel) cancel.textContent = 'Cancel';
    }
  }

  function syncFinishOnlyUi() {
    const overlay = $('adminPasswordOverlay');
    const finishOnly = Boolean(state.required && state.passwordUpdated);
    overlay?.classList.toggle('tt-admin-setup-finish-only', finishOnly);
    const sub = overlay?.querySelector('.agent-password-sub');
    if (finishOnly && sub) sub.textContent = 'Your new password is already active. Finish synchronizing this Admin profile; TrinoTime will not rotate the password again.';
    ['adminPasswordCurrent','adminPasswordNew','adminPasswordConfirm'].forEach(id => {
      const el = $(id);
      if (el && finishOnly) { el.value = ''; el.disabled = true; }
    });
    const saveBtn = $('adminPasswordSaveBtn');
    if (saveBtn && finishOnly && !state.saving) saveBtn.textContent = 'Retry Setup';
  }

  function openRequiredModal(message = 'Password setup is required before using this new Admin profile.') {
    ensurePolicyUi();
    hideCheckingGate({unlock:false});
    lockAppBackground();
    setForcedMode(true);
    clearPasswordFields();
    syncFinishOnlyUi();
    const overlay = $('adminPasswordOverlay');
    if (!overlay) return;
    if (overlay.parentElement !== document.body) document.body.appendChild(overlay);
    try { overlay.inert = false; } catch (_) { overlay.removeAttribute('inert'); }
    overlay.removeAttribute('inert');
    overlay.setAttribute('aria-hidden', 'false');
    overlay.classList.add('open');
    setStatus(message, 'required');
    requestAnimationFrame(() => {
      const target = state.passwordUpdated ? $('adminPasswordSaveBtn') : $('adminPasswordCurrent');
      target?.focus({preventScroll:true});
    });
  }

  function closeModalAfterSuccess(expectedUid = state.uid) {
    const overlay = $('adminPasswordOverlay');
    overlay?.classList.remove('open');
    overlay?.setAttribute('aria-hidden', 'true');
    setForcedMode(false);
    setStatus('');
    clearPasswordFields();
    unlockAppBackground(expectedUid);
  }

  function sessionMarkerKey(uid) { return `trinotime:admin-first-password-updated:v3:${uid}`; }
  function markPasswordUpdatedLocally(uid) {
    const payload = JSON.stringify({at:Date.now()});
    try { sessionStorage.setItem(sessionMarkerKey(uid), payload); } catch (_) {}
    try { localStorage.setItem(sessionMarkerKey(uid), payload); } catch (_) {}
  }
  function clearPasswordUpdatedLocally(uid) {
    try { sessionStorage.removeItem(sessionMarkerKey(uid)); } catch (_) {}
    try { localStorage.removeItem(sessionMarkerKey(uid)); } catch (_) {}
  }
  function wasPasswordUpdatedLocally(uid) {
    const maxAgeMs = 24 * 60 * 60 * 1000;
    for (const store of [sessionStorage, localStorage]) {
      try {
        const raw = store.getItem(sessionMarkerKey(uid));
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        const at = Number(parsed?.at || 0);
        if (at > 0 && Date.now() - at <= maxAgeMs) return true;
        store.removeItem(sessionMarkerKey(uid));
      } catch (_) {}
    }
    return false;
  }

  async function apiForUser(user, expectedUid, path, options = {}, forceToken = false) {
    if (!user || user.isAnonymous || String(user.uid || '') !== String(expectedUid || '')) throw Object.assign(new Error('Admin session changed.'), {code:'ADMIN_SESSION_CHANGED'});
    if (currentUid() !== String(expectedUid || '')) throw Object.assign(new Error('Admin session changed.'), {code:'ADMIN_SESSION_CHANGED'});
    const token = await user.getIdToken(forceToken);
    if (currentUid() !== String(expectedUid || '')) throw Object.assign(new Error('Admin session changed.'), {code:'ADMIN_SESSION_CHANGED'});
    const headers = new Headers(options.headers || {});
    headers.set('Authorization', `Bearer ${token}`);
    headers.set('Accept', 'application/json');
    if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json; charset=utf-8');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);
    let response;
    try {
      response = await fetch(path, {...options, headers, cache:'no-store', signal:controller.signal});
    } catch (error) {
      if (error?.name === 'AbortError') throw Object.assign(new Error('Admin security check timed out. Check the connection and retry.'), {code:'ADMIN_REQUEST_TIMEOUT'});
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
    const data = await response.json().catch(() => ({}));
    if (currentUid() !== String(expectedUid || '')) throw Object.assign(new Error('Admin session changed.'), {code:'ADMIN_SESSION_CHANGED'});
    if (!response.ok) {
      const error = new Error(data.message || 'Admin request failed.');
      error.status = response.status;
      error.code = data.error || '';
      throw error;
    }
    return data;
  }

  async function readAdminState(user, expectedUid, forceToken = false) {
    // RC82: use a non-Admin-safe bootstrap endpoint. Genuine Labeler/Agent/TL
    // sessions receive a normal 200 {isAdmin:false} response instead of a noisy
    // 403 from the Admin-only self endpoint. Admins still receive the same
    // UID-bound profile/exists authority needed for first-login enforcement.
    // UX18P33: one bounded, UID-checked retry for a temporary Admin-service outage.
    // Do not retry permission denials or mistake network failures for non-Admin status.
    let data;
    try {
      data = await apiForUser(user, expectedUid, '/api/workforce/profile/admin-bootstrap', {method:'GET'}, forceToken);
    } catch (error) {
      const code=String(error?.code||'');
      const transient=Number(error?.status)===503 || code==='ADMIN_REQUEST_TIMEOUT';
      if(!transient)throw error;
      await new Promise(resolve=>setTimeout(resolve,550));
      if(currentUid()!==String(expectedUid)||String(user?.uid||'')!==String(expectedUid))throw Object.assign(new Error('Admin session changed.'),{code:'ADMIN_SESSION_CHANGED'});
      data = await apiForUser(user, expectedUid, '/api/workforce/profile/admin-bootstrap', {method:'GET'}, forceToken);
    }
    if (data?.isAdmin !== true) return {ok:true,isAdmin:false,uid:String(expectedUid),profile:null,exists:false};
    if (!data?.profile || String(data.profile.uid || '') !== String(expectedUid)) throw new Error('The Admin profile response could not be verified for this account.');
    return data;
  }

  async function bootstrapAdminProfile(user, expectedUid, profile) {
    const safe = profile && typeof profile === 'object' ? profile : {};
    const payload = {
      displayName: String(safe.displayName || 'Administrator').trim() || 'Administrator',
      jobTitle: String(safe.jobTitle || '').trim(),
      contact: String(safe.contact || '').trim(),
      bio: String(safe.bio || '').trim(),
      photoDataUrl: String(safe.photoDataUrl || '')
    };
    const result = await apiForUser(user, expectedUid, '/api/workforce/profile/admin-self', {
      method:'POST',
      body:JSON.stringify({expectedRevision:Math.max(0, Number(safe.revision) || 0), profile:payload})
    }, true);
    if (result?.saved === true && result?.profile && String(result.profile.uid || '') === String(expectedUid)) return result.profile;
    if (result?.conflict === true && result?.profile && String(result.profile.uid || '') === String(expectedUid)) return result.profile;
    throw new Error('The new Admin profile could not be initialized after the password update.');
  }

  function assertSameOperation(uid, epoch) {
    if (String(uid || '') !== currentUid() || epoch !== state.authEpoch || String(uid || '') !== String(state.uid || '')) {
      throw Object.assign(new Error('Admin session changed.'), {code:'ADMIN_SESSION_CHANGED'});
    }
  }

  async function finishRequiredSetupAfterPasswordChange(user, uid, epoch) {
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        assertSameOperation(uid, epoch);
        const profile = await bootstrapAdminProfile(user, uid, state.baselineProfile || {});
        assertSameOperation(uid, epoch);
        state.baselineProfile = profile;
        state.baselineExists = true;
        state.passwordUpdated = false;
        clearPasswordUpdatedLocally(uid);
        state.required = false;
        window.dispatchEvent(new CustomEvent('trinotime:admin-profile-updated', {detail:{profile:{...profile}}}));
        sendSync('security-complete', {uid, revision:Number(profile.revision)||0});
        return true;
      } catch (error) {
        lastError = error;
        if (error?.code === 'ADMIN_SESSION_CHANGED') throw error;
        if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 350 * (attempt + 1)));
      }
    }
    throw lastError || new Error('Could not finish the Admin first-login setup.');
  }

  async function verifyAdminAndFirstLogin(user, {force = false, requestGate = false} = {}) {
    const uid = String(user?.uid || '');
    if (!uid || user?.isAnonymous) return false;
    // RC81: never use a client-side role hint to skip the server-authoritative
    // Admin probe. During sign-in the shell legitimately uses transitional values
    // such as `gate` and `agent-pending`, and a stale previous-account role can
    // survive briefly across an auth switch. The admin-self endpoint is the authority.
    state.gateRequested = state.gateRequested || Boolean(requestGate) || shouldGate();
    if (state.verifyPromise && state.verifyUid === uid) {
      if (state.gateRequested) showCheckingGate('checking');
      return state.verifyPromise;
    }
    const epoch = state.authEpoch;
    state.verifyUid = uid;
    if (state.gateRequested) showCheckingGate('checking');
    const promise = (async () => {
      try {
        const data = await readAdminState(user, uid, force);
        if (epoch !== state.authEpoch || currentUid() !== uid) return false;
        state.securityUnresolved = false;
        if (data?.isAdmin !== true) {
          state.baselineProfile = null;
          state.baselineExists = true;
          state.passwordUpdated = false;
          closePasswordOverlayForIdentityReset({unlock:false});
          hideCheckingGate({unlock:true, expectedUid:uid});
          try { window.dispatchEvent(new CustomEvent('trinotime:admin-authority-ready', {detail:{uid,isAdmin:false}})); } catch (_) {}
          return false;
        }
        state.baselineProfile = data.profile;
        state.baselineExists = data.exists === true;
        try { window.dispatchEvent(new CustomEvent('trinotime:admin-authority-ready', {detail:{uid,isAdmin:true,profile:{...data.profile},exists:state.baselineExists}})); } catch (_) {}
        if (!state.baselineExists) {
          if (wasPasswordUpdatedLocally(uid)) {
            state.passwordUpdated = true;
            showCheckingGate('checking', 'Your password is updated. Finishing the Admin profile setup…');
            try {
              await finishRequiredSetupAfterPasswordChange(user, uid, epoch);
              if (epoch !== state.authEpoch || currentUid() !== uid) return false;
              hideCheckingGate({unlock:false});
              closeModalAfterSuccess(uid);
              return true;
            } catch (error) {
              if (error?.code === 'ADMIN_SESSION_CHANGED') return false;
              hideCheckingGate({unlock:false});
              openRequiredModal('Your password was already updated. Choose Retry Setup to finish synchronizing this Admin account.');
              syncFinishOnlyUi();
              return true;
            }
          }
          openRequiredModal();
        } else {
          state.passwordUpdated = false;
          clearPasswordUpdatedLocally(uid);
          setForcedMode(false);
          closePasswordOverlayForIdentityReset({unlock:false});
          hideCheckingGate({unlock:true, expectedUid:uid});
        }
        return true;
      } catch (error) {
        if (epoch !== state.authEpoch || currentUid() !== uid) return false;
        if ([401,403].includes(Number(error?.status))) {
          state.securityUnresolved = false;
          closePasswordOverlayForIdentityReset({unlock:false});
          hideCheckingGate({unlock:true, expectedUid:uid});
          return false;
        }
        state.securityUnresolved = true;
        if (state.gateRequested || shouldGate()) {
          showCheckingGate('error', error?.message || 'TrinoTime could not confirm this Admin account yet.');
        } else {
          console.warn('[TrinoTime RC82] Admin first-login security check failed:', error?.message || error);
        }
        return false;
      } finally {
        if (state.verifyPromise === promise) {
          state.verifyPromise = null;
          state.verifyUid = '';
          state.gateRequested = false;
        }
      }
    })();
    state.verifyPromise = promise;
    return promise;
  }

  function setSavingUi(saving, requiredLabel = '') {
    const saveBtn = $('adminPasswordSaveBtn');
    const cancelBtn = $('adminPasswordCancelBtn');
    const finishOnly = Boolean(state.required && state.passwordUpdated);
    ['adminPasswordCurrent','adminPasswordNew','adminPasswordConfirm'].forEach(id => { const el=$(id); if(el) el.disabled = Boolean(saving || finishOnly); });
    if (saveBtn) saveBtn.disabled = Boolean(saving);
    if (cancelBtn) cancelBtn.disabled = Boolean(saving);
    if (!saving && saveBtn) saveBtn.textContent = requiredLabel || (state.required ? (finishOnly ? 'Retry Setup' : 'Create Password') : 'Update Password');
    syncFinishOnlyUi();
  }

  async function updateAdminPassword() {
    if (state.saving) return;
    ensurePolicyUi();
    const user = currentUser();
    const uid = String(user?.uid || '');
    const epoch = state.authEpoch;
    if (!user || user.isAnonymous || !user.email || !uid) { setStatus('Your Firebase Admin session is not available. Sign in again.', 'error'); return; }
    if (uid !== state.uid) { setStatus('This Admin session changed. Sign in again.', 'error'); return; }

    const finishOnly = Boolean(state.required && (state.passwordUpdated || wasPasswordUpdatedLocally(uid)));
    let passwordCommitted = false;
    if (!finishOnly) {
      const current = $('adminPasswordCurrent')?.value || '';
      const next = $('adminPasswordNew')?.value || '';
      const confirm = $('adminPasswordConfirm')?.value || '';
      if (!current) { setStatus('Enter your current Admin password.', 'error'); return; }
      if (next.length < MIN_PASSWORD) { setStatus(`New password must be at least ${MIN_PASSWORD} characters.`, 'error'); return; }
      if (next.length > MAX_PASSWORD) { setStatus(`New password must be ${MAX_PASSWORD} characters or fewer.`, 'error'); return; }
      if (next !== confirm) { setStatus('New password and confirmation do not match.', 'error'); return; }
      if (next === current) { setStatus('Choose a new password that is different from your current password.', 'error'); return; }
    }

    state.saving = true;
    setSavingUi(true);
    try {
      assertSameOperation(uid, epoch);
      if (finishOnly) {
        state.passwordUpdated = true;
        setStatus('Finishing your Admin setup…', 'info');
        const saveBtn = $('adminPasswordSaveBtn'); if (saveBtn) saveBtn.textContent = 'Finishing…';
        await finishRequiredSetupAfterPasswordChange(user, uid, epoch);
        assertSameOperation(uid, epoch);
        closeModalAfterSuccess(uid);
        showSuccessToast('Admin setup synchronized.');
        return;
      }

      const current = $('adminPasswordCurrent')?.value || '';
      const next = $('adminPasswordNew')?.value || '';
      const saveBtn = $('adminPasswordSaveBtn');
      if (saveBtn) saveBtn.textContent = 'Verifying…';
      setStatus('Re-verifying this Admin account…', 'info');
      const credential = window.firebase.auth.EmailAuthProvider.credential(user.email, String(current));
      await user.reauthenticateWithCredential(credential);
      assertSameOperation(uid, epoch);
      await readAdminState(user, uid, true); // Server-authoritative active Admin verification.
      assertSameOperation(uid, epoch);

      if (saveBtn) saveBtn.textContent = 'Updating…';
      setStatus('Updating your private Admin password…', 'info');
      await user.updatePassword(String(next));
      passwordCommitted = true;
      assertSameOperation(uid, epoch);
      const wasRequired = state.required;
      if (wasRequired) {
        // Commit the recovery marker immediately after Firebase confirms the mutation so a
        // transient post-write network failure never causes a second password rotation.
        state.passwordUpdated = true;
        markPasswordUpdatedLocally(uid);
        sendSync('password-committed', {uid});
      }
      try { await user.getIdToken(true); } catch (_) {}
      await readAdminState(user, uid, true); // Reconfirm role after credential mutation.
      assertSameOperation(uid, epoch);

      if (wasRequired) {
        if (saveBtn) saveBtn.textContent = 'Finishing…';
        setStatus('Password updated. Synchronizing first-login setup…', 'success');
        await finishRequiredSetupAfterPasswordChange(user, uid, epoch);
        assertSameOperation(uid, epoch);
      }

      closeModalAfterSuccess(uid);
      const profileButton = $('agentProfileHeaderBtn');
      if (profileButton) profileButton.setAttribute('data-admin-password-policy', '10-char-minimum');
      showSuccessToast(wasRequired ? 'Admin password created.' : 'Admin password updated.');
    } catch (error) {
      if (error?.code === 'ADMIN_SESSION_CHANGED') return;
      if (epoch !== state.authEpoch || currentUid() !== uid) return;
      const code = String(error?.code || '');
      if (code === 'LOCAL_VALIDATION') setStatus(error.message, 'error');
      else if (code.includes('wrong-password') || code.includes('invalid-credential')) setStatus('Current Admin password is incorrect.', 'error');
      else if (code.includes('weak-password')) setStatus(`Firebase rejected that password as too weak. Use at least ${MIN_PASSWORD} characters and choose a stronger password.`, 'error');
      else if (code.includes('requires-recent-login')) setStatus('Firebase requires a fresh Admin sign-in before changing the password.', 'error');
      else if (state.required && state.passwordUpdated) {
        clearPasswordFields();
        syncFinishOnlyUi();
        setStatus('Your password changed successfully, but the Admin profile sync is still pending. Choose Retry Setup when the connection is available.', 'required');
      } else if (passwordCommitted) {
        clearPasswordFields();
        setStatus('Your password changed successfully, but final session verification was interrupted. Sign in again with the new password if needed.', 'success');
        showSuccessToast('Admin password updated.');
      } else setStatus(error?.message || 'Could not update the Admin password yet.', 'error');
    } finally {
      if (epoch === state.authEpoch && currentUid() === uid) {
        state.saving = false;
        setSavingUi(false);
        const currentInput = $('adminPasswordCurrent');
        if (currentInput && !state.passwordUpdated) currentInput.value = '';
      }
    }
  }

  function showSuccessToast(text) {
    const toast = document.createElement('div');
    toast.className = 'tt-admin-password-success-toast';
    toast.setAttribute('role', 'status');
    toast.textContent = String(text || 'Admin security updated.');
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => toast.remove(), 2600);
  }

  function signOutRequiredAdmin() {
    if (state.saving) return;
    const logout = $('sessionLogoutBtn');
    if (logout) { logout.click(); return; }
    const auth = window.firebase?.auth?.();
    if (auth?.signOut) void auth.signOut();
  }

  function focusableIn(container) {
    if (!container) return [];
    return Array.from(container.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')).filter(el => !el.hidden && el.offsetParent !== null);
  }

  function trapFocus(event, container) {
    if (event.key !== 'Tab') return false;
    const items = focusableIn(container);
    if (!items.length) { event.preventDefault(); return true; }
    const first = items[0], last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); return true; }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); return true; }
    return false;
  }

  function capturePasswordActions(event) {
    const retryGate = event.target?.closest?.('[data-admin-security-retry]');
    if (retryGate) {
      event.preventDefault(); event.stopImmediatePropagation();
      const user = currentUser();
      if (user) void verifyAdminAndFirstLogin(user, {force:true, requestGate:true});
      return;
    }
    const signoutGate = event.target?.closest?.('[data-admin-security-signout]');
    if (signoutGate) {
      event.preventDefault(); event.stopImmediatePropagation(); signOutRequiredAdmin(); return;
    }
    const save = event.target?.closest?.('#adminPasswordSaveBtn');
    if (save) {
      event.preventDefault(); event.stopImmediatePropagation(); void updateAdminPassword(); return;
    }
    if (!state.required) return;
    const cancel = event.target?.closest?.('#adminPasswordCancelBtn');
    const overlay = $('adminPasswordOverlay');
    if (cancel) {
      event.preventDefault(); event.stopImmediatePropagation(); signOutRequiredAdmin(); return;
    }
    if (event.target === overlay) {
      event.preventDefault(); event.stopImmediatePropagation();
      setStatus('Create your private Admin password first, or choose Sign Out Instead.', 'required');
    }
  }

  function captureKeys(event) {
    // A nested Sign Out / Switch Account confirmation sits above the mandatory
    // Admin password sheet. Let that top-layer dialog own Escape/Tab while open.
    const confirmOverlay = $('confirmOverlay');
    if (confirmOverlay?.classList.contains('open')) return;
    const checkOverlay = $('ttAdminSecurityCheckOverlay');
    if (checkOverlay && !checkOverlay.hidden) {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); return; }
      if (trapFocus(event, checkOverlay)) event.stopImmediatePropagation();
      return;
    }
    if (!state.required) return;
    const overlay = $('adminPasswordOverlay');
    if (!overlay?.classList.contains('open')) return;
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopImmediatePropagation();
      setStatus('First-login password setup cannot be dismissed. Create your password or sign out.', 'required');
      return;
    }
    if (trapFocus(event, overlay)) event.stopImmediatePropagation();
  }

  function resetIdentityState(nextUid = '') {
    state.authEpoch += 1;
    state.verifyUid = '';
    state.verifyPromise = null;
    state.gateRequested = false;
    state.uid = String(nextUid || '');
    state.required = false;
    state.baselineProfile = null;
    state.baselineExists = true;
    state.saving = false;
    state.passwordUpdated = false;
    state.securityUnresolved = false;
    closePasswordOverlayForIdentityReset({unlock:false});
    hideCheckingGate({unlock:false});
    if (!nextUid) { state.appLock = null; document.body?.classList.remove('tt-admin-security-gated'); }
    document.body?.classList.remove('tt-admin-first-login-password-required');
  }

  function handleAuthUser(user) {
    const uid = String(user?.uid || '');
    if (!user || user.isAnonymous || !uid) {
      resetIdentityState('');
      return;
    }
    if (uid !== state.uid) resetIdentityState(uid);
    // Always perform one bounded server-authoritative probe for every Firebase UID.
    // A genuine Agent/TL receives 401/403 and is released immediately; a new Admin
    // cannot bypass first-login password setup because the shell is still on `gate`.
    void verifyAdminAndFirstLogin(user, {requestGate:shouldGate()});
  }

  function hookAuth() {
    if (state.authHooked) return true;
    const auth = window.firebase?.auth?.();
    if (!auth?.onAuthStateChanged) return false;
    state.authHooked = true;
    auth.onAuthStateChanged(handleAuthUser);
    return true;
  }

  function sendSync(type, detail = {}) {
    const message = {source:state.syncSource, type, at:Date.now(), ...detail};
    try { state.syncChannel?.postMessage(message); } catch (_) {}
    try {
      localStorage.setItem(SYNC_STORAGE_KEY, JSON.stringify({...message, nonce:Math.random().toString(36).slice(2)}));
      localStorage.removeItem(SYNC_STORAGE_KEY);
    } catch (_) {}
  }

  function handleSyncMessage(message) {
    if (!message || message.source === state.syncSource) return;
    const uid = String(message.uid || '');
    if (message.type === 'password-committed' && uid && uid === currentUid()) {
      markPasswordUpdatedLocally(uid);
      if (!state.baselineExists || state.required) {
        state.passwordUpdated = true;
        openRequiredModal('Your password was updated in another TrinoTime tab. Finish synchronizing this Admin account.');
        syncFinishOnlyUi();
      }
      return;
    }
    if (message.type === 'security-complete' && uid && uid === currentUid()) {
      clearPasswordUpdatedLocally(uid);
      const user = currentUser();
      if (user) void verifyAdminAndFirstLogin(user, {force:true, requestGate:shouldGate()});
      return;
    }
    if (message.type === 'profile-updated') {
      try {
        const api = window.TrinoTimeAdminProfile;
        const accounts = api?.accounts?.();
        if (uid && uid === currentUid()) void api?.refresh?.();
        if (accounts !== null && accounts !== undefined) void api?.refreshAccounts?.();
      } catch (_) {}
    }
  }

  function initSync() {
    state.syncSource = randomSource();
    try {
      if ('BroadcastChannel' in window) {
        state.syncChannel = new BroadcastChannel(SYNC_CHANNEL);
        state.syncChannel.addEventListener('message', event => handleSyncMessage(event.data));
      }
    } catch (_) { state.syncChannel = null; }
    window.addEventListener('storage', event => {
      if (event.key !== SYNC_STORAGE_KEY || !event.newValue) return;
      try { handleSyncMessage(JSON.parse(event.newValue)); } catch (_) {}
    });
    window.addEventListener('trinotime:admin-profile-updated', event => {
      const profile = event?.detail?.profile || {};
      const uid = String(profile.uid || currentUid());
      if (uid) sendSync('profile-updated', {uid, revision:Number(profile.revision)||0, displayName:String(profile.displayName||'')});
    }, {passive:true});
    window.addEventListener('trinotime:remote-admin-profile-updated', event => {
      const detail = event?.detail || {};
      handleSyncMessage({source:'remote', type:'profile-updated', uid:String(detail.uid||''), displayName:String(detail.displayName||'')});
    }, {passive:true});
  }

  function init() {
    ensurePolicyUi();
    ensureCheckOverlay();
    initSync();
    document.addEventListener('click', capturePasswordActions, true);
    document.addEventListener('keydown', captureKeys, true);
    window.addEventListener('trinotime:workforce-auth-ready', () => {
      const user = currentUser();
      if (!user || user.isAnonymous) return;
      if (shouldGate()) {
        state.gateRequested = true;
        showCheckingGate('checking');
      }
      // Re-probe after workforce authorization settles. Deduplication keeps this
      // bounded when the auth-state probe is already in flight for the same UID.
      void verifyAdminAndFirstLogin(user, {requestGate:shouldGate()});
    }, {passive:true});
    window.addEventListener('online', () => {
      if (state.checkOverlayMode === 'error' || state.securityUnresolved) {
        const user = currentUser();
        if (user) void verifyAdminAndFirstLogin(user, {force:true, requestGate:shouldGate()});
      }
    }, {passive:true});
    window.addEventListener('focus', () => {
      if (!state.securityUnresolved) return;
      const user = currentUser();
      if (user) void verifyAdminAndFirstLogin(user, {force:true, requestGate:shouldGate()});
    }, {passive:true});
    document.addEventListener('visibilitychange', () => {
      if (document.hidden || !state.securityUnresolved) return;
      const user = currentUser();
      if (user) void verifyAdminAndFirstLogin(user, {force:true, requestGate:shouldGate()});
    }, {passive:true});
    if (!hookAuth()) window.addEventListener('load', hookAuth, {once:true});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true}); else init();
})();
