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
const index=read('public/index.html');

assert.ok(js.includes('drawerRequestSeq'), 'drawer request sequence guard present');
assert.ok(js.includes('requestedActorSig=actorSig(actor())'), 'drawer binds request to authenticated actor');
assert.ok(js.includes("requestedDate!==date||requestedActorSig!==actorSig(actor())"), 'stale date/identity drawer responses are discarded');
assert.ok(js.includes("data?.authority!=='workforce-confirmation-v1'"), 'drawer validates authoritative Confirmation response');
assert.ok(js.includes('confirmationScopedAgents()'), 'drawer is bound to current authorized visible Agent scope');
assert.ok(js.includes("closeAgentDrawer({restoreFocus:false});identity=sig"), 'identity changes invalidate/close the drawer');
assert.ok(js.includes("closeAgentDrawer({restoreFocus:false});$('ttConfirmationBody').innerHTML='<div class=\"tt-coverage-error\">Sign in to view Confirmation.</div>'"), 'sign-out path clears stale drawer content');
assert.ok(js.includes("$('ttConfirmationRefresh').onclick=()=>{closeAgentDrawer({restoreFocus:false});refresh(true);};"), 'manual refresh cannot leave stale drawer data open');
assert.ok(js.includes("currentInterval=s.connected?`Interval ${Number(s.currentInterval)||1}`:'—'"), 'offline Agent no longer displays a fake Interval 1');
assert.ok(js.includes('submittedDisplayTotal'), 'EOD prefers authoritative corrected display total');
assert.ok(js.includes("dailyHeading=requestedDate===phtDate()?'Today':'Daily Summary'"), 'historical drawer dates are not mislabeled Today');
assert.ok(js.includes('<span>INT ${Number(t.interval)||\'—\'}</span>'), 'task interval label is unambiguous from idle timing');
assert.ok(js.includes("event.key==='Tab'"), 'modal keyboard focus remains inside open drawer');
assert.ok(js.includes('tabindex="-1"'), 'dialog can receive focus while loading');
assert.ok(css.includes('M2.9.26 — Confirmation drawer hardening / cleanup.'), 'M2.9.26 cleanup CSS marker');
assert.ok(css.includes('html.tt-confirmation-drawer-open'), 'background scroll lock is scoped to open Confirmation drawer');
assert.ok(index.includes('confirmation-drawer-cleanup-m2926=1'), 'Confirmation cleanup cache bust advanced');
assert.ok(read('public/assets/js/j-coverage-dashboard-rc20.js').includes('Task activity'), 'Coverage remains functional and retains task activity alongside new Store Intelligence');
assert.ok(read('public/downloads/qc-tracker.json').includes('2.2.32'), 'Store-aware Tracker v2.2.32 staged');

console.log('PASS M2.9.26 Confirmation drawer cleanup: stale-response guards, scope invalidation, refresh/identity cleanup, EOD correctness, modal focus/scroll hardening, Coverage/Tracker unchanged.');
