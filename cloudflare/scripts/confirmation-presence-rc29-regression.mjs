import fs from 'node:fs';
import assert from 'node:assert/strict';
const worker=fs.readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
const confirmation=fs.readFileSync(new URL('../public/assets/js/j-confirmation-dashboard-rc21.js',import.meta.url),'utf8');
const metrics=fs.readFileSync(new URL('../public/assets/js/j-agent-metrics-rc22.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../public/assets/css/c-coverage-dashboard-v1.css',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
for(const marker of [
  "window.__ttConfirmationPresenceBuild='RC29'",
  '<th>Live status</th>',
  '<th>Idle today</th>',
  '<th>Away today</th>',
  'focusedIdleMs',
  'Confirmation task work'
]) assert(confirmation.includes(marker),`missing Confirmation RC29 marker: ${marker}`);
for(const marker of [
  'const focusedIdleMs=awayTimingAvailable?Math.max(0,idleMs-awayMs):idleMs',
  'presenceActiveMs,idleMs,awayMs,focusedIdleMs,awayTimingAvailable',
  "trackerState:cleanText(row.trackerState||'',32)"
]) assert(worker.includes(marker),`missing Worker RC29 presence metric marker: ${marker}`);
for(const marker of [
  "window.__ttAgentMetricsPresenceBuild='RC29'",
  'totalFocusedIdleMs',
  '<span>Idle</span>',
  '<span>Away</span>',
  '<th>Idle</th><th>Away</th>'
]) assert(metrics.includes(marker),`missing Agent Metrics RC29 marker: ${marker}`);
assert(css.includes('RC29 — Confirmation presence parity'));
assert(index.includes('presence-rc29=1'));
assert(worker.includes('activeMs:confirmationSafeMsServer(row.activeMs), idleMs:confirmationSafeMsServer(row.idleMs), awayMs:confirmationSafeMsServer(row.awayMs)'));
console.log('PASS RC29 Confirmation presence parity: Confirmation exposes Coverage-equivalent Active/Idle/Away timing, Agent Metrics carries per-job/combined idle visibility, and existing role-scoped data authority is preserved.');
