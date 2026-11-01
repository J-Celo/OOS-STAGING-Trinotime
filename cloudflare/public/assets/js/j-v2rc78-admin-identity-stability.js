(() => {
  'use strict';

  const $ = selector => document.querySelector(selector);
  let activeUid = '';

  const initials = value => String(value || 'AD')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part.charAt(0))
    .join('')
    .toUpperCase() || 'AD';

  function canonicalRole(profile) {
    const title = String(profile?.jobTitle || '').trim();
    if (title) return title;
    const access = String(profile?.accessLabel || 'Admin').trim();
    return /^owner$/i.test(access) ? 'Owner · Administration' : `${access || 'Admin'} · Administration`;
  }

  function clearCanonicalIdentity() {
    const btn = $('#agentProfileHeaderBtn');
    const avatar = $('#agentProfileHeaderAvatar');
    const name = $('#agentProfileHeaderName');
    const role = $('#agentProfileHeaderRole');
    if (btn) {
      delete btn.dataset.adminCanonicalIdentity;
      btn.removeAttribute('aria-labelledby');
    }
    if (avatar) delete avatar.dataset.adminCanonicalInitials;
    if (name) delete name.dataset.adminCanonicalName;
    if (role) delete role.dataset.adminCanonicalRole;
    $('#ttAdminCanonicalHeaderLabel')?.remove();
    activeUid = '';
  }

  function applyCanonicalIdentity(profile) {
    if (!profile || typeof profile !== 'object') return false;
    const uid = String(profile.uid || '').trim();
    const displayName = String(profile.displayName || '').trim();
    if (!uid || !displayName) return false;

    if (activeUid && activeUid !== uid) clearCanonicalIdentity();

    const btn = $('#agentProfileHeaderBtn');
    const avatar = $('#agentProfileHeaderAvatar');
    const name = $('#agentProfileHeaderName');
    const role = $('#agentProfileHeaderRole');
    if (!btn || !avatar || !name || !role) return false;

    const roleText = canonicalRole(profile);
    btn.dataset.adminCanonicalIdentity = 'true';
    avatar.dataset.adminCanonicalInitials = initials(displayName);
    name.dataset.adminCanonicalName = displayName;
    role.dataset.adminCanonicalRole = roleText;

    let label = $('#ttAdminCanonicalHeaderLabel');
    if (!label) {
      label = document.createElement('span');
      label.id = 'ttAdminCanonicalHeaderLabel';
      label.className = 'tt-admin-canonical-a11y-label';
      document.body.appendChild(label);
    }
    label.textContent = `Open Admin profile for ${displayName}`;
    btn.setAttribute('aria-labelledby', label.id);
    activeUid = uid;
    return true;
  }

  function applyCurrentProfile() {
    try {
      const profile = window.TrinoTimeAdminProfile?.current?.();
      if (profile) applyCanonicalIdentity(profile);
    } catch (_) {}
  }

  function profileFromEvent(event) {
    const profile = event?.detail?.profile;
    if (profile && typeof profile === 'object') applyCanonicalIdentity(profile);
    else applyCurrentProfile();
  }

  window.addEventListener('trinotime:admin-profile-ready', profileFromEvent, {passive:true});
  window.addEventListener('trinotime:admin-profile-updated', profileFromEvent, {passive:true});
  window.addEventListener('trinotime:workforce-auth-ready', applyCurrentProfile, {passive:true});
  window.addEventListener('load', applyCurrentProfile, {once:true});

  try {
    window.firebase?.auth?.().onAuthStateChanged?.(user => {
      const uid = String(user?.uid || '');
      if (!user || user.isAnonymous || !uid) {
        clearCanonicalIdentity();
        return;
      }
      if (activeUid && activeUid !== uid) clearCanonicalIdentity();
      queueMicrotask(applyCurrentProfile);
    });
  } catch (_) {}

  window.TrinoTimeAdminIdentityStability = Object.freeze({
    release: 'RC78',
    apply: profile => applyCanonicalIdentity(profile),
    clear: clearCanonicalIdentity
  });
})();
