(() => {
  'use strict';

  const RELEASE = '1.1.12';
  const FIELD_ID = 'todayShiftField';
  const SELECT_ID = 'todayShiftSelect';
  const ENHANCED_CLASS = 'tt-v1112-shift-enhanced';
  const WRAPPER_CLASS = 'tt-v1112-shift-combobox';

  const $ = (id) => document.getElementById(id);

  function isPremiumTeamLeader() {
    const html = document.documentElement;
    const body = document.body;
    if (!body) return false;
    const role = String(body.dataset.trinoRole || body.getAttribute('data-trino-role') || '').toLowerCase();
    const premium = html.getAttribute('data-trino-custom-workspace') === 'enabled' || html.dataset.trinoTier === 'premium';
    return role === 'teamleader' && premium;
  }

  function optionData(select) {
    return Array.from(select.options || []).map((option) => ({
      value: option.value,
      label: option.textContent || option.label || option.value,
      disabled: !!option.disabled,
      selected: option.value === select.value
    }));
  }

  function closeMenu(wrapper, restoreFocus = false) {
    if (!wrapper) return;
    const button = wrapper.querySelector('.tt-v1112-shift-button');
    const listbox = wrapper.querySelector('.tt-v1112-shift-listbox');
    if (!button || !listbox) return;
    wrapper.classList.remove('is-open');
    button.setAttribute('aria-expanded', 'false');
    listbox.hidden = true;
    if (restoreFocus) {
      try { button.focus({ preventScroll: true }); } catch (_) { button.focus(); }
    }
  }

  function syncWrapper(select, wrapper) {
    if (!select || !wrapper) return;
    const button = wrapper.querySelector('.tt-v1112-shift-button');
    const value = wrapper.querySelector('.tt-v1112-shift-value');
    const listbox = wrapper.querySelector('.tt-v1112-shift-listbox');
    if (!button || !value || !listbox) return;

    const options = optionData(select);
    const selected = options.find((item) => item.selected) || options[0];
    value.textContent = selected ? selected.label : 'Choose today\u2019s shift';
    button.disabled = !!select.disabled || !options.length;
    button.setAttribute('aria-disabled', button.disabled ? 'true' : 'false');

    listbox.innerHTML = '';
    options.forEach((item) => {
      const opt = document.createElement('button');
      opt.type = 'button';
      opt.className = 'tt-v1112-shift-option';
      opt.setAttribute('role', 'option');
      opt.setAttribute('data-value', item.value);
      opt.setAttribute('aria-selected', item.selected ? 'true' : 'false');
      opt.disabled = item.disabled;
      opt.textContent = item.label;
      opt.addEventListener('click', () => {
        if (select.disabled || item.disabled) return;
        select.value = item.value;
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
        closeMenu(wrapper, true);
        queueMicrotask(() => syncWrapper(select, wrapper));
      });
      listbox.appendChild(opt);
    });

    if (button.disabled) closeMenu(wrapper, false);
  }

  function createWrapper(select) {
    const existing = select.parentElement && select.parentElement.querySelector(`.${WRAPPER_CLASS}`);
    if (existing) return existing;

    const wrapper = document.createElement('div');
    wrapper.className = WRAPPER_CLASS;
    wrapper.dataset.trinotimeRelease = RELEASE;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tt-v1112-shift-button';
    button.setAttribute('role', 'combobox');
    button.setAttribute('aria-haspopup', 'listbox');
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-label', 'Today\u2019s shift');

    const value = document.createElement('span');
    value.className = 'tt-v1112-shift-value';

    const chevron = document.createElement('span');
    chevron.className = 'tt-v1112-shift-chevron';
    chevron.setAttribute('aria-hidden', 'true');
    chevron.innerHTML = '<svg viewBox="0 0 20 20" focusable="false"><path d="M5.75 7.75 10 12l4.25-4.25" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    const listbox = document.createElement('div');
    listbox.className = 'tt-v1112-shift-listbox';
    listbox.setAttribute('role', 'listbox');
    listbox.setAttribute('aria-label', 'Today\u2019s shift options');
    listbox.hidden = true;

    button.append(value, chevron);
    wrapper.append(button, listbox);
    select.insertAdjacentElement('afterend', wrapper);

    button.addEventListener('click', () => {
      if (button.disabled) return;
      const open = wrapper.classList.toggle('is-open');
      button.setAttribute('aria-expanded', open ? 'true' : 'false');
      listbox.hidden = !open;
      if (open) {
        const selected = listbox.querySelector('[aria-selected="true"]') || listbox.querySelector('.tt-v1112-shift-option:not(:disabled)');
        if (selected) setTimeout(() => selected.focus(), 0);
      }
    });

    button.addEventListener('keydown', (event) => {
      if ((event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') && !wrapper.classList.contains('is-open')) {
        event.preventDefault();
        button.click();
      }
    });

    listbox.addEventListener('keydown', (event) => {
      const items = Array.from(listbox.querySelectorAll('.tt-v1112-shift-option:not(:disabled)'));
      if (!items.length) return;
      const current = Math.max(0, items.indexOf(document.activeElement));
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMenu(wrapper, true);
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        items[(current + 1) % items.length].focus();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        items[(current - 1 + items.length) % items.length].focus();
      } else if (event.key === 'Home') {
        event.preventDefault();
        items[0].focus();
      } else if (event.key === 'End') {
        event.preventDefault();
        items[items.length - 1].focus();
      }
    });

    document.addEventListener('pointerdown', (event) => {
      if (wrapper.classList.contains('is-open') && !wrapper.contains(event.target)) closeMenu(wrapper, false);
    }, true);

    return wrapper;
  }

  let selectObserver = null;
  let fieldObserver = null;

  function disableEnhancement(field, select) {
    if (field) field.classList.remove(ENHANCED_CLASS);
    const wrapper = field && field.querySelector(`.${WRAPPER_CLASS}`);
    if (wrapper) {
      closeMenu(wrapper, false);
      wrapper.hidden = true;
    }
    if (select) select.removeAttribute('data-tt-v1112-enhanced');
  }

  function enableEnhancement(field, select) {
    const wrapper = createWrapper(select);
    wrapper.hidden = false;
    field.classList.add(ENHANCED_CLASS);
    select.setAttribute('data-tt-v1112-enhanced', 'true');
    syncWrapper(select, wrapper);

    if (!selectObserver) {
      selectObserver = new MutationObserver(() => syncWrapper(select, wrapper));
      selectObserver.observe(select, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });
    }
    if (!fieldObserver) {
      fieldObserver = new MutationObserver(() => {
        if (field.style.display === 'none') closeMenu(wrapper, false);
      });
      fieldObserver.observe(field, { attributes: true, attributeFilter: ['style', 'class'] });
    }
  }

  function sync() {
    const field = $(FIELD_ID);
    const select = $(SELECT_ID);
    if (!field || !select) return;
    if (isPremiumTeamLeader()) enableEnhancement(field, select);
    else disableEnhancement(field, select);
  }

  function init() {
    sync();
    const html = document.documentElement;
    const body = document.body;
    new MutationObserver(sync).observe(html, { attributes: true, attributeFilter: ['data-trino-custom-workspace', 'data-trino-tier'] });
    if (body) new MutationObserver(sync).observe(body, { attributes: true, attributeFilter: ['data-trino-role'] });
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      const wrapper = document.querySelector(`.${WRAPPER_CLASS}.is-open`);
      if (wrapper) closeMenu(wrapper, true);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
