/* TrinoTime V2.0.0 RC24 — clean message context menu interaction.
 * Presentation/input only. The owning client remains authoritative for action permissions and mutations.
 */
(function (root) {
  'use strict';
  const HOLD_MS = 500;
  const MOVE_TOLERANCE = 12;
  const EDGE_GAP = 10;
  root.TrinoTimeMessageContextMenuV24 = true;

  function create(options = {}) {
    const doc = options.document || root.document;
    const resolve = typeof options.resolve === 'function' ? options.resolve : () => null;
    const onAction = typeof options.onAction === 'function' ? options.onAction : () => {};
    if (!doc?.body) return null;

    let menu = null;
    let active = null;
    let press = null;
    let suppressClickUntil = 0;
    const bindings = new Map();

    function ensureMenu() {
      if (menu?.isConnected) return menu;
      menu = doc.createElement('div');
      menu.className = 'tt-wm-message-context-menu';
      menu.setAttribute('role', 'menu');
      menu.setAttribute('aria-label', 'Message actions');
      menu.hidden = true;
      menu.addEventListener('click', event => {
        const button = event.target.closest?.('[data-message-context-action]');
        if (!button || !menu.contains(button) || !active) return;
        event.preventDefault();
        event.stopPropagation();
        const detail = active;
        const scope = button.dataset.messageContextAction;
        close();
        onAction({ ...detail, scope });
      });
      doc.body.appendChild(menu);
      return menu;
    }

    function cancelPress() {
      if (!press) return;
      root.clearTimeout(press.timer);
      press = null;
    }

    function close() {
      cancelPress();
      active = null;
      if (menu) {
        menu.hidden = true;
        menu.textContent = '';
        menu.removeAttribute('data-source');
      }
    }

    function render(detail) {
      const pin = detail.canPin && !detail.replyId && !detail.unsentAt
        ? `<button type="button" role="menuitem" class="tt-wm-message-context-item is-pin" data-message-context-action="${detail.isPinned?'unpin':'pin'}">${detail.isPinned?'Unpin message':'Pin message'}</button>`
        : '';
      const canEveryone = detail.senderUid === detail.actorUid && !detail.unsentAt;
      const edit = detail.canEdit
        ? '<button type="button" role="menuitem" class="tt-wm-message-context-item is-edit" data-message-context-action="edit">Edit message</button>'
        : '';
      const everyone = canEveryone
        ? '<button type="button" role="menuitem" class="tt-wm-message-context-item is-danger" data-message-context-action="everyone">Unsend for Everyone</button>'
        : '';
      return pin + edit + everyone + '<button type="button" role="menuitem" class="tt-wm-message-context-item" data-message-context-action="you">Unsend for You</button>';
    }

    function positionAt(x, y) {
      if (!menu || menu.hidden) return;
      const vw = Math.max(1, Number(root.innerWidth || doc.documentElement?.clientWidth || 1));
      const vh = Math.max(1, Number(root.innerHeight || doc.documentElement?.clientHeight || 1));
      menu.style.left = '0px';
      menu.style.top = '0px';
      const rect = menu.getBoundingClientRect();
      const width = Math.min(rect.width || 190, vw - EDGE_GAP * 2);
      const height = Math.min(rect.height || 90, vh - EDGE_GAP * 2);
      const left = Math.max(EDGE_GAP, Math.min(Number(x) || EDGE_GAP, vw - width - EDGE_GAP));
      const top = Math.max(EDGE_GAP, Math.min(Number(y) || EDGE_GAP, vh - height - EDGE_GAP));
      menu.style.left = `${Math.round(left)}px`;
      menu.style.top = `${Math.round(top)}px`;
    }

    function open(detail, x, y, source = 'mouse') {
      if (!detail?.rootId || !detail?.senderUid || !detail?.actorUid) return false;
      if (detail.pending || detail.failed) return false;
      const surface = ensureMenu();
      if (!surface) return false;
      active = detail;
      surface.innerHTML = render(detail);
      surface.dataset.source = source;
      surface.hidden = false;
      positionAt(x, y);
      return true;
    }

    function anchorPoint(detail, fallbackX = 0, fallbackY = 0) {
      const rect = detail?.anchor?.getBoundingClientRect?.();
      if (!rect) return [fallbackX, fallbackY];
      const x = Math.min(rect.right - 8, Math.max(rect.left + 8, rect.left + rect.width * 0.55));
      const y = Math.min(rect.bottom - 8, Math.max(rect.top + 8, rect.top + rect.height * 0.5));
      return [x, y];
    }

    function bind(container) {
      if (!container || bindings.has(container)) return;
      const onContext = event => {
        const detail = resolve(event.target, container);
        if (!detail) return;
        event.preventDefault();
        event.stopPropagation();
        cancelPress();
        open(detail, event.clientX, event.clientY, 'contextmenu');
      };
      const onPointerDown = event => {
        if (!['touch', 'pen'].includes(String(event.pointerType || '')) || event.button !== 0) return;
        const detail = resolve(event.target, container);
        if (!detail) return;
        cancelPress();
        const startX = Number(event.clientX || 0), startY = Number(event.clientY || 0);
        const pointerId = event.pointerId;
        const timer = root.setTimeout(() => {
          if (!press || press.pointerId !== pointerId) return;
          const [x, y] = anchorPoint(detail, startX, startY);
          if (open(detail, x, y, 'longpress')) {
            suppressClickUntil = Date.now() + 700;
            try { root.getSelection?.()?.removeAllRanges?.(); } catch (_) {}
          }
          press = null;
        }, HOLD_MS);
        press = { pointerId, startX, startY, timer };
      };
      const onPointerMove = event => {
        if (!press || press.pointerId !== event.pointerId) return;
        if (Math.hypot(Number(event.clientX || 0) - press.startX, Number(event.clientY || 0) - press.startY) > MOVE_TOLERANCE) cancelPress();
      };
      const onPointerEnd = event => {
        if (press?.pointerId === event.pointerId) cancelPress();
      };
      const onClickCapture = event => {
        if (Date.now() >= suppressClickUntil) return;
        const detail = resolve(event.target, container);
        if (!detail) return;
        event.preventDefault();
        event.stopImmediatePropagation();
      };
      container.addEventListener('contextmenu', onContext);
      container.addEventListener('pointerdown', onPointerDown);
      container.addEventListener('pointermove', onPointerMove, { passive: true });
      container.addEventListener('pointerup', onPointerEnd, { passive: true });
      container.addEventListener('pointercancel', onPointerEnd, { passive: true });
      container.addEventListener('click', onClickCapture, true);
      bindings.set(container, { onContext, onPointerDown, onPointerMove, onPointerEnd, onClickCapture });
    }

    function destroy() {
      close();
      for (const [container, handlers] of bindings) {
        container.removeEventListener('contextmenu', handlers.onContext);
        container.removeEventListener('pointerdown', handlers.onPointerDown);
        container.removeEventListener('pointermove', handlers.onPointerMove);
        container.removeEventListener('pointerup', handlers.onPointerEnd);
        container.removeEventListener('pointercancel', handlers.onPointerEnd);
        container.removeEventListener('click', handlers.onClickCapture, true);
      }
      bindings.clear();
      menu?.remove();
      menu = null;
    }

    const onOutsidePointer = event => { if (menu && !menu.hidden && !menu.contains(event.target)) close(); };
    const onKeyDown = event => { if (event.key === 'Escape' && menu && !menu.hidden) { event.preventDefault(); event.stopPropagation(); close(); } };
    const onViewportChange = () => { if (menu && !menu.hidden) close(); };
    doc.addEventListener('pointerdown', onOutsidePointer, true);
    doc.addEventListener('keydown', onKeyDown, true);
    root.addEventListener?.('resize', onViewportChange, { passive: true });
    root.addEventListener?.('blur', onViewportChange, { passive: true });

    const baseDestroy = destroy;
    destroy = function () {
      doc.removeEventListener('pointerdown', onOutsidePointer, true);
      doc.removeEventListener('keydown', onKeyDown, true);
      root.removeEventListener?.('resize', onViewportChange);
      root.removeEventListener?.('blur', onViewportChange);
      baseDestroy();
    };

    return Object.freeze({ bind, close, destroy, open, isOpen: () => Boolean(menu && !menu.hidden) });
  }

  root.TrinoTimeMessageContextMenu = Object.freeze({ create, HOLD_MS, MOVE_TOLERANCE });
})(typeof window === 'undefined' ? globalThis : window);
