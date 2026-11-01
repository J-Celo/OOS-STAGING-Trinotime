(function () {
  'use strict';

  var OFFICIAL_URL = 'https://oos.trinotime.com/';
  var LEGACY_HOST = 'j-celo.github.io';
  var LEGACY_PATH_PREFIX = '/OOS';
  var DISMISS_KEY = 'trinotime_legacy_move_modal_dismissed_v1';
  var PREVIEW = false;

  try {
    var query = new URLSearchParams(window.location.search || '');
    PREVIEW = query.get('legacyPreview') === '1';
  } catch (_) {}

  var isLegacyHost = window.location.hostname === LEGACY_HOST &&
    (window.location.pathname === LEGACY_PATH_PREFIX || window.location.pathname.indexOf(LEGACY_PATH_PREFIX + '/') === 0);

  if (!isLegacyHost && !PREVIEW) return;

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (key) {
      var value = attrs[key];
      if (key === 'className') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key.indexOf('data-') === 0) node.setAttribute(key, value);
      else if (key === 'type') node.type = value;
      else if (key === 'href') node.href = value;
      else node.setAttribute(key, value);
    });
    (children || []).forEach(function (child) {
      if (child) node.appendChild(child);
    });
    return node;
  }

  function goOfficial() {
    window.location.assign(OFFICIAL_URL);
  }

  async function copyOfficial(statusNode) {
    var copied = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(OFFICIAL_URL);
        copied = true;
      }
    } catch (_) {}

    if (!copied) {
      try {
        var area = document.createElement('textarea');
        area.value = OFFICIAL_URL;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        copied = document.execCommand('copy');
        area.remove();
      } catch (_) {}
    }

    if (statusNode) {
      statusNode.textContent = copied ? 'Official address copied.' : 'Official address: ' + OFFICIAL_URL;
    }
  }

  function createBanner() {
    if (document.getElementById('ttLegacyMigrationBanner')) return;

    var badge = el('span', { className: 'tt-move-badge', text: 'Legacy site' });
    var text = el('span', { className: 'tt-move-banner-text' });
    text.appendChild(document.createTextNode('TrinoTime has moved to '));
    var strong = el('strong', { text: 'oos.trinotime.com' });
    text.appendChild(strong);
    text.appendChild(document.createTextNode('. Please use the official site for daily work.'));

    var copy = el('button', { className: 'tt-move-btn tt-move-btn-ghost', type: 'button', text: 'Copy address' });
    var open = el('button', { className: 'tt-move-btn tt-move-btn-primary', type: 'button', text: 'Open official site' });
    copy.addEventListener('click', function () { copyOfficial(null); });
    open.addEventListener('click', goOfficial);

    var banner = el('aside', {
      id: 'ttLegacyMigrationBanner',
      role: 'status',
      'aria-label': 'Legacy TrinoTime migration notice'
    }, [
      el('div', { className: 'tt-move-banner-copy' }, [badge, text]),
      el('div', { className: 'tt-move-banner-actions' }, [copy, open])
    ]);

    document.body.appendChild(banner);
  }

  function createModal() {
    if (document.getElementById('ttLegacyMigrationModal')) return;

    var preference = el('input', { id: 'ttLegacyMigrationDontShow', type: 'checkbox' });
    var status = el('div', { className: 'tt-move-status', id: 'ttLegacyMigrationStatus', 'aria-live': 'polite' });

    var open = el('button', { className: 'tt-move-btn tt-move-btn-primary', type: 'button', text: 'Open Official TrinoTime →' });
    var copy = el('button', { className: 'tt-move-btn tt-move-btn-secondary', type: 'button', text: 'Copy new address' });
    var continueBtn = el('button', { className: 'tt-move-btn tt-move-btn-secondary', type: 'button', text: 'Continue here temporarily' });

    var modal = el('div', {
      id: 'ttLegacyMigrationModal',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'ttLegacyMigrationTitle'
    });

    var dialog = el('div', { className: 'tt-move-dialog' });
    dialog.appendChild(el('div', { className: 'tt-move-dialog-head' }, [
      el('p', { className: 'tt-move-eyebrow', text: 'Official site migration' }),
      el('h2', { id: 'ttLegacyMigrationTitle', text: 'TrinoTime has moved' })
    ]));

    var body = el('div', { className: 'tt-move-dialog-body' });
    body.appendChild(el('p', {
      className: 'tt-move-lead',
      text: 'You are visiting the previous GitHub Pages address. The official TrinoTime production website is now hosted on Cloudflare for the newest fixes, Workspace Messaging and improved reliability.'
    }));

    body.appendChild(el('div', { className: 'tt-move-address' }, [
      el('div', { className: 'tt-move-address-main' }, [
        el('span', { className: 'tt-move-address-label', text: 'Official production website' }),
        el('span', { className: 'tt-move-address-value', text: 'https://oos.trinotime.com/' })
      ]),
      el('span', { className: 'tt-move-badge', text: 'Official' })
    ]));

    body.appendChild(el('div', { className: 'tt-move-benefits' }, [
      el('div', { className: 'tt-move-benefit' }, [
        el('strong', { text: 'Latest production fixes' }),
        el('span', { text: 'Use the current supported TrinoTime deployment.' })
      ]),
      el('div', { className: 'tt-move-benefit' }, [
        el('strong', { text: 'Workspace Messaging' }),
        el('span', { text: 'Durable realtime chat and the newest collaboration tools.' })
      ]),
      el('div', { className: 'tt-move-benefit' }, [
        el('strong', { text: 'Cloudflare production' }),
        el('span', { text: 'The new domain is now the official TrinoTime address.' })
      ])
    ]));

    body.appendChild(el('div', {
      className: 'tt-move-warning',
      text: 'Important: avoid keeping the old GitHub site and the new TrinoTime site open at the same time while clocking in, starting/ending breaks or clocking out. Use the official site for attendance actions.'
    }));

    body.appendChild(el('div', { className: 'tt-move-actions' }, [open, copy, continueBtn]));
    body.appendChild(el('label', { className: 'tt-move-preference', for: 'ttLegacyMigrationDontShow' }, [
      preference,
      el('span', { text: 'Do not show this large pop-up again on this device. The smaller legacy-site reminder will remain visible.' })
    ]));
    body.appendChild(status);
    dialog.appendChild(body);
    modal.appendChild(dialog);
    document.body.appendChild(modal);

    function persistPreference() {
      if (!preference.checked) return;
      try { localStorage.setItem(DISMISS_KEY, '1'); } catch (_) {}
    }

    function closeModal() {
      persistPreference();
      modal.hidden = true;
    }

    open.addEventListener('click', function () {
      persistPreference();
      goOfficial();
    });
    copy.addEventListener('click', function () { copyOfficial(status); });
    continueBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', function (event) {
      if (event.target === modal) closeModal();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !modal.hidden) closeModal();
    });

    setTimeout(function () {
      try { open.focus({ preventScroll: true }); } catch (_) { try { open.focus(); } catch (__){ } }
    }, 20);
  }

  function shouldShowModal() {
    try { return localStorage.getItem(DISMISS_KEY) !== '1'; } catch (_) { return true; }
  }

  function boot() {
    try { document.documentElement.classList.add('tt-legacy-site'); } catch (_) {}
    createBanner();
    if (shouldShowModal()) createModal();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
