import fs from 'node:fs';
import assert from 'node:assert/strict';

const main=fs.readFileSync(new URL('../public/assets/js/j-b52f8ff97ca5.js',import.meta.url),'utf8');
const cov=fs.readFileSync(new URL('../public/assets/js/j-coverage-dashboard-rc20.js',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');

assert.match(main,/if \(isAdmin\) return '';/,'main shell must keep RC13 Admin stale-token protection');
assert.match(cov,/if\(normalizedRole\(a\?\.role\)!==\'admin\'\)/,'Coverage dashboard must not send a remembered Agent/TL security token from Admin UI');
assert.match(cov,/assertDashboardViewerBinding\(a,dashboard\)/,'Coverage dashboard must fail visibly on client\/server role mismatch');
assert.match(index,/j-b52f8ff97ca5\.js\?[^"']*coverage-auth-rc14=1/,'main app shell must be cache-busted so RC13 Admin stale-token protection actually loads');
assert.match(index,/j-coverage-dashboard-rc20\.js\?v=2\.0\.3-coverage-rc20/,'Coverage JS must load through the RC15 cache-safe asset path');
assert.match(worker,/scope:coverageViewerRoleServer\(actor\.role\)===\'admin\'\?\'all-pods\'/,'server Admin scope remains organization-wide');
assert.match(worker,/canonicalWorkforceAuthorizationRosterServer\(env\)/,'server Coverage roster remains canonical');
console.log('coverage-admin-auth-rc14-regression: PASS');
