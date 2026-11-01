import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const expectedVersion = '2.0.3';
const expectedFingerprint = 'TT-2.0.3-M2.9.66-CONSOLIDATED-SECURITY-RC2-STAGING-20261010';
const reviewedCoreSha = '559acf7b4b88587aee2d456a036e1c58a9c3a0502dd2f96fde29fed6677f852f';
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');

const index = read('public/index.html');
const sw = read('public/sw.js');
const worker = read('src/worker.js');
const version = JSON.parse(read('public/version.json'));
const manifest = JSON.parse(read('public/manifest.json'));
const core = read('public/assets/js/j-b52f8ff97ca5.js');

assert.equal(version.version, expectedVersion, 'version.json version');
assert.equal(manifest.version, expectedVersion, 'manifest version');
assert.equal(version.build_fingerprint, expectedFingerprint, 'version.json fingerprint');
assert.equal(manifest.build_fingerprint, expectedFingerprint, 'manifest fingerprint');
assert.ok(index.includes(`content="${expectedFingerprint}"`), 'index fingerprint');
assert.ok(sw.includes(`TRINOTIME_BUILD_FINGERPRINT = '${expectedFingerprint}'`), 'service worker fingerprint');
assert.ok(worker.includes(`BUILD_FINGERPRINT = '${expectedFingerprint}'`), 'worker fingerprint');
assert.ok(index.includes('content="2.0.3"'), 'index public version');
assert.ok(index.includes('OOS TrinoTime · V 2.0.3'), 'document title');
assert.ok(index.includes('TrinoTime V 2.0.3'), 'current release UI');

assert.ok(index.includes('TrinoTime V2.0.3 · Current feature guide'), 'current feature guide identifies V2.0.3');
assert.ok(index.includes('Role-based user guides · V2.0.3'), 'role guide identifies V2.0.3');
assert.ok(index.includes('gateReadinessBuildValue">v2.0.3'), 'pre-runtime build fallback is V2.0.3');
for (const rel of ['public/assets/js/j-633451d1ceac.js','public/assets/js/j-604aaae15edd.js','public/assets/js/j-7e07b4b39da0.js']) {
  const legacyStamp = read(rel);
  assert.ok(legacyStamp.includes('trinotime-display-version'), `${rel} derives product version from metadata`);
}
assert.ok(!index.includes('/ops/'), 'no separate support portal route in workforce page');

assert.ok(core.includes("const NOTIFICATION_RELEASE_VERSION = '2.0.3';"), 'release notification version');
assert.ok(index.includes('j-v2rc82-admin-authority-bootstrap.js'), 'non-Admin/Admin authority bootstrap loaded');
assert.ok(worker.includes('/api/workforce/profile/admin-bootstrap'), 'authority bootstrap endpoint preserved');
assert.ok(read('public/assets/js/j-v2rc82-admin-authority-bootstrap.js').includes('MIN_PASSWORD = 10'), '10-char Admin password minimum preserved');
const adminAuthority = read('public/assets/js/j-v2rc82-admin-authority-bootstrap.js');
const adminUiHotfix = read('public/assets/css/c-v202-admin-password-light-confirm-layer.css');
assert.ok(index.includes('c-v202-admin-password-light-confirm-layer.css?v=2.0.3-main-ui-hotfix'), 'Admin UI hotfix CSS loaded with cache bust');
assert.ok(index.includes('j-v2rc82-admin-authority-bootstrap.js?v=2.0.3-main-ui-hotfix'), 'Admin authority bootstrap cache bust updated');
assert.ok(adminUiHotfix.includes('body.tt-admin-first-login-password-required #confirmOverlay.open'), 'required Admin sign-out confirmation top-layer override present');
assert.ok(adminUiHotfix.includes('color: #92400e !important'), 'light-mode required status contrast override present');
assert.ok(adminAuthority.includes("if (confirmOverlay?.classList.contains('open')) return;"), 'nested confirmation owns keyboard while open');

// Reviewed M2.9.64 staging core: Unified Premium baseline plus scoped TL single-Agent transfer while preserving old Admin/multi-Agent operations.
const normalizedCore = core.replace("const NOTIFICATION_RELEASE_VERSION = '2.0.3';", "const NOTIFICATION_RELEASE_VERSION = '2.0.1';");
assert.equal(sha(normalizedCore), reviewedCoreSha, 'Core matches reviewed RC2.3 gate restoration patch');
assert.ok(index.includes('&rc22-workspace-transport-bearer=1'), 'RC2.2 browser cache-bust present');
assert.ok(index.includes('&rc23-gate-pod-restore=1'), 'RC2.3 gate POD refresh cache-bust present');

assert.ok(sw.includes("cache: 'no-store'"), 'service worker navigation/version no-store policy preserved');
assert.ok(index.includes('manifest.json?v=2.0.3'), 'manifest cache-bust updated');
assert.equal(manifest.production_release, false, 'staging candidate marker');
assert.equal(version.production_release, false, 'staging version marker');

console.log('PASS — V2.0.3 production fingerprint coherence');
console.log('PASS — Admin first-login security + 10-character minimum preserved');
console.log('PASS — non-Admin chat authority bootstrap preserved');
console.log('PASS — Core matches consolidated M2.9.66 RC2 core');
console.log('PASS — production release metadata and cache-bust are coherent');
console.log('PASS — Admin light-mode contrast + nested sign-out confirmation top-layer hotfix');
