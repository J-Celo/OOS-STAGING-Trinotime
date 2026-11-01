import fs from 'node:fs';
const js=fs.readFileSync(new URL('../public/assets/js/j-coverage-dashboard-rc20.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const headers=fs.readFileSync(new URL('../public/_headers',import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
function assert(ok,msg){if(!ok)throw new Error(msg)}
assert(js.includes("window.__ttCoverageDashboardBuild = 'RC20'"),'RC17 build marker missing');
assert(js.includes("document.getElementById('sessionIndicator')?.dataset?.role"),'RC17 must read session-indicator role');
assert(js.includes("document.getElementById('executiveStatusRole')?.textContent"),'RC17 must read Executive Operations role');
assert(js.includes("executiveRole==='executive admin'"),'Executive Admin must map to Admin');
assert(js.includes("normalizedRole(a?.role)!=='admin'"),'Admin auth branch must use normalized role');
assert(js.includes('TrinoTimeCoverageDiagnostics'),'Runtime Coverage diagnostics must be exposed');
assert(html.includes('assets/js/j-coverage-dashboard-rc20.js?v=2.0.3-coverage-rc20'),'index must load RC17 asset');
assert(!html.includes('j-coverage-dashboard-rc16.js'),'index must not load RC16 asset');
assert(headers.includes('/assets/js/j-coverage-dashboard-rc20.js') && /j-coverage-dashboard-rc20\.js[\s\S]*Cache-Control:\s*no-store/i.test(headers),'RC17 asset must be no-store');
assert(worker.includes("x-tt-coverage-expected-role"),'Server role binding must remain');
assert(worker.includes("scope:coverageViewerRoleServer(actor.role)==='admin'?'all-pods'"),'Admin all-pods server scope must remain');
console.log('Coverage Admin shell-authority RC17 regression: PASS');
