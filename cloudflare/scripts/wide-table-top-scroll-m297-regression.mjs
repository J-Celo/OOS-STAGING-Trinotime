import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const index=read('public/index.html');
const helper=read('public/assets/js/j-wide-table-top-scroll-m297.js');
const css=read('public/assets/css/c-wide-table-top-scroll-m297.css');
const coverage=read('public/assets/js/j-coverage-dashboard-rc20-rc2-ui3-3e92d149a5b8.js');
const confirmation=read('public/assets/js/j-confirmation-dashboard-rc21.js');
const metrics=read('public/assets/js/j-agent-metrics-rc22.js');
const headers=read('public/_headers');

assert(index.includes('c-wide-table-top-scroll-m297.css?v=2.0.3-m297'),'M2.9.7 top-scroll CSS must load.');
assert(index.includes('j-wide-table-top-scroll-m297.js?v=2.0.3-m297'),'M2.9.7 top-scroll helper must load.');
assert(index.indexOf('j-wide-table-top-scroll-m297.js') < index.indexOf('j-coverage-dashboard-rc20-rc2-ui3-3e92d149a5b8.js'),'top-scroll helper must load before dashboard clients.');
assert(helper.includes('const mounted = new WeakMap()'),'top-scroll helper must mount once per live scroller.');
assert(helper.includes("rail.addEventListener('scroll'")&&helper.includes("scroller.addEventListener('scroll'"),'top and native scrollbars must synchronize both directions.');
assert(helper.includes("'ResizeObserver' in window")&&helper.includes('resizeObserver.observe(content)'),'rail width must follow responsive/content-width changes without polling.');
assert(helper.includes("event.key === 'ArrowLeft'")&&helper.includes("event.key === 'ArrowRight'")&&helper.includes("event.key === 'Home'")&&helper.includes("event.key === 'End'"),'top rail must retain keyboard horizontal navigation.');
assert(!helper.includes('setInterval(')&&!helper.includes('MutationObserver'),'M2.9.7 must not add polling or document-wide mutation observers.');
assert(coverage.includes("globalThis.TrinoTimeWideTableScroll?.mount?.(el)"),'Coverage must mount a synchronized top rail for each Agent table.');
assert(confirmation.includes("globalThis.TrinoTimeWideTableScroll?.mount?.(next)"),'Confirmation must mount the synchronized top rail.');
assert(metrics.includes("querySelectorAll('.tt-ops-table-scroll').forEach(el=>globalThis.TrinoTimeWideTableScroll?.mount?.(el))"),'Metrics must mount top rails on every wide metrics/scorecard table.');
assert(css.includes('.tt-wide-table-top-scroll::-webkit-scrollbar')&&css.includes('body.dark-mode .tt-wide-table-top-scroll'),'rail must have visible scrollbar treatment and dark-mode styling.');
assert(css.includes('.tt-wide-table-top-scroll[hidden]{display:none!important}'),'rail must disappear when the table does not overflow.');
assert(/j-wide-table-top-scroll-m297\.js[\s\S]*Cache-Control: no-store, max-age=0/.test(headers),'top-scroll JS must be no-store.');
assert(/c-wide-table-top-scroll-m297\.css[\s\S]*Cache-Control: no-store, max-age=0/.test(headers),'top-scroll CSS must be no-store.');

console.log('PASS M2.9.7 wide-table access: Coverage, Confirmation and Metrics expose synchronized top horizontal scroll rails with no polling, responsive width sync, keyboard access, and dark-mode styling.');
