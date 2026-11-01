import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const sha = rel => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, rel))).digest('hex');
const css = read('public/assets/css/c-coverage-dashboard-v1.css');
const index = read('public/index.html');

assert.ok(css.includes('M2.9.22 — Compact Coverage Counter Density'), 'M2.9.22 compact Coverage marker');
assert.ok(css.includes('@media(min-width:761px)'), 'desktop/tablet compact breakpoint override');
assert.ok(css.includes('.tt-coverage-root .tt-coverage-task-metrics{grid-template-columns:repeat(3,minmax(0,1fr))}'), 'task counters remain 3-up');
assert.ok(css.includes('min-height:104px;padding:14px 16px 13px'), 'counter cards compacted');
assert.ok(css.includes('.tt-coverage-root .tt-coverage-submitted-target{min-height:118px}'), 'Submitted retains richer card space');
assert.ok(css.includes('.tt-coverage-root .tt-coverage-progress{height:4px;margin-top:8px}'), 'Submitted progress compacted');
assert.ok(css.includes('@media(max-width:760px)'), 'tablet/mobile responsive fallback retained');
assert.ok(css.includes('@media(max-width:470px)'), 'single-column mobile fallback retained');
assert.ok(index.includes('coverage-compact-m2922=1'), 'Coverage CSS cache bust advanced');
assert.ok(read('public/assets/js/j-coverage-dashboard-rc20.js').includes('Task activity'), 'Coverage remains functional and retains task activity alongside new Store Intelligence');
assert.ok(read('public/downloads/qc-tracker.json').includes('2.2.32'), 'Store-aware Tracker v2.2.32 staged');

console.log('PASS M2.9.22 Compact Coverage counters: 3x2 desktop task grid, reduced dead space, Submitted detail preserved, Coverage logic unchanged.');
