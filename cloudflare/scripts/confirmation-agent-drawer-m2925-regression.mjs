import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const sha=rel=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,rel))).digest('hex');
const js=read('public/assets/js/j-confirmation-dashboard-rc21.js');
const css=read('public/assets/css/c-coverage-dashboard-v1.css');
const worker=read('src/worker.js');
const index=read('public/index.html');

assert.ok(js.includes('ttConfirmationDrawerBackdrop'), 'Confirmation owns a dedicated drawer backdrop');
assert.ok(js.includes('openAgentDrawer(name,trigger=null)'), 'Confirmation Agent drawer loader exists');
assert.ok(js.includes('data-confirmation-agent='), 'Confirmation roster exposes clickable Agent controls');
assert.ok(js.includes("api(`agent?date=${encodeURIComponent(requestedDate)}&name=${encodeURIComponent(targetName)}`)"), 'Drawer reads Confirmation Agent detail endpoint');
assert.ok(js.includes('Confirmation interval + presence activity'), 'Confirmation-only daily summary section');
assert.ok(js.includes('<h3>Current Work</h3><span>Live Confirmation context</span>'), 'Confirmation-only Current Work section');
assert.ok(js.includes('<h3>Review Activity</h3><span>Confirmation task actions</span>'), 'Confirmation review activity section');
assert.ok(js.includes('No open Confirmation task'), 'Confirmation current job fallback');
assert.ok(!js.includes('Coverage Agent detail drawer now includes an embedded Confirmation'), 'No mixed Coverage drawer implementation in Confirmation client');
assert.ok(worker.includes("if (path === '/agent' && request.method === 'GET') return json(await confirmationAgentDetailServer(request,env,url));"), 'Confirmation Agent detail API remains authoritative');
assert.ok(css.includes('M2.9.25 — Confirmation Agent Detail Drawer'), 'Confirmation drawer styling marker');
assert.ok(css.includes('.tt-confirmation-agent-trigger'), 'Clickable Agent trigger styling');
assert.ok(index.includes('confirmation-agent-drawer-m2925=1'), 'Confirmation drawer cache bust advanced');
assert.ok(read('public/assets/js/j-coverage-dashboard-rc20.js').includes('Task activity'), 'Coverage remains functional and retains task activity alongside new Store Intelligence');
assert.ok(read('public/downloads/qc-tracker.json').includes('2.2.32'), 'Store-aware Tracker v2.2.32 staged');

console.log('PASS M2.9.25 Confirmation Agent drawer: clickable Confirmation roster drill-down, Confirmation-only details, Coverage unchanged.');
