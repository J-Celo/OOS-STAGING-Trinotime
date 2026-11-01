import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const css = read('public/assets/css/c-coverage-dashboard-v1.css');
const js = read('public/assets/js/j-coverage-dashboard-rc20.js');
const index = read('public/index.html');

assert.ok(css.includes('M2.9.21 — Executive Coverage Command Center'), 'M2.9.21 Coverage luxury marker');
assert.ok(css.includes('.tt-coverage-summary-stack'), 'Coverage summary stack');
assert.ok(js.includes('tt-coverage-task-section'), 'Task activity section');
assert.ok(js.includes('tt-coverage-presence-section'), 'Presence intelligence section');
assert.ok(css.includes('.tt-coverage-task-metrics{grid-template-columns:repeat(3,minmax(0,1fr))}'), 'Task metrics balanced 3-up');
assert.ok(css.includes('.tt-coverage-presence-metrics{grid-template-columns:repeat(3,minmax(0,1fr))}'), 'Presence metrics balanced 3-up');
assert.ok(css.includes('.tt-coverage-metric.is-active{--cv-accent:var(--cv-green)}'), 'Active accent preserved');
assert.ok(css.includes('.tt-coverage-metric.is-idle{--cv-accent:var(--cv-amber)}'), 'Idle accent preserved');
assert.ok(css.includes('.tt-coverage-metric.is-away{--cv-accent:var(--cv-rose)}'), 'Away accent preserved');
assert.ok(css.includes('body.dark-mode .tt-coverage-root .tt-coverage-hero'), 'Coverage dark hero');
assert.ok(css.includes('html:has(#ttCoverageRoot:not([hidden]))'), 'Coverage utility rail scoping');
assert.ok(js.includes('Task activity'), 'Task activity summary header rendered');
assert.ok(js.includes('Coverage counters'), 'Coverage counters summary header rendered');
assert.ok(js.includes('Presence intelligence'), 'Presence intelligence summary header rendered');
assert.ok(js.includes("metric('Active',fmtDuration(t.activeMs),'Tracker estimate','is-active')"), 'Active metric data preserved');
assert.ok(js.includes("metric('Idle',idleValue,idleNote,'is-idle')"), 'Idle metric data preserved');
assert.ok(js.includes("metric('Away',awayValue,awayNote,'is-away')"), 'Away metric data preserved');
assert.ok(index.includes('coverage-luxury-m2921=1'), 'Coverage CSS cache bust');
assert.ok(index.includes('coverage-command-m2921=1'), 'Coverage JS cache bust');

console.log('PASS M2.9.21 Coverage executive UI: balanced task/presence groups, luxury light/dark surfaces, quieter utility rail, and unchanged metric data bindings.');
