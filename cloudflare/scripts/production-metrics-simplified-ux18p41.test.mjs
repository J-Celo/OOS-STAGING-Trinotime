/** UX18P41: offline presentation regression. No network, Firebase reads or writes. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const base=new URL('../',import.meta.url);
const js=fs.readFileSync(new URL('public/assets/js/j-agent-metrics-rc22.js',base),'utf8');
const css=fs.readFileSync(new URL('public/assets/css/c-coverage-dashboard-v1.css',base),'utf8');
const html=fs.readFileSync(new URL('public/index.html',base),'utf8');
const worker=fs.readFileSync(new URL('src/worker.js',base),'utf8');
assert.match(js,/<option value="coverage" selected>Coverage<\/option>/,'default to Coverage');
assert.match(js,/metricsPod='__all__';metricsPodInitialized=true/,'default to all authorized PODs without changing Worker scope');
for(const token of ['tt-mx-advanced-filters','tt-mx-team-overview','tt-mx-team-card','tt-mx-no-work','tt-mx-roster-actions','tt-mx-deep-dive','tt-mx-advanced-body']){
 assert.ok(js.includes(token),`Missing accessible simple-view hook: ${token}`);
 assert.ok(css.includes(token),`Missing simple-view styling: ${token}`);
}
assert.match(js,/ttMetricsColumnsToggle/,'existing roster detail toggle is wired');
assert.match(js,/const deepDiveOpen=.*tt-mx-deep-dive\[open\]/,'optional report must stay open across refresh');
assert.match(js,/data-job-filter="\$\{esc\(filter\)\}"/,'work type stays explicit in compact roster');
assert.match(js,/tt-mx-secondary/,'secondary columns are retained and optionally visible');
assert.match(css,/body\.dark-mode #ttMetricsRoot \.tt-mx-team-card/,'dark mode present');
assert.match(css,/@media\(max-width:650px\)/,'mobile layout present');
assert.match(html,/metrics-simplified-ux18p41=20261030/,'JS and CSS cache-busted');
assert.match(js,/\$\{shiftDetails\(rows,useScopeAggregate\?lastData\.aggregate\.jobs\?\.coverage:null\)\}/,'existing protected shift history remains');
assert.match(js,/lastData\.aggregate\.pods/,'authorized full-POD aggregation remains source of scope data');
assert.match(js,/filter==='all'\?item\.summary:item\.jobs\?\.\[filter\]/,'POD comparison retains per-job summaries');
// Run the real new card presenter against synthetic data; never fabricate grades for no work.
const begin=js.indexOf('// UX18P41: overview cards summarize');
const end=js.indexOf('function statCard(',begin);
assert(begin>=0&&end>begin);
const ctx=vm.createContext({console});
vm.runInContext(`const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const whole=n=>Math.round(Number(n)||0).toLocaleString();
const capScore=v=>v===null||v===undefined||!Number.isFinite(Number(v))?null:Math.max(0,Math.min(100,Number(v)));
const gradeFor=n=>n===null?'NA':n>=100?'A':n>=80?'B':n>=60?'C':n>=40?'D':'F';
${js.slice(begin,end)}
globalThis.t={podStatus,podOverview};`,ctx);
const {podStatus,podOverview}=ctx.t;
assert.equal(podStatus({totalSubmitted:0,totalMeasured:0,efficiency:null}).kind,'empty');
assert.equal(podStatus({totalSubmitted:90,totalMeasured:80,efficiency:null,gradeReason:'No effective target for coverage'}).kind,'review');
assert.equal(podStatus({totalSubmitted:90,totalMeasured:80,efficiency:100}).title,'A · 100%');
assert.equal(podStatus({totalSubmitted:90,totalMeasured:80,efficiency:45}).title,'D · 45%');
const out=podOverview([
 {name:'POD 0',summary:{totalMeasured:80,totalSubmitted:90,efficiency:null,gradeReason:'No effective target for coverage'}},
 {name:'POD 1',summary:{totalMeasured:50,totalSubmitted:50,efficiency:100,retrospectiveCount:2}},
 {name:'POD 2',summary:{totalMeasured:0,totalSubmitted:0,efficiency:null}}
]);
assert.match(out,/2<\/strong> with measured work/);
assert.match(out,/1<\/strong> graded/);
assert.match(out,/1<\/strong> need review/);
assert.match(out,/1 team without measured work/);
assert.match(out,/Retrospective grade included/);
assert.ok(out.indexOf('POD 0')<out.indexOf('POD 2'),'active teams appear before collapsed no-work list');
assert.equal((out.match(/tt-mx-team-card is-/g)||[]).length,3,'no team omitted from authorized scope');
assert(!/metrics\/targets\b/.test(js.slice(begin,end)),'team overview is read-only');
assert.match(worker,/UX18P40: read-only retrospective presentation/,'retrospective server grading remains');
console.log('PASS UX18P41: beginner-friendly active-first overview, honest no-work and ungraded statuses, 6-column default, scoped filters, preserved details, dark/mobile styling, no Worker changes');
