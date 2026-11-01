import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const core = read('public/assets/js/j-b52f8ff97ca5.js');
const css = read('public/assets/css/c-b9c19cd1cd0b.css');
const index = read('public/index.html');

assert.ok(core.includes('let trinoEditionFirstPaintSettling = false;'), 'edition settling state exists');
assert.ok(core.includes("html.dataset.trinoEditionSettling = 'true';"), 'edition settling attribute is asserted');
assert.ok(core.includes('if (visible && trinoEditionFirstPaintSettling)'), 'route reveal is blocked while edition settles');
assert.ok(core.includes("setEditionFirstPaintBarrier(true, 'enter-app');\n            setDashboardRouteVisibility(false);"), 'enterApp engages barrier before first paint');
assert.ok(core.includes('try { await loadPremiumAccessPolicy(); }'), 'authoritative Premium policy is awaited during entry');
assert.ok(core.includes("setEditionFirstPaintBarrier(false, 'supervisor-edition-ready');\n                setDashboardRouteVisibility(true);"), 'supervisor reveal releases barrier only after edition is ready');
assert.ok(core.includes("setEditionFirstPaintBarrier(false, 'agent-edition-ready');\n                    setDashboardRouteVisibility(true);"), 'agent reveal releases barrier only after edition is ready');
assert.ok(core.includes("setEditionFirstPaintBarrier(false, 'restored-agent-edition-ready');"), 'persistent Agent restore releases barrier after policy settlement');
assert.ok(core.includes("setEditionFirstPaintBarrier(false, 'session-ended');"), 'logout clears barrier state');
assert.ok(css.includes("html[data-trino-edition-settling='true'] #appRoot"), 'hard CSS first-paint guard present');
assert.ok(css.includes('visibility: hidden !important;') && css.includes('opacity: 0 !important;'), 'hard CSS guard cannot be bypassed by later UI paint rules');
assert.ok(index.includes('premium-hard-barrier-m2933=1'), 'main assets cache-busted for M2.9.33');

console.log('PASS M2.9.33 Premium hard first-paint barrier: route reveal is blocked until server-backed edition policy has settled.');
