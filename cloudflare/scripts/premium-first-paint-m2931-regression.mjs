import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const core = read('public/assets/js/j-b52f8ff97ca5.js');
const index = read('public/index.html');

const start = core.indexOf('async function enterApp(');
const end = core.indexOf('let sessionMetaToggleWired', start);
assert.ok(start >= 0 && end > start, 'enterApp block found');
const enter = core.slice(start, end);
const barrier = enter.indexOf("setEditionFirstPaintBarrier(true, 'enter-app')");
const hide = enter.indexOf('setDashboardRouteVisibility(false);');
const snapshot = enter.indexOf('loadAllFromFirebaseOnce');
const policy = enter.indexOf('await loadPremiumAccessPolicy();');
const settled = enter.indexOf("applyPremiumModeForCurrentSession('enter-app-edition-settled')");
const release = enter.indexOf("setEditionFirstPaintBarrier(false, 'supervisor-edition-ready')");
const firstReveal = enter.lastIndexOf('setDashboardRouteVisibility(true);');
assert.ok(barrier >= 0, 'hard edition barrier engaged during enterApp');
assert.ok(hide > barrier, 'workspace hidden immediately after edition barrier engages');
assert.ok(snapshot > hide, 'server snapshot begins after reveal barrier is engaged');
assert.ok(policy > snapshot, 'server-backed Premium policy explicitly awaited after workspace snapshot');
assert.ok(settled > policy, 'Premium edition is settled after authoritative policy read');
assert.ok(release > settled && firstReveal > release, 'supervisor reveal happens only after barrier release');
assert.ok(enter.includes('const startupNeedsBeblessSecureEntitlement = !!(enteringAuthenticatedAgent && isBeblessPremiumTarget(verifiedAgentName));'), 'per-account Premium startup decision preserved');
assert.ok(index.includes('premium-first-paint-m2931=1'), 'M2.9.31 compatibility cache marker retained');

console.log('PASS M2.9.31 Premium first-paint barrier compatibility: authenticated shell remains gated until edition settlement.');
