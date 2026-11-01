(() => {
  'use strict';

  const MIN_PASSWORD = 10;
  const MAX_PASSWORD = 128;
  const state = {
    uid: '',
    required: false,
    checking: false,
    baselineProfile: null,
    baselineExists: true,
    saving: false,
    authHooked: false
  };

  const $ = id => document.getElementById(id);
  const currentUser = () => window.firebase?.auth?.().currentUser || null;

  function ensurePolicyUi() {
    const newInput = $('adminPasswordNew');
    const confirmInput = $('adminPasswordConfirm');
    if (newInput) newInput.minLength = MIN_PASSWORD;
    if (confirmInput) confirmInput.minLength = MIN_PASSWORD;
    const box = $('adminPasswordOverlay')?.querySelector('.agent-password-box');
    if (!box) return;
    let note = box.querySelector('.tt-admin-password-policy-note');
    if (!note) {
      note = document.createElement('div');
      note.className = 'tt-admin-password-policy-note';
      note.textContent = `Use at least ${MIN_PASSWORD} characters. This password belongs only to the currently signed-in Admin account.`;
      const actions = box.querySelector('.agent-password-actions');
      if (actions) box.insertBefore(note, actions);
      else box.appendChild(note);
    }
  }

  function setStatus(message, tone = 'info') {
    const box = $('adminPasswordOverlay')?.querySelector('.agent-password-box');
    if (!box) return;
    let status = box.querySelector('.tt-admin-password-policy-status');
    if (!status) {
      status = document.createElement('div');
      status.className = 'tt-admin-password-policy-status';
      const actions = box.querySelector('.agent-password-actions');
      if (actions) box.insertBefore(status, actions);
      else box.appendChild(status);
    }
    status.dataset.tone = tone;
    status.textContent = String(message || '');
    status.hidden = !message;
  }

  async function api(path, options = {}, forceToken = false) {
    const user = currentUser();
    if (!user || user.isAnonymous) throw new Error('Admin sign-in required.');
    const token = await user.getIdToken(forceToken);
    const headers = new Headers(options.headers || {});
    headers.set('Authorization', `Bearer ${token}`);
    headers.set('Accept', 'application/json');
    if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json; charset=utf-8');
    const response = await fetch(path, {...options, headers, cache:'no-store'});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.message || 'Admin request failed.');
      error.status = response.status;
      error.code = data.error || '';
      throw error;
    }
    return data;
  }

  function setForcedMode(required) {
    state.required = Boolean(required);
    const overlay = $('adminPasswordOverlay');
    const title = $('adminPasswordTitle');
    const sub = overlay?.querySelector('.agent-password-sub');
    const cancel = $('adminPasswordCancelBtn');
    if (!overlay) return;
    overlay.classList.toggle('tt-admin-first-login-required', state.required);
    document.body?.classList.toggle('tt-admin-first-login-password-required', state.required);
    if (state.required) {
      if (title) title.textContent = 'Create Your Admin Password';
      if (sub) sub.textContent = `First sign-in setup: re-enter the temporary Firebase password, then create your own private password with at least ${MIN_PASSWORD} characters.`;
      if (cancel) cancel.textContent = 'Sign Out Instead';
    } else {
      if (title) title.textContent = 'Change Admin Password';
      if (sub) sub.textContent = 'Re-enter your current Firebase Admin password, then choose a new private password for this Admin account.';
      if (cancel) cancel.textContent = 'Cancel';
    }
  }

  function openRequiredModal() {
    ensurePolicyUi();
    setForcedMode(true);
    ['adminPasswordCurrent','adminPasswordNew','adminPasswordConfirm'].forEach(id => {
      const el = $(id);
      if (el) { el.value = ''; el.disabled = false; el.readOnly = false; }
    });
    const overlay = $('adminPasswordOverlay');
    if (!overlay) return;
    if (overlay.parentElement !== document.body) document.body.appendChild(overlay);
    try { overlay.inert = false; } catch (_) { overlay.removeAttribute('inert'); }
    overlay.removeAttribute('inert');
    overlay.setAttribute('aria-hidden', 'false');
    overlay.classList.add('open');
    setStatus('Password setup is required before using this new Admin profile.', 'required');
    requestAnimationFrame(() => $('adminPasswordCurrent')?.focus({preventScroll:true}));
  }

  function closeModalAfterSuccess() {
    const overlay = $('adminPasswordOverlay');
    overlay?.classList.remove('open');
    overlay?.setAttribute('aria-hidden', 'true');
    setForcedMode(false);
    setStatus('');
    ['adminPasswordCurrent','adminPasswordNew','adminPasswordConfirm'].forEach(id => { const el=$(id); if(el) el.value=''; });
  }

  function sessionMarkerKey(uid) { return `trinotime:admin-first-password-updated:v1:${uid}`; }

  function markPasswordUpdatedLocally(uid) {
    try { sessionStorage.setItem(sessionMarkerKey(uid), '1'); } catch (_) {}
  }

  function clearPasswordUpdatedLocally(uid) {
    try { sessionStorage.removeItem(sessionMarkerKey(uid)); } catch (_) {}
  }

  function wasPasswordUpdatedLocally(uid) {
    try { return sessionStorage.getItem(sessionMarkerKey(uid)) === '1'; } catch (_) { return false; }
  }

  async function bootstrapAdminProfile(profile) {
    const safe = profile && typeof profile === 'object' ? profile : {};
    const payload = {
      displayName: String(safe.displayName || 'Administrator').trim() || 'Administrator',
      jobTitle: String(safe.jobTitle || '').trim(),
      contact: String(safe.contact || '').trim(),
      bio: String(safe.bio || '').trim(),
      photoDataUrl: String(safe.photoDataUrl || '')
    };
    const result = await api('/api/workforce/profile/admin-self', {
      method:'POST',
      body:JSON.stringify({expectedRevision:Math.max(0, Number(safe.revision) || 0), profile:payload})
    }, true);
    if (result?.saved === true && result?.profile) return result.profile;
    if (result?.conflict === true && result?.profile) return result.profile;
    throw new Error('The new Admin profile could not be initialized after the password update.');
  }

  async function finishRequiredSetupAfterPasswordChange() {
    const uid = state.uid;
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const profile = await bootstrapAdminProfile(state.baselineProfile || {});
        if (uid !== state.uid) return false;
        state.baselineProfile = profile;
        state.baselineExists = true;
        clearPasswordUpdatedLocally(uid);
        state.required = false;
        window.dispatchEvent(new CustomEvent('trinotime:admin-profile-updated', {detail:{profile:{...profile}}}));
        return true;
      } catch (error) {
        lastError = error;
        if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 350 * (attempt + 1)));
      }
    }
    throw lastError || new Error('Could not finish the Admin first-login setup.');
  }

  async function verifyAdminAndFirstLogin(user) {
    const uid = String(user?.uid || '');
    if (!uid || user?.isAnonymous || state.checking) return;
    state.uid = uid;
    state.checking = true;
    try {
      const data = await api('/api/workforce/profile/admin-self', {method:'GET'});
      if (uid !== String(currentUser()?.uid || '')) return;
      if (!data?.profile || String(data.profile.uid || '') !== uid) return;
      state.baselineProfile = data.profile;
      state.baselineExists = data.exists === true;
      if (!state.baselineExists) {
        if (wasPasswordUpdatedLocally(uid)) {
          setStatus('Finishing your Admin first-login setup…', 'info');
          try {
            await finishRequiredSetupAfterPasswordChange();
            closeModalAfterSuccess();
            return;
          } catch (_) {
            // Fall through to the required modal. The updated password is now the current password.
          }
        }
        openRequiredModal();
      } else {
        setForcedMode(false);
      }
    } catch (error) {
      // 401/403 means this Firebase user is not an active Admin. Other Admin/profile code owns that state.
      if (![401,403].includes(Number(error?.status))) console.warn('[TrinoTime RC79] Admin first-login password check failed:', error?.message || error);
    } finally {
      state.checking = false;
    }
  }

  async function verifyActiveAdminRoleDirect() {
    const user = currentUser();
    if (!user || user.isAnonymous) throw new Error('No Firebase Admin session is active.');
    const snap = await window.firebase.database().ref('roles/' + user.uid).once('value');
    const role = snap.exists() ? snap.val() : null;
    if (!(role && role.active === true && String(role.role || '').trim().toLowerCase() === 'admin')) {
      throw new Error('This Admin role is no longer active.');
    }
    return true;
  }

  async function updateAdminPassword() {
    if (state.saving) return;
    ensurePolicyUi();
    const user = currentUser();
    if (!user || user.isAnonymous || !user.email) { setStatus('Your Firebase Admin session is not available. Sign in again.', 'error'); return; }
    const current = $('adminPasswordCurrent')?.value || '';
    const next = $('adminPasswordNew')?.value || '';
    const confirm = $('adminPasswordConfirm')?.value || '';
    if (!current) { setStatus('Enter your current Admin password.', 'error'); return; }
    if (next.length < MIN_PASSWORD) { setStatus(`New password must be at least ${MIN_PASSWORD} characters.`, 'error'); return; }
    if (next.length > MAX_PASSWORD) { setStatus(`New password must be ${MAX_PASSWORD} characters or fewer.`, 'error'); return; }
    if (next !== confirm) { setStatus('New password and confirmation do not match.', 'error'); return; }
    if (next === current) { setStatus('Choose a new password that is different from your current password.', 'error'); return; }

    const saveBtn = $('adminPasswordSaveBtn');
    state.saving = true;
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Verifying…'; }
    setStatus('Re-verifying this Admin account…', 'info');
    try {
      const credential = window.firebase.auth.EmailAuthProvider.credential(user.email, String(current));
      await user.reauthenticateWithCredential(credential);
      await verifyActiveAdminRoleDirect();
      if (saveBtn) saveBtn.textContent = 'Updating…';
      setStatus('Updating your private Admin password…', 'info');
      await user.updatePassword(String(next));
      try { await user.getIdToken(true); } catch (_) {}
      await verifyActiveAdminRoleDirect();

      const wasRequired = state.required;
      if (wasRequired) {
        markPasswordUpdatedLocally(String(user.uid));
        if (saveBtn) saveBtn.textContent = 'Finishing…';
        setStatus('Password updated. Finishing first-login setup…', 'success');
        await finishRequiredSetupAfterPasswordChange();
      }

      closeModalAfterSuccess();
      const profileButton = $('agentProfileHeaderBtn');
      if (profileButton) profileButton.setAttribute('data-admin-password-policy', '10-char-minimum');
      setTimeout(() => {
        const toast = document.createElement('div');
        toast.className = 'tt-admin-password-success-toast';
        toast.textContent = wasRequired ? 'Admin password created.' : 'Admin password updated.';
        document.body.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('show'));
        setTimeout(() => toast.remove(), 2600);
      }, 0);
    } catch (error) {
      const code = String(error?.code || '');
      if (code.includes('wrong-password') || code.includes('invalid-credential')) setStatus('Current Admin password is incorrect.', 'error');
      else if (code.includes('weak-password')) setStatus(`Firebase rejected that password as too weak. Use at least ${MIN_PASSWORD} characters and choose a stronger password.`, 'error');
      else if (code.includes('requires-recent-login')) setStatus('Firebase requires a fresh Admin sign-in before changing the password.', 'error');
      else setStatus(error?.message || 'Could not update the Admin password yet.', 'error');
    } finally {
      state.saving = false;
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = state.required ? 'Create Password' : 'Update Password'; }
      const currentInput = $('adminPasswordCurrent'); if (currentInput) currentInput.value = '';
    }
  }

  function signOutRequiredAdmin() {
    const logout = $('sessionLogoutBtn');
    if (logout) { logout.click(); return; }
    const auth = window.firebase?.auth?.();
    if (auth?.signOut) void auth.signOut();
  }

  function capturePasswordActions(event) {
    const save = event.target?.closest?.('#adminPasswordSaveBtn');
    if (save) {
      event.preventDefault();
      event.stopImmediatePropagation();
      void updateAdminPassword();
      return;
    }
    if (!state.required) return;
    const cancel = event.target?.closest?.('#adminPasswordCancelBtn');
    const overlay = $('adminPasswordOverlay');
    if (cancel) {
      event.preventDefault();
      event.stopImmediatePropagation();
      signOutRequiredAdmin();
      return;
    }
    if (event.target === overlay) {
      event.preventDefault();
      event.stopImmediatePropagation();
      setStatus('Create your private Admin password first, or choose Sign Out Instead.', 'required');
    }
  }

  function captureEscape(event) {
    if (!state.required || event.key !== 'Escape') return;
    const overlay = $('adminPasswordOverlay');
    if (!overlay?.classList.contains('open')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    setStatus('First-login password setup cannot be dismissed. Create your password or sign out.', 'required');
  }

  function hookAuth() {
    if (state.authHooked) return true;
    const auth = window.firebase?.auth?.();
    if (!auth?.onAuthStateChanged) return false;
    state.authHooked = true;
    auth.onAuthStateChanged(user => {
      const uid = String(user?.uid || '');
      if (!user || user.isAnonymous) {
        state.uid = '';
        state.required = false;
        state.baselineProfile = null;
        state.baselineExists = true;
        setForcedMode(false);
        return;
      }
      if (uid !== state.uid) {
        state.uid = uid;
        state.required = false;
        state.baselineProfile = null;
        state.baselineExists = true;
      }
      void verifyAdminAndFirstLogin(user);
    });
    return true;
  }

  function init() {
    ensurePolicyUi();
    document.addEventListener('click', capturePasswordActions, true);
    document.addEventListener('keydown', captureEscape, true);
    if (!hookAuth()) window.addEventListener('load', hookAuth, {once:true});
  }

  init();
})();
