import fs from 'node:fs';
import assert from 'node:assert/strict';

const index=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const cov=fs.readFileSync(new URL('../public/assets/js/j-coverage-dashboard-rc20.js',import.meta.url),'utf8');
const headers=fs.readFileSync(new URL('../public/_headers',import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');

assert.match(index,/src="assets\/js\/j-coverage-dashboard-rc20\.js\?v=2\.0\.3-coverage-rc20&confirmation-nav-rc21=1(?:&[^\"]*)?"/,'Current release must use a physical Coverage JS filename so older browser-cache entries cannot win');
assert.doesNotMatch(index,/src="assets\/js\/j-coverage-dashboard-v1\.js/,'Current index must not boot the old Coverage JS path');
assert.match(cov,/window\.__ttCoverageDashboardBuild = 'RC20'/,'Current Coverage module must expose an exact build marker for diagnosis');
assert.match(cov,/X-TT-Coverage-Expected-Role/,'Coverage requests must bind to the role shown by the TrinoTime page');
assert.match(worker,/COVERAGE_SESSION_BINDING_MISMATCH/,'Worker must reject a Coverage request when the authenticated role disagrees with the page role');
assert.match(worker,/coverageAssertExpectedViewerServer\(request, actor\)/,'dashboard and detail authority must enforce the role binding');
assert.match(headers,/\/assets\/js\/j-coverage-dashboard-rc20\.js[\s\S]*Cache-Control: no-store, max-age=0/,'Current Coverage asset must be served no-store');
console.log('coverage-admin-cache-rc15-regression: PASS');
