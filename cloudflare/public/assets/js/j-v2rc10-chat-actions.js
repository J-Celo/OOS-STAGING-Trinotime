/* TrinoTime RC10: pure message presentation and explicit copy actions.
 * No network, observers, timers, attendance writes or HTML from user input.
 */
(function (root) {
  'use strict';
  const esc = value => String(value == null ? '' : value).replace(/[&<>"'`]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','`':'&#96;'}[ch]));
  function mealCommand(value) {
    const text = String(value || '').trim().toUpperCase();
    return text === 'MB' ? 'start' : text === 'BFMB' ? 'stop' : null;
  }
  function safeUrl(value) {
    try {
      const text = String(value || '');
      if (!text || /[\u0000-\u0020\u007f]/.test(text)) return '';
      if (/^[a-z][a-z0-9+.-]*:/i.test(text) && !/^https?:\/\//i.test(text) && !/^[a-z0-9.-]+:\d{1,5}(?:[/?#]|$)/i.test(text)) return '';
      const url = new URL(/^https?:\/\//i.test(text) ? text : 'https://' + text);
      return /^https?:$/.test(url.protocol) && url.hostname && !url.username && !url.password ? url.href : '';
    } catch (_) { return ''; }
  }
  function linkify(value) {
    const text = String(value == null ? '' : value);
    // Require a text boundary so an email, unsupported scheme or HTML attribute
    // cannot disguise a link. Unsupported schemes are always rendered as text.
    const re = /(^|[\s(\[{])((?:https?:\/\/|www\.)[^\s<>"'`]+|(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}(?::\d{1,5})?(?:[/?#][^\s<>"'`]*)?)/gi;
    let out = '', cursor = 0, match;
    while ((match = re.exec(text))) {
      const begin = match.index + match[1].length;
      let label = match[2];
      label = label.replace(/[.,!?:;]+$/, '');
      for (const [left, right] of [['(', ')'], ['[', ']'], ['{', '}']]) {
        while (label.endsWith(right) && label.split(right).length > label.split(left).length) label = label.slice(0, -1);
      }
      const href = safeUrl(label);
      out += esc(text.slice(cursor, begin));
      if (href) out += '<span class="tt-wm-link-wrap"><a class="tt-wm-chat-link" href="' + esc(href) + '" target="_blank" rel="noopener noreferrer">' + esc(label) + '</a><button type="button" class="tt-wm-copy-link" data-chat-copy-link="' + esc(href) + '" aria-label="Copy link: ' + esc(label) + '" title="Copy link">Copy link</button></span>';
      else out += esc(label);
      cursor = begin + label.length;
    }
    return out + esc(text.slice(cursor));
  }
  async function copyLink(value) {
    const href = safeUrl(value);
    if (!href) throw new Error('This link is not available to copy.');
    try { if (root.navigator?.clipboard?.writeText) { await root.navigator.clipboard.writeText(href); return true; } } catch (_) {}
    const field = root.document.createElement('textarea');
    field.value = href;field.readOnly = true;field.style.cssText = 'position:fixed;left:-9999px;top:0;';
    const previous = root.document.activeElement;root.document.body.appendChild(field);
    let copied = false;
    try {field.select();copied = root.document.execCommand?.('copy') === true;} catch (_) {}
    finally {field.remove();try {previous?.focus({preventScroll:true});} catch (_) {}}
    if (copied) return true;
    if (typeof root.prompt === 'function') root.prompt('Select and copy this link:', href);
    return false;
  }
  function tombstone(message) {
    return '<div class="tt-wm-bubble tt-wm-unsent"><em>Message unsent</em>' + (message?.attendanceActionRetained ? '<small>The attendance action remains recorded.</small>' : '') + '</div>';
  }
  function mealCard(message, time) {
    const event = message?.mealBreak;
    if (!event) return '';
    const start = event.command === 'start';
    const minutes = !start ? Math.max(0, (Date.parse(event.endedAt) - Date.parse(event.startedAt)) / 60000) : null;
    return '<div class="tt-wm-meal-card"><strong>' + (start ? 'Meal break started' : 'Back from meal break') + '</strong><span>' + esc(start ? '30-minute allowance. Started ' + time(event.startedAt) + ' - due ' + time(event.dueAt) : 'Returned ' + time(event.endedAt) + (Number.isFinite(minutes) ? ' - ' + minutes.toFixed(1) + ' minutes elapsed' : '')) + '</span><small>' + (start ? 'Send BFMB when you return. This is a recorded start, not a live status indicator.' : 'Return time recorded in attendance.') + '</small></div>';
  }
  function menu(message, uid, rootId = '') {
    // RC24 replaces the visible three-dot control with a right-click / long-press context menu.
    // Keep this legacy renderer as a compatibility fallback for older cached clients and RC10 fixtures.
    if (root.TrinoTimeMessageContextMenuV24 === true) return '';
    if (!message || message._pending || message._failed) return '';
    const messageId = rootId || message.messageId || '', replyId = rootId ? message.replyId || '' : '';
    if (!messageId) return '';
    const common = ' data-unsend-message="' + esc(messageId) + '" data-unsend-reply="' + esc(replyId) + '"';
    return '<details class="tt-wm-message-menu"><summary aria-label="Message options" title="Message options">...</summary><div class="tt-wm-message-menu-options">' + (message.senderUid === uid && !message.unsentAt ? '<button type="button" data-chat-unsend="everyone"' + common + '>Unsend for Everyone</button>' : '') + '<button type="button" data-chat-unsend="you"' + common + '>Unsend for You</button></div></details>';
  }
  root.TrinoTimeMessagingActions = Object.freeze({mealCommand, safeUrl, linkify, copyLink, tombstone, mealCard, menu});
})(typeof window === 'undefined' ? globalThis : window);
