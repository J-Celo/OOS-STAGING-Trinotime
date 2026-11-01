// Fast source-level guard for connected Store Operations views (read-only).
// Full sample-data behavior was tested separately in isolated Chromium.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=file=>readFileSync(new URL('../public/'+file,import.meta.url),'utf8');
const report=read('assets/js/j-store-intelligence-m2934-rc2-ui3-c3e0e3e8c587.js');
const hub=read('assets/js/j-staging-store-operations-hub-v1.js');
const html=read('index.html');
for(const s of ['tt-si-agents','tt-si-history-summary','tt-si-unmapped','tt-si-freshness','jobRowsTruncated',"data-tt-si-show-unmapped",'trinotime:store-report-updated'])assert(report.includes(s),s);
for(const s of ['reportMatchesCurrent','lastReport','tt-so-shortcut',"['performance','Agent Performance']",'trinotime:store-report-updated'])assert(hub.includes(s),s);
assert(html.includes('connected-reports-20261018'));
assert(report.includes('data.scope!==s.scope') && report.includes('data.viewer?.role!==viewer.role'));
console.log('PASS — connected Store Operations report/UI and authorization guards exist; synthetic browser test verifies behavior.');
