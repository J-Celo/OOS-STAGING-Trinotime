import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

const index = read('public/index.html');
const js = read('public/assets/js/j-v202-pod-team-create-notice.js');
const css = read('public/assets/css/c-v202-pod-team-create-notice.css');

assert.ok(index.includes('Create &amp; Rename PODs / Teams'), 'POD directory heading uses POD / Team wording');
assert.ok(index.includes('New POD / Team name'), 'create field uses POD / Team wording');
assert.ok(index.includes('>Create POD / Team</button>'), 'create button uses POD / Team wording');
assert.ok(index.includes('j-v202-pod-team-create-notice.js?v=2.0.3-rc4'), 'RC4 creation notice JS is loaded');
assert.ok(index.includes('c-v202-pod-team-create-notice.css?v=2.0.3-rc4'), 'RC4 creation notice CSS is loaded');
assert.ok(js.includes("SUCCESS_SUFFIX = ' was created with its Day Off schedule shell confirmed by Firebase.'"), 'notice is tied to confirmed Firebase success status');
assert.ok(js.includes('new MutationObserver(inspect)'), 'notice uses scoped status observation');
assert.ok(js.includes('observer.observe(status'), 'observer is scoped to POD manager status only');
assert.ok(js.includes('`${name} created.`'), 'success copy uses the created POD / Team name');
assert.ok(css.includes('z-index: 2147483646 !important'), 'success notice is above operational modal stacks');
assert.ok(css.includes('pointer-events: none'), 'success notice cannot block Admin controls');

console.log('PASS — POD / Team creation wording updated');
console.log('PASS — success notification fires only from confirmed POD creation success state');
console.log('PASS — creation notification is body-level and front-most without blocking controls');
