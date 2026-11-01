(() => {
  'use strict';

  const VERSION = '1.1.18';
  let queued = false;
  let slotObserver = null;
  let observedSlot = null;

  function premiumTeamLeader() {
    return document.documentElement?.dataset?.trinoCustomWorkspace === 'enabled'
      && String(document.body?.dataset?.trinoRole || '').toLowerCase() === 'teamleader';
  }

  function clearInlineOrder(element) {
    if (!element) return;
    if (element.dataset.ttV1118Order === '1') {
      element.style.removeProperty('order');
      delete element.dataset.ttV1118Order;
    }
  }

  function setInlineOrder(element, value) {
    if (!element) return;
    element.style.setProperty('order', String(value), 'important');
    element.dataset.ttV1118Order = '1';
  }

  function bindSlotObserver(slot) {
    if (slot === observedSlot) return;
    if (slotObserver) slotObserver.disconnect();
    observedSlot = slot || null;
    if (!slot) return;
    slotObserver = new MutationObserver(queueApply);
    slotObserver.observe(slot, { childList: true });
  }

  function apply() {
    queued = false;
    const slot = document.getElementById('headerProfileSlot');
    bindSlotObserver(slot);
    if (!slot) return;

    const profile = document.getElementById('agentProfileHeaderBtn');
    const status = document.getElementById('tlHomeStatusBadge');
    const calendar = document.getElementById('ttPremiumEmbeddedCalendar');

    if (!premiumTeamLeader()) {
      clearInlineOrder(profile);
      clearInlineOrder(status);
      clearInlineOrder(calendar);
      slot.classList.remove('tt-v1118-profile-first');
      return;
    }

    slot.classList.add('tt-v1118-profile-first');
    setInlineOrder(profile, -30);
    setInlineOrder(status, -20);
    setInlineOrder(calendar, -10);

    // Keep the DOM order aligned with the visual order as a fallback for
    // browsers or older cached styles that do not honor the flex order rules.
    if (profile && slot.firstElementChild !== profile) {
      slot.insertBefore(profile, slot.firstElementChild);
    }
    if (status && profile && profile.nextElementSibling !== status) {
      profile.insertAdjacentElement('afterend', status);
    }
    if (calendar) {
      const anchor = status || profile;
      if (anchor && anchor.nextElementSibling !== calendar) {
        anchor.insertAdjacentElement('afterend', calendar);
      }
    }
  }

  function queueApply() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(apply);
  }

  function boot() {
    queueApply();
    new MutationObserver(queueApply).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-trino-custom-workspace']
    });
    if (document.body) {
      new MutationObserver(queueApply).observe(document.body, {
        attributes: true,
        attributeFilter: ['data-trino-role']
      });
    }
    window.addEventListener('focus', queueApply, { passive: true });
    window.setTimeout(queueApply, 250);
    window.setTimeout(queueApply, 900);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  window.TrinoTimePremiumTlProfileOrder = Object.freeze({
    version: VERSION,
    refresh: queueApply
  });
})();
