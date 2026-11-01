import fs from 'node:fs';

const js = fs.readFileSync(new URL('../public/assets/js/j-coverage-dashboard-rc20.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const headers = fs.readFileSync(new URL('../public/_headers', import.meta.url), 'utf8');
const worker = fs.readFileSync(new URL('../src/worker.js', import.meta.url), 'utf8');

function assert(ok, message) { if (!ok) throw new Error(message); }

assert(js.includes("window.__ttCoverageDashboardBuild = 'RC20'"), 'Current Coverage build marker missing.');
assert(js.includes("const bodyRole=normalizedRole(document.body?.dataset?.trinoRole||'')"), 'Coverage must retain the live core-shell role hint.');
assert(js.includes("const verifiedAdminProfile=window.TrinoTimeAdminProfile?.current?.()||null"), 'Coverage must retain the server-verified Admin profile bridge.');
assert(js.includes("if(shell.role==='admin'||verifiedAdminProfile)"), 'Admin shell/profile authority must override a stale Messaging actor.');
assert(js.indexOf("if(shell.role==='admin'||verifiedAdminProfile)") < js.indexOf('TrinoTimeMessagingSessionContext?.getActor'), 'Admin override must run before Messaging actor fallback.');
assert(html.includes('assets/js/j-coverage-dashboard-rc20.js?v=2.0.3-coverage-rc20'), 'index.html must load the current physical Coverage asset.');
assert(headers.includes('/assets/js/j-coverage-dashboard-rc20.js') && /j-coverage-dashboard-rc20\.js[\s\S]*Cache-Control:\s*no-store/i.test(headers), 'Current Coverage asset must remain no-store.');
assert(worker.includes("x-tt-coverage-expected-role"), 'Server expected-role binding must remain enforced.');
assert(worker.includes("scope:coverageViewerRoleServer(actor.role)==='admin'?'all-pods'"), 'Admin server scope must remain all-pods.');
assert(worker.includes('canonicalWorkforceAuthorizationRosterServer(env)'), 'Canonical workforce roster source must remain enabled.');

console.log('Coverage Admin role-source inheritance regression: PASS');
