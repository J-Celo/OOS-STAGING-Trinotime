import fs from 'node:fs';
import assert from 'node:assert/strict';

const coverage = fs.readFileSync(new URL('../public/assets/js/j-coverage-dashboard-rc20.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../public/assets/css/c-coverage-dashboard-v1.css', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../public/assets/js/j-b52f8ff97ca5.js', import.meta.url), 'utf8');
const index = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

assert.match(coverage, /function coverageAvatarMarkup\(name\)/, 'Coverage must have a dedicated avatar renderer');
assert.match(coverage, /window\.TrinoTimeChatProfiles/, 'Coverage must reuse the existing sanitized TrinoTime profile bridge');
assert.match(coverage, /profiles\.avatarMarkup\(canonical,'tt-coverage-avatar'\)/, 'Coverage must request the existing profile-photo markup');
assert.ok(coverage.includes('data-agent-avatar=\"${esc(canonical)}\"'), 'Coverage fallback avatar must remain refreshable by the existing profile system');
assert.match(coverage, /\$\{coverageAvatarMarkup\(row\.name\)\}/, 'Agent rows must render the profile-aware avatar');
assert.doesNotMatch(coverage, /<span class=\\"tt-coverage-avatar\\">\$\{esc\(initials\)\}<\/span>/, 'Legacy initials-only Coverage avatar must be removed');

assert.match(css, /\.tt-coverage-avatar\{[^}]*overflow:hidden[^}]*\}/, 'Avatar shell must crop photos cleanly');
assert.match(css, /\.tt-coverage-avatar img\{[^}]*width:100%[^}]*height:100%[^}]*object-fit:cover[^}]*\}/, 'Profile photos must fill the existing avatar footprint without distorting layout');

assert.match(app, /window\.TrinoTimeChatProfiles = Object\.freeze\(/, 'Existing profile bridge must still exist');
assert.match(app, /avatarMarkup: \(name, className = 'tt-wm-avatar is-direct'\) => profilePhotoMarkup/, 'Existing profile bridge must continue to source sanitized TrinoTime profile photos');
assert.match(app, /function refreshAgentAvatarInstances\(agentName = null\)/, 'Existing avatar refresh path must remain available');
assert.match(index, /c-coverage-dashboard-v1\.css[^\"]*profile-avatar-rc30=1/, 'Coverage CSS must be cache-busted for RC30');
assert.match(index, /j-coverage-dashboard-rc20\.js[^\"]*profile-avatar-rc30=1/, 'Coverage JS must be cache-busted for RC30');

console.log('RC30 Coverage profile-avatar regression: PASS');
