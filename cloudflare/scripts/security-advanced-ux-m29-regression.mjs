import fs from 'node:fs';
import assert from 'node:assert/strict';

const index = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../public/assets/css/c-v203-metrics-m29-security-advanced-ux.css', import.meta.url), 'utf8');
const js = fs.readFileSync(new URL('../public/assets/js/j-b52f8ff97ca5.js', import.meta.url), 'utf8');

assert(index.includes('c-v203-metrics-m29-security-advanced-ux.css?v=2.0.3-m29'), 'M2.9 stylesheet must be loaded after M2.8');
assert(index.indexOf('c-v203-metrics-m29-security-advanced-ux.css') > index.indexOf('c-v203-metrics-m28-security-color-count-polish.css'), 'M2.9 must override M2.8 presentation safely');

for (const marker of [
  'id="firebaseIdentityMigrationToggle" aria-expanded="false"',
  'id="firebaseIdentityMigrationAdvancedContent"',
  'id="firebaseIdentityMigrationCollapsedSummary"',
  'id="firebaseIdentityMigrationLastRefreshed"',
  'id="firebaseIdentityMigrationAttentionAlert"',
  'data-firebase-migration-filter="all"',
  'data-firebase-migration-filter="pending"',
  'data-firebase-migration-filter="approved"',
  'data-firebase-migration-filter="attention"',
  'id="agentSecuritySearchClear"',
  'id="firebaseCredentialVaultCutover" class="is-dangerous"',
  'id="firebaseIdentityMigrationTableWrap"'
]) assert(index.includes(marker), `missing M2.9 markup: ${marker}`);

for (const marker of [
  "let workforceIdentityMigrationExpanded = false",
  "let workforceIdentityMigrationFilter = 'all'",
  'refreshedAt:0',
  'formatFirebaseIdentityMigrationRefreshTime',
  'setFirebaseIdentityMigrationExpanded(false)',
  'workforceIdentityMigrationRows.filter(firebaseIdentityMigrationFilterMatches)',
  "['all','pending','approved','attention'].includes(next)",
  'data-firebase-migration-copy',
  'navigator.clipboard.writeText',
  'const previousScrollLeft = wrap ? wrap.scrollLeft : 0',
  'if (wrap) wrap.scrollLeft = previousScrollLeft',
  "searchClear.hidden = !String(search && search.value || '').trim()"
]) assert(js.includes(marker), `missing M2.9 behavior: ${marker}`);

const m29JsStart = js.indexOf('function formatFirebaseIdentityMigrationRefreshTime');
const m29JsEnd = js.indexOf('async function runSecureCredentialVaultPrepare', m29JsStart);
assert(m29JsStart >= 0 && m29JsEnd > m29JsStart, 'M2.9 migration helper block missing');
const m29Block = js.slice(m29JsStart, m29JsEnd);
assert(!m29Block.includes('setInterval('), 'M2.9 must not add polling');
assert(!m29Block.includes('MutationObserver'), 'M2.9 must not add document observers');
assert(!m29Block.includes('password'), 'M2.9 technical ID helpers must not render or copy passwords');

for (const marker of [
  '.firebase-identity-migration.is-advanced-collapsed .firebase-migration-advanced-content{display:none!important}',
  '.firebase-migration-attention-alert[hidden]{display:none!important}',
  '#firebaseCredentialVaultCutover.is-dangerous',
  '.firebase-migration-tech code',
  '.firebase-migration-copy',
  'position:sticky!important;left:0!important',
  'position:sticky!important;left:210px!important',
  'min-width:860px!important',
  'scrollbar-gutter:stable!important',
  'body.dark-mode #agentSecurityPanel .firebase-migration-table th',
  '.agent-security-search-clear[hidden]{display:none!important}'
]) assert(css.includes(marker), `missing M2.9 CSS marker: ${marker}`);

assert(!css.includes('display:none!important}.firebase-identity-migration'), 'M2.9 must not hide the entire migration surface');
console.log('PASS M2.9 Security Advanced UX: default-collapsed advanced migration, live summary/warning/refresh state, client-side filters, compact copyable IDs, clearable search, dangerous Vault-Only hierarchy, stable sticky columns, and dark-mode-safe presentation.');
