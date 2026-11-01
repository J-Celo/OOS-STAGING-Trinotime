import fs from 'node:fs';
import assert from 'node:assert/strict';

const css=fs.readFileSync(new URL('../public/assets/css/c-coverage-dashboard-v1.css',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');

assert.ok(css.includes('M2.9.19 — Executive Luxury Metrics refinement'),'M2.9.19 CSS marker');
assert.ok(css.includes('.tt-mx-stat::before{') && css.includes('width:30px;height:2px'),'KPI micro-accent replaces full-height rail');
assert.ok(css.includes('.tt-mx-stat::after{display:none}'),'decorative KPI bubble disabled');
assert.ok(css.includes('html:has(#ttMetricsRoot:not([hidden]))'),'Metrics-only utility rail scope');
assert.ok(css.includes('.tt-metrics-table thead th{'),'premium roster table header treatment');
assert.ok(css.includes('body.dark-mode .tt-mx-roster'),'dark-mode roster treatment');
assert.ok(index.includes('metrics-luxury-m2919=1'),'M2.9.19 CSS cache-bust');
console.log('PASS M2.9.19 luxury Metrics UI: micro accents, quiet glass cards, premium roster, subtle Metrics-only utility rail, dark-mode parity.');
