// Offline UX18P45 contract: no Firebase, no employee records or writes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const dir = dirname(fileURLToPath(import.meta.url));
const cloud = resolve(dir, '..');
const root = resolve(cloud, '..');
for (const file of [
  'cloudflare/public/assets/js/j-5a9b0d9aeabc.js',
  'cloudflare/public/assets/js/j-b52f8ff97ca5.js',
  'assets/js/j-b52f8ff97ca5.js',
  'assets/js/05-core-application.js',
]) {
  const source = readFileSync(resolve(root, file), 'utf8');
  const rate = source.slice(source.indexOf('async function saveEmployeeHourlyRate('), source.indexOf('function renderTotalsTab('));
  const editor = source.slice(source.indexOf('function renderTotalsTab('), source.indexOf('let previewingNoteKey'));
  assert.match(rate, /TrinoPermissions\.require\('finance\.hourly_rate\.edit'/, `${file}: Admin authority`);
  assert.match(rate, /await saveEmployees\(\{ awaitRemote:true \}\)/, `${file}: wait for server receipt`);
  assert.match(rate, /return saveResult;/, `${file}: return receipt`);
  assert.match(rate, /logAudit\('hourly_rate_update'/, `${file}: audit remains`);
  assert.match(editor, /hourly-rate-input" type="text" inputmode="decimal"/, `${file}: no spinner`);
  assert.doesNotMatch(editor, /hourly-rate-input" type="number"/, `${file}: old spinner`);
  assert.match(editor, /hourly-rate-save/, `${file}: explicit save`);
  assert.match(editor, /hourly-rate-cancel/, `${file}: explicit cancel`);
  assert.doesNotMatch(editor, /addEventListener\('change', commit\)/, `${file}: no autosave`);
  assert.match(editor, /if \(options\.force !== true && isAdmin &&/, `${file}: refresh guard`);
  assert.match(editor, /input\.select\(\)/, `${file}: select amount on focus`);
  assert.match(editor, /result && result\.remoteSaved/, `${file}: no false server success`);
  assert.match(editor, /getErrorMessage\(error\)/, `${file}: actionable failure`);
  assert.match(source, /'totalsPodFilter'\)\.addEventListener\('change', \(\) => renderTotalsTab\(\{force:true\}\)\)/, `${file}: deliberate pod change`);
}
const app = readFileSync(resolve(cloud, 'public/index.html'), 'utf8');
assert.match(app, /UX18P4[56]-/);
const css = readFileSync(resolve(cloud, 'public/assets/css/c-v1193-production-polish.css'), 'utf8');
assert.match(css, /#totalsOverlay \.hourly-rate-actions\[hidden\] \{ display:none !important; \}/);
console.log('PASS UX18P45 hourly-rate editor: explicit save/cancel, refresh guard, authority, server receipt, old input removed (4 source mirrors)');
